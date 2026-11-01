import { chromium } from '@playwright/test'
import assert from 'node:assert/strict'
const browser = await chromium.launch({ headless: true, channel: 'chrome' })
try {
  const page = await browser.newPage()
  const errors = []
  page.on('pageerror', (e) => errors.push(String(e)))
  await page.clock.install()
  await page.goto(process.env.EMBER_URL || 'http://127.0.0.1:5187/moq-games/examples/games/ember-grid/')
  // Model preparation polls on timers; advance the installed clock until it completes.
  for (let i = 0; i < 1200 && (await page.locator('.preparation').count()); i++) {
    await page.waitForTimeout(100)
    await page.clock.runFor(100)
  }
  await page.locator('#end').click()
  await page.clock.fastForward(60000)
  for (let i = 0; i < 40; i++) {
    await page.waitForTimeout(100) // Allow native fetch/decode and animation promises to settle.
    await page.clock.runFor(1000)
    if ((await page.locator('#turn').textContent()).includes('味方')) break
  }
  assert.match(await page.locator('#turn').textContent(), /味方 · 2/)
  await page.locator('#end').click()
  await page.locator('#restart').click()
  await page.clock.fastForward(60000)
  for (let i = 0; i < 40; i++) {
    await page.waitForTimeout(100) // Allow native fetch/decode and animation promises to settle.
    await page.clock.runFor(1000)
    if ((await page.locator('#turn').textContent()).includes('味方')) break
  }
  assert.match(await page.locator('#turn').textContent(), /味方 · 1/)
  assert.equal(await page.locator('#count').textContent(), '◆ 3 / ▼ 3')
  assert.equal(await page.locator('.fx').count(), 0)
  assert.deepEqual(errors, [])
  console.log('Ember Grid skipped callback AI completion / restart cancels pending sequence PASS')
} finally {
  await browser.close()
}
