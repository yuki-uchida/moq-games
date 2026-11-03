import { chromium } from '@playwright/test'
import assert from 'node:assert/strict'
const browser = await chromium.launch({ channel: 'chrome', headless: true })
const page = await browser.newPage()
await page.addInitScript(() => {
  window.audioProof = { created: 0, started: 0, stopped: 0 }
  const original = AudioContext.prototype.createOscillator
  AudioContext.prototype.createOscillator = function () {
    window.audioProof.created++
    const voice = original.call(this),
      start = voice.start.bind(voice),
      stop = voice.stop.bind(voice)
    voice.start = (...a) => {
      window.audioProof.started++
      return start(...a)
    }
    voice.stop = (...a) => {
      window.audioProof.stopped++
      return stop(...a)
    }
    return voice
  }
})
await page.goto(process.env.LANE_URL || 'http://127.0.0.1:5193/examples/games/lane-battle/')
assert.equal(await page.evaluate(() => window.audioProof.created), 0, 'no autoplay')
await page.getByRole('button', { name: 'ステージ選択へ' }).click()
await page.getByRole('button', { name: 'ブリッと出撃' }).click()
await page.waitForTimeout(900)
const playing = await page.evaluate(() => ({ ...window.audioProof }))
assert.ok(playing.created >= 3, 'BGM keeps generating notes')
await page.keyboard.press('Space')
const paused = await page.evaluate(() => ({ ...window.audioProof }))
assert.ok(paused.stopped > playing.stopped, 'pause cancels active voices')
await page.waitForTimeout(500)
assert.equal(await page.evaluate(() => window.audioProof.created), paused.created)
await page.keyboard.press('Space')
await page.waitForTimeout(450)
assert.ok((await page.evaluate(() => window.audioProof.created)) > paused.created)
await page.getByRole('button', { name: '音を切り替え' }).click()
const muted = await page.evaluate(() => ({ ...window.audioProof }))
await page.getByRole('button', { name: 'カチカチうんこを召喚 35', exact: true }).click()
await page.waitForTimeout(600)
assert.equal(await page.evaluate(() => window.audioProof.created), muted.created)
await page.getByRole('button', { name: '音を切り替え' }).click()
await page.waitForTimeout(400)
assert.ok((await page.evaluate(() => window.audioProof.created)) > muted.created)
console.log(
  'audio autoplay/BGM/pause/resume/mute/unmute PASS',
  JSON.stringify(await page.evaluate(() => window.audioProof))
)
const mobile = await browser.newPage({ viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: true })
await mobile.addInitScript(() => {
  const NativeAudioContext = window.AudioContext
  window.mobileAudioProof = { attempts: [], state: 'suspended', gesture: '' }
  for (const type of ['pointerdown', 'touchend', 'click']) {
    document.addEventListener(type, () => (window.mobileAudioProof.gesture = type), true)
  }
  window.AudioContext = class extends NativeAudioContext {
    get state() {
      return window.mobileAudioProof.state
    }
    resume() {
      const proof = window.mobileAudioProof
      proof.attempts.push(proof.gesture)
      if (proof.gesture === 'pointerdown') return Promise.reject(new Error('gesture not accepted'))
      proof.state = 'running'
      return super.resume()
    }
  }
})
await mobile.goto(process.env.LANE_URL || 'http://127.0.0.1:5193/examples/games/lane-battle/')
await mobile.getByRole('button', { name: 'ステージ選択へ' }).tap()
assert.deepEqual(await mobile.evaluate(() => window.mobileAudioProof.attempts.slice(0, 2)), ['pointerdown', 'touchend'])
await mobile.evaluate(() => (window.mobileAudioProof.state = 'interrupted'))
await mobile.getByRole('button', { name: 'ブリッと出撃' }).tap()
assert.equal(await mobile.evaluate(() => window.mobileAudioProof.state), 'running')
console.log('mobile gesture retry and interrupted audio recovery PASS')
await browser.close()
