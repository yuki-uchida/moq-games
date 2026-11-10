import { describe, expect, it } from 'vitest'
import { clampCamera, keepClearY } from '../src/render/camera'

describe('clampCamera insets', () => {
  it('default is the plain clamp', () => {
    expect(clampCamera(0, 0, 400, 300, 1000, 800)).toEqual({ x: 200, y: 150 })
    expect(clampCamera(5000, 5000, 400, 300, 1000, 800)).toEqual({ x: 800, y: 650 })
    expect(clampCamera(0, 0, 400, 300, 1000, 800, {})).toEqual({ x: 200, y: 150 })
    expect(clampCamera(0, 0, 400, 900, 1000, 800)).toEqual({ x: 200, y: 400 })
  })
  it('top / bottom insets let the view pass the map edge', () => {
    expect(clampCamera(500, -999, 400, 300, 1000, 800, { top: 80 }).y).toBe(70)
    expect(clampCamera(500, 9999, 400, 300, 1000, 800, { bottom: 50 }).y).toBe(700)
    expect(clampCamera(500, 400, 400, 300, 1000, 800, { top: 80 }).y).toBe(400)
  })
  it('a map shorter than the view stays centred, shifted by the insets', () => {
    expect(clampCamera(0, 0, 400, 900, 1000, 800, { top: 40 }).y).toBe(380)
    expect(clampCamera(0, 0, 400, 900, 1000, 800, { top: 40, bottom: 20 }).y).toBe(390)
  })
})

describe('keepClearY', () => {
  it('moves the camera up just enough to clear the top band', () => {
    // view 300 tall, centre 100 -> top 100-150=-50; box top at -20 sits 30 below the view top; band 60 needs +30.
    expect(keepClearY(100, 300, -20, 40, 60, 0)).toBe(70)
  })
  it('leaves a clear box alone', () => {
    expect(keepClearY(100, 300, 40, 100, 60, 0)).toBe(100)
  })
  it('raises the camera when the box is under the bottom band', () => {
    expect(keepClearY(100, 300, 150, 240, 0, 40)).toBe(130)
  })
  it('the top band wins when both cannot be met', () => {
    expect(keepClearY(100, 100, 0, 90, 40, 40)).toBe(10)
  })
})
