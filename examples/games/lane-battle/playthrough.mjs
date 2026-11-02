import { chromium } from '@playwright/test'
import assert from 'node:assert/strict'
const browser = await chromium.launch({ headless: true, channel: 'chrome' })
const page = await browser.newPage({
  viewport: { width: Number(process.env.LANE_WIDTH || 1280), height: Number(process.env.LANE_HEIGHT || 800) }
})
await page.clock.install()
await page.goto(process.env.LANE_URL || 'http://127.0.0.1:5193/examples/games/lane-battle/')
await page.getByRole('button', { name: 'ステージ選択へ' }).click()
await page.getByRole('button', { name: 'ブリッと出撃' }).click()
let finished = false
for (let i = 0; i < 90; i++) {
  await page.evaluate(() => {
    const u = document.querySelector('#upgrade')
    if (!u.disabled && document.querySelector('#rate').textContent.includes('Lv.1')) u.click()
    for (const b of [...document.querySelectorAll('#tray button')].reverse()) if (!b.disabled) b.click()
    const b = document.querySelector('#burst')
    if (!b.disabled && Number(document.querySelector('#clock').textContent.split(':')[1]) > 20) b.click()
  })
  await page.clock.runFor(3000)
  if ([5, 6, 7, 8, 9].includes(i)) await page.screenshot({ path: `/tmp/lane-action-${i}.png` })
  if (await page.locator('dialog').evaluate((d) => d.open)) {
    finished = true
    console.log('Outcome:', await page.locator('#title').textContent(), await page.locator('#message').textContent())
    await page.screenshot({ path: '/tmp/lane-result.png' })
    await page.getByRole('button', { name: 'ステージ選択へ' }).click()
    await page.getByRole('button', { name: 'ブリッと出撃' }).click()
    // The fake clock holds animation frames; let one draw the fresh HUD.
    await page.clock.runFor(100)
    assert.match(await page.locator('#home').textContent(), /^(\d+) \/ \1$/)
    break
  }
}
assert.ok(finished, 'game reaches a result')
await browser.close()
