import { C, DARKER, R } from './palette'
import { KEY, Raster, ball, part, shadeEdges, type Ramp } from './raster'
import { pencil } from './enemies'
import { drawHead, type HeadSpec } from './rig'
import type { Anim, Sheet } from './sheet'

/** Life-event bosses and the reaper: 128×128, feet on row 120, centred on x = 64, 6-frame loops. */
const loop = (frames: Raster[], fps: number): Anim => ({ frames, fps, loop: true })
const six = (f: (i: number, t: number) => Raster, fps = 7) => ({
  move: loop(
    [0, 1, 2, 3, 4, 5].map((i) => f(i, (i / 6) * Math.PI * 2)),
    fps
  )
})
const S = 128

/** Oblique box: front face, lit top, shaded right side. */
function box(r: Raster, x: number, y: number, w: number, h: number, d: number, ramp: Ramp) {
  r.rect(x, y, w, h, ramp[1])
  r.poly([x, y, x + d, y - d, x + w + d, y - d, x + w, y], ramp[0])
  r.poly([x + w, y, x + w + d, y - d, x + w + d, y + h - d, x + w, y + h], ramp[2])
}

/** Hand-pixeled glyphs used on boss props. */
const GLYPH: Record<string, string[]> = {
  '3': ['KKKK.', '....K', '.KKK.', '....K', '....K', 'KKKK.'],
  '5': ['KKKKK', 'K....', 'KKKK.', '....K', '....K', 'KKKK.'],
  年: ['.K.....', '.KKKKKK', 'K..K...', '.KKKKK.', '...K...', 'KKKKKKK', '...K...'],
  不: ['KKKKKKK', '...KK..', '..K.K..', '.K..KK.', 'K...K.K', '....K..', '....K..'],
  う: ['..KKK..', '.......', '.KKKKK.', '......K', '......K', '.....K.', '..KKK..'],
  ざ: ['..K..KK', 'KKKKK..', '...K...', '..KKKK.', '.K.....', '.K.....', '..KKKK.'],
  い: ['.......', 'K....K.', 'K.....K', 'K......', 'K......', '.K...K.', '..K....']
}
function text(r: Raster, s: string, x: number, y: number, c: number) {
  for (const ch of s) {
    r.stamp(GLYPH[ch], x, y, { K: c })
    x += GLYPH[ch][0].length + 1
  }
}

// ---------------------------------------------------------------------------------------------
// 死神: the finale. A tall hood with a lit rim and a deep interior, the skull half in shadow with two
// faint glowing pupils, a cloak in three-tone folds with a flowing back edge and an animated tattered
// hem, a bony hand with knuckles gripping a long scythe. Slow float, gentle flutter. Solemn.

const SKULL = [
  '...gggggg...',
  '.gggggggggg.',
  'gggggggggggg',
  'gwwwwwwwwwwg',
  'wwKKKwwKKKww',
  'wwKcKwwKcKwg',
  'wwKKKwwKKKwg',
  'gwwwwKKwwwwg',
  '.gwwwwwwwwg.',
  '..wKwKwKwg..',
  '..gwgwgwgg..'
]

function reaper(i: number, t: number) {
  const r = new Raster(S, S)
  const y = Math.round(Math.sin(t) * 2)
  const fl = (k: number) => Math.round(Math.sin(t + k) * 2.5)
  const ROBE = R.hair
  // The back of the cloak flows out behind.
  part(r, (l) => {
    l.poly(
      [
        58,
        26 + y,
        46,
        44 + y,
        38 + fl(0),
        70 + y,
        32 + fl(1),
        94 + y,
        26 + fl(2),
        108 + y,
        36 + fl(2),
        104 + y,
        44 + fl(1),
        110 + y,
        50,
        80 + y
      ],
      ROBE[2]
    )
    shadeEdges(l, ROBE, 2)
    l.line(44, 52 + y, 34 + fl(1), 104 + y, ROBE[3])
  })
  // The blade arcs back over the hood (never toward the player), with a bright cutting edge.
  const top = { x: 100, y: 12 + y }
  part(r, (l) => {
    for (let s = 0; s <= 1; s += 0.004) {
      const a = -0.5 - s * 2.2
      const w = 4 * (1 - s) + 0.6
      l.ellipse(76 + Math.cos(a) * (28 - w), 28 + y + Math.sin(a) * (26 - w), w, w, R.metal[1])
    }
    shadeEdges(l, R.metal, 1)
    for (let s = 0.04; s <= 0.92; s += 0.004) {
      const a = -0.5 - s * 2.2
      l.paint(76 + Math.cos(a) * 28.5, 28 + y + Math.sin(a) * 26.5, R.metal[0])
      if (s > 0.3 && s < 0.6) l.paint(76 + Math.cos(a) * 27.5, 28 + y + Math.sin(a) * 25.5, C.white)
    }
  })
  // Main cloak: lit left rim, three-tone folds, shaded right, a tattered hem that drifts.
  part(r, (l) => {
    const hem = 105 + y
    const pts = [54, 34 + y, 80, 32 + y, 88, 50 + y, 94, 78 + y, 98, hem]
    for (let k = 0; k < 7; k++) {
      const x = 98 - (k + 1) * 8
      pts.push(x + 4, hem - 4 + (k % 2), x, hem + [3, 8, 4, 10, 2, 7, 5][(k + i) % 7])
    }
    pts.push(40, hem - 2, 44, 80 + y, 48, 52 + y)
    l.poly(pts, ROBE[1])
    shadeEdges(l, ROBE, 3, true)
    for (const [x0, x1, lit] of [
      [56, 52, true],
      [64, 63, true],
      [73, 75, false],
      [83, 88, false]
    ] as const) {
      l.line(x0, 54 + y, x1, hem - 3, ROBE[2])
      l.line(x0 + 1, 54 + y, x1 + 1, hem - 3, lit ? ROBE[0] : ROBE[3])
    }
  })
  // Hood: tall and leaning forward, a lit rim around a deep opening.
  part(r, (l) => {
    l.poly([50, 40 + y, 56, 18 + y, 66, 8 + y, 76, 10 + y, 86, 22 + y, 90, 38 + y, 84, 50 + y, 58, 52 + y], ROBE[1])
    shadeEdges(l, ROBE, 2, true)
    l.ellipse(74, 32 + y, 10.5, 13.5, ROBE[0])
    l.ellipse(74.5, 32.5 + y, 9, 12, C.inkCool)
    l.ellipse(76, 34 + y, 7, 9.5, R.hair[3])
  })
  part(
    r,
    (l) => {
      l.stamp(SKULL, 70, 28 + y, { ...KEY, g: R.paper[3], c: C.glow })
      // The brim's shadow covers the skull's crown.
      for (let x = 70; x < 82; x++)
        for (let yy = 28; yy < 31; yy++) if (l.get(x, yy + y) === C.white) l.set(x, yy + y, R.paper[3])
    },
    false
  )
  // The staff, then the sleeve, then the bony hand closing around the shaft.
  part(r, (l) => {
    l.thick(top.x, top.y, 92, 117, 3, R.brown[1])
    shadeEdges(l, R.brown)
    l.rect(top.x - 2, top.y - 2, 4, 4, R.metal[2])
  })
  part(r, (l) => {
    l.poly([74, 52 + y, 84, 54 + y, 98, 64 + y, 96, 74 + y, 86, 72 + y, 72, 62 + y], ROBE[1])
    shadeEdges(l, ROBE, 2, true)
    l.poly([90, 64 + y, 98, 64 + y, 96, 74 + y, 89, 72 + y], C.inkCool)
  })
  part(r, (l) => l.stamp(['.ww.w.', 'wgwwgw', 'wwwwww', 'gwwgwg', '.g..g.'], 94, 63 + y, { ...KEY, g: R.paper[2] }))
  return r
}

// ---------------------------------------------------------------------------------------------
// 大学受験: a towering stack of reference books in a mortarboard, glowing eyes, a bookmark tongue, a pencil.

function univ(i: number, t: number) {
  const r = new Raster(S, S)
  const bob = Math.round(Math.sin(t * 2) * 2)
  const sway = Math.round(Math.sin(t) * 2)
  // Book legs stepping.
  for (const [x, k] of [
    [48, 0],
    [76, Math.PI]
  ] as const)
    part(r, (l) => {
      const lift = Math.max(0, Math.round(Math.sin(t + k) * 4))
      box(l, x - 8, 104 - lift, 16, 16, 3, R.navy)
      l.rect(x - 8, 106 - lift, 16, 2, R.paper[1])
    })
  const books: [number, number, Ramp][] = [
    [64, 14, R.navy],
    [58, 12, R.red],
    [62, 13, R.mint],
    [54, 12, R.yellow]
  ]
  let yy = 102 + bob
  books.forEach(([w, h, ramp], k) => {
    yy -= h
    const x = 64 - w / 2 + (k % 2 ? sway : -sway) * (k / 2)
    part(r, (l) => {
      box(l, x, yy, w, h, 5, ramp)
      l.rect(x + w - 1, yy - 4, 5, h, R.paper[1])
      for (let p = 1; p < h - 1; p += 2) l.rect(x + w, yy - 3 + p, 4, 1, R.paper[2])
      l.rect(x + 3, yy + 3, w - 8, 2, ramp[0])
    })
  })
  // Eyes glow on the mint spine; the bookmark tongue hangs from the gap below.
  const eyeY = 102 + bob - 14 - 12 - 13 + 4
  part(r, (l) => {
    l.stamp(
      ['cccccc.......cccccc', '.cwwccc.....cccwwc.', '..cwccc.....cccwc..', '...ccc.......ccc...'],
      45,
      eyeY - 1,
      { c: C.glow, w: C.white }
    )
    const tongue = Math.round(Math.sin(t * 2) * 2)
    l.poly(
      [60, eyeY + 9, 66, eyeY + 9, 66 + tongue, eyeY + 20, 63 + tongue, eyeY + 17, 60 + tongue, eyeY + 20],
      R.red[1]
    )
  })
  // The top cover flaps open and shut; a mortarboard rides on top with a swinging tassel.
  const lid = [0, 3, 6, 3, 0, 1][i]
  const topY = 102 + bob - 51
  part(r, (l) => {
    l.poly([38, topY, 92, topY, 92 - lid, topY - 6 - lid * 2, 38, topY - 6 - lid], R.yellow[1])
    for (let p = 0; p < lid; p += 2) l.line(40, topY - 1 - p, 90, topY - 1 - p, R.paper[1])
  })
  part(r, (l) => {
    const my = topY - 14 - lid
    l.poly([40, my + 4, 66, my - 2, 92, my + 4, 66, my + 10], R.hair[2])
    l.rect(54, my + 6, 24, 6, R.hair[2])
    l.rect(54, my + 6, 24, 1, R.hair[1])
    const tx = 82 + Math.round(Math.sin(t) * 3)
    l.line(66, my + 4, tx, my + 8, R.yellow[1])
    l.rect(tx - 1, my + 8, 3, 7, R.yellow[1])
  })
  pencil(r, { x: 96, y: 60 + bob }, { x: 108 + sway, y: 108 + bob }, 9)
  return r
}

// ---------------------------------------------------------------------------------------------
// 就職活動: a three-headed interview panel — a long desk walking on its legs, a blue cloth front.

const INTERVIEWER = (hair: readonly string[], key: Record<string, number>, glasses = false): HeadSpec => ({
  w: 17,
  h: 16,
  hairAt: [-1, -1],
  hair,
  key,
  eyes: 'adult',
  near: [5, 9],
  far: [12, 9],
  mouth: [9, 13],
  nose: [11, 11],
  ear: [0, 8],
  extra: glasses
    ? (l, x, y) => {
        l.stamp(['KKKK..KKK', 'K..KKKK.K', 'KKKK..KKK'], x + 3, y + 8)
      }
    : undefined
})

const SHORT_HAIR = [
  '.....jjjjjjj......',
  '...jjHHHHHHHjj....',
  '..jHHHaaHHHHHHj...',
  '.jHHaaHHHHHHHHHj..',
  '.jHHHHHHHHHHHHHHj.',
  'jHHHHHHHHHHHHHHHHj',
  'jHHHJHHHJHHHJHHHHj',
  'jHHJ.JHJ..JHJ.JHHj',
  'jHJ.............Jj',
  'jj................'
]
const BALDING = [
  '..................',
  '......j.j.j.......',
  '.....jHjHjHj......',
  '..................',
  '.jj............jj.',
  'jHHj..........jHHj',
  'jHHj...........jHj',
  'jHj.............j.',
  'jj................'
]
const BOB = [
  '....jjjjjjjjj.....',
  '..jjHHHHHHHHHjj...',
  '.jHHHaaaHHHHHHHj..',
  'jHHaaHHHHHHHHHHHj.',
  'jHHHHHHHHHHHHHHHHj',
  'jHHHHHHHHHHHHHHHHj',
  'jHHHHHJJJJJJHHHHHj',
  'jHHHJ........JHHHj',
  'jHHHJ.........HHHj',
  'jHHHJ.........HHHj',
  'jHHHJ.........JHHj',
  'jjjjj.........jjjj'
]
const DARK_HAIR = { a: R.hair[1], H: R.hair[2], J: R.hair[3], j: R.hair[3] }
const GREY_HAIR = { a: R.metal[0], H: R.metal[1], J: R.metal[2], j: R.metal[2] }

function shukatsu(i: number, t: number) {
  const r = new Raster(S, S)
  const bob = Math.round(Math.abs(Math.sin(t)) * -2)
  const BLACK: Ramp = [R.hair[1], R.hair[2], R.hair[3], R.hair[3], R.hair[4]]
  const heads: [number, HeadSpec][] = [
    [26, INTERVIEWER(BALDING, GREY_HAIR, true)],
    [55, INTERVIEWER(SHORT_HAIR, DARK_HAIR)],
    [84, INTERVIEWER(BOB, DARK_HAIR, true)]
  ]
  // Torsos behind the desk: black suits, white collars, blue ties (the 仕事 colour).
  for (const [x, head] of heads) {
    const lean = Math.round(Math.sin(t + x) * 1)
    part(r, (l) => {
      l.poly([x - 3 + lean, 52 + bob, x + 20 + lean, 52 + bob, x + 23, 74, x - 6, 74], BLACK[1])
      shadeEdges(l, BLACK, 2, true)
      l.poly([x + 5 + lean, 52 + bob, x + 13 + lean, 52 + bob, x + 9 + lean, 62 + bob], R.paper[1])
      l.rect(x + 8 + lean, 53 + bob, 2, 8, R.navy[0])
    })
    drawHead(r, head, x + lean, 36 + bob, x === 55 ? 'angry' : 'down')
  }
  // The desk: wooden top, a blue skirt, four legs walking in pairs.
  part(r, (l) => {
    box(l, 8, 72 + bob, 110, 5, 6, R.brown)
    l.rect(10, 77 + bob, 106, 20, R.navy[1])
    for (let x = 14; x < 114; x += 10) l.rect(x, 78 + bob, 1, 18, R.navy[2])
    l.rect(10, 77 + bob, 106, 2, R.navy[0])
    l.rect(10, 95 + bob, 106, 2, R.navy[2])
  })
  for (const [x, k] of [
    [18, 0],
    [42, Math.PI],
    [84, 0],
    [108, Math.PI]
  ] as const)
    part(r, (l) => {
      const lift = Math.max(0, Math.round(Math.sin(t + k) * 5))
      l.rect(x - 2, 97 + bob, 4, 22 - lift - bob, R.brown[2])
      l.rect(x - 3, 118 - lift, 6, 2, R.brown[3])
    })
  // Clipboards and the 不採用 stamp held high.
  part(r, (l) => {
    box(l, 20, 64 + bob, 12, 8, 2, R.brown)
    l.rect(21, 64 + bob, 10, 7, R.paper[1])
    l.rect(24, 63 + bob, 4, 2, R.metal[1])
    box(l, 92, 64 + bob, 12, 8, 2, R.brown)
    l.rect(93, 64 + bob, 10, 7, R.paper[1])
  })
  const lift = [0, 4, 8, 6, 2, 0][i]
  part(r, (l) => {
    // The 不採用 sign is held up on a stick, high above the heads.
    l.rect(80, 22 - lift + bob, 2, 32 + lift, R.brown[1])
    l.rect(70, 6 - lift + bob, 22, 16, R.red[1])
    l.rect(72, 8 - lift + bob, 18, 12, R.paper[0])
    text(l, '不', 77, 10 - lift + bob, R.red[1])
  })
  return r
}

// ---------------------------------------------------------------------------------------------
// 結婚式の出費: a three-tier wedding cake with a couple on top, candles, ring eyes and bills spilling out.

function wedding(i: number, t: number) {
  const r = new Raster(S, S)
  const sq = [0, 1, 2, 1, 0, -1][i]
  const tier = (x: number, y: number, w: number, h: number, wob: number) =>
    part(r, (l) => {
      l.rect(x + wob, y, w, h, R.paper[1])
      l.ellipse(x + wob + w / 2, y, w / 2, 4, R.paper[0])
      l.ellipse(x + wob + w / 2, y + h, w / 2, 4, R.paper[1])
      shadeEdges(l, R.paper, 3, true)
      for (let k = 0; k < w; k += 6) l.ellipse(x + wob + k + 3, y + 3, 3, 2, R.pink[1])
      l.rect(x + wob, y + h - 5, w, 3, R.yellow[1])
      l.rect(x + wob, y + h - 5, w, 1, R.yellow[0])
    })
  tier(20, 86 + sq, 88, 30 - sq, 0)
  tier(32, 62 + sq, 64, 24, Math.round(Math.sin(t) * 2))
  tier(44, 42 + sq, 40, 20, Math.round(Math.sin(t + 1) * 2))
  // Ring eyes with a glint and pink-piping brows; the mouth is a cut slice spilling bills.
  part(r, (l) => {
    const wob = Math.round(Math.sin(t) * 2)
    for (const x of [50 + wob, 72 + wob]) {
      l.ellipse(x, 72 + sq, 5, 4.5, R.yellow[1])
      l.ellipse(x, 72 + sq, 3, 2.5, R.paper[1])
      l.rect(x - 1, 66 + sq, 3, 2, C.white)
    }
    l.line(44 + wob, 64 + sq, 54 + wob, 67 + sq, R.pink[2])
    l.line(78 + wob, 64 + sq, 68 + wob, 67 + sq, R.pink[2])
    l.poly([52, 98 + sq, 76, 98 + sq, 70, 108 + sq, 58, 108 + sq], R.red[3])
    l.poly([54, 98 + sq, 74, 98 + sq, 70, 101 + sq, 58, 101 + sq], R.pink[1])
  })
  for (let k = 0; k < 3; k++) {
    const p = (i + k * 2) % 6
    part(r, (l) => {
      const x = 64 + (k - 1) * 10 + p * (k - 1) * 3
      const y = 104 - p * 6 + sq
      l.poly([x, y, x + 9, y - 2, x + 10, y + 3, x + 1, y + 5], R.yellow[0])
      l.rect(x + 3, y, 3, 2, R.yellow[2])
    })
  }
  // Candles with flickering flames, and the bride-and-groom topper.
  for (const x of [38, 88])
    part(r, (l) => {
      const y = x < 60 ? 78 : 78
      l.rect(x, y - 10 + sq, 3, 10, R.paper[0])
      l.ellipse(x + 1.5, y - 13 + sq - (i % 2), 1.6, 2.6, R.yellow[1])
      l.set(x + 1, y - 14 + sq - (i % 2), R.yellow[0])
    })
  part(r, (l) => {
    const y = 38 + sq
    l.poly([54, y, 60, y - 12, 64, y], C.white)
    l.ellipse(59, y - 14, 2.5, 2.5, R.skin[1])
    l.rect(57, y - 17, 5, 2, R.paper[1])
    l.rect(66, y - 11, 6, 11, R.hair[2])
    l.rect(68, y - 11, 2, 4, C.white)
    l.ellipse(69, y - 14, 2.5, 2.5, R.skin[1])
    l.rect(67, y - 17, 5, 2, R.hair[2])
  })
  return r
}

// ---------------------------------------------------------------------------------------------
// 住宅ローン: a house monster — door mouth, glowing window eyes, chains and a padlock, a 35年 sign,
// stubby foundation legs and chimney smoke.

function mortgage(i: number, t: number) {
  const r = new Raster(S, S)
  const hop = [0, 3, 6, 3, 0, -1][i]
  const y = -hop
  for (const [x, k] of [
    [42, 0],
    [86, 1]
  ] as const)
    part(r, (l) => {
      const lift = Math.max(0, k ? hop - 2 : hop)
      box(l, x - 9, 106 - lift, 18, 14, 3, R.metal)
    })
  // Chimney smoke rising.
  part(r, (l) => {
    for (let k = 0; k < 3; k++) {
      const p = (i + k * 2) % 6
      l.ellipse(88 + k * 2 + p, 18 - p * 3 + y, 3 + p * 0.5, 2.5 + p * 0.3, R.paper[2])
    }
  })
  part(r, (l) => {
    box(l, 82, 26 + y, 9, 18, 3, R.brick)
  })
  // Walls and roof.
  part(r, (l) => {
    box(l, 26, 56 + y, 72, 50, 8, [R.paper[0], R.paper[1], R.paper[2], R.paper[3], R.paper[4]])
    l.poly([18, 58 + y, 62, 20 + y, 112, 58 + y], R.red[1])
    l.poly([62, 20 + y, 112, 58 + y, 104, 58 + y, 62, 26 + y], R.red[2])
    for (let k = 0; k < 4; k++) l.line(26 + k * 6, 51 - k * 5 + y, 98 - k * 6, 51 - k * 5 + y, R.red[2])
    l.rect(18, 57 + y, 94, 2, R.red[3])
  })
  // Window eyes glowing with angry upper frames; the door is a mouth.
  part(r, (l) => {
    for (const x of [34, 74]) {
      l.rect(x, 66 + y, 16, 14, R.brown[2])
      l.rect(x + 2, 68 + y, 12, 10, R.yellow[1])
      l.rect(x + 2, 68 + y, 12, 3, R.yellow[0])
      l.rect(x + 7, 68 + y, 2, 10, R.brown[2])
    }
    l.poly([32, 62 + y, 50, 66 + y, 50, 64 + y, 32, 60 + y], R.brown[3])
    l.poly([90, 62 + y, 72, 66 + y, 72, 64 + y, 90, 60 + y], R.brown[3])
    const open = [4, 6, 8, 6, 4, 3][i]
    l.rect(52, 84 + y, 20, 22, R.brown[1])
    l.rect(54, 86 + y, 16, open + 6, C.inkCool)
    for (let x = 55; x < 69; x += 3) l.poly([x, 86 + y, x + 2, 86 + y, x + 1, 89 + y], C.white)
  })
  // Chains across the front with a big padlock (the お金 colour).
  part(r, (l) => {
    for (let s = 0; s <= 1; s += 0.06) {
      l.ellipse(28 + s * 68, 60 + s * 40 + y, 2, 1.4, R.metal[1])
      l.ellipse(96 - s * 68, 60 + s * 40 + y, 2, 1.4, R.metal[1])
    }
    l.ellipse(62, 76 + y, 5, 6, R.metal[2])
    l.ellipse(62, 76 + y, 3, 4, 0)
    l.rect(55, 79 + y, 14, 11, R.yellow[1])
    l.rect(55, 79 + y, 14, 2, R.yellow[0])
    l.rect(61, 83 + y, 2, 4, R.yellow[3])
  })
  // The 35年 sign on a post.
  part(r, (l) => {
    l.rect(108, 70 + y, 2, 30, R.brown[2])
    l.rect(96, 60 + y, 28, 12, R.paper[0])
    text(l, '35年', 98, 63 + y, R.red[1])
  })
  return r
}

// ---------------------------------------------------------------------------------------------
// 反抗期: a giant sulky teen in an orange hoodie, hood up, headphones, arms crossed, a dark うざい aura.

function rebel(i: number, t: number) {
  const r = new Raster(S, S)
  const step = [0, 2, 4, 2, 0, -1][i]
  const HOOD = R.orange
  // An angry scribble cloud, 💢 vein marks and a big うざい.
  part(
    r,
    (l) => {
      for (let k = 0; k < 40; k++) {
        const a = k * 0.55 + t
        const rad = 6 + (k % 5)
        l.set(24 + Math.cos(a) * rad * 1.6 + (k % 7), 48 + Math.sin(a) * rad, R.purple[2])
      }
    },
    false
  )
  part(
    r,
    (l) => {
      const vein = (vx: number, vy: number) => {
        for (const [dx, dy] of [
          [-1, -1],
          [1, -1],
          [-1, 1],
          [1, 1]
        ]) {
          l.line(vx + dx * 2, vy + dy * 4, vx + dx * 4, vy + dy * 2, R.red[1])
          l.line(vx + dx * 2, vy + dy * 5, vx + dx * 5, vy + dy * 2, R.red[1])
        }
      }
      vein(96, 20 + (i % 2))
      vein(30, 26 - (i % 2))
    },
    false
  )
  part(r, (l) => {
    const big = (ch: string) =>
      GLYPH[ch].flatMap((row) => [[...row].map((c) => c + c).join(''), [...row].map((c) => c + c).join('')])
    let x = 4
    for (const ch of 'うざい') {
      l.stamp(big(ch), x, 2 + Math.round(Math.sin(t) * 2), { K: R.purple[0] })
      x += 16
    }
  })
  // Legs stomping (jeans, sneakers).
  for (const [x, k] of [
    [50, 0],
    [78, 1]
  ] as const)
    part(r, (l) => {
      const lift = k ? Math.max(0, step - 1) : Math.max(0, 3 - step)
      l.thick(x, 92, x, 112 - lift, 12, R.navy[1])
      shadeEdges(l, R.navy, 2, true)
      l.rect(x - 7, 112 - lift, 15, 7, R.paper[1])
      l.rect(x - 7, 117 - lift, 15, 2, R.paper[2])
    })
  // Hoodie body.
  part(r, (l) => {
    l.ellipse(64, 74, 30, 24, HOOD[1])
    l.rect(36, 74, 56, 22, HOOD[1])
    shadeEdges(l, HOOD, 3, true)
    l.rect(52, 86, 24, 8, HOOD[2])
    l.line(58, 52, 58, 64, R.paper[1])
    l.line(70, 52, 70, 64, R.paper[1])
  })
  // Hood with the face in its shadow: sulky half-lidded eyes looking aside, a pout.
  part(r, (l) => {
    l.ellipse(64, 38, 26, 24, HOOD[1])
    shadeEdges(l, HOOD, 2, true)
    l.ellipse(66, 42, 18, 17, HOOD[3])
    l.ellipse(67, 44, 16, 15, R.skin[1])
    l.rect(52, 30, 30, 4, R.skin[2])
    l.stamp(['33333...33333', 'KKKK.....KKK.', '.wKK......wK.', '..KK......KK.'], 58, 40, { ...KEY, '3': R.skin[2] })
    l.stamp(['..KKKK.', '.K....K'], 63, 52)
    l.set(70, 49, R.skin[2])
  })
  // Headphones over the hood.
  part(r, (l) => {
    for (let a = Math.PI * 1.05; a < Math.PI * 1.95; a += 0.02)
      l.rect(64 + Math.cos(a) * 25, 36 + Math.sin(a) * 24, 2, 2, R.hair[2])
    l.ellipse(39, 40, 4, 7, R.hair[2])
    l.ellipse(89, 40, 4, 7, R.hair[2])
    l.rect(37, 38, 2, 4, R.red[1])
  })
  // Arms crossed over the chest.
  part(r, (l) => {
    l.thick(40, 66, 84, 74, 11, HOOD[1])
    shadeEdges(l, HOOD, 2, true)
  })
  part(r, (l) => {
    l.thick(88, 66, 46, 76, 11, HOOD[1])
    shadeEdges(l, HOOD, 2, true)
    l.line(48, 72, 82, 66, HOOD[2])
  })
  return r
}

// ---------------------------------------------------------------------------------------------
// リストラ: a gaunt executive with giant scissors, a red chart arrow crashing behind, pink slips flying.

const EXEC_HEAD: HeadSpec = {
  w: 20,
  h: 23,
  hairAt: [-1, -1],
  hair: [
    '...jjjjjjjjjjjj.......',
    '.jjHaHHHaHHHaHHjj.....',
    'jHHHHaHHHaHHHaHHHj....',
    'jHHHHHaHHHaHHHaHHHj...',
    'jHHHHHHHHHHHHHHHHHHj..',
    'jHHJJ.............Jj..',
    'jHJ..................',
    'jj....................'
  ],
  key: DARK_HAIR,
  eyes: 'elder',
  near: [6, 10],
  far: [14, 10],
  mouth: [10, 18],
  nose: [12, 14],
  ear: [0, 10],
  extra: (l, x, y) => {
    // Glinting glasses over shadowed eyes, a thin cold smile.
    l.stamp(['ssssss..sssss'], x + 4, y + 8, { s: R.skin[3] })
    l.stamp(['gggggg.ggggg', 'g....ggg...g', 'gggggg.ggggg'], x + 4, y + 9, { g: R.metal[0] })
    l.set(x + 5, y + 10, C.white)
    l.set(x + 6, y + 10, C.white)
    l.set(x + 13, y + 10, C.white)
    l.stamp(['m.....m', '.mmmmm.'], x + 7, y + 17, { m: R.skin[3] })
    // Hollow cheeks and a hard jaw.
    for (const [dx, dy] of [
      [3, 14],
      [4, 15],
      [16, 14],
      [16, 15],
      [9, 20],
      [10, 20],
      [11, 20]
    ])
      l.paint(x + dx, y + dy, R.skin[2])
  }
}

function layoff(i: number, t: number) {
  const r = new Raster(S, S)
  const snip = [0, 3, 6, 3, 0, 1][i]
  const BLACK: Ramp = [R.hair[1], R.hair[2], R.hair[3], R.hair[3], R.hair[4]]
  // The falling chart arrow behind.
  part(r, (l) => {
    const pts = [8, 20, 30, 34, 44, 26, 62, 52, 78, 46, 96, 82]
    for (let k = 0; k + 2 < pts.length; k += 2) l.thick(pts[k], pts[k + 1], pts[k + 2], pts[k + 3], 5, R.red[1])
    l.poly([88, 86, 104, 72, 106, 92], R.red[1])
    shadeEdges(l, R.red, 1, true)
  })
  // Long thin legs walking.
  for (const [x, k] of [
    [56, 0],
    [72, Math.PI]
  ] as const)
    part(r, (l) => {
      const dx = Math.round(Math.sin(t + k) * 5)
      const lift = Math.max(0, Math.round(-Math.cos(t + k) * 3))
      l.thick(x, 84, x + dx, 116 - lift, 6, BLACK[1])
      shadeEdges(l, BLACK, 1)
      l.rect(x + dx - 3, 116 - lift, 9, 4, BLACK[2])
      l.rect(x + dx - 2, 116 - lift, 4, 1, BLACK[0])
      if (k) l.map((c) => DARKER[c])
    })
  // Gaunt suit body with a blue tie.
  part(r, (l) => {
    l.poly([50, 40, 78, 40, 82, 50, 80, 88, 48, 88, 46, 50], BLACK[1])
    shadeEdges(l, BLACK, 2, true)
    l.poly([58, 40, 70, 40, 64, 56], R.paper[1])
    l.rect(63, 42, 3, 18, R.navy[0])
    l.rect(64, 42, 1, 18, R.navy[1])
  })
  drawHead(r, EXEC_HEAD, 54, 18, 'angry')
  // Giant scissors snipping: blue ring handles, long blades.
  part(r, (l) => {
    const pivot = { x: 84, y: 68 }
    for (const s of [-1, 1]) {
      const a = (s * (4 + snip)) / 40
      const tip = { x: pivot.x + Math.cos(a) * 46, y: pivot.y + Math.sin(a) * 46 - 6 }
      l.thick(pivot.x, pivot.y, tip.x, tip.y, 4, R.metal[1])
      l.line(pivot.x, pivot.y - 1, tip.x, tip.y - 1, R.metal[0])
      const h = { x: pivot.x - Math.cos(a) * 10, y: pivot.y - Math.sin(a) * 10 + s * 4 }
      l.ellipse(h.x, h.y, 5, 4, R.navy[0])
      l.ellipse(h.x, h.y, 3, 2, 0)
    }
    l.rect(pivot.x - 1, pivot.y - 1, 3, 3, R.metal[2])
    // A cold glint travelling along the blade.
    const gx = pivot.x + 12 + (i % 3) * 10
    l.line(gx - 3, pivot.y - 3, gx + 3, pivot.y - 3, C.white)
    l.line(gx, pivot.y - 6, gx, pivot.y, C.white)
  })
  part(r, (l) => {
    l.thick(56, 46, 76, 64, 6, BLACK[1])
    l.ellipse(77, 66, 3, 3, R.skin[1])
  })
  // Pink slips flutter about.
  for (let k = 0; k < 3; k++)
    part(r, (l) => {
      const p = (i + k * 2) % 6
      const x = 14 + k * 34 + p * 2
      const y = 92 - p * 9 + k * 6
      // Red 解雇 notices.
      l.poly([x, y, x + 12, y - 2, x + 13, y + 6, x + 1, y + 8], R.red[1])
      l.stamp(['www.w.w', 'w.w.www', 'www.w.w'], x + 3, y + 2, { w: C.white })
    })
  return r
}

// ---------------------------------------------------------------------------------------------
// 大病: a giant mutated virus with IV tubes and syringes stuck in it, a surgical cap, many eyes, pulsing.

function bigIllness(i: number, t: number) {
  const r = new Raster(S, S)
  const p = Math.round(Math.sin(t) * 2)
  const cx = 64
  const cy = 68
  const rr = 36 + p
  const SICK: Ramp = [R.green[1], R.green[2], R.green[3], R.hair[3], R.green[4]]
  // IV tubes coming down from above into the body.
  part(
    r,
    (l) => {
      l.line(30, 0, 40, cy - 30, R.paper[2])
      l.line(98, 0, 90, cy - 32, R.paper[2])
    },
    false
  )
  part(r, (l) => {
    for (let k = 0; k < 12; k++) {
      const a = (k / 12) * Math.PI * 2 + 0.2
      const sx = cx + Math.cos(a) * (rr + 8)
      const sy = cy + Math.sin(a) * (rr + 8)
      l.thick(cx + Math.cos(a) * (rr - 2), cy + Math.sin(a) * (rr - 2), sx, sy, 3, SICK[1])
      ball(l, sx, sy, 4, 4, SICK, false)
    }
  })
  part(r, (l) => {
    ball(l, cx, cy, rr, rr - 2, SICK)
    for (const [x, y, s] of [
      [-18, 10, 5],
      [14, 18, 6],
      [20, -8, 4],
      [-8, 24, 3]
    ])
      l.ellipse(cx + x, cy + y, s, s * 0.8, R.purple[2])
    // Several bloodshot eyes of different sizes.
    for (const [x, y, s, lid] of [
      [-12, -6, 6, 0],
      [10, -10, 5, 1],
      [2, 8, 4, 0],
      [-22, 6, 3, 1]
    ]) {
      l.ellipse(cx + x, cy + y, s, s, C.white)
      l.ellipse(cx + x + 1, cy + y + 1, s * 0.45, s * 0.45, R.red[2])
      l.set(cx + x + 1, cy + y + 1, C.inkCool)
      if (lid || i === 3) l.rect(cx + x - s, cy + y - s, s * 2 + 1, Math.ceil(s * 0.8), SICK[2])
      l.paint(cx + x - s + 1, cy + y, R.red[1])
    }
    l.stamp(['KKKKKKKKK', 'KwKwKwKwK', '.KKKKKKK.'], cx - 4, cy + 18)
  })
  // Surgical cap.
  part(r, (l) => {
    l.ellipse(cx, cy - rr + 2, 22, 9, R.mint[1])
    l.rect(cx - 22, cy - rr + 2, 44, 5, R.mint[1])
    shadeEdges(l, R.mint, 1, true)
    for (let x = cx - 16; x < cx + 18; x += 6) l.line(x, cy - rr - 4, x + 2, cy - rr + 5, R.mint[2])
  })
  // Syringes stuck in at angles, and drips.
  for (const [x, y, dx, dy] of [
    [cx + 28, cy - 18, 18, -12],
    [cx - 30, cy + 10, -20, 6]
  ])
    part(r, (l) => {
      l.line(x, y, x + dx * 0.3, y + dy * 0.3, R.metal[0])
      l.thick(x + dx * 0.3, y + dy * 0.3, x + dx, y + dy, 5, R.paper[0])
      l.thick(x + dx * 0.4, y + dy * 0.4, x + dx * 0.8, y + dy * 0.8, 3, R.mint[0])
      l.thick(x + dx, y + dy, x + dx * 1.25, y + dy * 1.25, 2, R.metal[1])
    })
  part(r, (l) => {
    const d = (i * 3) % 12
    l.rect(cx - 10, cy + rr + d - 4, 2, 3, R.mint[0])
    l.rect(cx + 16, cy + rr + ((d + 6) % 12) - 6, 2, 3, R.mint[0])
  })
  return r
}

export const bossSheets: Record<string, () => Sheet> = {
  reaper: () => ({
    ...six(reaper, 5),
    // A slow bow: the hood, skull and arm lower toward the soul; the robe below stays.
    bow: {
      frames: [0, 2, 4, 6, 7, 7, 7].map((b, i) => {
        const r = reaper(i % 6, 0)
        const out = new Raster(S, S)
        out.blit(r)
        for (let y = 0; y < 56; y++) for (let x = 0; x < S; x++) out.set(x, y, 0)
        const top = new Raster(S, S)
        for (let y = 0; y < 56; y++) for (let x = 0; x < S; x++) top.set(x, y, r.get(x, y))
        return out.blit(top, Math.round(b / 2), b)
      }),
      fps: 6,
      loop: false
    }
  }),
  'enemy:b_univ': () => six(univ),
  'enemy:b_shukatsu': () => six(shukatsu),
  'enemy:b_wedding': () => six(wedding, 6),
  'enemy:b_mortgage': () => six(mortgage, 6),
  'enemy:b_rebel': () => six(rebel),
  'enemy:b_layoff': () => six(layoff),
  'enemy:b_illness': () => six(bigIllness, 6)
}
