import { expect, test } from '@playwright/test'
import { openGame, pageThroughStory, reloadGame } from './hoshi-no-hamham-helpers'

/**
 * The readout for checking the game on the device in hand: `?perf` in the address puts the count of late frames
 * in a corner while a stage is played, and nothing of it exists without the flag.
 */

const SAVE = {
  version: 1,
  cleared: [1, 2, 3, 4, 5, 6, 7, 8, 9],
  unlocked: 10,
  best: {},
  muted: true,
  seenOpening: true
}

test.use({ viewport: { width: 844, height: 390 } })

test('?perf shows the late frames of the stage being played', async ({ page }) => {
  test.setTimeout(120_000)
  const errors: string[] = []
  page.on('pageerror', (error) => errors.push(error.message))
  await openGame(page, '/?perf')
  await page.evaluate((save) => localStorage.setItem('hoshi-no-hamham-v1', JSON.stringify(save)), SAVE)
  await reloadGame(page)
  const readout = page.locator('#perf-readout')
  // On the title nothing has been counted yet.
  await expect(readout).toHaveText(/^--Hz\s+おくれ 0\/0\s+最長 0ms\s+50ms以上 0回/)
  await page.getByRole('button', { name: 'つづきから' }).click()
  await page.locator('.stage-card').first().click()
  await pageThroughStory(page, 8)
  await expect(page.locator('#hud')).toBeVisible()
  // A few seconds of play: the display's rate is known and frames have been counted.
  await expect
    .poll(async () => Number(/おくれ \d+\/(\d+)/.exec((await readout.textContent()) ?? '')?.[1] ?? 0), {
      timeout: 30_000
    })
    .toBeGreaterThan(60)
  await expect(readout).toHaveText(/^\d+Hz\s+おくれ \d+\/\d+\s+最長 \d+ms\s+50ms以上 \d+回/)
  // It never takes a tap away from the game, and it is not read out.
  await expect(readout).toHaveCSS('pointer-events', 'none')
  await expect(readout).toHaveAttribute('aria-hidden', 'true')
  expect(errors).toEqual([])
})

test('without ?perf there is no readout', async ({ page }) => {
  await openGame(page)
  await page.waitForTimeout(500)
  await expect(page.locator('#perf-readout')).toHaveCount(0)
})
