import { chromium } from '@playwright/test'
import assert from 'node:assert/strict'
import fs from 'node:fs/promises'
import { execFileSync } from 'node:child_process'
const root = process.env.LANE_SYNC_DIR || '/tmp/lane-projectile-sync'
await fs.mkdir(root, { recursive: true })
const url = process.env.LANE_URL || 'http://127.0.0.1:5193/examples/games/lane-battle/'
const source = await fs.readFile(new URL('./simulation.js', import.meta.url), 'utf8')
// Deterministic diagnostic positions only; the actual step implementation is retained.
const fixture =
  source
    .replace('export function createGame(', 'function fixtureBase(')
    .replace('export function step(', 'function stepBase(') +
  `
export function createGame(stage=0) {
 const s=fixtureBase(stage);s.spawn=999;s.gold=100;
 summon(s,1);summon(s,0,-1);
 s.units[0].x=400;s.units[1].x=500;s.units[1].speed=0;
 s.units[1].hp=s.units[1].maxHp=s.units[0].damage;
 return s;
}
export function step(s,dt) {
 stepBase(s,dt);
 (window.syncTrace ||= []).push({t:s.time,hp:s.units.find(u=>u.id===2)?.hp||0,arrived:s.effects.some(e=>e.ranged&&e.arrived),projectiles:s.projectiles.length});
}
`
const audio = (await fs.readFile(new URL('./audio.js', import.meta.url), 'utf8')).replace(
  '  effect(kind) {',
  '  effect(kind) {\n    (window.soundTrace ||= []).push({kind,time:performance.now()/1000});'
)
// 3D model loading polls on timers; advance the paused fake clock until the title dialog opens.
async function begin(page) {
  while (!(await page.locator('dialog[open]').count())) await page.clock.runFor(50)
  await page.getByRole('button', { name: '進軍開始' }).click()
}
const browser = await chromium.launch({ channel: 'chrome', headless: true })
for (const [name, width, height] of [
  ['pc', 1280, 800],
  ['portrait', 390, 844],
  ['landscape', 844, 390]
]) {
  const page = await browser.newPage({ viewport: { width, height } })
  const errors = []
  page.on('pageerror', (e) => errors.push(String(e)))
  await page.clock.install({ time: new Date(0) })
  await page.clock.pauseAt(new Date(0))
  await page.route('**/lane-battle/simulation.js*', (route) =>
    route.fulfill({ contentType: 'application/javascript', body: fixture })
  )
  await page.route('**/lane-battle/audio.js*', (route) =>
    route.fulfill({ contentType: 'application/javascript', body: audio })
  )
  await page.goto(url)
  await begin(page)
  for (let i = 0; i < 60; i++) {
    await page.clock.runFor(17)
    await page
      .locator('canvas')
      .first()
      .screenshot({ path: `${root}/${name}-${i}.png` })
  }
  const trace = await page.evaluate(() => ({ frames: window.syncTrace, sounds: window.soundTrace }))
  const release = trace.frames.find((f) => f.projectiles === 1),
    death = trace.frames.find((f) => f.hp === 0)
  assert.ok(death.t - release.t >= 0.12 - 1e-9)
  assert.ok(death.t - release.t <= 0.12 + 1 / 60 + 1e-9)
  assert.equal(death.arrived, true, 'arrival and death share a simulation update')
  const shot = trace.sounds.find((e) => e.kind === 'shot'),
    hit = trace.sounds.find((e) => e.kind === 'hit')
  assert.ok(Math.abs(hit.time - shot.time - (death.t - release.t)) < 0.00001, 'impact sound shares the death frame')
  await fs.writeFile(`${root}/${name}-trace.json`, JSON.stringify(trace, null, 2))
  execFileSync(process.env.FFMPEG_BIN || 'ffmpeg', [
    '-y',
    '-loglevel',
    'error',
    '-framerate',
    '60',
    '-i',
    `${root}/${name}-%d.png`,
    '-c:v',
    'libvpx-vp9',
    '-pix_fmt',
    'yuv420p',
    `${root}/${name}.webm`
  ])
  await page.reload()
  await begin(page)
  await page.clock.runFor(50)
  await page.getByRole('button', { name: '一時停止', exact: true }).click()
  const frozen = await page.evaluate(() => window.syncTrace.at(-1))
  assert.equal(frozen.projectiles, 1)
  await page.clock.runFor(500)
  assert.deepEqual(await page.evaluate(() => window.syncTrace.at(-1)), frozen, 'pending arrow freezes during pause')
  await page.getByRole('button', { name: '一時停止', exact: true }).click()
  await page.clock.runFor(160)
  assert.equal(await page.evaluate(() => window.syncTrace.at(-1).hp), 0)
  assert.deepEqual(errors, [])
  await page.close()
  console.log(
    name,
    'arrow/death/impact sound same frame; pause/resume PASS',
    JSON.stringify({ release: release.t, death: death.t, shot: shot.time, hit: hit.time })
  )
}
await browser.close()
