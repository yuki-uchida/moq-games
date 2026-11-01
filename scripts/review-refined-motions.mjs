/** Headless real-runtime playback. Requires a running local Vite server. */
import { chromium } from 'playwright'
import fs from 'node:fs'
const out = process.env.MOTION_REVIEW_OUTPUT ?? '.generated/motion-review'
fs.mkdirSync(out, { recursive: true })
const browser = await chromium.launch({ headless: true, channel: process.env.PLAYWRIGHT_CHANNEL ?? 'chrome' })
const page = await browser.newPage({ viewport: { width: 1000, height: 1500 } })
const failures = []
page.on('pageerror', (e) => failures.push(e.message))
await page.route('**/__motion_refinement__.html', (r) =>
  r.fulfill({ contentType: 'text/html', body: '<!doctype html><body style="margin:0"></body>' })
)
await page.goto(`${process.env.TOWER_E2E_BASE_URL ?? 'http://127.0.0.1:5183'}/moq-games/__motion_refinement__.html`)
await page.evaluate(async () => {
  const base = '/moq-games/examples/games/tower_diffence_with_jev/src/',
    T = await import('/moq-games/node_modules/.vite/deps/three.js'),
    { ModelAssetCache } = await import(base + 'rendering/ModelAssetCache.ts'),
    { ModelUnitVisual } = await import(base + 'rendering/ModelUnitVisual.ts'),
    { UNIT_MODEL_CATALOG } = await import(base + 'rendering/models/catalog.ts')
  const specs = [
    ['archer', 'walk', 1],
    ['runner', 'walk', 1],
    ['tank', 'walk', 0.625],
    ['crystalSentinel', 'attack', 1.5],
    ['koboldLancer', 'attack', 1.2],
    ['tank', 'attack', 0.864]
  ]
  const scene = new T.Scene()
  scene.background = new T.Color('#60785e')
  const camera = new T.OrthographicCamera(0, 1000, 0, 1500, 0.1, 2000)
  camera.position.z = 1000
  const renderer = new T.WebGLRenderer({ antialias: true, preserveDrawingBuffer: true })
  renderer.setSize(1000, 1500)
  document.body.append(renderer.domElement)
  scene.add(new T.HemisphereLight(0xf4ffe3, 0x244352, 2.5))
  const light = new T.DirectionalLight(0xffe0ad, 3)
  light.position.set(-120, -240, 100)
  scene.add(light)
  const cache = new ModelAssetCache(undefined, Infinity),
    actors = []
  for (let row = 0; row < specs.length; row++) {
    const [role, motion, duration] = specs[row],
      def = UNIT_MODEL_CATALOG[role],
      source = def.clips[motion]
    while (cache.requestSource(source) !== 'ready') {
      if (cache.error(source.url)) throw Error(cache.error(source.url))
      await new Promise((r) => setTimeout(r, 20))
    }
    for (let col = 0; col < 2; col++) {
      const v = new ModelUnitVisual(def, cache)
      v.setPosition(col === 0 ? 110 : 450, 230 + row * 250)
      if (col === 1) v.normalized.scale.multiplyScalar(2.5)
      scene.add(v.root)
      actors.push({ v, role, motion, duration, row, col })
    }
  }
  const overlay = document.createElement('canvas')
  overlay.width = 1000
  overlay.height = 1500
  document.body.replaceChildren(overlay)
  const ctx = overlay.getContext('2d')
  function draw(t, angle) {
    for (const a of actors) {
      if (
        !a.v.sample({
          motion: a.motion,
          seconds: t % a.duration,
          loop: a.motion === 'walk',
          facingX: Math.sin(angle),
          facingY: Math.cos(angle),
          boss: false
        })
      )
        throw Error('Not ready')
    }
    renderer.render(scene, camera)
    ctx.drawImage(renderer.domElement, 0, 0)
    ctx.fillStyle = 'white'
    ctx.font = '15px monospace'
    for (let i = 0; i < specs.length; i++)
      ctx.fillText(
        `${specs[i][0]} ${specs[i][1]} ${t.toFixed(3)}s ${Math.round((angle * 180) / Math.PI)}deg | 1x / 2.5x`,
        12,
        18 + i * 250
      )
  }
  window.audit = {
    actors,
    draw,
    async record(seconds, angle) {
      const stream = overlay.captureStream(30),
        rec = new MediaRecorder(stream, { mimeType: 'video/webm;codecs=vp8', videoBitsPerSecond: 7000000 }),
        chunks = [],
        frames = []
      rec.ondataavailable = (e) => chunks.push(e.data)
      const finished = new Promise((r) => (rec.onstop = r))
      rec.start()
      const start = performance.now()
      await new Promise((resolve) => {
        function tick() {
          const t = (performance.now() - start) / 1000
          draw(Math.min(t, seconds), angle)
          frames.push(t)
          if (t >= seconds) resolve()
          else requestAnimationFrame(tick)
        }
        tick()
      })
      rec.stop()
      await finished
      stream.getTracks().forEach((t) => t.stop())
      const bytes = new Uint8Array(await new Blob(chunks).arrayBuffer())
      let s = ''
      for (let i = 0; i < bytes.length; i += 8192) s += String.fromCharCode(...bytes.slice(i, i + 8192))
      return { video: btoa(s), frames }
    },
    capture: () => overlay.toDataURL('image/png')
  }
  draw(0, 0)
})
const angles = [
    0,
    Math.PI / 2,
    Math.PI / 4,
    Math.PI,
    (Math.PI * 3) / 2,
    (Math.PI * 3) / 4,
    (Math.PI * 5) / 4,
    (Math.PI * 7) / 4
  ],
  reports = []
for (let pass = 0; pass < angles.length; pass++) {
  const result = await page.evaluate(async ({ angle }) => window.audit.record(3, angle), { angle: angles[pass] })
  fs.writeFileSync(`${out}/direction-${pass}.webm`, Buffer.from(result.video, 'base64'))
  const png = await page.evaluate(() => window.audit.capture())
  fs.writeFileSync(`${out}/direction-${pass}.png`, Buffer.from(png.split(',')[1], 'base64'))
  reports.push({
    pass,
    directionRadians: angles[pass],
    requestedSeconds: 3,
    renderedFrames: result.frames.length,
    maxFrameGap: Math.max(...result.frames.slice(1).map((t, i) => t - result.frames[i])),
    scope:
      'ModelUnitVisual, exact GLBs, catalog clips/adapters, game camera and lighting; fixed actor positions, no simulation'
  })
  console.log(reports.at(-1))
}
fs.writeFileSync(`${out}/playback.json`, JSON.stringify({ reports, failures }, null, 2))
await browser.close()
if (failures.length) throw Error(JSON.stringify(failures))
