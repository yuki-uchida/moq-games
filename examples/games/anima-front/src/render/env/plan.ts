/**
 * Environment planning: MapDef → merged geometry batches per (material, chunk), instanced decor prototypes with
 * their transforms, particle emitters and budget numbers. Pure (no DOM, no WebGL), so the draw-call budget and
 * coverage of every box kind/style and decor kind are unit-tested.
 */
import * as THREE from 'three'
import type { DecorKind } from '../../data/map-vocab'
import type { MapDef } from '../../sim/types'
import { buildBox } from './boxes'
import { ENV_MATERIALS, hash01, type Emitter, type EnvCtx, type EnvMat } from './ctx'
import { DECOR, EMITTER_DECOR, INSTANCED_DECOR, isDecorKind } from './decor'
import { GeoBuilder, rng } from './geo'
import type { ThemeDef } from './themes'
import type { TileName } from './atlas'

export interface ChunkBatch {
  mat: EnvMat
  /** Chunk grid cell (or 'far' for the backdrop ring). */
  cell: string
  geo: GeoBuilder
}

export interface InstancedBatch {
  key: string
  mat: EnvMat
  geo: GeoBuilder
  /** Column-major 4×4 matrices, 16 floats per instance. */
  matrices: Float32Array
  count: number
}

export interface EnvPlan {
  chunks: ChunkBatch[]
  instanced: InstancedBatch[]
  emitters: Emitter[]
  /** Unknown decor kinds and box kinds that were skipped (for diagnostics). */
  skipped: string[]
  stats: { drawCalls: number; shadowCasters: number; triangles: number; vertices: number }
}

export interface PlanOptions {
  density: number
  chunk: number
}

const BASE_TILE: Record<ThemeDef['id'], TileName> = {
  day: 'tGrass',
  sunset: 'tConcrete',
  night: 'tGrass',
  blight: 'tCrystal',
  virtual: 'tVirtual'
}

export function planEnvironment(map: MapDef, theme: ThemeDef, opts: PlanOptions): EnvPlan {
  const batches = new Map<string, ChunkBatch>()
  const emitters: Emitter[] = []
  const skipped: string[] = []
  const chunk = opts.chunk
  const random = rng(hashString(map.id) ^ 0x5eed)
  const cellOf = (x: number, z: number) => `${Math.floor(x / chunk)},${Math.floor(z / chunk)}`
  const get = (mat: EnvMat, cell: string) => {
    const key = `${mat}|${cell}`
    let b = batches.get(key)
    if (!b) batches.set(key, (b = { mat, cell, geo: new GeoBuilder() }))
    return b.geo
  }
  const ctx: EnvCtx = {
    theme,
    rand: random,
    at: (mat, x, z) => get(mat, cellOf(x, z)),
    density: opts.density,
    night: theme.nightGlow,
    accent: theme.accentGlow,
    overgrowth: theme.id !== 'virtual',
    emit: (e) => emitters.push(e),
    covered: coverage(map)
  }

  baseGround(map, theme, ctx, get)
  backdrop(map, theme, ctx, (mat) => get(mat, 'far'))

  for (const box of map.boxes) {
    try {
      buildBox(box, ctx)
    } catch (err) {
      skipped.push(`box:${box.kind}:${box.style ?? 0}:${(err as Error).message}`)
    }
  }

  // Decor: merged unique pieces, instanced repeats.
  const protos = new Map<string, { kind: DecorKind; style: number; geos: Map<EnvMat, GeoBuilder>; m: number[] }>()
  const m4 = new THREE.Matrix4()
  const q = new THREE.Quaternion()
  const up = new THREE.Vector3(0, 1, 0)
  const pos = new THREE.Vector3()
  const scl = new THREE.Vector3()
  const poles = new Map<number, [number, number, number][]>()
  for (const d of map.decor) {
    if (!isDecorKind(d.kind)) {
      skipped.push(`decor:${d.kind}`)
      continue
    }
    const kind = d.kind
    const style = d.style ?? 0
    const s = d.s ?? 1
    const yaw = d.yaw ?? 0
    if (EMITTER_DECOR.has(kind)) {
      emitters.push({ kind: 'petals', p: [d.p[0], d.p[1] + 3, d.p[2]], r: 4 * s, rate: 2 })
      continue
    }
    // Scattered small decor thins out with the quality density (never below one in three).
    if (INSTANCED_DECOR.has(kind) && (kind === 'grass' || kind === 'flowers' || kind === 'debris')) {
      if (hash01(d.p[0], d.p[1], d.p[2], 9) > Math.max(0.34, opts.density)) continue
    }
    m4.compose(pos.set(d.p[0], d.p[1], d.p[2]), q.setFromAxisAngle(up, yaw), scl.set(s, s, s))
    if (INSTANCED_DECOR.has(kind)) {
      const key = `${kind}:${style}`
      let proto = protos.get(key)
      if (!proto) {
        const geos = new Map<EnvMat, GeoBuilder>()
        DECOR[kind](
          (mat) => {
            let g = geos.get(mat)
            if (!g) geos.set(mat, (g = new GeoBuilder()))
            return g
          },
          style,
          ctx
        )
        protos.set(key, (proto = { kind, style, geos, m: [] }))
      }
      for (const e of m4.elements) proto.m.push(e)
      continue
    }
    const used: GeoBuilder[] = []
    DECOR[kind](
      (mat) => {
        const g = ctx.at(mat, d.p[0], d.p[2])
        g.matrix.copy(m4)
        used.push(g)
        return g
      },
      style,
      ctx
    )
    for (const g of used) g.identity()
    if (kind === 'pole') {
      let list = poles.get(style)
      if (!list) poles.set(style, (list = []))
      list.push([d.p[0], d.p[1], d.p[2]])
    }
  }
  // Wires between consecutive poles of the same style.
  for (const list of poles.values()) {
    for (let i = 1; i < list.length; i++) {
      const a = list[i - 1]
      const b = list[i]
      const dist = Math.hypot(b[0] - a[0], b[2] - a[2])
      if (dist > 45) continue
      const g = ctx.at('atlas', (a[0] + b[0]) / 2, (a[2] + b[2]) / 2)
      for (const o of [-0.8, 0, 0.8])
        g.tube(
          [a[0] + o, a[1] + 7.6, a[2]],
          [b[0] + o, b[1] + 7.6, b[2]],
          0.025,
          { tile: 'mTire', color: 0x222222 },
          dist * 0.04,
          8,
          3
        )
    }
  }

  const chunks = [...batches.values()].filter((b) => b.geo.triangleCount > 0)
  const instanced: InstancedBatch[] = []
  for (const [key, p] of protos) {
    const count = p.m.length / 16
    for (const [mat, geo] of p.geos) {
      if (!geo.triangleCount) continue
      instanced.push({ key: `${key}:${mat}`, mat, geo, matrices: new Float32Array(p.m), count })
    }
  }
  let triangles = 0
  let vertices = 0
  for (const c of chunks) {
    triangles += c.geo.triangleCount
    vertices += c.geo.vertexCount
  }
  for (const i of instanced) {
    triangles += i.geo.triangleCount * i.count
    vertices += i.geo.vertexCount
  }
  const shadowCasters = chunks.filter((c) => c.mat === 'atlas' || c.mat === 'foliage').length
  return {
    chunks,
    instanced,
    emitters,
    skipped,
    stats: { drawCalls: chunks.length + instanced.length, shadowCasters, triangles, vertices }
  }
}

/** A base plane under the whole map plus a margin, so the world never ends at the playable edge. */
function baseGround(map: MapDef, theme: ThemeDef, ctx: EnvCtx, get: (mat: EnvMat, cell: string) => GeoBuilder) {
  const tile = BASE_TILE[theme.id]
  const [bx0, bz0] = map.bounds.min
  const [bx1, bz1] = map.bounds.max
  const M = 160
  const step = 64
  for (let x = bx0 - M; x < bx1 + M; x += step)
    for (let z = bz0 - M; z < bz1 + M; z += step) {
      const inside = x + step > bx0 && x < bx1 && z + step > bz0 && z < bz1
      const cell = inside ? `${Math.floor((x + step / 2) / 64)},${Math.floor((z + step / 2) / 64)}` : 'far'
      const g = inside ? ctx.at('atlas', x + step / 2, z + step / 2) : get('atlas', cell)
      const m = tile === 'tVirtual' ? 8 : 6
      g.quad(
        x,
        -0.03,
        z + step,
        [step, 0, 0],
        [0, 0, -step],
        {
          tile,
          color: 0xe8e8e8,
          glow: tile === 'tVirtual' ? 0.6 * ctx.accent : tile === 'tCrystal' ? 0.5 * ctx.accent : 0
        },
        [x / m, -(z + step) / m, (x + step) / m, -z / m]
      )
    }
}

/**
 * Distant skyline outside the playable bounds: ruined towers (or white blocks / crystal spires) that fade into
 * the fog and give depth. One batch, no collision.
 */
function backdrop(map: MapDef, theme: ThemeDef, ctx: EnvCtx, get: (mat: EnvMat) => GeoBuilder) {
  const g = get('atlas')
  const glow = get('glow')
  const [bx0, bz0] = map.bounds.min
  const [bx1, bz1] = map.bounds.max
  const cx = (bx0 + bx1) / 2
  const cz = (bz0 + bz1) / 2
  const rx = (bx1 - bx0) / 2
  const rz = (bz1 - bz0) / 2
  const r = rng(hashString(map.id + theme.id))
  const n = 56
  for (let i = 0; i < n; i++) {
    const a = (i / n) * Math.PI * 2 + r() * 0.08
    const dist = 1.15 + r() * 0.55
    const x = cx + Math.sin(a) * (rx * dist + 25)
    const z = cz + Math.cos(a) * (rz * dist + 25)
    const w = 8 + r() * 14
    const d = 8 + r() * 12
    const h = theme.id === 'virtual' ? 12 + r() * 40 : 10 + r() * 38
    if (theme.id === 'blight' && r() < 0.45) {
      const len = 20 + r() * 40
      g.cylinder(x, 0, z, 3 + r() * 3, 0.2, len, 6, { tile: 'mCrystal', glow: 1.2 * ctx.accent }, false)
      continue
    }
    const tile: TileName =
      theme.id === 'virtual' ? 'fVirtual' : theme.id === 'blight' ? 'fBlight' : r() < 0.5 ? 'fRuin' : 'fOffice'
    const glowK = theme.id === 'virtual' ? 1.2 : theme.id === 'blight' ? 1 : 2.2 * ctx.night
    g.box(x - w / 2, 0, z - d / 2, x + w / 2, h, z + d / 2, {
      px: { tile, color: 0xc8c8c8, glow: glowK, offset: [r() * 4, 0] },
      nx: { tile, color: 0xc8c8c8, glow: glowK },
      pz: { tile, color: 0xc8c8c8, glow: glowK, offset: [r() * 4, 0] },
      nz: { tile, color: 0xc8c8c8, glow: glowK },
      py: { tile: 'rConcrete', color: 0xb0b0b0 }
    })
    if (theme.id === 'virtual') {
      glow.box(x - w / 2 - 0.1, h - 0.1, z - d / 2 - 0.1, x + w / 2 + 0.1, h + 0.1, z + d / 2 + 0.1, {
        tile: 'mWhite',
        color: 0x4fe6ff,
        glow: 1.8 * ctx.accent
      })
    } else if (r() < 0.35 && ctx.overgrowth) {
      // A tree on the ruined roof.
      get('foliage').blob(
        x,
        h + 2,
        z,
        3,
        2.4,
        3,
        { tile: 'mLeaves', color: theme.id === 'blight' ? 0x7a4a9a : 0x6f9a4a, fx: 0.2 },
        1,
        0.2,
        i
      )
    }
  }
}

/** Coverage test over the map's boxes on an 8 m grid. */
function coverage(map: MapDef): (x: number, z: number, y: number) => boolean {
  const CELL = 8
  const cells = new Map<string, MapDef['boxes']>()
  for (const b of map.boxes) {
    if (b.kind === 'barrier' || b.kind === 'tree' || b.kind === 'fence') continue
    for (let x = Math.floor(b.min[0] / CELL); x <= Math.floor(b.max[0] / CELL); x++)
      for (let z = Math.floor(b.min[2] / CELL); z <= Math.floor(b.max[2] / CELL); z++) {
        const key = `${x},${z}`
        let list = cells.get(key)
        if (!list) cells.set(key, (list = []))
        list.push(b)
      }
  }
  return (x, z, y) => {
    const list = cells.get(`${Math.floor(x / CELL)},${Math.floor(z / CELL)}`)
    if (!list) return false
    for (const b of list)
      if (x >= b.min[0] && x <= b.max[0] && z >= b.min[2] && z <= b.max[2] && b.max[1] > y + 0.01) return true
    return false
  }
}

export function hashString(s: string): number {
  let h = 2166136261
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i)
    h = Math.imul(h, 16777619)
  }
  return h >>> 0
}

export { ENV_MATERIALS }
