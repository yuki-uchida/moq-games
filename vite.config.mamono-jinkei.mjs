import { defineConfig } from 'vite'
import { fileURLToPath } from 'node:url'
import { resolve } from 'node:path'

const root = fileURLToPath(new URL('.', import.meta.url))

export default defineConfig({
  root: resolve(root, 'examples/games/mamono-jinkei'),
  base: './',
  optimizeDeps: { exclude: ['moq-wasm'] },
  server: { host: '127.0.0.1', port: 5197, strictPort: true, fs: { allow: [root] } },
  build: { outDir: resolve(root, 'dist/mamono-jinkei'), emptyOutDir: true }
})
