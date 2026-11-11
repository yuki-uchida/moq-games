/**
 * What the gang (ばくろ団) shares: the red bandana, hand-placed face parts, limb and shading helpers, and the
 * tumble used by every `defeat` clip. Each enemy lives in its own file and is assembled with the Painter.
 */
import { C, R, type Ramp } from '../../palette'
import { Raster, ball, bar, shadeEdges, type Pt } from '../../raster'

export const BANDANA = R.bandana

/** Paints an ellipse only where the layer already has pixels, so patches never leave the silhouette. */
export function patch(l: Raster, cx: number, cy: number, rx: number, ry: number, c: number) {
  for (let y = Math.floor(cy - ry); y <= Math.ceil(cy + ry); y++)
    for (let x = Math.floor(cx - rx); x <= Math.ceil(cx + rx); x++) {
      const nx = (x + 0.5 - cx) / rx
      const ny = (y + 0.5 - cy) / ry
      if (nx * nx + ny * ny <= 1.0001) l.paint(x, y, c)
    }
}

/** Draws a flat one-colour shape and gives it form: shade on the bottom/right, highlight on the top/left rim. */
export function shaded(l: Raster, ramp: Ramp, draw: (l: Raster) => void, depth = 1, rim = true) {
  draw(l)
  return shadeEdges(l, ramp, depth, rim)
}

/** A limb from `a` to `b` (a bar with a rounded end), shaded as one piece. */
export function limb(l: Raster, a: Pt, b: Pt, w: number, ramp: Ramp, endR = 0, endRy = endR) {
  return shaded(l, ramp, (m) => {
    bar(m, a, b, w, ramp[1])
    if (endR) m.ellipse(b[0], b[1], endR, endRy, ramp[1])
  })
}

/** A wavy tail: `n` round dabs from the root along a direction that bends with a sine. */
export function tailCurve(
  l: Raster,
  root: Pt,
  angle: number,
  len: number,
  wave: number,
  phase: number,
  w0: number,
  w1: number,
  ramp: Ramp
) {
  const n = Math.ceil(len)
  let x = root[0]
  let y = root[1]
  const pts: Pt[] = [[x, y]]
  for (let i = 1; i <= n; i++) {
    const t = i / n
    const a = angle + Math.sin(phase + t * 4.2) * wave * (0.3 + t)
    x += Math.cos(a) * (len / n)
    y += Math.sin(a) * (len / n)
    pts.push([x, y])
  }
  pts.forEach((p, i) => {
    const t = i / n
    const w = w0 + (w1 - w0) * t
    const k = Math.max(1, Math.round(w))
    l.ellipse(Math.round(p[0]) + (k % 2 ? 0.5 : 0), Math.round(p[1]) + (k % 2 ? 0.5 : 0), k / 2, k / 2, ramp[1])
  })
  return pts[pts.length - 1]
}

// ------------------------------------------------------------------------------------------------- bandana

/**
 * A neckerchief: a red triangle hanging in front of the chest (the head covers its top) with a knot and two
 * tails streaming back. (x, y) is the top-centre of the cloth; `w` its width, `h` its drop.
 */
export function neckerchief(l: Raster, x: number, y: number, w: number, h: number, flutter = 0) {
  const cloth = new Raster(l.w, l.h)
  cloth.poly([x - w / 2, y, x + w / 2, y, x + w * 0.12, y + h, x - w * 0.12, y + h * 0.85], BANDANA[1])
  shadeEdges(cloth, BANDANA, 1, true)
  // a fold line and two cloth dots give it a printed look
  cloth.paint(x - 1, y + 2, BANDANA[2])
  cloth.paint(x, y + 3, BANDANA[2])
  cloth.paint(x - w * 0.25, y + 1, BANDANA[0])
  cloth.paint(x + w * 0.15, y + 2, BANDANA[0])
  l.blit(cloth)
}

/** The knot and the two tails of a bandana tied at (kx, ky); tails stream to the back (left) and flutter. */
export function bandanaTails(l: Raster, kx: number, ky: number, reach: number, flutter: number, dir = -1) {
  const m = new Raster(l.w, l.h)
  bar(m, [kx, ky], [kx + dir * reach, ky - 2 - flutter], 3, BANDANA[1])
  bar(m, [kx, ky + 1], [kx + dir * (reach - 2), ky + 3 - flutter * 0.6], 3, BANDANA[2])
  m.paint(kx + dir * reach, ky - 2 - flutter, BANDANA[0])
  l.blit(m)
  ball(l, kx, ky, 2.4, 2.4, BANDANA, false)
}

/** A bandana band wrapped around a limb or head between two points, with an optional knot. */
export function band(l: Raster, a: Pt, b: Pt, w: number) {
  const m = new Raster(l.w, l.h)
  bar(m, a, b, w, BANDANA[1])
  shadeEdges(m, BANDANA, 1, true)
  l.blit(m)
}

// -------------------------------------------------------------------------------------------------- faces

const EYE_KEY = { K: C.black, w: C.white, i: C.ink, s: C.spark, r: BANDANA[1], p: C.blush }

/** Hand-drawn eye grids, 4 wide. `near` eyes face the viewer; `far` ones are mirrored where it matters. */
export const EYE = {
  open: ['.KK.', 'KwKK', 'KwKK', 'KKKK', 'KKKK', '.KK.'],
  openFar: ['.KK.', 'KwK.', 'KKK.', 'KKK.', 'KKK.', '.KK.'],
  small: ['.K.', 'KwK', 'KKK', '.K.'],
  wide: ['.KK.', 'KwwK', 'KwKK', 'KwwK', '.KK.'],
  angry: ['KK..', '.KKK', 'KwKK', 'KKKK', '.KK.'],
  hurtNear: ['i...', '.ii.', '..ii', '.ii.', 'i...'],
  hurtFar: ['...i', '.ii.', 'ii..', '.ii.', '...i'],
  dead: ['i..i', '.ii.', '.ii.', 'i..i'],
  closed: ['....', '....', 'iiii', '....'],
  happy: ['....', '.ii.', 'i..i', '....']
} as const satisfies Record<string, readonly string[]>
export type EyeKind = keyof typeof EYE

export function stampEye(l: Raster, kind: EyeKind, x: number, y: number) {
  l.stamp(EYE[kind], x, y, EYE_KEY)
}

/** Sweat drop, star and swirl bits used by hurt and defeat faces. */
export function dizzyStars(l: Raster, cx: number, cy: number, t: number) {
  for (let i = 0; i < 2; i++) {
    const a = t * 1.7 + i * Math.PI
    const x = Math.round(cx + Math.cos(a) * 7)
    const y = Math.round(cy + Math.sin(a) * 2.5)
    l.set(x, y, R.gold[0])
    l.set(x - 1, y, R.gold[1])
    l.set(x + 1, y, R.gold[1])
    l.set(x, y - 1, R.gold[1])
    l.set(x, y + 1, R.gold[1])
  }
}

// ------------------------------------------------------------------------------------------------ defeat

/** Turns a drawn frame by `angle` (radians, clockwise) about (cx, cy) and moves it by (dx, dy). */
export function tumble(frame: Raster, angle: number, cx: number, cy: number, dx = 0, dy = 0) {
  const shifted = frame.shifted(32 - Math.round(cx), 32 - Math.round(cy))
  return shifted.rotate(angle).shifted(Math.round(cx) - 32 + dx, Math.round(cy) - 32 + dy)
}

/** Feathers, fur tufts or leaves shed by a defeated body: small two-pixel flecks. */
export function flecks(l: Raster, pts: readonly Pt[], ramp: Ramp) {
  for (const [x, y] of pts) {
    l.set(x, y, ramp[1])
    l.set(x + 1, y, ramp[2])
    l.set(x, y - 1, ramp[0])
  }
}
