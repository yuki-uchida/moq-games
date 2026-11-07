import { C, R } from './palette'
import { Raster, ball, part, shadeEdges, type Ramp } from './raster'
import type { Sheet } from './sheet'

/**
 * 生き物観察: six side-view creatures (4 frames each) in the shiba's style — every body part on its own layer
 * (selective outline), sphere-shaded round forms, form-shaded flat parts, light from the top-left, far limbs one
 * ramp step darker. Everything stands on the baseline y = GROUND.
 */

const N = 32
const GROUND = 27
const ANT: Ramp = [R.brown[2], R.brown[3], R.hair[3], R.hair[4], R.hair[4]]
const WORM: Ramp = [R.pink[0], R.pink[1], R.pink[2], R.pink[3], R.pink[4]]
const BAND: Ramp = [R.pink[1], R.red[1], R.red[2], R.red[3], R.red[3]]
const SHELL: Ramp = [R.orange[1], R.red[2], R.red[3], R.brown[3], R.brown[3]]
const FUR: Ramp = [R.skin[1], R.brown[0], R.brown[1], R.brown[2], R.brown[3]]
const SEED: Ramp = [C.white, R.paper[1], R.paper[2], R.paper[3], R.paper[4]]
const GOLD: Ramp = [R.yellow[1], R.orange[1], R.orange[2], R.orange[3], R.orange[3]]
const MINT = R.mint as unknown as Ramp
const WATER: Ramp = [R.mint[0], R.mint[1], R.mint[1], R.mint[2], R.mint[3]]
const NAVY = R.navy as unknown as Ramp
const SKY = R.sky as unknown as Ramp

/** A thin multi-segment leg (no outline of its own so six of them stay slim). */
function leg(l: Raster, pts: number[], c: number) {
  for (let i = 0; i + 3 < pts.length; i += 2) l.line(pts[i], pts[i + 1], pts[i + 2], pts[i + 3], c)
}

// ---------------------------------------------------------------------------------------------

function ant(f: number) {
  const r = new Raster(N, N)
  // Alternating tripod gait: set A (near-front, far-mid, near-rear) swings while set B stands, then swap.
  const swingA = f % 2 === 0
  const bob = f % 2 === 0 ? -2 : -3
  const legs = [
    { x: 19, a: true, far: false },
    { x: 17, a: false, far: true },
    { x: 15, a: true, far: false },
    { x: 18, a: true, far: true },
    { x: 16, a: false, far: true },
    { x: 14, a: false, far: false }
  ]
  const draw = (far: boolean) =>
    part(
      r,
      (l) => {
        for (const g of legs) {
          if (g.far !== far) continue
          const up = g.a === swingA
          const dir = g.x >= 18 ? 1 : g.x <= 14 ? -1 : 0
          const fx = g.x + dir * 4 + (up ? 2 : -1)
          const kx = g.x + dir * 4
          leg(l, [g.x, 21 + bob, kx, 22 + bob - (up ? 1 : 0), fx, up ? GROUND - 2 : GROUND], far ? ANT[2] : ANT[0])
        }
      },
      false
    )
  draw(true)
  // Gaster (glossy), waist, thorax, head.
  part(r, (l) => {
    ball(l, 7.5, 20 + bob, 6, 5.5, ANT)
    l.rect(13, 20 + bob, 2, 2, ANT[2])
  })
  r.rect(5, 16 + bob, 3, 1, R.paper[1])
  r.set(4, 17 + bob, R.paper[1])
  part(r, (l) => ball(l, 17, 19 + bob, 3.4, 3.2, ANT))
  // Antennae twitch (elbowed).
  const tw = [0, 1, 0, -1][f]
  part(
    r,
    (l) => {
      leg(l, [23, 17 + bob, 24, 13 + bob, 27 + tw, 12 + bob - tw], ANT[0])
      leg(l, [21, 17 + bob, 21, 13 + bob, 24 + tw, 10 + bob - tw], ANT[0])
    },
    false
  )
  part(r, (l) => {
    ball(l, 23, 19 + bob, 4, 3.8, ANT)
    l.poly([26, 20 + bob, 28, 21 + bob, 27, 23 + bob], ANT[2])
  })
  r.set(24, 18 + bob, C.white)
  r.set(25, 18 + bob, C.inkCool)
  draw(false)
  // Sugar crumb held in the jaws.
  const cy = 19 + bob
  part(r, (l) => {
    l.rect(27, cy, 3, 4, SEED[1])
    l.rect(28, cy - 1, 1, 1, SEED[1])
    shadeEdges(l, SEED, 1, true)
    l.set(28, cy, C.white)
  })
  return r
}

function worm(f: number) {
  const r = new Raster(N, N)
  // A slim body wriggling in an S on the ground; the swelling of the peristaltic wave rides along it.
  const pts: { x: number; y: number; rad: number; u: number }[] = []
  const steps = 44
  for (let k = 0; k <= steps; k++) {
    const u = k / steps
    const taper = Math.min(1, 0.45 + Math.min(u, 1 - u) * 6)
    const swell = 0.5 * Math.max(0, Math.sin(Math.PI * 2 * (u * 1.3 - f / 4)))
    const y = 22.5 - 2.6 * Math.sin(Math.PI * 2 * u + 0.4)
    pts.push({ x: 6 + u * 22, y, rad: (2.2 + swell) * taper, u })
  }
  part(r, (l) => {
    for (const q of pts) l.ellipse(q.x, q.y, q.rad, q.rad, WORM[1])
    shadeEdges(l, WORM, 1, true)
    // Faint segment rings across the body.
    for (let k = 6; k < steps - 4; k += 7) {
      const q = pts[k]
      const n = pts[k + 1]
      const dx = n.x - q.x
      const dy = n.y - q.y
      const len = Math.hypot(dx, dy) || 1
      for (let t = -q.rad + 0.5; t <= q.rad - 0.5; t += 0.5) {
        const px = Math.round(q.x - (dy / len) * t)
        const py = Math.round(q.y + (dx / len) * t)
        if (l.get(px, py) === WORM[1]) l.set(px, py, WORM[2])
      }
    }
    // Clitellum: a slightly thicker, darker band a third of the way back from the head.
    const swap = new Map([
      [WORM[0], BAND[0]],
      [WORM[1], BAND[1]],
      [WORM[2], BAND[2]]
    ])
    for (let y = 0; y < N; y++)
      for (let x = 0; x < N; x++) {
        const c = swap.get(l.get(x, y))
        if (!c) continue
        let best = pts[0]
        for (const q of pts)
          if (Math.hypot(q.x - x - 0.5, q.y - y - 0.5) < Math.hypot(best.x - x - 0.5, best.y - y - 0.5)) best = q
        if (best.u > 0.55 && best.u < 0.7) l.set(x, y, c)
      }
  })
  // Dirt crumb at the tail and a tiny eye at the head.
  part(r, (l) => ball(l, 3, GROUND - 1.5, 2.4, 1.8, FUR))
  const head = pts[steps - 2]
  r.set(Math.round(head.x + 1), Math.round(head.y - 0.5), C.inkWarm)
  return r
}

const BSHELL: Ramp = [R.brown[2], R.brown[3], R.hair[3], R.hair[4], R.hair[4]]
const HORN: Ramp = [R.brown[1], R.brown[2], R.brown[3], R.hair[3], R.hair[3]]

function beetle(f: number) {
  const r = new Raster(N, N)
  const bob = f % 2 ? -1 : 0
  const legSet = (far: boolean) =>
    part(
      r,
      (l) => {
        for (let k = 0; k < 3; k++) {
          const hx = 7 + k * 5 + (far ? 2 : 0)
          const ph = (f + k * 2 + (far ? 1 : 0)) % 4
          const up = ph < 2
          const fx = hx + 3 + (ph - 1.5) * 1.2
          const c = far ? R.hair[4] : R.hair[3]
          leg(l, [hx, 21 + bob, hx + 2, 24 + bob, fx, up ? GROUND - 2 : GROUND], c)
          l.set(Math.round(hx + 3), 24 + bob, c)
          l.set(Math.round(hx + 3), 25 + bob, c)
        }
      },
      false
    )
  legSet(true)
  // Head horn: starts low on the head, reaches forward, curves up and ends in a fork.
  part(r, (l) => {
    l.thick(25, 21 + bob, 28, 19 + bob, 2.6, HORN[1])
    l.thick(28, 19 + bob, 29, 14 + bob, 2.2, HORN[1])
    l.thick(29, 14 + bob, 28, 10 + bob, 1.8, HORN[1])
    l.poly([26, 5 + bob, 28.5, 8 + bob, 27.5, 11 + bob], HORN[1])
    l.poly([30, 6 + bob, 29.5, 11 + bob, 27.5, 10 + bob], HORN[1])
    shadeEdges(l, HORN, 1, true)
  })
  // Big domed elytra.
  part(r, (l) => {
    ball(l, 10, 17 + bob, 9.5, 7.5, BSHELL)
    l.line(10, 10 + bob, 10, 24 + bob, BSHELL[2])
    l.line(4, 12 + bob, 6, 11 + bob, R.brown[1])
    l.set(3, 14 + bob, R.brown[1])
    l.set(7, 11 + bob, R.brown[1])
    l.set(13, 12 + bob, R.brown[2])
  })
  // Smaller pronotum with a short thoracic horn.
  part(r, (l) => {
    l.thick(21, 16 + bob, 24, 13 + bob, 2.2, HORN[1])
    shadeEdges(l, HORN, 1)
    ball(l, 21.5, 19 + bob, 3.6, 3.8, BSHELL)
    l.set(19, 17 + bob, R.brown[1])
    l.set(20, 16 + bob, R.brown[2])
  })
  // Small head.
  part(r, (l) => {
    ball(l, 25.5, 21 + bob, 2.6, 2.6, BSHELL)
    l.poly([26, 22.5 + bob, 29, 23.5 + bob, 27, 25 + bob], HORN[2])
  })
  r.set(26, 20 + bob, C.white)
  legSet(false)
  return r
}

function hamster(f: number) {
  const r = new Raster(N, N)
  const nib = [0, 1, 0, 1][f]
  const ear = f === 2 ? 1 : 0
  // Far foot, then the round body with a cream belly.
  part(r, (l) => {
    l.ellipse(19, GROUND - 1, 3.5, 1.6, R.pink[2])
    l.thick(22, 20, 22, GROUND - 2, 3, FUR[2])
  })
  part(r, (l) => {
    ball(l, 14, 20, 8, 8, FUR)
    l.ellipse(17, 22, 4.5, 5.5, R.paper[1])
  })
  part(r, (l) => l.ellipse(10, GROUND - 1, 4, 1.8, R.pink[1]))
  // Head with ears, cheeks that puff while nibbling.
  const hy = 11 + nib
  part(r, (l) => {
    ball(l, 12.5, 6 + nib - ear, 2.6, 2.6, FUR)
    ball(l, 21.5, 6 + nib, 2.6, 2.6, FUR)
    l.ellipse(12.5, 6.5 + nib - ear, 1.2, 1.2, R.pink[1])
    l.ellipse(21.5, 6.5 + nib, 1.2, 1.2, R.pink[1])
  })
  part(r, (l) => {
    ball(l, 17, hy, 7.5, 6, FUR)
    const puff = nib ? 3.6 : 3
    l.ellipse(12.5, hy + 2, puff, 2.8, R.paper[1])
    l.ellipse(22, hy + 2, puff, 2.8, R.paper[1])
    l.ellipse(17, hy + 3, 3, 2, R.paper[1])
    l.ellipse(13, hy + 2, 1.5, 1, R.pink[1])
    l.ellipse(21.5, hy + 2, 1.5, 1, R.pink[1])
  })
  r.rect(15, hy - 1, 1, 2, C.inkCool)
  r.rect(20, hy - 1, 1, 2, C.inkCool)
  r.rect(17, hy + 1, 2, 1, R.pink[3])
  r.set(17, hy + 2, C.inkWarm)
  // Sunflower seed hugged to the chest: a dark teardrop tilted towards the mouth with two pale stripes; it
  // rises a pixel while the cheeks puff.
  const cy = 20.5 - nib * 1.5
  const ax = [16.5, cy + 3]
  const bx = [21.5, cy - 3]
  part(r, (l) => {
    const len = Math.hypot(bx[0] - ax[0], bx[1] - ax[1])
    const ux = (bx[0] - ax[0]) / len
    const uy = (bx[1] - ax[1]) / len
    const steps = 20
    for (let k = 0; k <= steps; k++) {
      const t = k / steps
      const rad = 2.9 - 2.1 * t * t
      l.ellipse(ax[0] + (bx[0] - ax[0]) * t, ax[1] + (bx[1] - ax[1]) * t, rad, rad, R.hair[3])
    }
    for (const off of [-1.1, 1])
      for (let k = 3; k <= 17; k++) {
        const t = k / steps
        const px = Math.floor(ax[0] + (bx[0] - ax[0]) * t - uy * off)
        const py = Math.floor(ax[1] + (bx[1] - ax[1]) * t + ux * off)
        if (l.get(px, py)) l.set(px, py, off < 0 ? R.paper[1] : R.paper[2])
      }
  })
  part(r, (l) => {
    ball(l, 15.5, cy + 4, 2.3, 2, FUR)
    ball(l, 21.5, cy + 4.5, 2.3, 2, FUR)
  })
  return r
}

function bird(f: number) {
  const r = new Raster(N, N)
  const hop = f === 3
  const lean = [0, 1, 3, 0][f]
  const bodyY = (hop ? 14 : 17) + (f === 1 ? 1 : f === 2 ? 2 : 0)
  const head = { x: 22 + lean * 1.2, y: bodyY - 6 + lean * 1.6 }
  const flick = hop ? 1 : 0
  // Legs.
  part(
    r,
    (l) => {
      const lift = hop ? 4 : 0
      l.line(14, bodyY + 5, 13, GROUND - lift, R.orange[2])
      l.line(18, bodyY + 5, 19, GROUND - lift, R.orange[2])
      l.rect(11, GROUND - lift, 3, 1, R.orange[2])
      l.rect(18, GROUND - lift, 3, 1, R.orange[2])
    },
    false
  )
  // Tail.
  part(r, (l) => {
    l.poly([8, bodyY - 2, 1, bodyY - 5 - lean, 2, bodyY - 1 - lean, 9, bodyY + 3], NAVY[1])
    shadeEdges(l, NAVY, 1)
  })
  // Body: blue back, white belly.
  part(r, (l) => {
    ball(l, 14, bodyY, 9, 6.5, SKY)
    l.ellipse(16, bodyY + 3.5, 5, 2.2, R.paper[1])
  })
  // Head.
  part(r, (l) => {
    ball(l, head.x, head.y, 5, 5, SKY)
    l.poly([head.x + 4, head.y - 1, head.x + 9, head.y + 1, head.x + 4, head.y + 3], R.yellow[1])
  })
  r.set(Math.round(head.x + 2), Math.round(head.y - 1), C.inkCool)
  // Wing, flicking up on the hop.
  part(r, (l) => {
    l.poly(
      [14, bodyY - 3 - flick * 3, 3 - flick, bodyY + 2 - flick * 6, 11, bodyY + 4 - flick * 2, 17, bodyY + 2],
      NAVY[1]
    )
    shadeEdges(l, NAVY, 1, true)
  })
  return r
}

function goldfish(f: number) {
  const r = new Raster(N, N)
  const cx = 16
  // Water body of the bowl, a sphere clipped at the surface.
  part(r, (l) => {
    ball(l, cx, 17.5, 10.5, 9.5, WATER)
    for (let y = 0; y < 11; y++) for (let x = 0; x < N; x++) l.set(x, y, 0)
  })
  // Water plant sways.
  const sw = [0, 1, 0, -1][f]
  part(r, (l) => {
    l.thick(9, 25, 9 + sw, 21, 2, R.green[1])
    l.thick(9 + sw, 21, 8 + sw * 2, 17, 2, R.green[1])
    l.thick(12, 25, 12 - sw, 21, 2, R.green[2])
    l.thick(12 - sw, 21, 13 - sw, 18, 1.6, R.green[2])
  })
  // Fish turning back and forth: right, front, left, front.
  const dir = [1, 0, -1, 0][f]
  const fx = [18, 16, 14, 16][f]
  const fy = 17 + (f % 2 ? 1 : 0)
  const fish = new Raster(N, N)
  const P = (dx: number) => fx + dir * dx
  const t = [-1, 0, 1, 0][f]
  if (dir !== 0) {
    part(fish, (l) => {
      l.poly([P(-3), fy - 1, P(-9), fy - 4 + t * 2, P(-7), fy + t, P(-9.5), fy + 4 + t * 2, P(-3), fy + 1], R.red[1])
    })
    part(fish, (l) => {
      l.poly([P(-1), fy - 3, P(2), fy - 6, P(3), fy - 3], R.red[2])
      ball(l, P(1), fy, 7, 4.8, GOLD)
    })
    part(fish, (l) => l.poly([P(0), fy + 2, P(-2), fy + 5, P(1), fy + 4], R.red[2]))
    fish.set(P(4), fy - 1, C.inkCool)
    fish.set(P(5), fy + 1, R.red[3])
  } else {
    part(fish, (l) => {
      const sd = f === 1 ? 1 : -1
      l.poly([fx - 3, fy + 2, fx + sd * 8, fy + 5, fx + sd * 6, fy + 9, fx, fy + 6, fx - sd * 3, fy + 8], R.red[1])
      l.poly([fx - 1, fy - 4, fx, fy - 7, fx + 1, fy - 4], R.red[2])
      ball(l, fx, fy, 4.6, 5, GOLD)
    })
    fish.set(fx - 2, fy - 2, C.inkCool)
    fish.set(fx + 1, fy - 2, C.inkCool)
    fish.set(fx - 1, fy + 1, R.red[3])
  }
  r.blit(fish)
  // Bubbles rising from the mouth.
  for (const [bx, k] of [
    [dir >= 0 ? 24 : 8, 0],
    [dir >= 0 ? 21 : 11, 2]
  ] as const) {
    const s = (f + k) % 4
    const by = [24, 21, 18, 14][s]
    if (s === 0) r.set(bx, by, R.sky[0])
    else {
      r.rect(bx, by, 2, 2, R.sky[0])
      r.set(bx, by, C.white)
    }
  }
  // Glass: rim ring and highlight over the water.
  part(r, (l) => {
    for (let y = 8; y <= 27; y++)
      for (let x = 0; x < N; x++) {
        const nx = (x + 0.5 - cx) / 11
        const ny = (y + 0.5 - 17.5) / 10
        const q = nx * nx + ny * ny
        if (q <= 1 && q > 0.72) l.set(x, y, nx + ny < 0 ? R.sky[0] : R.sky[1])
      }
  })
  for (let x = 11; x <= 21; x++) r.set(x, 8, x < 16 ? C.white : R.sky[0])
  r.rect(7, 14, 1, 4, C.white)
  r.set(8, 12, C.white)
  r.set(8, 19, C.white)
  // Base on the ground.
  part(r, (l) => l.ellipse(cx, GROUND + 1.5, 6, 1.5, R.paper[2]))
  return r
}

function creature(kind: string, frame: number) {
  if (kind === 'ant') return ant(frame)
  if (kind === 'worm') return worm(frame)
  if (kind === 'beetle') return beetle(frame)
  if (kind === 'hamster') return hamster(frame)
  if (kind === 'bird') return bird(frame)
  return goldfish(frame)
}

export function observationSheet(): Sheet {
  const result: Sheet = {}
  for (const kind of ['ant', 'worm', 'beetle', 'hamster', 'bird', 'fish'])
    result[kind] = { frames: [0, 1, 2, 3].map((f) => creature(kind, f)), fps: 6, loop: true }
  result.fly = result.ant
  return result
}

export function observationIcon() {
  const icon = beetle(0)
  // A small magnifying glass in the lower-left corner: handle, metal rim, glint.
  part(icon, (l) => {
    l.thick(6, 26, 2.5, 29.5, 2.4, R.brown[2])
  })
  const rim = new Raster(N, N)
  part(rim, (l) => {
    ball(l, 8, 22, 5, 5, R.metal as unknown as Ramp)
    l.ellipse(8, 22, 3, 3, R.sky[0])
  })
  icon.blit(rim)
  icon.set(6, 20, C.white)
  icon.set(7, 19, C.white)
  // A light sticker rim round the whole silhouette: the dark shell would otherwise sink into the dark HUD cards.
  const solid = icon.clone()
  for (let y = 0; y < N; y++)
    for (let x = 0; x < N; x++)
      if (
        !solid.get(x, y) &&
        (solid.get(x - 1, y) || solid.get(x + 1, y) || solid.get(x, y - 1) || solid.get(x, y + 1))
      )
        icon.set(x, y, R.green[0])
  return icon
}
