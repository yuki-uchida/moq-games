import { defineConfig } from 'vitest/config'
export default defineConfig({
  test: { include: ['tools/tower-debug/client/src/Actual3DView.test.ts'], maxWorkers: 1, minWorkers: 1 }
})
