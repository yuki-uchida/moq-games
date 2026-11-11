import { readdirSync, readFileSync, statSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, test } from 'vitest'
import { THEMES, allSheetSpecs } from '../src/art/contract'
import { hasArt, hasBackdrop, hasTerrain, missingAnims, pendingArt } from '../src/art/index'

// Clip frame counts, sizes, fps and loop flags are checked against the contract in art-contract.test.ts.

describe('the art is complete', () => {
  test('nothing is pending: no sheet, terrain or backdrop is missing', () => {
    expect(pendingArt()).toEqual({ sheets: {}, terrain: [], backdrops: [] })
  })

  test('every sheet in the contract has a module and draws every clip', () => {
    for (const id of Object.keys(allSheetSpecs())) {
      expect(hasArt(id), `${id} has no module`).toBe(true)
      expect(missingAnims(id), `${id} lacks clips`).toEqual([])
    }
  })

  test('every theme has terrain and a backdrop', () => {
    for (const theme of THEMES) {
      expect(hasTerrain(theme), `${theme} terrain`).toBe(true)
      expect(hasBackdrop(theme), `${theme} backdrop`).toBe(true)
    }
  })

  test('nothing under src imports a legacy or placeholder path', () => {
    const files: string[] = []
    const walk = (dir: string) => {
      for (const name of readdirSync(dir)) {
        const path = join(dir, name)
        if (statSync(path).isDirectory()) walk(path)
        else if (/\.tsx?$/.test(name)) files.push(path)
      }
    }
    walk(join(__dirname, '../src'))
    expect(files.length).toBeGreaterThan(50)
    const offenders = files.filter((file) =>
      [...readFileSync(file, 'utf8').matchAll(/(?:from|import)\s*\(?\s*['"]([^'"]+)['"]/g)].some((m) =>
        /legacy|placeholder/i.test(m[1])
      )
    )
    expect(offenders).toEqual([])
  })
})
