import { defineConfig } from 'vite'
import { towerModelSidecars } from './scripts/tower-model-sidecars.mjs'
import { towerViewerCatalogPlugin } from './scripts/tower-viewer-catalog.mjs'
import { existsSync } from 'node:fs'
import { resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
const root = fileURLToPath(new URL('.', import.meta.url))
export default defineConfig({
  base: '/moq-games/',
  plugins: [towerViewerCatalogPlugin(root), towerModelSidecars(root)],
  define: {
    'import.meta.env.VITE_TOWER_ENVIRONMENT_AVAILABLE': JSON.stringify(
      String(existsSync(resolve(root, 'public/tower-defense-art/environment-3d-trial/runtime-manifest.json')))
    ),
    'import.meta.env.VITE_TOWER_AUDIO_AVAILABLE': JSON.stringify(
      String(existsSync(resolve(root, 'public/tower-defense-sfx/soldier_attack.wav')))
    )
  },
  optimizeDeps: { exclude: ['@moq-games/moqt-client', 'moq-wasm'] },
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
        emberGrid: resolve(root, 'examples/games/ember-grid/index.html'),
        laneBattle: resolve(root, 'examples/games/lane-battle/index.html'),
        rabbiters: resolve(root, 'examples/games/rabbiters/index.html'),
        lifeSurvivors: resolve(root, 'examples/games/life-survivors/index.html'),
        yoruNoYashiki: resolve(root, 'examples/games/yoru-no-yashiki/index.html'),
        mamonoJinkei: resolve(root, 'examples/games/mamono-jinkei/index.html'),
        hoshiNoHamham: resolve(root, 'examples/games/hoshi-no-hamham/index.html'),
        animaFront: resolve(root, 'examples/games/anima-front/index.html'),
        game: resolve(root, 'examples/games/tower_diffence_with_jev/index.html'),
        modelReview: resolve(root, 'examples/games/tower_diffence_with_jev/model-review.html'),
        extra: resolve(root, 'examples/games/tower_diffence_with_jev/extra.html')
      }
    }
  }
})
