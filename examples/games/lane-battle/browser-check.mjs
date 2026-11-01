import { chromium } from '@playwright/test'
import assert from 'node:assert/strict'
const browser = await chromium.launch({ headless: true, channel: 'chrome' })
for (const [name, width, height] of [
  ['pc', 1280, 800],
  ['portrait', 390, 844],
  ['landscape', 844, 390]
]) {
  const page = await browser.newPage({ viewport: { width, height }, deviceScaleFactor: 1 })
  const errors = []
  page.on('pageerror', (e) => errors.push(String(e)))
  await page.goto('http://127.0.0.1:5193/examples/games/lane-battle/')
  await page.getByRole('button', { name: '進軍開始' }).click()
  await page.getByRole('button', { name: '葉の衛兵を召喚 35', exact: true }).click()
  await page.waitForTimeout(3000)
  assert.ok(Number(await page.locator('#gold').textContent()) >= 35)
  assert.equal(
    await page.evaluate(
      () => document.documentElement.scrollWidth > innerWidth || document.documentElement.scrollHeight > innerHeight
    ),
    false
  )
  await page.keyboard.press('Space')
  await page.screenshot({ path: `/tmp/lane-${name}.png` })
  assert.deepEqual(errors, [])
  await page.close()
  console.log(name, 'summon/pause/no-scroll PASS')
}
await browser.close()
