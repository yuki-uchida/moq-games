import { describe, expect, it } from 'vitest'
import {
  animaGauge,
  countUp,
  crosshairFor,
  damageSources,
  directionAngle,
  feedEntry,
  formatAnima,
  formatClock,
  hitMarkerFor,
  pawCard,
  pickMvp,
  placings,
  radarPoint,
  spreadRadius,
  typedLength
} from '../src/ui/hud/model'
import { demoView } from '../src/ui/hud/demo-view'
import type { SimEvent } from '../src/sim/types'

describe('formatting', () => {
  it('formats clocks and anima', () => {
    expect(formatClock(0)).toBe('0:00')
    expect(formatClock(359.2, true)).toBe('6:00')
    expect(formatClock(61.9)).toBe('1:01')
    expect(formatClock(Infinity)).toBe('--:--')
    expect(formatAnima(0.2)).toBe('1')
    expect(formatAnima(0)).toBe('0')
    expect(formatAnima(84.1)).toBe('85')
  })

  it('builds the anima gauge with the burn ghost and the critical state', () => {
    const g = animaGauge({ anima: 50, maxAnima: 100, burn: 20 })
    expect(g).toMatchObject({ fraction: 0.5, ghost: 0.7, critical: false, label: '50', max: '100' })
    expect(animaGauge({ anima: 15, maxAnima: 100, burn: 0 }).critical).toBe(true)
    expect(animaGauge({ anima: 90, maxAnima: 100, burn: 50 }).ghost).toBe(1)
  })

  it('types text and counts up', () => {
    expect(typedLength('あいうえお', 0.1, 20)).toBe(2)
    expect(typedLength('あい', 10)).toBe(2)
    expect(countUp(900, 0)).toBe(0)
    expect(countUp(900, 5)).toBe(900)
    expect(countUp(900, 0.6)).toBeGreaterThan(450)
  })
})

describe('crosshair', () => {
  it('picks a style per antique', () => {
    expect(crosshairFor('bee')).toBe('spread')
    expect(crosshairFor('puffer')).toBe('ring')
    expect(crosshairFor('owl')).toBe('scope')
    expect(crosshairFor('swallow')).toBe('lock')
    expect(crosshairFor('orca')).toBe('arc')
    expect(crosshairFor('eel')).toBe('beam')
    expect(crosshairFor('hippo')).toBe('charge')
    expect(crosshairFor('armadillo')).toBe('none')
    expect(crosshairFor('frog')).toBe('gadget')
    expect(crosshairFor(null)).toBe('dot')
  })

  it('grows the spread circle with the spread', () => {
    expect(spreadRadius(3, 60, 720)).toBeGreaterThan(spreadRadius(1, 60, 720))
    expect(spreadRadius(0, 60, 720)).toBe(4)
  })
})

describe('paw cards', () => {
  it('describes the active antique and its list', () => {
    const c = pawCard({
      items: ['bee', 'hippo'],
      sel: 1,
      swap: 0,
      act: 'cooldown',
      charge: 0.4,
      cooldown: 1,
      uses: 3,
      combo: 0
    })
    expect(c).toMatchObject({ item: 'hippo', name: 'カバキャノン', cost: '4', cooldown: 0.5, charge: 0.4 })
    expect(c.list).toEqual([
      { item: 'bee', active: false },
      { item: 'hippo', active: true }
    ])
    expect(pawCard({ items: [], sel: -1, swap: 0, act: 'idle', charge: 0, cooldown: 0, uses: 0, combo: 0 }).item).toBe(
      null
    )
  })
})

describe('geometry', () => {
  it('puts things in front at the top of the radar', () => {
    const p = radarPoint([0, 0, 0], 0, [0, 0, 10], 40)
    expect(p?.[0]).toBeCloseTo(0)
    expect(p?.[1]).toBeCloseTo(-0.25)
    // facing +X (yaw π/2): a point at +X is in front
    const q = radarPoint([0, 0, 0], Math.PI / 2, [20, 0, 0], 40)
    expect(q?.[1]).toBeCloseTo(-0.5)
    // right of the player (right = (−cos yaw, 0, sin yaw) → −X at yaw 0) is right on the radar
    expect(radarPoint([0, 0, 0], 0, [-10, 0, 0], 40)?.[0]).toBeCloseTo(0.25)
    expect(radarPoint([0, 0, 0], 0, [0, 0, 100], 40)).toBeNull()
    const edge = radarPoint([0, 0, 0], 0, [0, 0, 100], 40, true)
    expect(edge?.[1]).toBeCloseTo(-1)
  })

  it('gives the direction of a damage source', () => {
    expect(directionAngle([0, 0, 0], 0, [0, 0, 5])).toBeCloseTo(0)
    expect(directionAngle([0, 0, 0], 0, [-5, 0, 0])).toBeCloseTo(Math.PI / 2)
    expect(Math.abs(directionAngle([0, 0, 0], 0, [0, 0, -5]))).toBeCloseTo(Math.PI)
  })
})

describe('events', () => {
  const view = demoView('pve', 30)
  const me = view.players[0].id

  it('classifies hit markers', () => {
    const hit = (extra: Partial<Extract<SimEvent, { type: 'hit' }>>): SimEvent => ({
      id: 1,
      t: 0,
      type: 'hit',
      target: 5,
      targetKind: 'foe',
      by: me,
      amount: 10,
      at: [0, 0, 0],
      surface: 'chitin',
      ...extra
    })
    expect(hitMarkerFor([hit({})], me)).toBe('hit')
    expect(hitMarkerFor([hit({}), hit({ head: true })], me)).toBe('head')
    expect(hitMarkerFor([hit({ by: 'bot1' })], me)).toBeNull()
    expect(hitMarkerFor([hit({ negated: true })], me)).toBeNull()
    const die: SimEvent = { id: 2, t: 0, type: 'foeDie', kind: 'tsubute', at: [0, 0, 0], by: me }
    expect(hitMarkerFor([hit({}), die], me)).toBe('ko')
  })

  it('finds damage sources and feed lines', () => {
    const foe = view.foes[0]
    const v = {
      ...view,
      events: [
        {
          id: 9,
          t: 0,
          type: 'hit' as const,
          target: me,
          targetKind: 'player' as const,
          by: foe.id,
          amount: 6,
          at: [0, 0, 0] as [number, number, number],
          surface: 'fur' as const
        }
      ]
    }
    expect(damageSources(v, me)).toEqual([{ at: foe.p, amount: 6 }])
    const ko = { id: 10, t: 0, type: 'ko' as const, who: foe.id, by: me, assists: [], item: 'bee' as const }
    expect(feedEntry(view, ko, me)).toMatchObject({ killer: view.players[0].name, weapon: 'ミツバチ', mine: true })
  })

  it('ranks PvP teams and picks an MVP', () => {
    expect(placings([5, 9, 5])).toEqual([
      { team: 1, score: 9, place: 1 },
      { team: 0, score: 5, place: 2 },
      { team: 2, score: 5, place: 2 }
    ])
    expect(pickMvp(view)).toBeDefined()
  })
})
