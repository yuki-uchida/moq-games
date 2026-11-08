import { createHash } from 'node:crypto'
import assert from 'node:assert/strict'
import { test } from 'node:test'
import { selectScope } from '../scripts/ci-scope.mjs'
import { parsePagesList, selectPagesShard } from '../scripts/ci-pages-shard.mjs'
import {
  chromiumPackages,
  installChromium,
  playwrightDependencies,
  playwrightPackages
} from '../scripts/ci-install-chromium.mjs'
import { aptInstall } from '../scripts/ci-apt-install.mjs'
import {
  copyFileSync,
  existsSync,
  globSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  readdirSync,
  rmSync,
  writeFileSync
} from 'node:fs'
import { execFileSync, spawnSync } from 'node:child_process'
import { join, resolve } from 'node:path'
import { tmpdir } from 'node:os'
import { runInNewContext } from 'node:vm'
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

test('SDK jobs prefer generated-only exact caches and always verify before installing dependencies', () => {
  const workflow = readFileSync(new URL('../.github/workflows/check.yml', import.meta.url), 'utf8').replaceAll(
    '\r\n',
    '\n'
  )
  const keySuffix =
    "${{ runner.os }}-${{ runner.arch }}-${{ hashFiles('sdk/source.json', 'sdk/package.json', 'scripts/setup-sdk.mjs', 'scripts/sdk-source-text.mjs') }}"
  for (const name of ['build', 'check', 'lane-node', 'unit', 'life-browser', 'slow-checks']) {
    const job = workflow.match(new RegExp(`^  ${name}:\\n([\\s\\S]*?)(?=^  \\S)`, 'm'))?.[1]
    assert.ok(job, name)
    const steps = job
      .split(/^      - /m)
      .slice(1)
      .map((step) => step.trimEnd())
    const cacheIndex = steps.findIndex((step) => step.includes('id: sdk-generated'))
    assert.ok(cacheIndex >= 0, name)
    assert.deepEqual(
      steps.slice(cacheIndex, cacheIndex + 4),
      [
        [
          'uses: actions/cache@v4',
          '        id: sdk-generated',
          '        with:',
          '          path: .generated/moqt-sdk',
          `          key: sdk-generated-v1-${keySuffix}`
        ].join('\n'),
        [
          'uses: actions/cache@v4',
          "        if: steps.sdk-generated.outputs.cache-hit != 'true'",
          '        with:',
          '          path: |',
          '            .sdk-cache',
          '            .generated/moqt-sdk',
          '            ~/.cargo/registry',
          '            ~/.cargo/git',
          `          key: sdk-${keySuffix}`
        ].join('\n'),
        'run: node scripts/setup-sdk.mjs',
        'run: npm ci --ignore-scripts'
      ],
      name
    )
  }
})

test('only changes, browser and deploy omit public from checkout without limiting Git history', () => {
  const workflow = readFileSync(new URL('../.github/workflows/check.yml', import.meta.url), 'utf8').replaceAll(
    '\r\n',
    '\n'
  )
  for (const name of ['changes', 'browser', 'deploy']) {
    const job = workflow.match(new RegExp('^  ' + name + ':\\n([\\s\\S]*?)(?=^  \\S|(?![\\s\\S]))', 'm'))?.[1]
    assert.ok(job, name)
    const checkout = job.split(/^      - /m).find((step) => step.startsWith('uses: actions/checkout@v4'))
    assert.equal(
      checkout?.trimEnd(),
      [
        'uses: actions/checkout@v4',
        '        with:',
        ...(name === 'changes' ? ['          fetch-depth: 0'] : []),
        '          sparse-checkout: |',
        '            /*',
        '            !/public/',
        '          sparse-checkout-cone-mode: false'
      ].join('\n'),
      name
    )
  }
  assert.doesNotMatch(
    workflow.replace(/^  (?:changes|browser|deploy):\n[\s\S]*?(?=^  \S|(?![\s\S]))/gm, ''),
    /sparse-checkout/
  )
})

test('Pages browser caches only Mesa shaders with exact stable platform and dependency keys', () => {
  const workflow = readFileSync(new URL('../.github/workflows/check.yml', import.meta.url), 'utf8').replaceAll(
    '\r\n',
    '\n'
  )
  const browser = workflow.match(/^  browser:\n([\s\S]*?)(?=^  \S)/m)?.[1]
  assert.ok(browser)
  assert.match(browser, /MESA_SHADER_CACHE_DIR: \$\{\{ runner.temp \}\}\/moq-mesa-shader-cache/)
  assert.match(browser, /MESA_SHADER_CACHE_DISABLE: 'false'/)
  const steps = browser.replace(/^\s*#.*\n/gm, '').split(/^      - /m)
  const jobEnv = browser.match(/^    env:\n([\s\S]*?)(?=^    \S)/m)?.[1]
  assert.ok(jobEnv)
  assert.doesNotMatch(jobEnv, /\$\{\{\s*runner\./)
  assert.match(
    steps.find((step) => step.startsWith('name: Test the Pages build in Chromium\n')) ?? '',
    /        env:\n          MESA_SHADER_CACHE_DIR: \$\{\{ runner.temp \}\}\/moq-mesa-shader-cache\n/
  )
  const platform = steps.find((step) => step.startsWith('name: Identify Mesa shader cache platform\n'))
  const cache = steps.find((step) => step.startsWith('name: Restore Mesa shader cache\n'))
  assert.ok(platform)
  assert.equal(
    cache?.trimEnd(),
    [
      'name: Restore Mesa shader cache',
      '        uses: actions/cache@v4',
      '        with:',
      '          path: ${{ runner.temp }}/moq-mesa-shader-cache',
      "          key: moq-mesa-shader-v1-${{ runner.os }}-${{ runner.arch }}-${{ steps.mesa-cache-platform.outputs.mesa }}-${{ steps.mesa-cache-platform.outputs.cpu }}-${{ hashFiles('package-lock.json') }}-${{ matrix.shard }}-cache",
      '          restore-keys: |',
      "            moq-mesa-shader-v1-${{ runner.os }}-${{ runner.arch }}-${{ steps.mesa-cache-platform.outputs.mesa }}-${{ steps.mesa-cache-platform.outputs.cpu }}-${{ hashFiles('package-lock.json') }}-"
    ].join('\n')
  )
  assert.match(platform, /id: mesa-cache-platform\n\s+shell: bash\n\s+run: \|/)
  const install = steps.findIndex((step) => step.startsWith('name: Install Mesa and Xvfb\n'))
  assert.equal(steps.indexOf(platform), install + 1)
  assert.equal(steps.indexOf(cache), install + 2)
  assert.match(steps[install + 3], /^name: Select this shard's tests\n/)
  assert.doesNotMatch(browser, /cache-hit|LP_NUM_THREADS|LP_PERF/)
  assert.doesNotMatch(
    workflow.replace(/^  browser:\n[\s\S]*?(?=^  \S)/m, ''),
    /MESA_SHADER_CACHE|moq-mesa-shader|mesa-cache-platform/
  )
  const source = platform.match(/          node <<'NODE'\n([\s\S]*?)          NODE\n/)[1].replace(/^          /gm, '')
  const run = ({
    cpu = 'AMD EPYC 9V74 80-Core Processor',
    mesa = '25.2.8-0ubuntu0.24.04.1',
    failure = false,
    missingCpu = false
  } = {}) => {
    const writes = []
    const execute = () =>
      runInNewContext(source, {
        process: { env: { GITHUB_OUTPUT: '/mock/output' } },
        require: (name) => {
          if (name === 'node:crypto') return { createHash }
          if (name === 'node:os') return { cpus: () => (missingCpu ? [] : [{ model: cpu }]) }
          if (name === 'node:child_process')
            return {
              execFileSync: (command, args, options) => {
                assert.equal(command, 'dpkg-query')
                assert.deepEqual(Array.from(args), ['-W', '-f=${Version}', 'libgl1-mesa-dri'])
                assert.equal(options.encoding, 'utf8')
                if (failure) throw new Error('dpkg failure')
                return mesa
              }
            }
          if (name === 'node:fs')
            return {
              appendFileSync: (path, value) => {
                assert.equal(path, '/mock/output')
                writes.push(value)
              }
            }
          throw new Error('Unexpected module: ' + name)
        }
      })
    return { writes, execute }
  }
  const first = run()
  first.execute()
  assert.match(first.writes.join(''), /^mesa=[a-f0-9]{16}\ncpu=[a-f0-9]{16}\n$/)
  const outputs = Object.fromEntries(
    first.writes
      .join('')
      .trim()
      .split('\n')
      .map((line) => line.split('='))
  )
  const values = {
    'runner.os': 'Linux',
    'runner.arch': 'X64',
    'steps.mesa-cache-platform.outputs.mesa': outputs.mesa,
    'steps.mesa-cache-platform.outputs.cpu': outputs.cpu,
    "hashFiles('package-lock.json')": createHash('sha256')
      .update(readFileSync(new URL('../package-lock.json', import.meta.url)))
      .digest('hex')
  }
  const key = cache.match(/^          key: (.+)$/m)[1]
  const prefix = cache.match(/^          restore-keys: \|\n            (.+)$/m)[1]
  const evaluate = (template, changes = {}) =>
    template.replace(/\$\{\{ (.*?) \}\}/g, (_, expression) => {
      const value = { ...values, ...changes }[expression]
      assert.notEqual(value, undefined, expression)
      return value
    })
  const restored = evaluate(prefix)
  const shards = JSON.parse(selectScope(['package-lock.json']).shards)
  assert.equal(shards.length, 16)
  const keys = shards.map((shard) => evaluate(key, { 'matrix.shard': shard }))
  assert.equal(new Set(keys).size, 16)
  assert.equal(keys[15].startsWith(keys[0]), false)
  for (const saved of keys) {
    assert.ok(saved.startsWith(restored))
    const oldKey = saved.replace(/-cache$/, '')
    assert.ok(oldKey.startsWith(restored))
    for (const [expression, value] of Object.entries({
      'runner.os': 'Windows',
      'runner.arch': 'ARM64',
      'steps.mesa-cache-platform.outputs.mesa': '0'.repeat(16),
      'steps.mesa-cache-platform.outputs.cpu': '0'.repeat(16),
      "hashFiles('package-lock.json')": '0'.repeat(64)
    })) {
      assert.notEqual(value, values[expression])
      const changed = { [expression]: value }
      assert.equal(saved.startsWith(evaluate(prefix, changed)), false, expression)
      assert.equal(oldKey.startsWith(evaluate(prefix, changed)), false, expression)
      assert.equal(evaluate(key, { ...changed, 'matrix.shard': 1 }).startsWith(restored), false, expression)
    }
  }
  const same = run()
  same.execute()
  assert.deepEqual(same.writes, first.writes)
  for (const options of [{ cpu: 'Intel Xeon' }, { mesa: '26.0.0-1' }]) {
    const changed = run(options)
    changed.execute()
    assert.notDeepEqual(changed.writes, first.writes)
  }
  for (const options of [
    { cpu: '' },
    { cpu: 'unknown' },
    { cpu: 'N/A' },
    { missingCpu: true },
    { mesa: '' },
    { mesa: 'unknown' },
    { failure: true }
  ]) {
    const invalid = run(options)
    assert.throws(invalid.execute)
    assert.deepEqual(invalid.writes, [])
  }
})

test('Pages browser uses Ubuntu without rebuilding verified artifacts or weakening the gate', () => {
  const workflow = readFileSync(new URL('../.github/workflows/check.yml', import.meta.url), 'utf8').replaceAll(
    '\r\n',
    '\n'
  )
  const browser = workflow.match(/^  browser:\n([\s\S]*?)(?=^  \S)/m)?.[1]
  const deploy = workflow.slice(workflow.indexOf('  deploy:'))
  assert.ok(browser)
  assert.match(browser, /^    needs: \[changes, build\]$/m)
  assert.match(browser, /^    runs-on: ubuntu-latest$/m)
  assert.doesNotMatch(browser, /defaults:/)
  assert.match(browser, /path: ~\/\.cache\/ms-playwright/)
  assert.match(browser, /key: playwright-\$\{\{ runner.os \}\}/)
  assert.match(
    browser,
    /name: pages-sdk-\$\{\{ github.sha \}\}\n\s+path: \.generated\/moqt-sdk[\s\S]*?npm ci --ignore-scripts/
  )
  assert.match(browser, /name: github-pages\n\s+path: \.pages-artifact/)
  assert.match(browser, /tar -xf \.pages-artifact\/artifact.tar -C dist\n\s+test -s dist\/THIRD-PARTY-NOTICES.txt/)
  assert.doesNotMatch(browser, /sdk-generated|\.sdk-cache|setup-sdk|npm run build|prepare-pages|upload-pages-artifact/)
  assert.match(browser, /shard: \$\{\{ fromJSON\(needs.changes.outputs.shards\) \}\}/)
  assert.match(browser, /- name: Select this shard's tests\n\s+id: shard\n\s+shell: bash\n\s+run: \|/)
  assert.match(
    browser,
    /--list \|\n\s+node scripts\/ci-pages-shard.mjs \$\{\{ matrix.shard \}\} \$\{\{ strategy.job-total \}\} > shard-tests.txt/
  )
  assert.match(browser, /if test -s shard-tests.txt; then echo 'has-tests=true' >> "\$GITHUB_OUTPUT"; fi/)
  assert.doesNotMatch(browser, /grep ' › '|awk 'NR %|sed -E/)
  assert.equal(JSON.parse(selectScope(['package-lock.json']).shards).length, 16)
  assert.match(
    browser,
    /^        run: xvfb-run -a npx playwright test --config playwright\.pages\.config\.ts --test-list shard-tests\.txt --workers=2$/m
  )
  assert.match(browser, /env:\n      LIBGL_ALWAYS_SOFTWARE: 'true'\n      GALLIUM_DRIVER: llvmpipe\n/)
  assert.match(
    browser,
    /run: node scripts\/ci-install-chromium\.mjs\n      - name: Install Mesa and Xvfb\n        run: node scripts\/ci-apt-install\.mjs -y libgl1-mesa-dri libegl1 xvfb\n/
  )
  assert.doesNotMatch(browser, /vulkan|Vulkan|VK_DRIVER_FILES|VK_ICD_FILENAMES|lvp_icd|lavapipe|shopt -s nullglob/)
  assert.doesNotMatch(browser, /apt-get update|xvfb-run[^\n]*--list/)
  assert.doesNotMatch(
    workflow.replace(/^  browser:\n[\s\S]*?(?=^  \S)/m, ''),
    /LIBGL_ALWAYS_SOFTWARE|GALLIUM_DRIVER|VK_DRIVER_FILES|xvfb-run|mesa-vulkan-drivers/
  )
  assert.match(deploy, /needs: \[[^\]\n]*\bbuild\b[^\]\n]*\bbrowser\b[^\]\n]*\]/)
  assert.match(deploy, /\(needs\.browser\.result == 'success' \|\| needs\.browser\.result == 'skipped'\)/)
})

test('Pages keeps headless real-mesh coverage and uses benchmark OpenGL only on Linux CI', () => {
  const source = readFileSync(new URL('../playwright.pages.config.ts', import.meta.url), 'utf8')
    .replace(/^import .*\n/m, '')
    .replace('export default defineConfig(', 'defineConfig(')
  const benchmark = readFileSync(new URL('../.github/workflows/renderer-benchmark.yml', import.meta.url), 'utf8')
  const glArgs = Array.from(runInNewContext(benchmark.match(/args: (\[[^\n]+\])/)[1], { backend: 'gl' }))
  assert.deepEqual(glArgs, [
    '--enable-gpu',
    '--ignore-gpu-blocklist',
    '--disable-gpu-rasterization',
    '--use-gl=angle',
    '--use-angle=gl',
    '--use-cmd-decoder=passthrough'
  ])
  for (const platform of ['win32', 'linux', 'darwin']) {
    for (const CI of [undefined, '', 'true', 'false']) {
      const config = runInNewContext(source, {
        defineConfig: (config) => config,
        process: { platform, env: CI === undefined ? {} : { CI } }
      })
      assert.equal(config.fullyParallel, true)
      assert.equal(config.workers, 1)
      assert.equal(config.retries, 0)
      assert.equal(config.timeout, 360_000)
      assert.equal(config.use.headless, true)
      assert.equal(config.use.channel, platform === 'linux' && Boolean(CI) ? 'chromium' : undefined)
      assert.deepEqual(JSON.parse(JSON.stringify(config.use.viewport)), { width: 1440, height: 1000 })
      assert.equal(config.forbidOnly, Boolean(CI))
      assert.equal(config.webServer.reuseExistingServer, !CI)
      assert.deepEqual(
        Array.from(config.use.launchOptions.args),
        platform === 'linux' && Boolean(CI)
          ? glArgs
          : ['--use-gl=angle', platform === 'win32' ? '--use-angle=d3d11-warp' : '--use-angle=swiftshader']
      )
      for (const name of ['tower-model-review', 'tower-real3d-game', 'tower-meshopt-equivalence'])
        assert.ok(config.testMatch.test(`${name}.spec.ts`))
    }
  }
})

test('Pages list parsing preserves spec/describe/title identity and rejects incomplete collection', () => {
  const listing = (path) =>
    `Listing tests:\n  ${path}:12:3 › suite › same title:42:5 › detail  \nTotal: 1 test in 1 file\n`
  const expected = ['nested/a.spec.ts › suite › same title:42:5 › detail  ']
  for (const path of [
    'nested/a.spec.ts',
    'tests/nested/a.spec.ts',
    '/home/runner/repo/tests/nested/a.spec.ts',
    'C:\\repo\\tests\\nested\\a.spec.ts'
  ])
    assert.deepEqual(parsePagesList(listing(path).replaceAll('\n', '\r\n')), expected)
  assert.deepEqual(parsePagesList('Listing tests:\nTotal: 0 tests in 0 files\n'), [])
  assert.deepEqual(parsePagesList(listing('nested/tests/a.spec.ts')), [
    'nested/tests/a.spec.ts › suite › same title:42:5 › detail  '
  ])
  for (const source of [
    '',
    'Error: No tests found',
    'Listing tests:\n',
    listing('a.spec.ts').replace('Total: 1 test', 'Total: 2 tests'),
    listing('a.spec.ts').replace('  a.spec.ts', 'unexpected a.spec.ts'),
    listing('[chromium] › a.spec.ts'),
    listing('/outside/a.spec.ts'),
    listing('../a.spec.ts'),
    listing('a.spec.ts') + 'collection warning\n'
  ])
    assert.throws(() => parsePagesList(source))
})

test('Pages LPT uses only collected names with stable ties, defaults and shard boundaries', () => {
  const weights = { defaultSeconds: 5, seconds: { 'tests/heavy': 20, 'tests/medium': 10, 'tests/uncollected': 1000 } }
  const names = ['new', 'b', 'medium', 'heavy', 'a']
  const partition = (index, count, input = names) => selectPagesShard(input, index, count, weights)
  assert.deepEqual(partition(1, 2), ['heavy', 'new'])
  assert.deepEqual(partition(2, 2), ['medium', 'a', 'b'])
  assert.deepEqual(partition(1, 1), ['heavy', 'medium', 'a', 'b', 'new'])
  for (let index = 1; index <= 8; index++) {
    assert.deepEqual(partition(index, 8), partition(index, 8, [...names].reverse()))
    assert.deepEqual(partition(index, 8, []), [])
  }
  assert.deepEqual(partition(8, 8), [])
  const distinct = ['tests/a.spec.ts › one › same', 'tests/a.spec.ts › two › same', 'tests/b.spec.ts › one › same']
  assert.deepEqual([1, 2].flatMap((index) => partition(index, 2, distinct)).sort(), [...distinct].sort())
  assert.deepEqual(partition(1, 1, ['duplicate', 'duplicate']), ['duplicate', 'duplicate'])
  for (const [index, count] of [
    [0, 1],
    [2, 1],
    [1, 0],
    [1.5, 2],
    [1, 2.5],
    [1, NaN],
    [1, Infinity],
    [1, Number.MAX_SAFE_INTEGER + 1]
  ])
    assert.throws(() => partition(index, count))
  for (const invalid of [null, {}, { defaultSeconds: 0, seconds: {} }, { defaultSeconds: 5, seconds: { a: -1 } }])
    assert.throws(() => selectPagesShard(names, 1, 2, invalid))
})

test('Pages shard CLI emits only test-list names and fails invalid arguments, input or weight reads', () => {
  const root = fileURLToPath(new URL('../', import.meta.url))
  const source = 'Listing tests:\n  new.spec.ts:1:1 › new test\nTotal: 1 test in 1 file\n'
  const run = (args, input = source, script = 'scripts/ci-pages-shard.mjs') =>
    spawnSync(process.execPath, [script, ...args], { cwd: root, input, encoding: 'utf8' })
  const success = run(['1', '1'])
  assert.equal(success.status, 0, success.stderr)
  assert.equal(success.stderr, '')
  assert.equal(success.stdout, 'new.spec.ts › new test\n')
  assert.equal(run(['2', '2']).stdout, '')
  const empty = run(['1', '1'], 'Listing tests:\nTotal: 0 tests in 0 files\n')
  assert.equal(empty.status, 0, empty.stderr)
  assert.equal(empty.stdout, '')
  for (const args of [
    [],
    ['1'],
    ['1', '1', 'extra'],
    ['0', '1'],
    ['2', '1'],
    ['1', '0'],
    ['1.0', '2'],
    ['1e0', '2'],
    [' 1', '2'],
    ['01', '2'],
    ['-1', '2'],
    ['1', '9007199254740992']
  ]) {
    const result = run(args)
    assert.equal(result.status, 1, JSON.stringify(args))
    assert.equal(result.stdout, '')
    assert.ok(result.stderr)
  }
  for (const input of ['', 'Error: collection failed\n', source.replace('Total: 1', 'Total: 2')]) {
    const result = run(['1', '1'], input)
    assert.equal(result.status, 1)
    assert.equal(result.stdout, '')
  }
  const artifacts = join(root, '.build/pages-balanced-sharding')
  mkdirSync(artifacts, { recursive: true })
  const directory = mkdtempSync(join(artifacts, 'missing-weights-'))
  const script = join(directory, 'ci-pages-shard.mjs')
  copyFileSync(join(root, 'scripts/ci-pages-shard.mjs'), script)
  const unreadable = run(['1', '1'], source, script)
  assert.equal(unreadable.status, 1)
  assert.equal(unreadable.stdout, '')
  assert.match(unreadable.stderr, /ENOENT/)
})

test(
  'Pages LPT test-list recollection preserves every selected test across all shards and game scopes',
  {
    skip:
      !existsSync(new URL('../node_modules/@playwright/test/cli.js', import.meta.url)) &&
      'dependencies are not installed'
  },
  () => {
    const root = fileURLToPath(new URL('../', import.meta.url))
    const artifacts = join(root, '.build/pages-balanced-sharding')
    mkdirSync(join(artifacts, 'node_modules'), { recursive: true })
    const directory = mkdtempSync(join(artifacts, 'node_modules/pages-fixture-'))
    const weights = JSON.parse(readFileSync(join(root, 'scripts/ci-pages-weights.json'), 'utf8'))
    const sources = new WeakMap()
    let invocation = 0
    const list = (args = [], config = 'playwright.pages.config.ts') => {
      const output = execFileSync(
        process.execPath,
        ['node_modules/@playwright/test/cli.js', 'test', '--config', config, '--list', '--reporter=list', ...args],
        {
          cwd: root,
          encoding: 'utf8',
          env: { ...process.env, FORCE_COLOR: '0' }
        }
      )
      writeFileSync(join(directory, `collection-${++invocation}.txt`), output)
      const names = parsePagesList(output)
      sources.set(names, output)
      return names
    }
    const recollect = (names, count, config) => {
      const selected = []
      for (let index = 1; index <= count; index++) {
        const partition = selectPagesShard(names, index, count, weights)
        assert.deepEqual(partition, selectPagesShard([...names].reverse(), index, count, weights))
        const output = execFileSync(process.execPath, ['scripts/ci-pages-shard.mjs', String(index), String(count)], {
          cwd: root,
          encoding: 'utf8',
          input: sources.get(names)
        })
        assert.equal(output, partition.length ? partition.join('\n') + '\n' : '')
        if (!partition.length) continue
        const path = join(directory, `shard-${invocation}-${index}.txt`)
        writeFileSync(path, output)
        const actual = list(['--test-list', path], config)
        assert.deepEqual([...actual].sort(), [...partition].sort())
        selected.push(...actual)
      }
      assert.deepEqual(selected.sort(), [...names].sort())
    }
    const all = list()
    assert.ok(all.length > 0)
    recollect(all, 16)
    assert.deepEqual(list().sort(), [...all].sort())
    for (const game of [
      'tower_diffence_with_jev',
      'rabbiters',
      'life-survivors',
      'ember-grid',
      'lane-battle',
      'yoru-no-yashiki',
      'landing'
    ]) {
      const scope = selectScope([game === 'landing' ? 'landing/main.ts' : `examples/games/${game}/main.ts`])
      if (scope.pagesBrowser) recollect(list(scope.browser.split(' ').filter(Boolean)), JSON.parse(scope.shards).length)
      else assert.equal(scope.pagesBrowser, false)
    }
    writeFileSync(join(directory, 'fixture.config.mjs'), `export default { testDir: '.', testMatch: '*.spec.mjs' }\n`)
    writeFileSync(
      join(directory, 'new.spec.mjs'),
      `import { test } from '@playwright/test'\ntest.describe('one', () => { test('same title', () => {}) })\ntest.describe('two', () => { test('same title', () => {}) })\n`
    )
    writeFileSync(
      join(directory, 'other.spec.mjs'),
      `import { test } from '@playwright/test'\ntest.describe('one', () => { test('same title', () => {}) })\n`
    )
    const config = join(directory, 'fixture.config.mjs')
    const fresh = list([], config)
    assert.equal(fresh.length, 3)
    assert.equal(new Set(fresh).size, 3)
    assert.ok(fresh.every((name) => weights.seconds[`tests/${name}`] === undefined))
    recollect(fresh, 8, config)
  }
)

test('unit shards run independently and gate publication', () => {
  const workflow = readFileSync(new URL('../.github/workflows/check.yml', import.meta.url), 'utf8').replaceAll(
    '\r\n',
    '\n'
  )
  const check = workflow.match(/^  check:\n([\s\S]*?)(?=^  \S)/m)?.[1]
  const unit = workflow.match(/^  unit:\n([\s\S]*?)(?=^  \S)/m)?.[1]
  const deploy = workflow.slice(workflow.indexOf('  deploy:'))
  assert.ok(check)
  assert.ok(unit)
  assert.doesNotMatch(check, /vitest run|name: Unit tests/)
  for (const command of [
    'npm run typecheck',
    'npm run lint',
    'node --test ${{ needs.changes.outputs.node }}',
    'npm run typecheck:tower-debug',
    'npm run test:tower-debug'
  ])
    assert.ok(check.includes(command))
  assert.match(unit, /^    needs: changes$/m)
  assert.match(unit, /^    if: needs\.changes\.outputs\.unit != ''$/m)
  assert.match(unit, /fail-fast: false/)
  assert.match(unit, /shard: \[1, 2, 3, 4\]/)
  assert.match(unit, /actions\/cache@v4[\s\S]*?\.generated\/moqt-sdk/)
  assert.match(unit, /node scripts\/setup-sdk\.mjs[\s\S]*?npm ci --ignore-scripts/)
  assert.match(
    unit,
    /name: Install Chromium for browser-backed unit tests\n\s+if: contains\(needs\.changes\.outputs\.unit, 'examples\/games\/yoru-no-yashiki\/tests'\)\n\s+run: node scripts\/ci-install-chromium\.mjs[\s\S]*?name: Unit tests/
  )
  assert.match(
    unit,
    /npx vitest run \$\{\{ needs\.changes\.outputs\.unit \}\} --shard=\$\{\{ matrix\.shard \}\}\/\$\{\{ strategy\.job-total \}\} --maxWorkers=4/
  )
  assert.match(deploy, /needs: \[[^\]\n]*\bunit\b[^\]\n]*\]/)
  assert.match(
    deploy,
    /\(needs\.unit\.result == 'success' \|\| \(needs\.unit\.result == 'skipped' && needs\.changes\.outputs\.unit == ''\)\) &&/
  )
})

test('life browser shards run independently and gate publication', () => {
  const workflow = readFileSync(new URL('../.github/workflows/check.yml', import.meta.url), 'utf8').replaceAll(
    '\r\n',
    '\n'
  )
  const check = workflow.match(/^  check:\n([\s\S]*?)(?=^  \S)/m)?.[1]
  const browser = workflow.match(/^  life-browser:\n([\s\S]*?)(?=^  \S)/m)?.[1]
  const deploy = workflow.slice(workflow.indexOf('  deploy:'))
  assert.ok(check)
  assert.ok(browser)
  assert.doesNotMatch(check, /e2e:life-survivors/)
  assert.match(browser, /^    needs: changes$/m)
  assert.match(browser, /^    if: needs\.changes\.outputs\.life == 'true'$/m)
  assert.match(browser, /fail-fast: false/)
  assert.match(browser, /^        shard: \[1, 2, 3\]$/m)
  assert.match(
    browser,
    /^        run: npm run e2e:life-survivors -- --shard=\$\{\{ matrix\.shard \}\}\/\$\{\{ strategy\.job-total \}\} --workers=2$/m
  )
  assert.match(browser, /name: life-survivors-browser-\$\{\{ github\.sha \}\}-shard-\$\{\{ matrix\.shard \}\}/)
  assert.match(deploy, /needs: \[[^\]\n]*\blife-browser\b[^\]\n]*\]/)
  assert.match(deploy, /\(needs\.life-browser\.result == 'success' \|\| needs\.life-browser\.result == 'skipped'\) &&/)
})

test('Lane Node shards run independently and are required for publication', () => {
  const workflow = readFileSync(new URL('../.github/workflows/check.yml', import.meta.url), 'utf8').replaceAll(
    '\r\n',
    '\n'
  )
  const lane = workflow.match(/^  lane-node:\n([\s\S]*?)(?=^  \S)/m)?.[1]
  const deploy = workflow.slice(workflow.indexOf('  deploy:'))
  assert.ok(lane)
  assert.match(workflow, /laneNode: \$\{\{ steps\.scope\.outputs\.laneNode \}\}/)
  assert.match(lane, /^    needs: changes$/m)
  assert.match(lane, /^    if: needs\.changes\.outputs\.laneNode != ''$/m)
  assert.match(lane, /fail-fast: false/)
  assert.match(lane, /shard: \[1, 2, 3, 4, 5\]/)
  assert.match(
    lane,
    /node --test --test-shard=\$\{\{ matrix\.shard \}\}\/\$\{\{ strategy\.job-total \}\} \$\{\{ needs\.changes\.outputs\.laneNode \}\}/
  )
  assert.match(lane, /actions\/cache@v4[\s\S]*?\.generated\/moqt-sdk/)
  assert.match(lane, /node scripts\/setup-sdk\.mjs[\s\S]*?npm ci --ignore-scripts/)
  assert.doesNotMatch(lane, /artifact|npm run build/)
  assert.match(deploy, /needs: \[[^\]\n]*\blane-node\b[^\]\n]*\]/)
  assert.match(
    deploy,
    /\(needs\.lane-node\.result == 'success' \|\| \(needs\.lane-node\.result == 'skipped' && needs\.changes\.outputs\.laneNode == ''\)\) &&/
  )
  const gate = deploy
    .match(/^      (\(needs\.lane-node\.result.*) &&$/m)[1]
    .replaceAll('needs.lane-node.result', 'result')
    .replaceAll('needs.changes.outputs.laneNode', 'scope')
  for (const scope of ['', 'examples/games/lane-battle/*.test.mjs']) {
    for (const result of ['success', 'skipped', 'failure', 'cancelled']) {
      assert.equal(
        runInNewContext(gate, { result, scope }),
        result === 'success' || (result === 'skipped' && scope === '')
      )
    }
  }
})

test('Lane Node discovery shards every file and all ten realistic cases exactly once', async () => {
  const root = fileURLToPath(new URL('../', import.meta.url))
  const files = globSync(selectScope(['package.json']).laneNode, { cwd: root })
    .map((file) => file.replaceAll('\\', '/'))
    .sort()
  const battles = files.filter((file) => /realistic-battles.*\.test\.mjs$/.test(file))
  assert.equal(battles.length, 5)
  const helper = readFileSync(
    new URL('../examples/games/lane-battle/realistic-battle-tests.mjs', import.meta.url),
    'utf8'
  )
  const stripImports = (source) => source.replace(/^import .*\r?\n/gm, '').replace('export function ', 'function ')
  const casesByFile = new Map()
  for (const file of battles) {
    const cases = []
    const pending = []
    const samples = Symbol('samples')
    runInNewContext(stripImports(helper) + '\n' + stripImports(readFileSync(resolve(root, file), 'utf8')), {
      test(name, options, callback) {
        assert.equal(name, 'realistic formations meet all bars')
        assert.equal(options.concurrency, true)
        pending.push(callback({}))
      },
      collectRealisticSamples(stages, clearStages) {
        assert.deepEqual(Array.from(stages), [8, 15, 22])
        assert.deepEqual(Array.from(clearStages), [22])
        return samples
      },
      testRealistic(_parent, actualSamples, stage, policy, group) {
        assert.equal(actualSamples, samples)
        cases.push(`${stage}:${policy}:${group}`)
      }
    })
    await Promise.all(pending)
    assert.equal(pending.length, 1)
    assert.equal(cases.length, 2)
    casesByFile.set(file, cases)
  }
  const expected = [8, 15, 22].flatMap((stage) =>
    ['keep', 'casual'].flatMap((policy) =>
      (stage === 8 ? ['fresh'] : ['fresh', 'old']).map((group) => `${stage}:${policy}:${group}`)
    )
  )
  assert.deepEqual([...casesByFile.values()].flat().sort(), expected.sort())
  const directory = mkdtempSync(join(tmpdir(), 'lane-node-shards-'))
  const env = { ...process.env }
  delete env.NODE_TEST_CONTEXT
  try {
    for (const file of [...files, 'new-suite.test.mjs']) {
      const name = file.split('/').at(-1)
      writeFileSync(join(directory, name), `import { test } from 'node:test'; test(${JSON.stringify(file)}, () => {})`)
    }
    const partitions = [1, 2, 3, 4, 5].map((shard) =>
      execFileSync(process.execPath, ['--test', '--test-reporter=tap', `--test-shard=${shard}/5`, '*.test.mjs'], {
        cwd: directory,
        encoding: 'utf8',
        env
      })
        .split(/\r?\n/)
        .filter((line) => line.startsWith('# Subtest: '))
        .map((line) => line.slice('# Subtest: '.length))
    )
    assert.deepEqual(partitions.flat().sort(), [...files, 'new-suite.test.mjs'].sort())
    for (const partition of partitions) assert.equal(partition.filter((file) => battles.includes(file)).length, 1)
  } finally {
    rmSync(directory, { recursive: true, force: true })
  }
})

test(
  'life browser shards partition every test without duplicates',
  {
    skip:
      !existsSync(new URL('../node_modules/@playwright/test/cli.js', import.meta.url)) &&
      'dependencies are not installed'
  },
  () => {
    const root = fileURLToPath(new URL('../', import.meta.url))
    const list = (...args) =>
      execFileSync(
        process.execPath,
        [
          'node_modules/@playwright/test/cli.js',
          'test',
          '--config=playwright.life-survivors.config.ts',
          '--list',
          '--reporter=list',
          ...args
        ],
        { cwd: root, encoding: 'utf8', env: { ...process.env, FORCE_COLOR: '0' } }
      )
        .split(/\r?\n/)
        .filter((line) => line.includes(' › '))
        .map((line) => line.trim())
    const all = list()
    const workflow = readFileSync(new URL('../.github/workflows/check.yml', import.meta.url), 'utf8').replaceAll(
      '\r\n',
      '\n'
    )
    const browser = workflow.match(/^  life-browser:\n([\s\S]*?)(?=^  \S)/m)?.[1]
    assert.ok(browser)
    const shards = JSON.parse(browser.match(/shard: (\[[^\]\n]+\])/)?.[1] ?? 'null')
    assert.deepEqual(shards, [1, 2, 3])
    const partitions = shards.map((shard) => list(`--shard=${shard}/${shards.length}`, '--workers=2'))
    const counts = partitions.map((partition) => partition.length)
    assert.ok(counts.every((count) => count > 0))
    assert.ok(Math.max(...counts) - Math.min(...counts) <= 1)
    const selected = partitions.flat()
    assert.equal(new Set(selected).size, selected.length)
    assert.deepEqual(selected.sort(), all.sort())
  }
)

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
  assert.equal(scope.laneNode, '')
})

for (const game of ['rabbiters', 'life-survivors', 'ember-grid', 'yoru-no-yashiki']) {
  test(game + ' changes select only that game', () => {
    for (const path of [
      'examples/games/' + game + '/src/main.ts',
      'playwright.' + game + '.config.ts',
      'tests/' + game + '-e2e.spec.ts'
    ]) {
      const scope = selectScope([path, 'README.md'])
      assert.equal(scope.unit, 'examples/games/' + game + '/tests')
      assert.equal(scope.node, '')
      assert.equal(scope.laneNode, '')
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
  assert.equal(scope.node, '')
  assert.equal(scope.laneNode, 'examples/games/lane-battle/*.test.mjs')
  assert.deepEqual(selectScope(['tests/lane-battle-new.test.mjs']), scope)
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
    assert.equal(scope.laneNode, '')
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
  assert.equal(bot.laneNode, '')
  assert.equal(debug.laneNode, '')
})

test('landing changes run landing contracts and browser checks only', () => {
  const scope = selectScope(['index.html'])
  assert.equal(scope.unit, '')
  assert.equal(scope.node, 'tests/landing-catalog.test.mjs')
  assert.equal(scope.laneNode, '')
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
    assert.equal(scope.laneNode, 'examples/games/lane-battle/*.test.mjs')
    assert.deepEqual(scope.node.split(' '), [
      'tests/published-motion-verification.test.mjs',
      'tests/published-refined-motions.test.mjs',
      'tests/tower-viewer-catalog.test.mjs',
      'tests/forecast-reference-catalog.test.mjs',
      'tests/tower-model-sidecars.test.mjs',
      'tests/landing-catalog.test.mjs'
    ])
    for (const game of ['tower_diffence_with_jev', 'rabbiters', 'life-survivors', 'ember-grid', 'yoru-no-yashiki'])
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
  assert.match(config, /'tests\/\*\*\/\*\.spec\.\*'/)
  assert.match(config, /'\*\*\/\*\.test\.mjs'/)
  assert.doesNotMatch(config, /\binclude\s*:/)
})

test(
  'CI Vitest discovery keeps every game unit test and excludes Playwright specs',
  {
    skip: !existsSync(new URL('../node_modules/vitest/vitest.mjs', import.meta.url)) && 'dependencies are not installed'
  },
  async () => {
    const root = resolve(fileURLToPath(new URL('../', import.meta.url)))
    const targets = selectScope(['package.json']).unit.split(' ')
    for (const game of readdirSync(resolve(root, 'examples/games'), { withFileTypes: true })) {
      if (game.isDirectory() && existsSync(resolve(root, 'examples/games', game.name, 'tests')))
        assert.ok(targets.includes(`examples/games/${game.name}/tests`), `${game.name} unit tests are missing from CI`)
    }
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
    const workflow = readFileSync(new URL('../.github/workflows/check.yml', import.meta.url), 'utf8').replaceAll(
      '\r\n',
      '\n'
    )
    const unit = workflow.match(/^  unit:\n([\s\S]*?)(?=^  \S)/m)?.[1]
    const shards = JSON.parse(unit?.match(/shard: (\[[^\]\n]+\])/)?.[1] ?? 'null')
    assert.deepEqual(shards, [1, 2, 3, 4])
    const { BaseSequencer, createVitest } = await import('vitest/node')
    const vitest = await createVitest('test', { root })
    const Sequencer = vitest.config.sequence.sequencer
    await vitest.close()
    assert.equal(Sequencer.name, 'WeightedUnitSequencer')
    assert.notEqual(Sequencer.prototype.sort, BaseSequencer.prototype.sort)
    const specifications = discovered.map((moduleId) => ({ moduleId }))
    const partition = (files, scopeRoot = root) =>
      Promise.all(
        shards.map(async (index) => {
          const sequencer = new Sequencer({ config: { root: scopeRoot, shard: { index, count: shards.length } } })
          return (await sequencer.shard(files)).map((entry) => entry.moduleId)
        })
      )
    const partitions = await partition(specifications)
    assert.ok(partitions.every((partition) => partition.length > 0))
    const selected = partitions.flat()
    assert.equal(new Set(selected).size, selected.length)
    assert.deepEqual(selected.sort(), discovered.sort())
    assert.deepEqual(await partition([...specifications].reverse()), partitions)
    assert.deepEqual(await new Sequencer({ config: { root } }).shard(specifications), specifications)
    for (const target of targets.filter((target) => target.endsWith('/tests'))) {
      const scoped = specifications.filter(({ moduleId }) => moduleId.startsWith(resolve(root, target)))
      const selected = (await partition(scoped)).flat()
      assert.equal(new Set(selected).size, selected.length)
      assert.deepEqual(selected.sort(), scoped.map(({ moduleId }) => moduleId).sort())
    }
    const newFile = { moduleId: resolve(root, 'examples/games/rabbiters/tests/new-unit.test.ts') }
    const withNewFile = (await partition([...specifications, newFile])).flat()
    assert.equal(withNewFile.filter((moduleId) => moduleId === newFile.moduleId).length, 1)
    assert.equal(new Set(withNewFile).size, discovered.length + 1)
    const relative = specifications.map(({ moduleId }) => moduleId.slice(root.length).replaceAll('\\', '/'))
    const portablePartitions = async (prefix, separator) =>
      (
        await partition(
          relative.map((path) => ({ moduleId: (prefix + path).replaceAll('/', separator) })),
          prefix.replaceAll('/', separator)
        )
      ).map((files) => files.map((path) => path.replaceAll('\\', '/').slice(prefix.length)))
    assert.deepEqual(
      await portablePartitions('/home/runner/work/moq-games/moq-games', '/'),
      await portablePartitions('C:/checkout/moq-games', '\\')
    )
    assert.deepEqual(
      await portablePartitions('/home/runner/work/moq-games/moq-games', '/'),
      partitions.map((files) => files.map((path) => path.slice(root.length).replaceAll('\\', '/')))
    )
    const allFiles = JSON.parse(
      execFileSync(process.execPath, ['node_modules/vitest/vitest.mjs', 'list', '--filesOnly', '--json'], {
        cwd: root,
        encoding: 'utf8'
      })
    )
    assert.ok(allFiles.length >= discovered.length)
    assert.ok(allFiles.every(({ file }) => !/\.test\.mjs$/.test(file) && !/[\\/]tests[\\/].*\.spec\./.test(file)))
    assert.ok(allFiles.every(({ file }) => !file.endsWith('Actual3DView.test.ts')))
  }
)

test(
  'unit sharding uses LPT with stable path and shard ties, including small and empty scopes',
  {
    skip: !existsSync(new URL('../node_modules/vitest/vitest.mjs', import.meta.url)) && 'dependencies are not installed'
  },
  async () => {
    const { default: Sequencer } = await import('../scripts/vitest-unit-sequencer.mjs')
    const root = '/repo'
    const clock = { moduleId: 'examples/games/yoru-no-yashiki/tests/main-clock-constant.test.ts' }
    const audio = { moduleId: 'examples/games/yoru-no-yashiki/tests/main-audio-safety.test.ts' }
    const town = { moduleId: 'examples/games/rabbiters/tests/town.test.ts' }
    const light = ['a', 'b', 'c'].map((name) => ({ moduleId: 'tests/' + name + '.test.ts' }))
    const files = [...light].reverse().concat(audio, clock, town)
    const partition = (index, count, input = files) =>
      new Sequencer({ config: { root, shard: { index, count } } }).shard(input)
    assert.deepEqual(await partition(1, 3), [clock])
    assert.deepEqual(await partition(2, 3), [audio, light[2]])
    assert.deepEqual(await partition(3, 3), [town, light[0], light[1]])
    assert.deepEqual(await partition(1, 1), [clock, audio, town, ...light])
    assert.deepEqual(await partition(1, 2, [...light].reverse()), [light[0], light[2]])
    assert.deepEqual(await partition(2, 2, [...light].reverse()), [light[1]])
    assert.deepEqual(await partition(7, 8), [])
    assert.deepEqual(await partition(1, 8, []), [])
  }
)

test(
  'unit shard sorting prioritizes weights within BaseSequencer project groups and preserves base ties',
  {
    skip: !existsSync(new URL('../node_modules/vitest/vitest.mjs', import.meta.url)) && 'dependencies are not installed'
  },
  async () => {
    const { BaseSequencer } = await import('vitest/node')
    const { default: Sequencer } = await import('../scripts/vitest-unit-sequencer.mjs')
    const orders = []
    for (const [root, separator] of [
      ['/home/runner/work/moq-games/moq-games', '/'],
      ['C:\\checkout\\moq-games', '\\']
    ]) {
      const project = { name: '', config: { sequence: { groupOrder: 0 }, isolate: true } }
      const paths = [
        'tests/failed.test.ts',
        'examples/games/rabbiters/tests/campaign-seed-2.test.ts',
        'examples/games/rabbiters/tests/campaign-seed-3.test.ts',
        'examples/games/yoru-no-yashiki/tests/main-audio-safety.test.ts',
        'tests/new-unit.test.ts',
        'tests/larger.test.ts'
      ]
      const files = Object.freeze(
        paths.map((path, index) => ({
          moduleId: (index === 3 ? path : root + '/./' + path).replaceAll('/', separator),
          project
        }))
      )
      const cache = {
        getFileTestResults: (key) => {
          if (/new-unit|larger/.test(key)) return undefined
          return { failed: key.includes('failed'), duration: key.includes('campaign-seed-3') ? 100 : 1 }
        },
        getFileStats: (key) => (key.includes('new-unit') ? undefined : { size: key.includes('larger') ? 1000 : 1 })
      }
      const ctx = { config: { root }, cache }
      const base = await new BaseSequencer(ctx).sort(files)
      assert.ok(base.indexOf(files[0]) < base.indexOf(files[3]))
      assert.deepEqual(await new Sequencer(ctx).sort(files), base)
      ctx.config.shard = { index: 1, count: 4 }
      const sorted = await new Sequencer(ctx).sort(files)
      assert.deepEqual(sorted.slice(0, 3), [files[3], files[2], files[1]])
      assert.deepEqual(
        sorted.slice(3),
        base.filter((spec) => [files[0], files[4], files[5]].includes(spec))
      )
      assert.deepEqual(
        sorted.filter((spec) => [files[1], files[2]].includes(spec)),
        base.filter((spec) => [files[1], files[2]].includes(spec))
      )
      assert.equal(sorted.length, files.length)
      assert.ok(files.every((spec) => sorted.filter((entry) => entry === spec).length === 1))
      assert.deepEqual(
        files.map((spec) => spec.moduleId),
        paths.map((path, index) => (index === 3 ? path : root + '/./' + path).replaceAll('/', separator))
      )
      orders.push(sorted.map((spec) => files.indexOf(spec)))
      const grouped = Object.freeze([
        { ...files[3], project: { name: 'b', config: { sequence: { groupOrder: 0 }, isolate: true } } },
        { ...files[3], project: { name: 'a', config: { sequence: { groupOrder: 0 }, isolate: false } } },
        { ...files[0], project: { name: 'a', config: { sequence: { groupOrder: 0 }, isolate: true } } },
        { ...files[0], project: { name: 'z', config: { sequence: { groupOrder: -1 }, isolate: true } } }
      ])
      assert.deepEqual(await new Sequencer(ctx).sort(grouped), [grouped[3], grouped[2], grouped[1], grouped[0]])
      assert.deepEqual(await new Sequencer(ctx).sort([]), [])
    }
    assert.deepEqual(orders[0], orders[1])
  }
)

test('Chromium installs reuse Playwright packages and refresh apt lists only on failure', async () => {
  const table = {
    linux: { chromium: ['libnss3', 'libatk-bridge2.0-0t64', 'xvfb'], tools: ['xvfb', 'fonts-ipafont-gothic'] }
  }
  assert.deepEqual(chromiumPackages(table, 'linux'), [
    'libnss3',
    'libatk-bridge2.0-0t64',
    'xvfb',
    'fonts-ipafont-gothic'
  ])
  for (const [deps, platform] of [
    [table, 'win64'],
    [{ linux: { chromium: [], tools: ['xvfb'] } }, 'linux'],
    [{ linux: { chromium: ['libnss3;reboot'], tools: ['xvfb'] } }, 'linux']
  ])
    assert.throws(() => chromiumPackages(deps, platform))
  // ubuntu-latest resolves the installed Playwright's own Ubuntu 24.04 table, fonts included.
  const ubuntu = chromiumPackages(playwrightDependencies().deps, 'ubuntu24.04-x64')
  for (const name of ['libnss3', 'xvfb', 'fonts-ipafont-gothic', 'fonts-wqy-zenhei', 'fonts-noto-color-emoji'])
    assert.ok(ubuntu.includes(name), name)
  if (process.platform === 'linux')
    assert.deepEqual(
      playwrightPackages(),
      chromiumPackages(playwrightDependencies().deps, playwrightDependencies().hostPlatform)
    )
  const attempt = async (fails = [], packages = () => ['xvfb', 'libnss3']) => {
    const calls = []
    const run = async (command, args) => {
      const call = [command, ...args].join(' ')
      calls.push(call)
      const index = fails.indexOf(call)
      if (index < 0) return true
      fails.splice(index, 1)
      return false
    }
    return { ok: await installChromium({ run, packages }), calls }
  }
  const browser = 'npx playwright install chromium'
  const install = 'sudo apt-get install -y --no-install-recommends xvfb libnss3'
  assert.deepEqual(await attempt(), { ok: true, calls: [browser, install] })
  assert.deepEqual(await attempt([install]), { ok: true, calls: [browser, install, 'sudo apt-get update', install] })
  assert.deepEqual((await attempt([install, 'sudo apt-get update'])).calls, [browser, install, 'sudo apt-get update'])
  assert.equal((await attempt([install, 'sudo apt-get update'])).ok, false)
  assert.equal((await attempt([install, install])).ok, false)
  assert.deepEqual(await attempt([browser]), { ok: false, calls: [browser, install] })
  assert.deepEqual(
    await attempt([], () => {
      throw new Error('moved')
    }),
    { ok: true, calls: ['npx playwright install --with-deps chromium'] }
  )
  const apt = async (fails) => {
    const calls = []
    const ok = await aptInstall(['-y', 'libegl1'], async (command, args) => {
      const call = [command, ...args].join(' ')
      calls.push(call)
      return !fails.includes(call)
    })
    return { ok, calls }
  }
  assert.deepEqual(await apt([]), { ok: true, calls: ['sudo apt-get install -y libegl1'] })
  assert.deepEqual(await apt(['sudo apt-get update']), { ok: true, calls: ['sudo apt-get install -y libegl1'] })
  assert.deepEqual(await apt(['sudo apt-get install -y libegl1', 'sudo apt-get update']), {
    ok: false,
    calls: ['sudo apt-get install -y libegl1', 'sudo apt-get update']
  })
  const workflow = readFileSync('.github/workflows/check.yml', 'utf8')
  assert.doesNotMatch(workflow, /--with-deps|apt-get update/)
  assert.equal(workflow.match(/^        run: node scripts\/ci-install-chromium\.mjs$/gm)?.length, 3)
  for (const name of ['browser-backed unit tests', 'life-survivors', 'public-build browser tests'])
    assert.match(
      workflow,
      new RegExp(
        `- name: Install Chromium for ${name}\\n(?:        if: .*\\n)?        run: node scripts/ci-install-chromium\\.mjs\\n`
      )
    )
  assert.equal(
    workflow.match(/^        run: node scripts\/ci-apt-install\.mjs -y libgl1-mesa-dri libegl1 xvfb$/gm)?.length,
    1
  )
  assert.doesNotMatch(workflow, /run: sudo apt-get/)
})
