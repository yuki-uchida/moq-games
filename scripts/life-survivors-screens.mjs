// Headless captures of the real Life Survivors game (dev server + Playwright, dev hook window.__life):
//   screens  → .build/life-survivors-art/screens/   stills (+ ×2 crops) at every stage, deaths, bosses, reaper
//   playback → .build/life-survivors-art/playback/dsf{1,2}/   recorded .webm clips + ffmpeg frame strips (native, ×3)
// Usage: E2E_PORT=5294 node scripts/life-survivors-screens.mjs [screens] [playback] [dsf=1|2]
import { execFileSync } from 'node:child_process'
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { chromium } from '@playwright/test'
import sharp from 'sharp'
import { createServer } from 'vite'
import {
  ARSENAL_ENEMIES,
  BOSSES,
  BOSS_CROWD,
  DEATHS,
  PART1,
  STAGES,
  TAG_DEATHS
} from './life-survivors-screen-data.mjs'

const root = fileURLToPath(new URL('..', import.meta.url))
const outRoot = resolve(process.env.LIFE_SURVIVORS_SCREEN_DIR || resolve(root, '.build/life-survivors-art'))
const port = Number(process.env.E2E_PORT || 5294)
const FFMPEG = process.env.FFMPEG || '/opt/homebrew/bin/ffmpeg'
const args = process.argv.slice(2)
const doScreens =
  !args.some((a) => a === 'playback' || a === 'deaths' || a === 'part1' || a === 'arsenal') || args.includes('screens')
const doPlayback =
  !args.some((a) => a === 'screens' || a === 'deaths' || a === 'part1' || a === 'arsenal') || args.includes('playback')
const doDeaths =
  !args.some((a) => a === 'screens' || a === 'playback' || a === 'part1' || a === 'arsenal') || args.includes('deaths')
const doPart1 = args.includes('part1')
const doArsenal = args.includes('arsenal')
const only = args
  .find((a) => a.startsWith('only='))
  ?.slice(5)
  .split(',')
const dsfs = args
  .find((a) => a.startsWith('dsf='))
  ?.slice(4)
  .split(',')
  .map(Number) ?? [1, 2]

const server = await createServer({
  configFile: resolve(root, 'vite.config.life-survivors.mjs'),
  server: { port, strictPort: true },
  logLevel: 'error'
})
await server.listen()
const browser = await chromium.launch({ headless: true })
const written = []
const errors = []

async function start(page) {
  await page.goto(`http://127.0.0.1:${port}/`)
  await page.getByRole('button', { name: 'ひとりで生まれる' }).click()
  await page.locator('#hud').waitFor()
}

/** Sets the age, clears the field, removes weapons so crowds stay, and spawns enemies in a ring. */
const scene = (page, age, enemies, hp = Infinity, radius = 1) =>
  page.evaluate(
    async ({ age, enemies, hp, radius }) => {
      const { timeAtAge } = await import('/src/data.ts')
      const l = window.__life
      const s = l.game.state
      const p = s.players[0]
      s.time = timeAtAge(age) + 1
      s.eventIndex = 999
      s.enemies = []
      s.gems = []
      p.weapons = []
      p.choices = []
      p.pending = p.parentRewardPending = p.swapPending = p.careerPending = 0
      p.birthPick = false
      p.hp = Math.min(hp, p.maxHp)
      // Regeneration clamps hp to maxHp, so keep a scenery player topped up instead.
      clearInterval(window.__keepAlive)
      if (hp > 1) window.__keepAlive = setInterval(() => (p.hp = p.maxHp), 50)
      enemies.forEach((kind, i) => {
        const a = (i / enemies.length) * Math.PI * 2 + 0.4
        const d = (kind.startsWith('b_') ? 200 : 110 + (i % 3) * 45) * radius
        if (!l.game.spawnEnemy(kind, p.x + Math.cos(a) * d * 1.6, p.y + Math.sin(a) * d))
          throw new Error(`Cannot spawn scene enemy: ${kind}`)
      })
    },
    { age, enemies, hp, radius }
  )

const kill = async (page, killer) => {
  await page.evaluate((killer) => {
    const l = window.__life
    const p = l.game.state.players[0]
    p.hp = 0.01
    p.invuln = 0
    if (killer === 'temptation') p.dating = true
    if (!l.game.spawnEnemy(killer, p.x + 4, p.y)) throw new Error(`Cannot spawn death enemy: ${killer}`)
    // Once the blow lands, clear the field so the death animation is unobstructed.
    setTimeout(() => (l.game.state.enemies = []), 150)
  }, killer)
  await page.waitForFunction(
    (kind) => {
      const player = window.__life.game.state.players[0]
      return player.downed && player.killer === kind
    },
    killer,
    { timeout: 2000 }
  )
}

const nearEnd = (page) =>
  page.evaluate(async () => {
    const { RUN_SECONDS } = await import('/src/data.ts')
    window.__life.game.state.time = RUN_SECONDS - 0.3
  })

// ---------------------------------------------------------------------------------------------
// Stills.

if (doScreens) {
  const out = resolve(outRoot, 'screens')
  rmSync(out, { recursive: true, force: true })
  mkdirSync(out, { recursive: true })
  const page = await browser.newPage({ viewport: { width: 1280, height: 720 }, deviceScaleFactor: 2 })
  page.on('pageerror', (error) => errors.push(error.message))
  const shot = async (name) => {
    const path = resolve(out, `${name}.png`)
    await page.screenshot({ path })
    // A ×2 nearest-neighbour crop (480×300 device px) centred on the player, who is always mid-screen.
    const piece = await sharp(path)
      .extract({ left: 1280 - 240, top: 720 - 150, width: 480, height: 300 })
      .toBuffer()
    await sharp(piece)
      .resize({ width: 960, kernel: 'nearest' })
      .toFile(resolve(out, `${name}_x2.png`))
    written.push(path)
  }
  await start(page)
  for (const [name, age, enemies] of STAGES) {
    await scene(page, age, enemies)
    await page.waitForTimeout(1700)
    await page.keyboard.down('KeyD')
    await page.waitForTimeout(500)
    await shot(`age-${String(age).padStart(2, '0')}-${name}-walk`)
    await page.keyboard.up('KeyD')
    await page.waitForTimeout(1500)
    await shot(`age-${String(age).padStart(2, '0')}-${name}-idle`)
  }
  for (const [boss, age] of BOSSES) {
    await scene(page, age, [boss, 'germ', 'insult'], Infinity, 0.6)
    await page.waitForTimeout(1600)
    await shot(`boss-${boss}`)
  }
  // Polished enemies up close (資格試験, 噂話, 交通事故).
  await scene(page, 25, ['cert', 'gossip', 'car', 'cert'], Infinity, 0.45)
  await page.waitForTimeout(1200)
  await shot('enemies-polish')
  for (const [name, age, killer] of DEATHS.slice(0, 2).concat([DEATHS.find((d) => d[0] === 'collapse-小学生')])) {
    await start(page)
    await scene(page, age, [], 0.01)
    await page.waitForTimeout(1700)
    await kill(page, killer)
    await page.waitForTimeout(900)
    await shot(`death-${name}-1-mid`)
    await page.waitForTimeout(1300)
    await shot(`death-${name}-2-late`)
    await page.waitForTimeout(1500)
    await shot(`death-${name}-3-result`)
  }
  await start(page)
  await scene(page, 79, [])
  await nearEnd(page)
  await page.waitForTimeout(2200)
  await shot('reaper')
  await page.close()
}

// ---------------------------------------------------------------------------------------------
// Playback: real recorded video of the running game, then frame strips cut from that video.

/** Tiles consecutive video frames (cropped around the screen centre) into one PNG, plus a ×3 copy. */
function strip(video, file, { from, seconds, fps, w, h, dsf, cols = 12, dy = 0 }) {
  const frames = Math.max(1, Math.round(seconds * fps))
  const rows = Math.ceil(frames / cols)
  const cw = Math.round(w * dsf)
  const ch = Math.round(h * dsf)
  const x = Math.round((1280 * dsf - cw) / 2)
  const y = Math.round((720 * dsf - ch) / 2 + dy * dsf)
  const vf = `fps=${fps},crop=${cw}:${ch}:${x}:${y},tile=${Math.min(cols, frames)}x${rows}:padding=2:color=0x222222`
  const native = `${file}_1x.png`
  execFileSync(FFMPEG, [
    '-y',
    '-loglevel',
    'error',
    '-ss',
    String(from),
    '-t',
    String(seconds),
    '-i',
    video,
    '-vf',
    vf,
    '-frames:v',
    '1',
    native
  ])
  execFileSync(FFMPEG, [
    '-y',
    '-loglevel',
    'error',
    '-i',
    native,
    '-vf',
    'scale=iw*3:ih*3:flags=neighbor',
    `${file}_x3.png`
  ])
  written.push(native)
}

/**
 * Records the real running page. Playwright's bundled encoder lacks VP8 here, so frames come from Chrome's
 * own screencast (PNG, device pixels) and are encoded with the system ffmpeg into a lossless VP9 .webm,
 * timed by each frame's capture timestamp. Marks are seconds into that video.
 */
/** Starts Chrome's own screencast of a page; frames (PNG, device px) are kept with their timestamps. */
async function screencast(context, page, dsf) {
  const tmp = mkdtempSync(join(tmpdir(), 'ls-clip-'))
  const frames = []
  const writes = []
  const cdp = await context.newCDPSession(page)
  cdp.on('Page.screencastFrame', (e) => {
    const file = join(tmp, `f${String(frames.length).padStart(5, '0')}.png`)
    frames.push({ file, ts: e.metadata.timestamp })
    writes.push(writeFile(file, Buffer.from(e.data, 'base64')))
    cdp.send('Page.screencastFrameAck', { sessionId: e.sessionId }).catch(() => {})
  })
  await cdp.send('Page.startScreencast', {
    format: 'png',
    maxWidth: 1280 * dsf,
    maxHeight: 720 * dsf,
    everyNthFrame: 1
  })
  return {
    frames,
    async stop() {
      await cdp.send('Page.stopScreencast')
      await Promise.all(writes)
    },
    /** Encodes a lossless VP9 .webm timed by the capture timestamps; returns the first frame's time. */
    encode(path) {
      const list = ['ffconcat version 1.0']
      frames.forEach((f, k) => {
        list.push(
          `file '${f.file}'`,
          `duration ${Math.max(0.001, (frames[k + 1]?.ts ?? f.ts + 1 / 30) - f.ts).toFixed(4)}`
        )
      })
      list.push(`file '${frames[frames.length - 1].file}'`)
      writeFileSync(join(tmp, 'list.txt'), list.join('\n'))
      execFileSync(FFMPEG, [
        ...['-y', '-loglevel', 'error', '-f', 'concat', '-safe', '0', '-i', join(tmp, 'list.txt')],
        ...[
          '-fps_mode',
          'cfr',
          '-r',
          '30',
          '-c:v',
          'libvpx-vp9',
          '-lossless',
          '1',
          '-deadline',
          'realtime',
          '-cpu-used',
          '8',
          path
        ]
      ])
      rmSync(tmp, { recursive: true, force: true })
      return frames[0].ts
    }
  }
}

/**
 * Records the real running page. Playwright's bundled encoder lacks VP8 here, so frames come from Chrome's
 * own screencast and are encoded with the system ffmpeg. Marks are seconds into the video. Chrome's
 * screencast emits CSS-pixel frames, so the 2× run uses a 2560×1440 viewport at dpr 1: the game canvas
 * renders at exactly 2 device px per art px either way (scale = viewport / 1280 × dpr).
 */
async function clip(dsf, dir, name, run) {
  const context = await browser.newContext({ viewport: { width: 1280 * dsf, height: 720 * dsf }, deviceScaleFactor: 1 })
  const page = await context.newPage()
  page.on('pageerror', (error) => errors.push(error.message))
  const rec = await screencast(context, page, dsf)
  const wall = {}
  await run(page, (key) => (wall[key] = Date.now() / 1000))
  await page.waitForTimeout(200)
  await rec.stop()
  await context.close()
  const path = resolve(dir, `${name}.webm`)
  const first = rec.encode(path)
  const marks = Object.fromEntries(Object.entries(wall).map(([k, t]) => [k, Math.max(0, t - first)]))
  return { path, marks }
}

if (doPlayback)
  for (const dsf of dsfs) {
    const dir = resolve(outRoot, `playback/dsf${dsf}`)
    rmSync(dir, { recursive: true, force: true })
    mkdirSync(dir, { recursive: true })
    const at = (name) => resolve(dir, name)
    // 1. Every stage: walking right, walking left, idle — with a few enemies about.
    for (const [name, age, enemies] of STAGES) {
      const { path, marks } = await clip(dsf, dir, `stage-${name}`, async (page, mark) => {
        await start(page)
        await scene(page, age, enemies, Infinity, 1.6)
        await page.waitForTimeout(1600)
        mark('right')
        await page.keyboard.down('KeyD')
        await page.waitForTimeout(2000)
        await page.keyboard.up('KeyD')
        mark('left')
        await page.keyboard.down('KeyA')
        await page.waitForTimeout(2000)
        await page.keyboard.up('KeyA')
        mark('idle')
        await page.waitForTimeout(1600)
      })
      const box = { w: 110, h: 100, dsf, dy: -12 }
      strip(path, at(`walk-${name}-right`), { ...box, from: marks.right + 0.2, seconds: 1.75, fps: 24 })
      strip(path, at(`walk-${name}-left`), { ...box, from: marks.left + 0.2, seconds: 1.75, fps: 24 })
      strip(path, at(`walk-${name}-right-12fps`), { ...box, from: marks.right, seconds: 2, fps: 12 })
      strip(path, at(`idle-${name}`), { ...box, from: marks.idle + 0.1, seconds: 1.5, fps: 12 })
    }
    // 2. Every death, from the moment the player is downed to the held last frame, then the result dialog.
    for (const [name, age, killer] of DEATHS) {
      const { path, marks } = await clip(dsf, dir, `death-${name}`, async (page, mark) => {
        await start(page)
        await scene(page, age, [], 0.01)
        await page.waitForTimeout(1600)
        await kill(page, killer)
        mark('down')
        await page.waitForTimeout(5200)
      })
      strip(path, at(`death-${name}`), { from: marks.down, seconds: 4.6, fps: 12, w: 130, h: 120, dsf, dy: -20 })
      strip(path, at(`death-${name}-result`), {
        from: marks.down + 4.4,
        seconds: 0.5,
        fps: 2,
        w: 640,
        h: 420,
        dsf,
        cols: 1
      })
    }
    // 3. Each boss with a crowd of regular enemies chasing the player.
    for (const [boss, age] of BOSSES) {
      const { path, marks } = await clip(dsf, dir, `boss-${boss}`, async (page, mark) => {
        await start(page)
        await scene(page, age, [boss, ...BOSS_CROWD], Infinity, 1.2)
        await page.waitForTimeout(800)
        mark('chase')
        await page.keyboard.down('KeyA')
        await page.waitForTimeout(2200)
        await page.keyboard.up('KeyA')
      })
      strip(path, at(`boss-${boss}`), { from: marks.chase, seconds: 2, fps: 12, w: 420, h: 300, dsf, cols: 6 })
    }
    // 4. The reaper's arrival through the 大往生 result.
    {
      const { path, marks } = await clip(dsf, dir, 'reaper', async (page, mark) => {
        await start(page)
        await scene(page, 79, ['illness', 'germ'])
        await page.waitForTimeout(800)
        await nearEnd(page)
        mark('arrive')
        await page.waitForTimeout(6000)
      })
      strip(path, at('reaper'), { from: marks.arrive, seconds: 4.4, fps: 12, w: 300, h: 240, dsf, cols: 8, dy: -30 })
      strip(path, at('reaper-result'), { from: marks.arrive + 5.4, seconds: 0.5, fps: 2, w: 640, h: 420, dsf, cols: 1 })
    }
  }

if (doDeaths) {
  const dir = resolve(outRoot, 'playback/deaths')
  if (!only) rmSync(dir, { recursive: true, force: true })
  mkdirSync(dir, { recursive: true })
  const buildMs = []
  const at = (name) => resolve(dir, name)
  for (const [name, age, killer] of TAG_DEATHS) {
    if (only && !only.includes(name)) continue
    const { path, marks } = await clip(1, dir, `death-${name}`, async (page, mark) => {
      await start(page)
      await scene(page, age, [], 0.01)
      await page.waitForTimeout(1600)
      await kill(page, killer)
      mark('down')
      await page.waitForTimeout(600)
      buildMs.push(`${name}: ${(await page.evaluate(() => window.__life.deathBuildMs)).toFixed(2)} ms`)
      await page.waitForTimeout(6000)
    })
    strip(path, at(`death-${name}`), { from: marks.down, seconds: 5, fps: 12, w: 220, h: 160, dsf: 1, dy: -30 })
    strip(path, at(`death-${name}-result`), {
      from: marks.down + 6.2,
      seconds: 0.25,
      fps: 4,
      w: 800,
      h: 480,
      dsf: 1,
      cols: 1
    })
  }
  writeFileSync(resolve(dir, 'death-build-ms.txt'), buildMs.join('\n') + '\n')
  console.log(buildMs.join('\n'))
  if (!only || only.includes('ending')) {
    // 大往生: the reaper arrives, the old man smiles, the haloed soul rises, the reaper bows, then the result.
    const { path, marks } = await clip(1, dir, 'ending-daioujou', async (page, mark) => {
      await start(page)
      await scene(page, 79, ['illness', 'germ'])
      await page.waitForTimeout(800)
      await nearEnd(page)
      mark('arrive')
      await page.waitForTimeout(9000)
    })
    strip(path, at('ending-daioujou'), {
      from: marks.arrive,
      seconds: 7.5,
      fps: 8,
      w: 420,
      h: 340,
      dsf: 1,
      cols: 10,
      dy: -70
    })
    strip(path, at('ending-daioujou-result'), {
      from: marks.arrive + 8.6,
      seconds: 0.25,
      fps: 4,
      w: 800,
      h: 520,
      dsf: 1,
      cols: 1
    })
  }
}

const at2 = (dir, name) => resolve(dir, name)

// Part 1 (phase 5): deaths on other bodies, left-facing deaths, and a co-op revive on both screens.
const FAKE_NETWORK = `
export const MAX_PAYLOAD_BYTES = 65536;
export class CooperativeNetwork {
  constructor(options) { this.options = options; this.playerId = options.playerId; }
  async start() {
    const o = this.options;
    this.channel = new BroadcastChannel('life-' + o.room);
    this.channel.onmessage = ({ data }) => {
      if (o.role === 'host' && data.type === 'hello') { this.players.add(data.id); o.onPresence([...this.players]); }
      if (o.role === 'host' && data.type === 'input') o.onInput(data.id, data.input);
      if (o.role === 'guest' && data.type === 'snapshot') o.onSnapshot(data.state);
    };
    this.players = new Set([this.playerId]);
    if (o.role === 'guest') this.channel.postMessage({ type: 'hello', id: this.playerId });
    o.onStatus('ready', 'ok');
  }
  async sendInput(input) { this.channel.postMessage({ type: 'input', id: this.playerId, input }); }
  async broadcastSnapshot(state) { this.channel.postMessage({ type: 'snapshot', state }); }
  async stop() { this.channel?.close(); }
}`

if (doPart1) {
  const dir = resolve(outRoot, 'playback/part1')
  if (!only) rmSync(dir, { recursive: true, force: true })
  mkdirSync(dir, { recursive: true })
  const at = (name) => resolve(dir, name)
  for (const [name, age, killer, left] of PART1) {
    if (only && !only.includes(name)) continue
    const { path, marks } = await clip(1, dir, `death-${name}`, async (page, mark) => {
      await start(page)
      await scene(page, age, [], 0.01)
      await page.waitForTimeout(1400)
      if (left) {
        // Face left: the player's last movement decides the facing of the death.
        await page.keyboard.down('KeyA')
        await page.waitForTimeout(250)
        await page.keyboard.up('KeyA')
      }
      await kill(page, killer)
      mark('down')
      await page.waitForTimeout(6600)
    })
    strip(path, at(`death-${name}`), { from: marks.down, seconds: 5, fps: 12, w: 220, h: 160, dsf: 1, dy: -30 })
    strip(path, at(`death-${name}-result`), {
      from: marks.down + 6.2,
      seconds: 0.25,
      fps: 4,
      w: 800,
      h: 480,
      dsf: 1,
      cols: 1
    })
  }
  if (!only || only.includes('coop')) {
    // Two real pages over a BroadcastChannel relay: the guest goes down, the host stands beside them.
    const context = await browser.newContext({ viewport: { width: 1280, height: 720 } })
    await context.route('**/rabbiters/src/network.ts*', (route) =>
      route.fulfill({ contentType: 'text/javascript', body: FAKE_NETWORK })
    )
    const host = await context.newPage()
    const guest = await context.newPage()
    for (const page of [host, guest]) {
      page.on('pageerror', (error) => errors.push(error.message))
      await page.goto(`http://127.0.0.1:${port}/`)
      await page.locator('#room').fill('art-coop')
    }
    await host.getByRole('button', { name: 'ルームを作る' }).click()
    await host.locator('#hud').waitFor()
    await guest.getByRole('button', { name: 'ルームに参加' }).click()
    await guest.locator('#hud').waitFor()
    await host.waitForFunction(() => window.__life.game.state.players.length === 2)
    const guestId = await guest.evaluate(() => window.__life.localId)
    const recs = [await screencast(context, host, 1), await screencast(context, guest, 1)]
    const wall = {}
    const mark = (key) => (wall[key] = Date.now() / 1000)
    // Age 25, a field cleared; the guest stands 160 units away from the host with 0.01 hp.
    await host.evaluate(async (id) => {
      const { timeAtAge } = await import('/src/data.ts')
      const s = window.__life.game.state
      s.time = timeAtAge(25) + 1
      s.eventIndex = 999
      s.enemies = []
      const [h, g] = [s.players.find((p) => p.id !== id), s.players.find((p) => p.id === id)]
      for (const p of s.players) (p.weapons = []), (p.choices = [])
      g.x = h.x + 160
      g.y = h.y
      g.hp = 0.01
      window.__keepHost = setInterval(() => (h.hp = h.maxHp), 50)
    }, guestId)
    await host.waitForTimeout(1500)
    await host.evaluate((id) => {
      const l = window.__life
      const g = l.game.state.players.find((p) => p.id === id)
      l.game.spawnEnemy('expense', g.x + 4, g.y)
      setTimeout(() => (l.game.state.enemies = []), 150)
    }, guestId)
    mark('down')
    await host.waitForTimeout(3200)
    // The host walks over and stands beside the fallen guest until the revive ring fills.
    await host.evaluate((id) => {
      const s = window.__life.game.state
      const [h, g] = [s.players.find((p) => p.id !== id), s.players.find((p) => p.id === id)]
      h.x = g.x - 30
      h.y = g.y
      // Keep the field clear so nothing knocks the guest down again while we watch them stand up.
      setInterval(() => (window.__life.game.state.enemies = []), 50)
    }, guestId)
    mark('beside')
    await host.waitForFunction((id) => !window.__life.game.state.players.find((p) => p.id === id).downed, guestId, {
      timeout: 8000
    })
    mark('up')
    await host.waitForTimeout(1800)
    const revived = await guest.evaluate(() => {
      const me = window.__life.view.players.find((p) => p.id === window.__life.localId)
      return { downed: me.downed, hp: me.hp, killer: me.killer ?? null }
    })
    console.log('co-op revive (guest view):', JSON.stringify(revived))
    for (const rec of recs) await rec.stop()
    await context.close()
    for (const [k, rec] of recs.entries()) {
      const who = k ? 'guest' : 'host'
      const path = resolve(dir, `coop-revive-${who}.webm`)
      const first = rec.encode(path)
      const rel = (key) => Math.max(0, wall[key] - first)
      strip(path, at(`coop-revive-${who}-down`), {
        from: rel('down'),
        seconds: 3,
        fps: 8,
        w: 360,
        h: 200,
        dsf: 1,
        cols: 8,
        dy: -20
      })
      strip(path, at(`coop-revive-${who}-revive`), {
        from: rel('beside'),
        seconds: rel('up') - rel('beside') + 1.6,
        fps: 6,
        w: 360,
        h: 200,
        dsf: 1,
        cols: 8,
        dy: -20
      })
    }
  }
}

// Phase 5 part 2: weapons, effects and pickups in pixel art — stills of a late build, the level-up screen,
// and recorded strips of every weapon firing and of pickups being collected.
const WEAPON_IDS = [
  'p_toxic',
  'p_edu',
  'p_free',
  'p_weak',
  'p_over',
  'p_monster',
  'p_rich',
  'w_friend',
  'w_sports',
  'w_study',
  'w_love',
  'w_beauty',
  'w_hobby',
  'w_work',
  'w_invest'
]
const arm = (page, ids, lv, passives = []) =>
  page.evaluate(
    ({ ids, lv, passives }) => {
      const p = window.__life.game.state.players[0]
      p.weapons = ids.map((id) => ({ id, lv, cd: 0, held: 0, damage: 0 }))
      p.passives = passives.map((id) => ({ id, lv: 1 }))
    },
    { ids, lv, passives }
  )
if (doArsenal) {
  const out = resolve(outRoot, 'screens')
  mkdirSync(out, { recursive: true })
  const page = await browser.newPage({ viewport: { width: 1280, height: 720 }, deviceScaleFactor: 2 })
  page.on('pageerror', (error) => errors.push(error.message))
  const shot = async (name) => {
    const path = resolve(out, `${name}.png`)
    await page.screenshot({ path })
    const piece = await sharp(path)
      .extract({ left: 1280 - 240, top: 720 - 150, width: 480, height: 300 })
      .toBuffer()
    await sharp(piece)
      .resize({ width: 960, kernel: 'nearest' })
      .toFile(resolve(out, `${name}_x2.png`))
    written.push(path)
  }
  await start(page)
  // A late-game build: a parent plus six talents at Lv8, three of them evolved by their passives.
  await scene(page, 45, ARSENAL_ENEMIES)
  await arm(page, ['p_toxic', 'w_study', 'w_sports', 'w_love', 'w_beauty', 'w_work', 'w_invest'], 8, [
    'p_diligent',
    'p_hot',
    'p_greedy',
    'p_bold'
  ])
  await page.waitForTimeout(2200)
  await shot('weapons-late-build')
  // The HUD hand (weapon and passive slots) at ×2, element-cropped.
  await page.locator('.hand').screenshot({ path: resolve(out, 'hud-slots_x2.png') })
  await arm(page, ['p_rich', 'p_over', 'w_friend', 'w_hobby', 'p_weak', 'p_edu'], 8, [
    'p_kind',
    'p_optimist',
    'p_healthy'
  ])
  await page.evaluate(() => window.__life.game.state.players[0].passives.push({ id: 'p_stubborn', lv: 2 }))
  await page.waitForTimeout(2200)
  await shot('weapons-late-build-2')
  await page.evaluate(() => {
    const l = window.__life
    l.game.state.enemies = []
    l.game.gainXp(l.game.state.xpNext)
  })
  await page.waitForTimeout(900)
  await shot('levelup-cards')
  // The level-up cards with their icons, fully in frame.
  await page.locator('#levelup').screenshot({ path: resolve(out, 'levelup-cards-crop_x2.png') })
  await page.close()

  const dir = resolve(outRoot, 'playback/arsenal')
  rmSync(dir, { recursive: true, force: true })
  mkdirSync(dir, { recursive: true })
  for (const id of WEAPON_IDS) {
    const { path, marks } = await clip(1, dir, `weapon-${id}`, async (p, mark) => {
      await start(p)
      await scene(p, 30, ['germ', 'germ', 'germ', 'germ', 'insult', 'insult', 'germ', 'insult'], Infinity, 0.9)
      // Capture from the moment the weapon is granted, so the first swing or throw is in frame.
      mark('fire')
      await arm(p, [id], 5)
      await p.waitForTimeout(2600)
    })
    strip(path, at2(dir, `weapon-${id}`), { from: marks.fire, seconds: 2, fps: 12, w: 360, h: 260, dsf: 1, cols: 6 })
  }
  const { path, marks } = await clip(1, dir, 'pickups', async (p, mark) => {
    await start(p)
    await scene(p, 30, [])
    await arm(p, [], 1)
    await p.evaluate(() => {
      const s = window.__life.game.state
      const pl = s.players[0]
      pl.hp = pl.maxHp * 0.5
      for (let k = 0; k < 12; k++)
        s.gems.push({ x: pl.x + 30 + k * 12, y: pl.y + ((k % 3) - 1) * 10, v: [1, 5, 25][k % 3], pull: false })
      s.items.push(
        { kind: 'meal', x: pl.x + 70, y: pl.y + 30 },
        { kind: 'chest', x: pl.x + 120, y: pl.y - 30 },
        { kind: 'magnet', x: pl.x + 190, y: pl.y }
      )
    })
    await p.waitForTimeout(600)
    mark('walk')
    await p.keyboard.down('KeyD')
    await p.waitForTimeout(2200)
    await p.keyboard.up('KeyD')
  })
  strip(path, at2(dir, 'pickups'), { from: marks.walk - 0.5, seconds: 2.5, fps: 12, w: 420, h: 220, dsf: 1, cols: 6 })
}

await browser.close()
await server.close()
if (errors.length) throw new Error(`page errors: ${errors.join('; ')}`)
console.log(`${written.length} files, e.g.\n${written.slice(0, 5).join('\n')}`)
