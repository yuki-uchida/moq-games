import { expect, test } from '@playwright/test'

test('a guest hiding from a hunter sees escape and a warning on rediscovery', async ({ page }) => {
  await page.route('**/src/network.ts*', (route) =>
    route.fulfill({
      contentType: 'text/javascript',
      body: `export const MAX_PLAYERS = 16;
export class CooperativeNetwork {
  constructor(options) { this.options = options; }
  async start() {}
  async sendInput() {}
  async stop() {}
}`
    })
  )
  await page.route('**/src/main.ts*', async (route) => {
    const response = await route.fetch()
    await route.fulfill({
      response,
      body: `${await response.text()}
window.hideFromHunter = () => {
  const host = new Game(1);
  host.addPlayer(localId, 'Rabbit');
  host.addPlayer('friend', 'Friend');
  const [local, friend] = host.state.players;
  const fox = host.state.predators.find((predator) => predator.kind === 'fox');
  host.state.predators = [fox];
  host.state.nests.forEach((nest) => { nest.active = false; });
  Object.assign(local, { x: -125, y: mapTerrain.heightAt(-125, 8), z: 8, hidden: false, health: 100 });
  Object.assign(friend, { x: -90, y: mapTerrain.heightAt(-90, -7), z: -7, health: 100 });
  Object.assign(fox, { x: -125, y: mapTerrain.heightAt(-125, 5), z: 5, angle: 0,
    state: 'patrol', targetId: null });
  let alarms = 0, spots = 0, escapes = 0;
  const alarm = audio.alarm.bind(audio);
  audio.alarm = () => { alarms++; alarm(); };
  const emit = feel.emit.bind(feel);
  feel.emit = (event) => {
    if (event.type === 'spotted' && event.you) spots++;
    if (event.type === 'escaped') escapes++;
    emit(event);
  };
  const send = () => network.options.onSnapshot(JSON.parse(JSON.stringify(packSnapshot(host.state))));
  const read = () => ({ hidden: local.hidden, state: fox.state, target: fox.targetId,
    badge: document.querySelector('.fx-threat').textContent,
    chase: document.querySelector('.fx-chase').classList.contains('fx-active'),
    cover: document.querySelector('.fx-cover').classList.contains('fx-active'), alarms, spots, escapes });
  send();
  host.step(0.016); send();
  const found = read();
  Object.assign(local, { x: -105, y: mapTerrain.heightAt(-105, -12), z: -12 });
  Object.assign(friend, { x: fox.x, y: mapTerrain.heightAt(fox.x, fox.z + 2.5), z: fox.z + 2.5 });
  host.step(0.016); send();
  const brieflyHidden = read();
  for (let frame = 0; frame < 40; frame++) {
    Object.assign(friend, { x: fox.x + 2.5, y: mapTerrain.heightAt(fox.x + 2.5, fox.z), z: fox.z, health: 100 });
    host.step(0.016);
  }
  send();
  const hidden = read();
  Object.assign(local, { x: -125, y: mapTerrain.heightAt(-125, 8), z: 8 });
  Object.assign(friend, { x: -90, y: mapTerrain.heightAt(-90, -7), z: -7 });
  Object.assign(fox, { x: -125, y: mapTerrain.heightAt(-125, 5), z: 5, angle: 0 });
  host.step(0.016); send();
  return { found, brieflyHidden, hidden, rediscovered: read() };
};`
    })
  })
  await page.goto('/')
  await page.locator('#together').click()
  await page.locator('#room').fill('hide-from-hunter')
  await page.locator('#join').click()
  await expect(page.locator('#leave')).toBeVisible()
  const result = await page.evaluate(() => (window as unknown as { hideFromHunter(): any }).hideFromHunter())
  expect(result.found).toMatchObject({ state: 'chase', chase: true, alarms: 1, spots: 1, escapes: 0 })
  expect(result.brieflyHidden).toMatchObject({ hidden: true, target: 'friend', chase: true, alarms: 1, escapes: 0 })
  expect(result.hidden).toMatchObject({
    hidden: true,
    state: 'chase',
    target: 'friend',
    chase: false,
    cover: true,
    alarms: 1,
    spots: 1,
    escapes: 1
  })
  expect(result.rediscovered).toMatchObject({
    hidden: false,
    state: 'chase',
    chase: true,
    cover: false,
    alarms: 2,
    spots: 2,
    escapes: 1
  })
})

test('a hunter switching nearby rabbits only releases the warning after moving far away', async ({
  page
}, testInfo) => {
  test.setTimeout(45_000)
  const errors: string[] = []
  page.on('pageerror', (error) => errors.push(error.message))
  await page.route('**/src/main.ts*', async (route) => {
    const response = await route.fetch()
    await route.fulfill({
      response,
      body: `${await response.text()}
window.rabbitCoopPursuit = {
  alarms: 0, spots: 0, escaped: 0, cutIns: 0, switches: 0, firstTarget: null,
  start() {
    const alarm = audio.alarm.bind(audio);
    audio.alarm = () => {
      const previous = new Set(audio.voices);
      alarm();
      if ([...audio.voices].some((voice) => !previous.has(voice))) this.alarms++;
    };
    const emit = feel.emit.bind(feel);
    feel.emit = (event) => {
      if (event.type === 'spotted' && event.you) this.spots++;
      if (event.type === 'escaped') this.escaped++;
      emit(event);
    };
    document.querySelector('.fx-detection').addEventListener('animationstart', () => this.cutIns++);
    game.addPlayer('friend', 'Friend');
    game.state.nests.forEach((nest) => { nest.active = false; });
    const fox = game.state.predators.find((predator) => predator.kind === 'fox');
    game.state.predators = [fox];
    Object.assign(fox, { x: -88, z: -30, angle: 0, state: 'chase', targetId: localId, suspicion: 1 });
    const pursuitStartedAt = game.state.time;
    const place = () => {
      const wiggle = 0.15 * Math.sin((game.state.time - pursuitStartedAt) * 5 + 0.1);
      const ahead = (distance, side) => ({ x: fox.x + Math.sin(fox.angle) * distance + Math.cos(fox.angle) * side,
        z: fox.z + Math.cos(fox.angle) * distance - Math.sin(fox.angle) * side });
      const local = game.state.players.find((player) => player.id === localId);
      const friend = game.state.players.find((player) => player.id === 'friend');
      Object.assign(local, ahead(3.2 + wiggle, -0.7), { downed: false, health: 100 });
      Object.assign(friend, ahead(3.2 - wiggle, 0.7), { downed: false, health: 100 });
    };
    const step = game.step.bind(game);
    game.step = (dt) => {
      const target = fox.targetId;
      step(dt);
      place();
      this.firstTarget ??= fox.targetId;
      if (target && fox.targetId && target !== fox.targetId) this.switches++;
    };
    place();
    audio.update(game.state, localId);
    feel.update(game.state, localId);
  },
  separate() {
    game.step = () => {};
    const fox = game.state.predators[0];
    const local = game.state.players.find((player) => player.id === localId);
    const friend = game.state.players.find((player) => player.id === 'friend');
    Object.assign(fox, { x: local.x + 80, z: local.z, state: 'chase', targetId: 'friend' });
    Object.assign(friend, { x: fox.x, z: fox.z });
    game.state.time += 0.1;
  },
  read() { return { alarms: this.alarms, spots: this.spots, escaped: this.escaped,
    cutIns: this.cutIns, switches: this.switches, firstTarget: this.firstTarget,
    badge: document.querySelector('.fx-threat').textContent }; }
};`
    })
  })
  await page.goto('/?chapter=4')
  await page.locator('#solo').click()
  await expect(page.locator('#hud')).toBeVisible()
  await page.evaluate('window.rabbitCoopPursuit.start()')
  const read = () =>
    page.evaluate<{
      alarms: number
      spots: number
      escaped: number
      cutIns: number
      switches: number
      firstTarget: string | null
      badge: string
    }>('window.rabbitCoopPursuit.read()')
  await expect.poll(async () => (await read()).switches, { timeout: 20_000 }).toBeGreaterThanOrEqual(5)
  const result = await read()
  expect(result.firstTarget).toBe('friend')
  expect(result.alarms).toBe(1)
  expect(result.spots).toBe(1)
  expect(result.cutIns).toBe(1)
  expect(result.escaped).toBe(0)
  expect(result.badge).not.toContain('ひと息')
  await page.screenshot({ path: testInfo.outputPath('nearby-pursuit.png') })
  await page.evaluate('window.rabbitCoopPursuit.separate()')
  await expect.poll(async () => (await read()).escaped).toBe(1)
  await expect(page.locator('.fx-threat')).toContainText('ひと息')
  await page.screenshot({ path: testInfo.outputPath('distant-pursuit-release.png') })
  const afterSeparation = await read()
  expect(afterSeparation.alarms).toBe(1)
  expect(afterSeparation.spots).toBe(1)
  expect(afterSeparation.cutIns).toBe(1)
  expect(errors).toEqual([])
})

test('a guest still sees the discovery warning after being downed in the same step', async ({ page }) => {
  await page.route('**/src/network.ts*', (route) =>
    route.fulfill({
      contentType: 'text/javascript',
      body: `export const MAX_PLAYERS = 16;
export class CooperativeNetwork {
  constructor(options) { this.options = options; }
  async start() {}
  async sendInput() {}
  async stop() {}
}`
    })
  )
  await page.route('**/src/main.ts*', async (route) => {
    const response = await route.fetch()
    await route.fulfill({
      response,
      body: `${await response.text()}
window.downOnDiscovery = () => {
  const host = new Game(3, undefined, 0);
  host.addPlayer(localId, 'Rabbit');
  host.addPlayer('friend', 'Friend');
  Object.assign(host.state.players[0], { x: 0, y: 0, z: 0, health: 0.2 });
  Object.assign(host.state.players[1], { x: 20, y: 0, z: 20 });
  host.state.predators = [{ id: 'fox', kind: 'fox', x: 0, y: 0, z: -0.9,
    angle: 0, state: 'patrol', targetId: null, suspicion: 0 }];
  let alarms = 0, spots = 0;
  const alarm = audio.alarm.bind(audio);
  audio.alarm = () => { alarms++; alarm(); };
  const emit = feel.emit.bind(feel);
  feel.emit = (event) => { if (event.type === 'spotted' && event.you) spots++; emit(event); };
  const send = () => network.options.onSnapshot(JSON.parse(JSON.stringify(packSnapshot(host.state))));
  send();
  host.step(1 / 60);
  send();
  return { downed: host.state.players[0].downed, phase: host.state.phase,
    discoveries: host.state.discoveries.length, alarms, spots };
};`
    })
  })
  await page.goto('/')
  await page.locator('#together').click()
  await page.locator('#room').fill('down-on-discovery')
  await page.locator('#join').click()
  await expect(page.locator('#leave')).toBeVisible()
  const result = await page.evaluate(() => (window as unknown as { downOnDiscovery(): unknown }).downOnDiscovery())
  expect(result).toEqual({ downed: true, phase: 'playing', discoveries: 1, alarms: 1, spots: 1 })
  await page.waitForTimeout(250)
  await expect(page.locator('.fx-detection')).toHaveClass(/fx-on/)
  await expect(page.locator('.fx-threat')).toBeHidden()
  await expect(page.locator('.fx-detection')).not.toHaveClass(/fx-on/, { timeout: 10_000 })
})

for (const automatic of [false, true]) {
  test(`a fresh discovery sounds after ${automatic ? 'automatic' : 'requested'} audio resume`, async ({ page }) => {
    await page.route('**/src/network.ts*', (route) =>
      route.fulfill({
        contentType: 'text/javascript',
        body: `export const MAX_PLAYERS = 16;
export class CooperativeNetwork {
  constructor(options) { this.options = options; }
  async start() {}
  async sendInput() {}
  async stop() {}
}`
      })
    )
    await page.route('**/src/main.ts*', async (route) => {
      const response = await route.fetch()
      await route.fulfill({
        response,
        body: `${await response.text()}
window.discoveryDuringResume = async () => {
  scene.render = () => {};
  const context = audio.context;
  await context.suspend();
  audio.silence();
  const trace = [];
  const mark = (event) => trace.push({ event, wall: performance.now(), audio: context.currentTime, state: context.state });
  const analyser = context.createAnalyser();
  audio.master.connect(analyser);
  const samples = new Float32Array(analyser.fftSize);
  const createOscillator = context.createOscillator.bind(context);
  let voices = 0;
  context.createOscillator = () => { voices++; return createOscillator(); };
  const resume = context.resume.bind(context);
  let release;
  context.resume = () => new Promise((resolve, reject) => {
    release = () => resume().then(resolve, reject);
  });
  if (!${automatic}) audio.start();
  const host = new Game(3, undefined, 0);
  host.addPlayer(localId, 'Rabbit');
  host.state.time = 1;
  const send = () => network.options.onSnapshot(JSON.parse(JSON.stringify(packSnapshot(host.state))));
  send();
  host.state.time = 1.1;
  Object.assign(host.state.predators[0], { state: 'chase', targetId: localId });
  send();
  mark('discovered');
  const beforeResume = voices;
  await new Promise((resolve) => setTimeout(resolve, 100));
  mark('timer');
  host.state.time = 1.2;
  Object.assign(host.state.predators[0], { state: 'search', targetId: null });
  send();
  mark('resume-start');
  if (${automatic}) await resume();
  else await release();
  mark('resume-complete');
  await new Promise((resolve) => setTimeout(resolve, 80));
  analyser.getFloatTimeDomainData(samples);
  mark('sample');
  return { beforeResume, voices, state: context.state, signal: Math.max(...samples.map(Math.abs)), trace };
};`
      })
    })
    await page.goto('/')
    await page.locator('#together').click()
    await page.locator('#room').fill('resume-on-discovery')
    await page.locator('#join').click()
    await expect(page.locator('#leave')).toBeVisible()
    const result = await page.evaluate<{
      beforeResume: number
      voices: number
      state: string
      signal: number
      trace: unknown
    }>('window.discoveryDuringResume()')
    expect(result.beforeResume).toBe(0)
    expect(result.voices, JSON.stringify(result.trace)).toBe(4)
    expect(result.state).toBe('running')
    expect(result.signal).toBeGreaterThan(0.00001)
  })
}

for (const nextState of ['search', 'patrol']) {
  test(`a short chase into ${nextState} keeps the discovery sound and cut-in`, async ({ page }) => {
    const errors: string[] = []
    page.on('pageerror', (error) => errors.push(error.message))
    await page.route('**/src/network.ts*', (route) =>
      route.fulfill({
        contentType: 'text/javascript',
        body: `export const MAX_PLAYERS = 16;
export class CooperativeNetwork {
  constructor(options) { this.options = options; }
  async start() {}
  async sendInput() {}
  async stop() {}
}`
      })
    )
    await page.route('**/src/main.ts*', async (route) => {
      const response = await route.fetch()
      await route.fulfill({
        response,
        body: `${await response.text()}
window.shortChase = (nextState) => {
  scene.render = () => {};
  const host = new Game(3, undefined, 0);
  host.addPlayer(localId, 'Rabbit');
  host.state.predators = host.state.predators.filter((predator) => predator.id === 'mom');
  const predator = host.state.predators[0];
  Object.assign(predator, { state: 'patrol', targetId: null });
  host.state.time = 1;
  const send = () => network.options.onSnapshot(JSON.parse(JSON.stringify(packSnapshot(host.state))));
  send();
  const context = audio.context;
  const trace = [];
  const mark = (event) => trace.push({ event, wall: performance.now(), audio: context.currentTime, musicAfter: audio.musicAfter });
  const analyser = context.createAnalyser();
  audio.master.connect(analyser);
  const samples = new Float32Array(analyser.fftSize);
  let earlyStops = 0;
  const alarm = audio.alarm.bind(audio);
  audio.alarm = () => {
    alarm();
    for (const voice of audio.voices) {
      const stop = voice.stop.bind(voice);
      voice.stop = (...args) => { earlyStops++; return stop(...args); };
    }
  };
  const detection = document.querySelector('.fx-detection');
  const result = { audioState: context.state, earlyStops: -1, signal: 0, visible: false, trace,
    musicAfter: 0, originalMusicAfter: 0, startedAt: 0, endedAt: 0 };
  detection.addEventListener('animationstart', () => { result.startedAt = performance.now(); });
  detection.addEventListener('animationend', () => { result.endedAt = performance.now(); });
  host.state.time = 1.1;
  Object.assign(predator, { state: 'chase', targetId: localId });
  send();
  result.originalMusicAfter = audio.musicAfter;
  mark('discovered');
  setTimeout(() => {
    mark('transition-start');
    host.state.time = 1.2;
    Object.assign(predator, { state: nextState, targetId: null });
    send();
    mark('transition-complete');
  }, 100);
  setTimeout(() => {
    mark('sample');
    analyser.getFloatTimeDomainData(samples);
    result.signal = Math.max(...samples.map(Math.abs));
    result.earlyStops = earlyStops;
    result.visible = detection.classList.contains('fx-on') && Number(getComputedStyle(detection).opacity) > 0.8;
    result.musicAfter = audio.musicAfter;
  }, 350);
  return result;
};`
      })
    })
    await page.goto('/')
    await page.locator('#together').click()
    await page.locator('#room').fill('short-chase')
    await page.locator('#join').click()
    await expect(page.locator('#leave')).toBeVisible()
    await page.evaluate((state) => {
      const target = window as unknown as { shortChase(state: string): unknown; shortChaseResult: unknown }
      target.shortChaseResult = target.shortChase(state)
    }, nextState)
    const result = () =>
      page.evaluate<{
        audioState: string
        earlyStops: number
        signal: number
        visible: boolean
        musicAfter: number
        originalMusicAfter: number
        startedAt: number
        endedAt: number
        trace: unknown
      }>('window.shortChaseResult')
    await expect.poll(async () => (await result()).earlyStops).not.toBe(-1)
    const during = await result()
    expect(during.audioState).toBe('running')
    expect(during.earlyStops).toBe(0)
    expect(during.signal, JSON.stringify(during.trace)).toBeGreaterThan(0.00001)
    expect(during.visible).toBe(true)
    expect(during.musicAfter, JSON.stringify(during.trace)).toBe(during.originalMusicAfter)
    await expect.poll(async () => (await result()).endedAt).toBeGreaterThan(0)
    const after = await result()
    expect(after.endedAt - after.startedAt).toBeGreaterThan(1000)
    await expect(page.locator('.fx-detection')).not.toHaveClass(/fx-on/)
    expect(errors).toEqual([])
  })
}

test('received short-lived discovery survives validation and plays only once', async ({ page }) => {
  await page.route('**/src/network.ts*', (route) =>
    route.fulfill({
      contentType: 'text/javascript',
      body: `export const MAX_PLAYERS = 16;
export class CooperativeNetwork {
  constructor(options) { this.options = options; this.playerId = options.playerId; }
  async start() { window.receiveRabbiters = this.options.onSnapshot; }
  async sendInput() {}
  async stop() {}
}`
    })
  )
  await page.route('**/src/main.ts*', async (route) => {
    const response = await route.fetch()
    await route.fulfill({
      response,
      body: `${await response.text()}
window.testDiscovery = () => {
  const host = new Game(3, undefined, 0);
  host.addPlayer(localId, 'Rabbit');
  Object.assign(host.state.players[0], { x: 0, y: 0, z: 0 });
  host.state.predators = host.state.predators.filter(predator => predator.id === 'mom');
  Object.assign(host.state.predators[0], { x: 0, y: 0, z: -0.9, angle: 0, state: 'patrol' });
  let alarms = 0;
  audio.alarm = () => { alarms++; };
  const wire = () => JSON.parse(JSON.stringify(packSnapshot(host.state)));
  window.receiveRabbiters(wire());
  host.step(1/60);
  for (let index = 0; index < 12; index++) host.step(1/60);
  const received = wire();
  window.receiveRabbiters(received);
  window.receiveRabbiters(received);
  window.receiveRabbiters({ ...received, time: 0, discoveries: [] });
  window.receiveRabbiters(received);
  const invalid = [null, {}, [{ ...received.discoveries[0], count: -1 }],
    [received.discoveries[0], received.discoveries[0]]].map(discoveries => Boolean(readSnapshot({ ...received, discoveries })));
  const legacy = { ...received }; delete legacy.discoveries;
  const result = { alarms, invalid, legacy: Boolean(readSnapshot(legacy)),
    state: snapshot.predators[0].state, count: snapshot.discoveries[0].count,
    detectionShown: document.querySelector('.fx-detection').classList.contains('fx-on') };
  const forest = new Game(3, undefined, 3);
  forest.addPlayer(localId, 'Rabbit');
  forest.state.time = 10;
  const forestWire = packSnapshot(forest.state);
  const house = new Game(3, undefined, 0);
  house.addPlayer(localId, 'Rabbit');
  house.state.time = 5;
  window.receiveRabbiters(forestWire);
  window.receiveRabbiters(packSnapshot(house.state));
  return { ...result, acceptedStage: snapshot.stage, activeStage: activeStage() };
};`
    })
  })
  await page.goto('/')
  await page.locator('#together').click()
  await page.locator('#room').fill('discovery-test')
  await page.locator('#join').click()
  await expect(page.locator('#leave')).toBeVisible()
  const result = await page.evaluate(() => (window as unknown as { testDiscovery(): unknown }).testDiscovery())
  expect(result).toEqual({
    alarms: 1,
    invalid: [false, false, false, false],
    legacy: true,
    state: 'patrol',
    count: 1,
    detectionShown: true,
    acceptedStage: 3,
    activeStage: 3
  })
})
