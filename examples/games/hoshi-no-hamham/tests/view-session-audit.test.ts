/**
 * The picture and the motion agree in the real session. `play-audit.ts` plays each stage with the real
 * `PlaySession` and its `StageDirector` (its pacing and hit-stops, its staged moments, poses, input lock and slow
 * motion), display frame by display frame, and checks every frame with the same rules as the hand-made scenarios
 * (view-play-audit.test.ts), among them the ones about shots and staged moments:
 *
 * - a release waits for its shot, and a shot that leaves from a pose leaves the way it faces;
 * - every shot of the crow, the fox and the bee is announced by its gathering light, which keeps its promise;
 * - the king gathers before he fires, and fires from his release;
 * - an action never turns round, on its release neither, and a lead-in is given up only when its target has gone;
 * - a landing needs a touchdown, and a staged moment hands over to the first frame of what comes after it.
 *
 * The scenarios: the cases the third outside review found, every stage with its director at 60 Hz (some at 48, 120
 * and 144 Hz), the king's transformation forced in every state he has, shots against a hero who crosses to the other
 * side just before them, the fox's and the bee's shots in every state, and a stage under reduced motion.
 */
import { describe, expect, it } from 'vitest'
import { allSheetSpecs } from '../src/art/contract'
import { STAGES } from '../src/game/stages'
import {
  CROSSING_SHOOTERS,
  KING_MOMENTS,
  audit,
  crossingShots,
  kingTransforms,
  sessionPlay,
  shotsInEveryState,
  summarise,
  type Recorder,
  type Row,
  type SessionRecorder
} from './play-audit'

const SPECS = allSheetSpecs()

/** No findings, with a readable list when there are some. */
function expectClean(runs: Recorder[]) {
  const findings = runs.flatMap((r) => audit(r))
  expect(summarise(findings)).toEqual([])
  // The runs did play: an audit of nothing would pass.
  for (const r of runs) expect(r.step, r.label).toBeGreaterThan(60)
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
    it('stage 9, seed 42 (60 Hz, skipping): the stingers the bee throws in her dash are announced on their side', () => {
      const r = sessionPlay(9, { seed: 42, skip: true })
      expectClean([r])
      const rows = bossRows(r)
      const dashing = rows.filter((row, i) => i > 0 && row.shot !== 0 && row.state === 'charge')
      expect(dashing.length).toBeGreaterThan(0)
      for (const row of dashing) {
        const before = rows[rows.indexOf(row) - 1]
        expect(before.cue, `frame ${row.step}`).not.toBeNull()
        expect(before.cue!.progress).toBeCloseTo(1)
        const side = before.cue!.side
        expect(Math.abs(side) < 1 || Math.sign(side) === row.shot, `frame ${row.step}`).toBe(true)
        expect(row.cue).toBeNull()
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

  // The director's moments and slow motion on other displays: two frames a step (120 Hz), 2.4 (144 Hz), 0.8 (48 Hz).
  // At 48 Hz the bot never beats the fox, and the crow's fall is cut by the clear on the same frame.
  it.each([2, 7, 9, 10].flatMap((no) => [120, 144, 48].map((hz) => ({ no, hz }))))(
    'stage $no on a $hz Hz display',
    { timeout: 120_000 },
    ({ no, hz }) => {
      const r = sessionPlay(no, { seed: 3, skip: ALL_BUT_THE_FALL, hz, seconds: 200 })
      expectClean([r])
      expectAPlaythrough([r], hz !== 48 || (no !== 2 && no !== 7))
    }
  )

  it.each(KING_MOMENTS.map((moment) => ({ moment, name: moment.name })))(
    "the king's transformation forced at $name, by a hit and without, the hero on the ground and in the air",
    { timeout: 120_000 },
    ({ moment }) => {
      const runs = [false, true].flatMap((hit) => [false, true].map((air) => kingTransforms(moment, { hit, air })))
      for (const { r, reached } of runs) {
        expect(reached, r.label).toBe(true)
        expect(r.director.log, r.label).toContain('boss-phase')
        expect(
          bossRows(r).some((row) => row.sheet === 'king:raged'),
          r.label
        ).toBe(true)
      }
      expectClean(runs.map(({ r }) => r))
    }
  )

  it.each(CROSSING_SHOOTERS.map((shooter) => ({ shooter })))(
    'shots of the $shooter against a hero who crosses 0 to 21 steps before them, or stands on the aim line',
    { timeout: 120_000 },
    ({ shooter }) => {
      const runs = ([0, 1, 2, 3, 5, 8, 13, 21, 'aim'] as const).map((k) =>
        crossingShots(shooter, k, { seconds: shooter === 'crowBoss' ? 14 : 9 })
      )
      for (const { r, crossed } of runs) expect(crossed, r.label).toBeGreaterThanOrEqual(2)
      expectClean(runs.map(({ r }) => r))
    }
  )

  it.each([7, 9])(
    'stage %i: the boss shoots while she walks, winds up, dashes and recovers, every shot announced',
    { timeout: 120_000 },
    (no) => {
      const r = shotsInEveryState(no)
      expectClean([r])
      const states = new Set(
        bossRows(r)
          .filter((row) => row.shot !== 0)
          .map((row) => row.state)
      )
      for (const state of ['idle', 'windup', 'charge', 'recover']) expect([...states], state).toContain(state)
    }
  )

  it('stage 10 under reduced motion', { timeout: 120_000 }, () => {
    const r = sessionPlay(10, { seed: 3, skip: ALL_BUT_THE_FALL, reducedMotion: true, seconds: 200 })
    expectClean([r])
    // (No slow motion under reduced motion: the fall is a hit-stop and play goes on.)
    expectAPlaythrough([r], false)
    expect(r.director.log).toContain('boss-defeat')
    expect(r.frames.some((f) => f.scale > 0 && f.scale < 1)).toBe(false)
  })
})
