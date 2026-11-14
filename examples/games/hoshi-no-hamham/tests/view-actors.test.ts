import { beforeEach, describe, expect, it, vi } from 'vitest'

/** Every blit the actors view makes, in order. */
const blits: { anim: string; t: number; x: number; y: number; alpha?: number; frame?: number }[] = []

vi.mock('../src/view/bake', () => ({
  clip: (sheet: string, name: string) => ({ id: `${sheet}#${name}` }),
  flashClip: () => undefined,
  frameIndex: () => 0,
  blit: (
    _ctx: unknown,
    anim: { id: string },
    t: number,
    x: number,
    y: number,
    o: { alpha?: number; frame?: number } = {}
  ) => blits.push({ anim: anim.id, t, x, y, alpha: o.alpha, frame: o.frame })
}))

import { HERO_SPEC, bossSpec } from '../src/art/contract'
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
  bossJolt,
  dieLandTime
} from '../src/view/actors'
import { BOSS_DEFEAT_GROUND_FRAME, SKID_SPEED, clipLife, frameStart, heroClip, specDuration } from '../src/view/clips'
import { frameAt, type Anim } from '../src/art/sheet'
import { TILE } from '../src/game/types'

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

  it('starts when the facing flips on the ground without a skid, and ends after its length', () => {
    const { world, view } = setup()
    view.update(1 / 60)
    expect(turnAge(view)).toBeNull()
    world.player.facing = -1
    view.update(1 / 60)
    expect(turnAge(view)).toBe(0)
    view.update(0.1)
    expect(turnAge(view)).toBeCloseTo(0.1)
    expect(specDuration(HERO_SPEC.turn)).toBeLessThan(0.5)
    view.update(0.45)
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

describe('the rat and the mole stand still only after a while', () => {
  it('ActorsView counts the time an enemy stands still', () => {
    const { world, view } = setup()
    const rat = { id: 1, kind: 'walker', x: 0, y: 0, w: 44, h: 38, vx: 74, vy: 0, facing: 1, onGround: true }
    const enemyOf = rat as never
    ;(world as unknown as { enemies: unknown[] }).enemies = [rat]
    view.update(1 / 60)
    expect(view.selectEnemy(enemyOf).name).toBe('move')
    rat.vx = 0
    view.update(1 / 60)
    expect(view.selectEnemy(enemyOf).name).toBe('move')
    for (let i = 0; i < 10; i++) view.update(1 / 60)
    expect(view.selectEnemy(enemyOf).name).toBe('idle')
    rat.vx = -74
    view.update(1 / 60)
    expect(view.selectEnemy(enemyOf).name).toBe('move')
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
