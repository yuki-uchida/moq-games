import { describe, expect, test } from 'vitest'
import { SFX, type SfxName } from '../src/audio/api'
import { SFX_DEFS, pendingSfx } from '../src/audio/sfx'
import { sfxHash } from '../src/audio/sfx-hash'
import metricsFile from '../src/audio/sfx-metrics.json'

/**
 * Checks the numbers `scripts/hoshi-no-hamham-audio.mjs --write` measured offline (render every effect alone through
 * the real engine). Nothing is rendered here: the hash of each definition proves the numbers are not stale.
 */
interface Metrics {
  pending?: boolean
  hash: string
  g: number
  seconds: number
  peak: number
  loudnessNorm: number
  bands: number[] // shares below 200 Hz, 200-1000, 1000-4000, 4000-8000, above 8000
  fingerprint: number[]
}
const file = metricsFile as unknown as { referenceDb: number; effects: Record<string, Metrics | { pending: true }> }
const entry = (name: SfxName) => file.effects[name] as Metrics

const HERO_AND_GIMMICKS: SfxName[] = [
  'jump',
  'land',
  'landHard',
  'step',
  'skid',
  'bite',
  'biteHit',
  'hurt',
  'die',
  'splashIn',
  'splashOut',
  'swim',
  'drop',
  'respawn',
  'heal',
  'starGet',
  'pickup',
  'lowHp',
  'dig',
  'crumble',
  'chop',
  'treeCreak',
  'treeCrash',
  'pipeBurst',
  'hiveBreak',
  'sting',
  'animalWake',
  'animalCharge',
  'animalPoof',
  'rockCrack',
  'rockBreak',
  'switchOn',
  'doorOpen',
  'spawnItem',
  'cageBreak',
  'goalOpen',
  'gateUp',
  'gateDown'
]

const ENEMIES_BOSSES_UI: SfxName[] = [
  'enemyHit',
  'enemyDown',
  'hop',
  'spit',
  'shotHit',
  'bossRoar',
  'bossWindup',
  'bossCharge',
  'bossDive',
  'bossLeap',
  'bossSlam',
  'bossCast',
  'shockwave',
  'bossCrash',
  'bossHit',
  'bossHitWeak',
  'bossPhase',
  'bossDown',
  'bossBoom',
  'minion',
  'momYell',
  'momTired',
  'menuMove',
  'menuSelect',
  'menuBack',
  'pauseIn',
  'pauseOut',
  'textBlip',
  'pageTurn',
  'stageStart',
  'ready',
  'unlock',
  'tallyTick',
  'tallyDone',
  'newRecord',
  'irisOut',
  'irisIn',
  'titleStart',
  'confetti'
]
const ALL: SfxName[] = [...HERO_AND_GIMMICKS, ...ENEMIES_BOSSES_UI]

const SHORT_TICKS: SfxName[] = ['textBlip', 'menuMove', 'tallyTick']
const SHORT: SfxName[] = ['menuSelect', 'menuBack', 'ready', 'hop', 'spit', 'shotHit', 'enemyHit', 'pageTurn', 'minion']
const MEDIUM: SfxName[] = [
  'bossRoar',
  'bossSlam',
  'bossPhase',
  'bossCrash',
  'unlock',
  'newRecord',
  'stageStart',
  'titleStart',
  'tallyDone',
  'momYell',
  'momTired'
]

const MAX_SECONDS: Partial<Record<SfxName, number>> = {
  step: 0.1,
  ...Object.fromEntries(
    (['jump', 'land', 'bite', 'pickup', 'sting', 'spawnItem', 'drop'] as SfxName[]).map((n) => [n, 0.3])
  ),
  ...Object.fromEntries((['biteHit', 'hurt', 'chop', 'rockCrack', 'dig', 'heal'] as SfxName[]).map((n) => [n, 0.5]))
}
const LONG: SfxName[] = [
  'die',
  'treeCrash',
  'rockBreak',
  'doorOpen',
  'goalOpen',
  'gateUp',
  'gateDown',
  'treeCreak',
  'cageBreak',
  'starGet'
]

describe('sound-effect metrics', () => {
  test('every SfxName is designed and measured, and the measurements are fresh', () => {
    expect(pendingSfx()).toEqual([])
    expect(SFX).toHaveLength(77)
    expect(ALL).toHaveLength(77)
    expect([...ALL].sort()).toEqual([...SFX].sort())
    expect(Object.keys(file.effects).sort()).toEqual([...SFX].sort())
    for (const name of SFX) {
      const e = file.effects[name]
      expect(e, `${name} is recorded as pending`).not.toHaveProperty('pending')
      expect(
        (e as Metrics).hash,
        `${name} changed since it was measured: run scripts/hoshi-no-hamham-audio.mjs --write`
      ).toBe(sfxHash(SFX_DEFS[name]))
    }
  })

  test('the hero and gimmick effects and the enemy, boss and interface effects are 38 + 39', () => {
    expect(HERO_AND_GIMMICKS).toHaveLength(38)
    expect(ENEMIES_BOSSES_UI).toHaveLength(39)
  })

  test('length, peak and loudness stay inside the design limits', () => {
    for (const name of ALL) {
      const m = entry(name)
      expect(m.peak, `${name} peak`).toBeLessThanOrEqual(0.95)
      if (SHORT_TICKS.includes(name)) {
        expect(m.seconds, `${name} length`).toBeLessThanOrEqual(0.12)
      } else if (SHORT.includes(name)) {
        expect(m.seconds, `${name} length`).toBeLessThanOrEqual(0.4)
      } else if (MEDIUM.includes(name)) {
        expect(m.seconds, `${name} length`).toBeGreaterThanOrEqual(0.3)
        expect(m.seconds, `${name} length`).toBeLessThanOrEqual(1.6)
      } else if (name === 'bossDown') {
        expect(m.seconds, `${name} length`).toBeGreaterThanOrEqual(1.2)
        expect(m.seconds, `${name} length`).toBeLessThanOrEqual(2.4)
      } else if (LONG.includes(name)) {
        expect(m.seconds, `${name} length`).toBeGreaterThanOrEqual(0.4)
        expect(m.seconds, `${name} length`).toBeLessThanOrEqual(1.8)
      } else {
        expect(m.seconds, `${name} length`).toBeLessThanOrEqual(MAX_SECONDS[name] ?? 0.9)
      }
      // The trim equalises the loudness measured with g = 1; the mix hierarchy then comes from g alone.
      expect(Math.abs(m.loudnessNorm - file.referenceDb), `${name} loudness`).toBeLessThanOrEqual(1.5)
    }
  })

  test('the mix hierarchy: quiet steps and strokes, loud bites, crashes and fanfares', () => {
    const g = (n: SfxName) => SFX_DEFS[n].g
    const loudest = ['biteHit', 'treeCrash', 'goalOpen'] as SfxName[]
    for (const quiet of ['step', 'swim'] as SfxName[])
      for (const name of HERO_AND_GIMMICKS.filter((n) => n !== 'step' && n !== 'swim'))
        expect(g(quiet), `${quiet} vs ${name}`).toBeLessThan(g(name))
    for (const name of loudest)
      expect(g(name), name).toBeGreaterThanOrEqual(Math.max(...HERO_AND_GIMMICKS.map(g)) - 0.1)
  })

  test('interface sounds are quiet and the boss slam and defeat are among the loudest', () => {
    const g = (n: SfxName) => SFX_DEFS[n].g
    const ui = ENEMIES_BOSSES_UI.slice(ENEMIES_BOSSES_UI.indexOf('menuMove'))
    for (const name of ui) expect(g(name), name).toBeLessThanOrEqual(0.85)
    for (const name of ['bossSlam', 'bossDown'] as SfxName[])
      expect(g(name), name).toBeGreaterThanOrEqual(Math.max(...ENEMIES_BOSSES_UI.map(g)) - 0.05)
  })

  test('soft spectra: little high-frequency energy, weight where a heavy sound needs it', () => {
    for (const name of ENEMIES_BOSSES_UI) {
      const m = entry(name)
      expect(m.bands[3] + m.bands[4], `${name} above 4 kHz`).toBeLessThanOrEqual(0.6)
      if (SHORT_TICKS.includes(name)) expect(m.bands[3] + m.bands[4], `${name} above 4 kHz`).toBeLessThanOrEqual(0.35)
      if (['bossSlam', 'bossRoar', 'bossDown', 'shockwave'].includes(name))
        expect(m.bands[0], `${name} below 200 Hz`).toBeGreaterThanOrEqual(0.2)
    }
    for (const name of HERO_AND_GIMMICKS) {
      const m = entry(name)
      const high = m.bands[3] + m.bands[4]
      expect(high, `${name} above 4 kHz`).toBeLessThanOrEqual(0.6)
      if (['step', 'jump', 'land', 'bite', 'swim'].includes(name))
        expect(high, `${name} above 4 kHz`).toBeLessThanOrEqual(0.35)
      if (['landHard', 'treeCrash', 'rockBreak', 'doorOpen', 'gateUp'].includes(name))
        expect(m.bands[0], `${name} below 200 Hz`).toBeGreaterThanOrEqual(0.15)
    }
  })

  test('no two effects sound alike', () => {
    // Fingerprints are unit vectors (sqrt of the energy share per time slice and band), so the Euclidean distance
    // lies in 0..1.41. The closest designed pair is
    // about 0.27 and sounds clearly different (a stone rumble against a tree thud). 0.2 (cosine similarity 0.98)
    // keeps real near-duplicates out without forcing artificial spread.
    const threshold = 0.2
    for (let i = 0; i < ALL.length; i++)
      for (let j = i + 1; j < ALL.length; j++) {
        const a = entry(ALL[i]).fingerprint
        const b = entry(ALL[j]).fingerprint
        const d = Math.sqrt(a.reduce((s, v, k) => s + (v - b[k]) ** 2, 0))
        expect(d, `${ALL[i]} vs ${ALL[j]}`).toBeGreaterThan(threshold)
      }
  })
})
