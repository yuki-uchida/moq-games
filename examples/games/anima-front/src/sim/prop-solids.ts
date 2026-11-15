/**
 * The solid footprints of the big mission props (DESIGN §9): upright cylinders standing on the prop's base. The 灯台
 * is its shaft with the gallery (r 1.5 up to 9 m) and the sandbag ring with the plinth around its foot (r 2.1 up
 * to 0.8 m); a 巣核 is its pod (r 1.6 up to 3.5 m). They block movement, shots, beams, the ヤモリフック and sight lines
 * for every side (src/sim/props.ts → Physics.solids); the guest's prediction (src/sim/predictor.ts) and the shoulder
 * camera (src/render/index.ts) share these shapes.
 * The escort cart moves and stays walk-through.
 */
import type { PropKind, Surface } from './types'

/** A vertical cylinder: centre x/z, radius, y range; `tag` is the prop id. */
export interface SolidCyl {
  x: number
  z: number
  r: number
  y0: number
  y1: number
  tag: number
  /** Impact surface for shots that stop on it. */
  surface?: Surface
}

/** Cylinders per prop kind: radius and height above the prop's base. */
const SURFACE: Partial<Record<PropKind, Surface>> = { lighthouse: 'concrete', node: 'crystal' }

export const PROP_SOLIDS: Partial<Record<PropKind, readonly { r: number; h: number }[]>> = {
  lighthouse: [
    { r: 1.5, h: 9 },
    { r: 2.1, h: 0.8 }
  ],
  node: [{ r: 1.6, h: 3.5 }]
}

/** Appends the cylinders of a prop (sim prop or prop view) to `out`. */
export function propSolids(
  r: { readonly id: number; readonly kind: PropKind; readonly p: readonly number[] },
  out: SolidCyl[]
): SolidCyl[] {
  const parts = PROP_SOLIDS[r.kind]
  if (parts)
    for (const s of parts)
      out.push({ x: r.p[0], z: r.p[2], r: s.r, y0: r.p[1], y1: r.p[1] + s.h, tag: r.id, surface: SURFACE[r.kind] })
  return out
}

/** Outer radius of a solid prop at ground level (where walkers stop), 0 for a walk-through kind. */
export function solidReach(kind: PropKind): number {
  let m = 0
  for (const s of PROP_SOLIDS[kind] ?? []) m = Math.max(m, s.r)
  return m
}
