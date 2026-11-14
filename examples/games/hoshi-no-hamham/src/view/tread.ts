/**
 * What a body really does along the ground, read from where the view is given it (at any display rate, on the
 * view's own clock, every window in seconds): whether it walks or stands, which way a walker faces, how much ground
 * its drawn body covers, and where its picture is.
 *
 * Two regimes. A body marks time once it has reached no new ground for `STAND_AFTER` (a rat stopped by a wall; a step
 * back of less than `TURN_PX` is not new ground the other way), or once it keeps turning: two turns within
 * `TURNING_SECONDS` inside `MARK_SPAN_PX` (shaken on the spot, pacing to and fro on a ledge). A body that turns once
 * and walks on is walking all the time. Marking time, it is shown standing and faces the hero's side when it should;
 * it sets off again when it leaves the span it kept to by more than `TURN_PX`. Otherwise it is going somewhere, and
 * faces the way its walk has gone over the last `NET_SECONDS` (once more than `NET_TURN_PX`); a body that would turn
 * twice within `FACE_HOLD` is turning on the spot, and marks time instead.
 *
 * The picture (`treadX`) is the body's position plus an offset that may hold a standing body still in the middle of
 * where it has been lately: never more than `HOLD_PX` from the body, eased in and out at no more than `EASE_SPEED`
 * px/s away from the body's own motion, and unchanged on a frame where no time passes. The ground its walk cycle plays
 * by is what the picture covers the way it is drawn facing, so a body held still covers none. Allocation free: one
 * record per body, updated in place.
 */

/** A step back of less than this (px) does not turn the record: the ground ahead is not new until it has. */
export const TURN_PX = 3
/**
 * Ground ahead counts as new only once it is this far (px) beyond the furthest point: a shaken body drawn at a high
 * display rate, between the simulation's steps, sweeps a hair further now and then without going anywhere.
 */
export const NEW_GROUND_PX = 2
/** A move of more than this (px) in one update is a respawn or a script, not a step: the record starts again. */
export const TREAD_JUMP_PX = 48
/** A body that reaches no new ground for this long (s) stands. */
export const STAND_AFTER = 0.15
/** A body that turns twice within this long (s), inside `MARK_SPAN_PX`, is turning on the spot: it stands. */
export const TURNING_SECONDS = 0.4
export const MARK_SPAN_PX = 16
/** A walker turns once its walk has gone more than `NET_TURN_PX` the other way over the last `NET_SECONDS`. */
export const NET_SECONDS = 4 / 60
export const NET_TURN_PX = 3
/** The drawn facing turns towards the hero's other side only once he is this far (px) over (see `sideFacing`). */
export const FACE_DEAD_ZONE = 12
/**
 * A body whose way back from its furthest point to where it turns was this much (px) longer than the distance was
 * shuffling to and fro there before it went back.
 */
export const SHUFFLE_PX = 2
/** A body that has just turned does not turn again for this long (s): a hair over nine simulation steps. */
export const FACE_HOLD = 0.16
/** The picture is never further than this (px) from its body, and moves at most this fast (px/s) apart from it. */
export const HOLD_PX = 6
export const EASE_SPEED = 180
/** On a frame where no time passes a held picture parts from its body by at most this (px). */
export const HELD_SLIP_PX = 3

/** Positions remembered (enough for `TURNING_SECONDS` at any display rate up to 240 Hz). */
const HISTORY = 100

export interface Tread {
  /** The way the body last went (it turns once it has come back `TURN_PX`), and the furthest point it reached. */
  facing: 1 | -1
  far: number
  /** The furthest it has actually been the way it goes (it turns once it has come back `TURN_PX` from there). */
  peak: number
  /** Seconds since it last reached new ground. */
  stalled: number
  /** The ground it has gone over (to and fro) since it reached `peak`. */
  path: number
  /** The clock of its last two turns, and whether it had shuffled before the last (see `SHUFFLE_PX`). */
  turnedAt: number
  shuffled: boolean
  turnedBefore: number
  /** It stands, within the span `lo`–`hi` (it sets off when it leaves it); its picture is held at `at`. */
  standing: boolean
  /** The way it set off from its last stand, until its walk since is long enough to tell (0 otherwise). */
  leaving: 0 | 1 | -1
  /** When it began to stand (for `shownStanding`). */
  standSince: number
  lo: number
  hi: number
  at: number
  /** Where it was on the last update (NaN before the first). */
  x: number
  /** Its picture's offset from it, and where the picture was on the last update (for `drawnGain`). */
  offset: number
  /** Where the picture was drawn on the last update (NaN before the first). */
  shown: number
  drawnX: number
  /** The record's clock (s), and when the current walk began. */
  clock: number
  walkSince: number
  /** Where it was over the last moments: a ring of times and centres. */
  times: Float64Array
  xs: Float64Array
  head: number
  count: number
}

export const newTread = (facing: 1 | -1 = 1): Tread => ({
  facing,
  far: NaN,
  peak: NaN,
  stalled: 0,
  turnedAt: -Infinity,
  path: 0,
  shuffled: false,
  turnedBefore: -Infinity,
  standing: false,
  leaving: 0,
  standSince: 0,
  lo: NaN,
  hi: NaN,
  at: NaN,
  x: NaN,
  offset: 0,
  shown: NaN,
  drawnX: NaN,
  clock: 0,
  walkSince: 0,
  times: new Float64Array(HISTORY),
  xs: new Float64Array(HISTORY),
  head: 0,
  count: 0
})

function remember(t: Tread, x: number) {
  t.head = (t.head + 1) % HISTORY
  t.times[t.head] = t.clock
  t.xs[t.head] = x
  t.count = Math.min(HISTORY, t.count + 1)
}

/** Starts the record again at `x`, walking (nothing is counted). */
function restart(t: Tread, x: number) {
  t.x = x
  t.far = x
  t.peak = x
  t.path = 0
  t.stalled = 0
  t.turnedAt = -Infinity
  t.turnedBefore = -Infinity
  t.standing = false
  t.leaving = 0
  t.offset = 0
  t.drawnX = NaN
  t.count = 0
  t.walkSince = t.clock
  remember(t, x)
}

/** The walk starts again with the next step (a walker that reels from a bite, a boss coming out of an attack). */
export function forgetMotion(t: Tread) {
  t.walkSince = NaN
  t.leaving = 0
}

/** Whether the walk has lasted `seconds` (its net motion over them is known; false while `walkSince` is NaN). */
export const motionKnown = (t: Tread, seconds = NET_SECONDS) => !t.standing && t.clock - t.walkSince >= seconds - 1e-6

/** The span (lo, hi) the body has kept within over the last `seconds` (of what is remembered), into `out`. */
function spanOver(t: Tread, seconds: number, out: { lo: number; hi: number }) {
  const since = t.clock - seconds - 1e-6
  out.lo = Infinity
  out.hi = -Infinity
  for (let i = 0; i < t.count; i++) {
    const k = (t.head - i + HISTORY) % HISTORY
    if (t.times[k] < since) break
    out.lo = Math.min(out.lo, t.xs[k])
    out.hi = Math.max(out.hi, t.xs[k])
  }
}
const span = { lo: 0, hi: 0 }

/** How far (px, signed) the walk has gone over its last `seconds` (0 while that is not known). */
export function netMotion(t: Tread, seconds = NET_SECONDS) {
  if (!motionKnown(t, seconds)) return 0
  const since = t.clock - seconds + 1e-6
  let from = t.xs[t.head]
  for (let i = 0; i < t.count; i++) {
    const k = (t.head - i + HISTORY) % HISTORY
    from = t.xs[k]
    if (t.times[k] <= since) break
  }
  return t.xs[t.head] - from
}

/**
 * It stands from now on, within where it has been over the last `seconds`, held in the middle of that; it has stood
 * since `stoodFor` seconds ago.
 */
function stand(t: Tread, seconds: number, stoodFor = 0) {
  spanOver(t, seconds, span)
  t.standing = true
  t.leaving = 0
  t.standSince = t.clock - stoodFor
  t.lo = span.lo
  t.hi = span.hi
  t.at = (span.lo + span.hi) / 2
}

/**
 * Whether the body is shown standing (its `idle`): it has stood for `STAND_AFTER` (the facing may already treat it
 * as standing; the clip does not blink to `idle` for a moment).
 */
export const shownStanding = (t: Tread) => t.standing && t.clock - t.standSince >= STAND_AFTER - 1e-6

/**
 * Moves the record on to the body's centre `x` after `dt` seconds, `onGround` or not (standing is decided on the
 * ground only: a body in the air walks). On a frame where no time passes (a hit-stop) nothing is decided, but where
 * the body is is remembered (the step a hit lands on is shown on such a frame).
 */
export function stepTread(t: Tread, x: number, dt: number, onGround = true) {
  if (Number.isNaN(t.x)) {
    restart(t, x)
    return
  }
  if (!(dt > 0)) {
    if (x !== t.x && Math.abs(x - t.x) <= TREAD_JUMP_PX) {
      t.path += Math.abs(x - t.x)
      t.x = x
      remember(t, x)
      if (t.facing * (x - t.peak) > 0) {
        t.peak = x
        t.path = 0
      }
    }
    return
  }
  t.clock += dt
  if (Number.isNaN(t.walkSince)) t.walkSince = t.clock
  if (Math.abs(x - t.x) > TREAD_JUMP_PX) {
    restart(t, x)
    return
  }
  t.path += Math.abs(x - t.x)
  t.x = x
  remember(t, x)
  // New ground: further than it has been the way it goes, or back far enough to turn.
  if (t.facing * (x - t.peak) > 0) {
    t.peak = x
    t.path = 0
  }
  if (t.facing * (x - t.far) > NEW_GROUND_PX) {
    t.far = x
    t.stalled = 0
  } else if (t.facing * (t.peak - x) >= TURN_PX) {
    t.shuffled = t.path - t.facing * (t.peak - x) >= SHUFFLE_PX - 1e-6
    t.facing = t.facing > 0 ? -1 : 1
    t.far = x
    t.peak = x
    t.path = 0
    t.stalled = 0
    t.turnedBefore = t.turnedAt
    t.turnedAt = t.clock
  } else t.stalled += dt
  if (!onGround) {
    // Off the ground (a hop, a fall) it is not standing, and nothing it does there counts towards standing.
    t.stalled = 0
    t.turnedAt = -Infinity
    t.turnedBefore = -Infinity
    if (t.standing) {
      t.standing = false
      t.walkSince = t.clock - dt
    }
    return
  }
  if (t.standing) {
    // Within its span (give or take a step back that does not count) it stands on.
    if (x >= t.lo - TURN_PX && x <= t.hi + TURN_PX) return
    // It sets off, the way it leaves its span; the walk begins with this step.
    t.standing = false
    t.facing = x > (t.lo + t.hi) / 2 ? 1 : -1
    t.leaving = t.facing
    t.far = x
    t.peak = x
    t.path = 0
    t.stalled = 0
    t.turnedAt = -Infinity
    t.turnedBefore = -Infinity
    t.walkSince = t.clock - dt
    return
  }
  if (t.stalled >= STAND_AFTER) stand(t, t.stalled, t.stalled)
  else if (t.clock - t.turnedBefore <= TURNING_SECONDS + 1e-6) {
    // Turning on the spot: twice lately, inside a small span.
    spanOver(t, t.clock - t.turnedBefore, span)
    if (span.hi - span.lo <= MARK_SPAN_PX) {
      // Within where it went to and fro: the whole of it when that is small (the turn is seen a few px after the
      // end it turned at), else what lies between the turns.
      spanOver(t, TURNING_SECONDS, span)
      stand(t, span.hi - span.lo <= MARK_SPAN_PX ? TURNING_SECONDS : t.clock - t.turnedBefore)
    }
  }
}

/**
 * Moves the picture of the body (its centre now at `x`) on after `dt` seconds: towards the hold point while the body
 * stands and `may` (only bodies that walk on the ground are held), else back onto the body; at most `EASE_SPEED` px/s
 * apart from the body's own motion and never more than `HOLD_PX` from it. On a frame where no time passes a held
 * picture stays exactly where it was (the body may snap from where it was drawn between steps to where it stands).
 */
export function stepPicture(t: Tread, x: number, dt: number, may: boolean) {
  if (Number.isNaN(t.x)) return
  if (!(dt > 0)) {
    // A held picture stays put; any other is the body (plus what is left of an easing).
    // (By at most `HELD_SLIP_PX` apart from the body: the step a hit lands on is shown on a held frame too.)
    if (may && t.standing && !Number.isNaN(t.shown)) {
      const keep = Math.max(-HOLD_PX - 2, Math.min(HOLD_PX + 2, t.shown - x))
      t.offset += Math.max(-HELD_SLIP_PX, Math.min(HELD_SLIP_PX, keep - t.offset))
    }
    return
  }
  const want = may && t.standing ? Math.max(-HOLD_PX, Math.min(HOLD_PX, t.at - x)) : 0
  const ease = EASE_SPEED * dt
  t.offset += Math.max(-ease, Math.min(ease, want - t.offset))
  t.shown = x + t.offset
}

/** Where to draw a body whose centre is at `x`: there, plus the picture's offset. */
export const treadX = (t: Tread, x: number) => x + t.offset

/**
 * The ground the picture covered since the last call, the way it is drawn facing (px; a step back counts nothing).
 * Called once per update with time passing.
 */
export function drawnGain(t: Tread, face: 1 | -1) {
  const drawn = treadX(t, t.x)
  const gain = Number.isNaN(t.drawnX) ? 0 : Math.max(0, face * (drawn - t.drawnX))
  t.drawnX = drawn
  return gain
}

/**
 * The facing towards the hero, `d` being the simulation's own aim (`player.x - actor.x`, left edges as sim.ts
 * compares them): it changes only when the hero is more than `zone` px over to the other side.
 */
export function sideFacing(current: 1 | -1, d: number, zone = FACE_DEAD_ZONE): 1 | -1 {
  if (d > zone) return 1
  if (d < -zone) return -1
  return current
}

/** `sideFacing` for a body that turned `age` seconds ago: within `FACE_HOLD` of its last turn it keeps its facing. */
export function heldSideFacing(current: 1 | -1, d: number, age: number, zone = FACE_DEAD_ZONE): 1 | -1 {
  return age < FACE_HOLD ? current : sideFacing(current, d, zone)
}

/**
 * The drawn facing of a walking body that turned `age` seconds ago: standing, the hero's side (`d`, with the dead
 * zone) when `towardsHero`; walking, the way its walk has gone (before that is known, the way it set off). A body
 * that would turn again within `FACE_HOLD` of its last turn is turning on the spot: it marks
 * time (the record stands) and keeps its facing.
 */
export function walkFacing(t: Tread, current: 1 | -1, d: number, towardsHero: boolean, age = Infinity): 1 | -1 {
  if (t.standing) return towardsHero ? heldSideFacing(current, d, age) : current
  // Until its walk has lasted long enough to tell, the way it set off from a stand stands for it.
  const net = netMotion(t)
  const way = motionKnown(t) ? (net > NET_TURN_PX ? 1 : net < -NET_TURN_PX ? -1 : current) : t.leaving || current
  if (way === current) return current
  // It turns on a step that goes the new way, not on one that is already coming back.
  if (t.count > 1 && way * (t.xs[t.head] - t.xs[(t.head - 1 + HISTORY) % HISTORY]) < 0) return current
  if (age < FACE_HOLD) {
    // Turning back on what its walk has shown: it marks time, within where it has been since its last turn (or a
    // moment). (When only the way it set off says otherwise, it walks on.)
    if (motionKnown(t)) stand(t, Math.max(age, STAND_AFTER))
    return current
  }
  if (t.clock - t.turnedAt <= NET_SECONDS + 1e-6 && t.shuffled) {
    // It shuffled to and fro on the spot and then went a step or two back: it marks time on, facing as it was.
    if (motionKnown(t)) {
      stand(t, STAND_AFTER)
      return current
    }
  }
  return way
}
