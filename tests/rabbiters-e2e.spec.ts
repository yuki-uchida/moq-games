import { expect, test } from '@playwright/test'

test('a guest moves smoothly before delayed host snapshots arrive', async ({ browser, baseURL }) => {
  const context = await browser.newContext({ baseURL })
  const network = `
    export const MAX_PLAYERS = 16;
    export class CooperativeNetwork {
      constructor(options) { this.options = options; this.playerId = options.playerId; }
      async start() {
        this.channel = new BroadcastChannel('rabbiters-latency-' + this.options.room);
        this.channel.onmessage = ({ data }) => {
          if (data.type === 'hello' && this.options.role === 'host') {
            const players = [this.playerId, data.playerId];
            this.options.onPresence(players);
            this.channel.postMessage({ type: 'presence', players });
          } else if (data.type === 'presence' && this.options.role === 'guest') {
            this.options.onPresence(data.players);
            this.options.onStatus('ready', 'Connected');
          } else if (data.type === 'input' && this.options.role === 'host') {
            setTimeout(() => this.options.onInput(data.playerId, data.input), 300);
          } else if (data.type === 'snapshot' && this.options.role === 'guest') {
            setTimeout(() => {
              if (!window.rabbitersHoldSnapshots) this.options.onSnapshot(data.state);
            }, 300);
          }
        };
        this.options.onStatus(this.options.role === 'host' ? 'ready' : 'waiting-for-host', 'Connected');
        if (this.options.role === 'guest') this.channel.postMessage({ type: 'hello', playerId: this.playerId });
      }
      async sendInput(input) { this.channel.postMessage({ type: 'input', playerId: this.playerId, input }); }
      async broadcastSnapshot(state) { this.channel.postMessage({ type: 'snapshot', state }); }
      async stop() { this.channel.close(); }
    }
  `
  await context.route('**/src/network.ts*', (route) => route.fulfill({ contentType: 'text/javascript', body: network }))
  await context.route('**/src/main.ts*', async (route) => {
    const response = await route.fetch()
    await route.fulfill({
      response,
      body: `${await response.text()}
window.rabbitersPosition = () => {
  const actor = scene.actors.get('player:' + localId);
  const player = snapshot?.players.find((entry) => entry.id === localId);
  return actor && player ? { shown: actor.root.position.x, confirmed: player.x,
    moving: actor.moving, leg: actor.limbs[0].rotation.x } : null;
};
window.rabbitersSetPreviewTime = (time) => { preview.state.time = time; };`
    })
  })
  const host = await context.newPage()
  const guest = await context.newPage()
  await host.goto('/')
  await host.locator('#room').fill('latency-test')
  await host.locator('#host').click()
  await guest.goto('/')
  await guest.evaluate(() => {
    ;(window as unknown as { rabbitersHoldSnapshots: boolean }).rabbitersHoldSnapshots = true
  })
  await guest.locator('#room').fill('latency-test')
  await guest.locator('#join').click()
  await guest.evaluate(async () => {
    const hooks = window as unknown as {
      rabbitersSetPreviewTime: (time: number) => void
      rabbitersHoldSnapshots: boolean
    }
    hooks.rabbitersSetPreviewTime(120)
    await new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve)))
    hooks.rabbitersHoldSnapshots = false
  })
  const position = () =>
    guest.evaluate(() =>
      (
        window as unknown as {
          rabbitersPosition: () => { shown: number; confirmed: number; moving: number; leg: number } | null
        }
      ).rabbitersPosition()
    )
  await expect.poll(position, { timeout: 15_000 }).not.toBeNull()
  await guest.keyboard.down('KeyD')
  const samples = await guest.evaluate(async () => {
    const read = (
      window as unknown as {
        rabbitersPosition: () => { shown: number; confirmed: number; moving: number; leg: number } | null
      }
    ).rabbitersPosition
    const positions: { shown: number; confirmed: number; moving: number; leg: number }[] = []
    const end = performance.now() + 1200
    while (performance.now() < end) {
      await new Promise(requestAnimationFrame)
      const current = read()
      if (current) positions.push(current)
    }
    return positions
  })
  await guest.keyboard.up('KeyD')
  expect(samples.length).toBeGreaterThan(5)
  expect(samples.some((sample) => sample.shown > sample.confirmed + 0.1)).toBe(true)
  expect(samples.at(-1)!.shown).toBeGreaterThan(samples[0].shown + 0.5)
  const walking = samples.filter((sample) => sample.moving > 0.8).map((sample) => sample.leg)
  expect(walking.length).toBeGreaterThan(5)
  expect(Math.max(...walking) - Math.min(...walking)).toBeGreaterThan(0.3)
  for (let index = 1; index < samples.length; index++) {
    expect(samples[index].shown - samples[index - 1].shown).toBeGreaterThan(-0.1)
    expect(samples[index].shown - samples[index - 1].shown).toBeLessThan(0.8)
  }
  await expect.poll(async () => (await position())!.confirmed, { timeout: 10_000 }).toBeGreaterThan(-36.5)
  await context.close()
})

test('desktop: starts a solo game and collects food by moving', async ({ page }) => {
  const errors: string[] = []
  page.on('pageerror', (error) => errors.push(error.message))
  await page.setViewportSize({ width: 1440, height: 900 })
  await page.goto('/')
  await expect(page.locator('#relay')).toHaveValue('https://relay.moqt.research.skyway.io')
  await expect(page.locator('#world canvas')).toBeVisible()
  await page.locator('#solo').click()
  await expect(page.locator('#hud')).toBeVisible()
  await page.keyboard.down('KeyW')
  await page.keyboard.down('KeyD')
  await page.waitForTimeout(1100)
  await page.keyboard.up('KeyW')
  await page.keyboard.up('KeyD')
  await expect(page.locator('#objective-text')).toContainText('1 / 6')
  await page.locator('#help-open').click()
  await expect(page.locator('#help')).toBeVisible()
  await page.locator('#help-done').click()
  await expect(page.locator('#help')).toBeHidden()
  expect(errors).toEqual([])
})

test('desktop: TPS controls, airborne pose, and sound toggle', async ({ page }) => {
  await page.route('**/src/main.ts*', async (route) => {
    const response = await route.fetch()
    const source = await response.text()
    await route.fulfill({
      response,
      body: `${source}
window.rabbitersObserve = () => {
  const player = game?.state.players.find((entry) => entry.id === localId);
  const actor = scene.actors.get('player:' + localId);
  if (!player || !actor) return null;
  return { x: player.x, y: player.y, z: player.z, yaw,
    legs: actor.limbs.map((leg) => leg.rotation.x), body: actor.body.rotation.x,
    camera: { x: scene.camera.position.x, y: scene.camera.position.y, z: scene.camera.position.z },
    audioState: audio.context?.state, gain: audio.master?.gain.value };
};`
    })
  })
  await page.setViewportSize({ width: 1440, height: 900 })
  await page.goto('/')
  await page.locator('#solo').click()
  type Observation = {
    x: number
    y: number
    z: number
    yaw: number
    legs: number[]
    body: number
    camera: { x: number; y: number; z: number }
    audioState: string
    gain: number
  }
  const observe = () =>
    page.evaluate(() => (window as unknown as { rabbitersObserve: () => Observation }).rabbitersObserve())
  await expect.poll(async () => (await observe())?.audioState).toBe('running')
  await expect.poll(async () => (await observe())?.gain).toBeGreaterThan(0)
  await page.locator('#sound-toggle').click()
  await expect(page.locator('#sound-toggle')).toHaveAttribute('aria-pressed', 'false')
  expect((await observe()).gain).toBe(0)
  await page.locator('#sound-toggle').click()
  await expect(page.locator('#sound-toggle')).toHaveAttribute('aria-pressed', 'true')
  expect((await observe()).gain).toBeGreaterThan(0)

  await page.mouse.move(900, 500)
  await page.mouse.down()
  await page.mouse.move(1050, 500, { steps: 5 })
  await page.mouse.up()
  await page.waitForTimeout(400)
  const before = await observe()
  expect(Math.abs(before.yaw)).toBeGreaterThan(0.5)
  const cameraBehind =
    (before.camera.x - before.x) * Math.sin(before.yaw) + (before.camera.z - before.z) * Math.cos(before.yaw)
  expect(cameraBehind).toBeGreaterThan(1)
  expect(before.camera.y - before.y).toBeLessThan(6)

  await page.keyboard.down('KeyW')
  await page.keyboard.down('Space')
  const frames = await page.evaluate(async () => {
    const read = (window as unknown as { rabbitersObserve: () => Observation }).rabbitersObserve
    const samples: Observation[] = []
    for (let frame = 0; frame < 90; frame++) {
      await new Promise(requestAnimationFrame)
      const sample = read()
      if (sample) samples.push(sample)
    }
    return samples
  })
  await page.keyboard.up('Space')
  await page.keyboard.up('KeyW')
  const airborne = frames.filter((frame) => frame.y > 0.15)
  expect(airborne.length).toBeGreaterThan(3)
  expect(Math.max(...airborne.map((frame) => frame.y))).toBeGreaterThan(0.6)
  for (const frame of airborne) {
    expect(frame.legs).toEqual(airborne[0].legs)
    expect(frame.body).toBe(airborne[0].body)
  }
  const after = frames[frames.length - 1]
  const forward = -(after.x - before.x) * Math.sin(before.yaw) - (after.z - before.z) * Math.cos(before.yaw)
  expect(forward).toBeGreaterThan(0.5)
  const grounded = frames.filter((frame) => frame.y === 0)
  expect(new Set(grounded.map((frame) => frame.legs[0])).size).toBeGreaterThan(1)
})

test('solo: collects food, becomes pregnant and survives to birth', async ({ page }) => {
  test.setTimeout(75_000)
  await page.route('**/src/main.ts*', async (route) => {
    const response = await route.fetch()
    const source = await response.text()
    await route.fulfill({
      response,
      body: `${source}
window.rabbitersTestState = () => JSON.parse(JSON.stringify(game?.state ?? null));
window.rabbitersTestAccelerate = () => {
  const step = game.step.bind(game);
  game.step = (dt) => {
    step(dt);
    if (window.rabbitersFastForward) for (let index = 0; index < 60; index++) step(dt);
  };
};`
    })
  })
  await page.addInitScript(() => {
    const requestFrame = window.requestAnimationFrame.bind(window)
    let time = performance.now()
    window.requestAnimationFrame = (callback) => requestFrame(() => callback((time += 100)))
  })
  await page.goto('/')
  await page.locator('#solo').click()
  await page.evaluate(() => {
    type State = {
      phase: string
      players: { x: number; z: number; foodEaten: number; hunger: number }[]
      foods: { x: number; y: number; z: number; active: boolean }[]
      predators: { x: number; z: number }[]
    }
    const testWindow = window as unknown as {
      rabbitersTestState: () => State
      rabbitersTestAccelerate: () => void
      rabbitersFastForward: boolean
    }
    const read = testWindow.rabbitersTestState
    testWindow.rabbitersTestAccelerate()
    const pressed = new Set<string>()
    const tick = () => {
      const state = read()
      if (!state || state.phase !== 'playing') return
      const player = state.players[0]
      const foods = state.foods.filter((food) => food.active && food.y === 0 && Math.hypot(food.x + 37, food.z) < 18)
      const distance = (point: { x: number; z: number }) => Math.hypot(point.x - player.x, point.z - player.z)
      const target =
        (player.foodEaten < 6 || (player.foodEaten === 6 ? player.hunger < 60 : player.hunger < 40)) && foods.length
          ? foods.sort((first, second) => distance(first) - distance(second))[0]
          : { x: -37, z: 0 }
      const dx = target.x - player.x
      const dz = target.z - player.z
      const threatened = state.predators.some(
        (predator) => Math.hypot(predator.x - player.x, predator.z - player.z) < 5
      )
      const inGrass = [
        [-33, -7],
        [-24, -12]
      ].some(([x, z]) => Math.hypot(x - player.x, z - player.z) < 3.1)
      const desired = new Set([
        ...(dx > 0.6 ? ['KeyD'] : dx < -0.6 ? ['KeyA'] : []),
        ...(dz > 0.6 ? ['KeyS'] : dz < -0.6 ? ['KeyW'] : []),
        ...(distance(target) > 5 ? ['ShiftLeft'] : []),
        ...(threatened && inGrass ? ['KeyC'] : [])
      ])
      testWindow.rabbitersFastForward = target.x === -37 && Math.abs(dx) < 0.6 && Math.abs(dz) < 0.6
      for (const key of new Set([...pressed, ...desired])) {
        if (pressed.has(key) !== desired.has(key))
          window.dispatchEvent(new KeyboardEvent(desired.has(key) ? 'keydown' : 'keyup', { code: key }))
      }
      pressed.clear()
      for (const key of desired) pressed.add(key)
      requestAnimationFrame(tick)
    }
    requestAnimationFrame(tick)
  })
  await expect(page.locator('#result')).toBeVisible({ timeout: 60_000 })
  await expect(page.locator('#result-title')).toHaveText('新しい命が生まれました')
  const finalState = await page.evaluate(() =>
    (
      window as unknown as { rabbitersTestState: () => { time: number; players: { foodEaten: number }[] } }
    ).rabbitersTestState()
  )
  expect(finalState.players[0].foodEaten).toBeGreaterThan(6)
  expect(finalState.time).toBeGreaterThanOrEqual(899)
})

test('a finished game shows its result even without a local player', async ({ page }) => {
  await page.route('**/src/main.ts*', async (route) => {
    const response = await route.fetch()
    const source = await response.text()
    await route.fulfill({
      response,
      body: `${source}
window.rabbitersFinishWithoutPlayer = () => { game.state.players = []; game.state.phase = 'won'; };`
    })
  })
  await page.goto('/')
  await page.locator('#solo').click()
  await page.evaluate(() =>
    (window as unknown as { rabbitersFinishWithoutPlayer: () => void }).rabbitersFinishWithoutPlayer()
  )
  await expect(page.locator('#result-title')).toHaveText('新しい命が生まれました')
  await expect(page.locator('#result')).toBeVisible()
})

for (const viewport of [
  { width: 390, height: 844 },
  { width: 844, height: 390 }
]) {
  test(`touch controls fit ${viewport.width}×${viewport.height}`, async ({ browser }) => {
    const context = await browser.newContext({ viewport, isMobile: true, hasTouch: true })
    const page = await context.newPage()
    await page.goto('/')
    await page.locator('#solo').click()
    await expect(page.locator('#joystick')).toBeVisible()
    await expect(page.locator('#touch-jump')).toBeVisible()
    await expect(page.locator('.key-guide')).toBeHidden()
    for (const selector of ['#joystick', '#touch-jump', '#touch-interact']) {
      const box = await page.locator(selector).boundingBox()
      expect(box).not.toBeNull()
      expect(box!.x).toBeGreaterThanOrEqual(0)
      expect(box!.y).toBeGreaterThanOrEqual(0)
      expect(box!.x + box!.width).toBeLessThanOrEqual(viewport.width)
      expect(box!.y + box!.height).toBeLessThanOrEqual(viewport.height)
    }
    const joystick = (await page.locator('#joystick').boundingBox())!
    const center = { x: joystick.x + joystick.width / 2, y: joystick.y + joystick.height / 2 }
    const client = await context.newCDPSession(page)
    await client.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ ...center, id: 1 }] })
    await client.send('Input.dispatchTouchEvent', {
      type: 'touchMove',
      touchPoints: [{ x: center.x + 30, y: center.y - 30, id: 1 }]
    })
    await page.waitForTimeout(1200)
    await client.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] })
    await expect(page.locator('#objective-text')).toContainText('1 / 6')
    await page.locator('#touch-jump').tap()
    await context.close()
  })
}

test('loads the release SDK WebAssembly before attempting a relay connection', async ({ page }) => {
  let signature = ''
  page.on('response', (response) => {
    if (/\.wasm(?:\?|$)/.test(response.url()) && response.ok())
      void response.body().then((body) => {
        signature = body.subarray(0, 4).toString('hex')
      })
  })
  await page.goto('/')
  await page.locator('#relay').fill('https://127.0.0.1:9')
  await page.locator('#room').fill('test-room')
  await page.locator('#host').click()
  await expect.poll(() => signature, { timeout: 15_000 }).toBe('0061736d')
})

test('relay disconnection pauses the session and offers a way back', async ({ page }) => {
  await page.route('**/node_modules/moq-wasm/dist/core/index.js*', (route) =>
    route.fulfill({
      contentType: 'text/javascript',
      body: `
        export class MoqSession {
          static async connect() {
            let closeSession, closeSubscriber, closeWatch
            const closed = new Promise(resolve => { closeSession = resolve })
            window.disconnectRabbitersTestRelay = () => closeSession({ reason: 'test disconnect' })
            return {
              closed,
              close() { closeSession({}); closeSubscriber?.(false); closeWatch?.({ done: true }) },
              async publishTrack() {
                return {
                  nextSubscriber: () => new Promise(resolve => { closeSubscriber = resolve }),
                  writeGroup: async () => 0n,
                  free() {}
                }
              },
              async announce() { return { close: async () => {}, free() {} } },
              async watchNamespaces() {
                return {
                  [Symbol.asyncIterator]() { return { next: () => new Promise(resolve => { closeWatch = resolve }) } },
                  async close() { closeWatch?.({ done: true }) }
                }
              }
            }
          }
        }
      `
    })
  )
  await page.goto('/')
  await page.locator('#relay').fill('https://relay.test')
  await page.locator('#room').fill('test-room')
  await page.locator('#host').click()
  await expect(page.locator('#hud')).toBeVisible()
  await page.evaluate(() =>
    (window as unknown as { disconnectRabbitersTestRelay: () => void }).disconnectRabbitersTestRelay()
  )
  await expect(page.locator('#result-title')).toHaveText('通信が切断されました')
  await expect(page.locator('#result-text')).toContainText('Relay disconnected')
  await page.waitForTimeout(400)
  await expect(page.locator('#result-text')).not.toContainText('Network is not ready')
  await page.locator('#restart').click()
  await expect(page.locator('#start-panel')).toBeVisible()
})

test('desktop: pointer lock rotates the view without holding a button', async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 })
  await page.route('**/src/main.ts*', async (route) => {
    const response = await route.fetch()
    await route.fulfill({ response, body: `${await response.text()}\nwindow.__yaw = () => yaw` })
  })
  await page.addInitScript(() => {
    let lockedEl: Element | null = null
    Object.defineProperty(document, 'pointerLockElement', { get: () => lockedEl })
    Element.prototype.requestPointerLock = function () {
      lockedEl = this
      document.dispatchEvent(new Event('pointerlockchange'))
    }
  })
  await page.goto('/')
  await page.locator('#solo').click()
  await expect(page.locator('#look-hint')).toContainText('クリックで視点操作')
  const yaw = () => page.evaluate(() => (window as unknown as { __yaw: () => number }).__yaw())
  const before = await yaw()
  await page.mouse.click(700, 450)
  await expect(page.locator('#look-hint')).toContainText('視点操作中')
  // movementX is dispatched by the real browser; synthesize it since headless mouse moves lack it.
  await page.evaluate(() =>
    document
      .querySelector('#world')!
      .dispatchEvent(new PointerEvent('pointermove', { pointerType: 'mouse', movementX: 100 } as PointerEventInit))
  )
  await expect.poll(yaw).not.toBeCloseTo(before, 1)
})
