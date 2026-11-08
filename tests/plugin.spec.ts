import { EventEmitter } from 'node:events'
import type { Connect } from 'vite'
import { fetch, Response } from 'undici'
import type * as Undici from 'undici'
import type { AuthRequest } from '@/auth/AuthRequest'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { viteAPIAutoLogin } from '@/index'
import type { AutoLoginOptions } from '@/config/types'
import { createRequest, createResponse } from './helpers/http'

vi.mock('undici', async (original) => ({
  ...(await original<typeof Undici>()),
  fetch: vi.fn(),
}))

const fetchMock = vi.mocked(fetch)
const token = `header.${Buffer.from(JSON.stringify({ exp: 4102444800 })).toString('base64url')}.signature`

async function setup(options: AutoLoginOptions = {}, middlewareMode = false) {
  let middleware: Connect.NextHandleFunction | undefined
  const server = {
    config: { envDir: '/consumer/env', mode: 'development', logger: { error: vi.fn() } },
    middlewares: {
      use: vi.fn((handler: Connect.NextHandleFunction) => {
        middleware = handler
      }),
    },
    httpServer: middlewareMode ? null : new EventEmitter(),
  }
  const plugin = viteAPIAutoLogin(options)
  const hook = plugin.configureServer
  if (typeof hook === 'function') await hook.call({} as never, server as never)
  if (!middleware) throw new Error('Middleware was not registered')
  return { server, middleware, plugin }
}

function run(
  middleware: Connect.NextHandleFunction,
  response = createResponse(),
  request = createRequest(),
) {
  const next = vi.fn()
  const done = new Promise<void>((resolve) => {
    middleware(request, response, () => {
      next()
      resolve()
    })
  })
  return { response, next, done }
}

beforeEach(() => {
  vi.resetAllMocks()
  vi.stubEnv('API_AUTO_LOGIN_LOGIN_URL', 'https://api.example.test/login')
  vi.stubEnv('API_AUTO_LOGIN_USERNAME', 'dev@example.test')
  vi.stubEnv('API_AUTO_LOGIN_PASSWORD', 'secret')
  fetchMock.mockImplementation(() => Promise.resolve(new Response(JSON.stringify({ token }))))
})
afterEach(() => {
  vi.unstubAllEnvs()
})

describe('viteAPIAutoLogin', () => {
  it('exposes a serve-only plugin', () => {
    expect(viteAPIAutoLogin()).toMatchObject({ name: 'vite-plugin-api-auto-login', apply: 'serve' })
  })

  it('supports a lazy function request and shares authentication across responses', async () => {
    const request = vi.fn<AuthRequest>((config) => ({
      url: 'https://custom.test/login',
      init: { method: 'POST', body: JSON.stringify({ email: config.username }) },
    }))
    const { middleware } = await setup({ request })
    expect(request).not.toHaveBeenCalled()
    const first = run(middleware)
    const second = run(middleware)
    await Promise.all([first.done, second.done])
    await run(middleware).done
    expect(request).toHaveBeenCalledTimes(1)
    expect(fetchMock).toHaveBeenCalledTimes(1)
    expect(first.response.getHeader('Set-Cookie')).toBe(
      `your_token_name=${token}; Path=/; SameSite=Lax`,
    )
    expect(second.response.getHeader('Set-Cookie')).toEqual(first.response.getHeader('Set-Cookie'))
    expect(first.next).toHaveBeenCalledExactlyOnceWith()
  })

  it('supports async request functions without default credentials', async () => {
    vi.stubEnv('API_AUTO_LOGIN_LOGIN_URL', '')
    vi.stubEnv('API_AUTO_LOGIN_USERNAME', '')
    vi.stubEnv('API_AUTO_LOGIN_PASSWORD', '')
    const { middleware } = await setup({
      request: () => Promise.resolve({ url: 'https://custom.test', init: {} }),
    })
    await run(middleware).done
    expect(fetchMock).toHaveBeenCalledWith('https://custom.test', expect.anything())
  })

  it('serializes configurable cookies and preserves existing cookies', async () => {
    const { middleware } = await setup({
      cookie: { path: '/api', sameSite: 'none', secure: true, httpOnly: true },
    })
    const response = createResponse()
    response.setHeader('Set-Cookie', 'theme=light')
    await run(middleware, response).done
    expect(response.getHeader('Set-Cookie')).toEqual([
      'theme=light',
      `your_token_name=${token}; Path=/api; HttpOnly; Secure; SameSite=None`,
    ])
  })

  it('encodes opaque token values safely', async () => {
    fetchMock.mockResolvedValue(new Response(JSON.stringify({ token: 'value; other=cookie' })))
    const { middleware } = await setup()
    const result = run(middleware)
    await result.done
    expect(result.response.getHeader('Set-Cookie')).toBe(
      'your_token_name=value%3B%20other%3Dcookie; Path=/; SameSite=Lax',
    )
  })

  it('rejects insecure SameSite=None', () => {
    expect(() => viteAPIAutoLogin({ cookie: { sameSite: 'none' } })).toThrow('secure')
  })

  it('rejects formFields combined with a custom request', () => {
    expect(() =>
      // @ts-expect-error Field mapping only applies to the default request.
      viteAPIAutoLogin({ request: () => ({ url: '', init: {} }), formFields: {} }),
    ).toThrow('formFields')
  })

  it('skips non-HTML requests and continues exactly once', async () => {
    const { middleware } = await setup()
    const result = run(
      middleware,
      createResponse(),
      createRequest({ headers: { accept: 'application/json' } }),
    )
    await result.done
    expect(fetchMock).not.toHaveBeenCalled()
    expect(result.next).toHaveBeenCalledExactlyOnceWith()
    expect(result.response.listenerCount('close')).toBe(0)
  })

  it('logs a failed login, continues, and retries on the next request', async () => {
    fetchMock.mockResolvedValueOnce(new Response('', { status: 401 }))
    const { server, middleware } = await setup()
    const first = run(middleware)
    await first.done
    expect(server.config.logger.error).toHaveBeenCalledWith(expect.stringContaining('401'))
    expect(first.next).toHaveBeenCalledExactlyOnceWith()
    expect(first.response.getHeader('Set-Cookie')).toBeUndefined()
    await run(middleware).done
    expect(fetchMock).toHaveBeenCalledTimes(2)
  })

  it('isolates token caches between Vite servers', async () => {
    const first = await setup()
    const second = await setup()
    await run(first.middleware).done
    await run(second.middleware).done
    expect(fetchMock).toHaveBeenCalledTimes(2)
  })

  it('unsubscribes a disconnected response without affecting another subscriber', async () => {
    const pending = createDeferred<Response>()
    fetchMock.mockReturnValue(pending.promise)
    const { middleware } = await setup()
    const first = run(middleware)
    const second = run(middleware)
    first.response.emit('close')
    pending.resolve(new Response(JSON.stringify({ token })))
    await second.done
    expect(first.next).not.toHaveBeenCalled()
    expect(first.response.getHeader('Set-Cookie')).toBeUndefined()
    expect(first.response.listenerCount('close')).toBe(0)
    expect(second.response.listenerCount('close')).toBe(0)
    expect(fetchMock).toHaveBeenCalledTimes(1)
  })

  it('aborts a login after its last waiting response disconnects and allows a fresh login', async () => {
    const started = createDeferred<AbortSignal>()
    fetchMock.mockImplementationOnce((_url, init) => {
      started.resolve(init!.signal!)
      return new Promise(() => {})
    })
    const { middleware } = await setup()
    const abandoned = run(middleware)
    const signal = await started.promise
    abandoned.response.emit('close')
    expect(signal.aborted).toBe(true)
    expect(abandoned.next).not.toHaveBeenCalled()
    await run(middleware).done
    expect(fetchMock).toHaveBeenCalledTimes(2)
  })

  it('waits until all subscribers leave before aborting a shared login', async () => {
    const started = createDeferred<AbortSignal>()
    fetchMock.mockImplementationOnce((_url, init) => {
      started.resolve(init!.signal!)
      return new Promise(() => {})
    })
    const { middleware } = await setup()
    const first = run(middleware)
    const second = run(middleware)
    const signal = await started.promise
    first.response.emit('close')
    expect(signal.aborted).toBe(false)
    second.response.emit('close')
    expect(signal.aborted).toBe(true)
    expect(fetchMock).toHaveBeenCalledTimes(1)
  })

  it('cleans up through the plugin lifecycle in middleware mode', async () => {
    const pending = createDeferred<Response>()
    fetchMock.mockReturnValue(pending.promise)
    const { middleware, plugin } = await setup({}, true)
    const result = run(middleware)
    const hook = plugin.closeBundle
    if (typeof hook === 'function') await hook.call({} as never)
    pending.resolve(new Response(JSON.stringify({ token })))
    await Promise.resolve()
    expect(result.next).not.toHaveBeenCalled()
    expect(result.response.listenerCount('close')).toBe(0)
    expect(result.response.getHeader('Set-Cookie')).toBeUndefined()
  })

  it('rejects the removed request object API with a migration error', () => {
    expect(() =>
      viteAPIAutoLogin({
        // @ts-expect-error Objects are no longer accepted as request callbacks.
        request: { create: () => ({ url: '', init: {} }) },
      }),
    ).toThrow('request must be a function')
  })

  it('aborts the pending login when the Vite server closes', async () => {
    const started = createDeferred<AbortSignal>()
    fetchMock.mockImplementation((_url, init) => {
      started.resolve(init!.signal!)
      return new Promise(() => {})
    })
    const { middleware, server } = await setup()
    const result = run(middleware)
    const signal = await started.promise
    server.httpServer?.emit('close')
    expect(signal.aborted).toBe(true)
    expect(result.next).not.toHaveBeenCalled()
    expect(result.response.listenerCount('close')).toBe(0)
  })
})

function createDeferred<T>() {
  let resolve!: (value: T) => void
  const promise = new Promise<T>((resolvePromise) => {
    resolve = resolvePromise
  })
  return { promise, resolve }
}
