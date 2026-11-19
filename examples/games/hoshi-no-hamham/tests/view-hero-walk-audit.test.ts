/**
 * The hero's own walk (round 8d): the input scripts of the auditor who found the gate silent while his pictures were
 * wrong (`HERO_SCRIPTS` in `play-audit.ts`: taps of every length against a run and from a stand, a tap back,
 * reversals at every point of his speeding up and after a stop, a reversal on landing and a late tap in the air, stop
 * and go), each played by the real session at 30, 60 and 144 Hz and under two uneven patterns, held to every rule of
 * the gate (among them the hero's model: no skid without a brake, no picture for a single step, no pivot that
 * slides, no turn held against his drive, no run after a hold while he coasts); and the hero hit as the boss wakes on
 * every boss stage (his flinch comes on its blow); and the hero knocked out at a hole's lip, against a wall, over a
 * one-tile gap and on a stair's lip (round 8f: his body lies on ground, never in a wall). Zero findings is the bar.
 */
import { describe, expect, it } from 'vitest'
import {
  HERO_SCRIPTS,
  KNOCK_OUT_PLACES,
  audit,
  heroHitAsAMomentBegins,
  heroKnockedOutAt,
  heroScripted,
  summarise,
  type FramePattern
} from './play-audit'

const RATES: readonly (number | FramePattern)[] = [60, 30, 144, 'rand', 'slowrand']

describe("the hero's own walk, scripted, against every rule", () => {
  it.each(RATES.map((frames) => ({ frames })))('every script at $frames', { timeout: 60_000 }, ({ frames }) => {
    const found = HERO_SCRIPTS.flatMap((script) => audit(heroScripted(script, { frames })))
    expect(summarise(found)).toEqual([])
  })

  it.each([2, 3, 4, 5, 7, 8, 10].flatMap((no) => [60, 30].map((frames) => ({ no, frames }))))(
    'stage $no at $frames Hz: the hero hit as the boss wakes',
    { timeout: 60_000 },
    ({ no, frames }) => {
      const r = heroHitAsAMomentBegins(no, { frames })
      expect(r.director.log, r.label).toContain('boss-intro')
      expect(summarise(audit(r))).toEqual([])
    }
  )

  it.each(KNOCK_OUT_PLACES.flatMap((place) => ([60, 30, 'rand'] as const).map((frames) => ({ place, frames }))))(
    'the hero knocked out ($place) at $frames: he lies on ground, never in a wall',
    { timeout: 60_000 },
    ({ place, frames }) => {
      const r = heroKnockedOutAt(place, { frames })
      expect(r.session.outcome, r.label).toBe('dead')
      expect(summarise(audit(r))).toEqual([])
    }
  )
})
