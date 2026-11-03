import { expect, test } from '@playwright/test'

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
    const announcement = document.querySelector('#announcements');
    this.observer = new MutationObserver((records) => { this.updates += records.length; });
    this.observer.observe(announcement, { childList: true, subtree: true, characterData: true });
  },
  chase(count) {
    game.state.predators.forEach((predator, index) => Object.assign(predator,
      { state: index < count ? 'chase' : 'patrol', targetId: index < count ? localId : null }));
    game.state.time += 0.1;
  },
  read() { return { updates: this.updates, text: document.querySelector('#announcements').textContent }; }
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
