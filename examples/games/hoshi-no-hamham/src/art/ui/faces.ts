import { UI_SPEC } from '../contract'
import type { SheetModule } from '../module'
import { C, R, ramp, type Ramp } from '../palette'
import { Painter, Raster, ball, bar, shadeEdges } from '../raster'
import { lazyAnim, memo, type Anim } from '../sheet'

/**
 * `ui`: the twelve 32×32 character portraits (`face_*`) and the seven stage emblems (`theme_*`).
 *
 * Portraits are head-and-shoulders busts facing right, hand-drawn at 32×32 with the same ramps as the in-game
 * sprites. They are assembled with the `Painter` (every part is outlined on its own layer, so overlaps get inner
 * contours) and the bust is cut off flat at row 29 so a plum rim closes it at row 30. Emblems are small landscape
 * vignettes in one rounded-square frame.
 */

const make = (name: string, frame: () => Raster): Anim =>
  lazyAnim(() => [frame()], UI_SPEC[name].fps, UI_SPEC[name].loop)
const S = 32

/** Keeps only the rows above the cut (the bust is sliced flat at the bottom). */
function clipBottom(l: Raster, last = 29) {
  for (let y = last + 1; y < l.h; y++) for (let x = 0; x < l.w; x++) l.set(x, y, 0)
}

/** Paints a drawing only where `l` already has pixels (details that belong to a part). */
function overlay(l: Raster, draw: (t: Raster) => void) {
  const t = new Raster(l.w, l.h)
  draw(t)
  for (let y = 0; y < l.h; y++)
    for (let x = 0; x < l.w; x++) {
      const c = t.get(x, y)
      if (c && l.get(x, y)) l.set(x, y, c)
    }
}

/** Shaded ellipse painted onto what is already there (cheek patches, muzzles). */
const patch = (l: Raster, cx: number, cy: number, rx: number, ry: number, rp: Ramp, spec = false) =>
  overlay(l, (t) => ball(t, cx, cy, rx, ry, rp, spec))

const render = (p: Painter) => p.render()

// Shared eye shapes -------------------------------------------------------------------------------------------

const EYE_KEY = { '0': C.black, w: C.white, y: R.gold[1], Y: R.gold[2], g: C.glow }
const EYE_TALL = ['.00.', '0w00', '0000', '0000', '.00.']
const EYE_SPARKLE = ['.00w.', '0w000', '00000', '00000', '0w00.', '.00..']
const EYE_SMALL = ['00', '00', '00']
const eye = (l: Raster, rows: readonly string[], x: number, y: number) => l.stamp(rows, x, y, EYE_KEY)

// ------------------------------------------------------------------------------------------------- hamsters

interface Ham {
  fur: Ramp
  patchRamp: Ramp
  ear: Ramp
  /** Rows of eyes: left eye x, right eye x, top y. */
  eyes?: (l: Raster) => void
  /** Extra details on the face layer (brows, fangs, mouth). */
  face?: (l: Raster) => void
  /** Parts added by the character (hat, scarf, collar); depth is chosen by the callback. */
  extras: (p: Painter) => void
  bodyFur?: Ramp
  hideBody?: boolean
  noMouth?: boolean
}

function hamster(h: Ham): Raster {
  const p = new Painter(S, S)
  if (!h.hideBody)
    p.add(-3, (l) => {
      ball(l, 15.5, 33, 12.5, 8, h.bodyFur ?? h.fur)
      clipBottom(l)
    })
  // Ears sit wide apart behind the head.
  p.add(-2, (l) => {
    ball(l, 6.5, 7.5, 4, 4.2, h.fur)
    ball(l, 24.5, 7.5, 4, 4.2, h.fur)
    ball(l, 7, 8.2, 2.2, 2.6, h.ear, false)
    ball(l, 24, 8.2, 2.2, 2.6, h.ear, false)
  })
  p.add(0, (l) => {
    ball(l, 15.5, 16.5, 12.5, 10.5, h.fur)
    // Lighter lower-face patch and a chubby cheek, no snout.
    patch(l, 20, 22, 8.5, 5.3, h.patchRamp)
    patch(l, 11, 22, 4.2, 3.6, h.patchRamp)
  })
  p.add(
    1,
    (l) => {
      h.eyes?.(l)
      // tiny nose, an omega mouth directly under it, whiskers
      l.set(22, 18, R.hamEar[2])
      l.set(23, 18, R.hamEar[2])
      if (!h.noMouth) {
        l.set(21, 20, C.ink)
        l.set(22, 21, C.ink)
        l.set(23, 20, C.ink)
        l.set(24, 21, C.ink)
        l.set(25, 20, C.ink)
      }
      h.face?.(l)
    },
    false
  )
  h.extras(p)
  return render(p)
}

function whiskers(l: Raster, c: number) {
  l.line(27, 18, 30, 17, c)
  l.line(27, 21, 30, 22, c)
}

const hero = () =>
  hamster({
    fur: R.hamPink,
    patchRamp: R.hamCream,
    ear: R.hamEar,
    eyes: (l) => {
      eye(l, EYE_TALL, 13, 11)
      eye(l, EYE_TALL, 20, 11)
    },
    face: (l) => {
      whiskers(l, C.inkWarm)
      // cheerful, determined brows
      l.line(12, 9, 16, 8, C.ink)
      l.line(20, 8, 24, 9, C.ink)
      l.set(10, 20, C.blush)
      l.set(11, 20, C.blush)
    },
    extras: (p) => {
      p.add(2, (l) => {
        l.ellipse(15.5, 27.5, 12.2, 3, R.scarf[1])
        l.rect(4, 25, 3, 2, R.scarf[1])
        shadeEdges(l, R.scarf, 1, true)
        // knot at the back
        l.ellipse(5, 28, 2.5, 1.8, R.scarf[2])
        // gold star clasp
        l.stamp(['..y..', 'yyyyy', '.yyy.', 'yy.yy'], 19, 25, { y: R.gold[1] })
        l.set(21, 26, R.gold[0])
        clipBottom(l)
      })
    }
  })

const princess = () =>
  hamster({
    fur: R.princessWhite,
    patchRamp: R.princessWhite,
    ear: R.princessPink,
    eyes: (l) => {
      eye(l, EYE_SPARKLE, 12, 10)
      eye(l, EYE_SPARKLE, 19, 10)
    },
    face: (l) => {
      whiskers(l, R.princessWhite[3])
      l.set(10, 20, R.princessPink[1])
      l.set(11, 20, R.princessPink[1])
      l.set(9, 21, R.princessPink[1])
    },
    extras: (p) => {
      p.add(2, (l) => {
        // star tiara on a thin band
        l.rect(11, 6, 10, 2, R.gold[1])
        l.stamp(['..y..', '.yyy.', 'yyyyy', '.yyy.', '.y.y.'], 13, 2, { y: R.gold[1] })
        l.set(15, 4, R.gold[0])
        l.set(14, 6, R.gold[0])
        shadeEdges(l, R.gold, 1, false)
        l.set(15, 4, R.gold[0])
      })
      p.add(2, (l) => {
        // pink ribbon collar with a bow
        l.ellipse(15.5, 27.5, 11.5, 2.6, R.princessPink[1])
        shadeEdges(l, R.princessPink, 1, true)
        l.poly([13, 24, 18, 26, 13, 29], R.princessPink[1])
        l.poly([24, 24, 19, 26, 24, 29], R.princessPink[2])
        l.rect(18, 25, 2, 2, R.princessPink[0])
        clipBottom(l)
      })
    }
  })

const mom = () =>
  hamster({
    fur: R.momOrange,
    patchRamp: R.momCream,
    ear: R.hamEar,
    eyes: (l) => {
      eye(l, EYE_TALL, 13, 12)
      eye(l, EYE_TALL, 20, 12)
    },
    face: (l) => {
      whiskers(l, C.inkWarm)
      // furious brows and a gritted mouth
      l.thick(11, 9.5, 17, 12, 2, C.ink)
      l.thick(25, 9.5, 19, 12, 2, C.ink)
      l.rect(21, 24, 5, 1, C.ink)
      l.set(10, 21, C.blush)
      l.set(11, 21, C.blush)
      // anger mark
      l.stamp(['r.r', '.r.', 'r.r'], 4, 12, { r: R.bandana[1] })
    },
    extras: (p) => {
      p.add(2, (l) => {
        // hair curlers
        for (const x of [10, 15.5, 21]) ball(l, x, 5, 2.6, 2.4, R.hamEar)
        l.set(10, 4, C.white)
        l.set(15, 4, C.white)
        l.set(21, 4, C.white)
      })
      p.add(2, (l) => {
        // white apron top with straps
        l.poly([5, 29, 7, 25, 24, 25, 26, 29], R.paper[1])
        l.rect(8, 25, 2, 2, R.paper[2])
        l.rect(21, 25, 2, 2, R.paper[2])
        shadeEdges(l, R.paper, 1, true)
        l.rect(14, 27, 4, 2, R.paper[2])
        clipBottom(l)
      })
    }
  })

const king = () =>
  hamster({
    fur: R.kingPurple,
    patchRamp: R.kingBelly,
    ear: R.crimson,
    hideBody: true,
    noMouth: true,
    eyes: (l) => {
      // slanted, glowing yellow eyes
      l.stamp(['yyy..', '.y00y', '..yyy'], 12, 12, EYE_KEY)
      l.stamp(['..yyy', 'y00y.', 'yyy..'], 19, 12, EYE_KEY)
      l.set(13, 12, C.glow)
      l.set(22, 12, C.glow)
    },
    face: (l) => {
      whiskers(l, R.kingBelly[3])
      // menacing brows
      l.thick(11, 9, 17, 12, 2, C.black)
      l.thick(26, 9, 20, 12, 2, C.black)
      // two small fangs
      l.rect(21, 21, 5, 1, C.black)
      l.rect(22, 22, 1, 2, C.white)
      l.rect(24, 22, 1, 2, C.white)
    },
    extras: (p) => {
      p.add(-3, (l) => {
        // tall crimson collar rising behind the head
        l.poly([2, 29.5, 2, 12, 8, 20, 23.5, 20, 29.5, 12, 29.5, 29.5], R.crimson[1])
        shadeEdges(l, R.crimson, 1, true)
        l.rect(4, 22, 1, 7, R.crimson[2])
        l.rect(27, 22, 1, 7, R.crimson[2])
        clipBottom(l)
      })
      p.add(-1, (l) => {
        ball(l, 15.5, 33, 8.5, 8, R.kingPurple)
        clipBottom(l)
      })
      p.add(2, (l) => {
        // gold spiked crown with a dark star gem
        l.poly([9, 7.5, 9, 3, 12, 6, 15.5, 2.5, 19, 6, 22, 3, 22, 7.5], R.gold[1])
        l.rect(9, 7, 13, 2, R.gold[2])
        shadeEdges(l, R.gold, 1, true)
        l.set(15, 5, R.kingPurple[3])
        l.set(16, 5, R.kingPurple[3])
        l.set(15, 6, R.kingPurple[3])
        l.set(16, 6, R.kingPurple[3])
        l.set(15, 4, R.kingPurple[3])
        l.set(16, 4, R.kingPurple[3])
      })
    }
  })

// ------------------------------------------------------------------------------------------------- bosses

const CROW_CHEST = ramp('#dfe4f8', '#aab4dc', '#7d88b8', '#555f90', '#0e0f1e')

const crowBoss = () => {
  const p = new Painter(S, S)
  p.add(-2, (l) => {
    ball(l, 14, 33, 11.5, 9, R.crowBlue)
    l.poly([15, 29, 17, 23, 22, 23, 24, 29], CROW_CHEST[1])
    shadeEdges(l, CROW_CHEST, 1, true)
    clipBottom(l)
  })
  p.add(0, (l) => {
    ball(l, 14.5, 13, 11, 10.5, R.crowBlue)
    // a ruffled crest
    l.poly([8, 4, 11, 2, 12, 4], R.crowBlue[2])
  })
  p.add(1, (l) => {
    // red bandana across the head with trailing knot
    l.thick(5, 10, 22, 6, 3, R.bandana[1])
  })
  p.add(1, (l) => {
    bar(l, [6, 9], [3, 15], 2, R.bandana[1])
    bar(l, [7, 9], [5, 17], 2, R.bandana[2])
  })
  p.add(2, (l) => {
    // big beak
    l.poly([20, 9, 29, 12, 29, 16, 20, 16], R.beak[1])
    shadeEdges(l, R.beak, 1, true)
    l.poly([21, 17, 28, 17, 26, 20, 21, 20], R.beak[2])
    l.line(21, 16, 28, 16, R.beak[3])
    l.set(28, 12, R.beak[3])
  })
  p.add(
    3,
    (l) => {
      // eye with a fierce brow, eye patch with a strap
      l.stamp(['yyy', 'y00', 'yyy'], 17, 9, EYE_KEY)
      l.line(16, 7, 20, 8, C.black)
      l.line(5, 14, 8, 12, C.black)
      l.line(11, 7, 15, 9, C.black)
      l.ellipse(11.5, 12, 3.4, 3, C.black)
      l.set(10, 11, R.crowBlue[0])
      // red neck scarf
      l.poly([4, 24, 22, 24, 21, 27, 6, 27], R.bandana[1])
      l.rect(6, 27, 15, 1, R.bandana[2])
    },
    false
  )
  return render(p)
}

const WEASEL_CREAM = R.paper

const weaselBoss = () => {
  const p = new Painter(S, S)
  p.add(-2, (l) => {
    ball(l, 13, 34, 11, 9, R.weaselTan)
    l.poly([6, 29.5, 7, 26, 11, 28, 15, 29.5], R.weaselTan[2])
    clipBottom(l)
  })
  p.add(0, (l) => {
    ball(l, 13.5, 17, 11, 9, R.weaselTan)
    patch(l, 9, 21, 3.5, 2.5, R.weaselTan, false)
  })
  p.add(0.5, (l) => {
    ball(l, 23, 20, 6.5, 4.2, WEASEL_CREAM)
    l.rect(28, 18, 2, 2, C.black)
  })
  p.add(
    1,
    (l) => {
      // sly half-closed eye
      l.rect(16, 15, 4, 2, C.black)
      l.line(15, 14, 20, 15, C.ink)
      l.set(18, 16, C.white)
      l.line(24, 23, 28, 23, C.inkWarm)
      // whiskers
      l.line(26, 20, 30, 19, C.white)
      l.line(26, 22, 30, 22, C.white)
    },
    false
  )
  p.add(2, (l) => {
    // scholar cap with red band and a gold button
    l.poly([6, 10, 8, 4, 19, 4, 21, 10], R.darkFur[1])
    shadeEdges(l, R.darkFur, 1, true)
    l.rect(6, 8, 15, 2, R.bandana[1])
    l.rect(6, 9, 15, 1, R.bandana[2])
    bar(l, [6, 9], [3, 15], 2, R.bandana[1])
    bar(l, [7, 9], [5, 16], 2, R.bandana[2])
  })
  p.add(
    2.5,
    (l) => {
      l.rect(13, 2, 2, 2, R.gold[1])
      l.set(14, 3, R.gold[2])
    },
    false
  )
  p.add(3, (l) => {
    // feather fan held low in front
    l.ring(11, 32, 0, 8, R.paper[1], -Math.PI * 0.95, -Math.PI * 0.05)
    shadeEdges(l, R.paper, 1, true)
    for (const a of [-0.75, -0.5, -0.25])
      l.line(11, 31, 11 + Math.cos(Math.PI * a) * 7, 32 + Math.sin(Math.PI * a) * 7, R.paper[2])
    l.rect(10, 27, 2, 2, R.bandana[1])
    clipBottom(l)
  })
  return render(p)
}

const BOAR_SNOUT = ramp('#f2c4ae', '#d6948a', '#a8646e', '#6e3a52', '#3a1a22')

const boarBoss = () => {
  const p = new Painter(S, S)
  p.add(-2, (l) => {
    ball(l, 13, 34, 12, 9, R.boarBrown)
    clipBottom(l)
  })
  p.add(-1, (l) => {
    // bristles along the neck
    for (const [x, y] of [
      [4, 12],
      [7, 8],
      [11, 5]
    ])
      l.poly([x, y + 4, x + 1, y - 1, x + 4, y + 2], R.boarBrown[3])
    ball(l, 8, 6.5, 3, 3.4, R.boarBrown)
    ball(l, 8.3, 7.2, 1.6, 2, R.hamEar, false)
  })
  p.add(0, (l) => {
    ball(l, 14, 17, 12, 10, R.boarBrown)
  })
  p.add(1, (l) => {
    ball(l, 25, 19, 5, 5.2, BOAR_SNOUT)
    l.rect(27, 17, 1, 2, BOAR_SNOUT[4])
    l.rect(27, 21, 1, 2, BOAR_SNOUT[4])
  })
  p.add(2, (l) => {
    // long tusks curving up from the jaw
    bar(l, [19, 26], [26, 24], 2, R.cream[1])
    l.set(27, 23, R.cream[0])
    l.set(28, 21, R.cream[1])
    l.set(28, 22, R.cream[1])
    l.set(29, 20, R.cream[0])
    l.set(21, 25, R.cream[0])
    // leaf stalk in the mouth
  })
  p.add(
    2.5,
    (l) => {
      l.line(23, 27, 27, 29, R.leaf[2])
      l.rect(26, 28, 3, 2, R.leaf[1])
      l.set(26, 30, R.leaf[2])
    },
    false
  )
  p.add(
    3,
    (l) => {
      // small mean eye
      l.rect(17, 13, 2, 3, C.black)
      l.thick(14, 11.5, 20, 13, 1.5, C.ink)
      // red neckerchief
      l.ellipse(9, 27.5, 6, 2.2, R.bandana[1])
      l.rect(4, 28, 11, 1, R.bandana[2])
    },
    false
  )
  p.add(4, (l) => {
    // pompadour
    ball(l, 12, 5.5, 8.5, 3.8, R.darkFur)
    ball(l, 17, 4.5, 4.5, 3, R.darkFur)
    l.set(11, 3, R.darkFur[0])
    l.set(12, 3, R.darkFur[0])
    l.set(15, 2, R.darkFur[0])
  })
  return render(p)
}

const wolfBoss = () => {
  const p = new Painter(S, S)
  p.add(-2, (l) => {
    ball(l, 14, 34, 11.5, 9, R.wolfGray)
    clipBottom(l)
  })
  p.add(-1, (l) => {
    l.poly([5, 11, 7, 2, 13, 8], R.wolfGray[1])
    l.poly([6, 10, 7.5, 5, 10, 8], R.wolfGray[3])
    l.poly([15, 8, 19, 3, 22, 10], R.wolfGray[2])
    shadeEdges(l, R.wolfGray, 1, true)
  })
  p.add(0, (l) => {
    ball(l, 14, 16.5, 11.5, 9.5, R.wolfGray)
    // white cheek ruff
    patch(l, 16, 25, 9, 3.3, R.paper)
  })
  p.add(0.5, (l) => {
    ball(l, 22.5, 20.5, 7, 4.4, R.wolfGray)
    l.rect(28, 18, 2, 2, C.black)
    l.set(28, 18, C.spark)
  })
  p.add(
    1,
    (l) => {
      // yellow slit eye, hard brow
      l.rect(17, 13, 4, 2, R.gold[1])
      l.rect(19, 13, 1, 2, C.black)
      l.thick(15, 10.5, 22, 12.5, 1.5, C.ink)
      // scar across the other eye
      l.line(11, 9, 14, 17, R.fruitRed[0])
      l.line(12, 9, 15, 17, R.fruitRed[1])
      l.set(13, 12, C.white)
      l.line(22, 23, 28, 23, C.inkCool)
      l.set(25, 24, C.white)
      l.set(24, 24, C.white)
    },
    false
  )
  p.add(2, (l) => {
    // red scarf wrapped at the neck, tail streaming back
    l.ellipse(15, 27.5, 11, 2.4, R.bandana[1])
    shadeEdges(l, R.bandana, 1, true)
    bar(l, [6, 26], [3, 20], 3, R.bandana[1])
    l.rect(8, 28, 12, 1, R.bandana[2])
    clipBottom(l)
  })
  return render(p)
}

const bearBoss = () => {
  const p = new Painter(S, S)
  p.add(-2, (l) => {
    ball(l, 15.5, 34, 13, 9, R.bearViolet)
    clipBottom(l)
  })
  p.add(-1, (l) => {
    ball(l, 6, 7.5, 3.8, 3.8, R.bearViolet)
    ball(l, 25, 7.5, 3.8, 3.8, R.bearViolet)
    ball(l, 6.4, 8, 2, 2, R.bearViolet, false)
    ball(l, 24.6, 8, 2, 2, R.bearViolet, false)
    l.set(6, 8, R.bearViolet[3])
    l.set(25, 8, R.bearViolet[3])
  })
  p.add(0, (l) => {
    ball(l, 15.5, 16.5, 12.5, 10.5, R.bearViolet)
    patch(l, 21, 21, 6.5, 5, R.cream)
  })
  p.add(
    1,
    (l) => {
      ball(l, 24, 19, 2.6, 1.8, R.darkFur)
      l.set(23, 18, R.darkFur[0])
      eye(l, EYE_SMALL, 15, 12)
      eye(l, EYE_SMALL, 22, 12)
      l.line(13, 11, 17, 11, C.ink)
      l.line(21, 11, 25, 11, C.ink)
      l.line(21, 23, 24, 24, C.ink)
      l.line(24, 24, 27, 22, C.ink)
    },
    false
  )
  p.add(2, (l) => {
    // leaves on the head
    ball(l, 11.5, 4.5, 4, 2.2, R.leaf, false)
    ball(l, 19, 4, 4, 2.2, R.leaf, false)
    l.line(9, 5, 14, 4, R.leaf[3])
    l.line(17, 4, 21, 4, R.leaf[3])
  })
  p.add(3, (l) => {
    // gourd rope across the chest and the gourd itself
    l.line(2, 24, 22, 29, R.honey[2])
    l.line(2, 25, 22, 30, R.honey[3])
    ball(l, 24, 26.5, 3.4, 2.8, R.honey)
    ball(l, 24, 22.5, 2.2, 2, R.honey)
    l.set(24, 20, R.honey[3])
    l.set(23, 21, R.honey[3])
    clipBottom(l)
  })
  return render(p)
}

const foxBoss = () => {
  const p = new Painter(S, S)
  p.add(-2, (l) => {
    ball(l, 14, 34, 12, 9, R.foxOrange)
    l.poly([12, 29.5, 16, 24, 21, 29.5], R.cream[1])
    clipBottom(l)
  })
  p.add(-1, (l) => {
    l.poly([4, 10, 5, 2, 12, 8], R.foxOrange[1])
    l.poly([5, 9, 6, 5, 9, 8], R.foxOrange[3])
    l.poly([14, 8, 21, 2, 24, 11], R.foxOrange[2])
    l.poly([17, 8, 21, 5, 22, 10], R.foxOrange[3])
    shadeEdges(l, R.foxOrange, 1, true)
  })
  p.add(0, (l) => {
    ball(l, 14, 17, 11.5, 9.5, R.foxOrange)
    // fluffy white cheek
    patch(l, 8.5, 24, 5, 3, R.cream)
  })
  p.add(0.5, (l) => {
    ball(l, 22.5, 21, 7, 4.4, R.cream)
    l.rect(28, 19, 2, 2, C.black)
    l.set(28, 19, C.spark)
  })
  p.add(
    1,
    (l) => {
      // narrow slanted eyes
      l.stamp(['...00', '.000.', '00...'], 11, 13, EYE_KEY)
      l.stamp(['00...', '.000.', '...00'], 18, 13, EYE_KEY)
      l.set(12, 13, C.white)
      l.line(22, 24, 27, 23, C.inkWarm)
    },
    false
  )
  p.add(2, (l) => {
    // ninja headband with a steel plate and trailing ends
    l.thick(4, 12, 25, 9.5, 3.5, R.crowBlue[1])
    shadeEdges(l, R.crowBlue, 1, true)
    l.rect(11, 8, 7, 5, R.steel[1])
    shadeEdges(l, R.steel, 1, true)
    l.set(14, 10, R.steel[3])
    l.set(15, 10, R.steel[3])
    bar(l, [4, 12], [3, 19], 2, R.crowBlue[1])
    bar(l, [5, 13], [5, 21], 2, R.crowBlue[2])
  })
  return render(p)
}

const APE_FACE = ramp('#cfc9d8', '#a39cb4', '#7b748c', '#544e66', '#26232f')

const apeBoss = () => {
  const p = new Painter(S, S)
  p.add(-2, (l) => {
    ball(l, 15.5, 36, 14, 11, R.apeCharcoal)
    clipBottom(l)
  })
  p.add(-1, (l) => {
    ball(l, 4.5, 16, 2.6, 3, R.apeCharcoal)
    ball(l, 26.5, 16, 2.6, 3, R.apeCharcoal)
    ball(l, 4.5, 16, 1.4, 1.8, APE_FACE, false)
  })
  p.add(0, (l) => {
    ball(l, 15.5, 16, 11.5, 10.5, R.apeCharcoal)
    // bare face plate
    patch(l, 18.5, 19.5, 8.5, 6.5, APE_FACE)
  })
  p.add(
    1,
    (l) => {
      // heavy brow ridge
      l.poly([8, 11, 14, 12, 28, 13, 28, 15, 12, 15, 8, 14], R.apeCharcoal[2])
      l.line(9, 11, 21, 12, R.apeCharcoal[1])
      eye(l, ['00', '0w'], 14, 16)
      eye(l, ['00', '0w'], 21, 16)
      // wide flat nose, firm mouth
      l.rect(19, 20, 7, 3, APE_FACE[3])
      l.rect(19, 20, 7, 1, APE_FACE[2])
      l.set(21, 21, C.black)
      l.set(24, 21, C.black)
      l.rect(15, 25, 12, 1, C.ink)
      l.set(14, 24, C.ink)
      l.set(27, 24, C.ink)
    },
    false
  )
  p.add(2, (l) => {
    // navy police cap: dome, visor and a gold badge
    ball(l, 15.5, 8, 10, 5.5, R.crowBlue)
    l.rect(6, 9, 21, 2, R.crowBlue[3])
    l.rect(10, 11, 18, 1, R.crowBlue[3])
    l.rect(11, 10, 15, 1, R.crowBlue[2])
    l.stamp(['.y.', 'yyy', '.y.'], 14, 5, { y: R.gold[1] })
    l.set(15, 6, R.gold[0])
  })
  return render(p)
}

const beeBoss = () => {
  const p = new Painter(S, S)
  p.add(-4, (l) => {
    // wing behind
    ball(l, 5.5, 14, 3.8, 8, R.paper)
  })
  p.add(-3, (l) => {
    // antennae with gold balls
    bar(l, [12, 8], [8, 4], 1, R.darkFur[2])
    bar(l, [20, 8], [24, 4], 1, R.darkFur[2])
    ball(l, 8, 3.8, 1.9, 1.9, R.gold)
    ball(l, 24, 3.8, 1.9, 1.9, R.gold)
  })
  p.add(-2, (l) => {
    // striped body
    ball(l, 15.5, 33, 13, 9, R.honey)
    for (const x of [5, 12, 19]) l.rect(x, 26, 3, 4, R.darkFur[1])
    clipBottom(l)
  })
  p.add(0, (l) => {
    ball(l, 16, 15, 10, 9, R.hamCream)
  })
  p.add(
    1,
    (l) => {
      // black bob hair
      ball(l, 16, 10.5, 10.5, 6, R.darkFur)
      l.rect(6, 11, 3, 9, R.darkFur[1])
      l.rect(24, 11, 3, 9, R.darkFur[2])
      eye(l, EYE_TALL, 13, 13)
      eye(l, EYE_TALL, 19, 13)
      l.line(12, 13, 11, 12, C.ink)
      l.line(24, 13, 25, 12, C.ink)
      l.set(16, 20, C.ink)
      l.set(17, 20, C.ink)
    },
    false
  )
  p.add(2, (l) => {
    // small gold crown
    l.poly([12, 5, 12, 2, 14, 4, 16, 1.5, 18, 4, 20, 2, 20, 5], R.gold[1])
    l.rect(12, 5, 8, 1, R.gold[2])
    shadeEdges(l, R.gold, 1, true)
  })
  p.add(3, (l) => {
    // fluffy white collar
    for (const x of [6, 10, 14, 18, 22, 26]) ball(l, x, 24.5, 3.2, 2.8, R.paper)
    l.rect(6, 24, 21, 2, R.paper[1])
    clipBottom(l)
  })
  p.add(4, (l) => {
    // gold sceptre with a red orb
    l.rect(27, 14, 1, 16, R.gold[1])
    ball(l, 27.5, 12, 2.2, 2.2, R.gold)
    clipBottom(l)
  })
  return render(p)
}

// ------------------------------------------------------------------------------------------------- emblems

/** One rounded-square frame shared by all emblems: 1-px ink rim, 1 px empty margin, inner highlight top-left. */
function insideMask(): Raster {
  const m = new Raster(S, S)
  // inner area 2..29 with 4-px rounded corners
  m.rect(2, 2, 28, 28, 1)
  const cut = [4, 2, 1, 1]
  cut.forEach((n, i) => {
    for (let x = 0; x < n; x++) {
      m.set(2 + x, 2 + i, 0)
      m.set(29 - x, 2 + i, 0)
      m.set(2 + x, 29 - i, 0)
      m.set(29 - x, 29 - i, 0)
    }
  })
  return m
}

const inside = memo(insideMask)

function frame(scene: Raster): Raster {
  const out = new Raster(S, S)
  for (let y = 0; y < S; y++)
    for (let x = 0; x < S; x++) {
      if (inside().get(x, y)) out.set(x, y, scene.get(x, y) || R.cosmos[3])
    }
  // rim: every empty pixel touching the inside
  const rim = new Raster(S, S)
  for (let y = 0; y < S; y++)
    for (let x = 0; x < S; x++) {
      if (out.get(x, y)) continue
      if (
        [
          [-1, 0],
          [1, 0],
          [0, -1],
          [0, 1],
          [-1, -1],
          [1, -1],
          [-1, 1],
          [1, 1]
        ].some(([dx, dy]) => out.get(x + dx, y + dy))
      )
        rim.set(x, y, C.ink)
    }
  out.blit(rim)
  // highlight line along the top-left inner edge
  for (let x = 6; x <= 17; x++) if (inside().get(x, 2)) out.set(x, 2, C.white)
  for (let y = 6; y <= 12; y++) if (inside().get(2, y)) out.set(2, y, C.white)
  out.set(4, 3, C.white)
  out.set(3, 4, C.white)
  return out
}

const scene = () => new Raster(S, S)

/** Bands of flat colour from top to bottom (rows from y0). */
function bands(r: Raster, y0: number, y1: number, cols: readonly number[]) {
  const h = (y1 - y0) / cols.length
  cols.forEach((c, i) => r.rect(2, Math.round(y0 + i * h), 28, Math.ceil(h) + 1, c))
}

function star(r: Raster, x: number, y: number, c: number, big = false) {
  r.set(x, y, c)
  if (big) {
    r.set(x - 1, y, c)
    r.set(x + 1, y, c)
    r.set(x, y - 1, c)
    r.set(x, y + 1, c)
  }
}

function themeMeadow(): Raster {
  const r = scene()
  bands(r, 2, 22, [R.skyDay[1], R.skyDay[1], R.skyDay[0]])
  // cloud
  r.ellipse(8.5, 8.5, 4, 2, R.cloud[1])
  r.ellipse(12, 7.5, 3, 2.4, R.cloud[0])
  r.rect(5, 9, 9, 1, R.cloud[2])
  // sun
  r.ellipse(23.5, 8, 5.5, 5.5, R.skyDay[0])
  ball(r, 23.5, 8, 4, 4, R.gold)
  // hills
  r.ellipse(9, 34, 22, 14, R.grass[0])
  r.ellipse(9, 35, 22, 14, R.grass[1])
  r.ellipse(26, 36, 16, 12, R.grass[2])
  r.ellipse(26, 37, 16, 12, R.grass[3])
  r.rect(2, 28, 28, 2, R.grass[2])
  // flower
  r.line(11, 20, 11, 25, R.leaf[3])
  r.set(12, 23, R.leaf[2])
  r.set(10, 22, R.leaf[2])
  for (const [dx, dy] of [
    [0, -2],
    [-2, 0],
    [2, 0],
    [0, 2]
  ])
    r.set(11 + dx, 19 + dy, R.fruitRed[1])
  r.set(11, 19, R.gold[1])
  r.set(10, 17, R.fruitRed[0])
  return frame(r)
}

function themeNight(): Raster {
  const r = scene()
  bands(r, 2, 30, [R.skyNight[3], R.skyNight[3], R.skyNight[2], R.skyNight[1], R.skyNight[1]])
  // halo and crescent moon
  r.ellipse(19.5, 11, 9.5, 9.5, R.skyNight[2])
  r.ellipse(19.5, 11, 7.5, 7.5, R.skyNight[1])
  for (let y = 0; y < S; y++)
    for (let x = 0; x < S; x++) {
      const dx = x + 0.5 - 19.5
      const dy = y + 0.5 - 11
      if (dx * dx + dy * dy > 5.6 * 5.6) continue
      const ex = x + 0.5 - 22.2
      const ey = y + 0.5 - 9
      if (ex * ex + ey * ey <= 4.6 * 4.6) continue
      r.set(x, y, x + y < 28 ? C.glow : R.gold[1])
    }
  // stars
  for (const [x, y, b] of [
    [6, 6, true],
    [12, 13, false],
    [5, 16, false],
    [27, 22, false],
    [10, 4, false],
    [28, 4, false]
  ] as const)
    star(r, x, y, C.glow, b)
  // pine silhouettes
  const pine = R.nightFar[4]
  r.rect(2, 26, 28, 4, pine)
  for (const [x, h] of [
    [7, 14],
    [14, 10],
    [21, 13],
    [27, 9]
  ] as const) {
    r.poly([x, 28 - h, x + 4, 22, x - 4, 22], pine)
    r.poly([x, 28 - h + 4, x + 5.5, 27, x - 5.5, 27], pine)
  }
  return frame(r)
}

function themeCave(): Raster {
  const r = scene()
  r.rect(2, 2, 28, 28, R.caveDeep[3])
  // a lit chamber in the middle, dark rock walls around it
  r.ellipse(16, 20, 12, 9, R.caveDeep[1])
  r.ellipse(16, 21, 8, 6, R.caveDeep[0])
  // floor
  r.rect(2, 26, 28, 4, R.caveRock[2])
  r.rect(2, 26, 28, 1, R.caveRock[1])
  r.rect(2, 29, 28, 1, R.caveRock[3])
  // stalactites, lighter than the wall so they read
  for (const [x, w, h] of [
    [5, 6, 11],
    [12, 4, 7],
    [22, 6, 12],
    [28, 4, 8]
  ] as const) {
    r.poly([x - w / 2, 2, x + w / 2, 2, x, 2 + h], R.caveRock[0])
    r.poly([x + 0.5, 2, x + w / 2, 2, x, 2 + h], R.caveRock[1])
  }
  r.rect(2, 2, 28, 2, R.caveRock[1])
  r.rect(2, 4, 28, 1, R.caveRock[2])
  // glowing crystals
  r.poly([4, 27, 6, 18, 9, 27], R.magic[1])
  r.poly([7, 27, 9, 21, 12, 27], R.magic[2])
  r.line(6, 20, 5, 25, R.magic[0])
  r.set(9, 23, C.white)
  r.poly([22, 27, 24.5, 17, 27, 27], R.berry[1])
  r.poly([26, 27, 28, 21, 30, 27], R.berry[2])
  r.line(24, 19, 23, 25, R.berry[0])
  // hanging lantern
  r.line(15, 2, 15, 9, R.steel[2])
  r.rect(13, 10, 5, 6, R.gold[2])
  r.rect(14, 11, 3, 4, C.glow)
  r.rect(13, 9, 5, 1, R.gold[3])
  r.rect(13, 16, 5, 1, R.gold[3])
  r.set(15, 12, C.white)
  return frame(r)
}

function themeForest(): Raster {
  const r = scene()
  r.rect(2, 2, 28, 28, R.forestDeep[2])
  // light shaft
  r.poly([9, 2, 18, 2, 27, 30, 13, 30], R.forestDeep[0])
  r.poly([11, 2, 16, 2, 23, 30, 17, 30], R.leaf[0])
  r.poly([12, 2, 14, 2, 19, 30, 17, 30], C.glow)
  // far trunk
  r.rect(15, 8, 3, 22, R.forestDeep[3])
  // thick trunks
  for (const [x, w] of [
    [3, 6],
    [22, 7]
  ] as const) {
    r.rect(x, 2, w, 28, R.bark[1])
    r.rect(x + w - 2, 2, 2, 28, R.bark[2])
    r.rect(x, 2, 1, 28, R.bark[0])
    r.rect(x + 2, 12, 1, 5, R.bark[3])
    r.rect(x + 1, 20, 1, 4, R.bark[3])
  }
  // canopy
  for (const x of [4, 10, 16, 22, 28]) ball(r, x, 4, 6, 4.5, R.forestDeep)
  r.rect(2, 2, 28, 2, R.forestDeep[3])
  for (const x of [8, 20]) ball(r, x, 7, 4, 2.5, R.pineLeaf)
  // ground
  r.ellipse(16, 33, 20, 6, R.grassForest[1])
  r.rect(2, 28, 28, 2, R.grassForest[2])
  return frame(r)
}

function themeFortress(): Raster {
  const r = scene()
  r.rect(2, 2, 28, 28, R.stone[1])
  // stone blocks
  for (let row = 0; row < 7; row++) {
    const y = 2 + row * 4
    r.rect(2, y + 3, 28, 1, R.stone[2])
    for (let x = row % 2 ? 6 : 2; x < 30; x += 8) r.rect(x, y, 1, 3, R.stone[2])
  }
  r.rect(2, 2, 28, 1, R.stone[0])
  // barred window
  r.rect(7, 6, 9, 13, R.stone[3])
  r.rect(8, 7, 7, 11, C.inkCool)
  r.rect(9, 8, 5, 5, R.skyNight[2])
  r.rect(11, 7, 1, 11, R.steel[1])
  r.rect(8, 12, 7, 1, R.steel[1])
  r.rect(8, 15, 7, 1, R.steel[1])
  // banner
  r.rect(20, 3, 8, 1, R.wood[2])
  r.rect(21, 4, 6, 9, R.bandana[1])
  r.rect(25, 4, 2, 9, R.bandana[2])
  r.poly([21, 13, 27, 13, 24, 16], R.bandana[2])
  r.set(23, 7, R.gold[1])
  r.set(24, 7, R.gold[1])
  r.set(23, 8, R.gold[1])
  // torch
  r.rect(22, 21, 2, 7, R.wood[2])
  r.rect(21, 20, 4, 1, R.steel[2])
  r.poly([20, 20, 23, 12, 26, 20], R.fire[2])
  r.poly([21.5, 20, 23, 14, 24.5, 20], R.fire[1])
  r.poly([22.5, 20, 23, 17, 23.5, 20], R.fire[0])
  r.rect(2, 28, 28, 2, R.stone[2])
  return frame(r)
}

function themeCastle(): Raster {
  const r = scene()
  // dusk sky
  bands(r, 2, 24, [R.castleStone[2], R.castleStone[1], R.castleStone[1], R.castleStone[0]])
  r.ellipse(24, 8, 2.5, 2.5, C.glow)
  // castle silhouette
  const sil = R.castleWall[3]
  r.rect(4, 14, 7, 12, sil)
  r.rect(21, 14, 7, 12, sil)
  r.rect(11, 18, 10, 8, sil)
  r.rect(12, 7, 8, 19, sil)
  r.poly([11, 7, 16, 1.5, 21, 7], R.castleWall[3])
  for (const x of [4, 7, 10, 21, 24, 27]) r.rect(x, 12, 2, 2, sil)
  r.poly([4, 14, 7.5, 9, 11, 14], sil)
  r.poly([21, 14, 24.5, 9, 28, 14], sil)
  r.rect(15, 11, 2, 3, R.fire[1])
  r.rect(7, 18, 1, 3, R.fire[1])
  r.rect(24, 18, 1, 3, R.fire[1])
  // crimson banner on the tower
  r.rect(14, 15, 4, 9, R.crimson[1])
  r.rect(17, 15, 1, 9, R.crimson[2])
  r.poly([14, 24, 18, 24, 16, 27], R.crimson[2])
  r.set(15, 18, R.gold[1])
  r.set(16, 18, R.gold[1])
  // red brick
  r.rect(2, 26, 28, 4, R.brick[1])
  r.rect(2, 26, 28, 1, R.brick[0])
  r.rect(2, 28, 28, 1, R.brick[2])
  for (const x of [7, 15, 23]) r.rect(x, 27, 1, 1, R.brick[3])
  for (const x of [3, 11, 19, 27]) r.rect(x, 29, 1, 1, R.brick[3])
  return frame(r)
}

function themeStar(): Raster {
  const r = scene()
  r.rect(2, 2, 28, 28, R.cosmos[2])
  r.ellipse(20, 20, 13, 10, R.cosmos[1])
  r.ellipse(8, 24, 9, 6, R.nebula[3])
  r.ellipse(8, 24, 6, 3.5, R.nebula[2])
  for (const [x, y, b] of [
    [5, 5, true],
    [14, 4, false],
    [27, 6, true],
    [4, 14, false],
    [26, 15, false],
    [18, 8, false]
  ] as const)
    star(r, x, y, b ? C.glow : C.white, b)
  // ringed planet: the ring is a tilted ellipse, its far half behind the globe
  const ring = (front: boolean) => {
    for (let y = 2; y < 30; y++)
      for (let x = 2; x < 30; x++) {
        const dx = x + 0.5 - 13
        const dy = y + 0.5 - 12.5 - dx * 0.22
        const q = (dx / 8.5) ** 2 + (dy / 2.8) ** 2
        if (q < 0.62 || q > 1.05) continue
        if (front === dy > 0) r.set(x, y, q > 0.85 ? R.gold[2] : R.gold[1])
      }
  }
  ring(false)
  ball(r, 13, 12.5, 5.2, 5.2, R.berry)
  ring(true)
  // floating crystal island
  r.poly([16, 22, 29, 22, 26, 25, 22.5, 29, 19, 25], R.starRock[1])
  r.poly([22.5, 29, 26, 25, 29, 22, 23, 24], R.starRock[2])
  r.rect(16, 21, 13, 1, R.gold[1])
  r.poly([20, 22, 22, 15, 24, 22], R.magic[1])
  r.poly([23, 22, 25, 18, 27, 22], R.magic[2])
  r.line(21, 17, 21, 20, R.magic[0])
  return frame(r)
}

const PORTRAITS: Record<string, () => Raster> = {
  face_hero: hero,
  face_princess: princess,
  face_mom: mom,
  face_king: king,
  face_crowBoss: crowBoss,
  face_weaselBoss: weaselBoss,
  face_boarBoss: boarBoss,
  face_wolfBoss: wolfBoss,
  face_bearBoss: bearBoss,
  face_foxBoss: foxBoss,
  face_apeBoss: apeBoss,
  face_beeBoss: beeBoss
}

const EMBLEMS: Record<string, () => Raster> = {
  theme_meadow: themeMeadow,
  theme_night: themeNight,
  theme_cave: themeCave,
  theme_forest: themeForest,
  theme_fortress: themeFortress,
  theme_castle: themeCastle,
  theme_star: themeStar
}

/** `ui`: the 32×32 `face_*` portraits and `theme_*` emblems. */
export const sheets: SheetModule = {
  ui: () => {
    const out: Record<string, Anim> = {}
    for (const [name, draw] of Object.entries({ ...PORTRAITS, ...EMBLEMS })) out[name] = make(name, draw)
    return out
  }
}
