/**
 * The session on other displays (round 8d: moved out of `view-session-audit.test.ts`, which must run in under 150 s;
 * the same rules, the same runs). Stages 2, 7, 9 and 10 on 48, 50, 72, 90, 120, 144 and 165 Hz displays (two frames a
 * step, 2.4, 0.8, and rates that do not divide the step), on two seeds (three on the fox's stage); stages 7, 9 and 10
 * at 144 and 240 Hz on three more seeds that really differ. The clips they show are not counted in the other file's
 * last test (which every clip shown at 60 Hz there already covers).
 */
import { describe, expect, it } from 'vitest'
import { STAGES } from '../src/game/stages'
import { audit, sessionPlay, summarise, type Recorder, type SessionRecorder } from './play-audit'

const bossRows = (r: Recorder) => r.tracks.get('boss')?.rows ?? []
const SHOOTERS = ['crowBoss', 'foxBoss', 'beeBoss', 'king']

/** Every staged moment is skipped but the boss's fall (its slow motion plays). */
const ALL_BUT_THE_FALL = ['stage-start', 'chase-start', 'boss-intro', 'goal-reveal', 'clear', 'death']

/** No findings, with a readable list when there are some; the runs did play. */
function expectClean(runs: Recorder[]) {
  expect(summarise(runs.flatMap((r) => audit(r)))).toEqual([])
  for (const r of runs) expect(r.step, r.label).toBeGreaterThan(60)
}

/** Each run began with its moment, entered staged moments and left them, and fought the boss (if there is a fight). */
function expectTheMoments(r: SessionRecorder) {
  const stage = STAGES[r.no - 1]
  expect(r.director.log[0], r.label).toBe(stage.boss.kind === 'chaser' ? 'chase-start' : 'stage-start')
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

/** The runs of a stage did what they are for, between them (as in `view-session-audit.test.ts`). */
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

describe('the picture and the motion agree in the real session on other displays', () => {
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
})
