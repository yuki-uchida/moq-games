/**
 * Stage data format (authored in src/stages/*.ts) and the loader that turns it into the static StageInfo plus the
 * initial entity list of a world. Everything here is deterministic so every client derives identical prop ids.
 */
import {
  STAGE_TILES,
  TILE,
  TILE_KINDS,
  type BossKind,
  type EnemyKind,
  type NpcKind,
  type StageId,
  type TileKind
} from '../vocab'
import type { PickupKind, PropKind, StageInfo } from './types'

/** Puzzle conditions (DESIGN §9). `on` = a puzzle part is active; `flag` names a world flag. */
export type Cond =
  | { all: Cond[] }
  | { any: Cond[] }
  | { on: string }
  /** A breakable part (crack rock, barricade) has been broken. */
  | { broken: string }
  | { bells: string }
  | { clear: string }
  | { flag: string }

export type EntitySpec =
  | { type: 'spawn' }
  | { type: 'checkpoint' }
  /** Static decoration; SOLID_DECOR kinds block movement (`solid: false` documents a walkable one). */
  | { type: 'decor'; kind: string; solid?: boolean }
  | {
      type: 'prop'
      kind: PropKind
      /** Puzzle part id (conditions refer to it). */
      id?: string
      weight?: number
      cond?: Cond
      latch?: boolean
      /** Arena lock: the gate is closed while this room's arena fight is running. */
      lock?: string
      /** Items dropped when broken/opened. */
      drop?: PickupKind[]
      /** Crystal group (all hit within the window → flag `crystals:<group>`). */
      group?: string
      /** Pedestal/scale: the prop id (part id) it accepts. */
      accepts?: string
      /** Sluice: the current channels it stops once open. */
      stops?: string[]
    }
  | { type: 'enemy'; kind: EnemyKind }
  | { type: 'boss'; kind: BossKind }
  | { type: 'npc'; kind: NpcKind; pages: string[] }
  /** A sign; its pages come from StageData.signs in reading order. */
  | { type: 'sign' }
  | { type: 'pickup'; kind: PickupKind }
  /** A current tile of a channel flowing along (dx, dy) at `speed` px/s (default 120). */
  | { type: 'current'; channel: string; dx: number; dy: number; speed?: number; strong?: boolean }
  /** A mouse-hole tile; the two tiles with the same `pair` are linked. */
  | { type: 'hole'; pair: string }

export interface LegendEntry {
  /** Terrain under the marker; omitted → taken from a walkable neighbour. */
  tile?: TileKind
  ent?: EntitySpec
  /** All tiles with this character form one entity (multi-tile props). */
  multi?: boolean
}

export interface WaveSpawn {
  kind: EnemyKind
  /** Tile coordinates. */
  x: number
  y: number
}

export interface RoomData {
  id: string
  name: string
  /** Tile rectangle (inclusive x..x+w-1). */
  x: number
  y: number
  w: number
  h: number
  zoom?: number
  objective: string
  /** Puzzle room: when this holds the HUD shows `objectiveDone` instead of `objective`. */
  done?: Cond
  objectiveDone?: string
  /** Arena fight: waves spawn one after another while the room's lock gates are closed. */
  waves?: WaveSpawn[][]
  /** The checkpoint activates only when the arena is cleared. */
  checkpointOnClear?: boolean
  boss?: boolean
}

export interface StageData {
  id: StageId
  map: readonly string[]
  legend: Record<string, LegendEntry>
  rooms: RoomData[]
  /** Pages of each sign in reading order (row-major). */
  signs: string[][]
  /** Wind zones (tile rects) pushing flyers hard and walkers gently. */
  winds?: { x: number; y: number; w: number; h: number; dx: number; dy: number; strength: number }[]
  light: 'day' | 'dim' | 'night'
}

/* ------------------------------------------------------------------------------------------------ loader */

/** Prop footprints in tiles (position = centre of the footprint). */
export const FOOT: Partial<Record<string, [number, number]>> = {
  boulder: [2, 2],
  crackrock: [2, 2],
  bigplate: [2, 2],
  pedestal: [2, 1],
  bossdoor: [3, 1],
  altar: [2, 1],
  bigcrate: [2, 2],
  barricade: [2, 1],
  scale: [2, 1],
  hook: [2, 1],
  windmill: [2, 1],
  icewall: [2, 2],
  ramslot: [2, 1],
  bigmoon: [2, 2]
}

/** Prop families shared by several stages. */
export const PUSHABLE = new Set(['block', 'boulder', 'crate', 'bigcrate', 'iceblock'])
export const LIFTABLE = new Set(['pot', 'barrel'])
export const GRIPPABLE = new Set(['acorn', 'cheese', 'goldbell', 'log'])
export const ACCEPTORS = new Set(['pedestal', 'scale', 'hook', 'ramslot'])
/** Props that may sit over sky/pit (not on walkable ground). */
export const AIR_PROPS = new Set(['vent', 'drawbridge'])
export const footOf = (kind: string): [number, number] => FOOT[kind] ?? [1, 1]

export interface ParsedProp {
  id: number
  kind: PropKind
  x: number
  y: number
  spec: Extract<EntitySpec, { type: 'prop' }>
}

export interface ParsedStage {
  data: StageData
  info: StageInfo
  props: ParsedProp[]
  enemies: { kind: EnemyKind; x: number; y: number }[]
  boss?: { kind: BossKind; x: number; y: number }
  spawn: { x: number; y: number }
  /** Checkpoint position per room id. */
  checkpoints: Record<string, { x: number; y: number }>
  signs: { x: number; y: number; pages: string[] }[]
  npcs: { kind: NpcKind; x: number; y: number; pages: string[] }[]
  pickups: { kind: PickupKind; x: number; y: number }[]
  /**
   * Solid static decoration tiles (index = ty * w + tx), parse-time copy for tools and tests. Collision itself uses
   * Grid, which derives the same set from StageInfo.decor (SOLID_DECOR kinds) and the NPCs on every client.
   */
  staticSolid: Uint8Array
}

/** Static decoration kinds that block movement. */
export const SOLID_DECOR = new Set([
  'tree',
  'rock',
  'bush',
  'pillar',
  'sign',
  'sack',
  'haybale',
  'shelf',
  'gear',
  'pine',
  'deadtree',
  'tent',
  'brazier'
])

export const tileCentre = (t: number) => t * TILE + TILE / 2

export function roomAt(rooms: StageInfo['rooms'], x: number, y: number): StageInfo['rooms'][number] | undefined {
  const tx = Math.floor(x / TILE)
  const ty = Math.floor(y / TILE)
  let best: StageInfo['rooms'][number] | undefined
  for (const r of rooms)
    if (tx >= r.x && ty >= r.y && tx < r.x + r.w && ty < r.y + r.h && (!best || r.w * r.h < best.w * best.h)) best = r
  return best
}

export function parseStage(data: StageData): ParsedStage {
  const h = data.map.length
  const w = data.map[0].length
  for (const row of data.map) if (row.length !== w) throw new Error(`${data.id}: ragged map row`)
  const allowed = new Set<string>(STAGE_TILES[data.id])
  const tiles: TileKind[] = new Array(w * h)
  const charAt = (x: number, y: number) => data.map[y]?.[x]
  // Terrain: legend tile or a walkable neighbour's terrain.
  const fixed = (c: string | undefined) => (c === undefined ? undefined : data.legend[c]?.tile)
  for (let y = 0; y < h; y++)
    for (let x = 0; x < w; x++) {
      const c = charAt(x, y)
      const entry = data.legend[c]
      if (!entry) throw new Error(`${data.id}: legend has no '${c}' (${x},${y})`)
      let kind = entry.tile
      if (!kind) {
        for (let d = 1; d < 4 && !kind; d++)
          for (const [dx, dy] of [
            [-d, 0],
            [d, 0],
            [0, -d],
            [0, d]
          ]) {
            const k = fixed(charAt(x + dx, y + dy))
            if (k && TILE_KINDS[k].walk) {
              kind = k
              break
            }
          }
        kind ??= 'grass'
      }
      if (!allowed.has(kind)) throw new Error(`${data.id}: tile '${kind}' is not in STAGE_TILES`)
      tiles[y * w + x] = kind
    }
  const props: ParsedProp[] = []
  const enemies: ParsedStage['enemies'] = []
  const decor: StageInfo['decor'] = []
  const npcs: ParsedStage['npcs'] = []
  const signs: ParsedStage['signs'] = []
  const pickups: ParsedStage['pickups'] = []
  const staticSolid = new Uint8Array(w * h)
  const currents: NonNullable<StageInfo['currents']> = []
  const holePairs = new Map<string, number[]>()
  let boss: ParsedStage['boss']
  let spawn = { x: 0, y: 0 }
  const cpTiles: { x: number; y: number }[] = []
  const seenMulti = new Set<string>()
  for (let y = 0; y < h; y++)
    for (let x = 0; x < w; x++) {
      const c = charAt(x, y)
      const entry = data.legend[c]
      const ent = entry.ent
      if (!ent) continue
      let cx = tileCentre(x)
      let cy = tileCentre(y)
      if (entry.multi) {
        if (seenMulti.has(c)) continue
        seenMulti.add(c)
        let x1 = x
        let y1 = y
        for (let yy = 0; yy < h; yy++)
          for (let xx = 0; xx < w; xx++) if (charAt(xx, yy) === c) (x1 = Math.max(x1, xx)), (y1 = Math.max(y1, yy))
        cx = ((x + x1 + 1) * TILE) / 2
        cy = ((y + y1 + 1) * TILE) / 2
      }
      switch (ent.type) {
        case 'spawn':
          spawn = { x: cx, y: cy }
          cpTiles.push({ x: cx, y: cy })
          break
        case 'checkpoint':
          cpTiles.push({ x: cx, y: cy })
          break
        case 'decor': {
          decor.push({ kind: ent.kind, x: cx, y: cy })
          if (ent.solid ?? SOLID_DECOR.has(ent.kind)) {
            const [fw, fh] = footOf(ent.kind)
            const tx0 = Math.round((cx - (fw * TILE) / 2) / TILE)
            const ty0 = Math.round((cy - (fh * TILE) / 2) / TILE)
            for (let j = 0; j < fh; j++) for (let i = 0; i < fw; i++) staticSolid[(ty0 + j) * w + tx0 + i] = 1
          }
          break
        }
        case 'sign':
          decor.push({ kind: 'sign', x: cx, y: cy })
          staticSolid[y * w + x] = 1
          signs.push({ x: cx, y: cy, pages: data.signs[signs.length] ?? ['……'] })
          break
        case 'prop':
          props.push({ id: props.length + 1, kind: ent.kind, x: cx, y: cy, spec: ent })
          break
        case 'enemy':
          enemies.push({ kind: ent.kind, x: cx, y: cy })
          break
        case 'boss':
          boss = { kind: ent.kind, x: cx, y: cy }
          break
        case 'npc':
          npcs.push({ kind: ent.kind, x: cx, y: cy, pages: ent.pages })
          staticSolid[y * w + x] = 1
          break
        case 'current': {
          let c = currents.find((q) => q.channel === ent.channel)
          if (!c)
            currents.push(
              (c = {
                channel: ent.channel,
                dx: ent.dx,
                dy: ent.dy,
                speed: ent.speed ?? 120,
                tiles: [],
                ...(ent.strong ? { strong: true } : {})
              })
            )
          c.tiles.push(y * w + x)
          break
        }
        case 'hole': {
          const list = holePairs.get(ent.pair) ?? []
          list.push(y * w + x)
          holePairs.set(ent.pair, list)
          break
        }
        case 'pickup':
          pickups.push({ kind: ent.kind, x: cx, y: cy })
          break
      }
    }
  for (const [pair, list] of holePairs)
    if (list.length !== 2) throw new Error(`${data.id}: hole pair ${pair} has ${list.length} tiles`)
  const rooms = data.rooms.map((r) => ({ id: r.id, x: r.x, y: r.y, w: r.w, h: r.h, zoom: r.zoom, name: r.name }))
  const checkpoints: Record<string, { x: number; y: number }> = {}
  for (const cp of cpTiles) {
    const room = roomAt(rooms, cp.x, cp.y)
    if (room) checkpoints[room.id] = cp
  }
  const info: StageInfo = {
    id: data.id,
    w,
    h,
    tiles,
    decor,
    npcs: npcs.map((n) => ({ kind: n.kind, x: n.x, y: n.y, name: npcName(n.kind) })),
    rooms,
    light: data.light,
    ...(currents.length ? { currents } : {}),
    ...(data.winds?.length ? { winds: data.winds } : {}),
    ...(holePairs.size ? { holes: [...holePairs.values()].map((l) => [l[0], l[1]] as [number, number]) } : {})
  }
  return { data, info, props, enemies, boss, spawn, checkpoints, signs, npcs, pickups, staticSolid }
}

const NPC_LABEL: Record<NpcKind, string> = {
  elder: '長老スライム',
  smith: 'ネズミの鍛冶屋',
  seer: 'カラスの占い師',
  bard: '老狼の吟遊詩人'
}
const npcName = (kind: NpcKind) => NPC_LABEL[kind]
