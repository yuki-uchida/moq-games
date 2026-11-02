// Local-only review sheets: every character's walk, attack, hit reaction and knock-out on the game clock,
// rendered by the real LaneModels at the in-game size (×1) and enlarged (×3) for detail, weak/normal/strong
// hit reactions side by side, and every 60 fps frame of fixture battles in which all 26 characters fight
// as main.js draws them (play60-*: frames, WebM and per-pair sheets; needs ffmpeg).
// Usage: LANE_URL=… node examples/games/lane-battle/motion-sheet.mjs [outDir]
import { chromium } from '@playwright/test'
import fs from 'node:fs/promises'
import sharp from 'sharp'
import { execFileSync } from 'node:child_process'
const root = process.argv[2] || process.env.LANE_EVIDENCE_DIR || '/tmp/lane-motion-sheets'
const url = process.env.LANE_URL || 'http://127.0.0.1:5193/examples/games/lane-battle/'
await fs.mkdir(root, { recursive: true })
// Seconds relative to the simulation hit (0 = damage frame / projectile release).
const ATTACK = [-0.5, -0.32, -0.2, -0.12, -0.07, -0.035, 0, 0.03, 0.07, 0.12, 0.2, 0.32]
const WALK = [0, 5, 10, 15, 20, 25]
const HURT = [0, 0.03, 0.07, 0.12, 0.18, 0.26, 0.36, 0.5]
const KO = [0, 0.06, 0.12, 0.2, 0.28, 0.36, 0.46, 0.56]
// Hit strength: a weak, a normal and a critical/knockback hit, each at the same ages.
const STRENGTH = [0.7, 1, 1.6].flatMap((power) => [0.02, 0.06, 0.12, 0.2, 0.32].map((age) => [power, age]))
const GROUPS = {
  poops: ['katachi', 'korokoro', 'geri', 'bichi', 'dodeka', 'daiou'],
  specials: [
    'aircon',
    'ramen',
    'yofukashi',
    'sake',
    'jiro',
    'yakiniku',
    'garlic',
    'curry',
    'milk',
    'oyster',
    'ice',
    'energy'
  ],
  enemies: ['cleaner', 'yogurt', 'sayu', 'washiki', 'mop', 'yoshiki', 'seichou', 'geridome']
}
const browser = await chromium.launch({ channel: 'chrome', headless: true })
const page = await browser.newPage({ viewport: { width: 1280, height: 800 }, deviceScaleFactor: 1 })
await page.goto(url)
await page.waitForSelector('dialog[open]')
for (const zoom of [1, 3])
  for (const [group, keys] of Object.entries(GROUPS))
    for (const [motion, samples] of [
      ['attack', ATTACK],
      ['walk', WALK],
      ['hurt', HURT],
      ['strength', STRENGTH],
      ['ko', KO]
    ]) {
      const data = await page.evaluate(
        async ({ keys, motion, samples, zoom }) => {
          const { LaneModels } = await import('/examples/games/lane-battle/models.js')
          const { typeOf, ENEMIES } = await import('/examples/games/lane-battle/simulation.js')
          const field = document.querySelector('#field canvas').getBoundingClientRect()
          const scale = field.width < 500 ? 155 : 120
          const aspect = field.width / 1000 / (field.height / 450)
          const W = Math.round(field.width * zoom),
            H = Math.round(field.height * zoom)
          const px = W / 1000,
            py = H / 450
          const models = (window.sheetModels ||= new LaneModels())
          models.setPresentation(scale, aspect, field.width / 1000)
          const cell = [Math.round(170 * px), Math.round(150 * py)],
            label = 110 * zoom,
            head = 18 * zoom
          const out = document.createElement('canvas')
          out.width = label + cell[0] * samples.length
          out.height = head + cell[1] * keys.length
          const c = out.getContext('2d')
          c.fillStyle = '#fff'
          c.fillRect(0, 0, out.width, out.height)
          c.font = `${11 * zoom}px sans-serif`
          c.fillStyle = '#333'
          samples.forEach((s, i) =>
            c.fillText(
              motion === 'walk' ? `d${s}` : motion === 'strength' ? `×${s[0]} ${s[1]}s` : `${s}s`,
              label + i * cell[0] + 4,
              head - 5
            )
          )
          let id = 1
          keys.forEach((key, row) => {
            const t = typeOf(key)
            const side = ENEMIES.includes(t) ? -1 : 1
            c.fillStyle = '#333'
            c.fillText(t.name, 4, head + row * cell[1] + cell[1] / 2)
            samples.forEach((s, col) => {
              const x0 = label + col * cell[0],
                y0 = head + row * cell[1]
              // Restroom wall, tiles and the paper road behind the unit, with the ground line it stands on.
              c.fillStyle = '#9fd3d8'
              c.fillRect(x0, y0, cell[0], cell[1])
              c.fillStyle = '#c9bea8'
              c.fillRect(x0, y0 + cell[1] - 36 * py, cell[0], 18 * py)
              c.fillStyle = '#fbf8ee'
              c.fillRect(x0, y0 + cell[1] - 22 * py, cell[0], 22 * py)
              c.fillStyle = side === 1 ? '#5a361a55' : '#4c9ad055'
              c.beginPath()
              c.ellipse(x0 + cell[0] / 2, y0 + cell[1] - 12 * py, 22 * px, 6 * py, 0, 0, 7)
              c.fill()
              const now = 20 + (motion === 'walk' || motion === 'strength' ? 0 : s)
              const u = {
                id: id++,
                key,
                side,
                hp: 100,
                maxHp: 100,
                period: t.period,
                motion,
                phase: 0,
                walkDistance: 0
              }
              if (motion === 'attack') u.phase = ((s % t.period) + t.period) % t.period
              if (motion === 'walk') u.walkDistance = 40 + s
              if (motion === 'hurt' || motion === 'strength') {
                u.motion = 'walk'
                u.walkDistance = 40
                u.hurt = motion === 'hurt' ? { at: now - s, power: 1 } : { at: now - s[1], power: s[0] }
              }
              if (motion === 'ko') models.fallen(u, 500, 361, 0, s)
              else models.unit(u, 500, 361, 0, now)
              const img = models.render(W, H)
              c.drawImage(
                img,
                500 * px - cell[0] / 2,
                (361 + 10) * py - cell[1],
                cell[0],
                cell[1],
                x0,
                y0,
                cell[0],
                cell[1]
              )
              c.strokeStyle = '#0002'
              c.strokeRect(x0 + 0.5, y0 + 0.5, cell[0] - 1, cell[1] - 1)
            })
          })
          return out.toDataURL('image/png')
        },
        { keys, motion, samples, zoom }
      )
      const file = `${root}/${motion}-${group}-x${zoom}.png`
      await fs.writeFile(file, Buffer.from(data.split(',')[1], 'base64'))
      console.log(file)
    }
await page.close()

// Real playback at the game's own frame rate: deterministic fixture battles in which all 26 characters
// fight in three well-separated pairs per battle at melee or shooting range, are hit and recover (some
// pairs end in a knock-out). Every 1/60 s frame is kept: numbered frames, a 60 fps WebM, and a sheet of
// every frame of the first two seconds for each pair. The first battle is also recorded on a portrait phone.
const BATTLES = {
  poopsA: [
    ['katachi', 'cleaner', 'ko'],
    ['korokoro', 'yogurt'],
    ['geri', 'mop']
  ],
  poopsB: [
    ['bichi', 'sayu'],
    ['dodeka', 'washiki'],
    ['daiou', 'geridome']
  ],
  specialsA: [
    ['aircon', 'yoshiki'],
    ['ramen', 'cleaner', 'ko'],
    ['yofukashi', 'yogurt']
  ],
  specialsB: [
    ['sake', 'seichou'],
    ['jiro', 'geridome'],
    ['yakiniku', 'mop']
  ],
  specialsC: [
    ['garlic', 'sayu'],
    ['curry', 'washiki'],
    ['milk', 'cleaner', 'ko']
  ],
  specialsD: [
    ['oyster', 'mop'],
    ['ice', 'yogurt'],
    ['energy', 'yoshiki']
  ]
}
const FRAMES = 180
const fixture = (pairs) => `
export function createGame(stage = 0, deck, seed) {
  const s = fixtureBase(stage, deck, seed)
  Object.assign(s, { spawn: 1e9, turret: 1e9, opened: 99, rushes: 99, gold: 999 })
  const pairs = ${JSON.stringify(pairs)}
  s.deck = pairs.map(([key], i) => card({ uid: 900 + i, key }))
  s.cooldowns = s.deck.map(() => 0)
  pairs.forEach(([mine, theirs, ko], i) => {
    summon(s, i)
    summon(s, ENEMIES.findIndex((e) => e.key === theirs), -1)
    const [a, b] = s.units.slice(-2)
    b.mortal = !!ko
    const center = 220 + i * 280, gap = Math.min(a.range, b.range, 110) - 3
    // Real max HP, so each hit plays the reaction strength the game would; hp is topped up every step.
    a.x = center + gap / 2
    b.x = center - gap / 2
    if (ko) b.hp = a.atk * 2.6
    // Hold the first strike back a moment (with the attack clock in step), so it is wound up like the rest.
    for (const [u, delay] of [[a, 0.45 + i * 0.06], [b, 0.6 + i * 0.06]]) {
      const wait = Math.min(delay, u.period * 0.9)
      Object.assign(u, { attack: wait, phase: u.period - wait, motion: 'attack' })
    }
  })
  return s
}
export function step(s, dt) {
  stepBase(s, dt)
  for (const u of s.units) if (!u.mortal) u.hp = u.maxHp
}`
for (const [battle, pairs, width, height] of [
  ...Object.entries(BATTLES).map(([name, pairs]) => [name, pairs, 1280, 800]),
  ['poopsA-portrait', BATTLES.poopsA, 390, 844]
]) {
  const portrait = width < 500
  const view = await browser.newPage({ viewport: { width, height }, deviceScaleFactor: portrait ? 3 : 1 })
  await view.route('**/lane-battle/simulation.js*', async (route) => {
    const response = await route.fetch()
    const body =
      (await response.text())
        .replace('export function createGame(', 'function fixtureBase(')
        .replace('export function step(', 'function stepBase(') + fixture(pairs)
    route.fulfill({ response, body })
  })
  await view.clock.install({ time: new Date(0) })
  await view.clock.pauseAt(new Date(0))
  await view.goto(url)
  while (!(await view.locator('dialog[open]').count())) await view.clock.runFor(50)
  await view.getByRole('button', { name: 'ステージ選択へ' }).click()
  await view.getByRole('button', { name: 'ブリッと出撃' }).click()
  const dir = `${root}/play60-${battle}`
  await fs.mkdir(dir, { recursive: true })
  const frames = []
  for (let i = 0; i < FRAMES; i++) {
    await view.clock.runFor(1000 / 60)
    frames.push(await view.locator('#field canvas').screenshot({ path: `${dir}/f${String(i).padStart(3, '0')}.png` }))
  }
  await view.close()
  execFileSync(process.env.FFMPEG_BIN || 'ffmpeg', [
    '-y',
    '-loglevel',
    'error',
    '-framerate',
    '60',
    '-i',
    `${dir}/f%03d.png`,
    '-c:v',
    'libvpx-vp9',
    '-pix_fmt',
    'yuv420p',
    `${dir}.webm`
  ])
  // A sheet per pair: every frame of the first two seconds, cropped round the pair, 12 frames a row.
  const { width: w, height: h } = await sharp(frames[0]).metadata()
  for (const [i, [mine, theirs]] of pairs.entries()) {
    if (portrait && i > 2) break
    const center = 220 + i * 280,
      span = portrait ? 300 : 260
    const cw = Math.round((span / 1000) * w)
    const crop = {
      left: Math.min(w - cw, Math.max(0, Math.round(((center - span / 2) / 1000) * w))),
      top: Math.round(h * 0.56),
      width: cw,
      height: Math.round(h * (portrait ? 0.3 : 0.33))
    }
    const tile = 260,
      th = Math.round((tile * crop.height) / crop.width),
      cols = 12,
      count = 120
    const tiles = await Promise.all(
      frames.slice(0, count).map(async (f, n) => ({
        input: await sharp(f).extract(crop).resize(tile, th).png().toBuffer(),
        left: (n % cols) * (tile + 3),
        top: Math.floor(n / cols) * (th + 3)
      }))
    )
    const file = `${dir}-${i + 1}-${mine}-vs-${theirs}.png`
    await sharp({
      create: { width: cols * (tile + 3), height: Math.ceil(count / cols) * (th + 3), channels: 3, background: '#fff' }
    })
      .composite(tiles)
      .png()
      .toFile(file)
    console.log(file)
  }
}
await browser.close()
