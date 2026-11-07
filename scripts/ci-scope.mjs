import { execFileSync } from 'node:child_process'
import { appendFileSync, readFileSync } from 'node:fs'
import { pathToFileURL } from 'node:url'

const games = ['tower', 'rabbiters', 'life-survivors', 'ember-grid', 'lane-battle', 'yoru-no-yashiki']

export function selectScope(paths) {
  const selected = new Set()
  for (const path of paths) {
    if (/\.md$/i.test(path) || /^(docs|\.claude|\.agents)\//.test(path)) continue
    if (path.startsWith('examples/games/tower_diffence_with_jev/bot/') || path.startsWith('tests/bot/')) {
      selected.add('bot')
    } else if (path.startsWith('tools/tower-debug/') || /^(playwright|vitest|vite)\.tower-debug/.test(path)) {
      selected.add('debug')
    } else if (
      /^(examples\/games\/tower_diffence_with_jev\/|public\/tower-|tests\/(tower-|caster-|runtime-model|board-camera|model-adapters|glb-fixture|published-|forecast-)|scripts\/(lib\/|.*(?:tower|caster|motion|forecast|interception|model|patchling|roster|ogre|paladin|wolf)))/.test(
        path
      ) ||
      /^(playwright|vitest|vite)\.(tower|caster|compact|model)/.test(path)
    ) {
      selected.add('tower')
    } else {
      const game = games
        .slice(1)
        .find(
          (name) =>
            path.startsWith('examples/games/' + name + '/') ||
            path.startsWith('public/' + name + '/') ||
            path.startsWith('public/' + name + '-') ||
            path.startsWith('tests/' + name + '-') ||
            path.startsWith('scripts/' + name + '-') ||
            new RegExp('^(playwright|vitest|vite)\\.' + name + '\\.').test(path)
        )
      if (game) selected.add(game)
      else if (
        path === 'index.html' ||
        path.startsWith('landing/') ||
        path === 'tests/landing-catalog.test.mjs' ||
        path === 'tests/landing-e2e.spec.ts' ||
        path === 'playwright.landing.config.ts'
      )
        selected.add('landing')
      else selected.add('shared')
    }
  }
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
