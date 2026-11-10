import { describe, expect, it } from 'vitest'
import { MAP_BUILDERS, SURFACE } from '../src/game/maps'
import { STAGES } from '../src/game/stages'
import { World, emptyInput } from '../src/game/sim'

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

  it('gives every stage a gimmick the player must bite through', () => {
    const problems: string[] = []
    for (const stage of STAGES) {
      const map = stage.map
      const digWall = map.some((row, y) => y <= SURFACE - 1 && row.includes('D'))
      const switchDoor = map.some((row) => row.includes('1') || row.includes('2'))
      const collect = stage.objective === 'collect'
      if (!digWall && !switchDoor && !collect) problems.push(`${stage.id}: no diggable wall, switch or collection`)
    }
    expect(problems).toEqual([])
  })

  it('puts the princess on screen in the stages where the story needs her', () => {
    const problems: string[] = []
    for (const stage of STAGES) {
      const map = stage.map
      const present = map.some((row) => row.includes('h') || row.includes('c'))
      const needed = ['stage-2', 'stage-3', 'stage-4', 'stage-6', 'stage-8', 'stage-10'].includes(stage.id)
      if (needed && !present) problems.push(`${stage.id}: the princess never appears`)
      if (!needed && present) problems.push(`${stage.id}: unexpected princess`)
    }
    expect(problems).toEqual([])
  })

  it('never stacks a prop more than four cells above where it was drawn', () => {
    const problems: string[] = []
    for (const [id, builder] of Object.entries(MAP_BUILDERS)) {
      for (const entry of builder.shifted) {
        const match = entry.match(/^(\S+) (\d+),(\d+) -> (\d+),(\d+)$/)
        if (!match) continue
        const [, , , from, , to] = match.map(Number)
        if (Math.abs((from ?? 0) - (to ?? 0)) > 4) problems.push(`${id}: ${entry}`)
      }
      for (const entry of builder.shifted) {
        if (/^[@Gn] /.test(entry)) problems.push(`${id}: the exit or the player start moved: ${entry}`)
      }
    }
    expect(problems).toEqual([])
  })

  it('starts every stage without an enemy on top of the player', () => {
    const problems: string[] = []
    for (const stage of STAGES) {
      const world = new World(stage, { seed: 3 })
      world.step(1 / 60, emptyInput())
      const p = world.player
      for (const enemy of world.enemies) {
        if (Math.abs(enemy.x - p.x) < 60 && Math.abs(enemy.y - p.y) < 60) {
          problems.push(`${stage.id}: enemy starts ${Math.round(enemy.x - p.x)}px from the player`)
        }
      }
    }
    expect(problems).toEqual([])
  })

  it('puts every door after the switch that opens it, with no gap above it', () => {
    const problems: string[] = []
    for (const stage of STAGES) {
      const map = stage.map
      const width = map[0].length
      const switches: { x: number; id: number }[] = []
      const doors: { x: number; id: number }[] = []
      for (let y = 0; y < map.length; y++) {
        for (let x = 0; x < width; x++) {
          const ch = map[y][x]
          if (ch === '1' || ch === '2') switches.push({ x, id: Number(ch) })
          if (ch === 'x' || ch === 'y') doors.push({ x, id: ch === 'x' ? 1 : 2 })
        }
      }
      for (const door of doors) {
        const before = switches.filter((sw) => sw.id === door.id && sw.x < door.x)
        if (!before.length) problems.push(`${stage.id}: door ${door.id} at x=${door.x} has no switch before it`)
      }
      // A door must be a solid run from row 8 to the surface, so it cannot be jumped over.
      for (let x = 0; x < width; x++) {
        const ch = map[8][x]
        if (ch !== 'x' && ch !== 'y') continue
        for (let y = 8; y <= SURFACE - 1; y++) {
          if (map[y][x] !== ch) problems.push(`${stage.id}: door at x=${x} has a gap at row ${y}`)
        }
      }
    }
    expect(problems).toEqual([])
  })

  it('cuts real pits into the surface of every stage', () => {
    const problems: string[] = []
    for (const stage of STAGES) {
      const map = stage.map
      let pits = 0
      for (let x = 0; x < map[0].length; x++) {
        // A real pit is open at the surface and through the row below it.
        if (map[SURFACE]?.[x] !== '#' && map[SURFACE + 1]?.[x] !== '#') pits++
      }
      if (pits < 2) problems.push(`${stage.id}: only ${pits} pit columns`)
    }
    expect(problems).toEqual([])
  })
})
