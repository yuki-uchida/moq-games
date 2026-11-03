import { expect, test } from '@playwright/test'

test('all original themes decode and play without shared music requests', async ({ page }) => {
  const recordings: string[] = []
  page.on('request', (request) => {
    if (request.url().includes('tower-defense-music/')) recordings.push(request.url())
  })
  await page.goto('./')
  const decoded = await page.evaluate(async () => {
    const path = `${location.pathname}src/music.ts`
    const { composeMusic, musicTracks } = (await import(path)) as typeof import('../src/music')
    const context = new AudioContext()
    const results = []
    for (const track of musicTracks) {
      const buffer = await context.decodeAudioData(composeMusic(track))
      const samples = buffer.getChannelData(0)
      results.push({
        track,
        duration: buffer.duration,
        peak: samples.reduce((peak, sample) => Math.max(peak, Math.abs(sample)), 0)
      })
    }
    await context.close()
    return results
  })
  for (const result of decoded) {
    expect(result.duration).toBeGreaterThan(28)
    expect(result.peak).toBeGreaterThan(0.1)
    expect(result.peak).toBeLessThan(1)
  }
  await page.getByRole('button', { name: '✦ はじめから' }).click()
  await expect
    .poll(() => page.locator('[data-ember-music]').evaluate((audio: HTMLAudioElement) => audio.currentTime))
    .toBeGreaterThan(0.1)
  const playback = await page.evaluate(async () => {
    const path = `${location.pathname}src/music.ts`
    const { composeMusic, musicTracks } = (await import(path)) as typeof import('../src/music')
    const audio = document.createElement('audio')
    audio.volume = 0.07
    const result = []
    for (const track of musicTracks) {
      const url = URL.createObjectURL(new Blob([composeMusic(track)], { type: 'audio/wav' }))
      audio.src = url
      await audio.play()
      await new Promise((resolve) => setTimeout(resolve, 150))
      result.push({ track, time: audio.currentTime, paused: audio.paused })
      audio.pause()
      audio.removeAttribute('src')
      audio.load()
      URL.revokeObjectURL(url)
    }
    return result
  })
  for (const result of playback) {
    expect(result.time).toBeGreaterThan(0)
    expect(result.paused).toBe(false)
  }
  expect(recordings).toEqual([])
})
