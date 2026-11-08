import { describe, expect, it, vi } from 'vitest'
import { FormData } from 'undici'
import { firstValueFrom } from 'rxjs'

import { createFormDataRequest } from '@/auth/createFormDataRequest'
import { loadPluginConfig } from '@/config/loadPluginConfig'
import { createTokenStream } from '@/auth/createTokenStream'
import type { PluginEnv } from '@/config/types'
import type { AuthRequest } from '@/auth/AuthRequest'

const config: PluginEnv = {
  allowInsecureTls: false,
  cookieName: 'your_token_name',
  username: 'dev@example.test',
  loginUrl: 'https://example.test/login',
  password: 'secret',
  userAgent: 'vite',
}
const token = `header.${Buffer.from(JSON.stringify({ exp: 4102444800 })).toString('base64url')}.signature`

describe('custom token request', () => {
  it('uses a function and shares its result across concurrent callers', async () => {
    const request = vi.fn<AuthRequest>((config) =>
      Promise.resolve({
        url: 'https://example.test/custom-login',
        init: {
          method: 'PUT',
          headers: { 'content-type': 'application/json', 'x-client': config.userAgent },
          body: JSON.stringify({ username: config.username, password: config.password }),
        },
      }),
    )
    const fetch = vi.fn().mockResolvedValue({ ok: true, json: () => Promise.resolve({ token }) })
    const token$ = createTokenStream(config, { request, fetch })
    expect(await Promise.all([firstValueFrom(token$), firstValueFrom(token$)])).toEqual([
      token,
      token,
    ])
    expect(await firstValueFrom(token$)).toBe(token)
    expect(request).toHaveBeenCalledTimes(1)
    expect(fetch).toHaveBeenCalledExactlyOnceWith(
      'https://example.test/custom-login',
      expect.objectContaining({
        method: 'PUT',
        headers: { 'content-type': 'application/json', 'x-client': 'vite' },
        body: JSON.stringify({ username: config.username, password: config.password }),
      }),
    )
  })

  it.each(['throw', 'reject'])('recovers after request creation fails with %s', async (mode) => {
    const request = vi
      .fn<AuthRequest>()
      .mockImplementationOnce(() => {
        if (mode === 'throw') throw new Error('Cannot create request')
        return Promise.reject(new Error('Cannot create request'))
      })
      .mockReturnValue({ url: 'https://custom.test', init: {} })
    const fetch = vi.fn().mockResolvedValue({ ok: true, json: () => Promise.resolve({ token }) })
    const token$ = createTokenStream(config, { request, fetch })
    await expect(firstValueFrom(token$)).rejects.toThrow('Cannot create request')
    expect(fetch).not.toHaveBeenCalled()
    expect(await firstValueFrom(token$)).toBe(token)
    expect(request).toHaveBeenCalledTimes(2)
  })

  it('allows custom authentication without default login fields', async () => {
    const request: AuthRequest = () => ({
      url: 'https://custom.test/session',
      init: { method: 'POST' },
    })
    const fetch = vi.fn().mockResolvedValue({ ok: true, json: () => Promise.resolve({ token }) })
    const token$ = createTokenStream(loadPluginConfig({}), { request, fetch })
    expect(await firstValueFrom(token$)).toBe(token)
    expect(fetch).toHaveBeenCalledExactlyOnceWith(
      'https://custom.test/session',
      expect.objectContaining({ method: 'POST' }),
    )
  })
})

describe('default form-data request', () => {
  it.each(['loginUrl', 'username', 'password'] as const)('requires %s', (field) => {
    const incomplete = { ...config, [field]: undefined }
    expect(() => createFormDataRequest(incomplete)).toThrow('Missing required env vars')
    expect(() => createFormDataRequest(config)(incomplete)).toThrow('Missing required env vars')
  })

  it.each([
    [{ username: 'email' }, ['email', 'password']],
    [{ password: 'passcode' }, ['username', 'passcode']],
    [{ username: 'login', password: 'secret' }, ['login', 'secret']],
  ] as const)('maps credentials with %j', async (fields, names) => {
    const request = await createFormDataRequest(config, fields)(config)
    expect(request.init.body).toBeInstanceOf(FormData)
    const body = request.init.body as FormData
    expect([...body.entries()]).toEqual([
      [names[0], config.username],
      [names[1], config.password],
    ])
    expect(request.init.headers).toEqual({ 'User-Agent': 'vite' })
  })

  it('creates a fresh request body each time', async () => {
    const request = createFormDataRequest(config)
    expect((await request(config)).init.body).not.toBe((await request(config)).init.body)
  })

  it.each([
    { username: '' },
    { password: '   ' },
    { username: 'password' },
    { username: 'same', password: 'same' },
  ])('rejects invalid field names: %j', (fields) => {
    expect(() => createFormDataRequest(config, fields)).toThrow(
      'Form field names must be non-empty and distinct',
    )
  })
})
