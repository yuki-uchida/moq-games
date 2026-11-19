/**
 * The gate tests itself: every rule of `play-audit.ts` (`CHECKS`) is fed rows that break it, built by hand the way
 * the defect would show (a release a frame early, a flip on a release frame, a lead-in kept after a crossing, a
 * light gone early, frozen or in the wrong place, a shot born behind him, a landing after a pose,
 * a follow-through with no shot, a `rage` begun in a dash, a `boss-slam` on `land/3`, a dash looping on a body the
 * simulation holds, a walk carried backwards, two turns with no travel, a posed `idle` in the air on held frames, ...),
 * and must name the finding; the same rows unbroken give none. No simulation runs here: a rule that would never
 * apply to anything is caught by this file, not by a green session suite.
 */
import { describe, expect, it } from 'vitest'
import type { SimEvent } from '../src/game/events'
import { World } from '../src/game/sim'
import { STAGES } from '../src/game/stages'
import {
  CHECKS,
  RAGE_WAIT_SECONDS,
  SHOT_CUE_SECONDS,
  STEP,
  actionsKeepTheirFacing,
  actionsPlayOut,
  actionsStartAtTheirStart,
  airPosesNeedAir,
  airTurnsFollowTheBody,
  bodiesAppearInPlace,
  bodiesLieOnTheGround,
  cyclesFollowTheGround,
  cyclesNeedGround,
  dashesAreDrawnAsDashes,
  enemiesDoNotBlink,
  everyClipExists,
  facingDoesNotFlicker,
  flinchesDoNotCoverShots,
  groundPosesNeedGround,
  heldWorldsHoldStill,
  heavyFallsLand,
  birthPlace,
  heroActionsKeepTheirFacing,
  framesNeverGoBack,
  dashesStayWhole,
  dashesAreWarned,
  endingsPlayOut,
  fittedClipsShowEveryFrame,
  heroPosesKeepHim,
  heroRunsWithHisTravel,
  heroWalkFollowsHisModel,
  heroFlinchesOnTheBlow,
  shotsJoinTheirPath,
  entranceBeginsBetweenActions,
  bitesAreDrawn,
  hitsShowTheirFlinch,
  heroIsDrawn,
  landingsDoNotSkate,
  transformationIsSeen,
  enemyHurtsFaceTheBlow,
  pushesShowAtOnce,
  bodiesKeepTheirFacing,
  standingTurnsNeedTheHero,
  heroStandsThroughMoments,
  hurtFacesTheBlow,
  kingGathersBeforeHeFires,
  landingsNeedATouchdown,
  leadInsFollowTheirAim,
  leapsLandOnTheirLanding,
  lightsKeepTheirPromise,
  pictureStaysWithTheBody,
  plantedPosesStay,
  releasesWaitForTheirShots,
  shotsAreAnnounced,
  shotsAreBornFromTheirLight,
  shotsComeOutFromBehind,
  shotsLeaveFromTheirPose,
  slamsLandOnTheirImpact,
  stagedMomentsHandOverCleanly,
  stagedPosesStandOnTheGround,
  takeOversStartAtTheirStart,
  transformationBeginsBetweenActions,
  travelFacesItsWay,
  walkersDoNotWalkOnAir,
  type ActorKind,
  type CueRow,
  type Finding,
  Recorder,
  type Row,
  type ShotRow,
  type Track
} from './play-audit'

type Check = (r: Recorder) => Finding[]

const DEFAULT: Omit<Row, 'step' | 't' | 'vt' | 'sim' | 'sheet' | 'clip'> = {
  dt: STEP,
  held: false,
  viewDt: STEP,
  steps: 1,
  moment: null,
  posed: null,
  cue: null,
  shot: 0,
  births: [],
  over: false,
  aimZone: false,
  path: [],
  aimDx: NaN,
  aims: [],
  faces: [],
  grounds: [],
  knocks: [],
  hitDir: 0,
  clipT: NaN,
  facing: 1,
  bit: 0,
  stateTime: 0,
  ready: true,
  frozen: false,
  drawn: true,
  hitShows: true,
  spot: NaN,
  spotX: NaN,
  spotY: NaN,
  camX: NaN,
  camY: NaN,
  box: null,
  minionSide: 0,
  frame: 0,
  x: 1000,
  body: 1000,
  feet: 800,
  vx: 0,
  vy: 0,
  onGround: true,
  flip: false,
  state: null,
  events: [],
  moved: false,
  heroSide: 1,
  heroDx: 200,
  supported: true,
  water: false,
  aloft: false,
  inSolid: false
}

/** Rows on consecutive display frames from `start`, each a step of 1/60 s (a held one: no step, no view time). */
function rows(sheet: string, specs: (Partial<Row> & { clip: string })[], start = 1): Row[] {
  let t = 0
  let vt = 0
  let sim = 0
  return specs.map((spec, i) => {
    const held = spec.held ?? false
    const viewDt = spec.viewDt ?? (held ? 0 : STEP)
    const steps = spec.steps ?? (held ? 0 : 1)
    t += STEP
    vt += viewDt
    sim += steps
    return { ...DEFAULT, sheet, t, vt, sim, viewDt, steps, held, ...spec, step: start + i + (spec.step ?? 0) }
  })
}

/** Rows whose display times follow their own frames' lengths (`dt`). */
function timed(list: Row[]) {
  let t = 0
  for (const row of list) row.t = t += row.dt
  return list
}

/** `n` rows built by `f(i)`. */
const times = (n: number, f: (i: number) => Partial<Row> & { clip: string }) =>
  Array.from({ length: n }, (_, i) => f(i))

const speedOf = (art: string) => STAGES.find((stage) => stage.boss.art === art)?.boss.speed ?? 0
const kindOf = (art: string) => STAGES.find((stage) => stage.boss.art === art)?.boss.kind ?? ''

function track(kind: ActorKind, art: string, list: Row[], who = kind === 'boss' ? 'boss' : `${kind}#1`): Track {
  return {
    who,
    kind,
    art,
    speed: kind === 'boss' ? speedOf(art) : 0,
    bossKind: kind === 'boss' ? kindOf(art) : '',
    rows: list
  }
}

/** A recorder of the tracks given (and what a rule reads besides them). */
function fake(tracks: Track[], extra: { missing?: string[]; shotRows?: ShotRow[]; hz?: number } = {}): Recorder {
  const hz = extra.hz ?? 60
  return {
    label: 'rows by hand',
    hz,
    frameDt: 1 / hz,
    tracks: new Map(tracks.map((t) => [t.who, t])),
    missing: extra.missing ?? [],
    shotRows: extra.shotRows ?? [],
    shotBirths: []
  } as unknown as Recorder
}

// ------------------------------------------------------------------------------------------------- fixtures

/** The light of a shot `left` steps away, as the view grows it, at the fox's birth place (body at 1000 + 7). */
const progressOf = (left: number) =>
  Math.max(0, Math.min(1, (SHOT_CUE_SECONDS - left * STEP) / (SHOT_CUE_SECONDS - STEP)))
const cue = (left: number, over: Partial<CueRow> = {}): CueRow => ({
  sheet: 'prop:orb',
  progress: progressOf(left),
  frame: Math.min(5, Math.floor(progressOf(left) * 6)),
  frames: 6,
  x: 1007,
  y: 780,
  off: 0,
  jolt: false,
  onBody: true,
  ...over
})

/**
 * The fox walking, his light gathering for the 0.45 s before his shot, and the shot leaving to the right on frame 40,
 * born where the light was, in front: `change` breaks it.
 */
function foxShot(change: (list: Row[]) => void = () => {}) {
  const need = Math.round(SHOT_CUE_SECONDS / STEP)
  const list = rows(
    'foxBoss',
    times(45, (i) => {
      const sim = i + 1
      const left = 40 - sim
      return {
        clip: 'idle',
        state: 'idle',
        // (The simulation aims at the hero 200 px to the right of him, who stands.)
        aimDx: 200,
        cue: left > 0 && left <= need ? cue(left) : null,
        ...(sim === 40
          ? {
              events: ['boss-shoot'],
              shot: 1 as const,
              births: [
                {
                  x: 1010,
                  y: 780,
                  behind: false,
                  vx: 220,
                  vy: 0,
                  onBody: true,
                  bornX: 1007,
                  bornY: 780,
                  liftX: 0,
                  liftY: 0
                }
              ]
            }
          : {})
      }
    })
  )
  change(list)
  return fake([track('boss', 'foxBoss', list)])
}
const shotRowOf = (list: Row[]) => list.findIndex((row) => row.events.includes('boss-shoot'))

/** The king gathering his volley over his `shoot` state (frames 0 to 2) and firing from his release (frame 3). */
function kingVolley(change: (list: Row[]) => void = () => {}) {
  const list = rows('king', [
    ...times(5, () => ({ clip: 'idle', state: 'idle' })),
    ...times(30, (i) => ({ clip: 'shoot', frame: Math.floor(i / 10), state: 'shoot' })),
    { clip: 'shoot', frame: 3, state: 'recover', events: ['boss-shoot'], shot: 1 },
    ...times(10, (i) => ({ clip: 'shoot', frame: 4 + Math.floor(i / 6), state: 'recover' }))
  ])
  change(list)
  return fake([track('boss', 'king', list)])
}

/** The king standing, then his staged `rage`, then a wind-up and a charge. */
function kingRage(change: (list: Row[]) => void = () => {}) {
  const list = rows('king', [
    { clip: 'idle', state: 'idle', events: ['boss-phase'] },
    ...times(20, () => ({ clip: 'idle', state: 'idle' })),
    ...times(30, (i) => ({ clip: 'rage', frame: Math.floor(i / 3), posed: 'rage', held: true, state: 'idle' })),
    ...times(10, () => ({ sheet: 'king:raged', clip: 'idle', state: 'idle' })),
    ...times(10, (i) => ({ sheet: 'king:raged', clip: 'windup', frame: Math.floor(i / 3), state: 'windup' })),
    ...times(10, (i) => ({ sheet: 'king:raged', clip: 'attack', frame: i % 6, state: 'charge', vx: 400 }))
  ])
  change(list)
  return fake([track('boss', 'king', list)])
}

// ------------------------------------------------------------------------------------------------- the cases

interface Case {
  check: Check
  rule: string
  /** What the defect looks like. */
  what: string
  broken: () => Recorder
  clean: () => Recorder
}

/**
 * A rat walking right, turning left on frame 2 and going 4 px left, then carried back right `back` px a frame and
 * turning right again on frame 8 (0.1 s after the first turn).
 */
function walkThereAndBack(back: number) {
  let body = 1000
  return times(14, (i) => {
    if (i >= 2 && i < 6) body -= 1
    else if (i >= 6 && i < 9) body += back
    return { clip: 'move', flip: i >= 2 && i < 8, body, x: body }
  })
}

/**
 * A rat at 30 Hz (two steps a frame), walking right, turning left on frame 2, going 4 px left on the steps, then
 * carried back right so that its last step before the second turn (frame 5, 0.1 s after the first) is `back` px
 * right of the furthest it went left; each frame shows only the second of its two steps.
 */
function everySecondStep(back: number) {
  const steps = [
    1000,
    1000,
    1000,
    1000,
    999,
    998,
    997,
    996,
    996 + back / 3,
    996 + (2 * back) / 3,
    996 + back,
    996 + back
  ]
  return times(6, (i) => ({
    clip: 'move',
    flip: i >= 2 && i < 5,
    steps: 2,
    viewDt: 2 * STEP,
    dt: 2 * STEP,
    path: [steps[2 * i], steps[2 * i + 1]],
    body: steps[2 * i + 1] - (i === 4 ? 0.6 : 0),
    x: steps[2 * i + 1],
    vx: 90
  }))
}

/** A rat at 30 Hz drawn facing left, carried right `by` px on its steps; its frames show 2 px less of it. */
function backOnTheSteps(by: number) {
  const steps = Array.from({ length: 12 }, (_, k) => 1000 + Math.min(k, 6) * (by / 6))
  return times(6, (i) => ({
    clip: 'move',
    flip: true,
    steps: 2,
    viewDt: 2 * STEP,
    dt: 2 * STEP,
    path: [steps[2 * i], steps[2 * i + 1]],
    body: Math.min(steps[2 * i], 1000 + by - 2),
    x: Math.min(steps[2 * i], 1000 + by - 2),
    vx: 90
  }))
}

/** The king walking at 244 px/s (or sliding in `state`) up to his staged rage, held in it. */
function slide(list: Row[], state: string) {
  for (let i = 0; i < 21; i++) Object.assign(list[i], { state, body: 1000 + (244 / 60) * i, vx: 244 })
  for (let i = 21; i < 51; i++) Object.assign(list[i], { state, body: list[20].body })
}

/** The king dashing up to his staged rage; on the frame before it his state is `state` (a wall ends a charge). */
function dashUpTo(list: Row[], state: string) {
  for (let i = 15; i < 21; i++) Object.assign(list[i], { clip: 'attack', frame: 1, state: 'charge' })
  list[20].state = state
}

/** The king winding up for `seconds` before his staged rage (the first frame of the rage still in the wind-up). */
function windupBefore(list: Row[], seconds: number) {
  const n = Math.round(seconds / STEP)
  for (let k = 0; k < n; k++)
    Object.assign(list[20 - k], { clip: 'windup', frame: 0, state: 'windup', stateTime: (n - k) * STEP })
  Object.assign(list[21], { state: 'windup', stateTime: (n + 1) * STEP })
}

/**
 * The king transforming in a session: 5 frames of the fight, 60 held frames of `boss-phase` (the spotlight rising
 * over 0.1 s, down for its last 0.25 s), 10 frames of the fight again; the camera 200 px left of him, the spot on his
 * point 56 px above his feet, his drawn frame wholly in the view. `change` breaks it.
 */
function kingSpot(change: (list: Row[]) => void = () => {}) {
  const list = rows(
    'king',
    times(75, (i) => {
      const moment = i >= 5 && i < 65
      const t = (i - 5) * STEP
      return {
        clip: moment ? 'rage' : 'idle',
        frame: moment ? Math.floor((i - 5) / 6) : 0,
        posed: moment ? 'rage' : null,
        held: moment,
        moment: moment ? 'boss-phase' : null,
        state: 'idle',
        spot: moment ? (t < 0.75 ? Math.min(1, t / 0.1) : Math.max(0, 1 - (t - 0.75) / 0.2)) : 0,
        spotX: 200,
        spotY: 800 - 56 - 600,
        camX: 800,
        camY: 600,
        box: { x: 960, y: 700, w: 80, h: 100 }
      }
    })
  )
  change(list)
  return fake([track('boss', 'king', list)])
}

const walker = (list: Row[]) => fake([track('enemy', 'walker', list)])
const fox = (list: Row[]) => fake([track('boss', 'foxBoss', list)])
const king = (list: Row[]) => fake([track('boss', 'king', list)])
const hero = (list: Row[]) => fake([track('hero', 'hero', list, 'hero')])
const bear = (list: Row[]) => fake([track('boss', 'bearBoss', list)])

/** The bear's landing on display frames of the given lengths (in 60ths of a second), its frames as given. */
const uneven = (frames: number[], sixtieths: number[]) =>
  timed(
    rows(
      'bearBoss',
      frames.map((frame, i) => ({
        clip: 'land',
        frame,
        state: 'idle',
        dt: sixtieths[i] * STEP,
        viewDt: sixtieths[i] * STEP
      }))
    )
  )

/** The hero turned left, then on a frame of three steps going right with these sim facings (round 8d). */
const dithered = (faces: number[]) =>
  rows('hero', [
    { clip: 'run', path: [1000, 1002], faces: [1, 1], steps: 2, body: 1002, x: 1002 },
    { clip: 'run', flip: true, path: [1001, 1000], faces: [-1, -1], steps: 2, body: 1000, x: 1000 },
    { clip: 'run', path: [1001, 1002, 1001.5], faces, steps: 3, body: 1001.5, x: 1001.5 }
  ])

/** The hero drawn facing right, going left 0.4 px a step, on four frames of two steps with these sim facings. */
const dither = (faces: number[]) =>
  rows(
    'hero',
    times(4, (i) => ({
      clip: 'idle',
      path: [1000 - 0.8 * i - 0.4, 1000 - 0.8 * i - 0.8],
      faces,
      steps: 2,
      body: 1000 - 0.8 * i - 0.8,
      x: 1000 - 0.8 * i - 0.8,
      vx: -24
    }))
  )

/** The hero in `clip` on one step a frame through the places `xs` (from display frame `start`). */
const walk = (clip: string, xs: number[], over: Partial<Row> = {}, start = 1) =>
  rows(
    'hero',
    xs.map((x, i) => ({ clip, frame: i % 2, x, body: x, path: [x], vx: (xs[i + 1] ?? x) - x, ...over })),
    start
  )

/** The hero running into a moment that holds him (six frames), then coasting: his speed falling every step. */
const afterHold = (clip: string) =>
  rows('hero', [
    { clip: 'run', x: 1000, body: 1000, path: [1000], vx: 215 },
    ...times(6, () => ({ clip: 'idle', posed: 'idle', moment: 'boss-intro', held: true, x: 1000, body: 1000 })),
    ...[1003, 1005.5, 1007.5, 1009].map((x, i) => ({ clip, frame: i, x, body: x, path: [x], vx: 180 - 40 * i }))
  ])

/**
 * A boss's shot drawn from his light `first` px off its own place, then eased on to its path over 0.1 s of view time
 * (a smoothstep, as the view does) at 60 Hz; `change` breaks the distances frame by frame.
 */
function joining(first = 6, change: (offs: number[]) => void = () => {}) {
  const offs = Array.from({ length: 9 }, (_, k) => {
    const u = Math.min(1, k / 6)
    return u >= 1 ? 0 : first * (1 - u * u * (3 - 2 * u))
  })
  change(offs)
  return Object.assign(fake([]), {
    shotJoins: offs.map((off, k) => ({ id: 1, step: 10 + k, vt: k * STEP, viewDt: STEP, off }))
  })
}

/**
 * A squirrel in its throw at 144 Hz: on the ground, knocked up (an `enemy-hit` on the frame that shows the step), in the
 * air for `steps` simulation steps after it, then down.
 */
const spitterKnocked144 = (steps: number) => {
  const shown = (k: number) => Math.floor(((k + 1) * 60) / 144) - Math.floor((k * 60) / 144)
  let sim = 0
  let hitAt = -1
  const specs: (Partial<Row> & { clip: string })[] = []
  for (let k = 0; k < 400; k++) {
    const n = shown(k)
    sim += n
    if (hitAt < 0 && k > 100 && n > 0) hitAt = sim
    const after = hitAt < 0 ? -1 : sim - hitAt
    specs.push({
      clip: 'shoot',
      frame: 2,
      dt: 1 / 144,
      viewDt: 1 / 144,
      steps: n,
      onGround: !(after >= 0 && after <= steps),
      events: after === 0 && n > 0 ? ['enemy-hit'] : [],
      hitDir: after === 0 && n > 0 ? (1 as const) : (0 as const),
      hitShows: false
    })
  }
  return fake([track('enemy', 'spitter', timed(rows('spitter', specs)))])
}

/** A squirrel in its throw, knocked up by a hit on each frame of `hits`, in the air from the first to frame 55. */
const spitterKnocked = (hits: number[]) =>
  fake([
    track(
      'enemy',
      'spitter',
      rows(
        'spitter',
        times(60, (i) => ({
          clip: 'shoot',
          frame: 2,
          onGround: i <= hits[0] || i >= 55,
          events: hits.includes(i) ? ['enemy-hit'] : [],
          hitDir: hits.includes(i) ? (1 as const) : (0 as const),
          hitShows: !hits.includes(i)
        }))
      )
    )
  ])

/**
 * The hero knocked out standing on the ground (round 8): `die/0` on the frame of his `dead` and through the death
 * moment's hit-stop (frozen), a tenth of a second more, his tumble (frames 1–3, a tenth of a second each) as his body
 * is tossed up and falls back (in the air), his bounce and his fall flat as he comes down, then the stars (6, 7).
 */
function knockedOut(change: (list: Row[]) => void = () => {}) {
  const list = rows('hero', [
    { clip: 'die', over: true, events: ['hurt', 'dead'] },
    ...times(18, () => ({ clip: 'die', over: true, frozen: true, viewDt: 0, steps: 0 })),
    ...times(6, () => ({ clip: 'die', over: true })),
    ...times(18, (i) => ({
      clip: 'die',
      frame: 1 + Math.floor(i / 6),
      over: true,
      onGround: false,
      feet: 800 - 4 * Math.min(i + 1, 18 - i)
    })),
    ...times(12, (i) => ({ clip: 'die', frame: 4 + Math.floor(i / 6), over: true })),
    ...times(24, (i) => ({ clip: 'die', frame: 6 + (Math.floor(i / 6) % 2), over: true }))
  ])
  change(list)
  return list
}

/** The stage cleared in the air: he falls to the ground (`fall`, posed in the clear's cheer), then cheers. */
function clearedInTheAir(change: (list: Row[]) => void = () => {}) {
  const list = rows('hero', [
    { clip: 'fall', over: true, onGround: false, feet: 700, posed: 'cheer', moment: 'clear', events: ['clear'] },
    ...times(12, (i) => ({
      clip: 'fall',
      frame: Math.floor(i / 5) % 3,
      over: true,
      onGround: false,
      feet: 702 + 8 * i,
      posed: 'cheer',
      moment: 'clear'
    })),
    ...times(30, (i) => ({ clip: 'cheer', frame: Math.floor(i / 5) % 8, over: true, posed: 'cheer', moment: 'clear' }))
  ])
  change(list)
  return list
}

/** Rows of the bear at 30 Hz (each frame 1/30 s, two steps), from display frame `start`. */
const at30 = (specs: (Partial<Row> & { clip: string })[], start = 1, sheet = 'bearBoss') =>
  timed(
    rows(
      sheet,
      specs.map((spec) => ({ dt: 2 * STEP, viewDt: 2 * STEP, steps: 2, ...spec })),
      start
    )
  )

/** The fox's cast, its frames as given (the shot leaving on the first frame 3 shows). */
const foxCast = (frames: number[]) =>
  frames.map((frame, i) => ({
    sheet: 'foxBoss',
    clip: 'shoot',
    frame,
    state: 'idle',
    ...(frame === 3 && frames.indexOf(3) === i ? { events: ['boss-shoot'], shot: 1 as const } : {})
  }))

const CASES: Case[] = [
  {
    check: everyClipExists,
    rule: 'clip is not in its sheet',
    what: 'the view asks for a clip its sheet does not have',
    broken: () => fake([], { missing: ['hero.nope at step 3'] }),
    clean: () => fake([])
  },
  {
    check: plantedPosesStay,
    rule: 'planted pose travels',
    what: 'a standing rat carried 13 px along the ground',
    broken: () =>
      walker(
        rows(
          'walker',
          times(14, (i) => ({ clip: 'idle', x: 1000 + i, body: 1000 + i, vx: 60 }))
        )
      ),
    clean: () =>
      walker(
        rows(
          'walker',
          times(14, () => ({ clip: 'idle' }))
        )
      )
  },
  {
    check: plantedPosesStay,
    rule: 'planted pose travels',
    what: 'standing after a hold may coast up to 10 px, but a longer coast is still reported',
    broken: () =>
      hero(
        afterHold('idle').map((row) =>
          row.posed ? { ...row, steps: 0, vx: 215 } : row.x === 1009 ? { ...row, x: 1011, body: 1011 } : row
        )
      ),
    clean: () => hero(afterHold('idle').map((row) => (row.posed ? { ...row, steps: 0, vx: 215 } : row)))
  },
  {
    check: dashesAreDrawnAsDashes,
    rule: 'dash speed in a pose that does not travel',
    what: 'the fox at 455 px/s drawn standing',
    broken: () =>
      fox(
        rows(
          'foxBoss',
          times(4, (i) => ({ clip: 'idle', state: 'charge', vx: 455, x: 1000 + 7.6 * i, body: 1000 + 7.6 * i }))
        )
      ),
    clean: () =>
      fox(
        rows(
          'foxBoss',
          times(4, (i) => ({ clip: 'attack', state: 'charge', vx: 455, x: 1000 + 7.6 * i, body: 1000 + 7.6 * i }))
        )
      )
  },
  {
    check: cyclesFollowTheGround,
    rule: 'cycle does not follow the ground',
    what: 'a walk playing two frames for every 5 px',
    broken: () =>
      walker(
        rows(
          'walker',
          times(20, (i) => ({ clip: 'move', frame: (2 * i) % 8, x: 1000 + 5 * i, body: 1000 + 5 * i, vx: 300 }))
        )
      ),
    clean: () =>
      walker(
        rows(
          'walker',
          times(20, (i) => ({ clip: 'move', frame: i % 8, x: 1000 + 5 * i, body: 1000 + 5 * i, vx: 300 }))
        )
      )
  },
  {
    check: cyclesNeedGround,
    rule: 'ground cycle on a body at rest',
    what: 'a walk on the spot for 0.67 s',
    broken: () =>
      walker(
        rows(
          'walker',
          times(40, () => ({ clip: 'move', vx: 60 }))
        )
      ),
    clean: () =>
      walker(
        rows(
          'walker',
          times(40, (i) => ({ clip: 'move', frame: i % 8, x: 1000 + 5 * i, body: 1000 + 5 * i, vx: 300 }))
        )
      )
  },
  {
    check: travelFacesItsWay,
    rule: 'travels backwards',
    what: 'a walk carried 12 px backwards',
    broken: () =>
      walker(
        rows(
          'walker',
          times(9, (i) => ({ clip: 'move', flip: true, x: 1000 + 1.5 * i, body: 1000 + 1.5 * i, vx: 90 }))
        )
      ),
    clean: () =>
      walker(
        rows(
          'walker',
          times(9, (i) => ({ clip: 'move', flip: false, x: 1000 + 1.5 * i, body: 1000 + 1.5 * i, vx: 90 }))
        )
      )
  },
  {
    check: travelFacesItsWay,
    rule: 'travels backwards',
    what: 'the fox dashing right drawn facing left',
    broken: () =>
      fox(
        rows(
          'foxBoss',
          times(20, (i) => ({
            clip: 'attack',
            state: 'charge',
            flip: true,
            x: 1000 + 7.6 * i,
            body: 1000 + 7.6 * i,
            vx: 455
          }))
        )
      ),
    clean: () =>
      fox(
        rows(
          'foxBoss',
          times(20, (i) => ({ clip: 'attack', state: 'charge', x: 1000 + 7.6 * i, body: 1000 + 7.6 * i, vx: 455 }))
        )
      )
  },
  {
    check: shotsLeaveFromTheirPose,
    rule: 'shot leaves off its release frame',
    what: "the fox's orb leaves on his throw's frame 2",
    broken: () =>
      fox(
        rows('foxBoss', [
          { clip: 'shoot', frame: 0 },
          { clip: 'shoot', frame: 1 },
          { clip: 'shoot', frame: 2, shot: 1, events: ['boss-shoot'] }
        ])
      ),
    clean: () =>
      fox(
        rows('foxBoss', [
          { clip: 'shoot', frame: 1 },
          { clip: 'shoot', frame: 2 },
          { clip: 'shoot', frame: 3, shot: 1, events: ['boss-shoot'] }
        ])
      )
  },
  {
    check: shotsLeaveFromTheirPose,
    rule: 'shot leaves against its pose',
    what: 'the fox throws to the left drawn facing right',
    broken: () =>
      fox(
        rows('foxBoss', [
          { clip: 'shoot', frame: 2 },
          { clip: 'shoot', frame: 3, shot: -1, events: ['boss-shoot'] }
        ])
      ),
    clean: () =>
      fox(
        rows('foxBoss', [
          { clip: 'shoot', frame: 2, flip: true },
          { clip: 'shoot', frame: 3, flip: true, shot: -1, events: ['boss-shoot'] }
        ])
      )
  },
  {
    check: shotsLeaveFromTheirPose,
    rule: 'acorn leaves off its release frame',
    what: "a squirrel's acorn leaves while it stands",
    broken: () =>
      fake([
        track('enemy', 'spitter', rows('spitter', [{ clip: 'idle' }, { clip: 'idle', shot: 1, events: ['spit'] }]))
      ]),
    clean: () =>
      fake([
        track(
          'enemy',
          'spitter',
          rows('spitter', [
            { clip: 'shoot', frame: 2 },
            { clip: 'shoot', frame: 3, shot: 1, events: ['spit'] }
          ])
        )
      ])
  },
  {
    check: shotsLeaveFromTheirPose,
    rule: 'follow-through of an acorn that left without its pose',
    what: 'an acorn that left without its pose (the hero crossed), then its follow-through',
    broken: () =>
      fake([
        track(
          'enemy',
          'spitter',
          rows('spitter', [
            { clip: 'shoot', frame: 2, flip: true },
            { clip: 'idle', shot: 1, events: ['spit'] },
            { clip: 'shoot', frame: 4 }
          ])
        )
      ]),
    clean: () =>
      fake([
        track(
          'enemy',
          'spitter',
          rows('spitter', [
            { clip: 'shoot', frame: 2, flip: true },
            { clip: 'idle', shot: 1, events: ['spit'] },
            { clip: 'idle' }
          ])
        )
      ])
  },
  {
    check: releasesWaitForTheirShots,
    rule: 'release shown before its shot',
    what: "the king's release frame one frame before his volley",
    broken: () =>
      king(
        rows(
          'king',
          [0, 1, 2, 3]
            .map((frame) => ({ clip: 'shoot', frame }))
            .concat([{ clip: 'shoot', frame: 3, events: ['boss-shoot'] } as never])
        )
      ),
    clean: () =>
      king(
        rows(
          'king',
          [0, 1, 2]
            .map((frame) => ({ clip: 'shoot', frame }))
            .concat([{ clip: 'shoot', frame: 3, events: ['boss-shoot'] } as never])
        )
      )
  },
  {
    check: releasesWaitForTheirShots,
    rule: 'release without its shot',
    what: 'a follow-through that replays from its release with no shot',
    broken: () => king(rows('king', [{ clip: 'recover' }, { clip: 'shoot', frame: 3 }, { clip: 'shoot', frame: 4 }])),
    clean: () => king(rows('king', [{ clip: 'recover' }, { clip: 'recover', frame: 1 }]))
  },
  {
    check: shotsAreAnnounced,
    rule: 'shot is not announced',
    what: 'a light gone 10 frames before its shot',
    broken: () => foxShot((list) => (list[shotRowOf(list) - 10].cue = null)),
    clean: () => foxShot()
  },
  {
    check: shotsAreAnnounced,
    rule: 'light outlives its shot',
    what: 'a light still drawn on the frame of its shot, on its last frame',
    broken: () => foxShot((list) => (list[shotRowOf(list)].cue = cue(0))),
    clean: () => foxShot()
  },
  {
    check: shotsAreAnnounced,
    rule: 'light is not full before its shot',
    what: 'a light short of its last frame on the frame before (by the frame drawn, not its progress)',
    broken: () =>
      foxShot((list) => {
        const row = list[shotRowOf(list) - 1]
        row.cue!.progress = 0.8
        row.cue!.frame = 4
      }),
    clean: () => foxShot()
  },
  {
    check: shotsAreAnnounced,
    rule: 'light outlives its shot',
    what: 'a light still drawn on the frame of its shot',
    broken: () => foxShot((list) => (list[shotRowOf(list)].cue = cue(1))),
    clean: () => foxShot()
  },
  {
    check: shotsAreBornFromTheirLight,
    rule: 'light is not where its shot is born',
    what: 'a light drawn 40 px above his head and 30 px behind',
    broken: () => foxShot((list) => list.forEach((row) => row.cue && (row.cue.off = 50))),
    clean: () => foxShot()
  },
  {
    check: shotsAreBornFromTheirLight,
    rule: 'light does not grow with its shot',
    what: 'a light that stays on its first frame and jumps to its last (a long frame may pass over a frame it held whole)',
    broken: () =>
      foxShot((list) => {
        const at = shotRowOf(list)
        list.forEach((row, i) => row.cue && i < at - 1 && (row.cue.frame = 0))
      }),
    clean: () =>
      foxShot((list) => {
        // A 50 ms display frame showing three steps, two frames on (each light frame lasts 0.075 s).
        const at = shotRowOf(list)
        const row = list[at - 8]
        Object.assign(row, { dt: 0.05, steps: 3 })
        row.cue!.frame = Math.min(5, row.cue!.frame + 1)
        for (let i = at - 7; i < at; i++) list[i].cue!.frame = Math.max(list[i].cue!.frame, row.cue!.frame)
      })
  },
  {
    check: shotsAreBornFromTheirLight,
    rule: 'light in empty air',
    what: 'the light in empty air under the bee',
    broken: () => foxShot((list) => list.forEach((row) => row.cue && (row.cue.onBody = false))),
    clean: () => foxShot()
  },
  {
    check: shotsAreBornFromTheirLight,
    rule: 'light in empty air',
    what: 'her shot born off her body',
    broken: () => foxShot((list) => (list[shotRowOf(list)].births[0].onBody = false)),
    clean: () => foxShot()
  },
  {
    check: shotsAreBornFromTheirLight,
    rule: 'shot is not born from its light',
    what: 'a shot born behind him',
    broken: () => foxShot((list) => (list[shotRowOf(list)].births[0].behind = true)),
    clean: () => foxShot()
  },
  {
    check: shotsAreBornFromTheirLight,
    rule: 'shot is not born from its light',
    what: 'a shot born 40 px from where its light was',
    broken: () => foxShot((list) => Object.assign(list[shotRowOf(list)].births[0], { x: 1050, bornX: 1047 })),
    clean: () => foxShot()
  },
  {
    check: shotsAreBornFromTheirLight,
    rule: 'shot is not born from its light',
    what: 'no shot drawn on its frame (round 8, decided: one that ends in a solid on the step it is born, a tree felled on that step, is gone)',
    broken: () => foxShot((list) => (list[shotRowOf(list)].births = [])),
    clean: () =>
      foxShot((list) => {
        const at = shotRowOf(list)
        list[at].births = []
        list[at].events = ['boss-shoot', 'boss-hit', 'shot-hit']
      })
  },
  {
    check: shotsAreBornFromTheirLight,
    rule: 'shot is not born from its light',
    what: 'no shot drawn on its frame (round 8: one that hit the hero on the step it was born, his hurt there, is gone)',
    broken: () => foxShot((list) => (list[shotRowOf(list)].births = [])),
    clean: () => {
      const r = foxShot((list) => (list[shotRowOf(list)].births = []))
      const boss = r.tracks.get('boss')!.rows
      const at = boss[shotRowOf(boss)].step
      r.tracks.set(
        'hero',
        track('hero', 'hero', rows('hero', [{ clip: 'hurt', events: ['hurt'], x: 1300, body: 1300 }], at), 'hero')
      )
      return r
    }
  },
  {
    check: shotsJoinTheirPath,
    rule: 'shot does not join its path',
    what: "a shot drawn from the fox's held picture, 6 px off its place and kept there (round 8: it joins within 0.1 s)",
    broken: () => joining(6, (offs) => offs.fill(6)),
    clean: () => joining(6)
  },
  {
    check: shotsJoinTheirPath,
    rule: 'shot jumps as it joins its path',
    what: 'a shot snapping from 6 px off on to its path in one frame, or drifting further off',
    broken: () =>
      Object.assign(
        joining(6, (offs) => offs.fill(0, 1)),
        {
          shotJoins: [
            ...joining(6, (offs) => offs.fill(0, 1)).shotJoins,
            ...joining(4, (offs) => (offs[2] = 5)).shotJoins.map((row) => ({ ...row, id: 2, step: row.step + 40 }))
          ]
        }
      ),
    clean: () => joining(6)
  },
  {
    check: shotsJoinTheirPath,
    rule: 'shot drawn far from its path',
    what: 'a shot first drawn 20 px off its place (no picture is that far off its body)',
    broken: () => joining(20),
    clean: () => joining(13)
  },
  {
    check: shotsAreBornFromTheirLight,
    rule: 'shot is not born from its light',
    what: "a shot born 4 px off the light (round 8, (e′): judged where he fired, the light carried by his picture's travel)",
    broken: () => foxShot((list) => Object.assign(list[shotRowOf(list)].births[0], { bornX: 1011 })),
    clean: () =>
      foxShot((list) =>
        // (His picture follows his body, which went 5 px on up to the step he fired on: the light went with it.)
        Object.assign(list[shotRowOf(list)].births[0], { x: 1015, bornX: 1012, liftX: 5 })
      )
  },
  {
    check: lightsKeepTheirPromise,
    rule: 'light without its shot',
    what: 'a light that ends with no shot',
    broken: () => foxShot((list) => (list[shotRowOf(list)].events = [])),
    clean: () => foxShot()
  },
  {
    check: lightsKeepTheirPromise,
    rule: 'light on a sleeping boss',
    what: 'a light on a boss who has not woken',
    broken: () => foxShot((list) => (list[shotRowOf(list) - 3].state = null)),
    clean: () => foxShot()
  },
  {
    check: lightsKeepTheirPromise,
    rule: 'light on a boss that never throws',
    what: 'a light on the weasel',
    broken: () => {
      const r = foxShot()
      r.tracks.get('boss')!.art = 'weaselBoss'
      r.tracks.get('boss')!.bossKind = 'brute'
      return r
    },
    clean: () => foxShot()
  },
  {
    check: flinchesDoNotCoverShots,
    rule: 'flinch covers a shot',
    what: 'the shot leaves on a flinch',
    broken: () => foxShot((list) => (list[shotRowOf(list)].clip = 'hurt')),
    clean: () => foxShot()
  },
  {
    check: flinchesDoNotCoverShots,
    rule: 'flinch covers a shot',
    what: 'a flinch begun 3 steps before the shot, under its light',
    broken: () =>
      foxShot((list) => {
        const at = shotRowOf(list)
        for (let i = at - 3; i < at; i++) list[i].clip = 'hurt'
      }),
    clean: () => foxShot()
  },
  {
    check: flinchesDoNotCoverShots,
    rule: 'flinch covers a shot',
    what: 'a flinch begun on the frame before the shot (round 8: a hit on the shot’s own frame may begin one there)',
    broken: () =>
      foxShot((list) => {
        const at = shotRowOf(list)
        Object.assign(list[at - 1], { clip: 'hurt', events: ['boss-hit'] })
        Object.assign(list[at], { clip: 'hurt', events: ['boss-shoot', 'boss-hit'] })
      }),
    clean: () =>
      foxShot((list) => {
        const at = shotRowOf(list)
        Object.assign(list[at], { clip: 'hurt', events: ['boss-shoot', 'boss-hit'] })
      })
  },
  {
    check: kingGathersBeforeHeFires,
    rule: 'volley without its gather',
    what: 'a volley after a shoot state drawn standing',
    broken: () => kingVolley((list) => list.forEach((row) => row.state === 'shoot' && (row.clip = 'idle'))),
    clean: () => kingVolley()
  },
  {
    check: kingGathersBeforeHeFires,
    rule: 'volley leaves without its release',
    what: 'a volley leaving from his recovery',
    broken: () => kingVolley((list) => (list[shotRowOf(list)].clip = 'recover')),
    clean: () => kingVolley()
  },
  {
    check: shotsComeOutFromBehind,
    rule: 'shot drawn on top of its shooter',
    what: 'an acorn drawn over the squirrel on the frame it comes in front',
    broken: () => fake([], { shotRows: [{ step: 5, who: 'spitter', overlap: 12, first: true }] }),
    clean: () => fake([], { shotRows: [{ step: 5, who: 'spitter', overlap: 0, first: true }] })
  },
  {
    check: actionsStartAtTheirStart,
    rule: 'action starts in its middle',
    what: 'a flinch that starts on its frame 2',
    broken: () => fox(rows('foxBoss', [{ clip: 'idle' }, { clip: 'hurt', frame: 2 }])),
    clean: () =>
      fox(
        rows('foxBoss', [
          { clip: 'idle' },
          { clip: 'hurt', frame: 0 },
          { clip: 'hurt', frame: 1 },
          { clip: 'hurt', frame: 2 }
        ])
      )
  },
  {
    check: actionsPlayOut,
    rule: 'action is cut short',
    what: "a squirrel's flinch cut after its first frame",
    broken: () => fake([track('enemy', 'spitter', rows('spitter', [{ clip: 'hurt' }, { clip: 'idle' }]))]),
    clean: () =>
      fake([
        track('enemy', 'spitter', rows('spitter', [{ clip: 'hurt' }, { clip: 'hurt', frame: 1 }, { clip: 'idle' }]))
      ])
  },
  {
    check: actionsPlayOut,
    rule: 'action is cut short',
    what: 'a lead-in dropped with the hero still on the side it faces',
    broken: () =>
      fox(rows('foxBoss', [{ clip: 'shoot' }, { clip: 'shoot' }, { clip: 'shoot', frame: 1 }, { clip: 'idle' }])),
    clean: () => fox(rows('foxBoss', [{ clip: 'shoot' }, { clip: 'shoot', frame: 1 }, { clip: 'idle', heroDx: -200 }]))
  },
  {
    check: actionsPlayOut,
    rule: 'action is cut short',
    what: "the king's landing cut on the ground (round 8: cut by his body leaving the ground again, it may be)",
    broken: () =>
      king(
        rows('king', [
          { clip: 'land', state: 'charge' },
          { clip: 'land', state: 'charge' },
          { clip: 'land', frame: 1, state: 'charge' },
          { clip: 'attack', frame: 5, state: 'charge' }
        ])
      ),
    clean: () =>
      king(
        rows('king', [
          { clip: 'land', state: 'charge' },
          { clip: 'land', frame: 1, state: 'charge' },
          { clip: 'attack', frame: 5, state: 'charge', onGround: false }
        ])
      )
  },
  {
    check: actionsPlayOut,
    rule: 'action is cut short',
    what: 'a fitted landing at 30 Hz cut before its last frame with its four display frames (round 8: with fewer, a 1/30 s frame may pass over it)',
    broken: () =>
      bear(
        at30(
          [0, 1, 2, 2]
            .map((frame) => ({ clip: 'land', frame, state: 'idle' }))
            .concat([{ clip: 'idle', frame: 0, state: 'idle' }])
        )
      ),
    clean: () =>
      fake([
        track('boss', 'bearBoss', [
          ...at30(
            [0, 2]
              .map((frame) => ({ clip: 'land', frame, state: 'idle' }))
              .concat([{ clip: 'idle', frame: 0, state: 'idle' }])
          )
        ])
      ])
  },
  {
    check: actionsPlayOut,
    rule: 'action is cut short',
    what: 'a squeezed landing stopping short of where its display frames took it (with fewer, it goes forward a frame a display frame and may end short, at any rate)',
    broken: () =>
      bear(
        timed(
          rows('bearBoss', [
            { clip: 'land', state: 'idle', dt: 2 * STEP, viewDt: 2 * STEP },
            { clip: 'land', state: 'idle', dt: 2 * STEP, viewDt: 2 * STEP },
            { clip: 'land', frame: 1, state: 'idle', dt: 2 * STEP, viewDt: 2 * STEP },
            { clip: 'idle', state: 'idle', dt: 0.02, viewDt: 0.02 }
          ])
        )
      ),
    clean: () =>
      bear(
        timed(
          rows('bearBoss', [
            { clip: 'land', state: 'idle', dt: 2 * STEP, viewDt: 2 * STEP },
            { clip: 'land', frame: 2, state: 'idle', dt: 2 * STEP, viewDt: 2 * STEP },
            { clip: 'idle', state: 'idle', dt: 0.02, viewDt: 0.02 }
          ]).concat(
            // (Two display frames for four frames: stepped, 0 and 1, and over.)
            rows(
              'bearBoss',
              [
                { clip: 'land', state: 'idle', dt: 2 * STEP, viewDt: 2 * STEP },
                { clip: 'land', frame: 1, state: 'idle', dt: 2 * STEP, viewDt: 2 * STEP },
                { clip: 'idle', state: 'idle', dt: 2 * STEP, viewDt: 2 * STEP }
              ],
              20
            )
          )
        )
      )
  },
  {
    check: actionsPlayOut,
    rule: 'action is cut short',
    what: "a cast's follow-through cut short with as many display frames as its frames from the release (counted from the release)",
    broken: () =>
      fox(
        at30(
          foxCast([0, 0, 1, 1, 2, 2, 3, 3, 4]).concat([{ sheet: 'foxBoss', clip: 'idle', state: 'idle', frame: 0 }]),
          1,
          'foxBoss'
        )
      ),
    clean: () =>
      fox(
        at30(
          foxCast([0, 0, 1, 1, 2, 2, 3, 4]).concat([{ sheet: 'foxBoss', clip: 'idle', state: 'idle', frame: 0 }]),
          1,
          'foxBoss'
        )
      )
  },
  {
    check: bodiesLieOnTheGround,
    rule: 'body lies in the air',
    what: 'a knocked-out rat lying in the air',
    broken: () =>
      fake([track('ghost', 'walker', rows('walker', [{ clip: 'defeat', frame: 4, supported: false }]), 'ghost#0')]),
    clean: () => fake([track('ghost', 'walker', rows('walker', [{ clip: 'defeat', frame: 4 }]), 'ghost#0')])
  },
  {
    check: bodiesLieOnTheGround,
    rule: 'lying body moves',
    what: 'a lying body that slides',
    broken: () =>
      fake([
        track(
          'ghost',
          'walker',
          rows('walker', [
            { clip: 'defeat', frame: 4 },
            { clip: 'defeat', frame: 5, x: 1003 }
          ]),
          'ghost#0'
        )
      ]),
    clean: () =>
      fake([
        track(
          'ghost',
          'walker',
          rows('walker', [
            { clip: 'defeat', frame: 4 },
            { clip: 'defeat', frame: 5 }
          ]),
          'ghost#0'
        )
      ])
  },
  {
    check: facingDoesNotFlicker,
    rule: 'facing flickers',
    what: 'two turns in 0.07 s with no travel',
    broken: () =>
      fox(
        rows(
          'foxBoss',
          times(20, (i) => ({ clip: 'idle', flip: i >= 5 && i < 9 }))
        )
      ),
    clean: () =>
      fox(
        rows(
          'foxBoss',
          times(40, (i) => ({ clip: 'idle', flip: i >= 5 && i < 30 }))
        )
      )
  },
  {
    check: facingDoesNotFlicker,
    rule: 'facing flickers',
    what: 'a walk turning back after coming 4 px the new way',
    broken: () => walker(rows('walker', walkThereAndBack(1))),
    clean: () => walker(rows('walker', walkThereAndBack(3)))
  },
  {
    check: facingDoesNotFlicker,
    rule: 'facing flickers',
    what: 'at 30 Hz, a second turn the body earned on the steps (8 px) though the frames show 6.7: measured on the steps',
    broken: () => walker(rows('walker', everySecondStep(7.4))),
    clean: () => walker(rows('walker', everySecondStep(8.6)))
  },
  {
    check: travelFacesItsWay,
    rule: 'travels backwards',
    what: 'at 30 Hz, a walk carried 9 px backwards on the steps though the frames show 7',
    broken: () => walker(rows('walker', backOnTheSteps(9))),
    clean: () => walker(rows('walker', backOnTheSteps(7)))
  },
  {
    check: pictureStaysWithTheBody,
    rule: 'picture is away from its body',
    what: 'a picture 12 px from its body',
    broken: () => fox(rows('foxBoss', [{ clip: 'idle', x: 1012 }])),
    clean: () => fox(rows('foxBoss', [{ clip: 'idle' }]))
  },
  {
    check: pictureStaysWithTheBody,
    rule: 'picture jumps',
    what: 'a picture that moves 4 px on a held frame',
    broken: () => fox(rows('foxBoss', [{ clip: 'idle' }, { clip: 'idle', held: true, x: 1004 }])),
    clean: () => fox(rows('foxBoss', [{ clip: 'idle' }, { clip: 'idle', x: 1003 }]))
  },
  {
    check: groundPosesNeedGround,
    rule: 'ground pose on a body in the air',
    what: 'the fox standing in the air for a third of a second',
    broken: () =>
      fox(
        rows(
          'foxBoss',
          times(60, (i) => ({ clip: 'idle', state: 'idle', onGround: i < 35 }))
        )
      ),
    clean: () =>
      fox(
        rows(
          'foxBoss',
          times(60, () => ({ clip: 'idle', state: 'idle' }))
        )
      )
  },
  {
    check: groundPosesNeedGround,
    rule: 'ground pose on a body in the air',
    what: 'a squirrel in its throw knocked up and kept 0.32 s in the air (round 8: knocked up again, it counts from the last knock)',
    broken: () => spitterKnocked([35]),
    clean: () => spitterKnocked([35, 41])
  },
  {
    check: groundPosesNeedGround,
    rule: 'ground pose on a body in the air',
    what: 'a squirrel knocked up for 16 steps at 144 Hz (counted in steps from the knock: 15, 0.25 s, may)',
    broken: () => spitterKnocked144(16),
    clean: () => spitterKnocked144(15)
  },
  {
    check: airPosesNeedAir,
    rule: 'air pose on a body on the ground',
    what: 'the hero falling while he stands',
    broken: () =>
      hero(
        rows(
          'hero',
          times(10, () => ({ clip: 'fall' }))
        )
      ),
    clean: () =>
      hero(
        rows(
          'hero',
          times(10, () => ({ clip: 'fall', onGround: false }))
        )
      )
  },
  {
    check: walkersDoNotWalkOnAir,
    rule: 'walks on air',
    what: 'a rat walking over nothing',
    broken: () =>
      walker(
        rows(
          'walker',
          times(12, () => ({ clip: 'move', aloft: true, onGround: false }))
        )
      ),
    clean: () =>
      walker(
        rows(
          'walker',
          times(12, () => ({ clip: 'move' }))
        )
      )
  },
  {
    check: bodiesAppearInPlace,
    rule: 'drawn inside a solid',
    what: 'a minion drawn inside a rock',
    broken: () => walker(rows('walker', [{ clip: 'idle', inSolid: true }, { clip: 'idle' }], 10)),
    clean: () => walker(rows('walker', [{ clip: 'idle' }, { clip: 'idle' }], 10))
  },
  {
    check: bodiesAppearInPlace,
    rule: 'appears and jumps',
    what: 'a minion that jumps 20 px on its second frame',
    broken: () => walker(rows('walker', [{ clip: 'idle' }, { clip: 'idle', x: 1020 }], 10)),
    clean: () => walker(rows('walker', [{ clip: 'idle' }, { clip: 'idle', x: 1001 }], 10))
  },
  {
    check: airTurnsFollowTheBody,
    rule: 'turns in the air',
    what: 'a rat turning in the air with its body 0.5 px back its new way (round 8: every step of the first frame counts)',
    broken: () =>
      walker(
        rows('walker', [
          { clip: 'air', flip: true, body: 1001, x: 1001, path: [1001], onGround: false },
          { clip: 'air', body: 1001.5, x: 1001.5, path: [1001.5], onGround: false }
        ])
      ),
    clean: () =>
      walker(
        rows('walker', [
          // (A long frame: its hurt ended at 1000, its first steps in the air took it to 1001.)
          { clip: 'air', flip: true, body: 1001, x: 1001, path: [1000, 1001], steps: 2, onGround: false },
          { clip: 'air', body: 1001.5, x: 1001.5, path: [1001.5], onGround: false }
        ])
      )
  },
  {
    check: facingDoesNotFlicker,
    rule: 'facing flickers',
    what: 'the hero turned back within 0.15 s, drawn jumping (round 8: a run that turned him on a step of the frame on the ground, 8 px gone, is a walk)',
    broken: () =>
      hero(
        rows('hero', [
          { clip: 'run', body: 1000, x: 1000, path: [1000] },
          { clip: 'run', flip: true, body: 998, x: 998, path: [998] },
          {
            clip: 'jump',
            body: 1014,
            x: 1014,
            path: [1006, 1014],
            steps: 2,
            onGround: false,
            grounds: [false, false],
            // (The simulation still faces left: no turn toward his travel.)
            facing: -1,
            faces: [-1, -1]
          }
        ])
      ),
    clean: () =>
      hero(
        rows('hero', [
          { clip: 'run', body: 1000, x: 1000, path: [1000] },
          { clip: 'run', flip: true, body: 998, x: 998, path: [998] },
          { clip: 'jump', body: 1014, x: 1014, path: [1006, 1014], steps: 2, onGround: false, grounds: [true, false] }
        ])
      )
  },
  {
    check: enemiesDoNotBlink,
    rule: 'blinks out',
    what: 'a rat not drawn for two frames',
    broken: () => walker(rows('walker', [{ clip: 'idle' }, { clip: 'idle', step: 2 }])),
    clean: () => walker(rows('walker', [{ clip: 'idle' }, { clip: 'idle' }]))
  },
  {
    check: airTurnsFollowTheBody,
    rule: 'turns in the air',
    what: 'a rat turning in the air without having gone that way',
    broken: () => walker(rows('walker', [{ clip: 'air' }, { clip: 'air', flip: true }])),
    clean: () =>
      walker(
        rows('walker', [
          { clip: 'air', body: 1000 },
          { clip: 'air', body: 997, x: 997, flip: true }
        ])
      )
  },
  {
    check: takeOversStartAtTheirStart,
    rule: 'clip takes over in its middle',
    what: 'a recovery taking over from a flinch on its frame 2',
    broken: () =>
      fox(
        rows('foxBoss', [
          { clip: 'hurt', frame: 2, state: 'recover' },
          { clip: 'recover', frame: 2, state: 'recover' }
        ])
      ),
    clean: () =>
      fox(
        rows('foxBoss', [
          { clip: 'hurt', frame: 2, state: 'recover' },
          { clip: 'recover', frame: 0, state: 'recover' }
        ])
      )
  },
  {
    check: leapsLandOnTheirLanding,
    rule: 'leap does not land on its landing',
    what: 'a leap that comes down standing',
    broken: () =>
      king(
        rows('king', [
          { clip: 'air', state: 'slam', onGround: false },
          { clip: 'idle', state: 'slam' }
        ])
      ),
    clean: () =>
      king(
        rows('king', [
          { clip: 'air', state: 'slam', onGround: false },
          { clip: 'land', state: 'slam' }
        ])
      )
  },
  {
    check: landingsNeedATouchdown,
    rule: 'landing without a touchdown',
    what: 'a landing after a pose on the ground',
    broken: () =>
      king(
        rows('king', [
          { clip: 'rage', frame: 9, posed: 'rage', state: 'recover' },
          { clip: 'land', state: 'recover' }
        ])
      ),
    clean: () =>
      king(
        rows('king', [
          { clip: 'air', state: 'slam', onGround: false },
          { clip: 'land', state: 'slam' }
        ])
      )
  },
  {
    check: stagedMomentsHandOverCleanly,
    rule: 'staged moment hands over in the middle',
    what: 'a landing on its frame 2 after the staged rage',
    broken: () =>
      king(
        rows('king', [
          { clip: 'rage', frame: 9, posed: 'rage', state: 'recover' },
          { clip: 'land', frame: 2, state: 'recover' }
        ])
      ),
    clean: () =>
      king(
        rows('king', [
          { clip: 'rage', frame: 9, posed: 'rage', state: 'recover' },
          { clip: 'recover', state: 'recover' }
        ])
      )
  },
  {
    check: stagedMomentsHandOverCleanly,
    rule: 'staged moment hands over in the middle',
    what: 'a leap that resumes in its middle after the pose',
    broken: () =>
      king(
        rows('king', [
          { clip: 'air', frame: 1, state: 'slam', onGround: false },
          { clip: 'rage', posed: 'rage', state: 'slam', onGround: false },
          { clip: 'air', frame: 2, state: 'slam', onGround: false }
        ])
      ),
    clean: () => king(rows('king', [{ clip: 'idle' }, { clip: 'rage', posed: 'rage' }, { clip: 'idle', frame: 2 }]))
  },
  {
    check: stagedPosesStandOnTheGround,
    rule: 'staged pose in the air',
    what: 'the staged rage held 120 px up in his leap',
    broken: () =>
      king(
        rows(
          'king',
          times(10, () => ({ clip: 'rage', posed: 'rage', held: true, onGround: false, supported: false }))
        )
      ),
    clean: () =>
      king(
        rows(
          'king',
          times(10, () => ({ clip: 'rage', posed: 'rage', held: true }))
        )
      )
  },
  {
    check: transformationBeginsBetweenActions,
    rule: 'transformation begins in an action',
    what: 'the rage begun on a dash',
    broken: () =>
      kingRage((list) => {
        for (let i = 15; i < 21; i++) Object.assign(list[i], { clip: 'attack', frame: i - 15, state: 'charge' })
        list[21].state = 'charge'
      }),
    clean: () => kingRage()
  },
  {
    check: transformationBeginsBetweenActions,
    rule: 'transformation begins in an action',
    what: 'the rage begun on a dash a wall ended, its picture left on its frame (seen out of it for 3 steps, his walk too)',
    broken: () => kingRage((list) => dashUpTo(list, 'stunned')),
    clean: () =>
      kingRage((list) => {
        dashUpTo(list, 'stunned')
        for (const i of [18, 19, 20]) Object.assign(list[i], { clip: 'move', frame: 0, state: 'idle' })
      })
  },
  {
    check: transformationBeginsBetweenActions,
    rule: 'transformation begins in an action',
    what: 'the rage begun on a body still sliding at 244 px/s in his recovery (his walk at that speed is not)',
    broken: () => kingRage((list) => slide(list, 'recover')),
    clean: () => kingRage((list) => slide(list, 'idle'))
  },
  {
    check: transformationBeginsBetweenActions,
    rule: 'the backstop was reached',
    what: `the rage begun more than ${RAGE_WAIT_SECONDS} s after it was due`,
    broken: () =>
      kingRage((list) => {
        list[20].steps = Math.round(RAGE_WAIT_SECONDS / STEP)
        for (let i = 20; i < list.length; i++) list[i].sim += Math.round(RAGE_WAIT_SECONDS / STEP)
      }),
    clean: () => kingRage()
  },
  {
    check: transformationBeginsBetweenActions,
    rule: 'attack after the transformation without its wind-up',
    what: 'the dash after the moment with no wind-up',
    broken: () =>
      kingRage((list) =>
        list.forEach((row) => row.clip === 'windup' && Object.assign(row, { clip: 'idle', state: 'idle' }))
      ),
    clean: () => kingRage()
  },
  {
    check: entranceBeginsBetweenActions,
    rule: 'entrance begins in an action',
    what: "the boar's entrance cutting his charge (round 8: as the transformation, only between his actions)",
    broken: () =>
      fake([
        track(
          'boss',
          'boarBoss',
          rows('boarBoss', [
            ...times(4, (i) => ({ clip: 'attack', frame: 2 + i, state: 'charge', vx: 400 })),
            ...times(4, () => ({ clip: 'idle', state: 'charge', posed: 'idle', moment: 'boss-intro', held: true }))
          ])
        )
      ]),
    clean: () =>
      fake([
        track(
          'boss',
          'boarBoss',
          rows('boarBoss', [
            ...times(4, () => ({ clip: 'idle', state: 'idle' })),
            // (On the step his wind-up begins, or in its first 0.1 s: still between his actions.)
            ...times(4, () => ({ clip: 'idle', state: 'windup', posed: 'idle', moment: 'boss-intro', held: true }))
          ]).concat(
            // (The bear dropping in: a plain fall is no action.)
            ...rows(
              'bearBoss',
              [
                ...times(3, () => ({ clip: 'air', frame: 1, onGround: false })),
                ...times(2, () => ({ clip: 'idle', posed: 'idle', moment: 'boss-intro', held: true, onGround: false }))
              ],
              20
            ),
            // (A plain fall's landing from its second frame on is rest.)
            ...rows(
              'bearBoss',
              [
                { clip: 'land', frame: 0, state: 'idle' },
                { clip: 'land', frame: 1, state: 'idle' },
                ...times(2, () => ({ clip: 'idle', state: 'idle', posed: 'idle', moment: 'boss-intro', held: true }))
              ],
              40
            )
          )
        )
      ])
  },
  {
    check: entranceBeginsBetweenActions,
    rule: 'entrance begins in an action',
    what: "the entrance on a landing's touchdown frame, or in a slam's leap (a plain fall and its settling may)",
    broken: () =>
      fake([
        track(
          'boss',
          'bearBoss',
          rows('bearBoss', [
            ...times(3, () => ({ clip: 'air', frame: 1, onGround: false, state: 'idle' })),
            { clip: 'land', frame: 0, state: 'idle' },
            ...times(2, () => ({ clip: 'idle', state: 'idle', posed: 'idle', moment: 'boss-intro', held: true }))
          ]).concat(
            rows(
              'bearBoss',
              [
                ...times(3, () => ({ clip: 'air', frame: 1, onGround: false, state: 'slam' })),
                ...times(2, () => ({ clip: 'idle', state: 'slam', posed: 'idle', moment: 'boss-intro', held: true }))
              ],
              20
            )
          )
        )
      ]),
    clean: () =>
      fake([
        track(
          'boss',
          'bearBoss',
          rows('bearBoss', [
            ...times(3, () => ({ clip: 'air', frame: 1, onGround: false, state: 'idle' })),
            { clip: 'land', frame: 0, state: 'idle' },
            { clip: 'land', frame: 1, state: 'idle' },
            ...times(2, () => ({ clip: 'idle', state: 'idle', posed: 'idle', moment: 'boss-intro', held: true }))
          ])
        )
      ])
  },
  {
    check: entranceBeginsBetweenActions,
    rule: 'entrance begins in an action',
    what: "the bee's entrance with her light half gathered",
    broken: () =>
      fake([
        track(
          'boss',
          'beeBoss',
          rows('beeBoss', [
            ...times(4, () => ({ clip: 'idle', state: 'idle', cue: cue(12) })),
            ...times(3, () => ({ clip: 'idle', state: 'idle', posed: 'idle', moment: 'boss-intro', held: true }))
          ])
        )
      ]),
    clean: () =>
      fake([
        track(
          'boss',
          'beeBoss',
          rows('beeBoss', [
            ...times(4, () => ({ clip: 'idle', state: 'idle' })),
            ...times(5, () => ({ clip: 'windup', state: 'windup' })),
            ...times(3, () => ({ clip: 'idle', state: 'windup', posed: 'idle', moment: 'boss-intro', held: true }))
          ])
        )
      ])
  },
  {
    check: entranceBeginsBetweenActions,
    rule: 'entrance begins in an action',
    what: "the bee's entrance after 0.2 s of her wind-up (its first 0.1 s and a step are still a rest)",
    broken: () =>
      fake([
        track(
          'boss',
          'beeBoss',
          rows('beeBoss', [
            ...times(12, (i) => ({ clip: 'windup', frame: Math.min(3, i >> 2), state: 'windup' })),
            ...times(3, () => ({ clip: 'idle', state: 'windup', posed: 'idle', moment: 'boss-intro', held: true }))
          ])
        )
      ]),
    clean: () =>
      fake([
        track(
          'boss',
          'beeBoss',
          rows('beeBoss', [
            ...times(6, () => ({ clip: 'windup', state: 'windup' })),
            ...times(3, () => ({ clip: 'idle', state: 'windup', posed: 'idle', moment: 'boss-intro', held: true }))
          ])
        )
      ])
  },
  {
    check: slamsLandOnTheirImpact,
    rule: 'slam does not land on its impact',
    what: 'the shockwaves leaving on land/3',
    broken: () => king(rows('king', [{ clip: 'land', frame: 3, state: 'recover', events: ['boss-slam'] }])),
    clean: () => king(rows('king', [{ clip: 'land', frame: 0, state: 'recover', events: ['boss-slam'] }]))
  },
  {
    check: heldWorldsHoldStill,
    rule: 'held body changes',
    what: "the fox's dash looping on his body after the hero's death",
    broken: () =>
      fox(
        rows(
          'foxBoss',
          times(10, (i) => ({ clip: 'attack', frame: i % 6, over: true }))
        )
      ),
    clean: () =>
      fox(
        rows(
          'foxBoss',
          times(10, () => ({ clip: 'attack', frame: 2, over: true }))
        )
      )
  },
  {
    check: heldWorldsHoldStill,
    rule: 'held light changes',
    what: 'a light that grows after the stage is over',
    broken: () =>
      fox(
        rows(
          'foxBoss',
          times(10, (i) => ({ clip: 'idle', over: true, cue: cue(20 - i) }))
        )
      ),
    clean: () =>
      fox(
        rows(
          'foxBoss',
          times(10, () => ({ clip: 'idle', over: true, cue: cue(20) }))
        )
      )
  },
  {
    check: heldWorldsHoldStill,
    rule: 'held body changes',
    what: 'a rat snapping from its walk to standing after the end',
    broken: () =>
      walker(
        rows('walker', [
          { clip: 'move', frame: 3, over: true },
          { clip: 'move', frame: 3, over: true },
          { clip: 'idle', over: true }
        ])
      ),
    clean: () =>
      walker(
        rows(
          'walker',
          times(3, () => ({ clip: 'move', frame: 3, over: true }))
        )
      )
  },
  {
    check: heldWorldsHoldStill,
    rule: 'held body changes',
    what: 'a rat turning round after the end',
    broken: () =>
      walker(
        rows('walker', [
          { clip: 'idle', over: true },
          { clip: 'idle', over: true, flip: true }
        ])
      ),
    clean: () =>
      walker(
        rows('walker', [
          { clip: 'idle', over: true },
          { clip: 'idle', over: true }
        ])
      )
  },
  {
    check: heroActionsKeepTheirFacing,
    rule: 'hero action faces the wrong way',
    what: 'he bites backwards',
    broken: () =>
      hero(
        rows('hero', [
          { clip: 'bite', bit: 1, flip: true },
          { clip: 'bite', frame: 1, flip: true }
        ])
      ),
    clean: () =>
      hero(
        rows('hero', [
          { clip: 'bite', bit: 1 },
          { clip: 'bite', frame: 1 }
        ])
      )
  },
  {
    check: heroActionsKeepTheirFacing,
    rule: 'hero action faces the wrong way',
    what: 'a pivot shown without a turn of his drawn facing (the skid, the landing begin as he is drawn)',
    broken: () =>
      hero(
        rows('hero', [
          { clip: 'run' },
          { clip: 'skid', facing: -1, vx: 200 },
          { clip: 'turn', facing: -1 },
          { clip: 'fall', onGround: false },
          { clip: 'land', facing: -1 }
        ])
      ),
    clean: () =>
      hero(
        rows('hero', [
          { clip: 'run' },
          // (The simulation already faces left: his drawn facing is held, the skid and the landing begin with it.)
          { clip: 'skid', facing: -1, vx: 200 },
          { clip: 'turn', facing: -1, flip: true },
          { clip: 'fall', onGround: false, flip: true },
          { clip: 'land', facing: 1, flip: true }
        ])
      )
  },
  {
    check: heroActionsKeepTheirFacing,
    rule: 'hero action turns round',
    what: 'his skid mirrored partway through (the hold may keep it leaning against the simulation)',
    broken: () =>
      hero(
        rows('hero', [
          { clip: 'skid', vx: 200 },
          { clip: 'skid', frame: 1, vx: 150, flip: true, facing: -1 }
        ])
      ),
    clean: () =>
      hero(
        rows('hero', [
          { clip: 'skid', vx: 200, facing: -1 },
          { clip: 'skid', frame: 1, vx: 150, facing: -1 }
        ])
      )
  },
  {
    check: heroActionsKeepTheirFacing,
    rule: 'hero action turns round',
    what: 'his bite mirrored partway through (he turned away after biting)',
    broken: () =>
      hero(
        rows('hero', [
          { clip: 'bite', bit: 1 },
          { clip: 'bite', frame: 1 },
          { clip: 'bite', frame: 2, flip: true, facing: -1 }
        ])
      ),
    clean: () =>
      hero(
        rows('hero', [
          { clip: 'bite', bit: 1 },
          { clip: 'bite', frame: 1 },
          { clip: 'bite', frame: 2, facing: -1 }
        ])
      )
  },
  {
    check: facingDoesNotFlicker,
    rule: 'facing flickers',
    what: 'the hero turned on every step over an enemy',
    broken: () =>
      hero(
        rows(
          'hero',
          times(12, (i) => ({ clip: 'idle', flip: i % 2 === 1 }))
        )
      ),
    clean: () =>
      hero(
        rows(
          'hero',
          times(30, (i) => ({ clip: 'idle', flip: i >= 5 && i < 25 }))
        )
      )
  },
  {
    check: bodiesKeepTheirFacing,
    rule: 'knocked-out body turns',
    what: 'a knocked-out rat flung head first (facing away from the hero who hit it)',
    broken: () => fake([track('ghost', 'walker', rows('walker', [{ clip: 'defeat', heroDx: -40 }]), 'ghost#0')]),
    clean: () =>
      fake([track('ghost', 'walker', rows('walker', [{ clip: 'defeat', heroDx: -40, flip: true }]), 'ghost#0')])
  },
  {
    check: bodiesKeepTheirFacing,
    rule: 'knocked-out body turns',
    what: 'a knocked-out body turning as it flies',
    broken: () =>
      fake([
        track(
          'ghost',
          'walker',
          rows('walker', [
            { clip: 'defeat', heroDx: 40 },
            { clip: 'defeat', frame: 1, heroDx: 40, flip: true }
          ]),
          'ghost#0'
        )
      ]),
    clean: () =>
      fake([
        track(
          'ghost',
          'walker',
          rows('walker', [
            { clip: 'defeat', heroDx: 40 },
            { clip: 'defeat', frame: 1, heroDx: 40 }
          ]),
          'ghost#0'
        )
      ])
  },
  {
    check: bodiesKeepTheirFacing,
    rule: 'knocked-out body turns',
    what: "the fox's body turned from how he was last drawn",
    broken: () =>
      fake([
        track('boss', 'foxBoss', rows('foxBoss', [{ clip: 'idle', flip: true }])),
        track('ghost', 'foxBoss', rows('foxBoss', [{ clip: 'defeat' }], 2), 'ghost#0')
      ]),
    clean: () =>
      fake([
        track('boss', 'foxBoss', rows('foxBoss', [{ clip: 'idle', flip: true }])),
        track('ghost', 'foxBoss', rows('foxBoss', [{ clip: 'defeat', flip: true }], 2), 'ghost#0')
      ])
  },
  {
    check: standingTurnsNeedTheHero,
    rule: 'standing turn inside the dead zone',
    what: 'a standing rat turning with the hero 4 px over',
    broken: () => walker(rows('walker', [{ clip: 'idle' }, { clip: 'idle', flip: true, aimDx: -4 }])),
    clean: () => walker(rows('walker', [{ clip: 'idle' }, { clip: 'idle', flip: true, aimDx: -20 }]))
  },
  {
    check: heroStandsThroughMoments,
    rule: 'hero held in an action through a moment',
    what: 'the hero held on a frame of his hurt through the roar (one that plays out and stands is right)',
    broken: () =>
      hero(
        rows(
          'hero',
          times(20, () => ({ clip: 'hurt', held: true, moment: 'boss-phase' }))
        )
      ),
    clean: () =>
      hero(
        rows(
          'hero',
          times(20, (i) =>
            i < 8
              ? { clip: 'hurt', frame: i >> 1, held: true, moment: 'boss-phase' }
              : { clip: 'idle', held: true, moment: 'boss-phase' }
          )
        )
      )
  },
  {
    check: heroStandsThroughMoments,
    rule: 'hero held in an action through a moment',
    what: "the hero held on his bite's first frame through the roar (in the air he may hang)",
    broken: () =>
      hero(
        rows(
          'hero',
          times(20, () => ({ clip: 'bite', held: true, moment: 'boss-phase' }))
        )
      ),
    clean: () =>
      hero(
        rows(
          'hero',
          times(20, () => ({ clip: 'bite', held: true, onGround: false, moment: 'boss-phase' }))
        )
      )
  },
  {
    check: heavyFallsLand,
    rule: 'heavy fall without its landing',
    what: 'the king comes down from a fall standing',
    broken: () =>
      king(
        rows('king', [
          ...times(12, (i) => ({ clip: 'air', state: 'idle', onGround: false, feet: 700 + 6 * i })),
          { clip: 'idle', state: 'idle', feet: 772 }
        ])
      ),
    clean: () =>
      king(
        rows('king', [
          ...times(12, (i) => ({ clip: 'air', state: 'idle', onGround: false, feet: 700 + 6 * i })),
          { clip: 'land', state: 'idle', feet: 772 }
        ])
      )
  },
  {
    check: heavyFallsLand,
    rule: 'heavy fall without its landing',
    what: 'no landing with his wind-up 0.33 s off (none is right with less than FIT_MIN before it)',
    broken: () =>
      king(
        rows('king', [
          ...times(12, (i) => ({ clip: 'air', state: 'idle', onGround: false, feet: 700 + 6 * i })),
          ...times(20, () => ({ clip: 'idle', state: 'idle', feet: 772 })),
          { clip: 'windup', state: 'windup', feet: 772 }
        ])
      ),
    clean: () =>
      king(
        rows('king', [
          ...times(12, (i) => ({ clip: 'air', state: 'idle', onGround: false, feet: 700 + 6 * i })),
          ...times(2, () => ({ clip: 'idle', state: 'idle', feet: 772 })),
          { clip: 'windup', state: 'windup', feet: 772 }
        ])
      )
  },
  {
    check: transformationBeginsBetweenActions,
    rule: 'transformation begins in an action',
    what: "the rage begun from a slam's landing (from a plain fall's second landing frame it is rest)",
    broken: () =>
      kingRage((list) => {
        list[18] = { ...list[18], onGround: false, clip: 'air', state: 'slam' }
        list[19] = { ...list[19], onGround: false, clip: 'air', state: 'slam' }
        list[20] = { ...list[20], clip: 'land', events: ['boss-slam'] }
      }),
    clean: () =>
      kingRage((list) => {
        list[18] = { ...list[18], onGround: false, clip: 'air' }
        list[19] = { ...list[19], onGround: false, clip: 'air' }
        list[20] = { ...list[20], clip: 'land' }
      })
  },
  {
    check: transformationBeginsBetweenActions,
    rule: 'transformation begins in an action',
    what: "the rage begun on a plain fall's touchdown frame",
    broken: () =>
      kingRage((list) => {
        list[19] = { ...list[19], onGround: false, clip: 'air' }
        list[20] = { ...list[20], onGround: false, clip: 'air' }
      }),
    clean: () =>
      kingRage((list) => {
        list[18] = { ...list[18], onGround: false, clip: 'air' }
        list[19] = { ...list[19], onGround: false, clip: 'air' }
        list[20] = { ...list[20], clip: 'land' }
      })
  },
  {
    check: transformationBeginsBetweenActions,
    rule: 'transformation begins in an action',
    what: 'the rage begun on the step after he touches down from a fall',
    broken: () => kingRage((list) => [18, 19].forEach((i) => (list[i].onGround = false))),
    clean: () => kingRage((list) => [14, 15].forEach((i) => (list[i].onGround = false)))
  },
  {
    check: transformationBeginsBetweenActions,
    rule: 'transformation begins in an action',
    what: 'the rage begun 0.2 s into a wind-up (its first 0.1 s are still a rest)',
    broken: () => kingRage((list) => windupBefore(list, 0.2)),
    clean: () => kingRage((list) => windupBefore(list, 0.05))
  },
  {
    check: actionsKeepTheirFacing,
    rule: 'action turns round',
    what: 'a flip on the release frame',
    broken: () =>
      fox(
        rows('foxBoss', [
          { clip: 'shoot' },
          { clip: 'shoot', frame: 2 },
          { clip: 'shoot', frame: 3, flip: true, shot: -1, events: ['boss-shoot'] }
        ])
      ),
    clean: () =>
      fox(
        rows('foxBoss', [
          { clip: 'shoot' },
          { clip: 'shoot', frame: 2 },
          { clip: 'shoot', frame: 3, shot: 1, events: ['boss-shoot'] }
        ])
      )
  },
  {
    check: actionsKeepTheirFacing,
    rule: 'cast begins facing away from its aim',
    what: 'a throw begun facing away from the hero',
    broken: () => fox(rows('foxBoss', [{ clip: 'shoot', flip: true }])),
    clean: () => fox(rows('foxBoss', [{ clip: 'shoot' }]))
  },
  {
    check: actionsKeepTheirFacing,
    rule: 'cast begins facing away from its aim',
    what: 'a cast begun at 30 Hz facing away on both steps of its frame (round 8: every step is read, not only the last)',
    broken: () => fox(at30([{ clip: 'shoot', flip: true, aimDx: 200, heroDx: 200, aims: [200, 200] }], 1, 'foxBoss')),
    clean: () =>
      fake([
        track('boss', 'foxBoss', [
          // (Begun on the first step, the hero inside the aim zone; the second, the last, has him clearly right.)
          ...at30([{ clip: 'shoot', flip: true, aimDx: 200, heroDx: 200, aims: [3, 200] }], 1, 'foxBoss'),
          // (Begun on the first step, the hero to the left, who crossed on the second.)
          ...at30([{ clip: 'shoot', flip: true, aimDx: 200, heroDx: 200, aims: [-60, 200] }], 10, 'foxBoss')
        ])
      ])
  },
  {
    check: leadInsFollowTheirAim,
    rule: 'lead-in faces away from its aim',
    what: 'a lead-in kept facing away for 3 frames after the hero crossed',
    broken: () =>
      fox(
        rows(
          'foxBoss',
          [0, 1, 1, 2].map((frame, i) => ({ clip: 'shoot', frame, heroDx: i ? -200 : 200 }))
        )
      ),
    clean: () =>
      fox(
        rows(
          'foxBoss',
          [0, 1, 2].map((frame) => ({ clip: 'shoot', frame }))
        )
      )
  },
  {
    check: facingDoesNotFlicker,
    rule: 'facing flickers',
    what: 'a turn and another 0.07 s later (but not when the second is a hit turning it to the blow)',
    broken: () =>
      walker(
        rows(
          'walker',
          times(20, (i) => ({ clip: 'idle', flip: i >= 5 && i < 9 }))
        )
      ),
    clean: () =>
      walker(
        rows(
          'walker',
          times(20, (i) => ({ clip: i >= 9 ? 'hurt' : 'idle', flip: i >= 5 && i < 9 }))
        )
      )
  },
  {
    check: actionsPlayOut,
    rule: 'action is cut short',
    what: "a slam's landing cut by a staged pose (a plain fall's, its impact shown, may be)",
    broken: () =>
      king(
        rows('king', [
          { clip: 'air', state: 'slam', onGround: false },
          { clip: 'land', state: 'recover', events: ['boss-slam'] },
          { clip: 'land', state: 'recover' },
          { clip: 'land', frame: 1, state: 'recover' },
          { clip: 'idle', state: 'recover', posed: 'idle', held: true }
        ])
      ),
    clean: () =>
      king(
        rows('king', [
          { clip: 'air', state: 'idle', onGround: false },
          { clip: 'land', state: 'idle' },
          { clip: 'land', frame: 1, state: 'idle' },
          { clip: 'idle', state: 'idle', posed: 'idle', held: true }
        ])
      )
  },
  {
    check: heavyFallsLand,
    rule: 'heavy fall without its landing',
    what: 'the king comes down from a fall in his recovery without a landing (in a charge his dash carries him on)',
    broken: () =>
      king(
        rows('king', [
          ...times(12, (i) => ({ clip: 'air', state: 'recover', onGround: false, feet: 700 + 6 * i })),
          ...times(10, () => ({ clip: 'idle', state: 'recover', feet: 772 }))
        ])
      ),
    clean: () =>
      king(
        rows('king', [
          ...times(12, (i) => ({ clip: 'attack', frame: i % 6, state: 'charge', onGround: false, feet: 700 + 6 * i })),
          ...times(10, (i) => ({ clip: 'attack', frame: i % 6, state: 'charge', feet: 772 }))
        ])
      )
  },
  {
    check: heroActionsKeepTheirFacing,
    rule: 'hero action turns round',
    what: 'a skid on its first frame mirrored while it plays (one begun again, its clock back at 0, may face anew)',
    broken: () =>
      hero(
        rows('hero', [
          { clip: 'skid', clipT: 0, vx: 119 },
          { clip: 'skid', clipT: 0.03, vx: 87 },
          { clip: 'skid', clipT: 0.06, vx: 119, flip: true, facing: -1 }
        ])
      ),
    clean: () =>
      hero(
        rows('hero', [
          { clip: 'skid', clipT: 0, vx: 119 },
          { clip: 'skid', clipT: 0.03, vx: 87 },
          { clip: 'skid', clipT: 0, vx: 119, flip: true, facing: -1 }
        ])
      )
  },
  {
    check: hurtFacesTheBlow,
    rule: 'hurt is carried forwards',
    what: 'the hero carried left facing left in his hurt (a staged pose that takes it over sets its own face)',
    broken: () =>
      hero(
        rows(
          'hero',
          times(10, (i) => ({ clip: 'hurt', flip: true, x: 1000 - 3 * i, body: 1000 - 3 * i, vx: -180 }))
        )
      ),
    clean: () =>
      hero(
        rows(
          'hero',
          times(10, (i) => ({
            clip: 'hurt',
            flip: i >= 7,
            posed: i >= 7 ? 'hurt' : null,
            x: 1000 - 3 * Math.min(i, 7),
            body: 1000 - 3 * Math.min(i, 7),
            vx: i >= 7 ? 0 : -180
          }))
        )
      )
  },
  {
    check: facingDoesNotFlicker,
    rule: 'facing flickers',
    what: 'a turn just before a short hold and one back just after it (the clock runs through the hold)',
    broken: () =>
      hero(
        rows('hero', [
          ...times(3, () => ({ clip: 'idle' })),
          ...times(2, () => ({ clip: 'idle', flip: true })),
          ...times(4, () => ({ clip: 'idle', posed: 'idle', flip: true, held: true, moment: 'boss-phase' })),
          ...times(10, () => ({ clip: 'idle' }))
        ])
      ),
    clean: () =>
      hero(
        rows('hero', [
          ...times(3, () => ({ clip: 'idle' })),
          ...times(2, () => ({ clip: 'idle', flip: true })),
          ...times(12, () => ({ clip: 'idle', posed: 'idle', flip: true, held: true, moment: 'boss-phase' })),
          ...times(10, () => ({ clip: 'idle' }))
        ])
      )
  },
  {
    check: heroStandsThroughMoments,
    rule: 'hero held in an action through a moment',
    what: "the hold's pose playing his hurt out and then keeping its last frame (played out, it stands)",
    broken: () =>
      hero(
        rows(
          'hero',
          times(30, (i) => ({
            clip: 'hurt',
            frame: Math.min(3, i >> 1),
            posed: 'hurt',
            held: true,
            moment: 'boss-phase'
          }))
        )
      ),
    clean: () =>
      hero(
        rows(
          'hero',
          times(30, (i) =>
            i < 8
              ? { clip: 'hurt', frame: i >> 1, posed: 'hurt', held: true, moment: 'boss-phase' }
              : { clip: 'idle', posed: 'idle', held: true, moment: 'boss-phase' }
          )
        )
      )
  },
  // ----------------------------------------------------------------------------------------------- round 7
  {
    check: facingDoesNotFlicker,
    rule: 'facing flickers',
    what: 'two turns 0.13 s apart on the screen (after a 50 ms frame whose first step decided the first, they are 0.15 s apart in the simulation)',
    broken: () =>
      walker(
        rows(
          'walker',
          times(20, (i) => ({ clip: 'idle', flip: i >= 5 && i < 13 }))
        )
      ),
    clean: () =>
      walker(
        rows(
          'walker',
          times(20, (i) => ({
            clip: 'idle',
            flip: i >= 5 && i < 13,
            ...(i === 5 ? { dt: 0.05, steps: 3, viewDt: 0.05 } : {})
          }))
        )
      )
  },
  {
    check: heroIsDrawn,
    rule: 'hero not drawn',
    what: 'the hero hidden 0.15 s on the screen in frames of 8 ms (with a 58 ms frame passing over a shown phase, he may be)',
    broken: () =>
      hero(
        timed(
          rows('hero', [
            { clip: 'run' },
            ...times(18, () => ({ clip: 'run', drawn: false, dt: 1 / 120 })),
            { clip: 'run', dt: 1 / 120 }
          ])
        )
      ),
    clean: () =>
      hero(
        timed(
          rows('hero', [
            { clip: 'run' },
            ...times(5, () => ({ clip: 'run', drawn: false, dt: 1 / 120 })),
            { clip: 'run', drawn: false, dt: 7 / 120 },
            ...times(5, () => ({ clip: 'run', drawn: false, dt: 1 / 120 })),
            { clip: 'run', dt: 1 / 120 }
          ])
        )
      )
  },
  {
    check: facingDoesNotFlicker,
    rule: 'facing flickers',
    what: "the hero's turn back drawn as his skid 0.07 s after a turn, his body still (after 8 px his run's way, it is his run's)",
    broken: () =>
      hero(
        rows(
          'hero',
          times(16, (i) => ({ clip: i >= 9 ? 'skid' : 'run', flip: i >= 5 && i < 9, path: [1000], body: 1000 }))
        )
      ),
    clean: () =>
      hero(
        rows(
          'hero',
          times(16, (i) => ({
            clip: i >= 9 ? 'skid' : 'run',
            flip: i >= 5 && i < 9,
            path: [1000 + 2.5 * Math.max(0, i - 5)],
            body: 1000 + 2.5 * Math.max(0, i - 5)
          }))
        )
      )
  },
  {
    check: bodiesKeepTheirFacing,
    rule: 'knocked-out body turns',
    what: "the crow's body turned on a frame of one step (on a frame of two, the turn may be on the step it passed over)",
    broken: () =>
      fake([
        track('boss', 'crowBoss', rows('crowBoss', [{ clip: 'recover' }])),
        track('ghost', 'crowBoss', rows('crowBoss', [{ clip: 'defeat', flip: true }], 2), 'ghost#0')
      ]),
    clean: () =>
      fake([
        track('boss', 'crowBoss', rows('crowBoss', [{ clip: 'recover' }])),
        track('ghost', 'crowBoss', rows('crowBoss', [{ clip: 'defeat', flip: true, steps: 2 }], 2), 'ghost#0')
      ])
  },
  {
    check: framesNeverGoBack,
    rule: 'light goes back',
    what: "the light's frames 5, 4, 5 around a 50 ms display frame (the outside reviewer's case)",
    broken: () =>
      foxShot((list) => {
        const at = shotRowOf(list)
        list[at - 7].dt = 0.05
        list[at - 7].cue!.frame = 5
        list[at - 6].cue!.frame = 4
        list[at - 5].cue!.frame = 5
      }),
    clean: () => foxShot()
  },
  {
    check: framesNeverGoBack,
    rule: 'frame goes back',
    what: "a landing's frame going back (a clip begun again on its first frame, or a wind-up's trembling tail, may)",
    broken: () =>
      king(
        rows('king', [
          { clip: 'land', state: 'idle' },
          { clip: 'land', frame: 2, state: 'idle' },
          { clip: 'land', frame: 1, state: 'idle' }
        ])
      ),
    clean: () =>
      king(
        rows('king', [
          { clip: 'land', state: 'idle' },
          { clip: 'land', frame: 2, state: 'idle' },
          { clip: 'land', state: 'idle' },
          ...times(6, (i) => ({ clip: 'windup', frame: i < 2 ? i : 2 + (i % 2), state: 'windup' }))
        ])
      )
  },
  {
    check: framesNeverGoBack,
    rule: 'frame goes back',
    what: "a knocked-out rat's tumble going back on the ground (round 8: in the air it may cycle while it falls far)",
    broken: () =>
      fake([
        track(
          'ghost',
          'walker',
          rows(
            'walker',
            [1, 2, 3, 1].map((frame, i) => ({ clip: 'defeat', frame, supported: i === 3 }))
          ),
          'ghost#0'
        )
      ]),
    clean: () =>
      fake([
        track(
          'ghost',
          'walker',
          rows(
            'walker',
            [1, 2, 3, 1, 2, 3, 4].map((frame) => ({ clip: 'defeat', frame, supported: frame === 4 }))
          ),
          'ghost#0'
        )
      ])
  },
  {
    check: framesNeverGoBack,
    rule: 'frame goes back',
    what: "the knocked-out hero's tumble going back on the ground, or out of his bounce (in the air it cycles)",
    broken: () =>
      hero(
        rows('hero', [
          ...[1, 2, 3, 4].map((frame) => ({ clip: 'die', frame, over: true, onGround: frame === 4 })),
          { clip: 'die', frame: 1, over: true, onGround: false }
        ])
      ),
    clean: () =>
      hero(
        rows(
          'hero',
          [0, 1, 2, 3, 1, 2, 3, 4, 5, 6, 7, 6].map((frame) => ({
            clip: 'die',
            frame,
            over: true,
            onGround: frame >= 4
          }))
        )
      )
  },
  {
    check: endingsPlayOut,
    rule: 'the ending stands still',
    what: 'the knocked-out hero held on die/0 once the stage is over (round 8: the clocks that stopped)',
    broken: () => hero(knockedOut((list) => list.forEach((row) => Object.assign(row, { frame: 0, feet: 800 })))),
    clean: () => hero(knockedOut())
  },
  {
    check: endingsPlayOut,
    rule: 'the ending stands still',
    what: 'a cheer held on its first frame (a frame of 250 ms may show one frame of it: the longest frame is allowed)',
    broken: () =>
      hero(
        timed(
          rows(
            'hero',
            times(20, () => ({ clip: 'cheer', over: true, posed: 'cheer' }))
          )
        )
      ),
    clean: () =>
      hero(
        timed(
          rows('hero', [
            ...times(6, (i) => ({ clip: 'cheer', frame: Math.floor(i / 5), over: true, posed: 'cheer' })),
            { clip: 'cheer', frame: 2, over: true, posed: 'cheer', dt: 0.25 },
            ...times(6, (i) => ({ clip: 'cheer', frame: 3 + Math.floor(i / 5), over: true, posed: 'cheer' }))
          ])
        )
      )
  },
  {
    check: endingsPlayOut,
    rule: 'hangs in the air',
    what: 'the knocked-out body tumbling where it was knocked up, never falling',
    broken: () =>
      hero(
        knockedOut((list) =>
          list.forEach((row) => {
            if (!row.onGround) row.feet = 700
          })
        )
      ),
    clean: () => hero(knockedOut())
  },
  {
    check: endingsPlayOut,
    rule: 'tumbles on the ground',
    what: 'the knocked-out body come down, still tumbling (it bounces on the frame it comes down)',
    broken: () =>
      hero(
        knockedOut((list) =>
          list.forEach((row, i) => {
            if (row.frame >= 4) Object.assign(row, { frame: 1 + (Math.floor(i / 6) % 3) })
          })
        )
      ),
    clean: () => hero(knockedOut())
  },
  {
    check: endingsPlayOut,
    rule: 'no cheer after the clear',
    what: 'a clear touched in the air: down on the ground he stands instead of cheering',
    broken: () =>
      hero(
        clearedInTheAir((list) =>
          list.forEach((row) => {
            if (row.clip === 'cheer') row.clip = 'idle'
          })
        )
      ),
    clean: () => hero(clearedInTheAir())
  },
  {
    check: fittedClipsShowEveryFrame,
    rule: 'fitted clip passes over a frame',
    what: "the bear's fitted landing at 30 Hz drawn 0, 1, 3, 3 (round 7's reserve for the last frame)",
    broken: () => bear(at30([0, 1, 3, 3].map((frame) => ({ clip: 'land', frame, state: 'idle' })))),
    clean: () =>
      fake([
        track('boss', 'bearBoss', [
          ...at30([0, 1, 2, 3].map((frame) => ({ clip: 'land', frame, state: 'idle' }))),
          // (With fewer display frames than frames: a frame a display frame, and only into its last a jump.)
          ...at30(
            [0, 3].map((frame) => ({ clip: 'land', frame, state: 'idle' })),
            10
          ),
          ...at30(
            [0, 1, 3].map((frame) => ({ clip: 'land', frame, state: 'idle' })),
            20
          )
        ])
      ])
  },
  {
    check: fittedClipsShowEveryFrame,
    rule: 'fitted clip passes over a frame',
    what: 'a landing passing over a frame with as many display frames as frames, on a long one; or a middle one with fewer (the coordinator’s (d))',
    broken: () =>
      fake([
        track('boss', 'bearBoss', [
          ...timed(
            rows(
              'bearBoss',
              [0, 0, 3, 3].map((frame, i) => ({
                clip: 'land',
                frame,
                state: 'idle',
                dt: i === 2 ? 3 / 60 : STEP,
                viewDt: i === 2 ? 3 / 60 : STEP
              }))
            )
          ),
          ...at30(
            [0, 2, 3].map((frame) => ({ clip: 'land', frame, state: 'idle' })),
            20
          )
        ])
      ]),
    clean: () =>
      bear(
        timed(
          rows(
            'bearBoss',
            [0, 1, 2, 3].map((frame, i) => ({
              clip: 'land',
              frame,
              state: 'idle',
              dt: i === 2 ? 3 / 60 : STEP,
              viewDt: i === 2 ? 3 / 60 : STEP
            }))
          )
        )
      )
  },
  {
    check: fittedClipsShowEveryFrame,
    rule: 'fitted clip passes over a frame',
    what: "a cast's follow-through at 30 Hz drawn 3, 5, 5 with its three display frames (each part is counted alone)",
    broken: () => fox(at30(foxCast([0, 0, 1, 1, 2, 2, 2, 3, 5, 5]))),
    clean: () =>
      fake([
        track('boss', 'foxBoss', [
          ...at30(foxCast([0, 0, 1, 1, 2, 2, 2, 3, 4, 5])),
          // (A lead-in squeezed into two display frames passes over its middle; the follow-through has its own.)
          ...at30(foxCast([0, 2, 3, 4, 5]), 20)
        ])
      ])
  },
  {
    check: fittedClipsShowEveryFrame,
    rule: 'fitted clip passes over a frame',
    what: 'a lead-in at 60 Hz passing over its last frame before the release',
    broken: () => fox(rows('foxBoss', foxCast([0, 0, 0, 1, 1, 1, 3, 4, 4, 5, 5]))),
    clean: () => fox(rows('foxBoss', foxCast([0, 0, 0, 1, 1, 1, 2, 3, 4, 4, 5, 5])))
  },
  {
    check: actionsStartAtTheirStart,
    rule: 'action starts in its middle',
    what: "an action shown first on its second frame after an even frame (after a long one that held its first frame's whole time, it may be)",
    broken: () =>
      king(
        rows('king', [
          { clip: 'idle', state: 'idle' },
          { clip: 'land', frame: 1, state: 'idle' }
        ])
      ),
    clean: () =>
      king(
        rows('king', [
          { clip: 'idle', state: 'idle' },
          { clip: 'land', frame: 1, state: 'idle', dt: 0.25, viewDt: 0.25, steps: 4 }
        ])
      )
  },
  {
    check: shotsAreBornFromTheirLight,
    rule: 'shot is not born from its light',
    what: 'a shot born 30 px from the light as he crashes into a wall (born where his drawing moved, 8 px on, it is his)',
    broken: () =>
      foxShot((list) => {
        const row = list[shotRowOf(list)]
        Object.assign(row, { vx: 0, x: 1008 })
        Object.assign(row.births[0], { x: 1040, bornX: 1037 })
      }),
    clean: () =>
      foxShot((list) => {
        const row = list[shotRowOf(list)]
        Object.assign(row, { vx: 0, x: 1008 })
        // (He fired from where he stood before that step's move: born at the light.)
        Object.assign(row.births[0], { x: 1010 })
      })
  },
  // ----------------------------------------------------------------------------------------------- round 6p
  {
    check: bitesAreDrawn,
    rule: 'bite is not drawn',
    what: 'the bite of the step a hold begins on left out under the standing pose (drawn as its lead, it is shown)',
    broken: () =>
      hero(
        rows('hero', [
          { clip: 'run' },
          { clip: 'idle', posed: 'idle', moment: 'boss-defeat', bit: 1, events: ['bite'] },
          ...times(6, () => ({ clip: 'idle', posed: 'idle', held: true, moment: 'boss-defeat' }))
        ])
      ),
    clean: () =>
      hero(
        rows('hero', [
          { clip: 'run', flip: true },
          { clip: 'bite', posed: 'bite', moment: 'boss-defeat', bit: 1, events: ['bite'] },
          ...times(6, (i) => ({ clip: 'bite', frame: 1 + (i >> 1), posed: 'bite', held: true, moment: 'boss-defeat' }))
        ])
      )
  },
  {
    check: heroRunsWithHisTravel,
    rule: 'run against its travel',
    what: 'a run frame facing left while he slides right after a hold (round 8: everywhere, by any distance)',
    broken: () =>
      hero(
        rows('hero', [
          { clip: 'run', frame: 3 },
          ...times(6, () => ({ clip: 'idle', posed: 'idle', held: true, moment: 'boss-phase' })),
          ...times(4, (i) => ({ clip: 'run', frame: 3, flip: true, x: 1000 + 2 * i, body: 1000 + 2 * i, vx: 120 }))
        ])
      ),
    clean: () =>
      hero(
        rows('hero', [
          { clip: 'skid', vx: 200 },
          ...times(6, () => ({ clip: 'idle', posed: 'idle', held: true, moment: 'boss-phase' })),
          ...times(4, (i) => ({ clip: 'skid', frame: Math.min(2, i), x: 1000 + 2 * i, body: 1000 + 2 * i, vx: 120 })),
          ...times(4, (i) => ({ clip: 'run', frame: i, x: 1008 + 3 * i, body: 1008 + 3 * i, vx: 180 }))
        ])
      )
  },
  {
    check: heroRunsWithHisTravel,
    rule: 'run against its travel',
    what: 'one run frame facing right on a step that carries him half a pixel left (no distance is allowed)',
    broken: () =>
      hero(
        rows('hero', [
          { clip: 'run', x: 1000, body: 1000, vx: 30, path: [1000] },
          { clip: 'run', frame: 1, x: 999.5, body: 999.5, vx: -30, path: [999.5] }
        ])
      ),
    clean: () =>
      hero(
        rows('hero', [
          { clip: 'run', x: 1000, body: 1000, vx: 30, path: [1000] },
          { clip: 'skid', x: 999.5, body: 999.5, vx: -30, path: [999.5] },
          // (A long frame of four steps: a knock's last three back, then his run's first step on: it draws the run.)
          { clip: 'run', frame: 1, x: 999.42, body: 999.42, vx: 24, path: [999.32, 999.16, 999.03, 999.42], steps: 4 },
          // (A frame that shows no step draws what the last did.)
          { clip: 'run', frame: 1, x: 999.6, body: 999.6, vx: 24, steps: 0, viewDt: STEP },
          // (Put back by the simulation, 40 px in a step: not his own motion; in the air his run is not asked about.)
          { clip: 'run', frame: 2, x: 960, body: 960, vx: 30, path: [960] },
          { clip: 'run', frame: 3, x: 958, body: 958, vx: -120, path: [958], onGround: false }
        ])
      )
  },
  {
    check: heroRunsWithHisTravel,
    rule: 'run against its travel',
    what: 'a long frame whose last step, the one it draws, carries him 0.05 px back (0.01 px of float noise is none)',
    broken: () =>
      hero(
        rows('hero', [
          { clip: 'run', x: 1000, body: 1000, vx: 30, path: [1000] },
          { clip: 'run', frame: 1, x: 1000.35, body: 1000.35, vx: -3, path: [1000.2, 1000.4, 1000.35], steps: 3 }
        ])
      ),
    clean: () =>
      hero(
        rows('hero', [
          { clip: 'run', x: 1000, body: 1000, vx: 30, path: [1000] },
          { clip: 'run', frame: 1, x: 1000.395, body: 1000.395, vx: 0, path: [1000.2, 1000.4, 1000.395], steps: 3 }
        ])
      )
  },
  // ----------------------------------------------------------------------------------------------- round 8d
  {
    check: fittedClipsShowEveryFrame,
    rule: 'fitted clip passes over a frame',
    what: 'a modest change in display interval cannot hide both middle landing frames',
    broken: () => bear(uneven([0, 0, 3, 3], [1, 1.4, 1, 1])),
    clean: () => bear(uneven([0, 1, 3, 3], [1, 1.4, 1, 1]))
  },
  {
    check: actionsPlayOut,
    rule: 'action is cut short',
    what: 'a landing on uneven frames cannot drop its final two poses',
    broken: () =>
      bear(uneven([0, 1, 1, 1], [1, 1.4, 1, 1]).concat(rows('bearBoss', [{ clip: 'idle', state: 'idle' }], 5))),
    clean: () =>
      bear(uneven([0, 1, 2, 2], [1, 1.4, 1, 1]).concat(rows('bearBoss', [{ clip: 'idle', state: 'idle' }], 5)))
  },
  {
    check: heroWalkFollowsHisModel,
    rule: 'turn held against his drive',
    what: 'drawn facing right on frames of two steps that drive him left on both (keys that dither, one step each way, are no drive)',
    broken: () => hero(dither([-1, -1])),
    clean: () => hero(dither([1, -1]))
  },
  {
    check: heroWalkFollowsHisModel,
    rule: 'turn held against his drive',
    what: 'held against his drive (round 8f: steps a knock-back carries him are no drive)',
    broken: () => hero(walk('idle', [1000, 1002, 1004, 1006, 1008], { flip: true, faces: [1] })),
    clean: () => hero(walk('idle', [1000, 1002, 1004, 1006, 1008], { flip: true, faces: [1], knocks: [true] }))
  },
  {
    check: facingDoesNotFlicker,
    rule: 'facing flickers',
    what: 'a turn toward his travel while a knock still carries him (round 8f: the knock is no drive, no cause)',
    broken: () => {
      const list = dithered([1, 1, -1])
      list[0].events = ['hurt']
      return hero(list)
    },
    clean: () => hero(dithered([1, 1, -1]))
  },
  {
    check: endingsPlayOut,
    rule: 'knocked-out body in a wall',
    what: 'the knocked-out hero fallen down a hole\u2019s face, his drawn frame inside its wall (round 8f)',
    broken: () =>
      hero(knockedOut((list) => list.forEach((row) => row.frame >= 4 && Object.assign(row, { inSolid: true })))),
    clean: () => hero(knockedOut())
  },
  {
    check: endingsPlayOut,
    rule: 'body lies over a hole',
    what: 'the knocked-out hero lying with no ground under his middle (across a hole narrower than he is, the recorder counts him supported)',
    broken: () =>
      hero(knockedOut((list) => list.forEach((row) => row.frame >= 4 && Object.assign(row, { supported: false })))),
    clean: () => hero(knockedOut())
  },
  {
    check: facingDoesNotFlicker,
    rule: 'facing flickers',
    what: 'a turn back within 0.15 s on a frame of three steps (rule 1 decided on its second step, the keys back on its last: a cause)',
    broken: () => hero(dithered([-1, -1, -1])),
    clean: () => hero(dithered([1, 1, -1]))
  },
  {
    check: heroWalkFollowsHisModel,
    rule: 'turn held against his drive',
    what: 'held against his drive on drawn steps (the three steps a 58 ms frame hides before it turns him are none)',
    broken: () => hero(walk('run', [1000, 1002, 1004, 1006, 1008], { flip: true, faces: [1] })),
    clean: () =>
      hero(
        rows('hero', [
          { clip: 'run', flip: true, path: [1000] },
          { clip: 'run', flip: true, path: [1002, 1004, 1006, 1008], faces: [1, 1, 1, 1], steps: 4 },
          { clip: 'run', path: [1010], faces: [1] }
        ])
      )
  },
  {
    check: heroFlinchesOnTheBlow,
    rule: 'the flinch comes late',
    what: 'a blow and no flinch for 0.18 s (a bite of his own begun after the blow wins: the action begun later)',
    broken: () =>
      hero(
        rows('hero', [{ clip: 'idle', events: ['hurt'] }, ...times(10, () => ({ clip: 'idle' })), { clip: 'hurt' }])
      ),
    clean: () =>
      hero(
        rows('hero', [
          { clip: 'idle', events: ['hurt'] },
          { clip: 'bite', events: ['bite'], bit: 1 },
          ...times(10, (i) => ({ clip: 'bite', frame: Math.min(4, i >> 1) })),
          { clip: 'idle' }
        ])
      )
  },
  {
    check: fittedClipsShowEveryFrame,
    rule: 'fitted clip passes over a frame',
    what: 'a landing 0,1,3 on even frames (under uneven ones a frame three times the run\u2019s share may pass over one)',
    broken: () =>
      bear(
        timed(
          rows(
            'bearBoss',
            [0, 1, 3, 3].map((frame) => ({ clip: 'land', frame, state: 'idle' }))
          )
        )
      ),
    clean: () => bear(uneven([0, 1, 3, 3], [1, 1, 4, 1]))
  },
  {
    check: actionsPlayOut,
    rule: 'action is cut short',
    what: 'a landing that had a display frame for each of its frames cut before its last on even frames (uneven: a long frame may cost it one)',
    broken: () =>
      bear(uneven([0, 1, 2, 2], [1, 1, 1, 1]).concat(rows('bearBoss', [{ clip: 'idle', state: 'idle' }], 5))),
    clean: () => bear(uneven([0, 1, 2, 2], [1, 3, 1, 1]).concat(rows('bearBoss', [{ clip: 'idle', state: 'idle' }], 5)))
  },
  {
    check: heroWalkFollowsHisModel,
    rule: 'skid without a brake',
    what: 'a skid on a body that speeds up against his drawn facing for three steps (a skid is a brake that holds)',
    broken: () => hero(walk('skid', [1000, 999, 997.5, 995.5, 993], { faces: [1] })),
    clean: () => hero(walk('skid', [1000, 997, 994.5, 992.5, 991], { faces: [1] }))
  },
  {
    check: heroWalkFollowsHisModel,
    rule: 'picture for a single step',
    what: 'an idle of one step between two runs (he stands once he has stood two)',
    broken: () =>
      hero(
        rows('hero', [
          { clip: 'run', path: [1000] },
          { clip: 'idle', path: [1000] },
          { clip: 'run', frame: 1, path: [1000] }
        ])
      ),
    clean: () =>
      hero(
        rows('hero', [
          { clip: 'run', path: [1000] },
          { clip: 'idle', path: [1000] },
          { clip: 'idle', path: [1000] },
          { clip: 'run', frame: 1, path: [1000] }
        ])
      )
  },
  {
    check: heroWalkFollowsHisModel,
    rule: 'picture for a single step',
    what: 'a skid of one step between two runs (his own bite, jump, a hurt or a moment cutting it after one step: the action’s)',
    broken: () =>
      hero(
        rows('hero', [
          { clip: 'run', path: [1000] },
          { clip: 'skid', path: [1000] },
          { clip: 'run', frame: 1, path: [1000] }
        ])
      ),
    clean: () =>
      hero(
        rows('hero', [
          { clip: 'run', path: [1000] },
          { clip: 'skid', path: [1000] },
          { clip: 'bite', path: [1000], bit: 1, events: ['bite'] },
          { clip: 'turn', path: [1000], flip: true },
          { clip: 'jump', path: [1000], flip: true, onGround: false }
        ])
      )
  },
  {
    check: heroWalkFollowsHisModel,
    rule: 'turn held against his drive',
    what: 'held against a drive of 120 px/s (a drift of 12 px/s with no key is none; a skid of one step whose second hides in a two-step frame is no single step)',
    broken: () => hero(walk('idle', [1000, 1002, 1004, 1006, 1008], { flip: true, faces: [1] })),
    clean: () =>
      hero([
        ...walk('idle', [1000, 1000.2, 1000.4, 1000.6, 1000.8], { flip: true, faces: [1] }),
        ...rows(
          'hero',
          [
            { clip: 'run', path: [1001] },
            { clip: 'skid', path: [1001] },
            { clip: 'run', frame: 1, path: [1001, 1001], steps: 2 }
          ],
          10
        )
      ])
  },
  {
    check: heroWalkFollowsHisModel,
    rule: 'pivot slides',
    what: 'a pivot sliding 9 px (put back 23 px by the simulation on its first step, it is measured from there)',
    broken: () => hero(walk('turn', [1000, 1003, 1006, 1009])),
    clean: () => hero([...walk('run', [1000]), ...walk('turn', [1023, 1024.5, 1026], {}, 2)])
  },
  {
    check: heroWalkFollowsHisModel,
    rule: 'pivot slides',
    what: 'a pivot measured from its first step, resetting after a displacement inside a display frame',
    broken: () => hero(walk('turn', [1000, 1003, 1006, 1009])),
    clean: () =>
      hero(
        rows('hero', [
          { clip: 'run', path: [1000] },
          { clip: 'turn', path: [1002, 1025], steps: 2 },
          { clip: 'turn', path: [1027, 1029], steps: 2 }
        ])
      )
  },
  {
    check: heroWalkFollowsHisModel,
    rule: 'run after a hold while he coasts',
    what: 'his run while he coasts after a hold that posed him (after a slow moment that never posed him it is play)',
    broken: () => hero(afterHold('run')),
    clean: () =>
      hero(afterHold('run').map((row) => (row.posed ? { ...row, posed: null, moment: 'princess-free' } : row)))
  },
  {
    check: heroWalkFollowsHisModel,
    rule: 'pivot slides',
    what: 'a pivot drawn on a body gone 12 px since it began (it gives way to his run after 6 px)',
    broken: () => hero(walk('turn', [1000, 1003, 1006, 1009, 1012])),
    clean: () => hero([...walk('turn', [1000, 1001.5, 1003, 1004.5, 1006]), ...walk('run', [1009, 1012], {}, 6)])
  },
  {
    check: heroWalkFollowsHisModel,
    rule: 'turn held against his drive',
    what: 'drawn facing left while the simulation faces and drives him right for three steps (turned after two, it may)',
    broken: () => hero(walk('run', [1000, 1002, 1004, 1006, 1008], { flip: true, faces: [1] })),
    clean: () =>
      hero([
        ...walk('run', [1000, 1002, 1004], { flip: true, faces: [1] }),
        ...walk('run', [1006, 1008], { faces: [1] }, 4)
      ])
  },
  {
    check: heroWalkFollowsHisModel,
    rule: 'run after a hold while he coasts',
    what: 'his run after a moment while he only coasts to a stop (he stands; he runs when his speed holds or grows)',
    broken: () => hero(afterHold('run')),
    clean: () => hero(afterHold('idle'))
  },
  {
    check: heroFlinchesOnTheBlow,
    rule: 'the flinch comes late',
    what: 'his hurt first drawn 0.18 s after its blow (hit on the step a moment begins, he flinches under the hold)',
    broken: () =>
      hero(
        rows('hero', [
          { clip: 'idle', events: ['hurt'] },
          ...times(10, () => ({ clip: 'idle', posed: 'idle', moment: 'boss-intro', held: true })),
          { clip: 'hurt' }
        ])
      ),
    clean: () =>
      hero(
        rows('hero', [
          { clip: 'hurt', events: ['hurt'] },
          ...times(10, (i) => ({
            clip: 'hurt',
            frame: Math.min(2, i >> 2),
            posed: 'hurt',
            moment: 'boss-intro',
            held: true
          }))
        ])
      )
  },
  {
    check: facingDoesNotFlicker,
    rule: 'facing flickers',
    what: 'the hero turned back within 0.15 s on the spot (round 8d: a turn toward the way his body goes is a cause)',
    broken: () =>
      hero(
        rows('hero', [
          { clip: 'idle', path: [1000], faces: [1] },
          { clip: 'idle', flip: true, path: [1000], faces: [-1] },
          { clip: 'idle', path: [1000], faces: [1] }
        ])
      ),
    clean: () =>
      hero(
        rows('hero', [
          { clip: 'run', path: [1000], faces: [1], body: 1000, x: 1000 },
          { clip: 'run', flip: true, path: [998], faces: [-1], body: 998, x: 998, vx: -120 },
          { clip: 'run', path: [1000, 1002], faces: [1, 1], steps: 2, body: 1002, x: 1002, vx: 120 }
        ])
      )
  },
  {
    check: facingDoesNotFlicker,
    rule: 'facing flickers',
    what: "the hero turned back within 0.15 s standing (round 8d: a brake's turn, his skid's first frame, is a cause)",
    broken: () =>
      hero(
        rows('hero', [
          { clip: 'idle', path: [1000], faces: [1] },
          { clip: 'idle', flip: true, path: [1000], faces: [-1] },
          { clip: 'idle', path: [1000], faces: [1] }
        ])
      ),
    clean: () =>
      hero(
        rows('hero', [
          { clip: 'idle', path: [1000], faces: [1] },
          { clip: 'idle', flip: true, path: [1000], faces: [-1] },
          // (He braked: the key on his new side, his body still going the other way at a skid's speed.)
          { clip: 'skid', path: [997], faces: [1], body: 997, x: 997, vx: -150 }
        ])
      )
  },
  {
    check: heroPosesKeepHim,
    rule: 'staged pose turns the hero',
    what: "a hold turning him on its first frame with no cause (a bite of that step turns him to its side: the bite's)",
    broken: () =>
      hero(
        rows('hero', [
          { clip: 'run' },
          { clip: 'idle', posed: 'idle', moment: 'boss-defeat', flip: true },
          ...times(6, () => ({ clip: 'idle', posed: 'idle', held: true, moment: 'boss-defeat', flip: true }))
        ])
      ),
    clean: () =>
      hero(
        rows('hero', [
          { clip: 'run' },
          { clip: 'bite', posed: 'bite', moment: 'boss-defeat', flip: true, bit: -1, events: ['bite'] },
          ...times(8, (i) => ({
            clip: 'bite',
            frame: 1 + (i >> 1),
            posed: 'bite',
            held: true,
            moment: 'boss-defeat',
            flip: true
          }))
        ])
      )
  },
  {
    check: landingsDoNotSkate,
    rule: 'landing skates',
    what: "a slam's squash carried 60 px along the ground before its impact (after the impact it slides)",
    broken: () =>
      king(
        rows('king', [
          { clip: 'air', state: 'slam', onGround: false },
          ...times(13, (i) => ({ clip: 'land', state: 'slam', x: 1000 + 4.6 * i, body: 1000 + 4.6 * i, vx: 280 })),
          ...times(8, (i) => ({
            clip: 'land',
            frame: i >> 1,
            state: 'recover',
            x: 1060 + 3 * i,
            body: 1060 + 3 * i,
            vx: 180,
            events: i === 0 ? ['boss-slam'] : []
          }))
        ])
      ),
    clean: () =>
      king(
        rows('king', [
          ...times(13, (i) => ({ clip: 'attack', state: 'slam', x: 1000 + 4.6 * i, body: 1000 + 4.6 * i, vx: 280 })),
          ...times(8, (i) => ({
            clip: 'land',
            frame: i >> 1,
            state: 'recover',
            x: 1060 + 3 * i,
            body: 1060 + 3 * i,
            vx: 180,
            events: i === 0 ? ['boss-slam'] : []
          }))
        ])
      )
  },
  {
    check: heavyFallsLand,
    rule: 'heavy fall without its landing',
    what: 'no landing inside a wind-up with 0.5 s of it left (with less than 0.25 s left there is none)',
    broken: () =>
      king(
        rows('king', [
          ...times(12, (i) => ({ clip: 'air', state: 'windup', onGround: false, feet: 700 + 6 * i })),
          ...times(30, () => ({ clip: 'windup', frame: 3, state: 'windup', feet: 772 })),
          { clip: 'attack', state: 'charge', feet: 772 }
        ])
      ),
    clean: () =>
      king(
        rows('king', [
          ...times(12, (i) => ({ clip: 'air', state: 'windup', onGround: false, feet: 700 + 6 * i })),
          ...times(12, () => ({ clip: 'windup', frame: 3, state: 'windup', feet: 772 })),
          { clip: 'attack', state: 'charge', feet: 772 }
        ])
      )
  },
  {
    check: leapsLandOnTheirLanding,
    rule: 'leap does not land on its landing',
    what: 'a slam touching down rolling (rolling to its impact is right only in a slam the phase step restarted)',
    broken: () =>
      king(
        rows('king', [
          ...times(6, () => ({ clip: 'air', frame: 2, state: 'slam', onGround: false })),
          ...times(4, () => ({ clip: 'attack', state: 'slam', vx: -293 }))
        ])
      ),
    clean: () =>
      king(
        rows('king', [
          ...times(6, (i) => ({
            clip: 'air',
            frame: 2,
            state: 'slam',
            onGround: false,
            events: i === 2 ? ['boss-phase'] : []
          })),
          ...times(4, () => ({ clip: 'attack', state: 'slam', vx: -293 }))
        ])
      )
  },
  {
    check: landingsNeedATouchdown,
    rule: 'landing without a touchdown',
    what: 'the squash shown while his restarted slam still carries him along the ground (stopped by a wall, he may show it)',
    broken: () =>
      king(
        rows('king', [
          ...times(4, (i) => ({
            clip: 'attack',
            state: 'slam',
            path: [1000 - 4.9 * i],
            body: 1000 - 4.9 * i,
            vx: -293
          })),
          ...times(4, (i) => ({ clip: 'land', state: 'slam', path: [980 - 4.9 * i], body: 980 - 4.9 * i, vx: -293 }))
        ])
      ),
    clean: () =>
      king(
        rows('king', [
          ...times(4, (i) => ({
            clip: 'attack',
            state: 'slam',
            path: [1000 - 4.9 * Math.min(i, 2)],
            body: 1000 - 4.9 * Math.min(i, 2),
            vx: 0
          })),
          ...times(4, () => ({ clip: 'land', state: 'slam', path: [990.2], body: 990.2, vx: 0 }))
        ])
      )
  },
  {
    check: dashesStayWhole,
    rule: 'dash taken up again',
    what: "the fox's whirl broken by four frames of air off a ledge and taken up again (a flinch may show in it)",
    broken: () =>
      fox(
        rows('foxBoss', [
          ...times(6, (i) => ({ clip: 'attack', frame: i % 4, state: 'charge', vx: 400 })),
          ...times(4, () => ({ clip: 'air', frame: 1, state: 'charge', vx: 400, onGround: false })),
          ...times(6, (i) => ({ clip: 'attack', frame: i % 4, state: 'charge', vx: 400 }))
        ])
      ),
    clean: () =>
      fox(
        rows('foxBoss', [
          ...times(6, (i) => ({ clip: 'attack', frame: i % 4, state: 'charge', vx: 400 })),
          ...times(4, (i) => ({ clip: 'hurt', frame: i >> 1, state: 'charge', vx: 400 })),
          ...times(6, (i) => ({ clip: 'attack', frame: i % 4, state: 'charge', vx: 400 })),
          { clip: 'idle', state: 'recover' }
        ])
      )
  },
  {
    check: dashesAreWarned,
    rule: 'dash without its warning',
    what: 'a dash after a wind-up shown on its last frame for one frame only (a wind-up of 0.15 s ending on its last frame warns)',
    broken: () =>
      king(
        rows('king', [
          ...times(6, () => ({ clip: 'land', frame: 3, state: 'windup' })),
          { clip: 'windup', frame: 3, state: 'windup' },
          { clip: 'attack', state: 'charge', vx: 400 }
        ])
      ),
    clean: () =>
      king(
        rows('king', [
          ...times(9, (i) => ({ clip: 'windup', frame: Math.min(3, i >> 1), state: 'windup' })),
          { clip: 'attack', state: 'charge', vx: 400 }
        ])
      )
  },
  {
    check: dashesAreWarned,
    rule: 'dash without its warning',
    what: 'a dash out of a wind-up cut before its trembling tail (after the phase step the wind-up is counted anew)',
    broken: () =>
      king(
        rows('king', [
          ...times(9, (i) => ({ clip: 'windup', frame: Math.min(1, i >> 1), state: 'windup' })),
          { clip: 'attack', state: 'charge', vx: 400 }
        ])
      ),
    clean: () =>
      king(
        rows('king', [
          ...times(4, (i) => ({ clip: 'windup', frame: i, state: 'windup' })),
          ...times(8, (i) => ({
            clip: 'windup',
            frame: Math.min(3, i >> 1),
            state: 'windup',
            events: i === 0 ? ['boss-phase'] : []
          })),
          { clip: 'attack', state: 'charge', vx: 400 }
        ])
      )
  },
  // ----------------------------------------------------------------------------------------------- round 6l
  {
    check: heroPosesKeepHim,
    rule: 'staged pose turns the hero',
    what: 'a hold that draws him the way the simulation faces, not the way he was drawn',
    broken: () =>
      hero(
        rows('hero', [
          ...times(3, () => ({ clip: 'idle', facing: -1 })),
          ...times(10, () => ({
            clip: 'idle',
            posed: 'idle',
            held: true,
            moment: 'goal-reveal',
            flip: true,
            facing: -1
          }))
        ])
      ),
    clean: () =>
      hero(
        rows('hero', [
          ...times(3, () => ({ clip: 'idle', facing: -1 })),
          ...times(10, () => ({ clip: 'idle', posed: 'idle', held: true, moment: 'goal-reveal', facing: -1 })),
          ...times(3, () => ({ clip: 'idle', facing: -1 }))
        ])
      )
  },
  {
    check: heroPosesKeepHim,
    rule: 'staged pose turns the hero',
    what: "a hurt played out under a hold, then the standing pose turned (ハム姫's rescue may face him her way)",
    broken: () =>
      hero(
        rows('hero', [
          { clip: 'hurt', flip: true },
          ...times(6, (i) => ({
            clip: 'hurt',
            frame: i >> 1,
            posed: 'hurt',
            held: true,
            moment: 'boss-phase',
            flip: true
          })),
          ...times(6, () => ({ clip: 'idle', posed: 'idle', held: true, moment: 'boss-phase' }))
        ])
      ),
    clean: () =>
      hero(
        rows('hero', [
          { clip: 'idle' },
          ...times(6, () => ({ clip: 'cheer', posed: 'cheer', moment: 'princess-free', flip: true })),
          ...times(3, () => ({ clip: 'idle', flip: true }))
        ])
      )
  },
  {
    check: heroPosesKeepHim,
    rule: 'hero turns as a pose ends',
    what: "a turn on the first frame after ハム姫's cheer that is no hurt's (round 8: a hit ending the pose turns him to face the blow)",
    broken: () =>
      hero(
        rows('hero', [
          { clip: 'idle', flip: true },
          ...times(6, () => ({ clip: 'cheer', posed: 'cheer', moment: 'princess-free', flip: true })),
          { clip: 'idle' }
        ])
      ),
    clean: () =>
      hero(
        rows('hero', [
          { clip: 'idle', flip: true },
          ...times(6, () => ({ clip: 'cheer', posed: 'cheer', moment: 'princess-free', flip: true })),
          { clip: 'hurt', events: ['hurt'] }
        ])
      )
  },
  {
    check: heroPosesKeepHim,
    rule: 'hero turns as a pose ends',
    what: 'the frame after the hold drawn the old way',
    broken: () =>
      hero(
        rows('hero', [
          { clip: 'hurt', flip: true },
          ...times(6, (i) => ({
            clip: 'hurt',
            frame: i >> 1,
            posed: 'hurt',
            held: true,
            moment: 'goal-reveal',
            flip: true
          })),
          { clip: 'run', frame: 5 },
          ...times(3, () => ({ clip: 'run', flip: true }))
        ])
      ),
    clean: () =>
      hero(
        rows('hero', [
          { clip: 'hurt', flip: true },
          ...times(6, (i) => ({
            clip: 'hurt',
            frame: i >> 1,
            posed: 'hurt',
            held: true,
            moment: 'goal-reveal',
            flip: true
          })),
          ...times(4, () => ({ clip: 'run', flip: true }))
        ])
      )
  },
  {
    check: heroPosesKeepHim,
    rule: 'what a pose covered comes back',
    what: 'a pivot from before the moment drawn again after it (a bite begun anew by its event may show)',
    broken: () =>
      hero(
        rows('hero', [
          { clip: 'turn' },
          ...times(6, () => ({ clip: 'idle', posed: 'idle', held: true, moment: 'boss-phase' })),
          { clip: 'idle' },
          { clip: 'turn', frame: 1 }
        ])
      ),
    clean: () =>
      hero(
        rows('hero', [
          { clip: 'bite', frame: 2 },
          ...times(6, (i) => ({
            clip: i < 2 ? 'bite' : 'idle',
            frame: i < 2 ? 3 + i : 0,
            posed: i < 2 ? 'bite' : 'idle',
            held: true,
            moment: 'boss-phase'
          })),
          { clip: 'idle' },
          { clip: 'bite', bit: 1, events: ['bite'] }
        ])
      )
  },
  {
    check: heroStandsThroughMoments,
    rule: 'held action does not play out',
    what: 'a bite cut straight to standing when a hold begins (one that plays every frame on and stands is right)',
    broken: () =>
      hero(
        rows('hero', [
          { clip: 'bite', frame: 1 },
          ...times(12, () => ({ clip: 'idle', posed: 'idle', held: true, moment: 'boss-phase' }))
        ])
      ),
    clean: () =>
      hero(
        rows('hero', [
          { clip: 'bite', frame: 1 },
          ...times(12, (i) =>
            i < 8
              ? { clip: 'bite', frame: 1 + (i >> 1), posed: 'bite', held: true, moment: 'boss-phase' }
              : { clip: 'idle', posed: 'idle', held: true, moment: 'boss-phase' }
          )
        ])
      )
  },
  {
    check: heroStandsThroughMoments,
    rule: 'held action does not play out',
    what: 'a hurt under a hold that skips to its last frame',
    broken: () =>
      hero(
        rows('hero', [
          { clip: 'hurt' },
          { clip: 'hurt', posed: 'hurt', held: true, moment: 'goal-reveal' },
          { clip: 'hurt', frame: 2, posed: 'hurt', held: true, moment: 'goal-reveal' },
          ...times(6, () => ({ clip: 'idle', posed: 'idle', held: true, moment: 'goal-reveal' }))
        ])
      ),
    clean: () =>
      hero(
        rows('hero', [
          { clip: 'hurt' },
          { clip: 'hurt', posed: 'hurt', held: true, moment: 'goal-reveal' },
          { clip: 'hurt', frame: 1, posed: 'hurt', held: true, moment: 'goal-reveal' },
          { clip: 'hurt', frame: 2, posed: 'hurt', held: true, moment: 'goal-reveal' },
          ...times(6, () => ({ clip: 'idle', posed: 'idle', held: true, moment: 'goal-reveal' }))
        ])
      )
  },
  {
    check: bitesAreDrawn,
    rule: 'bite is not drawn',
    what: 'a bite to the left the facing hold kept him from showing (a hurt on the same step shows instead)',
    broken: () => hero(rows('hero', [{ clip: 'idle' }, { clip: 'idle', bit: -1, events: ['bite'] }, { clip: 'idle' }])),
    clean: () =>
      hero(
        rows('hero', [
          { clip: 'idle' },
          { clip: 'bite', bit: -1, flip: true, events: ['bite'] },
          { clip: 'bite', frame: 1, flip: true },
          { clip: 'hurt', bit: 1, flip: true, events: ['bite', 'hurt'] }
        ])
      )
  },
  {
    check: bitesAreDrawn,
    rule: 'bite is not drawn',
    what: 'a bite drawn facing away from the side it bit',
    broken: () => hero(rows('hero', [{ clip: 'idle' }, { clip: 'bite', bit: -1, events: ['bite'] }])),
    clean: () => hero(rows('hero', [{ clip: 'idle' }, { clip: 'bite', bit: -1, flip: true, events: ['bite'] }]))
  },
  {
    check: facingDoesNotFlicker,
    rule: 'facing flickers',
    what: "a turn and the hero's turn 0.05 s later without a cause (a bite's first frame turns him to the side it bit)",
    broken: () =>
      hero(
        rows(
          'hero',
          times(20, (i) => ({
            clip: i >= 8 && i < 10 ? 'bite' : 'idle',
            frame: i === 9 ? 1 : 0,
            flip: i >= 5 && i < 8
          }))
        )
      ),
    clean: () =>
      hero(
        rows(
          'hero',
          times(20, (i) => ({
            clip: i >= 8 && i < 10 ? 'bite' : 'idle',
            frame: i === 9 ? 1 : 0,
            flip: i >= 5 && i < 8,
            bit: i === 8 ? (1 as const) : (0 as const),
            clipT: i === 8 ? 0 : i === 9 ? STEP : NaN
          }))
        )
      )
  },
  {
    check: hitsShowTheirFlinch,
    rule: 'hit without its flinch',
    what: 'a bitten rat drawn walking on the frame of the hit (a squirrel in its throw shows the flash only)',
    broken: () => walker(rows('walker', [{ clip: 'move' }, { clip: 'move', events: ['enemy-hit'], hitDir: 1 }])),
    clean: () =>
      fake([
        track(
          'enemy',
          'walker',
          rows('walker', [{ clip: 'move' }, { clip: 'hurt', events: ['enemy-hit'], hitDir: 1, flip: true }])
        ),
        track(
          'enemy',
          'spitter',
          rows('spitter', [
            { clip: 'shoot', frame: 2 },
            { clip: 'shoot', frame: 3, events: ['enemy-hit'], hitDir: 1, hitShows: false }
          ]),
          'enemy#2'
        )
      ])
  },
  {
    check: heroIsDrawn,
    rule: 'hero not drawn',
    what: 'the hero hidden on a frame the simulation is held (the blink is for time that runs)',
    broken: () =>
      hero(
        rows('hero', [
          { clip: 'jump', onGround: false },
          { clip: 'jump', onGround: false, held: true, moment: 'boss-phase', drawn: false }
        ])
      ),
    clean: () =>
      hero(
        rows('hero', [
          { clip: 'jump', onGround: false },
          { clip: 'jump', onGround: false, held: true, moment: 'boss-phase' },
          ...times(12, (i) => ({ clip: 'run', drawn: Math.floor(i / 3) % 2 === 0 }))
        ])
      )
  },
  {
    check: heroIsDrawn,
    rule: 'hero not drawn',
    what: 'the hero hidden for 0.1 s on end in play',
    broken: () =>
      hero(rows('hero', [{ clip: 'run' }, ...times(6, () => ({ clip: 'run', drawn: false })), { clip: 'run' }])),
    clean: () =>
      hero(rows('hero', [{ clip: 'run' }, ...times(3, () => ({ clip: 'run', drawn: false })), { clip: 'run' }]))
  },
  {
    check: landingsDoNotSkate,
    rule: 'landing skates',
    what: "the king carried 40 px in his landing out of his walk (a slam's landing slides; 12 px is the impact taken)",
    broken: () =>
      king(
        rows('king', [
          { clip: 'air', state: 'idle', onGround: false },
          ...times(12, (i) => ({
            clip: 'land',
            frame: i >> 2,
            state: 'idle',
            x: 1000 + 3.3 * i,
            body: 1000 + 3.3 * i,
            vx: 195
          }))
        ])
      ),
    clean: () =>
      king(
        rows('king', [
          { clip: 'air', state: 'idle', onGround: false },
          ...times(12, (i) => ({ clip: 'land', frame: i >> 2, state: 'idle', x: 1000 + i, body: 1000 + i, vx: 60 })),
          { clip: 'air', state: 'slam', onGround: false, x: 1012, body: 1012 },
          ...times(12, (i) => ({
            clip: 'land',
            frame: i >> 2,
            state: 'recover',
            x: 1012 + 3.3 * i,
            body: 1012 + 3.3 * i,
            vx: 195,
            events: i === 0 ? ['boss-slam'] : []
          }))
        ])
      )
  },
  {
    check: transformationBeginsBetweenActions,
    rule: 'transformation begins in an action',
    what: "the rage 0.2 s into a wind-up he has shown, though the phase step restarted the state's clock",
    broken: () =>
      kingRage((list) => {
        windupBefore(list, 0.2)
        list[21].stateTime = 0
      }),
    clean: () =>
      kingRage((list) => {
        windupBefore(list, 0.05)
        list[21].stateTime = 0
      })
  },
  {
    check: transformationBeginsBetweenActions,
    rule: 'transformation begins in an action',
    what: 'the rage cutting a wind-up on its last frame',
    broken: () =>
      kingRage((list) => {
        for (let k = 0; k < 24; k++)
          Object.assign(list[20 - k] ?? {}, {
            clip: 'windup',
            frame: Math.min(3, k >> 1) === 0 ? 3 : 3,
            state: 'windup',
            stateTime: (24 - k) * STEP
          })
        Object.assign(list[21], { state: 'windup', stateTime: 0 })
      }),
    clean: () => kingRage()
  },
  {
    check: transformationBeginsBetweenActions,
    rule: 'transformation begins in an action',
    what: 'the rage with his body still sliding 45 px/s on the last step in his recovery (at 25 px/s he is at rest)',
    broken: () =>
      kingRage((list) => {
        for (let k = 0; k <= 20; k++)
          Object.assign(list[k], { state: 'recover', body: 1000 + 0.75 * k, x: 1000 + 0.75 * k })
        Object.assign(list[21], { state: 'recover' })
      }),
    clean: () =>
      kingRage((list) => {
        for (let k = 0; k <= 20; k++)
          Object.assign(list[k], { state: 'recover', body: 1000 + (25 / 60) * k, x: 1000 + (25 / 60) * k })
        Object.assign(list[21], { state: 'recover' })
      })
  },
  {
    check: actionsStartAtTheirStart,
    rule: 'action starts in its middle',
    what: "a summon's gesture popping up on its release frame (it begins on its first frame, like every action)",
    broken: () =>
      fox(
        rows('foxBoss', [
          { clip: 'move', frame: 7 },
          { clip: 'shoot', frame: 3, events: ['minion'] }
        ])
      ),
    clean: () =>
      fox(
        rows('foxBoss', [
          { clip: 'move', frame: 7 },
          { clip: 'shoot', events: ['minion'] }
        ])
      )
  },
  {
    check: transformationIsSeen,
    rule: 'spotlight is not on the king',
    what: 'the spotlight left where he was when he is drawn 30 px away',
    broken: () => kingSpot((list) => list.forEach((row) => row.moment && (row.spotX += 30))),
    clean: () => kingSpot()
  },
  {
    check: transformationIsSeen,
    rule: 'spotlight is slow',
    what: 'the spotlight fully up only 0.5 s into the transformation',
    broken: () => kingSpot((list) => list.forEach((row, i) => row.moment && (row.spot = Math.min(1, (i - 4) / 30)))),
    clean: () => kingSpot()
  },
  {
    check: transformationIsSeen,
    rule: 'spotlight on a running fight',
    what: 'the spotlight still up on the first frames the fight runs again',
    broken: () => kingSpot((list) => list.forEach((row, i) => i > 64 && i < 68 && (row.spot = 0.6))),
    clean: () => kingSpot()
  },
  {
    check: transformationIsSeen,
    rule: 'king out of the view while he transforms',
    what: 'a king half out of the view through his transformation (he may be brought in over its first 0.2 s)',
    broken: () => kingSpot((list) => list.forEach((row) => row.moment && (row.camX = 1000))),
    clean: () =>
      kingSpot((list) =>
        list.forEach((row, i) => {
          if (i >= 5 && i < 10) {
            row.camX = 1000 - (i - 4) * 40
            row.spotX = row.x - row.camX
          }
        })
      )
  },
  {
    check: pushesShowAtOnce,
    rule: 'push is drawn as a glide',
    what: 'the hero slid 43 px out from under a trunk, drawn a quarter of the way there (his own run is interpolated)',
    broken: () =>
      hero(
        rows('hero', [
          { clip: 'idle', path: [1000] },
          { clip: 'idle', path: [1043], body: 1043, x: 1010.75, steps: 1 },
          { clip: 'idle', path: [], body: 1043, x: 1043, steps: 0, viewDt: STEP / 4 }
        ])
      ),
    clean: () =>
      hero(
        rows('hero', [
          { clip: 'idle', path: [1000] },
          { clip: 'idle', path: [1043], body: 1043, x: 1043 },
          { clip: 'run', path: [1047], body: 1047, x: 1044, vx: 240 }
        ])
      )
  },
  {
    check: facingDoesNotFlicker,
    rule: 'facing flickers',
    what: 'a hit turns it to the blow, and it turns back 0.05 s later (the turn back is an ordinary turn)',
    broken: () =>
      walker(
        rows(
          'walker',
          times(30, (i) => ({ clip: i >= 5 && i < 8 ? 'hurt' : 'idle', flip: i >= 5 && i < 8 }))
        )
      ),
    clean: () =>
      walker(
        rows(
          'walker',
          times(40, (i) => ({ clip: i >= 5 && i < 8 ? 'hurt' : 'idle', flip: i >= 5 && i < 25 }))
        )
      )
  },
  {
    check: landingsNeedATouchdown,
    rule: 'landing without a touchdown',
    what: 'a landing after the pose, but not on the frame of the shockwaves (an impact begins its landing)',
    broken: () =>
      king(
        rows('king', [
          { clip: 'rage', frame: 9, posed: 'rage', state: 'recover' },
          { clip: 'land', state: 'recover' }
        ])
      ),
    clean: () =>
      king(
        rows('king', [
          { clip: 'rage', frame: 9, posed: 'rage', state: 'slam' },
          { clip: 'land', state: 'recover', events: ['boss-slam'] }
        ])
      )
  },
  {
    check: enemyHurtsFaceTheBlow,
    rule: 'hurt turns its back on the blow',
    what: 'a rat bitten from its left (the blow pushes right) drawn facing right, as its walk goes (it faces the biter)',
    broken: () =>
      walker(
        rows('walker', [
          { clip: 'move', vx: 100 },
          ...times(8, (i) => ({
            clip: 'hurt',
            frame: i > 3 ? 1 : 0,
            hitDir: i === 0 ? (1 as const) : (0 as const),
            vx: 100
          }))
        ])
      ),
    clean: () =>
      walker(
        rows('walker', [
          { clip: 'move', vx: 100 },
          ...times(8, (i) => ({
            clip: 'hurt',
            frame: i > 3 ? 1 : 0,
            hitDir: i === 0 ? (1 as const) : (0 as const),
            flip: true,
            vx: 100
          }))
        ])
      )
  },
  {
    check: enemyHurtsFaceTheBlow,
    rule: 'hurt turns its back on the blow',
    what: 'a mole facing the blow on its first frame of hurt, turning away from it partway through',
    broken: () =>
      fake([
        track(
          'enemy',
          'tough',
          rows(
            'tough',
            times(8, (i) => ({
              clip: 'hurt',
              frame: i > 3 ? 1 : 0,
              hitDir: i === 0 ? (-1 as const) : (0 as const),
              flip: i > 5
            }))
          )
        )
      ]),
    clean: () =>
      fake([
        track(
          'enemy',
          'tough',
          rows(
            'tough',
            times(8, (i) => ({ clip: 'hurt', frame: i > 3 ? 1 : 0, hitDir: i === 0 ? (-1 as const) : (0 as const) }))
          )
        )
      ])
  },
  {
    check: hurtFacesTheBlow,
    rule: 'hurt is carried forwards',
    what: 'the hero thrown forwards in his hurt',
    broken: () =>
      hero(
        rows(
          'hero',
          times(10, (i) => ({ clip: 'hurt', x: 1000 + 2 * i, body: 1000 + 2 * i, vx: 120 }))
        )
      ),
    clean: () =>
      hero(
        rows(
          'hero',
          times(10, (i) => ({ clip: 'hurt', flip: true, x: 1000 + 2 * i, body: 1000 + 2 * i, vx: 120 }))
        )
      )
  }
]

describe('the gate tests itself: every rule names rows that break it, and passes them unbroken', () => {
  it('every rule in CHECKS has a case', () => {
    const covered = new Set<Check>(CASES.map((c) => c.check))
    expect(CHECKS.filter((check) => !covered.has(check)).map((check) => check.name)).toEqual([])
  })

  it.each(CASES.map((c) => ({ ...c, name: c.check.name })))('$name: $what', ({ check, rule, broken, clean }) => {
    expect(check(broken()).map((f) => f.rule)).toContain(rule)
    expect(check(clean()).map((f) => `${f.rule}: ${f.detail}`)).toEqual([])
  })

  // (Round 8, decided: a shot is a boss's only if he fired it. The recorder books a new shot on whoever the step's
  // events say fired it: a squirrel's acorn born inside a charging boar is the squirrel's, the boar's own shot his.)
  it('a new shot is booked on whoever fired it', () => {
    const world = new World(STAGES[3])
    const rec = new Recorder(world, 'booking') as unknown as { firerOf: (at: { x: number; y: number }) => unknown }
    const boss = world.boss!
    const squirrel = { id: 9999, kind: 'spitter', x: boss.x + 4, y: boss.y + 10, w: 46, h: 42, dead: false }
    world.enemies.push(squirrel as unknown as (typeof world.enemies)[number])
    const at = { x: squirrel.x + 23, y: squirrel.y + 17 }
    world.events.length = 0
    world.events.push({ type: 'spit', id: 9999, x: at.x, y: at.y, dir: 1 } as SimEvent)
    expect(rec.firerOf(at)).toBe(squirrel)
    world.events.length = 0
    world.events.push({ type: 'boss-shoot', x: boss.x + boss.w / 2, y: boss.y + boss.h / 2, count: 1 } as SimEvent)
    expect(rec.firerOf(at)).toBe(boss)
    world.events.length = 0
    expect(rec.firerOf(at)).toBe(null)
  })

  // (Round 6i: a new shot is measured on his body where it was born, its own flight since taken back; one born 8 px
  // off the paint is still off it.)
  it('a new shot is put back where it was born before it is measured', () => {
    expect(birthPlace(1013.6, 780, 216, 0, 1).x).toBeCloseTo(1010, 6)
    expect(birthPlace(1017.2, 780, 216, 0, 2).x).toBeCloseTo(1010, 6)
    expect(birthPlace(1021.6, 780, 216, 0, 1).x - 1010).toBeCloseTo(8, 6)
  })
})
