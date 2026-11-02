import { expect, test } from '@playwright/test'
import { enterBattle } from './shell-helper'

test('title unlock, transition, and WebGL recovery', async ({ page }) => {
  await page.addInitScript(() => {
    setInterval(
      () => document.querySelector<HTMLButtonElement>('.story-overlay button, .story-credits button')?.click(),
      100
    )
  })
  await page.goto('./')
  const music = page.locator('[data-ember-music]')
  expect(await music.evaluate((element: HTMLAudioElement) => element.paused)).toBe(true)
  await page.screenshot({ path: 'test-results/polish-title.png' })
  await page.getByRole('button', { name: '✦ はじめから' }).click()
  await expect.poll(() => music.evaluate((element: HTMLAudioElement) => element.paused)).toBe(false)
  await page.getByRole('button', { name: '⚔ クラシック' }).click()
  await expect(page.locator('.screen-transition')).toBeVisible()
  await page.screenshot({ path: 'test-results/polish-transition.png' })
  await expect(page.locator('#end')).toBeEnabled({ timeout: 90000 })
  const canvas = page.locator('canvas.stage')
  await canvas.evaluate((element: HTMLCanvasElement) => {
    const extension = element.getContext('webgl2')!.getExtension('WEBGL_lose_context')!
    if (!extension) throw new Error('WEBGL_lose_context unavailable')
    Object.assign(window, { loseContextExtension: extension })
    extension.loseContext()
  })
  await expect(page.locator('.context-notice')).toBeVisible()
  await expect(page.locator('#app main')).toHaveAttribute('inert', '')
  await page.screenshot({ path: 'test-results/polish-context-loss.png' })
  await page.evaluate(() =>
    (window as unknown as { loseContextExtension: WEBGL_lose_context }).loseContextExtension.restoreContext()
  )
  await expect(page.locator('.context-notice')).toBeHidden({ timeout: 30000 })
  await expect(page.locator('#end')).toBeEnabled()
  await page.getByRole('button', { name: /2,5 燈守/ }).click()
  await expect(page.locator('#selection')).toContainText('燈守')
})

test('landing card', async ({ page }) => {
  await page.goto('/moq-games/')
  await page.screenshot({ path: 'test-results/polish-landing.png', fullPage: true })
  await expect(page.getByRole('article', { name: 'デスガイヤ' })).toBeVisible()
})
