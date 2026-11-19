/**
 * A player who is not the bot (round 8). The gate's other runs are the bot's: it walks in on the ground, fights from
 * the front, never stands inside a boss, never hops when something begins, never bites a hive or a tree at the wrong
 * moment. Here the real `PlaySession` with its `StageDirector` is played by `wildPlan` (`play-audit.ts`), and every
 * frame is held to every rule of the gate, as the bot's runs are; zero findings is the bar:
 *
 * - every fight style (`hug`: he stands in the boss; `above`: he keeps to the boss's x and jumps; `flee`: he runs the
 *   arena end to end; `still`; `turner`: he turns every few steps, mashing the bite; `hop`: the bot's fight, never on
 *   the ground) on every boss stage;
 * - the bot's plan mixed with random stretches of held keys (`mix`, a quarter, half or four fifths of the time) on all
 *   ten stages, at 30, 60 and 144 Hz and with display frames of uneven length (`rand`: 8 to 28 ms; `slowrand`: 30 Hz
 *   ± 12 ms);
 * - mortal runs, the hero let die, on all ten stages; and the stage's end itself (`heroEnds`: knocked out on the
 *   ground, at the top of a jump, falling into a pit; the goal reached on the ground and in the air), at even and
 *   uneven schedules: the ending plays out.
 */
import { describe, expect, it } from 'vitest'
import {
  FIGHT_STYLES,
  HERO_ENDINGS,
  type FramePattern,
  type HeroEnding,
  type WildStyle,
  audit,
  heroEnds,
  summarise,
  wildPlay
} from './play-audit'

const BOSS_STAGES = [2, 3, 4, 5, 6, 7, 8, 9, 10]
const ALL_STAGES = [1, ...BOSS_STAGES]
/** The rates and patterns the mixed runs rotate through, and the shares of wild stretches. */
const MIX_RATES: readonly (number | FramePattern)[] = [30, 60, 144, 'rand', 'slowrand']
const MIX_SHARES = [0.25, 0.5, 0.8]

describe('a player who is not the bot: every frame of the session against every rule', () => {
  describe.each(FIGHT_STYLES.map((style) => ({ style })))('the fight played $style', ({ style }) => {
    it.each(BOSS_STAGES)('stage %i', { timeout: 60_000 }, (no) => {
      const r = wildPlay(no, { seed: 1 + (no % 2), rate: 60, style: style as WildStyle, seconds: 200 })
      expect(summarise(audit(r))).toEqual([])
    })
  })

  it.each(
    ALL_STAGES.flatMap((no, i) =>
      [0, 1].map((k) => ({
        no,
        seed: 1 + k,
        rate: MIX_RATES[(i * 2 + k) % MIX_RATES.length],
        share: MIX_SHARES[(i + k) % MIX_SHARES.length]
      }))
    )
  )(
    'stage $no, the bot mixed with held keys ($share) at $rate, seed $seed',
    { timeout: 60_000 },
    ({ no, seed, rate, share }) => {
      const r = wildPlay(no, { seed, rate, share, seconds: 200 })
      expect(summarise(audit(r))).toEqual([])
    }
  )

  it('shows the last hurt pose before the ape recovers across a three-step display frame', { timeout: 60_000 }, () => {
    const r = wildPlay(8, { seed: 4, rate: 'slowrand', share: 0.8, seconds: 100 })
    const rows = r.tracks.get('boss')!.rows.filter((row) => row.step >= 2731 && row.step <= 2736)
    expect([...new Set(rows.map((row) => [row.clip, row.frame].join('/')))]).toEqual(['hurt/0', 'hurt/1', 'hurt/2'])
  })

  it.each(ALL_STAGES)('stage %i, mortal: the hero may die', { timeout: 60_000 }, (no) => {
    const r = wildPlay(no, { seed: 3, rate: no % 2 ? 60 : 'rand', share: 0.5, seconds: 200, mortal: true })
    expect(summarise(audit(r))).toEqual([])
  })

  it(
    'shows all four landing poses before the king attacks when a hit-stop interrupts the second frame',
    { timeout: 60_000 },
    () => {
      const r = wildPlay(10, { seed: 3, rate: 30, share: 0.8, seconds: 120 })
      const landing = r.tracks.get('boss')!.rows.filter((row) => row.step >= 3446 && row.step <= 3452 && row.viewDt > 0)
      expect(landing.map((row) => [row.clip, row.frame])).toEqual([
        ['land', 0],
        ['land', 1],
        ['land', 2],
        ['land', 3]
      ])
    }
  )

  describe('the ending plays out', () => {
    it.each(
      HERO_ENDINGS.flatMap((how) =>
        ([60, 30, 144, 'drop53', 'rand', 'slowrand', 'burst'] as const).map((frames) => ({ how, frames }))
      )
    )('the stage ends ($how) at $frames', { timeout: 30_000 }, ({ how, frames }) => {
      const { r, outcome, airborne } = heroEnds(how as HeroEnding, { frames })
      // (The scenario reached what it is about: the outcome, and the hero off the ground where he should be.)
      expect(outcome).toBe(how.startsWith('clear') ? 'clear' : 'dead')
      expect(airborne).toBe(how === 'air' || how === 'pit' || how === 'clear-air')
      expect(summarise(audit(r))).toEqual([])
    })
  })
})
