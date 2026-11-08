import { execFileSync } from 'node:child_process'
import { appendFileSync, readFileSync } from 'node:fs'
import { fileURLToPath, pathToFileURL } from 'node:url'

export const games = [
  'tower',
  'rabbiters',
  'life-survivors',
  'ember-grid',
  'lane-battle',
  'yoru-no-yashiki',
  'mamono-jinkei'
]

// Files in another game's scope that a game imports or loads; tests/ci-scope.test.mjs walks every game's imports
// and scans their runtime asset URLs. The landing E2E also starts these games (see launchedByLanding).
const dependents = [
  [
    'ember-grid',
    /^(examples\/games\/tower_diffence_with_jev\/src\/(game|progression|rendering)\/|public\/tower-defense-(art|sfx)\/)/
  ],
  ['life-survivors', /^examples\/games\/rabbiters\/src\/network\.ts$/],
  ['mamono-jinkei', /^examples\/games\/rabbiters\/src\/network\.ts$/],
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

// Games that tests/landing-e2e.spec.ts starts, so every path they own also selects landing.
const launchedByLanding = ['rabbiters', 'lane-battle', 'yoru-no-yashiki']

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
  if (game)
    return [game, ...users, ...(launchedByLanding.includes(game) && !users.includes('landing') ? ['landing'] : [])]
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

const readRepoFile = (path) => readFileSync(fileURLToPath(new URL('../' + path, import.meta.url)), 'utf8')

// The Pages config's testMatch regex, read as text because this script also runs without node_modules.
const pagesTestMatch = (() => {
  const match = readRepoFile('playwright.pages.config.ts').match(/testMatch:\s*\/((?:[^/\\\n]|\\.)+)\/([a-z]*)/)
  if (!match) throw new Error('testMatch regex not found in playwright.pages.config.ts')
  return new RegExp(match[1], match[2])
})()
const pagesWeights = JSON.parse(readRepoFile('scripts/ci-pages-weights.json'))

const towerUnitExtras = [
  'tests/board-camera-depth.test.ts',
  'tests/runtime-model-optimization.test.ts',
  'tests/caster-motion-v3.test.ts'
]
const towerNodeTests = [
  'tests/published-motion-verification.test.mjs',
  'tests/published-refined-motions.test.mjs',
  'tests/tower-viewer-catalog.test.mjs',
  'tests/forecast-reference-catalog.test.mjs',
  'tests/tower-model-sidecars.test.mjs'
]
const towerTestsDir = 'examples/games/tower_diffence_with_jev/tests'

/** The kind of tower test file a path is ('spec' only for Pages specs), or null for everything else tower owns. */
function towerTestKind(path) {
  if (/^tests\/[^/]+\.spec\.ts$/.test(path)) return 'spec'
  if (towerUnitExtras.includes(path) || /^examples\/games\/tower_diffence_with_jev\/tests\/.+\.test\.ts$/.test(path))
    return 'unit'
  if (towerNodeTests.includes(path)) return 'node'
  return null
}

function targetedShards(specs) {
  const sum = specs.reduce((total, spec) => {
    const prefix = 'tests/' + spec + ' › '
    const seconds = Object.entries(pagesWeights.seconds)
      .filter(([key]) => key.startsWith(prefix))
      .reduce((subtotal, [, value]) => subtotal + value, 0)
    return total + Math.max(pagesWeights.defaultSeconds, seconds)
  }, 0)
  const count = Math.min(18, Math.max(1, Math.ceil(sum / 180)))
  return Array.from({ length: count }, (_, index) => index + 1)
}

// Shared files and the games that use them (owner first). The import-walk contract test in tests/ci-scope.test.mjs
// fails if a game starts importing one of these without being listed; any other file under these folders checks all.
const sharedUsers = {
  'examples/games/shared/UiSound.ts': ['tower', 'rabbiters', 'life-survivors', 'ember-grid', 'lane-battle'],
  'examples/games/shared/ImpactArt.ts': ['tower', 'ember-grid'],
  'utils/relayPresets.ts': ['tower', 'rabbiters', 'life-survivors', 'mamono-jinkei'],
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
  if (has('tower')) unit.push(...towerUnitExtras)
  return unit
}

function nodeFor(has) {
  const node = []
  if (has('tower')) node.push(...towerNodeTests)
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

export function selectScope(paths, { workflowJobs, deleted = [] } = {}) {
  const jobsOnly =
    paths.includes(workflowPath) &&
    Array.isArray(workflowJobs) &&
    workflowJobs.every((job) => Object.hasOwn(workflowJobChecks, job))
  const requirements = jobsOnly ? workflowJobs.map((job) => workflowJobChecks[job]) : []
  const selected = new Set()
  // A deleted test file cannot be run, so the push checks the whole tower scope instead.
  const deletedSet = new Set(deleted)
  const towerTestDeleted = paths.some(
    (path) => deletedSet.has(path) && classify(path)[0] === 'tower' && towerTestKind(path)
  )
  const targeted = { spec: new Set(), unit: new Set(), node: new Set(), other: false }
  for (const path of jobsOnly ? paths.filter((path) => path !== workflowPath) : paths) {
    const scopes = classify(path)
    const kind = scopes[0] === 'tower' && !towerTestDeleted ? towerTestKind(path) : null
    if (kind === 'spec') {
      targeted.other = true
      if (pagesTestMatch.test(path.slice('tests/'.length))) targeted.spec.add(path.slice('tests/'.length))
    } else if (kind) targeted[kind].add(path)
    if (kind) for (const scope of scopes.slice(1)) selected.add(scope)
    else for (const scope of scopes) selected.add(scope)
  }
  const hasTargets = targeted.other || targeted.unit.size + targeted.node.size > 0
  // Only tower test files changed: run those files instead of the whole tower scope.
  const towerTargeted = hasTargets && !selected.has('shared') && !selected.has('tower')
  if (towerTargeted) selected.add('ci')
  const specs = towerTargeted ? [...targeted.spec].sort() : []
  if (jobsOnly) selected.add('ci')
  const required = (key) => requirements.some((requirement) => requirement[key])
  const shared = selected.has('shared')
  const has = (scope) => shared || selected.has(scope)
  const gameRuntime = shared || games.some((game) => selected.has(game)) || selected.has('landing')
  const rank = (target) => {
    const index = fullOrder.indexOf(target)
    if (index >= 0) return index
    const dir = fullOrder.indexOf(towerTestsDir)
    return target.startsWith(towerTestsDir + '/') ? dir + 0.5 : fullOrder.length
  }
  const merged = (own, key) =>
    [...new Set([...own, ...requirements.flatMap((requirement) => requirement[key]?.split(' ') ?? [])])]
      .sort((x, y) => rank(x) - rank(y) || (x < y ? -1 : x > y ? 1 : 0))
      .join(' ')
  const unit = merged([...unitFor(has), ...(towerTargeted ? [...targeted.unit].sort() : [])], 'unit')
  const unitTargets = unit.split(' ').filter(Boolean)
  const unitShardCount =
    unitTargets.length && unitTargets.every((target) => /\.[cm]?[jt]sx?$/.test(target))
      ? Math.min(4, unitTargets.length)
      : 4
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
            has('life-survivors') && 'life-survivors-published-e2e.spec.ts',
            has('mamono-jinkei') && 'mamono-jinkei-published-e2e.spec.ts',
            ...specs
          ]
            .filter(Boolean)
            .join(' '),
    shards: JSON.stringify(
      shared || required('shards')
        ? fullRunShards
        : has('tower')
          ? towerShards
          : specs.length
            ? targetedShards(specs)
            : [1]
    ),
    pagesBrowser:
      has('tower') ||
      has('landing') ||
      has('ember-grid') ||
      has('life-survivors') ||
      has('mamono-jinkei') ||
      specs.length > 0 ||
      required('pagesBrowser'),
    unit,
    unitShards: JSON.stringify(Array.from({ length: unitShardCount }, (_, index) => index + 1)),
    laneNode: has('lane-battle') || required('laneNode') ? laneNodeGlob : '',
    node: merged([...nodeFor(has), ...(towerTargeted ? [...targeted.node].sort() : [])], 'node')
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
  const deleted =
    paths.length && before && !/^0+$/.test(before)
      ? execFileSync('git', ['diff', '--name-only', '--no-renames', '--diff-filter=D', '-z', before, after], {
          encoding: 'utf8'
        })
          .split('\0')
          .filter(Boolean)
      : []
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
  const scope = selectScope(paths, { workflowJobs, deleted })
  appendFileSync(
    process.env.GITHUB_OUTPUT,
    Object.entries(scope)
      .map(([key, value]) => key + '=' + value + '\n')
      .join('')
  )
  console.log(JSON.stringify({ paths, workflowJobs, scope }, null, 2))
}
