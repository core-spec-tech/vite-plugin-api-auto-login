import { fileURLToPath } from 'node:url'
import { createServer } from 'vite'
import { MockApiServer } from './mocks/MockApiServer.ts'

const api = new MockApiServer()
await api.start()

try {
  const vite = await createServer({
    configFile: fileURLToPath(new URL('./vite.config.ts', import.meta.url)),
  })

  let closing = false
  async function shutdown(): Promise<void> {
    if (closing) return
    closing = true
    try {
      await vite.close()
    } finally {
      await api.close()
    }
  }

  for (const signal of ['SIGINT', 'SIGTERM'] as const) {
    process.once(signal, () => {
      void shutdown().catch((error: unknown) => {
        console.error(error)
        process.exitCode = 1
      })
    })
  }

  await vite.listen()
  vite.printUrls()
} catch (error) {
  await api.close()
  throw error
}
