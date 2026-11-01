import { test, expect } from '@playwright/test'
import { towerPath } from './tower-defense-e2e-arrange'
import { createHash } from 'node:crypto'
import { writeFile } from 'node:fs/promises'
import sharp from 'sharp'
test.use({ viewport: { width: 600, height: 500 }, video: 'on' })

test.describe('meshopt source equivalence', () => {
  for (const [role, motion] of [
    ['soldier', 'walk'],
    ['slime', 'walk'],
    ['mage', 'attack'],
    ['tank', 'walk'],
    ['dragon', 'breath']
  ]) {
    test(`${role} ${motion} preserves source poses and rendered appearance`, async ({ page, browser }, testInfo) => {
      const sourceContext = await browser.newContext({
        baseURL: testInfo.project.use.baseURL,
        viewport: { width: 600, height: 500 },
        recordVideo: { dir: testInfo.outputPath('source-video'), size: { width: 600, height: 500 } }
      })
      const source = await sourceContext.newPage()
      await source.addInitScript(() => Object.defineProperty(window, 'DecompressionStream', { value: undefined }))
      const requests: string[] = []
      page.on('request', (request) => {
        if (/\/models\/.*\.glb/.test(request.url())) requests.push(request.url())
      })
      const pose = async (target: typeof page, phase: number) => {
        const before = await target.locator('#viewer-timeline').evaluate((node, fraction) => {
          const timeline = node as HTMLInputElement
          timeline.value = String(Number(timeline.max) * fraction)
          timeline.dispatchEvent(new Event('input', { bubbles: true }))
          return (window as any).__extraViewerDiagnostics().renderCount
        }, phase)
        await expect
          .poll(() => target.evaluate(() => (window as any).__extraViewerDiagnostics().renderCount))
          .toBeGreaterThan(before)
        expect(await target.evaluate(() => (window as any).__extraViewerDiagnostics().paused)).toBe(true)
        return target.locator('#viewer-canvas').screenshot()
      }
      try {
        for (const target of [source, page]) {
          // Fit both cameras at pose zero, independently of model download/decode time.
          // Real RAF rendering continues; the normal clock is restored for playback below.
          await target.addInitScript(() => {
            const raf = window.requestAnimationFrame.bind(window)
            window.requestAnimationFrame = (callback) =>
              raf((time) => callback((window as any).__meshoptRunClock ? time : 0))
          })
          await target.goto(towerPath.replace('index.html', 'extra.html'))
          await target.addStyleTag({ content: '#viewer-canvas { width: 300px !important; height: 200px !important }' })
          await target.locator('#viewer-role').selectOption(role)
          await target.locator('#viewer-motion').selectOption(motion)
          await expect
            .poll(
              () =>
                target.evaluate(() => {
                  const d = (window as any).__extraViewerDiagnostics?.()
                  return [d?.state, d?.role, d?.motion, d?.actor?.visible]
                }),
              { timeout: 90_000 }
            )
            .toEqual(['ready', role, motion, true])
        }
        const hashes = [new Set<string>(), new Set<string>()],
          errors: number[] = []
        for (const phase of [0, 0.2, 0.4, 0.6, 0.8]) {
          const frames = [await pose(source, phase), await pose(page, phase)]
          for (const [i, frame] of frames.entries()) {
            hashes[i].add(createHash('sha256').update(frame).digest('hex'))
            const path = testInfo.outputPath(`${role}-${motion}-${phase}-${i ? 'meshopt' : 'source'}.png`)
            await writeFile(path, frame)
            await testInfo.attach(`${role}-${motion}-${phase}-${i ? 'meshopt' : 'source'}`, {
              path,
              contentType: 'image/png'
            })
          }
          const [a, b] = await Promise.all(frames.map((frame) => sharp(frame).removeAlpha().raw().toBuffer()))
          expect(a.length).toBe(b.length)
          let squared = 0
          for (let i = 0; i < a.length; i++) squared += (a[i] - b[i]) ** 2
          const rmse = Math.sqrt(squared / a.length) / 255
          errors.push(rmse)
          expect(rmse, `${role}/${motion} phase ${phase}`).toBeLessThan(0.01)
        }
        expect(hashes[0].size, 'source clip must visibly animate').toBeGreaterThan(1)
        expect(hashes[1].size, 'meshopt clip must visibly animate').toBeGreaterThan(1)
        expect(requests.some((url) => url.endsWith('.gz.bin'))).toBe(true)
        expect(requests.filter((url) => url.endsWith('.glb'))).toEqual([])
        const metrics = testInfo.outputPath('pixel-errors.json')
        await writeFile(metrics, JSON.stringify({ role, motion, phases: [0, 0.2, 0.4, 0.6, 0.8], rmse: errors }))
        await testInfo.attach('pixel-errors', {
          path: metrics,
          contentType: 'application/json'
        })
        // Record actual playback too, independently of the fixed-pose comparisons.
        for (const target of [source, page]) {
          await pose(target, 0)
          await target.evaluate(() => {
            ;(window as any).__meshoptRunClock = true
          })
          await target.locator('#viewer-play').click()
          await expect
            .poll(
              () =>
                target.evaluate(() => {
                  const d = (window as any).__extraViewerDiagnostics()
                  return d.seconds / d.duration
                }),
              { intervals: [100], timeout: 30_000 }
            )
            .toBeGreaterThan(0.8)
          await target.locator('#viewer-play').click()
        }
      } finally {
        await sourceContext.close()
        const video = source.video()
        if (video) {
          const path = testInfo.outputPath('source-playback.webm')
          await video.saveAs(path)
          await testInfo.attach(`${role}-${motion}-source-playback`, {
            path,
            contentType: 'video/webm'
          })
        }
      }
    })
  }
})
