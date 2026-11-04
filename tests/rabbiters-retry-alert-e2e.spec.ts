import { expect, test } from '@playwright/test'

test('retry does not replay an old discovery but announces the next chase', async ({ page }) => {
  const errors: string[] = []
  page.on('pageerror', (error) => errors.push(error.message))
  await page.route('**/src/main.ts*', async (route) => {
    const response = await route.fetch()
    await route.fulfill({
      response,
      body: `${await response.text()}
window.rabbitersRetryAlert = {
  spots: 0, alarms: 0,
  prepare() {
    game.step = () => {};
    game.state.predators = [];
    checkpoint = structuredClone(game.state);
    const emit = feel.emit.bind(feel);
    feel.emit = (event) => {
      if (event.type === 'spotted' && event.you) this.spots++;
      emit(event);
    };
    const alarm = audio.alarm.bind(audio);
    audio.alarm = () => { this.alarms++; alarm(); };
    game.state.time += 0.1;
    game.state.discoveries = [{ predatorId: 'fox', targetId: localId, count: 1,
      time: game.state.time, x: 0, y: 0, z: 0 }];
  },
  lose() {
    game.state.players[0].downed = true;
    game.state.phase = 'lost';
  },
  chase() {
    game.step = () => {};
    game.state.time += 0.1;
    game.state.predators = [{ id: 'fox', kind: 'fox', x: 0, y: 0, z: 0,
      angle: 0, state: 'chase', targetId: localId, suspicion: 1 }];
  },
  read() { return { spots: this.spots, alarms: this.alarms }; }
};`
    })
  })
  await page.goto('/?chapter=4')
  await page.locator('#solo').click()
  await page.evaluate('window.rabbitersRetryAlert.prepare()')
  const read = () => page.evaluate<{ spots: number; alarms: number }>('window.rabbitersRetryAlert.read()')
  await expect.poll(read).toEqual({ spots: 1, alarms: 1 })
  await page.evaluate('window.rabbitersRetryAlert.lose()')
  await expect(page.locator('#result')).toBeVisible()
  await expect(page.locator('.fx-detection')).not.toHaveClass(/fx-on/)
  await page.waitForTimeout(1400)
  await page.locator('#retry-season').click()
  await expect(page.locator('#result')).toBeHidden()
  await page.waitForTimeout(300)
  expect(await read()).toEqual({ spots: 1, alarms: 1 })
  await expect(page.locator('.fx-detection')).not.toHaveClass(/fx-on/)
  await page.evaluate('window.rabbitersRetryAlert.chase()')
  await expect.poll(read).toEqual({ spots: 2, alarms: 2 })
  await expect(page.locator('.fx-detection')).toHaveClass(/fx-on/)
  expect(errors).toEqual([])
})

test('retrying into a saved chase plays the warning again', async ({ page }) => {
  const errors: string[] = []
  page.on('pageerror', (error) => errors.push(error.message))
  await page.route('**/src/main.ts*', async (route) => {
    const response = await route.fetch()
    await route.fulfill({
      response,
      body: `${await response.text()}
window.rabbitersRetryChase = {
  alarms: 0, notices: 0,
  prepare() {
    game.step = () => {};
    this.observer = new MutationObserver((records) => { this.notices += records.length; });
    this.observer.observe(document.querySelector('#discovery-announcements'), { childList: true, subtree: true });
    const resume = Game.resume.bind(Game);
    Game.resume = (...args) => {
      const restored = resume(...args);
      restored.step = () => {};
      return restored;
    };
    const alarm = audio.alarm.bind(audio);
    audio.alarm = () => { this.alarms++; alarm(); };
  },
  chase() {
    game.state.time += 0.1;
    Object.assign(game.state.predators[0], { state: 'chase', targetId: localId, suspicion: 1 });
  },
  lose() {
    checkpoint = structuredClone(game.state);
    game.state.players[0].downed = true;
    game.state.phase = 'lost';
  },
  read() { return { alarms: this.alarms, notices: this.notices }; }
};`
    })
  })
  await page.goto('/?chapter=4')
  await page.locator('#solo').click()
  await page.evaluate('window.rabbitersRetryChase.prepare()')
  await page.waitForTimeout(100)
  await page.evaluate('window.rabbitersRetryChase.chase()')
  const alerts = () => page.evaluate<{ alarms: number; notices: number }>('window.rabbitersRetryChase.read()')
  await expect.poll(alerts).toEqual({ alarms: 1, notices: 1 })
  await page.evaluate('window.rabbitersRetryChase.lose()')
  await expect(page.locator('#result')).toBeVisible()
  await expect(page.locator('#announcements')).toHaveText('ゲームオーバー')
  await page.waitForTimeout(1400)
  await page.locator('#retry-season').click()
  await expect(page.locator('#result')).toBeHidden()
  await expect(page.locator('.fx-threat')).toHaveAttribute('data-mode', 'chase')
  await expect(page.locator('.fx-detection')).toHaveClass(/fx-on/)
  await expect(page.locator('#discovery-announcements')).toHaveText('見つかった！')
  await expect.poll(alerts).toEqual({ alarms: 2, notices: 2 })
  expect(errors).toEqual([])
})

for (const phase of ['won', 'lost'] as const) {
  test(`the ${phase} flash survives subsequent game frames`, async ({ page }) => {
    const errors: string[] = []
    page.on('pageerror', (error) => errors.push(error.message))
    await page.route('**/src/main.ts*', async (route) => {
      const response = await route.fetch()
      await route.fulfill({
        response,
        body: `${await response.text()}
window.rabbitersResultFlash = {
  duration: null, burstDuration: null, maxOpacity: 0, activeFrames: 0,
  start(phase) {
    const flash = document.querySelector(phase === 'won' ? '.fx-flash-sweep' : '.fx-flash-lost');
    flash.addEventListener('animationend', (event) => { this.duration = event.elapsedTime; });
    document.querySelector('.fx-burst').addEventListener('animationend', (event) => {
      this.burstDuration = event.elapsedTime;
    });
    const sample = () => {
      if (flash.classList.contains('fx-on')) {
        this.activeFrames++;
        this.maxOpacity = Math.max(this.maxOpacity, Number(getComputedStyle(flash).opacity));
      }
      if (this.duration === null) requestAnimationFrame(sample);
    };
    game.step = () => {};
    game.state.time += 0.1;
    game.state.phase = phase;
    requestAnimationFrame(sample);
  }
};`
      })
    })
    await page.goto('/?chapter=4')
    await page.locator('#solo').click()
    await page.evaluate(() => new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve))))
    await page.evaluate((value) => (window as any).rabbitersResultFlash.start(value), phase)
    const read = () =>
      page.evaluate<{
        duration: number | null
        burstDuration: number | null
        maxOpacity: number
        activeFrames: number
      }>('window.rabbitersResultFlash')
    await expect.poll(async () => (await read()).duration).not.toBeNull()
    const result = await read()
    expect(result.duration).toBeCloseTo(phase === 'won' ? 0.9 : 1.1)
    expect(result.activeFrames).toBeGreaterThan(1)
    expect(result.maxOpacity).toBeGreaterThan(0.1)
    if (phase === 'won') expect(result.burstDuration).toBeCloseTo(0.6)
    expect(errors).toEqual([])
  })
}
