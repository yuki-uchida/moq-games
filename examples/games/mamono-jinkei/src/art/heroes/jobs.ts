/**
 * Job outfits for the four fantasy jobs, written so every species can reuse them (slime now; rat, crow and wolf later).
 *
 * Conventions
 * - All positions are pixels in the 64×64 frame; `k` (default 1) scales the geometry (the jumbo slime uses k > 1) —
 *   outfit parts are drawn natively at any k, never as scaled rasters, so the pixel density stays uniform.
 * - Directions: `down` = front, `up` = back, `side` = facing right (the renderer mirrors it).
 * - `HeadAnchor` is the crown of the head: (x, y) = top centre of the skull, `w` = head width a hat has to cover.
 *   Hats extend upwards from y and cover about 8·k px below it.
 * - `sway` = how far hat tips / plumes / feathers trail to the LEFT (behind a right-facing hero), in px: animate it
 *   with follow-through (peak one frame after the body stops).
 * - `HandAnchor` is the fist: (x, y), `ang` = direction the weapon points in radians (0 = right, π/2 = down).
 * - Weapons are drawn in the main hand; the buckler and the archer's string hand ride the off hand.
 * - Every piece is its own outlined layer (`part`), so overlaps read as inner contours.
 */
import { C, R } from '../palette'
import { Raster, ball, type Ramp } from '../raster'
import { boxOf, outlineBox as outline, part } from './layer'

export type Dir = 'down' | 'up' | 'side'
export type JobId = 'sword' | 'mage' | 'archer' | 'cleric'

export const JOB_RAMP: Record<JobId, Ramp> = {
  sword: R.jobRed,
  mage: R.jobBlue,
  archer: R.jobGreen,
  cleric: R.jobGold
}

export interface HeadAnchor {
  x: number
  y: number
  w: number
  dir: Dir
  k?: number
}

export interface HandAnchor {
  x: number
  y: number
  ang: number
  dir: Dir
  k?: number
}

export interface WeaponFx {
  /** Crystal / ring glow: 0 none, 1 glowing, 2 bright burst. */
  glow?: number
  /** Bow draw 0..1 (archer): the string is pulled back and an arrow nocked. */
  draw?: number
  /** Staff length factor (foreshortening when thrust toward or away from the viewer). */
  len?: number
}

/** Edge-light a single-material layer: upper-left rim to the highlight, lower-right rim to the shade. */
export function edgeShade(l: Raster, ramp: Ramp) {
  const b = boxOf(l)
  if (!b) return l
  const src = l.clone()
  for (let y = b.y; y < b.y + b.h; y++)
    for (let x = b.x; x < b.x + b.w; x++) {
      if (src.get(x, y) !== ramp[1]) continue
      const dark = !src.get(x + 1, y) || !src.get(x, y + 1)
      const lit = !src.get(x - 1, y) || !src.get(x, y - 1)
      if (dark && !lit) l.set(x, y, ramp[2])
      else if (lit && !dark) l.set(x, y, ramp[0])
      else if (dark && lit) l.set(x, y, ramp[2])
    }
  return l
}

const rd = Math.round
const SIDE = (dir: Dir, k: number) => (dir === 'side' ? 4 * k : 0)

/* ------------------------------------------------------------------ headgear */

export function drawHeadgear(r: Raster, job: JobId, h: HeadAnchor, sway = 0, tilt = 0) {
  const x = h.x + tilt
  switch (job) {
    case 'sword':
      return helmet(r, { ...h, x }, sway)
    case 'mage':
      return wizardHat(r, { ...h, x }, sway)
    case 'archer':
      return hood(r, { ...h, x }, sway)
    case 'cleric':
      return clericHat(r, { ...h, x }, sway)
  }
}

/** Small rounded steel helmet with a visor slit and a red plume. */
function helmet(r: Raster, h: HeadAnchor, sway: number) {
  const k = h.k ?? 1
  const { x, y, dir } = h
  const side = SIDE(dir, k)
  // Feathered crest: a thick arc flowing backwards, darker underside, light upper edge.
  part(r, (l) => {
    const rp = R.jobRed
    const isSide = dir === 'side'
    const p0 = isSide ? [x + 2 * k, y + 1 * k] : [x + 1 * k, y + 1 * k]
    const p1 = isSide ? [x - 2 * k, y - 9 * k] : [x - 1 * k - sway * 0.2, y - 10 * k]
    const p2 = isSide ? [x - 12 * k - sway * 1.2, y - 4 * k] : [x - 9 * k - sway * 1.2, y - 5 * k]
    const at = (t: number): [number, number] => [
      (1 - t) * (1 - t) * p0[0] + 2 * (1 - t) * t * p1[0] + t * t * p2[0],
      (1 - t) * (1 - t) * p0[1] + 2 * (1 - t) * t * p1[1] + t * t * p2[1]
    ]
    const arc = (dy: number, col: number, w0: number, w1: number) => {
      for (let i = 0; i <= 16; i++) {
        const t = i / 16
        const [px, py] = at(t)
        const wd = (w0 + (w1 - w0) * t) / 2
        l.ellipse(px, py + dy, wd, wd, col)
      }
    }
    arc(1, rp[2], 4.8 * k, 2.4 * k)
    arc(0, rp[1], 4.4 * k, 2 * k)
    for (let i = 1; i <= 11; i++) {
      const [px, py] = at(i / 16)
      l.set(px, py - 1.6 * k, rp[0])
    }
    // Feather notches along the underside.
    for (const t of [0.45, 0.65, 0.85]) {
      const [px, py] = at(t)
      l.set(px, py + 2 * k, rp[3])
    }
  })
  part(r, (l) => {
    ball(l, x + side * 0.15, y + 5 * k, 10.5 * k, 6.8 * k, R.steel)
    for (let yy = rd(y + 6.5 * k); yy < l.h; yy++) for (let xx = 0; xx < l.w; xx++) l.set(xx, yy, 0)
    // Brim band and visor slit.
    const by = rd(y + 6 * k)
    for (let xx = rd(x - 13 * k); xx <= rd(x + 13 * k); xx++) if (l.get(xx, by)) l.set(xx, by, R.steel[2])
    if (dir !== 'up') {
      const sy = rd(y + 3.5 * k)
      for (let xx = rd(x - 5 * k + side); xx <= rd(x + 5 * k + side); xx++) {
        l.set(xx, sy, R.steel[4])
        if (l.get(xx, sy + 1)) l.set(xx, sy + 1, R.steel[2])
      }
    } else {
      // Back of the helmet: a centre ridge.
      for (let yy = rd(y + 1 * k); yy < rd(y + 6 * k); yy++) l.paint(x, yy, R.steel[0])
    }
    // Rivet shine.
    l.paint(rd(x - 7 * k), rd(y + 5 * k), R.steel[0])
  })
}

/** Tall floppy wizard hat: navy, gold band and star, the tip bends backwards in three drooping segments. */
function wizardHat(r: Raster, h: HeadAnchor, sway: number) {
  const k = h.k ?? 1
  const { x, y, dir } = h
  const cn = R.clothNavy
  const base = y + 3 * k
  const H = 11 * k
  const side = SIDE(dir, k)
  const cx = (t: number) => x + side * (1 - t) * 0.5
  const half = (t: number) => 9.5 * k * (1 - t) + 3 * k * t
  part(r, (l) => {
    for (let yy = rd(base - H); yy <= rd(base); yy++) {
      const t = Math.min(1, Math.max(0, (base - yy) / H))
      const c = cx(t)
      const hw = half(t)
      for (let xx = Math.ceil(c - hw); xx <= Math.floor(c + hw); xx++) l.set(xx, yy, cn[1])
    }
    const tx = cx(1)
    const ty = base - H
    const s1: [number, number] = [tx - 4 * k - sway * 0.3, ty - 5 * k]
    const s2: [number, number] = [tx - 9 * k - sway * 0.8, ty - 6.5 * k]
    const s3: [number, number] = [tx - 12.5 * k - sway * 1.3, ty - 3 * k]
    l.thick(tx, ty + 1, s1[0], s1[1], 5.6 * k, cn[1])
    l.thick(s1[0], s1[1], s2[0], s2[1], 3.8 * k, cn[1])
    l.thick(s2[0], s2[1], s3[0], s3[1], Math.max(2, 2.2 * k), cn[1])
    edgeShade(l, cn)
    // Gold band.
    for (let yy = rd(base - 5 * k); yy <= rd(base - 2.5 * k); yy++)
      for (let xx = 0; xx < l.w; xx++)
        if (l.get(xx, yy)) l.set(xx, yy, yy === rd(base - 2.5 * k) ? R.gold[2] : R.gold[1])
    // Star on the front.
    if (dir !== 'up') {
      const sx = rd(cx(0.45) + side * 0.4)
      const sy = rd(base - 8 * k)
      l.set(sx, sy, R.gold[0])
      l.set(sx - 1, sy, R.gold[1])
      l.set(sx + 1, sy, R.gold[1])
      l.set(sx, sy - 1, R.gold[1])
      l.set(sx, sy + 1, R.gold[2])
    }
  })
  // Brim.
  part(r, (l) => {
    l.ellipse(x + side * 0.4, base + 0.5, 15 * k, 4 * k, cn[1])
    const src = l.clone()
    for (let yy = 0; yy < l.h; yy++)
      for (let xx = 0; xx < l.w; xx++) {
        if (!src.get(xx, yy)) continue
        if (!src.get(xx, yy + 1) || !src.get(xx + 1, yy)) l.set(xx, yy, cn[2])
        else if (!src.get(xx, yy - 1) || !src.get(xx - 1, yy)) l.set(xx, yy, cn[0])
      }
    for (let xx = rd(x - 8 * k + side * 0.4); xx <= rd(x + 8 * k + side * 0.4); xx++) l.paint(xx, rd(base), R.gold[1])
  })
}

/** Short forest-green hunter's hood with a white feather. */
function hood(r: Raster, h: HeadAnchor, sway: number) {
  const k = h.k ?? 1
  const { x, y, dir } = h
  const cf = R.clothForest
  const side = SIDE(dir, k)
  // Hood tail behind (only short).
  part(r, (l) => {
    if (dir === 'side') {
      l.thick(x - 8 * k, y + 5 * k, x - 12 * k - sway * 0.3, y + 9 * k, 4 * k, cf[1])
    } else if (dir === 'up') {
      l.poly([x - 4 * k, y + 6 * k, x + 4 * k, y + 6 * k, x - sway * 0.4, y + 13 * k], cf[1])
    }
    edgeShade(l, cf)
  })
  // Feather (back of the hat): long white quill sweeping up and back.
  part(r, (l) => {
    const fx = x + 6 * k + side * 0.5
    const fy = y + 2 * k
    l.thick(fx, fy, fx + 2 * k - sway * 0.2, fy - 6 * k, 3 * k, R.paper[1])
    l.thick(fx + 2 * k - sway * 0.2, fy - 6 * k, fx + 1 * k - sway * 0.9, fy - 11 * k, Math.max(2, 2 * k), R.paper[1])
    edgeShade(l, R.paper)
    // Quill.
    l.paint(rd(fx + 1 * k), rd(fy - 3 * k), R.paper[3])
    l.paint(rd(fx + 1 * k - sway * 0.2), rd(fy - 6 * k), R.paper[3])
  })
  part(r, (l) => {
    ball(l, x + side * 0.15, y + 5.2 * k, 11 * k, 7 * k, cf, false)
    for (let yy = rd(y + 6.5 * k); yy < l.h; yy++) for (let xx = 0; xx < l.w; xx++) l.set(xx, yy, 0)
    // Folded-up brim band, lighter.
    const by = rd(y + 5 * k)
    for (let yy = by; yy <= rd(y + 6 * k); yy++)
      for (let xx = rd(x - 14 * k); xx <= rd(x + 14 * k); xx++)
        if (l.get(xx, yy)) l.set(xx, yy, yy === by ? cf[0] : cf[1])
    // Peak highlight.
    if (dir !== 'up') {
      l.paint(rd(x - 6 * k), rd(y + 2 * k), cf[0])
      l.paint(rd(x - 5 * k), rd(y + 1 * k), cf[0])
      l.paint(rd(x - 4 * k), rd(y + 1 * k), cf[0])
    }
    // Feather pin.
    if (dir !== 'up') l.paint(rd(x + 6 * k + side * 0.5), rd(y + 4 * k), R.gold[1])
  })
}

/** Tall two-tier white mitre with gold trim, a sun emblem and a tiny blue gem. */
function clericHat(r: Raster, h: HeadAnchor, sway: number) {
  const k = h.k ?? 1
  const { x, y, dir } = h
  const cw = R.clothWhite
  const side = SIDE(dir, k)
  // Ribbon tails behind.
  part(r, (l) => {
    if (dir !== 'down') {
      const ex = dir === 'side' ? x - 10 * k : x + 7 * k
      l.thick(ex, y + 7 * k, ex - 3 * k - sway * 0.5, y + 12 * k, 2 * k, cw[1])
    } else {
      l.thick(x + 10 * k, y + 7 * k, x + 12 * k, y + 11 * k, 2 * k, cw[1])
    }
    edgeShade(l, cw)
  })
  // Lower tier.
  part(r, (l) => {
    ball(l, x + side * 0.15, y + 4.5 * k, 10.5 * k, 6.5 * k, cw)
    for (let yy = rd(y + 6.5 * k); yy < l.h; yy++) for (let xx = 0; xx < l.w; xx++) l.set(xx, yy, 0)
    for (let yy = rd(y + 5 * k); yy <= rd(y + 6 * k); yy++)
      for (let xx = rd(x - 14 * k); xx <= rd(x + 14 * k); xx++)
        if (l.get(xx, yy)) l.set(xx, yy, yy === rd(y + 6 * k) ? R.gold[2] : R.gold[1])
    if (dir !== 'up') {
      const gx = rd(x + side * 0.9)
      const gy = rd(y + 2.5 * k)
      l.set(gx, gy, R.magic[0])
      l.set(gx + 1, gy, R.magic[1])
      l.set(gx, gy + 1, R.magic[1])
      l.set(gx + 1, gy + 1, R.magic[2])
    }
  })
  // Upper tier rising above.
  part(r, (l) => {
    ball(l, x + side * 0.3, y - 2 * k, 7 * k, 7 * k, cw)
    for (let yy = rd(y + 1.5 * k); yy < l.h; yy++) for (let xx = 0; xx < l.w; xx++) l.set(xx, yy, 0)
    for (let yy = rd(y); yy <= rd(y + 1 * k); yy++)
      for (let xx = rd(x - 8 * k); xx <= rd(x + 8 * k); xx++)
        if (l.get(xx, yy)) l.set(xx, yy, yy === rd(y + 1 * k) ? R.gold[2] : R.gold[1])
    if (dir !== 'up') {
      const sx = rd(x + side * 0.9)
      const sy = rd(y - 3.5 * k)
      l.set(sx, sy, R.gold[0])
      l.set(sx - 1, sy, R.gold[1])
      l.set(sx + 1, sy, R.gold[1])
      l.set(sx, sy - 1, R.gold[1])
      l.set(sx, sy + 1, R.gold[2])
      l.set(sx - 2, sy, R.gold[2])
      l.set(sx + 2, sy, R.gold[2])
      l.set(sx, sy - 2, R.gold[1])
    }
  })
  // Cool shadow line between the hat and the gold body.
  for (let xx = rd(x - 10 * k + side * 0.2); xx <= rd(x + 10 * k + side * 0.2); xx++)
    r.paint(xx, rd(y + 8 * k), R.shadow[2])
}

/** Cleric's white stole with gold ends, draped over the upper third of the dome like shoulders. */
export function drawStole(r: Raster, cx: number, top: number, w: number, h: number, dir: Dir) {
  const cw = R.clothWhite
  const strip = (l: Raster, x0: number, y0: number, x1: number, y1: number) => {
    l.thick(x0, y0, x1, y1, 3.2, cw[1])
    edgeShade(l, cw)
    const gx = x0 + (x1 - x0) * 0.7
    const gy = y0 + (y1 - y0) * 0.7
    l.thick(gx, gy, x1, y1, 3.2, R.gold[1])
    l.paint(rd(x1), rd(y1) + 2, R.gold[2])
  }
  part(r, (l) => {
    if (dir === 'down') {
      strip(l, cx - 0.31 * w, top + 0.3 * h, cx - 0.4 * w, top + 0.66 * h)
      strip(l, cx + 0.31 * w, top + 0.3 * h, cx + 0.4 * w, top + 0.66 * h)
    } else if (dir === 'up') {
      l.thick(cx - 0.34 * w, top + 0.28 * h, cx, top + 0.38 * h, 3.2, cw[1])
      l.thick(cx, top + 0.38 * h, cx + 0.34 * w, top + 0.28 * h, 3.2, cw[1])
      edgeShade(l, cw)
      l.thick(cx - 0.34 * w, top + 0.28 * h, cx - 0.38 * w, top + 0.56 * h, 3.2, R.gold[1])
      l.thick(cx + 0.34 * w, top + 0.28 * h, cx + 0.38 * w, top + 0.56 * h, 3.2, R.gold[1])
    } else {
      strip(l, cx - 0.2 * w, top + 0.22 * h, cx - 0.3 * w, top + 0.6 * h)
    }
  })
}

/** Cleric's tiny scarf: a band across the lower body (only where the body is) with a tail. */
export function drawScarf(r: Raster, cx: number, y: number, halfW: number, side: Dir, sway = 0) {
  const cw = R.clothWhite
  const l = new Raster(r.w, r.h)
  for (let xx = rd(cx - halfW); xx <= rd(cx + halfW); xx++) {
    if (!r.get(xx, y)) continue
    const u = (xx - cx) / halfW
    const dy = rd(u * u * 1.6)
    l.set(xx, y + dy, cw[1])
    if (Math.abs(u) > 0.2) l.set(xx, y + dy + 1, cw[2])
  }
  const tx = side === 'side' ? cx - halfW * 0.5 : cx + halfW * 0.6
  l.thick(tx, y + 2, tx - 1 - sway * 0.3, y + 7, 2.5, cw[1])
  l.paint(rd(tx - 1), y + 3, cw[0])
  outline(l)
  // Keep the scarf within the body for the band, free for the tail.
  r.blit(l)
}

/** Quiver with arrows on the back. `behind` = drawn before the body (peeks over the shoulder). */
export function drawQuiver(r: Raster, h: { x: number; y: number; dir: Dir; k?: number }) {
  const k = h.k ?? 1
  const { x, y, dir } = h
  part(r, (l) => {
    // Arrow tails first.
    const slant = dir === 'side' ? -0.5 : 0.35
    for (let i = 0; i < 3; i++) {
      const ax = x + (i - 1) * 2 * k
      l.line(ax, y + 2 * k, ax + slant * 4, y - 4 * k - i, R.wood[0])
      l.set(rd(ax + slant * 4), rd(y - 5 * k - i), R.paper[1])
      l.set(rd(ax + slant * 4) + (i % 2 ? 1 : -1), rd(y - 4 * k - i), R.jobGreen[1])
    }
    // Leather body.
    l.poly(
      [
        x - 3.5 * k,
        y + 1 * k,
        x + 3.5 * k,
        y + 1 * k,
        x + 3 * k + slant * 2,
        y + 12 * k,
        x - 3 * k + slant * 2,
        y + 12 * k
      ],
      R.leather[1]
    )
    const src = l.clone()
    for (let yy = 0; yy < l.h; yy++)
      for (let xx = 0; xx < l.w; xx++) {
        if (src.get(xx, yy) !== R.leather[1]) continue
        if (!src.get(xx + 1, yy)) l.set(xx, yy, R.leather[2])
        else if (!src.get(xx - 1, yy)) l.set(xx, yy, R.leather[0])
      }
    l.rect(rd(x - 3 * k), rd(y + 4 * k), rd(6 * k), 1, R.leather[3])
    l.rect(rd(x - 3 * k), rd(y + 1 * k), rd(7 * k), 1, R.gold[1])
  })
}

/** Round wooden buckler centred on the off hand. */
export function drawBuckler(r: Raster, x: number, y: number, k = 1) {
  part(r, (l) => {
    ball(l, x, y, 6.5 * k, 6.5 * k, R.wood, false)
    // Steel rim ring on the shaded side and a boss.
    l.ring(x, y, 5 * k, 6.5 * k, R.wood[2], 0.2, Math.PI * 0.95)
    l.ellipse(x, y, 2 * k, 2 * k, R.steel[1])
    l.paint(rd(x - 0.5 * k), rd(y - 0.5 * k), R.steel[0])
    l.paint(rd(x + 1 * k), rd(y + 1 * k), R.steel[2])
  })
}

/* ------------------------------------------------------------------ weapons */

const polar = (x: number, y: number, ang: number, d: number): [number, number] => [
  x + Math.cos(ang) * d,
  y + Math.sin(ang) * d
]

/** Draws the job's weapon in the fist; returns the tip (for flashes) and the bow's nock point. */
export function drawWeapon(
  r: Raster,
  job: JobId,
  hand: HandAnchor,
  fx: WeaponFx = {}
): { tip: [number, number]; nock?: [number, number] } {
  switch (job) {
    case 'sword':
      return sword(r, hand)
    case 'mage':
      return staff(r, hand, fx, false)
    case 'archer':
      return bow(r, hand, fx)
    case 'cleric':
      return staff(r, hand, fx, true)
  }
}

/** Where the archer's off hand should go while the bow is drawn. */
export function bowNock(hand: HandAnchor, draw: number): [number, number] {
  const k = hand.k ?? 1
  return polar(hand.x, hand.y, hand.ang, -draw * 7 * k)
}

function sword(r: Raster, h: HandAnchor) {
  const k = h.k ?? 1
  const { x, y, ang } = h
  const L = 13 * k
  part(r, (l) => {
    // Blade, guard, grip, pommel.
    const [bx, by] = polar(x, y, ang, 2.5 * k)
    const [tx, ty] = polar(x, y, ang, 2.5 * k + L)
    l.thick(bx, by, tx, ty, 3 * k, R.steel[1])
    edgeShade(l, R.steel)
    // Blade tip taper: remove the corner pixel behind the very tip.
    const [gx, gy] = polar(x, y, ang, 2 * k)
    const px = -Math.sin(ang)
    const py = Math.cos(ang)
    l.line(gx + px * 3 * k, gy + py * 3 * k, gx - px * 3 * k, gy - py * 3 * k, R.gold[1])
    const [ex, ey] = polar(x, y, ang, -2 * k)
    l.thick(ex, ey, x, y, 2 * k, R.leather[1])
    l.set(rd(ex - Math.cos(ang)), rd(ey - Math.sin(ang)), R.gold[2])
    // Fuller shine.
    const [sx, sy] = polar(x, y, ang, 6 * k)
    l.paint(sx, sy, R.steel[0])
  })
  return { tip: polar(x, y, ang, 2.5 * k + L) }
}

function crystal(r: Raster, cx: number, cy: number, glow: number, k: number, ramp: Ramp, holy: boolean) {
  if (glow > 0) {
    // Halo: scattered sparks around the stone.
    const rr = glow > 1 ? 7 * k : 5 * k
    const sparkle: [number, number][] = [
      [-1, -1],
      [1, -0.8],
      [1.1, 0.4],
      [-0.9, 0.9],
      [0.1, -1.2]
    ]
    for (const [dx, dy] of sparkle) r.set(rd(cx + dx * rr), rd(cy + dy * rr), holy ? R.holy[0] : C.spark)
    if (glow > 1) {
      for (let d = 3; d <= 6; d++) {
        r.set(rd(cx - d * k), rd(cy), ramp[0])
        r.set(rd(cx + d * k), rd(cy), ramp[0])
        r.set(rd(cx), rd(cy - d * k), ramp[0])
        r.set(rd(cx), rd(cy + d * k), ramp[0])
      }
    }
  }
  part(r, (l) => {
    // Faceted diamond 5 wide, 7 tall.
    const hw = 2.4 * k
    const hh = 3.6 * k
    for (let yy = rd(cy - hh); yy <= rd(cy + hh); yy++) {
      const t = Math.abs(yy + 0.5 - cy) / hh
      const w = hw * (1 - Math.pow(t, 1.6) * 0.75)
      for (let xx = Math.ceil(cx - w); xx <= Math.floor(cx + w); xx++) l.set(xx, yy, ramp[1])
    }
    for (let yy = 0; yy < l.h; yy++)
      for (let xx = 0; xx < l.w; xx++) {
        if (l.get(xx, yy) !== ramp[1]) continue
        if (xx > cx && yy >= cy) l.set(xx, yy, ramp[2])
        else if (xx < cx && yy <= cy) l.set(xx, yy, ramp[0])
      }
    l.paint(rd(cx - 0.5), rd(cy - hh * 0.4), C.white)
    if (glow > 0) {
      l.paint(rd(cx), rd(cy), C.white)
      l.paint(rd(cx - 1), rd(cy), ramp[0])
    }
  })
}

function staff(r: Raster, h: HandAnchor, fx: WeaponFx, cleric: boolean) {
  const k = h.k ?? 1
  const { x, y, ang } = h
  const back = 7 * k
  const len = (cleric ? 24 : 25) * k * (fx.len ?? 1)
  const [ax, ay] = polar(x, y, ang, -back)
  const [tx, ty] = polar(x, y, ang, len)
  part(r, (l) => {
    l.thick(ax, ay, tx, ty, Math.max(2, 2 * k), R.wood[1])
    edgeShade(l, R.wood)
    // Grip wraps.
    const [wx, wy] = polar(x, y, ang, 0)
    l.paint(wx, wy, R.leather[3])
    const [wx2, wy2] = polar(x, y, ang, 2 * k)
    l.paint(wx2, wy2, R.leather[3])
  })
  const [hx, hy] = polar(x, y, ang, len + 2.5 * k)
  if (cleric) {
    const glow = fx.glow ?? 0
    const cx = rd(hx)
    const cy = rd(hy)
    if (glow) {
      for (const [dx, dy] of [
        [-6, -2],
        [6, -3],
        [-5, 5],
        [5, 4],
        [0, -8]
      ])
        r.set(cx + rd(dx * k), cy + rd(dy * k), glow > 1 ? C.white : R.holy[0])
    }
    part(r, (l) => {
      // Gold ring on top, a hollow circle.
      l.ring(cx, cy, 2.6 * k, 4.4 * k, R.gold[1])
      const src = l.clone()
      for (let yy = 0; yy < l.h; yy++)
        for (let xx = 0; xx < l.w; xx++) {
          if (src.get(xx, yy) !== R.gold[1]) continue
          if (xx + yy > cx + cy + 1) l.set(xx, yy, R.gold[2])
          else if (xx + yy < cx + cy - 2) l.set(xx, yy, R.gold[0])
        }
      l.set(cx, cy, glow ? C.white : R.gold[0])
      l.set(cx - 1, cy, R.holy[1])
      l.set(cx + 1, cy, R.holy[1])
      l.set(cx, cy - 1, R.holy[1])
      l.set(cx, cy + 1, R.holy[1])
    })
  } else {
    crystal(r, hx, hy, fx.glow ?? 0, k, R.magic, false)
  }
  return { tip: [hx, hy] as [number, number] }
}

function bow(r: Raster, h: HandAnchor, fx: WeaponFx) {
  const k = h.k ?? 1
  const { x, y, ang } = h
  const draw = fx.draw ?? 0
  const px = -Math.sin(ang)
  const py = Math.cos(ang)
  const R0 = 11 * k
  const bulge = (3.5 - draw * 1.5) * k
  const pts: [number, number][] = []
  for (let s = -1; s <= 1.001; s += 0.125) {
    const f = bulge * (1 - s * s)
    pts.push([x + px * s * R0 + Math.cos(ang) * f, y + py * s * R0 + Math.sin(ang) * f])
  }
  const nock = polar(x, y, ang, -draw * 7 * k)
  // String first (behind the bow limbs), then the arrow, then the wood.
  const tip0 = pts[0]
  const tip1 = pts[pts.length - 1]
  part(
    r,
    (l) => {
      l.line(tip0[0], tip0[1], nock[0], nock[1], R.paper[2])
      l.line(nock[0], nock[1], tip1[0], tip1[1], R.paper[2])
    },
    false
  )
  if (draw > 0.15) {
    part(r, (l) => {
      const [fx0, fy0] = polar(nock[0], nock[1], ang, -1)
      const [ex, ey] = polar(nock[0], nock[1], ang, 12 * k)
      l.line(fx0, fy0, ex, ey, R.wood[0])
      const [hx, hy] = polar(ex, ey, ang, 1.5)
      l.set(rd(hx), rd(hy), R.steel[1])
      l.set(rd(ex), rd(ey), R.steel[0])
      // Fletching.
      l.set(rd(fx0 + px), rd(fy0 + py), R.jobGreen[1])
      l.set(rd(fx0 - px), rd(fy0 - py), R.jobGreen[2])
    })
  }
  part(r, (l) => {
    for (let i = 0; i + 1 < pts.length; i++) l.thick(pts[i][0], pts[i][1], pts[i + 1][0], pts[i + 1][1], 2, R.wood[1])
    edgeShade(l, R.wood)
    // Grip wrap on the fist.
    l.paint(rd(x), rd(y), R.leather[3])
  })
  return { tip: polar(x, y, ang, 10 * k), nock }
}
