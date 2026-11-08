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
  if (Object.hasOwn(sharedUsers, path)) return sharedUsers[path]
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

const workflowPath = '.github/workflows/check.yml'

// Shared files and the games that use them (owner first). The import-walk contract test in tests/ci-scope.test.mjs
// fails if a game starts importing one of these without being listed; any other file under these folders checks all.
const sharedUsers = {
  'examples/games/shared/UiSound.ts': ['tower', 'rabbiters', 'life-survivors', 'ember-grid', 'lane-battle'],
  'examples/games/shared/ImpactArt.ts': ['tower', 'ember-grid'],
  'utils/relayPresets.ts': ['tower', 'rabbiters', 'life-survivors'],
  'utils/media/objectStatus.ts': ['tower', 'yoru-no-yashiki'],
  'utils/moqJson.ts': ['tower'],
  'lib/moqt/moqtClient.ts': ['tower', 'yoru-no-yashiki']
}

function unitFor(has) {
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
  return unit
}

function nodeFor(has) {
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
  return node
}

const fullUnit = unitFor(() => true)
const fullNode = nodeFor(() => true)
const fullOrder = [...fullUnit, ...fullNode]
// A full run keeps ~15 CPU jobs busy, so more shards only add setup; a tower-only run leaves room for 18 within the 20 concurrent-job limit.
const fullRunShards = Array.from({ length: 16 }, (_, index) => index + 1)
const towerShards = Array.from({ length: 18 }, (_, index) => index + 1)
const laneNodeGlob = 'examples/games/lane-battle/*.test.mjs'
const pagesChecks = { pagesBrowser: true, browser: '', shards: JSON.stringify(fullRunShards), pages: true }

/** The check outputs that exercise each workflow job; a job not listed here makes a change to it check everything. */
export const workflowJobChecks = {
  check: { runtime: true, ember: true, debug: true, node: fullNode.join(' '), ci: true },
  unit: { unit: fullUnit.join(' ') },
  'lane-node': { laneNode: laneNodeGlob },
  'life-browser': { life: true },
  'slow-checks': { tower: true, bot: true, audit: true },
  browser: pagesChecks,
  build: pagesChecks
}

/** The job names whose definitions differ between two workflow texts, or 'all' when more than jobs changed. */
export function changedWorkflowJobs(before, after) {
  if (!before || !after) return 'all'
  const split = (text) => {
    const lines = text.replaceAll('\r\n', '\n').split('\n')
    const start = lines.findIndex((line) => /^jobs:\s*$/.test(line))
    if (start < 0) return null
    const jobs = new Map()
    let name = null
    for (const line of lines.slice(start + 1)) {
      const match = line.match(/^ {2}([A-Za-z0-9_-]+):\s*$/)
      if (match) {
        name = match[1]
        jobs.set(name, [])
      }
      if (name) jobs.get(name).push(line)
    }
    return {
      header: lines.slice(0, start).join('\n'),
      jobs: new Map([...jobs].map(([k, v]) => [k, v.join('\n').trimEnd()]))
    }
  }
  const [a, b] = [split(before), split(after)]
  if (!a || !b || a.header !== b.header) return 'all'
  return [...new Set([...a.jobs.keys(), ...b.jobs.keys()])]
    .filter((name) => a.jobs.get(name) !== b.jobs.get(name))
    .sort()
}

export function selectScope(paths, { workflowJobs } = {}) {
  const jobsOnly =
    paths.includes(workflowPath) &&
    Array.isArray(workflowJobs) &&
    workflowJobs.every((job) => Object.hasOwn(workflowJobChecks, job))
  const requirements = jobsOnly ? workflowJobs.map((job) => workflowJobChecks[job]) : []
  const selected = new Set((jobsOnly ? paths.filter((path) => path !== workflowPath) : paths).flatMap(classify))
  if (jobsOnly) selected.add('ci')
  const required = (key) => requirements.some((requirement) => requirement[key])
  const shared = selected.has('shared')
  const has = (scope) => shared || selected.has(scope)
  const gameRuntime = shared || games.some((game) => selected.has(game)) || selected.has('landing')
  const merged = (own, key) =>
    [...new Set([...own, ...requirements.flatMap((requirement) => requirement[key]?.split(' ') ?? [])])]
      .sort((x, y) => fullOrder.indexOf(x) - fullOrder.indexOf(y))
      .join(' ')
  return {
    runtime: gameRuntime || required('runtime'),
    tower: has('tower') || required('tower'),
    ember: has('ember-grid') || required('ember'),
    life: has('life-survivors') || required('life'),
    debug: has('debug') || required('debug'),
    bot: has('bot') || has('tower') || required('bot'),
    audit: shared || required('audit'),
    ci: has('ci') || required('ci'),
    pages: gameRuntime || required('pages'),
    browser:
      shared || requirements.some((requirement) => requirement.browser === '')
        ? ''
        : [
            has('tower') && 'tower-',
            has('landing') && 'landing-e2e.spec.ts',
            has('ember-grid') && 'ember-grid-e2e.spec.ts',
            has('life-survivors') && 'life-survivors-published-e2e.spec.ts'
          ]
            .filter(Boolean)
            .join(' '),
    shards: JSON.stringify(shared || required('shards') ? fullRunShards : has('tower') ? towerShards : [1]),
    pagesBrowser:
      has('tower') || has('landing') || has('ember-grid') || has('life-survivors') || required('pagesBrowser'),
    unit: merged(unitFor(has), 'unit'),
    laneNode: has('lane-battle') || required('laneNode') ? laneNodeGlob : '',
    node: merged(nodeFor(has), 'node')
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
  let workflowJobs
  if (paths.includes(workflowPath) && before && !/^0+$/.test(before)) {
    const show = (commit) => {
      try {
        return execFileSync('git', ['show', commit + ':' + workflowPath], { encoding: 'utf8' })
      } catch {
        return ''
      }
    }
    workflowJobs = changedWorkflowJobs(show(before), show(after))
  }
  const scope = selectScope(paths, { workflowJobs })
  appendFileSync(
    process.env.GITHUB_OUTPUT,
    Object.entries(scope)
      .map(([key, value]) => key + '=' + value + '\n')
      .join('')
  )
  console.log(JSON.stringify({ paths, workflowJobs, scope }, null, 2))
}
