import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { fetch, FormData } from 'undici'
import { MockApiServer } from '../../examples/vue-msw/mocks/MockApiServer'
import { firstValueFrom } from 'rxjs'
import { createTokenStream } from '@/auth/createTokenStream'
import { createFormDataRequest } from '@/auth/createFormDataRequest'

describe('Vue example mock API', () => {
  const api = new MockApiServer()
  let origin: string

  beforeAll(async () => {
    origin = await api.start(0)
  })
  afterAll(async () => {
    await api.close()
  })

  it('authenticates through the real default strategy with the email field mapping', async () => {
    const config = {
      loginUrl: `${origin}/login`,
      username: 'demo@example.test',
      password: 'demo-password',
      userAgent: 'vite',
      cookieName: 'your_token_name',
      allowInsecureTls: false,
    }
    const session = createTokenStream(config, {
      request: createFormDataRequest(config, { username: 'email' }),
    })
    const token = await firstValueFrom(session)
    const response = await fetch(`${origin}/api/me`, {
      headers: { cookie: `your_token_name=${token}` },
    })
    expect(response.status).toBe(200)
    expect(await response.json()).toEqual({
      name: 'Demo Developer',
      email: 'demo@example.test',
    })
    expect(await firstValueFrom(session)).toBe(token)
  })

  it('rejects incorrect login credentials', async () => {
    const body = new FormData()
    body.set('email', 'demo@example.test')
    body.set('password', 'wrong')
    const response = await fetch(`${origin}/login`, { method: 'POST', body })
    expect(response.status).toBe(401)
  })

  it.each(['', 'your_token_name=invalid'])(
    'rejects missing or invalid cookies: %s',
    async (cookie) => {
      const response = await fetch(`${origin}/api/me`, { headers: { cookie } })
      expect(response.status).toBe(401)
    },
  )
})
