// Local-only review sheets: every character's walk, attack and hit reaction on the game clock,
// rendered by the real LaneModels at the in-game size (×1) and enlarged (×3) for detail.
// Usage: LANE_URL=… node examples/games/lane-battle/motion-sheet.mjs [outDir]
import { chromium } from '@playwright/test'
import fs from 'node:fs/promises'
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
              if (motion === 'ko') models.fallen(u, 500, 361, s)
              else models.unit(u, 500, 361, now)
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
await browser.close()
