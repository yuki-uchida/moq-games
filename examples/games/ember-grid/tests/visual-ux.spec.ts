import { expect, test } from '@playwright/test'
import { enterBattle } from './shell-helper'

test.beforeEach(async ({ page }) => {
  await page.addInitScript(() => {
    setInterval(
      () => document.querySelector<HTMLButtonElement>('.story-overlay button, .story-credits button')?.click(),
      100
    )
  })
})

for (const [width, height] of [
  [1280, 800],
  [1366, 768],
  [390, 844],
  [844, 390],
  [360, 640]
]) {
  test(`title composition ${width}x${height}`, async ({ page }) => {
    await page.setViewportSize({ width, height })
    await page.goto('./')
    const art = page.locator('.title-art img')
    await expect(art).toHaveCount(3)
    for (const image of await art.all()) {
      await expect(image).toBeVisible()
      expect(await image.evaluate((element) => (element as HTMLImageElement).naturalWidth)).toBeGreaterThan(0)
      const box = (await image.boundingBox())!
      expect(box.x).toBeGreaterThanOrEqual(0)
      expect(box.y).toBeGreaterThanOrEqual(0)
      expect(box.x + box.width).toBeLessThanOrEqual(width + 0.5)
      expect(box.y + box.height).toBeLessThanOrEqual(height + 0.5)
    }
    if (width < height) {
      const artBox = (await page.locator('.title-art').boundingBox())!
      const menuBox = (await page.locator('.title-content nav').boundingBox())!
      expect(artBox.y + artBox.height).toBeLessThanOrEqual(menuBox.y)
    }
    await page.screenshot({ path: `test-results/ember-visual-title-${width}.png` })
    await expect(page.getByRole('button', { name: '? 遊び方' })).toBeVisible()
  })
}

for (const [width, height] of [
  [1280, 800],
  [390, 844]
]) {
  test(`battle presentation ${width}`, async ({ page }) => {
    await page.setViewportSize({ width, height })
    await enterBattle(page, './?seed=7', true)
    await expect(page.locator('#end')).toBeEnabled({ timeout: 90000 })
    await expect(page.locator('.story-overlay, .story-credits')).toHaveCount(0)
    if (width === 390) {
      await expect
        .poll(async () =>
          page.locator('#marks .tag').evaluateAll((tags) => {
            const boxes = tags.map((tag) => tag.getBoundingClientRect())
            return boxes.some((box, index) =>
              boxes
                .slice(index + 1)
                .some(
                  (other) =>
                    box.left < other.right && box.right > other.left && box.top < other.bottom && box.bottom > other.top
                )
            )
          })
        )
        .toBe(false)
    }
    await page.getByRole('button', { name: /2,4 風読み/ }).click()
    if (width === 390)
      expect(await page.locator('#selection').evaluate((element) => element.scrollWidth <= element.clientWidth)).toBe(
        true
      )
    await page.getByRole('button', { name: /4,4 平地 移動可能/ }).click()
    const boardBefore = await page.locator('#board').boundingBox()
    await page.getByRole('button', { name: /7,4 灰牙/ }).click()
    await expect(page.locator('#forecast')).toBeVisible()
    expect(await page.locator('#board').boundingBox()).toEqual(boardBefore)
    const card = (await page.locator('#forecast').boundingBox())!
    const field = (await page.locator('.field').boundingBox())!
    expect(card.y).toBeGreaterThanOrEqual(field.y + field.height - 1)
    await page.screenshot({ path: `test-results/ember-visual-forecast-${width}.png` })
    await page.getByRole('button', { name: 'やめる' }).click()
    expect(await page.locator('#board').boundingBox()).toEqual(boardBefore)
    for (const chapter of [3, 4, 5]) {
      await page.getByRole('button', { name: '任務と編成' }).click()
      await page.locator(`[data-stage="${chapter}"]`).click()
      await expect(page.locator('#end')).toBeEnabled({ timeout: 90000 })
      await expect(page.locator('.story-overlay, .story-credits')).toHaveCount(0)
      await expect(page.locator('#phase-banner')).toBeHidden()
      const obstacles = await page.locator('.stage').evaluate((canvas) => {
        const stage = (canvas as HTMLCanvasElement & { stage: import('../src/stage').Stage }).stage
        return stage.scene
          .getObjectByName('terrain')!
          .children.filter((object) => object.name === 'impassable-prop')
          .map((object) => object.userData.cell as string)
      })
      expect(obstacles.length).toBeGreaterThan(0)
      for (const cell of obstacles) {
        const [x, y] = cell.split(',').map(Number)
        await expect(page.locator('.cell').nth(y * 10 + x)).toHaveClass(/rock/)
      }
      if (chapter === 3) {
        await expect(page.getByRole('button', { name: /^9,5 .*制圧目標/ })).toHaveClass(/seize/)
        await expect(page.locator('#objective')).toContainText('✦ ◎ 制圧')
        expect(await page.locator('.cell.seize').evaluate((cell) => getComputedStyle(cell, '::after').content)).toBe(
          '"✦"'
        )
      }
      if (chapter === 5) {
        await expect(page.locator('.stand.boss .crown')).toBeVisible()
        expect(
          await page.locator('.stage').evaluate((canvas) => {
            const stage = (canvas as HTMLCanvasElement & { stage: import('../src/stage').Stage }).stage
            return stage.scene.children.some((object) => object.name === 'boss-aura' && object.visible)
          })
        ).toBe(true)
      }
      await page.screenshot({ path: `test-results/ember-visual-ch${chapter + 1}-${width}.png` })
    }
  })
}
