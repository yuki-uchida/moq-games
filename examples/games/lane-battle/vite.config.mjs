import { defineConfig } from 'vite'
import { fileURLToPath } from 'node:url'
const repo = fileURLToPath(new URL('../../../', import.meta.url))
export default defineConfig({
  root: repo,
  base: '/',
  server: { host: '127.0.0.1', port: 5193, strictPort: true },
  build: {
    outDir: 'dist-lane-battle',
    rollupOptions: { input: fileURLToPath(new URL('./index.html', import.meta.url)) }
  }
})
