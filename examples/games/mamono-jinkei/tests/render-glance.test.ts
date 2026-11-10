/** The solve glance never pushes the controlled hero off screen; off-screen targets get an edge arrow. */
import { describe, expect, test } from 'vitest'
import { GLANCE, MARKER_INSET, edgeMarker, glanceOffset } from '../src/render/camera'
import { TILE } from '../src/vocab'

describe('solve glance (camera)', () => {
  test('a near target gets the plain 45 % glance', () => {
    const g = glanceOffset(3 * TILE, -TILE, 1024, 576)
    expect(g.x).toBeCloseTo(3 * TILE * GLANCE.share)
    expect(g.y).toBeCloseTo(-TILE * GLANCE.share)
  })

  test('stage 1: the boss door 12 tiles from the crystals keeps the hero on screen with a margin', () => {
    for (const [w, h] of [
      [1024, 576],
      [768, 576],
      [320, 576]
    ]) {
      // Door 12 tiles up and 4 across from the hero.
      const g = glanceOffset(-4 * TILE, -12 * TILE - 40, w, h)
      // The hero sits at -g from the view centre (plus the cursor lead, at most 56 px).
      expect(Math.abs(g.x) + 56).toBeLessThanOrEqual(w / 2 - 60)
      expect(Math.abs(g.y) + 56).toBeLessThanOrEqual(h / 2 - 50)
      expect(Math.abs(g.y)).toBeGreaterThan(100)
    }
  })

  test('edge arrow: none inside the HUD-free box, else on its edge pointing at the target', () => {
    const { left, right, top, bottom } = MARKER_INSET
    expect(edgeMarker(500, 300, 1024, 576)).toBeUndefined()
    const cx = (left + 1024 - right) / 2
    const up = edgeMarker(cx, -400, 1024, 576)!
    expect(up.y).toBeCloseTo(top)
    expect(up.x).toBeCloseTo(cx)
    expect(up.angle).toBeCloseTo(-Math.PI / 2)
    const cy = (top + 576 - bottom) / 2
    const right1 = edgeMarker(3000, cy, 1024, 576)!
    expect(right1.x).toBeCloseTo(1024 - right)
    const down = edgeMarker(cx, 2000, 1024, 576)!
    expect(down.y).toBeCloseTo(576 - bottom)
  })
})
