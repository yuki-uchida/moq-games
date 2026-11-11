import { describe, expect, it } from 'vitest'
import { Camera, LOOK_AHEAD, type CameraTarget } from '../src/view/camera'
import { computeScale } from '../src/view/renderer'

describe('integer scaling', () => {
  it('picks k = clamp(ceil(cssWidth × dpr / 640), 1, 4)', () => {
    expect(computeScale(640, 1)).toBe(1)
    expect(computeScale(641, 1)).toBe(2)
    expect(computeScale(1280, 1)).toBe(2)
    expect(computeScale(1280, 2)).toBe(4)
    expect(computeScale(960, 1.5)).toBe(3)
    expect(computeScale(320, 3)).toBe(2)
    expect(computeScale(5000, 3)).toBe(4)
    expect(computeScale(0, 1)).toBe(1)
    expect(computeScale(800, 0)).toBe(2)
    expect(computeScale(Number.NaN, 1)).toBe(1)
  })
})

const MAP = { mapW: 100, mapH: 18 }
const hero = (x: number, y: number, extra: Partial<CameraTarget> = {}): CameraTarget => ({
  x,
  y,
  w: 42,
  h: 46,
  vx: 0,
  facing: 1,
  onGround: true,
  ...extra
})
const run = (camera: Camera, target: CameraTarget, seconds: number) => {
  for (let t = 0; t < seconds; t += 1 / 60) camera.update(1 / 60, target)
}

describe('camera', () => {
  it('follows the hero with look-ahead toward his facing', () => {
    const camera = new Camera(MAP)
    const target = hero(2000, 900)
    camera.snap(target)
    run(camera, target, 3)
    expect(camera.x).toBeCloseTo(2000 + 21 + LOOK_AHEAD - 320, 0)
    const left = hero(2000, 900, { facing: -1 })
    run(camera, left, 4)
    expect(camera.x).toBeCloseTo(2000 + 21 - LOOK_AHEAD - 320, 0)
  })

  it('catches up with a running hero', () => {
    const camera = new Camera(MAP)
    const target = hero(1000, 900, { vx: 215 })
    camera.snap(target)
    for (let i = 0; i < 180; i++) {
      target.x += 215 / 60
      camera.update(1 / 60, target)
    }
    const centre = camera.x + 320
    expect(centre).toBeGreaterThan(target.x)
    expect(centre - target.x).toBeLessThan(LOOK_AHEAD + 80)
  })

  it('clamps to the map', () => {
    const camera = new Camera(MAP)
    camera.snap(hero(10, 900))
    expect(camera.x).toBe(0)
    camera.snap(hero(100 * 64, 18 * 64 - 46))
    expect(camera.x).toBe(100 * 64 - 640)
    expect(camera.y).toBe(18 * 64 - 360)
    camera.snap(hero(2000, -400))
    expect(camera.y).toBe(-40)
    const view = camera.view(3)
    expect(view.y).toBeGreaterThanOrEqual(-40)
  })

  it('keeps the view still for a small hop (vertical dead zone)', () => {
    const camera = new Camera(MAP)
    const ground = hero(2000, 700)
    camera.snap(ground)
    run(camera, ground, 1)
    const y = camera.y
    const hop = hero(2000, 700 - 40, { onGround: false })
    run(camera, hop, 0.4)
    expect(Math.abs(camera.y - y)).toBeLessThan(0.5)
    // A big rise does move it.
    run(camera, hero(2000, 700 - 300, { onGround: false }), 1)
    expect(camera.y).toBeLessThan(y - 100)
  })

  it('shakes with trauma that decays to zero', () => {
    const camera = new Camera(MAP)
    const target = hero(2000, 700)
    camera.snap(target)
    camera.addTrauma(1)
    camera.kick(3, 0)
    camera.update(1 / 60, target)
    const o = camera.offset()
    expect(Math.hypot(o.x, o.y)).toBeGreaterThan(0)
    expect(Math.hypot(o.x, o.y)).toBeLessThanOrEqual(6 * Math.SQRT2 + 3)
    run(camera, target, 0.5)
    expect(camera.trauma).toBe(0)
    expect(camera.offset()).toEqual({ x: 0, y: 0 })
  })

  it('has no shake or kick under reduced motion', () => {
    const camera = new Camera({ ...MAP, reducedMotion: true })
    const target = hero(2000, 700)
    camera.snap(target)
    camera.addTrauma(1)
    camera.kick(5, 5)
    camera.update(1 / 60, target)
    expect(camera.offset()).toEqual({ x: 0, y: 0 })
    expect(camera.trauma).toBe(0)
  })

  it('snaps the drawn position to steps of 1/k', () => {
    const camera = new Camera(MAP)
    const target = hero(2000.37, 700)
    camera.snap(target)
    camera.update(0.013, { ...target, x: 2003.11 })
    for (const k of [1, 2, 3, 4]) {
      const v = camera.view(k)
      expect(Math.abs(v.x * k - Math.round(v.x * k))).toBeLessThan(1e-9)
      expect(Math.abs(v.y * k - Math.round(v.y * k))).toBeLessThan(1e-9)
    }
  })

  it('pans to a target, holds it, and releases back to the hero', () => {
    const camera = new Camera(MAP)
    const target = hero(1000, 700)
    camera.snap(target)
    const start = camera.x
    camera.panTo(3000, 800, 0.6)
    expect(camera.panning).toBe(true)
    run(camera, target, 0.7)
    expect(camera.x + 320).toBeCloseTo(3000, 5)
    expect(camera.y + 180).toBeCloseTo(800, 5)
    run(camera, target, 0.5)
    expect(camera.x + 320).toBeCloseTo(3000, 5)
    camera.release()
    expect(camera.panning).toBe(false)
    run(camera, target, 3)
    expect(camera.x).toBeCloseTo(start, 0)
  })
})
