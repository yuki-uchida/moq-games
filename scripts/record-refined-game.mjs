/** Record the unchanged normal game with an offline, validated saved encounter. */
import { chromium } from 'playwright'
import fs from 'node:fs'
const out = '.generated/refined-game'
fs.mkdirSync(out, { recursive: true })
const browser = await chromium.launch({ headless: true, channel: process.env.PLAYWRIGHT_CHANNEL ?? 'chrome' })
const page = await browser.newPage({ viewport: { width: 1440, height: 1000 } }),
  failures = []
page.on('pageerror', (e) => failures.push(e.message))
await page.goto(
  `${process.env.TOWER_E2E_BASE_URL ?? 'http://127.0.0.1:5183'}/moq-games/examples/games/tower_diffence_with_jev/`
)
const fixture = await page.evaluate(async () => {
  const base = '/moq-games/examples/games/tower_diffence_with_jev/src/'
  const { GameEngine } = await import(base + 'game/GameEngine.ts'),
    { freshSave } = await import(base + 'progression/UpgradeSystem.ts'),
    model = await import(base + 'game/model.ts'),
    { saveCampaignCheckpoint } = await import(base + 'progression/CampaignStorage.ts'),
    { validateCampaignCheckpoint } = await import(base + 'game/CampaignCheckpoint.ts')
  const save = freshSave()
  save.highestStage = 3
  save.purchased = model.ALLY_TYPES.filter((type) => model.DEFINITIONS[type].purchaseCost > 0)
  const engine = new GameEngine({ decide: async () => null }, save, 'meadow', 42, () => 0, undefined, 2, 4)
  engine.state.stage = engine.state.stageSummary.stage = 4
  engine.state.previousStageSummary = {
    ...engine.state.stageSummary,
    stage: 3,
    spawned: model.stageRules(3).enemyCount,
    resolved: model.stageRules(3).enemyCount
  }
  engine.history.reset(engine.state)
  const entrance = model.routePathFor(engine.state, 'left')[0]
  const slots = [...model.getField('meadow', 2, 4).slots].sort(
    (a, b) => Math.hypot(a.x - entrance.x, a.y - entrance.y) - Math.hypot(b.x - entrance.x, b.y - entrance.y)
  )
  for (const [index, role] of ['archer', 'runner', 'tank'].entries())
    if (!engine.place(role, slots[index])) throw Error('Placement failed ' + role)
  engine.startAssault()
  const positions = []
  for (const role of ['crystalSentinel', 'koboldLancer']) {
    while (engine.state.time < engine.state.nextSpawnAt + 0.02) engine.update(1 / 60)
    if (!engine.applyAIAction({ type: 'spawn', unitType: role, routeId: 'left' })) throw Error('Spawn failed ' + role)
    const unit = engine.state.units.at(-1)
    positions.push({ role, progress: unit.progress, x: unit.x, y: unit.y })
  }
  const checkpoint = engine.exportCheckpoint()
  let raw = ''
  if (
    !saveCampaignCheckpoint(save, checkpoint, validateCampaignCheckpoint, { setItem: (_key, value) => (raw = value) })
  )
    throw Error('Checkpoint validation failed')
  localStorage.setItem('tower-jev-v3', raw)
  return {
    positions,
    actors: engine.state.units.map((u) => ({ type: u.type, x: u.x, y: u.y })),
    scope:
      'Validated offline stage-4 checkpoint, three legally placed allies near the entrance and two opponents spawned with the real spawn clock; natural unit stats, speed, collision and combat clocks. No Jev connection.'
  }
})
await page.reload()
await page.locator('#title-continue').click()
await page.locator('#campaign-loading').waitFor({ state: 'hidden', timeout: 180000 })
await page.waitForFunction(() => window.towerDefenseDiagnostics().assetStatus === 'ready', { timeout: 90000 })
const record = await page.evaluate(async () => {
  const canvas = document.querySelector('#field canvas'),
    stream = canvas.captureStream(30),
    rec = new MediaRecorder(stream, { mimeType: 'video/webm;codecs=vp8', videoBitsPerSecond: 9000000 }),
    chunks = [],
    samples = []
  rec.ondataavailable = (e) => chunks.push(e.data)
  const done = new Promise((r) => (rec.onstop = r))
  rec.start()
  const start = performance.now()
  await new Promise((resolve) => {
    function tick() {
      const d = window.towerDefenseDiagnostics()
      samples.push({
        wallMs: performance.now() - start,
        time: d.simulationTime,
        units: d.modelRendering.units.map((u) => ({
          type: u.type,
          motion: u.motion,
          seconds: u.seconds,
          visible: u.visible
        }))
      })
      if (performance.now() - start >= 16000) resolve()
      else requestAnimationFrame(tick)
    }
    tick()
  })
  rec.stop()
  await done
  stream.getTracks().forEach((t) => t.stop())
  const bytes = new Uint8Array(await new Blob(chunks).arrayBuffer())
  let text = ''
  for (let i = 0; i < bytes.length; i += 8192) text += String.fromCharCode(...bytes.slice(i, i + 8192))
  return { video: btoa(text), samples }
})
const observed = new Set(record.samples.flatMap((sample) => sample.units.map((unit) => `${unit.type}:${unit.motion}`)))
for (const required of [
  'archer:walk',
  'runner:walk',
  'tank:walk',
  'tank:attack',
  'crystalSentinel:attack',
  'koboldLancer:attack'
])
  if (!observed.has(required)) failures.push(`Unobserved changed motion: ${required}`)
fs.writeFileSync(`${out}/game.webm`, Buffer.from(record.video, 'base64'))
fs.writeFileSync(`${out}/game.json`, JSON.stringify({ fixture, samples: record.samples, failures }, null, 2))
await page.screenshot({ path: `${out}/game.png` })
console.log({
  fixture,
  motions: [...new Set(record.samples.flatMap((s) => s.units.map((u) => `${u.type}:${u.motion}`)))],
  failures
})
await browser.close()
if (failures.length) throw Error(JSON.stringify(failures))
