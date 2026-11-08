import type { PluginEnv, PluginEnvInput } from '@/config/types'

export const DEFAULT_COOKIE_NAME = 'your_token_name'
export const DEFAULT_USER_AGENT = 'vite'

export function loadPluginConfig(env: PluginEnvInput): Readonly<PluginEnv> {
  return Object.freeze({
    allowInsecureTls: env.API_AUTO_LOGIN_ALLOW_INSECURE_TLS === 'true',
    cookieName: env.API_AUTO_LOGIN_COOKIE_NAME ?? DEFAULT_COOKIE_NAME,
    username: env.API_AUTO_LOGIN_USERNAME,
    loginUrl: env.API_AUTO_LOGIN_LOGIN_URL,
    password: env.API_AUTO_LOGIN_PASSWORD,
    userAgent: env.API_AUTO_LOGIN_USER_AGENT ?? DEFAULT_USER_AGENT,
  })
}
