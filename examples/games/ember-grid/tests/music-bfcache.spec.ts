import { expect, test } from '@playwright/test'

test.use({ launchOptions: { ignoreDefaultArgs: ['--disable-back-forward-cache'] } })

test('resumes music after returning from the back-forward cache', async ({ page }) => {
  await page.addInitScript(() => {
    window.addEventListener('pagehide', (event) => sessionStorage.setItem('bfcache-hide', String(event.persisted)))
    window.addEventListener('pageshow', (event) => sessionStorage.setItem('bfcache-show', String(event.persisted)))
  })
  await page.goto('./')
  await page.getByRole('button', { name: '✦ はじめから' }).click()
  const music = page.locator('[data-ember-music]')
  await expect.poll(() => music.evaluate((audio: HTMLAudioElement) => audio.currentTime)).toBeGreaterThan(0.3)
  const before = await music.evaluate((audio: HTMLAudioElement) => audio.currentTime)
  await page.goto('/moq-games/')
  await page.goBack({ waitUntil: 'commit' })
  expect(await page.evaluate(() => sessionStorage.getItem('bfcache-hide'))).toBe('true')
  expect(await page.evaluate(() => sessionStorage.getItem('bfcache-show'))).toBe('true')
  await expect(music).toHaveJSProperty('paused', false)
  await expect.poll(() => music.evaluate((audio: HTMLAudioElement) => audio.currentTime)).toBeGreaterThan(before + 0.3)
})
