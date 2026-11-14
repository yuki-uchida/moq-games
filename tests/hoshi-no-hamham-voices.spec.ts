import { expect, test, type Page } from '@playwright/test'
import { openGame } from './hoshi-no-hamham-helpers'

/**
 * The music's notes are built on kept nodes (src/audio/instruments.ts, `Rack`): these tests hold the two sides of
 * that bargain in a real browser. The sound is the sound of notes built from new nodes, and a playing theme makes
 * little more than the sources of its notes.
 */

interface Comparison {
  theme: string
  /** Nodes made by the render that builds every note from new nodes: its sources, and everything else. */
  plain: { sources: number; others: number }
  kept: { sources: number; others: number; onRacks: number }
  peak: number
  rms: number
  /** The largest difference between two samples of the renders, and the energy of the difference under the signal. */
  worst: number
  errorDb: number
}

declare global {
  interface Window {
    __made?: { sources: number; others: number }
  }
}

function collectErrors(page: Page) {
  const errors: string[] = []
  page.on('pageerror', (error) => errors.push(`pageerror: ${error.message}`))
  page.on('console', (message) => {
    if (message.type() === 'error') errors.push(`console: ${message.text()}`)
  })
  return errors
}

/**
 * Renders the first seconds of a theme twice in a context that is driven the way the live engine drives its own: a
 * pass every 40 ms that schedules the notes of the next half second. Once every note is built from new nodes, once
 * on racks. The random choices (where in the noise a burst starts) are the same in both.
 */
async function compare(page: Page, theme: string, seconds: number): Promise<Comparison> {
  return page.evaluate(
    async ({ theme, seconds }) => {
      const { MusicPlayer } = (await import(
        '/src/audio/music.ts'
      )) as typeof import('../examples/games/hoshi-no-hamham/src/audio/music')
      const { createMixer } = (await import(
        '/src/audio/mixer.ts'
      )) as typeof import('../examples/games/hoshi-no-hamham/src/audio/mixer')
      const { makeNoise } = (await import(
        '/src/audio/instruments.ts'
      )) as typeof import('../examples/games/hoshi-no-hamham/src/audio/instruments')
      const { SONGS } = (await import(
        '/src/audio/songs/index.ts'
      )) as typeof import('../examples/games/hoshi-no-hamham/src/audio/songs')
      const RATE = 44100
      const STEP = 0.04
      const random = Math.random
      const render = async (kept: boolean) => {
        const ctx = new OfflineAudioContext(2, Math.round(seconds * RATE), RATE)
        const made = { sources: 0, others: 0 }
        const count = (key: 'createGain' | 'createBiquadFilter' | 'createStereoPanner', kind: 'others') => {
          const original = ctx[key].bind(ctx) as () => AudioNode
          ;(ctx as unknown as Record<string, unknown>)[key] = () => {
            made[kind] += 1
            return original()
          }
        }
        count('createGain', 'others')
        count('createBiquadFilter', 'others')
        count('createStereoPanner', 'others')
        for (const key of ['createOscillator', 'createBufferSource'] as const) {
          const original = ctx[key].bind(ctx) as () => AudioNode
          ;(ctx as unknown as Record<string, unknown>)[key] = () => {
            made.sources += 1
            return original()
          }
        }
        const mixer = createMixer(ctx)
        const noise = makeNoise(ctx)
        made.sources = 0
        made.others = 0
        let seed = 20261115
        Math.random = () => (seed = (seed * 1664525 + 1013904223) >>> 0) / 2 ** 32
        const player = new MusicPlayer(mixer, noise, SONGS[theme as keyof typeof SONGS], 2, 0.05, false, kept)
        // The player's own part strips are not notes.
        made.others = 0
        player.pump(0.5)
        for (let t = STEP; t < seconds; t += STEP)
          void ctx.suspend(t).then(() => {
            player.pump(ctx.currentTime + 0.5)
            void ctx.resume()
          })
        const buffer = await ctx.startRendering()
        Math.random = random
        return { buffer, made, onRacks: player.keptNodes }
      }
      const plain = await render(false)
      const kept = await render(true)
      let worst = 0
      let energy = 0
      let error = 0
      let peak = 0
      for (let ch = 0; ch < 2; ch++) {
        const a = plain.buffer.getChannelData(ch)
        const b = kept.buffer.getChannelData(ch)
        for (let i = 0; i < a.length; i++) {
          const d = Math.abs(a[i] - b[i])
          if (d > worst) worst = d
          energy += a[i] * a[i]
          error += d * d
          if (Math.abs(a[i]) > peak) peak = Math.abs(a[i])
        }
      }
      return {
        theme,
        plain: plain.made,
        kept: { ...kept.made, onRacks: kept.onRacks },
        peak,
        rms: Math.sqrt(energy / (2 * plain.buffer.length)),
        worst,
        errorDb: error > 0 ? 10 * Math.log10(error / energy) : -Infinity
      }
    },
    { theme, seconds }
  )
}

test('notes built on kept racks sound like notes built from new nodes', async ({ page, baseURL }) => {
  test.setTimeout(240_000)
  const errors = collectErrors(page)
  // An empty page of the game's origin: the game itself would draw random numbers between the passes.
  await page.route('**/empty.html', (route) =>
    route.fulfill({ contentType: 'text/html', body: '<!doctype html><title>empty</title>' })
  )
  await page.goto(`${baseURL}/empty.html`)
  // Between them these play every instrument a theme uses.
  for (const theme of ['forest', 'castle', 'star', 'story', 'finalBoss']) {
    const result = await compare(page, theme, 12)
    console.log(
      `[racks] ${theme}: nodes ${result.plain.sources + result.plain.others} -> ${result.kept.sources + result.kept.others} ` +
        `(${result.kept.onRacks} on racks); peak ${result.peak.toFixed(3)}, largest difference ${result.worst.toExponential(2)}, ` +
        `${result.errorDb.toFixed(1)} dB under the signal`
    )
    // There is music in the render.
    expect(result.rms, theme).toBeGreaterThan(0.02)
    expect(result.peak, theme).toBeLessThan(1)
    // The same notes: the same sources. Everything else the kept render made is on its racks, and is far less.
    expect(result.kept.sources, theme).toBe(result.plain.sources)
    expect(result.kept.others, theme).toBe(result.kept.onRacks)
    expect(result.kept.others, theme).toBeLessThan(result.plain.others * 0.4)
    // The sound: no sample is further off than a thousandth of full scale (a filter ringing out where the note
    // built from new nodes cuts it off), and the difference as a whole lies 80 dB under the music.
    expect(result.worst, theme).toBeLessThan(2e-3)
    expect(result.errorDb, theme).toBeLessThan(-80)
  }
  expect(errors).toEqual([])
})

test('a theme that has played for a while makes little more than the sources of its notes', async ({ page }) => {
  test.setTimeout(120_000)
  const errors = collectErrors(page)
  await openGame(page)
  await page.waitForFunction(() => window.__hamham!.app.audio.engine !== null, null, { timeout: 60_000 })
  await page.evaluate(() => window.__hamham!.app.audio.unlock())
  await page.waitForFunction(() => window.__hamham!.app.audio.ctx?.state === 'running', null, { timeout: 5000 })
  await page.evaluate(() => {
    const ctx = window.__hamham!.app.audio.ctx as unknown as Record<string, (...args: unknown[]) => unknown>
    const made = (window.__made = { sources: 0, others: 0 })
    for (const key of Object.getOwnPropertyNames(Object.getPrototypeOf(Object.getPrototypeOf(ctx)))) {
      if (!key.startsWith('create') || key === 'createBuffer' || key === 'createPeriodicWave') continue
      const original = ctx[key].bind(ctx)
      const source = key === 'createOscillator' || key === 'createBufferSource'
      ctx[key] = (...args: unknown[]) => {
        if (source) made.sources += 1
        else made.others += 1
        return original(...args)
      }
    }
  })
  const made = () => page.evaluate(() => ({ ...window.__made! }))
  // The title theme from its start: the racks are made with the first notes of each voice.
  await page.waitForTimeout(3000)
  const early = await made()
  await page.waitForTimeout(9000)
  const mid = await made()
  await page.waitForTimeout(6000)
  const late = await made()
  const last = { sources: late.sources - mid.sources, others: late.others - mid.others }
  console.log(
    `[racks] title theme, live: first 3 s ${JSON.stringify(early)}; seconds 12 to 18 ${JSON.stringify(last)}; ` +
      `kept on racks ${await page.evaluate(() => (window.__hamham!.app.audio.engine as unknown as { player: { keptNodes: number } }).player.keptNodes)}`
  )
  expect(early.sources).toBeGreaterThan(20)
  expect(last.sources).toBeGreaterThan(100)
  // Six seconds of the theme a while in: about three hundred sources, and hardly a node besides.
  expect(last.others).toBeLessThan(last.sources * 0.1)
  expect(errors).toEqual([])
})
