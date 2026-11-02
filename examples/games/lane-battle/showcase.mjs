// Local-only review captures of the real game renderer: every unit's attack against dummies placed in
// and out of its area, every status and zone, hurt and knock-out, and a mixed battle. Scenes come from a
// route-intercepted simulation.js whose createGame builds the scene while the real step() runs.
// Usage: LANE_URL=… node examples/games/lane-battle/showcase.mjs [outDir]
//        LANE_SHOWCASE_ONLY=attack-geri,status  (comma-separated scene-name prefixes)
import { chromium } from '@playwright/test'
import sharp from 'sharp'
import fs from 'node:fs/promises'
import { execFileSync } from 'node:child_process'
import { POOPS, SPECIALS, ENEMIES } from './simulation.js'
import { koSeconds } from './models.js'

const out = process.argv[2] || process.env.LANE_SHOWCASE_DIR || '/tmp/lane-showcase'
const url = process.env.LANE_URL || 'http://127.0.0.1:5193/examples/games/lane-battle/'
const only = process.env.LANE_SHOWCASE_ONLY?.split(',').filter(Boolean)
const FPS = 30
const ffmpeg = process.env.FFMPEG_BIN || 'ffmpeg'

const source = await fs.readFile(new URL('./simulation.js', import.meta.url), 'utf8')
const fixture =
  source
    .replace('export function createGame(', 'function baseGame(')
    .replace('export function step(', 'function baseStep(') +
  `
function buildScene(scene) {
  const s = baseGame(scene.stage ?? 0, [], 1)
  Object.assign(s, { spawn: scene.spawn ?? 1e9, opened: 2, rushes: 99, turret: 1e9, gold: 0, deck: [], cooldowns: [] })
  if (scene.lucky) s.rng = () => 0
  for (const spec of scene.units) {
    const side = spec.side ?? (ENEMIES.some((t) => t.key === spec.key) ? -1 : 1)
    if (side === 1) {
      const c = card({ uid: s.deck.length + 1, key: spec.key, level: spec.level })
      if (spec.boost) Object.assign(c, { hp: c.hp * spec.boost, atk: c.atk * spec.boost })
      if (scene.auto) c.cooldown = 1
      s.deck.push(c)
      s.cooldowns.push(0)
      s.gold = 1e9
      summon(s, s.deck.length - 1, 1)
      s.gold = 0
      s.cooldowns[s.cooldowns.length - 1] = 0
    } else summon(s, ENEMIES.findIndex((t) => t.key === spec.key), -1)
    const u = s.units.at(-1)
    u.x = spec.x
    u.tag = spec.tag
    if (spec.hp) u.hp = u.maxHp = spec.hp
    if (spec.hpRatio) u.hp = u.maxHp * spec.hpRatio
    if (spec.dummy) Object.assign(u, { speed: 0, range: 0, attack: 1e9 })
    if (spec.attackIn !== undefined) Object.assign(u, { attack: spec.attackIn, phase: Math.max(0, u.cycle - spec.attackIn), motion: 'attack' })
    if (spec.status) Object.assign(u, structuredClone(spec.status))
  }
  for (const zone of scene.zones ?? []) s.zones.push({ next: 1e9, atk: 0, src: { side: zone.side }, ...zone })
  s.script = structuredClone(scene.script ?? [])
  return s
}
export function createGame(stage = 0, deck, seed) {
  return globalThis.__scene ? buildScene(globalThis.__scene) : baseGame(stage, deck, seed)
}
export function step(s, dt) {
  baseStep(s, dt)
  for (const event of s.script ?? []) {
    if (event.done || s.time < event.at) continue
    event.done = true
    const u = s.units.find((unit) => unit.tag === event.tag)
    if (!u) continue
    if (event.hurt) u.hurt = { at: s.time, power: event.hurt }
    if (event.kill) {
      u.hp = 0
      u.hurt = { at: s.time, power: 1.6 }
      if (event.flushed) u.flushed = true
    }
  }
  const auto = globalThis.__scene?.auto
  if (auto && !s.result) {
    s.autoNext = (s.autoNext ?? 0) - dt
    if (s.autoNext <= 0) {
      s.autoNext = auto
      s.gold = 999
      for (let k = 0; k < s.deck.length; k++) if (summon(s, (s.autoIndex = ((s.autoIndex ?? -1) + 1) % s.deck.length), 1)) break
      s.gold = 0
    }
  }
}
`

// ── Scenes ──
const PLAYER = [...POOPS, ...SPECIALS]
const ALL = [...PLAYER, ...ENEMIES]
const isEnemy = (key) => ENEMIES.some((t) => t.key === key)
/** Dummy distances (lane units, forward of the attacker) placed inside and outside each area. */
function placements(t) {
  const r = t.range
  const first = Math.max(14, r - 6)
  switch (t.areaKind) {
    case 'circle':
      return [first, first + t.radius * 0.6, first + t.radius + 18]
    case 'band':
      return [first, r + t.extra * 0.5, r + t.extra - 2, r + t.extra + 22]
    case 'cone':
    case 'pierce':
      return [40, r * 0.55, r - 8, r + 30]
    case 'shockwave':
      return [first, first + 32, first + 66, first + 100]
    case 'ring':
      return [first, r + 30, r + 62, -30]
    case 'bounce':
      return [first, first + 48, first + 110]
    default:
      return t.key === 'milk' ? [first, first + 40, first + 90] : [first, first + 34]
  }
}
function attackScene(t) {
  const enemy = isEnemy(t.key)
  const x = enemy ? 330 : 670
  const dir = enemy ? 1 : -1
  const dummy = enemy ? 'korokoro' : 'cleaner'
  const units = [{ key: t.key, x, attackIn: 0.6, tag: 'attacker' }]
  for (const [i, d] of placements(t).entries())
    units.push({
      key: dummy,
      x: x + dir * d,
      hp: 1e6,
      hpRatio: t.key === 'washiki' && i === 0 ? 0.15 : undefined,
      dummy: true
    })
  const xs = units.map((u) => u.x)
  return {
    name: `attack-${t.key}`,
    title: `${t.name}：${t.area}／${t.effect}`,
    scene: { units, lucky: true },
    seconds: 2.6,
    strike: 0.6,
    crop: [Math.min(...xs) - 110, Math.max(...xs) + 110]
  }
}
function statusScene() {
  const dummy = (key, x, status) => ({ key, x, dummy: true, hp: 1e6, status })
  const forever = 1e9
  return {
    name: 'status',
    title: '状態異常・ゾーン一覧',
    seconds: 2,
    strike: 0,
    crop: [40, 960],
    scene: {
      units: [
        dummy('cleaner', 90, { control: { kind: 'freeze', start: 0, end: forever } }),
        dummy('cleaner', 150, { control: { kind: 'stun', start: 0, end: forever } }),
        dummy('cleaner', 210, { control: { kind: 'launch', start: 0.3, end: 0.9 } }),
        dummy('cleaner', 270, { control: { kind: 'confuse', start: 0, end: forever } }),
        dummy('cleaner', 330, { slow: { end: forever, factor: 0.5 }, drowsy: { end: forever } }),
        dummy('mop', 390, { burn: { end: forever, next: forever } }),
        dummy('washiki', 450, {
          poison: [0, 1, 2].map(() => ({ end: forever, next: forever })),
          curry: { end: 1.6 }
        }),
        dummy('katachi', 560, { vuln: { end: forever }, weak: { end: forever } }),
        dummy('geri', 630, { charged: true }),
        dummy('daiou', 710, { rally: { end: forever } }),
        dummy('energy', 790, { ramp: 5, rally: { end: forever } }),
        dummy('korokoro', 860, { control: { kind: 'stun', start: 0, end: forever }, vuln: { end: forever } })
      ],
      zones: [
        { kind: 'mud', side: 1, x: 300, end: forever, sourceId: -1 },
        { kind: 'stench', side: 1, x: 420, end: forever, sourceId: -2 },
        { kind: 'wet', side: -1, x: 700, end: forever, sourceId: -3 }
      ]
    }
  }
}
function deathScene(t) {
  const enemy = isEnemy(t.key)
  return {
    name: `death-${t.key}`,
    title: `${t.name}：くらい（弱・強）→ 死亡`,
    seconds: 1.6 + koSeconds(t.key) + 0.3,
    strike: 0.2,
    crop: [380, 620],
    scene: {
      units: [{ key: t.key, x: 500, dummy: true, hp: 1e6, tag: 'victim', side: enemy ? -1 : 1 }],
      script: [
        { at: 0.2, tag: 'victim', hurt: 0.8 },
        { at: 0.9, tag: 'victim', hurt: 1.6 },
        { at: 1.6, tag: 'victim', kill: true }
      ]
    }
  }
}
function battleScene(name, viewport) {
  const poops = [
    'katachi',
    'katachi',
    'korokoro',
    'geri',
    'bichi',
    'dodeka',
    'daiou',
    'jiro',
    'garlic',
    'aircon',
    'curry',
    'energy'
  ]
  const foes = ['cleaner', 'cleaner', 'yogurt', 'sayu', 'washiki', 'mop', 'yoshiki', 'seichou', 'geridome', 'mop']
  return {
    name,
    title: '混戦（両軍・効果多数）',
    viewport,
    seconds: 7,
    warmup: 2,
    strike: 0,
    crop: [0, 1000],
    scene: {
      stage: 15,
      units: [
        ...poops.map((key, i) => ({ key, x: 640 + i * 24, boost: 2.5, level: 20 })),
        ...foes.map((key, i) => ({ key, x: 120 + i * 26 }))
      ]
    }
  }
}
const SCENES = [
  ...ALL.map(attackScene),
  statusScene(),
  ...ALL.map(deathScene),
  battleScene('battle', [1280, 800]),
  battleScene('battle-portrait', [390, 844])
].filter((s) => !only || only.some((prefix) => s.name.startsWith(prefix)))

// ── Capture ──
await fs.mkdir(out, { recursive: true })
const browser = await chromium.launch({ channel: 'chrome', headless: true })
const index = []
for (const shot of SCENES) {
  const [width, height] = shot.viewport ?? [1280, 800]
  const page = await browser.newPage({ viewport: { width, height }, deviceScaleFactor: 1 })
  const errors = []
  page.on('pageerror', (e) => errors.push(String(e)))
  await page.addInitScript((scene) => (globalThis.__scene = scene), shot.scene)
  await page.clock.install({ time: new Date(0) })
  await page.clock.pauseAt(new Date(0))
  await page.route('**/lane-battle/simulation.js*', (route) =>
    route.fulfill({ contentType: 'application/javascript', body: fixture })
  )
  await page.goto(url)
  while (!(await page.locator('dialog[open]').count())) await page.clock.runFor(50)
  await page.getByRole('button', { name: 'ステージ選択へ' }).click()
  await page.getByRole('button', { name: 'ブリッと出撃' }).click()
  if (shot.warmup) await page.clock.runFor(shot.warmup * 1000)
  const dir = `${out}/${shot.name}`
  await fs.rm(dir, { recursive: true, force: true })
  await fs.mkdir(dir, { recursive: true })
  const canvas = page.locator('#field canvas')
  const box = await canvas.boundingBox()
  const frames = Math.round(shot.seconds * FPS)
  for (let f = 0; f < frames; f++) {
    await page.clock.runFor(1000 / FPS)
    await canvas.screenshot({ path: `${dir}/f${String(f).padStart(3, '0')}.png` })
  }
  await page.close()
  // Crop around the action in lane units (x) and the battle line (y 120..450).
  const px = box.width / 1000,
    py = box.height / 450
  const left = Math.max(0, Math.round(shot.crop[0] * px)),
    right = Math.min(Math.round(box.width), Math.round(shot.crop[1] * px))
  const top = Math.round(150 * py),
    cropW = right - left,
    cropH = Math.round(435 * py) - top
  const label = (text, w) =>
    Buffer.from(
      `<svg width="${w}" height="18"><rect width="100%" height="100%" fill="#fff"/><text x="4" y="13" font-size="12" font-family="Hiragino Sans, sans-serif" fill="#222">${text}</text></svg>`
    )
  const cell = async (f, scale) => {
    const file = `${dir}/f${String(f).padStart(3, '0')}.png`
    const img = await sharp(file)
      .extract({ left, top, width: cropW, height: cropH })
      .resize(cropW * scale, cropH * scale, { kernel: scale > 1 ? 'lanczos3' : 'nearest' })
      .png()
      .toBuffer()
    const t = (f + 1) / FPS - (shot.warmup ? 0 : shot.strike)
    return sharp({ create: { width: cropW * scale, height: cropH * scale + 18, channels: 3, background: '#fff' } })
      .composite([
        { input: label(`${t >= 0 ? '+' : ''}${t.toFixed(2)}s`, cropW * scale), top: 0, left: 0 },
        { input: img, top: 18, left: 0 }
      ])
      .png()
      .toBuffer()
  }
  const sheet = async (picks, scale, cols, file) => {
    const cells = await Promise.all(picks.map((f) => cell(f, scale)))
    const w = cropW * scale,
      h = cropH * scale + 18
    const rows = Math.ceil(cells.length / cols)
    await sharp({ create: { width: w * cols, height: h * rows + 24, channels: 3, background: '#fff' } })
      .composite([
        { input: label(shot.title, w * cols), top: 0, left: 0 },
        ...cells.map((input, i) => ({ input, left: (i % cols) * w, top: 24 + Math.floor(i / cols) * h }))
      ])
      .png()
      .toFile(file)
  }
  const every = [...Array(frames).keys()].filter((f) => f % 3 === 2)
  await sheet(every, 1, Math.min(every.length, Math.max(4, Math.floor(2400 / cropW))), `${dir}.png`)
  const at = (sec) => Math.min(frames - 1, Math.max(0, Math.round((sec + shot.strike) * FPS) - 1))
  const keys = shot.warmup
    ? [0.3, 1.5, 3, 4.5].map(at)
    : [-0.3, -0.1, 0, 0.033, 0.1, 0.2, 0.45, 0.9].map(at).filter((f, i, a) => a.indexOf(f) === i)
  await sheet(keys, 3, Math.min(keys.length, Math.max(2, Math.floor(3600 / (cropW * 3)))), `${dir}-x3.png`)
  execFileSync(ffmpeg, [
    '-y',
    '-loglevel',
    'error',
    '-framerate',
    String(FPS),
    '-i',
    `${dir}/f%03d.png`,
    '-c:v',
    'libvpx-vp9',
    '-pix_fmt',
    'yuv420p',
    '-b:v',
    '0',
    '-crf',
    '28',
    `${dir}.webm`
  ])
  index.push({ ...shot, errors })
  console.log(shot.name, frames, 'frames', errors.length ? `ERRORS ${errors.join(' | ')}` : '')
}
await browser.close()
await fs.writeFile(
  `${out}/index.html`,
  `<!doctype html><meta charset="utf-8"><title>うんこ大惨事 showcase</title><style>body{font:14px sans-serif;margin:16px}section{margin:0 0 28px}img{max-width:100%;display:block;margin:4px 0}video{max-width:100%}</style>` +
    index
      .map(
        (s) =>
          `<section><h2>${s.title} <small>${s.name}</small></h2>${s.errors.length ? `<p style="color:red">${s.errors.join('<br>')}</p>` : ''}<video src="${s.name}.webm" controls loop muted></video><img src="${s.name}.png"><img src="${s.name}-x3.png"></section>`
      )
      .join('')
)
console.log(`${out}/index.html`)
if (index.some((s) => s.errors.length)) process.exitCode = 1
