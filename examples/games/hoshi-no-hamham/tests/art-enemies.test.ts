import { describe, expect, test } from 'vitest'
import { ENEMY_KINDS, ENEMY_SPEC } from '../src/art/contract'
import { missingAnims, sheet } from '../src/art/index'
import { R } from '../src/art/palette'
import type { Raster } from '../src/art/raster'

/** The clip whose first frame stands for the enemy's silhouette. */
const MAIN = { walker: 'move', flyer: 'move', jumper: 'idle', spitter: 'idle', tough: 'move' } as const

/** Every palette index of the bandana ramp. */
const BANDANA = new Set<number>(R.bandana.slice(0, 4))

const mask = (f: Raster) => {
  const out = new Set<number>()
  f.data.forEach((c, i) => c && out.add(i))
  return out
}

/** Share of the larger painted mask that is not shared with the other (symmetric difference over the bigger one). */
const difference = (a: Set<number>, b: Set<number>) => {
  let common = 0
  for (const i of a) if (b.has(i)) common++
  const union = a.size + b.size - common
  return (union - common) / Math.max(a.size, b.size)
}

describe('the gang is drawn', () => {
  test('no clip is a stand-in', () => {
    for (const id of ENEMY_KINDS) expect(missingAnims(id), id).toEqual([])
  })

  test('every clip of the contract exists', () => {
    for (const id of ENEMY_KINDS)
      for (const name of Object.keys(ENEMY_SPEC[id])) expect(sheet(id)[name], `${id}#${name}`).toBeDefined()
  })

  test('the five silhouettes are distinguishable', () => {
    const masks = ENEMY_KINDS.map((id) => mask(sheet(id)[MAIN[id]].frames[0]))
    for (let i = 0; i < masks.length; i++)
      for (let j = i + 1; j < masks.length; j++)
        expect(difference(masks[i], masks[j]), `${ENEMY_KINDS[i]} vs ${ENEMY_KINDS[j]}`).toBeGreaterThan(0.35)
  })

  test('every frame of the main clip wears the red bandana', () => {
    for (const id of ENEMY_KINDS)
      for (const [i, f] of sheet(id)[MAIN[id]].frames.entries())
        expect(
          [...f.colors()].some((c) => BANDANA.has(c)),
          `${id}#${MAIN[id]} frame ${i}`
        ).toBe(true)
  })

  test('the frog’s two eyes rise above the rest of its silhouette in idle', () => {
    const f = sheet('jumper').idle.frames[0]
    const b = f.bounds()!
    // Runs of painted pixels along the topmost rows of the mask.
    const runs = (y: number) => {
      let n = 0
      let inRun = false
      for (let x = 0; x < f.w; x++) {
        const on = f.get(x, y) !== 0
        if (on && !inRun) n++
        inRun = on
      }
      return n
    }
    // Some row within the first rows of the silhouette holds exactly two separate bumps.
    const top = [0, 1, 2, 3].map((k) => runs(b.y + k))
    expect(Math.max(...top)).toBe(2)
    // and the bumps stand clear of the head: the rows below the eyes are one joined shape again.
    expect(runs(b.y + Math.floor(b.h * 0.6))).toBeLessThanOrEqual(2)
  })

  test('the mole is at least 1.25× the rat in area', () => {
    const mole = sheet('tough').idle.frames[0].count()
    const rat = sheet('walker').idle.frames[0].count()
    expect(mole / rat).toBeGreaterThanOrEqual(1.25)
  })

  test('the frog’s body colour is not the meadow’s grass green', () => {
    const grass = new Set<number>(R.grass.slice(0, 4))
    const all = new Map<number, number>()
    for (const f of sheet('jumper').idle.frames) for (const c of f.data) if (c) all.set(c, (all.get(c) ?? 0) + 1)
    const dominant = [...all.entries()].sort((a, b) => b[1] - a[1])[0][0]
    expect(grass.has(dominant)).toBe(false)
  })

  test('the last defeat frame still has pixels for the poof to cover', () => {
    for (const id of ENEMY_KINDS) {
      const frames = sheet(id).defeat.frames
      expect(frames[frames.length - 1].count(), id).toBeGreaterThan(40)
    }
  })
})
