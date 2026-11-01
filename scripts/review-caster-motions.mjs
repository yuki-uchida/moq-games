/** Headless, real ModelUnitVisual/GLB visual evidence. Requires local Vite. */
import { chromium } from 'playwright'
import fs from 'node:fs'
const baseline = process.env.CASTER_REVIEW_BASELINE === '1'
const out = baseline ? '.generated/caster-review-baseline' : '.generated/caster-review'
fs.mkdirSync(out, { recursive: true })
const browser = await chromium.launch({ headless: true, channel: 'chrome' }),
  page = await browser.newPage({ viewport: { width: 1000, height: 1050 } })
if (baseline)
  await page.route('**/tower-defense-art/models/**/*.glb', (route) => {
    const u = route.request().url()
    const role = ['mage', 'frost', 'healer'].find((r) => u.includes(`/models/${r}/`))
    return role ? route.continue({ url: u.replace(/[^/]+$/, `${role}-motion-v2-candidate.glb`) }) : route.continue()
  })
page.on('pageerror', (e) => console.error(e.message))
await page.goto(
  `${process.env.TOWER_E2E_BASE_URL ?? 'http://127.0.0.1:5185'}/moq-games/examples/games/tower_diffence_with_jev/model-review.html`
)
await page.evaluate(async () => {
  const root = '/moq-games/examples/games/tower_diffence_with_jev/src/',
    T = await import('/moq-games/node_modules/.vite/deps/three.js'),
    { ModelAssetCache } = await import(root + 'rendering/ModelAssetCache.ts'),
    { ModelUnitVisual } = await import(root + 'rendering/ModelUnitVisual.ts'),
    { UNIT_MODEL_CATALOG } = await import(root + 'rendering/models/catalog.ts')
  document.body.innerHTML = ''
  const scene = new T.Scene(),
    camera = new T.OrthographicCamera(0, 1000, 0, 1050, 0.1, 2000)
  scene.background = new T.Color('#60785e')
  camera.position.z = 1000
  const renderer = new T.WebGLRenderer({ antialias: true, preserveDrawingBuffer: true })
  renderer.setSize(1000, 1050)
  document.body.append(renderer.domElement)
  scene.add(new T.HemisphereLight(0xf4ffe3, 0x244352, 2.5))
  const light = new T.DirectionalLight(0xffe0ad, 3)
  light.position.set(-120, -240, 100)
  scene.add(light)
  const cache = new ModelAssetCache(),
    actors = []
  for (const [r, role] of ['mage', 'frost', 'healer'].entries()) {
    const def = UNIT_MODEL_CATALOG[role]
    for (const s of Object.values(def.clips))
      while (cache.requestSource(s) !== 'ready') {
        if (cache.error(s.url)) throw Error(cache.error(s.url))
        await new Promise((r) => setTimeout(r, 20))
      }
    for (let i = 0; i < 8; i++) {
      const v = new ModelUnitVisual(def, cache)
      scene.add(v.root)
      actors.push({ v, role, r, i, nativeScale: v.normalized.scale.clone() })
    }
  }
  window.casters = {
    sample({ motion = 'spell', seconds = 0, directions = false, native = false, phases = false, bg = '#60785e' } = {}) {
      scene.background.set(bg)
      for (const a of actors) {
        const { v, role, r, i } = a
        v.setPosition(62 + i * 125, 320 + r * 340)
        v.normalized.scale.copy(a.nativeScale).multiplyScalar(native ? 1 : 2)
        const t = phases ? (i * (role === 'frost' ? 0.768 : 0.96)) / 7 : seconds,
          angle = directions ? (i * Math.PI) / 4 : Math.PI / 4
        v.sample({
          motion: motion === 'spell' ? (role === 'healer' ? 'heal' : 'attack') : motion,
          seconds: t,
          loop: motion === 'walk',
          facingX: Math.cos(angle),
          facingY: Math.sin(angle),
          boss: false
        })
      }
      renderer.render(scene, camera)
      return renderer.info.render
    },
    actors
  }
})
await page.evaluate(async () => {
  const refs = []
  for (const [r, role] of ['mage', 'frost', 'healer'].entries()) {
    const stem = { mage: 'star-mage', frost: 'frost-caster', healer: 'flower-healer' }[role],
      base = `/moq-games/tower-defense-art/${role}/`,
      data = await (await fetch(`${base}${stem}-attack-se.json`)).json(),
      img = new Image()
    img.src = base + data.texture
    await img.decode()
    refs.push({ r, data, img })
  }
  const c = document.createElement('canvas')
  c.width = 1000
  c.height = 1050
  c.style.cssText = 'position:absolute;left:0;top:0;pointer-events:none;background:transparent'
  document.body.append(c)
  window.casterSources = {
    draw(times) {
      const ctx = c.getContext('2d')
      ctx.clearRect(0, 0, 1000, 1050)
      for (const { r, data, img } of refs)
        for (let i = 0; i < 8; i++) {
          let t =
              (times === null ? (i * (r === 1 ? 0.768 : 0.96)) / 7 : Math.min(times, r === 1 ? 0.768 : 0.96)) * 1000,
            frame = data.frames.at(-1)
          for (const f of data.frames) {
            if (t < f.durationMs) {
              frame = f
              break
            }
            t -= f.durationMs
          }
          ctx.drawImage(
            img,
            frame.x,
            frame.y,
            frame.width,
            frame.height,
            62 + i * 125 - frame.pivot.x,
            320 + r * 340 - 115 - frame.pivot.y,
            frame.width,
            frame.height
          )
        }
    },
    clear() {
      c.getContext('2d').clearRect(0, 0, 1000, 1050)
    }
  }
})
for (const [name, args] of [
  ['01-phases', { phases: true }],
  ['02-native-phases', { phases: true, native: true }],
  ['03-directions-cue', { directions: true, seconds: 0.52 }],
  ['04-walk-directions', { directions: true, motion: 'walk', seconds: 0.25 }],
  ['04-walk-light', { directions: true, motion: 'walk', seconds: 0.75, bg: '#d9e2d3' }]
]) {
  await page.evaluate((args) => window.casters.sample(args), args)
  await page.screenshot({ path: `${out}/${name}.png` })
  if (name === '02-native-phases') {
    await page.evaluate(() => window.casterSources.draw(null))
    await page.screenshot({ path: `${out}/02-source-comparison.png` })
    await page.evaluate(() => window.casterSources.clear())
  }
}
for (const [i, t] of [0, 0.16, 0.32, 0.42, 0.52, 0.6, 0.72, 0.84, 0.96].entries()) {
  await page.evaluate((t) => window.casters.sample({ seconds: t }), t)
  await page.screenshot({ path: `${out}/sequence-${i}-${t}.png` })
  await page.evaluate((t) => {
    window.casters.sample({ seconds: t, native: true })
    window.casterSources.draw(t)
  }, t)
  await page.screenshot({ path: `${out}/source-sequence-${i}.png` })
  await page.evaluate(() => window.casterSources.clear())
}
for (const [i, t] of [0, 0.25, 0.5, 0.75, 0.99].entries()) {
  await page.evaluate((t) => window.casters.sample({ motion: 'walk', seconds: t, directions: true }), t)
  await page.screenshot({ path: `${out}/walk-sequence-${i}.png` })
}
fs.writeFileSync(
  `${out}/render-info.json`,
  JSON.stringify(await page.evaluate(() => window.casters.sample({ seconds: 0.52 })))
)
await browser.close()
process.exit(0)
