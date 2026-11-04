import { chromium } from '@playwright/test'
import assert from 'node:assert/strict'
import { mkdir } from 'node:fs/promises'

await mkdir('/tmp/lane-hud', { recursive: true })
const browser = await chromium.launch({ channel: 'chrome', headless: true })
try {
  for (const [width, height] of [
    [320, 568],
    [360, 640],
    [390, 844],
    [844, 390],
    [1280, 800]
  ]) {
    const page = await browser.newPage({ viewport: { width, height }, deviceScaleFactor: 1 })
    await page.goto(process.env.LANE_URL || 'http://127.0.0.1:5216/examples/games/lane-battle/')
    await page.getByRole('button', { name: 'ステージ選択へ' }).click()
    await page.getByRole('button', { name: 'ブリッと出撃' }).click()
    const result = await page.evaluate(() => {
      const elements = ['#stage-name', '#clock', '.wallet', '#pause', '#sound'].map((selector) =>
        document.querySelector(selector)
      )
      const boxes = elements.map((element) => {
        const { left, top, right, bottom, width, height } = element.getBoundingClientRect()
        return { left, top, right, bottom, width, height }
      })
      const range = document.createRange()
      range.selectNodeContents(elements[1])
      const clock = range.getBoundingClientRect()
      const points = [
        [0.5, 0.5],
        [0, 0],
        [1, 0],
        [0, 1],
        [1, 1]
      ].map(
        ([x, y]) =>
          document.elementFromPoint(clock.left + 1 + x * (clock.width - 2), clock.top + 1 + y * (clock.height - 2)) ===
          elements[1]
      )
      return { boxes, points, textVisible: elements[1].scrollWidth <= elements[1].clientWidth }
    })
    await page.screenshot({ path: `/tmp/lane-hud/${width}x${height}.png` })
    for (const [index, box] of result.boxes.entries()) {
      assert.ok(
        box.left >= 0 && box.right <= width && box.top >= 0 && box.bottom <= height,
        `${width}: box ${index} outside viewport`
      )
      for (const other of result.boxes.slice(index + 1))
        assert.ok(
          box.right <= other.left || other.right <= box.left || box.bottom <= other.top || other.bottom <= box.top,
          `${width}: HUD overlaps`
        )
    }
    assert.ok(result.points.every(Boolean) && result.textVisible, `${width}: clock covered or clipped`)
    assert.ok(
      result.boxes.slice(3).every(({ width, height }) => width >= 44 && height >= 44),
      `${width}: small touch target`
    )
    console.log(`${width}x${height}: HUD layout PASS`)
    await page.close()
  }
} finally {
  await browser.close()
}
