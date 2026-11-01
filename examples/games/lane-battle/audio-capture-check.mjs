import { chromium } from '@playwright/test'
import assert from 'node:assert/strict'
import fs from 'node:fs/promises'
import { execFileSync } from 'node:child_process'
const root = process.env.LANE_AUDIO_DIR || '/tmp/lane-audio-sync'
await fs.mkdir(root, { recursive: true })
const browser = await chromium.launch({ channel: 'chrome', headless: true })
const page = await browser.newPage()
// Capture the same rendered graph sent to speakers. No microphone or OS loopback.
await page.addInitScript(() => {
  const Native = window.AudioContext
  window.AudioContext = class extends Native {
    constructor(...args) {
      super(...args)
      this.capture = this.createMediaStreamDestination()
      // Keep the recorder clock advancing during genuine zero-output intervals.
      this.captureClock = this.createConstantSource()
      this.captureClock.offset.value = 0
      this.captureClock.connect(this.capture)
      this.captureClock.start()
      window.captureContext = this
    }
  }
  const connect = AudioNode.prototype.connect
  AudioNode.prototype.connect = function (destination, ...args) {
    if (destination === this.context.destination && this.context.capture) connect.call(this, this.context.capture)
    return connect.call(this, destination, ...args)
  }
  window.startCapture = () => {
    const chunks = []
    const recorder = new MediaRecorder(window.captureContext.capture.stream, { mimeType: 'audio/webm;codecs=opus' })
    window.captureDone = new Promise((resolve) => {
      recorder.ondataavailable = (e) => chunks.push(e.data)
      recorder.onstop = async () => resolve(Array.from(new Uint8Array(await new Blob(chunks).arrayBuffer())))
    })
    window.captureRecorder = recorder
    recorder.start()
  }
})
await page.goto(process.env.LANE_URL || 'http://127.0.0.1:5193/examples/games/lane-battle/')
await page.getByRole('button', { name: 'ブリッと出撃' }).click()
await page.waitForFunction(() => window.captureContext?.state === 'running')
const results = {}
for (const kind of ['bgm', 'effects', 'muted']) {
  if (kind === 'muted') {
    await page.getByRole('button', { name: '音を切り替え' }).click()
    await page.waitForTimeout(350)
  }
  await page.evaluate(() => window.startCapture())
  if (kind === 'effects') {
    await page.getByRole('button', { name: 'カチカチうんこを召喚 35', exact: true }).click()
    await page.locator('#burst').click()
  }
  await page.waitForTimeout(1800)
  const bytes = await page.evaluate(async () => {
    window.captureRecorder.stop()
    return await window.captureDone
  })
  const webm = `${root}/${kind}.webm`,
    wav = `${root}/${kind}.wav`
  await fs.writeFile(webm, Buffer.from(bytes))
  execFileSync(process.env.FFMPEG_BIN || 'ffmpeg', [
    '-y',
    '-loglevel',
    'error',
    '-i',
    webm,
    '-ac',
    '1',
    '-ar',
    '48000',
    '-c:a',
    'pcm_f32le',
    wav
  ])
  const pcm = execFileSync(process.env.FFMPEG_BIN || 'ffmpeg', [
    '-loglevel',
    'error',
    '-i',
    wav,
    '-f',
    'f32le',
    'pipe:1'
  ])
  let sum = 0,
    peak = 0,
    clipped = 0
  for (let i = 0; i < pcm.length; i += 4) {
    const sample = pcm.readFloatLE(i)
    assert.ok(Number.isFinite(sample))
    sum += sample * sample
    peak = Math.max(peak, Math.abs(sample))
    if (Math.abs(sample) >= 1) clipped++
  }
  const stats = { samples: pcm.length / 4, rms: Math.sqrt(sum / (pcm.length / 4)), peak, clipped }
  assert.equal(clipped, 0)
  if (kind === 'muted') assert.ok(stats.rms < 0.000001, 'muted output must be silent')
  else assert.ok(stats.rms > 0.0001 && stats.peak < 0.95, 'audible signal with headroom')
  results[kind] = stats
}
await fs.writeFile(
  `${root}/analysis.json`,
  JSON.stringify({ recordedAt: new Date().toISOString(), subjectiveListening: false, results }, null, 2)
)
console.log('actual Chrome output WAV/RMS/peak/clipping/mute PASS', JSON.stringify(results))
await browser.close()
