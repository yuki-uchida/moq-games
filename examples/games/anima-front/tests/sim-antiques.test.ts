/** Every antique use kind and passive (DESIGN §6) driven through real inputs. */
import { describe, expect, it } from 'vitest'
import { ITEMS } from '../src/data/items'
import { canPerceive, inkBetween } from '../src/sim/actors'
import { damagePlayer } from '../src/sim/combat'
import { FOE_SIDE } from '../src/sim/state'
import { BTN } from '../src/sim/types'
import { aimAt, rig, target } from './sim-helpers'
import { makeLoadout } from '../src/data/loadout'
import { playerCfg as basePlayerCfg } from './sim-maps'

/** Plain targets: a pistol and no passives (no jelly/armour skewing numbers). */
const playerCfg = (id: string, o: { team: 0 | 1 | 2 }) =>
  basePlayerCfg(id, { ...o, loadout: makeLoadout(['bee'], [], []) })

const front = (r: ReturnType<typeof rig>, d: number, h = 0): [number, number, number] => {
  const p = r.player()
  return [p.p[0], h, p.p[2] + d]
}

describe('melee', () => {
  it('combo walks 0,1,2 and hits each press', () => {
    const r = rig({ r: ['claw'] })
    const t = target(r, front(r, 1.6))
    r.step(2)
    for (let i = 0; i < 3; i++) {
      r.press('R')
      r.step(16)
    }
    const sw = r.of('swing')
    expect(sw.map((e) => e.combo)).toEqual([0, 1, 2])
    expect(1000 - (t.hp ?? 0)).toBeCloseTo(36, 3)
    r.step(60)
    r.press('R')
    expect(r.of('swing').at(-1)!.combo).toBe(0)
  })

  it('slash hits once per press and guards when held', () => {
    const r = rig({ r: ['orca'] })
    const t = target(r, front(r, 2.2))
    r.step(2)
    r.press('R')
    expect(1000 - (t.hp ?? 0)).toBeCloseTo(26, 3)
    const p = r.player()
    r.input().presses.r++
    r.input().held |= BTN.R
    r.step(31)
    expect(p.hands[0].mode).toBe('guard')
    expect(r.of('swing').length).toBe(2)
    const before = p.anima
    const melee = damagePlayer(r.sim, p, {
      amount: 20,
      kind: 'melee',
      side: FOE_SIDE,
      at: front(r, 1, 1),
      from: front(r, 2)
    })
    expect(melee).toBe(0)
    expect(before - p.anima).toBeCloseTo(0.3, 3)
    const ranged = damagePlayer(r.sim, p, {
      amount: 20,
      kind: 'ranged',
      side: FOE_SIDE,
      at: front(r, 1, 1),
      from: front(r, 9)
    })
    expect(ranged).toBeCloseTo(8, 3)
    const back = damagePlayer(r.sim, p, {
      amount: 20,
      kind: 'ranged',
      side: FOE_SIDE,
      at: front(r, -1, 1),
      from: front(r, -9)
    })
    expect(back).toBeCloseTo(20, 3)
  })

  it('lunge travels ~7 m and hits everything on the path once', () => {
    const r = rig({ r: ['narwhal'] })
    const a = target(r, front(r, 3))
    const b = target(r, front(r, 5.5))
    r.step(2)
    const z0 = r.player().p[2]
    r.press('R')
    r.step(30)
    expect(r.player().p[2] - z0).toBeGreaterThan(5)
    expect(1000 - (a.hp ?? 0)).toBeCloseTo(36, 3)
    expect(1000 - (b.hp ?? 0)).toBeCloseTo(36, 3)
  })

  it('slam hits only after its wind-up, all around the impact point', () => {
    const r = rig({ r: ['mammoth'] })
    const t = target(r, front(r, 2.5))
    r.step(2)
    r.press('R')
    r.step(15)
    expect(t.hp).toBe(1000)
    r.step(10)
    expect(1000 - (t.hp ?? 0)).toBeCloseTo(48, 3)
  })
})

describe('ranged', () => {
  it('semi: a tap fires exactly once, holding repeats at the interval', () => {
    const r = rig({ r: ['bee'] })
    r.step(2)
    r.press('R')
    r.step(30)
    expect(r.of('fire').length).toBe(1)
    r.press('R', 60)
    // 1 s held at 0.18 s → 6 shots (first on press).
    expect(r.of('fire').length).toBeGreaterThanOrEqual(6)
    expect(r.of('fire').length).toBeLessThanOrEqual(7)
  })

  it('semi shots fly toward the aim point and hit the target with head multiplier on the head', () => {
    const r = rig({ r: ['bee'], extra: [playerCfg('foe', { team: 1 })] })
    const enemy = r.player('foe')
    enemy.p = [r.player().p[0], 0, r.player().p[2] + 15]
    r.step(2)
    aimAt(r, [enemy.p[0], enemy.p[1] + enemy.h - enemy.species.headRadius, enemy.p[2]])
    r.press('R')
    r.step(20)
    const hit = r.of('hit').find((e) => e.target === 'foe')
    expect(hit).toBeTruthy()
    expect(hit!.head).toBe(true)
    expect(hit!.amount).toBeCloseTo(15, 3)
  })

  it('auto: fires at its rate while held; spread grows then recovers', () => {
    const r = rig({ r: ['wood'] })
    r.step(2)
    r.press('R', 60)
    const n = r.of('fire').length
    expect(n).toBeGreaterThanOrEqual(8)
    expect(n).toBeLessThanOrEqual(10)
    const u = ITEMS.wood.use!
    expect(r.player().hands[0].bloom).toBeGreaterThan(u.kind === 'auto' ? (u.spreadMax - u.spread) * 0.9 : 0)
    r.step(60)
    expect(r.player().hands[0].bloom).toBe(0)
  })

  it('spread: one press → 9 pellets that fade with distance', () => {
    const near = rig({ r: ['puffer'] })
    const tn = target(near, front(near, 4, 0))
    near.step(2)
    aimAt(near, [tn.p[0], 1, tn.p[2]])
    near.press('R')
    near.step(30)
    expect(near.of('fire').length).toBe(1)
    expect(near.sim.players[0].stats.shots).toBe(9)
    const far = rig({ r: ['puffer'] })
    const tf = target(far, front(far, 20, 0))
    far.step(2)
    aimAt(far, [tf.p[0], 1, tf.p[2]])
    far.press('R')
    far.step(30)
    const dn = near.of('hit').reduce((s, e) => s + e.amount, 0)
    const df = far.of('hit').reduce((s, e) => s + e.amount, 0)
    expect(dn).toBeGreaterThan(0)
    expect(df / far.of('hit').length).toBeLessThan(dn / near.of('hit').length)
  })

  it('zoom: hold steadies over 0.35 s, release fires; a tap fires once', () => {
    const r = rig({ r: ['owl'] })
    r.step(2)
    r.input().presses.r++
    r.input().held |= BTN.R
    r.step(25)
    const h = r.player().hands[0]
    expect(h.mode).toBe('zoom')
    expect(h.charge).toBe(1)
    expect(r.of('fire').length).toBe(0)
    r.input().held = 0
    r.step(1)
    expect(r.of('fire').length).toBe(1)
    r.step(80)
    r.press('R')
    r.step(2)
    expect(r.of('fire').length).toBe(2)
  })

  it('lock: locks targets in the cone over time and fires homing darts', () => {
    const r = rig({ r: ['swallow'], extra: [playerCfg('e1', { team: 1 }), playerCfg('e2', { team: 1 })] })
    const me = r.player()
    r.player('e1').p = [me.p[0] - 1, 0, me.p[2] + 25]
    r.player('e2').p = [me.p[0] + 1, 0, me.p[2] + 25]
    r.step(2)
    aimAt(r, [me.p[0], 1, me.p[2] + 25])
    r.input().presses.r++
    r.input().held |= BTN.R
    r.step(45)
    expect(me.hands[0].locks.length).toBe(2)
    r.input().held = 0
    r.step(1)
    expect(r.sim.shots.filter((s) => s.homing).length).toBe(2)
    r.step(90)
    expect(r.of('hit').filter((e) => e.item === 'swallow').length).toBe(2)
  })

  it('lock: releasing without locks fires one straight dart', () => {
    const r = rig({ r: ['swallow'] })
    r.step(2)
    r.press('R')
    r.step(1)
    expect(r.sim.shots.length).toBe(1)
    expect(r.sim.shots[0].homing).toBeNull()
  })

  it('lob: bounces and explodes after its fuse, or at once on a foe', () => {
    const r = rig({ r: ['pillbug'] })
    r.step(2)
    r.press('R')
    r.step(70)
    expect(r.of('blast').length).toBe(0)
    r.step(30)
    expect(r.of('blast').length).toBe(1)
    const e = rig({ r: ['pillbug'], extra: [playerCfg('foe', { team: 1 })] })
    e.player('foe').p = [e.player().p[0], 0, e.player().p[2] + 4]
    e.step(2)
    aimAt(e, [e.player('foe').p[0], 0.8, e.player('foe').p[2]])
    e.press('R')
    e.step(30)
    expect(e.of('blast').length).toBe(1)
    expect(e.of('hit').some((h) => h.target === 'foe' && h.amount > 20)).toBe(true)
  })

  it('beam: drains per second, damages and chains to a second target', () => {
    const r = rig({ r: ['eel'], extra: [playerCfg('e1', { team: 1 }), playerCfg('e2', { team: 1 })] })
    const me = r.player()
    r.player('e1').p = [me.p[0], 0, me.p[2] + 10]
    r.player('e2').p = [me.p[0] + 2.5, 0, me.p[2] + 10]
    r.step(2)
    aimAt(r, [me.p[0], 0.7, me.p[2] + 10])
    const a0 = me.anima
    r.press('R', 60)
    expect(a0 - me.anima).toBeGreaterThan(5)
    expect(a0 - me.anima).toBeLessThan(7.5)
    const d1 = r
      .of('hit')
      .filter((e) => e.target === 'e1')
      .reduce((s, e) => s + e.amount, 0)
    const d2 = r
      .of('hit')
      .filter((e) => e.target === 'e2')
      .reduce((s, e) => s + e.amount, 0)
    expect(d1).toBeGreaterThan(45)
    expect(d2).toBeGreaterThan(d1 * 0.4)
    expect(d2).toBeLessThan(d1 * 0.6)
  })

  it('charge: a tap charges 0.8 s then fires once; cost 11; explodes', () => {
    const r = rig({ r: ['hippo'] })
    r.step(2)
    const a0 = r.player().anima
    r.press('R')
    r.step(40)
    expect(r.of('fire').length).toBe(0)
    r.step(12)
    expect(r.of('fire').length).toBe(1)
    expect(a0 - r.player().anima).toBeCloseTo(11, 1)
    r.step(120)
    expect(r.of('blast').length).toBe(1)
  })
})

describe('armour and gadgets', () => {
  it('shield blocks the front (cost ×0.3), slows to 70 % and keeps its paw', () => {
    const r = rig({ r: ['bee'], l: ['armadillo', 'frog'] })
    r.step(2)
    const p = r.player()
    r.input().presses.l++
    r.input().held |= BTN.L
    r.step(5)
    r.input().selL = 1
    r.step(5)
    expect(p.hands[1].mode).toBe('shield')
    expect(p.hands[1].sel).toBe(0)
    const before = p.anima
    damagePlayer(r.sim, p, { amount: 30, kind: 'ranged', side: FOE_SIDE, at: front(r, 1, 1), from: front(r, 10) })
    expect(before - p.anima).toBeCloseTo(9, 1)
    r.input().mz = 1
    r.step(40)
    expect(Math.hypot(p.v[0], p.v[2])).toBeCloseTo(6.8 * 0.7, 1)
    r.input().held = 0
    r.step(2)
    expect(p.hands[1].mode).toBe('idle')
  })

  it('frog pad is placed on the floor and launches whoever steps on it', () => {
    const r = rig({ r: ['bee'], l: ['frog'] })
    r.step(2)
    aimAt(r, front(r, 4, 0))
    r.press('L')
    const pad = r.sim.props.find((x) => x.kind === 'frog')!
    expect(pad).toBeTruthy()
    expect(r.of('deploy').length).toBe(1)
    r.input().pitch = 0
    r.input().mz = 1
    r.step(60)
    expect(r.of('launch').length).toBeGreaterThanOrEqual(1)
    expect(r.player().p[1]).toBeGreaterThan(2)
  })

  it('gecko hook pulls toward the hit point', () => {
    const r = rig({
      r: ['bee'],
      l: ['gecko'],
      map: { ...rigMapWithWall() }
    })
    r.step(2)
    aimAt(r, [r.player().p[0], 3, 10])
    r.press('L')
    expect(r.of('hook').length).toBe(1)
    const z0 = r.player().p[2]
    r.step(30)
    expect(r.player().p[2] - z0).toBeGreaterThan(8)
  })

  it('leaf cloak toggles, drains, hides beyond 5 m and attacking reveals', () => {
    const r = rig({ r: ['bee'], l: ['leaf'] })
    r.step(2)
    r.press('L')
    const p = r.player()
    expect(p.cloakOn).toBe(true)
    const a0 = p.anima
    r.step(60)
    expect(a0 - p.anima).toBeCloseTo(2.5, 0)
    expect(canPerceive(r.sim, [p.p[0], 1, p.p[2] + 10], p, false)).toBe(false)
    expect(canPerceive(r.sim, [p.p[0], 1, p.p[2] + 3], p, false)).toBe(true)
    r.press('R')
    expect(canPerceive(r.sim, [p.p[0], 1, p.p[2] + 10], p, false)).toBe(true)
    r.step(70)
    expect(canPerceive(r.sim, [p.p[0], 1, p.p[2] + 10], p, false)).toBe(false)
    r.press('L')
    expect(p.cloakOn).toBe(false)
  })

  it('bat pulse reveals enemies within 50 m for 6 s', () => {
    const r = rig({ r: ['bee'], l: ['bat'], extra: [playerCfg('e', { team: 1 })] })
    r.player('e').p = [0, 0, 20]
    r.step(2)
    r.press('L')
    expect(r.of('reveal').length).toBe(1)
    expect(r.world.view().players.find((x) => x.id === 'e')!.revealed).toBe(true)
    r.step(6 * 60)
    expect(r.world.view().players.find((x) => x.id === 'e')!.revealed).toBe(false)
  })

  it('octopus ink makes a cloud that blocks sight', () => {
    const r = rig({ r: ['bee'], l: ['octopus'] })
    r.step(2)
    r.press('L')
    r.step(120)
    const ink = r.sim.props.find((x) => x.kind === 'ink')
    expect(ink).toBeTruthy()
    const c = ink!.p
    expect(inkBetween(r.sim, [c[0] - 10, 1, c[2]], [c[0] + 10, 1, c[2]])).toBe(true)
  })

  it('pigeon decoy runs forward for 6 s', () => {
    const r = rig({ r: ['bee'], l: ['pigeon'] })
    r.step(2)
    r.press('L')
    const d = r.sim.props.find((x) => x.kind === 'decoy')!
    const z0 = d.p[2]
    r.step(60)
    expect(d.p[2] - z0).toBeGreaterThan(5)
    r.step(6 * 60)
    expect(r.sim.props.some((x) => x.kind === 'decoy')).toBe(false)
  })

  it('hermit wall blocks enemy shots but lets its own side through', () => {
    const r = rig({ r: ['bee'], l: ['hermit'], extra: [playerCfg('e', { team: 1 }), playerCfg('ally', { team: 0 })] })
    const me = r.player()
    r.step(2)
    aimAt(r, front(r, 5, 0))
    r.press('L')
    const wall = r.sim.props.find((x) => x.kind === 'hermit')!
    expect(wall).toBeTruthy()
    expect(r.sim.phys.dyn.length).toBe(1)
    // An enemy shooting from behind the wall hits the wall.
    const e = r.player('e')
    e.p = [me.p[0], 0, wall.p[2] + 6]
    r.input('e').presses.r++
    aimAt(r, [me.p[0], 1, me.p[2]], 'e')
    r.step(30)
    expect(wall.hp).toBeLessThan(250)
    // My own shot passes through.
    aimAt(r, [e.p[0], e.p[1] + 0.6, e.p[2]])
    r.press('R')
    r.step(20)
    expect(r.of('hit').some((h) => h.target === 'e')).toBe(true)
  })

  it('honey jar heals allies around it', () => {
    const r = rig({ r: ['bee'], l: ['honeyant'] })
    r.step(2)
    const p = r.player()
    p.anima = 50
    r.press('L')
    expect(p.anima).toBeCloseTo(50 - 9, 0)
    r.step(120)
    expect(p.anima).toBeGreaterThan(41 + 7)
    expect(r.of('heal').some((e) => e.source === 'honey')).toBe(true)
  })
})

describe('passives and mods', () => {
  it('turtle reduces damage by 25 % (+30 % per rhino) and slows 4 %', () => {
    const r = rig({ r: ['bee'], passive: ['turtle'] })
    r.step(2)
    const p = r.player()
    const got = damagePlayer(r.sim, p, { amount: 40, kind: 'ranged', side: FOE_SIDE, at: p.p, from: front(r, 5) })
    expect(got).toBeCloseTo(30, 3)
    const r2 = rig({ r: ['bee'], passive: ['turtle', 'rhino'] })
    const p2 = r2.player()
    expect(damagePlayer(r2.sim, p2, { amount: 40, kind: 'ranged', side: FOE_SIDE, at: p2.p, from: p2.p })).toBeCloseTo(
      40 * (1 - 0.325),
      3
    )
    r.input().mz = 1
    r.step(30)
    expect(Math.hypot(p.v[0], p.v[2])).toBeCloseTo(6.8 * 0.96, 2)
  })

  it('jelly negates one hit every 5 s', () => {
    const r = rig({ r: ['bee'], passive: ['jelly'] })
    r.step(2)
    const p = r.player()
    const hit = () => damagePlayer(r.sim, p, { amount: 10, kind: 'ranged', side: FOE_SIDE, at: p.p, from: p.p })
    expect(hit()).toBe(0)
    expect(hit()).toBe(10)
    r.step(5 * 60)
    expect(hit()).toBe(0)
    expect(r.world.view().players[0].negateAt).toBeGreaterThan(5)
  })

  it('momonga glides while falling with jump held (drains), owls glide for free', () => {
    for (const [species, passive, free] of [
      ['shiba', ['momonga'], false],
      ['owl', [], true]
    ] as const) {
      const r = rig({ r: ['bee'], passive: [...passive], species })
      const p = r.player()
      r.step(2)
      p.p[1] = 20
      p.grounded = false
      r.input().held |= BTN.JUMP
      const a0 = p.anima
      r.step(60)
      expect(p.move).toBe('glide')
      expect(p.v[1]).toBeGreaterThanOrEqual(-2.21)
      if (free) expect(p.anima).toBeCloseTo(a0, 3)
      else expect(a0 - p.anima).toBeGreaterThan(0.9)
    }
  })

  it('enhancements stack: three fangs add 45 % melee damage and 30 % melee cost', () => {
    const r = rig({ r: ['claw'], passive: ['fang', 'fang', 'fang'] })
    const t = target(r, front(r, 1.6))
    r.step(2)
    const a0 = r.player().anima
    r.press('R')
    expect(1000 - (t.hp ?? 0)).toBeCloseTo(12 * 1.45, 3)
    expect(a0 - r.player().anima).toBeCloseTo(0.3 * 1.3, 3)
  })

  it('bear melee +20 %', () => {
    const r = rig({ r: ['claw'], species: 'bear' })
    const t = target(r, front(r, 1.8))
    r.step(2)
    r.press('R')
    expect(1000 - (t.hp ?? 0)).toBeCloseTo(14.4, 3)
  })
})

describe('paws', () => {
  it('switches from the absolute index with a 0.25 s swap; paws stay independent', () => {
    const r = rig({ r: ['bee', 'wood'], l: ['bee'] })
    r.step(2)
    r.input().selR = 1
    r.step(1)
    expect(r.of('swap').length).toBe(1)
    expect(r.of('swap')[0].item).toBe('wood')
    r.press('R')
    expect(r.of('fire').filter((e) => e.hand === 'R').length).toBe(0)
    r.press('L')
    expect(r.of('fire').filter((e) => e.hand === 'L').length).toBe(1)
    r.step(15)
    // The queued right press fires after the swap.
    expect(r.of('fire').filter((e) => e.hand === 'R' && e.item === 'wood').length).toBe(1)
    r.input().selR = 1
    r.step(5)
    expect(r.of('swap').length).toBe(1)
  })

  it('the same antique in both paws alternates fire', () => {
    const r = rig({ r: ['bee'], l: ['bee'] })
    r.step(2)
    r.input().presses.r++
    r.input().presses.l++
    r.input().held = BTN.R | BTN.L
    r.step(60)
    const fires = r.of('fire')
    const hands = fires.map((e) => e.hand)
    for (let i = 1; i < hands.length; i++) expect(hands[i]).not.toBe(hands[i - 1])
    expect(fires.length).toBeGreaterThanOrEqual(10)
  })
})

function rigMapWithWall() {
  return {
    id: 'range' as const,
    name: 'wall',
    theme: 'day' as const,
    bounds: { min: [-40, -40] as [number, number], max: [40, 40] as [number, number] },
    boxes: [
      {
        min: [-10, 0, 10] as [number, number, number],
        max: [10, 8, 12] as [number, number, number],
        kind: 'wall' as const
      }
    ],
    spawns: [{ team: 'squad' as const, p: [0, 0, -10] as [number, number, number], yaw: 0 }],
    bases: [],
    foeSpawns: [],
    pads: [],
    anchors: {},
    paths: {},
    decor: []
  }
}
