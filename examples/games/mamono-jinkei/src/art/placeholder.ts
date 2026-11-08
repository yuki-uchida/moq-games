/**
 * Stand-in art that satisfies the contract (contract.ts) so the game runs before a sheet's real art exists.
 * Deliberately plain: flat shapes, a facing mark and a frame wobble. The registry prefers real sheets.
 */
import { JOBS, TILE, type TileKind } from '../vocab'
import type { AnimSpec } from './contract'
import { R, C } from './palette'
import { Raster, ball, outline, type Ramp } from './raster'
import { anchorOf, type Anim, type Sheet } from './sheet'

function rampFor(id: string): Ramp {
  if (id.startsWith('hero:')) {
    const job = id.split(':')[2]
    return [R.jobRed, R.jobBlue, R.jobGreen, R.jobGold][Math.max(0, JOBS.indexOf(job as never))]
  }
  if (id.startsWith('enemy:')) return R.clothCrimson
  if (id.startsWith('boss:')) return R.clothPurple
  if (id.startsWith('npc:')) return R.jobGreen
  if (id.startsWith('tech:')) return R.jobBlue
  if (id.startsWith('props:')) return R.wood
  if (id === 'items') return R.gold
  if (id === 'ui') return R.paper
  return R.magic
}

function frame(spec: AnimSpec, ramp: Ramp, name: string, i: number): Raster {
  const r = new Raster(spec.w, spec.h)
  const anchor = spec.anchor ?? anchorOf({ frames: [r], fps: 1, loop: false })
  const [ax, ay] = anchor
  const wobble = i % 2
  const character = spec.w >= 64 && spec.w === spec.h && !name.startsWith('turn')
  if (character) {
    const rx = spec.w * 0.28
    const ry = spec.h * 0.3 - wobble
    ball(r, ax, ay - ry, rx, ry, ramp)
    // Facing mark: a pale nub on the facing side.
    const dir = name.endsWith('_up') ? [0, -1] : name.endsWith('_side') ? [1, 0] : [0, 1]
    r.ellipse(ax + dir[0] * rx * 0.6, ay - ry + dir[1] * ry * 0.5, 3, 3, C.white)
  } else {
    const m = Math.max(2, Math.floor(Math.min(spec.w, spec.h) * 0.15))
    r.rect(m, m + wobble, spec.w - 2 * m, spec.h - 2 * m - wobble, ramp[1 + (i % 2)])
  }
  outline(r)
  return r
}

/** A placeholder sheet for any spec. */
export function placeholderSheet(id: string, spec: Record<string, AnimSpec>): Sheet {
  const ramp = rampFor(id)
  const sheet: Sheet = {}
  for (const [name, s] of Object.entries(spec)) {
    const frames = Array.from({ length: s.frames }, (_, i) => frame(s, ramp, name, i))
    const a: Anim = { frames, fps: s.fps, loop: s.loop }
    if (s.anchor) a.anchor = s.anchor
    if (s.lift) a.lift = frames.map((_, i) => Math.round(Math.sin((i / Math.max(1, s.frames - 1)) * Math.PI) * 20))
    sheet[name] = a
  }
  return sheet
}

const FLAT: Partial<Record<TileKind, Ramp>> = {
  grass: R.grass,
  flowers: R.grass,
  path: R.dirt,
  floor: R.stone,
  bridge: R.wood,
  wall: R.stone,
  hedge: R.grassDark,
  fence: R.grass,
  water: R.water,
  pit: R.shadow,
  spikes: R.steel
}

/** A placeholder terrain tile: flat colour, darker for blocking kinds, a faint grid. */
export function placeholderTile(kind: TileKind, frame: number): Raster {
  const ramp = FLAT[kind] ?? R.paper
  const blocking = kind === 'wall' || kind === 'hedge' || kind === 'pit'
  const r = new Raster(TILE, TILE).rect(0, 0, TILE, TILE, ramp[blocking ? 2 : 1])
  r.line(0, 0, TILE - 1, 0, ramp[blocking ? 3 : 2]).line(0, 0, 0, TILE - 1, ramp[blocking ? 3 : 2])
  if (kind === 'water') for (let x = 0; x < TILE; x += 8) r.set((x + frame * 2) % TILE, 20 + (x % 16), ramp[0])
  if (kind === 'fence') r.rect(4, 24, 56, 6, R.wood[1]).rect(4, 38, 56, 6, R.wood[2])
  if (kind === 'flowers') for (let i = 0; i < 6; i++) r.set(8 + i * 9, 14 + ((i * 23) % 36), R.jobRed[1])
  return r
}
