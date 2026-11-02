import { C, DARKER, R } from './palette'
import { KEY, Raster, ball, part, shadeEdges, type Ramp } from './raster'
import { LIE, SKIN, human, pose, type Body, type HeadSpec, type Pt } from './rig'
import type { Anim, Sheet } from './sheet'

const loop = (frames: Raster[], fps: number): Anim => ({ frames, fps, loop: true })

// ---------------------------------------------------------------------------------------------
// 風邪: a green cold virus — droopy eyes, red nose, runny drip, and a big sneeze.

const GERM_FACE: Record<string, string[]> = {
  idle: ['KKK..KKK', 'gKK..gKK', '........', '.....rr.', '.p...rr.', '......c.', '......c.'],
  inhale: ['.KKK.KKK', '.gKK.gKK', '........', '.....rr.', '.p...rr.', '...KK.c.', '...KK...'],
  sneeze: ['KK...KK.', '.KK...KK', '........', '.....rr.', '.p..Krr.', '...KKK..', '....KK..'],
  blink: ['........', 'KKK..KKK', '........', '.....rr.', '.p...rr.', '......c.', '......c.']
}

function germ(f: { sx: number; sy: number; dx: number; dy: number; face: string; spray: number; spin: number }) {
  const r = new Raster(64, 64)
  const cx = 32 + f.dx
  const cy = 40 + f.dy
  const rx = 11 + f.sx
  const ry = 11 + f.sy
  part(r, (layer) => {
    for (let i = 0; i < 9; i++) {
      const a = (i / 9) * Math.PI * 2 + f.spin
      // Short stems so every knob is attached to the body.
      const sx = cx + Math.cos(a) * (rx + 5)
      const sy = cy + Math.sin(a) * (ry + 5)
      layer.thick(cx + Math.cos(a) * (rx - 1), cy + Math.sin(a) * (ry - 1), sx, sy, 2, R.green[1])
      ball(layer, sx, sy, 2.4, 2.4, R.green, false)
    }
  })
  part(r, (layer) => {
    ball(layer, cx, cy, rx, ry, R.green)
    for (const [x, y] of [
      [-6, -6],
      [4, -8],
      [-8, 3],
      [3, 6]
    ])
      layer.paint(cx + x, cy + y, R.green[2])
    layer.stamp(GERM_FACE[f.face], cx + 1, cy - 3, { ...KEY, g: C.white, c: R.mint[0] })
  })
  if (f.spray)
    part(
      r,
      (layer) => {
        const d = f.spray * 5
        for (const [x, y] of [
          [cx + rx + 2 + d, cy + 2],
          [cx + rx + 5 + d, cy - 2],
          [cx + rx + 4 + d, cy + 6],
          [cx + rx + 8 + d, cy + 3]
        ])
          layer.rect(x, y, 2, 2, R.mint[f.spray > 1 ? 1 : 0])
      },
      false
    )
  return r
}

export function germSheet(): Sheet {
  return {
    move: loop(
      [
        germ({ sx: 0, sy: 0, dx: 0, dy: 0, face: 'idle', spray: 0, spin: 0 }),
        germ({ sx: 0, sy: 0, dx: 0, dy: -1, face: 'blink', spray: 0, spin: 0.12 }),
        germ({ sx: -1, sy: 1, dx: -1, dy: -2, face: 'inhale', spray: 0, spin: 0.24 }),
        germ({ sx: -1, sy: 2, dx: -2, dy: -3, face: 'inhale', spray: 0, spin: 0.3 }),
        germ({ sx: 2, sy: -2, dx: 2, dy: 1, face: 'sneeze', spray: 1, spin: 0.36 }),
        germ({ sx: 1, sy: -1, dx: 1, dy: 0, face: 'idle', spray: 2, spin: 0.42 })
      ],
      8
    )
  }
}

// ---------------------------------------------------------------------------------------------
// いじめっ子: a stocky scowling kid in an orange shirt, stomping with clenched fists.

const BULLY_HEAD: HeadSpec = {
  w: 21,
  h: 19,
  hairAt: [-1, -2],
  hair: [
    '....B..B...B..B........',
    '...BbB.BbB.BbBBbB......',
    '..BbhhBbbbBbhhbbbB.....',
    '.BbhhbbbbbbbbbhhbbB....',
    '.BbbbbbbbbbbbbbbbbbB...',
    'BbbbbbbbbbbbbbbbbbbbB..',
    'BbbbbbbbbbbbbbbbbbbbB..',
    'BbbBBbbbbbbbbbbBbbbB...',
    'BbB...BB...B....BbB....',
    'BB..................B..',
    'B......................'
  ],
  key: { b: R.brown[1], B: R.brown[2], h: R.brown[0] },
  eyes: 'kid',
  near: [5, 10],
  far: [14, 10],
  mouth: [9, 15],
  nose: [12, 14],
  ear: [0, 10],
  brows: R.brown[3],
  extra: (l, x, y) => {
    // A sticking plaster on the far cheek.
    l.stamp(['WWWW', 'WgWW'], x + 15, y + 13, { W: R.paper[1], g: R.paper[2] })
  }
}

const TANK = R.orange

function fist(l: Raster, end: Pt) {
  ball(l, end.x, end.y + 0.5, 3, 3, SKIN, false)
  l.set(Math.round(end.x) - 1, Math.round(end.y) + 1, SKIN[2])
  l.set(Math.round(end.x), Math.round(end.y) + 1, SKIN[2])
}

function kicks(l: Raster, end: Pt) {
  const x = Math.round(end.x) - 2
  const y = Math.round(end.y)
  l.rect(x, y, 7, 2, R.brown[2])
  l.rect(x + 1, y, 3, 1, R.brown[1])
  l.rect(x, y + 2, 7, 1, R.paper[2])
}

const BULLY: Body = {
  hip: 46,
  thigh: 5,
  shin: 5,
  legW: 6,
  gap: 3,
  torsoH: 12,
  span: 9,
  upper: 5,
  fore: 5,
  armW: 5,
  hang: [-1, 9],
  head: BULLY_HEAD,
  headAt: [-10, -18],
  pants: R.navy,
  sleeve: SKIN,
  hand: fist,
  shoe: kicks,
  torso: (l, { hx, hy, top, lean: L }) => {
    l.rect(hx - 2 + L, top - 2, 6, 3, SKIN[2])
    // Orange tank top over a broad chest and belly, navy trousers.
    l.poly([hx - 9, hy - 2, hx + 9, hy - 2, hx + 9, hy + 3, hx - 9, hy + 3], R.navy[1])
    l.rect(hx - 9, hy - 2, 19, 1, R.navy[0])
    l.poly(
      [
        hx - 6 + L,
        top,
        hx - 3 + L,
        top,
        hx + L,
        top + 4,
        hx + 3 + L,
        top,
        hx + 6 + L,
        top,
        hx + 9,
        top + 5,
        hx + 9,
        hy,
        hx - 9,
        hy,
        hx - 9 + L,
        top + 5
      ],
      TANK[1]
    )
    for (let y = 0; y < l.h; y++) {
      let last = -1
      for (let x = 0; x < l.w; x++) if (l.get(x, y) === TANK[1]) last = x
      if (last >= 0) {
        l.set(last, y, TANK[2])
        l.set(last - 1, y, TANK[2])
      }
    }
    l.rect(hx - 6 + L, top, 2, 2, TANK[0])
    l.line(hx - 5, hy - 4, hx + 2, hy - 3, TANK[2])
    l.set(hx, hy - 1, R.yellow[1])
  },
  lie: { thick: 10, coat: TANK, head: { grid: LIE.fluffy, key: { H: R.brown[1], J: R.brown[2], a: R.brown[0] } } }
}

/** いじめっ子: stocky, scowling with gritted teeth, plaster on the cheek, big fists; a heavy stomp. */
export function bullySheet(): Sheet {
  const walk = [
    { bob: 2, front: [5, 0], back: [-4, 0] },
    { bob: -1, front: [2, 0], back: [-1, 4] },
    { bob: 0, front: [-1, 0], back: [3, 2] },
    { bob: 2, front: [-4, 0], back: [5, 0] },
    { bob: -1, front: [-1, 4], back: [2, 0] },
    { bob: 0, front: [3, 2], back: [-1, 0] }
  ] as const
  return {
    move: loop(
      walk.map((w, i) =>
        human(
          BULLY,
          pose({
            bob: w.bob,
            headBob: walk[(i + 5) % 6].bob,
            front: [...w.front],
            back: [...w.back],
            handN: [-w.front[0], 8],
            handF: [-w.back[0], 8],
            face: 'angry',
            lean: 1
          })
        )
      ),
      9
    )
  }
}

// ---------------------------------------------------------------------------------------------
// 出費: winged ¥ banknotes fluttering away.

const YEN = ['K...K', '.K.K.', 'KKKKK', '..K..', 'KKKKK', '..K..']

/** Feathered wing poses (right wing; mirrored for the left): up, level, down. */
export const WINGS = [
  ['.....wW', '...wwWg', '..wWWg.', '.wWgg..', 'wWg....'],
  ['.......', 'wwwwwww', 'WWWWWWw', 'gWgWgW.', '.......'],
  ['wWg....', '.wWgg..', '..wWWg.', '...wwWg', '.....wW']
]
export const WING_KEY = { w: C.white, W: R.paper[1], g: R.paper[2] }

function banknote(layer: Raster, x: number, y: number, tilt: number, flap: number) {
  part(layer, (l) => {
    // Each pose's root pixel sits on the bill's top edge so the wings never detach.
    const wy = y + tilt + [-3, -1, 1][flap]
    l.stamp(WINGS[flap], x + 16, wy - 2 * tilt, WING_KEY)
    l.stamp(WINGS[flap], x - 7, wy, WING_KEY, true)
  })
  part(layer, (l) => {
    l.poly([x, y + tilt, x + 16, y - tilt, x + 16, y + 9 - tilt, x, y + 9 + tilt], R.yellow[1])
    l.poly([x + 1, y + 1 + tilt, x + 15, y + 1 - tilt, x + 15, y + 8 - tilt, x + 1, y + 8 + tilt], R.yellow[0])
    // A small portrait oval on the left, the ¥ on the right.
    l.ellipse(x + 4.5, y + 4.5, 2.5, 3, R.paper[1])
    l.set(x + 4, y + 3, R.yellow[2])
    l.set(x + 5, y + 4, R.yellow[2])
    l.stamp(YEN, x + 9, y + 2, { K: R.yellow[3] })
    l.rect(x + 1, y + 8 + tilt, 4, 1, R.yellow[2])
  })
}

export function expenseSheet(): Sheet {
  const notes = [
    { x: 8, y: 28, phase: 0 },
    { x: 38, y: 22, phase: 2 },
    { x: 24, y: 45, phase: 4 }
  ]
  const frames = [0, 1, 2, 3, 4, 5].map((f) => {
    const r = new Raster(64, 64)
    for (const n of notes) {
      const k = (f + n.phase) % 6
      const dy = [1, 0, -1, -2, -1, 0][k]
      banknote(r, n.x + (k > 2 ? 1 : 0), n.y + dy, [0, 1, 1, 0, -1, -1][k], [2, 1, 0, 0, 1, 2][k])
    }
    return r
  })
  return { move: loop(frames, 10) }
}

// ---------------------------------------------------------------------------------------------
// 仕事: an angry stack of documents with a red 至急 stamp, sheets fluttering off the top.

const JOB_FACE = ['KK.....KK', '.KK...KK.', '.K.K.K.K.', '.........', '...KKK...', '..K...K..']

function sheetFly(layer: Raster, x: number, y: number, tilt: number) {
  const s = new Raster(64, 64)
  s.poly([x, y + tilt, x + 7, y - tilt, x + 7, y + 5 - tilt, x, y + 5 + tilt], R.paper[0])
  s.line(x + 1, y + 2, x + 5, y + 2, R.paper[2])
  part(layer, (l) => l.blit(s))
}

function job(f: { sq: number; dy: number; fly: number; legs: [number, number] }) {
  const r = new Raster(64, 64)
  const w = 22 + f.sq
  const h = 24 - f.sq
  const x = 32 - Math.round(w / 2)
  const y = 52 - h + f.dy
  for (const [i, lx] of [
    [0, x + 6],
    [1, x + w - 8]
  ] as const)
    part(r, (layer) => {
      layer.rect(lx, y + h, 2, 4 - f.legs[i], R.navy[2])
      layer.rect(lx - 1 + (i ? 0 : 0), 56 - f.legs[i] + Math.min(0, f.dy), 4, 2, R.navy[1])
    })
  // Stack thickness: a lit top and a side of page edges, with blue index tabs (the 仕事 colour).
  part(r, (layer) => {
    layer.poly([x, y, x + 4, y - 4, x + w + 4, y - 4, x + w, y], R.paper[0])
    layer.poly([x + w, y, x + w + 4, y - 4, x + w + 4, y + h - 4, x + w, y + h], R.paper[2])
    for (let i = 1; i < 4; i += 2) layer.line(x + w + i, y - i + 1, x + w + i, y + h - i - 1, R.paper[1])
  })
  part(r, (layer) => {
    layer.rect(x + w + 3, y + 4, 3, 3, R.navy[0])
    layer.rect(x + w + 3, y + 11, 3, 3, R.navy[1])
  })
  part(r, (layer) => {
    layer.rect(x, y, w, h, R.paper[1])
    shadeEdges(layer, R.paper, 1, true)
    for (let i = 0; i < 4; i++) layer.rect(x + 3, y + 11 + i * 3, w - 7 - (i % 2) * 4, 1, R.paper[2])
    layer.stamp(JOB_FACE, x + Math.round((w - 9) / 2) + 2, y + 3)
    // 至急 stamp, slightly crooked.
    const sx = x + 2
    const sy = y + h - 9
    // 至急: a red stamp with a bold white "!" — readable at 1×.
    layer.rect(sx, sy - 2, 10, 10, R.red[1])
    layer.rect(sx, sy - 2, 10, 1, R.red[0])
    layer.rect(sx + 4, sy, 2, 4, C.white)
    layer.rect(sx + 4, sy + 5, 2, 2, C.white)
  })
  // Binder clip in the work colour.
  part(r, (layer) => {
    layer.rect(30 + 1, y - 4, 6, 4, R.navy[0])
    layer.rect(31 + 1, y - 6, 4, 2, R.metal[1])
    layer.rect(30 + 1, y - 1, 6, 1, R.navy[1])
  })
  if (f.fly >= 0) {
    const t = f.fly
    sheetFly(r, 40 + t * 3, y - 6 - t * 4, t % 2 ? 1 : -1)
    if (t > 1) sheetFly(r, 14 - t, y - 2 - t * 3, t % 2 ? -1 : 1)
  }
  return r
}

export function jobSheet(): Sheet {
  return {
    move: loop(
      [
        job({ sq: 0, dy: 0, fly: 0, legs: [0, 0] }),
        job({ sq: 2, dy: 0, fly: 1, legs: [0, 0] }),
        job({ sq: -2, dy: -3, fly: 2, legs: [2, 1] }),
        job({ sq: -1, dy: -4, fly: 3, legs: [2, 2] }),
        job({ sq: 1, dy: -1, fly: -1, legs: [1, 0] }),
        job({ sq: 2, dy: 0, fly: -1, legs: [0, 0] })
      ],
      9
    )
  }
}

// ---------------------------------------------------------------------------------------------
// 高校受験 (boss, 128×128): an answer-sheet golem with pencil arms, book legs and red marks.

/**
 * A thick sharpened pencil from a (eraser end) to b (tip), rendered per pixel from its distance to the
 * axis: eraser, metal ferrule, a hexagonal body in three lit lanes, the bare wood cone and the graphite.
 */
export function pencil(layer: Raster, a: Pt, b: Pt, w: number) {
  const len = Math.hypot(b.x - a.x, b.y - a.y)
  const ux = (b.x - a.x) / len
  const uy = (b.y - a.y) / len
  const cone = w * 1.3
  const p = new Raster(layer.w, layer.h)
  for (let y = Math.floor(Math.min(a.y, b.y) - w); y <= Math.max(a.y, b.y) + w; y++)
    for (let x = Math.floor(Math.min(a.x, b.x) - w); x <= Math.max(a.x, b.x) + w; x++) {
      const dx = x + 0.5 - a.x
      const dy = y + 0.5 - a.y
      const s = dx * ux + dy * uy
      const d = -dx * uy + dy * ux
      if (s < 0 || s > len) continue
      const half = s > len - cone ? (w / 2) * ((len - s) / cone) : w / 2
      if (Math.abs(d) > half) continue
      const lane = d < -w / 6 ? 0 : d > w / 6 ? 2 : 1
      let c: number
      if (s < 4) c = [R.pink[0], R.pink[1], R.pink[2]][lane]
      else if (s < 8) c = Math.floor(s) % 2 ? R.metal[2] : [R.metal[0], R.metal[1], R.metal[2]][lane]
      else if (s < len - cone) c = [R.yellow[0], R.yellow[1], R.yellow[2]][lane]
      else if (s < len - cone * 0.35) c = lane === 2 ? R.brown[1] : R.brown[0]
      else c = lane === 0 ? R.hair[1] : R.hair[2]
      p.set(x, y, c)
    }
  part(layer, (l) => l.blit(p))
}

const ZERO_TEN = [
  '.KKK..K.......',
  'K...K.KKK.....',
  'K...K.K.......',
  'K...KKKKKKK...',
  'K...KK.....K..',
  'K...KKKKKKKK..',
  '.KKK.K.K.K.K..'
]

function hsBoss(f: {
  bob: number
  lean: number
  armA: number
  front: [number, number]
  back: [number, number]
  flutter: number
}) {
  const r = new Raster(128, 128)
  const cx = 64
  const hip = 92 + f.bob
  const top = 36 + f.bob
  const L = f.lean
  // Legs: rolled-paper tubes standing on black binder clips.
  for (const [x, foot, far] of [
    [cx + 12, f.back, true],
    [cx - 12, f.front, false]
  ] as const)
    part(r, (l) => {
      const fx = x + foot[0]
      const fy = 120 - foot[1]
      l.thick(x, hip - 2, fx, fy - 9, 9, R.paper[1])
      shadeEdges(l, R.paper, 2, true)
      for (let t = 0.15; t < 0.95; t += 0.22) {
        const sx = x + (fx - x) * t
        const sy = hip - 2 + (fy - 9 - hip + 2) * t
        l.line(sx - 4, sy - 1, sx + 4, sy + 1, R.paper[2])
      }
      // Binder clip foot: a black trapezoid jaw with silver handles.
      l.poly([fx - 9, fy - 8, fx + 9, fy - 8, fx + 11, fy, fx - 11, fy], R.hair[2])
      l.rect(fx - 9, fy - 8, 18, 1, R.hair[1])
      l.rect(fx - 11, fy - 1, 22, 1, R.hair[3])
      l.line(fx - 6, fy - 8, fx - 8, fy - 13, R.metal[1])
      l.line(fx + 6, fy - 8, fx + 8, fy - 13, R.metal[1])
      if (far) l.map((c) => DARKER[c])
    })
  // Back pencil arm.
  pencil(r, { x: cx + 26 + L, y: top + 8 }, { x: cx + 42 + L - f.armA, y: top + 56 }, 9)
  // Answer-sheet body: a thick slab (page-edge side), a curled corner, folds, bubbles, red marks and 0点.
  part(r, (l) => {
    const x0 = cx - 28 + L
    const x1 = cx + 26 + L
    l.poly([x1, top + 2, x1 + 6, top - 2, x1 + 6, hip - 2, x1, hip + 2], R.paper[2])
    for (let i = 1; i < 6; i += 2) l.line(x1 + i, top + 1 - i / 2, x1 + i, hip + 1 - i / 2, R.paper[1])
    l.poly([x0 + 9, top, x1, top + 2, x1, hip + 2, x0, hip, x0, top + 9], R.paper[1])
    l.poly([x0, top + 9, x0 + 9, top, x0 + 9, top + 9], R.paper[0])
    l.line(x0, top + 9, x0 + 9, top, R.paper[2])
    l.line(x0 + 10, top + 1, x0 + 10, top + 9, R.paper[2])
    l.line(x0 + 1, top + 10, x0 + 9, top + 10, R.paper[2])
    l.line(x0 + 24, top + 3, x0 + 22, hip - 1, R.paper[2])
    l.rect(x0 + 12, top + 4, x1 - x0 - 15, 4, R.mint[1])
    for (let row = 0; row < 6; row++)
      for (let col = 0; col < 5; col++) {
        const bx = x0 + 6 + col * 9
        const by = top + 14 + row * 7
        if (row >= 3 && col >= 2) continue
        const filled = (row * 7 + col * 3) % 5 === 0
        l.rect(bx, by, 5, 3, filled ? R.hair[2] : R.mint[2])
        if (!filled) l.rect(bx + 1, by + 1, 3, 1, R.paper[1])
      }
    for (const [mx, my] of [
      [x0 + 34, top + 14],
      [x0 + 10, top + 36]
    ])
      for (let i = 0; i < 7; i++) {
        l.rect(mx + i, my + i, 2, 1, R.red[1])
        l.rect(mx + 6 - i, my + i, 2, 1, R.red[1])
      }
    // The verdict: a big red 0点, underlined twice.
    const big = ZERO_TEN.flatMap((row) => {
      const wide = [...row].map((ch) => ch + ch).join('')
      return [wide, wide]
    })
    l.stamp(big, x0 + 22, top + 36, { K: R.red[1] })
    l.rect(x0 + 21, top + 51, 30, 1, R.red[1])
    l.rect(x0 + 23, top + 53, 26, 1, R.red[1])
  })
  // Head: a crumpled test booklet with a header band and glowing furious eyes.
  part(r, (l) => {
    const hx = cx - 20 + L + Math.round(f.bob / 2)
    const hy = top - 30
    l.poly([hx, hy + 3, hx + 40, hy, hx + 41, hy + 28, hx + 2, hy + 30], R.paper[1])
    shadeEdges(l, R.paper, 2, true)
    l.poly([hx, hy + 3, hx + 40, hy, hx + 40, hy + 7, hx, hy + 10], R.mint[1])
    l.poly([hx + 34, hy + 1, hx + 40, hy, hx + 40, hy + 6], R.paper[0])
    l.line(hx + 14, hy + 12, hx + 12, hy + 28, R.paper[2])
    l.stamp(
      [
        'RRR.........RRR',
        '.RwRR.....RRwR.',
        '..RRRR...RRRR..',
        '...............',
        '....KKKKKKK....',
        '...K.w.w.w.K...',
        '...KKKKKKKKK...'
      ],
      hx + 13,
      hy + 13,
      { R: R.red[0], w: C.white, K: C.inkCool }
    )
  })
  // Front pencil arm over the body.
  pencil(r, { x: cx - 26 + L, y: top + 6 }, { x: cx - 40 + L + f.armA, y: top + 56 }, 9)
  // Pages flutter off as it stomps.
  if (f.flutter >= 0)
    part(r, (l) => {
      const x = cx + 30 + f.flutter * 4
      const y = top - 20 - f.flutter * 5
      l.poly([x, y, x + 9, y - 2, x + 10, y + 5, x + 1, y + 7], R.paper[0])
      l.line(x + 2, y + 2, x + 7, y + 1, R.paper[2])
    })
  return r
}

export function hsBossSheet(): Sheet {
  const steps = [
    { bob: 3, lean: 0, armA: -5, front: [9, 0], back: [-7, 0], flutter: 0 },
    { bob: -1, lean: 1, armA: -2, front: [4, 0], back: [-2, 7], flutter: 1 },
    { bob: -2, lean: 2, armA: 3, front: [-3, 0], back: [5, 4], flutter: 2 },
    { bob: 3, lean: 2, armA: 5, front: [-7, 0], back: [9, 0], flutter: -1 },
    { bob: -1, lean: 1, armA: 2, front: [-2, 7], back: [4, 0], flutter: -1 },
    { bob: -2, lean: 0, armA: -3, front: [5, 4], back: [-3, 0], flutter: -1 }
  ] as const
  return {
    move: loop(
      steps.map((s) => hsBoss({ ...s, front: [...s.front], back: [...s.back] })),
      7
    )
  }
}

/** White hit-flash copy (outline kept a pale grey so the shape still reads). */
export function flash(frame: Raster) {
  const lines = new Set([C.inkCool, C.inkWarm, C.inkGreen])
  return frame.clone().map((c) => (lines.has(c) ? R.paper[2] : C.white))
}

// ---------------------------------------------------------------------------------------------
// The rest of the regular roster (64×64, each in its Tag colour).

const cycle = (n: number, f: (i: number, t: number) => Raster, fps: number): Sheet => ({
  move: loop(
    Array.from({ length: n }, (_, i) => f(i, (i / n) * Math.PI * 2)),
    fps
  )
})

const SCRIBBLE: Record<string, string[]> = {
  '#': ['.K.K.', 'KKKKK', '.K.K.', 'KKKKK', '.K.K.'],
  '!': ['K', 'K', 'K', '.', 'K'],
  '%': ['K..K', '..K.', '.K..', 'K..K']
}

/** 悪口: a jagged purple speech bubble with sharp teeth, chomping, trailing #!% scribbles. */
function insult(i: number, t: number) {
  const r = new Raster(64, 64)
  const y = Math.round(Math.sin(t) * 2)
  const open = i % 2 === 0
  part(
    r,
    (l) => {
      let x = 4
      for (const ch of '#!%') {
        l.stamp(SCRIBBLE[ch], x, 30 + y + ((i + x) % 3), { K: R.purple[2] })
        x += SCRIBBLE[ch][0].length + 2
      }
    },
    false
  )
  part(r, (l) => {
    const pts: number[] = []
    for (let k = 0; k < 14; k++) {
      const a = (k / 14) * Math.PI * 2
      const rad = k % 2 ? 16 : 19
      pts.push(38 + Math.cos(a) * rad * 1.15, 30 + y + Math.sin(a) * rad * 0.8)
    }
    l.poly(pts, R.purple[1])
    l.poly([26, 38 + y, 34, 42 + y, 22, 50 + y], R.purple[1])
    shadeEdges(l, R.purple, 2, true)
    l.stamp(['KK.......KK', '.KKK...KKK.', '.KwK...KwK.', '..KK...KK..'], 32, 20 + y, KEY)
    if (open) {
      l.rect(32, 30 + y, 14, 7, C.inkCool)
      for (let x = 33; x < 45; x += 3) {
        l.poly([x, 30 + y, x + 2, 30 + y, x + 1, 33 + y], C.white)
        l.poly([x, 37 + y, x + 2, 37 + y, x + 1, 34 + y], C.white)
      }
    } else
      for (let x = 32; x < 46; x += 2) l.line(x, 33 + y + (x % 4 ? 1 : -1), x + 2, 33 + y + (x % 4 ? -1 : 1), C.inkCool)
  })
  return r
}

/** 交通事故: a compact car in 3/4 with angry headlight eyes and a grille mouth, bouncing, exhaust and speed lines. */
export function car(i: number) {
  const r = new Raster(64, 64)
  const b = i % 2
  part(
    r,
    (l) => {
      for (const [y, w] of [
        [32, 8],
        [40, 6],
        [47, 9]
      ])
        l.rect(1 + ((i + y) % 3), y, w, 1, R.paper[2])
      l.ellipse(6 - (i % 3), 52, 2 + (i % 3), 1.6 + (i % 3) * 0.5, R.paper[2])
    },
    false
  )
  for (const x of [18, 46])
    part(r, (l) => {
      ball(l, x, 52, 6, 6, [R.hair[1], R.hair[2], R.hair[3], R.hair[3], R.hair[4]], false)
      l.ellipse(x, 52, 2.5, 2.5, R.metal[1])
      l.set(x + (i % 2 ? 1 : -1), 51, R.metal[0])
    })
  part(r, (l) => {
    // Body with a front face on the right: grey (事故) with red tail light, blue glass.
    l.poly([8, 40 + b, 12, 35 + b, 50, 35 + b, 58, 40 + b, 58, 50 + b, 8, 50 + b], R.metal[1])
    l.poly([16, 35 + b, 22, 25 + b, 42, 25 + b, 50, 35 + b], R.metal[1])
    shadeEdges(l, R.metal, 2, true)
    l.poly([19, 34 + b, 24, 27 + b, 31, 27 + b, 31, 34 + b], R.navy[2])
    l.poly([33, 34 + b, 33, 27 + b, 41, 27 + b, 46, 34 + b], R.navy[2])
    // Angry eyes on the windshield, brows slammed down.
    // Big white eyes with pupils turned inward, cut by thick brows slanting down toward the middle.
    for (const [ex, inner] of [
      [26, 1],
      [38, -1]
    ] as const) {
      l.rect(ex - 3, 28 + b, 7, 5, C.white)
      l.rect(ex + (inner > 0 ? 1 : -2), 30 + b, 2, 3, C.inkCool)
      for (let k = 0; k < 7; k++) {
        const x = ex - 3 + k
        const drop = inner > 0 ? Math.floor(k / 2) : Math.floor((6 - k) / 2)
        l.rect(x, 26 + b + drop, 1, 2, C.inkCool)
      }
    }
    l.rect(8, 42 + b, 3, 3, R.red[1])
    // Angry headlight eyes and a toothy grille on the front.
    l.rect(51, 39 + b, 6, 4, R.yellow[0])
    l.poly([50, 38 + b, 58, 40 + b, 58, 41 + b, 50, 39 + b], R.metal[3])
    // A toothy bumper grin.
    l.rect(49, 44 + b, 9, 5, C.inkCool)
    for (let x = 50; x < 58; x += 2) {
      l.poly([x, 44 + b, x + 2, 44 + b, x + 1, 46 + b], C.white)
      l.poly([x, 49 + b, x + 2, 49 + b, x + 1, 47 + b], C.white)
    }
    l.rect(8, 48 + b, 50, 1, R.metal[2])
  })
  return r
}

/** 授業: a walking blackboard with chalk formulas, chalk-drawn angry eyes, an eraser hat and chalk arms. */
function lesson(i: number, t: number) {
  const r = new Raster(64, 64)
  const step = i % 2
  for (const [x, k] of [
    [24, 0],
    [40, 1]
  ] as const)
    part(r, (l) => {
      const lift = step === k ? 2 : 0
      l.rect(x - 1, 46, 3, 10 - lift, R.brown[2])
      l.rect(x - 2, 55 - lift, 5, 2, R.brown[3])
    })
  part(r, (l) => {
    const y = step
    box(l, 13, 18 + y, 38, 28, 3, R.brown)
    l.rect(15, 20 + y, 34, 24, R.green[3])
    l.rect(15, 20 + y, 34, 1, R.green[2])
    l.rect(13, 44 + y, 38, 2, R.brown[0])
    l.rect(30, 43 + y, 4, 1, C.white)
    // Chalk formulas and angry chalk eyes.
    l.stamp(['w.w.ww..w..www', '.w....w.www..w', 'w.w..ww..w..ww'], 18, 35 + y, { w: R.paper[1] })
    l.stamp(['ww.......ww', '..ww...ww..', 'ww.......ww'], 22, 24 + y, { w: C.white })
  })
  part(r, (l) => {
    // Eraser hat: wooden back on navy felt.
    box(l, 23, 13 + step, 18, 3, 2, R.navy)
    box(l, 24, 10 + step, 16, 3, 2, R.brown)
  })
  for (const s of [-1, 1])
    part(r, (l) => {
      const a = Math.sin(t + (s > 0 ? Math.PI : 0)) * 5
      const x = s < 0 ? 12 : 52
      l.thick(x, 30 + step, x + s * 7, 24 + a, 2, C.white)
      l.set(x + s * 7, 24 + a, R.paper[2])
    })
  return r
}

/** 受験: a single answer sheet with a dog-eared corner, angry eyes and a pencil — the boss's small cousin. */
function exam(i: number) {
  const r = new Raster(64, 64)
  const hop = [0, 2, 5, 2, 0, -1][i]
  const sq = hop < 0 ? 1 : 0
  for (const x of [26, 36])
    part(r, (l) => {
      l.rect(x, 48 - hop, 2, 7 + Math.min(0, -hop) + (hop ? 0 : 1), R.navy[2])
      l.rect(x - 1, 55 - Math.max(0, hop - 2), 4, 2, R.navy[1])
    })
  part(r, (l) => {
    const y = 20 - hop + sq
    l.poly([20, y, 38, y, 44, y + 6, 44, y + 29 - sq, 20, y + 29 - sq], R.paper[1])
    l.poly([38, y, 44, y + 6, 38, y + 6], R.paper[2])
    shadeEdges(l, R.paper, 1, true)
    l.rect(21, y + 1, 16, 3, R.mint[1])
    l.stamp(['KK.....KK', '.KKw.wKK.'], 26, y + 8, KEY)
    l.stamp(['.KKK.', 'K...K'], 28, y + 12, KEY)
    for (let k = 0; k < 3; k++)
      for (let c = 0; c < 4; c++) l.rect(23 + c * 5, y + 17 + k * 4, 3, 2, (k + c) % 3 ? R.mint[2] : R.hair[2])
  })
  pencil(r, { x: 46, y: 22 - hop }, { x: 56, y: 44 - hop }, 4)
  return r
}

/** 資格試験: an unmistakable certificate scroll — rolled spiral ends, paper grain, glasses on the unrolled face,
 * a ribbon bow with a red wax seal — hopping. */
function cert(i: number) {
  const r = new Raster(64, 64)
  const hop = [0, 3, 6, 3, 0, -1][i]
  const sq = hop < 0 ? 2 : 0
  const y = 14 - hop + sq
  const h = 32 - sq
  const roll = (l: Raster, ry: number) => {
    l.rect(17, ry, 30, 7, R.paper[1])
    l.rect(17, ry, 30, 2, R.paper[0])
    l.rect(17, ry + 5, 30, 2, R.paper[2])
    // Spiral end caps on both sides.
    for (const ex of [17, 46]) {
      l.ellipse(ex + 0.5, ry + 3.5, 2.5, 3.5, R.paper[1])
      l.ellipse(ex + 0.5, ry + 3.5, 1.6, 2.4, R.paper[3])
      l.ellipse(ex + 0.5, ry + 3.5, 0.8, 1.2, R.paper[1])
    }
  }
  part(r, (l) => {
    l.rect(20, y + 4, 24, h - 4, R.paper[0])
    for (let k = 0; k < 6; k++) l.rect(22 + ((k * 7) % 18), y + 10 + k * 4, 3 + (k % 3), 1, R.paper[1])
    l.rect(42, y + 4, 2, h - 4, R.paper[2])
    l.stamp(['KKKK.KKKK', 'K.wKKK.wK', 'KKKK.KKKK'], 27, y + 10, KEY)
    l.stamp(['.KKK.', 'K...K'], 29, y + 15, KEY)
    for (let k = 0; k < 3; k++) l.rect(24, y + 21 + k * 3, 16 - k * 3, 1, R.paper[3])
  })
  part(r, (l) => roll(l, y))
  part(r, (l) => roll(l, y + h))
  part(r, (l) => {
    l.stamp(['mm...mm', 'mmm.mmm', '.mmmmm.', 'mmm.mmm', 'mm...mm'], 28, y + h + 1, { m: R.mint[1] })
    l.line(31, y + h + 6, 28, y + h + 11, R.mint[2])
    l.line(33, y + h + 6, 36, y + h + 11, R.mint[2])
    ball(l, 32, y + h + 4, 3, 3, R.red, false)
    l.set(31, y + h + 3, R.red[0])
  })
  return r
}

/** 病気: a big sickly virus with an ice bag on top and a thermometer in its mouth, dripping, wobbling heavily. */
function illness(i: number, t: number) {
  const r = new Raster(64, 64)
  const w = Math.round(Math.sin(t) * 2)
  const cx = 32
  const cy = 34
  const rx = 21 + w
  const ry = 20 - w
  const SICK: Ramp = [R.green[1], R.green[2], R.green[3], R.hair[3], R.green[4]]
  part(r, (l) => {
    for (let k = 0; k < 11; k++) {
      const a = (k / 11) * Math.PI * 2 + 0.3
      const sx = cx + Math.cos(a) * (rx + 3)
      const sy = cy + Math.sin(a) * (ry + 3)
      l.thick(cx + Math.cos(a) * (rx - 2), cy + Math.sin(a) * (ry - 2), sx, sy, 2, SICK[1])
      ball(l, sx, sy, 2.6, 2.6, SICK, false)
    }
  })
  part(r, (l) => {
    ball(l, cx, cy, rx, ry, SICK)
    for (const [x, y, s] of [
      [-10, 6, 3],
      [8, 10, 4],
      [12, -6, 2.5]
    ])
      l.ellipse(cx + x, cy + y, s, s * 0.8, R.purple[2])
    l.stamp(['ggg....ggg', 'KKK....KKK', '.wK.....wK'], cx - 6, cy - 4, { ...KEY, g: SICK[2] })
    l.stamp(['.KKKK.', 'K....K'], cx - 3, cy + 5, KEY)
  })
  // Thermometer from the mouth, an ice bag on top, drips.
  part(r, (l) => {
    l.line(cx + 2, cy + 6, cx + 16, cy + 1, C.white)
    l.line(cx + 2, cy + 7, cx + 16, cy + 2, R.paper[2])
    l.rect(cx + 16, cy, 3, 3, R.red[1])
  })
  part(r, (l) => {
    l.ellipse(cx - 2, cy - ry - 2, 10, 4.5, R.sky[1])
    l.ellipse(cx - 4, cy - ry - 3, 5, 2, R.sky[0])
    l.rect(cx + 7, cy - ry - 5, 4, 4, R.metal[1])
  })
  part(
    r,
    (l) => {
      const d = (i * 4) % 12
      l.rect(cx - 12, cy + ry - 2 + d, 2, 3, R.mint[0])
    },
    false
  )
  return r
}

/** ローン: an iron safe with a ¥ dial, chains and a padlock, dragging a ball and chain in slow heavy hops. */
function loan(i: number) {
  const r = new Raster(64, 64)
  const hop = [0, 0, 3, 6, 3, 0][i]
  const sq = i === 0 ? 2 : i === 5 ? 1 : 0
  part(r, (l) => {
    ball(l, 8, 52, 5, 5, [R.hair[1], R.hair[2], R.hair[3], R.hair[3], R.hair[4]], false)
    for (let s = 0; s <= 1; s += 0.15) l.ellipse(12 + s * 12, 51 - s * 4 - hop * s, 1.5, 1, R.metal[2])
  })
  part(r, (l) => {
    const y = 22 - hop + sq
    const h = 34 - sq
    box(l, 18, y, 30, h, 5, R.metal)
    l.rect(18, y, 30, 2, R.yellow[1])
    l.rect(18, y + h - 2, 30, 2, R.yellow[2])
    // Glowing slit eyes, the ¥ dial and the handle.
    l.rect(23, y + 6, 6, 2, R.red[0])
    l.rect(37, y + 6, 6, 2, R.red[0])
    l.ellipse(33, y + 19, 6, 6, R.metal[0])
    l.ellipse(33, y + 19, 4, 4, R.metal[2])
    l.stamp(['K...K', '.K.K.', 'KKKKK', '..K..', 'KKKKK'], 31, y + 17, { K: R.yellow[1] })
    l.rect(42, y + 16, 3, 7, R.metal[3])
    // Chains across and a padlock.
    for (let s = 0; s <= 1; s += 0.08) l.ellipse(18 + s * 30, y + 10 + s * 18, 1.6, 1.1, R.metal[1])
    l.ellipse(24, y + 23, 3, 3.5, R.metal[2])
    l.ellipse(24, y + 23, 1.5, 2, R.metal[3])
    l.rect(20, y + 25, 8, 6, R.yellow[1])
    l.rect(23, y + 27, 2, 2, R.yellow[3])
  })
  if (i === 0)
    part(r, (l) => {
      l.ellipse(14, 56, 3, 1.5, R.paper[2])
      l.ellipse(52, 56, 3, 1.5, R.paper[2])
    })
  return r
}

export const rosterSheets: Record<string, () => Sheet> = {
  'enemy:insult': () => cycle(4, insult, 9),
  'enemy:car': () => cycle(4, (i) => car(i), 14),
  'enemy:lesson': () => cycle(6, lesson, 8),
  'enemy:exam': () => cycle(6, (i) => exam(i), 9),
  'enemy:cert': () => cycle(6, (i) => cert(i), 9),
  'enemy:illness': () => cycle(6, illness, 6),
  'enemy:loan': () => cycle(6, (i) => loan(i), 6)
}

/** Oblique box: front face, lit top, shaded right side. */
function box(r: Raster, x: number, y: number, w: number, h: number, d: number, ramp: Ramp) {
  r.rect(x, y, w, h, ramp[1])
  r.poly([x, y, x + d, y - d, x + w + d, y - d, x + w, y], ramp[0])
  r.poly([x + w, y, x + w + d, y - d, x + w + d, y + h - d, x + w, y + h], ramp[2])
}
