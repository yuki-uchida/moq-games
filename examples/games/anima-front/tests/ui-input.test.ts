import { describe, expect, it } from 'vitest'
import {
  applyDeadZone,
  ControlState,
  PITCH_LIMIT,
  PlayerInputBuilder,
  responseCurve,
  wrapAngle
} from '../src/input/controls'
import { BTN } from '../src/sim/types'

const paws = { countR: 3, countL: 2, selR: 0, selL: 0 }

describe('press counters', () => {
  it('counts every press, ignores key repeat and keeps counters monotonic', () => {
    const s = new ControlState()
    const b = new PlayerInputBuilder()
    s.press('jump', 'kb')
    s.press('jump', 'kb') // repeat while held
    s.release('jump', 'kb')
    s.press('jump', 'kb') // a second tap inside the same frame
    s.release('jump', 'kb')
    const a = b.build(s, paws)
    expect(a.presses.jump).toBe(2)
    expect(a.held & BTN.JUMP).toBe(0)
    s.press('R', 'mouse')
    const c = b.build(s, paws)
    expect(c.presses.r).toBe(1)
    expect(c.presses.jump).toBe(2)
    expect(c.held & BTN.R).toBe(BTN.R)
  })

  it('holds a button while any source holds it', () => {
    const s = new ControlState()
    s.press('dash', 'kb')
    s.press('dash', 'pad')
    s.release('dash', 'kb')
    expect(s.held('dash')).toBe(true)
    s.releaseSource('pad')
    expect(s.held('dash')).toBe(false)
    expect(s.presses.dash).toBe(2)
  })
})

describe('paw selection', () => {
  it('is absolute and wraps within the paw list', () => {
    const s = new ControlState()
    const b = new PlayerInputBuilder()
    expect(b.build(s, { ...paws, selR: 2, selL: 1 }).selR).toBe(2)
    s.command({ type: 'cycle', hand: 'R', dir: 1 })
    expect(b.build(s, paws).selR).toBe(0)
    s.command({ type: 'cycle', hand: 'R', dir: -1 })
    expect(b.build(s, paws).selR).toBe(2)
    s.command({ type: 'cycle', hand: 'L', dir: 1 })
    expect(b.build(s, paws).selL).toBe(0)
    s.command({ type: 'pick', hand: 'R', index: 1 })
    expect(b.build(s, paws).selR).toBe(1)
    s.command({ type: 'pick', hand: 'R', index: 7 }) // out of range: ignored
    expect(b.build(s, paws).selR).toBe(1)
    // the list shrinks (new view): the selection is clamped
    expect(b.build(s, { ...paws, countR: 1 }).selR).toBe(0)
  })

  it('is repeated identically when nothing changes (idempotent samples)', () => {
    const s = new ControlState()
    const b = new PlayerInputBuilder()
    s.command({ type: 'cycle', hand: 'R', dir: 1 })
    const first = b.build(s, paws)
    const second = b.build(s, paws)
    expect(second.selR).toBe(first.selR)
  })
})

describe('look and move', () => {
  it('turns right by decreasing yaw and clamps pitch', () => {
    const s = new ControlState()
    const b = new PlayerInputBuilder()
    s.look(0.5, 10)
    const i = b.build(s, null)
    expect(i.yaw).toBeCloseTo(-0.5)
    expect(i.pitch).toBe(PITCH_LIMIT)
    expect(s.lookYaw).toBe(0)
    expect(wrapAngle(Math.PI * 3)).toBeCloseTo(-Math.PI)
  })

  it('normalises diagonal movement', () => {
    const s = new ControlState()
    s.keys.forward = true
    s.keys.right = true
    const [x, z] = s.move()
    expect(Math.hypot(x, z)).toBeCloseTo(1)
    s.keys.back = true
    expect(s.move()).toEqual([1, 0])
  })

  it('toggles the shoulder', () => {
    const s = new ControlState()
    const b = new PlayerInputBuilder()
    s.command({ type: 'shoulder' })
    expect(b.build(s, null).shoulder).toBe(-1)
  })
})

describe('gamepad shaping', () => {
  it('applies a radial dead zone with rescaling', () => {
    expect(applyDeadZone(0.1, 0.05, 0.15)).toEqual([0, 0])
    const [x] = applyDeadZone(1, 0, 0.15)
    expect(x).toBeCloseTo(1)
    const [hx] = applyDeadZone(0.575, 0, 0.15)
    expect(hx).toBeCloseTo(0.5)
  })

  it('curves small deflections down and keeps full deflection', () => {
    const [x] = responseCurve(0.5, 0, 2)
    expect(x).toBeCloseTo(0.25)
    const [fx, fy] = responseCurve(0.6, 0.8, 2)
    expect(Math.hypot(fx, fy)).toBeCloseTo(1)
    expect(responseCurve(0, 0, 2)).toEqual([0, 0])
  })
})
