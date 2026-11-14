/**
 * Performance kit for 星のハムハム: plays the game the way a phone would and writes down everything that can make a
 * person feel a freeze, with a PASS or FAIL for each budget.
 *
 * Usage: node scripts/hoshi-no-hamham-perf.mjs [--only boot,menus,play,boss,pacing] [--stages 1,3,5 | all]
 *                                             [--seconds 30] [--profiles landscape,portrait] [--throttle 4]
 *                                             [--dev] [--gpu] [--check] [--raw] [--tries 3] [--every 2]
 *                                             [--out DIR]
 *   --only      sections to run (default: all five). A section that fails is reported and the others still run.
 *   --stages    stages of the play section (default 1,3,5; `all` is 1 to 10)
 *   --seconds   seconds recorded per stage and profile in the play section (default 30)
 *   --profiles  landscape = 844x390, ratio 3, touch and mobile; portrait = 390x844, ratio 3 (default: both)
 *   --throttle  Chrome's CPU throttle for the runs (default 4; 1 = none). The budgets are stated for 4.
 *   --dev       measure the Vite dev server instead of a production build made by the kit
 *   --gpu       full Chromium with the GPU on, so frame intervals mean something (see the README)
 *   --check     exit code 1 when any budget fails
 *   --raw       also write the per-frame log of every run to raw-<run>.json
 *   --trace     also write a Chromium trace of every recorded run to trace-<run>.json (large; what the main thread
 *               and the GPU process did in a slow frame: garbage collection, layout, paint, commits)
 *   --tries     how often a recorded run may be made (default 1). A run in which the game's thread was kept from
 *               running from outside (the machine was busy with something else; see `held` below) is set aside and
 *               made again, up to this many times; the report says how many were set aside
 *   --every     the page gets only every nth frame of the display (default 1: all of them). The monitor of the
 *               machine sets the display's rate; on a 120 Hz monitor `--every 2` gives the page the 60 frames a
 *               second of most phones, each with 16.7 ms to do its work in
 *   --out       output folder (default .build/hoshi-no-hamham-perf/, ignored by Git)
 *
 * Output: report.md (command, environment, the budget summary, one part per section) and report.json (the same
 * numbers as data). Exit code 1 for a page error, a console error, a failed request or a failed section, and for
 * a failed budget with --check; 2 for a bad command line.
 *
 * Hooks used (src/main.ts): window.__hamham.{app, world, view, stats, autopilot}. Beyond them the kit reads members
 * that are `private` only in TypeScript: app.screen, app.session, app.screens.typer, app.audio.engine, app.hud.
 *
 * The production build goes to the output folder (dist/ is not touched) and is served by `vite preview` on a free
 * port. Servers and browsers are closed on success, on failure and on Ctrl-C.
 */
import { spawnSync } from 'node:child_process'
import { mkdirSync, writeFileSync } from 'node:fs'
import { createServer as createNetServer } from 'node:net'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { chromium } from 'playwright'
import { createServer, preview, build as viteBuild } from 'vite'

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const viteConfig = join(root, 'vite.config.hoshi-no-hamham.mjs')

// ------------------------------------------------------------------------------------------------ arguments

const args = process.argv.slice(2)
const flag = (name) => args.includes(name)
const valueOf = (name) => (args.includes(name) ? args[args.indexOf(name) + 1] : undefined)
const usage = (message) => {
  console.error(message)
  process.exit(2)
}

const SECTIONS = ['boot', 'menus', 'play', 'boss', 'pacing']
const onlyArg = valueOf('--only')
const wanted = new Set(onlyArg ? onlyArg.split(',').map((s) => s.trim()) : SECTIONS)
for (const name of wanted)
  if (!SECTIONS.includes(name)) usage(`Unknown section "${name}". Sections: ${SECTIONS.join(', ')}`)

const stagesArg = valueOf('--stages') ?? '1,3,5'
const stages = stagesArg === 'all' ? [1, 2, 3, 4, 5, 6, 7, 8, 9, 10] : stagesArg.split(',').map((s) => Number(s.trim()))
for (const no of stages)
  if (!Number.isInteger(no) || no < 1 || no > 10) usage(`Bad stage "${no}" in --stages (1 to 10)`)

const seconds = Number(valueOf('--seconds') ?? 30)
if (!(seconds > 0)) usage('--seconds must be a positive number')

const PROFILES = {
  landscape: { width: 844, height: 390, dpr: 3 },
  portrait: { width: 390, height: 844, dpr: 3 }
}
const profileNames = (valueOf('--profiles') ?? 'landscape,portrait').split(',').map((s) => s.trim())
for (const name of profileNames)
  if (!PROFILES[name]) usage(`Unknown profile "${name}". Profiles: ${Object.keys(PROFILES).join(', ')}`)

const throttle = Number(valueOf('--throttle') ?? 4)
if (!(throttle >= 1)) usage('--throttle must be 1 or more')
const dev = flag('--dev')
const gpu = flag('--gpu')
const check = flag('--check')
const raw = flag('--raw')
const trace = flag('--trace')
const tries = Number(valueOf('--tries') ?? 1)
if (!Number.isInteger(tries) || tries < 1) usage('--tries must be a whole number, 1 or more')
const every = Number(valueOf('--every') ?? 1)
if (!Number.isInteger(every) || every < 1) usage('--every must be a whole number, 1 or more')
/**
 * A slice of the game's thread counts as kept from running from outside when this many milliseconds of its clock
 * time, and this share of it, are not explained by the thread's own running time under the throttle.
 */
const HELD_MS = 8
const HELD_SHARE = 0.4
/**
 * What every recorded run is traced with, to count garbage collections, style and layout work and shader
 * compilation: the timeline's own events, V8's, Skia's shader events and the page's marks.
 */
const LIGHT_CATEGORIES = ['devtools.timeline', 'v8', 'blink.user_timing', 'disabled-by-default-skia.shaders']
/** What --trace adds for reading by hand: the collector's phases, top-level tasks, the compositor and the GPU. */
const TRACE_CATEGORIES = [...LIGHT_CATEGORIES, 'disabled-by-default-v8.gc', 'toplevel', 'cc', 'viz', 'gpu']
const out = resolve(valueOf('--out') ?? join(root, '.build/hoshi-no-hamham-perf'))

// ------------------------------------------------------------------------------------------------- budgets

/**
 * Every budget: the id, the sections it applies to, what it limits and the limit. `judge(run)` gives the measured
 * value as text and whether it is within the limit (null when the budget does not apply to this run). Stated for
 * --throttle 4.
 */
const BUDGETS = [
  {
    id: 'P1',
    sections: ['play', 'boss'],
    what: 'frames with loop JS over 16.7 ms',
    limit: '0',
    judge: (m) => ({ value: String(m.js.over16), ok: m.js.over16 === 0 })
  },
  {
    id: 'P2',
    sections: ['play', 'boss'],
    what: 'loop JS p99',
    limit: 'at most 8 ms',
    judge: (m) => ({ value: `${f1(m.js.p99)} ms`, ok: m.js.p99 <= 8 })
  },
  {
    id: 'P3',
    sections: ['play', 'boss'],
    what: 'long tasks',
    limit: '0',
    judge: (m) => ({ value: String(m.longtasks.count), ok: m.longtasks.count === 0 })
  },
  {
    id: 'P4',
    sections: ['play', 'boss'],
    what: 'art painted on the main thread',
    limit: '0 clips, 0 tiles, 0 backdrops, 0 decor',
    judge: (m) => ({ value: artText(m.art), ok: m.art.clips + m.art.tiles + m.art.backdrops + m.art.decor === 0 })
  },
  {
    id: 'P5',
    sections: ['play', 'boss'],
    what: 'sound effects built live',
    limit: 'at most 20 % of those started',
    judge: (m) => {
      const started = m.sfx.buffered + m.sfx.live
      const share = started ? m.sfx.live / started : 0
      return { value: `${m.sfx.live} of ${started} (${f1(share * 100)} %)`, ok: share <= 0.2 }
    }
  },
  {
    id: 'P6',
    sections: ['play', 'boss'],
    what: 'longest music scheduler tick',
    limit: 'at most 8 ms',
    judge: (m) => ({ value: `${f1(m.ticks.max)} ms`, ok: m.ticks.max <= 8 })
  },
  {
    id: 'P7',
    sections: ['play', 'boss'],
    what: 'frame intervals over 2.5 x the median (only with --gpu)',
    limit: '0',
    judge: (m) =>
      gpu
        ? { value: String(m.interval.overMedian), ok: m.interval.overMedian === 0 }
        : { value: 'not judged without --gpu', ok: null }
  },
  {
    id: 'G1',
    sections: ['play', 'boss'],
    what: 'major garbage collections per 1000 frames',
    limit: 'at most 2',
    judge: (m) =>
      m.trace
        ? {
            value: `${f1(m.trace.gc.majorPer1000)} (${m.trace.gc.major} in ${m.trace.frames} frames)`,
            ok: m.trace.gc.majorPer1000 <= 2
          }
        : { value: 'no trace', ok: null }
  },
  {
    id: 'L1',
    sections: ['play', 'boss'],
    what: 'frames in which the page was laid out',
    limit: 'at most 5 %',
    judge: (m) =>
      m.trace
        ? {
            value: `${f1(m.trace.layout.share * 100)} % (${m.trace.layout.count} layouts)`,
            ok: m.trace.layout.share <= 0.05
          }
        : { value: 'no trace', ok: null }
  },
  {
    id: 'S1',
    sections: ['play', 'boss'],
    what: 'longest stall for compiling shaders on first use (only with --gpu)',
    limit: 'at most 16 ms',
    judge: (m) =>
      gpu && m.trace
        ? {
            value: `${f0(m.trace.shaders.longest)} ms (${m.trace.shaders.programs} programs in ${m.trace.shaders.bursts.length} bursts)`,
            ok: m.trace.shaders.longest <= 16
          }
        : { value: 'not judged without --gpu', ok: null }
  },
  {
    id: 'C1',
    sections: ['pacing'],
    what: 'cadence breaks (frames on time whose picture did not advance like the frames before it)',
    limit: '0',
    judge: (m) => ({ value: String(m.cadence.breaks), ok: m.cadence.breaks === 0 })
  },
  {
    id: 'M1',
    sections: ['menus'],
    what: 'longest task of a step',
    limit: 'at most 150 ms',
    judge: (step) => ({ value: `${f0(step.longtasks.max)} ms`, ok: step.longtasks.max <= 150 })
  },
  {
    id: 'M2',
    sections: ['menus'],
    what: 'art painted on the main thread in a step',
    limit: '0 clips, 0 tiles, 0 backdrops',
    judge: (step) => ({ value: artText(step.art), ok: step.art.clips + step.art.tiles + step.art.backdrops === 0 })
  },
  {
    id: 'B1',
    sections: ['boot'],
    what: 'longest task',
    limit: 'at most 250 ms',
    judge: (m) => ({ value: `${f0(m.longtasks.max)} ms`, ok: m.longtasks.max <= 250 })
  }
]

// -------------------------------------------------------------------------------------------------- helpers

const sleep = (ms) => new Promise((done) => setTimeout(done, ms))
const num = (n, digits) => (n === null || n === undefined || Number.isNaN(n) ? '-' : n.toFixed(digits))
const f0 = (n) => num(n, 0)
const f1 = (n) => num(n, 1)
const f2 = (n) => num(n, 2)
const esc = (text) => String(text).replaceAll('|', '\\|').replaceAll('\n', ' ')
const table = (headers, rows) => {
  if (!rows.length) return '_(no rows)_\n'
  return [
    `| ${headers.join(' | ')} |`,
    `| ${headers.map(() => '---').join(' | ')} |`,
    ...rows.map((row) => `| ${row.map((cell) => esc(cell ?? '')).join(' | ')} |`)
  ].join('\n')
}
const percentile = (sorted, p) =>
  sorted.length ? sorted[Math.min(sorted.length - 1, Math.floor(sorted.length * p))] : 0
const sum = (list) => list.reduce((a, b) => a + b, 0)
const mean = (list) => (list.length ? sum(list) / list.length : 0)
const sortedAsc = (list) => [...list].sort((a, b) => a - b)
const artText = (art) => `${art.clips} clips, ${art.tiles} tiles, ${art.backdrops} backdrops, ${art.decor ?? 0} decor`
const slug = (text) =>
  text
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '')
const throttleText = `CPU throttle ${throttle}x${every > 1 ? `, one display frame in ${every}` : ''}`

/**
 * Runs in the page before anything else: animation-frame callbacks are called on every nth frame of the display
 * only, all of one round together, so the page runs at the display's rate divided by n.
 *
 * The frames kept are the ones on a fixed beat of the display (slots 0, n, 2n, ... counted in display frames), as
 * on a slower display: when the browser leaves a display frame out, the page waits for the next slot of the beat
 * (a missed frame costs a whole one), not for "the nth frame it happened to get".
 */
function holdFrames(n) {
  const request = window.requestAnimationFrame.bind(window)
  let queue = new Map()
  let handle = 0
  /** The display's own interval (ms), learned from the first frames; 0 until then. */
  let period = 0
  const first = []
  let last = -1
  /** The display frame this one is, counted from the first. */
  let slot = 0
  const pump = (time) => {
    request(pump)
    if (last >= 0) {
      const waited = time - last
      if (!period) {
        first.push(waited)
        if (first.length >= 40) period = [...first].sort((a, b) => a - b)[first.length >> 1]
      }
      slot += period ? Math.max(1, Math.round(waited / period)) : 1
    }
    last = time
    // Off the beat: wait. A display frame the browser left out can carry the count past a slot of the beat; the
    // page then gets the next one.
    if (slot % n) return
    const round = queue
    queue = new Map()
    for (const callback of round.values()) callback(time)
  }
  request(pump)
  window.requestAnimationFrame = (callback) => {
    queue.set(++handle, callback)
    return handle
  }
  window.cancelAnimationFrame = (id) => void queue.delete(id)
}

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

/** Page errors, console errors and failed requests of every run; the kit exits non-zero when this is not empty. */
const problems = []
/** Things to close on the way out (servers, browser), newest last. */
const cleanups = []
let cleaning = null
function cleanup() {
  cleaning ??= (async () => {
    for (const close of cleanups.splice(0).reverse()) {
      try {
        await close()
      } catch {
        // Already gone.
      }
    }
  })()
  return cleaning
}
for (const signal of ['SIGINT', 'SIGTERM'])
  process.on(signal, () => {
    cleanup().finally(() => process.exit(130))
  })

// ------------------------------------------------------------------------------------------------- recorder

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

/**
 * In-page recorder (installed with addInitScript, so it runs in the page): per display frame the summed time of
 * every requestAnimationFrame callback ("loop JS"), the phases of the loop timed by wrapping instance methods, the
 * simulation events, long tasks, long animation frames and the music scheduler's ticks. A wrapped method behaves
 * exactly as before, also when it throws.
 */
function installPerf() {
  const perf = {
    on: false,
    frames: [],
    cur: null,
    lastHurt: 0,
    hurtEvery: 0,
    topUp: false,
    calm: 0,
    longtasks: [],
    lafs: [],
    ticks: [],
    painted: [],
    watched: false,
    wrapped: new WeakSet(),
    worlds: new WeakMap()
  }
  window.__perf = perf
  const now = () => performance.now()

  const wrap = (obj, name, phase) => {
    if (!obj || typeof obj[name] !== 'function') return
    const original = obj[name]
    if (original.__perf) return
    const wrapped = function (...a) {
      const cur = perf.cur
      if (!cur || !perf.on) return original.apply(this, a)
      const t0 = now()
      try {
        return original.apply(this, a)
      } finally {
        cur.ph[phase] = (cur.ph[phase] ?? 0) + (now() - t0)
      }
    }
    wrapped.__perf = true
    obj[name] = wrapped
  }

  /** Notes where every piece of art painted on the main thread is asked from (the counters are plain fields). */
  const watchArt = () => {
    const art = window.__hamham?.stats?.art
    if (!art || perf.watched) return
    perf.watched = true
    for (const kind of ['clips', 'tiles', 'backdrops', 'decor']) {
      let value = art[kind]
      Object.defineProperty(art, kind, {
        enumerable: true,
        configurable: true,
        get: () => value,
        set: (next) => {
          if (next > value && perf.painted.length < 400) {
            const stack = String(new Error().stack)
              .split('\n')
              .slice(2, 10)
              .map((line) =>
                line
                  .trim()
                  .replace(/^at /, '')
                  .replace(/https?:\/\/[^/]+\//, '')
              )
            perf.painted.push({ kind, t: now(), stack })
          }
          value = next
        }
      })
    }
  }

  const instrument = () => {
    const app = window.__hamham?.app
    if (!app) return
    watchArt()
    const session = app.session
    if (session && !perf.wrapped.has(session)) {
      perf.wrapped.add(session)
      const view = session.view
      wrap(session.world, 'step', 'sim')
      const handle = view.handle
      view.handle = function (event) {
        const cur = perf.cur
        if (!cur || !perf.on) return handle.call(this, event)
        cur.ev.push(event.type)
        const t0 = now()
        try {
          return handle.call(this, event)
        } finally {
          cur.ph.viewHandle = (cur.ph.viewHandle ?? 0) + (now() - t0)
        }
      }
      wrap(session.sounds, 'event', 'soundEvent')
      wrap(session.director, 'handle', 'dirHandle')
      wrap(view, 'update', 'viewUpdate')
      wrap(session.director, 'update', 'director')
      wrap(session.sounds, 'update', 'soundUpdate')
      wrap(view, 'draw', 'draw')
      wrap(view.backdrop, 'drawBack', 'd.back')
      wrap(view.backdrop, 'drawFront', 'd.front')
      wrap(view.terrain, 'drawTiles', 'd.tiles')
      wrap(view.terrain, 'drawDecor', 'd.decor')
      wrap(view.props, 'drawProps', 'd.props')
      wrap(view.props, 'drawPickups', 'd.pickups')
      wrap(view.props, 'drawPrincess', 'd.princess')
      wrap(view.props, 'drawProjectiles', 'd.shots')
      wrap(view.actors, 'drawEnemies', 'd.enemies')
      wrap(view.actors, 'drawBoss', 'd.boss')
      wrap(view.actors, 'drawHero', 'd.hero')
      wrap(view.fx, 'draw', 'd.fx')
      wrap(view.water, 'draw', 'd.water')
      wrap(view.overlay, 'drawPopups', 'd.popups')
      wrap(view.overlay, 'drawScreen', 'd.screen')
    }
    wrap(app.hud, 'update', 'hud')
    wrap(app.hud?.deck, 'update', 'hud.deck')
    const engine = app.audio?.engine
    if (engine && !perf.wrapped.has(engine)) {
      perf.wrapped.add(engine)
      const tick = engine.tick
      engine.tick = function (...a) {
        const t0 = now()
        try {
          return tick.apply(this, a)
        } finally {
          if (perf.on) perf.ticks.push({ t: t0, d: now() - t0 })
        }
      }
      const sfx = engine.sfx
      engine.sfx = function (name, ...rest) {
        const cur = perf.cur
        if (!cur || !perf.on) return sfx.call(this, name, ...rest)
        const t0 = now()
        try {
          return sfx.call(this, name, ...rest)
        } finally {
          cur.ph.audioSfx = (cur.ph.audioSfx ?? 0) + (now() - t0)
          cur.sfx.push(name)
        }
      }
    }
  }

  let worldIds = 0
  const worldId = (world) => {
    let id = perf.worlds.get(world)
    if (id === undefined) {
      id = ++worldIds
      perf.worlds.set(world, id)
    }
    return id
  }

  /** True while the stage is on screen with its opening staging over and the input free. */
  const isCalm = () => {
    const app = window.__hamham?.app
    const session = app?.session
    return (
      app?.screen === 'play' && Boolean(session) && session.director.current == null && !session.director.inputLocked
    )
  }

  const raf = window.requestAnimationFrame.bind(window)
  let lastTs = -1
  window.requestAnimationFrame = (callback) =>
    raf((ts) => {
      instrument()
      if (ts !== lastTs) {
        lastTs = ts
        perf.calm = isCalm() ? perf.calm + 1 : 0
      }
      if (!perf.on) {
        callback(ts)
        return
      }
      if (!perf.cur || perf.cur.ts !== ts) {
        const session = window.__hamham?.app?.session
        // Forced damage at a steady beat, with the health topped up so the run does not end.
        if (session && perf.hurtEvery > 0 && ts - perf.lastHurt > perf.hurtEvery * 1000) {
          const w = session.world
          if (w.state === 'play' && w.player.invuln <= 0 && !session.director.inputLocked) {
            perf.lastHurt = ts
            if (w.player.hp <= 2) w.player.hp = w.player.maxHp
            w.hurtPlayer(1, w.player.x + 100)
          }
        }
        if (session && perf.topUp && session.world.player.hp <= 2) session.world.player.hp = session.world.player.maxHp
        perf.cur = { ts, js: 0, ph: {}, sfx: [], ev: [] }
        perf.frames.push(perf.cur)
      }
      const cur = perf.cur
      const t0 = now()
      try {
        callback(ts)
      } finally {
        cur.js += now() - t0
        const app = window.__hamham?.app
        const session = app?.session
        cur.scr = app?.screen
        cur.k = app?.renderer?.k ?? 0
        if (session) {
          cur.fr = session.view.freezeTime
          cur.sc = session.director.timeScale
          cur.lk = session.director.inputLocked
          cur.cu = session.director.current ?? null
          cur.wt = session.world.time
          // Where between the last two simulation states the picture is (older builds always show the last one).
          cur.al = typeof session.alpha === 'number' ? session.alpha : 1
          cur.st = session.world.state
          cur.wid = worldId(session.world)
        }
      }
    })

  const snap = () => {
    const stats = window.__hamham?.stats
    return {
      t: now(),
      art: stats ? { ...stats.art } : null,
      sfx: stats ? { ...stats.sfx } : null
    }
  }
  perf.snap = snap

  /** Moves of the boss section, done in the same page call that starts the recording so no moment is missed. */
  perf.actions = {
    // The hero 220 px to the boss's left, feet on his floor, speed zero, facing him.
    nearBoss: () => {
      const w = window.__hamham.world
      const b = w.boss
      if (!b) return false
      w.player.x = b.x - 220
      w.player.y = b.y + b.h - w.player.h
      w.player.vx = 0
      w.player.vy = 0
      w.player.facing = 1
      return true
    },
    killBoss: () => {
      window.__hamham.world.damageBoss(999)
      return true
    }
  }

  perf.begin = ({ hurtEvery = 0, topUp = false, action = null } = {}) => {
    const done = action ? perf.actions[action]() : true
    const session = window.__hamham?.app?.session
    perf.frames = []
    perf.cur = null
    perf.ticks = []
    perf.hurtEvery = hurtEvery
    perf.topUp = topUp
    perf.lastHurt = performance.now()
    perf.startSnap = snap()
    perf.logStart = session ? session.director.log.length : 0
    perf.on = true
    performance.mark('perf:begin')
    return done
  }

  perf.end = () => {
    performance.mark('perf:end')
    perf.on = false
    perf.cur = null
    const end = snap()
    const start = perf.startSnap
    const app = window.__hamham.app
    const renderer = app.renderer
    const session = app.session
    return {
      t0: start.t,
      t1: end.t,
      frames: perf.frames,
      ticks: perf.ticks,
      longtasks: perf.longtasks.filter((x) => x.t >= start.t && x.t < end.t),
      lafs: perf.lafs.filter((x) => x.t >= start.t && x.t < end.t),
      lafSupported: Boolean(PerformanceObserver.supportedEntryTypes?.includes('long-animation-frame')),
      start,
      end,
      remote: end.art?.remote ?? false,
      k: renderer.k,
      maxK: renderer.maxK,
      canvas: [renderer.canvas.width, renderer.canvas.height],
      css: [renderer.canvas.clientWidth, renderer.canvas.clientHeight],
      painted: perf.painted.filter((x) => x.t >= start.t && x.t < end.t),
      log: session ? session.director.log.slice(perf.logStart) : [],
      screen: app.screen
    }
  }

  try {
    new PerformanceObserver((list) => {
      for (const e of list.getEntries()) perf.longtasks.push({ t: e.startTime, d: e.duration })
    }).observe({ type: 'longtask', buffered: true })
  } catch {
    // Not supported.
  }
  try {
    new PerformanceObserver((list) => {
      for (const e of list.getEntries())
        perf.lafs.push({
          t: e.startTime,
          d: e.duration,
          forced: (e.scripts ?? []).reduce((s, x) => s + (x.forcedStyleAndLayoutDuration ?? 0), 0),
          // What the frame was made of: its rendering part, and its three longest scripts with who called them.
          render: e.renderStart ? e.startTime + e.duration - e.renderStart : 0,
          scripts: [...(e.scripts ?? [])]
            .sort((a, b) => b.duration - a.duration)
            .slice(0, 3)
            .map((x) => ({
              d: x.duration,
              by: String(x.invoker ?? x.invokerType ?? '').slice(0, 60),
              fn: String(x.sourceFunctionName ?? ''),
              at: `${String(x.sourceURL ?? '')
                .replace(/^.*\//, '')
                .replace(/\?.*$/, '')}:${x.sourceCharPosition ?? ''}`
            }))
        })
    }).observe({ type: 'long-animation-frame', buffered: true })
  } catch {
    // Not supported.
  }
}

// -------------------------------------------------------------------------------------------------- analysis

/** Turns the recorder's raw data into the numbers of one run. */
function analyze(data, { gpuRun = gpu } = {}) {
  const frames = data.frames.filter((f) => f.scr === 'play')
  const intervals = []
  for (let i = 1; i < frames.length; i++) intervals.push(frames[i].ts - frames[i - 1].ts)
  const sortedIntervals = sortedAsc(intervals)
  const median = percentile(sortedIntervals, 0.5)
  const js = sortedAsc(frames.map((f) => f.js))
  const overJs = (ms) => frames.filter((f) => f.js > ms).length
  const overInterval = (ms) => intervals.filter((v) => v > ms).length

  const delta = (key, field) => (data.end[key]?.[field] ?? 0) - (data.start[key]?.[field] ?? 0)
  const art = {
    clips: delta('art', 'clips'),
    tiles: delta('art', 'tiles'),
    backdrops: delta('art', 'backdrops'),
    decor: delta('art', 'decor'),
    ms: delta('art', 'ms')
  }
  const sfx = { buffered: delta('sfx', 'buffered'), live: delta('sfx', 'live'), rendered: delta('sfx', 'rendered') }

  // Cadence: how far the picture advances from one frame to the next. The picture shows the simulation at
  // `world.time` less the part of a step that the interpolation holds back; a frame "advances" by the difference
  // to the frame before. Only frames where nothing asks for anything else are judged: on time (a late frame
  // legitimately catches up), no hit-stop, no slow motion, the stage being played.
  const STEP = 1 / 60
  const period = median / 1000
  const shown = (f) => f.wt - (1 - (f.al ?? 1)) * STEP
  const plain = (f, p) =>
    f.scr === 'play' &&
    p.scr === 'play' &&
    f.wid !== undefined &&
    f.wid === p.wid &&
    f.wt >= p.wt &&
    f.fr === 0 &&
    p.fr === 0 &&
    f.sc === 1 &&
    p.sc === 1 &&
    f.st === 'play' &&
    f.ts - p.ts < median * 1.6
  const advance = new Array(data.frames.length).fill(null)
  for (let i = 1; i < data.frames.length; i++)
    if (plain(data.frames[i], data.frames[i - 1])) advance[i] = shown(data.frames[i]) - shown(data.frames[i - 1])
  // The beat: every how many frames the picture moves (1 at 60 Hz or with interpolation, 2 at 120 Hz without).
  const moving = []
  let lastMove = -1
  for (let i = 1; i < advance.length; i++) {
    if (advance[i] === null) lastMove = -1
    else if (advance[i] > period * 0.2) {
      if (lastMove >= 0) moving.push(i - lastMove)
      lastMove = i
    }
  }
  const beat = Math.max(1, Math.round(percentile(sortedAsc(moving), 0.5)) || 1)
  let eligible = 0
  let repeats = 0
  let jumps = 0
  let breaks = 0
  let run = 0
  let longestRepeatRun = 0
  for (let i = 1; i < advance.length; i++) {
    const a = advance[i]
    if (a === null) {
      run = 0
      continue
    }
    eligible += 1
    if (a <= period * 0.2) {
      repeats += 1
      run += 1
      longestRepeatRun = Math.max(longestRepeatRun, run)
    } else {
      run = 0
      if (a > period * beat * 1.65) jumps += 1
    }
    // A break: the picture did not advance as it did one beat earlier (a frame repeated or skipped out of turn).
    const before = i - beat >= 1 ? advance[i - beat] : null
    if (before !== null && Math.abs(a - before) > period * 0.35) breaks += 1
  }
  const runSeconds = frames.length > 1 ? (frames.at(-1).ts - frames[0].ts) / 1000 : 0

  const hitStop = frames.filter((f) => f.fr > 0).length

  // Events: loop JS of the frames in which each type happened.
  const byType = new Map()
  for (const f of frames)
    for (const type of new Set(f.ev)) {
      const list = byType.get(type) ?? { n: 0, js: [] }
      list.n += f.ev.filter((t) => t === type).length
      list.js.push(f.js)
      byType.set(type, list)
    }
  const events = [...byType.entries()]
    .map(([type, e]) => ({ type, n: e.n, frames: e.js.length, mean: mean(e.js), max: Math.max(...e.js) }))
    .sort((a, b) => b.n - a.n)

  const phaseLists = new Map()
  for (const f of frames)
    for (const [name, value] of Object.entries(f.ph)) {
      const list = phaseLists.get(name) ?? []
      list.push(value)
      phaseLists.set(name, list)
    }
  const phases = [...phaseLists.entries()]
    .map(([name, list]) => {
      const s = sortedAsc(list)
      return { name, frames: s.length, mean: mean(s), p95: percentile(s, 0.95), max: s.at(-1) }
    })
    .sort((a, b) => a.name.localeCompare(b.name))

  const first = frames[0]?.ts ?? 0
  const worst = [...frames]
    .sort((a, b) => b.js - a.js)
    .slice(0, 10)
    .map((f) => ({
      t: (f.ts - first) / 1000,
      js: f.js,
      events: f.ev,
      sfx: f.sfx,
      phases: Object.entries(f.ph)
        .filter(([name]) => name !== 'draw' && name !== 'viewUpdate')
        .sort((a, b) => b[1] - a[1])
        .slice(0, 4)
        .map(([name, value]) => [name, value])
    }))

  const ticks = sortedAsc(data.ticks.map((t) => t.d))
  const lafs = data.lafs
  return {
    ended: data.screen,
    frames: frames.length,
    seconds: runSeconds,
    canvas: data.canvas,
    css: data.css,
    k: data.k,
    maxK: data.maxK,
    js: {
      p50: percentile(js, 0.5),
      p95: percentile(js, 0.95),
      p99: percentile(js, 0.99),
      max: js.at(-1) ?? 0,
      over8: overJs(8),
      over16: overJs(16.7),
      over33: overJs(33)
    },
    interval: {
      judged: gpuRun,
      median,
      over25: overInterval(25),
      over42: overInterval(42),
      over58: overInterval(58),
      over100: overInterval(100),
      overMedian: overInterval(median * 2.5),
      rate: median ? 1000 / median : 0
    },
    longtasks: {
      count: data.longtasks.length,
      max: Math.max(0, ...data.longtasks.map((x) => x.d)),
      sum: sum(data.longtasks.map((x) => x.d))
    },
    lafList: [...lafs]
      .sort((a, b) => b.d - a.d)
      .slice(0, 5)
      .map((x) => ({ at: (x.t - data.t0) / 1000, d: x.d, render: x.render ?? 0, scripts: x.scripts ?? [] })),
    laf: {
      supported: data.lafSupported,
      count: lafs.length,
      max: Math.max(0, ...lafs.map((x) => x.d)),
      forced: sum(lafs.map((x) => x.forced))
    },
    art,
    remote: data.remote,
    sfx,
    ticks: { n: ticks.length, p95: percentile(ticks, 0.95), max: ticks.at(-1) ?? 0 },
    cadence: {
      eligible,
      beat,
      interpolated: data.frames.some((f) => (f.al ?? 1) < 1),
      repeats,
      jumps,
      breaks,
      perMinute: runSeconds ? (breaks / runSeconds) * 60 : 0,
      longestRepeatRun
    },
    hitStop: { frames: hitStop, share: frames.length ? hitStop / frames.length : 0 },
    events,
    phases,
    worst,
    painted: (data.painted ?? []).map((x) => ({ kind: x.kind, at: (x.t - data.t0) / 1000, stack: x.stack })),
    trace: data.trace ?? null,
    log: data.log
  }
}

/** The tables of one run, as Markdown. */
function runMarkdown(name, m, notes = []) {
  const lines = [`#### ${name}`, '']
  for (const note of notes) lines.push(`- ${note}`)
  lines.push(
    `- ${m.frames} frames, ${f1(m.seconds)} s; canvas ${m.canvas.join('x')} (css ${m.css.join('x')}), k ${m.k} / max ${m.maxK}; ended on \`${m.ended}\``,
    `- loop JS ms: p50 ${f2(m.js.p50)}, p95 ${f2(m.js.p95)}, p99 ${f2(m.js.p99)}, max ${f2(m.js.max)}; frames over 8 ms ${m.js.over8}, over 16.7 ms ${m.js.over16}, over 33 ms ${m.js.over33}`,
    `- frame interval ms${m.interval.judged ? '' : ' (software rendering, not judged without --gpu)'}: median ${f1(m.interval.median)} (${f0(m.interval.rate)} Hz); over 25 ms ${m.interval.over25}, over 42 ms ${m.interval.over42}, over 58 ms ${m.interval.over58}, over 100 ms ${m.interval.over100}; over 2.5 x median ${m.interval.overMedian}`,
    `- long tasks: ${m.longtasks.count} (longest ${f0(m.longtasks.max)} ms, sum ${f0(m.longtasks.sum)} ms); long animation frames: ${m.laf.supported ? `${m.laf.count} (longest ${f0(m.laf.max)} ms, forced layout ${f1(m.laf.forced)} ms)` : 'not supported by this Chromium'}`,
    ...m.lafList.map(
      (x) =>
        `- long animation frame at ${f2(x.at)} s, ${f0(x.d)} ms (rendering ${f0(x.render)} ms): ${x.scripts.length ? x.scripts.map((s) => `${f0(s.d)} ms in ${s.fn || '(anonymous)'} ${s.at}, called by ${s.by}`).join('; ') : 'no script of 5 ms or more'}`
    ),
    `- art painted on the main thread: ${artText(m.art)}, ${f1(m.art.ms)} ms; art from a worker: ${m.remote ? 'yes' : 'no'}`,
    `- sound effects: ${m.sfx.buffered} started from buffers, ${m.sfx.live} built live; ${m.sfx.rendered} buffers rendered`,
    `- music scheduler: ${m.ticks.n} ticks, p95 ${f2(m.ticks.p95)} ms, max ${f2(m.ticks.max)} ms`,
    `- cadence (frames on time, no hit-stop, no slow motion): the picture moves every ${m.cadence.beat} frame(s)${m.cadence.interpolated ? ', drawn between simulation states' : ''}; ${m.cadence.breaks} breaks of that beat (${f1(m.cadence.perMinute)} per minute), ${m.cadence.repeats} frames that repeated the picture, ${m.cadence.jumps} that jumped, of ${m.cadence.eligible} frames; longest run of repeats ${m.cadence.longestRepeatRun}`,
    `- hit-stop (staging): ${m.hitStop.frames} frames, ${f1(m.hitStop.share * 100)} % of the run`
  )
  if (m.trace) {
    const t = m.trace
    lines.push(
      `- garbage collection: ${t.gc.major} major (${f1(t.gc.majorPer1000)} per 1000 frames, longest ${f1(t.gc.majorLongest)} ms, ${f0(t.gc.majorMs)} ms in all), ${t.gc.minor} minor (longest ${f1(t.gc.minorLongest)} ms, ${f0(t.gc.minorMs)} ms in all)`,
      `- style and layout: ${t.style.count} style recalculations (${f2(t.style.perFrame)} per frame, ${f0(t.style.ms)} ms), ${t.layout.count} layouts (in ${f1(t.layout.share * 100)} % of the frames, ${f0(t.layout.ms)} ms)`,
      `- shaders compiled on first use${gpu ? '' : ' (software rendering, not judged without --gpu)'}: ${t.shaders.programs} programs${t.shaders.bursts.length ? `, ${t.shaders.bursts.map((b) => `${b.programs} at ${f2(b.at)} s (${f0(b.ms)} ms)`).join(', ')}` : ''}`,
      t.held.count
        ? `- **kept from running from outside: ${t.held.count} slices of the game's thread, ${f0(t.held.ms)} ms in all, longest ${f0(t.held.longest)} ms (${t.held.at.map((h) => `${f0(h.ms)} ms at ${f2(h.at)} s in ${h.name}`).join(', ')}${t.held.count > t.held.at.length ? ', ...' : ''}). The thread had work and did not run: this run's durations are the machine's as much as the page's**`
        : `- kept from running from outside: no (the game's thread ran whenever it had work)`
    )
  }
  for (const p of m.painted.slice(0, 4))
    lines.push(
      `- painted on the main thread at ${f2(p.at)} s (${p.kind}), asked from: ${p.stack.map((s) => `\`${s}\``).join(' < ')}`
    )
  if (m.painted.length > 4) lines.push(`- ... and ${m.painted.length - 4} more`)
  if (m.log.length) lines.push(`- staged moments seen: ${m.log.join(', ')}`)
  if (m.frames < m.seconds * 20)
    lines.push(
      `- **only ${m.frames} frames in ${f1(m.seconds)} s: the canvas is rastered in software here, so the percentiles rest on few frames (use --gpu)**`
    )
  lines.push('', 'Loop JS of the frames in which each event happened:', '')
  lines.push(
    table(
      ['event', 'count', 'mean ms', 'max ms'],
      m.events.map((e) => [e.type, e.n, f2(e.mean), f2(e.max)])
    ),
    '',
    'Phases (`draw` contains the `d.*` rows; `viewUpdate`, `sim` and the others are separate):',
    ''
  )
  lines.push(
    table(
      ['phase', 'frames', 'mean ms', 'p95 ms', 'max ms'],
      m.phases.map((p) => [p.name, p.frames, f2(p.mean), f2(p.p95), f2(p.max)])
    ),
    '',
    'Ten worst frames by loop JS:',
    ''
  )
  lines.push(
    table(
      ['at s', 'loop JS ms', 'events', 'sound effects', 'largest phases'],
      m.worst.map((w) => [
        f2(w.t),
        f1(w.js),
        w.events.join(', '),
        w.sfx.join(', '),
        w.phases.map(([n, v]) => `${n} ${f1(v)}`).join(', ')
      ])
    ),
    ''
  )
  return lines.join('\n')
}

// --------------------------------------------------------------------------------------------------- browser

let target = null
let browser = null
let environment = { chromium: '', renderer: '' }

async function startTarget() {
  const port = await freePort()
  if (dev) {
    const server = await createServer({
      configFile: viteConfig,
      server: { port, strictPort: true, host: '127.0.0.1' },
      logLevel: 'error'
    })
    await server.listen()
    cleanups.push(() => server.close())
  } else {
    const outDir = join(out, 'dist')
    console.log('[perf] building the production bundle ...')
    await viteBuild({ configFile: viteConfig, build: { outDir }, logLevel: 'error' })
    const server = await preview({
      configFile: viteConfig,
      build: { outDir },
      preview: { port, strictPort: true, host: '127.0.0.1' },
      logLevel: 'error'
    })
    cleanups.push(
      () =>
        new Promise((done) => {
          server.httpServer.closeAllConnections?.()
          server.httpServer.close(() => done())
        })
    )
  }
  target = `http://127.0.0.1:${port}/`
}

async function startBrowser() {
  const launchArgs = ['--autoplay-policy=no-user-gesture-required']
  if (gpu) launchArgs.push('--enable-gpu', '--ignore-gpu-blocklist', '--use-angle=d3d11', '--enable-gpu-rasterization')
  browser = await chromium.launch({ headless: true, args: launchArgs, channel: gpu ? 'chromium' : undefined })
  cleanups.push(() => browser.close())
  environment.chromium = browser.version()
}

/** A fresh context and page as a phone: touch, device pixel ratio, the recorder, the CPU throttle from the start. */
async function newRun(label, { width, height, dpr, rate = throttle, save = true }) {
  const context = await browser.newContext({
    viewport: { width, height },
    deviceScaleFactor: dpr,
    hasTouch: true,
    isMobile: true
  })
  const page = await context.newPage()
  let closing = false
  page.on('pageerror', (error) => problems.push(`${label}: page error: ${error.message}`))
  page.on('console', (message) => {
    if (message.type() === 'error') problems.push(`${label}: console error: ${message.text()}`)
  })
  page.on('requestfailed', (request) => {
    if (!closing) problems.push(`${label}: request failed: ${request.url()} ${request.failure()?.errorText ?? ''}`)
  })
  if (every > 1) await page.addInitScript(holdFrames, every)
  await page.addInitScript(installPerf)
  if (save)
    await page.addInitScript(
      ([key, value]) => localStorage.setItem(key, JSON.stringify(value)),
      [SAVE_KEY, UNLOCKED_SAVE]
    )
  const cdp = await context.newCDPSession(page)
  if (rate > 1) await cdp.send('Emulation.setCPUThrottlingRate', { rate })
  return {
    page,
    cdp,
    async close() {
      closing = true
      await context.close()
    }
  }
}

async function toTitle(page) {
  await page.goto(target)
  await page.waitForFunction(
    () => Boolean(window.__hamham) && Boolean(document.querySelector('#title-screen:not([hidden])')),
    null,
    { timeout: 240_000 }
  )
}

async function rendererName(page) {
  return page.evaluate(() => {
    const gl = document.createElement('canvas').getContext('webgl')
    const ext = gl?.getExtension('WEBGL_debug_renderer_info')
    return ext ? gl.getParameter(ext.UNMASKED_RENDERER_WEBGL) : 'no webgl'
  })
}

/** Taps a button; a button that is not there fails with its name instead of hanging. */
async function tap(page, selector, what) {
  try {
    await page.locator(selector).first().tap({ timeout: 8000 })
  } catch (error) {
    throw new Error(
      `step "${what}": the button ${selector} is not there or cannot be tapped (${String(error.message).split('\n')[0]})`
    )
  }
}

const screenOf = (page) => page.evaluate(() => window.__hamham.app.screen)

/** Into a stage by touch: continue, the stage card, the story (a reading player waits first), every next. */
async function enterStage(page, stageNo, { storyWait = 2500 } = {}) {
  await tap(page, '#continue', 'continue')
  await page.waitForSelector('.stage-card', { timeout: 10_000 })
  await page.waitForTimeout(200)
  await tap(page, `.stage-card >> nth=${stageNo - 1}`, `stage ${stageNo} card`)
  await page.waitForFunction(() => window.__hamham.app.screen === 'story', null, { timeout: 10_000 })
  await page.waitForTimeout(storyWait)
  await finishStory(page)
}

/** True while the story's last page has been confirmed and play waits behind the loading card. */
const loadingCardUp = (page) => page.evaluate(() => Boolean(document.querySelector('.warm-note:not([hidden])')))

async function finishStory(page) {
  for (let index = 0; index < 40; index++) {
    if ((await screenOf(page)) !== 'story') break
    // Nothing more to tap: the stage starts by itself once it is ready.
    if (await loadingCardUp(page)) break
    await page.evaluate(() => window.__hamham.app.screens.typer?.finish())
    await tap(page, '#story-next', 'story next')
    await page.waitForTimeout(280)
  }
  await page.waitForFunction(() => window.__hamham.app.screen === 'play', null, { timeout: 30_000 })
}

/** Waits until the opening staging is over and 30 frames have passed (autopilot is on by then). */
async function waitCalm(page) {
  await page.waitForFunction(() => window.__perf.calm >= 30, null, { timeout: 90_000, polling: 100 })
}

/**
 * What a trace says about the stretch between the page's marks `perf:begin` and `perf:end`: the main thread's
 * garbage collections, its style and layout work, the shaders the GPU process compiled, and whether the thread was
 * kept from running from outside. `rate` is the CPU throttle of the run.
 */
function traceStats(buffer, rate = throttle) {
  let events
  try {
    const parsed = JSON.parse(buffer.toString('utf8'))
    events = Array.isArray(parsed) ? parsed : parsed.traceEvents
  } catch {
    return null
  }
  const key = (e) => `${e.pid}:${e.tid}`
  const begin = events.findLast((e) => e.name === 'perf:begin')
  const end = events.findLast((e) => e.name === 'perf:end')
  if (!begin) return null
  const from = begin.ts
  const to = end && end.ts > from ? end.ts : Infinity
  // The game's thread is the one that marked the run.
  const main = events.filter((e) => e.ph === 'X' && key(e) === key(begin) && e.ts >= from && e.ts < to)
  const sum = (name) => {
    const list = main.filter((e) => e.name === name)
    return {
      count: list.length,
      ms: list.reduce((s, e) => s + e.dur, 0) / 1000,
      longest: list.reduce((m, e) => Math.max(m, e.dur), 0) / 1000
    }
  }
  // A frame is a round of animation-frame callbacks (callbacks less than 3 ms apart are one round).
  let frames = 0
  let last = -Infinity
  for (const e of main.filter((x) => x.name === 'FireAnimationFrame').sort((a, b) => a.ts - b.ts)) {
    if (e.ts - last >= 3000) frames += 1
    last = e.ts + e.dur
  }
  const major = sum('MajorGC')
  const minor = sum('MinorGC')
  const layout = sum('Layout')
  const style = sum('UpdateLayoutTree')
  const gpuPid = events.find((e) => e.ph === 'M' && e.name === 'process_name' && e.args?.name === 'GPU Process')?.pid
  const compiles = events
    .filter((e) => e.pid === gpuPid && e.ph === 'X' && e.name === 'shader_compile' && e.ts >= from && e.ts < to)
    .sort((a, b) => a.ts - b.ts)
  // Compilations less than 50 ms apart stall the GPU process as one.
  const bursts = []
  for (const e of compiles) {
    const burst = bursts.at(-1)
    if (burst && e.ts - burst.end < 50_000) {
      burst.end = e.ts + e.dur
      burst.programs += 1
      burst.ms += e.dur / 1000
    } else bursts.push({ at: (e.ts - from) / 1e6, end: e.ts + e.dur, programs: 1, ms: e.dur / 1000 })
  }
  // Did the game's thread get to run? A slice has its time on the clock (`dur`) and the time its thread ran
  // (`tdur`). The CPU throttle stops the thread for all but 1/rate of the time, so honest work runs for 1/rate of
  // its clock time. What is missing beyond that was taken from outside the page: the machine gave the core to
  // something else. Only outermost slices are looked at, so nothing is counted twice.
  // A wait while the GPU process compiles this page's own shaders is the page's doing: it is not counted here
  // (budget S1 counts it).
  const ownShaders = (e) => compiles.some((c) => c.ts < e.ts + e.dur + 20_000 && c.ts + c.dur > e.ts - 20_000)
  const held = { count: 0, ms: 0, longest: 0, at: [] }
  let covered = -Infinity
  for (const e of main.filter((x) => typeof x.tdur === 'number').sort((a, b) => a.ts - b.ts || b.dur - a.dur)) {
    if (e.ts < covered) continue
    covered = e.ts + e.dur
    const lost = (e.dur - e.tdur * rate) / 1000
    if (lost < HELD_MS || lost < (e.dur / 1000) * HELD_SHARE || ownShaders(e)) continue
    held.count += 1
    held.ms += lost
    held.longest = Math.max(held.longest, lost)
    if (held.at.length < 5) held.at.push({ at: (e.ts - from) / 1e6, ms: lost, name: e.name })
  }
  return {
    frames,
    held,
    gc: {
      major: major.count,
      majorMs: major.ms,
      majorLongest: major.longest,
      majorPer1000: frames ? (major.count / frames) * 1000 : 0,
      minor: minor.count,
      minorMs: minor.ms,
      minorLongest: minor.longest
    },
    layout: { count: layout.count, ms: layout.ms, share: frames ? Math.min(1, layout.count / frames) : 0 },
    style: { count: style.count, ms: style.ms, perFrame: frames ? style.count / frames : 0 },
    shaders: {
      programs: compiles.length,
      longest: bursts.reduce((m, b) => Math.max(m, b.ms), 0),
      bursts: bursts.map((b) => ({ at: b.at, programs: b.programs, ms: b.ms }))
    }
  }
}

/**
 * Records `ms` of play (or less when the stage ends) and returns the raw data; `name` names the trace file and
 * `rate` is the CPU throttle the page runs under.
 */
async function recordFor(page, ms, options, name = 'run', rate = throttle) {
  await browser.startTracing(page, { categories: trace ? TRACE_CATEGORIES : LIGHT_CATEGORIES })
  let buffer = null
  try {
    const moved = await page.evaluate((o) => window.__perf.begin(o), options)
    if (!moved) {
      await page.evaluate(() => window.__perf.end())
      throw new Error(`the move "${options.action}" could not be made (stage 2 has no boss?)`)
    }
    const started = Date.now()
    while (Date.now() - started < ms) {
      await sleep(Math.min(1000, Math.max(50, ms - (Date.now() - started))))
      if ((await screenOf(page)) !== 'play') break
    }
    const data = await page.evaluate(() => window.__perf.end())
    buffer = await browser.stopTracing()
    data.trace = traceStats(buffer, rate)
    return data
  } finally {
    if (!buffer) buffer = await browser.stopTracing().catch(() => null)
    if (trace && buffer) {
      mkdirSync(out, { recursive: true })
      writeFileSync(join(out, `trace-${slug(name)}.json`), buffer)
    }
  }
}

function rawFile(name, data) {
  if (!raw) return
  mkdirSync(out, { recursive: true })
  writeFileSync(join(out, `raw-${slug(name)}.json`), JSON.stringify(data))
}

// ---------------------------------------------------------------------------------------------------- sections

const HIT = { hurtEvery: 4 }

async function sectionBoot() {
  const run = await newRun('boot', { ...PROFILES.landscape, save: false })
  try {
    await toTitle(run.page)
    environment.renderer ||= await rendererName(run.page)
    const first = await run.page.evaluate(
      () => performance.getEntriesByName('hamham:first-frame')[0]?.startTime ?? null
    )
    if (first === null) throw new Error('the hamham:first-frame mark is missing')
    const until = first + 1000
    await run.page.waitForFunction((t) => performance.now() >= t, until, { polling: 100, timeout: 30_000 })
    const data = await run.page.evaluate(
      (t) => ({
        longtasks: window.__perf.longtasks.filter((x) => x.t < t),
        stats: window.__hamham.stats && JSON.parse(JSON.stringify(window.__hamham.stats))
      }),
      until
    )
    const tasks = data.longtasks
    const m = {
      timeToTitle: first,
      longtasks: { count: tasks.length, max: Math.max(0, ...tasks.map((x) => x.d)), sum: sum(tasks.map((x) => x.d)) },
      art: { ...data.stats.art },
      remote: data.stats.art.remote
    }
    const summary = BUDGETS.filter((b) => b.sections.includes('boot')).map((b) => ({
      id: b.id,
      section: 'boot',
      run: 'cold start, no save',
      ...b.judge(m)
    }))
    const md = [
      `Fresh context without a save, ${throttleText} from before the navigation, ${dev ? 'dev server' : 'production build'}. From navigation to one second after the title is up.`,
      '',
      table(
        ['time to title', 'long tasks', 'longest', 'sum', 'art painted on the main thread', 'art from a worker'],
        [
          [
            `${f0(m.timeToTitle)} ms`,
            m.longtasks.count,
            `${f0(m.longtasks.max)} ms`,
            `${f0(m.longtasks.sum)} ms`,
            `${artText(m.art)}, ${f0(m.art.ms)} ms`,
            m.remote ? 'yes' : 'no'
          ]
        ]
      ),
      ''
    ].join('\n')
    return { md, json: m, summary }
  } finally {
    await run.close()
  }
}

async function sectionMenus() {
  const run = await newRun('menus', PROFILES.landscape)
  const { page } = run
  try {
    await toTitle(page)
    environment.renderer ||= await rendererName(page)
    const first = await page.evaluate(() => performance.getEntriesByName('hamham:first-frame')[0]?.startTime ?? 0)
    await page.waitForFunction((t) => performance.now() >= t + 1200, first, { polling: 100, timeout: 30_000 })
    const steps = []
    const step = async (name, action, settle = 1200) => {
      const a = await page.evaluate(() => window.__perf.snap())
      await action()
      await page.waitForTimeout(settle)
      const b = await page.evaluate(() => window.__perf.snap())
      const tasks = await page.evaluate(
        ([f, t]) => window.__perf.longtasks.filter((x) => x.t >= f && x.t < t),
        [a.t, b.t]
      )
      steps.push({
        name,
        seconds: (b.t - a.t) / 1000,
        longtasks: { count: tasks.length, max: Math.max(0, ...tasks.map((x) => x.d)), sum: sum(tasks.map((x) => x.d)) },
        art: {
          clips: b.art.clips - a.art.clips,
          tiles: b.art.tiles - a.art.tiles,
          backdrops: b.art.backdrops - a.art.backdrops,
          decor: b.art.decor - a.art.decor,
          ms: b.art.ms - a.art.ms
        }
      })
      console.log(`[menus] ${name}`)
    }
    await step('title idle 3 s', async () => {}, 3000)
    await step('first tap (あそびかた opens)', () => tap(page, '#help-open', 'first tap'))
    await step('あそびかた closes', () => tap(page, '#help-done', 'help close'))
    await step('つづきから -> select', () => tap(page, '#continue', 'continue'))
    await step('select idle 2 s', async () => {}, 2000)
    await step('stage 5 card -> story', () => tap(page, '.stage-card >> nth=4', 'stage 5 card'), 1500)
    await step('story idle 4 s', async () => {}, 4000)
    for (let i = 1; i <= 40; i++) {
      if ((await screenOf(page)) !== 'story') break
      if (await loadingCardUp(page)) break
      await step(
        `story next ${i}`,
        async () => {
          await page.evaluate(() => window.__hamham.app.screens.typer?.finish())
          await tap(page, '#story-next', `story next ${i}`)
        },
        600
      )
    }
    await page.waitForFunction(() => window.__hamham.app.screen === 'play', null, { timeout: 30_000 })
    await step('play, first 3 s', async () => {}, 3000)
    await step('pause', () => tap(page, '#pause', 'pause'))
    await step('resume', () => tap(page, '#pause-resume', 'resume'))
    await step(
      'lose the last heart -> game over',
      () =>
        page.evaluate(() => {
          const w = window.__hamham.world
          w.player.invuln = 0
          w.hurtPlayer(99, w.player.x + 50)
        }),
      4000
    )
    await step('リトライ', () => tap(page, '#dead-retry', 'retry'), 2500)
    await step(
      'clear -> result',
      () =>
        page.evaluate(() => {
          const w = window.__hamham.world
          if (w.boss && !w.boss.dead) w.damageBoss(999)
          w.goalOpen = true
          w.player.x = w.goalX
          w.player.y = w.goalY
        }),
      8000
    )
    await step('result -> select', () => tap(page, '#result-select', 'result select'), 1500)
    await step('select -> title', () => tap(page, '#select-back', 'select back'), 1500)
    await step('45 s on the title (the demo moves on)', async () => {}, 45_000)

    const summary = []
    for (const b of BUDGETS.filter((x) => x.sections.includes('menus'))) {
      const judged = steps.map((s) => ({ s, r: b.judge(s) }))
      const bad = judged.filter((x) => !x.r.ok)
      const pool = bad.length ? bad : judged
      const pick = pool.reduce((a, c) => (stepWeight(b.id, c.s) > stepWeight(b.id, a.s) ? c : a))
      summary.push({
        id: b.id,
        section: 'menus',
        run: `${steps.length} steps, worst: ${pick.s.name}${bad.length > 1 ? `; ${bad.length} steps fail` : ''}`,
        value: pick.r.value,
        ok: bad.length === 0
      })
    }
    const md = [
      `Landscape 844x390, ratio 3, ${throttleText}, ${dev ? 'dev server' : 'production build'}, a save that unlocks everything. Each row is one step: long tasks that started in it, and the art the main thread painted in it. M1 and M2 are judged per step.`,
      '',
      table(
        ['step', 's', 'long tasks', 'longest', 'sum', 'art painted', 'M1', 'M2'],
        steps.map((s) => [
          s.name,
          f1(s.seconds),
          s.longtasks.count,
          `${f0(s.longtasks.max)} ms`,
          `${f0(s.longtasks.sum)} ms`,
          `${artText(s.art)}, ${f0(s.art.ms)} ms`,
          verdict(BUDGETS.find((b) => b.id === 'M1').judge(s).ok),
          verdict(BUDGETS.find((b) => b.id === 'M2').judge(s).ok)
        ])
      ),
      ''
    ].join('\n')
    return { md, json: { steps }, summary }
  } finally {
    await run.close()
  }
}

/** The milliseconds a run's thread was kept from running from outside (0 for a run without a trace). */
const heldMs = (m) => m.trace?.held?.ms ?? 0

/**
 * Makes a recorded run up to `--tries` times: a run whose thread was kept from running from outside says nothing
 * sure about the page, so it is set aside and made again. Returns the last one made, with a note for the report
 * when earlier ones were set aside. `make` returns the analysed run (or runs).
 */
async function undisturbed(label, make) {
  const aside = []
  for (let attempt = 1; ; attempt++) {
    const made = await make()
    const ms = [made].flat().reduce((total, m) => total + heldMs(m), 0)
    if (ms === 0 || attempt >= tries) {
      const note = aside.length
        ? `attempt ${attempt} of at most ${tries}: ${aside.length} earlier one(s) were set aside because the game's thread was kept from running from outside (${aside.map((x) => `${f0(x)} ms`).join(', ')})`
        : null
      return { made, note }
    }
    aside.push(ms)
    console.log(
      `[${label}] the game's thread was kept from running from outside for ${f0(ms)} ms: once more (${attempt + 1} of ${tries})`
    )
  }
}

const stepWeight = (id, step) =>
  id === 'M1' ? step.longtasks.max : step.art.clips + step.art.tiles + step.art.backdrops
const verdict = (ok) => (ok === null ? 'n/a' : ok ? 'PASS' : 'FAIL')

/** Runs a play session of one stage and profile: through the menus, the bot, hits every 4 s. */
async function sectionPlay() {
  const runs = []
  const summary = []
  const parts = []
  for (const profileName of profileNames) {
    for (const stageNo of stages) {
      const name = `stage ${stageNo} ${profileName}`
      console.log(`[play] ${name}`)
      const profile = PROFILES[profileName]
      const { made: m, note } = await undisturbed(`play ${name}`, async () => {
        const run = await newRun(name, profile)
        try {
          await toTitle(run.page)
          environment.renderer ||= await rendererName(run.page)
          await enterStage(run.page, stageNo)
          await run.page.evaluate(() => window.__hamham.autopilot(true))
          await waitCalm(run.page)
          const data = await recordFor(run.page, seconds * 1000, HIT, `play ${name}`)
          rawFile(`play-${name}`, data)
          return analyze(data)
        } finally {
          await run.close()
        }
      })
      runs.push({ name, ...m })
      const notes = [
        `${profile.width}x${profile.height} at ratio ${profile.dpr}, ${throttleText}, ${dev ? 'dev server' : 'production build'}`
      ]
      if (note) notes.push(note)
      if (m.ended !== 'play') notes.push(`the stage ended on \`${m.ended}\` after ${f1(m.seconds)} s`)
      parts.push(runMarkdown(name, m, notes))
      for (const b of BUDGETS.filter((x) => x.sections.includes('play')))
        summary.push({ id: b.id, section: 'play', run: name, ...b.judge(m) })
    }
  }
  const overview = table(
    [
      'run',
      'frames',
      'loop JS p50 / p99 / max ms',
      'over 16.7 ms',
      'long tasks',
      'tiles painted',
      'live sfx',
      'cadence breaks',
      'ended'
    ],
    runs.map((m) => [
      m.name,
      m.frames,
      `${f1(m.js.p50)} / ${f1(m.js.p99)} / ${f1(m.js.max)}`,
      m.js.over16,
      m.longtasks.count,
      m.art.tiles,
      `${m.sfx.live} of ${m.sfx.live + m.sfx.buffered}`,
      m.cadence.breaks,
      m.ended
    ])
  )
  return { md: [overview, '', ...parts].join('\n'), json: { runs }, summary }
}

async function sectionBoss() {
  const profile = PROFILES.landscape
  const summary = []
  const parts = []
  const phases = [
    { name: 'boss fight', ms: 15_000, action: 'nearBoss' },
    { name: 'boss defeat', ms: 5000, action: 'killBoss' }
  ]
  // The two phases are one session: when either was disturbed from outside, both are made again.
  const { made: runs, note } = await undisturbed('boss', async () => {
    const run = await newRun('boss', profile)
    const made = []
    try {
      await toTitle(run.page)
      environment.renderer ||= await rendererName(run.page)
      await enterStage(run.page, 2)
      await run.page.evaluate(() => window.__hamham.autopilot(true))
      await waitCalm(run.page)
      for (const phase of phases) {
        const data = await recordFor(run.page, phase.ms, { ...HIT, action: phase.action }, phase.name)
        rawFile(phase.name, data)
        const m = analyze(data)
        made.push({ name: phase.name, ...m })
        if (m.ended !== 'play') break
      }
    } finally {
      await run.close()
    }
    return made
  })
  for (const m of runs) {
    const notes = [
      `stage 2, ${profile.width}x${profile.height} at ratio ${profile.dpr}, ${throttleText}, ${dev ? 'dev server' : 'production build'}`
    ]
    if (note) notes.push(note)
    if (m.ended !== 'play') notes.push(`the stage ended on \`${m.ended}\` after ${f1(m.seconds)} s`)
    parts.push(runMarkdown(m.name, m, notes))
    for (const b of BUDGETS.filter((x) => x.sections.includes('boss')))
      summary.push({ id: b.id, section: 'boss', run: m.name, ...b.judge(m) })
  }
  const overview = table(
    [
      'run',
      'frames',
      'loop JS p50 / p99 / max ms',
      'over 16.7 ms',
      'long tasks',
      'tiles painted',
      'live sfx',
      'staged moments'
    ],
    runs.map((m) => [
      m.name,
      m.frames,
      `${f1(m.js.p50)} / ${f1(m.js.p99)} / ${f1(m.js.max)}`,
      m.js.over16,
      m.longtasks.count,
      m.art.tiles,
      `${m.sfx.live} of ${m.sfx.live + m.sfx.buffered}`,
      m.log.join(', ')
    ])
  )
  return { md: [overview, '', ...parts].join('\n'), json: { runs }, summary }
}

async function sectionPacing() {
  // Software rendering holds the display rate at this size without throttle, so the cadence is the thing seen.
  const { made: m, note } = await undisturbed('pacing', async () => {
    const run = await newRun('pacing', { width: 640, height: 360, dpr: 1, rate: 1 })
    try {
      await toTitle(run.page)
      environment.renderer ||= await rendererName(run.page)
      await enterStage(run.page, 2)
      await run.page.evaluate(() => window.__hamham.autopilot(true))
      await waitCalm(run.page)
      const data = await recordFor(run.page, 20_000, { topUp: true }, 'pacing', 1)
      rawFile('pacing', data)
      return analyze(data)
    } finally {
      await run.close()
    }
  })
  {
    const summary = BUDGETS.filter((b) => b.sections.includes('pacing')).map((b) => ({
      id: b.id,
      section: 'pacing',
      run: 'stage 2, 640x360 at ratio 1, no throttle',
      ...b.judge(m)
    }))
    const md = [
      `Stage 2, viewport 640x360 at ratio 1, no CPU throttle whatever --throttle says, the bot, ${dev ? 'dev server' : 'production build'}. 20 s after the opening staging; the hero is topped up but not hit.`,
      '',
      table(
        [
          'display rate',
          'frame interval median',
          'frames',
          'picture moves every',
          'breaks of the beat',
          'per minute',
          'frames that repeated the picture',
          'frames that jumped',
          'longest run of repeats'
        ],
        [
          [
            `${f0(m.interval.rate)} Hz`,
            `${f1(m.interval.median)} ms`,
            m.frames,
            `${m.cadence.beat} frame(s)${m.cadence.interpolated ? ', interpolated' : ''}`,
            m.cadence.breaks,
            f1(m.cadence.perMinute),
            m.cadence.repeats,
            m.cadence.jumps,
            m.cadence.longestRepeatRun
          ]
        ]
      ),
      '',
      runMarkdown('pacing run', m, note ? [note] : []),
      ''
    ].join('\n')
    return { md, json: { run: m }, summary }
  }
}

// ------------------------------------------------------------------------------------------------------ main

const SECTION_TITLES = {
  boot: 'Boot',
  menus: 'Menus',
  play: 'Play',
  boss: 'Boss',
  pacing: 'Pacing'
}
const SECTION_FUNCTIONS = {
  boot: sectionBoot,
  menus: sectionMenus,
  play: sectionPlay,
  boss: sectionBoss,
  pacing: sectionPacing
}

function gitHead() {
  const result = spawnSync('git', ['rev-parse', '--short', 'HEAD'], { cwd: root, encoding: 'utf8' })
  return result.status === 0 ? result.stdout.trim() : 'unknown'
}

async function main() {
  const started = Date.now()
  mkdirSync(out, { recursive: true })
  await startTarget()
  await startBrowser()

  const results = new Map()
  for (const name of SECTIONS) {
    if (!wanted.has(name)) continue
    const t0 = Date.now()
    console.log(`[perf] section ${name}`)
    try {
      results.set(name, { ...(await SECTION_FUNCTIONS[name]()), seconds: (Date.now() - t0) / 1000 })
    } catch (error) {
      console.error(`[perf] section ${name} failed: ${error.message}`)
      results.set(name, { error: error.stack ?? String(error), seconds: (Date.now() - t0) / 1000, summary: [] })
    }
  }
  await cleanup()

  const summary = [...results.values()].flatMap((r) => r.summary)
  const failed = summary.filter((r) => r.ok === false)
  const failedSections = [...results.entries()].filter(([, r]) => r.error).map(([name]) => name)
  const command = `node scripts/hoshi-no-hamham-perf.mjs ${args.join(' ')}`.trim()
  // The recorded runs that say nothing sure about the page: their thread was kept from running from outside.
  const disturbed = [...results.values()]
    .flatMap((r) =>
      r.json ? [...(r.json.runs ?? []), ...(r.json.run ? [{ name: 'pacing', ...r.json.run }] : [])] : []
    )
    .filter((m) => heldMs(m) > 0)
    .map((m) => `${m.name} (${f0(heldMs(m))} ms)`)
  const budgetTable = table(
    ['budget', 'section', 'run', 'value', 'limit', 'result'],
    summary.map((r) => {
      const b = BUDGETS.find((x) => x.id === r.id)
      return [`${r.id}: ${b.what}`, r.section, r.run, r.value, b.limit, verdict(r.ok)]
    })
  )

  const lines = [
    '# 星のハムハム performance report',
    '',
    `- command: \`${command}\``,
    `- date: ${new Date().toISOString()}`,
    `- commit: ${gitHead()}`,
    `- Chromium: ${environment.chromium}; renderer: ${environment.renderer || '(not read)'}; ${gpu ? 'GPU on (--gpu)' : 'headless shell, software rendering (frame intervals are not judged; use --gpu)'}`,
    `- ${throttleText} (the budgets are stated for 4); target: ${dev ? 'Vite dev server' : 'production build made by the kit'}`,
    `- result: ${failed.length} of ${summary.filter((r) => r.ok !== null).length} budget checks failed${failedSections.length ? `; sections that failed to run: ${failedSections.join(', ')}` : ''}${problems.length ? `; ${problems.length} page or request problems` : ''}`,
    `- runs in which the game's thread was kept from running from outside: ${disturbed.length ? `${disturbed.join(', ')}: their durations are the machine's as much as the page's (make them again on a quiet machine, or with --tries)` : 'none'}`,
    '',
    '## Budgets',
    '',
    budgetTable,
    ''
  ]
  if (problems.length)
    lines.push(
      '## Page errors, console errors and failed requests',
      '',
      ...[...new Set(problems)].map((p) => `- ${p}`),
      ''
    )
  for (const [name, r] of results) {
    lines.push(`## ${SECTION_TITLES[name]} (${f0(r.seconds)} s)`, '')
    lines.push(r.error ? `**The section failed:**\n\n\`\`\`\n${r.error}\n\`\`\`\n` : r.md)
  }
  const reportPath = join(out, 'report.md')
  writeFileSync(reportPath, lines.join('\n'))
  writeFileSync(
    join(out, 'report.json'),
    JSON.stringify(
      {
        command,
        date: new Date().toISOString(),
        commit: gitHead(),
        environment,
        throttle,
        gpu,
        dev,
        disturbed,
        budgets: summary.map((r) => ({ ...r, limit: BUDGETS.find((b) => b.id === r.id).limit, result: verdict(r.ok) })),
        sections: Object.fromEntries([...results].map(([name, r]) => [name, r.error ? { error: r.error } : r.json])),
        problems: [...new Set(problems)]
      },
      null,
      2
    )
  )

  console.log(`\n${budgetTable}\n`)
  if (problems.length) console.log(`Problems:\n${[...new Set(problems)].map((p) => `  ${p}`).join('\n')}\n`)
  if (disturbed.length) console.log(`Kept from running from outside: ${disturbed.join(', ')}`)
  console.log(`${failed.length} budget checks failed. Report: ${reportPath} (${f0((Date.now() - started) / 1000)} s)`)

  if (problems.length || failedSections.length || (check && failed.length)) process.exitCode = 1
}

main()
  .catch((error) => {
    console.error(error)
    process.exitCode = 1
  })
  .finally(async () => {
    await cleanup()
    process.exit(process.exitCode ?? 0)
  })
