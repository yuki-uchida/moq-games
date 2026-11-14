import { expect, test, type Page } from '@playwright/test'
import { openGame, reloadGame } from './hoshi-no-hamham-helpers'

// The overlay lays its two screen gradients (the vignette, the red pulse of a hit) and its popup texts over the
// stage as pictures that were drawn once. These tests draw the same frame with the pictures and with the direct
// gradient fills and text calls they replace, and compare the canvas.

const SAVE = {
  version: 1,
  cleared: [1, 2, 3, 4, 5, 6, 7, 8, 9],
  unlocked: 10,
  best: {},
  muted: true,
  seenOpening: true
}

interface Overlay {
  hurt(): void
  popup(text: string, x: number, y: number, color?: string): void
  clearPopups(text: string): void
  update(dt: number): void
}

declare global {
  interface Window {
    __hamham: {
      app: {
        paused: boolean
        screen: string
        renderer: { k: number; ctx: CanvasRenderingContext2D; canvas: HTMLCanvasElement }
        session: {
          view: { overlay: Overlay; draw(): void; lastView: { x: number; y: number } }
          director: { current?: string | null; inputLocked: boolean }
        } | null
      }
    }
  }
}

async function openPausedStage(page: Page, no: number) {
  await openGame(page)
  await page.evaluate((save) => localStorage.setItem('hoshi-no-hamham-v1', JSON.stringify(save)), SAVE)
  await reloadGame(page)
  await page.getByRole('button', { name: 'つづきから' }).click()
  await page
    .locator('.stage-card')
    .nth(no - 1)
    .click()
  for (let i = 0; i < 10; i++) {
    const next = page.locator('#story-next')
    if (!(await next.isVisible())) break
    await next.click()
  }
  await expect(page.locator('#hud')).toBeVisible()
  await page.waitForFunction(
    () => {
      const session = window.__hamham.app.session
      return Boolean(session) && session!.director.current == null && !session!.director.inputLocked
    },
    null,
    { timeout: 20_000 }
  )
  // The pause menu stops the loop, so the frames below are the only ones drawn.
  await page.keyboard.press('Escape')
  await expect(page.locator('#pause-screen')).toBeVisible()
}

/**
 * Draws the stage's current frame twice, with the overlay's pictures and without, after `prepare` has set the
 * overlay up, and returns how much the two canvases differ: the largest difference of any colour channel, the
 * share of pixels that differ by more than 8 levels, and the mean difference over the rows of `band` (view pixels).
 */
async function compare(page: Page, setup: 'hurt' | 'popup') {
  return page.evaluate(async (kind) => {
    const { overlayPictures } = (await import('/src/view/overlay.ts')) as { overlayPictures: { enabled: boolean } }
    const { renderer, session } = window.__hamham.app
    const view = session!.view
    const { ctx, canvas, k } = renderer
    const frame = (pictures: boolean) => {
      overlayPictures.enabled = pictures
      if (kind === 'hurt') view.overlay.hurt()
      else {
        // A fresh popup each time: its picture is made on the first draw. Aged past its pop and before its fade.
        view.overlay.clearPopups('ナイス！')
        view.overlay.popup('ナイス！', view.lastView.x + 320, view.lastView.y + 150, '#ffd45e')
        view.overlay.update(0.3)
      }
      view.draw()
      return ctx.getImageData(0, 0, canvas.width, canvas.height).data
    }
    const a = frame(true)
    const b = frame(false)
    overlayPictures.enabled = true
    let max = 0
    let over = 0
    let sum = 0
    for (let i = 0; i < a.length; i += 4) {
      const d = Math.max(Math.abs(a[i] - b[i]), Math.abs(a[i + 1] - b[i + 1]), Math.abs(a[i + 2] - b[i + 2]))
      if (d > max) max = d
      if (d > 8) over += 1
      sum += d
    }
    const pixels = a.length / 4
    // The popup's own box (view pixels around its centre), for the text comparison.
    const box = { x0: 250, x1: 390, y0: 110, y1: 160 }
    let boxSum = 0
    let boxOver = 0
    let boxPixels = 0
    for (let y = box.y0 * k; y < box.y1 * k; y++)
      for (let x = box.x0 * k; x < box.x1 * k; x++) {
        const i = (y * canvas.width + x) * 4
        const d = Math.max(Math.abs(a[i] - b[i]), Math.abs(a[i + 1] - b[i + 1]), Math.abs(a[i + 2] - b[i + 2]))
        boxSum += d
        if (d > 48) boxOver += 1
        boxPixels += 1
      }
    return {
      k,
      max,
      overShare: over / pixels,
      mean: sum / pixels,
      boxMean: boxSum / boxPixels,
      boxOverShare: boxOver / boxPixels
    }
  }, setup)
}

for (const viewport of [
  { name: '1280x720', width: 1280, height: 720, ratio: 1 },
  { name: 'a phone, 844x390 at ratio 3', width: 844, height: 390, ratio: 3 }
]) {
  test(`the vignette and the red pulse look the same as pictures as they did as gradients (${viewport.name})`, async ({
    browser
  }) => {
    const context = await browser.newContext({
      viewport: { width: viewport.width, height: viewport.height },
      deviceScaleFactor: viewport.ratio
    })
    const page = await context.newPage()
    const errors: string[] = []
    page.on('pageerror', (error) => errors.push(error.message))
    await openPausedStage(page, 2)
    const diff = await compare(page, 'hurt')
    console.log(`[overlay gradients, ${viewport.name}, k=${diff.k}] ${JSON.stringify(diff)}`)
    // A picture of 640×360 scaled up smoothly against a gradient shaded per device pixel: rounding only.
    expect(diff.max).toBeLessThanOrEqual(6)
    expect(diff.overShare).toBe(0)
    expect(diff.mean).toBeLessThan(1.5)
    expect(errors).toEqual([])
    await context.close()
  })

  test(`a popup's text looks the same as a picture as it did drawn as text (${viewport.name})`, async ({ browser }) => {
    const context = await browser.newContext({
      viewport: { width: viewport.width, height: viewport.height },
      deviceScaleFactor: viewport.ratio
    })
    const page = await context.newPage()
    const errors: string[] = []
    page.on('pageerror', (error) => errors.push(error.message))
    await openPausedStage(page, 2)
    const diff = await compare(page, 'popup')
    console.log(`[overlay popup, ${viewport.name}, k=${diff.k}] ${JSON.stringify(diff)}`)
    // The same glyphs at the same size and place; the edges may land a fraction of a device pixel apart.
    expect(diff.boxMean).toBeLessThan(6)
    expect(diff.boxOverShare).toBeLessThan(0.04)
    // Nothing outside the popup changes with it.
    expect(diff.overShare).toBeLessThan(0.01)
    expect(errors).toEqual([])
    await context.close()
  })
}
