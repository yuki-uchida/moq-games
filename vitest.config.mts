import { configDefaults, defineConfig, mergeConfig } from 'vitest/config'
import viteConfig from './vite.config.mjs'

export default mergeConfig(
  viteConfig,
  defineConfig({ test: { exclude: [...configDefaults.exclude, '**/.sdk-cache/**', '**/.generated/**'] } })
)
