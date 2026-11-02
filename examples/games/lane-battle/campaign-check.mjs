import { chromium } from '@playwright/test'
import assert from 'node:assert/strict'
const url = process.env.LANE_URL || 'http://127.0.0.1:5193/examples/games/lane-battle/'
const noScroll = (page) =>
  page.evaluate(
    () => document.documentElement.scrollWidth > innerWidth || document.documentElement.scrollHeight > innerHeight
  )
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
    await page.goto(url)
    await page.getByRole('button', { name: 'ステージ選択へ' }).click()
    assert.equal(await page.locator('#map').isVisible(), true, 'dedicated stage-select screen')
    assert.equal(await page.locator('#stages button.stage').count(), 1, 'only stage 1 is shown')
    assert.equal(await page.locator('#stages .sealed').count(), 1, 'one silhouetted stage ahead')
    assert.equal(await page.locator('#stages .stage img').count(), 2, 'a boss stands on every stage')
    await page.getByRole('button', { name: 'ブリッと出撃' }).click()
    assert.equal(await page.locator('#map').isVisible(), false)
    assert.equal(await page.locator('#tray button').count(), 2, 'starter formation')
    let won = false
    for (let i = 0; i < 300 && !won; i++) {
      await page.evaluate(() => {
        const upgrade = document.querySelector('#upgrade')
        if (Number(document.querySelector('#gold').textContent) >= 160 && !upgrade.disabled) upgrade.click()
        for (const b of [...document.querySelectorAll('#tray button')].reverse()) if (!b.disabled) b.click()
        if (!document.querySelector('#burst').disabled) document.querySelector('#burst').click()
      })
      await page.clock.runFor(1000)
      won = await page.locator('dialog').evaluate((d) => d.open)
    }
    assert.ok(won, `${name} stage 1 finishes`)
    assert.match(await page.locator('#title').textContent(), /大惨事！/, name)
    const report = await page.locator('#report').textContent()
    assert.match(report, /新しい仲間！/)
    assert.match(report, /🧻 \+50/)
    assert.match(report, /カチカチうんこ \+\d+EXP Lv\.1→/)
    console.log(name, report)
    assert.equal(await page.locator('#roster .unit').count(), 3, 'the new special joined the roster')
    assert.equal(await page.locator('#roster .unit.special[aria-pressed="true"]').count(), 1, 'and the formation')
    assert.equal(await noScroll(page), false)
    await page.screenshot({ path: `/tmp/lane-${name}-report.png` })
    await page.getByRole('button', { name: 'ステージ選択へ' }).click()
    assert.equal(await page.locator('#stages button.stage').count(), 2, 'stage 2 unlocked')
    assert.equal(await page.locator('#stages button[aria-pressed="true"] b').textContent(), '2')
    assert.ok((await page.locator('#stages').textContent()).includes('1★'), 'stage record appears')
    await page.getByRole('button', { name: /ステージ1 / }).click()
    assert.match(await page.locator('#stage-info').textContent(), /^1\. /, 'tapping a stage selects it')
    assert.equal(await noScroll(page), false)
    await page.screenshot({ path: `/tmp/lane-${name}-map.png` })
    await page.getByRole('button', { name: '編成・購入' }).click()
    // Formation edits persist; the shop sells a poop once 🧻 allow.
    await page.locator('#roster .unit.special').click()
    assert.equal(await page.locator('#roster .unit[aria-pressed="true"]').count(), 2)
    await page.evaluate(() => {
      const c = JSON.parse(localStorage.getItem('unko-daisanji-campaign-v1'))
      c.coins = 200
      localStorage.setItem('unko-daisanji-campaign-v1', JSON.stringify(c))
    })
    await page.reload()
    await page.clock.runFor(100)
    assert.match(await page.locator('#message').textContent(), /1ステージ突破済み/)
    await page.getByRole('button', { name: 'ゲリラうんこを購入 150' }).click()
    assert.match(await page.locator('#coins').textContent(), /50/)
    assert.equal(await page.locator('#roster .unit').count(), 4)
    await page.getByRole('button', { name: 'ステージ選択へ' }).click()
    await page.getByRole('button', { name: 'ブリッと出撃' }).click()
    assert.deepEqual(
      await page.locator('#tray button').evaluateAll((b) => b.map((x) => x.getAttribute('aria-label'))),
      ['カチカチうんこを召喚 35', 'コロコロうんこを召喚 65', 'ゲリラうんこを召喚 95']
    )
    assert.match(await page.locator('#enemy').textContent(), /5900/)
    assert.ok((await page.evaluate(() => window.soundCount)) > 0, 'sound synthesis triggered')
    await page.getByRole('button', { name: '音を切り替え' }).click()
    const count = await page.evaluate(() => window.soundCount)
    await page.getByRole('button', { name: 'カチカチうんこを召喚 35', exact: true }).click()
    await page.clock.runFor(2000)
    assert.equal(await page.evaluate(() => window.soundCount), count, 'mute suppresses all oscillator creation')
    assert.equal(await noScroll(page), false)
    assert.deepEqual(errors, [])
    await page.close()
  })
)
await browser.close()
