import { C, R } from './palette'
import { KEY, Raster, ball, part, shadeEdges, type Ramp } from './raster'
import { arsenalFx, arsenalIcons, arsenalSheets } from './arsenal'
import { WINGS, WING_KEY, pencil } from './enemies'
import type { Anim, Sheet } from './sheet'
import { SPORTS_FORMS } from '../weapon-life'

/**
 * Weapons, their effects, pickups and HUD icons, in the same pixel style (palette ramps, selout, light from
 * the top-left). Spinning things animate through drawn frames; the pencil has 16 pre-drawn directions made
 * with pixel primitives (no rotated bitmaps). Area effects are composed by the renderer from the small
 * particle sprites here, at the real hit geometry.
 */

const loop = (frames: Raster[], fps: number): Anim => ({ frames, fps, loop: true })
const N = 32

/** Points of a polygon rotated by `a` around (cx, cy) — rasterised fresh, never a rotated bitmap. */
const turn = (pts: number[], cx: number, cy: number, a: number) =>
  pts.map((v, i) => {
    const x = i % 2 ? pts[i - 1] : v
    const y = i % 2 ? v : pts[i + 1]
    const dx = x - cx
    const dy = y - cy
    return i % 2 ? cy + dx * Math.sin(a) + dy * Math.cos(a) : cx + dx * Math.cos(a) - dy * Math.sin(a)
  })

// ---------------------------------------------------------------------------------------------
// Projectiles and orbiters (32×32, centred).

/**
 * 教育親: a thick reference book in 3/4 view — teal cover with a title band, a dark spine, white page
 * edges — tumbling end over end, its pages flapping open on the way round.
 */
function book(f: number) {
  const r = new Raster(N, N)
  const COVER = R.mint
  part(r, (l) => {
    if (f % 2 === 0) {
      // Closed: cover on top, page block on the side, spine along the left.
      const flip = f === 2
      const x = 7
      const y = 11
      l.poly([x, y + 4, x + 5, y, x + 21, y, x + 16, y + 4], COVER[0])
      l.rect(x, y + 4, 16, 9, R.paper[1])
      for (let k = 1; k < 9; k += 2) l.rect(x + 1, y + 4 + k, 15, 1, R.paper[2])
      l.poly([x + 16, y + 4, x + 21, y, x + 21, y + 9, x + 16, y + 13], COVER[2])
      l.rect(x, y + 4, 2, 9, R.navy[2])
      l.poly([x + 6, y + 1, x + 15, y + 1, x + 13, y + 3, x + 4, y + 3], flip ? R.yellow[1] : R.paper[0])
      l.rect(x, y + 12, 16, 1, COVER[3])
    } else {
      // Open mid-spin: two covers in a V with fanned pages flapping.
      const up = f === 1 ? 0 : 2
      l.poly([16, 22, 4, 12 + up, 7, 9 + up, 16, 18], COVER[1])
      l.poly([16, 22, 28, 12 - up, 25, 9 - up, 16, 18], COVER[1])
      for (let k = 0; k < 3; k++) {
        l.line(16, 18, 8 + k * 2, 8 + up - k, R.paper[k % 2 ? 1 : 0])
        l.line(16, 18, 24 - k * 2, 8 - up - k, R.paper[k % 2 ? 1 : 0])
      }
      l.rect(15, 18, 2, 5, R.navy[2])
    }
  })
  return r
}

/** 放任主義: a balloon drifting on its string. */
function balloon(f: number) {
  const r = new Raster(N, N)
  const sway = [0, 1, 0, -1][f]
  part(
    r,
    (l) => {
      for (let y = 22; y < 31; y++) l.set(16 + Math.round(Math.sin(y / 2 + f) * 1.2), y, R.paper[2])
    },
    false
  )
  part(r, (l) => {
    ball(l, 16 + sway, 12, 8, 9.5, R.yellow)
    l.poly([14 + sway, 21, 18 + sway, 21, 16 + sway, 23], R.yellow[2])
    l.rect(12 + sway, 6, 2, 3, C.white)
  })
  return r
}

/** 過保護: a round guardian shield with a heart emblem. */
function shield(f: number) {
  const r = new Raster(N, N)
  part(r, (l) => {
    ball(l, 16, 16, 12, 12, R.metal)
    ball(l, 16, 16, 9, 9, R.sky)
    l.stamp(['.rr.rr.', 'rRRrRRr', 'rRRRRRr', '.rRRRr.', '..rRr..', '...r...'], 13, 13, { r: R.red[2], R: R.red[1] })
    if (f % 2) for (let k = 0; k < 4; k++) l.set(9 + k, 11 - k, C.white)
  })
  return r
}

/** モンスターペアレント: a small furious parent in curlers and an apron, running the orbit. */
function parent(f: number) {
  const r = new Raster(N, N)
  const step = [2, 0, -2, 0][f]
  part(r, (l) => {
    l.thick(14, 22, 14 + step, 29, 3, R.skin[2])
    l.thick(18, 22, 18 - step, 29, 3, R.skin[2])
    l.rect(12 + step, 29, 4, 2, R.brown[2])
    l.rect(16 - step, 29, 4, 2, R.brown[2])
  })
  part(r, (l) => {
    l.poly([10, 15, 22, 15, 24, 24, 8, 24], R.orange[1])
    shadeEdges(l, R.orange, 1, true)
    l.poly([12, 17, 20, 17, 21, 24, 11, 24], R.paper[1])
    l.thick(10, 16, 6, 12 + (f % 2) * 2, 2, R.skin[1])
    l.thick(22, 16, 26, 12 - (f % 2) * 2, 2, R.skin[1])
  })
  part(r, (l) => {
    ball(l, 16, 9, 6, 6, R.skin)
    for (const x of [11, 15, 19]) l.rect(x, 2, 3, 3, R.pink[1])
    l.stamp(['K...K', '.K.K.', '.....', '.KKK.', 'K.r.K'], 14, 7, { ...KEY, r: R.red[1] })
  })
  return r
}

type Pt = readonly [number, number]
/** One frame of ヤンキー親: joints in side view facing right, far limb first, then near. */
interface YankeeFrame {
  hip: Pt
  shoulder: Pt
  head: Pt
  legs: readonly [knee: Pt, foot: Pt][]
  arms: readonly [elbow: Pt, hand: Pt][]
  /** The long coat's tails behind the legs. */
  tail: number[]
  /** Its front panels hanging over the near thigh (only when not blown back). */
  skirt?: number[]
  /** Fists out (running, kicking) or hands in the pockets (strutting). */
  fists: boolean
  /** The near foot thrust out sole first. */
  kick?: boolean
}

const at = ([x, y]: Pt, dx: number, dy: number): Pt => [x + dx, y + dy]

/** Storming in: four running frames, leaning into the dash with the coat streaming behind. */
function yankeeRun(f: number): YankeeFrame {
  const bob = [0, -1, 0, -1][f]
  const hip: Pt = [14, 20 + bob]
  const legPose: Record<string, [Pt, Pt]> = {
    front: [at(hip, 5, 3), [22, 29]],
    back: [at(hip, -1, 5), [8, 27]],
    support: [at(hip, 3, 5), [16, 30]],
    swing: [at(hip, 4, 3), at(hip, -2, 7)]
  }
  const [far, near] = [
    ['back', 'front'],
    ['swing', 'support'],
    ['front', 'back'],
    ['support', 'swing']
  ][f]
  const shoulder: Pt = [18, 13 + bob]
  const arm = (k: string): [Pt, Pt] =>
    k === 'front'
      ? [at(shoulder, 3, 3), at(shoulder, 6, 1)]
      : k === 'back'
        ? [at(shoulder, -3, 3), at(shoulder, -6, 1)]
        : [at(shoulder, 0, 4), at(shoulder, 3, 6)]
  const wave = f % 2
  return {
    hip,
    shoulder,
    head: [21, 9 + bob],
    legs: [legPose[far], legPose[near]],
    arms: [arm(f === 0 ? 'front' : f === 2 ? 'back' : 'mid'), arm(f === 0 ? 'back' : f === 2 ? 'front' : 'mid')],
    tail: [13, 15 + bob, 15, 21 + bob, 5, 23 + bob + wave, 2, 19 + bob - wave],
    fists: true
  }
}

/** The flying kick: leaning back in the air, the near leg thrust out at the target, the far leg tucked. */
function yankeeKick(f: number): YankeeFrame {
  const reach = f % 2
  return {
    hip: [13, 19],
    shoulder: [10, 12],
    head: [10, 8],
    legs: [
      [
        [17, 23],
        [12, 26]
      ],
      [
        [20, 20],
        [26 + reach, 22]
      ]
    ],
    arms: [
      [
        [13, 13],
        [15, 11]
      ],
      [
        [6, 15],
        [3, 14 - reach]
      ]
    ],
    tail: [9, 15, 13, 19, 9, 28 - reach, 4, 25 + reach],
    fists: true,
    kick: true
  }
}

/** The swagger home: upright, chest out, hands in the pockets, a bouncing bow-legged walk. */
function yankeeStrut(f: number): YankeeFrame {
  const bob = [0, -1, 0, -1][f]
  const hip: Pt = [15, 21 + bob]
  const stride = [3, 0, -3, 0][f]
  const lift = [0, 1, 0, 1][f]
  // The shoulders roll with each step.
  const roll = [0, 1, 0, -1][f]
  const shoulder: Pt = [15 + roll, 13 + bob]
  return {
    hip,
    shoulder,
    head: [16 + roll, 9 + bob],
    legs: [
      [at(hip, -stride / 2 - 1, 4), [15 - stride, 30 - (f === 3 ? lift : 0)]],
      [at(hip, stride / 2 + 1, 4), [16 + stride, 30 - (f === 1 ? lift : 0)]]
    ],
    arms: [
      [at(shoulder, -2, 4), at(shoulder, 0, 8)],
      [at(shoulder, -4, 5), at(shoulder, -1, 8)]
    ],
    tail: [11, 15 + bob, 14, 19 + bob, 13, 26 + bob, 9 - (f % 2), 25 + bob],
    skirt: [hip[0] - 3, hip[1] - 1, hip[0] + 4, hip[1] - 1, hip[0] + 5 - (f % 2), hip[1] + 5, hip[0] - 2, hip[1] + 5],
    fists: false
  }
}

/**
 * ヤンキー親: a former delinquent parent — a blond pompadour, black sunglasses, a long purple 特攻服 with gold
 * embroidery over a white sarashi, and setta sandals. Side view facing right; the renderer mirrors it.
 */
function yankee(frame: YankeeFrame) {
  const r = new Raster(N, N)
  const SUIT = R.purple
  const { hip, shoulder, head, legs, arms, tail, skirt, fists, kick } = frame
  const leg = (l: Raster, [knee, foot]: readonly [Pt, Pt], c: number) => {
    // Bontan: baggy at the thigh, tight at the ankle.
    l.thick(hip[0], hip[1], knee[0], knee[1], 4, c)
    l.thick(knee[0], knee[1], foot[0], foot[1], 3, c)
  }
  const sandal = (l: Raster, [x, y]: Pt, sole: boolean) => {
    if (sole) {
      l.rect(x + 1, y - 2, 1, 4, R.brown[2])
      l.rect(x - 1, y - 1, 2, 2, R.skin[1])
    } else {
      l.rect(x - 1, y - 1, 4, 1, R.skin[1])
      l.rect(x - 2, y, 5, 1, R.brown[2])
    }
  }
  const arm = (l: Raster, [elbow, hand]: readonly [Pt, Pt], c: number) => {
    l.thick(shoulder[0], shoulder[1], elbow[0], elbow[1], 3, c)
    l.thick(elbow[0], elbow[1], hand[0], hand[1], 3, c)
    if (fists) l.rect(hand[0] - 1, hand[1] - 1, 3, 3, R.skin[1])
  }
  // Far limbs a step darker, then the coat's tails behind the near leg.
  part(r, (l) => {
    leg(l, legs[0], SUIT[2])
    sandal(l, legs[0][1], false)
  })
  part(r, (l) => arm(l, arms[0], SUIT[2]))
  part(r, (l) => {
    l.poly(tail, SUIT[1])
    shadeEdges(l, SUIT, 1)
    l.set(tail[4] + 1, tail[5] - 2, R.yellow[1])
  })
  part(r, (l) => {
    leg(l, legs[1], SUIT[1])
    shadeEdges(l, SUIT, 1, true)
    sandal(l, legs[1][1], Boolean(kick))
  })
  // Torso: the coat hanging open over a white sarashi, gold embroidery down the back.
  part(r, (l) => {
    const [sx, sy] = shoulder
    const [hx, hy] = hip
    l.poly([sx - 4, sy - 1, sx + 2, sy - 1, hx + 4, hy + 1, hx - 3, hy + 1], SUIT[1])
    if (skirt) l.poly(skirt, SUIT[1])
    shadeEdges(l, SUIT, 1, true)
    l.poly([sx, sy, sx + 2.5, sy, hx + 3.5, hy - 2, hx + 1, hy - 2], R.paper[1])
    for (let k = 0; k < 3; k++) {
      const t = (k + 0.5) / 3
      l.set(sx - 2 + (hx - sx) * t, sy + 2 + (hy - sy - 4) * t, R.yellow[1])
    }
  })
  part(r, (l) => arm(l, arms[1], SUIT[1]))
  // Head: sunglasses and a scowl under slicked-back sides with a ducktail flick at the nape.
  part(r, (l) => {
    const [x, y] = head
    ball(l, x, y, 4.3, 4.5, R.skin)
    l.poly([x - 4.5, y - 0.5, x - 3.5, y - 3.6, x + 1, y - 4.6, x - 0.5, y - 1.5, x - 2.6, y + 0.4], R.yellow[2])
    l.poly([x - 4.3, y - 0.8, x - 5.9, y + 1.2, x - 3.7, y + 0.8], R.yellow[2])
    l.rect(x, y - 1, 5, 2, C.inkCool)
    l.line(x - 2, y - 1, x, y - 1, C.inkCool)
    l.set(x + 3, y - 1, C.white)
    l.rect(x + 2, y + 3, 2, 1, C.inkWarm)
  })
  // The pompadour: a long blond roll out over the brow, its tip curling down.
  part(r, (l) => {
    const [x, y] = head
    ball(l, x + 3, y - 5, 5.6, 2.7, R.yellow)
    ball(l, x + 7.6, y - 3.7, 1.7, 1.7, R.yellow, false)
  })
  return r
}

/** 友人: small friend kids running the orbit (three outfits). */
function friend(f: number, v: number) {
  const r = new Raster(N, N)
  const shirt = [R.orange, R.green, R.sky][v % 3]
  const hair = [R.hair[2], R.brown[1], R.hair[2]][v % 3]
  const step = [2, 0, -2, 0][f]
  part(r, (l) => {
    l.thick(14, 22, 14 + step, 29, 3, R.navy[1])
    l.thick(18, 22, 18 - step, 29, 3, R.navy[1])
  })
  part(r, (l) => {
    l.rect(11, 15, 10, 8, shirt[1])
    shadeEdges(l, shirt, 1, true)
    l.thick(11, 16, 7, 18 - step, 2, R.skin[1])
    l.thick(21, 16, 25, 18 + step, 2, R.skin[1])
  })
  part(r, (l) => {
    ball(l, 16, 10, 6, 6, R.skin)
    l.rect(10, 4, 12, 3, hair)
    l.rect(10, 7, 2, 3, hair)
    l.stamp(['K..K', '....', '.KK.'], 14, 9)
  })
  return r
}

/** スポーツ: a classic black-and-white soccer ball; the pentagon pattern turns frame by frame. */
function soccer(f: number) {
  const r = new Raster(N, N)
  const pent = (l: Raster, cx: number, cy: number, rad: number, a0: number) =>
    l.poly(
      Array.from({ length: 10 }, (_, k) => {
        const a = a0 + (Math.floor(k / 2) / 5) * Math.PI * 2
        return k % 2 ? cy + Math.sin(a) * rad : cx + Math.cos(a) * rad
      }),
      R.hair[2]
    )
  part(r, (l) => {
    ball(l, 16, 16, 10, 10, R.paper)
    const spin = (f / 4) * ((Math.PI * 2) / 5)
    pent(l, 16 + Math.cos(spin * 2) * 1.5, 16 + Math.sin(spin * 2) * 1.5, 3.2, spin - Math.PI / 2)
    for (let k = 0; k < 5; k++) {
      const a = spin + (k / 5) * Math.PI * 2 - Math.PI / 2
      pent(l, 16 + Math.cos(a) * 8.5, 16 + Math.sin(a) * 8.5, 2.6, a + Math.PI)
    }
    l.set(12, 10, C.white)
    l.set(11, 11, C.white)
  })
  return r
}

function sportsBall(kind: string, frame: number) {
  if (kind === 'soccer') return soccer(frame)
  const raster = new Raster(N, N)
  part(raster, (layer) => {
    const shift = frame % 2
    if (kind === 'golf' || kind === 'gateball') {
      layer.thick(10, 4, 20, 24, 2, R.metal[1])
      layer.thick(kind === 'golf' ? 17 : 12, 25, 26, 25, 4, kind === 'golf' ? R.metal[2] : R.brown[1])
      ball(layer, 7, 25, 4, 4, kind === 'golf' ? R.paper : R.red)
    } else {
      ball(layer, 16, 16, 10, 10, kind === 'basketball' ? R.orange : kind === 'tennis' ? R.green : R.paper)
      const seam = kind === 'baseball' ? R.red[1] : kind === 'tennis' ? R.paper[0] : R.brown[3]
      layer.line(10 + shift, 8, 13 + shift, 24, seam)
      layer.line(22 - shift, 8, 19 - shift, 24, seam)
      if (kind === 'basketball') {
        layer.line(7, 16, 25, 16, seam)
        layer.line(16, 7, 16, 25, seam)
      }
      if (kind === 'baseball')
        for (let row = 10; row < 24; row += 4) {
          layer.line(9, row, 13, row + 1, seam)
          layer.line(19, row + 1, 23, row, seam)
        }
    }
  })
  return raster
}

/** 勉強: a pencil pointing in one of 16 directions. */
function pencilDir(d: number) {
  const r = new Raster(N, N)
  const a = (d / 16) * Math.PI * 2
  pencil(
    r,
    { x: 16 - Math.cos(a) * 12, y: 16 - Math.sin(a) * 12 },
    { x: 16 + Math.cos(a) * 12, y: 16 + Math.sin(a) * 12 },
    5
  )
  return r
}

/** 恋愛: a heart with feathered wings (three tiers, like the 出費 wings) beating up and down. */
function wingedHeart(f: number) {
  const r = new Raster(N, N)
  const flap = [0, 1, 2, 1][f]
  const wy = 13 + [-3, -1, 1][flap]
  part(r, (l) => {
    l.stamp(WINGS[flap], 19, wy, WING_KEY)
    l.stamp(WINGS[flap], 6, wy, WING_KEY, true)
  })
  part(r, (l) =>
    l.stamp(['.pp.pp.', 'pPPpPPp', 'pPPPPPp', 'pPPPPPp', '.pPPPp.', '..pPp..', '...p...'], 12, 12, {
      p: R.pink[2],
      P: R.pink[1]
    })
  )
  part(r, (l) => l.set(14, 13, C.white), false)
  return r
}

/** 仕事: a briefcase spinning end over end. */
function briefcase(f: number) {
  const r = new Raster(N, N)
  const a = (f / 4) * Math.PI
  part(r, (l) => {
    l.poly(turn([12, 9, 20, 9, 20, 11, 12, 11], 16, 16, a), R.brown[3])
    l.poly(turn([7, 11, 25, 11, 25, 23, 7, 23], 16, 16, a), R.brown[1])
    shadeEdges(l, R.brown, 1, true)
    l.poly(turn([14, 15, 18, 15, 18, 17, 14, 17], 16, 16, a), R.yellow[1])
  })
  return r
}

// ---------------------------------------------------------------------------------------------
// Particles for area effects (composed by the renderer at the real hit geometry).

const tiny = (w: number, h: number, draw: (l: Raster) => void, outline = true) => {
  const r = new Raster(w, h)
  part(r, draw, outline)
  return r
}
const wisp = (f: number) =>
  tiny(16, 16, (l) => {
    ball(l, 8, 10, 5, 4.5, R.purple, false)
    l.thick(8, 7, 5 + f, 1, 3, R.purple[1])
    l.set(6, 9, R.purple[0])
  })
const skull = () =>
  tiny(13, 13, (l) => {
    ball(l, 6.5, 5.5, 4.8, 4.5, R.paper, false)
    l.rect(4, 9, 5, 3, R.paper[1])
    l.stamp(['KK.KK', 'KK.KK', '..K..'], 4, 4)
    l.set(5, 10, R.paper[3])
    l.set(7, 10, R.paper[3])
  })
const hand = (f: number) =>
  tiny(12, 12, (l) => {
    l.ellipse(6, 7, 3.5, 3, R.skin[1])
    for (let k = 0; k < 4; k++) l.rect(3 + k * 2, 2 + ((k + f) % 2), 1, 3, R.skin[1])
    l.rect(9, 6, 2, 1, R.skin[1])
    shadeEdges(l, R.skin)
  })
const sweat = () => tiny(6, 8, (l) => l.stamp(['..c', '.cc', 'ccc', 'cCc', '.c.'], 1, 1, { c: R.mint[0], C: C.white }))
const star = (f: number) =>
  tiny(
    9,
    9,
    (l) => {
      const s = f % 2 ? 3 : 4
      l.line(4 - s, 4, 4 + s, 4, R.yellow[0])
      l.line(4, 4 - s, 4, 4 + s, R.yellow[0])
      l.set(4, 4, C.white)
      if (!(f % 2)) {
        l.set(3, 3, R.yellow[1])
        l.set(5, 5, R.yellow[1])
      }
    },
    false
  )
const controller = () =>
  tiny(18, 12, (l) => {
    l.rect(3, 3, 12, 6, R.purple[1])
    l.ellipse(4, 6, 3, 3.5, R.purple[1])
    l.ellipse(14, 6, 3, 3.5, R.purple[1])
    shadeEdges(l, R.purple, 1, true)
    l.rect(3, 5, 3, 1, R.paper[0])
    l.rect(4, 4, 1, 3, R.paper[0])
    l.set(13, 4, R.red[1])
    l.set(14, 6, R.yellow[1])
  })
const pixel = (c: number) => tiny(3, 3, (l) => l.rect(0, 0, 2, 2, c), false)
/** ヤンキー親's kick landing: a jagged comic impact burst, white with a hot yellow core. */
const impact = (f: number) =>
  tiny(24, 24, (l) => {
    const star = (outer: number, inner: number, c: number) => {
      const pts: number[] = []
      for (let k = 0; k < 18; k++) {
        const rr = k % 2 ? inner : outer - ((k * 5) % 3)
        const a = (k / 18) * Math.PI * 2 + f * 0.35
        pts.push(12 + Math.cos(a) * rr, 12 + Math.sin(a) * rr)
      }
      l.poly(pts, c)
    }
    star([11, 9][f], [5, 4][f], C.white)
    star([6, 5][f], [3, 2.5][f], R.yellow[0])
    l.ellipse(12, 12, 1.6, 1.6, R.orange[0])
  })
/** 投資: a jagged chart-arrow lightning bolt from above (24×120) and its impact burst. */
const bolt = (f: number) =>
  tiny(24, 120, (l) => {
    const pts = [12, 0, 6, 22, 16, 30, 4, 58, 18, 66, 8, 96, 12, 112]
    for (let k = 0; k + 2 < pts.length; k += 2)
      l.thick(pts[k] + (f % 2), pts[k + 1], pts[k + 2] + (f % 2), pts[k + 3], 3, k % 4 ? R.green[1] : R.red[1])
    l.poly([6, 106, 18, 106, 12, 118], R.green[1])
    for (let k = 0; k + 2 < pts.length; k += 2)
      l.line(pts[k] + (f % 2), pts[k + 1], pts[k + 2] + (f % 2), pts[k + 3], R.green[0])
  })
const burst = (f: number) =>
  tiny(28, 28, (l) => {
    for (let a = 0; a < Math.PI * 2; a += Math.PI / 4)
      l.thick(
        14 + Math.cos(a) * 4,
        14 + Math.sin(a) * 4,
        14 + Math.cos(a) * (9 + f * 2),
        14 + Math.sin(a) * (9 + f * 2),
        2,
        a % (Math.PI / 2) ? R.green[0] : R.yellow[0]
      )
    ball(l, 14, 14, 4, 4, R.yellow, false)
  })
const bills = () =>
  tiny(20, 12, (l) => {
    for (let k = 0; k < 3; k++) l.rect(2 + k, 7 - k * 2, 15, 3, k % 2 ? R.yellow[0] : R.yellow[1])
    l.rect(8, 2, 3, 8, R.red[1])
  })
/** お金持ち: individual round gold coins bursting out, each with a glint. */
const coins = (f: number) =>
  tiny(32, 22, (l) => {
    for (const [dx, dy] of [
      [-10, -4],
      [-4, -9],
      [4, -10],
      [10, -5],
      [0, -2]
    ]) {
      const x = 16 + dx * (0.85 + f * 0.3)
      const y = 17 + dy * (0.85 + f * 0.3)
      ball(l, x, y, 2.8, 2.8, R.yellow, false)
      l.set(Math.round(x) - 1, Math.round(y) - 1, C.white)
    }
  })

/**
 * 美容 / 頼りない親 swings at the real whip length: a crescent drawn point by point along the rotated axis
 * (one of 32 directions, never a rotated bitmap). 'slash' is a white-pink blade with a bright core edge;
 * 'flail' is a fan of motion lines for the flailing hands. Cached by length and direction.
 */
const swings = new Map<string, Raster>()
export const SWING_DIRS = 32
export function swing(radius: number, dir: number, kind: 'slash' | 'flail') {
  const rr = Math.max(16, Math.round(radius / 8) * 8)
  const key = `${kind}:${rr}:${dir}`
  let r = swings.get(key)
  if (r) return r
  const size = rr * 2 + 32
  const c = size / 2
  const a = (dir / SWING_DIRS) * Math.PI * 2
  const at = (px: number, py: number) => [
    c + px * Math.cos(a) - py * Math.sin(a),
    c + px * Math.sin(a) + py * Math.cos(a)
  ]
  r = new Raster(size, size)
  part(
    r,
    (l) => {
      for (let t = -1; t <= 1; t += 0.5 / rr) {
        const bulge = (1 - t * t) * 14
        if (kind === 'slash') {
          const w = Math.pow(1 - Math.abs(t), 0.7) * 6.5 + 0.8
          const [x, y] = at(t * rr, -bulge)
          l.ellipse(x, y, w, w, R.pink[0])
          const [ix, iy] = at(t * rr, -bulge + w * 0.55)
          if (w > 1.5) l.ellipse(ix, iy, w * 0.45, w * 0.45, R.pink[1])
        } else if (Math.abs(t) < 0.85)
          for (const off of [-6, 0, 6]) {
            const [x, y] = at(t * rr, -bulge * 0.8 + off)
            l.set(x, y, off ? R.paper[2] : R.paper[0])
          }
      }
      if (kind === 'slash')
        for (let t = -0.95; t <= 0.95; t += 0.5 / rr) {
          const w = Math.pow(1 - Math.abs(t), 0.7) * 6.5 + 0.8
          const [x, y] = at(t * rr, -(1 - t * t) * 14 - w * 0.7)
          l.set(x, y, C.white)
        }
    },
    kind === 'slash'
  )
  swings.set(key, r)
  return r
}

/** 娯楽: an arcade play-mat at the zone's radius, drawn at world scale (cached by radius). */
const mats = new Map<number, Raster>()
export function playMat(radius: number) {
  const rr = Math.max(8, Math.round(radius / 4) * 4)
  let r = mats.get(rr)
  if (r) return r
  r = new Raster(rr * 2 + 2, rr * 2 + 2)
  // Quiet pastel squares (the nursery mat ramps) so stacked zones never drown the field.
  const colours = [R.matRose[0], R.matSage[0], R.matButter[0], R.matLilac[0]]
  for (let y = 0; y < r.h; y++)
    for (let x = 0; x < r.w; x++) {
      const dx = x + 0.5 - rr - 1
      const dy = y + 0.5 - rr - 1
      const d = Math.hypot(dx, dy)
      if (d > rr) continue
      r.set(x, y, d > rr - 2 ? R.purple[2] : colours[(Math.floor(x / 8) + Math.floor(y / 8)) % 4])
    }
  mats.set(rr, r)
  return r
}

// ---------------------------------------------------------------------------------------------
// Pickups (16×16) and icons (32×32).

function gem(f: number, ramp: Ramp) {
  const r = new Raster(16, 16)
  part(r, (l) => {
    l.poly([8, 2, 13, 7, 8, 14, 3, 7], ramp[1])
    l.poly([8, 2, 13, 7, 8, 8, 3, 7], ramp[0])
    l.poly([8, 8, 13, 7, 8, 14], ramp[2])
  })
  const tw = [
    [6, 5],
    [7, 4],
    [9, 6],
    [-1, -1]
  ][f]
  if (tw[0] >= 0) r.set(tw[0], tw[1], C.white)
  return r
}
const onigiri = (size = 16) =>
  tiny(size, size, (l) => {
    const s = size / 16
    l.poly([8 * s, 2 * s, 14 * s, 13 * s, 2 * s, 13 * s], C.white)
    l.ellipse(8 * s, 11 * s, 6 * s, 3 * s, C.white)
    shadeEdges(l, [R.paper[0], C.white, R.paper[2], R.paper[3], R.paper[4]], 1)
    l.rect(6 * s, 9 * s, 4 * s, 5 * s, R.hair[3])
  })
const gift = (size = 16) =>
  tiny(size, size, (l) => {
    const s = size / 16
    l.rect(3 * s, 6 * s, 10 * s, 8 * s, R.red[1])
    l.rect(2 * s, 4 * s, 12 * s, 3 * s, R.red[0])
    shadeEdges(l, R.red, 1)
    l.rect(7 * s, 4 * s, 2 * s, 10 * s, R.yellow[1])
    l.ellipse(6 * s, 3 * s, 2 * s, 1.5 * s, R.yellow[1])
    l.ellipse(10 * s, 3 * s, 2 * s, 1.5 * s, R.yellow[1])
  })
const magnet = (size = 16) =>
  tiny(size, size, (l) => {
    const s = size / 16
    l.thick(4 * s, 4 * s, 4 * s, 9 * s, 4 * s, R.red[1])
    l.thick(12 * s, 4 * s, 12 * s, 9 * s, 4 * s, R.red[1])
    for (let a = 0; a <= Math.PI; a += 0.1)
      l.ellipse(8 * s + Math.cos(a) * 4 * s, 9 * s + Math.sin(a) * 4 * s, 2 * s, 2 * s, R.red[1])
    l.rect(2 * s, 2 * s, 4 * s, 3 * s, R.metal[1])
    l.rect(10 * s, 2 * s, 4 * s, 3 * s, R.metal[1])
  })
const coin = (size = 32) =>
  tiny(size, size, (l) => {
    const s = size / 32
    ball(l, 16 * s, 16 * s, 11 * s, 11 * s, R.yellow)
    l.stamp(['K...K', '.K.K.', 'KKKKK', '..K..', 'KKKKK', '..K..'], 14 * s, 13 * s, { K: R.yellow[3] })
  })

/** Icon frames: a 32×32 canvas with the sprite centred. */
const icon = (src: Raster) => new Raster(32, 32).blit(src, Math.round((32 - src.w) / 2), Math.round((32 - src.h) / 2))

const PASSIVE_ICONS: Record<string, () => Raster> = {
  // 勤勉: an open book.
  p_diligent: () =>
    tiny(32, 32, (l) => {
      l.poly([4, 10, 16, 13, 16, 26, 4, 23], R.paper[0])
      l.poly([28, 10, 16, 13, 16, 26, 28, 23], R.paper[1])
      for (let k = 0; k < 3; k++) {
        l.line(7, 14 + k * 3, 13, 15 + k * 3, R.paper[3])
        l.line(19, 15 + k * 3, 25, 14 + k * 3, R.paper[3])
      }
      l.rect(3, 23, 26, 2, R.navy[1])
    }),
  // 頑固: a moai — a long stone head with a heavy brow, deep-set eyes and a long nose.
  p_stubborn: () =>
    tiny(32, 32, (l) => {
      l.poly([10, 4, 22, 4, 23, 28, 9, 28], R.paving[1])
      l.rect(9, 3, 14, 3, R.paving[0])
      shadeEdges(l, R.paving, 2, true)
      l.rect(10, 9, 12, 3, R.paving[0])
      l.rect(11, 12, 4, 3, R.metal[3])
      l.rect(17, 12, 4, 3, R.metal[3])
      l.poly([15, 12, 17, 12, 19, 21, 13, 21], R.paving[0])
      l.rect(12, 24, 8, 1, R.metal[3])
      l.rect(7, 13, 2, 9, R.paving[2])
    }),
  // 熱い: a flame.
  p_hot: () =>
    tiny(32, 32, (l) => {
      l.poly([16, 3, 24, 16, 23, 24, 16, 28, 9, 24, 8, 16, 12, 12], R.red[1])
      l.poly([16, 12, 20, 19, 19, 24, 16, 26, 13, 24, 12, 19], R.yellow[1])
      l.poly([16, 18, 18, 22, 16, 25, 14, 22], R.yellow[0])
    }),
  // 友人思い: two hearts.
  p_kind: () =>
    tiny(32, 32, (l) => {
      l.stamp(['.pp.pp.', 'pPPpPPp', 'pPPPPPp', '.pPPPp.', '..pPp..', '...p...'], 6, 9, { p: R.pink[2], P: R.pink[1] })
      l.stamp(['.pp.pp.', 'pPPpPPp', 'pPPPPPp', '.pPPPp.', '..pPp..', '...p...'], 16, 15, { p: R.red[2], P: R.red[1] })
    }),
  // がめつい: a coin with a greedy grin.
  p_greedy: () =>
    tiny(32, 32, (l) => {
      ball(l, 16, 16, 11, 11, R.yellow)
      l.stamp(['K...K', '.....', 'KKKKK', '.KwK.'], 14, 12, { ...KEY, w: C.white })
      l.rect(9, 9, 3, 3, R.yellow[0])
    }),
  // 図太い: an elephant's head.
  p_bold: () =>
    tiny(32, 32, (l) => {
      ball(l, 16, 13, 8, 7, R.metal)
      ball(l, 7, 13, 5, 6, R.metal, false)
      ball(l, 25, 13, 5, 6, R.metal, false)
      l.thick(16, 17, 17, 27, 4, R.metal[1])
      l.set(12, 12, C.inkCool)
      l.set(20, 12, C.inkCool)
    }),
  // 楽天家: a rainbow.
  p_optimist: () =>
    tiny(32, 32, (l) => {
      const bands = [R.red[1], R.orange[1], R.yellow[1], R.green[1], R.sky[1], R.purple[1]]
      bands.forEach((c, k) => {
        for (let a = Math.PI; a <= Math.PI * 2; a += 0.02)
          l.set(16 + Math.cos(a) * (13 - k), 24 + Math.sin(a) * (13 - k), c)
      })
    }),
  // 健康志向: broccoli.
  p_healthy: () =>
    tiny(32, 32, (l) => {
      l.thick(16, 18, 16, 28, 5, R.green[0])
      for (const [x, y] of [
        [10, 12],
        [16, 8],
        [22, 12],
        [13, 16],
        [19, 16]
      ])
        ball(l, x, y, 5, 5, R.green, false)
    })
}

/** The 16 pencil directions, shared by the renderer and the review tools. */
export const PENCIL_DIRS = 16

export function weaponSheets(): Record<string, () => Sheet> {
  const four = (make: (f: number) => Raster, fps: number) => loop([0, 1, 2, 3].map(make), fps)
  return {
    ...arsenalSheets(),
    'weapon:p_edu': () => ({ fly: four(book, 10) }),
    'weapon:p_free': () => ({ fly: four(balloon, 4) }),
    'weapon:p_over': () => ({ fly: loop([0, 1].map(shield), 3) }),
    'weapon:p_monster': () => ({ fly: four(parent, 10) }),
    'weapon:p_yankee': () => ({
      fly: four((f) => yankee(yankeeRun(f)), 14),
      kick: loop(
        [0, 1].map((f) => yankee(yankeeKick(f))),
        10
      ),
      walk: four((f) => yankee(yankeeStrut(f)), 7)
    }),
    'weapon:w_friend': () => ({
      fly: four((f) => friend(f, 0), 10),
      alt: four((f) => friend(f, 1), 10),
      alt2: four((f) => friend(f, 2), 10)
    }),
    'weapon:w_sports': () => ({ fly: four(soccer, 12) }),
    ...Object.fromEntries(
      SPORTS_FORMS.map((form) => [
        `weapon:w_sports_${form.key}`,
        () => ({ fly: four((frame) => sportsBall(form.key, frame), 12) })
      ])
    ),
    'weapon:w_study': () => ({
      fly: loop(
        Array.from({ length: PENCIL_DIRS }, (_, d) => pencilDir(d)),
        1
      )
    }),
    'weapon:w_love': () => ({ fly: four(wingedHeart, 8) }),
    'weapon:w_work': () => ({ fly: four(briefcase, 12) }),
    fx: () => ({
      wisp: loop([0, 1, 2].map(wisp), 6),
      skull: loop([skull()], 1),
      hand: loop([0, 1].map(hand), 8),
      sweat: loop([sweat()], 1),
      star: loop([0, 1].map(star), 6),
      controller: loop([controller()], 1),
      pixels: loop([R.pink[1], R.sky[1], R.yellow[1], R.mint[1]].map(pixel), 1),
      impact: loop([0, 1].map(impact), 12),
      bolt: loop([0, 1].map(bolt), 12),
      burst: loop([0, 1, 2].map(burst), 12),
      bills: loop([bills()], 1),
      coins: loop([0, 1, 2].map(coins), 10),
      ...arsenalFx()
    }),
    items: () => ({
      gem1: four((f) => gem(f, R.sky), 5),
      gem2: four((f) => gem(f, R.green), 5),
      gem3: four((f) => gem(f, R.red), 5),
      meal: loop([onigiri()], 1),
      chest: loop([gift()], 1),
      magnet: loop([magnet()], 1)
    }),
    icons: () => {
      const icons: Record<string, Raster> = {
        // 毒親: a purple poison bottle with a skull label.
        p_toxic: tiny(32, 32, (l) => {
          l.rect(13, 3, 6, 4, R.brown[1])
          l.rect(12, 7, 8, 4, R.purple[1])
          ball(l, 16, 20, 10, 9, R.purple)
          l.rect(10, 16, 12, 9, R.paper[0])
          l.stamp(['.www.', 'wKwKw', 'wwwww', '.w.w.'], 14, 17, { w: R.paper[1], K: C.inkCool })
          l.set(11, 13, R.purple[0])
          l.set(9, 23, R.mint[0])
        }),
        p_edu: icon(book(0)),
        p_free: icon(balloon(0)),
        p_weak: icon(new Raster(24, 24).blit(hand(0), 2, 6).blit(hand(1), 10, 4).blit(sweat(), 17, 14)),
        p_over: icon(shield(0)),
        p_monster: icon(parent(0)),
        p_yankee: icon(yankee(yankeeStrut(0))),
        p_rich: icon(new Raster(28, 28).blit(bills(), 4, 4).blit(coins(1), 0, 10)),
        p_gone: tiny(
          32,
          32,
          (l) => {
            // 蒸発済み: a faint figure dissolving into mist.
            for (let y = 6; y < 28; y++)
              for (let x = 10; x < 22; x++)
                if ((x * 3 + y * 7) % 5 === 0 && Math.hypot(x - 16, y - 13) < 10) l.set(x, y, R.metal[1])
            for (let k = 0; k < 3; k++) l.line(4 + k * 3, 24 + k, 26 - k * 2, 24 + k, R.paper[2])
          },
          false
        ),
        w_friend: icon(friend(0, 0)),
        w_sports: icon(soccer(0)),
        ...Object.fromEntries(SPORTS_FORMS.map((form) => [`w_sports_${form.key}`, icon(sportsBall(form.key, 0))])),
        p_petmemory: tiny(32, 32, (layer) => {
          ball(layer, 16, 21, 6, 5, R.brown)
          for (const [x, y] of [
            [7, 14],
            [13, 8],
            [20, 8],
            [26, 14]
          ])
            ball(layer, x, y, 3, 4, R.brown)
        }),
        w_study: icon(pencilDir(14)),
        w_love: icon(wingedHeart(0)),
        w_beauty: icon(new Raster(28, 28).blit(star(0), 4, 4).blit(star(1), 15, 10).blit(star(0), 8, 17)),
        w_hobby: icon(controller()),
        w_work: icon(briefcase(0)),
        w_invest: tiny(32, 32, (l) => {
          const pts = [4, 26, 12, 16, 18, 21, 27, 6]
          for (let k = 0; k + 2 < pts.length; k += 2) l.thick(pts[k], pts[k + 1], pts[k + 2], pts[k + 3], 3, R.green[1])
          l.poly([22, 5, 29, 4, 28, 11], R.green[1])
        }),
        meal: icon(onigiri(28)),
        coin: coin(32),
        ...Object.fromEntries(Object.entries(PASSIVE_ICONS).map(([id, make]) => [id, make()])),
        ...arsenalIcons()
      }
      return Object.fromEntries(Object.entries(icons).map(([id, r]) => [id, loop([r], 1)]))
    }
  }
}

/** The evolved look: a gold trim around the sprite and a few sparkles. */
const evolvedCache = new WeakMap<Raster, Raster>()
export function evolve(src: Raster) {
  let out = evolvedCache.get(src)
  if (out) return out
  const trim = new Raster(src.w, src.h)
  for (let y = 0; y < src.h; y++)
    for (let x = 0; x < src.w; x++)
      if (!src.get(x, y) && (src.get(x - 1, y) || src.get(x + 1, y) || src.get(x, y - 1) || src.get(x, y + 1)))
        trim.set(x, y, R.yellow[x + y < src.w ? 0 : 1])
  out = trim.blit(src)
  out.set(2, 3, C.white)
  out.set(src.w - 4, 5, R.yellow[0])
  out.set(src.w - 6, src.h - 4, C.white)
  evolvedCache.set(src, out)
  return out
}
