import { execFileSync } from 'node:child_process'
import { appendFileSync, readFileSync } from 'node:fs'
import { pathToFileURL } from 'node:url'

const games = ['tower', 'rabbiters', 'life-survivors', 'ember-grid', 'lane-battle', 'yoru-no-yashiki']

// Files in another game's scope that a game imports or loads; tests/ci-scope.test.mjs walks every game's imports.
const dependents = [
  [
    'ember-grid',
    /^(examples\/games\/tower_diffence_with_jev\/src\/(game|progression|rendering)\/|public\/tower-defense-art\/)/
  ],
  ['life-survivors', /^examples\/games\/rabbiters\/src\/network\.ts$/],
  [
    'landing',
    /^(examples\/games\/tower_diffence_with_jev\/extra\.html|public\/tower-defense-art\/[^/]+\/portrait\.png)$/
  ]
]

// Test selection and distribution data, which tests/ci-scope.test.mjs runs against the real suites.
const ciOnly = new Set([
  '.github/workflows/renderer-benchmark.yml',
  'scripts/ci-pages-shard.mjs',
  'scripts/ci-pages-weights.json',
  'scripts/ci-scope.mjs',
  'scripts/vitest-unit-weights.json',
  'tests/ci-scope.test.mjs'
])

/** The scopes a changed path selects, its owner first; empty for documentation and agent instructions. */
export function classify(path) {
  if (/\.md$/i.test(path) || /^(\.claude|\.agents|\.codex)\//.test(path)) return []
  if (ciOnly.has(path)) return ['ci']
  if (path.startsWith('examples/games/tower_diffence_with_jev/bot/') || path.startsWith('tests/bot/')) return ['bot']
  if (path.startsWith('tools/tower-debug/') || /^(playwright|vitest|vite)(\.config)?\.tower-debug/.test(path))
    return ['debug']
  const users = dependents.filter(([, pattern]) => pattern.test(path)).map(([game]) => game)
  if (
    /^(examples\/games\/tower_diffence_with_jev\/|public\/tower-|docs\/animation-repair-audit\.json$|tests\/(tower-|caster-|runtime-model|board-camera|model-adapters|glb-fixture|published-|forecast-|performance\/)|scripts\/(lib\/|import-local-assets\.mjs$|(refine|record-refined)-|.*(?:tower|caster|motion|forecast|interception|model|patchling|roster|ogre|paladin|wolf|-walk-v2-provenance|combat-v2-provenance)))/.test(
      path
    ) ||
    /^(playwright|vitest|vite)\.(tower|caster|compact|model|proximal\.|real3d-game\.|refined-motions\.|road-placement\.|ui\.)/.test(
      path
    )
  )
    return ['tower', ...users]
  const game = games
    .slice(1)
    .find(
      (name) =>
        path.startsWith('examples/games/' + name + '/') ||
        path.startsWith('public/' + name + '/') ||
        path.startsWith('public/' + name + '-') ||
        path.startsWith('tests/' + name + '-') ||
        path.startsWith('scripts/' + name + '-') ||
        new RegExp('^(playwright|vitest|vite)(\\.config)?\\.' + name + '[.-]').test(path)
    )
  if (game) return [game, ...users]
  if (path.startsWith('docs/')) return []
  if (
    path === 'index.html' ||
    path.startsWith('landing/') ||
    path === 'tests/landing-catalog.test.mjs' ||
    path === 'tests/landing-e2e.spec.ts' ||
    path === 'playwright.landing.config.ts'
  )
    return ['landing']
  return ['shared']
}

export function selectScope(paths) {
  const selected = new Set(paths.flatMap(classify))
  const shared = selected.has('shared')
  const has = (scope) => shared || selected.has(scope)
  const runtime = shared || games.some((game) => selected.has(game)) || selected.has('landing')
  const unit = []
  for (const game of games.filter((game) => has(game))) {
    if (game === 'lane-battle') continue
    unit.push('examples/games/' + (game === 'tower' ? 'tower_diffence_with_jev' : game) + '/tests')
  }
  if (has('tower'))
    unit.push(
      'tests/board-camera-depth.test.ts',
      'tests/runtime-model-optimization.test.ts',
      'tests/caster-motion-v3.test.ts'
    )
  const node = []
  if (has('tower'))
    node.push(
      'tests/published-motion-verification.test.mjs',
      'tests/published-refined-motions.test.mjs',
      'tests/tower-viewer-catalog.test.mjs',
      'tests/forecast-reference-catalog.test.mjs',
      'tests/tower-model-sidecars.test.mjs'
    )
  if (has('landing')) node.push('tests/landing-catalog.test.mjs')
  return {
    runtime,
    tower: has('tower'),
    ember: has('ember-grid'),
    life: has('life-survivors'),
    debug: has('debug'),
    bot: has('bot') || has('tower'),
    audit: shared,
    ci: has('ci'),
    pages: runtime,
    browser: shared
      ? ''
      : [
          has('tower') && 'tower-',
          has('landing') && 'landing-e2e.spec.ts',
          has('ember-grid') && 'ember-grid-e2e.spec.ts',
          has('life-survivors') && 'life-survivors-published-e2e.spec.ts'
        ]
          .filter(Boolean)
          .join(' '),
    shards: JSON.stringify(has('tower') ? Array.from({ length: 16 }, (_, index) => index + 1) : [1]),
    pagesBrowser: has('tower') || has('landing') || has('ember-grid') || has('life-survivors'),
    unit: unit.join(' '),
    laneNode: has('lane-battle') ? 'examples/games/lane-battle/*.test.mjs' : '',
    node: node.join(' ')
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const event = JSON.parse(readFileSync(process.env.GITHUB_EVENT_PATH, 'utf8'))
  const before = event.before
  const after = process.env.GITHUB_SHA
  const paths =
    !before || /^0+$/.test(before)
      ? ['package.json']
      : execFileSync('git', ['diff', '--name-only', '--no-renames', '-z', before, after], { encoding: 'utf8' })
          .split('\0')
          .filter(Boolean)
  const scope = selectScope(paths)
  appendFileSync(
    process.env.GITHUB_OUTPUT,
    Object.entries(scope)
      .map(([key, value]) => key + '=' + value + '\n')
      .join('')
  )
  console.log(JSON.stringify({ paths, scope }, null, 2))
}
