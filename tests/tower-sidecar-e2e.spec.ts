import { test, expect } from '@playwright/test'

const reviewPath = '/moq-games/examples/games/tower_diffence_with_jev/model-review.html'

const ready = (page: import('@playwright/test').Page) =>
  expect(page.locator('#status')).toContainText('gltf-mesh', { timeout: 30_000 })

test('missing and corrupt sidecars fall back to their original models', async ({ page }) => {
  let mode: 'missing' | 'corrupt' = 'missing'
  const originals: string[] = []
  page.on('request', (request) => {
    if (/\/models\/.*\.glb$/.test(request.url())) originals.push(request.url())
  })
  await page.route('**/models/slime/animated.glb.*.gz.bin', (route) =>
    mode === 'missing' ? route.fulfill({ status: 404 }) : route.fulfill({ status: 200, body: 'broken gzip' })
  )
  await page.goto(reviewPath)
  await ready(page)
  expect(originals).toHaveLength(1)
  expect(originals[0].endsWith('/slime/animated.glb')).toBe(true)

  mode = 'corrupt'
  originals.length = 0
  await page.reload()
  await ready(page)
  expect(originals).toHaveLength(1)
  expect(originals[0].endsWith('/slime/animated.glb')).toBe(true)
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
  await page.goto(reviewPath)
  await ready(page)
  expect(compressed).toHaveLength(0)
  expect(originals).toHaveLength(1)
  expect(originals[0].endsWith('/slime/animated.glb')).toBe(true)
})

test('HTTP gzip content encoding is not decompressed twice', async ({ page }) => {
  const { readFile } = await import('node:fs/promises')
  const { readdir } = await import('node:fs/promises')
  const dir = 'dist/tower-defense-art/models/slime'
  const file = (await readdir(dir)).find((name) => /^animated\.glb\.[a-f0-9]{64}\.gz\.bin$/.test(name))!
  const body = await readFile(`${dir}/${file}`)
  const originals: string[] = [],
    sidecars: string[] = []
  page.on('request', (request) => {
    if (/\/models\/.*\.glb$/.test(request.url())) originals.push(request.url())
    if (/\/models\/.*\.glb\.[a-f0-9]{64}\.gz\.bin$/.test(request.url())) sidecars.push(request.url())
  })
  await page.route('**/models/slime/animated.glb.*.gz.bin', (route) =>
    route.fulfill({
      status: 200,
      headers: { 'Content-Type': 'application/octet-stream', 'Content-Encoding': 'gzip' },
      body
    })
  )
  await page.goto(reviewPath)
  await ready(page)
  expect(sidecars).toHaveLength(1)
  expect(originals).toEqual([])
})
