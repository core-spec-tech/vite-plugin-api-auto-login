import type { AuthRequest } from '@/auth/AuthRequest'

export type PluginEnv = {
  allowInsecureTls: boolean
  cookieName: string
  username?: string
  loginUrl?: string
  password?: string
  userAgent: string
}

export type PluginEnvInput = Readonly<Record<string, string | undefined>>

export type FormFieldNames = {
  username?: string
  password?: string
}

export type AuthCookieOptions = {
  path?: string
  sameSite?: 'lax' | 'strict' | 'none'
  secure?: boolean
  httpOnly?: boolean
}

export type AutoLoginOptions = { cookie?: AuthCookieOptions } & (
  { formFields?: FormFieldNames; request?: never } | { formFields?: never; request: AuthRequest }
)
