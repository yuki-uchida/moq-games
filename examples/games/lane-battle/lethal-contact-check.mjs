import assert from 'node:assert/strict'
import fs from 'node:fs/promises'
import { chromium } from '@playwright/test'
import sharp from 'sharp'

const root = process.env.LANE_CONTACT_DIR || '/tmp/lane-lethal-contact'
const url = process.env.LANE_URL || 'http://127.0.0.1:5211/examples/games/lane-battle/'
const simulation = await fs.readFile(new URL('./simulation.js', import.meta.url), 'utf8')
const fixture =
  simulation.replace('export function createGame(', 'function baseGame(') +
  `
export function createGame(stage, deck, seed) {
  const s = baseGame(stage, [], seed)
  Object.assign(s, { spawn: 1e9, opened: 2, rushes: 99, turret: 1e9, gold: 0, deck: [], cooldowns: [] })
  for (const spec of globalThis.__contactScene) {
    if (spec.side === 1) {
      s.deck.push(card({ uid: s.deck.length + 1, key: spec.key, level: 1 }))
      s.cooldowns.push(0)
      s.gold = 999
      summon(s, s.deck.length - 1, 1)
      s.gold = 0
    } else summon(s, ENEMIES.findIndex((entry) => entry.key === spec.key), -1)
    const u = s.units.at(-1)
    Object.assign(u, { x: spec.x, tag: spec.tag })
    if (spec.dummy) Object.assign(u, { hp: spec.hp, maxHp: spec.hp, speed: 0, range: 0, attack: 1e9 })
    else Object.assign(u, { attack: 0.6, phase: u.cycle - 0.6, motion: 'attack', crit: 0 })
  }
  globalThis.__contactState = s
  return s
}
`
const main = (await fs.readFile(new URL('./main.js', import.meta.url), 'utf8'))
  .replace('contact(u), y)', 'recordContact(u, contact(u)), y)')
  .replace(
    'function depthSlots(list) {',
    `function recordContact(u, extra) {
      if (u.tag === 'attacker') {
        const toward = -u.side
        const [ahead] = models.strike(u.key)
        globalThis.__contact = { time: state.time, phase: u.phase, strikes: u.strikes, extra,
          x: (drawX(u) + toward * (ahead + extra * models.presentation[0] * modelSize(u.key))) * canvas.width / 1000,
          targetAlive: state.units.some((v) => v.tag === 'target'), fallen: fallen.some((v) => v.tag === 'target') }
      }
      return extra
    }
    function depthSlots(list) {`
  )

await fs.mkdir(root, { recursive: true })
const browser = await chromium.launch({ channel: 'chrome', headless: true })
const results = []
try {
  for (const key of ['oyster', 'cleaner', 'katachi']) {
    const variants = []
    for (const lethal of [false, true]) {
      const side = key === 'cleaner' ? -1 : 1
      const targetKey = side === 1 ? 'cleaner' : 'katachi'
      const scene = [
        { key, side, x: 600, tag: 'attacker' },
        { key: targetKey, side: -side, x: 600 - side * 30, hp: lethal ? 1 : 100000, dummy: true, tag: 'target' },
        { key: targetKey, side: -side, x: 600 - side * 90, hp: 100000, dummy: true, tag: 'behind' }
      ]
      const page = await browser.newPage({ viewport: { width: 1280, height: 800 }, deviceScaleFactor: 1 })
      const errors = []
      page.on('pageerror', (error) => errors.push(String(error)))
      await page.addInitScript((value) => (globalThis.__contactScene = value), scene)
      await page.clock.install({ time: new Date(0) })
      await page.clock.pauseAt(new Date(0))
      await page.route('**/lane-battle/simulation.js*', (route) =>
        route.fulfill({ contentType: 'application/javascript', body: fixture })
      )
      await page.route('**/lane-battle/main.js*', (route) =>
        route.fulfill({ contentType: 'application/javascript', body: main })
      )
      await page.goto(url)
      await page.getByRole('button', { name: 'ステージ選択へ' }).click()
      await page.getByRole('button', { name: 'ブリッと出撃' }).click()
      const images = []
      let contact
      for (let frame = 0; frame < 70; frame++) {
        await page.clock.runFor(16)
        const data = await page.evaluate(() => globalThis.__contact)
        if (data?.strikes === 1 && data.phase >= 0.016 && !contact) contact = data
        if (frame >= 27 && frame % 6 === 3) images.push(await page.locator('#field canvas').screenshot())
      }
      assert.ok(contact, `${key}: attack was not recorded`)
      assert.equal(contact.targetAlive, !lethal, `${key}: unexpected target survival`)
      assert.equal(contact.fallen, lethal, `${key}: missing death ghost`)
      assert.deepEqual(errors, [])
      const tiles = await Promise.all(images.map((image) => sharp(image).resize({ width: 640 }).png().toBuffer()))
      const meta = await sharp(tiles[0]).metadata()
      await sharp({ create: { width: 640 * tiles.length, height: meta.height, channels: 3, background: '#fff' } })
        .composite(tiles.map((input, index) => ({ input, left: 640 * index, top: 0 })))
        .png()
        .toFile(`${root}/${key}-${lethal ? 'lethal' : 'normal'}.png`)
      variants.push(contact)
      await page.close()
    }
    const difference = Math.abs(variants[0].x - variants[1].x)
    results.push({ key, normal: variants[0], lethal: variants[1], difference })
    console.log(JSON.stringify(results.at(-1)))
  }
} finally {
  await browser.close()
}
for (const result of results)
  assert.ok(result.difference <= 2, `${result.key}: contact differs by ${result.difference}px`)
