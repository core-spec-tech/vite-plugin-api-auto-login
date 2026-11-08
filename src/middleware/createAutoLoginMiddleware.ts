import { stringifySetCookie } from 'cookie'
import { filter, map, of, Subscription, switchMap, take, tap } from 'rxjs'
import type { Observable } from 'rxjs'
import type { Connect, Logger } from 'vite'

import type { AuthCookieOptions, PluginEnv } from '@/config/types'
import { PLUGIN_NAME } from '@/constants'
import { isHtmlDocumentRequest } from '@/http/isHtmlDocumentRequest'

export function createAutoLoginMiddleware(
  config: Readonly<PluginEnv>,
  cookie: Required<AuthCookieOptions>,
  token$: Observable<string>,
  logger: Pick<Logger, 'error'>,
  signal: AbortSignal,
): Connect.NextHandleFunction {
  return (req, res, next) => {
    if (signal.aborted || res.destroyed || res.writableEnded) return
    const subscription = new Subscription()
    const cancel = () => subscription.unsubscribe()
    const proceed = () => {
      if (!signal.aborted && !res.destroyed && !res.writableEnded && !subscription.closed) next()
    }
    res.once('close', cancel)
    signal.addEventListener('abort', cancel, { once: true })
    subscription.add(() => {
      res.off('close', cancel)
      signal.removeEventListener('abort', cancel)
    })
    subscription.add(
      of(req)
        .pipe(
          filter(isHtmlDocumentRequest),
          switchMap(() => token$),
          take(1),
          map((token) => stringifySetCookie({ ...cookie, name: config.cookieName, value: token })),
          tap((value) => {
            if (!res.headersSent && !res.destroyed && !res.writableEnded) {
              res.appendHeader('Set-Cookie', value)
            }
          }),
        )
        .subscribe({
          error: (error: unknown) => {
            const message = error instanceof Error ? error.message : String(error)
            const endpoint = config.loginUrl ? ` (${config.loginUrl})` : ''
            logger.error(`[${PLUGIN_NAME}] ${message}${endpoint}`)
            proceed()
            subscription.unsubscribe()
          },
          complete: () => {
            proceed()
            subscription.unsubscribe()
          },
        }),
    )
  }
}
