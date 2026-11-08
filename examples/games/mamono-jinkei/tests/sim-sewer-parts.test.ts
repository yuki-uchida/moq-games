import { describe, expect, test } from 'vitest'
import { spawnEnemy } from '../src/sim/enemies'
import { VALVE } from '../src/sim/props'
import type { LegendEntry } from '../src/sim/stage-data'
import type { WorldState } from '../src/sim/state'
import { DT, STAMPEDE } from '../src/sim/tables'
import { T, Pad, ctrlHero, customSewer, hero, parkCompanions, part, place, run, until, walkTo } from './sim-helpers'

const legend: Record<string, LegendEntry> = {
  V: { tile: 'sewer', ent: { type: 'prop', kind: 'valve', group: 'G' } },
  Z: {
    tile: 'sewer',
    ent: { type: 'prop', kind: 'sluice', id: 'sluice', cond: { flag: 'valves:G' }, latch: true, stops: [] }
  },
  m: { tile: 'sewer', ent: { type: 'prop', kind: 'mousetrap', id: 'trap' } },
  n: { tile: 'sewer', ent: { type: 'prop', kind: 'mousetrap', id: 'trap2' } },
  r: { tile: 'sewer', ent: { type: 'prop', kind: 'barrel', id: 'barrel' } },
  c: { tile: 'sewer', ent: { type: 'prop', kind: 'crate', id: 'crate' } },
  O: { tile: 'sewer', multi: true, ent: { type: 'prop', kind: 'bigcrate', id: 'big', weight: 4 } },
  C: { tile: 'sewer', ent: { type: 'prop', kind: 'cheese', id: 'cheese', weight: 3 } },
  U: { tile: 'sewer', multi: true, ent: { type: 'prop', kind: 'scale', id: 'scale', accepts: 'cheese' } },
  G: { tile: 'sewer', ent: { type: 'prop', kind: 'gate', id: 'door', cond: { on: 'scale' }, latch: true } },
  v: { tile: 'current', ent: { type: 'current', channel: 'E', dx: 0, dy: 1 } },
  B: { tile: 'sewer', multi: true, ent: { type: 'prop', kind: 'barricade', id: 'bar' } }
}

describe('valves and the sluice', () => {
  const map = [
    '##############',
    '#............#',
    '#.@..........#',
    '#.V........V.#',
    '#............#',
    '#...Z........#',
    '##############'
  ]

  function setup() {
    const r = customSewer(map, { legend })
    const pad = new Pad(r.world)
    parkCompanions(r.world, r.W, pad, [
      [12, 4],
      [1, 1],
      [12, 1]
    ])
    return { ...r, pad, valves: r.W.props.filter((p) => p.kind === 'valve') }
  }

  test('E turns a valve in 1 s; moving cancels it', () => {
    const { world, W, pad, valves } = setup()
    const me = ctrlHero(W)
    place(me, T(2), T(4))
    pad.interact()
    run(world, 0.3)
    expect(valves[0].state).toBe('turn')
    expect(me.state).toBe('grip')
    pad.move(1, 0)
    run(world, 0.1)
    expect(valves[0].state).toBe('off')
    pad.move(0, 0)
    place(me, T(2), T(4))
    run(world, 0.1)
    pad.interact()
    run(world, VALVE.turn + 0.05)
    expect(valves[0].state).toBe('on')
    // Alone it turns back after the 1.5 s window.
    run(world, VALVE.window + 0.1)
    expect(valves[0].state).toBe('off')
    expect(W.flags.has('valves:G')).toBe(false)
  })

  test('both valves within 1.5 s (a staying companion acts on GO) open the sluice', () => {
    const { world, W, pad, valves } = setup()
    const me = ctrlHero(W)
    const c = hero(W, 1)
    place(c, T(11), T(4))
    c.anchor = { x: c.body.x, y: c.body.y }
    place(me, T(2), T(4))
    pad.signal()
    run(world, 3 - DT * 2)
    pad.interact()
    run(world, VALVE.turn + 0.3)
    expect(valves.every((v) => v.state === 'on')).toBe(true)
    expect(W.flags.has('valves:G')).toBe(true)
    expect(until(world, () => part(W, 'sluice').state === 'open', 1)).toBe(true)
    run(world, 3)
    expect(valves.every((v) => v.state === 'on')).toBe(true)
  })
})

describe('mousetraps, barrels and crates', () => {
  const map = [
    '##############',
    '#............#',
    '#.@..........#',
    '#..m.....n...#',
    '#..r....c....#',
    '#........~...#',
    '##############'
  ]

  test('stepping on a trap snaps it: 1 dmg and snared 1.5 s', () => {
    const { world, W } = customSewer(map, { legend })
    const pad = new Pad(world)
    parkCompanions(world, W, pad)
    const me = ctrlHero(W)
    const hp = me.hp
    place(me, T(3) - 40, T(3))
    run(world, 0.5, () => pad.move(1, 0))
    expect(part(W, 'trap').state).toBe('snap')
    expect(me.hp).toBe(hp - 1)
    expect(me.snared).toBeGreaterThan(W.t)
    const x = me.body.x
    run(world, 1, () => pad.move(1, 0))
    expect(Math.abs(me.body.x - x)).toBeLessThan(2)
    expect(world.view().heroes.find((h) => h.slot === me.slot)?.snared).toBeGreaterThan(W.t)
    run(world, 0.6, () => pad.move(1, 0))
    expect(me.body.x).toBeGreaterThan(x + 20)
  })

  test('a thrown barrel and a pushed crate disarm traps; a crate fills sludge', () => {
    const { world, W } = customSewer(map, { legend })
    const pad = new Pad(world)
    parkCompanions(world, W, pad)
    const me = ctrlHero(W)
    place(me, T(3), T(4) + 50)
    me.body.facing = -Math.PI / 2
    pad.interact()
    run(world, 0.1)
    expect(part(W, 'barrel').state).toBe('lifted')
    // Three tiles east of the trap, throw it west.
    place(me, T(3) + 3 * 64 + 10, T(3))
    run(world, DT)
    pad.aim(Math.PI).tap()
    run(world, 1)
    expect(part(W, 'trap').state).toBe('snap')
    expect(part(W, 'barrel').gone).toBe(true)
    // Crate (weight 1): one hero pushes it north onto the second trap, then south into the sludge.
    const crate = part(W, 'crate')
    place(me, T(8), T(4) + 49)
    expect(
      until(
        world,
        () => crate.y <= T(3) && crate.state === 'idle',
        3,
        () => pad.move(0, -1)
      )
    ).toBe(true)
    expect(part(W, 'trap2').state).toBe('idle')
    pad.move(0, 0)
    // Around and push it east, then south into the sludge at (9,5).
    place(me, T(7) + 15, T(3))
    expect(
      until(
        world,
        () => crate.x >= T(9) && crate.state === 'idle',
        3,
        () => pad.move(1, 0)
      )
    ).toBe(true)
    expect(part(W, 'trap2').state).toBe('snap')
    place(me, T(9), T(2) + 15)
    expect(
      until(
        world,
        () => crate.gone,
        4,
        () => pad.move(0, 1)
      )
    ).toBe(true)
    expect(world.view().fills).toContain(W.grid!.idx(9, 5))
  })

  test('a big crate needs four', () => {
    const { world, W } = customSewer(
      [
        '##############',
        '#............#',
        '#.@..........#',
        '#....OO......#',
        '#....OO......#',
        '#............#',
        '#............#',
        '##############'
      ],
      { legend }
    )
    const pad = new Pad(world)
    const me = ctrlHero(W)
    const big = part(W, 'big')
    const y0 = big.y
    place(me, T(5) + 32, T(3) - 17)
    W.heroes.filter((h) => h !== me).forEach((h, i) => place(h, T(4) + i * 40, T(2) - 10))
    expect(
      until(
        world,
        () => big.y > y0,
        4,
        () => pad.move(0, 1)
      )
    ).toBe(true)
    expect(big.strength).toBe(4)
  })
})

describe('cheese across a current onto the scale', () => {
  const map = [
    '################',
    '#..............#',
    '#.@............#',
    '#....vvv.......#',
    '#.UU.vvv...C...#',
    '#....vvv.......#',
    '#....~~~.......#',
    '###G############',
    '#..............#',
    '################'
  ]

  test('three carriers in formation cross the canal; the scale opens the granary door', () => {
    const { world, W } = customSewer(map, { legend })
    const pad = new Pad(world)
    const me = ctrlHero(W)
    const cheese = part(W, 'cheese')
    place(me, cheese.x + 60, cheese.y)
    W.heroes.filter((h) => h !== me).forEach((h, i) => place(h, cheese.x + 40, cheese.y - 40 + i * 40))
    run(world, 0.3)
    me.body.facing = Math.PI
    pad.interact()
    expect(until(world, () => cheese.state === 'lifted', 4)).toBe(true)
    const scale = part(W, 'scale')
    expect(
      until(
        world,
        () => scale.on,
        15,
        () => {
          const dx = scale.x - cheese.x
          const dy = scale.y - cheese.y
          const d = Math.hypot(dx, dy) || 1
          pad.move(dx / d, dy / d)
        }
      )
    ).toBe(true)
    expect(cheese.delivered).toBe(true)
    expect(W.heroes.every((h) => h.state !== 'fall')).toBe(true)
    expect(until(world, () => part(W, 'door').state === 'open', 1)).toBe(true)
  })
})

describe('チューチュー大行進 (stampede)', () => {
  const map = [
    '####################',
    '#..................#',
    '#.@................#',
    '#..................#',
    '#..................#',
    '#..................#',
    '#..................#',
    '#..................#',
    '#.......BB.........#',
    '#..................#',
    '#..................#',
    '####################'
  ]

  function stampedeWith(W: WorldState, world: Parameters<typeof run>[0], pad: Pad, slots: number[], aim: number) {
    const me = ctrlHero(W)
    parkCompanions(world, W, pad)
    slots
      .filter((s) => s !== me.slot)
      .forEach((s, i) => {
        const h = hero(W, s)
        place(h, me.body.x + (i - 1) * 40, me.body.y + 30)
        h.anchor = { x: h.body.x, y: h.body.y }
      })
    pad.aim(aim).attack()
    run(world, 1)
    pad.release()
    run(world, DT)
  }

  test('tiers: line up, run 6/8/10 tiles, hit every enemy on the path once', () => {
    for (const n of [2, 3, 4]) {
      const { world, W } = customSewer(map, { legend })
      const pad = new Pad(world)
      const me = ctrlHero(W)
      place(me, T(2), T(5))
      const dummies = [3, 5, 7, 9, 11].map((tx) => {
        const e = spawnEnemy(W, 'thief', T(2 + tx), T(5))
        e.hp = e.maxHp = 100
        e.stun = 1e9
        return e
      })
      stampedeWith(W, world, pad, [0, 1, 2, 3].slice(0, n), 0)
      expect(W.techs[0]?.kind).toBe('stampede')
      expect(world.view().techs[0].stage).toBe('form')
      expect(W.techs[0].tier).toBe(n)
      run(world, STAMPEDE.form + DT)
      expect(world.view().techs[0].stage).toBe('run')
      expect(until(world, () => !W.techs.length, 3)).toBe(true)
      const len = STAMPEDE.len[n] / 64
      const dmg = STAMPEDE.dmg[n] * 1.2
      for (const [i, tx] of [3, 5, 7, 9, 11].entries()) {
        const e = dummies[i]
        if (tx < len - 0.5) expect(100 - e.hp, `tier ${n} dummy ${tx}`).toBeGreaterThanOrEqual(dmg - 0.01)
        else if (tx > len + 1) expect(100 - e.hp, `tier ${n} dummy ${tx}`).toBeLessThan(dmg)
      }
      expect(Math.abs(me.body.x - (T(2) + STAMPEDE.len[n]))).toBeLessThan(70)
      expect(me.force?.kind).toBe('warp')
    }
  })

  test('gnaws a barricade that nothing else breaks', () => {
    const { world, W } = customSewer(map, { legend })
    const pad = new Pad(world)
    const me = ctrlHero(W)
    const bar = part(W, 'bar')
    place(me, bar.x, bar.y - 60)
    pad.aim(Math.PI / 2).tap()
    run(world, 0.5)
    expect(bar.state).toBe('idle')
    place(me, bar.x, T(2))
    stampedeWith(W, world, pad, [0, 1, 2], Math.PI / 2)
    expect(until(world, () => bar.state === 'break', 2)).toBe(true)
    run(world, 1)
    expect(bar.gone).toBe(true)
    expect(me.body.y).toBeGreaterThan(bar.y)
    void walkTo
  })
})
