import { chromium } from '@playwright/test'
import assert from 'node:assert/strict'
import { readFile, mkdir } from 'node:fs/promises'

const url = process.env.LANE_URL || 'http://127.0.0.1:5216/examples/games/lane-battle/'
const directory = '/tmp/lane-projectile-sync'
await mkdir(directory, { recursive: true })
const simulation = await readFile(new URL('./simulation.js', import.meta.url), 'utf8')
const main = (await readFile(new URL('./main.js', import.meta.url), 'utf8'))
  .replace('let resultVisual = null', 'let resultVisual = null; globalThis.syncState = () => state')
  .replace(
    "      if (progress < 1 && !['aircon', 'yoshiki'].includes(e.attackerKey)) {",
    "      ;(globalThis.syncFrames ||= []).push({kind:'destination', key:e.attackerKey, time:visualTime, arrived:!!e.arrived, x:front.x, y:front.y, shotX:fromX+(front.x-fromX)*progress, shotY:fromY+(front.y-fromY)*progress-Math.sin(progress*Math.PI)*14});\n      if (progress < 1 && !['aircon', 'yoshiki'].includes(e.attackerKey)) {"
  )
  .replace(
    '        const [fill, edge, radius] =',
    '        ;(globalThis.syncFrames ||= []).push({kind:"shot",key:e.attackerKey,time:visualTime,x,y:yShot,front:front.x,frontY:front.y});\n        const [fill, edge, radius] ='
  )
const effects = (await readFile(new URL('./visual-effects.js', import.meta.url), 'utf8'))
  .replace(
    '    for (const [stroke, width] of [',
    '    (globalThis.syncFrames ||= []).push({kind:"beam",time,path,victims:points.map(v => ({at:v.at,front:drawnFront(v.unit)}))});\n    for (const [stroke, width] of ['
  )
  .replace(
    '  for (const point of points) {',
    '  for (const point of points) {\n    (globalThis.syncFrames ||= []).push({kind:"impact",key:effect.attackerKey,time,x:point.x,y:point.y});'
  )

const browser = await chromium.launch({ channel: 'chrome', headless: true })
try {
  for (const [name, width, height, key, moving] of [
    ['korokoro-desktop', 1280, 800, 'korokoro', false],
    ['korokoro-mobile', 390, 844, 'korokoro', false],
    ['knockback', 1280, 800, 'korokoro', true],
    ['sake', 1280, 800, 'sake', false],
    ['beam', 1280, 800, 'yoshiki', false]
  ]) {
    const beam = key === 'yoshiki'
    const fixture =
      simulation.replace('export function createGame(', 'function baseGame(') +
      `
export function createGame(stage, deck, seed) {
  const game = baseGame(stage, [card({uid:1,key:'${beam ? 'katachi' : key}'}), card({uid:2,key:'katachi'})], 1)
  Object.assign(game, {gold:999, spawn:99999, opened:2, rushes:99, turret:99999})
  ${beam ? 'summon(game,0); summon(game,1); summon(game,5,-1)' : 'summon(game,0); summon(game,0,-1)'}
  const shooter = game.units[${beam ? 2 : 0}], target = game.units[${beam ? 0 : 1}]
  Object.assign(shooter, {x:${beam ? 300 : 850}, speed:0, attack:0.6, phase:shooter.cycle-0.6, motion:'attack'})
  Object.assign(target, {x:${beam ? 430 : 700}, speed:0, range:0, attack:99999, hp:9999, maxHp:9999})
  ${beam ? 'Object.assign(game.units[1], {x:465,speed:0,range:0,attack:99999,hp:9999,maxHp:9999})' : ''}
  return game
}`
    const page = await browser.newPage({ viewport: { width, height } })
    const errors = []
    page.on('pageerror', (error) => errors.push(String(error)))
    await page.clock.install({ time: new Date(0) })
    await page.clock.pauseAt(new Date(0))
    await page.route('**/lane-battle/simulation.js*', (route) =>
      route.fulfill({ contentType: 'application/javascript', body: fixture })
    )
    await page.route('**/lane-battle/main.js*', (route) =>
      route.fulfill({ contentType: 'application/javascript', body: main })
    )
    await page.route('**/lane-battle/visual-effects.js*', (route) =>
      route.fulfill({ contentType: 'application/javascript', body: effects })
    )
    await page.goto(url)
    for (let attempt = 0; attempt < 100 && !(await page.locator('dialog[open]').count()); attempt++)
      await page.clock.runFor(50)
    assert.ok(await page.locator('dialog[open]').count(), `${name}: title dialog ${errors.join(', ')}`)
    await page.getByRole('button', { name: 'ステージ選択へ' }).click()
    await page.getByRole('button', { name: 'ブリッと出撃' }).click()
    let displaced = false
    let saved = false
    let savedImpact = false
    for (let frame = 0; frame < 65; frame++) {
      await page.clock.runFor(16)
      const state = await page.evaluate((attackerKey) => {
        const effect = syncState().effects.find((item) => item.attackerKey === attackerKey)
        return effect && { arrived: effect.arrived, releasedAt: effect.releasedAt }
      }, key)
      if (state && moving && !displaced) {
        await page.locator('#burst').click()
        displaced = true
      }
      if (state && !state.arrived && !saved) {
        await page.screenshot({ path: `${directory}/${name}-flight.png` })
        saved = true
      }
      if (state?.arrived && !savedImpact) {
        await page.screenshot({ path: `${directory}/${name}-impact.png` })
        savedImpact = true
        if (!beam) break
      }
    }
    const trace = await page.evaluate(() => globalThis.syncFrames ?? [])
    assert.deepEqual(errors, [], name)
    if (beam) {
      const frames = trace.filter((item) => item.kind === 'beam' && item.victims.length >= 2)
      assert.ok(frames.length, 'beam has two victims')
      for (const victim of frames[0].victims) {
        const before = frames.filter((frame) => frame.time < victim.at).at(-1)
        const after = frames.find((frame) => frame.time >= victim.at)
        assert.ok(before && after, 'frames straddle each hit')
        assert.ok(after.time - victim.at <= 1 / 60 + 0.001)
        const beforeFront = before.victims.find((item) => item.at === victim.at).front
        const afterFront = after.victims.find((item) => item.at === victim.at).front
        assert.ok(before.path.at(-1).x < beforeFront.x, 'beam front does not arrive early')
        assert.ok(
          after.path.some((point) => Math.abs(point.x - afterFront.x) < 2),
          'beam reaches victim'
        )
      }
    } else {
      const destination = trace.find((item) => item.kind === 'destination' && item.key === key && item.arrived)
      const impact = trace.find((item) => item.kind === 'impact' && item.key === key)
      assert.ok(destination && impact, `${name}: impact found ${JSON.stringify(trace.slice(-8))}`)
      assert.ok(Math.hypot(destination.x - impact.x, destination.y - impact.y) * (width / 1000) < 2, name)
      assert.ok(
        Math.hypot(destination.shotX - destination.x, destination.shotY - destination.y) * (width / 1000) < 2,
        `${name}: projectile reaches the target on the hit frame`
      )
      if (moving) {
        const shots = trace.filter((item) => item.kind === 'shot' && item.key === key)
        assert.ok(displaced && shots.length > 1, 'moving target observed during flight')
        assert.ok(Math.abs(shots.at(-1).front - shots[0].front) > 5, 'destination tracks knockback')
      }
    }
    console.log(`${name}: PASS`)
    await page.close()
  }
} finally {
  await browser.close()
}
