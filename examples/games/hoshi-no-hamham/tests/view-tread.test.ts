import { describe, expect, it } from 'vitest'
import {
  FACE_DEAD_ZONE,
  FACE_HOLD,
  DECISIVE_PX,
  EASE_SPEED,
  HOLD_PX,
  SHUFFLE_PX,
  TURNING_SECONDS,
  NET_TURN_PX,
  MARK_SPAN_PX,
  STAND_AFTER,
  TREAD_JUMP_PX,
  TURN_PX,
  drawnGain,
  forgetMotion,
  heldSideFacing,
  motionKnown,
  netMotion,
  noteTurn,
  newTread,
  shownStanding,
  sideFacing,
  stepPicture,
  stepTread,
  treadX,
  walkFacing,
  type Tread
} from '../src/view/tread'

const STEP = 1 / 60

/** A body read the way `ActorsView` reads a walker: the tread, then the facing (with its hold), then the gain. */
class Body {
  readonly t: Tread = newTread(1)
  face: 1 | -1 = 1
  age = 99
  gain = 0
  turns: number[] = []
  clock = 0
  step(x: number, dt: number, onGround = true) {
    this.clock += dt
    stepTread(this.t, x, dt, onGround)
    stepPicture(this.t, x, dt, true)
    this.age += dt
    const face = walkFacing(this.t, this.face, 0, false, this.age)
    if (face !== this.face) {
      this.face = face
      this.age = 0
      noteTurn(this.t)
      this.turns.push(this.clock)
    }
    const gain = drawnGain(this.t, this.face)
    // (Standing, the walk cycle is not shown: only a walk's gain plays it.)
    if (!this.t.standing) this.gain += gain
  }
  drawn() {
    return treadX(this.t, this.t.x)
  }
}

/** Feeds a body the simulation's positions `at(step)` for `seconds`, one update per step. */
function feed(at: (n: number) => number, seconds: number, body = new Body()) {
  for (let n = 0; n <= seconds * 60; n++) body.step(at(n), STEP)
  return body
}

describe('the tread: walking or standing', () => {
  it('a walker walks: it does not stand, and its gain is the ground covered', () => {
    const b = feed((n) => 1.5 * n, 1)
    expect(b.t.standing).toBe(false)
    expect(b.gain).toBeCloseTo(90, 0)
    expect(b.drawn()).toBe(b.t.x)
  })

  it('stopped (by a wall) it stands after STAND_AFTER; a step back of less than TURN_PX does not count', () => {
    expect(STAND_AFTER).toBe(0.15)
    // At the wall (30 px) from the 20th step: still walking a moment later.
    const b = feed((n) => Math.min(30, 1.5 * n), 20 / 60 + STAND_AFTER - 3 * STEP)
    expect(b.t.standing).toBe(false)
    // A step back of less than TURN_PX is not new ground: it stands.
    feed(() => 30 - TURN_PX + 0.5, 4 * STEP, b)
    expect(b.t.standing).toBe(true)
  })

  it('a walker that turns round once at the end of its patrol walks the whole time, drawn where it is', () => {
    // 1.5 px a step to 30, then back (74-100 px/s): one turn.
    const at = (n: number) => 30 - Math.abs(20 - n) * 1.5
    const b = new Body()
    for (let n = 0; n <= 60; n++) {
      b.step(at(n), STEP)
      expect(b.t.standing, `step ${n}`).toBe(false)
      expect(b.drawn()).toBe(b.t.x)
    }
    expect(b.turns).toHaveLength(1)
  })

  it(`turning twice within ${TURNING_SECONDS} s inside ${MARK_SPAN_PX} px it marks time: shaken, or pacing a ledge`, () => {
    const shaken = feed((n) => (n < 20 ? 1.5 * n : 30 + (n % 2) * 4), 1)
    expect(shaken.t.standing).toBe(true)
    // 9.8 px one way in 8 steps, then back: a rat on a one-tile ledge (stage 6).
    const pace = (n: number) => 1.225 * Math.abs((n % 16) - 8)
    const paced = feed(pace, 2)
    expect(paced.t.standing).toBe(true)
    // (Before it is shown standing a leg of 9.8 px may carry it DECISIVE_PX against its facing once: it turns then;
    // once it marks time it turns no more.)
    expect(paced.turns.length).toBeLessThanOrEqual(2)
    expect(paced.turns.every((t) => t < 0.6)).toBe(true)
    expect(paced.t.hi - paced.t.lo).toBeLessThanOrEqual(MARK_SPAN_PX)
  })

  it('a standing body sets off once it leaves its span by more than TURN_PX, the way it goes', () => {
    // Run fast into a wall: it stands by STAND_AFTER, within where it has been since it stopped.
    const b = feed((n) => Math.min(30, 3 * n), 1)
    expect(b.t.standing).toBe(true)
    let x = 30
    while (b.t.standing) b.step((x -= 1.5), STEP)
    expect(30 - x).toBeGreaterThan(TURN_PX)
    expect(30 - x).toBeLessThanOrEqual(TURN_PX + 1.5)
    expect(b.t.facing).toBe(-1)
  })

  it('a jump is a respawn or a script: the record starts again; a hit-stop decides nothing', () => {
    const b = feed((n) => 1.5 * n, 0.5)
    stepTread(b.t, b.t.x + TREAD_JUMP_PX + 1, STEP)
    expect(b.t.standing).toBe(false)
    expect(motionKnown(b.t)).toBe(false)
    const before = JSON.stringify({ ...b.t, times: 0, xs: 0 })
    stepTread(b.t, 500, 0)
    stepPicture(b.t, 500, 0, true)
    expect(JSON.stringify({ ...b.t, times: 0, xs: 0 })).toBe(before)
    // (A step shown on a frame where no time passes is remembered, but its clock, standing and facing are not moved.)
    const x = b.t.x
    stepTread(b.t, x - 1.5, 0)
    expect(b.t.x).toBe(x - 1.5)
    expect(b.t.clock).toBe(JSON.parse(before).clock)
    expect(b.t.facing).toBe(JSON.parse(before).facing)
  })

  it('B: in the air it never stands, and nothing it does there counts towards standing', () => {
    // Stopped by a wall, but off the ground (a hop against it): it walks the whole time.
    const b = new Body()
    for (let n = 0; n <= 60; n++) {
      b.step(Math.min(30, 1.5 * n), STEP, n < 20)
      if (n >= 20) expect(b.t.standing, `step ${n}`).toBe(false)
    }
    // Back on the ground it takes STAND_AFTER to stand.
    for (let n = 1; n <= 12; n++) {
      b.step(30, STEP)
      expect(b.t.standing, `step ${n} on the ground`).toBe(n * STEP >= STAND_AFTER - 1e-9)
    }
    // A standing body that leaves the ground walks.
    b.step(30, STEP, false)
    expect(b.t.standing).toBe(false)
  })

  it(`E: shown standing only once it has stood for STAND_AFTER (${STAND_AFTER} s)`, () => {
    // Shaken on the spot it stands at once (two turns), but it is shown standing only STAND_AFTER later.
    const b = feed((n) => 1.5 * n, 20 / 60)
    let began = NaN
    for (let n = 1; n <= 40; n++) {
      b.step(30 + (n % 2) * 4, STEP)
      if (b.t.standing && Number.isNaN(began)) began = b.clock
      if (!Number.isNaN(began)) expect(shownStanding(b.t), `step ${n}`).toBe(b.clock - began >= STAND_AFTER - 1e-9)
    }
    expect(shownStanding(b.t)).toBe(true)
    // Stopped by a wall, it has stood since it stopped: shown standing as soon as it stands.
    const w = feed((n) => Math.min(30, 1.5 * n), 20 / 60 + STAND_AFTER + STEP)
    expect(w.t.standing).toBe(true)
    expect(shownStanding(w.t)).toBe(true)
  })
})

describe('the picture: the body, plus a bounded hold', () => {
  it(`a shaken body is held still in the middle of where it shakes, within ${HOLD_PX} px, eased in`, () => {
    const b = feed((n) => (n < 20 ? 1.5 * n : 30 + (n % 2) * 4), 1)
    const drawn: number[] = []
    for (let n = 0; n < 20; n++) {
      b.step(30 + (n % 2) * 4, STEP)
      drawn.push(b.drawn())
    }
    // (It shakes 4 px a step; the picture may part from the body by EASE_SPEED / 60 = 3 px a step.)
    for (const x of drawn) expect(Math.abs(x - 32)).toBeLessThanOrEqual(4 - EASE_SPEED / 60 + 1e-9)
    // It covers no ground, so its walk cycle does not run.
    const gain = b.gain
    b.step(30, STEP)
    b.step(34, STEP)
    expect(b.gain).toBe(gain)
  })

  it(`never more than ${HOLD_PX} px from the body, and moving at most ${EASE_SPEED} px/s apart from it`, () => {
    const t = newTread(1)
    // A body that stands, then creeps away from its hold point and back, at 60 Hz and at 144 Hz.
    for (const hz of [60, 144]) {
      const b = new Body()
      let last = NaN
      let lastBody = NaN
      for (let k = 0; k <= hz * 3; k++) {
        const time = k / hz
        const x = time < 1 ? Math.min(30, 90 * time) : time < 2 ? 30 + 10 * Math.sin((time - 1) * 6) : 30
        b.step(x, 1 / hz)
        const drawn = b.drawn()
        expect(Math.abs(drawn - x)).toBeLessThanOrEqual(HOLD_PX + 1e-9)
        if (!Number.isNaN(last))
          expect(Math.abs(drawn - last - (x - lastBody))).toBeLessThanOrEqual(EASE_SPEED / hz + 1e-9)
        last = drawn
        lastBody = x
      }
    }
    expect(t.offset).toBe(0)
  })

  it('D: on a frame where no time passes the picture is exactly what it was', () => {
    const b = feed((n) => (n < 20 ? 1.5 * n : 30 + (n % 2) * 4), 0.6)
    const drawn = b.drawn()
    stepTread(b.t, b.t.x, 0)
    stepPicture(b.t, b.t.x, 0, true)
    expect(treadX(b.t, b.t.x)).toBe(drawn)
  })

  it(`D: on a frame where no time passes the picture moves with the body (its offset is kept)`, () => {
    // Shaken on the spot: held. The body is drawn between steps until the hit-stop, then where it stands (2 px over).
    const b = feed((n) => (n < 20 ? 1.5 * n : 30 + (n % 2) * 4), 0.6)
    expect(b.t.standing).toBe(true)
    const offset = b.t.offset
    const x = b.t.x + 2
    stepTread(b.t, x, 0)
    stepPicture(b.t, x, 0, true)
    expect(b.t.offset).toBe(offset)
    expect(treadX(b.t, x)).toBeCloseTo(x + offset, 9)
    // Held for a while, the same.
    for (let k = 0; k < 5; k++) {
      stepPicture(b.t, x + 8, 0, true)
      expect(b.t.offset).toBe(offset)
    }
    // A walking body's picture is the body.
    const w = feed((n) => 1.5 * n, 0.5)
    stepTread(w.t, w.t.x + 1, 0)
    stepPicture(w.t, w.t.x, 0, true)
    expect(w.drawn()).toBe(w.t.x)
  })

  it('a body that may not be held (a crow, a wind-up) is drawn where it is, eased back from a hold', () => {
    const b = feed((n) => (n < 20 ? 1.5 * n : 30 + (n % 2) * 4), 1)
    expect(Math.abs(b.t.offset)).toBeGreaterThan(0)
    let frames = 0
    while (b.t.offset !== 0) {
      const before = b.t.offset
      stepTread(b.t, b.t.x, STEP)
      stepPicture(b.t, b.t.x, STEP, false)
      expect(Math.abs(b.t.offset - before)).toBeLessThanOrEqual(EASE_SPEED * STEP + 1e-9)
      frames++
    }
    expect(frames).toBeLessThanOrEqual(Math.ceil(HOLD_PX / (EASE_SPEED * STEP)))
  })
})

describe("a walker's facing", () => {
  it('really going somewhere, it faces the way it has gone over the last few steps (NET_SECONDS)', () => {
    expect(NET_TURN_PX).toBe(3)
    // A run of 25 px each way, turning every 15 steps (a rat chasing under the hero): it follows every turn within a
    // few steps, and is never drawn facing away from where it goes for long.
    const run = (n: number) => 25 - Math.abs((n % 30) - 15) * (25 / 15)
    const b = new Body()
    let wrong = 0
    for (let n = 0; n <= 180; n++) {
      b.step(run(n), STEP)
      if (n >= 30 && !b.t.standing && b.face !== (run(n) - run(n - 4) > 0 ? 1 : -1)) wrong++
    }
    expect(wrong).toBeLessThanOrEqual(30)
    for (let i = 1; i < b.turns.length; i++) expect(b.turns[i] - b.turns[i - 1]).toBeGreaterThanOrEqual(FACE_HOLD)
  })

  it(`within FACE_HOLD (${FACE_HOLD} s) of a turn it turns again only once its body has gone DECISIVE_PX (${DECISIVE_PX} px) the new way`, () => {
    expect(FACE_HOLD).toBeGreaterThan(9 / 60)
    // Back for six steps, then on again for three (4.5 px) and stopped: one turn, then it marks time rather than
    // turn back at once.
    const b = new Body()
    let stood = false
    for (let n = 0; n <= 90; n++) {
      b.step(n < 40 ? 1.5 * n : n < 46 ? 60 - 1.5 * (n - 40) : n < 49 ? 51 + 1.5 * (n - 46) : 55.5, STEP)
      if (n > 40 && n < 60 && b.t.standing) stood = true
    }
    for (let i = 1; i < b.turns.length; i++) expect(b.turns[i] - b.turns[i - 1]).toBeGreaterThanOrEqual(FACE_HOLD)
    expect(stood).toBe(true)
    // On again for good: it turns back within the hold, once it has gone 8 px (it is never carried further against
    // its facing).
    const c = new Body()
    let worst = 0
    let since = NaN
    for (let n = 0; n <= 90; n++) {
      const x = n < 40 ? 1.5 * n : n < 46 ? 60 - 1.5 * (n - 40) : 51 + 1.5 * (n - 46)
      c.step(x, STEP)
      if (c.face < 0 && n >= 46) {
        since = Number.isNaN(since) ? x : Math.min(since, x)
        worst = Math.max(worst, x - since)
      }
    }
    expect(c.turns).toHaveLength(2)
    expect(c.turns[1] - c.turns[0]).toBeLessThan(FACE_HOLD)
    expect(worst).toBeLessThanOrEqual(DECISIVE_PX)
    expect(c.face).toBe(1)
  })

  it('a walk is read from its own steps: just begun, it keeps the facing it had', () => {
    const b = feed((n) => 1.5 * n, 0.5)
    forgetMotion(b.t)
    expect(motionKnown(b.t)).toBe(false)
    const x0 = b.t.x
    const faces: number[] = []
    for (let n = 1; n <= 40; n++) {
      b.step(x0 - 1.5 * n, STEP)
      faces.push(b.face)
    }
    expect(faces.slice(0, 3).every((f) => f === 1)).toBe(true)
    expect(faces.at(-1)).toBe(-1)
    expect(netMotion(b.t)).toBeCloseTo(-6)
  })

  it('a body that sets off from a stand faces the way it set off before its walk is long enough to tell', () => {
    const b = feed((n) => Math.min(30, 1.5 * n), 1)
    expect(b.t.standing).toBe(true)
    let x = 30
    while (b.t.standing) b.step((x -= 1.5), STEP)
    expect(motionKnown(b.t)).toBe(false)
    expect(b.face).toBe(-1)
  })

  it('it turns on a step that goes the new way, not on one that already comes back', () => {
    // On, back 4.5 px (a hit-stop hid the steps: the view sees the turn late), and on again on the step it would turn.
    const b = feed((n) => 1.5 * n, 0.5)
    const x = b.t.x
    b.step(x - 1.5, STEP)
    b.step(x - 3, STEP)
    b.step(x - 4.5, STEP)
    stepTread(b.t, x - 6, 0)
    b.step(x - 4.5, STEP)
    expect(b.face).toBe(1)
  })

  it(`a walker that shuffled to and fro (SHUFFLE_PX, ${SHUFFLE_PX} px, more ground than way) and then went back marks time`, () => {
    // Shuffling under the hero (1.66 px to and fro), two steps back, then on again: it does not turn round.
    const b = feed((n) => 1.66 * n, 0.5)
    const x = b.t.x
    for (const dx of [-1.66, 0, -1.66, 0, -1.66, -3.33, -1.66, 0, 1.66, 3.33, 5, 6.66, 8.33, 10, 11.66, 13.33])
      b.step(x + dx, STEP)
    expect(b.turns).toHaveLength(0)
    // Without the shuffle, the same steps back turn it round.
    const c = feed((n) => 1.66 * n, 0.5)
    const y = c.t.x
    for (const dx of [-1.66, -3.33, -5, -6.66, -8.33]) c.step(y + dx, STEP)
    expect(c.face).toBe(-1)
  })

  it('standing, it faces the hero when told to, past the dead zone, not within the hold', () => {
    const b = feed((n) => Math.min(30, 1.5 * n), 1)
    expect(walkFacing(b.t, 1, -FACE_DEAD_ZONE - 1, true)).toBe(-1)
    expect(walkFacing(b.t, 1, -FACE_DEAD_ZONE, true)).toBe(1)
    expect(walkFacing(b.t, 1, -100, false)).toBe(1)
    expect(walkFacing(b.t, 1, -100, true, FACE_HOLD - 0.01)).toBe(1)
  })
})

describe('facing the hero', () => {
  it('turns only once the hero is more than the dead zone over, as sim.ts aims (left edges)', () => {
    expect(FACE_DEAD_ZONE).toBe(12)
    expect(sideFacing(1, -FACE_DEAD_ZONE)).toBe(1)
    expect(sideFacing(1, -FACE_DEAD_ZONE - 0.5)).toBe(-1)
    expect(sideFacing(-1, 40)).toBe(1)
    expect(sideFacing(-1, 0.5, 0)).toBe(1)
  })

  it('not again within FACE_HOLD of its last turn', () => {
    expect(heldSideFacing(1, -100, FACE_HOLD - 0.01)).toBe(1)
    expect(heldSideFacing(1, -100, FACE_HOLD)).toBe(-1)
  })
})

describe('the same at another display rate', () => {
  /**
   * The body as the view sees it at `hz` frames a second: the simulation's positions `at(step)` at 60 Hz,
   * interpolated between the last two steps as `src/app/interpolate.ts` does.
   */
  const view = (at: (n: number) => number, seconds: number, hz: number) => {
    const b = new Body()
    const frames: { standing: boolean; face: number; gain: number; drawn: number }[] = []
    for (let k = 0; k <= seconds * hz; k++) {
      const steps = (k / hz) * 60
      const n = Math.floor(steps + 1e-9)
      const alpha = steps - n
      const x = at(Math.max(0, n - 1)) + (at(n) - at(Math.max(0, n - 1))) * alpha
      b.step(x, 1 / hz)
      frames.push({ standing: b.t.standing, face: b.face, gain: b.gain, drawn: b.drawn() })
    }
    return { b, frames }
  }
  const walk = (n: number) => (n < 60 ? 1.5 * n : 90 - 1.5 * (n - 60))
  const pace = (n: number) => {
    const k = n % 16
    return 1.225 * (k < 8 ? k : 16 - k)
  }
  const shake = (n: number) => (n < 30 ? 1.5 * n : 45 + (n % 2) * 4)

  // The walking gain may differ by the one simulation step of shaking that falls on either side of the moment it
  // stands.
  for (const [name, at, slack] of [
    ['a walk there and back', walk, 2],
    ['pacing on a ledge', pace, 2],
    ['shaken on the spot', shake, 4 + 1]
  ] as const)
    it(`${name}: the same facing, standing and gain at 60 Hz and at 144 Hz`, () => {
      const a = view(at, 2, 60)
      const c = view(at, 2, 144)
      expect(c.b.t.standing).toBe(a.b.t.standing)
      expect(c.b.face).toBe(a.b.face)
      expect(c.b.turns.length).toBe(a.b.turns.length)
      for (let i = 0; i < a.b.turns.length; i++) expect(Math.abs(c.b.turns[i] - a.b.turns[i])).toBeLessThan(0.03)
      expect(Math.abs(c.b.gain - a.b.gain)).toBeLessThanOrEqual(slack)
      // Standing or walking at the same moments (give or take a simulation step).
      for (const time of [0.5, 1, 1.5, 2]) {
        const fa = a.frames[Math.round(time * 60)]
        const fc = c.frames[Math.round(time * 144)]
        expect(fc.standing, `${name} at ${time} s`).toBe(fa.standing)
      }
    })
})

describe('the same decisions at every display rate, hit-stops and all', () => {
  /**
   * The body as `PlaySession` shows it at `hz`: the pacer runs the steps a frame owes (the simulation one step ahead
   * of the picture), the picture is interpolated between the last two steps by its alpha (`app/interpolate.ts`),
   * and a hit-stop holds the simulation for `held` frames now and then (the view is updated with no time passing; a
   * body's turn clock runs on). The decisions are read for each simulation step from the last frame that showed it.
   */
  const replay = (at: (n: number) => number, steps: number, hz: number, stops: readonly number[] = []) => {
    const b = new Body()
    const out: { standing: boolean; face: number }[] = []
    let acc = 0
    let n = 0
    let prev = at(0)
    let stopped = -1
    while (n < steps) {
      const stop = stops.includes(n) && stopped !== n
      if (stop) {
        // A hit-stop of 0.1 s of real time: no step, the current state shown.
        stopped = n
        for (let k = 0; k < Math.round(0.1 * hz); k++) {
          stepTread(b.t, at(n), 0)
          stepPicture(b.t, at(n), 0, true)
          b.age += 1 / hz
        }
        acc = 0
        prev = at(n)
        continue
      }
      acc += 1 / hz
      while (acc > STEP * 1e-6 && n < steps) {
        prev = at(n)
        n++
        acc -= STEP
      }
      const alpha = Math.min(1, Math.max(0, 1 + acc / STEP))
      b.step(prev + (at(n) - prev) * alpha, 1 / hz)
      out[n] = { standing: b.t.standing, face: b.face }
    }
    // (A step no frame showed on its own takes the decisions of the frame that showed the next.)
    for (let k = steps - 1; k >= 0; k--) out[k] ??= out[k + 1] ?? { standing: false, face: 1 }
    return { b, out }
  }
  /** Pacing to and fro over `span` px at `speed` px/s (a rat in a pocket of a ledge). */
  const pacing = (span: number, speed: number) => (n: number) => {
    const leg = Math.round((span / speed) * 60)
    const k = n % (2 * leg)
    return (speed / 60) * (k < leg ? k : 2 * leg - k)
  }
  /** Shaken on the spot over the hero (the simulation flips its speed every step), then off it goes. */
  const shakenThenOff = (n: number) =>
    n < 40 ? (n % 2) * 1.66 : n < 80 ? 1.66 + (n - 40) * 1.66 : 68 - (n - 80) * 1.66
  const RATES = [30, 48, 60, 90, 120, 144]
  const MOTIONS: [string, (n: number) => number, number][] = [
    // The rat of stage 10 (seed 1): a pocket 20 px wide at 74 px/s, a turn every 0.27 s. It walks there.
    ['pacing a pocket 20 px wide', pacing(20, 74), 300],
    // Narrower than MARK_SPAN_PX it marks time.
    [`pacing a pocket ${MARK_SPAN_PX - 4} px wide`, pacing(MARK_SPAN_PX - 4, 74), 300],
    ['shaken on the spot, then walking off and back', shakenThenOff, 200],
    ['a long walk and a turn', (n) => (n < 100 ? 1.2 * n : 120 - 1.2 * (n - 100)), 200]
  ]
  for (const [name, at, steps] of MOTIONS)
    it(`${name}: the same facing and standing at ${RATES.join(', ')} Hz`, () => {
      const base = replay(at, steps, 60).out
      const stands = (o: { standing: boolean }[]) =>
        o.filter((d, k) => k > 0 && d.standing && !o[k - 1].standing).length
      for (const hz of RATES)
        for (const stops of [[], [37, 133]]) {
          const { out } = replay(at, steps, hz, stops)
          const what = `${hz} Hz${stops.length ? ' with hit-stops' : ''}`
          expect(stands(out), `${what}: stands`).toBe(stands(base))
          // Step by step, give or take the frame that shows a change (two simulation steps at 30 Hz).
          for (let k = 0; k < steps; k++) {
            const near = (f: (d: { standing: boolean; face: number }) => unknown) => {
              for (let j = Math.max(0, k - 3); j <= Math.min(steps - 1, k + 3); j++)
                if (f(base[j]) === f(out[k])) return true
              return false
            }
            expect(
              near((d) => d.face),
              `${what}: facing at step ${k}`
            ).toBe(true)
            expect(
              near((d) => d.standing),
              `${what}: standing at step ${k}`
            ).toBe(true)
          }
        }
      // (What the decisions are: a 20 px pocket is walked, a narrower one is marked time in.)
      if (name.startsWith('pacing a pocket 20')) expect(stands(base)).toBe(0)
      if (name.startsWith(`pacing a pocket ${MARK_SPAN_PX - 4}`)) expect(stands(base)).toBeGreaterThan(0)
    })
})
