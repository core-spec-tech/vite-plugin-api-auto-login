import { describe, expect, it } from 'vitest'

import { loadPluginConfig } from '@/config/loadPluginConfig'

describe('loadPluginConfig', () => {
  it('parses configured values and ignores unrelated variables', () => {
    const env = loadPluginConfig({
      API_AUTO_LOGIN_LOGIN_URL: 'https://api.example.test/login',
      API_AUTO_LOGIN_USERNAME: 'dev@example.test',
      API_AUTO_LOGIN_PASSWORD: 'secret',
      API_AUTO_LOGIN_COOKIE_NAME: 'session_cookie',
      API_AUTO_LOGIN_USER_AGENT: 'local-dev-client',
      API_AUTO_LOGIN_ALLOW_INSECURE_TLS: 'true',
      VITE_PUBLIC_SHOULD_BE_IGNORED: 'nope',
    })

    expect(env).toEqual({
      allowInsecureTls: true,
      cookieName: 'session_cookie',
      username: 'dev@example.test',
      loginUrl: 'https://api.example.test/login',
      password: 'secret',
      userAgent: 'local-dev-client',
    })
  })

  it('applies defaults without requiring strategy-specific credentials', () => {
    expect(loadPluginConfig({})).toEqual({
      allowInsecureTls: false,
      cookieName: 'your_token_name',
      userAgent: 'vite',
      username: undefined,
      loginUrl: undefined,
      password: undefined,
    })
  })
})
