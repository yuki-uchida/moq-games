import { expect, test } from '@playwright/test'

test('keeps suspicion visible while hiding under furniture', async ({ page }) => {
  await page.route('**/src/main.ts*', async (route) => {
    const response = await route.fetch()
    await route.fulfill({
      response,
      body: `${await response.text()}
import { heightAt as suspicionCoverHeight } from '/src/map.ts';
window.rabbitersSuspicionCoverProbe = {
  stage() {
    const step = game.step.bind(game);
    game.step = () => {};
    const state = game.state;
    const player = state.players.find((entry) => entry.id === localId);
    const predator = state.predators[0];
    state.predators = [predator];
    Object.assign(player, { x: 7, y: suspicionCoverHeight(7, 9), z: 9, health: 100 });
    Object.assign(predator, { kind: 'cat', x: 10, y: suspicionCoverHeight(10, 9), z: 9,
      angle: -Math.PI / 2, state: 'patrol', targetId: null, suspicion: 0 });
    game.setInput(localId, { moveX: 0, moveZ: 0, jump: false, sprint: false, crouch: true, interact: false });
    feel.reset(state, localId);
    spottedUntil = 0;
    alertOverlay.className = 'alert-overlay';
    document.querySelector('.fx-cover').style.transition = 'none';
    step(0.016);
    feel.update(state, localId);
    updateHud(state);
    return this.read();
  },
  clear() {
    Object.assign(game.state.predators[0], { state: 'patrol', targetId: null, suspicion: 0 });
    game.state.time += 0.016;
    feel.update(game.state, localId);
    updateHud(game.state);
    return this.read();
  },
  read() {
    const cover = document.querySelector('.fx-cover');
    return { hidden: game.state.players.find((entry) => entry.id === localId).hidden,
      state: game.state.predators[0].state, suspected: alertOverlay.classList.contains('suspected'),
      covered: alertOverlay.classList.contains('covered'), coverActive: cover.classList.contains('fx-active'),
      background: getComputedStyle(alertOverlay).backgroundImage, coverOpacity: getComputedStyle(cover).opacity };
  }
};`
    })
  })
  await page.goto('/?chapter=1')
  await page.locator('#solo').click()
  type CoverState = {
    hidden: boolean
    state: string
    suspected: boolean
    covered: boolean
    coverActive: boolean
    background: string
    coverOpacity: string
  }
  const suspected = await page.evaluate<CoverState>('window.rabbitersSuspicionCoverProbe.stage()')
  expect(suspected).toMatchObject({
    hidden: true,
    state: 'suspicious',
    suspected: true,
    covered: false,
    coverActive: true,
    coverOpacity: '0'
  })
  const clear = await page.evaluate<CoverState>('window.rabbitersSuspicionCoverProbe.clear()')
  expect(clear).toMatchObject({
    hidden: true,
    state: 'patrol',
    suspected: false,
    covered: true,
    coverActive: true,
    coverOpacity: '1'
  })
  expect(clear.background).not.toBe(suspected.background)
})

test('keeps the discovery warning ahead of cover feedback after a short chase', async ({ page }) => {
  await page.route('**/src/main.ts*', async (route) => {
    const response = await route.fetch()
    await route.fulfill({
      response,
      body: `${await response.text()}
import { heightAt as coverProbeHeight } from '/src/map.ts';
window.rabbitersCoverProbe = () => {
  const step = game.step.bind(game);
  game.step = () => {};
  const state = game.state;
  const player = state.players.find((entry) => entry.id === localId);
  const predator = state.predators.find((entry) => entry.kind === 'fox');
  state.predators = [predator];
  state.nests.forEach((nest) => { nest.active = false; });
  Object.assign(player, { x: -105, y: coverProbeHeight(-105, -12), z: -12, health: 100 });
  Object.assign(predator, { x: -105, y: coverProbeHeight(-105, -9.25), z: -9.25,
    angle: Math.PI, state: 'patrol', targetId: null, suspicion: 0 });
  game.setInput(localId, { moveX: 0, moveZ: 0, jump: false, sprint: false, crouch: false, interact: false });
  feel.reset(state, localId);
  wasChased = false;
  spottedUntil = 0;
  alertOverlay.className = 'alert-overlay';
  step(0.016);
  feel.update(state, localId);
  updateHud(state);
  const chase = { state: predator.state, background: getComputedStyle(alertOverlay).backgroundImage };
  game.setInput(localId, { moveX: 0, moveZ: 0, jump: false, sprint: false, crouch: true, interact: false });
  step(0.016);
  feel.update(state, localId);
  updateHud(state);
  const cover = document.querySelector('.fx-cover');
  return { chase, hidden: player.hidden, state: predator.state,
    spotted: alertOverlay.classList.contains('spotted'), covered: alertOverlay.classList.contains('covered'),
    background: getComputedStyle(alertOverlay).backgroundImage,
    coverOpacity: getComputedStyle(cover).opacity, coverTransition: getComputedStyle(cover).transitionDuration };
};`
    })
  })
  await page.goto('/?chapter=4')
  await page.locator('#solo').click()
  const result = await page.evaluate<{
    chase: { state: string; background: string }
    hidden: boolean
    state: string
    spotted: boolean
    covered: boolean
    background: string
    coverOpacity: string
    coverTransition: string
  }>('window.rabbitersCoverProbe()')
  expect(result.chase.state).toBe('chase')
  expect(result).toMatchObject({ hidden: true, state: 'search', spotted: true, covered: true, coverOpacity: '0' })
  expect(result.background).toBe(result.chase.background)
  expect(result.coverTransition).toBe('0s')
  await expect(page.locator('#alert-overlay')).not.toHaveClass(/spotted/)
  expect(
    await page.locator('#alert-overlay').evaluate((element) => getComputedStyle(element).backgroundImage)
  ).not.toBe(result.chase.background)
  await expect(page.locator('.fx-cover')).toHaveCSS('opacity', '1')
})

test('announces a discovery once until the local chase ends', async ({ page }) => {
  test.setTimeout(60_000)
  const errors: string[] = []
  page.on('pageerror', (error) => errors.push(error.message))
  await page.route('**/src/main.ts*', async (route) => {
    const response = await route.fetch()
    await route.fulfill({
      response,
      body: `${await response.text()}
window.rabbitersAnnouncementProbe = {
  updates: 0,
  stage() {
    game.step = () => {};
    const template = game.state.predators[0];
    game.state.predators = [0, 1].map((index) => ({ ...template, id: 'announcement-' + index, state: 'patrol', targetId: null }));
    const announcement = document.querySelector('#discovery-announcements');
    this.observer = new MutationObserver((records) => { this.updates += records.length; });
    this.observer.observe(announcement, { childList: true, subtree: true, characterData: true });
  },
  chase(count) {
    game.state.predators.forEach((predator, index) => Object.assign(predator,
      { state: index < count ? 'chase' : 'patrol', targetId: index < count ? localId : null }));
    game.state.time += 0.1;
  },
  read() { return { updates: this.updates, text: document.querySelector('#discovery-announcements').textContent }; }
};`
    })
  })
  await page.goto('/?chapter=4')
  await page.locator('#solo').click()
  await page.evaluate('window.rabbitersAnnouncementProbe.stage()')
  const chase = (count: number) => page.evaluate(`window.rabbitersAnnouncementProbe.chase(${count})`)
  const read = () => page.evaluate<{ updates: number; text: string }>('window.rabbitersAnnouncementProbe.read()')
  const threat = page.locator('.fx-threat')

  await chase(1)
  await expect(threat).toContainText('1体が追跡中')
  await expect.poll(read).toEqual({ updates: 1, text: '見つかった！' })
  await chase(2)
  await expect(threat).toContainText('2体が追跡中')
  expect(await read()).toEqual({ updates: 1, text: '見つかった！' })
  await chase(0)
  await expect(page.locator('#alert-overlay')).not.toHaveClass(/spotted/)
  await chase(1)
  await expect(threat).toContainText('1体が追跡中')
  await expect.poll(read).toEqual({ updates: 2, text: '見つかった！' })
  expect(errors).toEqual([])
})

for (const simultaneous of ['chapter', 'loss'] as const) {
  test(`a discovery remains announced with a simultaneous ${simultaneous}`, async ({ page }) => {
    const errors: string[] = []
    page.on('pageerror', (error) => errors.push(error.message))
    await page.route('**/src/main.ts*', async (route) => {
      const response = await route.fetch()
      await route.fulfill({
        response,
        body: `${await response.text()}
window.rabbitersConcurrentAnnouncement = {
  run(kind) {
    game.step = () => {};
    const state = game.state;
    state.predators = [];
    state.discoveries = [];
    updateStory(state);
    updateHud(state);
    feel.reset(state, localId);
    state.time += 0.1;
    state.discoveries = [{ predatorId: 'fox', targetId: localId, count: 1,
      time: state.time, x: 0, y: 0, z: 0 }];
    if (kind === 'loss') {
      state.players.find((player) => player.id === localId).downed = true;
      state.phase = 'lost';
    } else shownStage = -1;
    feel.update(state, localId);
    updateStory(state);
    updateHud(state);
    return {
      discovery: document.querySelector('#discovery-announcements').textContent,
      urgency: document.querySelector('#discovery-announcements').getAttribute('aria-live'),
      status: document.querySelector('#announcements').textContent,
      chapter: '第' + (state.stage + 1) + '章　' + STAGES[state.stage].title
    };
  }
};`
      })
    })
    await page.goto('/?chapter=4')
    await page.locator('#solo').click()
    const announcement = await page.evaluate<{
      discovery: string
      urgency: string
      status: string
      chapter: string
    }>(`window.rabbitersConcurrentAnnouncement.run('${simultaneous}')`)
    expect(announcement.discovery).toBe('見つかった！')
    expect(announcement.urgency).toBe('assertive')
    expect(announcement.status).toBe(simultaneous === 'loss' ? 'ゲームオーバー' : announcement.chapter)
    expect(errors).toEqual([])
  })
}

test('a guest triggers the warning when its first snapshot is already a local chase', async ({ page }) => {
  const errors: string[] = []
  page.on('pageerror', (error) => errors.push(error.message))
  await page.route('**/src/network.ts*', (route) =>
    route.fulfill({
      contentType: 'text/javascript',
      body: `
        export const MAX_PLAYERS = 16;
        export class CooperativeNetwork {
          constructor(options) { this.options = options; }
          async start() { this.options.onStatus('ready', 'Connected'); }
          async sendInput() {}
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
let alarmCount = 0;
let alarmVoices = 0;
const alarm = audio.alarm.bind(audio);
audio.alarm = () => { alarmCount++; alarm(); alarmVoices = audio.voices.size; };
window.rabbitersFirstChase = {
  capture() {
    this.peak = 0;
    this.analyser = audio.context.createAnalyser();
    this.sink = audio.context.createGain();
    this.sink.gain.value = 0;
    audio.master.connect(this.analyser);
    this.analyser.connect(this.sink);
    this.sink.connect(audio.context.destination);
    const samples = new Float32Array(this.analyser.fftSize);
    this.timer = setInterval(() => {
      this.analyser.getFloatTimeDomainData(samples);
      for (const sample of samples) this.peak = Math.max(this.peak, Math.abs(sample));
    }, 10);
  },
  deliver() {
    if (!this.wire) {
      const host = new Game();
      host.addPlayer(localId);
      Object.assign(host.state.predators[0], { state: 'chase', targetId: localId, suspicion: 1 });
      this.wire = packSnapshot(host.state);
    }
    network.options.onSnapshot(this.wire);
  },
  read() { return { alarms: alarmCount, voices: alarmVoices, peak: this.peak,
    audioState: audio.context?.state, target: snapshot?.predators[0]?.targetId, localId }; },
  stop() {
    clearInterval(this.timer);
    audio.master.disconnect(this.analyser);
    this.analyser.disconnect();
    this.sink.disconnect();
  }
};`
    })
  })
  await page.goto('/')
  await page.locator('#together').click()
  await page.locator('#room').fill('first-chase')
  await page.locator('#join').click()
  await expect(page.locator('#hud')).toBeVisible()
  await page.evaluate('window.rabbitersFirstChase.capture()')
  const deliver = () => page.evaluate('window.rabbitersFirstChase.deliver()')
  const read = () =>
    page.evaluate<{
      alarms: number
      voices: number
      peak: number
      audioState: string
      target: string
      localId: string
    }>('window.rabbitersFirstChase.read()')
  await deliver()
  await expect(page.locator('.fx-threat')).toHaveAttribute('data-mode', 'chase')
  await expect(page.locator('.fx-detection')).toHaveClass(/fx-on/)
  await expect(page.locator('#alert-overlay')).toHaveClass(/spotted/)
  await expect(page.locator('#condition')).toContainText('見つかった！')
  await expect.poll(async () => (await read()).alarms).toBe(1)
  await expect.poll(async () => (await read()).peak).toBeGreaterThan(0.001)
  expect(await read()).toMatchObject({ audioState: 'running', alarms: 1, voices: 4 })
  expect((await read()).target).toBe((await read()).localId)
  for (let index = 0; index < 4; index++) {
    await deliver()
    await page.evaluate(() => new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve))))
  }
  expect((await read()).alarms).toBe(1)
  await page.evaluate('window.rabbitersFirstChase.stop()')
  expect(errors).toEqual([])
})
