import { stringifySetCookie } from 'cookie'
import type { Plugin } from 'vite'
import { loadEnv } from 'vite'

import { createFormDataRequest } from '@/auth/createFormDataRequest'
import { createTokenStream } from '@/auth/createTokenStream'
import { PLUGIN_NAME } from '@/constants'
import { loadPluginConfig } from '@/config/loadPluginConfig'
import type { AuthCookieOptions, AutoLoginOptions } from '@/config/types'
import { createAutoLoginMiddleware } from '@/middleware/createAutoLoginMiddleware'

export function viteAPIAutoLogin(options: AutoLoginOptions = {}): Plugin {
  if ('createAuthRequest' in options) {
    throw new Error('createAuthRequest was removed; use request(config) instead')
  }
  if (options.request !== undefined && typeof options.request !== 'function') {
    throw new Error('request must be a function: request(config)')
  }
  if (options.formFields !== undefined && options.request !== undefined) {
    throw new Error('Use formFields only with the default request')
  }
  const cookie: Required<AuthCookieOptions> = {
    path: options.cookie?.path ?? '/',
    sameSite: options.cookie?.sameSite ?? 'lax',
    secure: options.cookie?.secure ?? false,
    httpOnly: options.cookie?.httpOnly ?? false,
  }
  if (cookie.sameSite === 'none' && !cookie.secure) {
    throw new Error('cookie.sameSite "none" requires cookie.secure to be true')
  }
  // Validate attributes before registering middleware, including untyped JS input.
  stringifySetCookie({ ...cookie, name: 'validation', value: '' })
  const cleanups = new Set<() => void>()

  return {
    name: PLUGIN_NAME,
    apply: 'serve',
    configureServer(server) {
      const { mode, envDir, logger } = server.config
      try {
        const config = loadPluginConfig(loadEnv(mode, envDir, 'API_AUTO_LOGIN_'))
        stringifySetCookie({ ...cookie, name: config.cookieName, value: '' })
        const request = options.request ?? createFormDataRequest(config, options.formFields)
        const controller = new AbortController()
        const cleanup = () => {
          controller.abort()
          server.httpServer?.off('close', cleanup)
          cleanups.delete(cleanup)
        }
        cleanups.add(cleanup)
        server.httpServer?.once('close', cleanup)
        const token$ = createTokenStream(config, { request, signal: controller.signal })
        server.middlewares.use(
          createAutoLoginMiddleware(config, cookie, token$, logger, controller.signal),
        )
      } catch (error) {
        logger.error(`[${PLUGIN_NAME}] ${error instanceof Error ? error.message : String(error)}`)
      }
    },
    closeBundle() {
      for (const cleanup of cleanups) cleanup()
    },
  }
}
