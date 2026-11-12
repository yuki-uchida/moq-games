import { describe, expect, it } from 'vitest'
import { BOX_STYLES, DECOR_KINDS, MODE_NAMES } from '../src/data/map-vocab'
import { buildArena, rotXZ } from '../src/sim/maps/arena'
import { buildBlight } from '../src/sim/maps/blight'
import { buildHarbor } from '../src/sim/maps/harbor'
import { getMap, MAP_IDS, MAP_VARIANTS } from '../src/sim/maps/index'
import { buildOldtown } from '../src/sim/maps/oldtown'
import { buildRange } from '../src/sim/maps/range'
import { boxAt, pathBlocked, reach, solidBoxes, standsOnSomething } from '../src/sim/maps/reach'
import type { MapBox, MapDef, MapId, V3 } from '../src/sim/types'

type Variant = 'night' | 'crater' | undefined
const CASES: [MapId, Variant][] = MAP_IDS.flatMap((id) => [
  [id, undefined] as [MapId, Variant],
  ...MAP_VARIANTS[id].map((v) => [id, v] as [MapId, Variant])
])
const label = ([id, v]: [MapId, Variant]): string => (v ? `${id}:${v}` : id)

const inBounds = (m: MapDef, p: V3): boolean =>
  p[0] > m.bounds.min[0] && p[0] < m.bounds.max[0] && p[2] > m.bounds.min[1] && p[2] < m.bounds.max[1]

/** Every named point the modes use, plus all spawns and pads. */
function points(m: MapDef): { what: string; p: V3; air?: boolean }[] {
  return [
    ...m.spawns.map((s, i) => ({ what: `spawn ${s.team}#${i}`, p: s.p })),
    ...m.foeSpawns.map((f) => ({ what: `foe ${f.id}`, p: f.p, air: f.air })),
    ...Object.entries(m.anchors).map(([n, p]) => ({ what: `anchor ${n}`, p })),
    ...Object.entries(m.paths).flatMap(([n, pts]) => pts.map((p, i) => ({ what: `path ${n}[${i}]`, p }))),
    ...m.pads.map((p, i) => ({ what: `pad #${i}`, p: p.p }))
  ]
}

/** True when the segment a→b passes through a solid box that is not a floor. */
function occluded(m: MapDef, a: V3, b: V3): boolean {
  const boxes = solidBoxes(m).filter((x) => x.kind !== 'ground' && x.kind !== 'road' && x.kind !== 'barrier')
  return boxes.some((x: MapBox) => {
    let t0 = 0
    let t1 = 1
    for (let k = 0; k < 3; k++) {
      const d = b[k] - a[k]
      if (Math.abs(d) < 1e-9) {
        if (a[k] < x.min[k] || a[k] > x.max[k]) return false
        continue
      }
      let u0 = (x.min[k] - a[k]) / d
      let u1 = (x.max[k] - a[k]) / d
      if (u0 > u1) [u0, u1] = [u1, u0]
      t0 = Math.max(t0, u0)
      t1 = Math.min(t1, u1)
      if (t0 > t1) return false
    }
    return true
  })
}

describe.each(CASES)('map %s', (id, variant) => {
  const m = getMap(id, variant)
  const name = label([id, variant])

  it('provides every name its modes rely on', () => {
    const need = MODE_NAMES[id]
    for (const a of need.anchors) expect(m.anchors[a], `${name} anchor ${a}`).toBeDefined()
    for (const p of need.paths) expect(m.paths[p]?.length ?? 0, `${name} path ${p}`).toBeGreaterThanOrEqual(2)
    const tags = new Set(m.foeSpawns.flatMap((f) => f.tags ?? []))
    for (const t of need.tags) expect(tags.has(t), `${name} foe tag ${t}`).toBe(true)
    for (const t of need.tags) {
      const ground = m.foeSpawns.filter((f) => f.tags?.includes(t) && !f.air).length
      if (t !== 'air') expect(ground, `${name} ground spawns tagged ${t}`).toBeGreaterThanOrEqual(1)
    }
    expect(m.spawns.length).toBeGreaterThanOrEqual(4)
    expect(m.bases.length).toBeGreaterThanOrEqual(1)
    for (const b of m.bases) expect(b.r).toBeGreaterThanOrEqual(7)
  })

  it('has well-formed boxes within budget', () => {
    expect(m.boxes.length).toBeLessThanOrEqual(700)
    for (const b of m.boxes) {
      for (let k = 0; k < 3; k++) expect(b.min[k], `${name} ${b.kind} min<max`).toBeLessThan(b.max[k])
      const styles = BOX_STYLES[b.kind] as Record<number, string>
      expect(styles[b.style ?? 0], `${name} ${b.kind} style ${b.style}`).toBeDefined()
      if (b.kind === 'ground' && b.style === 7) expect(b.solid).toBe(false)
    }
  })

  it('dresses the map with known decor', () => {
    expect(m.decor.length).toBeGreaterThanOrEqual(id === 'arena' ? 60 : 80)
    const kinds = new Set<string>(DECOR_KINDS)
    for (const d of m.decor) {
      expect(kinds.has(d.kind), `${name} decor ${d.kind}`).toBe(true)
      expect(inBounds(m, d.p), `${name} decor ${d.kind} in bounds`).toBe(true)
      const buried = boxAt(m, [d.p[0], d.p[1] + 0.3, d.p[2]], 0.02)
      expect(buried, `${name} decor ${d.kind} at ${d.p.join(',')} buried in ${buried?.kind}`).toBeUndefined()
    }
  })

  it('covers the playable area with floor tiles', () => {
    const floors = m.boxes.filter((b) => b.kind === 'ground' || b.kind === 'road')
    for (let x = m.bounds.min[0] + 1; x < m.bounds.max[0]; x += 5) {
      for (let z = m.bounds.min[1] + 1; z < m.bounds.max[1]; z += 5) {
        const ok = floors.some(
          (b) => x >= b.min[0] && x <= b.max[0] && z >= b.min[2] && z <= b.max[2] && b.max[1] <= 0.001
        )
        expect(ok, `${name} floor at ${x},${z}`).toBe(true)
      }
    }
  })

  it('places every point inside the bounds, outside solids, on a surface', () => {
    for (const { what, p, air } of points(m)) {
      expect(inBounds(m, p), `${name} ${what} in bounds`).toBe(true)
      expect(boxAt(m, p), `${name} ${what} inside a solid box`).toBeUndefined()
      // Head room for a standing character.
      expect(boxAt(m, [p[0], p[1] + 1.2, p[2]]), `${name} ${what} head room`).toBeUndefined()
      if (air) {
        expect(p[1], `${name} ${what} air height`).toBeGreaterThanOrEqual(8)
        expect(p[1], `${name} ${what} air height`).toBeLessThanOrEqual(15)
      } else expect(standsOnSomething(m, p), `${name} ${what} stands on a surface`).toBe(true)
    }
  })

  it('lets the players walk (steps ≤ 0.45 m, fixed pads) to every foe spawn, anchor and path point', () => {
    const grid = reach(m)
    for (const { what, p, air } of points(m)) {
      if (air) continue
      expect(grid.isReached(p), `${name} ${what} reachable`).toBe(true)
    }
    // Nothing escapes the map: no reached floor outside the bounds margin.
    let outside = 0
    for (let i = 0; i < grid.nodeH.length; i++) if (grid.reached[i] && grid.nodeH[i] < -5) outside++
    expect(outside).toBe(0)
  }, 20000)

  it('keeps ground foe spawns out of sight of the squad bases (PvE)', () => {
    if (id === 'arena' || id === 'range') return
    for (const b of m.bases) {
      const eye: V3 = [b.p[0], b.p[1] + 1.2, b.p[2]]
      for (const f of m.foeSpawns) {
        if (f.air) continue
        const target: V3 = [f.p[0], f.p[1] + 1.0, f.p[2]]
        expect(occluded(m, eye, target), `${name} ${f.id} visible from base at ${b.p.join(',')}`).toBe(true)
      }
    }
  })

  it('keeps pads clear overhead for the 13 m launch', () => {
    const boxes = solidBoxes(m)
    for (const pad of m.pads) {
      expect(standsOnSomething(m, pad.p), `${name} pad on a surface`).toBe(true)
      const [x, y, z] = pad.p
      const hit = boxes.find(
        (b) =>
          b.min[0] < x + 0.5 &&
          b.max[0] > x - 0.5 &&
          b.min[2] < z + 0.5 &&
          b.max[2] > z - 0.5 &&
          b.min[1] > y + 0.05 &&
          b.min[1] < y + 12
      )
      expect(hit, `${name} pad at ${pad.p.join(',')} blocked above`).toBeUndefined()
    }
  })
})

describe('mode-specific layout', () => {
  it('oldtown: bases are [lighthouse, cart start]; the cart route is long and clear for a 1.6 m cart', () => {
    for (const v of [undefined, 'night'] as const) {
      const m = getMap('oldtown', v)
      const cart = m.paths.cart
      expect(cart.length).toBeGreaterThanOrEqual(8)
      const len = cart.slice(1).reduce((s, p, i) => s + Math.hypot(p[0] - cart[i][0], p[2] - cart[i][2]), 0)
      expect(len).toBeGreaterThan(120)
      expect(len).toBeLessThan(170)
      expect(m.bases.length).toBe(2)
      const d = (a: V3, b: V3): number => Math.hypot(a[0] - b[0], a[2] - b[2])
      expect(d(m.bases[0].p, m.anchors.lighthouse)).toBeLessThan(20)
      expect(d(m.bases[1].p, cart[0])).toBeLessThan(20)
      expect(d(cart[cart.length - 1], m.anchors.gate)).toBeLessThan(3)
      expect(pathBlocked(m, cart, 0.8)).toBeUndefined()
      for (const f of m.foeSpawns.filter((s) => s.tags?.includes('air'))) expect(f.air).toBe(true)
    }
  })

  it('oldtown night keeps the day layout', () => {
    const day = getMap('oldtown')
    const night = getMap('oldtown', 'night')
    expect(day.theme).toBe('day')
    expect(night.theme).toBe('night')
    expect(JSON.stringify(night.boxes)).toBe(JSON.stringify(day.boxes))
    expect(JSON.stringify(night.anchors)).toBe(JSON.stringify(day.anchors))
  })

  it('harbor: capture points run from the landing site toward the sea', () => {
    const m = getMap('harbor')
    const base = m.bases[0].p
    const da = Math.hypot(m.anchors.zoneA[0] - base[0], m.anchors.zoneA[2] - base[2])
    const db = Math.hypot(m.anchors.zoneB[0] - base[0], m.anchors.zoneB[2] - base[2])
    const dc = Math.hypot(m.anchors.zoneC[0] - base[0], m.anchors.zoneC[2] - base[2])
    expect(da).toBeLessThan(db)
    expect(db).toBeLessThan(dc)
    const water = m.boxes.filter((b) => b.kind === 'ground' && b.style === 7)
    const sea = m.anchors.sea
    expect(
      water.some((w) => sea[0] >= w.min[0] && sea[0] <= w.max[0] && sea[2] >= w.min[2] && sea[2] <= w.max[2])
    ).toBe(true)
  })

  it('blight: nodes sit in distinct sub-areas; the crater variant opens the bowl', () => {
    const m = getMap('blight')
    const n = ['node1', 'node2', 'node3'].map((k) => m.anchors[k])
    for (let i = 0; i < 3; i++)
      for (let j = i + 1; j < 3; j++) expect(Math.hypot(n[i][0] - n[j][0], n[i][2] - n[j][2])).toBeGreaterThan(60)
    const c = getMap('blight', 'crater')
    const centre = c.anchors.crater
    const tall = (map: MapDef): MapBox[] =>
      solidBoxes(map).filter(
        (b) =>
          b.kind !== 'ground' &&
          b.max[1] - centre[1] > 2 &&
          Math.hypot((b.min[0] + b.max[0]) / 2 - centre[0], (b.min[2] + b.max[2]) / 2 - centre[2]) < 26
      )
    expect(tall(c)).toHaveLength(0)
    expect(tall(m).length).toBeGreaterThan(3)
    const g = reach(c)
    // The bowl floor (r ≤ 9 m) is open and walkable.
    for (let x = -9; x <= 9; x += 1.5)
      for (let z = -9; z <= 9; z += 1.5)
        if (Math.hypot(x, z) <= 9) expect(g.isReached([centre[0] + x, centre[1], centre[2] + z])).toBe(true)
  }, 20000)

  it('arena: three bases 120° apart, 4 spawns each, rotationally symmetric', () => {
    const m = getMap('arena')
    for (const t of [0, 1, 2] as const) {
      expect(m.bases.filter((b) => b.team === t)).toHaveLength(1)
      expect(m.spawns.filter((s) => s.team === t)).toHaveLength(4)
    }
    const th = (Math.PI * 2) / 3
    for (const t of [0, 1, 2] as const) {
      const next = ((t + 1) % 3) as 0 | 1 | 2
      const b = m.bases.find((x) => x.team === t)!
      const nb = m.bases.find((x) => x.team === next)!
      const [x, z] = rotXZ(b.p[0], b.p[2], th)
      expect(Math.hypot(x - nb.p[0], z - nb.p[2])).toBeLessThan(1)
      for (const s of m.spawns.filter((sp) => sp.team === t)) {
        const [sx, sz] = rotXZ(s.p[0], s.p[2], th)
        const match = m.spawns.find((o) => o.team === next && Math.hypot(o.p[0] - sx, o.p[2] - sz) < 1)
        expect(match, `spawn of team ${t} rotated`).toBeDefined()
        const dy = Math.abs(((((match!.yaw - s.yaw - th) % (2 * Math.PI)) + 3 * Math.PI) % (2 * Math.PI)) - Math.PI)
        expect(dy).toBeLessThan(0.05)
        // Spawns face the plaza.
        const toward = Math.atan2(-s.p[0], -s.p[2])
        const err = Math.abs(((((s.yaw - toward) % (2 * Math.PI)) + 3 * Math.PI) % (2 * Math.PI)) - Math.PI)
        expect(err).toBeLessThan(0.5)
      }
    }
    // Pads are symmetric too.
    for (const p of m.pads) {
      const [x, z] = rotXZ(p.p[0], p.p[2], th)
      expect(m.pads.some((o) => Math.hypot(o.p[0] - x, o.p[2] - z) < 1 && Math.abs(o.p[1] - p.p[1]) < 0.01)).toBe(true)
    }
  })

  it('range: tutorial checkpoints run in order along a walkable track', () => {
    const m = getMap('range')
    const g = reach(m)
    for (let i = 1; i <= 8; i++) expect(g.isReached(m.anchors[`tutorial${i}`])).toBe(true)
    expect(m.anchors.tutorial3[1]).toBeGreaterThan(0.9) // on the ledge
    expect(m.anchors.tutorial4[1]).toBeGreaterThan(1.5) // across the gap
    for (const p of ['mover1', 'mover2']) expect(pathBlocked(m, m.paths[p], 0.5, 1.2)).toBeUndefined()
  })
})

describe('getMap', () => {
  it('is deterministic and cached', () => {
    const builders = {
      oldtown: buildOldtown,
      harbor: buildHarbor,
      blight: buildBlight,
      arena: buildArena,
      range: buildRange
    }
    for (const [id, v] of CASES) {
      expect(getMap(id, v)).toBe(getMap(id, v))
      const f = builders[id] as (v?: Variant) => MapDef
      expect(JSON.stringify(f(v))).toBe(JSON.stringify(f(v)))
      expect(JSON.stringify(getMap(id, v))).toBe(JSON.stringify(f(v)))
    }
    expect(Object.isFrozen(getMap('oldtown').boxes[0])).toBe(true)
    // Unknown variants fall back to the base map.
    expect(getMap('harbor', 'night')).toBe(getMap('harbor'))
  })

  it('builds quickly', () => {
    const t = performance.now()
    for (let i = 0; i < 5; i++)
      for (const [id, v] of CASES)
        (
          ({ oldtown: buildOldtown, harbor: buildHarbor, blight: buildBlight, arena: buildArena, range: buildRange })[
            id
          ] as (v?: Variant) => MapDef
        )(v)
    expect((performance.now() - t) / 5).toBeLessThan(250)
  })
})
