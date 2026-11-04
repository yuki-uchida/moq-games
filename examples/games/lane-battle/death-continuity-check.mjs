import { chromium } from '@playwright/test'
import assert from 'node:assert/strict'
import fs from 'node:fs/promises'
import { execFileSync } from 'node:child_process'
import sharp from 'sharp'

const output = process.env.LANE_DEATH_DIR || '/tmp/lane-death-continuity'
const url = process.env.LANE_URL || 'http://127.0.0.1:5217/examples/games/lane-battle/'
const source = await fs.readFile(new URL('./simulation.js', import.meta.url), 'utf8')
const fixture =
  source.replace('export function createGame(', 'function baseGame(') +
  `
export function createGame(stage, deck, seed) {
  const s = baseGame(stage, [], seed)
  Object.assign(s, { spawn: 1e9, opened: 2, rushes: 99, turret: 1e9, gold: 0, deck: [], cooldowns: [] })
  for (const spec of globalThis.__deathScene) {
    if (spec.side === 1) {
      s.deck.push(card({ uid: s.deck.length + 1, key: spec.key, level: 1 }))
      s.cooldowns.push(0); s.gold = 999; summon(s, s.deck.length - 1, 1); s.gold = 0
    } else summon(s, ENEMIES.findIndex((entry) => entry.key === spec.key), -1)
    const unit = s.units.at(-1)
    Object.assign(unit, { x: spec.x, hp: 1e9, maxHp: 1e9, tag: spec.tag, crit: 0 })
    if (spec.dummy) Object.assign(unit, { speed: 0, range: 0, attack: 1e9 })
  }
  globalThis.__deathState = s
  return s
}
`
// Each instrumentation point must still exist in main.js; fail loudly instead of silently recording nothing.
const patch = (text, from, to) => {
  assert.ok(text.includes(from), `death-continuity-check: main.js no longer contains ${JSON.stringify(from)}`)
  return text.replace(from, to)
}
const main = [
  [
    'for (const ghost of fallen) models.fallen(ghost, drawX(ghost), laneY(ghost), depth.get(ghost), ghost.visualAge)',
    `for (const ghost of fallen) { models.fallen(ghost, drawX(ghost), laneY(ghost), depth.get(ghost), ghost.visualAge); recordDeath(ghost, true) }`
  ],
  [
    "let visual = held && u.motion === 'walk' ? { ...u, motion: 'attack', phase: visualTime - held.at } : u",
    `let visual = held && u.motion === 'walk' ? { ...u, motion: 'attack', phase: visualTime - held.at } : u
    if (u.tag === 'victim') Object.assign(visual, { motion: globalThis.__deathMode, phase: 0.01, walkDistance: 9 })`
  ],
  ['contact(u),\n      y\n    )', 'contact(u),\n      y\n    ); recordDeath(u, false)'],
  [
    'function depthSlots(list) {',
    `function recordDeath(unit, dead) {
      if (unit.tag !== 'victim') return
      const actor = models.actors.get(unit.id)
      actor.root.updateMatrixWorld(true)
      const matrix = actor.bones.hips.matrixWorld.elements
      globalThis.__deathFrame = { dead, age: dead ? state.time - unit.at : -1, x: matrix[12], y: matrix[13], leg: actor.bones.legF?.rotation.z, hit: actor.a.hit, scale: Math.abs(actor.root.scale.x), aspect: Math.abs(actor.root.scale.y / actor.root.scale.x), time: state.time }
    }
    function depthSlots(list) {`
  ]
].reduce((text, [from, to]) => patch(text, from, to), await fs.readFile(new URL('./main.js', import.meta.url), 'utf8'))

await fs.mkdir(output, { recursive: true })
const browser = await chromium.launch({ channel: 'chrome', headless: true })
try {
  for (const [key, side, motion] of [
    ['oyster', 1, 'attack'],
    ['cleaner', -1, 'walk'],
    ['katachi', 1, 'walk'],
    ['mop', -1, 'walk']
  ]) {
    const page = await browser.newPage({ viewport: { width: 1280, height: 800 }, deviceScaleFactor: 1 })
    const errors = []
    page.on('pageerror', (error) => errors.push(String(error)))
    await page.addInitScript(
      ({ scene, mode }) => {
        globalThis.__deathScene = scene
        globalThis.__deathMode = mode
      },
      {
        scene: [
          { key, side, x: 500, tag: 'victim' },
          {
            key: side === 1 ? 'cleaner' : 'katachi',
            side: -side,
            x: 500 - side * (motion === 'attack' ? 35 : 300),
            tag: 'target',
            dummy: true
          }
        ],
        mode: motion
      }
    )
    await page.clock.install({ time: new Date(0) })
    await page.clock.pauseAt(new Date(0))
    await page.route('**/lane-battle/simulation.js*', (route) =>
      route.fulfill({ contentType: 'application/javascript', body: fixture })
    )
    await page.route('**/lane-battle/main.js*', (route) =>
      route.fulfill({ contentType: 'application/javascript', body: main })
    )
    if (process.env.LANE_DEATH_BASELINE) {
      const original = execFileSync(
        'git',
        ['show', `${process.env.LANE_DEATH_BASELINE}:examples/games/lane-battle/models.js`],
        { encoding: 'utf8' }
      )
      await page.route('**/lane-battle/models.js*', async (route) => {
        const response = await route.fetch()
        const imports = (await response.text()).split('\n').slice(0, 5).join('\n')
        await route.fulfill({
          contentType: 'application/javascript',
          body: imports + '\n' + original.split('\n').slice(5).join('\n')
        })
      })
    }
    await page.goto(url)
    await page.getByRole('button', { name: 'ステージ選択へ' }).click()
    await page.getByRole('button', { name: 'ブリッと出撃' }).click()
    for (let frame = 0; frame < 20; frame++) await page.clock.runFor(16)
    await page.clock.runFor(16)
    const before = await page.evaluate(() => globalThis.__deathFrame)
    const images = [await page.locator('#field canvas').screenshot()]
    await page.evaluate(() => (globalThis.__deathState.units.find((entry) => entry.tag === 'victim').hp = 0))
    let after
    for (let frame = 0; frame < 8; frame++) {
      await page.clock.runFor(16)
      const current = await page.evaluate(() => globalThis.__deathFrame)
      if (current?.dead && !after) after = current
      if (current?.dead) images.push(await page.locator('#field canvas').screenshot())
    }
    assert.ok(before && !before.dead && after, `${key}: transition missing`)
    if (motion === 'attack') assert.ok(before.hit > 0.9, `${key}: not at contact`)
    if (key === 'cleaner') assert.ok(Math.abs(before.leg) > 0.5, 'cleaner: not mid-stride')
    assert.deepEqual(errors, [])
    const jump = Math.hypot((after.x - before.x) / before.scale, (after.y - before.y) / (before.scale * before.aspect))
    const legDegrees = before.leg === undefined ? null : Math.abs(after.leg - before.leg) * (180 / Math.PI)
    const meta = await sharp(images[0]).metadata()
    const crop = {
      left: Math.round(meta.width * 0.3),
      top: Math.round(meta.height * 0.48),
      width: Math.round(meta.width * 0.4),
      height: Math.round(meta.height * 0.48)
    }
    const tiles = await Promise.all(images.map((image) => sharp(image).extract(crop).png().toBuffer()))
    await sharp({ create: { width: crop.width * tiles.length, height: crop.height, channels: 3, background: '#fff' } })
      .composite(tiles.map((input, index) => ({ input, left: index * crop.width, top: 0 })))
      .png()
      .toFile(`${output}/${key}.png`)
    console.log(JSON.stringify({ key, motion, before, after, jump, legDegrees, image: `${output}/${key}.png` }))
    if (!process.env.LANE_DEATH_BASELINE) {
      assert.ok(jump < 0.02, `${key}: ${jump} model units`)
      if (legDegrees !== null) assert.ok(legDegrees < 5, `${key}: ${legDegrees} degrees`)
    }
    await page.close()
  }
} finally {
  await browser.close()
}
