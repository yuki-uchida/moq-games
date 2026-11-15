/**
 * The picture and the motion agree in the real session. `play-audit.ts` plays each stage with the real
 * `PlaySession` and its `StageDirector` (its pacing and hit-stops, its staged moments, poses, input lock and slow
 * motion), display frame by display frame, and checks every frame with the same rules as the hand-made scenarios
 * (view-play-audit.test.ts), among them the ones about shots and staged moments:
 *
 * - a release waits for its shot, and a shot that leaves from a pose leaves the way it faces;
 * - every shot of the crow, the fox and the bee is announced by its gathering light, at the place it is born, growing
 *   with the steps left, pointing its way; the shot is born from it, in front; a flinch does not cover it;
 * - the king gathers before he fires, and fires from his release;
 * - an action never turns round, on its release neither, a lead-in does not face away from its aim, and it is given
 *   up only when its target has gone;
 * - the transformation begins between his actions, on the ground and at rest, and his next attack with its wind-up;
 * - a landing needs a touchdown, a slam lands on its impact, a staged pose stands on the ground on every frame, and a
 *   staged moment hands over to the first frame of what comes after it;
 * - once the stage is over or the hero is down, what the simulation holds the picture holds.
 *
 * The scenarios: the cases the third outside review found, every stage with its director at 60 Hz (stages 2, 7, 9
 * and 10 also at 48, 50, 72, 90, 120, 144 and 165 Hz, the others at 50 and 72 Hz), the king's transformation forced
 * in every state he has (at 30, 48, 60 and 144 Hz; the hero standing, just jumped, biting, knocked back, running,
 * hopping, or held in the air past the director's cap), shots against a hero who crosses to the other side just
 * before them (60, 50, 144 Hz), the fox's and the bee's shots in every state, the hero's death to a dash, a shot and
 * under a light, a brute stunned by a wall, the bear's entrance, four stages under reduced motion, and a last test
 * of which clips the suite never shows.
 */
import { describe, expect, it } from 'vitest'
import { allSheetSpecs } from '../src/art/contract'
import { STAGES } from '../src/game/stages'
import { LAND_WAIT_SECONDS } from '../src/view/staging'
import {
  CROSSING_SHOOTERS,
  HOLD_CASES,
  KING_MOMENTS,
  audit,
  bossEntrance,
  bruteCrashes,
  crossingShots,
  heroDies,
  heroHolds,
  kingPastTheBackstop,
  kingTransforms,
  RAGE_WAIT_SECONDS,
  treeFalls,
  STEP,
  sessionPlay,
  shotsInEveryState,
  summarise,
  type Recorder,
  type Row,
  type SessionRecorder
} from './play-audit'

const SPECS = allSheetSpecs()

/** The sheets drawn in play: the hero, every enemy and boss (and the king's raged sheet), the piglet. */
const SHEETS_IN_PLAY = [
  ...new Set([
    'hero',
    ...STAGES.flatMap((stage) => [stage.boss.art, ...stage.boss.minions]),
    'king:raged',
    'walker',
    'jumper',
    'flyer',
    'spitter',
    'tough'
  ])
]

/**
 * The clips the session suite never shows, and why each cannot be reached there (a clip that drops out of the
 * suite's sight is noticed: it is not on this list).
 */
const NEVER_SHOWN: Record<string, string> = {
  'jumper.idle': 'the frog never rests: sim.ts hops it again on the step it lands, so it never stands long enough'
}

/** Every `sheet.clip` the suite's runs showed. */
const SHOWN = new Set<string>()

/** No findings, with a readable list when there are some. */
function expectClean(runs: Recorder[]) {
  for (const r of runs)
    for (const track of r.tracks.values()) for (const row of track.rows) SHOWN.add(`${row.sheet}.${row.clip}`)
  const findings = runs.flatMap((r) => audit(r))
  expect(summarise(findings)).toEqual([])
  // The runs did play: an audit of nothing would pass.
  for (const r of runs) expect(r.step, r.label).toBeGreaterThan(60)
}

/** A transformation forced by a script was reached, staged and played. */
function expectTransformed(r: SessionRecorder, reached: boolean) {
  expect(reached, r.label).toBe(true)
  expect(r.director.log, r.label).toContain('boss-phase')
  expect(
    bossRows(r).some((row) => row.posed === 'rage'),
    r.label
  ).toBe(true)
  expect(
    bossRows(r).some((row) => row.sheet === 'king:raged'),
    r.label
  ).toBe(true)
}

const bossRows = (r: Recorder) => r.tracks.get('boss')?.rows ?? []
const releaseOf = (row: Row) => SPECS[row.sheet]?.shoot?.hit ?? Infinity
const SHOOTERS = ['crowBoss', 'foxBoss', 'beeBoss', 'king']

/** Every staged moment is skipped but the boss's fall (its slow motion plays). */
const ALL_BUT_THE_FALL = ['stage-start', 'chase-start', 'boss-intro', 'goal-reveal', 'clear', 'death']

/** Each run began with its moment, entered staged moments and left them, and fought the boss (if there is a fight). */
function expectTheMoments(r: SessionRecorder) {
  const stage = STAGES[r.no - 1]
  expect(r.director.log[0], r.label).toBe(stage.boss.kind === 'chaser' ? 'chase-start' : 'stage-start')
  // Staged moments were entered and left: the input came back after the first one.
  const entered = r.frames.findIndex((f) => f.moment !== null && f.locked)
  expect(entered, r.label).toBeGreaterThanOrEqual(0)
  expect(
    r.frames.slice(entered).some((f) => f.moment === null && !f.locked && f.steps > 0),
    r.label
  ).toBe(true)
  if (stage.boss.kind !== 'chaser')
    expect(
      bossRows(r).some((row) => row.state !== null && row.events.includes('boss-hit')),
      r.label
    ).toBe(true)
}

/**
 * The runs of a stage did what they are for, between them: the boss's fall in slow motion, his shots, the king's
 * transformation (`fall: false` where no run gets that far, see the cases).
 */
function expectAPlaythrough(runs: SessionRecorder[], fall = true) {
  for (const r of runs) expectTheMoments(r)
  const stage = STAGES[runs[0].no - 1]
  if (stage.boss.kind === 'chaser') return
  const rows = runs.flatMap((r) => bossRows(r))
  if (fall) {
    expect(runs.some((r) => r.director.log.includes('boss-defeat'))).toBe(true)
    expect(runs.some((r) => r.frames.some((f) => f.moment === 'boss-defeat' && f.scale > 0 && f.scale < 1))).toBe(true)
  }
  if (SHOOTERS.includes(stage.boss.art)) expect(rows.some((row) => row.shot !== 0)).toBe(true)
  if (stage.boss.kind === 'final') {
    expect(runs.some((r) => r.director.log.includes('boss-phase'))).toBe(true)
    expect(rows.some((row) => row.sheet === 'king:raged')).toBe(true)
  }
}

describe('the picture and the motion agree in the real session, with its director', () => {
  describe('the cases of the third outside review', () => {
    it('stage 9, seed 42 (60 Hz, skipping): the stingers the bee throws in her dash are announced', () => {
      const r = sessionPlay(9, { seed: 42, skip: true })
      expectClean([r])
      const rows = bossRows(r)
      const dashing = rows.filter((row, i) => i > 0 && row.shot !== 0 && row.state === 'charge')
      expect(dashing.length).toBeGreaterThan(0)
      for (const row of dashing) {
        const before = rows[rows.indexOf(row) - 1]
        expect(before.cue, `frame ${row.step}`).not.toBeNull()
        expect(before.cue!.progress).toBeCloseTo(1)
        // (It has no side since round 6l.) The stingers are born where it was, in front.
        expect(row.cue).toBeNull()
        expect(row.births.length, `frame ${row.step}`).toBeGreaterThan(0)
        for (const birth of row.births) expect(birth.behind, `frame ${row.step}`).toBe(false)
      }
    })

    it("stage 10, seed 9 (60 Hz, skipping): the king's release shows on the frame his volley leaves, and he does not turn on it", () => {
      const r = sessionPlay(10, { seed: 9, skip: true })
      expectClean([r])
      const rows = bossRows(r)
      const volleys = rows.filter((row, i) => i > 0 && row.events.includes('boss-shoot'))
      expect(volleys.length).toBeGreaterThan(3)
      for (const row of volleys) {
        const before = rows[rows.indexOf(row) - 1]
        expect([row.clip, row.frame], `frame ${row.step}`).toEqual(['shoot', releaseOf(row)])
        expect(before.frame, `frame ${row.step}`).toBeLessThan(releaseOf(before))
        expect(row.flip, `frame ${row.step}`).toBe(before.flip)
      }
    })

    it('stage 10, seed 991 (60 Hz, skipping): after his staged transformation no landing plays without a touchdown', () => {
      const r = sessionPlay(10, { seed: 991, skip: true })
      expectClean([r])
      const rows = bossRows(r)
      const end = rows.findIndex((row, i) => i > 0 && rows[i - 1].posed === 'rage' && row.posed === null)
      expect(end).toBeGreaterThan(0)
      expect(rows[end].clip).not.toBe('land')
      // Every landing of his starts on the frame he comes down.
      for (let i = 1; i < rows.length; i++)
        if (rows[i].clip === 'land' && rows[i - 1].clip !== 'land')
          expect(!rows[i - 1].onGround || rows[i - 1].state === 'slam', `frame ${rows[i].step}`).toBe(true)
    })

    it("stage 10, seed 1 (60 Hz, skipping): at the transformation the volley's follow-through does not replay", () => {
      const r = sessionPlay(10, { seed: 1, skip: true })
      expectClean([r])
      const rows = bossRows(r)
      const phase = rows.find((row) => row.events.includes('boss-phase'))
      expect(phase).toBeDefined()
      expect(phase!.clip === 'shoot' && phase!.frame >= releaseOf(phase!)).toBe(false)
      // Every frame of his at or past a release belongs to a throw (or a summon) whose shot has left.
      let left = false
      for (let i = 0; i < rows.length; i++) {
        const row = rows[i]
        const before = rows[i - 1]
        if (row.clip !== 'shoot' || !before || before.clip !== 'shoot' || row.frame < before.frame) left = false
        if (row.events.includes('boss-shoot') || row.events.includes('minion')) left = true
        if (row.clip === 'shoot' && row.frame >= releaseOf(row)) expect(left, `frame ${row.step}`).toBe(true)
      }
    })
  })

  describe.each(STAGES.map((stage) => ({ no: stage.no })))('stage $no', ({ no }) => {
    // About a second a run here; the limit is for a slow CI machine.
    // Three seeds: every moment played, every moment skipped, every moment skipped but the boss's fall. (The bot
    // does not always beat the boss or find its way out after the fight: a run ends at its outcome or after 200 s.)
    it('the session plays it through with its director, three seeds', { timeout: 120_000 }, () => {
      const runs = [
        sessionPlay(no, { seed: 5, seconds: 200 }),
        sessionPlay(no, { seed: 11, skip: true, seconds: 200 }),
        sessionPlay(no, { seed: 3, skip: ALL_BUT_THE_FALL, seconds: 200 })
      ]
      expectClean(runs)
      expectAPlaythrough(runs)
    })
  })

  // The director's moments and slow motion on other displays: two frames a step (120 Hz), 2.4 (144 Hz), 0.8 (48 Hz),
  // and rates that do not divide the step (50, 72, 90, 165 Hz), on two seeds (three on the fox's stage, where the
  // bot beats her with one of them only). At 48 Hz the bot never beats the fox; at 48, 50, 72 and 165 Hz the hero
  // touches the goal on the frame the crow falls, and the clear cuts his fall.
  it.each([2, 7, 9, 10].flatMap((no) => [120, 144, 48, 50, 72, 90, 165].map((hz) => ({ no, hz }))))(
    'stage $no on a $hz Hz display',
    { timeout: 120_000 },
    ({ no, hz }) => {
      const runs = [sessionPlay(no, { seed: 3, skip: ALL_BUT_THE_FALL, hz, seconds: 200 })]
      if (hz === 50 || hz === 72 || hz === 90 || hz === 165) {
        runs.push(sessionPlay(no, { seed: 11, skip: true, hz, seconds: 200 }))
        if (no === 7) runs.push(sessionPlay(no, { seed: 5, skip: ALL_BUT_THE_FALL, hz, seconds: 200 }))
      }
      expectClean(runs)
      const fall = !(no === 2 && [48, 50, 72, 165].includes(hz)) && !(no === 7 && hz === 48)
      expectAPlaythrough(runs, fall)
    }
  )

  it.each([1, 3, 4, 5, 6, 8].flatMap((no) => [50, 72].map((hz) => ({ no, hz }))))(
    'stage $no on a $hz Hz display',
    { timeout: 120_000 },
    ({ no, hz }) => {
      const r = sessionPlay(no, { seed: 3, skip: ALL_BUT_THE_FALL, hz, seconds: 200 })
      expectClean([r])
      expectTheMoments(r)
    }
  )

  // The transformation at every moment of his cycle, by a hit and without, the hero standing or just jumped; at 60 Hz
  // and at 30, 48 and 144 Hz.
  it.each(KING_MOMENTS.map((moment) => ({ moment, name: moment.name })))(
    "the king's transformation forced at $name, by a hit and without, the hero on the ground and in the air",
    { timeout: 120_000 },
    ({ moment }) => {
      const runs = [60, 30, 48, 144].flatMap((hz) =>
        [false, true].flatMap((hit) => [false, true].map((air) => kingTransforms(moment, { hit, air, hz })))
      )
      for (const { r, reached } of runs) expectTransformed(r, reached)
      expectClean(runs.map(({ r }) => r))
    }
  )

  // The hero bitten, knocked back or at a run on the phase step, hopping with the jump held, or held in the air past
  // the director's cap.
  it.each((['bite', 'knocked', 'run', 'hop', 'cap'] as const).map((hero) => ({ hero })))(
    "the king's transformation with the hero $hero at the phase step",
    { timeout: 120_000 },
    ({ hero }) => {
      const moments = hero === 'hop' || hero === 'cap' ? KING_MOMENTS : KING_MOMENTS.filter((_, i) => i % 3 === 0)
      const rates = hero === 'hop' ? [60, 30] : [60]
      const runs = rates.flatMap((hz) => moments.map((moment) => kingTransforms(moment, { hit: false, hero, hz })))
      for (const { r, reached } of runs) {
        expectTransformed(r, reached)
        const rows = bossRows(r)
        // A hopping hero is waited for, the cap counted from the phase step (round 6g): until `LAND_WAIT_SECONDS`
        // after it the moment begins on a step the king is ready (between his actions) and the hero stands, or the
        // king is in his wind-up (its first 0.1 s, round 6k: the hero is waited for only while the king rests); after it
        // on the first step the king is ready, the hero wherever he is (one held in the air hangs there). So no frame
        // before the pose's (but the one just before, on which the director decides it) showed a step on which it
        // could have begun, and the pose's own frame is one.
        if (hero !== 'hop' && hero !== 'cap') continue
        const due = rows.find((row) => row.events.includes('boss-phase'))!
        // (The moment begins with its first pose: the king stands, then roars.)
        const dueAt = rows.indexOf(due)
        const begins = rows.findIndex((row, i) => i > dueAt && row.posed !== null)
        const heroRow = r.tracks.get('hero')!.rows.find((row) => row.step === rows[begins].step)!
        const heroAt = new Map(r.tracks.get('hero')!.rows.map((row) => [row.step, row]))
        const since = (row: (typeof rows)[number]) => (row.sim - due.sim) * STEP
        const could = (row: (typeof rows)[number]) =>
          row.steps > 0 &&
          row.ready &&
          (heroAt.get(row.step)?.onGround === true || row.state === 'windup' || since(row) >= LAND_WAIT_SECONDS - 1e-9)
        const missed = rows.slice(dueAt + 1, begins - 1).find(could)
        expect(
          missed,
          `${r.label}: could have begun ${missed ? since(missed).toFixed(2) : ''} s after the phase step`
        ).toBe(undefined)
        const decided = rows[begins - 1]
        expect(
          heroRow.onGround ||
            decided?.state === 'windup' ||
            rows[begins].state === 'windup' ||
            since(rows[begins]) >= LAND_WAIT_SECONDS - 3 * STEP,
          `${r.label}: in the air ${since(rows[begins]).toFixed(2)} s after the phase step`
        ).toBe(true)
        expect(since(rows[begins]), `${r.label}: the backstop`).toBeLessThan(RAGE_WAIT_SECONDS - 3 * STEP)
        if (hero === 'cap') expect(heroRow.onGround, r.label).toBe(false)
      }
      expectClean(runs.map(({ r }) => r))
    }
  )

  // The view's backstop: the king kept in his slam by hand until the moment begins whatever he does. That is
  // reported by name and expected here; nothing else may come of it (the landing the pose cut does not resume).
  it.each([60, 30])(
    'the backstop: the king held in his slam until the moment begins anyway (%i Hz)',
    { timeout: 120_000 },
    (hz) => {
      const { r, reached } = kingPastTheBackstop({ hz })
      expectTransformed(r, reached)
      for (const track of r.tracks.values()) for (const row of track.rows) SHOWN.add(`${row.sheet}.${row.clip}`)
      const rules = new Set(audit(r).map((f) => f.rule))
      expect([...rules].sort()).toEqual(['the backstop was reached', 'transformation begins in an action'])
      // Let go after the moment, he lands his slam: its impact comes, and shows its landing (no rule above found
      // otherwise: `slam does not land on its impact` is not among them).
      const rows = bossRows(r)
      const end = rows.findLastIndex((row) => row.posed === 'rage')
      expect(rows.slice(end).some((row) => row.events.includes('boss-slam'))).toBe(true)
    }
  )

  // The roar on the step the hero is hit: real fights in which his contact hit comes after `boss-phase` in the same
  // step (stage 10, seeds 14, 26, 29 at 60 Hz).
  it.each([14, 26, 29])(
    'stage 10, seed %i: the hero hit on the step of the transformation',
    { timeout: 120_000 },
    (seed) => {
      const r = sessionPlay(10, { seed, skip: true, seconds: 200 })
      expectClean([r])
      expect(r.director.log).toContain('boss-phase')
    }
  )

  // A tree felled on the hero pushes him out from under its trunk in one step: out of slow motion and in it, by 43 px
  // (under the interpolation's `JUMP_PX`: the push must not be smeared) and by 118 px.
  it.each(
    [60, 144, 240].flatMap((hz) =>
      [false, true].flatMap((slow) => (['end', 'middle'] as const).map((at) => ({ hz, slow, at })))
    )
  )(
    'a tree falls on the hero at $hz Hz (in slow motion: $slow, under its $at)',
    { timeout: 120_000 },
    ({ hz, slow, at }) => {
      const { r, chopped, pushed, slowed } = treeFalls({ hz, slow, at })
      expect(chopped, r.label).toBe(true)
      expect(Math.abs(pushed), r.label).toBeGreaterThan(40)
      if (slow) expect(slowed, r.label).toBeLessThan(1)
      expectClean([r])
    }
  )

  // Odd rates on seeds that really differ: each run waits a different number of steps before the bot sets off, so
  // that no two meet their enemies and their boss at the same moments.
  it.each([144, 240].flatMap((hz) => [7, 9, 10].map((no) => ({ hz, no }))))(
    'stage $no at $hz Hz on three more seeds',
    { timeout: 150_000 },
    ({ hz, no }) => {
      const runs = [19, 2, 37].map((seed) =>
        sessionPlay(no, { seed, wait: (seed * 7) % 61, skip: seed % 2 === 1, hz, seconds: 200 })
      )
      expectClean(runs)
    }
  )

  it.each(CROSSING_SHOOTERS.map((shooter) => ({ shooter })))(
    'shots of the $shooter against a hero who crosses 0 to 21 steps before them, or stands on the aim line',
    { timeout: 120_000 },
    ({ shooter }) => {
      const runs = [60, 50, 144].flatMap((hz) =>
        ([0, 1, 2, 3, 5, 8, 13, 21, 'aim'] as const).map((k) =>
          crossingShots(shooter, k, { hz, seconds: shooter === 'crowBoss' ? 14 : 9 })
        )
      )
      for (const { r, crossed } of runs) expect(crossed, r.label).toBeGreaterThanOrEqual(2)
      expectClean(runs.map(({ r }) => r))
    }
  )

  it.each([7, 9].flatMap((no) => [60, 144].map((hz) => ({ no, hz }))))(
    'stage $no: the boss shoots while she walks, winds up, dashes and recovers, every shot announced ($hz Hz)',
    { timeout: 120_000 },
    ({ no, hz }) => {
      const r = shotsInEveryState(no, { hz })
      expectClean([r])
      const states = new Set(
        bossRows(r)
          .filter((row) => row.shot !== 0)
          .map((row) => row.state)
      )
      for (const state of ['idle', 'windup', 'charge', 'recover']) expect([...states], state).toContain(state)
    }
  )

  // Death: the rows run through the death moment to its outcome (the simulation holds the world there).
  it.each([
    { no: 4, by: 'dash' },
    { no: 7, by: 'dash' },
    { no: 9, by: 'dash' },
    { no: 10, by: 'dash' },
    { no: 7, by: 'shot' },
    { no: 9, by: 'light' }
  ] as const)('the hero dies on stage $no to the $by', { timeout: 120_000 }, ({ no, by }) => {
    const { r, died, outcome } = heroDies(no, by)
    expect(died, r.label).toBe(true)
    expect(outcome, r.label).toBe('dead')
    expect(r.director.log, r.label).toContain('death')
    const rows = r.tracks.get('hero')!.rows
    expect(rows.some((row) => row.clip === 'die')).toBe(true)
    // The boss was drawn, held, through the death.
    expect(bossRows(r).filter((row) => row.over).length, r.label).toBeGreaterThan(30)
    expectClean([r])
  })

  it.each([3, 4, 5])('stage %i: the brute charges into the wall and is stunned', { timeout: 120_000 }, (no) => {
    const r = bruteCrashes(no)
    expectClean([r])
    expect(bossRows(r).some((row) => row.state === 'stunned' && row.clip === 'stunned')).toBe(true)
  })

  it("the bear's entrance on the nest stage", { timeout: 120_000 }, () => {
    const r = bossEntrance(6)
    expectClean([r])
    expect(r.director.log).toContain('boss-intro')
    expect(bossRows(r).some((row) => row.clip === 'intro')).toBe(true)
  })

  it.each([2, 7, 9, 10])('stage %i under reduced motion', { timeout: 120_000 }, (no) => {
    const r = sessionPlay(no, { seed: 3, skip: ALL_BUT_THE_FALL, reducedMotion: true, seconds: 200 })
    expectClean([r])
    // (No slow motion under reduced motion: the fall is a hit-stop and play goes on.)
    expectAPlaythrough([r], false)
    expect(r.director.log).toContain('boss-defeat')
    expect(r.frames.some((f) => f.scale > 0 && f.scale < 1)).toBe(false)
  })

  // A hold begun as the hero runs, brakes, pivots or bites (a far goal opened on that step: the director's
  // goal-reveal holds the simulation), and his input after it; at 60, 30 and 144 Hz (round 6p).
  it.each([60, 30, 144])("holds begun on the hero's commands at %i Hz", { timeout: 120_000 }, (hz) => {
    expectClean(Object.keys(HOLD_CASES).map((name) => heroHolds(name, { hz })))
  })

  // The fox's fights of the second outside audit of round 6p (a whirl off a ledge, a wind-up after a fall).
  it('stage 7 on seeds 19, 27, 44, 61 and 83 (60 Hz, skipping)', { timeout: 150_000 }, () => {
    expectClean([19, 27, 44, 61, 83].map((seed) => sessionPlay(7, { seed, skip: true, seconds: 200 })))
  })

  // The bite that knocks a boss out, under reduced motion (no slow motion: the hold of his fall begins on the step
  // of the bite): every boss stage at 72 Hz on three seeds (round 6p).
  it.each(STAGES.filter((stage) => stage.boss.kind !== 'chaser').map((stage) => stage.no))(
    'stage %i: the knock-out under reduced motion at 72 Hz, three seeds',
    { timeout: 150_000 },
    (no) => {
      const runs = [19, 27, 44].map((seed) => sessionPlay(no, { seed, hz: 72, reducedMotion: true, seconds: 200 }))
      expectClean(runs)
    }
  )

  // Last: which clips the suite never showed (run the whole file: a filtered run sees only part of it).
  it('the suite shows every clip of every sheet in play, but those that cannot be reached', () => {
    const never: string[] = []
    for (const sheet of SHEETS_IN_PLAY)
      for (const clip of Object.keys(SPECS[sheet] ?? {})) {
        const key = `${sheet}.${clip}`
        if (!SHOWN.has(key) && !(key in NEVER_SHOWN)) never.push(key)
      }
    expect(never).toEqual([])
    // A clip on the list that the suite does show is taken off it.
    expect(Object.keys(NEVER_SHOWN).filter((key) => SHOWN.has(key))).toEqual([])
  })
})
