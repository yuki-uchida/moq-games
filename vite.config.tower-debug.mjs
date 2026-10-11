import { defineConfig } from 'vite'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { realpathSync } from 'node:fs'
import { towerDebugPlugin } from './tools/tower-debug/server/DebugServer.mjs'
import { explicitStorePath, generatedPath } from './tools/tower-debug/server/StorePath.mjs'

const browserRoot = dirname(fileURLToPath(import.meta.url))
const toolRoot = resolve(browserRoot, 'tools/tower-debug')
const clientRoot = resolve(toolRoot, 'client')
const modules = realpathSync(resolve(browserRoot, 'node_modules'))
export function makeTowerDebugConfig(options = {}) {
  const port = Number(options.port ?? process.env.TOWER_DEBUG_PORT ?? 5176)
  if (!Number.isInteger(port) || port < 1024 || port > 65535) throw new Error('Invalid dedicated debug port')
  const store = options.storeRoot ?? process.env.TOWER_DEBUG_STORE
  if (options.command !== 'build' && !store) explicitStorePath(store)
  const selectedStore = store ? explicitStorePath(store) : null
  const cacheRoot = generatedPath(toolRoot, '.vite')
  return defineConfig({
    root: clientRoot,
    base: '/',
    publicDir: false,
    cacheDir: cacheRoot,
    plugins: selectedStore
      ? [
          towerDebugPlugin({
            root: selectedStore,
            origin: `http://127.0.0.1:${port}`,
            receiptSocket: options.receiptSocket ?? true,
            allowModuleRoots: [clientRoot, modules, cacheRoot]
          })
        ]
      : [],
    server: {
      host: '127.0.0.1',
      port,
      strictPort: true,
      cors: false,
      allowedHosts: ['127.0.0.1'],
      fs: {
        strict: true,
        allow: [clientRoot, modules, cacheRoot],
        deny: ['**/.env*', '**/*.{crt,pem}', '**/state/**', '**/server/**']
      },
      hmr: { host: '127.0.0.1', port, protocol: 'ws' }
    },
    build: {
      outDir: generatedPath(toolRoot, '.build'),
      emptyOutDir: true,
      sourcemap: true
    }
  })
}
export default defineConfig(({ command }) => makeTowerDebugConfig({ command }))
