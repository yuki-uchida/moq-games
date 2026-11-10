import { describe, expect, it } from 'vitest'
import { MAPS } from '../src/game/maps'
import { STAGES } from '../src/game/stages'

const PROP_CHARS = new Set(['T', 'N', 'P', 'H', 'A', 'R', '1', '2', 'x', 'y', '*', 't', 'b', 's', 'G', 'n', '@', 'E', 'F', 'J', 'K', 'U', 'B'])
const SOLID_CHARS = new Set(['#'])

describe('map integrity', () => {
  it('keeps the player, exit and boss out of solid terrain', () => {
    const problems: string[] = []
    for (const stage of STAGES) {
      const map = stage.map
      const at = (x: number, y: number) => map[y]?.[x] ?? '#'
      for (const ch of ['@', 'G', 'n', 'B']) {
        for (let y = 0; y < map.length; y++) {
          const x = map[y].indexOf(ch)
          if (x < 0) continue
          if (SOLID_CHARS.has(at(x, y))) problems.push(`${stage.id}: ${ch} inside terrain at ${x},${y}`)
          if (at(x, y + 1) === '.' || at(x, y + 1) === undefined) {
            // Floating is fine for the boss and enemies, but the player and exit should stand on something.
            if (ch === '@' || ch === 'G' || ch === 'n') problems.push(`${stage.id}: ${ch} floats at ${x},${y}`)
          }
        }
      }
    }
    expect(problems).toEqual([])
  })

  it('never stacks two props in the same cell', () => {
    const problems: string[] = []
    for (const stage of STAGES) {
      const seen = new Map<string, string>()
      stage.map.forEach((row, y) => {
        ;[...row].forEach((ch, x) => {
          if (!PROP_CHARS.has(ch)) return
          const key = `${x},${y}`
          if (seen.has(key)) problems.push(`${stage.id}: ${seen.get(key)} and ${ch} share ${key}`)
          seen.set(key, ch)
        })
      })
    }
    expect(problems).toEqual([])
  })

  it('gives every stage a reachable-looking exit inside the arena', () => {
    const problems: string[] = []
    for (const stage of STAGES) {
      const map = stage.map
      const width = map[0].length
      const goal = map.map((row, y) => ({ row, y })).find(({ row }) => row.includes('G') || row.includes('n'))
      if (!goal) {
        problems.push(`${stage.id}: no exit`)
        continue
      }
      const x = goal.row.indexOf(goal.row.includes('G') ? 'G' : 'n')
      if (x < 2 || x > width - 3) problems.push(`${stage.id}: exit at ${x} is too close to a wall`)
    }
    expect(problems).toEqual([])
  })
})
