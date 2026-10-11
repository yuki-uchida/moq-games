import { test, expect } from '@playwright/test'

const root = '/moq-games/'
const game = '/moq-games/examples/games/tower_diffence_with_jev/index.html'

for (const viewport of [
  { width: 1440, height: 1050 },
  { width: 390, height: 844 },
  { width: 320, height: 740 }
]) {
  test(`catalog loads without game runtime at ${viewport.width}px`, async ({ page }, testInfo) => {
    await page.setViewportSize(viewport)
    const errors: string[] = []
    const requests: string[] = []
    page.on('pageerror', (error) => errors.push(error.message))
    page.on('request', (request) => requests.push(request.url()))
    await page.goto(root)
    await expect(page).toHaveTitle('MoQ Games')
    await expect(page.getByRole('heading', { name: 'smart defence with jev', exact: true })).toBeVisible()
    await expect(page.getByRole('article')).toHaveCount(1)
    const play = page.getByRole('link', { name: 'ゲームをプレイ: smart defence with jev' })
    await expect(play).toHaveAttribute('href', './examples/games/tower_diffence_with_jev/index.html')
    await expect(play).toBeVisible()
    await expect
      .poll(() =>
        page
          .locator('.scene-unit')
          .evaluateAll((images) =>
            images.every(
              (image) => (image as HTMLImageElement).complete && (image as HTMLImageElement).naturalWidth > 0
            )
          )
      )
      .toBe(true)
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true)
    expect(
      requests.filter((url) => /\.wasm(?:\?|$)|GameRenderer|JevConnection|\.glb(?:\?|$)|\.wav(?:\?|$)/.test(url))
    ).toEqual([])
    expect(errors).toEqual([])
    await page.screenshot({ path: testInfo.outputPath(`landing-${viewport.width}.png`), fullPage: true })
  })
}

test('keyboard, reduced motion, and browser back preserve the catalog', async ({ page }) => {
  await page.emulateMedia({ reducedMotion: 'reduce' })
  await page.goto(root)
  await page.keyboard.press('Tab')
  await expect(page.getByRole('link', { name: 'ゲーム一覧へスキップ' })).toBeFocused()
  await page.keyboard.press('Enter')
  const play = page.getByRole('link', { name: 'ゲームをプレイ: smart defence with jev' })
  await play.focus()
  expect(await play.evaluate((element) => getComputedStyle(element).transitionDuration)).toBe('0s')
  await page.keyboard.press('Enter')
  await expect(page).toHaveURL(new RegExp(`${game.replaceAll('.', '\\.')}$`))
  await page.goBack()
  await expect(page).toHaveTitle('MoQ Games')
  await expect(play).toBeVisible()
})

test('non-JavaScript entry still offers the existing game URL', async ({ browser }) => {
  const context = await browser.newContext({ javaScriptEnabled: false })
  const page = await context.newPage()
  await page.goto(root)
  await expect(page.getByRole('link', { name: 'ゲームをプレイ', exact: true })).toHaveAttribute(
    'href',
    './examples/games/tower_diffence_with_jev/index.html'
  )
  await context.close()
})
