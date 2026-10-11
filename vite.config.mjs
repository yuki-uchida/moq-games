import { defineConfig } from 'vite'
import { resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
const root = fileURLToPath(new URL('.', import.meta.url))
export default defineConfig({
  base: '/moq-games/',
  optimizeDeps: { exclude: ['@moq-games/moqt-client'] },
  server: {
    host: '127.0.0.1',
    port: 5174,
    strictPort: true,
    fs: { strict: true, allow: [root] },
    watch: {
      ignored: [
        '**/.venv/**',
        '**/local-assets/**',
        '**/art-prototypes/**',
        '**/migration/**',
        '**/tools/tower-debug/.build/**'
      ]
    }
  },
  preview: { host: '127.0.0.1', port: 4174, strictPort: true },
  build: { rollupOptions: { input: { game: resolve(root, 'examples/games/tower_diffence_with_jev/index.html') } } }
})
