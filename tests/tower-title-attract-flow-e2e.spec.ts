import { expect, test, type Browser, type Page } from '@playwright/test'
import { FIELDS } from '../examples/games/tower_diffence_with_jev/src/game/model'
import { towerPath } from './tower-defense-e2e-arrange'

// Full campaign starts around the title demo. Each test prepares the demo and at least one campaign from a
// cold GPU, so these run with the local tower suite (`npm run e2e`) instead of the Pages CI shards.

const rawSave = (page: Page) => page.evaluate(() => localStorage.getItem('tower-jev-v3'))
const attract = (page: Page) =>
  page.evaluate(() =>
    (window as unknown as { towerTitleAttractDiagnostics: () => Record<string, any> }).towerTitleAttractDiagnostics()
  )
/** Cold GPU preparation of the demo's roles takes a while on software WebGL runners. */
const waitForDemo = (page: Page) =>
  expect.poll(async () => (await attract(page)).state, { timeout: 240_000, intervals: [500] }).toBe('running')

async function startFirstStage(browser: Browser, reducedMotion: 'reduce' | 'no-preference') {
  const context = await browser.newContext({ reducedMotion, viewport: { width: 1440, height: 1000 } })
  const page = await context.newPage()
  await page.goto(towerPath)
  await expect(page.locator('#title-screen')).toBeVisible()
  if (reducedMotion === 'no-preference') {
    await waitForDemo(page)
    await page.waitForTimeout(1000)
  } else {
    await page.waitForTimeout(2500)
    expect((await attract(page)).state).toBe('idle')
    await expect(page.locator('.title-demo')).toHaveCount(0)
  }
  expect(await rawSave(page)).toBeNull()
  await page.locator('#title-new').click()
  await expect(page.locator('.title-demo')).toHaveCount(0)
  await page.locator('#start').click()
  await expect(page.locator('#launch')).toBeHidden({ timeout: 180_000 })
  await expect(page.locator('#campaign-loading')).toBeHidden({ timeout: 180_000 })
  const save = JSON.parse((await rawSave(page))!)
  const view = await page.evaluate(() => ({
    phase: document.querySelector<HTMLElement>('#app')!.dataset.phase,
    gold: document.querySelector('#gold')!.textContent,
    stage: document.querySelector('#stage')!.textContent,
    field: document.querySelector('#field-name')!.textContent,
    defenders: document.querySelectorAll('.unit-health[data-owner="player"]').length,
    enemies: document.querySelectorAll('.unit-health[data-owner="ai"]').length,
    url: location.hash
  }))
  return { context, page, save, view }
}

test('New game from the running demo starts the same campaign as the still title', async ({ browser }) => {
  // Two cold starts (one with demo preparation) on software WebGL.
  test.setTimeout(900_000)
  const still = await startFirstStage(browser, 'reduce')
  const demo = await startFirstStage(browser, 'no-preference')
  try {
    expect(demo.view).toEqual(still.view)
    expect(demo.view).toMatchObject({
      phase: 'preparation',
      stage: '01',
      field: FIELDS.meadow.name,
      defenders: 0,
      enemies: 0
    })
    expect(demo.save).toEqual(still.save)
    expect((await attract(demo.page)).state).toBe('idle')
  } finally {
    await still.context.close()
    await demo.context.close()
  }
})

test('Continue from the demo restores the untouched save, and the title restarts the demo', async ({ page }) => {
  test.setTimeout(900_000)
  await page.goto(towerPath)
  await page.locator('#title-new').click()
  await page.locator('#start').click()
  await expect(page.locator('#launch')).toBeHidden({ timeout: 180_000 })
  const saved = await rawSave(page)
  expect(saved).not.toBeNull()
  await page.reload()
  await expect(page.locator('#title-continue')).toBeEnabled()
  await waitForDemo(page)
  await page.waitForTimeout(2000)
  expect(await rawSave(page)).toBe(saved)
  expect(await page.locator('#title-save-status').textContent()).toBe('保存した遠征を再開できます。')
  await page.locator('#title-continue').click()
  await expect(page.locator('.title-demo')).toHaveCount(0)
  await expect(page.locator('#campaign-loading')).toBeHidden({ timeout: 180_000 })
  await expect(page.locator('#title-screen')).toBeHidden()
  await expect(page.locator('#field-name')).toHaveText(FIELDS.meadow.name)
  expect((await attract(page)).state).toBe('idle')
  await page.goBack()
  await expect(page.locator('#title-screen')).toBeVisible()
  await expect(page.locator('#title-new')).toBeFocused()
  await waitForDemo(page)
  await expect(page.locator('#title-continue')).toBeEnabled()
})
