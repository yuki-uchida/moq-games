import { expect, test } from '@playwright/test'

test('the final rabbit is warned when discovery and defeat happen in the same frame', async ({ page }, testInfo) => {
  await page.setViewportSize({ width: 320, height: 568 })
  await page.route('**/src/main.ts*', async (route) => {
    const response = await route.fetch()
    await route.fulfill({
      response,
      body: `${await response.text()}
import { heightAt as captureHeight } from '/src/map.ts';
window.rabbitersFinalCapture = {
  alarms: 0, spots: 0, alarmVoices: 0, sustainedVoices: null, silenced: 0,
  stage() {
    const player = game.state.players.find((entry) => entry.id === localId);
    Object.assign(player, { x: -88, y: captureHeight(-88, -29.1), z: -29.1, health: 0.01 });
    game.state.predators = [{ id: 'fox', kind: 'fox', x: -88, y: captureHeight(-88, -30), z: -30,
      angle: 0, state: 'patrol', targetId: null, suspicion: 0 }];
    const silence = audio.silence.bind(audio);
    audio.silence = () => { if (this.alarmVoices) this.silenced++; silence(); };
    const alarm = audio.alarm.bind(audio);
    audio.alarm = () => {
      this.alarms++;
      const previous = new Set(audio.voices);
      alarm();
      const voices = [...audio.voices].filter((voice) => !previous.has(voice));
      this.alarmVoices = voices.length;
      setTimeout(() => { this.sustainedVoices = voices.filter((voice) => audio.voices.has(voice)).length; }, 200);
    };
    const emit = feel.emit.bind(feel);
    feel.emit = (event) => {
      if (event.type === 'spotted' && event.you) this.spots++;
      emit(event);
      if (event.type === 'spotted' && event.you) {
        for (const animation of document.querySelector('.fx-detection').getAnimations()) {
          animation.pause();
          animation.currentTime = 144;
        }
      }
    };
  },
  read() { return { phase: game.state.phase, downed: game.state.players[0].downed,
    discoveries: game.state.discoveries.length, alarms: this.alarms, spots: this.spots,
    alarmVoices: this.alarmVoices, sustainedVoices: this.sustainedVoices, silenced: this.silenced }; }
};`
    })
  })
  await page.goto('/?chapter=4')
  await page.locator('#solo').click()
  await page.evaluate(() => new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve))))
  await page.evaluate('window.rabbitersFinalCapture.stage()')
  const read = () =>
    page.evaluate<{
      phase: string
      downed: boolean
      discoveries: number
      alarms: number
      spots: number
      alarmVoices: number
      sustainedVoices: number | null
      silenced: number
    }>('window.rabbitersFinalCapture.read()')
  await expect.poll(read).toMatchObject({ phase: 'lost', downed: true, discoveries: 1 })
  expect(await read()).toMatchObject({ alarms: 1, spots: 1, alarmVoices: 4 })
  const detection = page.locator('.fx-detection')
  await expect(detection).toHaveClass(/fx-on/)
  await expect(page.locator('.fx-detection-hint')).toHaveText('ぴんち！')
  await expect(page.locator('#result')).toBeVisible()
  expect(
    await detection.evaluate((element) => {
      const animations = element.getAnimations()
      for (const animation of animations) {
        animation.pause()
        animation.currentTime = 144
      }
      return animations.length
    })
  ).toBeGreaterThan(0)
  await expect(detection).toHaveCSS('opacity', '1')
  expect(
    await detection.evaluate((element) => {
      const previous = element.style.pointerEvents
      element.style.pointerEvents = 'auto'
      const bounds = element.getBoundingClientRect()
      const visible = element.contains(
        document.elementFromPoint(bounds.x + bounds.width / 2, bounds.y + bounds.height / 2)
      )
      element.style.pointerEvents = previous
      return visible
    })
  ).toBe(true)
  await page.screenshot({ path: testInfo.outputPath('final-capture.png') })
  await expect.poll(async () => (await read()).sustainedVoices).toBeGreaterThan(0)
  expect((await read()).silenced).toBe(0)
  await page.locator('#retry-season').click()
  await expect(page.locator('#result')).toBeHidden()
})

test('an instant capture still shows and sounds the discovery warning', async ({ page }, testInfo) => {
  const errors: string[] = []
  page.on('pageerror', (error) => errors.push(error.message))
  await page.route('**/src/main.ts*', async (route) => {
    const response = await route.fetch()
    await route.fulfill({
      response,
      body: `${await response.text()}
window.rabbitersInstantCapture = {
  alarms: 0, spots: 0, captured: null,
  stage() {
    const player = game.state.players.find((entry) => entry.id === localId);
    Object.assign(player, { x: 0, y: 0, z: 0 });
    game.state.predators = [{ id: 'mom', kind: 'human', x: 0, y: 0, z: -0.9,
      angle: 0, state: 'patrol', targetId: null, suspicion: 0 }];
    const alarm = audio.alarm.bind(audio);
    audio.alarm = () => { this.alarms++; alarm(); };
    const emit = feel.emit.bind(feel);
    feel.emit = (event) => {
      if (event.type === 'spotted' && event.you) this.spots++;
      emit(event);
    };
    const step = game.step.bind(game);
    game.step = (dt) => {
      step(dt);
      if (!this.captured && Math.hypot(player.x, player.z) > 3) {
        const mom = game.state.predators.find((predator) => predator.id === 'mom');
        this.captured = { x: player.x, z: player.z, state: mom.state, targetId: mom.targetId };
      }
    };
  },
  read() { return { alarms: this.alarms, spots: this.spots, captured: this.captured,
    audioState: audio.context?.state }; }
};`
    })
  })
  await page.goto('/?chapter=1')
  await page.locator('#solo').click()
  await page.evaluate(() => new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve))))
  await page.evaluate('window.rabbitersInstantCapture.stage()')
  const read = () =>
    page.evaluate<{
      alarms: number
      spots: number
      captured: { x: number; z: number; state: string; targetId: string | null } | null
      audioState: string
    }>('window.rabbitersInstantCapture.read()')

  await expect.poll(async () => (await read()).captured).not.toBeNull()
  expect((await read()).captured).toMatchObject({ state: 'patrol', targetId: null })
  await expect(page.locator('.fx-detection')).toHaveClass(/fx-on/)
  await expect(page.locator('.fx-detection-hint')).not.toContainText('逃げよう')
  await expect.poll(read).toMatchObject({ alarms: 1, spots: 1, audioState: 'running' })
  await page.screenshot({ path: testInfo.outputPath('instant-detection.png') })
  await page.waitForTimeout(300)
  expect(await read()).toMatchObject({ alarms: 1, spots: 1 })
  expect(errors).toEqual([])
})

for (const historical of [false, true]) {
  test(`first guest snapshot ${historical ? 'does not replay an old' : 'reports a recent'} instant capture`, async ({
    page
  }) => {
    await page.route('**/src/network.ts*', (route) =>
      route.fulfill({
        contentType: 'text/javascript',
        body: `export const MAX_PLAYERS = 16;
export class CooperativeNetwork {
  constructor(options) { this.options = options; }
  async start() { this.options.onStatus('ready', 'Connected'); }
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
window.rabbitersFirstCapture = (historical) => {
  const host = new Game(3, undefined, 0);
  host.addPlayer(localId, 'Rabbit');
  const player = host.state.players[0];
  Object.assign(player, { x: 0, y: 0, z: 0 });
  host.state.predators = host.state.predators.filter((predator) => predator.id === 'mom');
  Object.assign(host.state.predators[0], { x: 0, y: 0, z: -0.9, angle: 0, state: 'patrol' });
  host.step(1 / 60);
  const captured = Math.hypot(player.x, player.z) > 3;
  if (historical) {
    host.removePredator('mom');
    for (let frame = 0; frame < 180; frame++) host.step(1 / 60);
  }
  let alarms = 0, spots = 0;
  audio.alarm = () => { alarms++; };
  const emit = feel.emit.bind(feel);
  feel.emit = (event) => { if (event.type === 'spotted' && event.you) spots++; emit(event); };
  network.options.onSnapshot(JSON.parse(JSON.stringify(packSnapshot(host.state))));
  return { captured, alarms, spots };
};`
      })
    })
    await page.goto('/')
    await page.locator('#together').click()
    await page.locator('#room').fill('first-capture')
    await page.locator('#join').click()
    await expect(page.locator('#leave')).toBeVisible()
    const result = await page.evaluate(
      (old) => (window as unknown as { rabbitersFirstCapture(old: boolean): unknown }).rabbitersFirstCapture(old),
      historical
    )
    expect(result).toEqual({ captured: true, alarms: historical ? 0 : 1, spots: historical ? 0 : 1 })
    if (historical) await expect(page.locator('.fx-detection')).not.toHaveClass(/fx-on/)
    else await expect(page.locator('.fx-detection')).toHaveClass(/fx-on/)
  })
}
