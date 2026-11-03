import { describe, expect, it } from 'vitest'
import { clampView, frameView, limits, project, shows, unproject, type Metrics } from '../src/camera'

const phone: Metrics = { fit: 256, tilt: 0.95, width: 370, height: 520 }
const desktop: Metrics = { fit: 642, tilt: 0.6, width: 1236, height: 528 }
const centre = { x: 4.5, y: 4.5 }

describe('board camera', () => {
  it('inverts the floor projection', () => {
    for (const m of [phone, desktop])
      for (const cell of [
        { x: 0, y: 0 },
        { x: 9, y: 3 },
        { x: 2.25, y: 7.5 }
      ]) {
        const back = unproject(m, project(m, cell))
        expect(back.x).toBeCloseTo(cell.x, 9)
        expect(back.y).toBeCloseTo(cell.y, 9)
      }
    expect(project(phone, centre)).toEqual({ x: 0, y: 0 })
  })

  it('keeps the board on screen and limits the zoom', () => {
    for (const m of [phone, desktop]) {
      // Panning far away at the whole-board fit only uses the margin left for figures and tags.
      const view = clampView(m, { zoom: 0.5, x: 0, y: 9 })
      expect(view.zoom).toBe(1)
      expect(shows(m, view, [centre])).toBe(true)
      const { start, focus, max } = limits(m)
      expect(1 < start && start <= focus && focus <= max).toBe(true)
      expect(clampView(m, { zoom: 99, ...centre }).zoom).toBe(max)
    }
    // Phones start much closer than desktops, whose whole-board fit already has large tiles.
    expect(limits(phone).start).toBeGreaterThan(limits(desktop).start)
  })

  it('frames cells inside the field within the zoom bounds', () => {
    const cells = [
      { x: 1, y: 4 },
      { x: 2, y: 5 },
      { x: 7, y: 3 },
      { x: 8, y: 4 }
    ]
    for (const m of [phone, desktop]) {
      const view = frameView(m, cells, 1, limits(m).start)
      expect(view.zoom).toBeGreaterThan(1)
      expect(view.zoom).toBeLessThanOrEqual(limits(m).start)
      expect(shows(m, view, cells)).toBe(true)
      // The lower bound wins: a selection never zooms out below the current zoom.
      expect(frameView(m, cells, 3, 2).zoom).toBe(Math.min(3, limits(m).max))
    }
  })

  it('reports cells outside a close view', () => {
    const view = frameView(phone, [{ x: 1, y: 8 }], limits(phone).focus, limits(phone).focus)
    expect(shows(phone, view, [{ x: 1, y: 8 }])).toBe(true)
    expect(shows(phone, view, [{ x: 9, y: 0 }])).toBe(false)
  })
})
