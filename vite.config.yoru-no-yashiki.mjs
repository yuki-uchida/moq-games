import { defineConfig } from 'vite'
import { fileURLToPath } from 'node:url'
import { resolve } from 'node:path'

const root = fileURLToPath(new URL('.', import.meta.url))
export default defineConfig({
  root: resolve(root, 'examples/games/yoru-no-yashiki'),
  base: './',
  server: { host: '127.0.0.1', port: 5195, strictPort: true, fs: { allow: [root] } },
  build: { outDir: resolve(root, 'dist/yoru-no-yashiki'), emptyOutDir: true }
})
