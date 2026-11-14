/**
 * The picture and the motion agree in real play. The simulation of every stage runs with the bot and through its
 * boss fight, each boss is hit at every moment of his cycle (with the hero changing sides during wind-ups), and the
 * hero and the squirrel go through their own overlaps of moves, hits and shots; `play-audit.ts` records what the
 * view would draw on every step and checks it against what the bodies do:
 *
 * - the view asks only for clips the sheet it draws from has;
 * - a pose drawn with planted feet does not travel along the ground, and a dash is drawn as one;
 * - a pose drawn in the air (a jump, a fall, a swim, a leap) is not shown on a body that stands on the ground;
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
  heroInWater,
  heroOverlaps,
  minionFight,
  hitSweep,
  pigletCharges,
  playthrough,
  spitterOverlaps,
  squirrelVolleys,
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

  // The bosses' minions (the playthroughs and sweeps keep the stage's own enemies, so nothing is summoned there).
  // The brutes' own summons hardly ever come (sim.ts): theirs are called by hand.
  it.each(
    STAGES.filter((stage) => stage.boss.minions.length).map((stage) => ({ no: stage.no, kind: stage.boss.kind }))
  )(
    'stage $no: the boss summons his minions, and they are drawn as their bodies move from their first frame',
    { timeout: 120_000 },
    ({ no, kind }) => {
      const force = kind === 'brute'
      const runs = [minionFight(no, 5, { force }), minionFight(no, 11, { force, hz: no % 2 ? 120 : 30 })]
      expectClean(runs)
      const seen = new Set(
        runs.flatMap((r) => [...r.tracks.values()].filter((t) => t.kind === 'enemy').map((t) => t.art))
      )
      expect([...seen].sort()).toEqual([...new Set(STAGES[no - 1].boss.minions)].sort())
    }
  )

  // The bosses' own summons (none by hand): most are born inside the raised gate or a rock and pushed out by the
  // next step; none may be drawn there, nor jump on its first frames.
  it.each([60, 120])(
    'the minions of every boss that summons appear where they are, not in the gate they are born in (%i Hz)',
    { timeout: 240_000 },
    (hz) => {
      const runs = [2, 6, 7, 8, 9, 10].flatMap((no) => [minionFight(no, 5, { hz }), minionFight(no, 7, { hz })])
      expectClean(runs)
      const minions = runs.flatMap((r) => [...r.tracks.values()].filter((t) => t.kind === 'enemy'))
      expect(minions.length).toBeGreaterThan(100)
    }
  )

  it('a rat summoned beside the hovering crow falls in its air clip, and lands walking', { timeout: 120_000 }, () => {
    const r = minionFight(2, 42)
    expectClean([r])
    // (A drop on to ground a few px under it, over in a frame or two, is no fall: it walks at once.)
    const landing = (t: { rows: { onGround: boolean }[] }) => t.rows.findIndex((row) => row.onGround)
    const falls = [...r.tracks.values()].filter((t) => t.art === 'walker' && t.rows[0]?.aloft && landing(t) > 5)
    expect(falls.length).toBeGreaterThan(0)
    let longest = 0
    for (const t of falls) {
      expect(t.rows[0].clip).toBe('air')
      const landed = t.rows.findIndex((row) => row.onGround)
      longest = Math.max(longest, landed)
      for (const row of t.rows.slice(0, landed)) expect(row.clip).toBe('air')
    }
    // (The longest is the fall of some 160 px from the crow's height.)
    expect(longest).toBeGreaterThan(20)
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

  it('the hero wades into a pool, walks its floor, swims up, sinks back, bites there and climbs out', () => {
    const r = heroInWater()
    expectClean([r])
    const rows = r.tracks.get('hero')!.rows
    // He did swim, and he did stand, walk and bite on the floor of the pool with his ground clips.
    expect(rows.some((row) => row.clip === 'swim' && row.water && !row.onGround)).toBe(true)
    const floor = new Set(rows.filter((row) => row.water && row.onGround).map((row) => row.clip))
    for (const clip of ['idle', 'run', 'bite']) expect([...floor], clip).toContain(clip)
    expect(floor.has('swim')).toBe(false)
  })

  it.each([60, 120])(
    'shots come out from behind the crow, the fox, the bee and a squirrel, never over them (%i Hz)',
    { timeout: 120_000 },
    (hz) => {
      const runs = [...[2, 7, 9].map((no) => hitSweep(no, 7, { every: 1.31, cross: true, hz })), ...squirrelVolleys(hz)]
      expectClean(runs)
      // Shots of each shooter did come out from behind him.
      const out = new Set(runs.flatMap((r) => r.shotRows.filter((row) => row.first).map((row) => row.who)))
      expect([...out].sort()).toEqual(['beeBoss', 'crowBoss', 'foxBoss', 'spitter'])
      for (const r of squirrelVolleys(hz))
        expect(r.shotRows.filter((row) => row.first).length).toBeGreaterThanOrEqual(3)
    }
  )

  it("the king's volley is in front of him from the frame it is born, in both phases", { timeout: 120_000 }, () => {
    const runs = [hitSweep(10, 5), hitSweep(10, 5, { phase2: true })]
    expectClean(runs)
    const births = runs.flatMap((r) => r.shotBirths)
    expect(births.filter((b) => b.who === 'king').length).toBeGreaterThan(20)
    expect(births.filter((b) => b.behind)).toEqual([])
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
