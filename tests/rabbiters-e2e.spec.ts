import { expect, test } from '@playwright/test'
import { CAVES, LOGS, TUNNEL_NODES } from '../examples/games/rabbiters/src/map'

for (const legacy of ['before-food-kinds', 'before-stealth']) {
  test(`a guest moves with a ${legacy} host snapshot`, async ({ page }) => {
    await page.addInitScript((version) => {
      ;(window as unknown as { rabbitersLegacyHost: string }).rabbitersLegacyHost = version
    }, legacy)
    await page.route('**/src/network.ts*', (route) =>
      route.fulfill({
        contentType: 'text/javascript',
        body: `
          import { Game } from '/src/game.ts';
          export const MAX_PLAYERS = 16;
          export class CooperativeNetwork {
            constructor(options) { this.options = options; this.playerId = options.playerId; }
            async start() {
              this.game = new Game();
              this.game.addPlayer('host', 'Host');
              this.game.addPlayer(this.playerId, 'Guest');
              this.timer = setInterval(() => {
                this.game.step(0.1);
                const state = structuredClone(this.game.state);
                delete state.droppings;
                for (const player of state.players) delete player.bath;
                for (const predator of state.predators) { delete predator.suspicion; predator.state = 'alert'; }
                if (window.rabbitersLegacyHost === 'before-food-kinds')
                  for (const food of state.foods) delete food.kind;
                this.options.onSnapshot(state);
              }, 100);
              this.options.onStatus('ready', 'Connected');
            }
            async sendInput(input) { this.game.setInput(this.playerId, input); }
            async stop() { clearInterval(this.timer); }
          }
        `
      })
    )
    await page.route('**/src/main.ts*', async (route) => {
      const response = await route.fetch()
      await route.fulfill({
        response,
        body: `${await response.text()}
window.rabbitersLegacyState = () => {
  const player = snapshot?.players.find((entry) => entry.id === localId);
  const actor = scene.actors.get('player:' + localId);
  return player && actor ? { confirmed: player.x, shown: actor.root.position.x,
    bath: player.bath, predator: snapshot.predators[0].state, suspicion: snapshot.predators[0].suspicion,
    kind: snapshot.foods[0].kind, droppings: snapshot.droppings.length } : null;
};
window.rabbitersInvalidSnapshots = () => {
  const invalid = [
    { ...snapshot, players: [{ ...snapshot.players[0], bath: null }] },
    { ...snapshot, predators: [{ ...snapshot.predators[0], suspicion: 2 }] },
    { ...snapshot, foods: [{ ...snapshot.foods[0], kind: null }] },
    { ...snapshot, droppings: null },
    { ...snapshot, predators: [{ ...snapshot.predators[0], state: 'invalid', stealthState: 'search' }] },
    { ...snapshot, predators: [{ ...snapshot.predators[0], state: 'patrol', stealthState: 'invalid' }] }
  ];
  return invalid.map((state) => Boolean(readSnapshot(state)));
};`
      })
    })
    await page.goto('/')
    await page.locator('#together').click()
    await page.locator('#room').fill('legacy-test')
    await page.locator('#join').click()
    const state = () =>
      page.evaluate(() =>
        (
          window as unknown as {
            rabbitersLegacyState: () => {
              confirmed: number
              shown: number
              bath: number
              predator: string
              suspicion: number
              kind: string
              droppings: number
            } | null
          }
        ).rabbitersLegacyState()
      )
    await expect.poll(state, { timeout: 5000 }).not.toBeNull()
    await page.keyboard.down('KeyD')
    await expect.poll(async () => (await state())?.confirmed).toBeGreaterThan(-117)
    await page.keyboard.up('KeyD')
    const current = await state()
    expect(current!.shown).toBeGreaterThan(-117.5)
    expect(current).toMatchObject({ bath: 0, predator: 'search', suspicion: 0, droppings: 0 })
    if (legacy === 'before-food-kinds') expect(current!.kind).toBe('carrot')
    expect(
      await page.evaluate(() =>
        (window as unknown as { rabbitersInvalidSnapshots: () => boolean[] }).rabbitersInvalidSnapshots()
      )
    ).toEqual([false, false, false, false, false, false])
  })
}

test('host predator updates remain readable by older guests', async ({ page }) => {
  await page.route('**/src/network.ts*', (route) =>
    route.fulfill({
      contentType: 'text/javascript',
      body: `
        export const MAX_PLAYERS = 16;
        export class CooperativeNetwork {
          constructor(options) { this.options = options; this.playerId = options.playerId; }
          async start() { this.options.onStatus('ready', 'Connected'); }
          async broadcastSnapshot(state) { window.rabbitersWireSnapshot = structuredClone(state); }
          async stop() {}
        }
      `
    })
  )
  await page.route('**/src/main.ts*', async (route) => {
    const response = await route.fetch()
    await route.fulfill({
      response,
      body: `${await response.text()}
window.rabbitersSetPredator = (state) => { game.state.predators[0].state = state; game.step = () => {}; };
window.rabbitersWirePredator = () => {
  const state = window.rabbitersWireSnapshot;
  return state ? { wire: state.predators[0].state, behavior: readSnapshot(state)?.predators[0].state,
    legacyAccepts: state.predators.every((predator) => ['patrol', 'alert', 'chase'].includes(predator.state)),
    currentAccepts: state.predators.every((predator) => ['patrol', 'search', 'suspicious', 'chase'].includes(predator.state)) } : null;
};`
    })
  })
  await page.goto('/')
  await page.locator('#together').click()
  await page.locator('#room').fill('legacy-test')
  await page.locator('#host').click()
  await expect(page.locator('#hud')).toBeVisible()
  for (const behavior of ['search', 'suspicious']) {
    await page.evaluate(
      (value) => (window as unknown as { rabbitersSetPredator: (value: string) => void }).rabbitersSetPredator(value),
      behavior
    )
    await expect
      .poll(() =>
        page.evaluate(() =>
          (
            window as unknown as {
              rabbitersWirePredator: () => {
                wire: string
                behavior: string
                legacyAccepts: boolean
                currentAccepts: boolean
              } | null
            }
          ).rabbitersWirePredator()
        )
      )
      .toEqual({ wire: 'patrol', behavior, legacyAccepts: true, currentAccepts: true })
  }
})

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
window.rabbitersSuspectGuest = () => {
  const step = game.step.bind(game);
  game.step = (seconds) => {
    step(seconds);
    const guest = game.state.players.find((player) => player.id !== localId);
    if (guest && game.state.predators[0]) Object.assign(game.state.predators[0],
      { state: 'suspicious', suspicion: 0.6, targetId: guest.id });
  };
};
window.rabbitersPredatorCue = () => {
  const predator = snapshot?.predators[0];
  const marker = scene.actors.get('predator:' + predator?.id)?.marker;
  return predator ? { state: predator.state,
    marker: marker?.symbol.visible ? [...scene.textures].find(([, texture]) => texture === marker.symbol.material.map)?.[0] : null,
    meter: marker?.meter.visible && marker?.fill.visible,
    overlay: alertOverlay.classList.contains('suspected'),
    condition: document.querySelector('#condition')?.textContent } : null;
};
window.rabbitersSetPreviewTime = (time) => { preview.state.time = time; };`
    })
  })
  const host = await context.newPage()
  const guest = await context.newPage()
  await host.goto('/?chapter=4')
  await host.locator('#together').click()
  await host.locator('#room').fill('latency-test')
  await host.locator('#host').click()
  await guest.goto('/')
  await guest.evaluate(() => {
    ;(window as unknown as { rabbitersHoldSnapshots: boolean }).rabbitersHoldSnapshots = true
  })
  await guest.locator('#together').click()
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
  await expect.poll(async () => (await position())!.confirmed, { timeout: 10_000 }).toBeGreaterThan(-117.5)
  await host.evaluate(() => (window as unknown as { rabbitersSuspectGuest: () => void }).rabbitersSuspectGuest())
  await expect
    .poll(
      () =>
        guest.evaluate(() =>
          (
            window as unknown as {
              rabbitersPredatorCue: () => {
                state: string
                marker: string | null
                meter: boolean
                overlay: boolean
                condition: string
              } | null
            }
          ).rabbitersPredatorCue()
        ),
      { timeout: 10_000 }
    )
    .toEqual({
      state: 'suspicious',
      marker: '?#e0a020',
      meter: true,
      overlay: true,
      condition: '怪しまれている… 今のうちに隠れよう'
    })
  await context.close()
})

test('desktop: starts a solo game and collects food by moving', async ({ page }) => {
  const errors: string[] = []
  page.on('pageerror', (error) => errors.push(error.message))
  await page.setViewportSize({ width: 1440, height: 900 })
  await page.goto('/?chapter=4')
  await expect(page.locator('#relay')).toHaveCount(0)
  await expect(page.locator('#room')).toBeHidden()
  await expect(page.locator('#world canvas')).toBeVisible()
  await page.locator('#solo').click()
  await expect(page.locator('#hud')).toBeVisible()
  await page.keyboard.down('KeyW')
  await page.keyboard.down('KeyD')
  await page.waitForTimeout(1100)
  await page.keyboard.up('KeyW')
  await page.keyboard.up('KeyD')
  await expect(page.locator('#food-count')).toHaveText('1 / 6')
  await page.locator('#help-open').click()
  await expect(page.locator('#help')).toBeVisible()
  await page.locator('#help-done').click()
  await expect(page.locator('#help')).toBeHidden()
  expect(errors).toEqual([])
})

test('desktop: TPS controls, airborne pose, and sound toggle', async ({ page }) => {
  test.setTimeout(60_000)
  await page.route('**/src/main.ts*', async (route) => {
    const response = await route.fetch()
    const source = await response.text()
    await route.fulfill({
      response,
      body: `${source}
import * as observeMap from '/src/map.ts';
window.rabbitersObserve = () => {
  const player = game?.state.players.find((entry) => entry.id === localId);
  const actor = scene.actors.get('player:' + localId);
  if (!player || !actor) return null;
  return { x: player.x, y: player.y, z: player.z, yaw, lift: player.y - observeMap.floorAt(player.x, player.y, player.z),
    legs: actor.limbs.map((leg) => leg.rotation.x), body: actor.body.rotation.x,
    camera: { x: scene.camera.position.x, y: scene.camera.position.y, z: scene.camera.position.z },
    audioState: audio.context?.state, gain: audio.master?.gain.value };
};`
    })
  })
  await page.setViewportSize({ width: 1440, height: 900 })
  await page.goto('/?chapter=4')
  await page.locator('#solo').click()
  type Observation = {
    x: number
    y: number
    z: number
    yaw: number
    lift: number
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
  // Height above the ground, not absolute: after landing the rabbit walks on, possibly up a slope.
  const airborne = frames.filter((frame) => frame.lift > 0.15)
  expect(airborne.length).toBeGreaterThan(3)
  expect(Math.max(...airborne.map((frame) => frame.lift))).toBeGreaterThan(0.6)
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

test('solo: grows, carries bedding, gives birth and leads the kits through four seasons', async ({ page }) => {
  test.setTimeout(75_000)
  await page.route('**/src/main.ts*', async (route) => {
    const response = await route.fetch()
    const source = await response.text()
    await route.fulfill({
      response,
      body: `${source}
window.rabbitersTestState = () => JSON.parse(JSON.stringify(game?.state ?? null));
import { heightAt as testHeight } from '/src/map.ts';
window.rabbitersTestPlace = (x, z, patch = {}) => Object.assign(game.state.players[0], { x, z, y: testHeight(x, z) }, patch);
window.rabbitersTestPatch = (patch) => Object.assign(game.state, patch);
window.rabbitersTestKitsTo = (x, z) => game.state.kits.forEach((kit) => Object.assign(kit, { x, z, y: testHeight(x, z) }));
window.rabbitersTestActors = () => [...scene.actors.keys()];
window.rabbitersTestPile = () => scene.beddingPile.children.filter((bundle) => bundle.visible).length;
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
  type State = {
    phase: string
    chapter: number
    bedding: number
    time: number
    players: { x: number; z: number; foodEaten: number; hunger: number; carrying: string | null }[]
    foods: { x: number; y: number; z: number; active: boolean }[]
    straws: { id: string; x: number; z: number; active: boolean }[]
    kits: { status: string }[]
    predators: { x: number; z: number }[]
  }
  type Hooks = {
    rabbitersTestState: () => State
    rabbitersTestPlace: (x: number, z: number, patch?: object) => void
    rabbitersTestPatch: (patch: object) => void
    rabbitersTestKitsTo: (x: number, z: number) => void
    rabbitersTestActors: () => string[]
    rabbitersTestPile: () => number
    rabbitersTestAccelerate: () => void
    rabbitersFastForward: boolean
  }
  const state = () => page.evaluate(() => (window as unknown as Hooks).rabbitersTestState())
  await page.goto('/?chapter=4')
  await page.locator('#solo').click()
  await expect(page.locator('#objective-title')).toContainText('春｜')
  await expect(page.locator('#chapter-banner')).toBeVisible()
  // Spring: a keyboard-driven bot eats nearby food, then rests in the burrow while growing fast-forwards.
  await page.evaluate(() => {
    const hooks = window as unknown as Hooks
    hooks.rabbitersTestAccelerate()
    const pressed = new Set<string>()
    const tick = () => {
      const state = hooks.rabbitersTestState()
      if (!state || state.chapter > 0) {
        hooks.rabbitersFastForward = false
        for (const key of pressed) window.dispatchEvent(new KeyboardEvent('keyup', { code: key }))
        return
      }
      const player = state.players[0]
      const foods = state.foods.filter((food) => food.active && food.y === 0 && Math.hypot(food.x + 118, food.z) < 18)
      const distance = (point: { x: number; z: number }) => Math.hypot(point.x - player.x, point.z - player.z)
      const target =
        player.foodEaten < 6 && foods.length
          ? foods.sort((first, second) => distance(first) - distance(second))[0]
          : { x: -118, z: -3.4 } // inside the burrow mound
      const dx = target.x - player.x
      const dz = target.z - player.z
      const desired = new Set([
        ...(dx > 0.6 ? ['KeyD'] : dx < -0.6 ? ['KeyA'] : []),
        ...(dz > 0.6 ? ['KeyS'] : dz < -0.6 ? ['KeyW'] : []),
        ...(distance(target) > 5 ? ['ShiftLeft'] : [])
      ])
      hooks.rabbitersFastForward = target.x === -118 && Math.abs(dx) < 0.6 && Math.abs(dz) < 0.6
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
  // Summer: bedding is picked up on contact and counted when brought home.
  await expect(page.locator('#objective-title')).toContainText('夏｜', { timeout: 45_000 })
  await expect(page.locator('#chapter-season')).toHaveText('夏')
  expect((await state()).players[0].foodEaten).toBeGreaterThanOrEqual(6)
  // The scripted part runs without predators: a hit would (correctly) knock the bundle loose.
  await page.evaluate(() => (window as unknown as Hooks).rabbitersTestPatch({ predators: [] }))
  const straw = (await state()).straws[0]
  await page.evaluate(
    ([x, z]) => (window as unknown as Hooks).rabbitersTestPlace(x, z, { hunger: 100 }),
    [straw.x, straw.z]
  )
  await expect(page.locator('#hint')).toContainText('巣材を巣穴へ')
  expect((await state()).players[0].carrying).toBe(straw.id)
  await page.evaluate(() => (window as unknown as Hooks).rabbitersTestPlace(-118, -1))
  await expect(page.locator('#objective-progress')).toHaveText('巣材 1 / 6')
  expect(await page.evaluate(() => (window as unknown as Hooks).rabbitersTestPile())).toBe(1)
  // Losing mid-campaign offers a retry from the start of the current season.
  await page.evaluate(() => (window as unknown as Hooks).rabbitersTestPlace(-122, -16, { health: 0.01, hunger: 0 }))
  await expect(page.locator('#retry-season')).toHaveText('夏からやり直す')
  await page.locator('#retry-season').click()
  await expect(page.locator('#result')).toBeHidden()
  await expect(page.locator('#objective-title')).toContainText('夏｜')
  expect((await state()).players[0].health).toBe(100)
  // Autumn: finishing the bedding lets a fed adult conceive; birth starts winter with kits on the field.
  await page.evaluate(() => (window as unknown as Hooks).rabbitersTestPatch({ bedding: 6, chapter: 2 }))
  await expect(page.locator('#chapter-season')).toHaveText('秋')
  await expect(page.locator('#objective-progress')).toContainText('出産まで')
  await page.evaluate(() => (window as unknown as Hooks).rabbitersTestPlace(-118, 0, { pregnancy: 0.9999 }))
  await expect(page.locator('#chapter-season')).toHaveText('冬')
  await expect(page.locator('#objective-progress')).toHaveText('到着 0 / 3羽')
  expect(
    (await page.evaluate(() => (window as unknown as Hooks).rabbitersTestActors())).filter((key) =>
      key.startsWith('kit:')
    )
  ).toHaveLength(3)
  // Winter: kits that reach the haven win the campaign.
  await page.evaluate(() => {
    const hooks = window as unknown as Hooks
    // The Big Oak hollow across the stream.
    hooks.rabbitersTestPlace(0, -8)
    hooks.rabbitersTestKitsTo(1, -8)
  })
  await expect(page.locator('#result')).toBeVisible()
  await expect(page.locator('#result-title')).toHaveText('新しい命が生まれました')
  await expect(page.locator('#result-text')).toContainText('3羽の子ウサギ')
  expect((await state()).kits.every((kit) => kit.status === 'safe')).toBe(true)
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
  await page.goto('/?chapter=4')
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
  test(`touch controls fit ${viewport.width}×${viewport.height}`, async ({ browser }, testInfo) => {
    const context = await browser.newContext({ viewport, isMobile: true, hasTouch: true })
    const page = await context.newPage()
    await page.goto('/?chapter=4')
    await page.locator('#solo').click()
    await expect(page.locator('#joystick')).toBeVisible()
    await expect(page.locator('#touch-jump')).toBeVisible()
    for (const selector of ['#joystick', '#touch-jump', '#touch-interact']) {
      const box = await page.locator(selector).boundingBox()
      expect(box).not.toBeNull()
      expect(box!.x).toBeGreaterThanOrEqual(0)
      expect(box!.y).toBeGreaterThanOrEqual(0)
      expect(box!.x + box!.width).toBeLessThanOrEqual(viewport.width)
      expect(box!.y + box!.height).toBeLessThanOrEqual(viewport.height)
    }
    // The area label shares the screen with the vitals card and touch controls without covering them.
    const box = async (selector: string) => (await page.locator(selector).boundingBox())!
    const map = await box('.area-card')
    expect(map.x).toBeGreaterThanOrEqual(0)
    expect(map.x + map.width).toBeLessThanOrEqual(viewport.width)
    for (const selector of ['.vitals', '#joystick', '.touch-buttons']) {
      const other = await box(selector)
      const apart =
        map.x + map.width <= other.x ||
        other.x + other.width <= map.x ||
        map.y + map.height <= other.y ||
        other.y + other.height <= map.y
      expect(apart, `${selector} overlaps the area label`).toBe(true)
    }
    await page.screenshot({ path: testInfo.outputPath(`hud-${viewport.width}x${viewport.height}.png`) })
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
    await expect(page.locator('#food-count')).toHaveText('1 / 6')
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
  await page.goto('/?chapter=4&relayUrl=https://127.0.0.1:9')
  await page.locator('#together').click()
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
  await page.goto('/?chapter=4&relayUrl=https://relay.test')
  await page.locator('#together').click()
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
  await page.goto('/?chapter=4')
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

test('real patrol AI discovers the rabbit through normal browser frames', async ({ page }) => {
  test.setTimeout(120_000)
  const errors: string[] = []
  page.on('pageerror', (error) => errors.push(error.message))
  await page.route('**/src/main.ts*', async (route) => {
    const response = await route.fetch()
    await route.fulfill({
      response,
      body: `${await response.text()}
window.rabbitersDiscovery = {
  states: ['patrol'], alarms: 0, localSpots: 0, chaseFrames: 0,
  stage() {
    const player = game.state.players[0];
    Object.assign(player, { x: -125, z: 8, y: 0 });
    game.state.foods = [];
    game.state.nests.forEach((nest) => { nest.active = false; });
    game.state.predators = [{ id: 'discovery-fox', kind: 'fox', x: -125, z: -2,
      y: 0, angle: 0.6, state: 'patrol', targetId: null, suspicion: 0 }];
    const alarm = audio.alarm.bind(audio);
    audio.alarm = () => { this.alarms++; alarm(); };
    const emit = feel.emit.bind(feel);
    feel.emit = (event) => {
      if (event.type === 'spotted' && event.you) this.localSpots++;
      emit(event);
    };
    const render = scene.render.bind(scene);
    scene.render = (...args) => {
      const predator = game.state.predators[0];
      if (this.states.at(-1) !== predator.state) this.states.push(predator.state);
      if (predator.state === 'chase') this.chaseFrames++;
      render(...args);
    };
  },
  read() {
    const predator = game.state.predators[0];
    return { states: this.states, alarms: this.alarms, localSpots: this.localSpots,
      chaseFrames: this.chaseFrames, state: predator.state, suspicion: predator.suspicion,
      targetsLocal: predator.targetId === localId, audioState: audio.context?.state };
  }
};`
    })
  })
  await page.goto('/?chapter=4')
  await page.locator('#solo').click()
  await page.evaluate('window.rabbitersDiscovery.stage()')
  const read = () =>
    page.evaluate<{
      states: string[]
      alarms: number
      localSpots: number
      chaseFrames: number
      state: string
      suspicion: number
      targetsLocal: boolean
      audioState: string
    }>('window.rabbitersDiscovery.read()')
  await expect(page.locator('.fx-threat')).toHaveAttribute('data-mode', 'suspicious', { timeout: 30_000 })
  await expect(page.locator('.fx-threat')).toBeVisible()
  await expect(page.locator('#condition')).toContainText('怪しまれている')
  const suspicious = await read()
  expect(suspicious.state).toBe('suspicious')
  expect(suspicious.suspicion).toBeGreaterThan(0)
  expect(suspicious.suspicion).toBeLessThan(1)
  expect(suspicious.targetsLocal).toBe(true)
  expect(suspicious.alarms).toBe(0)
  expect(suspicious.localSpots).toBe(0)
  await expect(page.locator('.fx-threat')).toHaveAttribute('data-mode', 'chase', { timeout: 60_000 })
  await expect(page.locator('.fx-threat')).toBeVisible()
  await expect(page.locator('.fx-threat')).toContainText('1体が追跡中')
  await expect(page.locator('.fx-detection')).toHaveClass(/fx-on/)
  await expect(page.locator('#condition')).toContainText('見つかった')
  await expect.poll(async () => (await read()).chaseFrames).toBeGreaterThanOrEqual(3)
  expect(await read()).toMatchObject({
    states: ['patrol', 'suspicious', 'chase'],
    state: 'chase',
    targetsLocal: true,
    alarms: 1,
    localSpots: 1,
    audioState: 'running'
  })
  await expect(page.locator('#start-error')).toBeEmpty()
  expect(errors).toEqual([])
})

test('real predator AI warns when it retargets a suspicious rabbit', async ({ page }) => {
  test.setTimeout(60_000)
  const errors: string[] = []
  page.on('pageerror', (error) => errors.push(error.message))
  await page.route('**/src/main.ts*', async (route) => {
    const response = await route.fetch()
    await route.fulfill({
      response,
      body: `${await response.text()}
window.rabbitersRetarget = {
  queries: 0, cues: 0, states: ['patrol'],
  stage() {
    game.addPlayer('retarget-friend', 'Friend');
    const player = game.state.players.find((entry) => entry.id === localId);
    const friend = game.state.players.find((entry) => entry.id === 'retarget-friend');
    Object.assign(player, { x: -125, z: 8, y: 0 });
    Object.assign(friend, { x: -125, z: 7, y: 0 });
    game.state.foods = [];
    game.state.nests.forEach((nest) => { nest.active = false; });
    game.state.predators = [{ id: 'retarget-fox', kind: 'fox', x: -125, z: -2,
      y: 0, angle: 0.6, state: 'patrol', targetId: null, suspicion: 0 }];
    const tone = audio.tone.bind(audio);
    audio.tone = (...args) => {
      const before = audio.voices.size;
      tone(...args);
      if (args[0] === 494 && audio.voices.size > before) this.queries++;
    };
    const emit = feel.emit.bind(feel);
    feel.emit = (event) => { if (event.type === 'suspicious') this.cues++; emit(event); };
    const render = scene.render.bind(scene);
    scene.render = (...args) => {
      const state = game.state.predators[0].state;
      if (this.states.at(-1) !== state) this.states.push(state);
      render(...args);
    };
  },
  moveFriendAway() {
    Object.assign(game.state.players.find((entry) => entry.id === 'retarget-friend'), { x: -125, z: 23 });
  },
  read() {
    const predator = game.state.predators[0];
    return { state: predator.state, target: predator.targetId === localId ? 'local' : predator.targetId,
      queries: this.queries, cues: this.cues, states: this.states, audioState: audio.context?.state };
  }
};`
    })
  })
  await page.goto('/?chapter=4')
  await page.locator('#solo').click()
  await page.evaluate('window.rabbitersRetarget.stage()')
  const read = () =>
    page.evaluate<{
      state: string
      target: string
      queries: number
      cues: number
      states: string[]
      audioState: string
    }>('window.rabbitersRetarget.read()')
  await expect.poll(read).toMatchObject({ state: 'suspicious', target: 'retarget-friend', queries: 0, cues: 0 })
  await page.evaluate('window.rabbitersRetarget.moveFriendAway()')
  await expect.poll(read).toMatchObject({
    state: 'suspicious',
    target: 'local',
    queries: 1,
    cues: 1,
    states: ['patrol', 'suspicious'],
    audioState: 'running'
  })
  await expect(page.locator('.fx-threat')).toHaveAttribute('data-mode', 'suspicious')
  await expect(page.locator('.fx-popup[data-event="suspicious"]')).toBeVisible()
  await expect.poll(async () => (await read()).state).toBe('chase')
  expect(errors).toEqual([])
})

test('stealth: "?" then "!" cues, alert vignette and droppings', async ({ page }, testInfo) => {
  test.setTimeout(60_000)
  const errors: string[] = []
  page.on('pageerror', (error) => errors.push(error.message))
  await page.route('**/src/main.ts*', async (route) => {
    const response = await route.fetch()
    const source = await response.text()
    await route.fulfill({
      response,
      body: `${source}
window.rabbitersStealth = {
  stage(predators) {
    const player = game.state.players[0];
    Object.assign(player, { x: -125, z: 8, y: 0 });
    game.state.predators = predators.map((entry) => ({ y: 0, angle: 0, state: 'patrol', targetId: null, suspicion: 0, ...entry }));
  },
  move(id, values) { Object.assign(game.state.predators.find((entry) => entry.id === id), values); },
  drop(entries) { game.state.droppings.push(...entries); },
  advance(seconds) { const step = this.step ?? game.step.bind(game); for (let index = 0; index < seconds * 60; index++) step(1 / 60); },
  freeze() { this.step = game.step.bind(game); game.step = () => {}; },
  spot(id) { Object.assign(game.state.predators.find((entry) => entry.id === id), { x: -125, z: 5, state: 'chase', targetId: localId, suspicion: 1 }); },
  watchCues() {
    this.localSpots = 0;
    this.alarms = 0;
    const emit = feel.emit.bind(feel);
    feel.emit = (event) => { if (event.type === 'spotted' && event.you) this.localSpots++; emit(event); };
    const alarm = audio.alarm.bind(audio);
    audio.alarm = () => { this.alarms++; alarm(); };
  },
  cues() { return { localSpots: this.localSpots, alarms: this.alarms }; },
  startMeters() {
    this.meters = [audio, feel.sfx].map((engine) => {
      const analyser = engine.context.createAnalyser();
      const sink = engine.context.createGain();
      sink.gain.value = 0;
      engine.master.connect(analyser);
      analyser.connect(sink);
      sink.connect(engine.context.destination);
      return { analyser, sink, samples: new Float32Array(analyser.fftSize), peak: 0 };
    });
    this.meterTimer = setInterval(() => {
      for (const meter of this.meters) {
        meter.analyser.getFloatTimeDomainData(meter.samples);
        for (const sample of meter.samples) meter.peak = Math.max(meter.peak, Math.abs(sample));
      }
    }, 20);
  },
  resetMeters() { for (const meter of this.meters) meter.peak = 0; },
  peaks() { return this.meters.map((meter) => meter.peak); },
  stopMeters() { clearInterval(this.meterTimer); for (const meter of this.meters) { meter.analyser.disconnect(); meter.sink.disconnect(); } },
  read(id) {
    const predator = game.state.predators.find((entry) => entry.id === id);
    const actor = scene.actors.get('predator:' + id);
    const symbol = actor?.marker?.symbol;
    return predator && {
      state: predator.state, suspicion: predator.suspicion, y: predator.y, renderedY: actor?.root.position.y,
      marker: symbol?.visible ? [...scene.textures].find(([, texture]) => texture === symbol.material.map)?.[0] : null,
      meter: actor?.marker.fill.visible ?? false, overlay: alertOverlay.className,
      droppings: game.state.droppings.length, renderedDroppings: scene.droppings.size,
      musicThreat: audio.previous?.threat, audioState: audio.context?.state
    };
  }
};`
    })
  })
  await page.setViewportSize({ width: 1280, height: 800 })
  await page.goto('/?chapter=4')
  await page.locator('#solo').click()
  type Reading = {
    state: string
    suspicion: number
    y: number
    renderedY: number
    marker: string | null
    meter: boolean
    overlay: string
    droppings: number
    renderedDroppings: number
    musicThreat: string
    audioState: string
  }
  const run = <T>(expression: string) => page.evaluate<T>(`window.rabbitersStealth.${expression}`)
  const read = (id = 'fox') => run<Reading>(`read(${JSON.stringify(id)})`)

  // Real droppings appear from the simulation itself (outside the den, which rabbits keep clean).
  await run(`stage(${JSON.stringify([{ id: 'predator-0', kind: 'fox', x: 40, z: -30 }])})`)
  await run('advance(13)')
  expect((await read('predator-0'))?.droppings ?? 0).toBeGreaterThan(0)

  await run(
    `stage(${JSON.stringify([
      { id: 'fox', kind: 'fox', x: -125, z: -0.5 },
      { id: 'hawk', kind: 'hawk', x: -137, y: 5, z: -19 }
    ])})`
  )
  // Step the simulation in-page so the meter does not depend on the frame rate.
  await run('freeze()')
  await run('advance(0.8)')
  let reading = await read()
  expect(reading.state).toBe('suspicious')
  expect(reading.suspicion).toBeGreaterThan(0.3)
  expect(reading.suspicion).toBeLessThan(1)
  const pellets = [0, 1, 2, 3].map((index) => ({
    id: `poo-test-${index}`,
    x: -124.2 + index * 0.5,
    y: 0,
    z: 9.2 - index * 1.6,
    t: 0
  }))
  await run(`drop(${JSON.stringify(pellets)})`)
  // Markers follow the next rendered frame and the overlay the next HUD tick, so wait for them.
  await expect.poll(async () => (await read()).marker).toBe('?#e0a020')
  await expect.poll(async () => (await read()).meter).toBe(true)
  await expect.poll(async () => (await read()).overlay).toContain('suspected')
  await expect(page.locator('.fx-threat')).toHaveAttribute('data-mode', 'suspicious')
  await expect(page.locator('#condition')).toContainText('怪しまれている')
  await expect.poll(async () => (await read()).renderedDroppings).toBeGreaterThanOrEqual(4)
  await page.screenshot({ path: testInfo.outputPath('stealth-question.png') })

  await run('watchCues()')
  await run('startMeters()')
  await run("spot('fox')")
  await expect.poll(async () => (await read()).marker).toBe('!#d8342c')
  await expect.poll(async () => (await read()).overlay).toContain('spotted')
  await expect.poll(async () => (await read()).audioState).toBe('running')
  await expect.poll(async () => (await read()).musicThreat).toBe('chase')
  await expect(page.locator('.fx-threat')).toHaveAttribute('data-mode', 'chase')
  await expect(page.locator('.fx-threat')).toContainText('1体')
  await expect.poll(async () => run('cues()')).toEqual({ localSpots: 1, alarms: 1 })
  await expect(page.locator('#condition')).toContainText('見つかった')
  await page.waitForTimeout(150)
  await page.screenshot({ path: testInfo.outputPath('stealth-spotted.png') })
  await expect.poll(async () => (await run<number[]>('peaks()'))[0]).toBeGreaterThan(0.001)
  await expect.poll(async () => (await run<number[]>('peaks()'))[1]).toBeGreaterThan(0.001)
  await page.locator('#sound-toggle').click()
  await expect(page.locator('#sound-toggle')).toHaveAttribute('aria-pressed', 'false')
  await page.waitForTimeout(150)
  await run('resetMeters()')
  await page.waitForTimeout(350)
  expect(await run<number[]>('peaks()')).toEqual([0, 0])
  await page.locator('#sound-toggle').click()
  await expect(page.locator('#sound-toggle')).toHaveAttribute('aria-pressed', 'true')

  await run("spot('hawk')")
  await expect(page.locator('.fx-threat')).toContainText('2体')
  expect(await run('cues()')).toEqual({ localSpots: 1, alarms: 1 })
  await run("move('fox', { state: 'search', targetId: null })")
  await expect(page.locator('.fx-threat')).toContainText('1体')
  await run("move('hawk', { state: 'search', targetId: null })")
  await expect(page.locator('.fx-threat')).toContainText('捜索')
  await expect.poll(async () => (await read()).musicThreat).not.toBe('calm')
  await page.screenshot({ path: testInfo.outputPath('stealth-search.png') })
  await run("move('fox', { state: 'patrol', targetId: null })")
  await expect(page.locator('.fx-threat')).toContainText('捜索')
  await run("move('hawk', { state: 'patrol', targetId: null })")
  await expect.poll(async () => (await read()).musicThreat).toBe('calm')
  await expect(page.locator('.fx-threat')).toContainText('ひと息')
  await expect(page.locator('.fx-threat')).toBeHidden({ timeout: 5000 })

  await run("move('fox', { state: 'chase', targetId: 'friend' })")
  await expect.poll(async () => run('cues()')).toEqual({ localSpots: 1, alarms: 2 })
  await run("spot('fox')")
  await expect.poll(async () => run('cues()')).toEqual({ localSpots: 2, alarms: 3 })
  await expect(page.locator('.fx-threat')).toHaveAttribute('data-mode', 'chase')
  await run('stopMeters()')

  expect(errors).toEqual([])
})

test('the discovery warning stays readable and nonblocking on mobile with reduced motion', async ({
  page
}, testInfo) => {
  await page.setViewportSize({ width: 390, height: 844 })
  await page.emulateMedia({ reducedMotion: 'reduce' })
  await page.route('**/src/main.ts*', async (route) => {
    const response = await route.fetch()
    await route.fulfill({
      response,
      body: `${await response.text()}
window.rabbitersMobileSpot = () => {
  game.step = () => {};
  const player = game.state.players.find((entry) => entry.id === localId);
  const predator = game.state.predators[0];
  Object.assign(predator, { state: 'patrol', targetId: null, suspicion: 0 });
  return () => Object.assign(predator, { x: player.x + 3, z: player.z, state: 'chase', targetId: localId, suspicion: 1 });
};`
    })
  })
  await page.goto('/?chapter=4')
  await page.locator('#solo').click()
  await page.evaluate(() => {
    const globals = window as unknown as { rabbitersMobileSpot: () => () => void; triggerSpot?: () => void }
    globals.triggerSpot = globals.rabbitersMobileSpot()
  })
  await page.waitForTimeout(150)
  await page.evaluate(() => (window as unknown as { triggerSpot: () => void }).triggerSpot())
  const warning = page.locator('.fx-threat')
  const detection = page.locator('.fx-detection')
  await expect(warning).toHaveAttribute('data-mode', 'chase')
  await expect(warning).toBeVisible()
  await expect(detection).toHaveClass(/fx-on/)
  await expect(detection).toHaveCSS('animation-name', 'fx-detection-fade')
  expect(
    await warning.evaluate((element) => {
      const bounds = element.getBoundingClientRect()
      return bounds.left >= 0 && bounds.right <= innerWidth && element.scrollWidth <= element.clientWidth
    })
  ).toBe(true)
  const warningBounds = await warning.boundingBox()
  const vitalsBounds = await page.locator('.vitals').boundingBox()
  expect(warningBounds).not.toBeNull()
  expect(vitalsBounds).not.toBeNull()
  expect(warningBounds!.x).toBeGreaterThanOrEqual(vitalsBounds!.x + vitalsBounds!.width)
  await expect(page.locator('.fx-layer')).toHaveCSS('pointer-events', 'none')
  await expect(page.locator('.fx-chase')).toHaveCSS('animation-name', 'none')
  await page.screenshot({ path: testInfo.outputPath('stealth-mobile-reduced-motion.png') })

  await page.setViewportSize({ width: 844, height: 390 })
  await page.evaluate(() => {
    const globals = window as unknown as { rabbitersMobileSpot: () => () => void; triggerSpot?: () => void }
    globals.triggerSpot = globals.rabbitersMobileSpot()
  })
  await expect(warning).toHaveAttribute('data-mode', 'clear')
  const escapePopup = page.locator('.fx-popup[data-event="escaped"]')
  await expect(escapePopup).toBeVisible()
  await page.evaluate(() => (window as unknown as { triggerSpot: () => void }).triggerSpot())
  await expect(detection).toHaveClass(/fx-on/)
  await expect(escapePopup).toBeHidden()
  expect(
    await detection.evaluate((element) => {
      const bounds = element.getBoundingClientRect()
      return bounds.left >= 0 && bounds.right <= innerWidth && bounds.top >= 0 && bounds.bottom <= innerHeight
    })
  ).toBe(true)
  await page.screenshot({ path: testInfo.outputPath('stealth-mobile-landscape.png') })
})

test('map tour: terrain, tunnels, logs and caves stay readable and cheap to draw', async ({ page }, testInfo) => {
  test.setTimeout(420_000) // software WebGL in CI renders the whole field at a few frames per second
  await page.route('**/src/main.ts*', async (route) => {
    const response = await route.fetch()
    await route.fulfill({
      response,
      body: `${await response.text()}
const tourMap = await import('./map.ts');
window.rabbitersTour = {
  map: tourMap,
  teleport(x, z, crouchHeight = 0) {
    const player = game.state.players.find((entry) => entry.id === localId);
    Object.assign(player, { x, z, y: tourMap.heightAt(x, z) + crouchHeight, health: 100, hunger: 100 });
  },
  look(radians) { const delta = radians - yaw; yaw = radians; scene.orbit(delta); },
  predators(list) { game.state.predators = list.map((entry, index) => ({ id: 'tour-' + index, y: tourMap.heightAt(entry.x, entry.z) + (entry.kind === 'hawk' ? 6 : 0), angle: 0, state: 'patrol', targetId: null, suspicion: 0, ...entry })); },
  info() {
    const player = game.state.players.find((entry) => entry.id === localId);
    const camera = scene.camera.position;
    return {
      x: player.x, y: player.y, z: player.z, hidden: player.hidden,
      underground: tourMap.isUnderground(player.x, player.y, player.z),
      camera: { x: camera.x, y: camera.y, z: camera.z, ground: tourMap.heightAt(camera.x, camera.z) },
      calls: scene.renderer.info.render.calls,
      condition: document.querySelector('#condition').textContent,
      area: document.querySelector('#area-name').textContent
    };
  }
};`
    })
  })
  await page.setViewportSize({ width: 960, height: 600 })
  const errors: string[] = []
  page.on('pageerror', (error) => errors.push(error.message))
  await page.goto('/?chapter=4')
  await page.locator('#solo').click()
  await expect(page.locator('#area-name')).toBeVisible()
  type Info = {
    x: number
    y: number
    z: number
    hidden: boolean
    underground: boolean
    camera: { x: number; y: number; z: number; ground: number }
    calls: number
    condition: string
    area: string
  }
  type Tour = {
    teleport: (x: number, z: number, lift?: number) => void
    look: (radians: number) => void
    predators: (list: { kind: string; x: number; z: number }[]) => void
    info: () => Info
  }
  const tour = <T>(run: (tour: Tour, ...args: number[]) => T, ...args: number[]) =>
    page.evaluate(
      ([source, values]) =>
        new Function('tour', '...args', `return (${source})(tour, ...args)`)(
          (window as unknown as { rabbitersTour: Tour }).rabbitersTour,
          ...values
        ),
      [run.toString(), args] as const
    ) as Promise<T>
  // Camera smoothing advances with frame time (capped at 0.1 s), so wait for enough frames and enough time.
  const settle = (frames = 8, ms = 1500) =>
    page.evaluate(
      ([count, wait]) =>
        new Promise<void>((resolve) => {
          const until = performance.now() + wait
          const tick = () => (--count <= 0 && performance.now() >= until ? resolve() : requestAnimationFrame(tick))
          requestAnimationFrame(tick)
        }),
      [frames, ms]
    )
  const visit = async (x: number, z: number, yaw: number) => {
    await tour((t, ...[px, pz, look]) => (t.teleport(px, pz), t.look(look)), x, z, yaw)
    await settle()
  }
  const shoot = async (name: string) => {
    await page.screenshot({ path: testInfo.outputPath(`${name}.png`) })
    const info = await tour((t) => t.info())
    if (!info.underground) expect(info.camera.y).toBeGreaterThan(info.camera.ground + 0.2)
    expect(info.calls).toBeLessThan(400)
    return info
  }
  await tour((t) => t.predators([]))

  await visit(-118, 0, -Math.PI / 2)
  const meadow = await shoot('01-home-meadow')
  expect(meadow.area).toBe('ふるさとの草原')

  await visit(0, 7, 0)
  expect((await shoot('02-big-oak-hill')).y).toBeGreaterThan(2)

  await visit(-8, -36, 0)
  await shoot('03-terraces-and-cliffs')

  await visit(2, -64, Math.PI)
  expect((await shoot('04-plateau-lookout')).y).toBeGreaterThan(8)

  await visit(-66, 19, -Math.PI / 2)
  await shoot('05-stream-ford')

  // The simulation is capped at 0.1 s per rendered frame, so hold keys until something happens.
  const holdUntil = async (keys: string[], done: (info: Info) => boolean) => {
    for (const key of keys) await page.keyboard.down(key)
    await expect.poll(async () => done(await tour((t) => t.info())), { timeout: 90_000 }).toBe(true)
    for (const key of keys) await page.keyboard.up(key)
    await settle()
  }

  // Dive into the meadow warren and crawl toward the junction under the stream.
  const [entry, , junction] = TUNNEL_NODES
  await visit(entry.x, entry.z, Math.atan2(entry.x - junction.x, entry.z - junction.z))
  await holdUntil(['KeyC'], (info) => info.underground)
  await holdUntil(['KeyW'], (info) => Math.hypot(info.x - entry.x, info.z - entry.z) > 5)
  const tunnel = await shoot('06-mole-tunnel')
  expect(tunnel.camera.y).toBeLessThan(tunnel.camera.ground - 0.4)
  expect(tunnel.area).toBe('モグラのトンネル')
  expect(tunnel.condition).toContain('モグラのトンネル')
  expect(Math.hypot(tunnel.camera.x - tunnel.x, tunnel.camera.z - tunnel.z)).toBeGreaterThan(1.5)
  // Looking across the narrow corridor must not fold the camera into the rabbit or the tunnel wall.
  await tour((t, ...[look]) => t.look(look), Math.atan2(entry.x - junction.x, entry.z - junction.z) + Math.PI / 2)
  await settle()
  const across = await tour((t) => t.info())
  expect(Math.hypot(across.camera.x - across.x, across.camera.z - across.z)).toBeGreaterThan(1.5)

  // Crawl in under a fallen log from its cut end while a wolf prowls nearby.
  const log = LOGS[0]
  const length = Math.hypot(log.bx - log.ax, log.bz - log.az)
  const along = { x: (log.bx - log.ax) / length, z: (log.bz - log.az) / length }
  await tour((t) => t.predators([{ kind: 'wolf', x: -2, z: 50 }]))
  await visit(log.bx + along.x * 2.6, log.bz + along.z * 2.6, Math.atan2(along.x, along.z))
  await page.keyboard.down('KeyC')
  await holdUntil(['KeyW'], (info) => Math.hypot(info.x - log.bx, info.z - log.bz) > 3)
  const under = await shoot('07-under-fallen-log')
  await page.keyboard.up('KeyC')
  expect(under.hidden).toBe(true)
  expect(under.condition).toContain('倒木の下')

  const cave = CAVES[0]
  await tour((t) => t.predators([{ kind: 'fox', x: 112, z: -12 }]))
  await visit(cave.x - 16, cave.z, -Math.PI / 2)
  await shoot('08-cave-entrance')
  await visit(cave.x - 4, cave.z, -Math.PI / 2)
  const inside = await shoot('09-inside-cave')
  expect(inside.hidden).toBe(true)
  expect(inside.area).toBe(cave.name)
  expect(inside.condition).toContain('洞窟の暗がり')

  await tour((t) => t.predators([]))
  await visit(96, 26, -Math.PI / 2)
  await shoot('10-red-rock-spire')
  await visit(12, 50, Math.PI)
  await shoot('11-fallen-log-forest')
  expect(errors).toEqual([])
})

test('teammates wear distinct collar colours in the scene and HUD', async ({ page }, testInfo) => {
  await page.route('**/src/main.ts*', async (route) => {
    const response = await route.fetch()
    const source = await response.text()
    await route.fulfill({
      response,
      body: `${source}
window.rabbitersAddTeammates = (count) => {
  game.state.predators = [];
  const local = game.state.players[0];
  for (let index = 0; index < count; index++) {
    game.addPlayer('mate' + index, '仲間 ' + index);
    const mate = game.state.players.at(-1);
    const side = index % 2 ? 1 : -1;
    Object.assign(mate, { x: local.x + side * (1.4 + Math.floor(index / 2) * 1.4), z: local.z + 0.4, hidden: false });
  }
  game.step = () => {};
  return game.state.players.map((player) => player.color);
};
window.rabbitersTurnTeam = () => game.state.players.forEach((player) => { player.angle = Math.PI; });`
    })
  })
  await page.goto('/?chapter=4')
  await page.locator('#solo').click()
  await expect(page.locator('#hud')).toBeVisible()
  await expect(page.locator('#player-color')).toHaveCSS('background-color', 'rgb(232, 69, 90)')
  await page.waitForTimeout(500)
  await page.screenshot({ path: testInfo.outputPath('solo-collar.png') })
  const colors = await page.evaluate(() =>
    (window as unknown as { rabbitersAddTeammates: (count: number) => number[] }).rabbitersAddTeammates(4)
  )
  expect(colors).toEqual([0, 1, 2, 3, 4])
  await page.waitForTimeout(500)
  await page.screenshot({ path: testInfo.outputPath('team-collars.png') })
  await page.evaluate(() => (window as unknown as { rabbitersTurnTeam: () => void }).rabbitersTurnTeam())
  await page.waitForTimeout(300)
  await page.screenshot({ path: testInfo.outputPath('team-collars-back.png') })
})
