import { expect, test } from '@playwright/test'
import { enterBattle } from './shell-helper'

test('context loss before start keeps the board inert', async ({ page }) => {
  await page.addInitScript(() =>
    localStorage.setItem('ember-grid:settings:v1', JSON.stringify({ version: 1, story: false, tutorial: false }))
  )
  await page.goto('./')
  let releaseModels = () => {}
  const modelsBlocked = new Promise<void>((resolve) => (releaseModels = resolve))
  await page.route('**/*.glb', async (route) => {
    await modelsBlocked
    await route.continue()
  })
  await page.locator('canvas.stage').evaluate((canvas: HTMLCanvasElement) => {
    const extension = canvas.getContext('webgl2')!.getExtension('WEBGL_lose_context')!
    Object.assign(window, { loseContextExtension: extension })
    extension.loseContext()
  })
  await expect(page.locator('.context-notice')).toBeVisible()
  await page.getByRole('button', { name: '✦ はじめから' }).click()
  await page.getByRole('button', { name: '⚔ クラシック' }).click()
  await expect(page.locator('.preparation')).toBeVisible()
  await expect(page.locator('#app main')).toHaveAttribute('inert', '')
  releaseModels()
  await expect(page.locator('.preparation')).toHaveCount(0, { timeout: 90000 })
  await expect(page.locator('#app main')).toHaveAttribute('inert', '')
  await page.evaluate(() =>
    (window as unknown as { loseContextExtension: WEBGL_lose_context }).loseContextExtension.restoreContext()
  )
  await expect(page.locator('.context-notice')).toBeHidden({ timeout: 30000 })
  await expect(page.locator('#end')).toBeEnabled({ timeout: 90000 })
})

test('renderer failure permits retry without changing save', async ({ page }) => {
  await page.addInitScript(() => {
    localStorage.setItem(
      'ember-grid:save:v1',
      JSON.stringify({
        version: 1,
        difficulty: 'classic',
        formation: 'balanced',
        checkpoints: [],
        furthest: 5,
        cleared: [],
        bestTurns: {}
      })
    )
    const original = HTMLCanvasElement.prototype.getContext
    let fail = true
    Object.assign(window, { allowWebGL: () => (fail = false) })
    HTMLCanvasElement.prototype.getContext = function (...args: Parameters<typeof original>) {
      if (fail && (args[0] === 'webgl2' || args[0] === 'webgl')) return null
      return original.apply(this, args)
    } as typeof original
  })
  const errors: Error[] = []
  page.on('pageerror', (error) => errors.push(error))
  await page.goto('./')
  const saved = await page.evaluate(() => localStorage.getItem('ember-grid:save:v1'))
  await expect(page.getByText(/WebGL.*利用できません/)).toBeVisible()
  for (const [width, height] of [
    [1280, 800],
    [390, 844]
  ]) {
    await page.setViewportSize({ width, height })
    await page.screenshot({ path: `test-results/ember-webgl-failure-${width}.png` })
  }
  await page.getByRole('button', { name: '⚙ 設定' }).click()
  await page.getByRole('button', { name: '戻る' }).click()
  expect(await page.evaluate(() => localStorage.getItem('ember-grid:save:v1'))).toBe(saved)
  await page.evaluate(() => (window as unknown as { allowWebGL: () => void }).allowWebGL())
  await page.getByRole('button', { name: '画面を再試行' }).click()
  await expect(page.locator('canvas.stage')).toBeAttached()
  expect(errors).toEqual([])
})

test('missing sound does not block battle', async ({ page }) => {
  await page.addInitScript(() => {
    localStorage.setItem('ember-grid:sound', 'off')
    localStorage.setItem('ember-grid:settings:v1', JSON.stringify({ version: 1, story: false, tutorial: false }))
  })
  let available = false
  let requests = 0
  await page.route('**/tower-defense-sfx/*_attack.wav', (route) => {
    requests++
    return available ? route.continue() : route.fulfill({ status: 503 })
  })
  await enterBattle(page)
  await expect(page.locator('#end')).toBeEnabled({ timeout: 90000 })
  await expect(page.getByText(/効果音.*再試行/)).toBeVisible()
  await page.locator('#danger').click()
  await expect(page.locator('#danger')).toHaveAttribute('aria-pressed', 'true')
  for (const [width, height] of [
    [1280, 800],
    [390, 844]
  ]) {
    await page.setViewportSize({ width, height })
    await page.screenshot({ path: `test-results/ember-sound-failure-${width}.png` })
  }
  available = true
  await expect(page.locator('.sound-notice')).toBeHidden({ timeout: 60000 })
  expect(requests).toBeGreaterThan(1)
})

test('continue requests chosen chapter before chapter one', async ({ page }) => {
  await page.goto('./')
  await page.evaluate(async () => {
    const gamePath = './src/game.ts',
      savePath = './src/save.ts'
    const { createGame } = await import(gamePath)
    const { freshSave, snapshotGame } = await import(savePath)
    localStorage.setItem(
      'ember-grid:save:v1',
      JSON.stringify({ ...freshSave('classic'), furthest: 5, suspend: snapshotGame(createGame(5, 'balanced')) })
    )
  })
  const requests: string[] = []
  page.on('request', (request) => {
    if (/\.glb/.test(request.url())) requests.push(request.url())
  })
  await page.reload()
  await page.getByRole('button', { name: /つづきから/ }).click()
  await expect(page.locator('#end')).toBeEnabled({ timeout: 90000 })
  expect(requests.some((url) => /dragon/i.test(url))).toBe(true)
  expect(requests.some((url) => /goblin/i.test(url))).toBe(false)
})

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
