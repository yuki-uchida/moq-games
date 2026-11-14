import { describe, expect, it } from 'vitest'
import { BoxGrid } from '../src/render/core/box-grid'
import { clearLine, enemyMarkable, placedWalls } from '../src/render/markers'
import type { MapDef, PropView } from '../src/sim/types'

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

describe('enemy marker line of sight past placed walls', () => {
  // open ground: no map box between the camera and the enemy
  const grid = new BoxGrid({ ...wallMap(), boxes: [] } as MapDef)
  // a ヤドカリ wall (2.5 m high, 4 m wide along x) 4 m in front of the camera; the enemy 8 m away behind it
  const wall: PropView = { id: 3, kind: 'hermit', p: [0, 0, 4], yaw: 0, team: 1, t: 0, owner: 'e' }
  const walls = placedWalls([wall, { id: 4, kind: 'honey', p: [0, 0, 2], yaw: 0, team: 1, t: 0, r: 3 }])

  it('takes only the ヤドカリ walls', () => {
    expect(walls).toHaveLength(1)
    expect(walls[0].max[1]).toBeCloseTo(wall.p[1] + 2.5)
  })

  it('hides the name of an enemy behind a placed wall', () => {
    expect(clearLine(grid, cam, 0, 1.6, 8, walls)).toBe(false)
    expect(enemyMarkable(grid, cam, false, [0, 0, 8], 1.8, walls)).toBe(false)
    // also with no map loaded yet
    expect(enemyMarkable(null, cam, false, [0, 0, 8], 1.8, walls)).toBe(false)
  })

  it('shows it without the wall, beside the wall, or when revealed (sonar)', () => {
    expect(enemyMarkable(grid, cam, false, [0, 0, 8], 1.8)).toBe(true)
    expect(enemyMarkable(grid, cam, false, [6, 0, 8], 1.8, walls)).toBe(true)
    expect(enemyMarkable(grid, cam, true, [0, 0, 8], 1.8, walls)).toBe(true)
  })

  it('an enemy standing in front of the wall is not hidden by it', () => {
    expect(enemyMarkable(grid, cam, false, [0, 0, 3], 1.8, walls)).toBe(true)
  })
})
