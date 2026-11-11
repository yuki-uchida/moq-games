/**
 * Review kit for 星のハムハム: one command that lays out everything an outside reviewer needs to judge the
 * presentation (design, animation, sound effects, staging) without playing the game, and without necessarily
 * being able to look at images or listen.
 *
 * Usage: node scripts/hoshi-no-hamham-review.mjs [--only screens,staging,art,motion,audio,checks] [--no-checks]
 *                                               [--songs] [--out DIR]
 *   --only      run just these sections (default: all). Every section is independent: a failure is written into
 *               index.md and the others still run.
 *   --no-checks leave out `checks.md` (typecheck, lint, unit tests, build; they take several minutes)
 *   --songs     let the audio report also render the music (many minutes; off by default)
 *   --out       output folder (default .build/hoshi-no-hamham-review/, ignored by Git)
 *
 * Environment: PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH selects the Chromium binary.
 *
 * Output (all under the output folder):
 *   index.md            table of contents and every measured number as Markdown tables (readable without images)
 *   screens/            screenshots of every screen at 1280x720 and the main ones at 844x390 and 390x844 (touch)
 *   staging/<series>/   a frame every 150 ms of the stage starts, a boss intro, a boss defeat, a clear, a death
 *   art/                the sprite sheets (scripts/hoshi-no-hamham-art.mjs) and clips.md (every clip of every sheet)
 *   motion/             what the view adds on top of the sprites: squash/stretch, camera look-ahead, hit-stop
 *   audio/              the audio tool's report (scripts/hoshi-no-hamham-audio.mjs, no --write)
 *   checks.md           output tail and exit code of the repository checks
 *
 * Own Vite dev server on a free port, started in this process and always closed (also on failure and on Ctrl-C),
 * so no server process stays behind on Windows. Exit code 1 when any page error or console error occurred or any
 * section failed (both are listed in index.md); 0 otherwise. Failing repository checks are reported in checks.md
 * and do not change the exit code.
 *
 * Hooks used (src/main.ts): window.__hamham.{world, view, demoWorld, app, openEnding}. Beyond them the kit reads
 * members that are `private` only in TypeScript: app.screen, app.session (director claims, view freeze time and
 * camera, actors.squash), app.audio.theme/layer/duck and app.screens.typer. They are plain fields at runtime.
 */
import { spawn, spawnSync } from 'node:child_process'
import { cpSync, existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { createServer as createNetServer } from 'node:net'
import { dirname, join, relative, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { chromium } from 'playwright'
import { createServer } from 'vite'

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const gameDir = join(root, 'examples/games/hoshi-no-hamham')

// ------------------------------------------------------------------------------------------------ arguments

const args = process.argv.slice(2)
const flag = (name) => args.includes(name)
const valueOf = (name) => (args.includes(name) ? args[args.indexOf(name) + 1] : undefined)
const SECTIONS = ['screens', 'staging', 'art', 'motion', 'audio', 'checks']
const onlyArg = valueOf('--only')
const wanted = new Set(onlyArg ? onlyArg.split(',').map((s) => s.trim()) : SECTIONS)
for (const name of wanted)
  if (!SECTIONS.includes(name)) {
    console.error(`Unknown section "${name}". Sections: ${SECTIONS.join(', ')}`)
    process.exit(2)
  }
if (flag('--no-checks')) wanted.delete('checks')
const withSongs = flag('--songs')
const out = resolve(valueOf('--out') ?? join(root, '.build/hoshi-no-hamham-review'))

// -------------------------------------------------------------------------------------------------- helpers

const sleep = (ms) => new Promise((done) => setTimeout(done, ms))
const round = (n, digits = 0) => (n === null || n === undefined || Number.isNaN(n) ? '–' : Number(n.toFixed(digits)))
const fmt = (n, digits = 0) => String(round(n, digits))
const rel = (path) => relative(out, path).replaceAll('\\', '/')
const esc = (text) => String(text).replaceAll('|', '\\|').replaceAll('\n', ' ')
const md = {
  table(headers, rows) {
    if (!rows.length) return '_(no rows)_\n'
    return [
      `| ${headers.join(' | ')} |`,
      `| ${headers.map(() => '---').join(' | ')} |`,
      ...rows.map((row) => `| ${row.map((cell) => esc(cell ?? '')).join(' | ')} |`)
    ].join('\n')
  }
}
const stripAnsi = (text) => text.replace(/\u001b\[[0-9;]*[A-Za-z]/g, '')
const tail = (text, lines) => stripAnsi(text).trimEnd().split(/\r?\n/).slice(-lines).join('\n')

/** Page errors and console errors from every page; the kit exits non-zero when this is not empty. */
const problems = []
/** Section reports: { title, body (Markdown), error, seconds }. */
const reports = new Map()

function freePort() {
  return new Promise((resolvePort, reject) => {
    const probe = createNetServer()
    probe.once('error', reject)
    probe.listen(0, '127.0.0.1', () => {
      const { port } = probe.address()
      probe.close(() => resolvePort(port))
    })
  })
}

/** Runs a command to completion; resolves with its output and exit code (never rejects). */
function run(command, argv, { shell = false, timeoutMs = 20 * 60_000 } = {}) {
  return new Promise((done) => {
    const started = Date.now()
    let output = ''
    let child
    try {
      child = spawn(command, argv, { cwd: root, shell, windowsHide: true, env: process.env })
    } catch (error) {
      done({ code: -1, output: String(error), seconds: 0 })
      return
    }
    const timer = setTimeout(() => {
      output += `\n[review kit] timed out after ${timeoutMs / 1000} s, killing\n`
      if (process.platform === 'win32')
        spawn('taskkill', ['/pid', String(child.pid), '/t', '/f'], { windowsHide: true })
      else child.kill('SIGKILL')
    }, timeoutMs)
    child.stdout.on('data', (chunk) => (output += chunk))
    child.stderr.on('data', (chunk) => (output += chunk))
    child.on('error', (error) => (output += `\n${error}\n`))
    child.on('close', (code) => {
      clearTimeout(timer)
      done({ code: code ?? -1, output, seconds: (Date.now() - started) / 1000 })
    })
  })
}

// ------------------------------------------------------------------------------------------------ browser

const SAVE_KEY = 'hoshi-no-hamham-v1'
const UNLOCKED_SAVE = {
  version: 1,
  cleared: [1, 2, 3, 4, 5, 6, 7, 8, 9],
  unlocked: 10,
  best: { s1: 61.2 },
  muted: false,
  seenOpening: true,
  volume: { master: 1, music: 0.8, sfx: 1 }
}

/** Installed in every page before the game loads: a per-frame recorder of what the director and the view do. */
function installRecorder() {
  const rk = { on: false, mark: 0, log: [] }
  window.__rk = rk
  rk.start = () => {
    rk.mark = performance.now()
    rk.log = []
    rk.on = true
    return rk.mark
  }
  const tick = (t) => {
    requestAnimationFrame(tick)
    if (!rk.on) return
    const app = window.__hamham?.app
    if (!app) return
    const session = app.session
    const world = session?.world ?? null
    const director = session?.director
    const claims = director?.claims
    const view = session?.view
    const p = world?.player
    rk.log.push({
      t: t - rk.mark,
      screen: app.screen,
      wt: world ? world.time : null,
      state: world ? world.state : null,
      lock: director ? Boolean(director.inputLocked) : null,
      scale: director ? director.timeScale : null,
      cin: claims ? Boolean(claims.cinematic) : null,
      bars: claims ? Boolean(claims.bars) : null,
      cur: director?.current ?? null,
      frozen: view ? view.frozen : null,
      freeze: view ? view.freezeTime : null,
      cam: view ? view.camera.x : null,
      px: p ? p.x : null,
      pw: p ? p.w : null,
      py: p ? p.y : null,
      vx: p ? p.vx : null,
      ground: p ? p.onGround : null,
      sq: view ? view.actors.squash : null,
      clip: view ? view.actors.heroChoice.name : null
    })
  }
  requestAnimationFrame(tick)
}

let browser = null
let server = null
let baseUrl = ''

/** A page with the recorder, error listeners and (optionally) a save; `label` names it in the error list. */
async function openPage({ label, viewport, touch = false, save = null }) {
  const context = await browser.newContext({
    viewport,
    deviceScaleFactor: 1,
    hasTouch: touch,
    isMobile: touch
  })
  const page = await context.newPage()
  page.on('pageerror', (error) => problems.push(`[${label}] page error: ${error.message}`))
  page.on('console', (message) => {
    if (message.type() === 'error') problems.push(`[${label}] console error: ${message.text()}`)
  })
  page.on('requestfailed', (request) =>
    problems.push(`[${label}] request failed: ${request.url()} (${request.failure()?.errorText ?? '?'})`)
  )
  await page.addInitScript(installRecorder)
  if (save) {
    await page.addInitScript(
      ([key, value]) => {
        localStorage.setItem(key, JSON.stringify(value))
      },
      [SAVE_KEY, save]
    )
  }
  return { context, page }
}

const gotoTitle = async (page) => {
  await page.goto(baseUrl)
  await page.waitForFunction(
    () => Boolean(window.__hamham) && Boolean(document.querySelector('#title-screen:not([hidden])')),
    null,
    { timeout: 60_000 }
  )
}

const screenOf = (page) => page.evaluate(() => window.__hamham.app.screen)

/** Click or tap, as the page's input kind. */
const press = (page, touch, selector) =>
  touch ? page.locator(selector).first().tap() : page.locator(selector).first().click()

/** Completes the typewriter text on screen (the page's own `finish`). */
const finishTyping = (page) =>
  page.evaluate(() => {
    window.__hamham.app.screens.typer?.finish()
  })

/** Clicks through story pages until the screen changes; `onPage(index)` runs with the text complete. */
async function walkStory(page, touch, { fromScreen = 'story', onPage = null, markStart = false } = {}) {
  for (let index = 0; index < 40; index++) {
    if ((await screenOf(page)) !== fromScreen) return index
    await finishTyping(page)
    if (onPage) await onPage(index)
    if (markStart) await page.evaluate(() => window.__rk.start())
    await press(page, touch, '#story-next')
    await page.waitForTimeout(markStart ? 60 : 280)
  }
  throw new Error('the story never ended')
}

async function startStage(page, no, { touch = false, markStart = false } = {}) {
  await gotoTitle(page)
  await press(page, touch, '#continue')
  await page.waitForSelector('.stage-card', { timeout: 10_000 })
  await page.waitForTimeout(200)
  await press(page, touch, `.stage-card >> nth=${no - 1}`)
  await page.waitForFunction(() => window.__hamham.app.screen === 'story', null, { timeout: 10_000 })
  await walkStory(page, touch, { markStart })
  await page.waitForFunction(() => window.__hamham.app.screen === 'play', null, { timeout: 10_000 })
}

/** The opening staging of a stage has ended: no moment is playing and the input is free. */
const waitStartDone = (page, timeout = 20_000) =>
  page
    .waitForFunction(
      () => {
        const session = window.__hamham.app.session
        const director = session?.director
        return Boolean(session) && director.current === null && !director.inputLocked
      },
      null,
      { timeout, polling: 'raf' }
    )
    .catch(() => {})

const makeSafe = (page, invuln = 600) =>
  page.evaluate((seconds) => {
    const p = window.__hamham.world.player
    p.maxHp = Math.max(p.maxHp, 6)
    p.hp = p.maxHp
    p.invuln = seconds
  }, invuln)

/** Puts the hero in front of the boss and away from it by `gap` px (feet on the boss's floor). */
const nearBoss = (page, gap) =>
  page.evaluate((distance) => {
    const w = window.__hamham.world
    const b = w.boss
    if (!b) return false
    w.player.x = b.x - distance
    w.player.y = b.y + b.h - w.player.h
    w.player.vx = 0
    w.player.vy = 0
    w.player.facing = 1
    return true
  }, gap)

/**
 * Brings the running stage to its result screen: kills a fighting boss, waits for the staging, walks the hero
 * into the goal. Returns when the app left the play screen (or after `timeout` ms).
 */
async function clearStage(page, timeout = 40_000) {
  await makeSafe(page)
  await page.evaluate(() => {
    const w = window.__hamham.world
    const b = w.boss
    if (b && b.def.kind !== 'chaser' && !b.dead) {
      b.active = true
      b.invuln = 0
      b.hp = 1
      w.damageBoss(5)
    }
  })
  await page.waitForTimeout(300)
  await waitStartDone(page, 15_000)
  await page.evaluate(() => {
    const w = window.__hamham.world
    w.player.invuln = 600
    w.player.x = w.goalX - 70
    w.player.y = w.goalY + 60 - w.player.h
    w.player.vx = 0
    w.player.vy = 0
  })
  await page.keyboard.down('ArrowRight')
  try {
    await page.waitForFunction(() => window.__hamham.app.screen !== 'play', null, { timeout })
  } finally {
    await page.keyboard.up('ArrowRight')
  }
}

// ----------------------------------------------------------------------------------------------- screens

const PLAY_WORLDS = [
  [1, 'meadow'],
  [3, 'night'],
  [4, 'cave'],
  [5, 'forest'],
  [7, 'fortress'],
  [9, 'castle'],
  [10, 'star']
]

async function runScreens(dir) {
  const rows = []
  const failures = []
  mkdirSync(dir, { recursive: true })

  /** Measures the visible page: horizontal scroll, smallest text, smallest button. */
  const measure = (page) =>
    page.evaluate(() => {
      const visible = (el, style, rect) =>
        rect.width > 0 &&
        rect.height > 0 &&
        style.visibility !== 'hidden' &&
        style.display !== 'none' &&
        Number(style.opacity) > 0.01 &&
        rect.right > 0 &&
        rect.bottom > 0 &&
        rect.left < innerWidth &&
        rect.top < innerHeight
      const scrollsX =
        document.documentElement.scrollWidth > document.documentElement.clientWidth + 1 ||
        document.body.scrollWidth > innerWidth + 1
      let minFont = Infinity
      let minFontWhere = ''
      for (const el of document.body.querySelectorAll('*')) {
        if (['SCRIPT', 'STYLE', 'CANVAS'].includes(el.tagName)) continue
        const own = Array.from(el.childNodes).some((n) => n.nodeType === 3 && n.textContent.trim())
        if (!own) continue
        const style = getComputedStyle(el)
        if (!visible(el, style, el.getBoundingClientRect())) continue
        const size = parseFloat(style.fontSize)
        // font-size 0 is how icon-only buttons hide their text label
        if (size > 0 && size < minFont) {
          minFont = size
          minFontWhere = `${el.tagName.toLowerCase()}${el.id ? '#' + el.id : ''}${el.className && typeof el.className === 'string' ? '.' + el.className.trim().split(/\s+/)[0] : ''}: ${el.textContent.trim().slice(0, 14)}`
        }
      }
      let minButton = null
      for (const el of document.body.querySelectorAll(
        'button, [role="button"], a[href], input, select, #touch-controls *'
      )) {
        const style = getComputedStyle(el)
        const rect = el.getBoundingClientRect()
        if (!visible(el, style, rect)) continue
        if (el.closest('[hidden]') || el.closest('[aria-hidden="true"]')) continue
        // covered by something else (a screen on top of it): not clickable
        const top = document.elementFromPoint(rect.left + rect.width / 2, rect.top + rect.height / 2)
        if (!top || !(el.contains(top) || top.contains(el))) continue
        const side = Math.min(rect.width, rect.height)
        if (!minButton || side < minButton.side)
          minButton = {
            side,
            w: Math.round(rect.width),
            h: Math.round(rect.height),
            what: `${el.tagName.toLowerCase()}${el.id ? '#' + el.id : ''}${el.className && typeof el.className === 'string' ? '.' + el.className.trim().split(/\s+/)[0] : ''} ${el.textContent.trim().slice(0, 10)}`.trim()
          }
      }
      return {
        scrollsX,
        minFont: minFont === Infinity ? null : minFont,
        minFontWhere,
        minButton
      }
    })

  const shot = async (page, viewport, name, note = '') => {
    const file = join(dir, `${viewport.width}x${viewport.height}-${name}.png`)
    await page.screenshot({ path: file })
    const m = await measure(page)
    rows.push([
      `[${rel(file)}](${rel(file)})`,
      `${viewport.width}×${viewport.height}`,
      m.scrollsX ? '**yes**' : 'no',
      m.minFont === null ? '–' : `${fmt(m.minFont, 1)} px (${m.minFontWhere})`,
      m.minButton ? `${m.minButton.w}×${m.minButton.h} (${m.minButton.what})` : '–',
      note
    ])
  }
  /** One screenshot that cannot stop the others. */
  const step = async (name, fn) => {
    try {
      await fn()
    } catch (error) {
      failures.push([name, String(error.message ?? error).split('\n')[0]])
    }
  }

  // --- desktop: fresh save, then everything unlocked
  const desktop = { width: 1280, height: 720 }
  {
    const { context, page } = await openPage({ label: 'screens 1280x720 fresh', viewport: desktop })
    try {
      await step('title', async () => {
        await gotoTitle(page)
        await page.waitForTimeout(2000)
        await shot(page, desktop, '01-title-2s', 'fresh save, demo running')
        await page.waitForTimeout(4000)
        await shot(page, desktop, '02-title-6s', 'the demo has moved on')
      })
      await step('help', async () => {
        await page.locator('#help-open').click()
        await page.waitForTimeout(400)
        await shot(page, desktop, '03-help')
        await page.locator('#help-done').click()
        await page.waitForTimeout(250)
      })
      await step('opening story', async () => {
        await page.locator('#start').click()
        await page.waitForFunction(() => window.__hamham.app.screen === 'story', null, { timeout: 10_000 })
        await page.waitForTimeout(500)
        const pages = await walkStory(page, false, {
          onPage: async (index) => shot(page, desktop, `04-opening-page${index + 1}`, 'text complete')
        })
        rows.push([`(opening story: ${pages} pages)`, '', '', '', '', ''])
      })
      await step('select fresh', async () => {
        await page.waitForFunction(() => window.__hamham.app.screen === 'select', null, { timeout: 10_000 })
        await page.waitForTimeout(700)
        await shot(page, desktop, '05-select-fresh', 'only stage 1 open')
      })
    } finally {
      await context.close()
    }
  }
  {
    const { context, page } = await openPage({
      label: 'screens 1280x720 unlocked',
      viewport: desktop,
      save: UNLOCKED_SAVE
    })
    try {
      await step('select unlocked', async () => {
        await gotoTitle(page)
        await page.waitForTimeout(500)
        await shot(page, desktop, '06-title-continue', 'save with 9 stages cleared')
        await page.locator('#continue').click()
        await page.waitForSelector('.stage-card')
        await page.waitForTimeout(800)
        await shot(page, desktop, '07-select-all', 'everything unlocked')
      })
      await step('stage story', async () => {
        await page.locator('.stage-card').nth(0).click()
        await page.waitForFunction(() => window.__hamham.app.screen === 'story', null, { timeout: 10_000 })
        await page.waitForTimeout(400)
        await walkStory(page, false, { onPage: (index) => shot(page, desktop, `08-stage1-story-page${index + 1}`) })
      })
      for (const [no, theme] of PLAY_WORLDS) {
        await step(`play stage ${no}`, async () => {
          await startStage(page, no)
          await waitStartDone(page)
          await makeSafe(page)
          await page.keyboard.down('ArrowRight')
          await page.waitForTimeout(1000)
          await page.keyboard.up('ArrowRight')
          await shot(page, desktop, `09-play-stage${String(no).padStart(2, '0')}-${theme}`, `world ${theme}`)
        })
      }
      await step('pause', async () => {
        await startStage(page, 1)
        await waitStartDone(page)
        await page.keyboard.press('Escape')
        await page.waitForSelector('#pause-screen:not([hidden])', { timeout: 5000 })
        await page.waitForTimeout(500)
        await shot(page, desktop, '10-pause')
      })
      await step('result', async () => {
        await startStage(page, 2)
        await clearStage(page)
        await page.waitForFunction(() => window.__hamham.app.screen === 'result', null, { timeout: 5000 })
        await page.waitForTimeout(3500)
        await shot(page, desktop, '11-result', 'stage 2, tally finished')
      })
      await step('game over', async () => {
        await startStage(page, 3)
        await waitStartDone(page)
        await page.evaluate(() => {
          const w = window.__hamham.world
          w.player.hp = 1
          w.player.invuln = 0
          w.hurtPlayer(9, w.player.x - 10)
        })
        await page.waitForFunction(() => window.__hamham.app.screen === 'dead', null, { timeout: 15_000 })
        await page.waitForTimeout(1500)
        await shot(page, desktop, '12-game-over')
      })
      await step('ending', async () => {
        await gotoTitle(page)
        await page.evaluate(() => window.__hamham.openEnding())
        await page.waitForTimeout(600)
        for (let index = 0; index < 14; index++) {
          await finishTyping(page)
          const credits = await page.evaluate(() => {
            const el = document.querySelector('#ending-credits')
            return Boolean(el) && !el.hidden
          })
          if (credits) break
          await shot(page, desktop, `13-ending-page${index + 1}`)
          await page.locator('#ending-next').click()
          await page.waitForTimeout(450)
        }
        await page.waitForTimeout(3500)
        await shot(page, desktop, '14-ending-credits', 'credits scrolling, 3.5 s in')
        await page.waitForTimeout(6000)
        await shot(page, desktop, '15-ending-credits-later', 'credits, 9.5 s in')
      })
    } finally {
      await context.close()
    }
  }

  // --- touch: title, select, story, play, pause, result
  for (const viewport of [
    { width: 844, height: 390 },
    { width: 390, height: 844 }
  ]) {
    const { context, page } = await openPage({
      label: `screens ${viewport.width}x${viewport.height} touch`,
      viewport,
      touch: true,
      save: UNLOCKED_SAVE
    })
    try {
      await step(`touch ${viewport.width} title`, async () => {
        await gotoTitle(page)
        await page.waitForTimeout(2000)
        await shot(page, viewport, '01-title', 'touch')
        await page.locator('#continue').tap()
        await page.waitForSelector('.stage-card')
        await page.waitForTimeout(800)
        await shot(page, viewport, '02-select', 'touch')
      })
      await step(`touch ${viewport.width} story`, async () => {
        await page.locator('.stage-card').nth(1).tap()
        await page.waitForFunction(() => window.__hamham.app.screen === 'story', null, { timeout: 10_000 })
        await page.waitForTimeout(400)
        await finishTyping(page)
        await shot(page, viewport, '03-story', 'touch, stage 2, page 1')
        await walkStory(page, true)
        await page.waitForFunction(() => window.__hamham.app.screen === 'play', null, { timeout: 10_000 })
      })
      await step(`touch ${viewport.width} play`, async () => {
        await waitStartDone(page)
        await page.touchscreen.tap(viewport.width / 2, viewport.height / 3)
        await makeSafe(page)
        await page.waitForTimeout(700)
        await shot(page, viewport, '04-play', 'touch controls visible after a tap')
      })
      await step(`touch ${viewport.width} pause`, async () => {
        await page.locator('#pause').tap()
        await page.waitForSelector('#pause-screen:not([hidden])', { timeout: 5000 })
        await page.waitForTimeout(500)
        await shot(page, viewport, '05-pause', 'touch')
        await page.locator('#pause-resume').tap()
        await page.waitForTimeout(300)
      })
      await step(`touch ${viewport.width} result`, async () => {
        await clearStage(page)
        await page.waitForFunction(() => window.__hamham.app.screen === 'result', null, { timeout: 5000 })
        await page.waitForTimeout(3500)
        await shot(page, viewport, '06-result', 'touch, stage 2, tally finished')
      })
    } finally {
      await context.close()
    }
  }

  const body = [
    'Text size is the smallest computed `font-size` of any visible DOM text; it does not see text drawn on the',
    'canvas. The button size is the smallest visible button-like element (buttons, links, inputs, touch pad).',
    '',
    md.table(['file', 'viewport', 'scrolls sideways', 'smallest text', 'smallest button (w×h px)', 'note'], rows),
    '',
    failures.length ? `Steps that failed:\n\n${md.table(['step', 'why'], failures)}` : 'Every step ran.'
  ].join('\n')
  if (failures.length) throw Object.assign(new Error(`${failures.length} step(s) failed`), { body })
  return body
}

// ------------------------------------------------------------------------------------------------ staging

/** Takes frames every 150 ms until `done(probe)` (plus `tailFrames` more) or `maxMs`; returns {frames}. */
async function frameSeries(page, dir, { maxMs, done, tailFrames = 3 }) {
  mkdirSync(dir, { recursive: true })
  const frames = []
  const t0 = Date.now()
  let seenBusy = false
  let finishedAt = -1
  for (let k = 0; ; k++) {
    const wait = k * 150 - (Date.now() - t0)
    if (wait > 0) await sleep(wait)
    const at = await page.evaluate(() => performance.now() - window.__rk.mark)
    const name = `f${String(k).padStart(2, '0')}-${String(Math.round(at)).padStart(5, '0')}ms.jpg`
    await page.screenshot({ path: join(dir, name), type: 'jpeg', quality: 85 })
    frames.push({ name, at })
    const probe = await page.evaluate(() => {
      const log = window.__rk.log
      const last = log[log.length - 1]
      let busyAt = -1
      for (let i = log.length - 1; i >= 0; i--)
        if (log[i].cur !== null || log[i].lock) {
          busyAt = log[i].t
          break
        }
      return {
        screen: last?.screen ?? null,
        cur: last?.cur ?? null,
        lock: last?.lock ?? null,
        idleMs: last ? last.t - busyAt : 0,
        now: last?.t ?? 0,
        hadBusy: busyAt >= 0
      }
    })
    if (probe.cur !== null || probe.lock) seenBusy = true
    const finished = done({ ...probe, seenBusy })
    if (finished && finishedAt < 0) finishedAt = k
    if (finishedAt >= 0 && k >= finishedAt + tailFrames) break
    if (Date.now() - t0 > maxMs) break
  }
  return frames
}

/** What the recorder saw between the mark and `stopAt` (ms, default everything). */
function analyse(log) {
  const dtOf = (i) => (i === 0 ? 0 : log[i].t - log[i - 1].t)
  const sum = (pick) => log.reduce((total, row, i) => total + (pick(row) ? dtOf(i) : 0), 0)
  // The simulation stood still: runs of at least three samples with the same world.time.
  let heldMs = 0
  let i = 0
  while (i < log.length) {
    let j = i
    while (j + 1 < log.length && log[j + 1].wt !== null && log[j + 1].wt === log[i].wt) j++
    if (log[i].wt !== null && j - i >= 2) heldMs += (log[j + 1] ?? log[j]).t - log[i].t
    i = j + 1
  }
  const lockRows = log.filter((row) => row.lock)
  const cinRows = log.filter((row) => row.cin)
  const barsRows = log.filter((row) => row.bars)
  const resumeIndex = (() => {
    let busy = false
    for (let k = 0; k < log.length; k++) {
      if (log[k].cur !== null || log[k].lock) busy = true
      else if (busy) return k
    }
    return -1
  })()
  // Samples before the first one on the play screen belong to the screen the click came from.
  const firstPlay = log.findIndex((row) => row.screen === 'play')
  const leftPlay = firstPlay < 0 ? -1 : log.findIndex((row, k) => k > firstPlay && row.screen !== 'play')
  const stateChange = log.findIndex((row) => row.state && row.state !== 'play')
  const moments = []
  for (const row of log)
    if (row.cur && !moments.some((m) => m.name === row.cur)) moments.push({ name: row.cur, at: row.t })
  return {
    heldMs,
    scaleZeroMs: sum((row) => row.scale === 0),
    slowMs: sum((row) => row.scale !== null && row.scale > 0 && row.scale < 1),
    lockMs: sum((row) => row.lock),
    lockFrom: lockRows[0]?.t ?? null,
    lockTo: lockRows.length ? lockRows[lockRows.length - 1].t : null,
    cinFrom: cinRows[0]?.t ?? null,
    cinTo: cinRows.length ? cinRows[cinRows.length - 1].t : null,
    cinMs: sum((row) => row.cin),
    barsMs: sum((row) => row.bars),
    resumeAt: resumeIndex >= 0 ? log[resumeIndex].t : null,
    nextScreenAt: leftPlay >= 0 ? log[leftPlay].t : null,
    nextScreen: leftPlay >= 0 ? log[leftPlay].screen : null,
    stateChangeAt: stateChange >= 0 ? log[stateChange].t : null,
    lastAt: log.length ? log[log.length - 1].t : 0,
    moments
  }
}

async function runStaging(dir) {
  mkdirSync(dir, { recursive: true })
  const series = []
  const failures = []
  const desktop = { width: 1280, height: 720 }
  const take = async (name, page, options) => {
    try {
      const frames = await frameSeries(page, join(dir, name), options)
      const log = await page.evaluate(() => window.__rk.log)
      series.push({ name, frames, a: analyse(log) })
    } catch (error) {
      failures.push([name, String(error.message ?? error).split('\n')[0]])
    }
  }
  const moment = ({ seenBusy, idleMs, screen }) => screen !== 'play' || (seenBusy && idleMs > 450)

  // stage 1 start
  {
    const { context, page } = await openPage({ label: 'staging stage 1', viewport: desktop, save: UNLOCKED_SAVE })
    try {
      await startStage(page, 1, { markStart: true })
      await take('s1-start', page, { maxMs: 9000, done: moment })
    } catch (error) {
      failures.push(['s1-start', String(error.message ?? error).split('\n')[0]])
    } finally {
      await context.close()
    }
  }
  // stage 5: start, boss intro, boss defeat, clear
  {
    const { context, page } = await openPage({ label: 'staging stage 5', viewport: desktop, save: UNLOCKED_SAVE })
    try {
      await startStage(page, 5, { markStart: true })
      await take('s5-start', page, { maxMs: 9000, done: moment })
      await waitStartDone(page)
      await makeSafe(page, 40)
      await page.evaluate(() => window.__rk.start())
      await nearBoss(page, 260)
      await page.keyboard.down('ArrowRight')
      await take('s5-boss-intro', page, { maxMs: 12_000, done: moment })
      await page.keyboard.up('ArrowRight')
      await waitStartDone(page, 10_000)
      // Defeat: the boss at 1 health, bite until he falls.
      await makeSafe(page, 60)
      let fell = false
      for (let attempt = 0; attempt < 16 && !fell; attempt++) {
        await page.evaluate(() => {
          const w = window.__hamham.world
          const b = w.boss
          b.hp = 1
          w.player.x = b.x - w.player.w - 6
          w.player.y = b.y + b.h - w.player.h
          w.player.facing = 1
          w.player.invuln = 60
          window.__rk.start()
        })
        await page.keyboard.press('KeyZ')
        await page.waitForTimeout(160)
        fell = await page.evaluate(() => Boolean(window.__hamham.world.boss?.dead))
      }
      if (!fell) failures.push(['s5-boss-defeat', 'the boss did not fall after 16 bites'])
      else await take('s5-boss-defeat', page, { maxMs: 12_000, done: moment })
      // Clear: wait for the goal to open and its reveal, then walk into the goal.
      await waitStartDone(page, 15_000)
      await page.waitForTimeout(500)
      await page.evaluate(() => {
        const w = window.__hamham.world
        w.player.invuln = 600
        w.player.x = w.goalX - 80
        w.player.y = w.goalY + 60 - w.player.h
        w.player.vx = 0
        w.player.vy = 0
        window.__rk.start()
      })
      await page.keyboard.down('ArrowRight')
      await take('s5-clear', page, { maxMs: 16_000, done: ({ screen }) => screen !== 'play', tailFrames: 6 })
      await page.keyboard.up('ArrowRight')
    } catch (error) {
      failures.push(['stage 5 flow', String(error.message ?? error).split('\n')[0]])
    } finally {
      await context.close()
    }
  }
  // death (stage 3)
  {
    const { context, page } = await openPage({ label: 'staging stage 3', viewport: desktop, save: UNLOCKED_SAVE })
    try {
      await startStage(page, 3)
      await waitStartDone(page)
      await page.waitForTimeout(600)
      await page.evaluate(() => {
        const w = window.__hamham.world
        w.player.hp = 1
        w.player.invuln = 0
        window.__rk.start()
        w.hurtPlayer(9, w.player.x - 10)
      })
      await take('s3-death', page, { maxMs: 14_000, done: ({ screen }) => screen !== 'play', tailFrames: 5 })
    } catch (error) {
      failures.push(['s3-death', String(error.message ?? error).split('\n')[0]])
    } finally {
      await context.close()
    }
  }

  const s = (ms) => (ms === null ? '–' : `${fmt(ms / 1000, 2)} s`)
  const rows = series.map(({ name, frames, a }) => [
    `[${name}/](${rel(join(dir, name))}) (${frames.length} frames)`,
    s(a.heldMs),
    s(a.scaleZeroMs),
    s(a.slowMs),
    s(a.lockMs) + (a.lockFrom === null ? '' : ` (${s(a.lockFrom)}→${s(a.lockTo)})`),
    a.cinFrom === null ? 'never' : `from ${s(a.cinFrom)} to ${s(a.cinTo)} (${s(a.cinMs)})`,
    s(a.barsMs),
    a.nextScreenAt !== null
      ? `${s(a.nextScreenAt)} → ${a.nextScreen} screen` +
        (a.stateChangeAt !== null ? ` (world ended at ${s(a.stateChangeAt)})` : '')
      : a.resumeAt !== null
        ? `${s(a.resumeAt)} → play resumed`
        : `not within ${s(a.lastAt)}`,
    a.moments.map((m) => `${m.name}@${s(m.at)}`).join(', ') || '–'
  ])
  const body = [
    'Times are measured by a per-frame recorder in the page, from the moment the series started (the click that',
    'began the stage, the teleport, the killing bite or the hit). The frame files carry their own time in the name.',
    'Frames are JPEG, one every 150 ms (screenshots take time, so the spacing drifts a little; the name has the',
    'real time). "sim held" = world.time did not advance for at least three frames in a row; "scale 0" = the',
    'director claimed time scale 0; "slow" = time scale between 0 and 1; "locked" = the simulation got empty input.',
    '',
    md.table(
      [
        'series',
        'sim held (world.time static)',
        'scale 0 claim',
        'slow motion',
        'input locked (from→to)',
        'HUD cinematic',
        'letterbox bars',
        'total until play resumed / next screen',
        'moments (director.current)'
      ],
      rows
    ),
    '',
    failures.length ? `Series that failed:\n\n${md.table(['series', 'why'], failures)}` : 'Every series ran.'
  ].join('\n')
  if (failures.length) throw Object.assign(new Error(`${failures.length} series failed`), { body })
  return body
}

// ---------------------------------------------------------------------------------------------------- art

/** Loads a TypeScript module of the game through the dev server's SSR loader. */
const load = (path) => server.ssrLoadModule(`/${path}`)

async function runArt(dir) {
  mkdirSync(dir, { recursive: true })
  const exporter = await run(process.execPath, [
    join(root, 'scripts/hoshi-no-hamham-art.mjs'),
    '--scale',
    '3',
    '--out',
    dir
  ])
  const art = await load('src/art/index.ts')
  const sheetModule = await load('src/art/sheet.ts')
  const { duration } = sheetModule
  const lines = []
  const summary = []
  for (const id of art.sheetIds().sort()) {
    const sheet = art.sheet(id)
    const standIns = art.missingAnims(id)
    let clips = 0
    let frames = 0
    let maxColours = 0
    lines.push(`## ${id}`, '')
    const rows = []
    for (const [name, anim] of Object.entries(sheet)) {
      const colours = anim.frames.map((frame) => frame.colors().size)
      clips++
      frames += anim.frames.length
      maxColours = Math.max(maxColours, ...colours)
      rows.push([
        name,
        anim.frames.length,
        fmt(anim.fps, 1),
        fmt(duration(anim), 3),
        anim.loop ? 'loop' : 'once',
        `${Math.min(...colours)}–${Math.max(...colours)}`,
        colours.join(' '),
        standIns.includes(name) ? 'stand-in' : ''
      ])
    }
    lines.push(
      md.table(
        ['clip', 'frames', 'fps', 'duration (s)', 'loop', 'colours/frame (min–max)', 'colours per frame', 'art'],
        rows
      ),
      ''
    )
    summary.push([id, clips, frames, maxColours, standIns.length])
  }
  writeFileSync(join(dir, 'clips.md'), `# Every clip of every sprite sheet\n\n${lines.join('\n')}\n`)

  // Hero and the stage 5 boss in full, inline.
  const stages = await load('src/game/stages.ts')
  const bossArt = stages.STAGES.find((stage) => stage.no === 5).boss.art
  const inline = []
  for (const id of ['hero', bossArt]) {
    const sheet = art.sheet(id)
    const standIns = art.missingAnims(id)
    inline.push(`### ${id}`, '')
    inline.push(
      md.table(
        ['clip', 'frames', 'fps', 'duration (s)', 'loop', 'colours per frame', 'art'],
        Object.entries(sheet).map(([name, anim]) => [
          name,
          anim.frames.length,
          fmt(anim.fps, 1),
          fmt(duration(anim), 3),
          anim.loop ? 'loop' : 'once',
          anim.frames.map((frame) => frame.colors().size).join(' '),
          standIns.includes(name) ? 'stand-in' : ''
        ])
      ),
      ''
    )
  }
  const pngs = existsSync(dir) ? 'see the PNG sheets in the folder' : ''
  const body = [
    `Exporter: \`node scripts/hoshi-no-hamham-art.mjs --scale 3 --out art\` exited ${exporter.code} in ${fmt(exporter.seconds, 1)} s ` +
      `(${pngs}; \`art/<sheet>.png\` is a labelled contact sheet with one row per clip, \`art/<sheet>.txt\` its row index, ` +
      '`art/pending.txt` lists stand-in art).',
    '',
    `Every clip of every sheet (frames, fps, duration, loop, colours per frame): [art/clips.md](${rel(join(dir, 'clips.md'))}).`,
    'Colour counts are distinct palette entries per frame (transparent excluded), from `sheet(id)` in `src/art/index.ts`.',
    '',
    md.table(['sheet', 'clips', 'frames', 'most colours in one frame', 'stand-in clips'], summary),
    '',
    '### Hero and the stage 5 boss in full',
    '',
    ...inline,
    exporter.code === 0 ? '' : `Exporter output tail:\n\n\`\`\`\n${tail(exporter.output, 30)}\n\`\`\``
  ].join('\n')
  if (exporter.code !== 0) throw Object.assign(new Error(`the art exporter exited ${exporter.code}`), { body })
  return body
}

// -------------------------------------------------------------------------------------------------- motion

/** Squash/stretch factors, as in src/view/actors.ts (`squashScale`). */
const MAX_SQUASH = 0.18
const squashScale = (s) => {
  const c = Math.max(-MAX_SQUASH, Math.min(MAX_SQUASH, s))
  return { sx: 1 / (1 + c), sy: 1 + c }
}

async function runMotion(dir) {
  mkdirSync(dir, { recursive: true })
  const desktop = { width: 1280, height: 720 }
  const sections = []
  const failures = []

  // Strips already exist in the art folder; copy the hero's and one boss's next to the numbers.
  const artDir = join(out, 'art')
  const stages = await load('src/game/stages.ts')
  const bossArt = stages.STAGES.find((stage) => stage.no === 5).boss.art
  const strips = []
  for (const id of ['hero', bossArt]) {
    const from = join(artDir, `${id}.png`)
    if (existsSync(from)) {
      cpSync(from, join(dir, `${id}-contact-strips.png`))
      strips.push(`[${id}-contact-strips.png](${rel(join(dir, `${id}-contact-strips.png`))})`)
    }
  }

  // --- camera look-ahead and squash/stretch (stage 2: open meadow)
  {
    const { context, page } = await openPage({ label: 'motion stage 2', viewport: desktop, save: UNLOCKED_SAVE })
    try {
      await startStage(page, 2)
      await waitStartDone(page)
      await makeSafe(page)
      await page.waitForTimeout(500)
      // run right, then left
      await page.evaluate(() => window.__rk.start())
      await page.keyboard.down('ArrowRight')
      await page.waitForTimeout(4200)
      await page.keyboard.up('ArrowRight')
      const right = await page.evaluate(() => ({ log: window.__rk.log, maxX: window.__hamham.world.w * 64 - 640 }))
      await page.evaluate(() => window.__rk.start())
      await page.keyboard.down('ArrowLeft')
      await page.waitForTimeout(2600)
      await page.keyboard.up('ArrowLeft')
      const left = await page.evaluate(() => ({ log: window.__rk.log, maxX: window.__hamham.world.w * 64 - 640 }))
      const lead = ({ log, maxX }, dir) => {
        const rows = log.filter(
          (r) => r.cam !== null && r.cam > 2 && r.cam < maxX - 2 && Math.sign(r.vx) === dir && Math.abs(r.vx) > 30
        )
        if (!rows.length) return null
        const offsets = rows.map((r) => ({ t: r.t, d: r.cam + 320 - (r.px + r.pw / 2) }))
        const steady = offsets.slice(-Math.max(3, Math.floor(offsets.length / 4))).map((o) => o.d)
        const mean = steady.reduce((a, b) => a + b, 0) / steady.length
        const peak = offsets.reduce((m, o) => (Math.abs(o.d) > Math.abs(m) ? o.d : m), 0)
        const first = offsets[0]
        // From the moment the hero starts to move (the camera may still be clamped then) to 90 % of the largest lead.
        const runStart = log.find((r) => Math.sign(r.vx) === dir && Math.abs(r.vx) > 30)
        const reach = offsets.find((o) => Math.abs(o.d) >= Math.abs(peak) * 0.9)
        return { mean, peak, samples: rows.length, riseMs: reach && runStart ? reach.t - runStart.t : null, first }
      }
      const r = lead(right, 1)
      const l = lead(left, -1)
      sections.push(
        '### Camera look-ahead while running',
        '',
        "Distance in world px from the hero's centre to the view centre (positive = the view leans right), read from " +
          '`view.camera.x` every frame while the hero runs and the camera is not clamped to the map edge. The design ' +
          'constant is `LOOK_AHEAD` in `src/view/camera.ts`.',
        '',
        md.table(
          [
            'run',
            'mean lead over the last quarter (px)',
            'largest lead (px)',
            'samples',
            'time from start of running to 90 % of the largest lead (s)'
          ],
          [
            [
              'right',
              r ? fmt(r.mean, 1) : 'n/a',
              r ? fmt(r.peak, 1) : 'n/a',
              r?.samples ?? 0,
              r ? fmt((r.riseMs ?? 0) / 1000, 2) : 'n/a'
            ],
            [
              'left',
              l ? fmt(l.mean, 1) : 'n/a',
              l ? fmt(l.peak, 1) : 'n/a',
              l?.samples ?? 0,
              l ? fmt((l.riseMs ?? 0) / 1000, 2) : 'n/a'
            ]
          ]
        ),
        ''
      )
      // jump + landing, then a long fall
      const jump = async () => {
        await page.waitForTimeout(500)
        await page.evaluate(() => window.__rk.start())
        await page.keyboard.press('Space')
        await page.waitForTimeout(1300)
        return page.evaluate(() => window.__rk.log)
      }
      const jumpLog = await jump()
      await page.waitForTimeout(400)
      await page.evaluate(() => {
        const p = window.__hamham.world.player
        p.y -= 420
        p.vy = 0
        window.__rk.start()
      })
      await page.waitForTimeout(1300)
      const fallLog = await page.evaluate(() => window.__rk.log)
      const squashRow = (name, log) => {
        const values = log.map((x) => x.sq).filter((v) => v !== null)
        const stretch = Math.max(0, ...values)
        const squash = Math.min(0, ...values)
        const at = (v) => log.find((x) => x.sq === v)
        const a = squashScale(stretch)
        const b = squashScale(squash)
        return [
          name,
          fmt(stretch, 3),
          `${fmt((a.sy - 1) * 100, 1)} % taller, ${fmt((1 - a.sx) * 100, 1)} % narrower`,
          at(stretch) ? s(at(stretch).t) : '–',
          fmt(squash, 3),
          `${fmt((1 - b.sy) * 100, 1)} % flatter, ${fmt((b.sx - 1) * 100, 1)} % wider`,
          at(squash) ? s(at(squash).t) : '–',
          [...new Set(log.map((x) => x.clip))].join(' → ')
        ]
      }
      const s = (ms) => `${fmt(ms / 1000, 2)} s`
      sections.push(
        '### Hero squash and stretch',
        '',
        'Read from `view.actors.squash` (a TypeScript-private field, plain at runtime) every frame; the factors are ' +
          `\`squashScale\` in \`src/view/actors.ts\` (limit ±${MAX_SQUASH}, volume preserving). The drawn sprite's bounding box was ` +
          'not measured separately: the view applies exactly these factors to the clip frame.',
        '',
        md.table(
          ['test', 'peak stretch value', 'stretch', 'at', 'peak squash value', 'squash', 'at', 'hero clips seen'],
          [squashRow('jump and landing', jumpLog), squashRow('420 px fall (hard landing)', fallLog)]
        ),
        ''
      )
    } catch (error) {
      failures.push(['camera / squash', String(error.message ?? error).split('\n')[0]])
    } finally {
      await context.close()
    }
  }

  // --- hit-stop after a bite that connects
  {
    const hitRows = []
    for (const no of [1, 2, 3, 4, 7]) {
      if (hitRows.length >= 2 && hitRows.some((r) => r[0].startsWith('tough'))) break
      const { context, page } = await openPage({
        label: `motion hit-stop stage ${no}`,
        viewport: desktop,
        save: UNLOCKED_SAVE
      })
      try {
        await startStage(page, no)
        await waitStartDone(page)
        await makeSafe(page)
        const kinds = await page.evaluate(() => [...new Set(window.__hamham.world.enemies.map((e) => e.kind))])
        for (const kind of kinds) {
          if (hitRows.some((r) => r[0].startsWith(kind))) continue
          for (let attempt = 0; attempt < 3; attempt++) {
            const probe = await page.evaluate(
              ([wanted, nth]) => {
                const w = window.__hamham.world
                const list = w.enemies.filter((e) => e.kind === wanted && !e.dead)
                const e = list[nth]
                if (!e) return null
                const p = w.player
                p.x = e.x - p.w - 2
                p.y = e.y + e.h - p.h
                p.vx = 0
                p.vy = 0
                p.facing = 1
                p.invuln = 60
                window.__hamham.world.__before = { hp: e.hp, id: e.id }
                window.__rk.start()
                return { id: e.id, hp: e.hp }
              },
              [kind, attempt]
            )
            if (!probe) break
            await page.keyboard.press('KeyZ')
            await page.waitForTimeout(650)
            const result = await page.evaluate(() => {
              const w = window.__hamham.world
              const e = w.enemies.find((x) => x.id === w.__before.id)
              return {
                log: window.__rk.log,
                hit: !e || e.dead || e.hp < w.__before.hp,
                killed: !e || e.dead,
                maxHp: e?.maxHp ?? null
              }
            })
            const frozen = result.log.filter((x) => x.frozen)
            if (!result.hit || !frozen.length) continue
            const first = result.log.findIndex((x) => x.frozen)
            let last = first
            while (last + 1 < result.log.length && result.log[last + 1].frozen) last++
            const end = result.log[last + 1] ?? result.log[last]
            const still = (() => {
              let n = 0
              for (let k = first; k < result.log.length - 1 && result.log[k + 1].wt === result.log[first].wt; k++) n++
              return n + 1
            })()
            const peak = Math.max(...result.log.map((x) => x.freeze ?? 0))
            hitRows.push([
              `${kind}, stage ${no}, ${result.killed ? 'bite kills' : 'bite hurts'}`,
              `${fmt(peak * 1000)} ms`,
              `${fmt(end.t - result.log[first].t)} ms`,
              last - first + 1,
              still,
              [...new Set(result.log.map((x) => x.cur).filter(Boolean))].join(', ') || '–'
            ])
            break
          }
        }
      } catch (error) {
        failures.push([`hit-stop stage ${no}`, String(error.message ?? error).split('\n')[0]])
      } finally {
        await context.close()
      }
    }
    sections.push(
      '### Hit-stop after a bite that connects',
      '',
      'The hero was put next to an enemy and bit once; the recorder watched `view.frozen` and `world.time` every frame. ' +
        '"freeze time left" is `view.freezeTime` when the recorder first saw it, one frame into the stop (the design values, 0.04 s for a bite that connects, are in `src/view/fx-map.ts`); ' +
        '"observed" is the wall-clock time the view stayed frozen; frames are display frames (about 16.7 ms each).',
      '',
      hitRows.length
        ? md.table(
            [
              'enemy',
              'freeze time left when first seen',
              'observed frozen',
              'frozen frames',
              'frames world.time stood still',
              'director moments in the window'
            ],
            hitRows
          )
        : '_No bite connected in the stages tried._',
      ''
    )
  }

  const body = [
    strips.length
      ? `Contact strips of every clip (from the art export): ${strips.join(', ')}.`
      : 'No contact strips copied (the art section did not run in this kit run).',
    '',
    ...sections,
    failures.length ? `Measurements that failed:\n\n${md.table(['measurement', 'why'], failures)}` : ''
  ].join('\n')
  if (failures.length) throw Object.assign(new Error(`${failures.length} measurement(s) failed`), { body })
  return body
}

// --------------------------------------------------------------------------------------------------- audio

const EVENT_BASE = {
  x: 320,
  y: 200,
  tx: 5,
  ty: 5,
  dir: 1,
  speed: 400,
  hit: true,
  enter: true,
  cause: 'enemy',
  kind: 'fruit',
  count: 1,
  primary: true,
  state: 'windup',
  attack: 'charge',
  weak: false,
  phase: 1
}
const EVENT_VARIANTS = {
  land: [{ speed: 200 }, { speed: 400 }, { speed: 700 }],
  bite: [{ hit: false }, { hit: true }],
  splash: [
    { enter: true, speed: 200 },
    { enter: false, speed: 600 }
  ],
  hurt: [{ cause: 'enemy' }, { cause: 'bee' }],
  pickup: [{ kind: 'fruit' }, { kind: 'star' }, { kind: 'twig', count: 1 }, { kind: 'twig', count: 5 }],
  dig: [{ primary: true }, { primary: false }],
  'boss-state': [{ state: 'windup' }, { state: 'charge' }],
  'boss-attack': [{ attack: 'charge' }, { attack: 'dive' }, { attack: 'leap' }, { attack: 'cast' }],
  'boss-hit': [{ weak: false }, { weak: true }]
}

const describeCalls = (calls) =>
  calls.length
    ? calls
        .map((c) => {
          const extra = [
            c.volume !== undefined && c.volume !== 1 ? `vol ${fmt(c.volume, 2)}` : '',
            c.pitch !== undefined ? `pitch ${fmt(c.pitch, 2)}` : '',
            c.delay ? `+${fmt(c.delay * 1000)} ms` : ''
          ]
            .filter(Boolean)
            .join(', ')
          return `\`${c.name}\`${extra ? ` (${extra})` : ''}`
        })
        .join(' then ')
    : '_none_'

async function runAudio(dir) {
  mkdirSync(dir, { recursive: true })
  const tool = await run(
    process.execPath,
    [join(root, 'scripts/hoshi-no-hamham-audio.mjs'), ...(withSongs ? ['--songs'] : [])],
    {
      timeoutMs: withSongs ? 60 * 60_000 : 15 * 60_000
    }
  )
  const toolDir = join(root, '.build/hoshi-no-hamham-audio')
  if (existsSync(join(toolDir, 'report.md'))) cpSync(join(toolDir, 'report.md'), join(dir, 'report.md'))
  if (existsSync(join(toolDir, 'sfx'))) cpSync(join(toolDir, 'sfx'), join(dir, 'sfx'), { recursive: true })
  if (withSongs && existsSync(join(toolDir, 'music')))
    cpSync(join(toolDir, 'music'), join(dir, 'music'), { recursive: true })

  const soundMap = await load('src/view/sound-map.ts')
  const api = await load('src/audio/api.ts')
  const eventRows = []
  const used = new Set(soundMap.STATE_SFX)
  for (const type of Object.keys(soundMap.SOUND_MAP)) {
    const variants = EVENT_VARIANTS[type] ?? [{}]
    for (const variant of variants) {
      const event = { type, ...EVENT_BASE, ...variant }
      const calls = soundMap.SOUND_MAP[type](event)
      for (const call of calls) used.add(call.name)
      const label = Object.keys(variant).length
        ? Object.entries(variant)
            .map(([k, v]) => `${k}=${v}`)
            .join(', ')
        : ''
      eventRows.push([`\`${type}\``, label || '–', describeCalls(calls)])
    }
  }
  const cueRows = []
  for (const [cue, calls] of Object.entries(soundMap.CUE_MAP)) {
    for (const call of calls) used.add(call.name)
    cueRows.push([`\`${cue}\``, describeCalls(calls)])
  }
  const unused = api.SFX.filter((name) => !used.has(name))

  // Music: drive the game and read what the audio layer was asked to play.
  const musicRows = []
  const failures = []
  const desktop = { width: 1280, height: 720 }
  const readMusic = (page) =>
    page.evaluate(() => {
      const a = window.__hamham.app.audio
      return { theme: a.theme, layer: a.layer, duck: a.duck }
    })
  const row = async (page, where, note = '') => {
    const m = await readMusic(page)
    musicRows.push([where, `\`${m.theme}\``, m.layer, fmt(m.duck, 1), note])
  }
  const attempt = async (name, fn) => {
    try {
      await fn()
    } catch (error) {
      failures.push([name, String(error.message ?? error).split('\n')[0]])
    }
  }
  {
    const { context, page } = await openPage({ label: 'audio music tour', viewport: desktop })
    try {
      await attempt('screens (fresh)', async () => {
        await gotoTitle(page)
        await page.waitForTimeout(400)
        await row(page, 'title screen')
        await page.locator('#help-open').click()
        await page.waitForTimeout(300)
        await row(page, 'help (over the title)')
        await page.locator('#help-done').click()
        await page.locator('#start').click()
        await page.waitForFunction(() => window.__hamham.app.screen === 'story', null, { timeout: 10_000 })
        await page.waitForTimeout(300)
        await row(page, 'opening story')
        await walkStory(page, false)
        await page.waitForTimeout(500)
        await row(page, 'stage select')
      })
    } finally {
      await context.close()
    }
  }
  {
    const { context, page } = await openPage({ label: 'audio music stages', viewport: desktop, save: UNLOCKED_SAVE })
    try {
      for (let no = 1; no <= 10; no++) {
        await attempt(`stage ${no}`, async () => {
          await startStage(page, no)
          await row(page, `stage ${no}: first frame`, 'staging running')
          await waitStartDone(page)
          await makeSafe(page, 900)
          await page.waitForTimeout(300)
          const kind = await page.evaluate(() => {
            const w = window.__hamham.world
            return `${w.theme} world, boss ${w.boss?.def.kind ?? 'none'}`
          })
          await row(page, `stage ${no}: playing`, kind)
          await page.evaluate(() => {
            const w = window.__hamham.world
            w.player.hp = 2
          })
          await page.waitForTimeout(300)
          await row(page, `stage ${no}: hero at 2 hearts`)
          await page.evaluate(() => {
            const w = window.__hamham.world
            w.player.hp = w.player.maxHp
          })
          if (no === 2 || no === 4 || no === 8) return
          const hasBoss = await nearBoss(page, 230)
          if (!hasBoss) return
          await page.keyboard.down('ArrowRight')
          await page
            .waitForFunction(
              () => window.__hamham.world.boss?.active && window.__hamham.app.session.director.current === null,
              null,
              {
                timeout: 9000,
                polling: 'raf'
              }
            )
            .catch(() => {})
          await page.keyboard.up('ArrowRight')
          await page.waitForTimeout(300)
          await row(page, `stage ${no}: boss fight`, 'boss awake')
          await page.evaluate(() => {
            const b = window.__hamham.world.boss
            if (b) b.hp = Math.max(1, Math.floor(b.maxHp * 0.2))
          })
          await page.waitForTimeout(400)
          await row(page, `stage ${no}: boss at 20 % health`)
        })
      }
      await attempt('pause', async () => {
        await startStage(page, 1)
        await waitStartDone(page)
        await page.keyboard.press('Escape')
        await page.waitForTimeout(400)
        await row(page, 'stage 1: paused', 'duck 1 = ducked hard')
      })
      await attempt('result', async () => {
        await startStage(page, 2)
        await clearStage(page)
        await page.waitForTimeout(600)
        await row(page, 'result screen')
      })
      await attempt('game over', async () => {
        await startStage(page, 3)
        await waitStartDone(page)
        await page.evaluate(() => {
          const w = window.__hamham.world
          w.player.hp = 1
          w.player.invuln = 0
          w.hurtPlayer(9, w.player.x - 10)
        })
        await page.waitForFunction(() => window.__hamham.app.screen === 'dead', null, { timeout: 15_000 })
        await page.waitForTimeout(300)
        await row(page, 'game-over screen')
      })
      await attempt('ending', async () => {
        await gotoTitle(page)
        await page.evaluate(() => window.__hamham.openEnding())
        await page.waitForTimeout(500)
        await row(page, 'ending and credits')
      })
    } finally {
      await context.close()
    }
  }

  const body = [
    `Audio tool: \`node scripts/hoshi-no-hamham-audio.mjs${withSongs ? ' --songs' : ''}\` exited ${tool.code} in ${fmt(tool.seconds, 1)} s` +
      (withSongs ? '.' : ' (songs skipped; run the kit with `--songs` to render them, it takes many minutes).') +
      ` Its report (loudness, length, spectrum and similarity of every effect, with its limits) is [audio/report.md](${rel(join(dir, 'report.md'))}); the rendered WAVs are in \`audio/sfx/\`.`,
    '',
    '### Which effect each simulation event plays',
    '',
    'From `SOUND_MAP` in `src/view/sound-map.ts`, called with sample events (base values: speed 400, hit, enter, primary; ' +
      'the variants column lists what was changed). Pan and distance attenuation are applied later by `callsFor`.',
    '',
    md.table(['event', 'sample', 'plays'], eventRows),
    '',
    '### Which effect each cue plays',
    '',
    'From `CUE_MAP` (staging and interface cues, `src/view/cues.ts`).',
    '',
    md.table(['cue', 'plays'], cueRows),
    '',
    `Sounds that follow the hero's or the world's state instead (\`STATE_SFX\`): ${soundMap.STATE_SFX.map((n) => `\`${n}\``).join(', ')}; ` +
      'sustained loops: water, bees, wind.',
    '',
    unused.length
      ? `Effects defined in \`src/audio/api.ts\` that none of the sample events, cues or state sounds above reaches: ${unused.map((n) => `\`${n}\``).join(', ')}.`
      : 'Every effect defined in `src/audio/api.ts` is reached by the events, cues and state sounds above.',
    '',
    '### Which music plays where',
    '',
    'Read from the running game: the theme and layer the app last asked the audio layer for (`app.audio.theme` / `layer`) ' +
      'and the duck amount, after driving the game to each state.',
    '',
    md.table(['where', 'theme', 'layer', 'duck', 'note'], musicRows),
    '',
    failures.length ? `Steps that failed:\n\n${md.table(['step', 'why'], failures)}\n` : '',
    tool.code === 0 ? '' : `Audio tool output tail:\n\n\`\`\`\n${tail(tool.output, 30)}\n\`\`\``
  ].join('\n')
  if (tool.code !== 0 || failures.length)
    throw Object.assign(
      new Error(tool.code !== 0 ? `the audio tool exited ${tool.code}` : `${failures.length} step(s) failed`),
      { body }
    )
  return body
}

// -------------------------------------------------------------------------------------------------- checks

async function runChecks(dir) {
  mkdirSync(dir, { recursive: true })
  const commands = [
    'npm run typecheck',
    'npm run lint',
    'npm run test:hoshi-no-hamham',
    'npm run build:hoshi-no-hamham'
  ]
  const sections = ['# Repository checks', '', `Run by the review kit at ${new Date().toISOString()}.`, '']
  const rows = []
  for (const command of commands) {
    const result = await run(command, [], { shell: true, timeoutMs: 30 * 60_000 })
    rows.push([`\`${command}\``, result.code, `${fmt(result.seconds, 1)} s`])
    sections.push(
      `## \`${command}\`: exit code ${result.code} (${fmt(result.seconds, 1)} s)`,
      '',
      '```',
      tail(result.output, 40),
      '```',
      ''
    )
  }
  sections.push(
    '## Not run by the kit',
    '',
    'The browser suite is too slow for the kit (about half an hour): `npm run e2e:hoshi-no-hamham`.',
    ''
  )
  writeFileSync(join(dir, 'checks.md'), sections.join('\n'))
  const failed = rows.filter((r) => r[1] !== 0)
  return [
    `Full output tails in [checks.md](checks.md). The browser suite is not run here: \`npm run e2e:hoshi-no-hamham\`.`,
    '',
    md.table(['command', 'exit code', 'time'], rows),
    '',
    failed.length ? `**${failed.length} check(s) failed.**` : 'All four checks passed.'
  ].join('\n')
}

// ---------------------------------------------------------------------------------------------------- main

const TITLES = {
  screens: 'Screens',
  staging: 'Staging (frame series)',
  art: 'Art (sprite sheets)',
  motion: 'Motion (what the view adds)',
  audio: 'Audio',
  checks: 'Checks'
}
const RUNNERS = {
  screens: (o) => runScreens(join(o, 'screens')),
  staging: (o) => runStaging(join(o, 'staging')),
  art: (o) => runArt(join(o, 'art')),
  motion: (o) => runMotion(join(o, 'motion')),
  audio: (o) => runAudio(join(o, 'audio')),
  checks: (o) => runChecks(o)
}

async function shutdown() {
  try {
    await browser?.close()
  } catch {
    /* already gone */
  }
  browser = null
  try {
    await server?.close()
  } catch {
    /* already gone */
  }
  server = null
}

/** Reports of sections this invocation did not run, kept from the earlier run that wrote them. */
function earlier(name) {
  try {
    return JSON.parse(readFileSync(join(out, '.sections', `${name}.json`), 'utf8'))
  } catch {
    return null
  }
}

function writeIndex(started) {
  const shown = SECTIONS.filter((name) => wanted.has(name) || earlier(name))
  const status = shown.map((name) => {
    const r = wanted.has(name) ? reports.get(name) : earlier(name)
    const state = !r ? 'not run' : (r.error ? '**FAILED**' : 'ok') + (wanted.has(name) ? '' : ` (earlier run, ${r.at})`)
    return [`[${TITLES[name]}](#${name})`, state, r ? `${fmt(r.seconds, 0)} s` : '–']
  })
  const skipped = SECTIONS.filter((name) => !shown.includes(name))
  const parts = [
    '# 星のハムハム review kit',
    '',
    `Generated ${new Date().toISOString()} by \`node scripts/hoshi-no-hamham-review.mjs\` (commit \`${tryGit()}\`), ${fmt((Date.now() - started) / 1000, 0)} s in total.`,
    'Every number below was measured in the running game or taken from the code; no image needs to be opened to read this file.',
    '',
    '## Contents',
    '',
    md.table(['section', 'status', 'time'], status),
    skipped.length ? `\nNot run in this invocation: ${skipped.join(', ')}.` : '',
    '',
    problems.length
      ? `## Page and console errors (${problems.length})\n\n${[...new Set(problems)].map((p) => `- ${p}`).join('\n')}\n`
      : '## Page and console errors\n\nNone.\n'
  ]
  for (const name of shown) {
    const r = wanted.has(name) ? reports.get(name) : earlier(name)
    parts.push(`<a id="${name}"></a>`, '', `## ${TITLES[name]}`, '')
    if (!r) parts.push('_Not run._', '')
    else {
      if (r.error) parts.push(`**This section failed: ${r.error}**`, '')
      if (r.body) parts.push(r.body, '')
    }
  }
  writeFileSync(join(out, 'index.md'), parts.join('\n'))
}

function tryGit() {
  try {
    return (
      spawnSync('git', ['rev-parse', '--short', 'HEAD'], { cwd: root, encoding: 'utf8' }).stdout.trim() || 'unknown'
    )
  } catch {
    return 'unknown'
  }
}

async function main() {
  const started = Date.now()
  // Section folders are rebuilt each run; the rest of the folder is left alone.
  mkdirSync(out, { recursive: true })
  for (const name of ['screens', 'staging', 'art', 'motion', 'audio'])
    if (wanted.has(name)) {
      try {
        rmSync(join(out, name), { recursive: true, force: true, maxRetries: 5, retryDelay: 200 })
      } catch (error) {
        console.warn(`could not clear ${name}/ (${error.code}); old files may remain`)
      }
    }

  const needsServer = ['screens', 'staging', 'art', 'motion', 'audio'].some((name) => wanted.has(name))
  const needsBrowser = ['screens', 'staging', 'motion', 'audio'].some((name) => wanted.has(name))
  if (needsServer) {
    const port = await freePort()
    server = await createServer({
      configFile: join(root, 'vite.config.hoshi-no-hamham.mjs'),
      logLevel: 'error',
      clearScreen: false,
      server: { host: '127.0.0.1', port, strictPort: true }
    })
    await server.listen()
    baseUrl = `http://127.0.0.1:${port}/`
    console.log(`dev server on ${baseUrl}`)
  }
  if (needsBrowser) {
    browser = await chromium.launch({
      headless: true,
      executablePath: process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH || undefined,
      args: ['--autoplay-policy=no-user-gesture-required']
    })
  }

  for (const name of SECTIONS) {
    if (!wanted.has(name)) continue
    const t = Date.now()
    console.log(`section ${name} ...`)
    try {
      const body = await RUNNERS[name](out)
      reports.set(name, { body, error: null, seconds: (Date.now() - t) / 1000, at: new Date().toISOString() })
    } catch (error) {
      reports.set(name, {
        body: error.body ?? '',
        error: String(error.stack ?? error)
          .split('\n')
          .slice(0, 3)
          .join(' / '),
        seconds: (Date.now() - t) / 1000,
        at: new Date().toISOString()
      })
      console.error(`section ${name} failed: ${error.message ?? error}`)
    }
    mkdirSync(join(out, '.sections'), { recursive: true })
    writeFileSync(join(out, '.sections', `${name}.json`), JSON.stringify(reports.get(name)))
    console.log(`section ${name} done in ${fmt((Date.now() - t) / 1000, 1)} s`)
    writeIndex(started)
  }
  writeIndex(started)
  console.log(`\nindex: ${join(out, 'index.md')}`)
}

let code = 0
const finish = async (exit) => {
  await shutdown()
  process.exit(exit)
}
process.on('SIGINT', () => void finish(130))
process.on('SIGTERM', () => void finish(143))
try {
  await main()
} catch (error) {
  console.error(error)
  code = 1
}
await shutdown()
const failed = [...reports.entries()].filter(([, r]) => r.error)
if (problems.length) {
  console.error(`\n${problems.length} page/console error(s):`)
  for (const p of [...new Set(problems)]) console.error(`  ${p}`)
  code = 1
}
if (failed.length) {
  console.error(`\nFailed sections: ${failed.map(([name]) => name).join(', ')}`)
  code = 1
}
process.exit(code)
