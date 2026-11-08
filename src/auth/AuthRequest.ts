import type { RequestInit } from 'undici'
import type { PluginEnv } from '@/config/types'

export type AuthRequestOptions = {
  url: string | URL
  init: Omit<RequestInit, 'dispatcher'>
}

export type AuthRequest = (
  config: Readonly<PluginEnv>,
) => AuthRequestOptions | Promise<AuthRequestOptions>
