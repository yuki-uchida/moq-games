import { expect, test } from '@playwright/test'
import { openGame, pageThroughStory, reloadGame } from './hoshi-no-hamham-helpers'

/**
 * The readout for checking the game on the device in hand: `?perf` in the address puts the rate of the frames and
 * the count of the long waits between them in a corner while a stage is played, and nothing of it exists without
 * the flag.
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

test('?perf shows the frames and the long waits of the stage being played', async ({ page }) => {
  test.setTimeout(120_000)
  const errors: string[] = []
  page.on('pageerror', (error) => errors.push(error.message))
  await openGame(page, '/?perf')
  await page.evaluate((save) => localStorage.setItem('hoshi-no-hamham-v1', JSON.stringify(save)), SAVE)
  await reloadGame(page)
  const readout = page.locator('#perf-readout')
  // The readout is a canvas (a change of text in the page would cost a layout of its own); the text it shows is
  // kept on the element.
  const shown = () =>
    page.evaluate(() => (document.querySelector('#perf-readout') as HTMLCanvasElement & { shown?: string }).shown ?? '')
  /** How many of the canvas's pixels are written on. */
  const inked = () =>
    page.evaluate(() => {
      const canvas = document.querySelector<HTMLCanvasElement>('#perf-readout')!
      const data = canvas.getContext('2d')!.getImageData(0, 0, canvas.width, canvas.height).data
      let n = 0
      for (let i = 3; i < data.length; i += 4) if (data[i] > 128) n += 1
      return n
    })
  // On the title nothing has been counted yet.
  await expect.poll(shown).toMatch(/^--コマ\/秒\s+0コマ\s+最長 0ms\s+25ms以上 0回\s+50ms以上 0回/)
  expect(await inked()).toBeGreaterThan(100)
  await page.getByRole('button', { name: 'つづきから' }).click()
  await page.locator('.stage-card').first().click()
  await pageThroughStory(page, 8)
  await expect(page.locator('#hud')).toBeVisible()
  // A few seconds of play: frames have been counted and their rate is shown.
  await expect
    .poll(async () => Number(/(\d+)コマ\s+最長/.exec(await shown())?.[1] ?? 0), { timeout: 30_000 })
    .toBeGreaterThan(60)
  expect(await shown()).toMatch(/^\d+コマ\/秒\s+\d+コマ\s+最長 \d+ms\s+25ms以上 \d+回\s+50ms以上 \d+回/)
  // The canvas is as wide as the text needs and sits inside the page.
  const box = await readout.boundingBox()
  expect(box!.x).toBeGreaterThanOrEqual(0)
  expect(box!.x + box!.width).toBeLessThanOrEqual(844)
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
