import { test, expect } from '@playwright/test'
import { openOfflineCampaign, towerPath } from './tower-defense-e2e-arrange'

test('missing and corrupt sidecars fall back to their original models', async ({ page }) => {
  const originals: string[] = []
  page.on('request', (request) => {
    if (/\/models\/.*\.glb$/.test(request.url())) originals.push(request.url())
  })
  await page.route('**/models/archer/archer-idle-candidate.glb.*.gz.bin', (route) => route.fulfill({ status: 404 }))
  await page.route('**/models/soldier/soldier-motion-v2-candidate.glb.*.gz.bin', (route) =>
    route.fulfill({ status: 200, body: 'broken gzip' })
  )
  await openOfflineCampaign(page)
  expect(originals).toHaveLength(2)
  expect(originals.some((url) => url.endsWith('/archer-idle-candidate.glb'))).toBe(true)
  expect(originals.some((url) => url.endsWith('/soldier-motion-v2-candidate.glb'))).toBe(true)
  expect(await page.evaluate(() => (window as any).towerDefenseDiagnostics().campaignPreparation.ready)).toBe(true)
})

test('without DecompressionStream models use the original URLs directly', async ({ page }) => {
  const originals: string[] = [],
    compressed: string[] = []
  await page.addInitScript(() => {
    Object.defineProperty(window, 'DecompressionStream', { value: undefined })
  })
  page.on('request', (request) => {
    if (/\/models\/.*\.glb$/.test(request.url())) originals.push(request.url())
    if (/\/models\/.*\.glb\.[a-f0-9]{64}\.gz\.bin$/.test(request.url())) compressed.push(request.url())
  })
  await page.goto(towerPath)
  await page.locator('#title-new').click()
  await page.locator('#start').click()
  await expect(page.locator('#launch')).toBeHidden({ timeout: 180_000 })
  expect(compressed).toHaveLength(0)
  expect(originals).toHaveLength(33)
  expect(await page.evaluate(() => (window as any).towerDefenseDiagnostics().campaignPreparation.ready)).toBe(true)
})

test('HTTP gzip content encoding is not decompressed twice', async ({ page }) => {
  const { readFile } = await import('node:fs/promises')
  const { readdir } = await import('node:fs/promises')
  const dir = 'dist/tower-defense-art/models/archer'
  const file = (await readdir(dir)).find((name) => /^archer-idle-candidate\.glb\.[a-f0-9]{64}\.gz\.bin$/.test(name))!
  const body = await readFile(`${dir}/${file}`)
  const originals: string[] = []
  page.on('request', (request) => {
    if (/\/models\/.*\.glb$/.test(request.url())) originals.push(request.url())
  })
  await page.route('**/models/archer/archer-idle-candidate.glb.*.gz.bin', (route) =>
    route.fulfill({
      status: 200,
      headers: { 'Content-Type': 'application/octet-stream', 'Content-Encoding': 'gzip' },
      body
    })
  )
  await openOfflineCampaign(page)
  expect(originals).toEqual([])
})
