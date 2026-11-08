import { FormData } from 'undici'
import type { FormFieldNames, PluginEnv } from '@/config/types'
import type { AuthRequest } from '@/auth/AuthRequest'

export function createFormDataRequest(
  config: Readonly<PluginEnv>,
  fields: Readonly<FormFieldNames> = {},
): AuthRequest {
  const usernameField = fields.username ?? 'username'
  const passwordField = fields.password ?? 'password'
  if (!usernameField.trim() || !passwordField.trim() || usernameField === passwordField) {
    throw new Error('Form field names must be non-empty and distinct')
  }
  validateCredentials(config)

  return (env) => {
    const { loginUrl, username, password } = validateCredentials(env)
    const body = new FormData()
    body.set(usernameField, username)
    body.set(passwordField, password)
    return {
      url: loginUrl,
      init: { method: 'POST', headers: { 'User-Agent': env.userAgent }, body },
    }
  }
}

function validateCredentials(config: Readonly<PluginEnv>) {
  const { loginUrl, username, password } = config
  if (!loginUrl || !username || !password) {
    throw new Error(
      'Missing required env vars: API_AUTO_LOGIN_LOGIN_URL, API_AUTO_LOGIN_USERNAME, API_AUTO_LOGIN_PASSWORD',
    )
  }
  return { loginUrl, username, password }
}
