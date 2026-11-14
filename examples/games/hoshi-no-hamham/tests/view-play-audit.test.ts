/**
 * The picture and the motion agree in real play. The simulation of every stage runs with the bot and through its
 * boss fight, each boss is hit at every moment of his cycle (with the hero changing sides during wind-ups), and the
 * hero and the squirrel go through their own overlaps of moves, hits and shots; `play-audit.ts` records what the
 * view would draw on every step and checks it against what the bodies do:
 *
 * - the view asks only for clips the sheet it draws from has;
 * - a pose drawn with planted feet does not travel along the ground, and a dash is drawn as one;
 * - a ground cycle advances with the ground covered (`stride` in the contract);
 * - whatever travels faces where it goes, a shot leaves from its release frame towards the side its shooter
 *   faces, and nobody flickers between left and right;
 * - an action starts on its first frame, is not cut by the simulation's next state, and does not come back once
 *   something else has taken its place;
 * - a knocked-out body lies on ground, and lies still;
 * - the picture of a body is where the body is (the view may hold a shaken body still; it never leaves a walking
 *   one behind, and never jumps), and no ground cycle plays on a body that stays where it is.
 *
 * The view is driven as the game drives it: display frame by display frame, with hit-stops, at 60 Hz and (for some
 * stages) at 120 and 30 Hz with positions interpolated between simulation steps.
 */
import { describe, expect, it } from 'vitest'
import { STAGES } from '../src/game/stages'
import {
  audit,
  heroBlows,
  heroOverlaps,
  hitSweep,
  pigletCharges,
  playthrough,
  spitterOverlaps,
  summarise,
  type Recorder
} from './play-audit'

/** No findings, with a readable list when there are some. */
function expectClean(runs: Recorder[]) {
  const findings = runs.flatMap((r) => audit(r))
  expect(summarise(findings)).toEqual([])
  // The runs did play: an audit of nothing would pass.
  for (const r of runs) expect(r.step, r.label).toBeGreaterThan(60)
}

describe('the picture and the motion agree in real play', () => {
  describe.each(STAGES.map((stage) => ({ no: stage.no, kind: stage.boss.kind })))('stage $no', ({ no, kind }) => {
    // About a second each here; the limit is for a slow CI machine.
    it('the bot plays it through, with four seeds', { timeout: 120_000 }, () => {
      expectClean([playthrough(no, 5), playthrough(no, 9), playthrough(no, 11), playthrough(no, 42)])
    })

    it.skipIf(kind === 'chaser')('its boss is hit at every moment of his cycle', { timeout: 120_000 }, () => {
      const runs = [hitSweep(no, 5), hitSweep(no, 7, { every: 1.31, cross: true })]
      if (kind === 'final')
        runs.push(hitSweep(no, 5, { phase2: true }), hitSweep(no, 7, { every: 1.31, cross: true, phase2: true }))
      expectClean(runs)
      // The sweeps did hit him, in every state he has.
      const states = new Set<string>()
      let hits = 0
      for (const r of runs)
        for (const row of r.tracks.get('boss')?.rows ?? []) {
          if (!row.events.includes('boss-hit')) continue
          hits++
          if (row.state) states.add(row.state)
        }
      expect(hits).toBeGreaterThan(60)
      expect(states.size).toBeGreaterThanOrEqual(4)
    })
  })

  // The view decides from positions and times, so it must decide the same on a 120 Hz display (two frames a step,
  // the first on interpolated positions) and on a 30 Hz one (a frame every two steps).
  it.each([
    { no: 1, hz: 120 },
    { no: 2, hz: 120 },
    { no: 6, hz: 120 },
    { no: 7, hz: 120 },
    { no: 10, hz: 120 },
    { no: 2, hz: 30 },
    { no: 9, hz: 30 }
  ])('stage $no on a $hz Hz display', { timeout: 120_000 }, ({ no, hz }) => {
    const runs = [playthrough(no, 5, 60, hz)]
    if (no !== 1) runs.push(hitSweep(no, 7, { every: 1.31, cross: true, hz }))
    expectClean(runs)
  })

  it('every piglet charges and is stopped, to the right and to the left', { timeout: 120_000 }, () => {
    const runs = STAGES.flatMap((stage) => [...pigletCharges(stage.no, 1), ...pigletCharges(stage.no, -1)])
    expectClean(runs)
    // They did charge, and some were stopped: both the gallop and the dazed sit were drawn.
    const clips = new Set(
      runs.flatMap((r) =>
        [...r.tracks.values()].filter((t) => t.kind === 'prop').flatMap((t) => t.rows.map((row) => row.clip))
      )
    )
    expect([...clips].sort()).toEqual(['daze', 'run', 'wake'])
  })

  it('the hero bites at a run, lands at a run, turns, and is hit around a bite', () => {
    const runs = heroOverlaps()
    expectClean(runs)
    expect(runs.length).toBeGreaterThan(30)
  })

  it('the hero is hit from the front, from behind and by spikes: his hurt faces the blow', () => {
    const runs = heroBlows()
    expectClean(runs)
    expect(runs.length).toBe(12)
  })

  it('a squirrel is bitten around its shot, and knocked out on it', () => {
    const runs = spitterOverlaps()
    expectClean(runs)
    // The acorn did leave: in every run the squirrel survives, and in the one where it is knocked out on the very
    // step it spits (bitten any earlier, it is gone before its acorn is due).
    const spat = (r: Recorder) =>
      [...r.tracks.values()].some((track) => track.rows.some((row) => row.events.includes('spit')))
    for (const r of runs) if (!r.label.includes('knocked out')) expect(spat(r), r.label).toBe(true)
    expect(runs.filter((r) => r.label.includes('knocked out') && spat(r)).length).toBeGreaterThanOrEqual(1)
  })
})
