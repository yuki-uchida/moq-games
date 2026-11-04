import { expect, test } from '@playwright/test'
import { enterBattle } from './shell-helper'

test('shows the first contact without encoding an image during combat', async ({ page }) => {
  await page.addInitScript(() => {
    localStorage.setItem(
      'ember-grid:settings:v1',
      JSON.stringify({ version: 1, story: false, tutorial: false, bgm: 0, sfx: 0, speed: 'normal', motion: 'system' })
    )
  })
  await enterBattle(page, './?seed=7')
  await expect(page.locator('#end')).toBeEnabled({ timeout: 90000 })
  await page.getByRole('button', { name: /2,4 風読み/ }).click()
  await page.getByRole('button', { name: /4,4 平地 移動可能/ }).click()
  const enemy = page.getByRole('button', { name: /7,4 灰牙/ })
  await enemy.click()
  await expect(page.locator('#forecast')).toBeVisible()
  await page.evaluate(() => {
    const original = HTMLCanvasElement.prototype.toDataURL
    document.documentElement.dataset.encodes = '0'
    document.documentElement.dataset.contacts = '0'
    HTMLCanvasElement.prototype.toDataURL = function (...args) {
      document.documentElement.dataset.encodes = String(Number(document.documentElement.dataset.encodes) + 1)
      return original.apply(this, args)
    }
    new MutationObserver((records) => {
      for (const record of records)
        for (const node of record.addedNodes)
          if (node instanceof HTMLElement && node.classList.contains('combat-contact') && node.style.backgroundImage)
            document.documentElement.dataset.contacts = String(Number(document.documentElement.dataset.contacts) + 1)
    }).observe(document.body, { childList: true, subtree: true })
  })
  await page.getByRole('button', { name: '攻撃', exact: true }).click()
  await expect(enemy).toHaveAttribute('aria-label', /HP 2/, { timeout: 30000 })
  expect(await page.locator('html').getAttribute('data-contacts')).toBe('1')
  expect(await page.locator('html').getAttribute('data-encodes')).toBe('0')
})

test('keeps combat playable when an optional contact image cannot be encoded', async ({ page }) => {
  await page.addInitScript(() => {
    localStorage.setItem(
      'ember-grid:settings:v1',
      JSON.stringify({ version: 1, story: false, tutorial: false, bgm: 0, sfx: 0, speed: 'normal', motion: 'system' })
    )
    const original = HTMLCanvasElement.prototype.toDataURL
    HTMLCanvasElement.prototype.toDataURL = function (...args) {
      if (this.width === 256 && this.height === 32) throw new Error('contact image unavailable')
      return original.apply(this, args)
    }
  })
  await enterBattle(page, './?seed=7')
  await expect(page.locator('#end')).toBeEnabled({ timeout: 90000 })
  await expect(page.locator('.preparation')).toHaveCount(0)
  await page.getByRole('button', { name: /2,4 風読み/ }).click()
  await page.getByRole('button', { name: /4,4 平地 移動可能/ }).click()
  const enemy = page.getByRole('button', { name: /7,4 灰牙/ })
  await enemy.click()
  await page.getByRole('button', { name: '攻撃', exact: true }).click()
  await expect(enemy).toHaveAttribute('aria-label', /HP 2/, { timeout: 30000 })
})
