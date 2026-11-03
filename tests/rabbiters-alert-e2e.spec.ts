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
