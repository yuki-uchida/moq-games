/**
 * Friendly NPC monsters (front-facing, 64×64, feet on (32, 56)): 長老スライム / ネズミの鍛冶屋 / カラスの占い師 /
 * 老狼の吟遊詩人. Each draws an `idle` (breathing, blink) and a `talk` (mouth moves, a small gesture) loop.
 */
import { NPC_SPEC } from '../contract'
import { C, R } from '../palette'
import { Raster, ball, despeckle, part, shadeEdges, type Ramp } from '../raster'
import { anim, type Anim, type Sheet } from '../sheet'
import { bar } from './rig'

interface Beat {
  /** Vertical breathing offset (px, + = down). */
  bob: number
  blink: boolean
  /** 0 closed .. 2 wide. */
  mouth: number
  /** Gesture lift (px) of the prop/hand. */
  gest: number
  /** Cloth/beard/tail sway in px. */
  sway: number
  /** 0..1 pulse of glows. */
  pulse: number
}

const idleBeats = (): Beat[] =>
  [0, 1, 2, 3].map((i) => ({
    bob: [0, 0, 1, 1][i],
    blink: i === 3,
    mouth: 0,
    gest: 0,
    sway: [0, 1, 0, -1][i],
    pulse: [0, 0.5, 1, 0.5][i]
  }))
const talkBeats = (): Beat[] =>
  [0, 1, 2, 3].map((i) => ({
    bob: [0, 1, 0, 1][i],
    blink: false,
    mouth: [0, 2, 1, 2][i],
    gest: [0, 2, 3, 1][i],
    sway: [0, 1, 0, -1][i],
    pulse: [0.3, 0.8, 1, 0.6][i]
  }))

const clipBelow = (l: Raster, y: number) => {
  for (let yy = y; yy < l.h; yy++) for (let x = 0; x < l.w; x++) l.set(x, yy, 0)
}

// ---------------------------------------------------------------------------------------------------------
// 長老スライム（賢者）

function elder(b: Beat): Raster {
  const out = new Raster(64, 64)
  const sq = b.bob // breathing squash: body 1px lower / wider
  // Gnarled staff with a leaf, held by a jelly nub.
  part(out, (l) => {
    const x = 49 - (b.gest > 1 ? 1 : 0)
    const top = 14 - b.gest
    bar(l, [x, 57], [x + 1, top + 4], 3, R.wood[1])
    bar(l, [x + 1, top + 4], [x - 1, top], 2, R.wood[1])
    shadeEdges(l, R.wood, 1, true)
    for (const [dy, dx] of [
      [-18, 2],
      [-9, -2],
      [-3, 2]
    ] as const)
      l.set(x + dx, 56 + dy, R.wood[3])
    l.rect(x - 4, top - 2, 3, 2, R.clothForest[1])
    l.rect(x - 5, top - 3, 2, 1, R.clothForest[0])
    l.rect(x + 1, top - 3, 3, 2, R.clothForest[2])
    l.set(x - 2, top - 2, R.clothForest[0])
  })
  // Body: a tall gumdrop of pale-teal jelly with a flat base.
  part(out, (l) => {
    ball(l, 32, 40 + sq * 0.5, 16 + (sq ? 0.8 : 0), 18 - (sq ? 0.8 : 0), R.water)
    clipBelow(l, 56)
    // glossy highlight
    l.rect(22, 29, 3, 5, R.water[0])
    l.set(23, 28, R.water[0])
    l.set(22, 35, R.water[0])
  })
  // Jelly nub gripping the staff.
  part(out, (l) => {
    ball(l, 45, 47 - (b.gest > 1 ? 2 : 0), 4.5, 4, R.water, false)
  })
  // Sage hood.
  part(out, (l) => {
    const hood = R.leather
    for (let y = 20; y < 38; y++)
      for (let x = 15; x < 49; x++) {
        const dx = x + 0.5 - 32
        const dy = y + 0.5 - 32
        const outer = (dx / 15.8) ** 2 + (dy / 13) ** 2 <= 1 && y < 36
        const face = (dx / 10.4) ** 2 + ((y + 0.5 - 36.5) / 8) ** 2 <= 1
        if (outer && !face) l.set(x, y, hood[1])
      }
    // drooping tip at the back
    l.poly([20, 22, 14, 28, 12, 36, 17, 33], hood[1])
    shadeEdges(l, hood, 1, true)
    // stitched seam
    for (let y = 22; y < 28; y += 2) l.paint(32, y, hood[2])
  })
  // Face: spectacles and bushy white brows.
  part(
    out,
    (l) => {
      for (const ex of [27, 37]) {
        l.ellipse(ex, 37, 3.6, 3.6, R.gold[1])
        l.ellipse(ex, 37, 2.6, 2.6, R.paper[0])
        if (b.blink) l.rect(ex - 2, 37, 4, 1, C.black)
        else {
          l.rect(ex - 1, 36, 2, 2, C.black)
          l.set(ex, 36, R.paper[0])
        }
        l.set(ex - 3, 35, R.gold[0])
      }
      l.rect(31, 37, 2, 1, R.gold[2])
      // brows
      for (const ex of [27, 37]) {
        l.rect(ex - 3, 32, 6, 2, R.paper[1])
        l.set(ex - 3, 33, R.paper[2])
      }
    },
    false
  )
  // Long white jelly beard.
  part(out, (l) => {
    // moustache
    l.ellipse(29, 41, 3.6, 2, R.paper[1])
    l.ellipse(35, 41, 3.6, 2, R.paper[1])
    for (let y = 41; y < 55; y++) {
      const t = (y - 41) / 14
      const hw = Math.max(1, 8 * (1 - t) ** 0.7 + 1)
      const c = 32 + Math.round(b.sway * t * 1.5)
      for (let x = Math.round(c - hw); x < Math.round(c + hw); x++) l.set(x, y, R.paper[1])
    }
    shadeEdges(l, R.paper, 1, true)
    for (let y = 45; y < 53; y += 3) l.paint(32 + Math.round(b.sway * ((y - 41) / 14) * 1.5), y, R.paper[2])
    if (b.mouth) l.ellipse(32, 42, 2 + (b.mouth > 1 ? 1 : 0), 0.7 + b.mouth * 0.5, R.clothCrimson[3])
  })
  return out
}

// ---------------------------------------------------------------------------------------------------------
// ネズミの鍛冶屋

function smith(b: Beat): Raster {
  const out = new Raster(64, 64)
  const fur = R.ratFur
  const bob = b.bob
  // Tail curling behind.
  part(out, (l) => {
    bar(l, [40, 53], [48, 54], 2, R.ratPink[1])
    bar(l, [48, 54], [52 + b.sway, 48], 2, R.ratPink[1])
    bar(l, [52 + b.sway, 48], [51 + b.sway, 41], 2, R.ratPink[2])
  })
  // Hammer arm (right side of the screen) raised with the hammer.
  const hy = 40 - b.gest + bob
  part(out, (l) => {
    bar(l, [46, hy + 6], [46, hy - 8], 2, R.wood[1])
    l.rect(42, hy - 14, 9, 6, R.steel[1])
    l.rect(42, hy - 14, 9, 1, R.steel[0])
    l.rect(42, hy - 9, 9, 1, R.steel[2])
    l.rect(50, hy - 13, 2, 4, R.steel[2])
    l.set(43, hy - 13, R.steel[0])
  })
  // Legs and feet.
  part(out, (l) => {
    for (const x of [27, 36]) {
      l.rect(x, 52, 4, 4, fur[2])
      l.rect(x - 1, 55, 6, 2, R.ratPink[1])
    }
  })
  // Body with a leather apron.
  part(out, (l) => {
    ball(l, 32, 45 + bob, 11, 10.5, fur, false)
  })
  part(out, (l) => {
    for (let y = 38 + bob; y < 54 + bob; y++) {
      const hw = 6 + (y - 38 - bob) * 0.15
      for (let x = Math.round(32 - hw); x < Math.round(32 + hw); x++) l.set(x, y, R.leather[1])
    }
    shadeEdges(l, R.leather, 1, true)
    l.rect(28, 46 + bob, 8, 4, R.leather[2])
    l.rect(28, 46 + bob, 8, 1, R.leather[3])
    // straps
    l.rect(27, 37 + bob, 2, 3, R.leather[2])
    l.rect(35, 37 + bob, 2, 3, R.leather[2])
  })
  // Left arm hanging, right arm gripping the hammer.
  part(out, (l) => {
    ball(l, 22, 46 + bob, 3.5, 6, fur, false)
    l.ellipse(22, 51 + bob, 2.4, 2, R.ratPink[1])
  })
  part(out, (l) => {
    ball(l, 43, 44 - b.gest * 0.5 + bob, 3.5, 5, fur, false)
    l.ellipse(45, hy + 6, 2.6, 2.4, R.ratPink[1])
  })
  // Head: ears, goggles, snout.
  part(out, (l) => {
    ball(l, 24, 22 + bob, 6, 6, fur, false)
    ball(l, 40, 22 + bob, 6, 6, fur, false)
  })
  part(
    out,
    (l) => {
      l.ellipse(24.5, 22.5 + bob, 3.6, 3.8, R.ratPink[1])
      l.ellipse(39.5, 22.5 + bob, 3.6, 3.8, R.ratPink[1])
      l.set(23, 21 + bob, R.ratPink[0])
      l.set(38, 21 + bob, R.ratPink[0])
    },
    false
  )
  part(out, (l) => {
    ball(l, 32, 29 + bob, 10.5, 9, fur, false)
    // snout
    ball(l, 32, 34 + bob, 5, 3.8, fur, false)
  })
  part(
    out,
    (l) => {
      // goggles on the forehead
      l.rect(23, 21 + bob, 18, 2, R.leather[2])
      for (const x of [27, 37]) {
        l.ellipse(x, 22 + bob, 3, 2.6, R.steel[2])
        l.ellipse(x, 22 + bob, 2, 1.6, R.magic[1])
        l.set(x - 1, 21 + bob, R.magic[0])
      }
      // eyes
      for (const x of [28, 36]) {
        if (b.blink) l.rect(x - 1, 28 + bob, 3, 1, C.black)
        else {
          l.rect(x - 1, 27 + bob, 2, 3, C.black)
          l.set(x - 1, 27 + bob, C.white)
        }
      }
      // nose and whiskers
      l.ellipse(32, 34 + bob, 1.6, 1.2, R.ratPink[2])
      l.set(31, 33 + bob, R.ratPink[0])
      for (const dy of [0, 2]) {
        l.line(26, 35 + dy + bob, 22, 34 + dy * 2 + bob, fur[0])
        l.line(38, 35 + dy + bob, 42, 34 + dy * 2 + bob, fur[0])
      }
      // mouth + buck teeth
      if (b.mouth) l.rect(30, 37 + bob, 4, b.mouth, C.black)
      l.rect(31, 36 + bob + (b.mouth ? b.mouth : 0), 2, 2, R.paper[1])
      // soot smudge
      l.set(27, 31 + bob, fur[3])
      l.set(28, 32 + bob, fur[3])
    },
    false
  )
  return out
}

// ---------------------------------------------------------------------------------------------------------
// カラスの占い師

function seer(b: Beat): Raster {
  const out = new Raster(64, 64)
  const f = R.crowFeather
  const bob = b.bob
  // Legs.
  part(out, (l) => {
    for (const x of [28, 35]) {
      l.rect(x, 52, 2, 4, R.beak[2])
      l.rect(x - 2, 55, 6, 1, R.beak[1])
    }
  })
  // Tail feathers behind.
  part(out, (l) => {
    for (const k of [-4, 0, 4]) bar(l, [32 + k, 50], [32 + k * 2 + b.sway, 57], 3, f[2])
  })
  // Body.
  part(out, (l) => {
    ball(l, 32, 42 + bob, 11.5, 13, f, false)
    // sheen on the chest feathers
    for (let y = 40; y < 50; y += 3) for (let x = 27 + (y % 2) * 2; x < 38; x += 4) l.paint(x, y + bob, R.crowSheen[2])
  })
  // Wings: left drops, right gestures.
  part(out, (l) => {
    ball(l, 21, 45 + bob, 4.5, 9, f, false)
    l.rect(20, 51 + bob, 2, 3, f[3])
    l.set(19, 40 + bob, R.crowSheen[1])
    l.set(19, 42 + bob, R.crowSheen[2])
  })
  part(out, (l) => {
    ball(l, 43, 45 - b.gest + bob, 4.5, 9, f, false)
    l.rect(42, 51 - b.gest + bob, 2, 3, f[3])
    l.set(41, 40 - b.gest + bob, R.crowSheen[1])
  })
  // Purple shawl with gold fringe.
  part(out, (l) => {
    for (let y = 33 + bob; y < 47 + bob; y++) {
      const t = (y - 33 - bob) / 14
      const hw = 11.5 - t * 3
      for (let x = Math.round(32 - hw); x < Math.round(32 + hw); x++)
        if (!(t > 0.75 && Math.abs(x - 32) < 2 * (t - 0.7) * 6 - 1)) l.set(x, y, R.clothPurple[1])
    }
    shadeEdges(l, R.clothPurple, 1, true)
    // gold trim along the edge, and a clasp
    for (let y = 33 + bob; y < 47 + bob; y++) {
      const t = (y - 33 - bob) / 14
      const hw = 11.5 - t * 3
      l.paint(Math.round(32 - hw), y, R.gold[1])
      l.paint(Math.round(32 + hw) - 1, y, R.gold[2])
    }
    l.rect(31, 34 + bob, 2, 2, R.gold[1])
    l.set(31, 34 + bob, R.gold[0])
  })
  // Crystal ball.
  part(out, (l) => {
    l.ellipse(32, 52, 5, 1.6, R.gold[2])
    ball(l, 32, 46 + bob, 6.2, 6.2, R.magic)
    const g = b.pulse
    // inner glow swirl
    l.set(31 + Math.round(g * 2), 46 + bob, R.magic[0])
    l.set(33, 44 + bob - Math.round(g), R.magic[0])
    l.set(30, 48 + bob, R.crowSheen[1])
    l.set(34, 48 + bob, R.crowSheen[1])
  })
  // Head: crest, beak, ringed eye.
  part(out, (l) => {
    ball(l, 32, 25 + bob, 9, 8.5, f, false)
    for (const [x, y] of [
      [28, 16],
      [32, 14],
      [36, 16]
    ])
      l.poly([x - 2, y + 4, x + 2, y + 4, x + (x < 32 ? -1 : x > 32 ? 2 : 0), y - 1 + bob], f[1])
    shadeEdges(l, f, 1, true)
    l.paint(28, 19 + bob, R.crowSheen[1])
    l.paint(29, 18 + bob, R.crowSheen[1])
  })
  part(out, (l) => {
    // beak (upper + lower) opening toward the front-down
    const o = b.mouth
    l.poly([27, 26 + bob, 37, 26 + bob, 32, 35 + bob], R.beak[1])
    l.poly([28, 31 + bob + o, 36, 31 + bob + o, 32, 34 + bob + o + (o ? 1 : 0)], R.beak[2])
    if (o) l.rect(30, 31 + bob, 4, o, C.black)
    l.set(29, 28 + bob, R.beak[0])
    l.set(30, 27 + bob, R.beak[0])
    l.set(31, 29 + bob, R.beak[3])
    l.set(33, 29 + bob, R.beak[3])
  })
  part(
    out,
    (l) => {
      for (const x of [26, 38]) {
        if (b.blink) l.rect(x - 2, 24 + bob, 5, 1, C.black)
        else {
          l.ellipse(x, 24 + bob, 3, 3, R.beak[0])
          l.rect(x - 1, 23 + bob, 2, 2, C.black)
          l.set(x - 1, 23 + bob, C.white)
        }
      }
    },
    false
  )
  return out
}

// ---------------------------------------------------------------------------------------------------------
// 老狼の吟遊詩人

function bard(b: Beat): Raster {
  const out = new Raster(64, 64)
  const fur = R.wolfFur
  const bob = b.bob
  // Tail.
  part(out, (l) => {
    bar(l, [41, 53], [48, 52], 4, fur[1])
    bar(l, [48, 52], [51 + b.sway, 46], 3, fur[1])
    l.set(52 + b.sway, 45, R.wolfCream[1])
    l.set(51 + b.sway, 46, R.wolfCream[1])
    shadeEdges(l, fur, 1, true)
  })
  // Legs.
  part(out, (l) => {
    for (const x of [26, 35]) {
      l.rect(x, 51, 4, 5, fur[2])
      l.rect(x - 1, 55, 6, 2, fur[1])
    }
  })
  // Body and green cloak.
  part(out, (l) => {
    ball(l, 32, 44 + bob, 11, 11.5, fur, false)
  })
  part(out, (l) => {
    for (let y = 33 + bob; y < 54; y++) {
      const t = (y - 33 - bob) / 21
      const hw = 12 + t * 3
      const c = 32 + b.sway * t
      for (let x = Math.round(c - hw); x < Math.round(c + hw); x++) {
        const open = Math.abs(x - c) < 3.2 - t * 1.2 && y > 36
        if (!open) l.set(x, y, R.clothForest[1])
      }
      if (y > 51 && y % 2) l.paint(Math.round(c - hw) + 1, y, 0)
    }
    shadeEdges(l, R.clothForest, 2, true)
    l.rect(30, 34 + bob, 4, 2, R.gold[1])
    l.set(30, 34 + bob, R.gold[0])
  })
  // Lute across the body, neck rising to the right.
  const lift = b.gest
  part(out, (l) => {
    bar(l, [39, 44 + bob - lift], [52, 29 + bob - lift], 2, R.wood[2])
    l.rect(51, 25 + bob - lift, 4, 5, R.wood[1])
    l.set(51, 25 + bob - lift, R.wood[0])
    l.set(54, 26 + bob - lift, R.gold[1])
    ball(l, 38, 48 + bob - lift * 0.5, 7, 8, R.wood)
    l.ellipse(37, 48 + bob - lift * 0.5, 2.2, 2.2, R.wood[3])
    l.line(36, 53, 40, 44, R.wood[3])
  })
  // Arms: one holds the neck, one strums.
  part(out, (l) => {
    ball(l, 46, 38 + bob - lift, 3.2, 5, fur, false)
    l.ellipse(48, 33 + bob - lift, 2.6, 2.4, fur[0])
  })
  part(out, (l) => {
    ball(l, 28, 47 + bob, 3.5, 5.5, fur, false)
    l.ellipse(33 + (b.sway > 0 ? 1 : 0), 49 + bob - lift * 0.5, 2.6, 2.4, fur[0])
  })
  // Head.
  part(out, (l) => {
    // ears
    l.poly([21, 25 + bob, 22, 12 + bob, 30, 19 + bob], fur[1])
    l.poly([43, 25 + bob, 42, 12 + bob, 34, 19 + bob], fur[1])
    shadeEdges(l, fur, 1, true)
  })
  part(
    out,
    (l) => {
      l.poly([24, 22 + bob, 24, 15 + bob, 28, 20 + bob], R.ratPink[2])
      l.poly([40, 22 + bob, 40, 15 + bob, 36, 20 + bob], R.ratPink[2])
    },
    false
  )
  part(out, (l) => {
    ball(l, 32, 27 + bob, 10.5, 9, fur, false)
    // muzzle
    ball(l, 32, 32 + bob, 6, 4.6, R.wolfCream, false)
    // cream cheek tufts
    l.poly([22, 29 + bob, 26, 33 + bob, 23, 35 + bob], R.wolfCream[1])
    l.poly([42, 29 + bob, 38, 33 + bob, 41, 35 + bob], R.wolfCream[1])
  })
  part(
    out,
    (l) => {
      // eyes (amber) and bushy grey brows
      for (const x of [27, 37]) {
        if (b.blink) l.rect(x - 1, 27 + bob, 3, 1, C.black)
        else {
          l.rect(x - 1, 26 + bob, 2, 3, R.beak[2])
          l.rect(x - 1, 27 + bob, 2, 1, C.black)
          l.set(x - 1, 26 + bob, R.beak[0])
        }
        l.rect(x - 2, 24 + bob, 5, 2, R.paper[2])
      }
      // nose, mouth
      l.rect(30, 30 + bob, 4, 2, C.black)
      l.set(30, 30 + bob, R.paper[2])
      if (b.mouth) l.rect(30, 34 + bob, 4, b.mouth, R.clothCrimson[3])
      else l.rect(31, 34 + bob, 2, 1, fur[3])
    },
    false
  )
  // Old-wolf chin beard tuft.
  part(out, (l) => {
    l.poly(
      [28, 36 + bob + b.mouth, 36, 36 + bob + b.mouth, 32 + Math.round(b.sway * 0.5), 42 + bob + b.mouth],
      R.wolfCream[1]
    )
    shadeEdges(l, R.wolfCream, 1, true)
  })
  return out
}

const DRAW: Record<string, (b: Beat) => Raster> = { elder, smith, seer, bard }

export function buildNpcSheet(kind: string): Sheet {
  const draw = DRAW[kind]
  const sheet: Sheet = {}
  for (const [name, want] of Object.entries(NPC_SPEC)) {
    const beats = name === 'talk' ? talkBeats() : idleBeats()
    const frames = beats.slice(0, want.frames).map((b) => despeckle(draw(b)))
    const a: Anim = anim(frames, want.fps, want.loop)
    sheet[name] = a
  }
  return sheet
}

export type { Ramp }
