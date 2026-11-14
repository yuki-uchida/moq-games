import { beforeEach, describe, expect, it, vi } from 'vitest'

/** Every blit the actors view makes, in order. */
const blits: { anim: string; t: number; x: number; y: number; alpha?: number; frame?: number; flip?: boolean }[] = []

vi.mock('../src/view/bake', () => ({
  clip: (sheet: string, name: string) => ({ id: `${sheet}#${name}` }),
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
  dieLandTime
} from '../src/view/actors'
import {
  BOSS_DEFEAT_GROUND_FRAME,
  ENEMY_DEFEAT_GROUND_FRAME,
  BRUTE_IDLE_SECONDS,
  FIT_MIN,
  LUNGE_FRAMES,
  RUN_CONTACT_FRAMES,
  SWARM_IDLE_SECONDS,
  SKID_SPEED,
  clipLife,
  frameStart,
  heroClip,
  specDuration
} from '../src/view/clips'
import { frameAt, type Anim } from '../src/art/sheet'
import { FACE_DEAD_ZONE, FACE_HOLD } from '../src/view/tread'
import { TILE } from '../src/game/types'
import { BITE_TIME, INVULN } from '../src/game/sim'

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

  it('a squirrel faces its shot when it spits, and keeps that through the throw', () => {
    const { world, view, enemy, flip } = rig('spitter')
    world.player.x = 400
    frame(view)
    frame(view)
    expect(flip()).toBe(false)
    world.player.x = 290
    enemy.shootTimer = 2.4
    view.handle({ type: 'spit', id: 2, x: 0, y: 0, dir: -1 } as never)
    frame(view)
    expect(flip()).toBe(true)
    world.player.x = 500
    for (let i = 0; i < 10; i++) {
      enemy.shootTimer -= 1 / 60
      frame(view)
      expect(flip()).toBe(true)
    }
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

  it('a summon while he walks: the gesture from its release; during the dash: none, not even when the dash ends', () => {
    const event = { type: 'minion', x: 0, y: 0, kind: 'walker' } as never
    // Walking: the release and the follow-through play.
    const walking = setup()
    walking.world.boss = fox('idle')
    walking.view.handle(event)
    expect(drawn()(walking.view)).toBe('foxBoss#shoot')
    // In the dash the state's clip stays ...
    const dashing = setup()
    dashing.world.boss = fox('charge', { vx: 400 })
    dashing.view.handle(event)
    expect(drawn()(dashing.view)).toBe('foxBoss#attack')
    // ... and when the dash ends a moment later, the tail of the gesture does not pop in.
    dashing.view.update(0.1)
    dashing.world.boss = fox('idle', { stateTime: 0 })
    expect(drawn()(dashing.view)).not.toBe('foxBoss#shoot')
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
        view.handle({ type: 'boss-shoot', x: 0, y: 0, count: 1 } as never)
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

  it('he faces his shot on the step it leaves, the way sim.ts aimed it', () => {
    const { world, view } = setup()
    world.player.x = 0
    world.boss = bossBody({ state: 'idle', x: 300, def: { kind: 'swarm', art: 'foxBoss', speed: 175 } })
    view.update(1 / 60)
    view.update(1 / 60)
    expect(view.bossFlip(world.boss as never)).toBe(true)
    world.player.x = 305
    // The event's x is his centre when the shot left (sim.ts aims from there, before he moves on).
    view.handle({ type: 'boss-shoot', x: 340, y: 0, count: 1 } as never)
    view.update(1 / 60)
    expect(view.bossFlip(world.boss as never)).toBe(false)
    // Over the hero the step's own move can carry him across: the shot went the way it was aimed from where he was.
    world.player.x = 302
    view.handle({ type: 'boss-shoot', x: 345, y: 0, count: 1 } as never)
    view.update(1 / 60)
    expect(view.bossFlip(world.boss as never)).toBe(true)
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
        view.handle({ type: 'boss-shoot', x: 0, y: 0, count: 1 } as never)
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
    // The hero clearly on his right, though he faced left: the lead-in begins facing right.
    const a = setup()
    a.world.player.x = 0
    a.world.boss = fox({ shotTimer: 0.5 })
    for (let i = 0; i < 12; i++) frame(a.view)
    expect(a.view.bossFlip(a.world.boss as never)).toBe(true)
    a.world.player.x = 300 + FACE_DEAD_ZONE + 2
    const run = castRun(a.view, a.world, 40)
    const first = run.find((r) => r.name === 'shoot')!
    expect(first.left).toBe(false)
    // Within the dead zone (where sim.ts's aim flips with every step he takes) the shot leaves without a pose.
    const b = setup()
    b.world.player.x = 300 + FACE_DEAD_ZONE - 1
    b.world.boss = fox({ shotTimer: 0.5 })
    for (let i = 0; i < 12; i++) frame(b.view)
    const unposed = castRun(b.view, b.world, 30)
    expect(unposed.some((r) => r.name === 'shoot')).toBe(false)
  })

  it('a shot that leaves the other way on the last moments of a flinch ends the flinch (a flinch never turns)', () => {
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
    expect(view.selectBoss(world.boss as never).name).not.toBe('hurt')
    expect(view.bossFlip(world.boss as never)).toBe(!before)
  })

  it("a rat's hurt keeps its facing though it is thrown back the other way", () => {
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
      rat.x -= 3
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
      // Once the hurt is over, his own facing.
      world.player.invuln = INVULN - 0.5
      frame(view)
      expect(view.selectHero()!.name).not.toBe('hurt')
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
