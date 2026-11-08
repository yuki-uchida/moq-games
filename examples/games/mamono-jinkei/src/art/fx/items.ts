/** Sheet `items`: pick-ups. Solid items are lit from the top-left; glints and halos are the only free-floating light. */
import { ITEMS_SPEC } from '../contract'
import { C, R } from '../palette'
import { Raster, outlineWith, rng, type Ramp } from '../raster'
import { anim, type Anim, type Sheet } from '../sheet'
import { TAU, shadeMask, sparkle } from './util'

const make = (name: string, fr: Raster[]): Anim => {
  const s = ITEMS_SPEC[name]
  return anim(fr, s.fps, s.loop, { anchor: s.anchor })
}

/** Implicit heart curve mask, `w` pixels wide, centred on (cx, cy). */
export function heartMask(size: number, cx: number, cy: number, w: number): Raster {
  const m = new Raster(size, size)
  const s = w / 2.3
  for (let y = 0; y < size; y++)
    for (let x = 0; x < size; x++) {
      const X = (x + 0.5 - cx) / s
      const Y = -(y + 0.5 - cy) / s + 0.12
      const a = X * X + Y * Y - 1
      if (a * a * a - X * X * Y * Y * Y <= 0) m.set(x, y, 1)
    }
  return m
}

function heartFrame(f: number, big: boolean): Raster {
  const bob = [0, -2, -3, -1][f]
  const w = big ? 25 : 18
  const m = heartMask(32, 16, (big ? 15 : 17) + bob, w)
  const r = shadeMask(m, R.jobRed)
  // Specular on the left lobe and a soft reflected light bottom right.
  const lx = big ? 9 : 10
  const ly = (big ? 8 : 11) + bob
  r.paint(lx, ly, C.white)
  r.paint(lx + 1, ly, C.white)
  r.paint(lx, ly + 1, C.white)
  if (big) {
    r.paint(lx + 2, ly, R.jobRed[0])
    r.paint(lx, ly + 2, R.jobRed[0])
  }
  // A glint sweeping over the surface on the last frames.
  if (f === 1 || f === 2) {
    const gx = (big ? 10 : 11) + (f - 1) * 3
    const gy = (big ? 13 : 14) + bob - (f - 1)
    r.paint(gx, gy, R.jobRed[0])
    r.paint(gx + 1, gy + 1, R.jobRed[0])
  }
  outlineWith(r, C.inkWarm, false)
  if (big) {
    // Gold sparkle marks the big heart.
    const sx = 25
    const sy = 7 + bob
    if (f % 2 === 0) sparkle(r, sx, sy, f === 0 ? 3 : 2, C.white, R.holy[0], R.holy[1])
    else sparkle(r, sx - 1, sy + 5, 1, C.white, R.holy[0], R.holy[1])
  }
  return r
}

/** One faceted gem (octahedron with a flat table) turned by `phi` around its vertical axis. */
export function gemRaster(size: number, cx: number, cy: number, rad: number, h: number, phi: number, ramp: Ramp) {
  const r = new Raster(size, size)
  const tilt = 0.42
  const ring = (k: number, rr: number, y: number): [number, number] => [
    cx + Math.cos(phi + (k * Math.PI) / 2) * rr,
    y + Math.sin(phi + (k * Math.PI) / 2) * rr * tilt
  ]
  const eq = [0, 1, 2, 3].map((k) => ring(k, rad, cy))
  const up = [0, 1, 2, 3].map((k) => ring(k, rad * 0.5, cy - h * 0.55))
  const bottom: [number, number] = [cx, cy + h]
  const shade = (k: number, ny: number) => {
    const psi = phi + ((k + 0.5) * Math.PI) / 2
    const d = 0.8 * (-0.6 * Math.cos(psi) + 0.45 * Math.sin(psi)) + ny * 0.7
    return d > 0.62 ? 0 : d > 0.2 ? 1 : d > -0.2 ? 2 : 3
  }
  const faces: { depth: number; pts: [number, number][]; c: number }[] = []
  for (let k = 0; k < 4; k++) {
    const n = (k + 1) % 4
    const depth = Math.sin(phi + ((k + 0.5) * Math.PI) / 2)
    faces.push({ depth: depth - 5, pts: [eq[k], eq[n], bottom], c: ramp[Math.min(3, shade(k, -0.15) + 1)] })
    faces.push({ depth, pts: [eq[k], eq[n], up[n], up[k]], c: ramp[shade(k, 0.55)] })
  }
  faces.sort((a, b) => a.depth - b.depth)
  for (const f of faces) r.poly(f.pts.flat(), f.c)
  r.poly(up.flat(), ramp[0])
  // Table highlight and a crisp edge on the light side of the table.
  const [tx, ty] = [(up[0][0] + up[2][0]) / 2, (up[0][1] + up[2][1]) / 2]
  r.paint(tx - 1, ty - 0.5, C.white)
  r.paint(tx, ty - 0.5, C.white)
  outlineWith(r, ramp[4], false)
  return r
}

function gemFrame(f: number, big: boolean): Raster {
  const bob = [0, -1, -2, -2, -1, 0][f]
  const rad = big ? 11 : 8
  const h = big ? 12 : 9
  const phi = Math.PI / 4 + (f * Math.PI) / 12
  const r = gemRaster(32, 16, (big ? 15 : 17) + bob, rad, h, phi, R.magic)
  const tw = (f + 1) % 6
  if (tw < 2) sparkle(r, big ? 6 : 9, (big ? 5 : 10) + bob, tw === 0 ? (big ? 4 : 3) : 1, C.white, C.white, R.magic[0])
  if (big && f % 3 === 1) sparkle(r, 26, 9 + bob, 2, C.white, R.magic[0], R.magic[1])
  return r
}

function keyFrame(f: number): Raster {
  const bob = [0, -1, -2, -1][f]
  const layer = new Raster(32, 32)
  const o = bob
  // Bow (ring), shaft and teeth on the diagonal, pointing down-right.
  layer.ellipse(11, 9 + o, 6.5, 6.5, 1)
  layer.thick(14, 12 + o, 24, 22 + o, 3, 1)
  layer.rect(21, 22 + o, 4, 3, 1)
  layer.rect(24, 19 + o, 3, 3, 1)
  layer.rect(17, 17 + o, 3, 3, 1)
  const m = layer.clone()
  const body = shadeMask(m, R.gold)
  // Hole in the bow.
  body.ellipse(10.5, 8.5 + o, 2.6, 2.6, 0)
  const r = new Raster(32, 32)
  r.blit(body)
  r.ellipse(10.5, 8.5 + o, 2.6, 2.6, 0)
  // Inner edge of the hole in shade, specular on the bow.
  r.ring(10.5, 8.5 + o, 2.6, 3.6, R.gold[3])
  r.paint(8, 5 + o, C.white)
  r.paint(9, 4 + o, C.white)
  r.paint(7, 6 + o, C.white)
  r.paint(16, 15 + o, R.gold[0])
  outlineWith(r, C.inkWarm, false)
  // A travelling glint.
  const gx = [8, 14, 20, 24][f]
  const gy = [6, 12, 18, 23][f] + o
  sparkle(r, gx, gy, f === 0 ? 3 : 2, C.white, C.white, R.gold[0])
  return r
}

function orbFrame(f: number): Raster {
  const r = new Raster(64, 64)
  const cx = 32
  const cy = 33 + [0, -1, -2, -2, -1, 0, 1, 1][f]
  const rad = 12
  // Soft halo and ground glow.
  r.ellipse(32, 57, 11, 3.4, R.holy[2])
  r.ellipse(32, 57, 8, 2.2, R.holy[1])
  r.ellipse(32, 57, 4, 1.2, R.holy[0])
  r.ring(cx, cy, rad + 2, rad + 3, R.holy[1], -2.6, -0.5)
  r.ring(cx, cy, rad + 5, rad + 5.8, R.holy[2], 0.4, 2.2)
  // Prismatic surface: colour bands move across the sphere while the light stays top-left.
  const bands = [R.jobBlue, R.magic, R.poison, R.holy, R.jobRed, R.shadow]
  for (let y = 0; y < 64; y++)
    for (let x = 0; x < 64; x++) {
      const nx = (x + 0.5 - cx) / rad
      const ny = (y + 0.5 - cy) / rad
      const q = nx * nx + ny * ny
      if (q > 1) continue
      const nz = Math.sqrt(1 - q)
      const d = nx * -0.55 + ny * -0.7 + nz * 0.55
      const pos = (nx * 1.0 + ny * 0.8) * 1.6 + (f * bands.length) / 8
      const band = bands[((Math.floor(pos) % bands.length) + bands.length) % bands.length]
      const step = d > 0.9 ? 0 : d > 0.35 ? 1 : d > -0.1 ? 2 : 3
      r.set(x, y, q > 0.8 && d < 0.1 ? band[3] : band[step])
    }
  r.ellipse(cx - 4, cy - 5, 2.4, 1.6, C.white)
  r.paint(cx - 6, cy - 3, C.white)
  outlineWith(r, R.holy[3], false)
  // Orbiting sparkles, front and back.
  for (let k = 0; k < 3; k++) {
    const a = (f * TAU) / 8 + (k * TAU) / 3
    const x = cx + Math.cos(a) * 21
    const y = cy + Math.sin(a) * 9 - 2
    const front = Math.sin(a) > 0
    sparkle(r, x, y, front ? 3 : 2, C.white, front ? R.holy[0] : R.magic[0], front ? R.holy[1] : R.magic[1])
  }
  const g = rng(7 + f)
  for (let i = 0; i < 3; i++) r.set(cx + (g() - 0.5) * 44, cy + (g() - 0.5) * 36, i % 2 ? C.white : R.holy[0])
  sparkle(r, cx - 5, cy - 6, f % 4 === 0 ? 4 : 2, C.white, C.white, R.holy[0])
  return r
}

export function buildItems(): Sheet {
  const n = (c: number, d: (f: number) => Raster) => Array.from({ length: c }, (_, f) => d(f))
  return {
    heart: make(
      'heart',
      n(4, (f) => heartFrame(f, false))
    ),
    bigheart: make(
      'bigheart',
      n(4, (f) => heartFrame(f, true))
    ),
    gem: make(
      'gem',
      n(6, (f) => gemFrame(f, false))
    ),
    gem_big: make(
      'gem_big',
      n(6, (f) => gemFrame(f, true))
    ),
    key: make('key', n(4, keyFrame)),
    orb: make('orb', n(8, orbFrame))
  }
}
