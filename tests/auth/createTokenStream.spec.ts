import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { FormData as UndiciFormData, Response } from 'undici'
import type { fetch } from 'undici'

import { firstValueFrom } from 'rxjs'
import { createTokenStream } from '@/auth/createTokenStream'
import type { PluginEnv } from '@/config/types'

const createPluginEnv = (overrides: Partial<PluginEnv> = {}): PluginEnv => ({
  allowInsecureTls: false,
  cookieName: 'your_token_name',
  username: 'dev@example.test',
  loginUrl: 'https://api.example.test/login',
  password: 'secret',
  userAgent: 'vite',
  ...overrides,
})

afterEach(() => {
  vi.useRealTimers()
})

describe('createTokenStream', () => {
  beforeEach(() => {
    vi.useRealTimers()
  })

  it('logs in with form-data and caches a valid JWT token', async () => {
    const fetchMock = vi
      .fn<typeof fetch>()
      .mockResolvedValue(
        new Response(JSON.stringify({ token: createJwt(Math.floor(Date.now() / 1000) + 3600) })),
      )

    const authSession = createTokenStream(createPluginEnv(), {
      fetch: fetchMock,
    })

    const firstToken = await firstValueFrom(authSession)
    const secondToken = await firstValueFrom(authSession)

    expect(firstToken).toBe(secondToken)
    expect(fetchMock).toHaveBeenCalledTimes(1)

    const [url, init] = fetchMock.mock.calls[0]!
    expect(url).toBe('https://api.example.test/login')
    expect(init?.method).toBe('POST')
    expect(init?.body).toBeInstanceOf(UndiciFormData)

    const formData = init?.body as UndiciFormData
    expect(formData.get('username')).toBe('dev@example.test')
    expect(formData.get('password')).toBe('secret')
    expect([...formData.keys()]).toEqual(['username', 'password'])
    expect(init?.headers).toEqual({ 'User-Agent': 'vite' })
  })

  it('refreshes the token when the cached JWT is expired', async () => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date('2026-04-21T09:00:00.000Z'))

    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve({ token: createJwt(Math.floor(Date.now() / 1000) - 10) }),
      })
      .mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve({ token: createJwt(Math.floor(Date.now() / 1000) + 3600) }),
      })

    const authSession = createTokenStream(createPluginEnv(), {
      fetch: fetchMock,
    })

    await firstValueFrom(authSession)
    await firstValueFrom(authSession)

    expect(fetchMock).toHaveBeenCalledTimes(2)
  })

  it('refreshes again when the cached token has no known expiry', async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve({ token: 'opaque-token-without-jwt-expiry' }),
      })
      .mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve({ token: createJwt(Math.floor(Date.now() / 1000) + 3600) }),
      })

    const authSession = createTokenStream(createPluginEnv(), {
      fetch: fetchMock,
    })

    await firstValueFrom(authSession)
    await firstValueFrom(authSession)

    expect(fetchMock).toHaveBeenCalledTimes(2)
  })

  it.each([
    ['missing signature segment', `header.${base64UrlEncode(JSON.stringify({ exp: 4102444800 }))}`],
    ['invalid JSON', 'header.bm90LWpzb24.signature'],
    ['missing expiry', `header.${base64UrlEncode('{}')}.signature`],
    [
      'non-numeric expiry',
      `header.${base64UrlEncode(JSON.stringify({ exp: '4102444800' }))}.signature`,
    ],
  ])('does not cache tokens with %s', async (_description, token) => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: () => Promise.resolve({ token }),
    })
    const authSession = createTokenStream(createPluginEnv(), { fetch: fetchMock })

    expect(await firstValueFrom(authSession)).toBe(token)
    expect(await firstValueFrom(authSession)).toBe(token)
    expect(fetchMock).toHaveBeenCalledTimes(2)
  })

  it('deduplicates concurrent login requests', async () => {
    const fetchMock = vi.fn().mockImplementation(
      async () =>
        await new Promise((resolve) => {
          setTimeout(() => {
            resolve({
              json: () =>
                Promise.resolve({ token: createJwt(Math.floor(Date.now() / 1000) + 3600) }),
              ok: true,
            })
          }, 0)
        }),
    )

    const authSession = createTokenStream(createPluginEnv(), {
      fetch: fetchMock,
    })

    const [firstToken, secondToken] = await Promise.all([
      firstValueFrom(authSession),
      firstValueFrom(authSession),
    ])

    expect(fetchMock).toHaveBeenCalledTimes(1)
    expect(firstToken).toBe(secondToken)
  })

  it('refreshes after a previously valid cached token expires', async () => {
    vi.useFakeTimers()
    vi.setSystemTime(100000)
    const fetchMock = vi.fn().mockImplementation(() =>
      Promise.resolve({
        ok: true,
        json: () => Promise.resolve({ token: createJwt(Date.now() / 1000 + 10) }),
      }),
    )
    const token$ = createTokenStream(createPluginEnv(), { fetch: fetchMock })
    const first = await firstValueFrom(token$)
    vi.setSystemTime(111000)
    expect(await firstValueFrom(token$)).not.toBe(first)
    expect(fetchMock).toHaveBeenCalledTimes(2)
  })

  it('supports subscribing again during a token emission', async () => {
    const token = createJwt(4102444800)
    const fetchMock = vi
      .fn()
      .mockResolvedValue({ ok: true, json: () => Promise.resolve({ token }) })
    const token$ = createTokenStream(createPluginEnv(), { fetch: fetchMock })
    let nested: Promise<string> | undefined
    await new Promise<void>((resolve, reject) =>
      token$.subscribe({
        next: () => {
          nested = firstValueFrom(token$)
        },
        complete: resolve,
        error: reject,
      }),
    )
    expect(await nested).toBe(token)
    expect(fetchMock).toHaveBeenCalledTimes(1)
  })

  it.each([null, {}, { token: '' }, { token: 123 }])(
    'rejects invalid token payloads: %j',
    async (payload) => {
      const fetchMock = vi
        .fn()
        .mockResolvedValue({ ok: true, json: () => Promise.resolve(payload) })
      const token$ = createTokenStream(createPluginEnv(), { fetch: fetchMock })
      await expect(firstValueFrom(token$)).rejects.toThrow('Login response did not include a token')
    },
  )

  it('preserves the request callback abort signal', async () => {
    const controller = new AbortController()
    controller.abort()
    const fetchMock = vi.fn<typeof fetch>().mockImplementation((_url, init) => {
      expect(init?.signal?.aborted).toBe(true)
      return Promise.reject(new Error('aborted'))
    })
    const token$ = createTokenStream(createPluginEnv(), {
      fetch: fetchMock,
      request: () => ({ url: 'https://custom.test', init: { signal: controller.signal } }),
    })
    await expect(firstValueFrom(token$)).rejects.toThrow('aborted')
  })

  it('uses an insecure TLS dispatcher only when configured', async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: () => Promise.resolve({ token: createJwt(Math.floor(Date.now() / 1000) + 3600) }),
    })
    const destroy = vi.fn().mockResolvedValue(undefined)
    const createDispatcher = vi.fn(() => ({ kind: 'dispatcher', destroy }) as never)

    const authSession = createTokenStream(createPluginEnv({ allowInsecureTls: true }), {
      createDispatcher,
      fetch: fetchMock,
    })

    await firstValueFrom(authSession)

    expect(createDispatcher).toHaveBeenCalledTimes(1)
    expect(destroy).toHaveBeenCalledTimes(1)
    expect(fetchMock).toHaveBeenCalledWith(
      'https://api.example.test/login',
      expect.objectContaining({
        dispatcher: { kind: 'dispatcher', destroy },
      }),
    )
  })
})

const createJwt = (exp: number) => {
  const header = base64UrlEncode(JSON.stringify({ alg: 'none', typ: 'JWT' }))
  const payload = base64UrlEncode(JSON.stringify({ exp }))
  return `${header}.${payload}.signature`
}

const base64UrlEncode = (value: string) =>
  Buffer.from(value).toString('base64').replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/u, '')
