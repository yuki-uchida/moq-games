import { configDefaults, defineConfig, mergeConfig } from 'vitest/config'
import viteConfig from './vite.config.mjs'

export default mergeConfig(
  viteConfig,
  defineConfig({
    test: {
      exclude: [
        ...configDefaults.exclude,
        '**/ember-grid/tests/**/*.spec.*',
        'tests/**/*.spec.*',
        '**/*.test.mjs',
        'tools/tower-debug/client/src/Actual3DView.test.ts',
        '**/.sdk-cache/**',
        '**/.generated/**'
      ]
    }
  })
)
