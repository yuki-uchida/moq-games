import { defineConfig } from 'vite'
import { towerViewerCatalogPlugin } from './scripts/tower-viewer-catalog.mjs'
import { existsSync } from 'node:fs'
import { resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
const root = fileURLToPath(new URL('.', import.meta.url))
export default defineConfig({
  base: '/moq-games/',
  plugins: [towerViewerCatalogPlugin(root)],
  define: {
    'import.meta.env.VITE_TOWER_ENVIRONMENT_AVAILABLE': JSON.stringify(
      String(existsSync(resolve(root, 'public/tower-defense-art/environment-3d-trial/runtime-manifest.json')))
    ),
    'import.meta.env.VITE_TOWER_AUDIO_AVAILABLE': JSON.stringify(
      String(existsSync(resolve(root, 'public/tower-defense-sfx/soldier_attack.wav')))
    )
  },
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
        '**/.sdk-cache/**',
        '**/tools/tower-debug/.build/**'
      ]
    }
  },
  preview: { host: '127.0.0.1', port: 4174, strictPort: true },
  build: {
    rollupOptions: {
      input: {
        home: resolve(root, 'index.html'),
        game: resolve(root, 'examples/games/tower_diffence_with_jev/index.html'),
        modelReview: resolve(root, 'examples/games/tower_diffence_with_jev/model-review.html'),
        extra: resolve(root, 'examples/games/tower_diffence_with_jev/extra.html')
      }
    }
  }
})
