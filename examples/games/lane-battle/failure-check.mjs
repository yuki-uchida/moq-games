import { chromium } from '@playwright/test'
import assert from 'node:assert/strict'
const browser = await chromium.launch({ headless: true, channel: 'chrome' })
for (const [name, width, height] of [
  ['pc', 1280, 800],
  ['portrait', 390, 844],
  ['landscape', 844, 390]
]) {
  const page = await browser.newPage({ viewport: { width, height } })
  await page.clock.install()
  await page.goto('http://127.0.0.1:5193/examples/games/lane-battle/')
  await page.getByRole('button', { name: '進軍開始' }).click()
  await page.evaluate(() => {
    for (let i = 0; i < 100; i++)
      for (const key of ['3', '1', '2']) window.dispatchEvent(new KeyboardEvent('keydown', { key }))
  })
  await page.clock.runFor(50)
  assert.ok(
    Number(await page.locator('#gold').textContent()) >= 5 && Number(await page.locator('#gold').textContent()) <= 7,
    'only one 95-cost wolf despite 300 attempts'
  )
  await page.clock.runFor(6000)
  await page.evaluate(() => {
    for (let i = 0; i < 100; i++) window.dispatchEvent(new KeyboardEvent('keydown', { key: '1' }))
  })
  await page.clock.runFor(50)
  const gold = Number(await page.locator('#gold').textContent())
  assert.ok(gold >= 48 && gold <= 53, `cooldown charges once: ${gold}`)
  await page.getByRole('button', { name: '一時停止', exact: true }).click()
  await page.clock.runFor(50)
  const snapshot = () =>
    page.evaluate(() => ({
      gold: document.querySelector('#gold').textContent,
      time: document.querySelector('#clock').textContent,
      hp: document.querySelector('#home').textContent,
      canvas: document.querySelector('#field canvas').toDataURL()
    }))
  const frozen = await snapshot()
  await page.clock.runFor(10000)
  assert.deepEqual(await snapshot(), frozen, 'pause freezes income, timer, enemy movement, poses and HP')
  await page.getByRole('button', { name: '一時停止', exact: true }).click()
  await page.clock.runFor(1200)
  assert.notDeepEqual(await snapshot(), frozen, 'resume advances')
  await page.getByRole('button', { name: '遊び方' }).click()
  await page.getByRole('button', { name: '進軍開始' }).click()
  await page.clock.runFor(100)
  const before = Number(await page.locator('#gold').textContent())
  await page.getByRole('button', { name: '葉の衛兵を召喚 35', exact: true }).click()
  await page.clock.runFor(50)
  assert.ok(Number(await page.locator('#gold').textContent()) < before, 'help restores summon controls')
  assert.equal(
    await page.evaluate(
      () => document.documentElement.scrollWidth > innerWidth || document.documentElement.scrollHeight > innerHeight
    ),
    false
  )
  console.log(name, 'spam/cooldown/pause/resume/help/no-scroll PASS')
  await page.close()
}
const page = await browser.newPage({ viewport: { width: 390, height: 844 } })
await page.clock.install()
await page.goto('http://127.0.0.1:5193/examples/games/lane-battle/')
await page.getByRole('button', { name: '進軍開始' }).click()
let lost = false
for (let i = 0; i < 35; i++) {
  await page.clock.runFor(10000)
  if (await page.locator('dialog').evaluate((d) => d.open)) {
    assert.equal(await page.locator('#title').textContent(), '森の砦が陥落')
    lost = true
    console.log('Natural defeat:', await page.locator('#message').textContent())
    await page.screenshot({ path: '/tmp/lane-natural-defeat.png' })
    break
  }
}
assert.ok(lost)
await page.getByRole('button', { name: '↻ もう一度' }).click()
await page.clock.runFor(50)
assert.equal(await page.locator('#home').textContent(), '1400 / 1400')
assert.equal(await page.locator('#enemy').textContent(), '1000 / 1000')
assert.equal(await page.locator('#clock').textContent(), '0:00')
assert.ok(Number(await page.locator('#gold').textContent()) <= 102)
await page.getByRole('button', { name: '葉の衛兵を召喚 35', exact: true }).click()
await page.clock.runFor(50)
assert.ok(
  Number(await page.locator('#gold').textContent()) >= 65 && Number(await page.locator('#gold').textContent()) <= 68
)
console.log('natural defeat / clean replay / summon PASS')
await browser.close()
