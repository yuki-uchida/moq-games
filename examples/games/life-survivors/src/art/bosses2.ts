import { C, R } from './palette'
import { Raster, ball, part, shadeEdges, type Ramp } from './raster'
import type { Anim, Sheet } from './sheet'

/**
 * New life-event bosses (128×128, 6 frames, ground contact on rows 118–120). Keys are `enemy:<id>`.
 * Default facing is right. And the 16×16 enemy bullets.
 */
const S = 128
const loop = (frames: Raster[], fps: number): Anim => ({ frames, fps, loop: true })
const six = (f: (i: number, t: number) => Raster, fps = 7) => ({
  move: loop(
    [0, 1, 2, 3, 4, 5].map((i) => f(i, (i / 6) * Math.PI * 2)),
    fps
  )
})
const sn = (v: number, k = 1) => Math.round(Math.sin(v) * k)

// ---------------------------------------------------------------------------------------------
// 予防接種の日: a syringe nurse-robot. A graduated glass barrel of sloshing medicine for a body, a dark
// visor with angry red eyes under a red-cross nurse cap, a plunger sticking up behind, and a huge needle
// jabbing forward from one claw with a bead of medicine on the tip.

function vaccine(i: number, t: number) {
  const r = new Raster(S, S)
  const bob = sn(t * 2, 1.4)
  const thrust = sn(t, 3)
  // The plunger (T handle) rides up behind the head.
  part(r, (l) => {
    l.rect(30, 24 + bob, 4, 40, R.metal[1])
    l.rect(22, 18 + bob, 20, 5, R.metal[1])
    shadeEdges(l, R.metal, 1, true)
  })
  // The far claw hangs behind the barrel.
  part(r, (l) => {
    l.thick(26, 74 + bob, 16, 90 + bob + sn(t + 1), 6, R.metal[2])
    ball(l, 14, 93 + bob + sn(t + 1), 5, 5, R.metal)
  })
  // Stomping legs and wide flat feet.
  for (const [x, k] of [
    [38, 0],
    [66, Math.PI]
  ] as const)
    part(r, (l) => {
      const lift = Math.max(0, sn(t + k, 4))
      l.rect(x - 5, 104 - lift, 10, 10, R.metal[1])
      l.rect(x - 9, 113 - lift, 20, 6, R.metal[2])
      l.rect(x - 9, 113 - lift, 20, 1, R.metal[1])
      shadeEdges(l, R.metal, 1, true)
    })
  // The barrel: glass, graduations, sloshing medicine, a flange for a belt.
  part(r, (l) => {
    l.rect(30, 60 + bob, 52, 46, R.paper[1])
    l.rect(32, 58 + bob, 48, 2, R.paper[1])
    shadeEdges(l, R.paper, 2, true)
    for (let x = 34; x < 78; x++) {
      const top = 78 + bob + sn(t + x * 0.3, 1.3)
      for (let y = top; y < 102 + bob; y++) l.set(x, y, R.mint[1])
      l.set(x, top, R.mint[0])
    }
    l.rect(70, 80 + bob, 8, 22, R.mint[2])
    for (let k = 0; k < 6; k++) l.rect(33, 66 + bob + k * 6, k % 2 ? 5 : 8, 1, R.metal[2])
    for (const [x, y] of [
      [48, 90],
      [58, 84],
      [52, 96]
    ])
      l.ellipse(x, y + bob - ((i + x) % 3), 1.5, 1.5, R.mint[0])
    l.rect(24, 104 + bob, 64, 6, R.metal[1])
    l.rect(24, 104 + bob, 64, 1, R.metal[0])
    l.rect(24, 109 + bob, 64, 1, R.metal[2])
  })
  // Band-aid slapped on the barrel.
  part(r, (l) => {
    l.poly([34, 66 + bob, 48, 62 + bob, 50, 68 + bob, 36, 72 + bob], R.pink[1])
    l.rect(41, 66 + bob, 4, 3, R.paper[1])
  })
  // Head: a domed shell, dark visor, glowing angry eyes, a toothy grille.
  part(r, (l) => {
    ball(l, 56, 42 + bob, 24, 19, R.paper)
    l.rect(34, 56 + bob, 44, 5, R.paper[2])
  })
  part(r, (l) => {
    l.rect(37, 34 + bob, 38, 15, R.navy[3])
    l.rect(37, 34 + bob, 38, 1, R.navy[2])
  })
  const glow = i % 2 ? R.red[0] : R.orange[0]
  r.poly([40, 36 + bob, 51, 40 + bob, 51, 46 + bob, 40, 45 + bob], R.red[1])
  r.poly([72, 40 + bob, 61, 36 + bob, 61, 45 + bob, 72, 46 + bob], R.red[1])
  r.poly([61, 40 + bob, 72, 36 + bob, 72, 45 + bob, 61, 46 + bob], R.red[1])
  r.rect(45, 41 + bob, 3, 3, glow)
  r.rect(65, 41 + bob, 3, 3, glow)
  part(r, (l) => {
    l.rect(44, 52 + bob, 24, 6, C.inkCool)
    for (let x = 46; x < 66; x += 4) l.rect(x, 53 + bob, 3, i === 2 ? 4 : 3, C.white)
  })
  // Nurse cap with a red cross.
  part(r, (l) => {
    l.poly([36, 30 + bob, 40, 17 + bob, 72, 17 + bob, 76, 30 + bob], C.white)
    l.rect(36, 27 + bob, 40, 4, R.paper[2])
    l.rect(52, 19 + bob, 5, 9, R.red[1])
    l.rect(49, 22 + bob, 11, 4, R.red[1])
  })
  // Near arm and the huge needle.
  const hx = 96 + thrust
  const hy = 82 + bob
  part(r, (l) => {
    l.thick(80, 72 + bob, hx, hy, 7, R.metal[1])
    ball(l, 82, 72 + bob, 6, 6, R.metal)
  })
  part(r, (l) => {
    l.rect(hx + 3, hy - 6, 6, 12, R.paper[0])
    l.rect(hx + 3, hy - 6, 6, 2, R.red[1])
    l.rect(hx + 9, hy - 2, 14, 4, R.metal[0])
    l.rect(hx + 9, hy + 1, 14, 1, R.metal[2])
    l.poly([hx + 23, hy - 2, hx + 29, hy + 1, hx + 23, hy + 2], R.metal[0])
  })
  part(r, (l) => ball(l, hx, hy, 5, 6, R.metal))
  r.rect(hx + 29, hy + 2 + i, 2, 2, R.mint[0])
  r.rect(hx + 27, hy + 4 + i * 2, 2, 3, R.mint[1])
  return r
}

// ---------------------------------------------------------------------------------------------
// 失恋: a towering heart cracked into two halves that sob. A glowing crack between them, brows pulled up,
// an open mouth, streams of tears and a puddle on the ground.

const heartIn = (x: number, y: number) => {
  const a = x * x + y * y - 1
  return a * a * a - x * x * y * y * y <= 0
}
const zig = (y: number, ph: number) => Math.abs(((((y + ph) % 12) + 12) % 12) - 6) - 3

function heartbreak(i: number, t: number) {
  const r = new Raster(S, S)
  const bob = sn(t * 2, 2)
  const g = 3 + sn(t * 2, 1)
  const cx = 64
  const cy = 72 + bob
  const s = 40
  // Puddle of tears.
  part(r, (l) => {
    l.ellipse(64, 116, 36, 3.4, R.sky[2])
    l.ellipse(60, 115, 28, 1.6, R.sky[1])
    const rp = 4 + ((i * 3) % 12)
    l.rect(64 - rp - 10, 117, 6, 1, R.sky[0])
    l.rect(64 + rp + 6, 117, 6, 1, R.sky[0])
  })
  // The glowing hollow behind the crack.
  part(
    r,
    (l) => {
      for (let y = cy - 50; y <= cy + 42; y++)
        for (let x = cx - 50; x <= cx + 50; x++)
          if (heartIn((x + 0.5 - cx) / s, -(y + 0.5 - cy) / s)) l.set(x, y, R.red[3])
      for (let y = cy - 48; y <= cy + 40; y++) {
        const x = cx + zig(y, 3)
        l.rect(x - 2, y, 5, 1, R.orange[1])
        l.rect(x - 1, y, 3, 1, R.yellow[1])
        if ((y + i) % 7 === 0) l.rect(x, y, 1, 1, C.white)
      }
    },
    false
  )
  const half = (side: -1 | 1, oy: number) =>
    part(r, (l) => {
      const ox = side * g
      for (let y = cy - 52; y <= cy + 44; y++)
        for (let x = cx - 52; x <= cx + 52; x++) {
          const px = x - ox
          const py = y - oy
          if (!heartIn((px + 0.5 - cx) / s, -(py + 0.5 - cy) / s)) continue
          if (side === -1 ? px + 0.5 >= cx + zig(py, 3) : px + 0.5 < cx + zig(py, 3)) continue
          const d = Math.hypot(px + 0.5 - (cx - 0.38 * s), py + 0.5 - (cy - 0.45 * s)) / s
          l.set(x, y, d < 0.3 ? R.red[0] : d < 0.95 ? R.red[1] : d < 1.4 ? R.red[2] : R.red[3])
        }
    })
  half(-1, 1 + sn(t, 1))
  half(1, -sn(t + 1, 1))
  // Hairline cracks that glow.
  for (const [x0, y0, x1, y1] of [
    [-34, -24, -20, -10],
    [-20, -10, -26, 4],
    [30, -30, 22, -16],
    [22, -16, 30, -2]
  ] as const) {
    r.line(cx + x0, cy + y0, cx + x1, cy + y1, R.red[3])
    r.line(cx + x0 + 1, cy + y0, cx + x1 + 1, cy + y1, R.orange[1])
  }
  // Sad face: wet eyes, brows pulled up in the middle, a wobbling open mouth.
  const ey = cy - 8
  for (const f of [-1, 1] as const) {
    const ex = cx + f * (15 + g)
    const oy = f === -1 ? 1 + sn(t, 1) : -sn(t + 1, 1)
    part(r, (l) => {
      l.ellipse(ex, ey + oy, 6.5, 7, C.white)
      l.ellipse(ex + f * -1, ey + oy + 3, 3.4, 3.6, R.navy[2])
      l.set(ex + f * -1 - 1, ey + oy + 2, C.white)
      l.rect(ex - 5, ey + oy + 5, 11, 2, R.sky[0])
    })
    r.line(ex - f * 8, ey + oy - 4, ex + f * 8, ey + oy - 10, C.inkWarm)
    r.line(ex - f * 8, ey + oy - 5, ex + f * 8, ey + oy - 11, C.inkWarm)
    // The streams of tears run down, with drops that fall off the edge.
    part(r, (l) => {
      const sx = ex + f * 4
      l.thick(sx, ey + oy + 7, sx + f * 10, ey + oy + 26, 3, R.sky[1])
      l.thick(sx - f, ey + oy + 7, sx + f * 9, ey + oy + 25, 1, R.sky[0])
    })
    for (let k = 0; k < 2; k++) {
      const fall = (i * 8 + k * 31) % 62
      const dy = ey + oy + 26 + fall
      if (dy < 112) part(r, (l) => l.ellipse(ex + f * 15 + f * fall * 0.15, dy, 2, 3, R.sky[1]))
    }
  }
  const mo = [0, 1, 2, 1, 0, 1][i]
  part(r, (l) => {
    l.ellipse(cx, cy + 20, 8, 4 + mo, C.inkWarm)
    l.rect(cx - 5, cy + 16, 10, 2, C.white)
    l.ellipse(cx, cy + 23 + mo, 4, 2, R.pink[2])
  })
  return r
}

// ---------------------------------------------------------------------------------------------
// 確定申告: a mountain of receipts and tax forms with a calculator for a face (LCD eyes, button teeth),
// a red 税 seal stamped on the side, a receipt tape spilling out and loose sheets fluttering about.

const ZEI = [
  '.KK..K.K.K.',
  'KKKKK..K.K.',
  '..K..KKKKK.',
  'KKKKK.K...K',
  '..K..KKKKK.',
  '.KKK..K...K',
  'KK.KK.K.K.K',
  'K..K..KK..K'
]

function tax(i: number, t: number) {
  const r = new Raster(S, S)
  const sq = sn(t * 2, 1.4)
  const slabs: [number, number, Ramp][] = [
    [104, 12, R.paper],
    [94, 12, R.yellow],
    [84, 11, R.paper],
    [72, 11, R.mint],
    [60, 10, R.paper]
  ]
  let y = 120
  slabs.forEach(([w, h, ramp], k) => {
    y -= h
    const dx = sn(t + k * 1.7, 2)
    const x = 64 - w / 2 + dx
    const lift = k > 1 ? sq : 0
    part(r, (l) => {
      l.rect(x, y + lift, w, h, ramp[1])
      l.poly([x, y + lift, x + 5, y - 4 + lift, x + w + 5, y - 4 + lift, x + w, y + lift], ramp[0])
      l.poly([x + w, y + lift, x + w + 5, y - 4 + lift, x + w + 5, y + h - 4 + lift, x + w, y + h + lift], ramp[2])
      for (let q = 3; q < h - 1; q += 3) l.rect(x + 2, y + q + lift, w - 4, 1, ramp[2])
    })
    // Dog-eared sheets sticking out.
    part(r, (l) => {
      const ex = k % 2 ? x - 6 : x + w + 2
      l.poly([ex, y + 2 + lift, ex + 8, y + 1 + lift + (k % 3), ex + 9, y + 7 + lift, ex + 1, y + 8 + lift], R.paper[0])
      l.line(ex + 2, y + 4 + lift, ex + 7, y + 4 + lift, R.paper[3])
    })
  })
  const top = y + sq
  const ct = top - 16
  // The calculator face.
  part(r, (l) => {
    l.rect(42, ct - 2, 44, 70, R.navy[1])
    l.rect(44, ct - 4, 40, 2, R.navy[1])
    shadeEdges(l, R.navy, 2, true)
    l.rect(47, ct + 2, 34, 20, R.green[1])
    l.rect(47, ct + 2, 34, 2, R.green[0])
    l.rect(47, ct + 20, 34, 2, R.green[2])
  })
  r.poly([50, ct + 5, 62, ct + 11, 62, ct + 17, 50, ct + 15], C.inkGreen)
  r.poly([78, ct + 5, 66, ct + 11, 66, ct + 17, 78, ct + 15], C.inkGreen)
  if (i !== 3) {
    r.rect(55, ct + 12, 3, 3, R.green[0])
    r.rect(70, ct + 12, 3, 3, R.green[0])
  }
  const lit = i % 4
  for (let row = 0; row < 4; row++)
    for (let col = 0; col < 4; col++) {
      const bx = 47 + col * 9
      const by = ct + 27 + row * 10
      const hot = col === lit && row % 2 === 0
      const c = col === 3 ? R.red : hot ? R.yellow : R.metal
      part(r, (l) => {
        l.rect(bx, by, 8, 7, c[1])
        l.rect(bx, by, 8, 1, c[0])
        l.rect(bx, by + 6, 8, 1, c[2])
      })
    }
  // Receipt tape pouring out of the ct and curling away.
  part(r, (l) => {
    for (let k = 0; k < 7; k++) {
      const wob = sn(t + k * 0.8, 2)
      l.rect(60 + k * 4 + wob, ct - 5 - Math.round(Math.sin(k / 1.5) * 4) - k, 8, 4, k % 2 ? R.paper[0] : R.yellow[0])
    }
  })
  // The 税 seal.
  const sx = 99
  const sy = top + 30 + sn(t, 1)
  part(r, (l) => {
    ball(l, sx, sy, 12, 12, R.red)
    l.ellipse(sx, sy, 8.6, 8.6, R.red[1])
  })
  r.stamp(ZEI, sx - 5, sy - 4, { K: C.white })
  // Loose sheets flutter around.
  for (let k = 0; k < 3; k++) {
    const p = t + k * 2.1
    const px = [16, 104, 30][k] + sn(p, 3)
    const py = [50, 34, 20][k] + sn(p * 2, 3)
    const w = 4 + Math.abs(sn(p + 1, 3))
    part(r, (l) => {
      l.poly([px, py, px + 10, py - 1 + sn(p, 2), px + 10 + w - 4, py + 12, px + 2, py + 12 + sn(p, 1)], R.paper[0])
      l.rect(px + 2, py + 3, 6, 1, R.navy[2])
      l.rect(px + 2, py + 6, 5, 1, R.navy[2])
    })
  }
  return r
}

// ---------------------------------------------------------------------------------------------
// 親の介護: an enormous wheelchair heaped with blankets, a weary old face on top sighing a grey cloud,
// an IV drip on a pole, a nurse-call cord swinging, and the big wheel slowly rolling.

function care(i: number, t: number) {
  const r = new Raster(S, S)
  const br = sn(t, 1.5)
  const sw = sn(t + 1, 3)
  // IV pole and bag behind everything.
  part(r, (l) => {
    l.rect(20, 12, 3, 100, R.metal[1])
    l.rect(12, 10, 24, 3, R.metal[1])
    l.rect(8, 112, 20, 3, R.metal[2])
    ball(l, 22, 28, 8, 11, R.mint)
    l.rect(21, 38, 3, 5, R.mint[2])
    shadeEdges(l, R.metal, 1, true)
  })
  r.line(23, 44, 40, 72, R.mint[0])
  r.rect(21, 30 + (i % 3), 2, 2, R.mint[0])
  // Chair back and push handle.
  part(r, (l) => {
    l.poly([22, 92, 32, 48, 42, 48, 38, 92], R.navy[2])
    l.rect(12, 58, 16, 5, R.metal[1])
    shadeEdges(l, R.metal, 1, true)
  })
  // The seat and footrest.
  part(r, (l) => {
    l.rect(34, 90, 62, 6, R.navy[2])
    l.thick(88, 96, 102, 112, 4, R.metal[1])
  })
  // The blanket mound with quilting and a drooping fold.
  const Q: Ramp = R.mint
  part(r, (l) => {
    ball(l, 62, 70 - br, 38, 27 + br, Q)
    ball(l, 88, 84, 17, 13, Q)
    l.rect(48, 84, 52, 14, Q[2])
    for (let k = 0; k < 6; k++) l.ellipse(52 + k * 9, 98 + (k % 2), 5, 3, Q[2])
  })
  for (let k = -3; k < 8; k++) {
    for (let y = 48; y < 98; y++) {
      for (const x of [30 + k * 10 + Math.round((y - 48) * 0.5), 30 + k * 10 + 25 - Math.round((y - 48) * 0.5)]) {
        const c = r.get(x, y)
        if (c === Q[1]) r.set(x, y, Q[2])
        else if (c === Q[0]) r.set(x, y, Q[1])
      }
    }
  }
  // Slippers.
  part(r, (l) => {
    l.ellipse(103, 105, 8, 4, R.pink[1])
    l.ellipse(104, 102, 7, 3, R.pink[2])
  })
  // The weary old face on the mound.
  const hy = 43 - br
  part(r, (l) => {
    for (const [x, y] of [
      [58, 36],
      [60, 30],
      [66, 28],
      [57, 44]
    ])
      l.ellipse(x, y - br, 3, 3, C.white)
    ball(l, 74, hy, 17, 16, R.skin)
    l.ellipse(90, hy + 2, 4, 3.4, R.skin[1])
    l.ellipse(61, hy - 2, 4, 6, R.paper[1])
  })
  for (const x of [72, 84]) {
    r.rect(x - 3, hy - 3, 7, 2, R.skin[3])
    r.rect(x - 2, hy - 1, 5, 2, i === 3 ? R.skin[3] : C.white)
    r.rect(x, hy - 1, 2, 2, i === 3 ? R.skin[3] : C.inkCool)
    r.line(x - 3, hy + 2, x + 3, hy + 3, R.skin[2])
    r.line(x - 4, hy - 7, x + 3, hy - 6, R.paper[2])
  }
  r.line(66, hy - 12, 80, hy - 12, R.skin[2])
  r.line(68, hy - 10, 78, hy - 10, R.skin[2])
  r.ellipse(86, hy + 9, 3, 1.5 + (br > 0 ? 1 : 0), R.red[3])
  // The sigh: a grey cloud that grows as it drifts up and away.
  for (const off of [0, 0.5]) {
    const p = (i / 6 + off) % 1
    const cx = 92 + p * 22
    const cy = 52 - p * 22
    const rr = 2.5 + p * 6
    part(r, (l) => {
      ball(l, cx, cy, rr, rr * 0.85, R.metal)
      ball(l, cx + rr * 0.8, cy + 1, rr * 0.7, rr * 0.6, R.metal)
    })
  }
  // The big wheel rolls; spokes turn through an eighth in the loop.
  const cwx = 38
  const cwy = 91
  part(r, (l) => {
    l.ellipse(cwx, cwy, 27, 27, R.hair[2])
    l.ellipse(cwx, cwy, 24, 24, R.metal[1])
    l.ellipse(cwx, cwy, 21, 21, 0)
    for (let k = 0; k < 8; k++) {
      const a = (k / 8) * Math.PI * 2 + (i / 6) * (Math.PI / 4)
      l.line(cwx, cwy, cwx + Math.cos(a) * 21, cwy + Math.sin(a) * 21, R.metal[0])
    }
    ball(l, cwx, cwy, 5, 5, R.yellow)
  })
  // Caster.
  part(r, (l) => {
    l.ellipse(108, 112, 7, 7, R.hair[2])
    l.ellipse(108, 112, 3, 3, R.metal[0])
    l.rect(106, 100, 4, 6, R.metal[1])
  })
  // Nurse-call cord swinging from the pole to a red button.
  const bx = 34 + sw
  const by = 64
  part(r, (l) => {
    l.line(24, 14, bx, by - 3, R.red[3])
    ball(l, bx, by, 4, 4, R.red)
    l.set(bx, by, C.white)
  })
  return r
}

export const bosses2Sheets: Record<string, () => Sheet> = {
  'enemy:b_vaccine': () => six(vaccine, 7),
  'enemy:b_heartbreak': () => six(heartbreak, 6),
  'enemy:b_tax': () => six(tax, 6),
  'enemy:b_care': () => six(care, 6)
}
/** Boss ids (without `enemy:`) whose sprites carry lettering and must never mirror. */
export const BOSSES2_NO_FLIP: string[] = ['b_tax']

// ---------------------------------------------------------------------------------------------
// Enemy bullets: 16×16, bright core and dark outline so they read as hostile on dark ground.

type TF = (x: number, y: number) => [number, number]
const rot =
  (deg: number, cx = 8, cy = 8): TF =>
  (x, y) => {
    const a = (deg * Math.PI) / 180
    const c = Math.cos(a)
    const s = Math.sin(a)
    return [cx + (x - cx) * c - (y - cy) * s, cy + (x - cx) * s + (y - cy) * c]
  }
const poly = (l: Raster, f: TF, pts: number[], c: number) =>
  l.poly(
    pts.flatMap((v, k) => (k % 2 === 0 ? f(v, pts[k + 1]) : [])),
    c
  )
const box16 = (l: Raster, f: TF, x: number, y: number, w: number, h: number, c: number) =>
  poly(l, f, [x, y, x + w, y, x + w, y + h, x, y + h], c)
const seg = (l: Raster, f: TF, x0: number, y0: number, x1: number, y1: number, c: number) => {
  const [a, b] = f(x0, y0)
  const [d, e] = f(x1, y1)
  l.line(a, b, d, e, c)
}
const dot = (l: Raster, f: TF, x: number, y: number, c: number) => {
  const [a, b] = f(x + 0.5, y + 0.5)
  l.set(a - 0.5, b - 0.5, c)
}
const bul = (draw: (l: Raster) => void) => {
  const r = new Raster(16, 16)
  part(r, draw)
  return r
}

/** A rotated capsule/oval: `len` is the half length of the straight part, `rad` the half thickness. */
function capsule(
  l: Raster,
  cx: number,
  cy: number,
  deg: number,
  len: number,
  rad: number,
  c1: number,
  c2: number,
  hi: number
) {
  const a = (deg * Math.PI) / 180
  const co = Math.cos(a)
  const si = Math.sin(a)
  for (let y = 0; y < 16; y++)
    for (let x = 0; x < 16; x++) {
      const dx = x + 0.5 - cx
      const dy = y + 0.5 - cy
      const u = dx * co + dy * si
      const v = -dx * si + dy * co
      const du = Math.max(Math.abs(u) - len, 0)
      if (du * du + v * v > rad * rad) continue
      l.set(x, y, v < -rad + 1.3 && Math.abs(u) < len + 1 ? hi : u < 0 ? c1 : c2)
    }
}

const bulletFrames: Record<string, () => Raster[]> = {
  seed: () =>
    [0, 45, 90, 135].map((a) => bul((l) => capsule(l, 8, 8, a, 1.8, 3.3, R.yellow[1], R.orange[1], R.yellow[0]))),
  ball: () =>
    [0, 45, 90, 135].map((a) =>
      bul((l) => {
        ball(l, 8, 8, 6.5, 6.5, R.red)
        const f = rot(a)
        seg(l, f, 3, 8, 13, 8, R.red[3])
        seg(l, f, 8, 3, 8, 13, R.red[3])
        l.rect(5, 4, 2, 2, R.red[0])
      })
    ),
  beer: () =>
    [-12, 0, 12].map((a, k) =>
      bul((l) => {
        const f = rot(a)
        box16(l, f, 3, 6, 8, 8, R.yellow[1])
        box16(l, f, 3, 6, 2, 8, R.yellow[0])
        box16(l, f, 9, 6, 2, 8, R.yellow[2])
        poly(l, f, [10, 8, 13, 8, 14, 10, 14, 12, 13, 13, 10, 13, 10, 12, 12, 12, 12, 9, 10, 9], R.metal[0])
        for (const [x, y, rr] of [
          [4.5, 5, 2.4],
          [7.5, 4 - (k % 2), 2.8],
          [10, 5, 2.2]
        ] as const) {
          const [a1, b1] = f(x, y)
          l.ellipse(a1, b1, rr, rr, C.white)
        }
        dot(l, f, 2 + k * 4, 1 + (k % 2), C.white)
        dot(l, f, 11 - k * 3, 1, R.yellow[0])
      })
    ),
  shout: () =>
    [0, 1, 2].map((k) =>
      bul((l) => {
        const burst = (ro: number, ri: number, c: number, ph: number) => {
          const pts: number[] = []
          for (let n = 0; n < 16; n++) {
            const a = (n / 16) * Math.PI * 2 + ph
            const rr = n % 2 ? ri : ro - (n % 4 === 0 ? 0 : k % 2)
            pts.push(8 + Math.cos(a) * rr, 8 + Math.sin(a) * rr)
          }
          l.poly(pts, c)
        }
        burst(7.5, 4, R.orange[1], k * 0.2)
        burst(5.6, 3.2, R.yellow[1], k * 0.2)
        l.rect(7, 4, 2, 5, R.red[2])
        l.rect(7, 10, 2, 2, R.red[2])
      })
    ),
  wail: () =>
    [0, 1, 2].map((k) =>
      bul((l) => {
        const ro = [3.6, 5.4, 7][k]
        l.ellipse(8, 8, ro, ro, R.mint[0])
        if (k) l.ellipse(8, 8, ro - 1.8, ro - 1.8, 0)
        if (k === 2) {
          l.ellipse(8, 8, 3.2, 3.2, R.mint[0])
          l.ellipse(8, 8, 1.6, 1.6, 0)
        }
        l.rect(7, 6, 2, 3, R.sky[1])
        l.rect(7, 9, 2, 1, R.sky[2])
        if (k === 0) l.rect(7, 7, 2, 3, R.sky[1])
      })
    ),
  b_hs: () =>
    [0, 1, 2].map((k) =>
      bul((l) => {
        const f = rot([-6, 0, 6][k])
        box16(l, f, 1, 6, 2, 4, R.pink[1])
        box16(l, f, 3, 6, 1, 4, R.metal[1])
        box16(l, f, 4, 6, 7, 4, R.yellow[1])
        box16(l, f, 4, 6, 7, 1, R.yellow[0])
        box16(l, f, 4, 9, 7, 1, R.yellow[2])
        poly(l, f, [11, 5.5, 14.5, 8, 11, 10.5], R.skin[0])
        poly(l, f, [13.2, 6.9, 15, 8, 13.2, 9.1], C.inkCool)
        dot(l, f, 5 + k * 2, 6, C.white)
      })
    ),
  b_univ: () =>
    [0, 45, 90, 135].map((a) =>
      bul((l) => {
        const f = rot(a)
        box16(l, f, 2, 4.5, 6, 7, R.pink[1])
        box16(l, f, 8, 4.5, 6, 7, R.navy[1])
        box16(l, f, 2, 4.5, 12, 1.5, R.paper[0])
        box16(l, f, 8, 10, 6, 1.5, R.navy[2])
        seg(l, f, 8, 5, 8, 11, R.paper[0])
      })
    ),
  b_shukatsu: () =>
    [-14, 0, 14].map((a, k) =>
      bul((l) => {
        const f = rot(a)
        box16(l, f, 3.5, 1.5, 9, 13, C.white)
        box16(l, f, 4.5, 3, 3, 3.5, R.skin[1])
        for (const y of [3.5, 5.5, 8, 10, 12]) seg(l, f, y < 6 ? 8.5 : 4.5, y, 11.5, y, R.navy[2])
        poly(l, f, [10.5, 12.5, 12.5, 12.5, 12.5, 14.5], R.paper[2])
        dot(l, f, 5 + k, 2, R.red[1])
      })
    ),
  b_wedding: () =>
    [6, 4, 1.6, 4].map((rx, k) =>
      bul((l) => {
        if (rx < 2) {
          l.rect(7, 2, 2, 12, R.yellow[2])
          l.rect(7, 2, 1, 12, R.yellow[1])
          return
        }
        ball(l, 8, 8, rx, 6.5, R.yellow)
        l.ellipse(8, 8, Math.max(1, rx - 1.6), 4.6, R.yellow[1])
        if (rx > 5) l.stamp(['K...K', '.K.K.', 'KKKKK', '..K..', 'KKKKK', '..K..'], 6, 5, { K: R.brown[2] })
        else l.rect(7, 5, 2, 6, R.brown[2])
        if (k === 0) l.rect(4, 3, 2, 2, C.white)
      })
    ),
  b_mortgage: () =>
    [0, 45, 90, 135].map((a) =>
      bul((l) => {
        const f = rot(a)
        box16(l, f, 1.5, 4, 13, 8, R.orange[1])
        box16(l, f, 1.5, 4, 13, 2, R.orange[0])
        box16(l, f, 1.5, 10, 13, 2, R.orange[2])
        seg(l, f, 8, 6, 8, 10, R.paper[2])
        seg(l, f, 4, 8, 12, 8, R.paper[2])
      })
    ),
  b_rebel: () =>
    [8, 6, 3, 6].map((w, k) =>
      bul((l) => {
        const x = 8 - w / 2 + (k % 2)
        l.rect(x, 1, w, 14, R.brown[1])
        l.rect(x, 1, w, 2, R.brown[0])
        l.rect(x + w - 1, 1, 1, 14, R.brown[2])
        if (w > 4) {
          l.rect(x + 1, 4, w - 3, 4, R.brown[2])
          l.rect(x + 1, 9, w - 3, 4, R.brown[2])
          l.rect(x + w - 3, 8, 2, 2, R.yellow[0])
        }
        if (k % 2 === 0) {
          l.rect(0, 5, 2, 1, R.yellow[1])
          l.rect(14, 10, 2, 1, R.yellow[1])
        }
      })
    ),
  b_layoff: () =>
    [-16, 0, 16].map((a, k) =>
      bul((l) => {
        const f = rot(a)
        poly(l, f, [3.5, 1.5, 12.5, 1.5, 12.5, 14.5, 10.5, 13, 8, 14.5, 5.5, 13, 3.5, 14.5], R.pink[1])
        box16(l, f, 3.5, 1.5, 9, 2, R.pink[0])
        box16(l, f, 5, 5, 6, 3, R.red[1])
        seg(l, f, 5, 10, 11, 10, R.pink[3])
        seg(l, f, 5, 12, 9, 12, R.pink[3])
        dot(l, f, 5 + k * 2, 6, C.white)
      })
    ),
  b_illness: () =>
    [0, 90, 180, 270].map((a) => bul((l) => capsule(l, 8, 8, a, 3.4, 3.3, R.red[1], C.white, R.pink[0]))),
  b_vaccine: () =>
    [0, 1, 2].map((k) =>
      bul((l) => {
        const rr = 5 + (k === 1 ? 0.5 : 0)
        ball(l, 6, 8, rr, rr, R.mint)
        l.poly([9, 4.8, 14.5 - (k === 1 ? 1 : 0), 8, 9, 11.2], R.mint[1])
        l.rect(4, 5, 2, 2, C.white)
        l.rect(7, 7 + (k % 2), 3, 1, R.mint[0])
      })
    ),
  b_heartbreak: () =>
    [-24, -10, 4, -10].map((a, k) =>
      bul((l) => {
        const f = rot(a)
        poly(l, f, [2, 4, 8, 1.5, 14, 7, 10, 9, 13, 13, 7, 15, 6, 10, 3, 9], R.red[1])
        poly(l, f, [2, 4, 8, 1.5, 9, 4, 5, 6, 3, 9], R.pink[1])
        seg(l, f, 7, 6, 9, 10, R.red[3])
        seg(l, f, 9, 10, 8, 14, R.red[3])
        dot(l, f, 4, 4, C.white)
        if (k === 2) dot(l, f, 11, 8, R.yellow[0])
      })
    ),
  b_tax: () =>
    [-10, 0, 10, 0].map((a, k) =>
      bul((l) => {
        const f = rot(a)
        const pts = [5, 1.5, 11, 1.5, 11, 14]
        for (let n = 0; n < 3; n++) pts.push(10 - n * 2, 12.5, 9 - n * 2, 14.5)
        pts.push(5, 14)
        poly(l, f, pts, R.yellow[0])
        box16(l, f, 5, 1.5, 6, 2, R.green[1])
        for (const y of [5, 7, 9]) seg(l, f, 6, y, 9 + (y % 3 === 0 ? 1 : 0), y, R.brown[2])
        dot(l, f, 9, 11, R.brown[2])
        dot(l, f, 6 + k, 11, R.brown[2])
      })
    ),
  b_care: () =>
    [0, 1, 2].map((k) =>
      bul((l) => {
        const p = k === 1 ? 0.6 : 0
        ball(l, 5, 9.5, 4 + p, 3.6 + p, R.metal)
        ball(l, 10, 9.5, 4.2 + p, 3.8 + p, R.metal)
        ball(l, 7.5, 6.5, 4.6 + p, 4.2 + p, R.metal)
        l.rect(5, 7 + (k === 2 ? 1 : 0), 2, 1, C.inkCool)
        l.rect(9, 7 + (k === 2 ? 1 : 0), 2, 1, C.inkCool)
        l.rect(7, 10, 3, 1, C.inkCool)
      })
    )
}

/** Enemy bullets (16×16, 2–4 frames each), one anim per bullet kind name. */
export function bulletSheet(): Sheet {
  return Object.fromEntries(
    Object.entries({ ...bulletFrames, b_outbreak: bulletFrames.b_illness }).map(([name, make]) => [
      name,
      loop(make(), 8)
    ])
  )
}
