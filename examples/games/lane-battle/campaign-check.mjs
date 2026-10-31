import { chromium } from '@playwright/test'
import assert from 'node:assert/strict'
const browser = await chromium.launch({ headless: true, channel: 'chrome' })
await Promise.all(
  [
    ['pc', 1280, 800],
    ['portrait', 390, 844],
    ['landscape', 844, 390]
  ].map(async ([name, width, height]) => {
    const page = await browser.newPage({ viewport: { width, height } }),
      errors = []
    page.on('pageerror', (e) => errors.push(String(e)))
    await page.addInitScript(() => {
      window.soundCount = 0
      const original = AudioContext.prototype.createOscillator
      AudioContext.prototype.createOscillator = function (...args) {
        window.soundCount++
        return original.apply(this, args)
      }
    })
    await page.clock.install()
    await page.goto('http://127.0.0.1:5193/examples/games/lane-battle/')
    await page.getByRole('button', { name: '進軍開始' }).click()
    for (let stage = 0; stage < 3; stage++) {
      let won = false
      for (let i = 0; i < 150; i++) {
        await page.evaluate(() => {
          const gold = Number(document.querySelector('#gold').textContent),
            rate = document.querySelector('#rate').textContent
          const upgrade = document.querySelector('#upgrade')
          if (
            gold >= 135 &&
            !rate.includes('Lv.3') &&
            !rate.includes('Lv.4') &&
            !rate.includes('Lv.5') &&
            !upgrade.disabled
          )
            upgrade.click()
          const cards = document.querySelectorAll('#tray button')
          for (const j of [2, 1, 0]) {
            if (j === 0 && Number(document.querySelector('#gold').textContent) < 65) continue
            if (!cards[j].disabled) cards[j].click()
          }
          if (!document.querySelector('#burst').disabled) document.querySelector('#burst').click()
        })
        await page.clock.runFor(1000)
        if (await page.locator('dialog').evaluate((d) => d.open)) {
          assert.equal(await page.locator('#title').textContent(), '境界を取り戻した！', `${name} stage ${stage + 1}`)
          console.log(name, stage + 1, await page.locator('#message').textContent())
          won = true
          break
        }
      }
      assert.ok(won, `${name} stage ${stage + 1} finishes`)
      assert.equal(
        await page.evaluate(
          () => document.documentElement.scrollWidth > innerWidth || document.documentElement.scrollHeight > innerHeight
        ),
        false
      )
      await page.screenshot({ path: `/tmp/lane-${name}-stage-${stage + 1}.png` })
      if (stage < 2) await page.getByRole('button', { name: '次のステージ →' }).click()
    }
    assert.ok((await page.evaluate(() => window.soundCount)) > 0, 'sound synthesis triggered')
    await page.getByRole('button', { name: '最初のステージへ ↻' }).click()
    await page.getByRole('button', { name: '音を切り替え' }).click()
    const count = await page.evaluate(() => window.soundCount)
    await page.getByRole('button', { name: '葉の衛兵を召喚 35', exact: true }).click()
    await page.clock.runFor(2000)
    assert.equal(await page.evaluate(() => window.soundCount), count, 'mute suppresses all oscillator creation')
    assert.deepEqual(errors, [])
    await page.getByRole('button', { name: '遊び方' }).click()
    assert.ok((await page.locator('#stages').textContent()).includes('★'), 'stage record appears')
    await page.close()
  })
)
await browser.close()
