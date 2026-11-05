import { chromium } from '@playwright/test'
import assert from 'node:assert/strict'
import { readFile, mkdir } from 'node:fs/promises'

const url = process.env.LANE_URL || 'http://127.0.0.1:5216/examples/games/lane-battle/'
const directory = '/tmp/lane-projectile-sync'
await mkdir(directory, { recursive: true })
const reviewDirectory = '/tmp/lane-r14-fixes'
await mkdir(reviewDirectory, { recursive: true })
const simulation = await readFile(new URL('./simulation.js', import.meta.url), 'utf8')
const main = (await readFile(new URL('./main.js', import.meta.url), 'utf8'))
  .replace('let resultVisual = null', 'let resultVisual = null; globalThis.syncState = () => state')
  .replace(
    "      if (progress < 1 && !['aircon', 'yoshiki'].includes(e.attackerKey)) {",
    "      ;(globalThis.syncFrames ||= []).push({kind:'destination', key:e.attackerKey, time:visualTime, arrived:!!e.arrived, x:front.x, y:front.y, shotX:fromX+(front.x-fromX)*progress, shotY:fromY+(front.y-fromY)*progress-Math.sin(progress*Math.PI)*14});\n      if (progress < 1 && !['aircon', 'yoshiki'].includes(e.attackerKey)) {"
  )
  .replace(
    '        const [fill, edge, radius] =',
    '        ;(globalThis.syncFrames ||= []).push({kind:"shot",key:e.attackerKey,time:visualTime,x,y:yShot,fromX,fromY,front:front.x,frontY:front.y});\n        const [fill, edge, radius] ='
  )
const effects = (await readFile(new URL('./visual-effects.js', import.meta.url), 'utf8'))
  .replace(
    '        line(x - dir * 10, y, tip, y)',
    '        ;(globalThis.syncFrames ||= []).push({kind:"streak",time,end,tip,dir});\n        line(x - dir * 10, y, tip, y)'
  )
  .replace(
    '      const end = path.at(-1).x',
    '      const end = path.at(-1).x\n      ;(globalThis.syncFrames ||= []).push({kind:"aircon",time,age,startX,end,victims:points.map(v => ({at:v.at,front:drawnFront(v.unit)}))})'
  )
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
    ['beam', 1280, 800, 'yoshiki', false],
    ['beam-miss', 1280, 800, 'yoshiki', false],
    ['aircon-85', 1280, 800, 'aircon', false],
    ['aircon-120', 1280, 800, 'aircon', false],
    ['aircon-170', 1280, 800, 'aircon', false],
    ['aircon-empty', 1280, 800, 'aircon', false],
    ['killed-shooter', 1280, 800, 'sayu', false]
  ]) {
    if (process.env.SYNC_CASE && name !== process.env.SYNC_CASE) continue
    const beam = key === 'yoshiki'
    const aircon = key === 'aircon'
    const empty = name === 'aircon-empty'
    const killed = name === 'killed-shooter'
    const fixture =
      (empty
        ? simulation.replace(
            '  if (!target) return enqueue(null, 1, effect.ranged ? 0.12 : 0, true)',
            "  if (src.key === 'aircon') return enqueue(null, 1, 0.12, true)\n  if (!target) return enqueue(null, 1, effect.ranged ? 0.12 : 0, true)"
          )
        : simulation
      ).replace('export function createGame(', 'function baseGame(') +
      `
export function createGame(stage, deck, seed) {
  const game = baseGame(stage, [card({uid:1,key:'${beam || killed ? 'katachi' : key}'}), card({uid:2,key:'katachi'})], 1)
  Object.assign(game, {gold:999, spawn:99999, opened:2, rushes:99, turret:99999})
  ${beam ? 'summon(game,0); summon(game,1); summon(game,5,-1)' : killed ? 'summon(game,0); summon(game,2,-1)' : 'summon(game,0); summon(game,0,-1)'}
  const shooter = game.units[${beam ? 2 : killed ? 1 : 0}], target = game.units[${beam || killed ? 0 : 1}]
  Object.assign(shooter, {x:${beam ? 300 : killed ? 600 : 850}, speed:0, attack:0.6, phase:shooter.cycle-0.6, motion:'attack'})
  Object.assign(target, {x:${beam ? 430 : killed ? 720 : aircon ? 850 - (empty ? 120 : Number(name.split('-')[1])) : 700}, speed:0, range:0, attack:99999, hp:9999, maxHp:9999})
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
      if (state && !displaced && (moving || killed || name === 'beam-miss')) {
        // Right after release: knock the target back with 大放屁, or fell the first beam victim.
        if (moving || killed) await page.locator('#burst').click()
        else await page.evaluate(() => (syncState().units.find((unit) => unit.x === 430).hp = 0))
        displaced = true
      }
      if (killed && state) {
        await page.screenshot({ path: `${reviewDirectory}/${name}-${String(frame).padStart(2, '0')}.png` })
      }
      if (aircon && state && ['aircon-85', 'aircon-170'].includes(name)) {
        const sample = await page.evaluate(() =>
          (globalThis.syncFrames ?? []).filter((item) => item.kind === 'aircon').at(-1)
        )
        if (sample?.victims.length) {
          if (sample.time < sample.victims[0].at)
            await page.screenshot({ path: `${reviewDirectory}/${name}-flight.png` })
          else if (!savedImpact) await page.screenshot({ path: `${reviewDirectory}/${name}-hit.png` })
        }
      }
      if (state && !state.arrived && !saved) {
        await page.screenshot({ path: `${directory}/${name}-flight.png` })
        saved = true
      }
      if (state?.arrived && !savedImpact) {
        await page.screenshot({ path: `${directory}/${name}-impact.png` })
        savedImpact = true
        if (!beam && !aircon) break
      }
    }
    const trace = await page.evaluate(() => globalThis.syncFrames ?? [])
    assert.deepEqual(errors, [], name)
    if (empty) {
      const frames = trace.filter((item) => item.kind === 'aircon')
      assert.ok(frames.length > 2 && frames.every((frame) => frame.victims.length === 0), `${name}: no victims`)
      for (const frame of frames) {
        const expected = Math.max(850 - 170, frame.startX - (frame.age * 170) / 0.12)
        assert.ok(Math.abs(frame.end - expected) < 0.01, `${name}: advances at simulation speed`)
      }
    } else if (aircon) {
      const frames = trace.filter((item) => item.kind === 'aircon' && item.victims.length)
      assert.ok(frames.length, `${name}: cold air observed`)
      const at = frames[0].victims[0].at
      const before = frames.filter((frame) => frame.time < at).at(-1)
      const after = frames.find((frame) => frame.time >= at)
      assert.ok(before && after, `${name}: frames straddle hit`)
      assert.ok(before.end > before.victims[0].front.x, `${name}: does not arrive early`)
      assert.ok(Math.abs(after.end - after.victims[0].front.x) < 2, `${name}: reaches victim: ${JSON.stringify(after)}`)
      const streaks = trace.filter((item) => item.kind === 'streak')
      assert.ok(streaks.length, `${name}: streaks observed`)
      assert.ok(
        streaks.every((item) => (item.tip - item.end) * item.dir <= 0),
        `${name}: streaks stay behind front`
      )
      assert.ok(frames.at(-1).end <= Math.min(850 - 170, after.end) + 0.01, `${name}: continues to full reach`)
    } else if (killed) {
      const shots = trace.filter((item) => item.kind === 'shot' && item.key === key)
      assert.ok(displaced && shots.length > 1, `${name}: shot observed`)
      assert.ok(
        await page.evaluate(() => !syncState().units.some((unit) => unit.key === 'sayu' && unit.hp > 0)),
        `${name}: shooter killed`
      )
      for (let index = 1; index < shots.length; index++) {
        assert.equal(shots[index].fromX, shots[0].fromX, `${name}: fixed release x`)
        assert.equal(shots[index].fromY, shots[0].fromY, `${name}: fixed release y`)
        assert.ok(
          Math.abs(shots[index].front - shots[index].x) <= Math.abs(shots[index].front - shots[index - 1].x),
          `${name}: shot moves toward target`
        )
      }
    } else if (beam) {
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
      if (name === 'beam-miss')
        assert.ok(
          !trace.some((item) => item.kind === 'impact' && item.key === key && item.time < frames[0].victims[1].at),
          'the jet runs on through a fallen victim without splashing it'
        )
    } else {
      const destination = trace.find((item) => item.kind === 'destination' && item.key === key && item.arrived)
      const impact = trace.find((item) => item.kind === 'impact' && item.key === key)
      assert.ok(destination && impact, `${name}: impact found ${JSON.stringify(trace.slice(-8))}`)
      assert.ok(Math.hypot(destination.x - impact.x, destination.y - impact.y) * (width / 1000) < 2, name)
      // The last drawn shot is at most one frame of flight short of where the splash appears.
      const shots = trace.filter((item) => item.kind === 'shot' && item.key === key)
      const gap = Math.hypot(shots.at(-1).x - impact.x, shots.at(-1).y - impact.y)
      const flight = Math.hypot(shots[0].x - impact.x, shots[0].y - impact.y)
      assert.ok(gap <= flight * 0.2 + 3, `${name}: last shot ${gap.toFixed(1)} of ${flight.toFixed(1)} from the splash`)
      if (moving) {
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
