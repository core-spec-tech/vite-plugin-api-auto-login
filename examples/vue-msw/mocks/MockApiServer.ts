import { once } from 'node:events'
import { createServer } from '@msw/serve'
import { http, HttpResponse } from 'msw'
import { jwtVerify, SignJWT } from 'jose'

export class MockApiServer {
  private readonly key = new TextEncoder().encode('local-example-signing-key-only')
  private readonly server = createServer(
    http.post('/login', async ({ request }) => {
      const form = await request.formData()
      if (form.get('email') !== 'demo@example.test' || form.get('password') !== 'demo-password') {
        return HttpResponse.json({ error: 'Invalid demo credentials' }, { status: 401 })
      }

      const token = await new SignJWT({ name: 'Demo Developer', email: 'demo@example.test' })
        .setProtectedHeader({ alg: 'HS256' })
        .setSubject('demo-user')
        .setIssuedAt()
        .setExpirationTime('5m')
        .sign(this.key)
      return HttpResponse.json({ token })
    }),
    http.get('/api/me', async ({ cookies }) => {
      const token = cookies.your_token_name
      if (!token) {
        return HttpResponse.json({ error: 'No authentication cookie' }, { status: 401 })
      }

      try {
        const { payload } = await jwtVerify(token, this.key, { algorithms: ['HS256'] })
        return HttpResponse.json({ name: payload.name, email: payload.email })
      } catch {
        return HttpResponse.json({ error: 'Invalid or expired token' }, { status: 401 })
      }
    }),
  )

  async start(port = 4174): Promise<string> {
    this.server.listen(port, '127.0.0.1')
    await once(this.server, 'listening')
    const address = this.server.address()
    if (!address || typeof address === 'string') {
      throw new Error('Mock API did not bind a TCP port')
    }
    return `http://127.0.0.1:${address.port}`
  }

  async close(): Promise<void> {
    if (!this.server.listening) return
    const closed = once(this.server, 'close')
    this.server.close()
    this.server.closeAllConnections()
    await closed
  }
}
