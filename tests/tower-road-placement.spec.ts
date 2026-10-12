import { test, expect } from '@playwright/test'
import {
  openOfflineCampaign,
  dragUnitToWorld,
  dragTouchUnitToWorld,
  beginFieldUnitDragToWorld
} from './tower-defense-e2e-arrange'

for (const viewport of [
  { width: 2048, height: 1173 },
  { width: 1440, height: 900 },
  { width: 390, height: 844 }
]) {
  for (const touch of [false, true]) {
    test(`road deployment and reposition survives continue ${viewport.width}x${viewport.height} ${touch ? 'touch' : 'mouse'}`, async ({
      page
    }) => {
      await page.setViewportSize(viewport)
      await openOfflineCampaign(page)
      const point = { x: 300, y: (128 * 920) / 1064 }
      if (touch) await dragTouchUnitToWorld(page, 'soldier', point)
      else await dragUnitToWorld(page, 'soldier', point)
      const unit = page.locator('.unit-health.player[data-unit-type="soldier"]')
      await expect(unit).toHaveCount(1)
      await expect.poll(async () => Number(await unit.getAttribute('data-home-x'))).toBeCloseTo(point.x, 0)
      const destination = { x: 350, y: point.y }
      for (const site of [{ x: (802 * 1280) / 1478, y: (653 * 920) / 1064 }, { x: 295, y: 405 }, destination]) {
        if (touch) {
          const bounds = (await page.locator('.defender-handle').boundingBox())!
          const field = (await page.locator('#field').boundingBox())!
          const start = { x: bounds.x + bounds.width / 2, y: bounds.y + bounds.height / 2 }
          const target = { x: field.x + (site.x * field.width) / 1280, y: field.y + (site.y * field.height) / 920 }
          const cdp = await page.context().newCDPSession(page)
          try {
            await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ ...start, id: 1 }] })
            for (let step = 1; step <= 12; step++) {
              await cdp.send('Input.dispatchTouchEvent', {
                type: 'touchMove',
                touchPoints: [
                  {
                    x: start.x + ((target.x - start.x) * step) / 12,
                    y: start.y + ((target.y - start.y) * step) / 12,
                    id: 1
                  }
                ]
              })
              await page.evaluate(() => new Promise<void>((resolve) => requestAnimationFrame(() => resolve())))
            }
            await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] })
          } finally {
            await cdp.detach()
          }
        } else {
          await beginFieldUnitDragToWorld(page, 'soldier', site)
          await page.mouse.up()
        }
        await expect.poll(async () => Number(await unit.getAttribute('data-home-x'))).toBeCloseTo(site.x, 0)
        await expect.poll(async () => Number(await unit.getAttribute('data-home-y'))).toBeCloseTo(site.y, 0)
      }
      await page.locator('#game-title-return').click()
      await expect(page.locator('#title-continue')).toBeEnabled()
      await page.reload()
      await page.locator('#title-continue').click()
      await expect(unit).toHaveCount(1)
      await expect.poll(async () => Number(await unit.getAttribute('data-home-x'))).toBeCloseTo(destination.x, 0)
      await expect.poll(async () => Number(await unit.getAttribute('data-home-y'))).toBeCloseTo(destination.y, 0)
    })
  }
}
