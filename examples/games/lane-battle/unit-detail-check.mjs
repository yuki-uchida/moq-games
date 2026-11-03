import { chromium } from '@playwright/test'
import assert from 'node:assert/strict'
import { mkdir } from 'node:fs/promises'
import { addEntry, newCampaign } from './campaign.js'
import { typeOf } from './simulation.js'

const url = process.env.LANE_URL || 'http://127.0.0.1:5219/examples/games/lane-battle/'
const campaign = newCampaign()
addEntry(campaign, 'yofukashi')
await mkdir('/tmp/lane-unit-detail', { recursive: true })
const browser = await chromium.launch({ headless: true, channel: 'chrome' })
try {
  for (const [name, width, height, mobile] of [
    ['mobile', 390, 844, true],
    ['desktop', 1280, 800, false]
  ]) {
    const page = await browser.newPage({ viewport: { width, height }, isMobile: mobile, hasTouch: mobile })
    const errors = []
    page.on('pageerror', (error) => errors.push(String(error)))
    await page.addInitScript(
      (value) => localStorage.setItem('unko-daisanji-campaign-v1', JSON.stringify(value)),
      campaign
    )
    await page.goto(url)
    await page.getByRole('button', { name: 'ステージ選択へ' }).click()
    await page.getByRole('button', { name: '編成・購入' }).click()
    const formation = () =>
      page
        .locator('#roster .unit')
        .evaluateAll((buttons) =>
          buttons.map((button) => [
            button.getAttribute('aria-pressed'),
            button.querySelector('.slot')?.textContent ?? null
          ])
        )
    const before = await formation()
    const saved = await page.evaluate(() => localStorage.getItem('unko-daisanji-campaign-v1'))
    await page.screenshot({ path: `/tmp/lane-unit-detail/${name}-roster.png` })
    for (const [index, key] of ['yofukashi', 'katachi'].entries()) {
      const unit = typeOf(key)
      const trigger = page.getByRole('button', { name: `${unit.name}の詳細` })
      const box = await trigger.boundingBox()
      assert.ok(box.width >= 44 && box.height >= 44, 'info touch target')
      if (mobile) await trigger.tap()
      else await trigger.click()
      const detail = page.locator('dialog.unit-detail')
      assert.equal(await detail.isVisible(), true)
      assert.equal(await detail.locator('h2').textContent(), unit.name)
      assert.ok((await detail.textContent()).includes(unit.effectLine), 'full effect description')
      assert.ok((await detail.textContent()).includes(unit.line), 'unit description')
      assert.equal(await detail.evaluate((element) => element.scrollWidth <= element.clientWidth), true)
      assert.equal(await detail.locator('button').evaluate((element) => element === document.activeElement), true)
      assert.deepEqual(await formation(), before)
      if (!index) {
        await page.waitForTimeout(400)
        await page.screenshot({ path: `/tmp/lane-unit-detail/${name}-dialog.png` })
      }
      if (!index) await detail.getByRole('button', { name: '閉じる' }).click()
      else await page.keyboard.press('Escape')
      await detail.waitFor({ state: 'detached' })
      assert.equal(await trigger.evaluate((element) => element === document.activeElement), true, 'focus restored')
      assert.deepEqual(await formation(), before)
      assert.equal(await page.evaluate(() => localStorage.getItem('unko-daisanji-campaign-v1')), saved)
    }
    const trigger = page.getByRole('button', { name: '夜ふかしの詳細' })
    await trigger.press('Enter')
    await page.mouse.click(2, 2)
    await page.locator('dialog.unit-detail').waitFor({ state: 'detached' })
    assert.equal(await trigger.evaluate((element) => element === document.activeElement), true)
    assert.deepEqual(await formation(), before)
    assert.equal(await page.evaluate(() => localStorage.getItem('unko-daisanji-campaign-v1')), saved)
    assert.deepEqual(errors, [])
    await page.close()
    console.log(name, 'detail, dismissal, focus, formation and save PASS')
  }
} finally {
  await browser.close()
}
