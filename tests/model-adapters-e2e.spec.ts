import { expect, test, type Page, type TestInfo } from '@playwright/test'

// Uses the final runtime derivatives in public/tower-defense-art/models. Run
// against a Vite development server; source-module imports do not work in preview.
const ROLES = [
  'soldier',
  'archer',
  'tank',
  'mage',
  'frost',
  'healer',
  'runner',
  'ranger',
  'cannon',
  'paladin',
  'slime',
  'goblin',
  'wolf',
  'beetle',
  'shaman',
  'brute',
  'bat',
  'wraith',
  'ogre',
  'dragon'
] as const

const browserLogs = new WeakMap<Page, string[]>()

async function attachJson(info: TestInfo, name: string, value: unknown) {
  await info.attach(name, { body: Buffer.from(JSON.stringify(value, null, 2)), contentType: 'application/json' })
}

async function attachCanvas(page: Page, info: TestInfo, name: string) {
  // Capture immediately after a fresh render, before the browser can discard its
  // drawing buffer. This does not enable preserveDrawingBuffer in the benchmark.
  const data = await page.evaluate(() => (window as any).__modelReview.capture())
  await info.attach(name, { body: Buffer.from(data.split(',')[1], 'base64'), contentType: 'image/png' })
}

async function startReview(page: Page, width: number, height: number) {
  const runtimeDirectory = process.env.TOWER_MODEL_RUNTIME_DIRECTORY ?? 'models'
  if (!['models', 'models-optimized'].includes(runtimeDirectory)) throw new Error('Unsupported model runtime directory')
  if (runtimeDirectory !== 'models') {
    await page.route('**/tower-defense-art/models/**', (route) =>
      route.continue({
        url: route.request().url().replace('/tower-defense-art/models/', `/tower-defense-art/${runtimeDirectory}/`)
      })
    )
  }
  // Same-origin test document avoids running another game/render loop during the
  // isolated adapter measurements. All modules and GLBs are the real Vite assets.
  await page.route('**/__model_adapter_review__.html', (route) =>
    route.fulfill({
      contentType: 'text/html',
      body:
        '<!doctype html><html><head><link rel="icon" href="data:,"><title>Runtime model review</title></head>' +
        '<body style="margin:0;background:#18251e;color:white;font:14px monospace"><div id="status"></div></body></html>'
    })
  )
  await page.goto('/moq-games/__model_adapter_review__.html')
  return page.evaluate(
    async ({ width, height }) => {
      const root = '/moq-games/examples/games/tower_diffence_with_jev/src/'
      const { UNIT_MODEL_CATALOG } = await import(root + 'rendering/models/catalog.ts')
      const { ModelAssetCache } = await import(root + 'rendering/ModelAssetCache.ts')
      const { ModelUnitVisual } = await import(root + 'rendering/ModelUnitVisual.ts')
      const { CONFIG } = await import(root + 'game/model.ts')
      const { ATTACK_PROFILES } = await import(root + 'game/AttackProfiles.ts')
      const threeModule = '/moq-games/node_modules/.vite/deps/three.js'
      const THREE = await import(threeModule)
      const scene = new THREE.Scene()
      // Y-down board projection, viewed from +Z. The near/far range also contains
      // real model depth and the game's per-row depth offset.
      const camera = new THREE.OrthographicCamera(0, width, 0, height, 0.1, 2000)
      camera.position.z = 1000
      const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true })
      renderer.setPixelRatio(1)
      renderer.setSize(width, height)
      renderer.setClearColor(0x000000, 0)
      renderer.outputColorSpace = THREE.SRGBColorSpace
      renderer.domElement.id = 'model-review-canvas'
      renderer.domElement.style.cssText = 'display:block;background:#60785e'
      document.body.prepend(renderer.domElement)
      scene.add(new THREE.HemisphereLight(0xf4ffe3, 0x244352, 2.5))
      const light = new THREE.DirectionalLight(0xffe0ad, 3)
      light.position.set(-120, -240, 100)
      scene.add(light)
      const cache = new ModelAssetCache(undefined, 192 * 1024 * 1024, 2)
      const actors: any[] = []
      const reports: any[] = []
      const gl = renderer.getContext()
      const debug = gl.getExtension('WEBGL_debug_renderer_info')
      const environment = {
        userAgent: navigator.userAgent,
        threeRevision: THREE.REVISION,
        renderer: debug ? gl.getParameter(debug.UNMASKED_RENDERER_WEBGL) : gl.getParameter(gl.RENDERER),
        vendor: debug ? gl.getParameter(debug.UNMASKED_VENDOR_WEBGL) : gl.getParameter(gl.VENDOR),
        webglVersion: gl.getParameter(gl.VERSION),
        context: gl.getContextAttributes(),
        width,
        height,
        pixelRatio: renderer.getPixelRatio(),
        maxUnits: CONFIG.maxUnits,
        lighting: 'GameRenderer hemisphere + directional lights',
        scope: 'ModelUnitVisual + real runtime GLBs/adapters; no game simulation, terrain, UI or effects'
      }
      let stage = 'initialized'
      function status(value: string) {
        stage = value
        document.getElementById('status')!.textContent = value
      }
      async function load(source: any, label: string) {
        status(`loading ${label}: ${source.url}`)
        const start = performance.now()
        while (cache.request(source.url) !== 'ready') {
          if (cache.error(source.url)) throw new Error(`${label}: ${cache.error(source.url)}`)
          if (performance.now() - start > 60_000) throw new Error(`${label}: model loading timeout`)
          await new Promise((resolve) => setTimeout(resolve, 20))
        }
      }
      function create(role: string, x: number, y: number) {
        const definition = UNIT_MODEL_CATALOG[role]
        if (!definition) throw new Error(`Missing catalog role: ${role}`)
        const visual = new ModelUnitVisual(definition, cache)
        visual.setPosition(x, y)
        scene.add(visual.root)
        actors.push(visual)
        return visual
      }
      function pixels() {
        // Read the actual default framebuffer, not a geometry bounding box. Alpha
        // isolates model pixels from the CSS backdrop and catches empty renders.
        const rgba = new Uint8Array(width * height * 4)
        gl.readPixels(0, 0, width, height, gl.RGBA, gl.UNSIGNED_BYTE, rgba)
        let count = 0,
          minX = width,
          minY = height,
          maxX = -1,
          maxY = -1
        for (let y = 0; y < height; y++)
          for (let x = 0; x < width; x++) {
            if (rgba[(y * width + x) * 4 + 3] === 0) continue
            count++
            minX = Math.min(minX, x)
            maxX = Math.max(maxX, x)
            minY = Math.min(minY, height - 1 - y)
            maxY = Math.max(maxY, height - 1 - y)
          }
        return {
          count,
          bounds: count ? { minX, minY, maxX, maxY } : null,
          touchesEdge: count > 0 && (minX === 0 || minY === 0 || maxX === width - 1 || maxY === height - 1)
        }
      }
      function renderReport(role: string, motion: string, visual: any) {
        renderer.render(scene, camera)
        const report = {
          role,
          motion,
          ...visual.diagnostics(),
          drawCalls: renderer.info.render.calls,
          renderedTriangles: renderer.info.render.triangles,
          pixels: pixels(),
          glError: gl.getError(),
          camera: { left: camera.left, right: camera.right, top: camera.top, bottom: camera.bottom }
        }
        reports.push(report)
        return report
      }
      async function sample(visual: any, role: string, motion: string, pose: any) {
        status(`${role}/${motion} ${JSON.stringify(pose)}`)
        if (
          !visual.sample({
            motion,
            seconds: 0,
            loop: motion === 'idle' || motion === 'walk',
            facingX: 1,
            facingY: 1,
            boss: false,
            ...pose
          })
        )
          throw new Error(`${role}/${motion}: sample not ready`)
        await renderer.compileAsync(scene, camera)
        return renderReport(role, motion, visual)
      }
      function capture() {
        renderer.render(scene, camera)
        // Composite the WebGL pixels onto a known opaque backdrop for portable PNGs.
        const image = document.createElement('canvas')
        image.width = width
        image.height = height
        const ctx = image.getContext('2d')!
        ctx.fillStyle = '#60785e'
        ctx.fillRect(0, 0, width, height)
        ctx.drawImage(renderer.domElement, 0, 0)
        return image.toDataURL('image/png')
      }
      ;(window as any).__modelReview = {
        scene,
        camera,
        renderer,
        cache,
        actors,
        reports,
        environment,
        CONFIG,
        ATTACK_PROFILES,
        catalog: UNIT_MODEL_CATALOG,
        load,
        create,
        sample,
        renderReport,
        capture,
        status,
        diagnostics: () => ({
          stage,
          environment,
          reports,
          actors: actors.map((actor) => actor.diagnostics()),
          renderer: { render: { ...renderer.info.render }, memory: { ...renderer.info.memory } }
        }),
        dispose: () => {
          actors.forEach((actor) => actor.dispose())
          cache.dispose()
          renderer.dispose()
        }
      }
      return { roles: Object.keys(UNIT_MODEL_CATALOG).sort(), environment }
    },
    { width, height }
  )
}

test.beforeEach(async ({ page }) => {
  const errors: string[] = []
  browserLogs.set(page, errors)
  page.on('pageerror', (error) => errors.push(`pageerror: ${error.stack ?? error.message}`))
  page.on('console', (message) => {
    if (message.type() === 'error') errors.push(`console: ${message.text()}`)
  })
  page.on('requestfailed', (request) => errors.push(`request: ${request.url()} ${request.failure()?.errorText}`))
  page.on('response', (response) => {
    if (response.status() >= 400) errors.push(`HTTP ${response.status()}: ${response.url()}`)
  })
})

test.afterEach(async ({ page }, info) => {
  await attachJson(info, 'browser-errors.json', browserLogs.get(page) ?? [])
  if (!page.isClosed()) {
    const diagnostics = await page
      .evaluate(() => (window as any).__modelReview?.diagnostics())
      .catch((error) => ({
        unavailable: String(error)
      }))
    await attachJson(info, 'model-diagnostics.json', diagnostics ?? { unavailable: 'Harness did not initialize' })
    if (info.status !== info.expectedStatus) {
      await attachCanvas(page, info, 'last-model-frame.png').catch(() => {})
      await page
        .screenshot()
        .then((body) => info.attach('failure-page.png', { body, contentType: 'image/png' }))
        .catch(() => {})
    }
    await page.evaluate(() => (window as any).__modelReview?.dispose()).catch(() => {})
  }
})

function expectRendered(report: any, unclipped = true) {
  const context = `${report.role}/${report.motion} at ${report.seconds}s`
  expect(report.meshes, context).toBeGreaterThan(0)
  expect(report.triangles, context).toBeGreaterThan(0)
  expect(report.drawCalls, context).toBeGreaterThan(0)
  expect(report.renderedTriangles, context).toBeGreaterThan(0)
  expect(report.pixels.count, `${context}: actual framebuffer must contain model pixels`).toBeGreaterThan(0)
  if (unclipped) expect(report.pixels.touchesEdge, `${context}: review camera crops the model`).toBe(false)
  expect(report.glError, context).toBe(0)
}

for (const role of ROLES) {
  test(`${role}: runtime meshes, authored motions and 384x300 pixel evidence`, async ({ page }, info) => {
    const initialized = await startReview(page, 384, 300)
    expect(initialized.roles).toEqual([...ROLES].sort())
    await attachJson(info, 'environment.json', initialized.environment)
    const reports = await page.evaluate(async (role) => {
      const h = (window as any).__modelReview
      const definition = h.catalog[role]
      const visual = h.create(role, 192, 225)
      // Keep native gameplay scale, direction and camera projection. A generous
      // 384x300 review viewport catches clipping instead of concealing it by fit.
      for (const [motion, source] of Object.entries(definition.clips)) {
        await h.load(source, `${role}/${motion}`)
        for (const cycle of [0, 0.25, 0.7]) await h.sample(visual, role, motion, { cycle })
      }
      return h.reports
    }, role)
    await attachJson(info, 'authored-motion-pixels.json', reports)
    for (const report of reports) expectRendered(report)

    for (const motion of ['idle', role === 'healer' ? 'heal' : 'attack', ...(role === 'dragon' ? ['breath'] : [])]) {
      const report = await page.evaluate(
        async ({ role, motion }) => {
          const h = (window as any).__modelReview
          // Attack/heal images use the game's actual contact/release clock. Breath
          // has its own authored clip and is explicitly labeled as a midpoint.
          const pose =
            motion === 'breath'
              ? { cycle: 0.5 }
              : { seconds: motion === 'idle' ? 0 : h.ATTACK_PROFILES[role].cueMs / 1000 }
          return h.sample(h.actors[0], role, motion, pose)
        },
        { role, motion }
      )
      await attachCanvas(
        page,
        info,
        `${role}-${motion}-${motion === 'idle' ? 'start' : motion === 'breath' ? 'midpoint' : 'combat-cue'}-384x300.png`
      )
      expectRendered(report)
    }
    expect(browserLogs.get(page)).toEqual([])
  })
}

test('48 actors: bounded mixed-roster frame-time evidence without a speed pass threshold', async ({ page }, info) => {
  const initialized = await startReview(page, 1024, 768)
  expect(initialized.environment.maxUnits, 'Review the fixture when CONFIG.maxUnits changes').toBe(48)
  expect(initialized.roles).toEqual([...ROLES].sort())
  await attachJson(info, 'environment.json', initialized.environment)
  const report = await page.evaluate(
    async (roles) => {
      const h = (window as any).__modelReview
      const assignments: { role: string; motion: string; cycle: number; boss: boolean }[] = []
      for (let i = 0; i < h.CONFIG.maxUnits; i++) {
        const role = roles[i % roles.length]
        const motions = ['idle', 'walk', role === 'healer' ? 'heal' : 'attack']
        const motion =
          role === 'dragon' && i >= roles.length ? 'breath' : motions[Math.floor(i / roles.length) % motions.length]
        const assignment = { role, motion, cycle: (i * 0.137) % 1, boss: i === 39 }
        await h.load(h.catalog[role].clips[motion], `${i + 1}/48 ${role}/${motion}`)
        const visual = h.create(role, 64 + (i % 8) * 128, 110 + Math.floor(i / 8) * 122)
        if (!visual.sample({ ...assignment, seconds: 0, loop: true, facingX: i % 2 ? -1 : 1, facingY: 1 }))
          throw new Error(`Actor ${i} was not ready`)
        assignments.push(assignment)
      }
      h.status('Compiling all 48 actors before warmup')
      await h.renderer.compileAsync(h.scene, h.camera)
      const contextLost = { value: false }
      h.renderer.domElement.addEventListener('webglcontextlost', () => {
        contextLost.value = true
      })
      function draw(seconds: number) {
        h.actors.forEach((visual: any, i: number) => {
          const assignment = assignments[i]
          if (
            !visual.sample({
              ...assignment,
              cycle: (assignment.cycle + seconds * 0.4) % 1,
              seconds,
              loop: true,
              facingX: i % 2 ? -1 : 1,
              facingY: 1
            })
          )
            throw new Error(`Actor ${i} sample failed`)
        })
        h.renderer.render(h.scene, h.camera)
      }
      // Both frame count and wall-clock bounds are fixed. A slow machine reports a
      // shorter sample rather than being declared incorrect by an invented FPS bar.
      // Readbacks, screenshots and shader compilation stay outside the timed loop.
      async function batch(label: string, limit: number, budgetMs: number) {
        h.status(label)
        return new Promise<{
          frames: number
          elapsedMs: number
          stop: string
          intervals: number[]
          cpu: number[]
          calls: number[]
          triangles: number[]
        }>((resolve, reject) => {
          const start = performance.now(),
            intervals: number[] = [],
            cpu: number[] = [],
            calls: number[] = [],
            triangles: number[] = []
          let previous: number | undefined,
            request = 0,
            finished = false
          const finish = (stop: string) => {
            if (finished) return
            finished = true
            cancelAnimationFrame(request)
            clearTimeout(timer)
            resolve({
              frames: cpu.length,
              elapsedMs: performance.now() - start,
              stop,
              intervals,
              cpu,
              calls,
              triangles
            })
          }
          const timer = setTimeout(() => finish('wall-clock budget'), budgetMs)
          const tick = (stamp: number) => {
            if (finished) return
            try {
              if (contextLost.value) throw new Error('WebGL context lost during 48-actor sample')
              if (previous !== undefined) intervals.push(stamp - previous)
              previous = stamp
              const before = performance.now()
              draw((stamp - start) / 1000)
              cpu.push(performance.now() - before)
              calls.push(h.renderer.info.render.calls)
              triangles.push(h.renderer.info.render.triangles)
              if (cpu.length >= limit) finish('frame limit')
              else if (performance.now() - start >= budgetMs) finish('wall-clock budget')
              else request = requestAnimationFrame(tick)
            } catch (error) {
              finished = true
              clearTimeout(timer)
              reject(error)
            }
          }
          request = requestAnimationFrame(tick)
        })
      }
      const warmup = await batch('48-actor warmup: at most 30 frames / 5 seconds', 30, 5000)
      const measured = await batch('48-actor measurement: at most 120 frames / 12 seconds', 120, 12000)
      function stats(values: number[]) {
        const sorted = [...values].sort((a, b) => a - b)
        if (!sorted.length) return { count: 0, min: null, median: null, p95: null, max: null }
        const middle = Math.floor(sorted.length / 2)
        return {
          count: sorted.length,
          min: sorted[0],
          median: sorted.length % 2 ? sorted[middle] : (sorted[middle - 1] + sorted[middle]) / 2,
          p95: sorted[Math.ceil(sorted.length * 0.95) - 1],
          max: sorted[sorted.length - 1]
        }
      }
      h.status('48-actor measurement complete; preparing evidence')
      const framebuffer = h.renderReport('48-actor-mixed-roster', 'mixed', h.actors[0])
      return {
        environment: h.environment,
        actors: h.actors.length,
        visibleActors: h.actors.filter((actor: any) => actor.root.visible).length,
        assignments,
        warmup: { frames: warmup.frames, elapsedMs: warmup.elapsedMs, stop: warmup.stop },
        measurement: {
          frames: measured.frames,
          elapsedMs: measured.elapsedMs,
          stop: measured.stop,
          rafFrameIntervalMs: stats(measured.intervals),
          cpuUpdateAndRenderSubmissionMs: stats(measured.cpu),
          drawCalls: stats(measured.calls),
          triangles: stats(measured.triangles),
          raw: measured
        },
        framebuffer,
        contextLost: contextLost.value,
        interpretation:
          'RAF intervals include scheduling/vsync. CPU durations measure pose updates and render submission, not GPU execution time. ' +
          'Shared cache, mixed roster/motions, one boss, 1024x768 at DPR 1. This isolated model-load sample is not whole-game FPS or a performance acceptance threshold.'
      }
    },
    [...ROLES]
  )
  await attachJson(info, '48-actor-performance.json', report)
  await attachCanvas(page, info, '48-actor-mixed-roster-1024x768.png')
  expect(report.actors).toBe(48)
  expect(report.visibleActors).toBe(48)
  expect(report.contextLost).toBe(false)
  // At least two frames are needed for a real RAF interval. No timing value is a
  // pass/fail threshold; exhausted wall-clock samples remain visible in evidence.
  expect(report.measurement.frames, 'Insufficient frames to measure an interval').toBeGreaterThanOrEqual(2)
  expect(report.measurement.rafFrameIntervalMs.count).toBeGreaterThan(0)
  expect(report.measurement.drawCalls.min).toBeGreaterThan(0)
  expect(report.measurement.triangles.min).toBeGreaterThan(0)
  expectRendered(report.framebuffer, false)
  expect(browserLogs.get(page)).toEqual([])
})
