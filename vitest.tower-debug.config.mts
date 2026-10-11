import { defineConfig } from 'vitest/config'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { generatedPath } from './tools/tower-debug/server/StorePath.mjs'
export default defineConfig({
  cacheDir: generatedPath(resolve(dirname(fileURLToPath(import.meta.url)), 'tools/tower-debug'), '.vite'),
  test: {
    include: ['tools/tower-debug/client/src/*.test.ts'],
    exclude: ['tools/tower-debug/client/src/Actual3DView.test.ts'],
    maxWorkers: 1,
    fileParallelism: false,
    pool: 'forks',
    environment: 'node'
  }
})
