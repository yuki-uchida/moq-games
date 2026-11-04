import { chromium } from '@playwright/test'
import assert from 'node:assert/strict'
import { mkdir } from 'node:fs/promises'
import { newCampaign } from './campaign.js'
import { POOPS } from './simulation.js'

const url = process.env.LANE_URL || 'http://127.0.0.1:5220/examples/games/lane-battle/'
const campaign = Object.assign(newCampaign(), { cleared: 5, coins: 2000 })
const available = POOPS.find((unit) => unit.key === 'geri')
const locked = POOPS.find((unit) => unit.price && unit.unlock > campaign.cleared)
await mkdir('/tmp/lane-shop-detail', { recursive: true })
const browser = await chromium.launch({ headless: true, channel: 'chrome' })
try {
  for (const [name, width, height, mobile] of [
    ['mobile', 390, 844, true],
    ['desktop', 1280, 800, false]
  ]) {
    const page = await browser.newPage({ viewport: { width, height }, isMobile: mobile, hasTouch: mobile })
    await page.addInitScript(
      (value) => localStorage.setItem('unko-daisanji-campaign-v1', JSON.stringify(value)),
      campaign
    )
    await page.goto(url)
    await page.getByRole('button', { name: 'ステージ選択へ' }).click()
    await page.getByRole('button', { name: '編成・購入' }).click()
    const saved = await page.evaluate(() => localStorage.getItem('unko-daisanji-campaign-v1'))
    const snapshot = () =>
      page.evaluate(() => ({
        coins: document.querySelector('#coins').textContent,
        roster: document.querySelector('#roster').innerHTML,
        save: localStorage.getItem('unko-daisanji-campaign-v1')
      }))
    const before = await snapshot()
    for (const [index, unit] of [available, locked].entries()) {
      const trigger = page.locator('#shop').getByRole('button', { name: `${unit.name}の詳細` })
      await trigger.scrollIntoViewIfNeeded()
      if (!index) await page.screenshot({ path: `/tmp/lane-shop-detail/${name}-shop.png` })
      const box = await trigger.boundingBox()
      assert.ok(box.width >= 44 && box.height >= 44)
      if (mobile) await trigger.tap()
      else await trigger.click()
      const detail = page.locator('dialog.unit-detail')
      assert.equal(await detail.locator('h2').textContent(), unit.name)
      const text = await detail.textContent()
      assert.ok(text.includes(unit.effectLine) && text.includes(String(unit.price)) && text.includes(`HP${unit.hp}`))
      assert.ok(text.includes(`ステージ${unit.unlock}クリアで解禁`))
      assert.equal(await detail.locator('button').evaluate((button) => button === document.activeElement), true)
      assert.deepEqual(await snapshot(), before)
      if (!index) {
        await page.waitForTimeout(400)
        await page.screenshot({ path: `/tmp/lane-shop-detail/${name}-dialog.png` })
      }
      if (index) await page.keyboard.press('Escape')
      else await detail.getByRole('button', { name: '閉じる' }).click()
      await detail.waitFor({ state: 'detached' })
      assert.equal(await trigger.evaluate((button) => button === document.activeElement), true)
      assert.deepEqual(await snapshot(), before)
    }
    const trigger = page.locator('#shop').getByRole('button', { name: `${available.name}の詳細` })
    await trigger.click()
    await page.mouse.click(2, 2)
    await page.locator('dialog.unit-detail').waitFor({ state: 'detached' })
    assert.equal(await trigger.evaluate((button) => button === document.activeElement), true)
    assert.equal(await page.evaluate(() => localStorage.getItem('unko-daisanji-campaign-v1')), saved)
    await page
      .locator('#shop')
      .getByRole('button', { name: `${available.name}を購入 ${available.price}` })
      .click()
    const bought = JSON.parse(await page.evaluate(() => localStorage.getItem('unko-daisanji-campaign-v1')))
    assert.equal(bought.coins, campaign.coins - available.price)
    assert.ok(bought.roster.some((unit) => unit.key === available.key))
    console.log(name, 'shop details, locked details, dismissals, focus, save and purchase PASS')
    await page.close()
  }
} finally {
  await browser.close()
}
