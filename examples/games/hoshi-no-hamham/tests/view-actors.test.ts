import { beforeEach, describe, expect, it, vi } from 'vitest'

/** Every blit the actors view makes, in order. */
const blits: { anim: string; t: number; x: number; y: number; alpha?: number; frame?: number; flip?: boolean }[] = []

vi.mock('../src/view/bake', () => ({
  // (A light's `gather` has frames, so its drawing can be read; the other clips have none.)
  clip: (sheet: string, name: string) =>
    name === 'gather' ? { id: `${sheet}#${name}`, frames: [{}, {}, {}, {}] } : { id: `${sheet}#${name}` },
  flashClip: () => undefined,
  // The run's frame from its time (14 fps, 8 frames), so the footstep can be counted.
  frameIndex: (_anim: unknown, t: number, frame?: number) => frame ?? Math.floor(t * 14 + 1e-9) % 8,
  // The options of a blit, as the real `brush` hands them over (there in one shared object).
  brush: (
    flip?: boolean,
    alpha?: number,
    frame?: number,
    sx?: number,
    sy?: number,
    angle?: number,
    pivotX?: number
  ) => ({
    flip,
    alpha,
    frame,
    sx,
    sy,
    angle,
    pivotX
  }),
  blit: (
    _ctx: unknown,
    anim: { id: string },
    t: number,
    x: number,
    y: number,
    o: { alpha?: number; frame?: number; flip?: boolean } = {}
  ) => blits.push({ anim: anim.id, t, x, y, alpha: o.alpha, frame: o.frame, flip: o.flip })
}))

import { ENEMY_KINDS, ENEMY_SPEC, HERO_SPEC, bossSpec } from '../src/art/contract'
import {
  ActorsView,
  BOSS_JOLT_PX,
  BOSS_JOLT_SECONDS,
  GHOST_SPEED,
  PositionTrail,
  TRAIL_AGES,
  TRAIL_ALPHAS,
  DIE_GRAVITY,
  DIE_HOP_SPEED,
  ENEMY_KNOCK_GRAVITY,
  ENEMY_KNOCK_HOP,
  ENEMY_KNOCK_SPEED,
  SKID_DUST_EVERY,
  flightAt,
  groundBelow,
  knockFlight,
  SKID_TAIL,
  bossJolt,
  dieLandTime,
  AIR_TURN_PX,
  AIR_SHORT_SECONDS,
  landsSoon,
  DIE_WATER_HOP_SPEED,
  WATER_TOSS,
  BIRTH_SOLID_SECONDS,
  SHOT_BIRTH_DX,
  LAND_SLIDE_PX
} from '../src/view/actors'
import {
  BOSS_DEFEAT_GROUND_FRAME,
  ENEMY_DEFEAT_GROUND_FRAME,
  ENEMY_HURT_SECONDS,
  WALKER_APEX_SPEED,
  BRUTE_IDLE_SECONDS,
  FIT_MIN,
  LUNGE_FRAMES,
  RUN_CONTACT_FRAMES,
  SWARM_IDLE_SECONDS,
  SKID_SPEED,
  aimClear,
  clipLife,
  frameStart,
  heroClip,
  hitTime,
  SHOT_CUE_SECONDS,
  specDuration
} from '../src/view/clips'
import { frameAt, type Anim } from '../src/art/sheet'
import { FACE_DEAD_ZONE, FACE_HOLD } from '../src/view/tread'
import { TILE } from '../src/game/types'
import { BITE_TIME, INVULN } from '../src/game/sim'

/** A stand-in of the squirrel's `shoot` with its contract timing (no pixels). */
const spitAnim = () =>
  ({
    frames: Array.from({ length: ENEMY_SPEC.spitter.shoot.frames }, () => ({})),
    fps: ENEMY_SPEC.spitter.shoot.fps,
    loop: false,
    hold: ENEMY_SPEC.spitter.shoot.hold
  }) as unknown as Anim

describe('PositionTrail', () => {
  it('returns the position pushed `age` pushes ago and knows how far its history reaches', () => {
    const trail = new PositionTrail(5)
    expect(trail.has(0)).toBe(false)
    for (let i = 0; i < 7; i++) trail.push(i, i * 10)
    expect(trail.has(4)).toBe(true)
    expect(trail.has(5)).toBe(false)
    expect([trail.x(0), trail.x(2), trail.x(4)]).toEqual([6, 4, 2])
    expect([trail.y(0), trail.y(2), trail.y(4)]).toEqual([60, 40, 20])
    trail.clear()
    expect(trail.has(0)).toBe(false)
  })

  it('has no history reaching beyond the pushes made', () => {
    const trail = new PositionTrail(5)
    trail.push(1, 1)
    trail.push(2, 2)
    trail.push(3, 3)
    expect(trail.has(2)).toBe(true)
    expect(trail.has(3)).toBe(false)
  })
})

const player = (extra = {}) => ({
  x: 0,
  y: 0,
  w: 30,
  h: 40,
  vx: 0,
  vy: 0,
  facing: 1,
  onGround: true,
  inWater: false,
  biteTimer: 0,
  invuln: 0,
  dead: false,
  ...extra
})

/** One display frame of the view: the simulation's time and the real time both pass (as `StageView` does). */
const frame = (view: ActorsView, dt = 1 / 60) => {
  view.update(dt)
  view.tickReal(dt)
}

const bossBody = (extra = {}) => ({
  x: 100,
  y: 200,
  w: 80,
  h: 80,
  vx: 0,
  vy: 0,
  facing: 1,
  hitFlash: 0,
  dead: false,
  active: true,
  state: 'idle',
  stateTime: 0,
  def: { kind: 'brute', art: 'boarBoss' },
  ...extra
})

function setup(reducedMotion = false) {
  const world = {
    player: player(),
    enemies: [],
    boss: bossBody() as ReturnType<typeof bossBody> | null,
    state: 'play',
    h: 20,
    solidAt: () => false,
    tileAt: () => 0
  }
  const fx = { rand: () => 0.5, spawn: () => {}, burst: () => {} }
  const view = new ActorsView(world as never, fx as never, () => {}, reducedMotion)
  return { world, view }
}

const ctx = {} as CanvasRenderingContext2D
const bodyBlits = () => blits.filter((b) => b.anim.startsWith('boarBoss'))

beforeEach(() => {
  blits.length = 0
})

describe('hero turn timer', () => {
  const turnAge = (view: ActorsView) => (view as unknown as { turnAge: number | null }).turnAge

  it('starts when the facing flips on the ground at a walking pace or less, and ends with its clip', () => {
    const { world, view } = setup()
    view.update(1 / 60)
    expect(turnAge(view)).toBeNull()
    world.player.facing = -1
    view.update(1 / 60)
    expect(turnAge(view)).toBe(0)
    view.update(0.05)
    expect(turnAge(view)).toBeCloseTo(0.05)
    expect(specDuration(HERO_SPEC.turn)).toBeLessThan(0.5)
    view.update(specDuration(HERO_SPEC.turn))
    expect(turnAge(view)).toBeNull()
  })

  it('does not start at a run (a pivot is drawn on the spot)', () => {
    const { world, view } = setup()
    view.update(1 / 60)
    world.player.vx = -(SKID_SPEED + 10)
    world.player.facing = -1
    view.update(1 / 60)
    expect(turnAge(view)).toBeNull()
  })

  it('does not start in the air or while skidding', () => {
    const { world, view } = setup()
    view.update(1 / 60)
    world.player.onGround = false
    world.player.facing = -1
    view.update(1 / 60)
    expect(turnAge(view)).toBeNull()
    world.player.onGround = true
    world.player.vx = -(SKID_SPEED + 50)
    world.player.facing = 1
    view.update(1 / 60)
    expect(turnAge(view)).toBeNull()
  })

  it('is cleared by leaving the ground', () => {
    const { world, view } = setup()
    view.update(1 / 60)
    world.player.facing = -1
    view.update(1 / 60)
    world.player.onGround = false
    view.update(1 / 60)
    expect(turnAge(view)).toBeNull()
  })

  it('selects the turn clip once the timer runs', () => {
    expect(heroClip({ ...baseHero, turnAge: 0 }, HERO_SPEC).name).toBe('turn')
  })
})

const baseHero = {
  cheering: false,
  cheerAge: 0,
  biteAge: null,
  hurt: false,
  hurtAge: 0,
  inWater: false,
  waterTime: 0,
  onGround: true,
  vx: 0,
  vy: 0,
  facing: 1 as const,
  airTime: 0,
  landAge: 99,
  hardLanding: false,
  distance: 0,
  idleTime: 0,
  blinkAge: 99,
  skidAge: null,
  turnAge: null
}

describe('speed ghosts of a charging boss', () => {
  const charge = (world: ReturnType<typeof setup>['world'], vx = GHOST_SPEED + 100) => {
    world.boss = bossBody({ state: 'charge', vx })
  }

  it('draws two older after-images behind the body at 0.3 and 0.15 opacity', () => {
    const { world, view } = setup()
    charge(world)
    for (let i = 0; i < 6; i++) {
      world.boss!.x += 10
      view.update(1 / 60)
    }
    view.drawBoss(ctx)
    const drawn = bodyBlits()
    expect(drawn).toHaveLength(3)
    const [old, mid, body] = drawn
    expect(old.alpha).toBe(TRAIL_ALPHAS[0])
    expect(mid.alpha).toBe(TRAIL_ALPHAS[1])
    expect(TRAIL_ALPHAS).toEqual([0.15, 0.3])
    expect(TRAIL_AGES).toEqual([4, 2])
    expect(body.alpha).toBeUndefined()
    // Positions 4 and 2 display frames ago, same clip time and frame as the body.
    expect(body.x - old.x).toBe(40)
    expect(body.x - mid.x).toBe(20)
    expect([old.anim, mid.anim, old.t, mid.t]).toEqual([body.anim, body.anim, body.t, body.t])
  })

  it('waits until the history is long enough', () => {
    const { world, view } = setup()
    charge(world)
    view.update(1 / 60)
    view.update(1 / 60)
    view.update(1 / 60)
    view.drawBoss(ctx)
    expect(bodyBlits()).toHaveLength(2)
  })

  it('also trails a diving boss, by total speed', () => {
    const { world, view } = setup()
    world.boss = bossBody({ state: 'dive', vx: 0, vy: GHOST_SPEED + 40, def: { kind: 'flyer', art: 'boarBoss' } })
    for (let i = 0; i < 5; i++) view.update(1 / 60)
    view.drawBoss(ctx)
    expect(bodyBlits()).toHaveLength(3)
  })

  it('draws none at or below the speed limit, in other states, or with reduced motion', () => {
    for (const make of [
      (w: ReturnType<typeof setup>['world']) => charge(w, GHOST_SPEED),
      (w: ReturnType<typeof setup>['world']) => (w.boss = bossBody({ state: 'recover', vx: 400 }))
    ]) {
      const { world, view } = setup()
      make(world)
      for (let i = 0; i < 6; i++) view.update(1 / 60)
      view.drawBoss(ctx)
      expect(bodyBlits()).toHaveLength(1)
      blits.length = 0
    }
    const { world, view } = setup(true)
    charge(world)
    for (let i = 0; i < 6; i++) view.update(1 / 60)
    view.drawBoss(ctx)
    expect(bodyBlits()).toHaveLength(1)
  })

  it('is skipped while the view is held by a hit-stop and resumes afterwards', () => {
    const { world, view } = setup()
    charge(world)
    for (let i = 0; i < 6; i++) view.update(1 / 60)
    view.update(0)
    view.drawBoss(ctx)
    expect(bodyBlits()).toHaveLength(1)
    blits.length = 0
    view.update(1 / 60)
    view.drawBoss(ctx)
    expect(bodyBlits()).toHaveLength(3)
  })

  it('clears its history when the state ends', () => {
    const { world, view } = setup()
    charge(world)
    for (let i = 0; i < 6; i++) view.update(1 / 60)
    world.boss!.state = 'recover'
    view.update(1 / 60)
    charge(world)
    view.update(1 / 60)
    view.drawBoss(ctx)
    // Only one position is recorded since the charge began again: no after-images yet.
    expect(bodyBlits()).toHaveLength(1)
  })
})

describe('a hit on the boss', () => {
  const hit = (view: ActorsView) => view.handle({ type: 'boss-hit', x: 0, y: 0, ratio: 0.5, weak: false } as never)
  const body = () => bodyBlits().at(-1)!

  it('draws the hurt clip from its first frame, held by a hit-stop, then the state clip again', () => {
    const { view } = setup()
    view.update(1 / 60)
    hit(view)
    view.update(0)
    view.drawBoss(ctx)
    expect(body()).toMatchObject({ anim: 'boarBoss#hurt', t: 0 })
    view.update(0.05)
    view.drawBoss(ctx)
    expect(body()).toMatchObject({ anim: 'boarBoss#hurt' })
    expect(body().t).toBeCloseTo(0.05)
    view.update(specDuration(bossSpec('boarBoss').hurt))
    view.drawBoss(ctx)
    expect(body().anim).toBe('boarBoss#idle')
  })

  it('keeps the windup and jolts the sprite away from the hero, easing back; the shadow stays', () => {
    const { world, view } = setup()
    world.boss = bossBody({ state: 'windup' })
    view.update(1 / 60)
    hit(view)
    view.drawBoss(ctx)
    const centre = 100 + 80 / 2
    expect(body()).toMatchObject({ anim: 'boarBoss#windup', x: centre + BOSS_JOLT_PX })
    const xs: number[] = []
    for (let t = 0; t < BOSS_JOLT_SECONDS + 0.05; t += 0.01) {
      view.update(0.01)
      view.drawBoss(ctx)
      xs.push(body().x - centre)
    }
    for (let i = 1; i < xs.length; i++) expect(xs[i]).toBeLessThanOrEqual(xs[i - 1])
    expect(xs.at(-1)).toBe(0)
    // From the other side, the jolt goes the other way.
    world.player.x = 400
    hit(view)
    view.drawBoss(ctx)
    expect(body().x).toBe(centre - BOSS_JOLT_PX)
    expect(bossJolt(0, 1)).toBe(BOSS_JOLT_PX)
    expect(bossJolt(BOSS_JOLT_SECONDS, 1)).toBe(0)
  })

  it('does not jolt under reduced motion or during a staged pose', () => {
    const reduced = setup(true)
    reduced.view.update(1 / 60)
    hit(reduced.view)
    reduced.view.drawBoss(ctx)
    expect(body()).toMatchObject({ anim: 'boarBoss#hurt', x: 140 })
    const staged = setup()
    staged.view.pose('boss', 'intro', 1)
    hit(staged.view)
    staged.view.drawBoss(ctx)
    expect(body()).toMatchObject({ anim: 'boarBoss#intro', x: 140 })
  })
})

/** A world with solid ground from row `groundRow` down (or none). */
function grounded(groundRow: number | null) {
  const rig = setup()
  const world = rig.world as unknown as { solidAt: (tx: number, ty: number) => boolean }
  world.solidAt = (_tx, ty) => groundRow !== null && ty >= groundRow
  return rig
}

const dieAnim = () =>
  ({
    frames: Array.from({ length: HERO_SPEC.die.frames }, () => ({})),
    fps: HERO_SPEC.die.fps,
    loop: false,
    sustain: HERO_SPEC.die.sustain
  }) as unknown as Anim

describe("the hero's knock-out", () => {
  const GROUND = 5 * TILE
  /** Frames shown and the body's feet row, frame by frame, after a hit-stop of `hold` display frames. */
  const knockOut = (feet: number, groundRow: number | null, seconds = 2.4, hold = 4) => {
    const { world, view } = grounded(groundRow)
    world.player.y = feet - world.player.h
    // (On the ground only when his feet are on its row.)
    world.player.onGround = groundRow !== null && feet === groundRow * TILE
    world.player.dead = true
    view.handle({ type: 'dead', x: 0, y: 0 } as never)
    const out: { frame: number; feet: number }[] = []
    const sample = () => {
      const choice = view.selectHero()!
      expect(choice.name).toBe('die')
      out.push({ frame: choice.frame ?? frameAt(dieAnim(), choice.t), feet: view.deathPoint()!.y + world.player.h / 2 })
    }
    for (let i = 0; i < hold; i++) {
      view.update(0)
      sample()
    }
    for (let t = 0; t < seconds; t += 1 / 60) {
      view.update(1 / 60)
      sample()
    }
    return out
  }
  const collapse = (frames: number[]) => frames.filter((f, i) => i === 0 || f !== frames[i - 1])

  it('knocked down on the ground: 0..7 in order, then 6/7; up a hop of 26 px, then on the ground row for good', () => {
    const run = knockOut(GROUND, 5)
    expect(DIE_HOP_SPEED).toBe(260)
    expect(DIE_GRAVITY).toBe(1300)
    // The hit-stop holds the hit frame.
    expect(run.slice(0, 4).map((r) => r.frame)).toEqual([0, 0, 0, 0])
    const frames = collapse(run.map((r) => r.frame))
    expect(frames.slice(0, 8)).toEqual([0, 1, 2, 3, 4, 5, 6, 7])
    for (const f of frames.slice(8)) expect([6, 7]).toContain(f)
    const top = GROUND - DIE_HOP_SPEED ** 2 / (2 * DIE_GRAVITY)
    const landed = run.findIndex((r) => r.frame >= 4)
    for (const [i, r] of run.entries()) {
      expect(r.feet).toBeGreaterThanOrEqual(top - 1e-6)
      expect(r.feet).toBeLessThanOrEqual(GROUND)
      if (i >= landed) expect(r.feet).toBe(GROUND)
    }
    // It lands with the bounce frame, 0.4 s after the hit (the hit and the tumble).
    expect(dieLandTime(GROUND, GROUND)).toBeCloseTo(0.4)
  })

  it('knocked out in mid-air: tumbling until the body lands, then 4, 5, 6/7 on the ground', () => {
    const run = knockOut(GROUND - 200, 5)
    const landed = run.findIndex((r) => r.feet === GROUND)
    expect(landed).toBeGreaterThan(0)
    const air = collapse(run.slice(0, landed).map((r) => r.frame))
    expect(air[0]).toBe(0)
    for (const f of air.slice(1)) expect([1, 2, 3]).toContain(f)
    // A long fall cycles the tumble.
    expect(air.length).toBeGreaterThan(4)
    const ground = collapse(run.slice(landed).map((r) => r.frame))
    expect(ground.slice(0, 2)).toEqual([4, 5])
    for (const f of ground.slice(2)) expect([6, 7]).toContain(f)
    for (const r of run.slice(landed)) expect(r.feet).toBe(GROUND)
  })

  it('over a pit: never the ground frames, and the body falls out of the view', () => {
    const run = knockOut(GROUND, null)
    for (const r of run) expect(r.frame).toBeLessThan(4)
    expect(run.at(-1)!.feet).toBeGreaterThan(GROUND + 400)
  })

  it('knocked out at the very edge of a ledge (his centre past it, his box on it): he comes to lie on the ledge', () => {
    const { world, view } = setup()
    // Ground (row 5) up to column 3; beyond it, a pit.
    ;(world as unknown as { solidAt: (tx: number, ty: number) => boolean }).solidAt = (tx, ty) => ty >= 5 && tx <= 3
    const p = world.player
    p.x = 4 * TILE - p.w / 2 + 6
    p.y = GROUND - p.h
    p.onGround = true
    p.dead = true
    view.handle({ type: 'dead', x: 0, y: 0 } as never)
    expect(view.deathRest()).toEqual({ x: p.x + p.w / 2, y: GROUND - p.h / 2 })
    for (let t = 0; t < 2.4; t += 1 / 60) view.update(1 / 60)
    expect(view.deathPoint()!.y + p.h / 2).toBe(GROUND)
    // Off the ground at the same spot (a jump over the pit), he falls into it.
    const air = setup()
    ;(air.world as unknown as { solidAt: (tx: number, ty: number) => boolean }).solidAt = (tx, ty) => ty >= 5 && tx <= 3
    Object.assign(air.world.player, { x: p.x, y: GROUND - p.h - 10, onGround: false, dead: true })
    air.view.handle({ type: 'dead', x: 0, y: 0 } as never)
    expect(air.view.deathRest()).toBeNull()
  })

  it('deathPoint follows the body', () => {
    const { world, view } = grounded(5)
    world.player.y = GROUND - world.player.h
    view.handle({ type: 'dead', x: 0, y: 0 } as never)
    const at = () => view.deathPoint()!.y
    const start = at()
    view.update(0.2)
    expect(at()).toBeLessThan(start - 20)
    view.update(0.5)
    expect(at()).toBe(start)
  })

  describe('in water the body takes the water’s pace', () => {
    /** The body's feet row and frame shown, frame by frame at `hz`, knocked out in water with its feet on `feet`. */
    const inWater = (feet: number, hz = 60, seconds = 3) => {
      const { world, view } = grounded(5)
      Object.assign(world.player, {
        y: feet - world.player.h,
        onGround: feet === GROUND,
        inWater: true,
        dead: true
      })
      view.handle({ type: 'dead', x: 0, y: 0 } as never)
      const out: { frame: number; feet: number; t: number }[] = []
      for (let t = 0; t < seconds; t += 1 / hz) {
        view.update(1 / hz)
        const choice = view.selectHero()!
        out.push({
          frame: choice.frame ?? frameAt(dieAnim(), choice.t),
          feet: view.deathPoint()!.y + 20,
          t: t + 1 / hz
        })
      }
      return out
    }

    it('swimming 100 px over the floor: a small lift, then it sinks no faster than 260 px/s, and lies on the floor', () => {
      expect(WATER_TOSS).toEqual({ hop: DIE_WATER_HOP_SPEED, gravity: 1600 * 0.28, cap: 260 })
      const run = inWater(GROUND - 100)
      const top = Math.min(...run.map((r) => r.feet))
      expect(top).toBeLessThan(GROUND - 100)
      expect(top).toBeGreaterThan(GROUND - 100 - 10)
      for (let i = 1; i < run.length; i++) expect(run[i].feet - run[i - 1].feet).toBeLessThanOrEqual(260 / 60 + 1e-6)
      const landed = run.findIndex((r) => r.feet === GROUND)
      expect(landed).toBeGreaterThan(0)
      for (const r of run.slice(landed)) expect(r.feet).toBe(GROUND)
      // The bounce frame begins on the frame it touches down, and the tumble plays until then.
      expect(run[landed].frame).toBe(4)
      for (const r of run.slice(0, landed)) expect(r.frame).toBeLessThan(4)
    })

    it('the landing is exact at any display rate (the bounce on the frame it touches down)', () => {
      const at = dieLandTime(GROUND - 100, GROUND, WATER_TOSS)
      // Lift, then the sink speeds up to 260 px/s and keeps it: longer than a free fall at that gravity.
      expect(at).toBeGreaterThan((DIE_WATER_HOP_SPEED + 260) / (1600 * 0.28))
      for (const hz of [30, 60, 120, 144]) {
        const run = inWater(GROUND - 100, hz)
        const landed = run.findIndex((r) => r.feet === GROUND)
        expect(run[landed].t, `${hz} Hz`).toBeGreaterThanOrEqual(at - 1e-6)
        expect(run[landed].t - at, `${hz} Hz`).toBeLessThan(1 / hz + 1e-6)
        expect(run[landed].frame, `${hz} Hz`).toBe(4)
      }
    })

    it('on the floor of the pool: a small lift and back down onto the floor', () => {
      const run = inWater(GROUND)
      expect(Math.min(...run.map((r) => r.feet))).toBeGreaterThan(GROUND - 10)
      expect(run.at(-1)!.feet).toBe(GROUND)
      expect(dieLandTime(GROUND, GROUND, WATER_TOSS)).toBeCloseTo((2 * DIE_WATER_HOP_SPEED) / (1600 * 0.28))
    })
  })
})

describe('a boss knocked out in the air comes down', () => {
  const GROUND = 5 * TILE
  /** The defeat ghost's feet row, frame by frame, for a boss whose feet are on `feet` when he falls. */
  const fall = (art: string, kind: string, feet: number) => {
    const { world, view } = grounded(5)
    world.boss = bossBody({ y: feet - 80, def: { kind, art }, dead: true })
    view.handle({ type: 'boss-down', x: 0, y: 0 } as never)
    const out: { age: number; y: number }[] = []
    let age = 0
    for (let i = 0; i < 90; i++) {
      blits.length = 0
      view.drawBoss(ctx)
      const ghost = blits.find((b) => b.anim === `${art}#defeat`)
      if (ghost) out.push({ age, y: ghost.y })
      view.update(1 / 60)
      age += 1 / 60
    }
    return out
  }

  it('a flier knocked out 60 px above the ground lands on frame 4 and stays on the ground row', () => {
    const spec = bossSpec('crowBoss').defeat
    const at = frameStart(spec, BOSS_DEFEAT_GROUND_FRAME.crowBoss)
    expect(BOSS_DEFEAT_GROUND_FRAME.crowBoss).toBe(4)
    const run = fall('crowBoss', 'flyer', GROUND - 60)
    expect(run.length).toBeGreaterThan(30)
    for (const { age, y } of run) {
      expect(y).toBeLessThanOrEqual(GROUND)
      if (age >= at - 1e-9) expect(y).toBe(GROUND)
      else expect(y).toBeLessThan(GROUND)
    }
  })

  it('the weasel (frames held longer) lands on its own frame-4 time', () => {
    const spec = bossSpec('weaselBoss').defeat
    const at = frameStart(spec, BOSS_DEFEAT_GROUND_FRAME.weaselBoss)
    expect(at).toBeCloseTo(0.5)
    const run = fall('weaselBoss', 'brute', GROUND - 60)
    const first = run.find((r) => r.y === GROUND)!
    expect(first.age).toBeGreaterThanOrEqual(at - 1e-9)
    expect(first.age).toBeLessThan(at + 1 / 60 + 1e-9)
    for (const r of run) expect(r.y).toBeLessThanOrEqual(GROUND)
  })

  it('a boss knocked out on the ground does not move', () => {
    const run = fall('boarBoss', 'brute', GROUND)
    expect(run.length).toBeGreaterThan(30)
    for (const { y } of run) expect(y).toBe(GROUND)
  })
})

describe('the rat and the mole: what the body does', () => {
  const rig = () => {
    const { world, view } = setup()
    const rat = { id: 1, kind: 'walker', x: 0, y: 0, w: 44, h: 38, vx: 74, vy: 0, facing: 1, onGround: true }
    ;(world as unknown as { enemies: unknown[] }).enemies = [rat]
    world.player.x = 1000
    const step = (dx: number) => {
      rat.x += dx
      rat.vx = dx * 60
      view.update(1 / 60)
      view.tickReal(1 / 60)
    }
    return { world, view, rat, enemy: rat as never, step }
  }

  it('walks by the ground it gains, stands once it gains none for a while, and sets off again', () => {
    const { view, enemy, step } = rig()
    view.update(1 / 60)
    for (let i = 0; i < 10; i++) step(1.25)
    const walk = view.selectEnemy(enemy)
    expect(walk.name).toBe('move')
    // 12.5 px at 5 px a frame of the 40 px stride: frame 2.
    expect(Math.floor((walk.t / specDuration(ENEMY_SPEC.walker.move)) * 8)).toBe(2)
    // Stopped by a wall for a step: still the stride.
    step(0)
    expect(view.selectEnemy(enemy).name).toBe('move')
    // The simulation shakes it on the spot (turned round every step): it stands, facing as it was.
    for (let i = 0; i < 12; i++) step(i % 2 ? 1.25 : -1.25)
    expect(view.selectEnemy(enemy).name).toBe('idle')
    expect(view.enemyFlip(enemy)).toBe(false)
    for (let i = 0; i < 20; i++) step(-1.25)
    expect(view.selectEnemy(enemy).name).toBe('move')
  })

  it('a body shaken on the spot is drawn standing in the middle of where it shakes', () => {
    const { view, rat, step } = rig()
    view.update(1 / 60)
    for (let i = 0; i < 10; i++) step(1.25)
    const xs: number[] = []
    for (let i = 0; i < 20; i++) {
      step(i % 2 ? -1.25 : 1.25)
      blits.length = 0
      view.drawEnemies(ctx)
      xs.push(blits.find((b) => b.anim === 'walker#idle' || b.anim === 'walker#move')!.x)
    }
    // Once it stands it does not move at all, though its body goes back and forth by 1.25 px.
    const standing = xs.slice(10)
    expect(new Set(standing).size).toBe(1)
    expect(Math.abs(standing[0] - (rat.x + 22))).toBeLessThanOrEqual(1.25)
  })

  it('faces the way it goes, not the way the simulation sets it, and turns only once it has gone back', () => {
    const { view, rat, enemy, step } = rig()
    view.update(1 / 60)
    for (let i = 0; i < 12; i++) step(1.25)
    expect(view.enemyFlip(enemy)).toBe(false)
    // The simulation flips `facing` every step at a pit: the picture does not.
    for (let i = 0; i < 6; i++) {
      rat.facing = -rat.facing as 1 | -1
      step(i % 2 ? 1.25 : -1.25)
      expect(view.enemyFlip(enemy)).toBe(false)
    }
    // Walking back for real: it turns, once, within a few steps of its walk (NET_SECONDS).
    const flips: boolean[] = []
    for (let i = 0; i < 24; i++) {
      step(-1.25)
      flips.push(view.enemyFlip(enemy))
    }
    expect(flips.at(-1)).toBe(true)
    expect(flips.filter((f, i) => i > 0 && f !== flips[i - 1]).length).toBe(1)
    expect(flips.indexOf(true)).toBeLessThanOrEqual(20)
  })

  it('standing, it faces the hero when he is in its chase range (with a dead zone)', () => {
    const { world, view, enemy, step } = rig()
    view.update(1 / 60)
    for (let i = 0; i < 12; i++) step(1.25)
    for (let i = 0; i < 12; i++) step(0)
    world.player.x = -100
    step(0)
    expect(view.enemyFlip(enemy)).toBe(true)
    world.player.x = 15 + 10
    for (let i = 0; i < 12; i++) step(0)
    // Within FACE_DEAD_ZONE px of its own aim it keeps its facing.
    expect(view.enemyFlip(enemy)).toBe(true)
    world.player.x = 15 + FACE_DEAD_ZONE + 1
    step(0)
    expect(view.enemyFlip(enemy)).toBe(false)
  })
})

describe('hero-side facing (frog, crow, squirrel)', () => {
  const rig = (kind: string) => {
    const { world, view } = setup()
    const enemy = { id: 2, kind, x: 300, y: 0, w: 44, h: 40, vx: 0, vy: 0, facing: 1, onGround: true, shootTimer: 2 }
    ;(world as unknown as { enemies: unknown[] }).enemies = [enemy]
    return { world, view, enemy, flip: () => view.enemyFlip(enemy as never) }
  }

  it('turns to the hero only past the dead zone, and not straight back after a turn', () => {
    const { world, view, flip } = rig('jumper')
    world.player.x = 400
    // (First seen on the ground, it lands: a landing keeps its facing.)
    for (let i = 0; i < 30; i++) frame(view)
    expect(flip()).toBe(false)
    world.player.x = 300 - FACE_DEAD_ZONE
    frame(view)
    expect(flip()).toBe(false)
    world.player.x = 300 - FACE_DEAD_ZONE - 1
    frame(view)
    expect(flip()).toBe(true)
    // Thrown back across at once by a hit: the frog holds its facing for FACE_HOLD first.
    world.player.x = 400
    frame(view)
    expect(flip()).toBe(true)
    for (let t = 0; t < FACE_HOLD; t += 1 / 60) frame(view)
    expect(flip()).toBe(false)
  })

  it('a squirrel whose acorn leaves the other way from its throw stands, turned to it, with no release', () => {
    const { world, view, enemy, flip } = rig('spitter')
    world.player.x = 400
    frame(view)
    frame(view)
    expect(flip()).toBe(false)
    // The hero crossed on the very step of the spit.
    world.player.x = 290
    enemy.shootTimer = 2.4
    view.handle({ type: 'spit', id: 2, x: 0, y: 0, dir: -1 } as never)
    frame(view)
    expect(flip()).toBe(true)
    // No release frame turned round, and no follow-through of the throw it gave up.
    for (let i = 0; i < 10; i++) {
      enemy.shootTimer -= 1 / 60
      frame(view)
      expect(view.selectEnemy(enemy as never).name).not.toBe('shoot')
    }
  })

  it('a squirrel whose target crosses before the acorn leaves begins its throw again, facing it', () => {
    const { world, view, enemy, flip } = rig('spitter')
    const shoot = ENEMY_SPEC.spitter.shoot
    world.player.x = 400
    enemy.shootTimer = hitTime(shoot) + 0.02
    const frames: { name: string; frame: number; left: boolean }[] = []
    const step = () => {
      enemy.shootTimer -= 1 / 60
      if (enemy.shootTimer <= 0) {
        enemy.shootTimer = 2.4
        view.handle({ type: 'spit', id: 2, x: 0, y: 0, dir: world.player.x > enemy.x ? 1 : -1 } as never)
      }
      frame(view)
      const c = view.selectEnemy(enemy as never)
      frames.push({ name: c.name, frame: c.frame ?? frameAt(spitAnim(), c.t), left: flip() })
    }
    for (let i = 0; i < 12; i++) step()
    expect(frames.at(-1)).toMatchObject({ name: 'shoot', left: false })
    // The hero goes over to its left before the release.
    world.player.x = 100
    const before = frames.length
    for (let i = 0; i < 40; i++) step()
    const again = frames.slice(before)
    // It begins again from its first frame, facing left, and releases facing left on the step of the spit.
    expect(again[0]).toMatchObject({ name: 'shoot', frame: 0, left: true })
    const release = again.findIndex((r) => r.frame === shoot.hit)
    expect(release).toBeGreaterThan(0)
    for (const r of again.filter((r) => r.name === 'shoot')) expect(r.left).toBe(true)
  })

  it('at 30 Hz (two steps a frame) a throw begun again shows from its first frame on the frame that first shows it', () => {
    const { world, view, enemy, flip } = rig('spitter')
    const shoot = ENEMY_SPEC.spitter.shoot
    world.player.x = 400
    enemy.shootTimer = hitTime(shoot) + 0.02
    const frames: { name: string; frame: number; left: boolean }[] = []
    const step = () => {
      enemy.shootTimer -= 1 / 60
      if (enemy.shootTimer <= 0) {
        enemy.shootTimer = 2.4
        view.handle({ type: 'spit', id: 2, x: 0, y: 0, dir: world.player.x > enemy.x ? 1 : -1 } as never)
      }
      view.simStep()
    }
    const show = () => {
      frame(view, 1 / 30)
      const c = view.selectEnemy(enemy as never)
      frames.push({ name: c.name, frame: c.frame ?? frameAt(spitAnim(), c.t), left: flip() })
    }
    for (let i = 0; i < 3; i++) {
      step()
      step()
      show()
    }
    expect(frames.at(-1)).toMatchObject({ name: 'shoot', left: false })
    // The hero crosses on the first step of a frame; the throw begins again on it, drawn on the frame after both.
    world.player.x = 100
    const before = frames.length
    for (let i = 0; i < 20; i++) {
      step()
      step()
      show()
    }
    expect(frames[before]).toMatchObject({ name: 'shoot', frame: 0, left: true })
  })

  it('a squirrel whose throw comes straight after a turn stands until it may face its aim, then throws facing it', () => {
    const { world, view, enemy, flip } = rig('spitter')
    const shoot = ENEMY_SPEC.spitter.shoot
    world.player.x = 500
    enemy.shootTimer = 2
    for (let i = 0; i < 20; i++) frame(view)
    // It turns left to the hero...
    world.player.x = 100
    frame(view)
    expect(flip()).toBe(true)
    // ...who is straight back on its right as its throw falls due: it may not turn yet, so no lead-in shows.
    world.player.x = 500
    enemy.shootTimer = hitTime(shoot)
    const seen: { name: string; left: boolean }[] = []
    for (let i = 0; i < 12; i++) {
      enemy.shootTimer -= 1 / 60
      frame(view)
      seen.push({ name: view.selectEnemy(enemy as never).name, left: flip() })
    }
    for (const r of seen) if (r.name === 'shoot') expect(r.left).toBe(false)
    expect(seen[0].name).toBe('idle')
    expect(seen.some((r) => r.name === 'shoot')).toBe(true)
  })

  for (const [hz, shown] of [
    [60, true],
    [30, false]
  ] as const)
    it(`at ${hz} Hz a throw begun again a step before its acorn leaves ${shown ? 'shows, and releases' : 'is never shown, and is given up (no release)'}`, () => {
      const { world, view, enemy, flip } = rig('spitter')
      const shoot = ENEMY_SPEC.spitter.shoot
      world.player.x = 400
      enemy.shootTimer = hitTime(shoot) + 0.02
      const per = 60 / hz
      const shots: { name: string; frame: number; left: boolean }[] = []
      const step = () => {
        enemy.shootTimer -= 1 / 60
        if (enemy.shootTimer <= 1e-9) {
          enemy.shootTimer = 2.4
          view.handle({ type: 'spit', id: 2, x: 0, y: 0, dir: world.player.x > enemy.x ? 1 : -1 } as never)
          view.simStep()
          return true
        }
        view.simStep()
        return false
      }
      // Up to two steps before the spit, in whole frames.
      while (enemy.shootTimer > 2 / 60 + 1e-9) {
        for (let k = 0; k < per; k++) step()
        frame(view, 1 / hz)
      }
      // The hero crosses on the step before the spit; at 30 Hz that step and the spit's are one frame.
      world.player.x = 100
      let spat = false
      for (let i = 0; i < 4 && !spat; i++) {
        for (let k = 0; k < per && !spat; k++) spat = step()
        frame(view, 1 / hz)
        const c = view.selectEnemy(enemy as never)
        shots.push({ name: c.name, frame: c.frame ?? frameAt(spitAnim(), c.t), left: flip() })
      }
      const release = shots.some((r) => r.name === 'shoot' && r.frame >= shoot.hit!)
      expect(release).toBe(shown)
      expect(shots.at(-1)!.left).toBe(true)
    })

  it('a squirrel bitten in its throw shows the white flash over the throw; outside it, the hurt', () => {
    const { view, enemy } = rig('spitter')
    view.update(1 / 60)
    const bite = (timer: number) => {
      enemy.shootTimer = timer
      ;(enemy as unknown as { hitFlash: number }).hitFlash = 0.16
      view.handle({ type: 'enemy-hit', id: 2, kind: 'spitter', x: 0, y: 0, dir: 1 } as never)
      return view.selectEnemy(enemy as never).name
    }
    expect(bite(0.1)).toBe('shoot')
    expect(bite(2.4)).toBe('shoot')
    expect(bite(1.2)).toBe('hurt')
    // The wind-up would have to begin before the hurt is over: the flash only.
    expect(bite(0.3)).toBe('idle')
  })
})

describe('a knocked-out enemy flies away from the hero and comes to lie on the ground', () => {
  const GROUND = 5 * TILE
  /** The ghost of an enemy of `kind` knocked out with its feet on `feet`, the hero standing at `heroX`. */
  const knock = (kind: string, feet: number, heroX: number, groundRow: number | null = 5) => {
    const { world, view } = grounded(groundRow)
    world.player.x = heroX
    world.player.y = GROUND - world.player.h
    const enemy = { id: 7, kind, x: 300, y: feet - 40, w: 44, h: 40, vx: 74, vy: 0, facing: 1, onGround: true }
    ;(world as unknown as { enemies: unknown[] }).enemies = [enemy]
    view.handle({ type: 'enemy-down', id: 7, kind, x: 322, y: feet - 20, dir: 1 } as never)
    ;(world as unknown as { enemies: unknown[] }).enemies = []
    const out: { age: number; x: number; y: number; flip?: boolean }[] = []
    let age = 0
    for (let i = 0; i < 40; i++) {
      blits.length = 0
      view.drawEnemies(ctx)
      const ghost = blits.find((b) => b.anim === `${kind}#defeat`)
      if (ghost) out.push({ age, x: ghost.x, y: ghost.y, flip: ghost.flip })
      view.update(1 / 60)
      age += 1 / 60
    }
    return out
  }

  for (const kind of ENEMY_KINDS)
    for (const side of ['left', 'right'] as const)
      it(`${kind}, the hero on the ${side}: away from him, facing him, on the ground row from its first lying frame`, () => {
        const heroX = side === 'left' ? 100 : 500
        const run = knock(kind, GROUND, heroX)
        expect(run.length).toBeGreaterThan(20)
        const away = side === 'left' ? 1 : -1
        for (let i = 1; i < run.length; i++) expect((run[i].x - run[i - 1].x) * away).toBeGreaterThanOrEqual(0)
        expect((run.at(-1)!.x - run[0].x) * away).toBeGreaterThan(10)
        // Facing the hero (the art faces right): flung backwards is away from him.
        for (const r of run) expect(r.flip).toBe(away > 0)
        const at = frameStart(ENEMY_SPEC[kind].defeat, ENEMY_DEFEAT_GROUND_FRAME[kind])
        const top = Math.min(...run.map((r) => r.y))
        expect(GROUND - top).toBeGreaterThan(ENEMY_KNOCK_HOP - 3)
        expect(GROUND - top).toBeLessThanOrEqual(ENEMY_KNOCK_HOP + 1e-6)
        const landed = run.filter((r) => r.age >= at - 1e-9)
        for (const r of landed) expect(r.y).toBe(GROUND)
        // No travel after landing.
        for (const r of landed) expect(r.x).toBe(landed[0].x)
      })

  it('a flyer knocked out 70 px up comes down to the ground by its first lying frame', () => {
    const run = knock('flyer', GROUND - 70, 100)
    const at = frameStart(ENEMY_SPEC.flyer.defeat, ENEMY_DEFEAT_GROUND_FRAME.flyer)
    expect(run[0].y).toBe(GROUND - 70)
    for (const r of run) {
      expect(r.y).toBeLessThanOrEqual(GROUND)
      if (r.age >= at - 1e-9) expect(r.y).toBe(GROUND)
    }
  })

  it('over a pit: it never lands and keeps tumbling while it falls', () => {
    const { world, view } = grounded(null)
    world.player.x = 100
    ;(world as unknown as { enemies: unknown[] }).enemies = [
      { id: 7, kind: 'walker', x: 300, y: GROUND - 40, w: 44, h: 40, vx: 74, vy: 0, facing: 1, onGround: true }
    ]
    view.handle({ type: 'enemy-down', id: 7, kind: 'walker', x: 322, y: GROUND - 20, dir: 1 } as never)
    ;(world as unknown as { enemies: unknown[] }).enemies = []
    const frames: number[] = []
    const ys: number[] = []
    for (let i = 0; i < 28; i++) {
      view.update(1 / 60)
      const g = view.ghostStates()[0]
      frames.push(g.choice.frame ?? Math.floor((g.choice.t * ENEMY_SPEC.walker.defeat.fps) / 1 + 1e-6))
      ys.push(g.feet)
    }
    for (const f of frames) expect(f).toBeLessThan(ENEMY_DEFEAT_GROUND_FRAME.walker)
    expect(new Set(frames.slice(6)).size).toBeGreaterThan(1)
    expect(ys.at(-1)!).toBeGreaterThan(Math.min(...ys) + 10)
  })

  it('the puff at the end of its life is where the body lies', () => {
    const { world, view } = grounded(5)
    const spawned: { name: string; x: number; y: number }[] = []
    ;(view as unknown as { fx: { spawn: (name: string, x: number, y: number) => void } }).fx.spawn = (name, x, y) =>
      spawned.push({ name, x, y })
    world.player.x = 100
    const enemy = { id: 3, kind: 'walker', x: 300, y: GROUND - 40, w: 44, h: 40, vx: -74, vy: 0, facing: -1 }
    ;(world as unknown as { enemies: unknown[] }).enemies = [enemy]
    view.handle({ type: 'enemy-down', id: 3, kind: 'walker', x: 322, y: GROUND - 20, dir: -1 } as never)
    for (let i = 0; i < 60; i++) view.update(1 / 60)
    const puff = spawned.find((s) => s.name === 'puff')!
    const at = frameStart(ENEMY_SPEC.walker.defeat, ENEMY_DEFEAT_GROUND_FRAME.walker)
    expect(puff.y).toBe(GROUND - 20)
    expect(puff.x).toBeCloseTo(322 + ENEMY_KNOCK_SPEED * at)
  })
})

describe('a clear touched in the air', () => {
  const GROUND = 5 * TILE
  const clear = (feet: number) => {
    const { world, view } = grounded(5)
    world.player.y = feet - world.player.h
    world.player.onGround = feet === GROUND
    world.player.vy = -40
    world.state = 'clear'
    view.handle({ type: 'clear', x: 0, y: 0 } as never)
    view.pose('hero', 'cheer', 3)
    const out: { name: string; t: number; feet: number }[] = []
    for (let i = 0; i < 60; i++) {
      const c = view.selectHero()!
      out.push({ name: c.name, t: c.t, feet: view.heroPoint()!.y + world.player.h / 2 })
      view.update(1 / 60)
      view.tickReal(1 / 60)
    }
    return out
  }

  it('cleared 60 px up: fall with the feet going down to the ground row, then cheer from frame 0 on the ground', () => {
    const run = clear(GROUND - 60)
    const first = run.findIndex((r) => r.name === 'cheer')
    expect(first).toBeGreaterThan(3)
    for (const r of run.slice(0, first)) expect(r.name).toBe('fall')
    for (let i = 1; i < first; i++) expect(run[i].feet).toBeGreaterThanOrEqual(run[i - 1].feet)
    expect(run[first].t).toBeLessThan(1 / 60 + 1e-9)
    for (const r of run.slice(first)) {
      expect(r.name).toBe('cheer')
      expect(r.feet).toBe(GROUND)
    }
  })

  it('cleared on the ground: the cheer at once, as before', () => {
    const run = clear(GROUND)
    expect(run[0].name).toBe('cheer')
    for (const r of run) expect(r.feet).toBe(GROUND)
  })
})

describe('a staged hero pose gives way to his own body while the simulation runs', () => {
  for (const [what, change] of [
    ['moves', (p: { vx: number }) => (p.vx = 200)],
    ['leaves the ground', (p: { onGround: boolean }) => (p.onGround = false)],
    ['bites', (p: { biteTimer: number }) => (p.biteTimer = 0.2)]
  ] as const)
    it(`ends when he ${what}`, () => {
      const { world, view } = setup()
      view.pose('hero', 'cheer', 2)
      view.update(1 / 60)
      expect(view.posing('hero')).toBe('cheer')
      ;(change as (p: unknown) => void)(world.player)
      view.update(1 / 60)
      expect(view.posing('hero')).toBeNull()
    })

  it('ends when he is hurt, and stays while the simulation is held', () => {
    const { world, view } = setup()
    view.pose('hero', 'cheer', 2)
    world.player.vx = 200
    view.update(0)
    expect(view.posing('hero')).toBe('cheer')
    world.player.vx = 0
    view.handle({ type: 'hurt' } as never)
    expect(view.posing('hero')).toBeNull()
  })

  it('the update of the frame that set it does not end it (that body is from the step before the pose)', () => {
    const { world, view } = setup()
    // He crossed the boss's line at a run: the entrance poses him standing and holds the simulation from then on.
    world.player.vx = 215
    view.pose('hero', 'idle', 2)
    view.update(1 / 60)
    expect(view.posing('hero')).toBe('idle')
    view.update(0)
    expect(view.posing('hero')).toBe('idle')
    // A step that runs later with him still running ends it.
    view.update(1 / 60)
    expect(view.posing('hero')).toBeNull()
  })

  it('a moment ends only its own pose', () => {
    const { view } = setup()
    const first = view.pose('hero', 'idle', 2)
    view.pose('hero', 'cheer', 2)
    view.unposeIf('hero', first)
    expect(view.posing('hero')).toBe('cheer')
  })
})

describe('a stun shows only once it lasts; a crash jolts the body', () => {
  const dizzy = () => blits.filter((b) => b.anim === 'fx#dizzy')
  const sweat = () => blits.filter((b) => b.anim === 'fx#sweat')
  it('a one-step stun changes neither the clip nor shows the mark; a lasting one does after 0.05 s', () => {
    const { world, view } = setup()
    world.boss = bossBody({ state: 'charge', vx: 300 })
    view.update(1 / 60)
    world.boss = bossBody({ state: 'stunned', stateTime: 1 / 60 })
    view.update(1 / 60)
    view.drawBoss(ctx)
    expect(bodyBlits().at(-1)!.anim).toBe('boarBoss#attack')
    expect(dizzy()).toHaveLength(0)
    blits.length = 0
    world.boss.stateTime = 0.06
    view.drawBoss(ctx)
    expect(bodyBlits().at(-1)!.anim).toBe('boarBoss#stunned')
    expect(dizzy()).toHaveLength(1)
  })

  it('the marks follow the clip shown: no sweat while his dash carries him through a recover', () => {
    const { world, view } = setup()
    world.boss = bossBody({ state: 'charge', vx: 300 })
    view.update(1 / 60)
    world.boss = bossBody({ state: 'recover', vx: 200, stateTime: 0.1 })
    view.update(1 / 60)
    view.drawBoss(ctx)
    expect(bodyBlits().at(-1)!.anim).toBe('boarBoss#attack')
    expect(sweat()).toHaveLength(0)
    blits.length = 0
    world.boss.vx = 10
    view.update(1 / 60)
    view.drawBoss(ctx)
    expect(bodyBlits().at(-1)!.anim).toBe('boarBoss#recover')
    expect(sweat()).toHaveLength(1)
    // On the side he faces (he charged to the right).
    expect(sweat()[0].x).toBeGreaterThan(140)
  })

  it('the crash jolts the sprite away from the wall', () => {
    const { world, view } = setup()
    world.boss = bossBody({ state: 'stunned', stateTime: 0, def: { kind: 'swarm', art: 'boarBoss' } })
    view.handle({ type: 'boss-crash', x: 0, y: 0, dir: 1 } as never)
    view.drawBoss(ctx)
    expect(bodyBlits().at(-1)!.x).toBe(140 - BOSS_JOLT_PX)
    blits.length = 0
    view.update(BOSS_JOLT_SECONDS)
    view.drawBoss(ctx)
    expect(bodyBlits().at(-1)!.x).toBe(140)
  })
})

describe('throws, casts and summons are shown only where the boss can show them', () => {
  const fox = (state: string, extra = {}) =>
    bossBody({ state, stateTime: 0.2, shotTimer: 1.5, def: { kind: 'swarm', art: 'foxBoss' }, ...extra })
  const drawn = () => {
    blits.length = 0
    return (view: ActorsView) => {
      view.drawBoss(ctx)
      return blits.filter((b) => b.anim.startsWith('foxBoss#')).at(-1)!.anim
    }
  }

  it('round 6p: a summon has no gesture of the boss: he goes on with what he does (the minion has its puff)', () => {
    const event = { type: 'minion', x: 0, y: 0, kind: 'walker' } as never
    const walking = setup()
    walking.world.boss = fox('idle')
    walking.view.handle(event)
    expect(drawn()(walking.view)).not.toBe('foxBoss#shoot')
    const dashing = setup()
    dashing.world.boss = fox('charge', { vx: 400 })
    dashing.view.handle(event)
    expect(drawn()(dashing.view)).toBe('foxBoss#attack')
  })

  it('a shot whose lead-in was not started leaves without a pose', () => {
    const { world, view } = setup()
    world.boss = fox('idle')
    view.handle({ type: 'boss-shoot', x: 0, y: 0, count: 1 } as never)
    expect(drawn()(view)).not.toBe('foxBoss#shoot')
  })
})

describe('the skid ends with the braking', () => {
  it('a full-speed reversal: skid from frame 0 while braking, gone SKID_TAIL after; a new skid starts again', () => {
    expect(SKID_TAIL).toBe(0.08)
    const { world, view } = setup()
    const age = () => (view as unknown as { skidAge: number | null }).skidAge
    // The simulation's reversal at full speed: from +215 px/s pressing left, the speed falls by about 30 px/s a
    // step through zero, then grows the other way.
    const speeds = [215, 185, 155, 125, 95, 65, 35, 5, -25, -55, -85, -115, -145, -175, -205, -215, -215, -215, -215]
    world.player.facing = -1
    const ages: (number | null)[] = []
    for (const vx of speeds) {
      world.player.vx = vx
      view.update(1 / 60)
      ages.push(age())
    }
    expect(ages[0]).toBe(0)
    // Braking while |vx| > SKID_SPEED (the first four steps), then a tail of 0.08 s.
    const braking = speeds.filter((v) => v > SKID_SPEED).length
    for (let i = 1; i < braking; i++) expect(ages[i]).toBeCloseTo(i / 60)
    const tailSteps = Math.floor(SKID_TAIL * 60)
    for (let i = braking; i < braking + tailSteps; i++) expect(ages[i]).not.toBeNull()
    for (let i = braking + tailSteps + 1; i < ages.length; i++) expect(ages[i]).toBeNull()
    // A second skid right after the first: from frame 0 again.
    world.player.facing = -1
    world.player.vx = 215
    view.update(1 / 60)
    expect(age()).toBe(0)
  })
})

describe("the king's raged sheet", () => {
  const king = (extra = {}) => bossBody({ def: { kind: 'final', art: 'king' }, ...extra })
  it('phase 1 draws `king`; after the staged transformation `king:raged`, for every state; the knock-out stays plain', () => {
    const { world, view } = setup()
    world.boss = king()
    // He stands (his body has gained no ground for a while).
    for (let i = 0; i < 12; i++) view.update(1 / 60)
    view.drawBoss(ctx)
    expect(blits.at(-1)!.anim).toBe('king#idle')
    view.handle({ type: 'boss-phase', phase: 2, x: 0, y: 0 } as never)
    view.pose('boss', 'rage', 1.2)
    blits.length = 0
    view.drawBoss(ctx)
    expect(blits.at(-1)!.anim).toBe('king#rage')
    view.tickReal(1.3)
    for (const state of ['idle', 'windup', 'charge', 'recover', 'shoot', 'slam']) {
      blits.length = 0
      world.boss = king({ state, vy: -300, vx: 0 })
      view.drawBoss(ctx)
      const body = blits.filter((b) => b.anim.startsWith('king')).at(-1)!
      expect(body.anim.startsWith('king:raged#'), `${state}: ${body.anim}`).toBe(true)
    }
    world.boss = king({ dead: true })
    view.handle({ type: 'boss-down', x: 0, y: 0 } as never)
    world.boss = null
    blits.length = 0
    view.drawBoss(ctx)
    expect(blits.at(-1)!.anim).toBe('king#defeat')
  })

  it('without staging, the sim-time rage plays on the plain sheet, then the raged one', () => {
    const { world, view } = setup()
    world.boss = king()
    view.update(1 / 60)
    view.handle({ type: 'boss-phase', phase: 2, x: 0, y: 0 } as never)
    view.drawBoss(ctx)
    expect(blits.at(-1)!.anim).toBe('king#rage')
    view.update(specDuration(bossSpec('king').rage) + 0.01)
    blits.length = 0
    view.drawBoss(ctx)
    expect(blits.at(-1)!.anim).toBe('king:raged#idle')
  })
})

describe('defeat ghosts and sustain', () => {
  it('the boss defeat ghost lives for the whole clip, its sustained tail and the closing burst', () => {
    const spec = bossSpec('boarBoss')
    expect(spec.defeat.sustain).toBeGreaterThan(1)
    expect(clipLife(spec.defeat, 0.5)).toBeGreaterThanOrEqual(specDuration(spec.defeat) + 0.5)
  })

  it('a ghost is drawn with its age, so a sustained clip keeps animating until it ends', () => {
    const { world, view } = setup()
    world.boss = null
    view.handle({ type: 'boss-down' } as never)
    expect(bodyBlits()).toHaveLength(0)
    world.boss = bossBody({ dead: true })
    view.handle({ type: 'boss-down' } as never)
    view.update(1)
    view.drawBoss(ctx)
    const ghost = bodyBlits().find((b) => b.anim === 'boarBoss#defeat')
    expect(ghost?.t).toBeCloseTo(1)
    expect(ghost?.frame).toBeUndefined()
  })
})

// ------------------------------------------------------------------------------------------------- round 4 rules

describe('the hero: one action at a time, from its first frame, and never back', () => {
  const STEP = 1 / 60
  /** Steps the hero's view with the sim's timers run down as sim.ts does. */
  const rig = () => {
    const { world, view } = setup()
    const p = world.player as ReturnType<typeof player> & { biteTimer: number; invuln: number }
    view.update(STEP)
    const step = (extra: Partial<typeof p> = {}) => {
      Object.assign(p, extra)
      p.biteTimer = Math.max(0, p.biteTimer - STEP)
      p.invuln = Math.max(0, p.invuln - STEP)
      view.update(STEP)
      return view.selectHero()!
    }
    const bite = () => {
      p.biteTimer = BITE_TIME + STEP
      view.handle({ type: 'bite' } as never)
    }
    const hurt = () => {
      p.invuln = INVULN + STEP
      view.handle({ type: 'hurt' } as never)
    }
    return { p, view, step, bite, hurt }
  }
  const lungeEnds = frameStart(HERO_SPEC.bite, LUNGE_FRAMES)

  it('a bite at a run: the lunge, then the run, and the bite does not come back when he stops', () => {
    const { step, bite } = rig()
    step({ vx: 215 })
    bite()
    const names: string[] = []
    for (let t = 0; t < BITE_TIME; t += STEP) names.push(step({ vx: t < lungeEnds + 0.02 ? 215 : 0 }).name)
    expect(names[0]).toBe('bite')
    const gave = names.indexOf('run')
    expect(gave).toBeGreaterThan(0)
    expect(names.slice(gave).includes('bite')).toBe(false)
  })

  it('of a bite and a hurt, the one that began later shows, and the other does not come back', () => {
    // The hurt first, then a bite: the bite; when it is over the hurt does not return.
    {
      const { step, bite, hurt } = rig()
      hurt()
      expect(step().name).toBe('hurt')
      bite()
      const names: string[] = []
      for (let i = 0; i < 20; i++) names.push(step().name)
      expect(names[0]).toBe('bite')
      expect(names.includes('hurt')).toBe(false)
    }
    // A bite, then a hurt: the hurt; the bite does not come back.
    {
      const { step, bite, hurt } = rig()
      bite()
      expect(step().name).toBe('bite')
      hurt()
      const names: string[] = []
      for (let i = 0; i < 20; i++) names.push(step().name)
      expect(names[0]).toBe('hurt')
      expect(names.includes('bite')).toBe(false)
    }
    // On the same step: the hurt.
    {
      const { step, bite, hurt } = rig()
      bite()
      hurt()
      expect(step().name).toBe('hurt')
    }
  })

  it('a landing that gave way to a run does not come back when he stops', () => {
    const { step, view } = rig()
    view.handle({ type: 'land', speed: 800 } as never)
    expect(step().name).toBe('land')
    expect(step({ vx: 150 }).name).toBe('run')
    expect(step({ vx: 0 }).name).not.toBe('land')
  })
})

describe('the run cycle: dust on both contact frames, the footstep once a pass', () => {
  it('sounds the footstep on frame 0 only', () => {
    let steps = 0
    const { world } = setup()
    const view = new ActorsView(
      world as never,
      { rand: () => 0.5, spawn: () => {}, burst: () => {} } as never,
      () => steps++
    )
    world.player.vx = 215
    world.player.onGround = true
    // Up to 125 px: two passes of the 64 px stride.
    for (let i = 0; i < 35; i++) {
      view.update(1 / 60)
      view.drawHero(ctx)
    }
    expect(RUN_CONTACT_FRAMES).toEqual([0, 4])
    expect(steps).toBe(2)
  })

  it('wading on the floor of a pool he runs, with neither dust nor a footstep (the water has its own sound)', () => {
    let steps = 0
    const spawned: string[] = []
    const { world } = setup()
    const view = new ActorsView(
      world as never,
      { rand: () => 0.5, spawn: (name: string) => spawned.push(name), burst: () => {} } as never,
      () => steps++
    )
    Object.assign(world.player, { vx: 215, onGround: true, inWater: true })
    const shown = new Set<string>()
    for (let i = 0; i < 35; i++) {
      view.update(1 / 60)
      view.drawHero(ctx)
      shown.add(view.heroChoice.name)
    }
    expect([...shown]).toEqual(['run'])
    expect(spawned).toEqual([])
    expect(steps).toBe(0)
    // Back on land the same run raises both again.
    world.player.inWater = false
    for (let i = 0; i < 35; i++) {
      view.update(1 / 60)
      view.drawHero(ctx)
    }
    expect(spawned).toContain('dust')
    expect(steps).toBeGreaterThan(0)
  })
})

describe('a knocked-out enemy flies against the tiles and lies where it comes down', () => {
  const AT = 0.3
  /** A world of 64 px tiles from a list of solid cells. */
  const tiles = (solid: (tx: number, ty: number) => boolean) => ({ h: 20, solidAt: solid, tileAt: () => 0 })
  const ROW = 5
  const GROUND = ROW * TILE
  const pos = { x: 0, y: 0 }

  it('flat ground: a hop of ENEMY_KNOCK_HOP that lands at `at` exactly', () => {
    const f = knockFlight(
      tiles((_, ty) => ty >= ROW),
      300,
      GROUND,
      44,
      40,
      1,
      AT
    )
    expect(f.T).toBeCloseTo(AT, 6)
    expect(f.ground).toBe(GROUND)
    expect(flightAt(f, AT / 2, pos).y).toBeCloseTo(GROUND - ENEMY_KNOCK_HOP, 6)
    expect(flightAt(f, AT, pos).x).toBeCloseTo(300 + ENEMY_KNOCK_SPEED * AT)
    // It does not move after landing.
    expect(flightAt(f, AT + 1, pos).y).toBe(GROUND)
    expect(pos.x).toBeCloseTo(300 + ENEMY_KNOCK_SPEED * AT, 6)
  })

  it('a lower ceiling makes the hop lower', () => {
    const ceiling = (tx: number, ty: number) => ty >= ROW || ty === ROW - 2
    // A tall body whose head is 4 px under the ceiling.
    const f = knockFlight(tiles(ceiling), 300, GROUND, 44, 60, 1, AT)
    const top = Math.min(...Array.from({ length: 30 }, (_, i) => flightAt(f, (i * AT) / 30, pos).y))
    expect(GROUND - top).toBeLessThan(ENEMY_KNOCK_HOP)
    expect(f.T).toBeCloseTo(AT, 6)
  })

  it('past a ledge it falls on to the ground below, and never lies in the air', () => {
    // The floor ends at x = 320; the ground two rows lower goes on.
    const ledge = (tx: number, ty: number) => (ty >= ROW && tx < 5) || ty >= ROW + 2
    const f = knockFlight(tiles(ledge), 300, GROUND, 44, 40, 1, AT)
    expect(f.ground).toBe(GROUND + 2 * TILE)
    expect(f.T!).toBeGreaterThan(AT)
    expect(groundBelow(tiles(ledge), flightAt(f, f.T!, pos).x, f.ground!, 2)).toBe(f.ground)
  })

  it('a wall at its height stops its sideways travel', () => {
    const wall = (tx: number, ty: number) => ty >= ROW || (tx === 5 && ty === ROW - 1)
    const f = knockFlight(tiles(wall), 280, GROUND, 44, 40, 1, AT)
    expect(f.ground).toBe(GROUND)
    const x = flightAt(f, f.T!, pos).x
    expect(x + 22).toBeLessThanOrEqual(5 * TILE + 1)
    expect(x).toBeLessThan(280 + ENEMY_KNOCK_SPEED * AT - 5)
  })

  it('over a pit it never lands', () => {
    const f = knockFlight(
      tiles(() => false),
      300,
      GROUND,
      44,
      40,
      1,
      AT
    )
    expect(f.T).toBeNull()
    expect(flightAt(f, 1, pos).y).toBeGreaterThan(GROUND + 100)
  })

  it('knocked out in the air it falls from rest at ENEMY_KNOCK_GRAVITY', () => {
    const f = knockFlight(
      tiles((_, ty) => ty >= ROW),
      300,
      GROUND - 100,
      44,
      40,
      -1,
      AT
    )
    expect(ENEMY_KNOCK_GRAVITY).toBe(1300)
    expect(f.T).toBeCloseTo(Math.sqrt((2 * 100) / ENEMY_KNOCK_GRAVITY), 2)
    expect(flightAt(f, 0.1, pos).y).toBeCloseTo(GROUND - 100 + 0.5 * ENEMY_KNOCK_GRAVITY * 0.01)
  })

  it('the clip is stretched so its first lying frame begins on the step it touches down', () => {
    const { world, view } = grounded(null)
    ;(world as unknown as { solidAt: (tx: number, ty: number) => boolean }).solidAt = (_tx, ty) => ty >= ROW + 2
    world.player.x = 100
    ;(world as unknown as { enemies: unknown[] }).enemies = [
      { id: 4, kind: 'walker', x: 300, y: GROUND - 40, w: 44, h: 40, vx: 0, vy: 0, facing: 1, onGround: false }
    ]
    view.handle({ type: 'enemy-down', id: 4, kind: 'walker', x: 0, y: 0, dir: 1 } as never)
    ;(world as unknown as { enemies: unknown[] }).enemies = []
    const spec = ENEMY_SPEC.walker.defeat
    const ground = ENEMY_DEFEAT_GROUND_FRAME.walker
    const rows: { frame: number; feet: number }[] = []
    for (let i = 0; i < 60 && view.ghostStates().length; i++) {
      view.update(1 / 60)
      const g = view.ghostStates()[0]
      if (g) rows.push({ frame: frameAt(defeatAnim(), g.choice.t), feet: g.feet })
    }
    const landed = rows.findIndex((r) => r.feet === GROUND + 2 * TILE)
    expect(landed).toBeGreaterThan(0)
    for (const r of rows.slice(0, landed)) expect(r.frame).toBeLessThan(ground)
    expect(rows[landed].frame).toBe(ground)
    for (const r of rows.slice(landed)) expect(r.feet).toBe(GROUND + 2 * TILE)
    expect(spec.frames).toBeGreaterThan(ground)
  })

  it('a squirrel knocked out on the step it spat shows its release frame first, white-flashed', () => {
    const { world, view } = grounded(ROW)
    world.player.x = 100
    ;(world as unknown as { time: number }).time = 12.5
    const squirrel = { id: 9, kind: 'spitter', x: 300, y: GROUND - 42, w: 46, h: 42, vx: 0, vy: 0, facing: -1 }
    ;(world as unknown as { enemies: unknown[] }).enemies = [squirrel]
    view.update(1 / 60)
    view.handle({ type: 'spit', id: 9, x: 0, y: 0, dir: -1 } as never)
    view.handle({ type: 'enemy-down', id: 9, kind: 'spitter', x: 0, y: 0, dir: -1 } as never)
    ;(world as unknown as { enemies: unknown[] }).enemies = []
    view.update(1 / 60)
    const first = view.ghostStates()[0]
    expect(first.clip).toBe('shoot')
    expect(first.choice).toMatchObject({ name: 'shoot', frame: ENEMY_SPEC.spitter.shoot.hit })
    blits.length = 0
    view.drawEnemies(ctx)
    expect(blits.map((b) => b.anim)).toContain('spitter#shoot')
    const names: string[] = []
    for (let i = 0; i < 12; i++) {
      view.update(1 / 60)
      names.push(view.ghostStates()[0].clip)
    }
    const defeat = names.indexOf('defeat')
    expect(defeat).toBeGreaterThan(0)
    expect(names.slice(defeat).every((n) => n === 'defeat')).toBe(true)
    // Not on another step: a spit earlier than the knock-out plays the knock-out as usual.
    const later = grounded(ROW)
    ;(later.world as unknown as { time: number }).time = 1
    ;(later.world as unknown as { enemies: unknown[] }).enemies = [{ ...squirrel }]
    later.view.update(1 / 60)
    later.view.handle({ type: 'spit', id: 9, x: 0, y: 0, dir: -1 } as never)
    ;(later.world as unknown as { time: number }).time = 1.5
    later.view.handle({ type: 'enemy-down', id: 9, kind: 'spitter', x: 0, y: 0, dir: -1 } as never)
    later.view.update(1 / 60)
    expect(later.view.ghostStates()[0].clip).toBe('defeat')
  })
})

const defeatAnim = () =>
  ({
    frames: Array.from({ length: ENEMY_SPEC.walker.defeat.frames }, () => ({})),
    fps: ENEMY_SPEC.walker.defeat.fps,
    loop: false
  }) as unknown as Anim

describe('the boss: a flinch or a cast starts only where it plays out', () => {
  const hit = (view: ActorsView) => view.handle({ type: 'boss-hit', x: 0, y: 0, ratio: 0.5, weak: false } as never)
  const shown = (view: ActorsView, world: ReturnType<typeof setup>['world']) =>
    view.selectBoss(world.boss as never).name

  it('a hit with FIT_MIN or more before his next move starts a flinch; a later one is the flash only, for good', () => {
    const { world, view } = setup()
    world.boss = bossBody({ state: 'idle', stateTime: 0.1 })
    view.update(1 / 60)
    hit(view)
    expect(shown(view, world)).toBe('hurt')
    const late = setup()
    late.world.boss = bossBody({ state: 'idle', stateTime: 0.65 })
    late.view.update(1 / 60)
    hit(late.view)
    expect(shown(late.view, late.world)).toBe('idle')
    // Nothing of it shows afterwards, though the hit was a moment ago.
    late.world.boss.state = 'recover'
    late.world.boss.stateTime = 0
    late.view.update(1 / 60)
    expect(shown(late.view, late.world)).toBe('recover')
  })

  it('a new hit restarts the flinch from its first frame', () => {
    const { world, view } = setup()
    world.boss = bossBody({ state: 'recover', stateTime: 0.1 })
    view.update(1 / 60)
    hit(view)
    view.update(0.1)
    expect(view.selectBoss(world.boss as never).t).toBeCloseTo(0.1)
    hit(view)
    expect(view.selectBoss(world.boss as never)).toMatchObject({ name: 'hurt', t: 0 })
  })

  const fox = (extra = {}) =>
    bossBody({
      state: 'idle',
      stateTime: 0.1,
      shotTimer: 1,
      def: { kind: 'swarm', art: 'foxBoss', speed: 175 },
      ...extra
    })

  /** Runs the fox's shot timer down step by step (as sim.ts), returns the clip and the frame of each step. */
  const castRun = (
    view: ActorsView,
    world: ReturnType<typeof setup>['world'],
    steps: number,
    onStep?: (i: number) => void
  ) => {
    const out: string[] = []
    const b = world.boss as ReturnType<typeof fox> & { shotTimer: number; stateTime: number }
    for (let i = 0; i < steps; i++) {
      b.stateTime += 1 / 60
      b.shotTimer -= 1 / 60
      if (b.shotTimer <= 0) {
        b.shotTimer = 2.1
        // (The event's x is his centre, as sim.ts sends it.)
        view.handle({ type: 'boss-shoot', x: b.x + b.w / 2, y: 0, count: 1 } as never)
      }
      onStep?.(i)
      view.update(1 / 60)
      const c = view.selectBoss(world.boss as never)
      out.push(c.name === 'shoot' ? `shoot${frameAt(shootAnim(), c.t)}` : c.name)
    }
    return out.filter((f, i, all) => i === 0 || f !== all[i - 1])
  }

  it('a cast: its lead-in from the first frame, the release on the shot, the follow-through', () => {
    const { world, view } = setup()
    world.boss = fox({ shotTimer: 0.5 })
    // He stands.
    for (let i = 0; i < 12; i++) view.update(1 / 60)
    expect(castRun(view, world, 50)).toEqual([
      'idle',
      'shoot0',
      'shoot1',
      'shoot2',
      'shoot3',
      'shoot4',
      'shoot5',
      'idle'
    ])
  })

  it('a flinch that starts during the cast ends it, and nothing of the cast comes back', () => {
    const { world, view } = setup()
    world.boss = fox({ shotTimer: 0.5, state: 'recover', stateTime: 0 })
    for (let i = 0; i < 12; i++) view.update(1 / 60)
    const seq = castRun(view, world, 50, (i) => i === 22 && hit(view))
    expect(seq.slice(0, 2)).toEqual(['recover', 'shoot0'])
    const hurt = seq.indexOf('hurt')
    expect(hurt).toBeGreaterThan(1)
    expect(seq.slice(hurt).some((f) => f.startsWith('shoot'))).toBe(false)
  })

  it('the staged transformation ends a flinch, a cast and a volley it cuts: none of them shows after it', () => {
    const { world, view } = setup()
    world.boss = bossBody({ state: 'recover', stateTime: 0.1, def: { kind: 'final', art: 'king', speed: 195 } })
    view.update(1 / 60)
    hit(view)
    expect(shown(view, world)).toBe('hurt')
    view.pose('boss', 'rage', 1)
    view.tickReal(1.1)
    expect(shown(view, world)).toBe('recover')
    // The volley's follow-through: cut by the transformation, it does not come back.
    world.boss = bossBody({ state: 'shoot', stateTime: 0.4, def: { kind: 'final', art: 'king', speed: 195 } })
    view.update(1 / 60)
    world.boss = bossBody({ state: 'recover', stateTime: 0.01, def: { kind: 'final', art: 'king', speed: 195 } })
    view.update(1 / 60)
    expect(view.selectBoss(world.boss as never).name).toBe('shoot')
    view.pose('boss', 'rage', 1)
    view.tickReal(1.1)
    expect(view.selectBoss(world.boss as never).name).toBe('recover')
  })
})

const shootAnim = () =>
  ({
    frames: Array.from({ length: 6 }, () => ({})),
    fps: bossSpec('foxBoss').shoot.fps,
    loop: false
  }) as unknown as Anim

describe("the boss's facing", () => {
  it('the wind-up faces the hero; a charge faces the way he goes, and stays so while he slows', () => {
    const { world, view } = setup()
    world.player.x = 0
    world.boss = bossBody({ state: 'windup', x: 300 })
    view.update(1 / 60)
    view.update(1 / 60)
    expect(view.bossFlip(world.boss as never)).toBe(true)
    // The hero crosses during the wind-up: the wind-up turns with him (it has settled).
    world.player.x = 600
    for (let i = 0; i < 12; i++) view.update(1 / 60)
    expect(view.bossFlip(world.boss as never)).toBe(false)
    // He charges left (away from where the hero now is): the charge faces left.
    world.boss = bossBody({ state: 'charge', x: 300, vx: -400 })
    view.update(1 / 60)
    expect(view.bossFlip(world.boss as never)).toBe(true)
    world.boss = bossBody({ state: 'recover', x: 260, vx: -30 })
    view.update(1 / 60)
    expect(view.bossFlip(world.boss as never)).toBe(true)
  })

  it('his shot never turns him: its light showed where it goes', () => {
    const { world, view } = setup()
    world.player.x = 0
    world.boss = bossBody({ state: 'idle', x: 300, def: { kind: 'swarm', art: 'foxBoss', speed: 175 } })
    view.update(1 / 60)
    view.update(1 / 60)
    expect(view.bossFlip(world.boss as never)).toBe(true)
    // The hero just over to his right (within the dead zone of his facing): the shot goes right, he stays as he is.
    world.player.x = 305
    for (let i = 0; i < 20; i++) view.tickReal(1 / 60)
    view.handle({ type: 'boss-shoot', x: 340, y: 0, count: 1 } as never)
    view.update(1 / 60)
    expect(view.bossFlip(world.boss as never)).toBe(true)
  })

  it('setting off to walk after another state, he faces the way he is walked from his first step', () => {
    const { world, view } = setup()
    world.player.x = 600
    // His dash went left; then he walks right at the hero.
    const b = bossBody({ state: 'charge', x: 300, vx: -400, def: { kind: 'swarm', art: 'foxBoss', speed: 175 } })
    world.boss = b
    for (let i = 0; i < 20; i++) {
      b.x += b.vx / 60
      view.simStep()
      view.update(1 / 60)
      view.tickReal(1 / 60)
    }
    expect(view.bossFlip(b as never)).toBe(true)
    const w = bossBody({ state: 'idle', x: b.x, vx: 175, def: { kind: 'swarm', art: 'foxBoss', speed: 175 } })
    world.boss = w
    w.x += 175 / 60
    view.simStep()
    view.update(1 / 60)
    expect(view.bossFlip(w as never)).toBe(false)
  })

  it('kicks up dust while he skids out a dash on the ground (not under reduced motion)', () => {
    for (const reduced of [false, true]) {
      const { world, view } = setup(reduced)
      const spawned: string[] = []
      ;(view as unknown as { fx: { spawn: (name: string) => void } }).fx.spawn = (name) => spawned.push(name)
      world.boss = bossBody({ state: 'charge', vx: 400, onGround: true })
      view.update(1 / 60)
      world.boss = bossBody({ state: 'recover', vx: 300, onGround: true })
      for (let i = 0; i < 12; i++) view.update(1 / 60)
      const dust = spawned.filter((n) => n === 'dust').length
      if (reduced) expect(dust).toBe(0)
      else {
        expect(dust).toBeGreaterThanOrEqual(2)
        expect(dust).toBeLessThanOrEqual(Math.ceil(12 / 60 / SKID_DUST_EVERY))
      }
    }
  })
})

describe(`a flinch and a cast are fitted to the time there is (at least FIT_MIN, ${FIT_MIN} s)`, () => {
  const STEP = 1 / 60
  const hurt = bossSpec('boarBoss').hurt
  const hurtAnim = () =>
    ({ frames: Array.from({ length: hurt.frames }, () => ({})), fps: hurt.fps, loop: false }) as unknown as Anim

  /** A boar hit in `idle` with `room` seconds before his wind-up: the clip and frame of each step until then. */
  const flinch = (room: number) => {
    const { world, view } = setup()
    world.boss = bossBody({ state: 'idle', stateTime: BRUTE_IDLE_SECONDS - room })
    view.update(STEP)
    view.handle({ type: 'boss-hit', x: 0, y: 0, ratio: 0.5, weak: false } as never)
    const rows: string[] = []
    for (let t = 0; t < room - 1e-9; t += STEP) {
      const c = view.selectBoss(world.boss as never)
      rows.push(c.name === 'hurt' ? `hurt${frameAt(hurtAnim(), c.t)}` : c.name)
      view.update(STEP)
    }
    return rows
  }

  for (const room of [0.3, 0.2, FIT_MIN])
    it(`a flinch with ${room} s: every frame from the first, each for a step at least, over before he winds up`, () => {
      const rows = flinch(room)
      expect(rows[0]).toBe('hurt0')
      const shown = rows.filter((r) => r.startsWith('hurt'))
      expect([...new Set(shown)]).toEqual(['hurt0', 'hurt1', 'hurt2'])
      // Not after the time it was given, and never back once over.
      const over = rows.findIndex((r) => !r.startsWith('hurt'))
      if (over >= 0) expect(rows.slice(over).some((r) => r.startsWith('hurt'))).toBe(false)
      expect(shown.length * STEP).toBeLessThanOrEqual(Math.min(room, specDuration(hurt)) + STEP)
    })

  it('a flinch with less than FIT_MIN is not shown', () => {
    expect(flinch(FIT_MIN - 0.01).some((r) => r.startsWith('hurt'))).toBe(false)
  })

  /**
   * The fox's cast with `lead` seconds before the shot when its pose may begin and `after` seconds from the shot to
   * his wind-up: the clip and frame of each step until the wind-up, and the step of the shot.
   */
  const cast = (lead: number, after: number) => {
    const { world, view } = setup()
    const b = bossBody({
      state: 'idle',
      stateTime: SWARM_IDLE_SECONDS - lead - after - STEP,
      shotTimer: lead + STEP,
      def: { kind: 'swarm', art: 'foxBoss', speed: 175 }
    }) as ReturnType<typeof bossBody> & { shotTimer: number; stateTime: number }
    world.boss = b
    for (let i = 0; i < 12; i++) view.update(STEP)
    const rows: string[] = []
    let shotAt = -1
    while (b.stateTime < SWARM_IDLE_SECONDS - 1e-9) {
      b.stateTime += STEP
      b.shotTimer -= STEP
      if (b.shotTimer <= 1e-9) {
        b.shotTimer = 2.1
        shotAt = rows.length
        view.handle({ type: 'boss-shoot', x: b.x + b.w / 2, y: 0, count: 1 } as never)
      }
      view.update(STEP)
      const c = view.selectBoss(world.boss as never)
      rows.push(c.name === 'shoot' ? `shoot${frameAt(shootAnim(), c.t)}` : c.name)
    }
    return { rows, shotAt }
  }

  for (const [lead, after] of [
    [0.25, 0.3],
    [0.2, 0.2],
    [FIT_MIN, FIT_MIN]
  ])
    it(`a cast with ${lead} s before the shot and ${after} s after it: every frame, the release on the shot`, () => {
      const { rows, shotAt } = cast(lead, after)
      expect(shotAt).toBeGreaterThan(0)
      const first = rows.findIndex((r) => r.startsWith('shoot'))
      expect(rows[first]).toBe('shoot0')
      expect(rows[shotAt]).toBe('shoot3')
      expect(rows.slice(first, shotAt).every((r) => r < 'shoot3')).toBe(true)
      const shown = rows.filter((r) => r.startsWith('shoot'))
      expect([...new Set(shown)].sort()).toEqual(['shoot0', 'shoot1', 'shoot2', 'shoot3', 'shoot4', 'shoot5'])
      for (let i = 1; i < shown.length; i++) expect(shown[i] >= shown[i - 1]).toBe(true)
      // Over before his wind-up (the last row is the step he winds up on).
      expect(rows.at(-1)!.startsWith('shoot')).toBe(false)
    })

  it('a cast with less than FIT_MIN before the shot, or after it, is not shown', () => {
    expect(cast(FIT_MIN - 0.02, 0.3).rows.some((r) => r.startsWith('shoot'))).toBe(false)
    expect(cast(0.25, FIT_MIN - 0.02).rows.some((r) => r.startsWith('shoot'))).toBe(false)
  })
})

describe('C: an action keeps the facing it began with', () => {
  const hit = (view: ActorsView) => view.handle({ type: 'boss-hit', x: 0, y: 0, ratio: 0.5, weak: false } as never)
  const fox = (extra = {}) =>
    bossBody({
      state: 'idle',
      x: 300,
      stateTime: 0.1,
      shotTimer: 1,
      def: { kind: 'swarm', art: 'foxBoss', speed: 175 },
      ...extra
    })

  it('a flinch does not turn round when the hero crosses during it', () => {
    const { world, view } = setup()
    world.player.x = 500
    world.boss = bossBody({ state: 'idle', x: 300, stateTime: 0.1 })
    for (let i = 0; i < 12; i++) frame(view)
    world.boss.stateTime = 0.1
    expect(view.bossFlip(world.boss as never)).toBe(false)
    hit(view)
    world.player.x = 100
    const flips: boolean[] = []
    while (view.selectBoss(world.boss as never).name === 'hurt') {
      frame(view)
      if (view.selectBoss(world.boss as never).name === 'hurt') flips.push(view.bossFlip(world.boss as never))
    }
    // (Longer than FACE_HOLD: without the rule he would have turned within it.)
    expect(flips.length).toBeGreaterThan(FACE_HOLD * 60 + 1)
    expect(flips.every((f) => !f)).toBe(true)
    // Once it is over he turns to the hero.
    for (let i = 0; i < 12; i++) frame(view)
    expect(view.bossFlip(world.boss as never)).toBe(true)
  })

  /** Runs the fox's shot timer down step by step (as sim.ts); the clip name and drawn facing of each step. */
  const castRun = (
    view: ActorsView,
    world: ReturnType<typeof setup>['world'],
    steps: number,
    at?: (i: number) => void
  ) => {
    const out: { name: string; left: boolean }[] = []
    const b = world.boss as ReturnType<typeof fox> & { shotTimer: number; stateTime: number }
    for (let i = 0; i < steps; i++) {
      b.stateTime += 1 / 60
      b.shotTimer -= 1 / 60
      at?.(i)
      if (b.shotTimer <= 0) {
        b.shotTimer = 2.1
        view.handle({ type: 'boss-shoot', x: b.x + b.w / 2, y: 0, count: 1 } as never)
      }
      frame(view)
      out.push({ name: view.selectBoss(world.boss as never).name, left: view.bossFlip(world.boss as never) })
    }
    return out
  }

  it('a cast keeps its facing through the lead-in, and at the release turns to the side the shot goes', () => {
    const { world, view } = setup()
    world.player.x = 500
    world.boss = fox({ shotTimer: 0.5 })
    for (let i = 0; i < 12; i++) frame(view)
    // The hero crosses to his left once the lead-in has begun; the shot goes left.
    let crossed = false
    const run = castRun(view, world, 40, () => {
      if (!crossed && view.selectBoss(world.boss as never).name === 'shoot') {
        world.player.x = 100
        crossed = true
      }
    })
    const first = run.findIndex((r) => r.name === 'shoot')
    const release = run.findIndex((r, i) => i > first && r.left)
    expect(first).toBeGreaterThanOrEqual(0)
    // Facing right (where he aimed when it began) until the release, then left, through the follow-through.
    expect(run.slice(first, release).every((r) => r.name === 'shoot' && !r.left)).toBe(true)
    const rest = run.slice(release)
    expect(rest.filter((r) => r.name === 'shoot').every((r) => r.left)).toBe(true)
  })

  it('a cast begins facing exactly where sim.ts aims, and is not posed with the hero on top of him', () => {
    // The hero clearly on his right, though he faced left: the lead-in begins facing right. (He stands in his
    // recovery: walking at the hero he would cross him before the shot, and then it is not begun: see below.)
    const a = setup()
    a.world.player.x = 0
    a.world.boss = fox({ shotTimer: 0.5, state: 'recover', stateTime: 0 })
    for (let i = 0; i < 12; i++) frame(a.view)
    expect(a.view.bossFlip(a.world.boss as never)).toBe(true)
    // Clear of his own step (175 px/s: 2.9 px) and the margin: posed, though within the facing's 12 px dead zone.
    const zone = aimClear(175)
    expect(zone).toBeLessThan(FACE_DEAD_ZONE)
    a.world.player.x = 300 + zone + 1
    const run = castRun(a.view, a.world, 40)
    const first = run.find((r) => r.name === 'shoot')!
    expect(first.left).toBe(false)
    // Within a step of his own travel (where sim.ts's aim flips as he overshoots) the shot leaves without a pose.
    const b = setup()
    b.world.player.x = 300 + zone - 1
    b.world.boss = fox({ shotTimer: 0.5, state: 'recover', stateTime: 0 })
    for (let i = 0; i < 12; i++) frame(b.view)
    const unposed = castRun(b.view, b.world, 30)
    expect(unposed.some((r) => r.name === 'shoot')).toBe(false)
    // Walking at the hero 20 px ahead of him (175 px/s), he would be past him when the shot leaves: no pose.
    const c = setup()
    c.world.player.x = 320
    c.world.boss = fox({ shotTimer: 0.5 })
    for (let i = 0; i < 12; i++) frame(c.view)
    expect(castRun(c.view, c.world, 30).some((r) => r.name === 'shoot')).toBe(false)
  })

  it('a shot that leaves the other way during a flinch neither ends it nor turns it (his light told the side)', () => {
    const { world, view } = setup()
    world.player.x = 500
    world.boss = bossBody({ state: 'recover', x: 300, stateTime: 0, def: { kind: 'flyer', art: 'crowBoss' } })
    for (let i = 0; i < 12; i++) frame(view)
    world.player.x = 100
    for (let i = 0; i < 12; i++) frame(view)
    const before = view.bossFlip(world.boss as never)
    hit(view)
    frame(view)
    expect(view.selectBoss(world.boss as never).name).toBe('hurt')
    // The shot goes the other way from the one he faces.
    world.player.x = before ? 600 : 0
    view.handle({ type: 'boss-shoot', x: 340, y: 0, count: 1 } as never)
    frame(view)
    expect(view.selectBoss(world.boss as never).name).toBe('hurt')
    expect(view.bossFlip(world.boss as never)).toBe(before)
  })

  it("a rat's hurt faces the blow, against the way it is thrown, and keeps that facing", () => {
    const { world, view } = setup()
    const rat = {
      id: 1,
      kind: 'walker',
      x: 0,
      y: 0,
      w: 44,
      h: 38,
      vx: 74,
      vy: 0,
      facing: 1,
      onGround: true,
      hitFlash: 0
    }
    ;(world as unknown as { enemies: unknown[] }).enemies = [rat]
    world.player.x = 1000
    for (let i = 0; i < 12; i++) {
      rat.x += 1.25
      frame(view)
    }
    expect(view.enemyFlip(rat as never)).toBe(false)
    rat.hitFlash = 0.2
    view.handle({ type: 'enemy-hit', id: 1, kind: 'walker', x: 0, y: 0, dir: -1 } as never)
    while (rat.hitFlash > 0) {
      // Thrown back to the left (sim.ts knocks it away from the hero's bite): it faces right, into the blow.
      rat.x -= 3
      rat.vx = -180
      rat.facing = -1
      world.player.x = -500
      frame(view)
      rat.hitFlash = Math.max(0, rat.hitFlash - 1 / 60)
      if (view.selectEnemy(rat as never).name === 'hurt') expect(view.enemyFlip(rat as never)).toBe(false)
    }
  })

  it("a squirrel's throw begins facing where sim.ts aims (its `facing`), though the hero is within the dead zone", () => {
    const { world, view } = setup()
    const enemy = {
      id: 2,
      kind: 'spitter',
      x: 300,
      y: 0,
      w: 44,
      h: 40,
      vx: 0,
      vy: 0,
      facing: 1,
      onGround: true,
      shootTimer: 2
    }
    ;(world as unknown as { enemies: unknown[] }).enemies = [enemy]
    world.player.x = 400
    frame(view)
    frame(view)
    expect(view.enemyFlip(enemy as never)).toBe(false)
    // The hero steps just over to its left (inside the dead zone): sim.ts aims left.
    world.player.x = 300 - 4
    enemy.facing = -1
    enemy.shootTimer = 0.1
    frame(view)
    expect(view.selectEnemy(enemy as never).name).toBe('shoot')
    expect(view.enemyFlip(enemy as never)).toBe(true)
  })
})

describe("the hero's hurt faces the blow", () => {
  it('thrown back: drawn facing where the blow came from, whichever way he faced; then his own facing again', () => {
    for (const dir of [1, -1] as const) {
      const { world, view } = setup()
      world.player.facing = dir
      frame(view)
      // Knocked the way he faces (the blow from behind): his hurt turns to face it.
      world.player.invuln = INVULN
      view.handle({ type: 'hurt', x: 0, y: 0, dir, hp: 2, cause: 'enemy' } as never)
      frame(view)
      expect(view.selectHero()!.name).toBe('hurt')
      expect(view.heroFlip()).toBe(dir > 0)
      blits.length = 0
      view.drawHero(ctx)
      expect(blits.find((b) => b.anim === 'hero#hurt')!.flip).toBe(dir > 0)
      // Once the hurt is over, his own facing again (not straight after the turn the hurt made).
      world.player.invuln = INVULN - 0.5
      frame(view)
      expect(view.selectHero()!.name).not.toBe('hurt')
      for (let t = 0; t < FACE_HOLD + 0.02; t += 1 / 60) frame(view)
      expect(view.heroFlip()).toBe(dir < 0)
    }
  })
})

describe('before the first step of a stage', () => {
  it('the boss starts out facing the hero, whatever the simulation has in `facing` (a stage that opens on him)', () => {
    for (const side of [1, -1] as const) {
      const { world, view } = setup()
      const boss = world.boss!
      // The simulation leaves a waiting boss facing left; the hero may stand on either side of him.
      boss.facing = -1
      world.player.x = boss.x + side * 130
      // A staged opening holds the simulation: the view is updated with no time passing.
      view.update(0)
      view.tickReal(1 / 60)
      expect(view.bossFlip(boss as never)).toBe(side < 0)
    }
  })

  it('a hero resting on the ground is drawn standing although no step has called him grounded yet', () => {
    const { world, view } = grounded(4)
    // His feet are on the ground row (4 tiles down), he does not move, and `onGround` is still false.
    Object.assign(world.player, { y: 4 * 64 - 40, vy: 0, onGround: false })
    view.update(0)
    view.tickReal(1 / 60)
    expect(view.selectHero()!.name).toBe('idle')
    // In the air he is in the air: a hair above the ground while falling fast, or well above it.
    Object.assign(world.player, { vy: 300 })
    expect(view.selectHero()!.name).toBe('fall')
    Object.assign(world.player, { y: 4 * 64 - 40 - 20, vy: 0 })
    expect(['apex', 'jump', 'fall']).toContain(view.selectHero()!.name)
  })
})

describe('a rat or a mole in the air is drawn in the air', () => {
  const GROUND = 5 * TILE
  /** A world with flat ground on row 5 and one enemy of `kind` whose feet are `above` px over it. */
  const minion = (kind: 'walker' | 'tough', above: number) => {
    const rig = grounded(5)
    const body = {
      id: 1,
      kind,
      x: 300,
      y: GROUND - 40 - above,
      w: 44,
      h: 40,
      vx: 0,
      vy: 0,
      facing: 1 as const,
      onGround: false,
      hitFlash: 0,
      shootTimer: 0,
      dead: false
    }
    ;(rig.world as unknown as { enemies: unknown[] }).enemies = [body]
    const shown = () => rig.view.selectEnemy(body as never)
    return { ...rig, body, shown }
  }

  for (const kind of ['walker', 'tough'] as const) {
    it(`${kind}: summoned 160 px up, its fall shows from the first frame, by vertical speed; on landing it walks`, () => {
      const { view, body, shown } = minion(kind, 160)
      frame(view)
      expect(shown()).toMatchObject({ name: 'air', frame: 1 })
      // Falling (sim.ts gravity) until it lands.
      while (body.y + body.h < GROUND) {
        body.vy = Math.min(900, body.vy + 1600 / 60)
        body.y = Math.min(GROUND - body.h, body.y + body.vy / 60)
        frame(view)
        if (body.y + body.h < GROUND) {
          expect(shown().name).toBe('air')
          expect(shown().frame).toBe(body.vy > WALKER_APEX_SPEED ? 2 : 1)
        }
      }
      // Within a few px of the ground but still falling, it keeps its fall to the landing.
      body.onGround = false
      expect(shown().name).toBe('air')
      body.onGround = true
      body.vy = 0
      body.vx = 74
      frame(view)
      expect(shown().name).toBe('move')
    })

    it(`${kind}: summoned at ground level (off the ground for its first step) it never flashes an air frame`, () => {
      const { view, body, shown } = minion(kind, 0)
      frame(view)
      expect(shown().name).not.toBe('air')
      body.onGround = true
      frame(view)
      expect(shown().name).not.toBe('air')
    })
  }

  /** A rat in the air moved by `dx` px a step for `steps` steps (falling): its drawn facing (true: left) each step. */
  const fall = (view: ActorsView, body: { x: number; y: number; vx: number; vy: number }, dxs: number[], up = false) =>
    dxs.map((dx) => {
      body.x += dx
      body.vx = dx * 60
      // (Held up in the air by hand, or falling.)
      if (!up) {
        body.vy += 1600 / 60
        body.y += body.vy / 60
      }
      frame(view)
      return view.enemyFlip(body as never)
    })

  it('in the air it turns to the way its body goes within a few px (summoned facing one way, going the other)', () => {
    const { world, view, body } = minion('walker', 160)
    // Born facing the hero's side (left), it travels right at 100 px/s (1.7 px a step).
    world.player.x = 0
    ;(body as { facing: number }).facing = -1
    frame(view)
    expect(view.enemyFlip(body as never)).toBe(true)
    const flips = fall(view, body, Array(12).fill(100 / 60))
    const turned = flips.indexOf(false)
    expect(turned).toBeGreaterThan(0)
    // Within AIR_TURN_PX (4 px) of travel, and for good.
    expect((turned + 1) * (100 / 60)).toBeLessThanOrEqual(AIR_TURN_PX + 100 / 60)
    expect(flips.slice(turned).every((f) => !f)).toBe(true)
  })

  it('in the air a body the simulation shakes to and fro (over the hero, against a wall) keeps its facing', () => {
    const { view, body } = minion('tough', 160)
    frame(view)
    const before = view.enemyFlip(body as never)
    // The simulation flips its speed every step: 1.4 px one way, 1.4 px back.
    const flips = fall(
      view,
      body,
      Array.from({ length: 30 }, (_, i) => (i % 2 ? -1.4 : 1.4)),
      true
    )
    expect(flips.every((f) => f === before)).toBe(true)
    // At 30 Hz (two steps a frame) and in slow motion (a third of a step a frame) the same.
    for (const dxs of [Array(30).fill(0), Array.from({ length: 90 }, (_, i) => (i % 6 < 3 ? 0.47 : -0.47))])
      expect(fall(view, body, dxs, true).every((f) => f === before)).toBe(true)
  })

  it('bitten in the air: its hurt plays, then its fall if it is still up', () => {
    const { view, body, shown } = minion('walker', 120)
    frame(view)
    expect(shown().name).toBe('air')
    body.hitFlash = ENEMY_HURT_SECONDS
    view.handle({ type: 'enemy-hit', id: 1, kind: 'walker', x: 0, y: 0, dir: 1 } as never)
    expect(shown().name).toBe('hurt')
    body.hitFlash = 0
    body.vy = 200
    frame(view)
    expect(shown()).toMatchObject({ name: 'air', frame: 2 })
  })

  it('a rat shaken at the lip of a ledge (a pixel off it for a step) is not drawn in the air', () => {
    const { world, view, body, shown } = minion('walker', 0)
    // Ground only up to column 4 (its edge at x 320); the rat's box has just slipped past it.
    ;(world as unknown as { solidAt: (tx: number, ty: number) => boolean }).solidAt = (tx, ty) => ty >= 5 && tx <= 4
    body.x = 5 * TILE + 2
    body.y = GROUND - body.h + 0.4
    frame(view)
    expect(shown().name).not.toBe('air')
    // A real fall off it: clear of the ledge, it is in the air.
    body.x = 5 * TILE + 20
    body.y = GROUND - body.h + 6
    frame(view)
    expect(shown().name).toBe('air')
  })
})

describe('a summoned enemy shows once the simulation has settled where it is', () => {
  const shadowCtx = { fillRect() {}, globalAlpha: 1, fillStyle: '' } as unknown as CanvasRenderingContext2D
  const GROUND = 5 * TILE
  const STEP = 1 / 60
  const summon = (y: number) => {
    const rig = grounded(5)
    const spawned: { name: string; x: number; y: number }[] = []
    ;(rig.view as unknown as { fx: unknown }).fx = {
      rand: () => 0.5,
      spawn: (name: string, x: number, y: number) => spawned.push({ name, x, y }),
      burst: (name: string, x: number, y: number) => spawned.push({ name, x, y })
    }
    // The stage has been running.
    frame(rig.view)
    const body = {
      id: 9,
      kind: 'walker',
      x: 300,
      y,
      w: 44,
      h: 40,
      vx: 0,
      vy: 0,
      facing: 1 as const,
      onGround: false,
      hitFlash: 0,
      shootTimer: 0,
      dead: false,
      t: STEP
    }
    ;(rig.world as unknown as { enemies: unknown[] }).enemies = [body]
    const step = (dy = 0) => {
      body.t += STEP
      body.y += dy
      frame(rig.view)
    }
    const drawn = () => {
      blits.length = 0
      rig.view.drawEnemies(shadowCtx)
      return blits.some((b) => b.anim.startsWith('walker#'))
    }
    return { ...rig, body, spawned, step, drawn }
  }

  it('born inside a solid and pushed out on the next step: never drawn there, shown a step after the push', () => {
    // Born with its feet 64 px into the ground (inside the raised gate, say), pushed on to its top by the next step.
    const { view, body, spawned, step, drawn } = summon(GROUND + 64 - 40)
    frame(view)
    expect(view.enemyShown(body as never)).toBe(false)
    expect(drawn()).toBe(false)
    step(-64)
    expect(drawn()).toBe(false)
    expect(spawned).toEqual([])
    body.onGround = true
    step()
    expect(drawn()).toBe(true)
    // Its puff is where it shows, not in the solid.
    expect(spawned[0]).toEqual({ name: 'puff', x: 322, y: GROUND - 20 })
  })

  it('born in the open (in mid-air beside the crow): shown with its puff one step on', () => {
    const { view, body, spawned, step, drawn } = summon(GROUND - 200)
    frame(view)
    expect(drawn()).toBe(false)
    step(0.4)
    expect(drawn()).toBe(true)
    expect(spawned.map((s) => s.name)).toEqual(['puff', 'sparkle'])
    expect(spawned[0].y).toBeCloseTo(GROUND - 200 + 0.4 + 20)
  })

  it('born standing on the floor overlapping a solid it walks out of: shown on the first frame it is out of it', () => {
    // The raised gate's column is tile 5 (x 320–384); it is born with 16 px of its box inside it and walks left.
    const { world, view, body, spawned, step, drawn } = summon(GROUND - 40)
    const solid = world as unknown as { solidAt: (tx: number, ty: number) => boolean }
    solid.solidAt = (tx, ty) => ty >= 5 || tx === 5
    body.x = 320 - 44 + 16
    body.onGround = true
    body.vx = -100
    frame(view)
    const shown: boolean[] = []
    for (let n = 0; n < 14; n++) {
      body.x -= 100 / 60
      step()
      shown.push(drawn())
      // Never drawn while its box (but for a pixel at its edges) overlaps the solid.
      if (body.x + body.w - 2 >= 320) expect(shown.at(-1), `step ${n}`).toBe(false)
    }
    expect(shown.at(-1)).toBe(true)
    // Once shown it stays shown, with its puff where it shows.
    expect(shown.slice(shown.indexOf(true)).every(Boolean)).toBe(true)
    expect(spawned.filter((p) => p.name === 'puff')).toHaveLength(1)
  })

  it(`one that never comes out of the solid is shown after BIRTH_SOLID_SECONDS (${BIRTH_SOLID_SECONDS} s) all the same`, () => {
    const { world, view, body, step, drawn } = summon(GROUND - 40)
    const solid = world as unknown as { solidAt: (tx: number, ty: number) => boolean }
    solid.solidAt = (tx, ty) => ty >= 5 || tx === 5
    body.x = 320 - 44 + 16
    body.onGround = true
    frame(view)
    let n = 0
    while (!drawn() && n < 120) {
      step()
      n++
    }
    expect(n * STEP).toBeGreaterThan(BIRTH_SOLID_SECONDS - 2 * STEP)
    expect(n * STEP).toBeLessThan(BIRTH_SOLID_SECONDS + 2 * STEP)
  })

  it('on a 30 Hz display (two steps a frame) the same, and an enemy there from the start is shown at once', () => {
    const { view, body, step, drawn } = summon(GROUND + 64 - 40)
    frame(view)
    // The push and a step more in one frame: still the frame of the push.
    body.t += STEP
    step(-64)
    expect(drawn()).toBe(false)
    body.t += STEP
    step()
    expect(drawn()).toBe(true)
    // A stage's own enemy (seen on the view's first update).
    const rig = grounded(5)
    const rat = { ...body, id: 1, t: 0, y: GROUND - 40 }
    ;(rig.world as unknown as { enemies: unknown[] }).enemies = [rat]
    frame(rig.view)
    expect(rig.view.enemyShown(rat as never)).toBe(true)
  })
})

describe('round 5d: a staged pose that faced the other way, and a drop too short to show', () => {
  it('round 6l: a hero posed facing the other way (his cheer turned to her) keeps facing her until he really turns', () => {
    const { world, view } = setup()
    world.player.facing = -1
    const token = view.pose('hero', 'cheer', 1, { face: 1 })
    frame(view)
    expect(view.heroFlip()).toBe(false)
    view.unposeIf('hero', token)
    for (let i = 0; i < 10; i++) {
      view.simStep()
      frame(view)
      expect(view.selectHero()!.name).not.toBe('turn')
      expect(view.heroFlip()).toBe(false)
    }
    // He walks the way he faces in the game: he turns.
    ;(world.player as { vx: number }).vx = -100
    view.simStep()
    frame(view)
    expect(view.heroFlip()).toBe(true)
    // Posed facing his own way, he goes straight on.
    const own = view.pose('hero', 'cheer', 1, { face: -1 })
    frame(view)
    view.unposeIf('hero', own)
    view.update(1)
    expect(view.selectHero()!.name).not.toBe('turn')
  })

  it('a rat a few px above the ground, falling on to it within a frame or two, walks at once', () => {
    const rig = grounded(5)
    const rat = {
      id: 3,
      kind: 'walker',
      x: 300,
      y: 5 * TILE - 40 - 6,
      w: 44,
      h: 40,
      vx: 74,
      vy: 30,
      facing: 1,
      onGround: false,
      hitFlash: 0,
      shootTimer: 0,
      dead: false
    }
    ;(rig.world as unknown as { enemies: unknown[] }).enemies = [rat]
    frame(rig.view)
    expect(rig.view.selectEnemy(rat as never).name).toBe('move')
    expect(landsSoon(rig.world as never, rat, 30)).toBe(true)
    // Thrown upward it is a hop, whatever the ground under it.
    expect(landsSoon(rig.world as never, rat, -200)).toBe(false)
    // Higher up it is a fall.
    expect(landsSoon(rig.world as never, { ...rat, y: rat.y - 60 }, 30)).toBe(false)
    expect(AIR_SHORT_SECONDS).toBeLessThanOrEqual(6 / 60)
  })
})

describe('the gathering light before a shot of the crow, the fox and the bee', () => {
  const fox = (extra = {}) =>
    bossBody({
      x: 300,
      state: 'recover',
      stateTime: 0,
      shotTimer: 1,
      def: { kind: 'swarm', art: 'foxBoss', speed: 175, projectiles: 1 },
      ...extra
    }) as ReturnType<typeof bossBody> & { shotTimer: number; stateTime: number }

  it('shows for SHOT_CUE_SECONDS before the shot, growing to full on its last step, and is gone with the shot', () => {
    const { world, view } = setup()
    world.player.x = 600
    const b = fox()
    world.boss = b
    const seen: (number | null)[] = []
    for (let i = 0; i < 70; i++) {
      b.stateTime += 1 / 60
      b.shotTimer -= 1 / 60
      if (b.shotTimer <= 0) {
        b.shotTimer = 2.1
        view.handle({ type: 'boss-shoot', x: b.x + b.w / 2, y: 0, count: 1 } as never)
        seen.push(-1)
      }
      frame(view)
      seen.push(view.shotCue(b as never)?.progress ?? null)
    }
    const shot = seen.indexOf(-1)
    expect(shot).toBeGreaterThan(30)
    // The 27 steps before it lit, never going back, full on the last one; dark before them and after the shot.
    const lit = seen.slice(shot - 27, shot) as number[]
    expect(lit.every((p) => p !== null)).toBe(true)
    for (let i = 1; i < lit.length; i++) expect(lit[i]).toBeGreaterThanOrEqual(lit[i - 1])
    expect(lit.at(-1)).toBe(1)
    expect(seen[shot - 28]).toBeNull()
    expect(seen[shot + 1]).toBeNull()
    expect(SHOT_CUE_SECONDS).toBe(0.45)
  })

  it('gathers where the shot is born on his drawn body, whichever side the hero is on (it promises no side)', () => {
    const { world, view } = setup()
    const b = fox({ shotTimer: 0.2 })
    world.boss = b
    frame(view)
    const at = (heroX: number) => {
      world.player.x = heroX
      frame(view)
      return { ...view.shotCue(b as never)! }
    }
    // sim.ts: the shot's 14 px box has its left edge on his centre (340), its top 0.4 of his height down.
    expect(at(600)).toMatchObject({ x: 340 + SHOT_BIRTH_DX, sheet: 'prop:orb' })
    expect(at(600).y).toBeCloseTo(200 + 80 * 0.4 + 7)
    expect(at(0)).toEqual(at(600))
    expect(at(301)).toEqual(at(299))
    expect('side' in at(0)).toBe(false)
  })

  it('none for the king, before the fight, after it, or for a boss that throws nothing', () => {
    const { world, view } = setup()
    world.boss = bossBody({ shotTimer: 0.2, def: { kind: 'final', art: 'king', speed: 120, projectiles: 3 } })
    frame(view)
    expect(view.shotCue(world.boss as never)).toBeNull()
    for (const extra of [{ active: false }, { dead: true }]) {
      const b = fox({ shotTimer: 0.2, ...extra })
      world.boss = b
      expect(view.shotCue(b as never)).toBeNull()
    }
    world.boss = bossBody({ shotTimer: 0.2 })
    expect(view.shotCue(world.boss as never)).toBeNull()
  })

  it('round 6l: is drawn on its own (the stage draws it after the hero), by progress, never mirrored', () => {
    const { world, view } = setup()
    const b = fox({ shotTimer: 0.2 })
    world.boss = b
    for (const heroX of [0, 600, 0]) {
      world.player.x = heroX
      frame(view)
      blits.length = 0
      view.drawBoss({} as CanvasRenderingContext2D)
      // Not with the boss: in front of whoever stands on him.
      expect(blits.filter((x) => x.anim === 'prop:orb#gather')).toEqual([])
      view.drawShotCue({} as CanvasRenderingContext2D)
      const light = blits.filter((x) => x.anim === 'prop:orb#gather')
      expect(light).toHaveLength(1)
      expect(light[0].flip).toBe(false)
      expect(light[0].x).toBe(340 + SHOT_BIRTH_DX)
    }
  })
})

describe('a release frame shows from the step its shot leaves, never before, at 60 and 120 Hz', () => {
  const STEP = 1 / 60
  for (const hz of [60, 120])
    it(`the fox's cast and the squirrel's throw at ${hz} Hz`, () => {
      const per = hz / 60
      // The fox, standing in his recovery, the hero clearly on his right.
      const fox = setup()
      fox.world.player.x = 600
      const b = bossBody({
        x: 300,
        state: 'recover',
        stateTime: 0,
        shotTimer: 0.5,
        def: { kind: 'swarm', art: 'foxBoss', speed: 175, projectiles: 1 }
      }) as ReturnType<typeof bossBody> & { shotTimer: number; stateTime: number }
      fox.world.boss = b
      const rows: { frame: number; shot: boolean }[] = []
      for (let step = 0; step < 50; step++) {
        b.stateTime += STEP
        b.shotTimer -= STEP
        let shot = false
        if (b.shotTimer <= 0) {
          b.shotTimer = 2.1
          shot = true
          fox.view.handle({ type: 'boss-shoot', x: b.x + b.w / 2, y: 0, count: 1 } as never)
        }
        for (let k = 0; k < per; k++) {
          fox.view.update(STEP / per)
          const c = fox.view.selectBoss(b as never)
          rows.push({ frame: c.name === 'shoot' ? frameAt(shootAnim(), c.t) : -1, shot: shot && k === 0 })
        }
      }
      const release = rows.findIndex((r) => r.frame === 3)
      expect(release).toBeGreaterThan(0)
      expect(rows[release].shot).toBe(true)
      // The squirrel.
      const sq = setup()
      const enemy = { id: 2, kind: 'spitter', x: 300, y: 0, w: 44, h: 40, vx: 0, vy: 0, facing: 1, onGround: true }
      const timer = { shootTimer: 0.4 }
      ;(sq.world as unknown as { enemies: unknown[] }).enemies = [{ ...enemy, ...timer }]
      const e = (sq.world as unknown as { enemies: { shootTimer: number }[] }).enemies[0]
      sq.world.player.x = 600
      const spits: { frame: number; spit: boolean }[] = []
      for (let step = 0; step < 40; step++) {
        e.shootTimer -= STEP
        let spit = false
        // A timer that runs out to a hair above zero throws a step later.
        if (e.shootTimer <= 1e-9) {
          e.shootTimer = 2.4
          spit = true
          sq.view.handle({ type: 'spit', id: 2, x: 0, y: 0, dir: 1 } as never)
        }
        for (let k = 0; k < per; k++) {
          sq.view.update(STEP / per)
          const c = sq.view.selectEnemy(e as never)
          spits.push({ frame: c.name === 'shoot' ? (c.frame ?? frameAt(spitAnim(), c.t)) : -1, spit: spit && k === 0 })
        }
      }
      const thrown = spits.findIndex((r) => r.frame === ENEMY_SPEC.spitter.shoot.hit)
      expect(thrown).toBeGreaterThan(0)
      expect(spits[thrown].spit).toBe(true)
    })
})

describe('what a walker does is decided on the simulation steps: the same at every display rate', () => {
  const STEP = 1 / 60
  const RATES = [30, 48, 50, 60, 72, 75, 90, 100, 120, 144, 165, 240]
  /** A rat or a mole pacing a pocket `width` px wide (patrol), or chasing a hero who swings to and fro over it. */
  const motion = (kind: 'walker' | 'tough', width: number, chase: boolean, steps: number) => {
    const speed = kind === 'walker' ? (chase ? 100 : 74) : 62
    const xs: number[] = []
    const heroes: number[] = []
    let x = 500
    let dir = 1
    for (let n = 0; n < steps; n++) {
      const hero = 500 + width / 2 + Math.sin(n / 23) * (width / 2 + 30)
      if (chase) dir = hero > x ? 1 : -1
      x += (dir * speed) / 60
      if (!chase && x > 500 + width) {
        x = 500 + width
        dir = -1
      } else if (!chase && x < 500) {
        x = 500
        dir = 1
      }
      xs.push(x)
      heroes.push(hero)
    }
    return { xs, heroes }
  }
  /**
   * Replays the motion as `PlaySession` shows it at `hz` (the pacer's steps and alpha, the picture between the last
   * two steps), with a hit-stop or a stretch of slow motion when asked, and returns the decisions after every step.
   */
  const replay = (kind: 'walker' | 'tough', m: ReturnType<typeof motion>, hz: number, holds: boolean) => {
    const { world, view } = setup()
    world.boss = null
    const body = {
      id: 3,
      kind,
      x: m.xs[0] - 22,
      y: 300,
      w: 44,
      h: 40,
      vx: 0,
      vy: 0,
      facing: 1 as 1 | -1,
      onGround: true,
      hitFlash: 0,
      shootTimer: 0,
      dead: false,
      t: 0
    }
    ;(world as unknown as { enemies: unknown[] }).enemies = [body]
    frame(view)
    const timers = () =>
      (view as unknown as { enemyTimers: Map<number, { face: 1 | -1; tread: { standing: boolean } }> }).enemyTimers.get(
        3
      )!
    const out: string[] = []
    let n = 0
    let acc = 0
    let prev = m.xs[0]
    let k = 0
    while (n < m.xs.length - 1) {
      k++
      const real = 1 / hz
      // A hit-stop of 0.2 s at 1 s, slow motion (0.3) from 2 s to 2.5 s.
      const t = k / hz
      const scale = !holds ? 1 : t > 1 && t < 1.2 ? 0 : t > 2 && t < 2.5 ? 0.3 : 1
      acc += real * scale
      while (scale > 0 && acc > STEP * 1e-6 && n < m.xs.length - 1) {
        prev = m.xs[n]
        n++
        acc -= STEP
        body.vx = (m.xs[n] - prev) * 60
        body.facing = body.vx >= 0 ? 1 : -1
        body.x = m.xs[n] - 22
        world.player.x = m.heroes[n]
        view.simStep()
        out.push(`${timers().tread.standing ? 'S' : 'W'}${timers().face > 0 ? 'R' : 'L'}`)
      }
      const alpha = scale > 0 ? Math.min(1, Math.max(0, 1 + acc / STEP)) : 1
      body.x = prev + (m.xs[n] - prev) * alpha - 22
      view.update(real * scale)
      view.tickReal(real)
      body.x = m.xs[n] - 22
    }
    return out
  }
  for (const kind of ['walker', 'tough'] as const)
    for (const chase of [false, true])
      it(`${kind === 'walker' ? 'a rat' : 'a mole'} ${chase ? 'chasing' : 'pacing'} pockets of 6 to 40 px: identical decisions step for step at ${RATES.join(', ')} Hz, with and without hit-stops and slow motion`, () => {
        for (let width = 6; width <= 40; width += 2) {
          const m = motion(kind, width, chase, 300)
          const base = replay(kind, m, 60, false)
          // (The decisions are not all the same: it does turn and stand.)
          expect(new Set(base).size, `${width} px`).toBeGreaterThan(1)
          for (const hz of RATES)
            for (const holds of [false, true])
              expect(replay(kind, m, hz, holds), `${width} px at ${hz} Hz${holds ? ' with holds' : ''}`).toEqual(base)
        }
      })
})

describe('round 6c: once the stage is over or the hero is down, what the simulation holds stands still', () => {
  it("a dashing boss and a walking rat keep the frame they had; a knocked-out body's clip plays on", () => {
    const { world, view } = setup()
    const b = bossBody({ state: 'charge', x: 300, vx: 400, def: { kind: 'brute', art: 'boarBoss', speed: 150 } })
    world.boss = b
    const rat = {
      id: 5,
      kind: 'walker',
      x: 600,
      y: 300,
      w: 44,
      h: 40,
      vx: 74,
      vy: 0,
      facing: 1 as const,
      onGround: true,
      hitFlash: 0,
      shootTimer: 0,
      dead: false
    }
    ;(world as unknown as { enemies: unknown[] }).enemies = [rat]
    for (let i = 0; i < 10; i++) {
      b.x += 400 / 60
      rat.x += 74 / 60
      frame(view)
    }
    world.state = 'dead'
    const boss0 = view.selectBoss(b as never)
    const rat0 = view.selectEnemy(rat as never)
    for (let i = 0; i < 60; i++) frame(view)
    expect(view.selectBoss(b as never)).toEqual(boss0)
    expect(view.selectEnemy(rat as never)).toEqual(rat0)
  })
})

describe('round 6c: the transformation waits for him to be between his actions', () => {
  it('not in a wind-up, a charge, a leap, a gathering, nor while he slides out of one; his walk is between actions', () => {
    const { world, view } = setup()
    const king = (extra = {}) =>
      bossBody({ x: 300, onGround: true, def: { kind: 'final', art: 'king', speed: 120, projectiles: 3 }, ...extra })
    for (const state of ['windup', 'charge', 'slam', 'shoot'] as const) {
      world.boss = king({ state, stateTime: 0.2 })
      view.simStep()
      view.simStep()
      view.simStep()
      expect(view.bossBetweenActions(), state).toBe(false)
    }
    // Sliding out of his charge, then at rest for a few steps.
    world.boss = king({ state: 'recover', vx: 200 })
    view.simStep()
    expect(view.bossBetweenActions()).toBe(false)
    const b = king({ state: 'recover', vx: 10, stateTime: 0.6 })
    world.boss = b
    view.simStep()
    expect(view.bossBetweenActions()).toBe(false)
    view.simStep()
    view.simStep()
    expect(view.bossBetweenActions()).toBe(true)
    // Off the ground he is not.
    b.onGround = false
    expect(view.bossBetweenActions()).toBe(false)
    // A wind-up at rest (past its first moments) is still his attack.
    world.boss = king({ state: 'windup', vx: 0, stateTime: 0.2 })
    for (let i = 0; i < 3; i++) view.simStep()
    expect(view.bossBetweenActions()).toBe(false)
    // A charge that crashes into a wall on its first step: the steps of his slow wind-up do not count as rest.
    const stunned = king({ state: 'stunned', vx: 0 })
    world.boss = stunned
    view.simStep()
    expect(view.bossBetweenActions()).toBe(false)
    // His own walk is not an action: in `idle` he is between actions at any speed (he stops and roars).
    world.boss = king({ state: 'idle', vx: 244 })
    view.simStep()
    expect(view.bossBetweenActions()).toBe(true)
  })
})

describe('round 6d: a hit-stop lengthens the facing hold only by what it adds to the screen', () => {
  const STEP = 1 / 60
  const RATES = [30, 48, 50, 60, 72, 75, 90, 100, 120, 144, 165, 240]
  /**
   * A rat shaken on the spot under a hero who swings from side to side (it turns to him as often as its hold lets
   * it), with hit-stops that overlap now and then, played as `PlaySession` and `StageView` play it at \`hz\`: a step
   * that starts a hit-stop runs no further step in its frame, the hit-stop holds the frames that follow, and a
   * second one during it adds only what it lengthens it by. The real times at which its drawn facing turned.
   */
  const turns = (hz: number) => {
    const { world, view } = setup()
    world.boss = null
    const rat = {
      id: 7,
      kind: 'walker',
      x: 500,
      y: 300,
      w: 44,
      h: 40,
      vx: 0,
      vy: 0,
      facing: 1 as 1 | -1,
      onGround: true,
      hitFlash: 0,
      shootTimer: 0,
      dead: false
    }
    ;(world as unknown as { enemies: unknown[] }).enemies = [rat]
    let frozen = 0
    const freeze = (seconds: number) => {
      view.heldFor(Math.max(0, seconds - frozen))
      frozen = Math.max(frozen, seconds)
    }
    const out: number[] = []
    let acc = 0
    let n = 0
    let real = 0
    let last = view.enemyFlip(rat as never)
    for (let k = 0; k < hz * 8; k++) {
      const dt = 1 / hz
      real += dt
      const held = frozen > 0
      if (!held) {
        acc += dt
        while (acc > STEP * 1e-6 && frozen <= 0) {
          acc -= STEP
          n++
          rat.x = 500 + (n % 2) * 1.5
          world.player.x = 522 + (Math.floor(n / 4) % 2 ? -60 : 60)
          // A hit-stop every 23 steps, and another, longer, starting inside it now and then: begun by the step's
          // events, which the view answers before the step's decisions (`PlaySession.frame`).
          if (n % 23 === 0) freeze(0.1)
          if (n % 69 === 2) freeze(0.15)
          view.simStep()
        }
      } else acc = 0
      frozen = Math.max(0, frozen - dt)
      view.update(held ? 0 : dt)
      view.tickReal(dt)
      const flip = view.enemyFlip(rat as never)
      if (flip !== last) out.push(real)
      last = flip
    }
    return out
  }
  for (const hz of RATES)
    it(`at ${hz} Hz no two turns are closer on the screen than 0.15 s`, () => {
      const t = turns(hz)
      expect(t.length).toBeGreaterThan(10)
      for (let i = 1; i < t.length; i++) expect(t[i] - t[i - 1], `turn ${i}`).toBeGreaterThanOrEqual(0.15 - 1e-9)
    })
})

describe('round 6e: turns drawn with their step, a boss falling over the hero, two squirrel cases', () => {
  const STEP = 1 / 60
  const RATES = [30, 48, 50, 72, 75, 90, 100, 144, 165]

  for (const hz of RATES)
    it(`at ${hz} Hz a rat's drawn facing is the one decided on the last step the frame shows`, () => {
      const { world, view } = setup()
      world.boss = null
      const rat = { id: 4, kind: 'walker', x: 500, y: 300, w: 44, h: 40, vx: 0, vy: 0, facing: 1 as 1 | -1 }
      Object.assign(rat, { onGround: true, hitFlash: 0, shootTimer: 0, dead: false })
      ;(world as unknown as { enemies: unknown[] }).enemies = [rat]
      const timers = () => (view as unknown as { enemyTimers: Map<number, { face: number }> }).enemyTimers.get(4)!
      let acc = 0
      let n = 0
      let prev = rat.x
      for (let k = 0; k < hz * 4; k++) {
        acc += 1 / hz
        while (acc > STEP * 1e-6) {
          acc -= STEP
          n++
          // Pacing 18 px to and fro at 100 px/s: turns that its body really makes, often.
          prev = rat.x
          const leg = 11
          const p = n % (2 * leg)
          rat.x = 500 + (100 / 60) * (p < leg ? p : 2 * leg - p)
          view.simStep()
        }
        const alpha = Math.min(1, Math.max(0, 1 + acc / STEP))
        const at = rat.x
        rat.x = prev + (at - prev) * alpha
        view.update(1 / hz)
        view.tickReal(1 / hz)
        expect(view.enemyFlip(rat as never)).toBe(timers().face < 0)
        rat.x = at
      }
    })

  it('a king falling out of his walk over the hero, his speed flipped on every step, turns once in the fall at most', () => {
    const { world, view } = setup()
    const king = bossBody({
      x: 300,
      state: 'idle',
      onGround: false,
      vy: 100,
      def: { kind: 'final', art: 'king', speed: 195, projectiles: 3 }
    }) as ReturnType<typeof bossBody> & { vx: number; x: number; y: number }
    world.boss = king
    world.player.x = 300
    frame(view)
    for (let i = 0; i < 20; i++) frame(view)
    let turns = 0
    let last = view.bossFlip(king as never)
    for (let n = 0; n < 40; n++) {
      king.vx = n % 2 ? 195 : -195
      king.x += king.vx / 60 + (n % 3 === 0 ? 1 : 0)
      king.y += 2
      view.simStep()
      frame(view)
      const flip = view.bossFlip(king as never)
      if (flip !== last) turns++
      last = flip
    }
    expect(turns).toBeLessThanOrEqual(1)
  })
})

describe('round 6f: the transformation, the held world, the light, the hero', () => {
  const king = (extra = {}) =>
    bossBody({ x: 300, onGround: true, def: { kind: 'final', art: 'king', speed: 195, projectiles: 3 }, ...extra })

  it('the first 0.1 s of a wind-up are still a rest between his actions; later in it they are not', () => {
    const { world, view } = setup()
    world.boss = king({ state: 'windup', stateTime: 0.05 })
    view.simStep()
    expect(view.bossBetweenActions()).toBe(true)
    world.boss = king({ state: 'windup', stateTime: 0.2 })
    view.simStep()
    expect(view.bossBetweenActions()).toBe(false)
  })

  it('a king who comes down from a real fall out of his walk lands (and is not between actions until it is over)', () => {
    const { world, view } = setup()
    const b = king({ state: 'idle', onGround: false, y: 160, vy: 300 })
    world.boss = b
    view.simStep()
    frame(view)
    b.y = 200
    b.onGround = true
    b.vy = 0
    view.simStep()
    frame(view)
    expect(view.selectBoss(b as never).name).toBe('land')
    expect(view.bossBetweenActions()).toBe(false)
    // A hop of a few px is no fall.
    const c = king({ state: 'idle', onGround: false, y: 196 })
    const r = setup()
    r.world.boss = c
    r.view.simStep()
    c.y = 200
    c.onGround = true
    r.view.simStep()
    frame(r.view)
    expect(r.view.selectBoss(c as never).name).not.toBe('land')
  })

  it('boss-slam always begins a landing, even after a staged pose cut one', () => {
    const { world, view } = setup()
    const b = king({ state: 'slam', onGround: true, stateTime: 0.3 })
    world.boss = b
    frame(view)
    // A staged pose ends while he is held on the ground in his slam: that landing is cut.
    view.pose('boss', 'rage', 0.1)
    view.tickReal(0.2)
    frame(view)
    view.handle({ type: 'boss-slam', x: 340, y: 280 } as never)
    world.boss = king({ state: 'recover', onGround: true, stateTime: 0 })
    frame(view)
    expect(view.selectBoss(world.boss as never).name).toBe('land')
  })

  it('once the stage is over nothing the simulation holds is decided again: a walker keeps its stride and facing', () => {
    const { world, view } = setup()
    world.boss = null
    const rat = { id: 6, kind: 'walker', x: 500, y: 300, w: 44, h: 40, vx: 74, vy: 0, facing: 1 as 1 | -1 }
    Object.assign(rat, { onGround: true, hitFlash: 0, shootTimer: 0, dead: false })
    ;(world as unknown as { enemies: unknown[] }).enemies = [rat]
    for (let i = 0; i < 30; i++) {
      rat.x += 74 / 60
      view.simStep()
      frame(view)
    }
    world.state = 'dead'
    const before = { clip: view.selectEnemy(rat as never), flip: view.enemyFlip(rat as never) }
    // PlaySession still calls simStep on its paced steps; the world does not move.
    for (let i = 0; i < 40; i++) {
      view.simStep()
      frame(view)
    }
    expect(view.selectEnemy(rat as never)).toEqual(before.clip)
    expect(view.enemyFlip(rat as never)).toBe(before.flip)
  })

  it("the hero's bite keeps the side it bit to its end, whatever his facing does meanwhile", () => {
    const { world, view } = setup()
    const p = world.player as { facing: number; biteTimer: number; x: number }
    p.facing = 1
    for (let i = 0; i < 20; i++) {
      view.simStep()
      frame(view)
    }
    view.handle({ type: 'bite', x: 0, y: 0, dir: 1, hit: false } as never)
    p.biteTimer = BITE_TIME
    const flips: boolean[] = []
    for (let i = 0; i < 12; i++) {
      p.biteTimer -= 1 / 60
      // The input turns him round on every step (the bot does, over an enemy).
      p.facing = i % 2 ? 1 : -1
      view.simStep()
      frame(view)
      if (view.selectHero()!.name === 'bite') flips.push(view.heroFlip())
    }
    expect(flips.length).toBeGreaterThan(3)
    expect(flips.every((f) => f === false)).toBe(true)
  })

  for (const hz of [30, 60, 144])
    it(`at ${hz} Hz the hero's hard landing shows the same steps of its clip`, () => {
      const { world, view } = setup()
      const p = world.player as { onGround: boolean; vy: number; y: number }
      const names: string[] = []
      const per = 60 / hz
      let n = 0
      p.onGround = false
      p.vy = 600
      for (let k = 0; k < 40 * (hz / 60) + 2; k++) {
        for (let s = 0; s < Math.max(1, Math.round(per)) && n < 40; s++, n++) {
          if (n === 10) {
            p.onGround = true
            p.vy = 0
            view.handle({ type: 'land', x: 0, y: 0, speed: 700 } as never)
          }
          view.simStep()
          names[n] = view.selectHero()!.name
        }
        frame(view, 1 / hz)
      }
      // The steps from the touchdown: the landing, the same at every rate.
      expect(names.slice(10, 20).filter((x) => x === 'land').length).toBe(10)
    })
})

describe("round 6g: the hero's pivot is the picture of a drawn turn; a landing fitted to the next attack", () => {
  it('an input that goes back before the hold lets him turn gives no pivot: he keeps the facing he is drawn with', () => {
    const { world, view } = setup()
    const p = world.player as { facing: number; vx: number; onGround: boolean }
    p.facing = 1
    for (let i = 0; i < 20; i++) {
      view.simStep()
      frame(view)
    }
    // He turns left (a drawn turn: his pivot).
    p.facing = -1
    view.simStep()
    frame(view)
    expect(view.heroFlip()).toBe(true)
    expect(view.selectHero()!.name).toBe('turn')
    for (let i = 0; i < 3; i++) {
      view.simStep()
      frame(view)
    }
    // Within the hold the input presses right for two steps and lets go: no pivot, no turn drawn.
    const seen: { name: string; left: boolean }[] = []
    for (let i = 0; i < 6; i++) {
      p.facing = i < 2 ? 1 : -1
      view.simStep()
      frame(view)
      seen.push({ name: view.selectHero()!.name, left: view.heroFlip() })
    }
    for (const r of seen) expect(r.left).toBe(true)
  })

  it('a king who lands from a fall just before his attack begins comes down without a landing; earlier, a fitted one', () => {
    const fall = (state: string, stateTime: number) => {
      const { world, view } = setup()
      const b = bossBody({
        x: 300,
        state,
        stateTime,
        onGround: false,
        y: 160,
        def: { kind: 'final', art: 'king', speed: 195, projectiles: 3 }
      })
      world.boss = b
      view.simStep()
      frame(view)
      Object.assign(b, { y: 200, onGround: true, vy: 0 })
      view.simStep()
      frame(view)
      return view.selectBoss(b as never).name
    }
    // (sim.ts: his wind-up lasts 0.35 s; a landing needs FIT_MIN, 0.1 s.)
    expect(fall('windup', 0.3)).not.toBe('land')
    expect(fall('windup', 0.1)).toBe('land')
    expect(fall('idle', 0.2)).toBe('land')
  })
})

describe("round 6h: a plain fall's landing gives way once its impact has shown; it goes on over a seam", () => {
  const KING = { kind: 'final', art: 'king', speed: 195, projectiles: 3 }
  const land = bossSpec('king').land!
  /** A king come down 40 px on to ground at y 320 (his feet), the touchdown step answered but not yet drawn. */
  // (In his recovery he stays put: the landing has its whole length.)
  const touchdown = (state = 'recover', vx = 0, stateTime = 0) => {
    const { world, view } = setup()
    world.solidAt = (_tx: number, ty: number) => ty >= 5
    const b = bossBody({ x: 300, y: 200, state, stateTime, onGround: false, vy: 300, vx, def: KING })
    world.boss = b as never
    view.simStep()
    frame(view)
    Object.assign(b, { y: 240, onGround: true, vy: 0 })
    view.simStep()
    return { world, view, b }
  }

  it('in his recovery: not before a frame has drawn the landing, nor in its first frame; from its second frame on', () => {
    const { view, b } = touchdown()
    expect(view.selectBoss(b as never).name).toBe('land')
    expect(view.bossBetweenActions()).toBe(false)
    expect(view.bossSettled()).toBe(false)
    const rows: { t: number; between: boolean }[] = []
    for (let i = 0; i < 12 && view.selectBoss(b as never).name === 'land'; i++) {
      frame(view)
      view.simStep()
      rows.push({ t: view.selectBoss(b as never).t, between: view.bossBetweenActions() })
    }
    const end = (land.hold?.[0] ?? 1) / land.fps
    expect(rows.some((r) => r.between)).toBe(true)
    for (const r of rows) expect(r.between, `at ${r.t}`).toBe(r.t + 1e-9 >= end)
  })

  it('into his wind-up only once he no longer slides', () => {
    const run = (vx: number) => {
      // (Early in it: the landing leaves the wind-up its warning.)
      const { view, b } = touchdown('windup', vx)
      for (let i = 0; i < 8; i++) {
        frame(view)
        view.simStep()
      }
      expect(view.selectBoss(b as never).name).toBe('land')
      return view.bossBetweenActions()
    }
    expect(run(100)).toBe(false)
    expect(run(0)).toBe(true)
  })

  it('two steps off the ground over a seam do not end it; a third ends it for good', () => {
    const { world, view, b } = touchdown()
    world.player.x = 1000
    for (let i = 0; i < 2; i++) {
      frame(view)
      view.simStep()
    }
    const names = (steps: number) => {
      const out: string[] = []
      for (let i = 0; i < steps; i++) {
        Object.assign(b, { y: 238, onGround: false, vy: 27 })
        view.simStep()
        frame(view)
        out.push(view.selectBoss(b as never).name)
      }
      Object.assign(b, { y: 240, onGround: true, vy: 0 })
      view.simStep()
      frame(view)
      out.push(view.selectBoss(b as never).name)
      return out
    }
    expect(names(2)).toEqual(['land', 'land', 'land'])
    const after = names(3)
    expect(after.slice(0, 3)).toEqual(['land', 'land', 'air'])
    expect(after[3]).not.toBe('land')
  })
})

describe('round 6h: a hurt faces the blow from the hit itself; a hit-stop counts for the holds after its step', () => {
  it("a rat bitten from its left faces left, though its walk carries it the hero's way (not away from him)", () => {
    const { world, view } = setup()
    world.boss = null
    world.player.x = 440
    const rat = {
      id: 3,
      kind: 'walker',
      x: 500,
      y: 300,
      w: 44,
      h: 40,
      vx: -100,
      vy: 0,
      facing: -1 as 1 | -1,
      onGround: true,
      hitFlash: 0,
      shootTimer: 0,
      dead: false
    }
    ;(world as unknown as { enemies: unknown[] }).enemies = [rat]
    for (let i = 0; i < 20; i++) {
      view.simStep()
      frame(view)
    }
    expect(view.enemyFlip(rat as never)).toBe(true)
    // Bitten from its left (thrown right) as it walks at the hero: its walk still carries it left.
    Object.assign(rat, { hitFlash: 0.16, vy: -180, onGround: false })
    view.handle({ type: 'enemy-hit', id: 3, kind: 'walker', x: 522, y: 320, dir: 1 } as never)
    view.simStep()
    frame(view)
    expect(view.selectEnemy(rat as never).name).toBe('hurt')
    expect(view.enemyFlip(rat as never)).toBe(true)
  })
})

describe('round 6l: the player commands, the held moments, the wind-up he has shown, the light', () => {
  /** A hero standing facing `facing` for a while (the hold long over). */
  const standing = (facing: 1 | -1 = 1) => {
    const { world, view } = setup()
    world.boss = null
    const p = world.player as {
      facing: number
      vx: number
      biteTimer: number
      invuln: number
      onGround: boolean
    }
    p.facing = facing
    for (let i = 0; i < 30; i++) {
      view.simStep()
      frame(view)
    }
    return { world, view, p }
  }

  it('a bite within the facing hold is drawn from the frame that shows its step, facing the side it bit', () => {
    const { view, p } = standing(1)
    // He turns left (a drawn turn), and two steps later bites to the right.
    p.facing = -1
    view.simStep()
    frame(view)
    expect(view.heroFlip()).toBe(true)
    view.simStep()
    frame(view)
    p.facing = 1
    view.handle({ type: 'bite', x: 0, y: 0, dir: 1, hit: true } as never)
    p.biteTimer = BITE_TIME
    view.simStep()
    frame(view)
    expect(view.selectHero()!.name).toBe('bite')
    expect(view.heroFlip()).toBe(false)
  })

  it('a moment that holds the simulation keeps the facing he is drawn with, and he comes out of it so', () => {
    const { view, p } = standing(1)
    // He turns left, and taps right within the hold: the simulation faces right, he is still drawn facing left.
    p.facing = -1
    view.simStep()
    frame(view)
    p.facing = 1
    view.simStep()
    frame(view)
    expect(view.heroFlip()).toBe(true)
    const token = view.standStill(60)
    const posed: boolean[] = []
    // (Held: the frames pass no simulation time.)
    for (let i = 0; i < 20; i++) {
      view.update(0)
      view.tickReal(1 / 60)
      posed.push(view.heroFlip())
    }
    view.unposeIf('hero', token)
    const after: { name: string; left: boolean }[] = []
    for (let i = 0; i < 12; i++) {
      view.simStep()
      frame(view)
      after.push({ name: view.selectHero()!.name, left: view.heroFlip() })
    }
    expect(posed.every((l) => l)).toBe(true)
    // No frame the other way, no pivot while he stands: he turns once he moves the way he faces in the game.
    for (const r of after) expect(r).toEqual({ name: 'idle', left: true })
    p.vx = 100
    view.simStep()
    frame(view)
    expect(view.heroFlip()).toBe(false)
  })

  it('round 6p: still braking when the hold ends, he skids from its first frame, facing as the pose showed him', () => {
    const { view, p } = standing(1)
    // Running right, he presses left: he brakes (a skid).
    p.vx = 210
    view.simStep()
    frame(view)
    p.facing = -1
    view.simStep()
    frame(view)
    expect(view.selectHero()!.name).toBe('skid')
    const token = view.standStill(60)
    for (let i = 0; i < 20; i++) {
      view.update(0)
      view.tickReal(1 / 60)
    }
    expect(view.selectHero()!.name).toBe('idle')
    const posed = view.heroFlip()
    view.unposeIf('hero', token)
    // (The frames after the hold that run no step yet show it from its first frame.)
    view.update(0)
    expect(view.selectHero()).toMatchObject({ name: 'skid', t: 0 })
    expect(view.heroFlip()).toBe(posed)
    const names: string[] = []
    for (let i = 0; i < 3; i++) {
      p.vx -= 15
      view.simStep()
      frame(view)
      names.push(view.selectHero()!.name)
    }
    expect(names).toEqual(['skid', 'skid', 'skid'])
  })

  it('a skid a bite covered does not take over in its middle when the bite ends', () => {
    const { view, p } = standing(1)
    p.vx = 210
    view.simStep()
    frame(view)
    p.facing = -1
    view.simStep()
    frame(view)
    expect(view.selectHero()!.name).toBe('skid')
    view.handle({ type: 'bite', x: 0, y: 0, dir: -1, hit: false } as never)
    p.biteTimer = BITE_TIME
    const names: string[] = []
    for (let i = 0; i < 30; i++) {
      p.biteTimer = Math.max(0, p.biteTimer - 1 / 60)
      p.vx = Math.max(0, p.vx - 4)
      view.simStep()
      frame(view)
      names.push(view.selectHero()!.name)
    }
    const end = names.lastIndexOf('bite')
    expect(end).toBeGreaterThan(0)
    expect(names.slice(end + 1)).not.toContain('skid')
  })

  it('a hero who cannot be hurt is drawn on every frame the simulation is held (the blink is for time that runs)', () => {
    const { world, view, p } = standing(1)
    p.invuln = INVULN - 0.5
    // Find a frame where the blink hides him, then hold the simulation there.
    let hidden = false
    for (let i = 0; i < 20 && !hidden; i++) {
      frame(view)
      hidden = !view.heroDrawn()
    }
    expect(hidden).toBe(true)
    const drawn: boolean[] = []
    for (let i = 0; i < 30; i++) {
      blits.length = 0
      view.update(0)
      view.tickReal(1 / 60)
      view.drawHero({} as CanvasRenderingContext2D)
      drawn.push(blits.some((b) => b.anim.startsWith('hero#')) && view.heroDrawn())
    }
    expect(drawn.every((d) => d)).toBe(true)
    expect(world.player.invuln).toBeGreaterThan(0)
  })

  it("the first 0.1 s of a wind-up is judged by the wind-up's own age, not the clock the phase step restarts", () => {
    const { world, view } = setup()
    const w = world as unknown as { time: number }
    w.time = 10
    const king = bossBody({
      x: 300,
      onGround: true,
      state: 'windup',
      stateTime: 0.2,
      def: { kind: 'final', art: 'king', speed: 120, projectiles: 3 }
    })
    world.boss = king as never
    view.simStep()
    frame(view)
    expect(view.bossBetweenActions()).toBe(false)
    // The phase step: sim.ts restarts his state's clock; the crouch he shows is 0.2 s old.
    view.handle({ type: 'boss-phase', x: 0, y: 0 } as never)
    king.stateTime = 0
    w.time += 1 / 60
    view.simStep()
    expect(view.bossBetweenActions()).toBe(false)
    // A wind-up that has really just begun still gives way.
    const fresh = setup()
    ;(fresh.world as unknown as { time: number }).time = 10
    fresh.world.boss = bossBody({ ...king, stateTime: 0.05 }) as never
    fresh.view.simStep()
    fresh.view.simStep()
    expect(fresh.view.bossBetweenActions()).toBe(true)
  })
})

describe('round 6l: a landing out of his walk, a sleeping boss', () => {
  it('a king who walks off a ledge takes the impact over no more than LAND_SLIDE_PX of ground', () => {
    const { world, view } = setup()
    const b = bossBody({
      x: 300,
      y: 160,
      state: 'idle',
      stateTime: 0.2,
      onGround: false,
      vy: 300,
      vx: 195,
      def: { kind: 'final', art: 'king', speed: 195, projectiles: 3 }
    })
    world.boss = b as never
    view.simStep()
    frame(view)
    Object.assign(b, { y: 200, onGround: true, vy: 0 })
    view.simStep()
    let ground = 0
    for (let i = 0; i < 40; i++) {
      frame(view)
      if (view.selectBoss(b as never).name !== 'land') break
      b.x += 195 / 60
      ground += 195 / 60
      view.simStep()
    }
    expect(ground).toBeGreaterThan(0)
    expect(ground).toBeLessThanOrEqual(LAND_SLIDE_PX + 195 / 60 + 1e-6)
  })

  it('a heavy boss asleep records no landing: he wakes without one', () => {
    const { world, view } = setup()
    const b = bossBody({
      x: 300,
      y: 160,
      active: false,
      onGround: false,
      vy: 300,
      def: { kind: 'tank', art: 'apeBoss', speed: 100 }
    })
    world.boss = b as never
    view.simStep()
    frame(view)
    Object.assign(b, { y: 200, onGround: true, vy: 0 })
    view.simStep()
    frame(view)
    b.active = true
    view.simStep()
    frame(view)
    expect(view.selectBoss(b as never).name).not.toBe('land')
  })
})

describe('round 6m: the fox in the air', () => {
  const FOX = { kind: 'swarm', art: 'foxBoss', speed: 175, projectiles: 1 }
  it('off a ledge in his wind-up he falls in his air; landed, his wind-up begins on its first frame', () => {
    const { world, view } = setup()
    // Ground at y 320 (his feet on it at y 240).
    world.solidAt = (_tx: number, ty: number) => ty >= 5
    const b = bossBody({ x: 300, y: 240, state: 'windup', stateTime: 0, onGround: true, def: FOX })
    world.boss = b as never
    view.simStep()
    frame(view)
    expect(view.selectBoss(b as never).name).toBe('windup')
    // A tile above it, falling.
    const names: string[] = []
    for (let i = 0; i < 6; i++) {
      Object.assign(b, { y: 176 + i * 8, onGround: false, vy: 100 + i * 30, stateTime: b.stateTime + 1 / 60 })
      view.simStep()
      frame(view)
      names.push(view.selectBoss(b as never).name)
    }
    expect(names.every((n) => n === 'air')).toBe(true)
    Object.assign(b, { y: 240, onGround: true, vy: 0, stateTime: b.stateTime + 1 / 60 })
    view.simStep()
    frame(view)
    expect(view.selectBoss(b as never)).toMatchObject({ name: 'windup', t: 0 })
  })

  it('the shake at a ledge’s lip (a step off the ground, a step on) keeps his walk', () => {
    const { world, view } = setup()
    world.solidAt = (_tx: number, ty: number) => ty >= 5
    world.player.x = 0
    const b = bossBody({ x: 300, y: 240, state: 'idle', stateTime: 0.5, onGround: true, vx: -175, def: FOX })
    world.boss = b as never
    const names: string[] = []
    for (let i = 0; i < 12; i++) {
      Object.assign(b, { onGround: i % 2 === 0, vy: i % 2 === 0 ? 0 : 27, x: b.x + (i % 2 ? -3 : 3) })
      view.simStep()
      frame(view)
      names.push(view.selectBoss(b as never).name)
    }
    expect(names).not.toContain('air')
  })
})

describe('round 6p: out of a crash', () => {
  it('the king straight out of a crash (his stun lasts a step) is not between actions until he has been at rest for REST_STEPS steps', () => {
    const { world, view } = setup()
    const KING = { kind: 'final', art: 'king', speed: 120, projectiles: 3 }
    const b = bossBody({ x: 300, onGround: true, state: 'charge', stateTime: 0.5, vx: -400, def: KING })
    world.boss = b as never
    view.simStep()
    frame(view)
    Object.assign(b, { state: 'stunned', stateTime: 0, vx: 0 })
    view.simStep()
    Object.assign(b, { state: 'idle', stateTime: 0, vx: 150 })
    view.simStep()
    frame(view)
    const between: boolean[] = []
    for (let i = 0; i < 4; i++) {
      between.push(view.bossBetweenActions())
      b.stateTime += 1 / 60
      view.simStep()
      frame(view)
    }
    // Walking straight on out of the crash, he is not at rest.
    expect(between).toEqual([false, false, false, false])
    b.vx = 0
    for (let i = 0; i < 3; i++) {
      b.stateTime += 1 / 60
      view.simStep()
      frame(view)
    }
    expect(view.bossBetweenActions()).toBe(true)
  })
})

describe('round 6q: out of a hold, a landing at the end of a rest, a walker in the air', () => {
  const runningRight = () => {
    const { world, view } = setup()
    world.boss = null
    const p = world.player as { facing: number; vx: number; onGround: boolean }
    p.facing = 1
    p.vx = 0
    for (let i = 0; i < 30; i++) {
      view.simStep()
      frame(view)
    }
    return { world, view, p }
  }
  const hold = (view: ActorsView) => {
    const token = view.standStill(60)
    for (let i = 0; i < 10; i++) {
      view.update(0)
      view.tickReal(1 / 60)
    }
    view.unposeIf('hero', token)
  }

  it('carried slowly against the facing the pose showed him with, he stands; faster than a walk, he skids', () => {
    for (const [vx, want] of [
      [-60, 'idle'],
      [-200, 'skid']
    ] as const) {
      const { view, p } = runningRight()
      // (Knocked: the simulation carries him left while he faces right.)
      p.vx = vx
      hold(view)
      const names: string[] = []
      for (let i = 0; i < 3; i++) {
        view.simStep()
        frame(view)
        names.push(view.selectHero()!.name)
        p.vx *= 0.8
      }
      expect(names[0], String(vx)).toBe(want)
      expect(names, String(vx)).not.toContain('run')
      expect(view.heroFlip()).toBe(false)
    }
  })

  it('a skid out of a hold that the input turns round ends: it is not mirrored', () => {
    const { view, p } = runningRight()
    p.vx = -200
    hold(view)
    // (The frame after the hold, before a step: the skid from its first frame, facing as the pose showed him.)
    view.update(0)
    expect(view.selectHero()!.name).toBe('skid')
    expect(view.heroFlip()).toBe(false)
    // The input turns him on the first step after it: the skid ends, it does not turn round.
    p.facing = -1
    view.simStep()
    frame(view)
    expect(view.selectHero()!.name === 'skid' && view.heroFlip()).toBe(false)
  })

  it('a king who touches down at the end of his recovery takes the impact before his walk carries him', () => {
    const { world, view } = setup()
    const KING = { kind: 'final', art: 'king', speed: 195, projectiles: 3 }
    world.solidAt = (_tx: number, ty: number) => ty >= 5
    // (Phase 1: his recovery lasts 0.8 s; 0.05 s are left when he touches down.)
    const b = bossBody({ x: 300, y: 200, state: 'recover', stateTime: 0.74, onGround: false, vy: 300, def: KING })
    world.boss = b as never
    view.simStep()
    frame(view)
    Object.assign(b, { y: 240, onGround: true, vy: 0, stateTime: 0.75 })
    view.simStep()
    let frames = 0
    for (let i = 0; i < 40; i++) {
      frame(view)
      if (view.selectBoss(b as never).name !== 'land') break
      frames++
      b.stateTime += 1 / 60
      if (b.stateTime > 0.8) Object.assign(b, { state: 'idle', stateTime: 0, vx: 195 })
      if (b.state === 'idle') b.x += 195 / 60
      view.simStep()
    }
    expect(frames).toBeGreaterThan(0)
    // 0.05 s at rest, then no more than LAND_SLIDE_PX of his walk.
    expect(frames / 60).toBeLessThanOrEqual(0.05 + LAND_SLIDE_PX / 195 + 2 / 60)
  })

  it("a walker's going aloft is decided on the simulation's steps, not on a display frame", () => {
    const { world, view } = setup()
    world.boss = null
    const rat = {
      id: 5,
      kind: 'walker',
      x: 500,
      y: 300,
      w: 44,
      h: 40,
      vx: 74,
      vy: 0,
      facing: 1 as 1 | -1,
      onGround: true,
      hitFlash: 0,
      shootTimer: 0,
      dead: false,
      t: 9
    }
    ;(world as unknown as { enemies: unknown[] }).enemies = [rat]
    for (let i = 0; i < 10; i++) {
      view.simStep()
      frame(view)
    }
    // Off the ground with nothing below: a frame alone does not decide it ...
    Object.assign(rat, { onGround: false, vy: 200 })
    frame(view)
    expect(view.selectEnemy(rat as never).name).not.toBe('air')
    // ... its step does.
    view.simStep()
    frame(view)
    expect(view.selectEnemy(rat as never).name).toBe('air')
  })
})
