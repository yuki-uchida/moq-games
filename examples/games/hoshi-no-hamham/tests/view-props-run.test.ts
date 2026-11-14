import { beforeEach, describe, expect, it, vi } from 'vitest'

/** Every blit the props view makes, in order. */
const blits: { anim: string; t: number; x: number; frame?: number }[] = []

vi.mock('../src/view/bake', () => ({
  clip: (sheet: string, name: string) => ({ id: `${sheet}#${name}` }),
  brush: (_flip?: boolean, _alpha?: number, frame?: number) => ({ frame }),
  blit: (_ctx: unknown, anim: { id: string }, t: number, x: number, _y: number, o?: { frame?: number }) =>
    blits.push({ anim: anim.id, t, x, frame: o?.frame })
}))

import { PROP_SPEC } from '../src/art/contract'
import { TILE } from '../src/game/types'
import { specDuration, strideTime } from '../src/view/clips'
import { ANIMAL_DAZE_AFTER, ANIMAL_KICKS, PropsView } from '../src/view/props'

beforeEach(() => {
  blits.length = 0
})

describe('うりぼう runs by the ground it covers', () => {
  it('leaps on its own time, runs one pass per stride (96 px), and sits dazed once something stops it', () => {
    const run = PROP_SPEC['prop:animal'].run
    expect(run.stride).toBe(96)
    const animal = { id: 1, kind: 'animal', state: 'idle', x: 5 * TILE, y: 4 * TILE, w: 1, h: 1, dir: 1, hp: 1 }
    // Flat ground under it (row 5).
    const world = {
      props: [animal],
      theme: 'forest',
      goalOpen: false,
      tileAt: () => 0,
      h: 20,
      solidAt: (_: number, ty: number) => ty === 5
    }
    const view = new PropsView(world as never, { rand: () => 0.5, spawn: () => {} } as never)
    const ctx = { save() {}, restore() {}, beginPath() {}, rect() {}, clip() {} } as unknown as CanvasRenderingContext2D
    animal.state = 'awake'
    view.handle({ type: 'animal-wake', x: animal.x + 10, y: animal.y + 10, dir: 1 } as never)
    const drawn = () => {
      blits.length = 0
      view.drawProps(ctx)
      return blits.find((b) => b.anim.startsWith('prop:animal#'))!
    }
    // The leap.
    view.update(1 / 60)
    expect(drawn().anim).toBe('prop:animal#wake')
    // Running at 300 px/s (sim.ts): 5 px a step.
    let covered = 0
    for (let t = 0; t < specDuration(PROP_SPEC['prop:animal'].wake) + 0.2; t += 1 / 60) {
      animal.x += 5
      covered += 5
      view.update(1 / 60)
    }
    const running = drawn()
    expect(running.anim).toBe('prop:animal#run')
    expect(running.t).toBeCloseTo(strideTime(run, covered))
    // Stopped by a wall: a moment later it sits dazed (from the moment it stopped), stars over its head.
    expect(ANIMAL_DAZE_AFTER).toBe(0.1)
    view.update(1 / 60)
    expect(drawn().anim).toBe('prop:animal#run')
    for (let i = 0; i < 6; i++) view.update(1 / 60)
    const dazed = drawn()
    expect(dazed.anim).toBe('prop:animal#daze')
    expect(dazed.t).toBeCloseTo(7 / 60)
    expect(blits.some((b) => b.anim === 'fx#dizzy')).toBe(true)
    expect(view.selectAnimal(animal as never)).toMatchObject({ name: 'daze' })
    // It stays dazed while it stays there; asleep or gone, nothing is drawn of it.
    for (let i = 0; i < 60; i++) view.update(1 / 60)
    expect(drawn().anim).toBe('prop:animal#daze')
    animal.state = 'gone'
    expect(view.selectAnimal(animal as never)).toBeNull()
  })

  it('A: in the air (no ground within 2 px under its feet) it neither runs nor sits: it kicks as it sinks', () => {
    expect(ANIMAL_KICKS).toBe(6)
    const animal = { id: 2, kind: 'animal', state: 'idle', x: 5 * TILE, y: 4 * TILE, w: 1, h: 1, dir: 1, hp: 1 }
    // Ground (row 5) up to column 7; beyond, a pit.
    const solidAt = (tx: number, ty: number) => ty === 5 && tx <= 7
    const world = { props: [animal], theme: 'forest', goalOpen: false, tileAt: () => 0, h: 20, solidAt }
    const view = new PropsView(world as never, { rand: () => 0.5, spawn: () => {} } as never)
    const ctx = { save() {}, restore() {}, beginPath() {}, rect() {}, clip() {} } as unknown as CanvasRenderingContext2D
    animal.state = 'awake'
    view.handle({ type: 'animal-wake', x: animal.x + 10, y: animal.y + 10, dir: 1 } as never)
    const drawn = () => {
      blits.length = 0
      view.drawProps(ctx)
      return blits.find((b) => b.anim.startsWith('prop:animal#'))!
    }
    for (let t = 0; t < specDuration(PROP_SPEC['prop:animal'].wake) + 0.1; t += 1 / 60) {
      animal.x = Math.min(animal.x + 2, 6 * TILE)
      view.update(1 / 60)
    }
    expect(drawn().anim).toBe('prop:animal#run')
    // Off the ledge: sinking slowly, stopped against nothing (it does not move along): its leap's airborne frames, in
    // turn, ANIMAL_KICKS times a second; never the run or the daze.
    animal.x = 8 * TILE
    const frames: number[] = []
    for (let i = 0; i < 60; i++) {
      animal.y += 1
      view.update(1 / 60)
      const d = drawn()
      expect(d.anim).toBe('prop:animal#wake')
      frames.push(d.frame!)
      expect(blits.some((b) => b.anim === 'fx#dizzy')).toBe(false)
    }
    expect(new Set(frames)).toEqual(new Set([1, 2]))
    // One kick lasts 1 / ANIMAL_KICKS s: 10 display frames at 60 Hz.
    let changes = 0
    for (let i = 1; i < frames.length; i++) if (frames[i] !== frames[i - 1]) changes++
    expect(changes).toBeGreaterThanOrEqual(4)
    expect(changes).toBeLessThanOrEqual(6)
    // Down on the ground (back over the ledge, its feet on row 5) it runs, and stopped there it sits dazed.
    animal.x = 6 * TILE
    animal.y = 4 * TILE
    view.update(1 / 60)
    expect(drawn().anim).toBe('prop:animal#run')
    for (let i = 0; i < 8; i++) view.update(1 / 60)
    expect(drawn().anim).toBe('prop:animal#daze')
  })
})
