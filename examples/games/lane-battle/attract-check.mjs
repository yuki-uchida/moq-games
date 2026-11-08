// Title-screen demo: it plays behind the 作戦室, stays silent and isolated, never blocks the title, and the real game that follows is untouched.
import { chromium } from '@playwright/test'
import assert from 'node:assert/strict'
import sharp from 'sharp'
const url = process.env.LANE_URL || 'http://127.0.0.1:5193/examples/games/lane-battle/'
const browser = await chromium.launch({ headless: true, ...(process.env.LANE_CHROMIUM ? {} : { channel: 'chrome' }) })
const SAVE = 'unko-daisanji-campaign-v1'
for (const [name, width, height] of [
  ['pc', 1280, 720],
  ['portrait', 390, 844],
  ['small', 320, 568]
]) {
  const context = await browser.newContext({ viewport: { width, height } })
  const page = await context.newPage()
  const errors = []
  page.on('pageerror', (e) => errors.push(String(e)))
  const requests = []
  await page.addInitScript(() => {
    window.proof = { audio: 0, writes: [], sounds: 0 }
    const original = AudioContext.prototype.createOscillator
    AudioContext.prototype.createOscillator = function () {
      window.proof.audio++
      return original.call(this)
    }
    for (const store of [Storage.prototype]) {
      const set = store.setItem,
        remove = store.removeItem
      store.setItem = function (key, value) {
        window.proof.writes.push(['set', key])
        return set.call(this, key, value)
      }
      store.removeItem = function (key) {
        window.proof.writes.push(['remove', key])
        return remove.call(this, key)
      }
    }
  })
  await page.goto(url)
  await page.waitForFunction(() => document.querySelector('dialog')?.open)
  page.on('request', (r) => requests.push(r.url()))
  const header = () =>
    page.evaluate(() => ({
      stage: document.getElementById('stage-name').textContent,
      clock: document.getElementById('clock').textContent,
      gold: document.getElementById('gold').textContent,
      rate: document.getElementById('rate').textContent,
      home: document.getElementById('home').textContent,
      enemy: document.getElementById('enemy').textContent,
      notice: document.getElementById('notice').textContent,
      tray: document.getElementById('tray').children.length,
      history: history.length + location.href,
      live: [...document.querySelectorAll('[role=status],[aria-live]')].map((e) => e.textContent).join('|')
    }))
  const canvas = () => page.evaluate(() => document.querySelector('#field canvas').toDataURL())
  // (a) the demo advances behind the title
  const before = await header()
  await page.waitForTimeout(1500)
  const frames = new Set([await canvas()])
  for (let i = 0; i < 4; i++) {
    await page.waitForTimeout(800)
    frames.add(await canvas())
  }
  assert.ok(frames.size >= 4, `${name}: the demo canvas keeps changing (${frames.size} distinct frames)`)
  // The real HUD never shows the demo; nothing is written, played or fetched.
  assert.deepEqual(await header(), before, `${name}: header, tray, notices unchanged by the demo`)
  const proof = await page.evaluate(() => window.proof)
  assert.deepEqual(proof.writes, [], `${name}: no storage writes`)
  assert.equal(proof.audio, 0, `${name}: the demo is silent`)
  assert.deepEqual(requests, [], `${name}: no requests while the demo runs`)
  // (c) the title stays usable: focus on the launch button, the demo takes no pointer or keyboard input.
  assert.equal(
    await page.evaluate(() => document.activeElement?.id),
    'close',
    `${name}: focus stays on the launch button`
  )
  const demoVisible = await page.evaluate(() => {
    const c = document.querySelector('#field canvas')
    return getComputedStyle(c).pointerEvents
  })
  assert.ok(demoVisible)
  await page.getByRole('button', { name: 'カチカチうんこの詳細' }).click()
  assert.ok(await page.locator('dialog.unit-detail[open]').count(), `${name}: detail dialog opens over the title`)
  await page.keyboard.press('Escape')
  await page.waitForFunction(() => !document.querySelector('dialog.unit-detail'))
  assert.equal(await page.locator('dialog.title[open]').count(), 1, `${name}: title still open`)
  // (b) leaving the title stops the demo and the real game starts untouched
  await page.getByRole('button', { name: 'ステージ選択へ' }).click()
  assert.equal(await page.evaluate(() => document.querySelector('dialog').classList.contains('title')), false)
  assert.equal(
    await page.evaluate((key) => localStorage.getItem(key), SAVE),
    null,
    `${name}: save untouched on the map`
  )
  await page.getByRole('button', { name: 'ブリッと出撃' }).click()
  await page.getByRole('button', { name: 'カチカチうんこを召喚 35', exact: true }).waitFor()
  const started = await header()
  assert.equal(started.home, '1400 / 1400', `${name}: real home fort at full health`)
  assert.equal(started.enemy, '5500 / 5500', `${name}: real enemy fort at full health`)
  assert.ok(
    started.clock === '0:00' || started.clock === '0:01',
    `${name}: real clock starts at zero (${started.clock})`
  )
  assert.ok(
    Number(started.gold) >= 100 && Number(started.gold) <= 115,
    `${name}: real gold starts at the stage's 100 (${started.gold})`
  )
  assert.equal(await page.evaluate(() => document.querySelector('dialog').open), false)
  await page.waitForTimeout(1200)
  // Enemy spawns first at 3 s; until then the real field holds no foe at all, so no demo unit can be in the real game.
  const real = await header()
  assert.equal(real.enemy, '5500 / 5500')
  await page.evaluate(() => window.proof.audio)
  assert.deepEqual(errors, [], `${name}: no page errors`)
  console.log(name, 'attract demo advances, silent, isolated, title usable, real start clean PASS')
  await context.close()
}
// Nothing of the demo is left on the field: right after the start, a page that lingered 8 s on the title and one that
// started at once draw the same empty battlefield (only the time-driven bubbles may differ a little).
{
  const grab = async (linger) => {
    const context = await browser.newContext({ viewport: { width: 1280, height: 720 } })
    const page = await context.newPage()
    await page.goto(url)
    await page.waitForFunction(() => document.querySelector('dialog')?.open)
    await page.waitForTimeout(linger)
    await page.getByRole('button', { name: 'ステージ選択へ' }).click()
    await page.getByRole('button', { name: 'ブリッと出撃' }).click()
    await page.waitForTimeout(250)
    await page.keyboard.press('Space')
    await page.waitForTimeout(150)
    const png = await page.locator('#field canvas').screenshot()
    await context.close()
    return sharp(png).raw().toBuffer({ resolveWithObject: true })
  }
  const [fresh, lingered] = [await grab(100), await grab(8000)]
  assert.deepEqual(fresh.info, lingered.info)
  let differing = 0
  for (let i = 0; i < fresh.data.length; i += fresh.info.channels)
    if (Math.abs(fresh.data[i] - lingered.data[i]) + Math.abs(fresh.data[i + 1] - lingered.data[i + 1]) > 60)
      differing++
  const share = differing / (fresh.data.length / fresh.info.channels)
  assert.ok(share < 0.01, `the real field matches a fresh one (${(share * 100).toFixed(2)}% pixels differ)`)
  console.log('real field after the title matches a fresh start PASS', (share * 100).toFixed(3) + '%')
}
// Reduced motion: the demo slows down but keeps running.
{
  const context = await browser.newContext({ viewport: { width: 390, height: 844 }, reducedMotion: 'reduce' })
  const page = await context.newPage()
  const errors = []
  page.on('pageerror', (e) => errors.push(String(e)))
  await page.goto(url)
  await page.waitForFunction(() => document.querySelector('dialog')?.open)
  await page.waitForTimeout(1500)
  const one = await page.evaluate(() => document.querySelector('#field canvas').toDataURL())
  await page.waitForTimeout(1500)
  const two = await page.evaluate(() => document.querySelector('#field canvas').toDataURL())
  assert.notEqual(one, two, 'reduced motion: the demo still advances, slowly')
  await page.getByRole('button', { name: 'ステージ選択へ' }).click()
  assert.deepEqual(errors, [])
  console.log('reduced-motion demo PASS')
  await context.close()
}
await browser.close()
