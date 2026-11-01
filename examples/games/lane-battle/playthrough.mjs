import { chromium } from '@playwright/test'
import assert from 'node:assert/strict'
const browser = await chromium.launch({ headless: true, channel: 'chrome' })
const page = await browser.newPage({
  viewport: { width: Number(process.env.LANE_WIDTH || 1280), height: Number(process.env.LANE_HEIGHT || 800) }
})
await page.clock.install()
await page.goto('http://127.0.0.1:5193/examples/games/lane-battle/')
await page.getByRole('button', { name: 'ブリッと出撃' }).click()
let finished = false
for (let i = 0; i < 90; i++) {
  await page.evaluate(() => {
    const u = document.querySelector('#upgrade')
    if (!u.disabled && document.querySelector('#rate').textContent.includes('Lv.1')) u.click()
    for (const i of [2, 1, 0]) {
      const b = document.querySelectorAll('#tray button')[i]
      if (!b.disabled) b.click()
    }
    const b = document.querySelector('#burst')
    if (!b.disabled && Number(document.querySelector('#clock').textContent.split(':')[1]) > 20) b.click()
  })
  await page.clock.runFor(3000)
  if ([5, 6, 7, 8, 9].includes(i)) await page.screenshot({ path: `/tmp/lane-action-${i}.png` })
  if (await page.locator('dialog').evaluate((d) => d.open)) {
    finished = true
    console.log('Outcome:', await page.locator('#title').textContent(), await page.locator('#message').textContent())
    await page.screenshot({ path: '/tmp/lane-result.png' })
    await page.getByRole('button', { name: '↻ もう一度' }).click()
    assert.equal(await page.locator('#home').textContent(), '1400 / 1400')
    break
  }
}
assert.ok(finished, 'game reaches a result')
await browser.close()
