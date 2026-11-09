/** A waiting companion aims at the nearest crystal or bell within reach when the せーの count reaches GO!. */
import { describe, expect, test } from 'vitest'
import type { LegendEntry } from '../src/sim/stage-data'
import { T, Pad, ctrlHero, customTower, customWorld, place, run } from './sim-helpers'

const map = ['##############', '#............#', '#.@..........#', '#..........c.#', '#............#', '##############']

const cases = [
  { name: 'crystal', char: 'c', kind: 'crystal', flag: 'crystals:G', make: customWorld },
  { name: 'bell', char: 'c', kind: 'bell', flag: 'bells:G', make: customTower }
] as const

describe('GO! aim of waiting companions', () => {
  for (const c of cases) {
    test(`a companion facing away still hits the ${c.name} next to it`, () => {
      const legend: Record<string, LegendEntry> = {
        c: { tile: c.name === 'bell' ? 'cliff' : 'grass', ent: { type: 'prop', kind: c.kind, group: 'G' } }
      }
      const { world, W } = c.make(map, { legend })
      const pad = new Pad(world)
      pad.mode()
      run(world, 0.05)
      const me = ctrlHero(W)
      const others = W.heroes.filter((h) => h !== me)
      const prop = W.props.find((p) => p.kind === c.kind)!
      others.forEach((h, i) => {
        if (i === 0) {
          place(h, prop.x - 40, prop.y)
          h.aim = Math.PI // facing away from the target
        } else place(h, T(1 + i), T(1))
        h.anchor = { x: h.body.x, y: h.body.y }
      })
      expect(W.flags.has(c.flag)).toBe(false)
      pad.signal()
      run(world, 4)
      expect(W.flags.has(c.flag)).toBe(true)
    })
  }
})
