// Local-only review sheets: every character's walk, attack, hit reaction and knock-out on the game clock,
// rendered by the real LaneModels at the in-game size (×1) and enlarged (×3) for detail, plus the front
// line of a deterministic melee as main.js draws it (duel-pc.png, duel-portrait.png, 50ms per tile).
// Usage: LANE_URL=… node examples/games/lane-battle/motion-sheet.mjs [outDir]
import { chromium } from '@playwright/test'
import fs from 'node:fs/promises'
import sharp from 'sharp'
const root = process.argv[2] || process.env.LANE_EVIDENCE_DIR || '/tmp/lane-motion-sheets'
const url = process.env.LANE_URL || 'http://127.0.0.1:5193/examples/games/lane-battle/'
await fs.mkdir(root, { recursive: true })
// Seconds relative to the simulation hit (0 = damage frame / projectile release).
const ATTACK = [-0.5, -0.32, -0.2, -0.12, -0.07, -0.035, 0, 0.03, 0.07, 0.12, 0.2, 0.32]
const WALK = [0, 5, 10, 15, 20, 25]
const HURT = [0, 0.03, 0.07, 0.12, 0.18, 0.26, 0.36, 0.5]
const KO = [0, 0.06, 0.12, 0.2, 0.28, 0.36, 0.46, 0.56]
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
            c.fillText(motion === 'walk' ? `d${s}` : `${s}s`, label + i * cell[0] + 4, head - 5)
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
              const now = 20 + (motion === 'walk' ? 0 : s)
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
              if (motion === 'hurt') {
                u.motion = 'walk'
                u.walkDistance = 40
                u.hurt = { at: now - s, power: 1 }
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

// The front line as the game draws it: two カチカチうんこ against two 清掃員 at melee range, every 50ms
// through both sides' strikes and hit reactions, on desktop and on a portrait phone.
const duel = `
export function createGame(stage = 0, deck, seed) {
  const s = fixtureBase(stage, deck, seed)
  s.spawn = s.turret = 1e9
  s.opened = true
  summon(s, 0); summon(s, 0, -1); s.cooldowns[0] = 0; summon(s, 0); summon(s, 0, -1)
  for (const [u, x] of s.units.map((u, i) => [u, [500, 468, 520, 455][i]])) Object.assign(u, { x, hp: 1e6, maxHp: 1e6 })
  return s
}`
for (const [name, width, height, box] of [
  ['pc', 1280, 800, [0.3, 0.6, 0.25, 0.3]],
  ['portrait', 390, 844, [0.25, 0.62, 0.42, 0.2]]
]) {
  const view = await browser.newPage({ viewport: { width, height }, deviceScaleFactor: 2 })
  await view.route('**/lane-battle/simulation.js*', async (route) => {
    const response = await route.fetch()
    const body = (await response.text()).replace('export function createGame(', 'function fixtureBase(') + duel
    route.fulfill({ response, body })
  })
  await view.clock.install({ time: new Date(0) })
  await view.clock.pauseAt(new Date(0))
  await view.goto(url)
  while (!(await view.locator('dialog[open]').count())) await view.clock.runFor(50)
  await view.getByRole('button', { name: 'ステージ選択へ' }).click()
  await view.getByRole('button', { name: 'ブリッと出撃' }).click()
  const tiles = []
  for (let i = 0; i < 24; i++) {
    await view.clock.runFor(50)
    const shot = await view.locator('#field canvas').screenshot()
    const { width: w, height: h } = await sharp(shot).metadata()
    const crop = {
      left: Math.round(w * box[0]),
      top: Math.round(h * box[1]),
      width: Math.round(w * box[2]),
      height: Math.round(h * box[3])
    }
    tiles.push(await sharp(shot).extract(crop).resize(400).png().toBuffer())
  }
  const { height: th } = await sharp(tiles[0]).metadata()
  const file = `${root}/duel-${name}.png`
  await sharp({ create: { width: 405 * 6, height: (th + 5) * 4, channels: 3, background: '#fff' } })
    .composite(tiles.map((input, i) => ({ input, left: (i % 6) * 405, top: Math.floor(i / 6) * (th + 5) })))
    .png()
    .toFile(file)
  console.log(file)
  await view.close()
}
await browser.close()
