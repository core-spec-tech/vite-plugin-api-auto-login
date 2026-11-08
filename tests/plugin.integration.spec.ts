import { createServer as createHttpServer } from 'node:http'
import type { Server } from 'node:http'
import type { AddressInfo } from 'node:net'
import { once } from 'node:events'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { createServer as createViteServer } from 'vite'
import type { ViteDevServer } from 'vite'
import { fetch } from 'undici'

import { viteAPIAutoLogin } from '@/index'

const token = `header.${Buffer.from(JSON.stringify({ exp: 4102444800 })).toString('base64url')}.signature`

describe('real Vite middleware integration', () => {
  let vite: ViteDevServer | undefined
  let http: Server | undefined
  let upstream: Server | undefined
  let origin: string
  let logins = 0

  beforeAll(async () => {
    upstream = createHttpServer((_req, res) => {
      logins++
      res.setHeader('Content-Type', 'application/json')
      res.end(JSON.stringify({ token }))
    })
    upstream.listen(0, '127.0.0.1')
    await once(upstream, 'listening')
    const upstreamPort = (upstream.address() as AddressInfo).port
    vite = await createViteServer({
      configFile: false,
      appType: 'custom',
      logLevel: 'silent',
      server: { middlewareMode: true, watch: null },
      optimizeDeps: { noDiscovery: true, include: [] },
      plugins: [
        {
          name: 'existing-cookie',
          configureServer(server) {
            server.middlewares.use((_req, res, next) => {
              res.setHeader('Set-Cookie', 'theme=light; Path=/')
              next()
            })
          },
        },
        viteAPIAutoLogin({
          request: () => ({ url: `http://127.0.0.1:${upstreamPort}`, init: { method: 'POST' } }),
          cookie: { path: '/api', sameSite: 'strict', httpOnly: true },
        }),
        {
          name: 'html-response',
          configureServer(server) {
            server.middlewares.use((_req, res) => {
              res.setHeader('Content-Type', 'text/html')
              res.end('<!doctype html><title>Integration test</title>')
            })
          },
        },
      ],
    })
    http = createHttpServer(vite.middlewares)
    http.listen(0, '127.0.0.1')
    await once(http, 'listening')
    origin = `http://127.0.0.1:${(http.address() as AddressInfo).port}`
  })

  afterAll(async () => {
    await vite?.close()
    for (const server of [http, upstream]) {
      if (server) {
        server.closeAllConnections()
        await new Promise<void>((resolve, reject) =>
          server.close((error) => {
            if (error) reject(error)
            else resolve()
          }),
        )
      }
    }
  })

  it('serves concurrent HTML responses with separate cookies and one login', async () => {
    const responses = await Promise.all([
      fetch(origin, { headers: { accept: 'text/html' } }),
      fetch(origin, { headers: { accept: 'text/html' } }),
    ])
    for (const response of responses) {
      expect(response.status).toBe(200)
      expect(response.headers.getSetCookie()).toEqual([
        'theme=light; Path=/',
        `your_token_name=${token}; Path=/api; HttpOnly; SameSite=Strict`,
      ])
      expect(await response.text()).toContain('Integration test')
    }
    expect(logins).toBe(1)
  })

  it('lets non-document requests continue without an authentication cookie', async () => {
    const response = await fetch(origin, { headers: { accept: 'application/json' } })
    expect(response.headers.getSetCookie()).toEqual(['theme=light; Path=/'])
    expect(await response.text()).toContain('Integration test')
  })
})
