import { createServer } from 'vite'
import { resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { attachDebugShutdown } from './DebugLifecycle.mjs'

const browserRoot = fileURLToPath(new URL('../../', import.meta.url))
const server = await createServer({ configFile: resolve(browserRoot, 'vite.config.tower-debug.mjs') })
const lifecycle = attachDebugShutdown(server)
try {
  await server.listen()
  server.printUrls()
} catch (error) {
  await lifecycle.shutdown()
  throw error
}
