/**
 * The knocked-out crow (`down` and the first frames of `revive`): flat on its back, belly up, feet in the air, X eyes,
 * the hat and weapon lying beside it and a few loose feathers.
 */
import { C, R } from '../palette'
import { Raster } from '../raster'
import { part } from './layer'
import { drawHeadgear, drawWeapon, type JobId } from './jobs'
import {
  BODY,
  HEAD,
  blob,
  drawBeakFront,
  drawEye,
  fan,
  looseFeather,
  shadeFeather,
  type Eyes,
  type V
} from './crow-body'
import { sparkle } from './body'

const F = R.crowFeather
const B = R.beak
const S = R.crowSheen
const rd = Math.round

export interface Lying {
  /** Fan angle of the upper wing (right-facing convention, negative = up). */
  wingUp: number
  wingDown: number
  /** Leg height in px (0 = legs flopped). */
  legs: number
  /** Leg tilt in px (the toes drift sideways). */
  legTilt?: number
  eyes: Eyes
  beak?: 0 | 1
  hat: boolean
  gear: boolean
  feathers: V[]
  /** Head lifted (revive). */
  lift?: number
  stars?: boolean
  sparkles?: boolean
  /** Body shift for wobble. */
  dx?: number
}

export function renderLying(job: JobId, v: Lying): Raster {
  const r = new Raster(64, 64)
  const dx = v.dx ?? 0
  const bx = 37 + dx
  const by = 49
  const hx = 20 + dx
  const hy = 47 - (v.lift ?? 0)
  // Tail fan behind the rump (right).
  fan(r, bx + 8, by + 1, 0.15, 15, false, 4, 0.2, 4.4, false)
  // Wings flopped out above and below.
  fan(r, bx - 1, by - 5, v.wingUp, 14, false, 4, 0.2, 4.4)
  // Legs up.
  const tilt = v.legTilt ?? 0
  for (const [lx, side] of [
    [bx + 3, 0],
    [bx + 9, 1]
  ] as const) {
    if (v.legs <= 0) continue
    part(r, (l) => {
      const topY = by - 6 - v.legs
      for (let y = topY; y < by - 4; y++) {
        const t = (y - topY) / v.legs
        const x = lx + rd(tilt * (1 - t) * (side ? 1 : 0.6))
        l.set(x, y, B[1])
        l.set(x + 1, y, B[2])
      }
      const tx = lx + rd(tilt * (side ? 1 : 0.6))
      l.set(tx - 1, topY - 1, B[0])
      l.set(tx + 2, topY - 1, B[2])
      l.set(tx, topY - 1, B[1])
      l.set(tx + 1, topY - 1, B[1])
      l.set(tx - 2, topY - 2, B[0])
      l.set(tx + 3, topY - 2, B[2])
    })
  }
  // Body: round belly up with the pale chest.
  part(r, (l) => {
    blob(l, bx, by, 13, 8, BODY)
    const pcx = bx - 0.5
    const pcy = by - 0.5
    for (let y = by - 8; y <= by + 8; y++)
      for (let x = bx - 13; x <= bx + 13; x++) {
        const nx = (x + 0.5 - pcx) / 9
        const ny = (y + 0.5 - pcy) / 5.5
        if (nx * nx + ny * ny > 1 || !l.get(x, y)) continue
        l.set(x, y, nx * -0.5 + ny * -0.7 > 0.3 ? F[0] : F[0])
      }
    for (let i = -1; i <= 1; i++)
      for (const [ddx, ddy] of [
        [-1, -1],
        [0, 0],
        [1, -1]
      ])
        if (l.get(bx + i * 4 + ddx, by + 2 + ddy)) l.set(bx + i * 4 + ddx, by + 2 + ddy, F[1])
  })
  // Lower wing over the belly's near side.
  fan(r, bx - 3, by + 4, v.wingDown, 12, true, 4, 0.2, 4.2)
  // The hat tossed beside the head.
  if (v.hat) drawHeadgear(r, job, { x: hx - 9, y: 31, w: 24, dir: 'down' }, 4, 3)
  // Head, face up.
  part(r, (l) => blob(l, hx, hy, 11.5, 10, HEAD))
  drawEye(r, v.eyes, hx - 9, hy - 3, false)
  drawEye(r, v.eyes, hx + 4, hy - 3, true)
  r.paint(hx - 10, hy + 3, C.blush)
  r.paint(hx - 9, hy + 3, C.blush)
  r.paint(hx + 9, hy + 3, C.blush)
  r.paint(hx + 10, hy + 3, C.blush)
  drawBeakFront(r, hx, hy + 0, v.beak ?? 0)
  if (v.gear) {
    const wl = new Raster(64, 64)
    drawWeapon(wl, job, { x: 24, y: 32, ang: 0, dir: 'down' }, {})
    const wb = wl.bounds()
    if (wb) r.blit(wl.crop(wb.x, wb.y, wb.w, wb.h), 31, 60 - wb.h)
  }
  v.feathers.forEach(([x, y], i) => looseFeather(r, x, y, [0.6, 2.4, -0.5, 1.2][i % 4], 6, 2.6))
  if (v.stars)
    for (const [x, y] of [
      [hx - 5, hy - 14],
      [hx + 6, hy - 15],
      [hx, hy - 17]
    ] as const)
      sparkle(r, x, y, R.holy, 1)
  if (v.sparkles) sparkle(r, hx + 14, hy - 13, R.magic, 1)
  void shadeFeather
  void S
  return r
}
