import { describe, expect, test } from 'vitest'
import { missingAnims, sheet } from '../src/art/index'
import { R } from '../src/art/palette'
import type { Raster } from '../src/art/raster'

const BOSSES = ['bearBoss', 'apeBoss'] as const

const height = (f: Raster) => f.bounds()!.h
const painted = (f: Raster) => f.data.map((c) => (c ? 1 : 0))

describe('ヒョウタン熊 and ごりら警部', () => {
  for (const id of BOSSES) {
    test(`${id} has every clip drawn`, () => {
      expect(missingAnims(id)).toEqual([])
    })

    test(`${id} is much bigger than the hero`, () => {
      const hero = sheet('hero').idle.frames[0].count()
      expect(sheet(id).idle.frames[0].count()).toBeGreaterThanOrEqual(hero * 4)
    })

    test(`${id} squashes on the slam and crouches in the wind-up`, () => {
      const s = sheet(id)
      const standing = height(s.idle.frames[0])
      expect(height(s.land.frames[0])).toBeLessThan(standing)
      expect(height(s.windup.frames[s.windup.frames.length - 1])).toBeLessThan(standing)
    })
  }

  test('only the gorilla wears the gang bandana', () => {
    const uses = (id: string) => {
      const colors = sheet(id).idle.frames[0].colors()
      return R.bandana.slice(0, 4).some((c) => colors.has(c))
    }
    expect(uses('apeBoss')).toBe(true)
    expect(uses('bearBoss')).toBe(false)
  })

  test('the two silhouettes differ clearly', () => {
    const a = painted(sheet('bearBoss').idle.frames[0])
    const b = painted(sheet('apeBoss').idle.frames[0])
    let both = 0
    let either = 0
    for (let i = 0; i < a.length; i++) {
      if (a[i] || b[i]) either++
      if (a[i] && b[i]) both++
    }
    expect(1 - both / either).toBeGreaterThan(0.3)
  })
})
