import assert from 'node:assert/strict'
import { test } from 'node:test'
import { selectScope } from '../scripts/ci-scope.mjs'
import { existsSync, readFileSync, readdirSync } from 'node:fs'
import { execFileSync } from 'node:child_process'
import { resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

test('workflow runs on main pushes only and gates dependent jobs by scope', () => {
  const workflow = readFileSync(new URL('../.github/workflows/check.yml', import.meta.url), 'utf8')
  assert.match(workflow, /on:\s+push:\s+branches: \[main\]/)
  assert.doesNotMatch(workflow, /pull_request/)
  assert.match(workflow, /paths-ignore:\s+- '\*\*\/\*\.md'/)
  assert.match(workflow, /fetch-depth: 0/)
  assert.match(workflow, /needs\.changes\.outputs\.pagesBrowser == 'true'/)
  assert.match(workflow, /needs\.changes\.outputs\.ember == 'true'/)
  assert.match(workflow, /needs\.changes\.outputs\.life == 'true'[\s\S]*?npm run e2e:life-survivors/)
  assert.match(workflow, /needs\.check\.result == 'success'/)
  assert.match(workflow, /needs\.slow-checks\.result == 'skipped'/)
  assert.match(workflow, /needs\.browser\.result == 'skipped'/)
})

test('documentation and instruction changes do not run game checks or publish', () => {
  const scope = selectScope([
    'README.md',
    'docs/diagram.png',
    'examples/games/rabbiters/STORY.md',
    '.claude/skills/review/SKILL.md',
    '.agents/config.json'
  ])
  for (const key of ['runtime', 'pages', 'pagesBrowser', 'life', 'bot', 'debug']) assert.equal(scope[key], false)
  assert.equal(scope.unit, '')
  assert.equal(scope.node, '')
})

for (const game of ['rabbiters', 'life-survivors', 'ember-grid']) {
  test(game + ' changes select only that game', () => {
    for (const path of [
      'examples/games/' + game + '/src/main.ts',
      'playwright.' + game + '.config.ts',
      'tests/' + game + '-e2e.spec.ts'
    ]) {
      const scope = selectScope([path, 'README.md'])
      assert.equal(scope.unit, 'examples/games/' + game + '/tests')
      assert.equal(scope.node, '')
      assert.equal(scope.pages, true)
      assert.equal(scope.pagesBrowser, game === 'ember-grid' || game === 'life-survivors')
      assert.equal(scope.life, game === 'life-survivors')
      if (game === 'life-survivors') assert.equal(scope.browser, 'life-survivors-published-e2e.spec.ts')
      for (const key of ['bot', 'debug']) assert.equal(scope[key], false)
    }
  })
}

test('lane battle selects its Node suites rather than unrelated Vitest suites', () => {
  const scope = selectScope(['examples/games/lane-battle/main.js'])
  assert.equal(scope.unit, '')
  assert.equal(scope.node, 'examples/games/lane-battle/*.test.mjs')
})

test('tower assets and supporting tools include tower contracts, browser and bot checks', () => {
  for (const path of [
    'public/tower-defense-art/hero.glb',
    'scripts/tower-model-sidecars.mjs',
    'tests/tower-title-e2e.spec.ts',
    'examples/games/tower_diffence_with_jev/main.ts'
  ]) {
    const scope = selectScope([path])
    assert.match(scope.unit, /tower_diffence_with_jev\/tests/)
    assert.doesNotMatch(scope.unit, /rabbiters/)
    assert.equal(scope.pagesBrowser, true)
    assert.equal(scope.bot, true)
    assert.equal(scope.debug, false)
  }
})

test('standalone bot and debug changes do not rebuild or publish games', () => {
  const bot = selectScope(['tests/bot/test_contract.py'])
  assert.equal(bot.bot, true)
  assert.equal(bot.runtime, false)
  assert.equal(bot.pages, false)
  const debug = selectScope(['tools/tower-debug/server/StorePath.mjs'])
  assert.equal(debug.debug, true)
  assert.equal(debug.runtime, false)
  assert.equal(debug.pages, false)
})

test('landing changes run landing contracts and browser checks only', () => {
  const scope = selectScope(['index.html'])
  assert.equal(scope.unit, '')
  assert.equal(scope.node, 'tests/landing-catalog.test.mjs')
  assert.equal(scope.browser, 'landing-e2e.spec.ts')
  assert.equal(scope.pagesBrowser, true)
  assert.deepEqual(JSON.parse(scope.shards), [1])
  assert.equal(selectScope(['landing/main.js']).tower, false)
  assert.equal(selectScope(['landing/samples.js']).node, 'tests/landing-catalog.test.mjs')
})

test('tower-only browser checks exclude unrelated landing tests', () => {
  const scope = selectScope(['tests/tower-title-e2e.spec.ts'])
  assert.equal(scope.browser, 'tower-')
  assert.equal(JSON.parse(scope.shards).length, 16)
  assert.equal(selectScope(['index.html', 'tests/tower-title-e2e.spec.ts']).browser, 'tower- landing-e2e.spec.ts')
})

test('shared dependencies, CI and unknown paths conservatively check all games', () => {
  for (const path of [
    'package-lock.json',
    'lib/moqt/moqtClient.ts',
    'examples/games/shared/audio.ts',
    '.github/workflows/check.yml',
    'scripts/ci-scope.mjs',
    'tests/ci-scope.test.mjs',
    'new-runtime.js'
  ]) {
    const scope = selectScope([path])
    for (const game of ['tower_diffence_with_jev', 'rabbiters', 'life-survivors', 'ember-grid'])
      assert.ok(scope.unit.includes('examples/games/' + game + '/tests'))
    for (const key of ['debug', 'bot', 'audit', 'pagesBrowser', 'life']) assert.equal(scope[key], true)
  }
})

test('multiple changed games are combined without selecting other games', () => {
  const scope = selectScope(['tests/rabbiters-e2e.spec.ts', 'public/life-survivors/hero.png'])
  assert.equal(scope.unit, 'examples/games/rabbiters/tests examples/games/life-survivors/tests')
  assert.equal(scope.tower, false)
  assert.equal(scope.browser, 'life-survivors-published-e2e.spec.ts')
  assert.equal(scope.life, true)
})

test('default Vitest config excludes Playwright specs without narrowing unit test includes', () => {
  const config = readFileSync(new URL('../vitest.config.mts', import.meta.url), 'utf8')
  assert.match(config, /exclude:\s*\[\s*\.\.\.configDefaults\.exclude,\s*'\*\*\/ember-grid\/tests\/\*\*\/\*\.spec\.\*'/)
  assert.doesNotMatch(config, /\binclude\s*:/)
})

test(
  'CI Vitest discovery keeps every game unit test and excludes Playwright specs',
  {
    skip: !existsSync(new URL('../node_modules/vitest/vitest.mjs', import.meta.url)) && 'dependencies are not installed'
  },
  () => {
    const root = fileURLToPath(new URL('../', import.meta.url))
    const targets = selectScope(['package.json']).unit.split(' ')
    const expected = targets.flatMap((target) =>
      target.endsWith('/tests')
        ? readdirSync(resolve(root, target), { recursive: true })
            .filter(
              (file) =>
                /\.test\.[cm]?[jt]sx?$/.test(file) ||
                (!target.includes('/ember-grid/') && /\.spec\.[cm]?[jt]sx?$/.test(file))
            )
            .map((file) => resolve(root, target, file))
        : [resolve(root, target)]
    )
    const discovered = JSON.parse(
      execFileSync(process.execPath, ['node_modules/vitest/vitest.mjs', 'list', ...targets, '--filesOnly', '--json'], {
        cwd: root,
        encoding: 'utf8'
      })
    ).map((entry) => resolve(entry.file))
    assert.ok(expected.length > 0)
    assert.deepEqual(discovered.sort(), expected.sort())
  }
)
