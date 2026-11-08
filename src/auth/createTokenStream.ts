import { decodeJwt } from 'jose'
import {
  defer,
  EMPTY,
  finalize,
  from,
  fromEvent,
  map,
  of,
  ReplaySubject,
  share,
  switchMap,
  takeUntil,
  tap,
} from 'rxjs'
import type { Observable } from 'rxjs'
import { Agent, fetch as undiciFetch } from 'undici'
import type { Dispatcher } from 'undici'

import type { PluginEnv } from '@/config/types'
import type { AuthRequest } from '@/auth/AuthRequest'
import { createFormDataRequest } from '@/auth/createFormDataRequest'

type TokenState = { value: string; expiresAt?: number }
type TokenStreamDependencies = {
  request?: AuthRequest
  fetch?: typeof undiciFetch
  createDispatcher?: () => Dispatcher
  signal?: AbortSignal
}

export function createTokenStream(
  config: Readonly<PluginEnv>,
  dependencies: TokenStreamDependencies = {},
): Observable<string> {
  const request = dependencies.request ?? createFormDataRequest(config)
  const fetch = dependencies.fetch ?? undiciFetch
  let cachedToken: TokenState | undefined

  return defer(() => {
    if (dependencies.signal?.aborted) return EMPTY
    if (cachedToken?.expiresAt !== undefined && cachedToken.expiresAt > Date.now()) {
      return of(cachedToken.value)
    }

    const controller = new AbortController()
    let dispatcher: Dispatcher | undefined
    if (config.allowInsecureTls) {
      dispatcher =
        dependencies.createDispatcher?.() ?? new Agent({ connect: { rejectUnauthorized: false } })
    }

    return defer(() => from(Promise.resolve(request(config)))).pipe(
      switchMap(({ url, init }) => {
        const signals = [controller.signal]
        if (init.signal) signals.push(init.signal)
        if (dependencies.signal) signals.push(dependencies.signal)
        return from(fetch(url, { ...init, dispatcher, signal: AbortSignal.any(signals) }))
      }),
      switchMap((response) => {
        if (!response.ok) {
          throw new Error(`Login request failed with status ${response.status}`)
        }
        return from(response.json())
      }),
      map(parseToken),
      tap((token) => {
        cachedToken = token
      }),
      map((token) => token.value),
      takeUntil(dependencies.signal ? fromEvent(dependencies.signal, 'abort') : EMPTY),
      finalize(() => {
        controller.abort()
        // This dispatcher belongs only to this login; release sockets on every exit path.
        if (dispatcher) void dispatcher.destroy().catch(() => {})
      }),
    )
  }).pipe(
    share({
      connector: () => new ReplaySubject<string>(1),
      resetOnError: true,
      resetOnComplete: true,
      // No waiting HTTP responses means this login no longer has a consumer.
      resetOnRefCountZero: true,
    }),
  )
}

function parseToken(payload: unknown): TokenState {
  if (
    !payload ||
    typeof payload !== 'object' ||
    !('token' in payload) ||
    typeof payload.token !== 'string' ||
    payload.token.length === 0
  ) {
    throw new Error('Login response did not include a token')
  }
  const value = payload.token
  try {
    // Decode only for cache expiry; the API remains responsible for token validation.
    const { exp } = decodeJwt(value)
    return { value, expiresAt: typeof exp === 'number' ? exp * 1000 : undefined }
  } catch {
    return { value }
  }
}
