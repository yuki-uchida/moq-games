import { describe, expect, it } from 'vitest'
import { BoxGrid } from '../src/render/core/box-grid'
import { clearLine, enemyMarkable } from '../src/render/markers'
import type { MapDef } from '../src/sim/types'

const wallMap = (): MapDef =>
  ({
    id: 'range',
    bounds: { min: [-50, -50], max: [50, 50] },
    boxes: [{ min: [-1, 0, 4], max: [1, 4, 5], kind: 'wall' }]
  }) as unknown as MapDef

const cam = { x: 0, y: 1.6, z: 0 }

describe('enemy marker line of sight', () => {
  const grid = new BoxGrid(wallMap())

  it('blocks a tag behind a wall', () => {
    expect(clearLine(grid, cam, 0, 1.6, 10)).toBe(false)
    expect(enemyMarkable(grid, cam, false, [0, 0, 10], 1.8)).toBe(false)
  })

  it('shows an enemy in the open or beside the wall', () => {
    expect(enemyMarkable(grid, cam, false, [6, 0, 10], 1.8)).toBe(true)
    expect(enemyMarkable(grid, cam, false, [0, 0, 3], 1.8)).toBe(true)
  })

  it('shows an enemy whose head is above the wall even if the feet are hidden', () => {
    expect(enemyMarkable(grid, cam, false, [0, 5, 7], 8)).toBe(true)
  })

  it('shows a revealed enemy through the wall', () => {
    expect(enemyMarkable(grid, cam, true, [0, 0, 10], 1.8)).toBe(true)
  })

  it('shows tags when no map is loaded yet', () => {
    expect(enemyMarkable(null, cam, false, [0, 0, 10], 1.8)).toBe(true)
  })
})
