/**
 * Drawbridges as whole bridges. Every sky tile of a drawbridge is its own prop, so the renderer groups touching
 * pieces into runs and gives each piece the frame for its place: the row across the bridge (north edge, inside,
 * south edge, or a one-tile-wide bridge) and the column along it (hinge end, inside, free end). Raised bridges show
 * only their hinge column; lowering ones unroll the deck from the hinge with the leaf's free edge at the front.
 */
import type { PropView, StageInfo } from '../sim/types'
import { TILE } from '../vocab'

export type BridgeRow = 'n' | 'm' | 's' | 'o'
export type BridgeCol = 'h' | 'm' | 'e'

export interface BridgePiece {
  row: BridgeRow
  col: BridgeCol
  /** Pieces from the hinge (0 = the hinge column). */
  i: number
  /** Length of the run in tiles. */
  n: number
  /** +1 hinged on the west (art as drawn), −1 hinged on the east (mirrored). */
  dir: 1 | -1
  /** World x of the hinge line. */
  hingeX: number
}

/** Seconds a piece takes to lower (props.ts: 'lowering' lasts 5 frames at 10 fps). */
export const LOWER_SECONDS = 0.5

/**
 * Lays out every drawbridge run. The hinge goes on the end nearer to a windmill (the bridges' switch); without one,
 * on the end that meets ground, else the west.
 */
export function layoutBridges(props: readonly PropView[], info: StageInfo): Map<number, BridgePiece> {
  const out = new Map<number, BridgePiece>()
  const pieces = props.filter((p) => p.kind === 'drawbridge')
  const key = (tx: number, ty: number) => `${tx},${ty}`
  const at = new Map<string, PropView>()
  for (const p of pieces) at.set(key(Math.floor(p.x / TILE), Math.floor(p.y / TILE)), p)
  const mills = props.filter((p) => p.kind === 'windmill')
  const seen = new Set<number>()
  for (const start of pieces) {
    if (seen.has(start.id)) continue
    // flood the run (4-neighbours)
    const run: [number, number, PropView][] = []
    const stack = [start]
    seen.add(start.id)
    while (stack.length) {
      const p = stack.pop()!
      const tx = Math.floor(p.x / TILE)
      const ty = Math.floor(p.y / TILE)
      run.push([tx, ty, p])
      for (const [dx, dy] of [
        [1, 0],
        [-1, 0],
        [0, 1],
        [0, -1]
      ]) {
        const q = at.get(key(tx + dx, ty + dy))
        if (q && !seen.has(q.id)) {
          seen.add(q.id)
          stack.push(q)
        }
      }
    }
    const x0 = Math.min(...run.map((r) => r[0]))
    const x1 = Math.max(...run.map((r) => r[0]))
    const cy = run.reduce((a, r) => a + r[1], 0) / run.length
    const west = { x: x0 * TILE, y: (cy + 0.5) * TILE }
    const east = { x: (x1 + 1) * TILE, y: west.y }
    let dir: 1 | -1 = 1
    if (mills.length) {
      const near = (e: { x: number; y: number }) => Math.min(...mills.map((m) => Math.hypot(m.x - e.x, m.y - e.y)))
      dir = near(east) < near(west) ? -1 : 1
    } else {
      const ground = (tx: number) => {
        const ty = Math.round(cy)
        const t = tx >= 0 && tx < info.w ? info.tiles[ty * info.w + tx] : 'sky'
        return t !== 'sky'
      }
      if (ground(x1 + 1) && !ground(x0 - 1)) dir = -1
    }
    const n = x1 - x0 + 1
    for (const [tx, ty] of run) {
      const p = at.get(key(tx, ty))!
      const up = at.has(key(tx, ty - 1))
      const down = at.has(key(tx, ty + 1))
      const row: BridgeRow = up && down ? 'm' : up ? 's' : down ? 'n' : 'o'
      const toHinge = at.has(key(tx - dir, ty))
      const toFree = at.has(key(tx + dir, ty))
      const col: BridgeCol = !toHinge ? 'h' : !toFree ? 'e' : 'm'
      out.set(p.id, { row, col, i: dir === 1 ? tx - x0 : x1 - tx, n, dir, hingeX: dir === 1 ? west.x : east.x })
    }
  }
  return out
}

/** Animation name of a lowered piece. */
export const downName = (b: BridgePiece) => `drawbridge_down_${b.row}${b.col}`
/** Animation name of the raised leaf on the hinge column (other pieces draw nothing). */
export const upName = (b: BridgePiece) => (b.row === 'o' ? 'drawbridge_up' : `drawbridge_up_${b.row}`)
/** Animation name of the leaf's free edge while lowering. */
export const edgeName = (b: BridgePiece) => (b.row === 'o' ? 'drawbridge_lowering' : `drawbridge_lowering_${b.row}`)

/**
 * How far (world px from the hinge) the lowering leaf reaches after `age` seconds: it falls ever faster, so the
 * deck sweeps out from the hinge and reaches the far bank as the pieces turn 'down'.
 */
export function bridgeReach(b: BridgePiece, age: number): number {
  const k = Math.min(1, Math.max(0, age / LOWER_SECONDS))
  return Math.max(10, b.n * TILE * Math.sin((Math.PI / 2) * k ** 1.6))
}
