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
 *   screens/            screenshots of every screen at 1280x720 and of title (fresh save and with a save), select, story,
 *                       play, pause, result, game over (lost in play), an ending page, the credits held at 20, 50 and
 *                       80 % and the card after the roll at 844x390, 390x844 and 320x568 (touch). index.md adds, per
 *                       screenshot, the tallest empty horizontal band (px, share of the viewport, y range; flagged
 *                       above 25 %; the game canvas counts as content only when hiding it changes the stage's pixels),
 *                       headings and buttons that wrap, and the reviewer measurements (story/ending layout and picture
 *                       crop, play deck and pause/mute buttons, title rects, game-over card, pause overflow, credits
 *                       coverage and entries cut). The four viewports run side by side.
 *   staging/<series>/   a frame every 150 ms of the stage starts, a boss intro, a boss defeat, a clear, a death
 *   staging/phone/      the same moments on a 390x844 touch phone, with what the DOM shows in each frame
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

/**
 * The game-over card shows one of several lines picked with Math.random, and its height follows the line count. The
 * kit pins the draw to the first line while the player loses the last heart so that the card measures the same on
 * every run (call `__unpinRandom` once the screen shows).
 */
const pinRandom = (page) =>
  page.evaluate(() => {
    const original = Math.random
    Math.random = () => 0
    window.__unpinRandom = () => {
      Math.random = original
    }
  })

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

/**
 * Waits until the stage card and the call of the moment before (「スタート！」, 「ファイト！」) have left the screen. The kit
 * jumps straight to the next moment while a player needs many seconds to get there, so a call still on its way out
 * would be the kit's own artefact in the frames.
 */
const waitCallGone = (page, timeout = 4000) =>
  page
    .waitForFunction(
      () =>
        ['.hudx-banner', '.hudx-call'].every((selector) => {
          const el = document.querySelector(selector)
          if (!el || !el.classList.contains('is-show')) return true
          return el.getAnimations().every((animation) => animation.playState === 'finished')
        }),
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

/**
 * Runs inside the page (page.evaluate): everything the screens section measures on the visible page.
 * `kind` picks the reviewer's own measurements (story, ending, play, select, credits); `probes` switches them on.
 * It must be self-contained: it is serialised into the page. Every probe reads defensively: a missing element
 * becomes "not found" and never throws out of this function.
 */
function inspectPage({ kind, probes, canvasContent }) {
  const W = innerWidth
  const H = innerHeight
  const styles = new Map()
  const styleOf = (el) => {
    let s = styles.get(el)
    if (!s) styles.set(el, (s = getComputedStyle(el)))
    return s
  }
  const tag = (el) =>
    `${el.tagName.toLowerCase()}${el.id ? '#' + el.id : ''}${
      typeof el.className === 'string' && el.className.trim() ? '.' + el.className.trim().split(/\s+/)[0] : ''
    }`
  const opacityOf = (el) => {
    let o = 1
    for (let n = el; n && n.nodeType === 1; n = n.parentElement) o *= Number(styleOf(n).opacity)
    return o
  }
  const shown = (el) => {
    if (!el) return false
    const r = el.getBoundingClientRect()
    return r.width > 0 && r.height > 0 && styleOf(el).display !== 'none' && styleOf(el).visibility !== 'hidden'
  }
  const visible = (el) => {
    const s = styleOf(el)
    if (s.visibility === 'hidden' || s.display === 'none' || el.closest('[hidden]')) return false
    return opacityOf(el) > 0.01
  }
  /** Intersects a rect with the viewport and with every ancestor that clips its overflow; null when nothing is left. */
  const clip = (rect, el) => {
    let l = Math.max(rect.left, 0)
    let t = Math.max(rect.top, 0)
    let r = Math.min(rect.right, W)
    let b = Math.min(rect.bottom, H)
    // An overflow clip only reaches the element when that ancestor is in its containing-block chain: a fixed or
    // absolute element escapes the overflow of ancestors that do not contain it.
    const transforms = (s) => s.transform !== 'none' || s.filter !== 'none' || s.perspective !== 'none'
    let position = styleOf(el).position
    for (let n = el.parentElement; n && n !== document.documentElement; n = n.parentElement) {
      const s = styleOf(n)
      const contains =
        position === 'fixed' ? transforms(s) : position === 'absolute' ? s.position !== 'static' || transforms(s) : true
      if (!contains) continue
      position = s.position
      if (s.overflowX === 'visible' && s.overflowY === 'visible') continue
      const c = n.getBoundingClientRect()
      if (s.overflowX !== 'visible') {
        l = Math.max(l, c.left)
        r = Math.min(r, c.right)
      }
      if (s.overflowY !== 'visible') {
        t = Math.max(t, c.top)
        b = Math.min(b, c.bottom)
      }
    }
    return r - l > 0 && b - t > 0 ? { l, t, r, b } : null
  }
  const alpha = (color) => {
    const m = /rgba?\(([^)]+)\)/.exec(color)
    if (!m) return color === 'transparent' ? 0 : 1
    const parts = m[1].split(/[ ,/]+/).filter(Boolean)
    return parts.length > 3 ? Number(parts[3]) : 1
  }
  const painted = (canvas) => {
    try {
      const probe = document.createElement('canvas')
      probe.width = 16
      probe.height = 16
      const ctx = probe.getContext('2d')
      ctx.drawImage(canvas, 0, 0, 16, 16)
      const data = ctx.getImageData(0, 0, 16, 16).data
      for (let i = 3; i < data.length; i += 4) if (data[i] > 0) return true
      return false
    } catch {
      return true
    }
  }
  /** Text nodes with something to read: not blank, not in a 1-px visually-hidden box. */
  const readableTexts = (el) =>
    Array.from(el.querySelectorAll('*'))
      .concat(el)
      .filter((n) => {
        const r = n.getBoundingClientRect()
        return r.width > 2 && r.height > 2
      })
      .flatMap((n) => Array.from(n.childNodes).filter((c) => c.nodeType === 3 && c.textContent.trim()))
  /** Lines of one run of text (rectangles of the text node grouped by line). */
  const linesOfNode = (node) => {
    const range = document.createRange()
    range.selectNodeContents(node)
    const rects = Array.from(range.getClientRects())
      .filter((r) => r.width > 0 && r.height > 2)
      .sort((a, b) => a.top - b.top)
    let lines = 0
    let bottom = -Infinity
    for (const r of rects) {
      if ((r.top + r.bottom) / 2 >= bottom) lines += 1
      bottom = Math.max(bottom, r.bottom)
    }
    return lines
  }
  /** Most lines any single run of text inside the element takes (stacked child elements are not wrapping). */
  const lineCount = (el) => Math.max(0, ...readableTexts(el).map(linesOfNode))

  // --- everything visible that is content or decoration
  const items = []
  const add = (rect, el, why) => {
    const c = clip(rect, el)
    if (c) items.push({ ...c, what: `${tag(el)} (${why})`, inTitle: Boolean(el.closest('#title-screen')) })
  }
  const page = new Set(['HTML', 'BODY'])
  const isBackdrop = (el) => page.has(el.tagName) || el.matches('#app, #stage-wrap, .screen, .screen-ghost')
  for (const el of document.body.querySelectorAll('*')) {
    if (['SCRIPT', 'STYLE', 'NOSCRIPT', 'TEMPLATE'].includes(el.tagName)) continue
    if (!visible(el)) continue
    const s = styleOf(el)
    const rect = el.getBoundingClientRect()
    // visible text, one rectangle per line
    if (parseFloat(s.fontSize) > 0 && alpha(s.color) > 0.05 && rect.width > 2 && rect.height > 2) {
      for (const node of el.childNodes) {
        if (node.nodeType !== 3 || !node.textContent.trim()) continue
        const range = document.createRange()
        range.selectNodeContents(node)
        for (const r of range.getClientRects())
          if (r.width > 2 && r.height > 2) add(r, el, `text "${node.textContent.trim().slice(0, 12)}"`)
      }
    }
    if (rect.width <= 0 || rect.height <= 0) continue
    if (el.matches('button, input, select, textarea, [role="button"], a[href]')) add(rect, el, 'control')
    else if (el.tagName === 'IMG') {
      if (el.complete && el.naturalWidth > 0 && rect.width > 2 && rect.height > 2) add(rect, el, 'image')
    } else if (el.tagName === 'CANVAS') {
      if (el.id !== 'game' && painted(el)) add(rect, el, 'canvas')
    } else if (['SVG', 'VIDEO'].includes(el.tagName.toUpperCase())) add(rect, el, 'media')
    if (isBackdrop(el) || el.id === 'game' || rect.width * rect.height >= 0.9 * W * H) continue
    const bordered =
      s.borderImageSource !== 'none' ||
      ['Top', 'Right', 'Bottom', 'Left'].some(
        (side) =>
          parseFloat(s[`border${side}Width`]) > 0 &&
          s[`border${side}Style`] !== 'none' &&
          alpha(s[`border${side}Color`]) > 0.05
      )
    const gradientOnly = s.backgroundImage !== 'none' && !s.backgroundImage.includes('url(')
    const overlay = gradientOnly && el.getAttribute('aria-hidden') === 'true'
    if (s.backgroundImage !== 'none' && !overlay) add(rect, el, 'background image')
    else if (bordered) add(rect, el, 'border')
    else if (alpha(s.backgroundColor) >= 0.5) add(rect, el, 'panel')
    else if (s.boxShadow !== 'none') add(rect, el, 'shadow frame')
  }
  // The game canvas counts as the stage's rectangle when the caller found by pixels that it shows through.
  const stage = document.querySelector('#stage-wrap')
  const game = document.querySelector('#game')
  if (stage && game && visible(game) && canvasContent) add(stage.getBoundingClientRect(), game, 'game canvas = stage')
  // --- the tallest horizontal band no rectangle touches
  const bandOf = (list) => {
    const sorted = list.slice().sort((a, b) => a.t - b.t)
    let best = { h: 0, top: 0, bottom: 0, above: 'top of the viewport', below: 'bottom of the viewport' }
    let reach = 0
    let reachWhat = 'top of the viewport'
    for (const item of sorted) {
      if (item.t - reach > best.h)
        best = { h: item.t - reach, top: reach, bottom: item.t, above: reachWhat, below: item.what }
      if (item.b > reach) {
        reach = item.b
        reachWhat = item.what
      }
    }
    if (H - reach > best.h)
      best = { h: H - reach, top: reach, bottom: H, above: reachWhat, below: 'bottom of the viewport' }
    return best
  }
  const best = bandOf(items)

  // --- headings and buttons that wrap
  const wraps = []
  const candidates = document.querySelectorAll(
    'h1, h2, h3, h4, h5, h6, .headline, .story-title, button, [role="button"], .pxbtn, a.home-link'
  )
  for (const el of candidates) {
    if (!visible(el) || !shown(el) || !clip(el.getBoundingClientRect(), el)) continue
    const lines = lineCount(el)
    if (lines > 1) wraps.push([tag(el), el.textContent.trim().replace(/\s+/g, ' ').slice(0, 40), lines])
  }

  // --- text under a keyboard-focus frame. A focused button or stage card draws a blinking frame around itself (its
  // `::after`: 9 px outside the box, 9 px plus the button's lift below it, a 3 px border with a 3 px ink line on
  // both sides). Any control can get the focus, so the frame of every one of them is checked, focused or not.
  const crossed = []
  const FRAME = { inset: 9, border: 3, ink: 3 }
  const canFocus = (el) =>
    !el.disabled &&
    el.tabIndex >= 0 &&
    !el.closest('[hidden], [inert], [aria-hidden="true"]') &&
    visible(el) &&
    shown(el)
  // A screen opened over another one (help over the title, pause over play) is the only place to look then.
  const modal = Array.from(document.querySelectorAll('#help-screen, #pause-screen')).find((el) => shown(el)) ?? null
  const inScope = (el) => !modal || modal.contains(el)
  const texts = []
  for (const el of document.body.querySelectorAll('*')) {
    if (!inScope(el) || !visible(el) || !shown(el)) continue
    // A label kept only for screen readers (a 1-px box) is not on screen.
    const own = el.getBoundingClientRect()
    if (own.width <= 2 || own.height <= 2) continue
    for (const node of el.childNodes) {
      if (node.nodeType !== 3 || !node.textContent.trim()) continue
      const range = document.createRange()
      range.selectNodeContents(node)
      for (const line of range.getClientRects()) {
        if (line.width <= 2 || line.height <= 2) continue
        const t = clip(line, el)
        if (t) texts.push({ el, t, text: node.textContent.trim().replace(/s+/g, ' ').slice(0, 30) })
      }
    }
  }
  for (const control of document.querySelectorAll('.pxbtn, .stage-card')) {
    if (!inScope(control) || !canFocus(control) || !clip(control.getBoundingClientRect(), control)) continue
    const r = control.getBoundingClientRect()
    const lift = parseFloat(styleOf(control).getPropertyValue('--lift')) || 0
    const reach = FRAME.inset + FRAME.ink
    const whole = { l: r.left - reach, t: r.top - reach, r: r.right + reach, b: r.bottom + reach + lift }
    const thick = FRAME.ink * 2 + FRAME.border
    const inner = { l: whole.l + thick, t: whole.t + thick, r: whole.r - thick, b: whole.b - thick }
    // The frame is cut where the control is (a card scrolled under the screen's header shows no frame there).
    const outer = clip({ left: whole.l, top: whole.t, right: whole.r, bottom: whole.b }, control)
    if (!outer) continue
    // Drawn above the frame (which has no z-index of its own): a z-index on the way up to what both share.
    const raised = (el) => {
      for (let n = el; n && !n.contains(control); n = n.parentElement) {
        const s = styleOf(n)
        if (s.position !== 'static' && Number(s.zIndex) > 0) return true
      }
      return false
    }
    const seen = new Set()
    for (const { el, t, text } of texts) {
      if (raised(el)) continue
      const touches = t.l < outer.r && t.r > outer.l && t.t < outer.b && t.b > outer.t
      const within = t.l >= inner.l && t.r <= inner.r && t.t >= inner.t && t.b <= inner.b
      if (!touches || within || seen.has(text)) continue
      seen.add(text)
      crossed.push([`${tag(control)} "${control.textContent.trim().replace(/s+/g, ' ').slice(0, 16)}"`, tag(el), text])
    }
  }

  // --- the reviewer's own measurements
  const measures = []
  if (probes) {
    const NOT_FOUND = 'not found'
    const probe = (label, fn) => {
      try {
        measures.push([label, fn()])
      } catch (error) {
        measures.push([label, error === NOT_FOUND ? NOT_FOUND : `error: ${error?.message ?? error}`])
      }
    }
    const need = (el) => {
      if (!el) throw NOT_FOUND
      return el
    }
    const box = (r) =>
      `x ${Math.round(r.left)}–${Math.round(r.right)}, y ${Math.round(r.top)}–${Math.round(r.bottom)} (${Math.round(r.width)}×${Math.round(r.height)})`
    const px = (n) => `${Math.round(n)} px`
    const firstShown = (selector) => Array.from(document.querySelectorAll(selector)).find(shown)
    const portrait = matchMedia('(orientation: portrait)').matches
    /** The frame the game is laid out in: the stage in landscape, the viewport in portrait. */
    const frameRect = () => {
      if (portrait) return { left: 0, top: 0, right: W, bottom: H, width: W, height: H }
      return need(document.querySelector('#stage-wrap')).getBoundingClientRect()
    }
    const pct = (n) => `${(100 * n).toFixed(1)} %`
    const named = (el) =>
      `${tag(el)}${el.textContent.trim() ? ` "${el.textContent.trim().replace(/\s+/g, ' ').slice(0, 10)}"` : ''}`
    if (kind === 'story' || kind === 'ending' || kind === 'credits' || kind === 'card') {
      const layout = firstShown('.story-layout')
      probe('.story-layout', () => {
        const r = need(layout).getBoundingClientRect()
        return `${box(r)}; top margin ${px(r.top)}, bottom margin ${px(H - r.bottom)}`
      })
      probe('footer buttons share a row', () => {
        const foot = need(layout).querySelector('.story-foot')
        const buttons = Array.from(need(foot).querySelectorAll('button')).filter((b) => shown(b) && visible(b))
        if (!buttons.length) return 'no visible button'
        const rects = buttons.map((b) => b.getBoundingClientRect())
        const tops = rects.map((r) => Math.round(r.top))
        const sameRow = Math.max(...rects.map((r) => r.top)) - Math.min(...rects.map((r) => r.top)) < 4
        const foots = foot.getBoundingClientRect()
        return `${sameRow ? 'yes' : '**NO**'}: ${buttons.length} button(s), tops ${tops.join('/')}; footer ${box(foots)}`
      })
    }
    if (kind === 'story' || kind === 'ending') {
      // The picture is cropped when its canvas box has another aspect than its backing store (object-fit cover/none).
      probe('.story-art', () => {
        const art = need(firstShown('.story-art'))
        const canvas = need(Array.from(art.querySelectorAll('canvas.diorama')).find(shown))
        const a = art.getBoundingClientRect()
        const c = canvas.getBoundingClientRect()
        const backing = canvas.width / canvas.height
        const css = c.width / c.height
        const apart = Math.abs(css / backing - 1)
        const cropped = apart > 0.02
        return (
          `${box(a)}; canvas ${canvas.id} backing ${canvas.width}×${canvas.height} (${backing.toFixed(3)}), ` +
          `CSS box ${Math.round(c.width)}×${Math.round(c.height)} (${css.toFixed(3)}), ${(apart * 100).toFixed(1)} % apart, ` +
          `object-fit ${styleOf(canvas).objectFit}: ${cropped ? '**cropped**' : 'not cropped'}`
        )
      })
    }
    if (kind === 'play') {
      const wrap = document.querySelector('#stage-wrap')
      const controls = document.querySelector('#touch-controls')
      probe('#stage-wrap', () => box(need(wrap).getBoundingClientRect()))
      probe('#touch-controls', () => {
        const el = need(controls)
        return shown(el) ? box(el.getBoundingClientRect()) : 'not visible (hidden)'
      })
      probe('stage bottom → controls top', () => {
        need(controls)
        if (!shown(controls)) return 'not visible'
        return px(controls.getBoundingClientRect().top - need(wrap).getBoundingClientRect().bottom)
      })
      probe('deck .hudd', () => {
        const deck = need(document.querySelector('.hudd'))
        if (styleOf(deck).display === 'contents') return 'display: contents (no box of its own in this orientation)'
        const r = deck.getBoundingClientRect()
        const stageBottom = need(wrap).getBoundingClientRect().bottom
        return `${box(r)}; starts ${px(r.top - stageBottom)} below the stage bottom`
      })
      for (const [id, label] of [
        ['#pause', 'pause button'],
        ['#mute', 'mute button']
      ]) {
        probe(`${id} (${label})`, () => {
          const el = need(document.querySelector(id))
          if (!shown(el)) return 'not visible'
          const r = el.getBoundingClientRect()
          const s = need(wrap).getBoundingClientRect()
          const inside =
            r.left >= s.left - 0.5 && r.right <= s.right + 0.5 && r.top >= s.top - 0.5 && r.bottom <= s.bottom + 0.5
          const where = inside
            ? 'inside the stage'
            : r.top >= s.bottom - 0.5
              ? `under the stage (${px(r.top - s.bottom)} below its bottom edge)`
              : 'partly outside the stage'
          return `${box(r)}; ${where}`
        })
      }
      probe('deck smallest text', () => {
        const deck = need(document.querySelector('.hudd'))
        let min = null
        for (const el of deck.querySelectorAll('*')) {
          if (!Array.from(el.childNodes).some((n) => n.nodeType === 3 && n.textContent.trim())) continue
          if (!visible(el) || !shown(el) || !clip(el.getBoundingClientRect(), el)) continue
          const size = parseFloat(styleOf(el).fontSize)
          if (size > 0 && (!min || size < min.size)) min = { size, el }
        }
        return min ? `${min.size.toFixed(1)} px (${named(min.el)})` : 'no visible text in the deck'
      })
    }
    if (kind === 'title') {
      probe('#stage-wrap', () => box(need(document.querySelector('#stage-wrap')).getBoundingClientRect()))
      probe('.logo-art', () => box(need(firstShown('.logo-art')).getBoundingClientRect()))
      probe('.title-menu', () => box(need(firstShown('.title-menu')).getBoundingClientRect()))
      probe('progress (.title-trail, else #save-note)', () => {
        const trail = document.querySelector('.title-trail')
        const el = trail ?? need(document.querySelector('#save-note'))
        const label = trail ? '.title-trail' : '#save-note'
        if (!shown(el)) return `${label}: present but not shown (empty or hidden)`
        return `${label}: ${box(el.getBoundingClientRect())} "${el.textContent.trim().replace(/\s+/g, ' ').slice(0, 30)}"`
      })
      probe('.title-foot', () => box(need(firstShown('.title-foot')).getBoundingClientRect()))
      // The demo plays in the stage behind the title: where it is really seen, it fills its part of the screen.
      probe('tallest stretch neither a title element nor the demo touches', () => {
        const mine = items.filter((item) => item.inTitle || item.what.includes('game canvas = stage'))
        if (!mine.length) return 'no title element found'
        const b = bandOf(mine)
        return `${px(b.h)} = ${pct(b.h / H)} of the height, y ${Math.round(b.top)}–${Math.round(b.bottom)}, between ${b.above} and ${b.below}`
      })
    }
    if (kind === 'dead') {
      probe('.dead-card', () => {
        const card = need(firstShown('.dead-card'))
        const f = frameRect()
        const r = card.getBoundingClientRect()
        return `${box(r)}; ${pct(r.height / f.height)} of the frame height; margin above ${px(r.top - f.top)}, below ${px(f.bottom - r.bottom)} (frame = ${portrait ? 'viewport' : '#stage-wrap'})`
      })
    }
    if (kind === 'pause') {
      probe('.pause-card and what reaches outside its padding box', () => {
        const card = need(firstShown('.pause-card'))
        const r = card.getBoundingClientRect()
        const s = styleOf(card)
        const pad = {
          left: r.left + parseFloat(s.borderLeftWidth),
          top: r.top + parseFloat(s.borderTopWidth),
          right: r.right - parseFloat(s.borderRightWidth),
          bottom: r.bottom - parseFloat(s.borderBottomWidth)
        }
        const out = []
        for (const el of card.querySelectorAll('*')) {
          if (!visible(el)) continue
          const e = el.getBoundingClientRect()
          if (e.width <= 0 || e.height <= 0) continue
          const over = []
          if (e.left < pad.left - 0.5) over.push(`left ${Math.round(pad.left - e.left)}`)
          if (e.right > pad.right + 0.5) over.push(`right ${Math.round(e.right - pad.right)}`)
          if (e.top < pad.top - 0.5) over.push(`top ${Math.round(pad.top - e.top)}`)
          if (e.bottom > pad.bottom + 0.5) over.push(`bottom ${Math.round(e.bottom - pad.bottom)}`)
          if (over.length) out.push(`${named(el)} (${over.join(', ')} px)`)
        }
        const head = `panel ${box(r)}`
        if (!out.length) return `${head}; nothing reaches outside the padding box`
        return `${head}; **${out.length} reach outside**: ${out.slice(0, 6).join('; ')}${out.length > 6 ? `; … ${out.length - 6} more` : ''}`
      })
    }
    if (kind === 'select') {
      probe('#select-title one line', () => {
        const el = need(document.querySelector('#select-title'))
        const r = el.getBoundingClientRect()
        const lh = parseFloat(styleOf(el).lineHeight)
        const lines = lineCount(el)
        return `${lines === 1 ? 'yes' : '**NO**'}: ${lines} line(s), height ${px(r.height)} vs line height ${Number.isNaN(lh) ? 'normal' : px(lh)}`
      })
    }
    if (kind === 'credits') {
      probe('#ending-credits covers the frame', () => {
        const el = need(document.querySelector('#ending-credits'))
        if (!shown(el)) return 'not visible'
        const f = frameRect()
        const r = el.getBoundingClientRect()
        const across = (a0, a1, b0, b1) => Math.max(0, Math.min(a1, b1) - Math.max(a0, b0))
        const h = across(r.top, r.bottom, f.top, f.bottom) / f.height
        const w = across(r.left, r.right, f.left, f.right) / f.width
        return `${box(r)}; covers ${pct(h)} of the frame height and ${pct(w)} of its width (frame = ${portrait ? 'viewport' : '#stage-wrap'} ${Math.round(f.width)}×${Math.round(f.height)})${h < 0.6 ? ' **(under 60 % of the height)**' : ''}`
      })
      probe('credit entries: whole / fading / cut by a hard edge', () => {
        const area = need(document.querySelector('#ending-credits'))
        if (!shown(area)) return 'not visible'
        const win = area.querySelector('.credits-window') ?? area
        const a = win.getBoundingClientRect()
        // The fade comes from the computed mask: find where the vertical gradient is fully opaque.
        const maskText = styleOf(win).maskImage !== 'none' ? styleOf(win).maskImage : styleOf(win).webkitMaskImage
        let fadeTop = 0
        let fadeBottom = 0
        let maskNote = 'no mask'
        const stops = []
        if (maskText && maskText !== 'none') {
          const inner = /linear-gradient\((.*)\)\s*$/.exec(maskText)?.[1]
          if (inner) {
            // split the stops at top-level commas
            const parts = []
            let depth = 0
            let cur = ''
            for (const ch of inner) {
              if (ch === '(') depth++
              if (ch === ')') depth--
              if (ch === ',' && depth === 0) {
                parts.push(cur.trim())
                cur = ''
              } else cur += ch
            }
            parts.push(cur.trim())
            const length = (text) => {
              // "12px", "15%", "calc(100% - 15%)", "calc(85%)" → px
              const calc = /^calc\((.*)\)$/.exec(text)
              const expr = calc ? calc[1] : text
              const tokens = expr.split(/\s+/).filter(Boolean)
              let total = 0
              let sign = 1
              for (const token of tokens) {
                if (token === '+') sign = 1
                else if (token === '-') sign = -1
                else {
                  const m = /^(-?[\d.]+)(%|px)$/.exec(token)
                  if (!m) return NaN
                  total += sign * (m[2] === '%' ? (Number(m[1]) / 100) * a.height : Number(m[1]))
                }
              }
              return total
            }
            for (const part of parts) {
              const color = /^(rgba?\([^)]*\)|transparent|#[0-9a-f]{3,8})\s*(.*)$/i.exec(part)
              if (!color) continue
              const pos = color[2] ? length(color[2]) : NaN
              stops.push({ alpha: color[1] === 'transparent' ? 0 : alpha(color[1]), pos })
            }
            if (stops.length >= 2) {
              if (stops.at(0).pos !== stops.at(0).pos) stops.at(0).pos = 0
              if (stops.at(-1).pos !== stops.at(-1).pos) stops.at(-1).pos = a.height
              if (stops.every((stop) => stop.pos === stop.pos)) {
                const solid = stops.filter((stop) => stop.alpha >= 0.99)
                if (solid.length) {
                  fadeTop = stops[0].alpha >= 0.99 ? 0 : Math.max(0, solid[0].pos)
                  fadeBottom = stops.at(-1).alpha >= 0.99 ? 0 : Math.max(0, a.height - solid.at(-1).pos)
                  maskNote = `mask fades the top ${px(fadeTop)} and the bottom ${px(fadeBottom)} of the window`
                } else maskNote = 'mask never fully opaque'
              } else maskNote = 'mask stops could not be read (counted as no fade)'
            } else maskNote = 'mask is not a readable gradient (counted as no fade)'
          } else maskNote = 'mask is not a linear-gradient (counted as no fade)'
        }
        let entries = Array.from(area.querySelectorAll('.credits-name, .credits-title, .credits-line, .credits-end'))
        if (!entries.length) entries = Array.from(area.querySelectorAll('p'))
        if (!entries.length) throw NOT_FOUND
        let whole = 0
        const fading = []
        const cut = []
        for (const entry of entries) {
          const r = entry.getBoundingClientRect()
          if (r.height <= 0) continue
          if (r.bottom <= a.top + 0.5 || r.top >= a.bottom - 0.5) continue // outside the window: not on screen
          const crossTop = r.top < a.top - 0.5
          const crossBottom = r.bottom > a.bottom + 0.5
          const label = `"${entry.textContent.trim().slice(0, 12)}"`
          if (crossTop || crossBottom) {
            const hard = (crossTop && fadeTop <= 0) || (crossBottom && fadeBottom <= 0)
            if (hard) cut.push(`${label} over the ${crossTop && fadeTop <= 0 ? 'top' : 'bottom'} edge`)
            else fading.push(label)
          } else if (r.top < a.top + fadeTop - 0.5 || r.bottom > a.bottom - fadeBottom + 0.5) fading.push(label)
          else whole += 1
        }
        const head = cut.length ? `**${cut.length} cut by a hard edge**: ${cut.join(', ')}` : '0 cut'
        return `${head}; ${whole} wholly visible; ${fading.length} in the fade zone${fading.length ? ` (${fading.slice(0, 4).join(', ')}${fading.length > 4 ? ', …' : ''})` : ''}; ${maskNote}; window ${box(a)}`
      })
    }
    if (kind === 'card') {
      probe('card after the roll: buttons share a row', () => {
        const select = need(document.querySelector('#ending-select'))
        const title = need(document.querySelector('#ending-title-button'))
        if (!shown(select) || !shown(title))
          return `**not both shown** (#ending-select ${shown(select) ? 'shown' : 'hidden'}, #ending-title-button ${shown(title) ? 'shown' : 'hidden'})`
        const a = select.getBoundingClientRect()
        const b = title.getBoundingClientRect()
        const same = Math.abs(a.top - b.top) < 4
        return `${same ? 'yes' : '**NO**'}: #ending-select ${box(a)}; #ending-title-button ${box(b)}`
      })
      probe('#ending-stats', () => {
        const el = need(document.querySelector('#ending-stats'))
        return shown(el) ? box(el.getBoundingClientRect()) : 'not shown'
      })
    }
  }
  return {
    band: { h: best.h, top: best.top, bottom: best.bottom, above: best.above, below: best.below, viewport: H },
    wraps,
    crossed,
    measures
  }
}

/** Share of the viewport height above which an empty band is flagged. */
const EMPTY_FLAG_PERCENT = 25
const SCREEN_COLUMNS = [
  'file',
  'viewport',
  'scrolls sideways',
  'smallest text',
  'smallest button (w×h px)',
  `tallest empty band (flag > ${EMPTY_FLAG_PERCENT} %)`,
  'wrapped headings / buttons',
  'text under a focus frame',
  'game canvas seen by pixels',
  'note'
]

/** The canvas counts as content when hiding it changes at least this share of the stage's pixels more than they change on their own. */
const CANVAS_SHARE_MIN = 0.08
/** A pixel "changes" when any colour channel differs by more than this (0–255). */
const CANVAS_CHANNEL_MIN = 40

/**
 * Waits until the boxes of the visible buttons and cards stop moving (two reads 150 ms apart are the same), so a
 * card that is still dropping in or a button that is still growing is not measured mid-way. Gives up after 3 s.
 */
async function settleLayout(page) {
  const read = () =>
    page.evaluate(() =>
      Array.from(
        document.querySelectorAll('button, .dead-card, .pause-card, .story-layout, .story-art, .credits-window, .tally')
      )
        .map((el) => {
          const r = el.getBoundingClientRect()
          return r.width > 0 && r.height > 0
            ? [
                el.id || el.className,
                Math.round(r.left),
                Math.round(r.top),
                Math.round(r.width),
                Math.round(r.height)
              ].join(':')
            : ''
        })
        .join('|')
    )
  let before = await read()
  for (let i = 0; i < 20; i++) {
    await sleep(150)
    const now = await read()
    if (now === before) return true
    before = now
  }
  return false
}

/**
 * Decides by pixels whether the game canvas is really seen: a clipped screenshot of the stage rectangle with `#game`
 * visible against one with it hidden (`visibility: hidden`, restored afterwards). Returns { content, text }.
 */
async function canvasSeen(page) {
  const rect = await page.evaluate(() => {
    const game = document.querySelector('#game')
    const stage = document.querySelector('#stage-wrap')
    if (!game || !stage) return null
    const s = getComputedStyle(game)
    if (s.display === 'none' || s.visibility === 'hidden') return null
    const r = stage.getBoundingClientRect()
    const x = Math.max(0, Math.floor(r.left))
    const y = Math.max(0, Math.floor(r.top))
    const width = Math.min(innerWidth, Math.ceil(r.right)) - x
    const height = Math.min(innerHeight, Math.ceil(r.bottom)) - y
    return width > 4 && height > 4 ? { x, y, width, height } : null
  })
  if (!rect) return { content: false, text: 'canvas not shown: no' }
  const before = await page.screenshot({ clip: rect })
  const previous = await page.evaluate(() => {
    const game = document.querySelector('#game')
    const old = game.style.visibility
    game.style.visibility = 'hidden'
    return old
  })
  let hidden
  let again
  try {
    hidden = await page.screenshot({ clip: rect })
  } finally {
    await page.evaluate((old) => {
      document.querySelector('#game').style.visibility = old
    }, previous)
  }
  // A second capture with the canvas visible again measures how much moves anyway (animated art, a live scene).
  again = await page.screenshot({ clip: rect })
  const [hide, motion] = await page.evaluate(
    async ([a, b, c, limit]) => {
      const decode = async (base64) => {
        const bytes = Uint8Array.from(atob(base64), (ch) => ch.charCodeAt(0))
        const bitmap = await createImageBitmap(new Blob([bytes], { type: 'image/png' }))
        const canvas = document.createElement('canvas')
        canvas.width = bitmap.width
        canvas.height = bitmap.height
        const ctx = canvas.getContext('2d')
        ctx.drawImage(bitmap, 0, 0)
        return ctx.getImageData(0, 0, canvas.width, canvas.height).data
      }
      const share = (x, y) => {
        let changed = 0
        for (let i = 0; i < x.length; i += 4)
          if (
            Math.abs(x[i] - y[i]) > limit ||
            Math.abs(x[i + 1] - y[i + 1]) > limit ||
            Math.abs(x[i + 2] - y[i + 2]) > limit
          )
            changed++
        return changed / (x.length / 4)
      }
      const [x, y, z] = await Promise.all([decode(a), decode(b), decode(c)])
      return [share(x, y), share(x, z)]
    },
    [before.toString('base64'), hidden.toString('base64'), again.toString('base64'), CANVAS_CHANNEL_MIN]
  )
  const net = hide - motion
  const content = net >= CANVAS_SHARE_MIN
  return {
    content,
    text: `${content ? 'yes' : 'no'}: ${(hide * 100).toFixed(1)} % change on hiding it, ${(motion * 100).toFixed(1)} % move anyway, net ${(net * 100).toFixed(1)} %`
  }
}

/** Moves the credits roll (the longest animation under #ending-credits) to `fraction` of its run and holds it there. */
const seekCredits = (page, fraction) =>
  page.evaluate((f) => {
    const area = document.querySelector('#ending-credits')
    if (!area) return 'no #ending-credits'
    const endOf = (a) => {
      const timing = a.effect.getComputedTiming()
      return Number.isFinite(timing.endTime) ? timing.endTime : timing.duration
    }
    const animations = document.getAnimations().filter((a) => {
      const target = a.effect?.target
      return target instanceof Element && area.contains(target)
    })
    if (!animations.length) return 'no animation on the credits'
    const roll = animations.reduce((best, a) => (endOf(a) > endOf(best) ? a : best))
    const end = endOf(roll)
    roll.pause()
    roll.currentTime = Math.min(end * f, end - 1)
    return `roll of ${(end / 1000).toFixed(1)} s held at ${Math.round(f * 100)} %`
  }, fraction)

/** Finishes the credits roll the way a skip would and waits for the card (#ending-stats); resolves with whether it came. */
async function finishRoll(page) {
  await page.evaluate(() => {
    const area = document.querySelector('#ending-credits')
    if (!area) return
    for (const animation of document.getAnimations()) {
      const target = animation.effect?.target
      if (
        target instanceof Element &&
        area.contains(target) &&
        Number.isFinite(animation.effect.getComputedTiming().endTime)
      )
        animation.finish()
    }
  })
  const arrived = await page
    .waitForFunction(
      () => {
        const el = document.querySelector('#ending-stats')
        return Boolean(el) && !el.hidden && el.getBoundingClientRect().height > 0
      },
      null,
      { timeout: 10_000 }
    )
    .then(() => true)
    .catch(() => false)
  await page.waitForTimeout(1500)
  return arrived
}

/** Holds the roll at 20, 50 and 80 % and captures each, then finishes it and captures the card. */
async function creditsAndCard(page, snap, firstNumber, label) {
  for (const f of [0.2, 0.5, 0.8]) {
    const held = await seekCredits(page, f)
    await page.waitForTimeout(200)
    await snap(
      page,
      `${String(firstNumber + [0.2, 0.5, 0.8].indexOf(f)).padStart(2, '0')}-credits-${Math.round(f * 100)}`,
      `${label}, ${held}`,
      'credits'
    )
  }
  const arrived = await finishRoll(page)
  await snap(
    page,
    `${String(firstNumber + 3).padStart(2, '0')}-ending-card`,
    `${label}, after the roll${arrived ? '' : ' (**#ending-stats did not appear within 10 s**)'}`,
    'card'
  )
}

async function runScreens(dir) {
  const failures = []
  mkdirSync(dir, { recursive: true })

  /** One lane per viewport: its rows, its measurements and its flags. Lanes run side by side. */
  const newLane = () => ({ rows: [], measures: [], wraps: [], crossed: [], flags: [] })

  /** A screenshot plus everything measured on the page at that moment (`kind` selects the reviewer's measurements). */
  const shot = async (lane, page, viewport, name, note = '', kind = '', probes = false) => {
    const file = join(dir, `${viewport.width}x${viewport.height}-${name}.png`)
    const link = `[${rel(file)}](${rel(file)})`
    const size = `${viewport.width}×${viewport.height}`
    const settled = await settleLayout(page)
    await page.screenshot({ path: file })
    const m = await measure(page)
    let found = null
    let canvas = { content: false, text: 'not measured' }
    try {
      canvas = await canvasSeen(page)
    } catch (error) {
      failures.push([`${size} ${name}: canvas pixels`, String(error.message ?? error).split('\n')[0]])
    }
    try {
      found = await page.evaluate(inspectPage, { kind, probes, canvasContent: canvas.content })
    } catch (error) {
      failures.push([`${size} ${name}: layout measurements`, String(error.message ?? error).split('\n')[0]])
    }
    let band = 'not measured'
    let wrapped = 'not measured'
    let underFrame = 'not measured'
    if (found) {
      const percent = (100 * found.band.h) / found.band.viewport
      const text = `${fmt(found.band.h)} px = ${fmt(percent, 1)} % of the height, y ${fmt(found.band.top)}–${fmt(found.band.bottom)}, between ${found.band.above} and ${found.band.below}`
      const flagged = percent > EMPTY_FLAG_PERCENT
      band = flagged ? `**⚠ ${text}**` : text
      if (flagged)
        lane.flags.push([link, size, `${fmt(percent, 1)} %`, `y ${fmt(found.band.top)}–${fmt(found.band.bottom)}`])
      wrapped = found.wraps.length ? `**${found.wraps.length}** (see the wrapped table)` : 'none'
      for (const [element, text, lines] of found.wraps) lane.wraps.push([link, size, element, text, lines])
      underFrame = found.crossed.length ? `**${found.crossed.length}** (see the focus-frame table)` : 'none'
      for (const [control, element, text] of found.crossed) lane.crossed.push([link, size, control, element, text])
      for (const [label, value] of found.measures) lane.measures.push([link, size, label, value])
    }
    lane.rows.push([
      link,
      size,
      m.scrollsX ? '**yes**' : 'no',
      m.minFont === null ? '–' : `${fmt(m.minFont, 1)} px (${m.minFontWhere})`,
      m.minButton ? `${m.minButton.w}×${m.minButton.h} (${m.minButton.what})` : '–',
      band,
      wrapped,
      underFrame,
      canvas.text,
      settled ? note : `${note} **(layout still moving after 3 s)**`.trim()
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
  const desktopLane = newLane()
  const runDesktop = async () => {
    const lane = desktopLane
    const snap = (page, name, note, kind) => shot(lane, page, desktop, name, note, kind, kind !== 'play')
    {
      const { context, page } = await openPage({ label: 'screens 1280x720 fresh', viewport: desktop })
      try {
        await step('title', async () => {
          await gotoTitle(page)
          await page.waitForTimeout(2000)
          await snap(page, '01-title-2s', 'fresh save, demo running', 'title')
          await page.waitForTimeout(4000)
          await snap(page, '02-title-6s', 'the demo has moved on', 'title')
        })
        await step('help', async () => {
          await page.locator('#help-open').click()
          await page.waitForTimeout(400)
          await snap(page, '03-help')
          await page.locator('#help-done').click()
          await page.waitForTimeout(250)
        })
        await step('opening story', async () => {
          await page.locator('#start').click()
          await page.waitForFunction(() => window.__hamham.app.screen === 'story', null, { timeout: 10_000 })
          await page.waitForTimeout(500)
          const pages = await walkStory(page, false, {
            onPage: async (index) => snap(page, `04-opening-page${index + 1}`, 'text complete', 'story')
          })
          lane.rows.push([`(opening story: ${pages} pages)`, '', '', '', '', '', '', '', ''])
        })
        await step('select fresh', async () => {
          await page.waitForFunction(() => window.__hamham.app.screen === 'select', null, { timeout: 10_000 })
          await page.waitForTimeout(700)
          await snap(page, '05-select-fresh', 'only stage 1 open', 'select')
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
          await snap(page, '06-title-continue', 'save with 9 stages cleared', 'title')
          await page.locator('#continue').click()
          await page.waitForSelector('.stage-card')
          await page.waitForTimeout(800)
          await snap(page, '07-select-all', 'everything unlocked', 'select')
        })
        await step('stage story', async () => {
          await page.locator('.stage-card').nth(0).click()
          await page.waitForFunction(() => window.__hamham.app.screen === 'story', null, { timeout: 10_000 })
          await page.waitForTimeout(400)
          await walkStory(page, false, {
            onPage: (index) => snap(page, `08-stage1-story-page${index + 1}`, '', 'story')
          })
        })
        for (const [no, theme] of PLAY_WORLDS) {
          await step(`play stage ${no}`, async () => {
            await startStage(page, no)
            await waitStartDone(page)
            await makeSafe(page)
            await page.keyboard.down('ArrowRight')
            await page.waitForTimeout(1000)
            await page.keyboard.up('ArrowRight')
            await snap(page, `09-play-stage${String(no).padStart(2, '0')}-${theme}`, `world ${theme}`, 'play')
          })
        }
        await step('pause', async () => {
          await startStage(page, 1)
          await waitStartDone(page)
          await page.keyboard.press('Escape')
          await page.waitForSelector('#pause-screen:not([hidden])', { timeout: 5000 })
          await page.waitForTimeout(500)
          await snap(page, '10-pause', '', 'pause')
        })
        await step('result', async () => {
          await startStage(page, 2)
          await clearStage(page)
          await page.waitForFunction(() => window.__hamham.app.screen === 'result', null, { timeout: 5000 })
          await page.waitForTimeout(3500)
          await snap(page, '11-result', 'stage 2, tally finished')
        })
        await step('game over', async () => {
          await startStage(page, 3)
          await waitStartDone(page)
          await pinRandom(page)
          await page.evaluate(() => {
            const w = window.__hamham.world
            w.player.hp = 1
            w.player.invuln = 0
            w.hurtPlayer(9, w.player.x - 10)
          })
          await page.waitForFunction(() => window.__hamham.app.screen === 'dead', null, { timeout: 15_000 })
          await page.evaluate(() => window.__unpinRandom())
          await page.waitForTimeout(1500)
          await snap(page, '12-game-over', 'lost the last heart in play (first of the random lines)', 'dead')
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
            await snap(page, `13-ending-page${index + 1}`, '', 'ending')
            await page.locator('#ending-next').click()
            await page.waitForTimeout(450)
          }
          await page.waitForTimeout(500)
          await creditsAndCard(page, snap, 14, 'credits')
        })
      } finally {
        await context.close()
      }
    }
  }

  // --- touch: title, select, story, play, pause, result, game over, ending and the credits
  const touchViewports = [
    { width: 844, height: 390 },
    { width: 390, height: 844 },
    { width: 320, height: 568 }
  ]
  const touchLanes = touchViewports.map(newLane)
  const runTouch = async (viewport, lane) => {
    const tag = `touch ${viewport.width}x${viewport.height}`
    const snap = (page, name, note, kind) => shot(lane, page, viewport, name, note, kind, true)
    {
      // the title with a fresh save (the main page below carries a save)
      const fresh = await openPage({
        label: `screens ${viewport.width}x${viewport.height} touch fresh`,
        viewport,
        touch: true
      })
      try {
        await step(`${tag} title fresh`, async () => {
          await gotoTitle(fresh.page)
          await fresh.page.waitForTimeout(2000)
          await snap(fresh.page, '00-title-fresh', 'touch, fresh save', 'title')
        })
      } finally {
        await fresh.context.close()
      }
    }
    const { context, page } = await openPage({
      label: `screens ${viewport.width}x${viewport.height} touch`,
      viewport,
      touch: true,
      save: UNLOCKED_SAVE
    })
    try {
      await step(`${tag} title`, async () => {
        await gotoTitle(page)
        await page.waitForTimeout(2000)
        await snap(page, '01-title', 'touch, save with 9 stages cleared', 'title')
      })
      await step(`${tag} select`, async () => {
        await page.locator('#continue').tap()
        await page.waitForSelector('.stage-card')
        await page.waitForTimeout(800)
        await snap(page, '02-select', 'touch', 'select')
      })
      await step(`${tag} story`, async () => {
        await page.locator('.stage-card').nth(1).tap()
        await page.waitForFunction(() => window.__hamham.app.screen === 'story', null, { timeout: 10_000 })
        await page.waitForTimeout(400)
        await finishTyping(page)
        await snap(page, '03-story', 'touch, stage 2, page 1, text complete', 'story')
        await walkStory(page, true)
        await page.waitForFunction(() => window.__hamham.app.screen === 'play', null, { timeout: 10_000 })
      })
      await step(`${tag} play`, async () => {
        await waitStartDone(page)
        await page.touchscreen.tap(viewport.width / 2, viewport.height / 3)
        await makeSafe(page)
        await page.waitForTimeout(700)
        await snap(page, '04-play', 'touch controls visible after a tap', 'play')
      })
      await step(`${tag} pause`, async () => {
        await page.locator('#pause').tap()
        await page.waitForSelector('#pause-screen:not([hidden])', { timeout: 5000 })
        await page.waitForTimeout(500)
        await snap(page, '05-pause', 'touch', 'pause')
        await page.locator('#pause-resume').tap()
        await page.waitForTimeout(300)
      })
      await step(`${tag} result`, async () => {
        await clearStage(page)
        await page.waitForFunction(() => window.__hamham.app.screen === 'result', null, { timeout: 5000 })
        await page.waitForTimeout(3500)
        await snap(page, '06-result', 'touch, stage 2, tally finished')
      })
      await step(`${tag} game over`, async () => {
        await startStage(page, 3, { touch: true })
        await waitStartDone(page)
        await pinRandom(page)
        await page.evaluate(() => {
          const w = window.__hamham.world
          w.player.hp = 1
          w.player.invuln = 0
          w.hurtPlayer(9, w.player.x - 10)
        })
        await page.waitForFunction(() => window.__hamham.app.screen === 'dead', null, { timeout: 15_000 })
        await page.evaluate(() => window.__unpinRandom())
        await page.waitForTimeout(1500)
        await snap(page, '07-game-over', 'touch, lost the last heart in play (first of the random lines)', 'dead')
      })
      await step(`${tag} ending`, async () => {
        await gotoTitle(page)
        await page.evaluate(() => window.__hamham.openEnding())
        await page.waitForTimeout(700)
        await finishTyping(page)
        await snap(page, '08-ending-page', 'touch, first ending page, text complete', 'ending')
        for (let index = 0; index < 14; index++) {
          const credits = await page.evaluate(() => {
            const el = document.querySelector('#ending-credits')
            return Boolean(el) && !el.hidden
          })
          if (credits) break
          await finishTyping(page)
          await page.locator('#ending-next').tap()
          await page.waitForTimeout(450)
        }
        await page.waitForTimeout(500)
        // The roll is a CSS animation: hold it at fixed points instead of waiting for them.
        await creditsAndCard(page, snap, 9, 'touch credits')
      })
    } finally {
      await context.close()
    }
  }

  await Promise.all([runDesktop(), ...touchViewports.map((viewport, index) => runTouch(viewport, touchLanes[index]))])

  const lanes = [desktopLane, ...touchLanes]
  const rows = lanes.flatMap((lane) => lane.rows)
  const measures = lanes.flatMap((lane) => lane.measures)
  const wraps = lanes.flatMap((lane) => lane.wraps)
  const crossed = lanes.flatMap((lane) => lane.crossed)
  const flags = lanes.flatMap((lane) => lane.flags)

  const body = [
    'Text size is the smallest computed `font-size` of any visible DOM text; it does not see text drawn on the',
    'canvas. The button size is the smallest visible button-like element (buttons, links, inputs, touch pad).',
    '',
    '**Tallest empty band**: the visible text lines, buttons, images, canvases with painted pixels and elements with a',
    'background image or a border (the page background, screen backdrops and elements covering 90 % of the viewport',
    'do not) are projected on the vertical axis. **The game canvas counts as the stage rectangle when it is really',
    `seen: the stage rectangle is captured with \`#game\` visible, again with it \`visibility: hidden\` and once more`,
    `with it visible. A pixel "differs" when any colour channel is more than ${CANVAS_CHANNEL_MIN} (of 255) apart. The canvas is content`,
    `when the share of pixels that differ between the first two captures, minus the share that differ between the`,
    `first and the third (what moves anyway: animated art, a live scene), is at least ${CANVAS_SHARE_MIN * 100} % (column "game canvas seen by`,
    'pixels"); a black stage or one hidden under an opaque screen is not content.** The longest',
    'stretch no rectangle touches is reported in px, as a share of the viewport height, with its top and bottom y and',
    `the two things it lies between. A share above ${EMPTY_FLAG_PERCENT} % is flagged with ⚠.`,
    '',
    md.table(SCREEN_COLUMNS, rows),
    '',
    '### Empty bands above ' + EMPTY_FLAG_PERCENT + ' %',
    '',
    flags.length ? md.table(['file', 'viewport', 'empty share', 'where'], flags) : 'None.',
    '',
    '### Layout measurements',
    '',
    'Every viewport (the touch ones always, 1280×720 for all screens but play). Story and ending pages:',
    '`.story-layout` margins, whether the footer buttons share a row, and `.story-art` with the canvas aspect check',
    '(backing `width / height` against the aspect of its CSS box; more than 2 % apart is **cropped**). Play (touch):',
    '`#stage-wrap`, `#touch-controls`, the deck `.hudd`, `#pause` and `#mute` (inside the stage or under it) and the',
    'smallest deck text. Title: the rects of `#stage-wrap`, `.logo-art`, `.title-menu`, the progress element and',
    '`.title-foot`, and the tallest stretch of the viewport that neither a visible title element nor the demo (the game',
    'canvas, where it is really seen) touches. Game over: `.dead-card`,',
    'its share of the frame height and the margins above and below. Pause: the panel and every descendant reaching',
    'outside its padding box. Credits: the roll is held at 20, 50 and 80 %; `#ending-credits` coverage of the frame',
    '(frame = `#stage-wrap` in landscape, the viewport in portrait; bold under 60 % of the height); credit entries',
    'counted as wholly visible, in the fade zone or cut by a hard edge, where the fade is read from the computed',
    '`mask-image` of `.credits-window` (an entry crossing an edge that fades is fading; with no mask every crossing',
    'entry is cut). The card after the roll: whether `#ending-select` and `#ending-title-button` share a row. "not',
    'found" means the element is not on the page.',
    '',
    md.table(['file', 'viewport', 'measurement', 'value'], measures),
    '',
    '### Headings and buttons whose text wraps onto more than one line',
    '',
    wraps.length ? md.table(['file', 'viewport', 'element', 'text', 'lines'], wraps) : 'None.',
    '',
    '### Text under the keyboard-focus frame',
    '',
    'A focused button or stage card draws a blinking frame around itself (its `::after`, reaching 12 px outside its',
    'box and a little more below a raised button). Any of them can get the focus, so the frame of every button and',
    'card on screen is checked, focused or not: every visible line of text that the band of a frame would cross is',
    'listed, unless the text is stacked above the frame (a z-index of its own, as the tag of the newest stage has).',
    'With the help or the pause screen open, only that screen is checked (what lies under it cannot be focused).',
    '',
    crossed.length ? md.table(['file', 'viewport', 'control', 'element under its frame', 'text'], crossed) : 'None.',
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

// ------------------------------------------------------------------------------------- phone staging (390×844)

/** Runs inside the page: what the staged pieces and the deck say right now, and which visible pieces overlap. */
function describeStaging() {
  const text = (el) => (el ? el.textContent.replace(/\s+/g, ' ').trim() : '')
  const opacityOf = (el) => {
    let o = 1
    for (let n = el; n && n.nodeType === 1; n = n.parentElement) o *= Number(getComputedStyle(n).opacity)
    return o
  }
  const live = (el) => {
    if (!el || el.closest('[hidden]')) return false
    const s = getComputedStyle(el)
    const r = el.getBoundingClientRect()
    return s.display !== 'none' && s.visibility !== 'hidden' && r.width > 0 && r.height > 0 && opacityOf(el) > 0.15
  }
  const q = (selector) => document.querySelector(selector)
  const banner = q('.hudx-banner')
  const call = q('.hudx-call')
  const plate = q('.hudx-plate')
  const toast = q('.hudx-toast')
  const showing = (el) => Boolean(el) && el.classList.contains('is-show') && live(el)
  const pieces = [
    ['card', banner, showing(banner)],
    ['call', call, showing(call)],
    ['nameplate', plate, showing(plate)],
    ['hearts', q('#hearts'), live(q('#hearts'))],
    ['boss bar', q('#boss-bar'), live(q('#boss-bar'))],
    ['#pause', q('#pause'), live(q('#pause'))],
    ['#mute', q('#mute'), live(q('#mute'))]
  ]
  const on = pieces.filter(([, , shown]) => shown)
  const overlaps = []
  for (let i = 0; i < on.length; i++)
    for (let j = i + 1; j < on.length; j++) {
      const a = on[i][1].getBoundingClientRect()
      const b = on[j][1].getBoundingClientRect()
      const w = Math.min(a.right, b.right) - Math.max(a.left, b.left)
      const h = Math.min(a.bottom, b.bottom) - Math.max(a.top, b.top)
      if (w > 1 && h > 1) overlaps.push(`${on[i][0]} × ${on[j][0]} (${Math.round(w)}×${Math.round(h)} px)`)
    }
  const hamham = window.__hamham
  const view = hamham?.view ?? hamham?.app?.session?.view
  const overlay = view?.overlay
  // Bubbles that draw their words on the stage, and wordless balloons (their words are on the deck).
  const worded = overlay?.bubbleRects
  const wordless = overlay?.emoteRects
  const bubbles = Array.isArray(worded)
    ? [
        ...worded.map((b) => b.text),
        ...(Array.isArray(wordless) ? wordless.map(() => '(wordless balloon over the speaker)') : [])
      ]
    : overlay?.bubbleTexts
  const aim = q('.hudd-aim')
  const hint = q('.hudd-hint')
  const say = q('.hudd-say')
  const session = hamham?.app?.session
  return {
    screen: hamham?.app?.screen ?? null,
    moment: session?.director?.current ?? null,
    card: !banner
      ? 'not found'
      : showing(banner)
        ? [text(banner.querySelector('b')), text(banner.querySelector('span'))].filter(Boolean).join(' / ')
        : null,
    call: !call ? 'not found' : showing(call) ? text(call) : null,
    nameplate: !plate
      ? 'not found'
      : showing(plate)
        ? [text(plate.querySelector('b')), text(plate.querySelector('span'))].filter(Boolean).join(' / ')
        : null,
    toast: !toast ? 'not found' : showing(toast) ? text(toast) : null,
    aim: aim ? (live(aim) ? text(aim) : '(hidden)') : 'not found',
    hint: hint
      ? live(hint)
        ? `${hint.classList.contains('is-toast') ? '(toast) ' : ''}${text(hint)}`
        : '(hidden)'
      : 'not found',
    speech: !say
      ? 'not found'
      : live(say)
        ? `${text(say.querySelector('small'))}: ${text(say.querySelector('b'))} (${Math.round(parseFloat(getComputedStyle(say.querySelector('b')).fontSize))} px${say.querySelector('canvas, img') ? ', with the face' : ''})`
        : null,
    bubbles: Array.isArray(bubbles) ? bubbles : null,
    visible: on.map(([name]) => name),
    overlaps
  }
}

/** Milliseconds on the recorder's clock (since the last `__rk.start()`). */
const rkNow = (page) => page.evaluate(() => performance.now() - window.__rk.mark)

/** Waits until the recorder's clock reaches `ms`. */
async function waitClock(page, ms) {
  for (;;) {
    const now = await rkNow(page)
    if (now >= ms) return now
    await sleep(Math.min(ms - now, 40))
  }
}

/**
 * Waits until the director's current moment is `moment` (or, with `leave`, the app left the play screen); resolves with
 * the recorder's clock then, or null on timeout.
 */
async function waitMoment(page, moment, timeoutMs, leave = false) {
  try {
    const handle = await page.waitForFunction(
      ([name, leaves]) => {
        const app = window.__hamham.app
        const hit = app.session?.director?.current === name || (leaves && app.screen !== 'play')
        return hit ? performance.now() - window.__rk.mark : false
      },
      [moment, leave],
      { timeout: timeoutMs, polling: 'raf' }
    )
    return await handle.jsonValue()
  } catch {
    return null
  }
}

async function runPhoneStaging(dir, failures) {
  const rows = []
  const phone = { width: 390, height: 844 }
  const base = join(dir, 'phone')
  mkdirSync(base, { recursive: true })
  /** One frame: the description first, the JPEG right after (it is up to ~0.1 s later than the description). */
  const frame = async (page, series, label, reference) => {
    const d = await page.evaluate(describeStaging)
    const at = await rkNow(page)
    const name = `${series}-${String(rows.filter((r) => r.series === series).length + 1).padStart(2, '0')}-${String(Math.round(at)).padStart(5, '0')}ms.jpg`
    mkdirSync(join(base, series), { recursive: true })
    await page.screenshot({ path: join(base, series, name), type: 'jpeg', quality: 85 })
    rows.push({ series, name, label, since: reference === null ? null : at - reference, d })
  }
  const attempt = async (series, fn) => {
    const { context, page } = await openPage({
      label: `staging phone ${series}`,
      viewport: phone,
      touch: true,
      save: UNLOCKED_SAVE
    })
    try {
      await fn(page)
    } catch (error) {
      failures.push([`phone ${series}`, String(error.message ?? error).split('\n')[0]])
    } finally {
      await context.close()
    }
  }
  const missed = (series, what) => failures.push([`phone ${series}`, `${what} never came`])

  // stage 1 start: 0.2, 0.7, 1.3 and 2.0 s after the play screen appeared
  await attempt('s1-start', async (page) => {
    await startStage(page, 1, { touch: true, markStart: true })
    const playAt = await page.evaluate(() => window.__rk.log.find((row) => row.screen === 'play')?.t ?? 0)
    for (const seconds of [0.2, 0.7, 1.3, 2.0]) {
      await waitClock(page, playAt + seconds * 1000)
      await frame(page, 's1-start', `${seconds.toFixed(1)} s after play began`, playAt)
    }
  })

  // stage 5: boss intro, defeat and goal reveal, clear
  await attempt('s5', async (page) => {
    await startStage(page, 5, { touch: true })
    await waitStartDone(page)
    await waitCallGone(page)
    await makeSafe(page, 40)
    await page.evaluate(() => window.__rk.start())
    await nearBoss(page, 260)
    await page.keyboard.down('ArrowRight')
    const introAt = await waitMoment(page, 'boss-intro', 8000)
    if (introAt === null) missed('s5-boss-intro', 'the boss-intro moment')
    else
      for (const seconds of [0.25, 1.0, 2.0]) {
        await waitClock(page, introAt + seconds * 1000)
        await frame(page, 's5-boss-intro', `${seconds.toFixed(2)} s into boss-intro`, introAt)
      }
    await page.keyboard.up('ArrowRight')
    await waitStartDone(page, 10_000)
    await makeSafe(page, 60)
    await waitCallGone(page)
    let fell = false
    for (let tryNo = 0; tryNo < 16 && !fell; tryNo++) {
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
    if (!fell) failures.push(['phone s5-boss-defeat', 'the boss did not fall after 16 bites'])
    else {
      const deadAt = await rkNow(page)
      await waitClock(page, deadAt + 300)
      await frame(page, 's5-boss-defeat', '0.3 s after the boss fell', deadAt)
      const revealAt = await waitMoment(page, 'goal-reveal', 10_000)
      if (revealAt === null) {
        await waitClock(page, deadAt + 2500)
        await frame(page, 's5-boss-defeat', '2.5 s after the boss fell (goal-reveal never started)', deadAt)
        await waitClock(page, deadAt + 3700)
        await frame(page, 's5-boss-defeat', '3.7 s after the boss fell', deadAt)
      } else {
        await waitClock(page, revealAt + 400)
        await frame(page, 's5-boss-defeat', '0.4 s into goal-reveal', revealAt)
        await waitClock(page, revealAt + 1600)
        await frame(page, 's5-boss-defeat', '1.6 s into goal-reveal', revealAt)
      }
    }
    // clear
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
    try {
      const clearAt = await waitMoment(page, 'clear', 14_000, true)
      if (clearAt === null) missed('s5-clear', 'the clear moment')
      else
        for (const seconds of [0.3, 1.2, 2.4]) {
          await waitClock(page, clearAt + seconds * 1000)
          await frame(page, 's5-clear', `${seconds.toFixed(1)} s after the clear began`, clearAt)
        }
    } finally {
      await page.keyboard.up('ArrowRight')
    }
  })

  // death on stage 3: 0.3, 1.2 and 2.5 s after the last heart went
  await attempt('s3-death', async (page) => {
    await startStage(page, 3, { touch: true })
    await waitStartDone(page)
    await waitCallGone(page)
    await page.waitForTimeout(600)
    await page.evaluate(() => {
      const w = window.__hamham.world
      w.player.hp = 1
      w.player.invuln = 0
      window.__rk.start()
      w.hurtPlayer(9, w.player.x - 10)
    })
    for (const seconds of [0.3, 1.2, 2.5]) {
      await waitClock(page, seconds * 1000)
      await frame(page, 's3-death', `${seconds.toFixed(1)} s after the last heart went`, 0)
    }
  })
  return rows
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

  let phoneRows = []
  try {
    phoneRows = await runPhoneStaging(dir, failures)
  } catch (error) {
    failures.push(['phone staging', String(error.message ?? error).split('\n')[0]])
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
    '### Phone 390×844 (touch)',
    '',
    'The same staged moments on an upright phone (touch, 390×844). The text columns are read from the DOM and the',
    "game's own state in the instant before the JPEG is taken (the picture can be up to ~0.1 s later): the stage",
    "card (`.hudx-banner`), the call (`.hudx-call`), the boss nameplate (`.hudx-plate`), the deck's aim line",
    '(`.hudd-aim`) and hint line (`.hudd-hint`, "(toast)" when it carries a toast; both step aside, "(hidden)", while',
    "a character speaks), the deck's speech line (`.hudd-say`: who speaks, the words, their size), the toast and the",
    'bubbles on the stage (`view.overlay.bubbleRects` for bubbles with words, `emoteRects` for the wordless balloon',
    'that marks the speaker while the words are on the deck); "–" means nothing is shown, "not found" that the element is missing. A',
    'piece counts as visible when it is shown (`is-show` for card, call and nameplate), not hidden and above 15 %',
    'opacity. **Overlaps** lists every pair of visible pieces (card, call, nameplate, hearts, boss bar, `#pause`,',
    '`#mute`) whose boxes share more than 1×1 px. "since" is the time from the named reference (the start of the',
    'play screen or of the named moment, the clear, the death).',
    '',
    phoneRows.length
      ? md.table(
          [
            'frame',
            'since',
            'screen / moment',
            'card',
            'call',
            'nameplate',
            'deck aim',
            'deck hint',
            'deck speech',
            'toast',
            'bubbles on the stage',
            'visible pieces',
            'overlaps'
          ],
          phoneRows.map(({ series, name, label, since, d }) => [
            `[${series}/${name}](${rel(join(dir, 'phone', series, name))}) ${label}`,
            since === null ? '–' : `${fmt(since / 1000, 2)} s`,
            `${d.screen}${d.moment ? ` / ${d.moment}` : ''}`,
            d.card ?? '–',
            d.call ?? '–',
            d.nameplate ?? '–',
            d.aim,
            d.hint,
            d.speech ?? '–',
            d.toast ?? '–',
            d.bubbles === null ? 'not exposed' : d.bubbles.length ? d.bubbles.join(' / ') : '–',
            d.visible.join(', ') || '–',
            d.overlaps.length ? `**${d.overlaps.join('; ')}**` : 'none'
          ])
        )
      : 'No phone frames were taken.',
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
