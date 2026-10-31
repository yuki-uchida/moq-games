import { chromium } from '@playwright/test'
import assert from 'node:assert/strict'
async function assertEventuallyResult(page) {
  for (let i = 0; i < 100 && !(await page.locator('dialog').evaluate((d) => d.open)); i++) await page.clock.runFor(50)
}
const browser = await chromium.launch({ headless: true, channel: 'chrome' })
try {
  const page = await browser.newPage()
  const errors = []
  page.on('pageerror', (e) => errors.push(String(e)))
  await page.clock.install({ time: new Date(0) })
  await page.goto(process.env.LANE_URL || 'http://127.0.0.1:5293/examples/games/lane-battle/')
  await page.getByRole('button', { name: '進軍開始' }).click()
  await page.clock.runFor(1000)
  await page.evaluate(() => {
    Object.defineProperty(document, 'hidden', { configurable: true, get: () => true })
    document.dispatchEvent(new Event('visibilitychange'))
  })
  // Suspend callbacks, then expose elapsed monotonic time at the next timer/frame.
  await page.clock.fastForward(10000)
  await page.evaluate(() => {
    delete document.hidden
    document.dispatchEvent(new Event('visibilitychange'))
  })
  assert.match(await page.locator('#clock').textContent(), /0:1[01]/)
  await page.locator('#pause').click()
  const frozen = await page.locator('#clock').textContent()
  await page.clock.fastForward(60000)
  assert.equal(await page.locator('#clock').textContent(), frozen)
  await page.locator('#pause').click()
  await page.clock.runFor(1000)
  assert.notEqual(await page.locator('#clock').textContent(), frozen)
  await page.clock.fastForward(120000)
  await assertEventuallyResult(page)
  assert.match(await page.locator('#title').textContent(), /陥落|取り戻した/)
  assert.equal(await page.locator('dialog').evaluate((d) => d.open), true)
  assert.deepEqual(errors, [])
  console.log('mock suspension / elapsed time / explicit pause / eventual result PASS')
  await page.close()
  const real = await browser.newPage()
  await real.goto(process.env.LANE_URL || 'http://127.0.0.1:5293/examples/games/lane-battle/')
  await real.getByRole('button', { name: '進軍開始' }).click()
  const other = await browser.newPage()
  await other.goto('about:blank')
  await other.bringToFront()
  await other.waitForTimeout(2500)
  const hidden = await real.evaluate(() => document.hidden)
  await real.bringToFront()
  await real.waitForTimeout(100)
  assert.notEqual(await real.locator('#clock').textContent(), '0:00')
  console.log(`real tab switch progressed; document.hidden=${hidden} (headless may keep pages visible)`)
  const beforeFreeze = await real.locator('#clock').textContent()
  const cdp = await real.context().newCDPSession(real)
  await cdp.send('Page.setWebLifecycleState', { state: 'frozen' })
  await other.waitForTimeout(2500)
  await cdp.send('Page.setWebLifecycleState', { state: 'active' })
  await real.waitForTimeout(100)
  assert.notEqual(await real.locator('#clock').textContent(), beforeFreeze)
  console.log('real CDP page freeze / resume reconciled elapsed time PASS')
} finally {
  await browser.close()
}
