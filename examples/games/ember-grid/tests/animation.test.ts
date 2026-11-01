import { describe, expect, it } from 'vitest'
import { readFileSync } from 'node:fs'
import { direction, route } from '../src/animation'
import { createGame } from '../src/game'
describe('accepted complete-cell animation contracts', () => {
  it('uses eight real directions without mirroring upward attacks', () => {
    expect(
      [
        [0, -1],
        [1, -1],
        [1, 0],
        [1, 1],
        [0, 1],
        [-1, 1],
        [-1, 0],
        [-1, -1]
      ].map(([x, y]) => direction({ x: 0, y: 0 }, { x, y }))
    ).toEqual(['n', 'ne', 'e', 'se', 's', 'sw', 'w', 'nw'])
  })
  it('walks around occupied cells and rocks using reachable geometry', () => {
    const g = createGame(),
      u = g.units[0]
    const path = route(g, g.units, u, { x: 2, y: 3 })
    expect(path.at(-1)).toMatchObject({ x: 2, y: 3 })
    path.slice(1).forEach((p, i) => {
      expect(Math.abs(p.x - path[i].x) + Math.abs(p.y - path[i].y)).toBe(1)
      expect(g.rocks.has(`${p.x},${p.y}`)).toBe(false)
      expect(g.units.some((other) => other.id !== u.id && other.x === p.x && other.y === p.y)).toBe(false)
    })
    expect(route(g, g.units, g.units[1], { x: 0, y: 5 })).toHaveLength(4)
  })
  for (const role of ['soldier', 'archer', 'mage', 'goblin', 'wolf'])
    it(`${role}: all runtime frames and contact events fit existing textures`, () => {
      const root = `public/tower-defense-art/${role}/`
      const registry = JSON.parse(readFileSync(`${root}runtime-registry.json`, 'utf8'))
      expect(registry.clips).toHaveLength(24)
      for (const entry of registry.clips) {
        const clip = JSON.parse(readFileSync(root + entry.manifest, 'utf8'))
        expect(clip.frames.length).toBeGreaterThan(1)
        for (const f of clip.frames) {
          expect(f.width).toBe(128)
          expect(f.height).toBe(112)
          expect(f.x + f.width).toBeLessThanOrEqual(clip.textureWidth)
          expect(f.y + f.height).toBeLessThanOrEqual(clip.textureHeight)
        }
        if (entry.motion === 'attack')
          expect(clip.events.some((e: { atMs: number }) => e.atMs > 0 && e.atMs < clip.durationMs)).toBe(true)
      }
    })
})
