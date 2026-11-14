import { describe, expect, it } from 'vitest'
import { Interpolator, JUMP_PX, type Mover, type MoverSource } from '../src/app/interpolate'
import { PlaySession, STEP } from '../src/app/play'
import { STAGES } from '../src/game/stages'
import type { Hud } from '../src/ui/hud'
import type { Input } from '../src/game/input'
import type { Renderer } from '../src/view/renderer'
import { SILENT_AUDIO } from '../src/view/sound-map'

const mover = (x: number, y: number): Mover => ({ x, y })

function fakeWorld(): MoverSource & { player: Mover; enemies: Mover[]; shots: Mover[]; props: Mover[] } {
  return {
    player: mover(100, 50),
    enemies: [mover(300, 40), mover(500, 40)],
    boss: mover(900, 10),
    shots: [mover(150, 60)],
    bees: [mover(20, 20)],
    props: [mover(700, 70)]
  }
}

/** Moves everything by (dx, dy) as one simulation step would. */
function stepWorld(world: MoverSource, dx: number, dy: number) {
  const all = [
    world.player,
    ...world.enemies,
    ...(world.boss ? [world.boss] : []),
    ...world.shots,
    ...world.bees,
    ...world.props
  ]
  for (const m of all) {
    m.x += dx
    m.y += dy
  }
}

describe('Interpolator', () => {
  it('puts everything that moves between its old and new place, and the true values back', () => {
    const world = fakeWorld()
    const mover = new Interpolator()
    mover.remember(world)
    stepWorld(world, 10, -4)
    mover.settle()
    mover.apply(0.25)
    expect(world.player).toEqual({ x: 102.5, y: 49 })
    expect(world.enemies[1]).toEqual({ x: 502.5, y: 39 })
    expect(world.boss).toEqual({ x: 902.5, y: 9 })
    expect(world.shots[0]).toEqual({ x: 152.5, y: 59 })
    expect(world.bees[0]).toEqual({ x: 22.5, y: 19 })
    expect(world.props[0]).toEqual({ x: 702.5, y: 69 })
    mover.restore()
    expect(world.player).toEqual({ x: 110, y: 46 })
    expect(world.enemies[0]).toEqual({ x: 310, y: 36 })
    expect(world.props[0]).toEqual({ x: 710, y: 66 })
    // Restoring twice changes nothing.
    mover.restore()
    expect(world.player).toEqual({ x: 110, y: 46 })
  })

  it('leaves a teleport and a new arrival alone', () => {
    const world = fakeWorld()
    const interp = new Interpolator()
    interp.remember(world)
    stepWorld(world, 10, 0)
    world.enemies[0].x += JUMP_PX + 1
    const born = mover(1000, 1000)
    world.shots.push(born)
    interp.settle()
    interp.apply(0.5)
    expect(world.enemies[0].x).toBe(300 + 10 + JUMP_PX + 1)
    expect(world.enemies[1].x).toBe(505)
    expect(born).toEqual({ x: 1000, y: 1000 })
    interp.restore()
    expect(world.enemies[1].x).toBe(510)
  })

  it('keeps a position that something else set during the frame or between frames', () => {
    const world = fakeWorld()
    const interp = new Interpolator()
    interp.remember(world)
    stepWorld(world, 10, 0)
    interp.settle()
    interp.apply(0.5)
    world.player.x = 1234
    interp.restore()
    expect(world.player.x).toBe(1234)
    expect(world.enemies[0].x).toBe(310)
    // A frame that ran no step: a value written by hand since the last one is not smeared back.
    world.player.x = 4000
    interp.apply(0.5)
    expect(world.player.x).toBe(4000)
    expect(world.enemies[0].x).toBe(305)
    interp.restore()
    expect(world.enemies[0].x).toBe(310)
  })

  it('shows the state of the last step again in a frame that ran none', () => {
    const world = fakeWorld()
    const interp = new Interpolator()
    interp.remember(world)
    stepWorld(world, 9, 0)
    interp.settle()
    interp.apply(1 / 3)
    expect(world.player.x).toBe(103)
    interp.restore()
    interp.apply(2 / 3)
    expect(world.player.x).toBeCloseTo(106, 9)
    interp.restore()
    expect(world.player.x).toBe(109)
  })

  it('does not allocate per call once its buffers are sized', () => {
    const world = fakeWorld()
    const interp = new Interpolator()
    interp.remember(world)
    const sizes = () => JSON.stringify(Object.values(interp).map((v) => (Array.isArray(v) ? v.length : v)))
    const before = sizes()
    for (let i = 0; i < 50; i++) {
      interp.remember(world)
      interp.settle()
      interp.apply(0.5)
      interp.restore()
    }
    expect(sizes()).toBe(before)
  })
})

describe('PlaySession drawing between steps', () => {
  function demoSession() {
    const session = new PlaySession(
      STAGES[0],
      {
        renderer: { k: 1 } as unknown as Renderer,
        hud: {} as unknown as Hud,
        audio: SILENT_AUDIO,
        input: {} as unknown as Input,
        reducedMotion: false
      },
      { demo: true }
    )
    const seen = { update: NaN, draw: NaN }
    const view = session.view
    view.update = () => {
      seen.update = session.world.player.x
    }
    view.draw = () => {
      seen.draw = session.world.player.x
    }
    return { session, seen }
  }

  it('shows the interpolated hero in update and draw and the true one between frames', () => {
    const { session, seen } = demoSession()
    const { world } = session
    // A 90 Hz display (1.5 steps... 2/3 of a step per frame): alpha runs 2/3, 1/3, 1.
    const dt = 1 / 90
    for (let i = 0; i < 120; i++) session.frame(dt)
    session.draw()
    let interpolated = 0
    for (let i = 0; i < 90; i++) {
      const before = world.player.x
      session.frame(dt)
      const inFrame = seen.update
      session.draw()
      const after = world.player.x
      expect(seen.draw).toBe(inFrame)
      // Between frames the world holds a whole simulation state; during the frame the hero was between two.
      expect(inFrame).toBeGreaterThanOrEqual(Math.min(before, after) - 1e-9)
      expect(inFrame).toBeLessThanOrEqual(Math.max(before, after) + 1e-9)
      if (Math.abs(inFrame - after) > 1e-9) interpolated += 1
    }
    expect(interpolated).toBeGreaterThan(20)
  })

  it('draws the true state at 60 Hz (alpha 1)', () => {
    const { session, seen } = demoSession()
    for (let i = 0; i < 90; i++) {
      session.frame(STEP)
      expect(seen.update).toBe(session.world.player.x)
      session.draw()
    }
  })

  it('puts the true positions back when the draw throws', () => {
    const throwing = demoSession()
    const normal = demoSession()
    throwing.session.view.draw = () => {
      throw new Error('boom')
    }
    const dt = 1 / 90
    for (let i = 0; i < 200; i++) {
      throwing.session.frame(dt)
      normal.session.frame(dt)
      expect(() => throwing.session.draw()).toThrow('boom')
      normal.session.draw()
      expect(throwing.session.world.player.x).toBe(normal.session.world.player.x)
      expect(throwing.session.world.time).toBe(normal.session.world.time)
    }
  })
})
