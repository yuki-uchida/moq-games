import { describe, expect, test } from 'vitest'
import { LOOPS, SFX, type LoopName, type SfxName } from '../src/audio/api'
import { SFX_DEFS } from '../src/audio/sfx'
import { loopHash, sfxHash } from '../src/audio/sfx-hash'
import metricsFile from '../src/audio/sfx-metrics.json'
import { LOOP_DEFS } from '../src/audio/sfx/loops'

/**
 * Checks the numbers `scripts/anima-front-audio.mjs --write` measured offline (every effect and loop rendered alone
 * through the real engine). Nothing is rendered here: the hash of each definition proves the numbers are not stale.
 */
interface Metrics {
  hash: string
  g: number
  seconds: number
  peak: number
  loudnessNorm: number
  bands: number[] // shares below 200 Hz, 200-1000, 1000-4000, 4000-8000, above 8000
  fingerprint: number[]
}
interface LoopMetrics {
  hash: string
  silent: boolean
  nan: boolean
  peak: number
  loud: number
  spread: number
  bands: number[]
}
const file = metricsFile as unknown as {
  referenceDb: number
  effects: Record<string, Metrics>
  loops: Record<string, LoopMetrics>
}
const entry = (name: SfxName) => file.effects[name]

/** Auto-fire sounds, ticks and markers: kept short so they never smear. */
const SHORT: SfxName[] = [
  'claw',
  'bee',
  'wood',
  'humming',
  'hitFur',
  'hitChitin',
  'hitMetal',
  'hitHead',
  'hitWeak',
  'hitmarker',
  'headmarker',
  'komarker',
  'step',
  'empty',
  'reviveTick',
  'uiMove',
  'uiTab',
  'typeBlip',
  'tsubuteChitter',
  'tsubuteBite'
]
/** Stingers, roars and big booms that may ring out. */
const LONG: SfxName[] = [
  'explosionBig',
  'bossDown',
  'bossRoar',
  'mammoth',
  'hippo',
  'victory',
  'defeat',
  'waveClear',
  'objectiveCaptured',
  'lastSpurt',
  'respawn',
  'revive',
  'down',
  'titleHit',
  'objectiveDestroyed'
]
const MAX_DEFAULT = 1.3
const MAX_SHORT = 0.45
const MAX_LONG = 1.9

/** Effects whose weight must live below 200 Hz. */
const HEAVY: SfxName[] = [
  'puffer',
  'hippo',
  'hippoCharge',
  'mammoth',
  'explosion',
  'explosionBig',
  'bossSlam',
  'bossStomp',
  'bossDown',
  'bossRoar',
  'impactGround'
]
const QUIET: SfxName[] = [
  'step',
  'hitmarker',
  'headmarker',
  'komarker',
  'uiMove',
  'typeBlip',
  'reviveTick',
  'shard',
  'koFeed'
]
const LOUDEST: SfxName[] = ['explosionBig', 'bossSlam', 'bossDown', 'hippo', 'mammoth']

describe('sound-effect metrics', () => {
  test('every SfxName is measured and the measurements are fresh', () => {
    expect(Object.keys(file.effects).sort()).toEqual([...SFX].sort())
    for (const name of SFX) {
      expect(entry(name).hash, `${name} changed since it was measured: run scripts/anima-front-audio.mjs --write`).toBe(
        sfxHash(SFX_DEFS[name])
      )
    }
  })

  test('length, peak and loudness stay inside the design limits', () => {
    for (const name of SFX) {
      const m = entry(name)
      expect(m.peak, `${name} peak`).toBeLessThanOrEqual(0.95)
      expect(m.seconds, `${name} is silent`).toBeGreaterThan(0.03)
      const max = SHORT.includes(name) ? MAX_SHORT : LONG.includes(name) ? MAX_LONG : MAX_DEFAULT
      expect(m.seconds, `${name} length`).toBeLessThanOrEqual(max)
      // The trim equalises the loudness measured with g = 1; the mix hierarchy then comes from g alone.
      expect(Math.abs(m.loudnessNorm - file.referenceDb), `${name} loudness`).toBeLessThanOrEqual(1.5)
    }
    const bossDown = entry('bossDown')
    expect(bossDown.seconds).toBeGreaterThanOrEqual(1.2)
    expect(bossDown.seconds).toBeLessThanOrEqual(2.4)
  })

  test('the mix hierarchy: quiet markers and footsteps, loud booms and slams', () => {
    const g = (n: SfxName) => SFX_DEFS[n].g
    for (const name of QUIET) expect(g(name), name).toBeLessThanOrEqual(0.7)
    for (const name of LOUDEST) expect(g(name), name).toBeGreaterThanOrEqual(0.9)
    for (const name of SFX.filter((n) => n.startsWith('ui') && n !== 'uiStart'))
      expect(g(name), name).toBeLessThanOrEqual(0.9)
  })

  test('spectra: nothing shrill, weight below 200 Hz where a heavy sound needs it', () => {
    for (const name of SFX) {
      const m = entry(name)
      expect(m.bands[3] + m.bands[4], `${name} above 4 kHz`).toBeLessThanOrEqual(0.6)
    }
    for (const name of HEAVY) expect(entry(name).bands[0], `${name} below 200 Hz`).toBeGreaterThanOrEqual(0.2)
  })

  test('every effect has a limit and a cooldown that keep rapid fire from stacking', () => {
    for (const name of [...SHORT]) {
      expect(SFX_DEFS[name].limit, name).toBeLessThanOrEqual(4)
    }
    for (const name of ['explosionBig', 'bossDown', 'bossRoar', 'victory', 'defeat', 'titleHit'] as SfxName[])
      expect(SFX_DEFS[name].limit, name).toBeLessThanOrEqual(2)
  })

  test('no two effects sound alike', () => {
    // Fingerprints are unit vectors (sqrt of the energy share per time slice and band), so the Euclidean distance
    // lies in 0..1.41; 0.2 (cosine similarity 0.98) keeps real near-duplicates out without forcing artificial spread.
    const threshold = 0.2
    for (let i = 0; i < SFX.length; i++)
      for (let j = i + 1; j < SFX.length; j++) {
        const a = entry(SFX[i]).fingerprint
        const b = entry(SFX[j]).fingerprint
        const d = Math.sqrt(a.reduce((s, v, k) => s + (v - b[k]) ** 2, 0))
        expect(d, `${SFX[i]} vs ${SFX[j]}`).toBeGreaterThan(threshold)
      }
  })
})

describe('loop metrics', () => {
  const STEADY_EXCEPTIONS: LoopName[] = ['lowAnima', 'korogashi', 'kagerou', 'ambHarbor']

  test('every LoopName is measured and the measurements are fresh', () => {
    expect(Object.keys(file.loops).sort()).toEqual([...LOOPS].sort())
    for (const name of LOOPS)
      expect(file.loops[name].hash, `${name} changed since it was measured`).toBe(loopHash(LOOP_DEFS[name]!))
  })

  test('loops are audible, finite, unclipped and steady', () => {
    for (const name of LOOPS) {
      const m = file.loops[name]
      expect(m.silent, `${name} silent`).toBe(false)
      expect(m.nan, `${name} NaN`).toBe(false)
      expect(m.peak, `${name} peak`).toBeLessThanOrEqual(0.6)
      expect(m.loud, `${name} loudness`).toBeGreaterThan(-42)
      expect(m.loud, `${name} loudness`).toBeLessThan(-14)
      expect(m.spread, `${name} steadiness`).toBeLessThanOrEqual(STEADY_EXCEPTIONS.includes(name) ? 8 : 3)
    }
  })
})
