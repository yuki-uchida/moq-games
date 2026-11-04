import { chromium } from '@playwright/test'
import assert from 'node:assert/strict'
import { mkdir, readFile } from 'node:fs/promises'

const url = process.env.LANE_URL || 'http://127.0.0.1:5222/examples/games/lane-battle/'
const source = await readFile(new URL('./main.js', import.meta.url), 'utf8')
const main = source
  .replace('const clock = new BattleClock()', 'globalThis.__state = () => state; const clock = new BattleClock()')
  .replace('const audio = new BattleAudio()', 'const audio = new BattleAudio(); globalThis.__audio = audio')
await mkdir('/tmp/lane-pause', { recursive: true })
const browser = await chromium.launch({ channel: 'chrome', headless: true })
try {
  for (const [width, height, touch] of [
    [390, 844, true],
    [1280, 800, false]
  ]) {
    const page = await browser.newPage({ viewport: { width, height }, hasTouch: touch, isMobile: touch })
    const errors = []
    page.on('pageerror', (error) => errors.push(String(error)))
    await page.route('**/lane-battle/main.js*', (route) =>
      route.fulfill({ contentType: 'application/javascript', body: main })
    )
    await page.goto(url)
    const press = (locator) => (touch ? locator.tap() : locator.click())
    await press(page.getByRole('button', { name: 'ステージ選択へ' }))
    await press(page.getByRole('button', { name: 'ブリッと出撃' }))
    await press(page.locator('#tray button').first())
    await page.waitForTimeout(500)
    await page.screenshot({ path: `/tmp/lane-pause/${width}-running.png` })
    const pause = page.locator('#pause')
    const box = await pause.boundingBox()
    const sound = await page.locator('#sound').boundingBox()
    assert.ok(box.width >= 44 && box.height >= 44 && box.x + box.width <= sound.x, JSON.stringify({ box, sound }))
    await press(pause)
    await page.waitForTimeout(150)
    assert.equal(await pause.getAttribute('aria-label'), '再開')
    assert.equal(await pause.getAttribute('aria-pressed'), 'true')
    assert.equal(await page.locator('#notice').textContent(), 'Ⅱ')
    await page.screenshot({ path: `/tmp/lane-pause/${width}-paused.png` })
    const state = () =>
      page.evaluate(() => {
        const { time, home, enemy, gold, cooldowns, burst, summons, level } = globalThis.__state()
        return { time, home, enemy, gold, cooldowns, burst, summons, level }
      })
    const frozen = await state()
    assert.equal(await page.evaluate(() => globalThis.__audio.running), false)
    for (const selector of ['#tray button', '#upgrade', '#burst']) {
      const target = await page.locator(selector).first().boundingBox()
      if (touch) await page.touchscreen.tap(target.x + target.width / 2, target.y + target.height / 2)
      else await page.mouse.click(target.x + target.width / 2, target.y + target.height / 2)
    }
    await page.waitForTimeout(3100)
    assert.deepEqual(await state(), frozen)
    await press(pause)
    await page.waitForTimeout(500)
    const resumed = await state()
    assert.ok(resumed.time > frozen.time && resumed.time - frozen.time < 1.5)
    await page.keyboard.press('Space')
    await page.waitForTimeout(150)
    assert.equal(await pause.getAttribute('aria-label'), '再開')
    await page.keyboard.press('Space')
    await page.waitForTimeout(150)
    assert.equal(await pause.getAttribute('aria-label'), '一時停止')
    assert.deepEqual(errors, [])
    console.log(`${width}x${height} pause / resume / Space PASS`)
    await page.close()
  }
} finally {
  await browser.close()
}
