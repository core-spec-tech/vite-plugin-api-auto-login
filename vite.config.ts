import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { defineConfig } from 'vitest/config'

const rootDir = dirname(fileURLToPath(import.meta.url))

export default defineConfig({
  resolve: {
    alias: { '@': resolve(rootDir, 'src') },
  },
  build: {
    lib: {
      entry: resolve(rootDir, 'src/index.ts'),
      fileName: 'vite-plugin-api-auto-login',
      formats: ['es', 'cjs'],
    },
    rollupOptions: {
      external: ['vite', 'undici', 'jose', 'rxjs', 'cookie'],
    },
  },
  test: {
    environment: 'node',
  },
})
