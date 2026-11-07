import { configDefaults, defineConfig, mergeConfig } from 'vitest/config'
import viteConfig from './vite.config.mjs'
import WeightedUnitSequencer from './scripts/vitest-unit-sequencer.mjs'

export default mergeConfig(
  viteConfig,
  defineConfig({
    test: {
      sequence: { sequencer: WeightedUnitSequencer },
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
