import { C, DARKER, R } from './palette'
import { Raster, ball, part, remap, shadeEdges, type Ramp } from './raster'
import { SKIN, human, pose, type Body, type HeadSpec, type Pt } from './rig'
import type { Anim, Sheet } from './sheet'

/** New regular enemies, part 1 (64×64, 4–6 frames, feet on row ≤ 58). Keys are `enemy:<id>`. */

const loop = (frames: Raster[], fps: number): Anim => ({ frames, fps, loop: true })
const frames = <T>(list: readonly T[], draw: (f: T, i: number) => Raster) => list.map(draw)
const INK = C.inkCool

/** Two angry eyes (near 4×3, far 3×3) with slanted brows, pupils looking right. */
function angryEyes(l: Raster, x: number, y: number, gap: number, brow = INK) {
  l.stamp(['wwKK', 'wKKK', 'wwKK'], x, y, { w: C.white, K: INK })
  l.stamp(['wKK', 'KKK', 'wKK'], x + gap, y, { w: C.white, K: INK })
  l.line(x - 1, y - 2, x + 3, y, brow)
  l.line(x - 1, y - 3, x + 2, y - 1, brow)
  l.line(x + gap + 3, y - 2, x + gap, y, brow)
  l.line(x + gap + 3, y - 3, x + gap + 1, y - 1, brow)
}

/** A short stubby leg: a rect with a shoe, `lift` raises the foot. */
function stub(l: Raster, x: number, top: number, bottom: number, ramp: Ramp, shoe: Ramp, lift = 0) {
  const b = bottom - lift
  l.rect(x, top, 3, Math.max(1, b - top - 1), ramp[2])
  l.rect(x - 1, b - 2, 6, 2, shoe[1])
  l.rect(x - 1, b - 2, 3, 1, shoe[0])
  l.rect(x - 1, b, 6, 1, shoe[3])
}

// ---------------------------------------------------------------------------------------------
// 蚊: a tiny mosquito — blood-red belly, needle nose, blurred wings, dangling legs.

const MOSQUITO_WING: [number, number][] = [
  [-10, -17],
  [-17, -10],
  [-17, -1],
  [-17, -10]
]

function wing(l: Raster, ax: number, ay: number, ex: number, ey: number, w: number, c: number, dither = false) {
  if (!dither) return l.thick(ax, ay, ex, ey, w, c)
  const tmp = new Raster(l.w, l.h)
  tmp.thick(ax, ay, ex, ey, w, c)
  tmp.map((v, x, y) => ((x + y) % 2 ? 0 : v))
  return l.blit(tmp)
}

function mosquito(f: { k: number; dy: number; leg: number; stab: number }) {
  const r = new Raster(64, 64)
  const cx = 28
  const cy = 38 + f.dy
  const [wx, wy] = MOSQUITO_WING[f.k]
  const [px, py] = MOSQUITO_WING[(f.k + 3) % 4]
  // Far wing + blur ghost first, then the near wing.
  const farWing = new Raster(64, 64)
  wing(farWing, cx + 2, cy - 3, cx + wx + 6, cy + wy + 1, 3, R.mint[1])
  part(r, (l) => l.blit(farWing), false)
  wing(r, cx - 1, cy - 3, cx + px, cy + py, 4, R.mint[1], true)
  part(r, (l) => wing(l, cx - 1, cy - 3, cx + wx, cy + wy, 4, R.mint[0]))
  part(r, (l) => {
    // Dangling legs.
    l.line(cx - 3, cy + 3, cx - 6, cy + 8 + f.leg, R.purple[3])
    l.line(cx - 6, cy + 8 + f.leg, cx - 5, cy + 12, R.purple[3])
    l.line(cx, cy + 4, cx + 1, cy + 9, R.purple[3])
    l.line(cx + 1, cy + 9, cx + 3, cy + 13 - f.leg, R.purple[3])
    l.line(cx + 3, cy + 3, cx + 7, cy + 8 - f.leg, R.purple[3])
    l.line(cx + 7, cy + 8 - f.leg, cx + 6, cy + 12, R.purple[3])
  })
  part(r, (l) => {
    // Blood-filled striped belly, thorax, head.
    ball(l, cx - 8, cy + 3, 7.5, 4.8, R.red)
    for (const sx of [-12, -8, -4]) l.paint(cx + sx, cy + 3, R.red[3]), l.paint(cx + sx, cy + 4, R.red[3])
    for (const sx of [-12, -8, -4]) l.paint(cx + sx, cy + 2, R.red[3]), l.paint(cx + sx, cy + 6, R.red[3])
    ball(l, cx, cy, 5.5, 5, R.purple)
    ball(l, cx + 7, cy - 1, 4.6, 4.4, R.purple)
    // Furry thorax speckles.
    l.paint(cx - 2, cy + 1, R.purple[3])
    l.paint(cx + 1, cy + 3, R.purple[3])
  })
  part(r, (l) => {
    // The needle.
    l.line(cx + 10, cy + 1, cx + 19 + f.stab, cy + 3, R.metal[0])
    l.line(cx + 10, cy + 2, cx + 19 + f.stab, cy + 4, R.metal[1])
    l.set(cx + 20 + f.stab, cy + 4, R.red[1])
  })
  part(
    r,
    (l) => {
      l.stamp(['wwK', 'wKK', 'KKK'], cx + 7, cy - 3, { w: C.white, K: R.red[1] })
      l.line(cx + 6, cy - 6, cx + 10, cy - 4, INK)
      l.line(cx + 6, cy - 5, cx + 9, cy - 3, INK)
    },
    false
  )
  return r
}

export function mosquitoSheet(): Sheet {
  return {
    move: loop(
      frames(
        [
          { k: 0, dy: 0, leg: 0, stab: 0 },
          { k: 1, dy: -2, leg: 1, stab: 1 },
          { k: 2, dy: 0, leg: 0, stab: 0 },
          { k: 3, dy: 2, leg: 1, stab: 1 }
        ],
        mosquito
      ),
      14
    )
  }
}

// ---------------------------------------------------------------------------------------------
// 注射: a syringe on stubby legs, angry green-blue eyes — it shivers, then dashes.

function vaccine(f: {
  sx: number
  plunge: number
  bang: boolean
  legs: [number, number]
  drip: number
  mouth: number
}) {
  const r = new Raster(64, 64)
  const x0 = 17 + f.sx
  const x1 = x0 + 25
  const y0 = 36
  // Legs.
  part(r, (l) => {
    stub(l, x0 + 6, y0 + 12, 57, R.navy, R.red, f.legs[0])
    stub(l, x1 - 9, y0 + 12, 57, R.navy, R.red, f.legs[1])
  })
  // Plunger rod, thumb rest.
  part(r, (l) => {
    l.rect(x0 - 11 + f.plunge, y0 + 5, 12, 3, R.metal[1])
    l.rect(x0 - 11 + f.plunge, y0 + 5, 12, 1, R.metal[0])
    l.rect(x0 - 11 + f.plunge, y0 + 7, 12, 1, R.metal[2])
    l.rect(x0 - 14 + f.plunge, y0 + 1, 4, 11, R.red[1])
    l.rect(x0 - 14 + f.plunge, y0 + 1, 1, 11, R.red[0])
    l.rect(x0 - 11 + f.plunge, y0 + 8, 1, 3, R.red[2])
  })
  // Needle, hub.
  part(r, (l) => {
    l.rect(x1 + 3, y0 + 5, 12, 2, R.metal[0])
    l.rect(x1 + 3, y0 + 6, 12, 1, R.metal[1])
    l.poly([x1 + 15, y0 + 5, x1 + 17, y0 + 7, x1 + 15, y0 + 7], R.metal[1])
    l.rect(x1 - 1, y0 + 2, 5, 8, R.metal[1])
    l.rect(x1 - 1, y0 + 2, 5, 1, R.metal[0])
    l.rect(x1 + 2, y0 + 3, 2, 7, R.metal[2])
  })
  // Glass barrel with mint liquid.
  part(r, (l) => {
    l.rect(x0, y0, 26, 12, R.paper[1])
    l.rect(x0, y0, 26, 1, R.paper[0])
    l.rect(x0, y0 + 11, 26, 1, R.paper[2])
    l.rect(x0 + 5 + f.plunge, y0 + 2, 19 - f.plunge, 8, R.mint[1])
    l.rect(x0 + 5 + f.plunge, y0 + 2, 19 - f.plunge, 1, R.mint[0])
    l.rect(x0 + 5 + f.plunge, y0 + 8, 19 - f.plunge, 2, R.mint[2])
    l.rect(x0 + 1 + f.plunge, y0 + 2, 4, 8, R.navy[1])
    l.rect(x0 + 1 + f.plunge, y0 + 2, 4, 1, R.navy[0])
    // Finger flange.
    l.rect(x0 - 1, y0 - 2, 3, 16, R.metal[1])
    l.rect(x0 - 1, y0 - 2, 3, 1, R.metal[0])
    for (let i = 0; i < 4; i++) l.paint(x0 + 6 + i * 4, y0, R.navy[2])
  })
  // Angry face on the liquid.
  part(
    r,
    (l) => {
      angryEyes(l, x0 + 11, y0 + 3, 6, R.navy[3])
      l.stamp(['KKKKK', 'KwKwK'], x0 + 12, y0 + 7, { K: INK, w: C.white })
    },
    false
  )
  if (f.drip) {
    part(r, (l) => {
      l.ellipse(x1 + 17, y0 + 8 + f.drip * 2, 1, 1.6, R.mint[0])
    })
  }
  if (f.bang)
    part(r, (l) => {
      l.rect(x1 - 7, y0 - 14, 3, 7, R.red[1])
      l.rect(x1 - 7, y0 - 14, 1, 7, R.red[0])
      l.rect(x1 - 7, y0 - 5, 3, 3, R.red[1])
    })
  return r
}

export function vaccineSheet(): Sheet {
  return {
    move: loop(
      frames(
        [
          { sx: 0, plunge: 0, bang: false, legs: [0, 2], drip: 0, mouth: 0 },
          { sx: 1, plunge: 1, bang: true, legs: [2, 0], drip: 1, mouth: 0 },
          { sx: -1, plunge: 2, bang: true, legs: [0, 2], drip: 2, mouth: 0 },
          { sx: 1, plunge: 1, bang: false, legs: [2, 0], drip: 1, mouth: 0 },
          { sx: -1, plunge: 0, bang: true, legs: [0, 2], drip: 0, mouth: 0 },
          { sx: 0, plunge: 1, bang: false, legs: [2, 0], drip: 2, mouth: 0 }
        ],
        vaccine
      ),
      12
    )
  }
}

// ---------------------------------------------------------------------------------------------
// 野良犬: a scruffy stray with bared fangs, trotting low as if about to lunge.

function dog(f: { ph: number; bob: number; mouth: number; tail: number; crouch: number }) {
  const r = new Raster(64, 64)
  const by = 42 + f.bob + f.crouch
  const swing = (k: number) => Math.sin(f.ph + k) * 5
  const lift = (k: number) => Math.max(0, Math.cos(f.ph + k)) * 3
  const leg = (l: Raster, x: number, k: number, far: boolean) => {
    const px = x + swing(k)
    const py = 57 - lift(k)
    l.thick(x, by + 5, px, py - 1, 4, R.brown[1])
    l.rect(Math.round(px) - 2, Math.round(py) - 2, 6, 3, R.brown[2])
    l.rect(Math.round(px) - 2, Math.round(py), 6, 1, R.brown[3])
    l.paint(x - 1, by + 6, R.brown[2])
    if (far) remap(l, DARKER)
  }
  part(r, (l) => {
    leg(l, 22, Math.PI, true)
    leg(l, 40, 0, true)
  })
  // Tail with a scruffy tuft.
  part(r, (l) => {
    const ty = by - 6 - f.tail * 2
    l.thick(15, by - 1, 9, ty, 3, R.brown[1])
    l.poly([7, ty - 4, 11, ty - 1, 9, ty + 3, 6, ty], R.brown[2])
    l.poly([6, ty - 2, 3, ty - 5, 8, ty - 3], R.brown[2])
  })
  part(r, (l) => {
    // Body with ragged back fur, patchy colouring.
    ball(l, 28, by, 15, 9, R.brown)
    for (const sx of [17, 21, 25, 29, 33]) l.poly([sx - 2, by - 7, sx, by - 12 + (sx % 3), sx + 2, by - 7], R.brown[1])
    l.ellipse(23, by - 1, 5, 3, R.brown[2])
    l.ellipse(33, by + 3, 4, 2.5, R.brown[0])
    l.paint(30, by - 4, R.brown[0])
    l.paint(31, by - 4, R.brown[0])
    // Ribs.
    for (const sx of [30, 33, 36]) l.line(sx, by + 2, sx + 1, by + 6, R.brown[2])
  })
  part(r, (l) => {
    leg(l, 18, 0, false)
    leg(l, 36, Math.PI, false)
  })
  // Head: ear, skull, snout, jaw, fangs.
  const hx = 46
  const hy = by - 7 + Math.round(f.crouch / 2)
  part(r, (l) => {
    ball(l, hx, hy, 8, 7.5, R.brown)
    l.ellipse(hx + 8, hy + 3.5, 6, 3.5, R.brown[0])
    l.ellipse(hx + 8, hy + 3.5, 6, 3.5, R.brown[0])
    l.rect(hx + 2, hy + 1, 5, 1, R.brown[1])
    // Lower jaw hanging open.
    l.poly(
      [hx + 3, hy + 7, hx + 12, hy + 6 + f.mouth * 2, hx + 13, hy + 9 + f.mouth * 3, hx + 5, hy + 10 + f.mouth * 3],
      R.brown[1]
    )
    l.rect(hx + 3, hy + 7, 9, 2 + f.mouth, R.red[2])
    // Nose.
    l.rect(hx + 12, hy, 3, 3, INK)
    l.set(hx + 12, hy, R.metal[1])
    // Fangs.
    for (const fx of [hx + 5, hx + 8, hx + 11]) l.set(fx, hy + 7, C.white)
    l.set(hx + 6, hy + 6 + f.mouth * 2 + 1, C.white)
    l.set(hx + 10, hy + 6 + f.mouth * 2 + 1, C.white)
    l.paint(hx + 6, hy + 8, R.red[1])
  })
  part(
    r,
    (l) => {
      l.stamp(['wK', 'KK'], hx + 4, hy - 2, { w: C.white, K: INK })
      l.line(hx + 1, hy - 5, hx + 6, hy - 3, INK)
      l.line(hx + 1, hy - 4, hx + 5, hy - 2, INK)
    },
    false
  )
  // Floppy ear that flaps.
  part(r, (l) => {
    const e = f.tail
    l.poly([hx - 6, hy - 6, hx - 1, hy - 7, hx - 1, hy + 2, hx - 9 - e, hy + 6], R.brown[2])
    l.line(hx - 4, hy - 5, hx - 2, hy, R.brown[1])
  })
  return r
}

export function dogSheet(): Sheet {
  return {
    move: loop(
      frames(
        [
          { ph: 0, bob: 0, mouth: 0, tail: 0, crouch: 1 },
          { ph: 1.05, bob: -1, mouth: 1, tail: 1, crouch: 1 },
          { ph: 2.1, bob: 0, mouth: 0, tail: 2, crouch: 2 },
          { ph: 3.15, bob: 0, mouth: 1, tail: 1, crouch: 1 },
          { ph: 4.2, bob: -1, mouth: 0, tail: 0, crouch: 2 },
          { ph: 5.25, bob: 0, mouth: 1, tail: 1, crouch: 1 }
        ],
        dog
      ),
      12
    )
  }
}

// ---------------------------------------------------------------------------------------------
// ピーマン: a grumpy bell pepper on tiny legs that spits seeds.

function pepper(f: { puff: number; mouth: number; seeds: number[]; legs: [number, number]; dy: number }) {
  const r = new Raster(64, 64)
  const cy = 38 + f.dy
  part(r, (l) => {
    stub(l, 25, cy + 11, 57, R.brown, R.brown, f.legs[0])
    stub(l, 35, cy + 11, 57, R.brown, R.brown, f.legs[1])
  })
  part(r, (l) => {
    ball(l, 24, cy + 3, 8 + f.puff, 11, R.green, false)
    ball(l, 40, cy + 3, 8 + f.puff, 11, R.green, false)
    ball(l, 32, cy, 10 + f.puff, 13, R.green)
    // Lobe creases.
    l.line(25, cy - 8, 23, cy + 12, R.green[3])
    l.line(39, cy - 8, 41, cy + 12, R.green[3])
    l.stamp(['..', '.w'], 28, cy - 9, { w: R.green[0] })
    l.rect(27, cy - 7, 3, 1, R.green[0])
    l.rect(26, cy - 6, 2, 1, R.green[0])
  })
  part(r, (l) => {
    l.ellipse(32, cy - 12, 5, 2.2, R.green[2])
    l.rect(30, cy - 18, 4, 7, R.green[2])
    l.rect(30, cy - 18, 1, 6, R.green[1])
    l.rect(32, cy - 20, 4, 3, R.green[2])
  })
  part(
    r,
    (l) => {
      angryEyes(l, 27, cy - 3, 7, R.green[3])
      if (f.mouth) {
        l.ellipse(37, cy + 6, 3, 2.8, INK)
        l.rect(35, cy + 4, 3, 1, R.yellow[0])
      } else l.stamp(['.KKKKK.', 'KK...KK'], 28, cy + 5, { K: INK })
      // Blush of annoyance.
      l.paint(26, cy + 3, R.orange[1])
      l.paint(27, cy + 3, R.orange[1])
    },
    false
  )
  for (const [i, sx] of f.seeds.entries())
    part(r, (l) => {
      l.ellipse(46 + sx, cy + 5 - i * 2 + (sx > 8 ? sx / 5 : 0), 2, 1.3, R.yellow[1])
      l.set(45 + sx, cy + 4 - i * 2 + (sx > 8 ? Math.floor(sx / 5) : 0), R.yellow[0])
    })
  return r
}

export function pepperSheet(): Sheet {
  return {
    move: loop(
      frames(
        [
          { puff: 0, mouth: 0, seeds: [], legs: [0, 2], dy: 0 },
          { puff: 0, mouth: 0, seeds: [], legs: [2, 0], dy: -1 },
          { puff: 1, mouth: 0, seeds: [], legs: [0, 0], dy: 0 },
          { puff: -1, mouth: 1, seeds: [0], legs: [0, 0], dy: 1 },
          { puff: -1, mouth: 1, seeds: [7, 2], legs: [1, 0], dy: 1 },
          { puff: 0, mouth: 0, seeds: [14, 9], legs: [0, 2], dy: 0 }
        ],
        pepper
      ),
      8
    )
  }
}

// ---------------------------------------------------------------------------------------------
// 宿題: a teetering stack of notebooks with a furious face; it splits into worksheets.

function notebook(l: Raster, x: number, y: number, w: number, h: number, ramp: Ramp, label: boolean) {
  l.rect(x, y, w, h, ramp[1])
  l.rect(x, y, w, 1, ramp[0])
  l.rect(x, y + h - 1, w, 1, ramp[2])
  l.rect(x + w - 5, y + 1, 5, h - 2, R.paper[1])
  for (let i = 2; i < h - 1; i += 2) l.rect(x + w - 5, y + i, 5, 1, R.paper[2])
  l.rect(x, y + 1, 2, h - 2, ramp[2])
  if (label) {
    l.rect(x + 4, y + 2, 5, h - 4, R.paper[0])
    l.rect(x + 5, y + 3, 3, 1, R.paper[2])
  }
}

function homework(f: { top: number; mid: number; legs: [number, number]; dy: number; pencil: number; sweat: boolean }) {
  const r = new Raster(64, 64)
  part(r, (l) => {
    stub(l, 21, 47, 57, R.navy, R.red, f.legs[0])
    stub(l, 38, 47, 57, R.navy, R.red, f.legs[1])
  })
  part(r, (l) => notebook(l, 16, 40 + f.dy, 32, 11, R.navy, false))
  part(r, (l) => {
    notebook(l, 18 + f.mid, 29 + f.dy, 28, 11, R.red, true)
  })
  part(r, (l) => notebook(l, 20 + f.top, 20 + f.dy, 24, 9, R.yellow, true))
  // Pencil sticking out of the top, a loose sheet.
  part(r, (l) => {
    l.line(40 + f.top, 20 + f.dy, 43 + f.top + f.pencil, 12 + f.dy, R.yellow[1])
    l.line(41 + f.top, 20 + f.dy, 44 + f.top + f.pencil, 12 + f.dy, R.yellow[2])
    l.set(43 + f.top + f.pencil, 11 + f.dy, R.pink[1])
  })
  part(
    r,
    (l) => {
      angryEyes(l, 26 + f.mid, 31 + f.dy, 7, R.red[3])
      l.stamp(['KKKKKK', 'KwKwKw'], 28 + f.mid, 36 + f.dy, { K: INK, w: C.white })
    },
    false
  )
  if (f.sweat)
    part(r, (l) => {
      l.ellipse(14, 31 + f.dy, 1.2, 2, R.mint[0])
    })
  return r
}

export function homeworkSheet(): Sheet {
  return {
    move: loop(
      frames(
        [
          { top: -3, mid: 0, legs: [0, 2], dy: 0, pencil: -1, sweat: false },
          { top: -1, mid: 1, legs: [2, 0], dy: -1, pencil: 0, sweat: true },
          { top: 2, mid: 1, legs: [0, 0], dy: 0, pencil: 1, sweat: true },
          { top: 3, mid: 0, legs: [0, 2], dy: 0, pencil: 1, sweat: false },
          { top: 1, mid: -1, legs: [2, 0], dy: -1, pencil: 0, sweat: false },
          { top: -2, mid: -1, legs: [0, 0], dy: 0, pencil: -1, sweat: true }
        ],
        homework
      ),
      8
    )
  }
}

// ---------------------------------------------------------------------------------------------
// プリント: a single flapping worksheet with a sulky face and a red 0点 mark.

function worksheet(f: { tl: number; tr: number; bl: number; br: number; legs: [number, number]; dx: number }) {
  const r = new Raster(64, 64)
  part(r, (l) => {
    stub(l, 26 + f.dx, 49, 57, R.navy, R.brown, f.legs[0])
    stub(l, 34 + f.dx, 49, 57, R.navy, R.brown, f.legs[1])
  })
  const x0 = 21 + f.dx
  const x1 = 43 + f.dx
  part(r, (l) => {
    l.poly([x0, 27 + f.tl, x1, 26 + f.tr, x1 + 1, 49 + f.br, x0 - 1, 50 + f.bl], R.paper[1])
    // Lit left edge, shaded right edge and a dog-ear.
    l.poly([x1 - 3, 26 + f.tr, x1, 26 + f.tr, x1 + 1, 49 + f.br, x1 - 2, 49 + f.br], R.paper[2])
    l.poly([x0, 27 + f.tl, x0 + 2, 27 + f.tl, x0 + 1, 50 + f.bl, x0 - 1, 50 + f.bl], R.paper[0])
    l.poly([x1 - 5, 49 + f.br, x1 + 1, 43 + f.br, x1 + 1, 49 + f.br], R.paper[3])
    // Text lines and a red mark.
    for (let i = 0; i < 3; i++) l.rect(x0 + 3, 31 + f.tl + i * 3 + (i > 0 ? 1 : 0), 10 - i * 2, 1, R.navy[1])
    l.rect(x0 + 3, 44 + f.bl, 9, 1, R.navy[1])
    l.rect(x1 - 7, 28 + f.tr, 4, 4, R.red[1])
    l.rect(x1 - 6, 29 + f.tr, 2, 2, R.paper[1])
  })
  part(
    r,
    (l) => {
      const ey = 34 + Math.round((f.tl + f.bl) / 2)
      // Heavy-lidded sulky eyes, side glance, down-turned mouth.
      l.stamp(['KKKK', 'wwKK'], x0 + 5, ey, { K: INK, w: C.white })
      l.stamp(['KKK', 'wKK'], x0 + 12, ey, { K: INK, w: C.white })
      l.line(x0 + 4, ey - 2, x0 + 8, ey - 1, INK)
      l.line(x0 + 16, ey - 2, x0 + 13, ey - 1, INK)
      l.stamp(['.KKKK.', 'K....K'], x0 + 6, ey + 6, { K: INK })
    },
    false
  )
  return r
}

export function worksheetSheet(): Sheet {
  return {
    move: loop(
      frames(
        [
          { tl: 0, tr: -1, bl: 0, br: 0, legs: [0, 2], dx: 0 },
          { tl: -2, tr: -3, bl: 0, br: -1, legs: [2, 0], dx: 1 },
          { tl: -3, tr: -1, bl: -1, br: 0, legs: [0, 2], dx: 0 },
          { tl: -1, tr: 1, bl: 0, br: 1, legs: [2, 0], dx: -1 },
          { tl: 1, tr: 0, bl: 1, br: 0, legs: [0, 2], dx: 0 },
          { tl: 0, tr: -2, bl: 0, br: 0, legs: [2, 0], dx: 1 }
        ],
        worksheet
      ),
      12
    )
  }
}

// ---------------------------------------------------------------------------------------------
// ドッジボール: a red rubber ball kid with a headband, winding up and hurling a ball.

function miniBall(l: Raster, x: number, y: number) {
  ball(l, x, y, 4, 4, R.red)
  l.line(x - 3, y, x + 3, y + 1, R.red[3])
}

function dodgeball(f: { sq: number; arm: number; ball: number; legs: [number, number]; tail: number }) {
  const r = new Raster(64, 64)
  const cx = 30
  const cy = 36 - f.sq
  const rx = 13 + f.sq
  const ry = 13 - f.sq
  part(r, (l) => {
    stub(l, cx - 9, cy + 10, 57, R.navy, R.paper, f.legs[0])
    stub(l, cx + 5, cy + 10, 57, R.navy, R.paper, f.legs[1])
  })
  // Throwing arm on the far side, behind the ball.
  const sh = { x: cx + rx - 2, y: cy + 1 }
  const hands: Pt[] = [
    { x: sh.x + 5, y: sh.y + 9 },
    { x: sh.x + 4, y: sh.y - 8 },
    { x: sh.x - 1, y: sh.y - 14 },
    { x: sh.x + 12, y: sh.y - 5 },
    { x: sh.x + 10, y: sh.y + 5 },
    { x: sh.x + 6, y: sh.y + 8 }
  ]
  const hand = hands[f.arm]
  part(r, (l) => {
    l.thick(sh.x, sh.y, (sh.x + hand.x) / 2 + 2, (sh.y + hand.y) / 2, 4, SKIN[1])
    l.thick((sh.x + hand.x) / 2 + 2, (sh.y + hand.y) / 2, hand.x, hand.y, 4, SKIN[1])
    l.ellipse(hand.x, hand.y, 2.5, 2.5, R.paper[1])
  })
  if (f.ball === 1) part(r, (l) => miniBall(l, hand.x + 1, hand.y - 4))
  part(r, (l) => {
    ball(l, cx, cy, rx, ry, R.red)
    // Seam arc on the lower left.
    for (let t = 0; t < 9; t++) l.paint(cx - 12 + t, cy + 5 + Math.round(t * 0.5 + (t * t) / 12), R.red[3])
  })
  // Headband with trailing tails (tails flutter).
  part(r, (l) => {
    const by = cy - 9
    l.poly([cx - rx + 2, by + 1, cx + rx - 2, by + 1, cx + rx - 1, by + 4, cx - rx + 1, by + 4], R.paper[1])
    l.rect(cx - rx + 3, by + 1, 2 * rx - 6, 1, C.white)
    l.rect(cx - rx + 3, by + 3, 2 * rx - 4, 1, R.paper[2])
    ball(l, cx + 3, by + 2.5, 2.6, 2.6, R.red, false)
    l.poly(
      [cx - rx + 2, by + 1, cx - rx - 7, by - 3 + f.tail, cx - rx - 6, by + 1 + f.tail, cx - rx + 2, by + 3],
      R.paper[1]
    )
    l.poly(
      [cx - rx + 2, by + 3, cx - rx - 6, by + 4 - f.tail, cx - rx - 4, by + 7 - f.tail, cx - rx + 3, by + 4],
      R.paper[2]
    )
  })
  part(
    r,
    (l) => {
      angryEyes(l, cx - 2, cy - 4, 7, INK)
      l.stamp(['KKKKKK', 'KwKwKw', '.KKKK.'], cx, cy + 3, { K: INK, w: C.white })
    },
    false
  )
  if (f.ball >= 2) {
    const bx = [0, 0, 0, hand.x + 4, hand.x + 14, hand.x + 20][f.ball === 2 ? 3 : f.ball]
    part(r, (l) => miniBall(l, Math.min(59, bx), f.ball === 2 ? hand.y - 2 : hand.y))
  }
  return r
}

export function dodgeballSheet(): Sheet {
  return {
    move: loop(
      frames(
        [
          { sq: 0, arm: 0, ball: 0, legs: [0, 2], tail: 0 },
          { sq: -1, arm: 1, ball: 1, legs: [2, 0], tail: 1 },
          { sq: -1, arm: 2, ball: 1, legs: [0, 0], tail: 2 },
          { sq: 1, arm: 3, ball: 2, legs: [0, 2], tail: 0 },
          { sq: 1, arm: 4, ball: 4, legs: [2, 0], tail: -1 },
          { sq: 0, arm: 5, ball: 0, legs: [0, 0], tail: 1 }
        ],
        dodgeball
      ),
      9
    )
  }
}

// ---------------------------------------------------------------------------------------------
// ニキビ: an angry inflamed blob with a swollen white head.

function pimple(f: { sx: number; sy: number; dx: number; pus: number; legs: [number, number] }) {
  const r = new Raster(64, 64)
  const cx = 32 + f.dx
  const cy = 45 - Math.round(f.sy / 2)
  part(r, (l) => {
    stub(l, cx - 7, cy + 7, 57, R.red, R.brown, f.legs[0])
    stub(l, cx + 4, cy + 7, 57, R.red, R.brown, f.legs[1])
  })
  part(r, (l) => {
    // Swollen skin ring under the red body.
    ball(l, cx, cy + 1, 13 + f.sx, 11 + f.sy, R.skin, false)
    ball(l, cx, cy + 1, 10 + f.sx, 9 + f.sy, R.red)
  })
  part(r, (l) => {
    ball(l, cx - 2, cy - 9, 5.5 + f.pus, 5.2 + f.pus, R.paper)
    l.poly([cx - 3, cy - 15, cx - 1, cy - 15, cx + 1, cy - 12, cx - 5, cy - 12], R.paper[0])
    l.rect(cx, cy - 10, 3, 3, R.yellow[0])
    l.rect(cx + 1, cy - 8, 2, 2, R.yellow[1])
  })
  part(
    r,
    (l) => {
      angryEyes(l, cx - 6, cy - 1, 7, R.red[3])
      l.stamp(['KKKKKK', 'wKwKwK'], cx - 4, cy + 5, { K: INK, w: C.white })
    },
    false
  )
  return r
}

export function pimpleSheet(): Sheet {
  return {
    move: loop(
      frames(
        [
          { sx: 0, sy: 0, dx: 0, pus: 0, legs: [0, 2] },
          { sx: 1, sy: -1, dx: 1, pus: 0.5, legs: [2, 0] },
          { sx: -1, sy: 1, dx: -1, pus: 1, legs: [0, 2] },
          { sx: 1, sy: -1, dx: 0, pus: 0, legs: [2, 0] }
        ],
        pimple
      ),
      12
    )
  }
}

// ---------------------------------------------------------------------------------------------
// 片思い: a cracked pink heart, teary eyes, circling forlornly.

function crush(f: { dy: number; gap: number; tear: number; dx: number }) {
  const r = new Raster(64, 64)
  const cx = 32 + f.dx
  const cy = 34 + f.dy
  const whole = new Raster(64, 64)
  whole.ellipse(cx - 8, cy - 5, 9.5, 9.5, R.pink[1])
  whole.ellipse(cx + 8, cy - 5, 9.5, 9.5, R.pink[1])
  whole.poly([cx - 17.5, cy - 2, cx + 17.5, cy - 2, cx, cy + 21], R.pink[1])
  whole.poly([cx - 14, cy + 6, cx + 14, cy + 6, cx, cy + 20], R.pink[1])
  shadeEdges(whole, R.pink, 2, true)
  const crackX = (y: number) =>
    cx + [0, -1, 1, 0, -1, 1, 0, -1, 0, 1, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0][Math.max(0, y - (cy - 14))]
  const half = (right: boolean) => {
    const h = new Raster(64, 64)
    for (let y = 0; y < 64; y++)
      for (let x = 0; x < 64; x++) {
        const c = whole.get(x, y)
        if (c && x >= crackX(y) === right) h.set(x, y, c)
      }
    return h
  }
  const left = half(false)
  const right = half(true)
  part(r, (l) => {
    l.blit(left, -f.gap, f.gap > 1 ? 1 : 0)
  })
  part(r, (l) => {
    l.blit(right, f.gap, f.gap > 1 ? -1 : 0)
  })
  part(
    r,
    (l) => {
      // Big glossy sad eyes with welling tears.
      const eye = [' .KKK.', 'KwKKKK', 'KKKKKK', 'KKKKKK', '.mmmm.']
      l.stamp(eye, cx - 13, cy - 5, { K: INK, w: C.white, m: R.mint[0] })
      l.stamp(eye, cx + 5, cy - 5, { K: INK, w: C.white, m: R.mint[0] })
      l.line(cx - 14, cy - 8, cx - 8, cy - 10, R.pink[3])
      l.line(cx + 12, cy - 8, cx + 7, cy - 10, R.pink[3])
      l.stamp(['..KKK..', '.K...K.', 'K.....K'], cx - 10, cy + 6, { K: INK })
    },
    false
  )
  // Falling tears.
  for (const [ox, off] of [
    [-11, 0],
    [9, 3]
  ] as const) {
    const ty = cy + 2 + ((f.tear + off) % 6) * 3
    part(r, (l) => {
      l.rect(cx + ox, ty, 2, 2, R.mint[0])
      l.set(cx + ox, ty + 2, R.mint[1])
      l.set(cx + ox + 1, ty - 1, R.mint[0])
    })
  }
  return r
}

export function crushSheet(): Sheet {
  return {
    move: loop(
      frames(
        [
          { dy: 0, gap: 0, tear: 0, dx: 0 },
          { dy: -1, gap: 1, tear: 1, dx: 1 },
          { dy: -2, gap: 1, tear: 2, dx: 0 },
          { dy: -1, gap: 2, tear: 3, dx: -1 },
          { dy: 0, gap: 1, tear: 4, dx: 0 },
          { dy: 1, gap: 0, tear: 5, dx: 1 }
        ],
        crush
      ),
      8
    )
  }
}

// ---------------------------------------------------------------------------------------------
// Humans: 先輩 (a looming gakuran senior, arms crossed) and 飲み会 (a drunk salaryman with a tie on his head).

const GAK: Ramp = [R.hair[1], R.hair[2], R.hair[3], R.hair[3], R.hair[4]]

function blackShoe(l: Raster, end: Pt) {
  const x = Math.round(end.x) - 3
  const y = Math.round(end.y)
  l.rect(x, y - 1, 9, 3, R.hair[2])
  l.rect(x + 1, y - 1, 4, 1, R.hair[1])
  l.rect(x, y + 2, 9, 1, R.hair[4])
}

const POMPADOUR = [
  '.........jjjjjj.......',
  '......jjjHHaaaHHjj....',
  '....jjHHaaaaaaaHHHjj..',
  '...jHHaaaaaHHHHHHHHHj.',
  '..jHHHaaHHHHHHHHHHHHHj',
  '.jHHHHHHHHHHHHHHHHHHHj',
  '.jHHHHHHHHHHHHHHHHHHj.',
  '.jHHHJHHHHJHHHHHHJHHj.',
  '.jHHJ.JHHJ..JHHHJ.JHj.',
  '.jHJ........JJ....Jj..',
  '.jj...................'
]

const SENPAI_HEAD: HeadSpec = {
  w: 22,
  h: 20,
  hairAt: [-1, -4],
  hair: POMPADOUR,
  key: { a: R.hair[1], H: R.hair[2], J: R.hair[3], j: R.hair[3] },
  eyes: 'adult',
  near: [7, 10],
  far: [15, 10],
  mouth: [11, 15],
  nose: [13, 13],
  ear: [0, 10],
  brows: R.hair[4],
  extra: (l, x, y) => {
    // Thick brows, a scar and a shadowed glare.
    l.rect(x + 6, y + 7, 4, 2, R.hair[4])
    l.rect(x + 14, y + 7, 3, 2, R.hair[4])
    l.line(x + 3, y + 12, x + 5, y + 16, R.skin[3])
    l.set(x + 4, y + 13, C.white)
  }
}

const SENPAI: Body = {
  hip: 44,
  thigh: 6,
  shin: 7,
  legW: 6,
  gap: 4,
  torsoH: 14,
  span: 10,
  upper: 6,
  fore: 6,
  armW: 6,
  hang: [-1, 11],
  head: SENPAI_HEAD,
  headAt: [-11, -20],
  pants: GAK,
  sleeve: GAK,
  shoe: blackShoe,
  hand: (l, end) => {
    ball(l, end.x, end.y, 3, 3, SKIN, false)
  },
  torso: (l, { hx, hy, top, lean: L }) => {
    // A long gakuran: high stand collar, a column of gold buttons, a flared hem to the knees.
    l.poly(
      [
        hx - 10 + L,
        top + 2,
        hx - 7 + L,
        top - 1,
        hx + 8 + L,
        top - 1,
        hx + 11 + L,
        top + 2,
        hx + 12,
        hy + 6,
        hx - 11,
        hy + 6
      ],
      GAK[1]
    )
    shadeEdges(l, GAK, 2, true)
    l.rect(hx - 4 + L, top - 3, 10, 3, GAK[1])
    l.rect(hx - 4 + L, top - 3, 10, 1, GAK[0])
    l.rect(hx - 4 + L, top - 1, 10, 1, GAK[2])
    l.rect(hx + L + 5, top - 3, 1, 3, GAK[2])
    l.line(hx + 1 + L, top + 1, hx + 2, hy + 5, GAK[3])
    for (let y = top + 3; y < hy + 5; y += 4) {
      l.rect(hx + 2 + L * 0, y, 2, 2, R.yellow[1])
      l.set(hx + 2, y, R.yellow[0])
    }
    l.rect(hx - 4 + L, top - 2, 2, 2, R.yellow[1])
    l.line(hx - 10, hy + 5, hx + 11, hy + 5, GAK[2])
  },
  over: (r, f) =>
    // Crossed forearms and fists in front of the chest.
    part(r, (l) => {
      const y = f.top + 5
      l.thick(f.hx - 9 + f.lean, y + 4, f.hx + 8 + f.lean, y, 6, GAK[1])
      l.thick(f.hx + 9 + f.lean, y + 4, f.hx - 7 + f.lean, y, 5, GAK[2])
      l.line(f.hx - 8 + f.lean, y + 1, f.hx + 7 + f.lean, y - 2, GAK[0])
      l.ellipse(f.hx + 9 + f.lean, y + 1, 3, 3, SKIN[1])
      l.ellipse(f.hx - 9 + f.lean, y + 5, 3, 3, SKIN[1])
      l.rect(f.hx + 8 + f.lean, y + 3, 2, 1, SKIN[2])
      l.set(f.hx + 7 + f.lean, y + 4, R.yellow[1])
    }),
  lie: { thick: 10, coat: GAK, head: { grid: ['....'], key: {} } }
}

export function senpaiSheet(): Sheet {
  // A slow, heavy stomp: each step lifts a foot, slams it down and the whole body sinks.
  const walk = [
    { bob: 1, front: [3, 0], back: [-2, 3], lean: 0 },
    { bob: 0, front: [2, 0], back: [0, 6], lean: 1 },
    { bob: 3, front: [0, 0], back: [3, 1], lean: 1 },
    { bob: 1, front: [-2, 3], back: [3, 0], lean: 0 },
    { bob: 0, front: [0, 6], back: [2, 0], lean: 1 },
    { bob: 3, front: [3, 1], back: [0, 0], lean: 1 }
  ] as const
  return {
    move: loop(
      walk.map((w, i) =>
        human(
          SENPAI,
          pose({
            bob: w.bob,
            headBob: walk[(i + 5) % 6].bob,
            front: [...w.front],
            back: [...w.back],
            handN: [12, 7],
            handF: [-12, 7],
            face: 'angry',
            lean: w.lean
          })
        )
      ),
      6
    )
  }
}

// 飲み会 ---------------------------------------------------------------------------------------

const BALDING = [
  '....................',
  '.......jjjjj........',
  '.....jjHHHHHjj......',
  '....jHHHaHHHHHj.....',
  '...jHHHHHHHHHHj.....',
  '..jHHj.......jj.....',
  '.jHHHj..............',
  '.jHHj...............',
  '.jHj................',
  '.jj.................',
  '....................'
]

const DRINK_HEAD: HeadSpec = {
  w: 20,
  h: 19,
  hairAt: [-1, -1],
  hair: BALDING,
  key: { a: R.brown[2], H: R.brown[3], J: R.hair[3], j: R.hair[3] },
  eyes: 'adult',
  near: [6, 10],
  far: [14, 10],
  mouth: [10, 15],
  nose: [12, 13],
  ear: [0, 10],
  extra: (l, x, y, face) => {
    // A flushed red face.
    l.map((c) => (c === SKIN[1] ? R.red[0] : c === SKIN[2] ? R.orange[1] : c === SKIN[0] ? R.red[0] : c))
    l.rect(x + 3, y + 12, 3, 2, R.red[1])
    l.rect(x + 15, y + 12, 3, 2, R.red[1])
    if (face !== 'none') l.stamp(['KKKKK', 'KwwwK', '.KKK.'], x + 9, y + 14, { K: INK, w: C.white })
    // The necktie knotted round the forehead like a headband.
    l.rect(x + 1, y + 4, 19, 3, R.sky[1])
    l.rect(x + 1, y + 4, 19, 1, R.sky[0])
    for (let i = 3; i < 19; i += 4) l.rect(x + i, y + 5, 2, 1, R.navy[1])
    l.rect(x - 2, y + 3, 4, 5, R.sky[2])
    l.rect(x - 2, y + 3, 4, 1, R.sky[1])
    l.poly([x - 1, y + 8, x + 3, y + 8, x + 2, y + 16, x - 2, y + 14], R.sky[1])
    l.poly([x + 2, y + 8, x + 5, y + 8, x + 6, y + 14, x + 3, y + 15], R.sky[2])
    l.line(x + 1, y + 9, x + 1, y + 13, R.navy[1])
  }
}

function loafer(l: Raster, end: Pt) {
  const x = Math.round(end.x) - 2
  const y = Math.round(end.y)
  l.rect(x, y - 1, 7, 3, R.hair[2])
  l.rect(x + 1, y - 1, 3, 1, R.hair[1])
  l.rect(x, y + 2, 7, 1, R.hair[4])
}

function mug(l: Raster, x: number, y: number, level: number) {
  l.rect(x, y, 9, 10, R.yellow[1])
  l.rect(x, y, 2, 10, R.yellow[0])
  l.rect(x + 7, y, 2, 10, R.yellow[2])
  l.rect(x + 2, y + 10 - level, 5, level, R.yellow[2])
  l.rect(x + 9, y + 2, 3, 6, R.paper[1])
  l.rect(x + 10, y + 3, 1, 4, R.paper[0])
  l.rect(x - 1, y - 2, 11, 3, C.white)
  l.ellipse(x + 2, y - 3, 2.2, 1.8, C.white)
  l.ellipse(x + 6, y - 3, 2.6, 2, C.white)
}

function drinkingBody(splash: number, mugLevel: number): Body {
  return {
    hip: 42,
    thigh: 7,
    shin: 7,
    legW: 5,
    gap: 3,
    torsoH: 15,
    span: 9,
    upper: 6,
    fore: 6,
    armW: 4,
    hang: [-1, 11],
    head: DRINK_HEAD,
    headAt: [-9, -17],
    pants: R.metal,
    sleeve: R.navy,
    cuff: R.paper[0],
    shoe: loafer,
    torso: (l, { hx, hy, top, lean: L }) => {
      l.poly(
        [
          hx - 9 + L,
          top + 2,
          hx - 6 + L,
          top,
          hx + 6 + L,
          top,
          hx + 9 + L,
          top + 2,
          hx + 10,
          hy,
          hx + 9,
          hy + 3,
          hx - 9,
          hy + 3
        ],
        R.navy[1]
      )
      l.ellipse(hx + 3, hy - 4, 9, 6, R.navy[1])
      shadeEdges(l, R.navy, 2, true)
      // Open jacket: a rumpled white shirt panel with buttons.
      l.poly([hx - 2 + L, top, hx + 5 + L, top, hx + 4, hy + 2, hx - 1, hy + 2], R.paper[1])
      l.rect(hx + 3 + L, top, 2, hy - top + 2, R.paper[2])
      l.line(hx - 3 + L, top + 1, hx - 1, hy + 2, R.navy[0])
      l.line(hx + 6 + L, top + 1, hx + 5, hy + 2, R.navy[3])
      for (let y = top + 3; y < hy; y += 3) l.set(hx + 1, y, R.paper[3])
      l.rect(hx - 9, hy + 1, 20, 2, R.brown[3])
      l.set(hx + 1, hy + 1, R.yellow[1])
    },
    item: (r, f, hand) =>
      part(r, (l) => {
        mug(l, Math.round(hand.x) - 3, Math.round(hand.y) - 8, mugLevel)
      }),
    over: (r) => {
      if (splash <= 0) return
      part(
        r,
        (l) => {
          for (const [dx, dy] of splash === 1
            ? [
                [0, 0],
                [4, -2],
                [3, 3]
              ]
            : [
                [6, 0],
                [11, -3],
                [9, 4],
                [14, 1]
              ]) {
            l.rect(50 + dx, 38 + dy, 2, 2, R.yellow[1])
            l.set(50 + dx, 38 + dy, R.yellow[0])
          }
        },
        false
      )
    },
    lie: { thick: 10, coat: R.navy, head: { grid: ['....'], key: {} } }
  }
}

export function drinkingSheet(): Sheet {
  const steps: {
    w: number
    hn: [number, number]
    splash: number
    level: number
    face: 'smile' | 'open' | 'angry'
    lean: number
  }[] = [
    { w: 0, hn: [-3, 2], splash: 0, level: 6, face: 'smile', lean: -1 },
    { w: 1, hn: [-2, -5], splash: 0, level: 6, face: 'smile', lean: 0 },
    { w: 2, hn: [-6, -11], splash: 0, level: 6, face: 'open', lean: -2 },
    { w: 3, hn: [15, 3], splash: 1, level: 3, face: 'open', lean: 2 },
    { w: 4, hn: [13, 5], splash: 2, level: 1, face: 'smile', lean: 1 },
    { w: 5, hn: [-2, 2], splash: 0, level: 1, face: 'smile', lean: 0 }
  ]
  const legs = [
    { bob: 1, front: [3, 0], back: [-3, 0] },
    { bob: -1, front: [1, 0], back: [-1, 3] },
    { bob: 0, front: [-1, 0], back: [2, 1] },
    { bob: 1, front: [-3, 0], back: [3, 0] },
    { bob: -1, front: [-1, 3], back: [1, 0] },
    { bob: 0, front: [2, 1], back: [-1, 0] }
  ] as const
  return {
    move: loop(
      steps.map((s, i) =>
        human(
          drinkingBody(s.splash, s.level),
          pose({
            bob: legs[i].bob,
            headBob: legs[(i + 5) % 6].bob,
            front: [...legs[i].front],
            back: [...legs[i].back],
            handN: s.hn,
            handF: [-3, 6],
            face: s.face,
            lean: s.lean
          })
        )
      ),
      7
    )
  }
}

// ---------------------------------------------------------------------------------------------
// 奨学金: a heavy repayment booklet wrapped in chains, glaring, with a big ¥ stamp.

const YEN = ['K...K', '.K.K.', 'KKKKK', '..K..', 'KKKKK', '..K..', '..K..']

function chain(l: Raster, x0: number, y0: number, x1: number, y1: number) {
  const n = Math.max(2, Math.round(Math.hypot(x1 - x0, y1 - y0) / 3.2))
  for (let i = 0; i <= n; i++) {
    const x = x0 + ((x1 - x0) * i) / n
    const y = y0 + ((y1 - y0) * i) / n
    l.ellipse(x, y, i % 2 ? 1.6 : 2.4, i % 2 ? 2.4 : 1.6, i % 2 ? R.metal[2] : R.metal[0])
    l.set(x, y, R.metal[3])
  }
}

function scholarship(f: { dy: number; lift: [number, number]; sq: number; swing: number; dust: boolean }) {
  const r = new Raster(64, 64)
  const x0 = 13
  const y0 = 12 + f.dy + f.sq
  const w = 36
  const h = 38 - f.sq
  // Dangling chain and ball behind, swinging.
  part(r, (l) => {
    chain(l, x0 + 1, y0 + h - 6, x0 - 4 - f.swing, y0 + h + 2)
    chain(l, x0 - 4 - f.swing, y0 + h + 2, x0 - 6 - f.swing * 2, Math.min(53, y0 + h + 6))
    ball(l, x0 - 7 - f.swing * 2, 53, 4, 4, R.metal, false)
    l.rect(x0 - 10 - f.swing * 2, 52, 3, 2, R.metal[1])
  })
  // Heavy feet.
  part(r, (l) => {
    l.rect(x0 + 5, y0 + h - 2, 9, 57 - (y0 + h - 2) - f.lift[0], R.navy[2])
    l.rect(x0 + 22, y0 + h - 2, 9, 57 - (y0 + h - 2) - f.lift[1], R.navy[2])
    l.rect(x0 + 3, 54 - f.lift[0], 13, 3, R.yellow[2])
    l.rect(x0 + 3, 54 - f.lift[0], 13, 1, R.yellow[1])
    l.rect(x0 + 20, 54 - f.lift[1], 13, 3, R.yellow[2])
    l.rect(x0 + 20, 54 - f.lift[1], 13, 1, R.yellow[1])
  })
  // Pages visible on the right and top, then the cover.
  part(r, (l) => {
    l.poly([x0 + w, y0, x0 + w + 4, y0 - 4, x0 + w + 4, y0 + h - 4, x0 + w, y0 + h], R.paper[2])
    l.poly([x0, y0, x0 + 4, y0 - 4, x0 + w + 4, y0 - 4, x0 + w, y0], R.paper[1])
    for (let i = 1; i < 4; i++) l.line(x0 + w + i, y0 - i + 1, x0 + w + i, y0 + h - i - 1, R.paper[3])
  })
  part(r, (l) => {
    l.rect(x0, y0, w, h, R.navy[1])
    shadeEdges(l, R.navy, 2, true)
    l.rect(x0, y0, 4, h, R.navy[2])
    l.rect(x0 + 4, y0, 1, h, R.navy[0])
    // Gold frame.
    for (let x = x0 + 7; x < x0 + w - 3; x++) {
      l.set(x, y0 + 3, R.yellow[1])
      l.set(x, y0 + h - 4, R.yellow[2])
    }
    for (let y = y0 + 3; y < y0 + h - 3; y++) {
      l.set(x0 + 7, y, R.yellow[1])
      l.set(x0 + w - 4, y, R.yellow[2])
    }
    // Red ¥ seal.
    const sx = x0 + 17
    const sy = y0 + h - 9
    ball(l, sx, sy, 7.5, 7.5, R.red)
    l.stamp(YEN, sx - 2, sy - 3, { K: C.white })
  })
  part(
    r,
    (l) => {
      // Glowing red glare and a jagged snarl.
      l.stamp(['wwKK', 'wKKK', 'wwKK'], x0 + 11, y0 + 7, { w: C.white, K: R.red[1] })
      l.stamp(['wKK', 'KKK', 'wKK'], x0 + 22, y0 + 7, { w: C.white, K: R.red[1] })
      l.set(x0 + 14, y0 + 8, INK)
      l.set(x0 + 24, y0 + 8, INK)
      l.line(x0 + 9, y0 + 4, x0 + 14, y0 + 7, INK)
      l.line(x0 + 10, y0 + 3, x0 + 15, y0 + 6, INK)
      l.line(x0 + 28, y0 + 4, x0 + 22, y0 + 7, INK)
      l.line(x0 + 27, y0 + 3, x0 + 22, y0 + 6, INK)
      l.stamp(['KKKKKKKKK', 'KwKwKwKwK', '.KKKKKKK.'], x0 + 14, y0 + 13, { K: INK, w: C.white })
    },
    false
  )
  // Chains wrapped around the cover, with a padlock.
  part(r, (l) => {
    chain(l, x0 - 2, y0 + 18, x0 + w + 2, y0 + 20)
    l.rect(x0 + 27, y0 + 18, 7, 6, R.yellow[1])
    l.rect(x0 + 27, y0 + 18, 7, 1, R.yellow[0])
    l.rect(x0 + 27, y0 + 23, 7, 1, R.yellow[2])
    l.rect(x0 + 29, y0 + 15, 3, 3, R.metal[1])
    l.set(x0 + 30, y0 + 20, INK)
    l.set(x0 + 30, y0 + 21, INK)
  })
  if (f.dust)
    part(r, (l) => {
      for (const [dx, dy, s] of [
        [-4, 2, 2.5],
        [-9, 0, 1.8],
        [w + 4, 2, 2.5],
        [w + 9, 0, 1.8]
      ] as const)
        l.ellipse(x0 + dx + 6, 52 + dy, s, s * 0.8, R.paper[2])
    })
  return r
}

export function scholarshipSheet(): Sheet {
  return {
    move: loop(
      frames(
        [
          { dy: 0, lift: [0, 0], sq: 0, swing: 0, dust: false },
          { dy: -1, lift: [0, 2], sq: 0, swing: 1, dust: false },
          { dy: -3, lift: [0, 4], sq: 0, swing: 2, dust: false },
          { dy: 2, lift: [0, 0], sq: 2, swing: 1, dust: true },
          { dy: -1, lift: [2, 0], sq: 0, swing: 0, dust: false },
          { dy: -3, lift: [4, 0], sq: 0, swing: 1, dust: false }
        ],
        scholarship
      ),
      6
    )
  }
}

export const roster2Sheets: Record<string, () => Sheet> = {
  'enemy:mosquito': mosquitoSheet,
  'enemy:vaccine': vaccineSheet,
  'enemy:dog': dogSheet,
  'enemy:pepper': pepperSheet,
  'enemy:homework': homeworkSheet,
  'enemy:worksheet': worksheetSheet,
  'enemy:dodgeball': dodgeballSheet,
  'enemy:pimple': pimpleSheet,
  'enemy:crush': crushSheet,
  'enemy:senpai': senpaiSheet,
  'enemy:drinking': drinkingSheet,
  'enemy:scholarship': scholarshipSheet
}
/** Enemy ids (without `enemy:`) whose sprites carry lettering and must never mirror. */
export const ROSTER2_NO_FLIP: string[] = ['scholarship']
