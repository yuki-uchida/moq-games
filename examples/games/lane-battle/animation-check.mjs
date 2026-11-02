import { chromium } from '@playwright/test'
import sharp from 'sharp'
import fs from 'node:fs/promises'
import { execFileSync } from 'node:child_process'
const root = process.env.LANE_EVIDENCE_DIR || '/tmp/lane-animation-evidence'
await fs.mkdir(root, { recursive: true })
const browser = await chromium.launch({ channel: 'chrome', headless: true })
for (const [pass, width, height, start] of [
  [1, 1280, 800, 18],
  [2, 1280, 800, 24],
  [3, 390, 844, 24],
  [4, 844, 390, 28],
  [5, 1280, 800, 38]
]) {
  const context = await browser.newContext({ viewport: { width, height } })
  const page = await context.newPage()
  await page.clock.install({ time: new Date(0) })
  await page.clock.pauseAt(new Date(0))
  await page.goto(process.env.LANE_URL || 'http://127.0.0.1:5193/examples/games/lane-battle/')
  await page.getByRole('button', { name: 'ステージ選択へ' }).click()
  await page.getByRole('button', { name: 'ブリッと出撃' }).click()
  const deploy = () =>
    page.evaluate(() => {
      const cards = document.querySelectorAll('#tray button')
      const b = cards[(window.reviewNext || 0) % cards.length]
      if (!b.disabled) {
        b.click()
        window.reviewNext = (window.reviewNext || 0) + 1
      }
    })
  for (let i = 0; i < start; i++) {
    await deploy()
    await page.clock.runFor(1000)
  }
  const images = []
  for (let frame = 0; frame < 40; frame++) {
    if (frame % 10 === 0) await deploy()
    await page.clock.runFor(100)
    {
      const buffer = (await page.locator('main > canvas').count())
        ? await page.locator('main > canvas').screenshot()
        : await page.locator('canvas').first().screenshot()
      const path = `${root}/pass-${pass}-${frame}.png`
      await fs.writeFile(path, buffer)
      images.push(path)
    }
  }
  await page.screenshot({ path: `${root}/pass-${pass}-native.png` })
  await context.close()
  execFileSync(process.env.FFMPEG_BIN || 'ffmpeg', [
    '-y',
    '-loglevel',
    'error',
    '-framerate',
    '10',
    '-i',
    `${root}/pass-${pass}-%d.png`,
    '-c:v',
    'libvpx-vp9',
    '-pix_fmt',
    'yuv420p',
    `${root}/pass-${pass}.webm`
  ])
  const meta = await sharp(images[0]).metadata()
  const w = Math.min(meta.width, 640),
    h = Math.round((meta.height * w) / meta.width)
  const tiles = await Promise.all(
    images
      .filter((_, i) => i % 4 === 0)
      .map(async (input, i) => ({
        input: await sharp(input).resize(w, h).png().toBuffer(),
        left: (i % 2) * w,
        top: Math.floor(i / 2) * h
      }))
  )
  await sharp({ create: { width: w * 2, height: h * 5, channels: 3, background: '#fff' } })
    .composite(tiles)
    .png()
    .toFile(`${root}/pass-${pass}-sequence.png`)
  console.log(
    new Date().toISOString(),
    'recorded',
    pass,
    width,
    height,
    start,
    await fs.stat(`${root}/pass-${pass}.webm`).then((s) => s.size)
  )
}
await browser.close()
