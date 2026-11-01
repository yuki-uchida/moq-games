import { test, expect } from '@playwright/test'

const root = '/moq-games/'
const game = '/moq-games/examples/games/tower_diffence_with_jev/index.html'

for (const viewport of [
  { width: 1440, height: 1050 },
  { width: 390, height: 844 },
  { width: 320, height: 568 },
  { width: 844, height: 390 }
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
    await expect(page.getByRole('article')).toHaveCount(4)
    await expect(page.getByRole('link', { name: '3Dモデルビューワー', exact: true })).toBeInViewport({ ratio: 1 })
    await expect(page.getByRole('link', { name: 'ゲームをプレイ: 燈の境界' })).toHaveAttribute(
      'href',
      './examples/games/ember-grid/index.html'
    )
    await expect(page.getByRole('link', { name: 'ゲームをプレイ: 芽吹きの境界' })).toHaveAttribute(
      'href',
      './examples/games/lane-battle/index.html'
    )
    await expect(page.getByRole('link', { name: 'ゲームをプレイ: Rabbiters' })).toHaveAttribute(
      'href',
      './examples/games/rabbiters/index.html'
    )
    const play = page.getByRole('link', { name: 'ゲームをプレイ: smart defence with jev', exact: true })
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
    for (const link of await page.locator('.play-button').all()) {
      await link.evaluate((element) => element.scrollIntoView({ block: 'center' }))
      await expect(link).toBeInViewport({ ratio: 1 })
    }
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
  const play = page.getByRole('link', { name: 'ゲームをプレイ: smart defence with jev', exact: true })
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
  await expect(page.getByRole('link', { name: '燈の境界をプレイ' })).toHaveAttribute(
    'href',
    './examples/games/ember-grid/index.html'
  )
  await expect(page.getByRole('link', { name: '芽吹きの境界をプレイ' })).toHaveAttribute(
    'href',
    './examples/games/lane-battle/index.html'
  )
  await expect(page.getByRole('link', { name: 'Rabbitersをプレイ' })).toHaveAttribute(
    'href',
    './examples/games/rabbiters/index.html'
  )
  await context.close()
})

for (const [title, path] of [
  ['燈の境界', 'ember-grid'],
  ['芽吹きの境界', 'lane-battle']
]) {
  test(`opens ${title} from the catalog`, async ({ page }) => {
    await page.goto(root)
    await page.getByRole('link', { name: `ゲームをプレイ: ${title}` }).click()
    await expect(page).toHaveURL(new RegExp(`/examples/games/${path}/index\\.html$`))
    await expect(page.locator('body')).not.toBeEmpty()
  })
}

test('starts Lane Battle through the catalog with its runtime assets', async ({ page }) => {
  const errors: string[] = []
  const failed: string[] = []
  page.on('pageerror', (error) => errors.push(error.message))
  page.on('response', (response) => {
    if (response.status() >= 400) failed.push(`${response.status()} ${response.url()}`)
  })
  await page.goto(root)
  await page.getByRole('link', { name: 'ゲームをプレイ: 芽吹きの境界' }).click()
  await page.getByRole('button', { name: '進軍開始' }).click()
  await page.getByRole('button', { name: '葉の衛兵を召喚 35', exact: true }).click()
  await expect(page.locator('#field canvas')).toBeVisible()
  await expect(page.locator('#clock')).not.toHaveText('00:00')
  expect(errors).toEqual([])
  expect(failed).toEqual([])
})

test('starts Rabbiters through the catalog', async ({ page }) => {
  const errors: string[] = []
  const failed: string[] = []
  page.on('pageerror', (error) => errors.push(error.message))
  page.on('response', (response) => {
    if (response.status() >= 400) failed.push(`${response.status()} ${response.url()}`)
  })
  await page.goto(root)
  await page.getByRole('link', { name: 'ゲームをプレイ: Rabbiters' }).click()
  await expect(page).toHaveURL(/\/examples\/games\/rabbiters\/index\.html$/)
  await expect(page.locator('#world canvas')).toBeVisible()
  await page.getByRole('button', { name: 'ひとりではじめる' }).click()
  await expect(page.locator('#hud')).toBeVisible()
  expect(errors).toEqual([])
  expect(failed).toEqual([])
})

test('loads the Rabbiters MoQ WASM through the catalog', async ({ page }) => {
  await page.addInitScript(() => {
    const blockedTransport = class {
      constructor() {
        Reflect.set(globalThis, '__rabbitersTransportAttempted', true)
        throw new Error('Relay disabled for this test')
      }
    }
    Object.defineProperty(globalThis, 'WebTransport', { configurable: true, value: blockedTransport })
    Object.defineProperty(globalThis, 'WebSocket', { configurable: true, value: blockedTransport })
  })
  await page.goto(root)
  await page.getByRole('link', { name: 'ゲームをプレイ: Rabbiters' }).click()
  await page.locator('#room').fill('offline-test')
  const wasm = page.waitForResponse((response) => /moqt_bg.*\.wasm(?:\?|$)/.test(response.url()))
  await page.getByRole('button', { name: 'ルームを作る' }).click()
  const response = await wasm
  expect(response.status()).toBe(200)
  expect(WebAssembly.validate(new Uint8Array(await response.body()))).toBe(true)
  await expect.poll(() => page.evaluate(() => Reflect.get(globalThis, '__rabbitersTransportAttempted'))).toBe(true)
})

test('all four cards are reachable in tab order', async ({ page }) => {
  await page.goto(root)
  await page.getByRole('link', { name: 'MoQ Games ホーム' }).focus()
  await page.keyboard.press('Tab')
  await expect(page.getByRole('link', { name: '3Dモデルビューワー', exact: true })).toBeFocused()
  for (const title of ['smart defence with jev', '燈の境界', '芽吹きの境界', 'Rabbiters']) {
    await page.keyboard.press('Tab')
    await expect(page.getByRole('link', { name: `ゲームをプレイ: ${title}`, exact: true })).toBeFocused()
  }
})
