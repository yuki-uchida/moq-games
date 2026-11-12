/**
 * Draw-call assembly of a character (DESIGN §19 budget): the skinned body, the rigid uniform parts, the face
 * lines (brows, mouths, happy eyes), the passive gear and the クロヅメ scarf are merged into ONE skinned geometry
 * with its ink-outline hull appended (hull.ts), and both eyes into a second one. With an antique in each paw
 * a character is 4 draw calls. Rigid pieces are skinned 100 % to one bone; extra bones under the head and the
 * upper arms animate blinks, brows, mouths and glider membranes. Each piece keeps its own shader paint regions
 * through one merged region table and a per-vertex range (`pinfo`) plus its piece-local position (`rpos`).
 *
 * Geometries are cached per species × gear set × scarf × level of detail; LOD 1 is used beyond a distance.
 */
import * as THREE from 'three'
import type { SpeciesId } from '../data/species'
import type { GearId } from './gear'
import { BONE_NAMES, type BoneName } from './rig'
import { eyeGeometry } from './face'
import { lighterGeometry, type BakedModel } from './sdf/geometry'
import { mergeRegionTables, regionTexture, type RegionTable } from './sdf/regions'
import type { Vec3 } from './sdf/sculpt'
import type { SpeciesAsset } from './species/asset'

export const EXTRA_BONES = [
  'eyeL',
  'eyeR',
  'browL',
  'browR',
  'mouthClosed',
  'mouthOpen',
  'happyL',
  'happyR',
  'membraneL',
  'membraneR'
] as const
export type ExtraBone = (typeof EXTRA_BONES)[number]
export const SKIN_BONES: readonly string[] = [...BONE_NAMES, ...EXTRA_BONES]
const boneIndex = (name: string) => SKIN_BONES.indexOf(name)

/** Piece flags (pinfo.z): gear glow/dimming, unlit (face lines). */
export const FLAG_GEAR = 1
export const FLAG_UNLIT = 2

/** One source geometry placed into a merged mesh. */
export interface Piece {
  geometry: THREE.BufferGeometry
  /** Source → merged space (null = identity). */
  matrix: THREE.Matrix4 | null
  /** Rigid bone (index into the skeleton), or null to keep the source's own skinning. */
  bone: number | null
  /** Region range index (−1 = no regions). */
  range: number
  flags: number
  outline: boolean
}

export interface MergedGeometry {
  geometry: THREE.BufferGeometry
  /** Triangles without the outline hull. */
  triangles: number
}

const _v = new THREE.Vector3()
const _n = new THREE.Vector3()
const _nm = new THREE.Matrix3()

/** Default attribute values for geometries without the kit's attributes (three primitives). */
function attr(g: THREE.BufferGeometry, name: string): THREE.BufferAttribute | null {
  return (g.getAttribute(name) as THREE.BufferAttribute | undefined) ?? null
}

/**
 * Merges pieces into one indexed geometry with the kit's attributes, `pinfo` (region range, flags), `rpos`
 * (piece-local position for its regions), optional rigid skinning and an outline hull of the outlined pieces.
 * `color` fills pieces without a colour attribute.
 */
export function mergePieces(
  pieces: Piece[],
  ranges: readonly [number, number][],
  opts: { skinned: boolean; hull: boolean; color?: (p: Piece) => THREE.Color }
): MergedGeometry {
  let nv = 0
  let ni = 0
  let hv = 0
  let hi = 0
  for (const p of pieces) {
    const v = p.geometry.getAttribute('position').count
    const i = p.geometry.getIndex()?.count ?? v
    nv += v
    ni += i
    if (opts.hull && p.outline) {
      hv += v
      hi += i
    }
  }
  const V = nv + hv
  const pos = new Float32Array(V * 3)
  const nor = new Float32Array(V * 3)
  const col = new Float32Array(V * 3)
  const mark = new Float32Array(V * 4)
  const ao = new Float32Array(V)
  const filt = new Float32Array(V * 4)
  const mask = new Float32Array(V * 4)
  const pinfo = new Float32Array(V * 4)
  const rpos = new Float32Array(V * 3)
  const hull = opts.hull ? new Float32Array(V) : null
  const sIdx = opts.skinned ? new Uint16Array(V * 4) : null
  const sW = opts.skinned ? new Float32Array(V * 4) : null
  const index = V > 65535 ? new Uint32Array(ni + hi) : new Uint16Array(ni + hi)
  let vo = 0
  let io = 0
  const tmpC = new THREE.Color()
  const write = (p: Piece, asHull: boolean) => {
    const g = p.geometry
    const P = attr(g, 'position')!
    const N = attr(g, 'normal')
    const C = attr(g, 'color')
    const MK = attr(g, 'markColor')
    const AO = attr(g, 'ao')
    const F = attr(g, 'regionFilter')
    const M = attr(g, 'animaMask')
    const SI = attr(g, 'skinIndex')
    const SW = attr(g, 'skinWeight')
    const n = P.count
    const m = p.matrix
    if (m) _nm.getNormalMatrix(m)
    const flip = !!m && m.determinant() < 0
    const fill = C ? null : (opts.color?.(p) ?? tmpC.set(1, 1, 1))
    const [r0, r1] = p.range >= 0 ? ranges[p.range] : [0, 0]
    for (let k = 0; k < n; k++) {
      const o = vo + k
      _v.fromBufferAttribute(P, k)
      rpos[o * 3] = _v.x
      rpos[o * 3 + 1] = _v.y
      rpos[o * 3 + 2] = _v.z
      if (m) _v.applyMatrix4(m)
      pos[o * 3] = _v.x
      pos[o * 3 + 1] = _v.y
      pos[o * 3 + 2] = _v.z
      if (N) {
        _n.fromBufferAttribute(N, k)
        if (m) _n.applyMatrix3(_nm).normalize()
      } else _n.set(0, 1, 0)
      nor[o * 3] = _n.x
      nor[o * 3 + 1] = _n.y
      nor[o * 3 + 2] = _n.z
      if (C) {
        col[o * 3] = C.getX(k)
        col[o * 3 + 1] = C.getY(k)
        col[o * 3 + 2] = C.getZ(k)
      } else {
        col[o * 3] = fill!.r
        col[o * 3 + 1] = fill!.g
        col[o * 3 + 2] = fill!.b
      }
      for (let c = 0; c < 4; c++) {
        mark[o * 4 + c] = MK ? MK.array[k * 4 + c] : 0
        filt[o * 4 + c] = F ? F.array[k * 4 + c] : 0
        mask[o * 4 + c] = M ? M.array[k * 4 + c] : 0
      }
      ao[o] = AO ? AO.getX(k) : 1
      pinfo[o * 4] = r0
      pinfo[o * 4 + 1] = r1
      pinfo[o * 4 + 2] = p.flags
      if (hull) hull[o] = asHull ? 1 : 0
      if (sIdx && sW) {
        if (p.bone !== null || !SI || !SW) {
          sIdx[o * 4] = p.bone ?? 0
          sW[o * 4] = 1
        } else
          for (let c = 0; c < 4; c++) {
            sIdx[o * 4 + c] = SI.array[k * 4 + c]
            sW[o * 4 + c] = SW.array[k * 4 + c]
          }
      }
    }
    const I = g.getIndex()
    const count = I?.count ?? n
    // Hull triangles are reversed; mirrored pieces are reversed too (two reversals cancel).
    const rev = asHull !== flip
    for (let t = 0; t < count; t += 3) {
      const a = I ? I.getX(t) : t,
        b = I ? I.getX(t + 1) : t + 1,
        c = I ? I.getX(t + 2) : t + 2
      index[io + t] = vo + a
      index[io + t + 1] = vo + (rev ? c : b)
      index[io + t + 2] = vo + (rev ? b : c)
    }
    vo += n
    io += count
  }
  for (const p of pieces) write(p, false)
  if (opts.hull) for (const p of pieces) if (p.outline) write(p, true)
  const g = new THREE.BufferGeometry()
  g.setAttribute('position', new THREE.BufferAttribute(pos, 3))
  g.setAttribute('normal', new THREE.BufferAttribute(nor, 3))
  g.setAttribute('color', new THREE.BufferAttribute(col, 3))
  g.setAttribute('markColor', new THREE.BufferAttribute(mark, 4))
  g.setAttribute('ao', new THREE.BufferAttribute(ao, 1))
  g.setAttribute('regionFilter', new THREE.BufferAttribute(filt, 4))
  g.setAttribute('animaMask', new THREE.BufferAttribute(mask, 4))
  g.setAttribute('pinfo', new THREE.BufferAttribute(pinfo, 4))
  g.setAttribute('rpos', new THREE.BufferAttribute(rpos, 3))
  if (hull) g.setAttribute('hull', new THREE.BufferAttribute(hull, 1))
  if (sIdx && sW) {
    g.setAttribute('skinIndex', new THREE.Uint16BufferAttribute(sIdx, 4))
    g.setAttribute('skinWeight', new THREE.BufferAttribute(sW, 4))
  }
  g.setIndex(new THREE.BufferAttribute(index, 1))
  g.computeBoundingBox()
  g.computeBoundingSphere()
  g.userData.hullTriangles = hi / 3
  return { geometry: g, triangles: ni / 3 }
}

// ------------------------------------------------------------------------------------------------ characters

export interface Placement {
  /** Bind-space transform of the piece (and of its extra bone, without scale). */
  p: Vec3
  q: THREE.Quaternion
  s: THREE.Vector3
  /** Bone the piece (or its extra bone) hangs from. */
  parent: BoneName
}

/** Bind transforms of the extra bones of a species (faces; membranes need the gear scale). */
export function extraBoneBinds(asset: SpeciesAsset): Record<ExtraBone, Placement> {
  const H = asset.plan.H
  const L = asset.layout
  const out = {} as Record<ExtraBone, Placement>
  const one = new THREE.Vector3(1, 1, 1)
  L.eyes.forEach((pl, i) => {
    const q = new THREE.Quaternion(...pl.q)
    out[i === 0 ? 'eyeL' : 'eyeR'] = { p: pl.p, q, s: new THREE.Vector3(...pl.s), parent: 'head' }
    const off = new THREE.Vector3(0, 0, pl.s[2] * 0.55).applyQuaternion(q)
    out[i === 0 ? 'happyL' : 'happyR'] = {
      p: [pl.p[0] + off.x, pl.p[1] + off.y, pl.p[2] + off.z],
      q,
      s: new THREE.Vector3().setScalar(pl.s[0] / (0.05 * 1.2)),
      parent: 'head'
    }
  })
  L.brows.forEach((pl, i) => {
    out[i === 0 ? 'browL' : 'browR'] = { p: pl.p, q: new THREE.Quaternion(...pl.q), s: one.clone(), parent: 'head' }
  })
  const mq = new THREE.Quaternion(...L.mouth.q)
  out.mouthClosed = { p: L.mouth.p, q: mq, s: one.clone(), parent: 'head' }
  out.mouthOpen = { p: L.mouth.p, q: mq.clone(), s: one.clone(), parent: 'head' }
  const gs = H / 1.2
  for (const S of ['L', 'R'] as const) {
    const side = S === 'L' ? 1 : -1
    const sh = asset.plan.layout[`upperArm${S}`]
    const wr = asset.plan.layout[`paw${S}`]
    const k = 0.35
    out[`membrane${S}`] = {
      p: [sh[0] + (wr[0] - sh[0]) * k, sh[1] + (wr[1] - sh[1]) * k, sh[2] + (wr[2] - sh[2]) * k - 0.012 * H],
      q: new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 0, 1), Math.atan2(wr[1] - sh[1], wr[0] - sh[0])),
      s: new THREE.Vector3(gs, gs * side, gs),
      parent: `upperArm${S}`
    }
  }
  return out
}

/** Gear placements on the body for a gear set (anchors as in DESIGN: shell/quills/pack on the back, charm on the belt). */
function gearPlacements(
  asset: SpeciesAsset,
  gear: readonly GearId[]
): { id: GearId; m: THREE.Matrix4; bone: BoneName }[] {
  const H = asset.plan.H
  const gs = H / 1.2
  const back = asset.back
  const backQ = new THREE.Quaternion().setFromUnitVectors(
    new THREE.Vector3(0, 0, 1),
    new THREE.Vector3(back.n[0], 0, back.n[2]).normalize()
  )
  const has = (id: GearId) => gear.includes(id)
  const out: { id: GearId; m: THREE.Matrix4; bone: BoneName }[] = []
  const S = new THREE.Vector3(gs, gs, gs)
  const at = (p: Vec3, q: THREE.Quaternion) => new THREE.Matrix4().compose(new THREE.Vector3(...p), q, S)
  for (const id of gear) {
    if (id === 'turtle')
      out.push({ id, bone: 'chest', m: at([back.p[0], back.p[1] + 0.01 * H, back.p[2] - 0.005 * H], backQ) })
    else if (id === 'hedgehog') {
      // The domed shell stands ~0.16 m off the back: quills sit on top of it.
      const lift = has('turtle') ? 0.12 * H : 0
      out.push({ id, bone: 'chest', m: at([back.p[0], back.p[1] + 0.02 * H, back.p[2] - lift], backQ) })
    } else if (id === 'momonga') {
      const outward = has('turtle') ? 0.11 * H : has('hedgehog') ? 0.07 * H : 0
      out.push({ id, bone: 'chest', m: at([back.p[0], back.p[1] - 0.09 * H, back.p[2] - outward], backQ) })
    } else if (id === 'jelly') {
      const p = asset.beltSide
      out.push({ id, bone: 'hips', m: at([p[0] + 0.01 * H, p[1] - 0.02 * H, p[2] + 0.02 * H], new THREE.Quaternion()) })
    }
  }
  return out
}

export interface AssemblyDeps {
  gear(id: GearId): BakedModel
  scarf(): BakedModel
  happyEye(): THREE.BufferGeometry
}

const GEAR_ORDER: GearId[] = ['turtle', 'hedgehog', 'momonga', 'jelly', 'membrane']

/** The per-species merged-mesh factory (cached by the kit). */
export class CharacterAssembly {
  readonly table: RegionTable
  readonly texture: THREE.DataTexture
  readonly binds: Record<ExtraBone, Placement>
  private readonly ranges: [number, number][]
  private readonly rangeOf = new Map<string, number>()
  private readonly cache = new Map<string, MergedGeometry>()
  private readonly eyeCache: (THREE.BufferGeometry | null)[] = [null, null]
  private readonly lighter = new Map<THREE.BufferGeometry, THREE.BufferGeometry>()

  constructor(
    readonly asset: SpeciesAsset,
    private readonly deps: AssemblyDeps
  ) {
    const tables: RegionTable[] = [asset.regions]
    this.rangeOf.set('body', 0)
    asset.parts.forEach((p, i) => {
      this.rangeOf.set(`part${i}`, tables.length)
      tables.push(p.model.regions)
    })
    for (const id of GEAR_ORDER) {
      this.rangeOf.set(id, tables.length)
      tables.push(deps.gear(id).regions)
    }
    this.rangeOf.set('scarf', tables.length)
    tables.push(deps.scarf().regions)
    const merged = mergeRegionTables(tables)
    this.table = merged.table
    this.ranges = merged.ranges
    this.texture = regionTexture(merged.table)
    this.binds = extraBoneBinds(asset)
  }

  get species(): SpeciesId {
    return this.asset.id
  }

  /** The merged body for a gear set, scarf and level of detail (cached). */
  body(gear: readonly GearId[], scarf: boolean, lod: 0 | 1, outline: boolean): MergedGeometry {
    const key = `${gear.join(',')}|${scarf ? 1 : 0}|${lod}|${outline ? 1 : 0}`
    let g = this.cache.get(key)
    if (g) return g
    const a = this.asset
    const pieces: Piece[] = []
    const range = (name: string) => this.rangeOf.get(name) ?? -1
    pieces.push({
      geometry: lod === 1 ? a.bodyLod : a.body,
      matrix: null,
      bone: null,
      range: range('body'),
      flags: 0,
      outline: true
    })
    a.parts.forEach((p, i) =>
      pieces.push({
        geometry: lod === 1 && p.model.lod ? p.model.lod.geometry : p.model.geometry,
        matrix: null,
        bone: boneIndex(p.bone),
        range: range(`part${i}`),
        flags: 0,
        outline: true
      })
    )
    for (const gp of gearPlacements(a, gear))
      pieces.push({
        geometry: this.light(this.deps.gear(gp.id).geometry, lod),
        matrix: gp.m,
        bone: boneIndex(gp.bone),
        range: range(gp.id),
        flags: FLAG_GEAR,
        outline: true
      })
    if (gear.includes('momonga'))
      for (const name of ['membraneL', 'membraneR'] as const)
        pieces.push({
          geometry: this.light(this.deps.gear('membrane').geometry, lod),
          matrix: this.bindMatrix(name, true),
          bone: boneIndex(name),
          range: range('membrane'),
          flags: FLAG_GEAR,
          outline: true
        })
    if (scarf)
      pieces.push({
        geometry: this.light(this.deps.scarf().geometry, lod),
        matrix: null,
        bone: boneIndex('chest'),
        range: range('scarf'),
        flags: FLAG_GEAR,
        outline: true
      })
    // Face lines (unlit, no outline): brows, both mouths, happy eyes (brows and the open mouth are dropped at
    // distance, where they are a pixel or two).
    if (lod === 0)
      for (const name of ['browL', 'browR'] as const)
        pieces.push({
          geometry: a.brow,
          matrix: this.bindMatrix(name, false),
          bone: boneIndex(name),
          range: -1,
          flags: FLAG_UNLIT,
          outline: false
        })
    pieces.push({
      geometry: a.mouthClosed,
      matrix: this.bindMatrix('mouthClosed', false),
      bone: boneIndex('mouthClosed'),
      range: -1,
      flags: FLAG_UNLIT,
      outline: false
    })
    if (lod === 0)
      pieces.push({
        geometry: a.mouthOpen,
        matrix: this.bindMatrix('mouthOpen', false),
        bone: boneIndex('mouthOpen'),
        range: -1,
        flags: FLAG_UNLIT,
        outline: false
      })
    for (const name of ['happyL', 'happyR'] as const)
      pieces.push({
        geometry: this.deps.happyEye(),
        matrix: this.bindMatrix(name, true),
        bone: boneIndex(name),
        range: -1,
        flags: FLAG_UNLIT,
        outline: false
      })
    const browColor = new THREE.Color(a.face.brow)
    g = mergePieces(pieces, this.ranges, {
      skinned: true,
      hull: outline,
      color: (p) => (p.geometry === a.brow ? browColor : new THREE.Color(1, 1, 1))
    })
    g.geometry.boundingSphere = new THREE.Sphere(new THREE.Vector3(0, a.plan.H * 0.55, 0), a.plan.H * 1.3)
    this.cache.set(key, g)
    return g
  }

  /**
   * A rigid, unskinned statue of the animal in its bind pose (body, uniform parts, scarf, brows, closed mouth):
   * previews that want a character as rigid parts (the クロヅメ foe rig of the codex turntable).
   */
  statue(scarf: boolean): MergedGeometry {
    const key = `statue|${scarf ? 1 : 0}`
    let g = this.cache.get(key)
    if (g) return g
    const a = this.asset
    const range = (name: string) => this.rangeOf.get(name) ?? -1
    const pieces: Piece[] = [
      { geometry: a.body, matrix: null, bone: null, range: range('body'), flags: 0, outline: false }
    ]
    a.parts.forEach((p, i) =>
      pieces.push({
        geometry: p.model.geometry,
        matrix: null,
        bone: null,
        range: range(`part${i}`),
        flags: 0,
        outline: false
      })
    )
    if (scarf)
      pieces.push({
        geometry: this.deps.scarf().geometry,
        matrix: null,
        bone: null,
        range: range('scarf'),
        flags: FLAG_GEAR,
        outline: false
      })
    for (const name of ['browL', 'browR'] as const)
      pieces.push({
        geometry: a.brow,
        matrix: this.bindMatrix(name, false),
        bone: null,
        range: -1,
        flags: FLAG_UNLIT,
        outline: false
      })
    if (a.face.mouth !== 'beak')
      pieces.push({
        geometry: a.mouthClosed,
        matrix: this.bindMatrix('mouthClosed', false),
        bone: null,
        range: -1,
        flags: FLAG_UNLIT,
        outline: false
      })
    const browColor = new THREE.Color(a.face.brow)
    g = mergePieces(pieces, this.ranges, {
      skinned: false,
      hull: false,
      color: (p) => (p.geometry === a.brow ? browColor : new THREE.Color(1, 1, 1))
    })
    this.cache.set(key, g)
    return g
  }

  /** Both eyes in one skinned geometry (eye bones), with the dome coordinates in `eyeLocal`. */
  eyes(lod: 0 | 1): THREE.BufferGeometry {
    const cached = this.eyeCache[lod]
    if (cached) return cached
    const dome = lod === 0 ? this.asset.eye : eyeGeometry(10)
    const n = dome.getAttribute('position').count
    const idx = dome.getIndex()!
    const pos = new Float32Array(n * 6)
    const local = new Float32Array(n * 6)
    const sI = new Uint16Array(n * 8)
    const sW = new Float32Array(n * 8)
    const index = new Uint16Array(idx.count * 2)
    ;(['eyeL', 'eyeR'] as const).forEach((name, e) => {
      const m = this.bindMatrix(name, true)
      const b = boneIndex(name)
      for (let k = 0; k < n; k++) {
        _v.fromBufferAttribute(dome.getAttribute('position') as THREE.BufferAttribute, k)
        local.set([_v.x, _v.y, _v.z], (e * n + k) * 3)
        _v.applyMatrix4(m)
        pos.set([_v.x, _v.y, _v.z], (e * n + k) * 3)
        sI[(e * n + k) * 4] = b
        sW[(e * n + k) * 4] = 1
      }
      for (let i = 0; i < idx.count; i++) index[e * idx.count + i] = idx.getX(i) + e * n
    })
    const g = new THREE.BufferGeometry()
    g.setAttribute('position', new THREE.BufferAttribute(pos, 3))
    g.setAttribute('eyeLocal', new THREE.BufferAttribute(local, 3))
    g.setAttribute('skinIndex', new THREE.Uint16BufferAttribute(sI, 4))
    g.setAttribute('skinWeight', new THREE.BufferAttribute(sW, 4))
    g.setIndex(new THREE.BufferAttribute(index, 1))
    g.boundingSphere = new THREE.Sphere(new THREE.Vector3(0, this.asset.plan.H * 0.55, 0), this.asset.plan.H * 1.3)
    if (lod === 1) dome.dispose()
    this.eyeCache[lod] = g
    return g
  }

  /** Gear and scarf at the distance level of detail (a third of the triangles). */
  private light(g: THREE.BufferGeometry, lod: 0 | 1): THREE.BufferGeometry {
    if (lod === 0) return g
    let l = this.lighter.get(g)
    if (!l) {
      l = lighterGeometry(g, Math.max(60, Math.round(((g.getIndex()?.count ?? 0) / 3) * 0.35))) ?? g
      this.lighter.set(g, l)
    }
    return l
  }

  /** Bind matrix of an extra bone (optionally with the piece's scale). */
  bindMatrix(name: ExtraBone, withScale: boolean): THREE.Matrix4 {
    const b = this.binds[name]
    return new THREE.Matrix4().compose(new THREE.Vector3(...b.p), b.q, withScale ? b.s : new THREE.Vector3(1, 1, 1))
  }

  dispose() {
    for (const g of this.cache.values()) g.geometry.dispose()
    this.cache.clear()
    for (const g of this.eyeCache) g?.dispose()
    this.eyeCache[0] = this.eyeCache[1] = null
    for (const [src, g] of this.lighter) if (g !== src) g.dispose()
    this.lighter.clear()
    this.texture.dispose()
  }
}
