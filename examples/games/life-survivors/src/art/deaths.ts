import { C, R, dimTable, toneTable } from './palette'
import { Raster, ball, part, remap } from './raster'
import { car } from './enemies'
import { careerBody } from './careers'
import { CASUAL_ADULT, ELDER, KID, adult, baby, bed, bedPose, crawl, elder, kid, type BedPose } from './player'
import { STAGE_BODIES, STAGE_PAINTERS } from './people'
import { GROUND, dust, flatBody, headBox, human, lying, lyingBack, pose, sitting, type Body, type Pose } from './rig'
import type { Anim, Sheet } from './sheet'

/**
 * Death animations, chosen by the Tag of the enemy that dealt the final blow. Each death is built once as
 * a pose sequence plus props on the rig, so it renders for every upright body (幼児期 → 老後); the baby and
 * the bed have their own variants. Cartoon and non-graphic throughout. Falls are authored poses, darkening
 * and draining use palette remaps (no dither), fades are renderer alpha, and the frames never contain the
 * soul: the renderer floats it in with `soulAt`, using the anim's `soul` type.
 */

interface Kit {
  body: Body
  paint: (p: Pose) => Raster
}
type Extra = Pick<Anim, 'alpha' | 'lift' | 'soul'>

/**
 * Lettering (「グゥ〜」, 「不合格」, ！, ？) lives on its own layer per frame, so a left-facing (mirrored)
 * death mirrors the props but never the text: the renderer draws it unflipped at the mirrored spot.
 */
const LETTERS = new WeakMap<Raster, Raster>()
const keep = (from: Raster, to: Raster) => {
  const t = LETTERS.get(from)
  if (t) LETTERS.set(to, t)
  return to
}
function lettered(r: Raster, draw: (l: Raster) => void) {
  const t = LETTERS.get(r)?.clone() ?? new Raster(r.w, r.h)
  part(t, draw)
  const out = r.clone()
  LETTERS.set(out, t)
  return out
}

/** Keeps every death frame on the baseline (a deep kneel never sinks below the floor). */
function settle(r: Raster) {
  let maxY = -1
  r.map((c, _x, y) => ((maxY = Math.max(maxY, y)), c))
  return maxY > 58 ? keep(r, new Raster(r.w, r.h).blit(r, 0, 58 - maxY)) : r
}
const once = (frames: Raster[], fps: number, extra: Extra = {}): Anim => {
  const text = frames.map((f) => LETTERS.get(f))
  return {
    frames: frames.map(settle),
    fps,
    loop: false,
    ...(text.some(Boolean) ? { text } : {}),
    ...extra
  }
}
const fadeOut = (n: number, tail: number[]) => [...Array(n - tail.length).fill(1), ...tail]

// Palette remaps: uniform dimming, colour draining to grey, stone, white ash, a flushed face.
const INKS = new Set([C.inkCool, C.inkWarm, C.inkGreen])
const DIM = [dimTable(0.62), dimTable(0.38)]
const MUTED = toneTable([
  R.paper[1],
  R.paper[2],
  R.metal[1],
  R.metal[2],
  R.purple[2],
  R.hair[2],
  R.skin[2],
  R.brown[2],
  C.inkCool
])
const GREY = toneTable([R.metal[0], R.metal[1], R.metal[2], R.metal[3], C.inkCool])
const STONE = toneTable([R.paving[0], R.paving[1], R.paving[2], R.metal[2], R.metal[3], C.inkCool])
const WHITE = toneTable([C.white, R.paper[1], R.paper[2], R.paper[3]], 70)
const COOL = [
  R.metal[0],
  R.metal[1],
  R.metal[2],
  R.metal[3],
  R.navy[0],
  R.navy[1],
  R.navy[2],
  R.navy[3],
  R.paper[2],
  R.paper[3],
  R.hair[3],
  C.inkCool
]
/** A cool blue-grey night tint by brightness (two steps). */
const NIGHT = [toneTable(COOL, -12), toneTable(COOL, -40)]
const FLUSH = (() => {
  const t: number[] = Array.from({ length: 256 }, (_, i) => i)
  t[R.skin[0]] = R.skin[1]
  t[R.skin[1]] = R.orange[0]
  t[R.skin[2]] = R.orange[1]
  t[R.skin[3]] = R.orange[2]
  return t
})()
const tone = (r: Raster, table: readonly number[]) =>
  keep(
    r,
    r.clone().map((c) => table[c])
  )
function darken(r: Raster, steps: number) {
  if (steps >= 3) return r.map((c) => (INKS.has(c) ? C.inkCool : R.hair[3]))
  return remap(r, DIM[steps - 1])
}

const over = (base: Raster, draw: (l: Raster) => void, outline = true) => {
  const r = base.clone()
  part(r, draw, outline)
  return keep(base, r)
}
const under = (base: Raster, draw: (l: Raster) => void) => {
  const r = new Raster(base.w, base.h)
  part(r, draw)
  return keep(base, r.blit(base))
}

/** Shared pose shortcuts for a kit. */
function kitTools(k: Kit) {
  const P = (q: Partial<Pose> = {}) => k.paint(pose({ item: false, ...q }))
  const H = (q: Partial<Pose> = {}) => headBox(k.body, pose({ item: false, ...q }))
  /** A flushed red face for the pose that painted `r`. */
  const red = (r: Raster, q: Partial<Pose> = {}) => {
    const h = H(q)
    return r.map((c, x, y) => (y <= h.y + h.h + 1 && x >= h.x - 2 && x <= h.x + h.w + 2 ? FLUSH[c] : c))
  }
  const shoulderY = (q: Partial<Pose>) => k.body.hip + (q.kneel ?? 0) - k.body.torsoH + 2
  return { P, H, red, shoulderY }
}

/** stumble → buckle → reach → fall → impact (squash + dust) → settle. */
function fall(k: Kit, base: Partial<Pose>, o: { thin?: number; ground?: (l: Raster) => void } = {}) {
  const { P } = kitTools(k)
  const g = (r: Raster) => (o.ground ? under(r, o.ground) : r)
  const lie = (q: Parameters<typeof lying>[1]) => g(lying(k.body, { thin: o.thin, face: 'dead', ...q }))
  const impact = lie({ squash: 1, reach: 1.2 })
  dust(impact, 6, 56, 3)
  dust(impact, 52, 56, 3)
  const settled = lie({ reach: 1 })
  const settling = settled.clone()
  dust(settling, 5, 56, 2)
  return [
    P({ ...base, lean: 2, front: [4, 0], back: [-3, 1], handN: [-4, 8], handF: [5, 7], face: base.face ?? 'pain' }),
    P({
      ...base,
      kneel: 3,
      lean: 3,
      front: [-1, 0],
      back: [-4, 0],
      handN: [2, 9],
      handF: [3, 9],
      face: base.face ?? 'down'
    }),
    P({
      ...base,
      kneel: 5,
      lean: 6,
      front: [-4, 0],
      back: [-6, 0],
      handN: [7, 6],
      handF: [8, 5],
      face: base.face ?? 'pain'
    }),
    P({ ...base, kneel: 6, lean: 9, front: [-6, 0], back: [-7, 0], handN: [10, 3], handF: [11, 2], face: 'dead' }),
    impact,
    settling,
    settled
  ]
}

// ---------------------------------------------------------------------------------------------
// Small hand-drawn props and effects.

const GLYPHS: Record<string, string[]> = {
  '?': ['.KKK.', 'K...K', '...K.', '..K..', '..K..', '.....', '..K..'],
  '!': ['KK', 'KK', 'KK', 'KK', '..', 'KK'],
  不: ['KKKKKKK', '...KK..', '..K.K..', '.K..KK.', 'K...K.K', '....K..', '....K..'],
  合: ['...K...', '..K.K..', '.K...K.', 'K.KKK.K', '.......', '.KKKKK.', '.K...K.', '.KKKKK.'],
  格: ['.K..K..', 'KKK.KKK', '.K.K..K', 'KK..KK.', 'K.KK..K', '.K.KKKK', '.K.K..K', '.K.KKKK'],
  グ: ['.K..K.K', '.KKKK..', 'K...K..', '...K...', '..K....', 'KK.....'],
  ゥ: ['....', '..K.', 'KKKK', 'K..K', '..K.', '.K..'],
  '〜': ['.....', '.....', '.K...', 'K.K.K', '...K.', '.....']
}
function write(l: Raster, text: string, x: number, y: number, c: number) {
  for (const ch of text) {
    l.stamp(GLYPHS[ch], x, y, { K: c })
    x += GLYPHS[ch][0].length + 1
  }
}

/** ズーン: three clean vertical strokes. */
const gloom = (l: Raster, x: number, y: number) => {
  for (let i = 0; i < 3; i++) l.rect(x + i * 3, y + i, 1, 7 - i, R.purple[2])
}
function cloud(l: Raster, cx: number, y: number, size: number, dark = true) {
  const ramp = dark ? R.metal : R.paper
  ball(l, cx - 6 * size, y + 1, 5 * size, 3 * size, [ramp[1], ramp[2], ramp[3], ramp[3], ramp[4]], false)
  ball(l, cx + 1, y - 1, 6 * size, 4 * size, [ramp[1], ramp[2], ramp[3], ramp[3], ramp[4]], false)
  ball(l, cx + 7 * size, y + 1, 4 * size, 3 * size, [ramp[1], ramp[2], ramp[3], ramp[3], ramp[4]], false)
}
function rain(l: Raster, cx: number, top: number, phase: number) {
  for (let k = 0; k < 6; k++) {
    const x = cx - 9 + k * 4
    const y = top + ((phase * 5 + k * 7) % Math.max(6, GROUND - 4 - top))
    l.rect(x, y, 1, 3, R.sky[1])
  }
}
const puff = (l: Raster, x: number, y: number, s: number, c = R.paper[1]) => {
  l.ellipse(x, y, s, s * 0.8, c)
  l.ellipse(x + s * 0.8, y - s * 0.4, s * 0.7, s * 0.6, c)
}
function bubbleDart(l: Raster, x: number, y: number, dir: 1 | -1) {
  l.ellipse(x, y, 4, 3, R.purple[1])
  l.poly([x + dir * 3, y - 1, x + dir * 7, y, x + dir * 3, y + 1], R.purple[2])
  l.rect(x - 2, y - 1, 4, 1, R.purple[3])
  l.rect(x - 2, y + 1, 3, 1, R.purple[3])
}
function heart(l: Raster, cx: number, y: number, state: number) {
  const s = ['.rr.rr.', 'rRRrRRr', 'rRRRRRr', '.rRRRr.', '..rRr..', '...r...']
  if (state === 0 || state === 1) l.stamp(s, cx - 3, y, { r: R.red[2], R: R.red[1] })
  if (state === 1) l.line(cx, y + 1, cx - 1, y + 3, C.white)
  if (state === 2) {
    l.stamp(
      s.map((row) => row.slice(0, 4)),
      cx - 5,
      y + 1,
      { r: R.red[2], R: R.red[1] }
    )
    l.stamp(
      s.map((row) => row.slice(3)),
      cx + 1,
      y,
      { r: R.red[2], R: R.red[1] }
    )
  }
  if (state >= 3)
    for (const [dx, dy] of [
      [-6, 6],
      [-1, 9],
      [4, 7],
      [7, 11]
    ])
      l.rect(cx + dx, y + dy + (state - 3) * 4, 2, 2, R.red[1])
}
function paperStack(l: Raster, x: number, h: number) {
  if (h <= 0) return
  l.rect(x, GROUND - 1 - h, 12, h, R.paper[1])
  for (let y = GROUND - 1 - h + 2; y < GROUND - 1; y += 2) l.rect(x, y, 12, 1, R.paper[2])
  l.rect(x, GROUND - 1 - h, 12, 1, R.paper[0])
}
function miniKid(l: Raster, x: number, y: number, shirt: number, hair: number) {
  l.rect(x - 2, y + 4, 5, 4, shirt)
  l.rect(x - 2, y + 8, 2, 2, R.navy[1])
  l.rect(x + 1, y + 8, 2, 2, R.navy[1])
  l.ellipse(x + 0.5, y + 1.5, 3.5, 3.5, R.skin[1])
  l.rect(x - 2, y - 2, 6, 2, hair)
  l.set(x + 1, y + 2, C.inkCool)
  l.set(x + 3, y + 2, C.inkCool)
}
const KID_COLOURS = [R.orange[1], R.mint[1], R.pink[1], R.yellow[1], R.sky[1], R.green[1]]
const KID_HAIR = [R.hair[2], R.brown[1], R.hair[2], R.brown[2], R.hair[2], R.brown[1]]

function bowl(l: Raster) {
  l.rect(52, 52, 9, 4, R.paper[1])
  l.rect(53, 56, 7, 1, R.paper[2])
  l.rect(52, 51, 9, 1, R.paper[2])
  l.rect(53, 52, 7, 1, R.paper[3])
  l.rect(52, 54, 9, 1, R.navy[1])
  l.line(47, 57, 58, 50, R.brown[1])
}
function fly(r: Raster, x: number, y: number, up: boolean) {
  r.rect(x, y, 2, 1, C.inkCool)
  r.set(x, up ? y - 1 : y + 1, R.paper[2])
  r.set(x + 1, up ? y - 1 : y + 1, R.paper[2])
}
function rubble(l: Raster, size: number) {
  for (const [x, y, w, h] of [
    [20, 50, 10, 7],
    [30, 47, 12, 10],
    [41, 51, 8, 6],
    [26, 44, 8, 6],
    [35, 42, 7, 6]
  ])
    if (size > 0) {
      l.rect(x, y, w, h, R.paving[1])
      l.rect(x, y, w, 1, R.paving[0])
      l.rect(x + w - 1, y, 1, h, R.paving[2])
    }
  for (const [x, y] of [
    [14, 55],
    [50, 55],
    [17, 52]
  ])
    l.rect(x, y, 3, 2, R.paving[2])
}
function cracks(l: Raster, cx: number, top: number, n: number) {
  const lines = [
    [cx, top + 4, cx - 3, top + 12],
    [cx - 3, top + 12, cx + 1, top + 20],
    [cx + 2, top + 22, cx - 2, top + 32],
    [cx - 6, top + 26, cx + 4, top + 36]
  ]
  for (const [x0, y0, x1, y1] of lines.slice(0, n)) l.line(x0, y0, x1, y1, C.inkCool)
}

// ---------------------------------------------------------------------------------------------
// The per-tag deaths for upright bodies.

/** 人間関係, adults: 首吊り. Readable but restrained: hemp rope from above, silhouette, lifted, a gentle sway. */
function hang(k: Kit) {
  const { P, H } = kitTools(k)
  const head = H({ headBob: 1, head: [0, 1] })
  const x0 = Math.round(head.cx)
  // Just below the drooped chin, on the collar.
  const neck = Math.round(head.y + head.h) + 1
  const sad = (q: Partial<Pose> = {}) => P({ face: 'down', headBob: 1, head: [0, 1], ...q })
  /** The rope hangs from above in light hemp; at the neck it reads as a light loop. */
  const roped = (body: Raster, end: number, sway = 0, noose = false) => {
    const r = new Raster(body.w, body.h)
    part(r, (l) => {
      for (let y = 0; y <= end - 4; y++) {
        const px = Math.round(x0 + (sway * y) / Math.max(1, end))
        l.set(px, y, y < 3 ? R.brown[2] : R.brown[0])
        l.set(px + 1, y, y < 3 ? R.brown[2] : R.yellow[2])
      }
      if (!noose) {
        l.ellipse(x0 + sway + 0.5, end - 1, 3, 3.5, R.brown[0])
        l.ellipse(x0 + sway + 0.5, end - 1, 1.6, 2.2, 0)
      }
    })
    r.blit(body)
    if (noose)
      part(r, (l) => {
        // A light collar band with the knot at the side.
        l.rect(x0 + sway - 4, end, 9, 1, R.brown[0])
        l.rect(x0 + sway + 4, end - 2, 2, 2, R.brown[0])
      })
    return r
  }
  const frames: Raster[] = []
  const lift: number[] = []
  const push = (r: Raster, l = 0) => (frames.push(r), lift.push(l))
  push(sad())
  push(over(sad({ tear: true }), (l) => gloom(l, head.x - 10, head.y + 2)))
  push(
    over(sad({ tear: true }), (l) => {
      gloom(l, head.x - 10, head.y + 2)
      cloud(l, head.cx, Math.max(4, head.y - 5), 0.7)
    })
  )
  for (const end of [8, 16]) push(roped(sad(), end))
  push(roped(sad(), neck, 0, true))
  for (const steps of [1, 2, 3]) push(roped(darken(sad({ face: 'none' }), steps), neck, 0, true))
  // Limp: arms hang, head tilts, feet dangle 10–12px above the floor (the shadow stays below).
  const hung = (up: number, sway: number) =>
    roped(
      darken(
        sad({
          face: 'none',
          y: -up,
          x: sway,
          head: [1, 2],
          handN: [1, 12],
          handF: [-1, 12],
          front: [0, 0],
          back: [1, 0]
        }),
        3
      ),
      neck - up,
      sway,
      true
    )
  push(hung(5, 0), 5)
  push(hung(11, 0), 11)
  for (const s of [2, 3, 2, 0, -2, -3, -2, 0]) push(hung(11, s), 11)
  return once(frames, 8, { alpha: fadeOut(frames.length, [0.66, 0.33, 0]), lift })
}

/** 人間関係, minors: ひとりぼっち — sits hugging their knees under a rain cloud of their own; colour drains; fade. */
function alone(k: Kit) {
  const { P, H } = kitTools(k)
  const sit = sitting(k.body, { hug: true })
  const half: Partial<Pose> = {
    kneel: Math.round((sit.kneel ?? 0) / 2),
    face: 'down',
    front: [3, 0],
    back: [5, 0],
    lean: 2,
    handN: [2, 8],
    handF: [3, 8]
  }
  const head = H(sit)
  const top = Math.max(5, head.y - 6)
  const rained = (base: Raster, i: number, size = 1) =>
    over(base, (l) => {
      cloud(l, head.cx, top, size)
      if (size >= 1) rain(l, head.cx, top + 4, i)
    })
  const frames = [P({ face: 'down' }), P(half), P(sit), P({ ...sit, tear: true })]
  frames.push(
    over(P(sit), (l) => cloud(l, head.cx, top, 0.5)),
    over(P(sit), (l) => cloud(l, head.cx, top, 0.8))
  )
  for (let i = 0; i < 4; i++) frames.push(rained(P({ ...sit, tear: i % 2 === 0 }), i))
  frames.push(rained(tone(P(sit), MUTED), 4), rained(tone(P(sit), GREY), 5))
  for (let i = 0; i < 6; i++) frames.push(rained(tone(P(sit), GREY), 6 + i))
  return once(frames, 8, { alpha: fadeOut(frames.length, [0.75, 0.5, 0.25, 0]) })
}

/** お金: 餓死 — グゥ〜, hand on the stomach, sweat, the body thinning, knees give out, the fall, flies. */
function starve(k: Kit) {
  const { P, H } = kitTools(k)
  const head = H()
  const withBowl = (r: Raster) => under(r, bowl)
  const bx = Math.min(42, Math.round(head.x + head.w - 4))
  const by = Math.max(1, head.y - 11)
  const bubble = (r: Raster) =>
    lettered(
      over(r, (l) => {
        l.rect(bx, by, 21, 9, R.paper[0])
        l.poly([bx + 2, by + 9, bx + 6, by + 9, bx + 1, by + 12], R.paper[0])
      }),
      (l) => write(l, 'グゥ〜', bx + 2, by + 1, C.inkCool)
    )
  const sweat = (r: Raster) =>
    over(r, (l) => l.stamp(['.c', 'cc', 'cc'], Math.min(60, head.x + head.w), head.y + 2, { c: R.mint[0] }))
  const belly: Partial<Pose> = { handN: [7, 6], handF: [-2, 7] }
  const frames = [
    withBowl(P({ face: 'open' })),
    withBowl(bubble(P({ ...belly, face: 'down', bob: 1 }))),
    withBowl(sweat(bubble(P({ ...belly, face: 'down', lean: -1, thin: 0.25 })))),
    withBowl(sweat(P({ ...belly, face: 'down', lean: 1, thin: 0.5 }))),
    withBowl(bubble(P({ ...belly, face: 'pain', lean: -1, thin: 0.75 }))),
    withBowl(sweat(P({ ...belly, face: 'down', lean: 1, thin: 1 }))),
    withBowl(P({ ...belly, face: 'down', thin: 1, kneel: 2, lean: 1 })),
    ...fall(k, { thin: 1 }, { thin: 1, ground: bowl })
  ]
  const lyingFrame = frames[frames.length - 1]
  for (let i = 0; i < 4; i++) {
    const r = lyingFrame.clone()
    const a = i * 1.4
    fly(r, Math.round(30 + Math.cos(a) * 10), Math.round(42 + Math.sin(a) * 3), i % 2 === 0)
    if (i > 0) fly(r, Math.round(30 - Math.cos(a) * 8), Math.round(39 - Math.sin(a) * 2), i % 2 === 1)
    frames.push(r)
  }
  return once(frames, 8)
}

/** 事故: 轢かれる — a car streaks across, the body spins up in clean quarter turns, lands paper-thin, peels. */
function runover(k: Kit) {
  const { P, H } = kitTools(k)
  const head = H()
  const withCar = (r: Raster, x: number, i: number) => {
    const out = r.clone().blit(car(i % 4), x, 0)
    part(
      out,
      (l) => {
        for (const y of [36, 42, 48]) l.rect(Math.max(0, x - 10), y, 8, 1, R.paper[2])
      },
      false
    )
    return out
  }
  const spin = (turns: number, up: number) => {
    let r = P({ face: 'pain', handN: [-5, -2], handF: [5, -2], front: [3, 2], back: [-3, 2] })
    for (let t = 0; t < turns; t++) r = r.rot90(1)
    const out = new Raster(64, 64).blit(r, 0, -up)
    part(
      out,
      (l) => {
        // Smear arcs around the spin.
        for (let a = 0; a < Math.PI; a += 0.15)
          l.set(32 + Math.cos(a + turns) * 22, 30 - up + Math.sin(a + turns) * 16, R.paper[2])
      },
      false
    )
    return out
  }
  const flat = (o: Parameters<typeof flatBody>[1]) => flatBody(k.body, o)
  const landed = flat({})
  dust(landed, 8, 56, 3)
  dust(landed, 56, 56, 3)
  const frames = [
    lettered(P({ face: 'open' }), (l) => write(l, '!', Math.round(head.x + head.w), Math.max(1, head.y - 4), R.red[1])),
    withCar(P({ face: 'pain', lean: -1 }), -46, 0),
    over(withCar(P({ face: 'pain', lean: -2, squash: 1 }), -22, 1), (l) => {
      for (let a = 0; a < Math.PI * 2; a += Math.PI / 4)
        l.line(30 + Math.cos(a) * 3, 40 + Math.sin(a) * 3, 30 + Math.cos(a) * 7, 40 + Math.sin(a) * 7, R.yellow[0])
    }),
    withCar(spin(1, 16), 8, 2),
    withCar(spin(2, 22), 36, 3),
    spin(3, 16),
    spin(4, 6),
    landed,
    flat({ tracks: true }),
    flat({ tracks: true }),
    flat({ tracks: true }),
    flat({ tracks: true, peel: 1 }),
    flat({ tracks: true, peel: 2 }),
    flat({ tracks: true, peel: 2 }),
    flat({ tracks: true, peel: 2 }),
    flat({ tracks: true, peel: 2 })
  ]
  return once(frames, 10, { lift: [0, 0, 0, 16, 22, 16, 6, 0, 0, 0, 0, 0, 0, 0, 0, 0] })
}

/** 病気: 病死 — the face reddens, a thermometer pops out, coughing, sways, falls back; a ghost rises. */
function illness(k: Kit) {
  const { P, H, red } = kitTools(k)
  const sick = (q: Partial<Pose>, o: { thermo?: boolean; cough?: number } = {}) => {
    const r = red(P(q), q)
    const m = H(q).mouth
    return over(r, (l) => {
      if (o.thermo) {
        l.line(m.x + 1, m.y, m.x + 7, m.y - 2, C.white)
        l.rect(m.x + 7, m.y - 3, 2, 2, R.red[1])
      }
      if (o.cough) puff(l, m.x + 6 + o.cough * 2, m.y + 1, 1.5 + o.cough, R.paper[1])
    })
  }
  // Falls backward onto the back, face up.
  const back = (squash: number) => lyingBack(k.body, { squash })
  const impact = back(1)
  dust(impact, 8, 56, 3)
  dust(impact, 54, 56, 3)
  const settling = back(0)
  dust(settling, 7, 56, 2)
  const frames = [
    P({ face: 'open' }),
    sick({ face: 'down' }),
    sick({ face: 'down' }, { thermo: true }),
    sick({ face: 'pain', lean: -1 }, { thermo: true, cough: 1 }),
    sick({ face: 'pain', squash: 1, bob: 1 }, { thermo: true, cough: 2 }),
    sick({ face: 'down', lean: 2 }, { thermo: true }),
    sick({ face: 'spiral', lean: -2 }, { thermo: true }),
    sick({ face: 'spiral', kneel: 3, lean: -3 }),
    sick({ face: 'dead', kneel: 5, lean: -6, handN: [-5, 3], handF: [-4, 3] }),
    impact,
    settling,
    back(0)
  ]
  const last = frames[frames.length - 1]
  return once([...frames, last, last, last], 8, { soul: 'ghost' })
}

/** 悪口: 心が砕ける — word-bubbles fly in and stick like darts, the body turns to stone, cracks, crumbles. */
function shatter(k: Kit) {
  const { P, H } = kitTools(k)
  const head = H()
  const ty = head.y + head.h + 4
  const stuck = [
    [20, ty, 1],
    [44, ty + 3, -1],
    [22, ty + 9, 1],
    [43, ty + 11, -1]
  ] as const
  const darts = (base: Raster, n: number, flying: number) =>
    over(base, (l) => {
      for (const [x, y, d] of stuck.slice(0, n)) bubbleDart(l, x, y, d)
      if (flying) {
        bubbleDart(l, 4 + flying * 4, ty + 2, 1)
        bubbleDart(l, 60 - flying * 4, ty + 8, -1)
      }
    })
  const stone = (n: number) =>
    over(
      tone(darts(P({ face: 'pain', lean: -1 }), 4, 0), STONE),
      (l) => cracks(l, Math.round(head.cx), head.y, n),
      false
    )
  const pile = (s: number) =>
    over(new Raster(64, 64), (l) => {
      rubble(l, 1)
      if (s) puff(l, 32, 44, 2 + s * 2, R.paper[2])
    })
  return once(
    [
      P({ face: 'open' }),
      darts(P({ face: 'pain' }), 0, 1),
      darts(P({ face: 'pain' }), 0, 3),
      darts(P({ face: 'pain', lean: -1 }), 2, 1),
      darts(P({ face: 'pain', lean: -1 }), 2, 3),
      darts(P({ face: 'pain', lean: -1, squash: 1 }), 4, 0),
      tone(darts(P({ face: 'pain', lean: -1 }), 4, 0), MUTED),
      stone(0),
      stone(2),
      stone(4),
      pile(3),
      pile(2),
      pile(1),
      pile(0),
      pile(0),
      pile(0)
    ],
    9
  )
}

/** 仕事: 過労死 — paper stacks rise around them, frantic typing, eye bags darken, slumps onto the pile, buried. */
function overwork(k: Kit) {
  const { P, shoulderY } = kitTools(k)
  const sit = sitting(k.body)
  const typing = (q: Partial<Pose> = {}) => ({
    ...sit,
    handN: [7, 2] as [number, number],
    handF: [9, 1] as [number, number],
    face: 'down' as const,
    lean: 2,
    ...q
  })
  const sy = shoulderY(sit) + 3
  const stacks = (r: Raster, n: number, smear = false) =>
    over(r, (l) => {
      paperStack(l, 4, n * 4)
      paperStack(l, 48, n * 5)
      if (n > 3) paperStack(l, 16, (n - 3) * 4)
      if (smear) for (let k2 = 0; k2 < 3; k2++) l.rect(38 + k2, sy + k2 * 2, 8, 1, R.paper[2])
    })
  const mound = (sheet: number) =>
    over(stacks(P({ ...sit, lean: 9, kneel: (sit.kneel ?? 0) + 1, face: 'dead', head: [2, 3] }), 6), (l) => {
      for (const [x, y, w] of [
        [16, 44, 14],
        [26, 40, 16],
        [34, 46, 14],
        [22, 50, 18],
        [30, 36, 12]
      ]) {
        l.rect(x, y, w, 7, R.paper[1])
        l.rect(x, y, w, 1, R.paper[0])
        l.rect(x + 2, y + 3, w - 4, 1, R.paper[2])
      }
      if (sheet >= 0) {
        const fx = 40 - sheet * 3
        const fy = 6 + sheet * 7
        l.poly([fx, fy, fx + 8, fy - 2 + (sheet % 2) * 3, fx + 9, fy + 4, fx + 1, fy + 6], R.paper[0])
      }
    })
  return once(
    [
      P({ face: 'open' }),
      stacks(P(typing()), 1),
      stacks(P(typing({ handN: [8, 1] })), 2, true),
      stacks(P(typing({ thin: 0.6 })), 3, true),
      stacks(P(typing({ thin: 1, handN: [8, 1] })), 4, true),
      stacks(P(typing({ thin: 1 })), 5, true),
      stacks(P(typing({ thin: 1, face: 'dead', lean: 5, head: [1, 3] })), 6),
      stacks(P({ ...sit, lean: 9, kneel: (sit.kneel ?? 0) + 1, face: 'dead', head: [2, 3], thin: 1 }), 6),
      mound(-1),
      mound(0),
      mound(1),
      mound(2),
      mound(3),
      mound(4),
      mound(5),
      mound(5)
    ],
    9
  )
}

/** 恋愛: 失恋 — the heart above the head cracks and shatters, an orz kneel, white ash that blows away. */
function heartbreak(k: Kit) {
  const { P, H, shoulderY } = kitTools(k)
  const head = H()
  const hy = Math.max(1, head.y - 9)
  const orz: Partial<Pose> = {
    kneel: 6,
    lean: 9,
    front: [-6, 0],
    back: [-7, 0],
    face: 'down',
    handN: [9, GROUND - 3 - shoulderY({ kneel: 6 })],
    handF: [10, GROUND - 3 - shoulderY({ kneel: 6 })]
  }
  const withHeart = (q: Partial<Pose>, state: number) => over(P(q), (l) => heart(l, Math.round(head.cx), hy, state))
  const ash = tone(P(orz), WHITE)
  const blow = (cut: number) => {
    const r = ash.clone().map((c, x) => (x > cut ? 0 : c))
    part(
      r,
      (l) => {
        for (let p = 0; p < 7; p++) l.rect(cut + 4 + p * 4 + (p % 3), 30 + ((p * 7) % 20), 2, 1, R.paper[1])
      },
      false
    )
    return r
  }
  return once(
    [
      withHeart({ face: 'open' }, 0),
      withHeart({ face: 'open', bob: 1 }, 0),
      withHeart({ face: 'down' }, 1),
      withHeart({ face: 'pain' }, 2),
      withHeart({ face: 'pain' }, 3),
      withHeart({ face: 'down', kneel: 3, lean: 3 }, 4),
      P(orz),
      P(orz),
      tone(P(orz), MUTED),
      ash,
      ash,
      blow(50),
      blow(40),
      blow(30),
      blow(20),
      blow(8),
      blow(-4)
    ],
    9
  )
}

/** 子育て: 育児疲れ — mini kids and toys dogpile from both sides; one arm sticks out and goes limp. */
function dogpile(k: Kit) {
  const { P, H } = kitTools(k)
  const head = H()
  const kidsAt = (l: Raster, spots: number[][]) =>
    spots.forEach(([x, y], i) => miniKid(l, x, y, KID_COLOURS[i % 6], KID_HAIR[i % 6]))
  const pile = (bounce: number, arm: 'up' | 'limp') =>
    over(new Raster(64, 64), (l) => {
      if (arm === 'up') {
        l.thick(36, 40, 39, 20, 4, k.body.sleeve[1])
        l.ellipse(39.5, 18.5, 2.4, 2.4, R.skin[1])
      } else {
        l.thick(36, 40, 39, 30, 4, k.body.sleeve[1])
        l.thick(39, 30, 44, 33, 3, k.body.sleeve[1])
        l.ellipse(45, 34, 2.2, 2.2, R.skin[1])
      }
      kidsAt(l, [
        [16, 46 - bounce],
        [26, 44],
        [36, 46 - (bounce ? 0 : 1)],
        [46, 46],
        [21, 37 - bounce],
        [31, 35],
        [41, 37 - bounce],
        [27, 27 + bounce]
      ])
      box(l, 50, 52, 6, 5, R.red)
      ball(l, 12, 54, 3, 3, R.yellow, false)
    })
  return once(
    [
      P({ face: 'open' }),
      over(P({ face: 'pain' }), (l) =>
        kidsAt(l, [
          [4, 46],
          [58, 46]
        ])
      ),
      over(P({ face: 'pain', lean: -1 }), (l) =>
        kidsAt(l, [
          [12, 44],
          [52, 44],
          [6, 46]
        ])
      ),
      over(P({ face: 'pain', kneel: 2, squash: 1 }), (l) =>
        kidsAt(l, [
          [24, head.y + 6],
          [40, head.y + 8],
          [14, 46],
          [50, 46]
        ])
      ),
      over(P({ face: 'pain', kneel: 4, lean: 2 }), (l) =>
        kidsAt(l, [
          [22, head.y + 8],
          [40, head.y + 10],
          [30, head.y + 2],
          [14, 46],
          [50, 46],
          [32, 46]
        ])
      ),
      pile(0, 'up'),
      pile(1, 'up'),
      pile(0, 'up'),
      pile(1, 'up'),
      pile(0, 'limp'),
      pile(0, 'limp'),
      pile(0, 'limp'),
      pile(0, 'limp'),
      pile(0, 'limp')
    ],
    9
  )
}

/** 試験: 燃え尽き — a 不合格 stamp slams down, they sit slumped, colour drains to white, ash wisps rise. */
function burnout(k: Kit) {
  const { P, H } = kitTools(k)
  const head = H()
  const sx = Math.round(head.cx) - 8
  const stamp = (r: Raster, y: number, impact = false) =>
    over(r, (l) => {
      l.rect(sx + 5, y - 10, 6, 10, R.brown[1])
      l.ellipse(sx + 8, y - 11, 5, 2.5, R.brown[1])
      l.rect(sx, y, 16, 6, R.red[2])
      l.rect(sx, y, 16, 1, R.red[1])
      if (impact) for (const d of [-1, 1]) l.line(sx + 8 + d * 10, y + 6, sx + 8 + d * 15, y + 10, R.yellow[0])
    })
  const verdict = (r: Raster) =>
    lettered(
      over(r, (l) => {
        l.rect(5, 2, 33, 12, R.paper[0])
        l.rect(5, 2, 33, 1, R.red[1])
        l.rect(5, 13, 33, 1, R.red[1])
      }),
      (l) => write(l, '不合格', 7, 4, R.red[1])
    )
  const slump = sitting(k.body, { slump: 3 })
  const wisps = (r: Raster, i: number) =>
    over(
      r,
      (l) => {
        for (let w = 0; w < 3; w++) {
          const y = 30 - ((i * 4 + w * 9) % 26)
          l.line(24 + w * 8, y, 25 + w * 8 + (i % 2), y - 4, R.paper[2])
        }
      },
      false
    )
  return once(
    [
      P({ face: 'open' }),
      stamp(P({ face: 'open' }), Math.max(10, head.y - 14)),
      stamp(P({ face: 'pain' }), Math.max(10, head.y - 6)),
      stamp(P({ face: 'pain', squash: 2, kneel: 2 }), head.y + 2, true),
      verdict(P({ face: 'spiral', kneel: 1 })),
      verdict(P(slump)),
      verdict(P(slump)),
      tone(P(slump), MUTED),
      tone(P(slump), WHITE),
      wisps(tone(P(slump), WHITE), 0),
      wisps(tone(P(slump), WHITE), 1),
      wisps(tone(P(slump), WHITE), 2),
      wisps(tone(P(slump), WHITE), 3),
      wisps(tone(P(slump), WHITE), 4)
    ],
    8
  )
}

/** スポーツ: 熱中症 — sun rays and shimmer, sweat spray, spiral eyes, staggers, falls face down, steam, a puddle. */
function heatstroke(k: Kit) {
  const { P, H, red } = kitTools(k)
  const head = H()
  const sun = (r: Raster, i: number, sweat = 0) =>
    over(
      r,
      (l) => {
        for (let a = 0.1; a < 1.5; a += 0.28)
          l.line(
            Math.cos(a) * 6,
            Math.sin(a) * 6,
            Math.cos(a) * (14 + (i % 2) * 2),
            Math.sin(a) * (14 + (i % 2) * 2),
            R.yellow[1]
          )
        l.ellipse(0, 0, 5, 5, R.yellow[0])
        for (let x = 6; x < 60; x += 9) l.line(x, 52 + ((x + i) % 3), x + 3, 52 + ((x + i + 1) % 3), R.paper[2])
        for (let s = 0; s < sweat; s++)
          l.stamp(['.c', 'cc'], head.x + head.w - 2 + s * 4, head.y + 2 + ((s * 5 + i) % 6), { c: R.mint[0] })
      },
      false
    )
  const down = fall(k, { face: 'spiral' })
  const lyingFrame = down[down.length - 1]
  const steam = (i: number) =>
    over(
      under(lyingFrame, (l) => l.ellipse(34, 57, 16, 2, R.mint[1])),
      (l) => {
        for (let w = 0; w < 3; w++) puff(l, 22 + w * 10 + (i % 2), 40 - ((i * 3 + w * 4) % 12), 1.5, R.paper[1])
      }
    )
  return once(
    [
      sun(P({ face: 'open' }), 0),
      sun(P({ face: 'down' }), 1, 1),
      sun(P({ face: 'pain' }), 2, 3),
      sun(red(P({ face: 'spiral' }), { face: 'spiral' }), 3, 3),
      sun(red(P({ face: 'spiral', lean: -2, x: -1 }), { face: 'spiral', lean: -2, x: -1 }), 4, 2),
      sun(red(P({ face: 'spiral', lean: 2, x: 1 }), { face: 'spiral', lean: 2, x: 1 }), 5, 2),
      ...down,
      steam(0),
      steam(1),
      steam(2),
      steam(3)
    ],
    9
  )
}

/** 授業: 知恵熱 — ？ marks pile up, the head reddens, steam from the ears, smoke like an overheated engine. */
function overheat(k: Kit) {
  const { P, H, red } = kitTools(k)
  const head = H()
  const qs = (r: Raster, n: number) =>
    lettered(r, (l) => {
      for (let q = 0; q < n; q++)
        write(
          l,
          '?',
          Math.round(head.cx) - 9 + q * 6,
          Math.max(0, head.y - 9 - (q % 2) * 2),
          q === 1 ? R.yellow[1] : C.white
        )
    })
  const hot = (q: Partial<Pose>, steamy: number, smoke: number) =>
    over(red(P(q), q), (l) => {
      const h = H(q)
      if (steamy) {
        puff(l, h.x - 2, h.y + 8 - steamy, 1.5 + steamy * 0.5, R.paper[1])
        puff(l, h.x + h.w + 2, h.y + 8 - steamy, 1.5 + steamy * 0.5, R.paper[1])
      }
      for (let s = 0; s < smoke; s++) puff(l, h.cx - 4 + s * 5, Math.max(3, h.y - 4 - s * 4), 2 + s * 0.5, R.metal[2])
    })
  const down = fall(k, { face: 'spiral' })
  const lyingFrame = down[down.length - 1]
  const smoking = (i: number) => over(lyingFrame, (l) => puff(l, 44 + (i % 2), 40 - i * 3, 2 + i * 0.4, R.metal[2]))
  return once(
    [
      P({ face: 'open' }),
      qs(P({ face: 'open' }), 1),
      qs(P({ face: 'down' }), 2),
      qs(P({ face: 'pain' }), 3),
      qs(red(P({ face: 'pain' }), {}), 3),
      hot({ face: 'pain' }, 1, 0),
      hot({ face: 'spiral' }, 2, 1),
      hot({ face: 'spiral', bob: 1 }, 3, 2),
      ...down.slice(1),
      smoking(0),
      smoking(1),
      smoking(2),
      smoking(3)
    ],
    9
  )
}

/** Generic collapse for any humanoid body (killers without their own death). */
function collapse(k: Kit) {
  const frames = [
    k.paint(pose({ item: false, face: 'pain', lean: -2, squash: 1, bob: 1, handN: [-4, 8], handF: [4, 8] })),
    ...fall(k, {})
  ]
  const last = frames[frames.length - 1]
  return once([...frames, last, last, last, last, last, last], 10)
}

/** Oblique toy box used in the dogpile. */
function box(r: Raster, x: number, y: number, w: number, h: number, ramp: readonly number[]) {
  r.rect(x, y, w, h, ramp[1])
  r.rect(x, y, w, 1, ramp[0])
  r.rect(x + w - 1, y, 1, h, ramp[2])
}

// ---------------------------------------------------------------------------------------------
// Special bodies: the baby and the bed.

function babyDeaths(): Sheet {
  const pelted = (n: number, flying: number, face: 'pain' | 'open' = 'pain', sink = 0) =>
    over(baby(crawl({ face, tilt: 1, sink })), (l) => {
      for (const [x, y, d] of [
        [24, 40, 1],
        [46, 44, -1],
        [30, 34, 1]
      ].slice(0, n))
        bubbleDart(l, x, y, d as 1 | -1)
      if (flying) {
        bubbleDart(l, 2 + flying * 5, 36, 1)
        bubbleDart(l, 62 - flying * 5, 42, -1)
      }
    })
  const crying = (i: number, sink: number) =>
    over(
      baby(crawl({ face: 'pain', tilt: 2, sink })),
      (l) => {
        l.rect(37, 44 + (i % 2), 1, 4, R.sky[1])
        l.rect(46, 44 + ((i + 1) % 2), 1, 4, R.sky[1])
      },
      false
    )
  const sneeze = (q: Parameters<typeof crawl>[0], p: number) =>
    over(baby(crawl(q)), (l) => {
      if (p) {
        puff(l, 54 + p, 46, 1.2 + p * 0.6, R.paper[1])
        l.rect(52 + p * 2, 42, 2, 2, R.mint[0])
      }
    })
  const asleep = baby(crawl({ face: 'calm', sink: 1, hands: [4, 0, 4, 0], lag: 1 }))
  const illness = once(
    [
      baby(crawl({ face: 'open' })),
      sneeze({ face: 'blink', tilt: 2 }, 0),
      sneeze({ face: 'pain', tilt: -1 }, 2),
      sneeze({ face: 'down' }, 1),
      sneeze({ face: 'pain', tilt: 1 }, 2),
      baby(crawl({ face: 'down', bob: 1 })),
      baby(crawl({ face: 'down', sink: 0.35 })),
      baby(crawl({ face: 'calm', sink: 0.7 })),
      asleep,
      asleep,
      asleep,
      asleep,
      asleep,
      asleep
    ],
    8,
    { soul: 'ghost' }
  )
  const shatterAnim = once(
    [
      baby(crawl({ face: 'open' })),
      pelted(0, 1, 'open'),
      pelted(0, 3),
      pelted(1, 1),
      pelted(2, 3),
      pelted(3, 0),
      crying(0, 0),
      crying(1, 0),
      crying(2, 0.3),
      crying(3, 0.6),
      crying(4, 1),
      crying(5, 1),
      crying(6, 1),
      crying(7, 1),
      crying(8, 1),
      crying(9, 1)
    ],
    8,
    { alpha: fadeOut(16, [0.75, 0.5, 0.25, 0]) }
  )
  const flat = baby(crawl({ hands: [5, 0, 5, 0], bob: 1, lag: 1, face: 'dead', sink: 1 }))
  const thud = flat.clone()
  dust(thud, 55, 56, 2.5)
  dust(thud, 10, 56, 2)
  const collapseAnim = once(
    [
      baby(crawl({ bob: 1, face: 'pain', tilt: 2 })),
      baby(crawl({ face: 'pain', tilt: 1, hands: [2, 0, 2, 0] })),
      ...[1, 2, 3].map((i) => baby(crawl({ hands: [2 + i, 0, 2 + i, 0], bob: 1, lag: 1, face: 'down', sink: i / 3 }))),
      thud,
      ...Array(8).fill(flat)
    ],
    10
  )
  return { collapse: collapseAnim, illness, shatter: shatterAnim }
}

function bedDeaths(): Sheet {
  const B = (p: Partial<BedPose>) => bed(bedPose({ breath: 0, ...p }))
  const flat = (face: BedPose['face'], head = 1) => B({ monitor: 9, face, head })
  const illness = () =>
    once(
      [
        B({ monitor: 0, breath: 2, face: 'pain' }),
        B({ monitor: 1, breath: 1, face: 'pain' }),
        B({ monitor: 2, breath: 2, face: 'down' }),
        B({ monitor: 3, breath: 1, face: 'down' }),
        B({ monitor: 0, breath: 0, face: 'calm' }),
        B({ monitor: 2, face: 'calm' }),
        ...Array(8).fill(flat('dead'))
      ],
      6,
      { soul: 'ghost' }
    )
  const flatline = () =>
    once(
      [
        B({ monitor: 0, breath: 2, face: 'pain' }),
        B({ monitor: 2, face: 'down' }),
        B({ monitor: 1, face: 'calm' }),
        ...Array(10).fill(flat('dead'))
      ],
      6
    )
  const tray = (r: Raster) =>
    over(r, (l) => {
      l.rect(10, 32, 12, 2, R.brown[1])
      l.rect(11, 29, 9, 3, R.paper[1])
      l.rect(12, 29, 7, 1, R.paper[3])
    })
  const starve = () => {
    const starveFrames = [
      tray(B({ face: 'down', breath: 1 })),
      tray(B({ face: 'down', breath: 2 })),
      tray(B({ face: 'pain', breath: 1 })),
      tray(B({ face: 'down' })),
      tray(B({ face: 'calm', head: 1 })),
      tray(B({ face: 'dead', head: 1 }))
    ]
    for (let i = 0; i < 8; i++) {
      const r = tray(B({ face: 'dead', head: 1 }))
      fly(r, Math.round(30 + Math.cos(i * 1.3) * 10), Math.round(26 + Math.sin(i * 1.3) * 3), i % 2 === 0)
      if (i > 1) fly(r, Math.round(26 - Math.cos(i * 1.3) * 8), Math.round(22 + Math.sin(i * 1.3) * 2), i % 2 === 1)
      starveFrames.push(r)
    }
    return once(starveFrames, 6)
  }
  const bubbles = (r: Raster, n: number) =>
    over(r, (l) => {
      for (const [x, y, d] of [
        [20, 34, 1],
        [30, 32, -1],
        [14, 36, 1],
        [40, 30, -1],
        [25, 28, 1]
      ].slice(0, n))
        bubbleDart(l, x, y, d as 1 | -1)
    })
  const crumbled = (dusty: number) =>
    over(B({ empty: true }), (l) => {
      for (const [x, y, w, h] of [
        [16, 34, 10, 5],
        [26, 32, 12, 7],
        [38, 30, 9, 9],
        [44, 26, 7, 6]
      ]) {
        l.rect(x, y, w, h, R.paving[1])
        l.rect(x, y, w, 1, R.paving[0])
      }
      if (dusty) puff(l, 34, 24, 2 + dusty * 2, R.paper[2])
    })
  const shatterAnim = () =>
    once(
      [
        bubbles(B({ face: 'pain' }), 1),
        bubbles(B({ face: 'pain' }), 2),
        bubbles(B({ face: 'pain' }), 3),
        bubbles(B({ face: 'down' }), 5),
        tone(bubbles(B({ face: 'down' }), 5), MUTED),
        tone(bubbles(B({ face: 'down' }), 5), STONE),
        over(tone(bubbles(B({ face: 'down' }), 5), STONE), (l) => cracks(l, 46, 14, 3), false),
        crumbled(3),
        crumbled(2),
        crumbled(1),
        crumbled(0),
        crumbled(0),
        crumbled(0),
        crumbled(0)
      ],
      8
    )
  const hit = (x: number, i: number) =>
    B({ face: 'pain', spin: i })
      .clone()
      .blit(car(i % 4).flipX(), x, 0)
  // Overturned: the bed lands upside down (he has been thrown clear), its casters spinning in the air.
  const tipped = (i: number) => {
    const r = B({ empty: true, spin: i }).rot90(1).rot90(1)
    let top = 64
    r.map((c, _x, y) => ((top = Math.min(top, y)), c))
    let bottom = 0
    r.map((c, _x, y) => ((bottom = Math.max(bottom, y)), c))
    return new Raster(64, 64).blit(r, 0, 58 - bottom)
  }
  const runoverAnim = () =>
    once(
      [
        B({ face: 'open' }),
        hit(46, 0),
        hit(30, 1),
        hit(20, 2),
        over(hit(22, 3), (l) => dust(l, 50, 54, 4)),
        tipped(0),
        tipped(1),
        tipped(2),
        tipped(3),
        tipped(0),
        tipped(1),
        tipped(2),
        tipped(3),
        tipped(0)
      ],
      10
    )
  // 孤独死: a cool blue-grey night falls over everything (no warm shift), dust motes drift, the flower in the
  // vase wilts, cobwebs and dust gather, the head droops.
  const vase = (l: Raster, wilt: number) => {
    l.rect(4, 44, 12, 2, R.brown[1])
    l.rect(6, 46, 2, 10, R.brown[2])
    l.rect(13, 46, 2, 10, R.brown[2])
    l.ellipse(10, 40, 3, 4, R.sky[1])
    l.line(10, 36, 10 + wilt, 30 + wilt * 2, R.green[2])
    l.ellipse(10 + wilt * 2, 30 + wilt * 3, 2, 1.6, wilt > 1 ? R.brown[1] : R.pink[1])
    if (wilt > 1) l.rect(14, 43, 2, 1, R.pink[2])
  }
  const lonelyFrame = (n: number) => {
    const base = B({ face: n > 4 ? 'dead' : 'down', head: Math.min(2, Math.floor(n / 3)) })
    part(base, (l) => vase(l, Math.min(2, Math.floor(n / 4))))
    const r = n === 0 ? base : tone(base, NIGHT[n < 3 ? 0 : 1])
    part(
      r,
      (l) => {
        const webs = Math.min(3, Math.floor(n / 3))
        if (webs > 0) {
          for (let a = 0; a < Math.PI / 2; a += 0.3)
            l.line(59, 26, 59 - Math.cos(a) * (5 + webs * 2), 26 + Math.sin(a) * (5 + webs * 2), R.metal[1])
          for (let rr = 3; rr <= 3 + webs * 2; rr += 3)
            for (let a = 0; a < Math.PI / 2; a += 0.15) l.set(59 - Math.cos(a) * rr, 26 + Math.sin(a) * rr, R.metal[1])
        }
        for (let s2 = 0; s2 < n * 3; s2++) l.set(14 + ((s2 * 11) % 34), 36 + ((s2 * 7) % 6), R.metal[2])
        // Dust motes drifting slowly through the dark.
        for (let m = 0; m < 6; m++) l.set(18 + m * 7 + (n % 3), 8 + ((m * 9 + n * 2) % 22), R.metal[0])
      },
      false
    )
    return r
  }
  const lonely = () =>
    once(
      Array.from({ length: 14 }, (_, n) => lonelyFrame(n)),
      6
    )
  // 大往生: a peaceful smile while the reaper arrives; then the haloed soul rises (rendered by soulAt).
  const glow = (i: number) =>
    over(
      B({ face: 'smile', head: -1 }),
      (l) => {
        for (const [x, y] of [
          [38, 10],
          [56, 16],
          [34, 22],
          [52, 4]
        ])
          if ((x + y + i) % 3 !== 0) {
            l.set(x, y, R.yellow[0])
            l.set(x - 1, y, R.yellow[1])
            l.set(x + 1, y, R.yellow[1])
            l.set(x, y - 1, R.yellow[1])
            l.set(x, y + 1, R.yellow[1])
          }
      },
      false
    )
  const won = () => once([0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11].map(glow), 6, { soul: 'halo' })
  return lazySheet({ collapse: flatline, illness, starve, shatter: shatterAnim, runover: runoverAnim, lonely, won })
}

// ---------------------------------------------------------------------------------------------

const ADULT_AGE = new Set(['college', 'adult', 'prime', 'middle', 'elder'])
const UPRIGHT: Record<string, Kit> = {
  kid: { body: KID, paint: kid },
  adult: { body: CASUAL_ADULT, paint: adult },
  elder: { body: ELDER, paint: elder },
  ...Object.fromEntries(
    Object.keys(STAGE_BODIES).map((id) => [id, { body: STAGE_BODIES[id], paint: STAGE_PAINTERS[id] }])
  )
}

/**
 * A sheet whose animations are generated only when first read (and then kept), so a death costs just its
 * own frames at the moment a player goes down — and the renderer pre-warms them in idle time anyway.
 */
function lazySheet(make: Record<string, () => Anim>): Sheet {
  const out = {} as Sheet
  for (const [key, build] of Object.entries(make)) {
    let anim: Anim | undefined
    Object.defineProperty(out, key, { enumerable: true, get: () => (anim ??= build()) })
  }
  return out
}

function uprightDeaths(id: string, k = UPRIGHT[id]): Sheet {
  return lazySheet({
    collapse: () => collapse(k),
    ...(ADULT_AGE.has(id) ? { hang: () => hang(k) } : { alone: () => alone(k) }),
    starve: () => starve(k),
    runover: () => runover(k),
    illness: () => illness(k),
    shatter: () => shatter(k),
    overwork: () => overwork(k),
    heartbreak: () => heartbreak(k),
    dogpile: () => dogpile(k),
    burnout: () => burnout(k),
    heatstroke: () => heatstroke(k),
    overheat: () => overheat(k)
  })
}

export function careerDeathSheet(id: string, career: string): Sheet {
  const body = careerBody(id, career)
  return uprightDeaths(id, { body, paint: (pose) => human(body, pose) })
}

export const deathSheets: Record<string, () => Sheet> = {
  ...Object.fromEntries(Object.keys(UPRIGHT).map((id) => [`death:${id}`, () => uprightDeaths(id)])),
  'death:baby': () => {
    let all: Sheet | undefined
    return lazySheet(
      Object.fromEntries(['collapse', 'illness', 'shatter'].map((k) => [k, () => (all ??= babyDeaths())[k]]))
    )
  },
  'death:bed': bedDeaths,
  soul: () => ({
    float: { frames: [0, 1, 2, 3].map((f) => soul(f, 'soul')), fps: 6, loop: true },
    ghost: { frames: [0, 1, 2, 3].map((f) => soul(f, 'ghost')), fps: 6, loop: true },
    halo: { frames: [0, 1, 2, 3].map(angel), fps: 5, loop: true }
  })
}

/**
 * 大往生's soul (24×24, pivot bottom centre): a pale little old man in a white robe with a halo and tiny
 * wings, smiling and waving. The renderer draws it slightly translucent.
 */
function angel(f: number) {
  const r = new Raster(24, 24)
  const flap = f % 2
  part(r, (l) => {
    for (const s2 of [-1, 1])
      l.stamp(
        flap ? ['ww..', 'wWww', '.WWw'] : ['....', 'wwww', 'WWww'],
        s2 < 0 ? 3 : 17,
        11,
        { w: C.white, W: R.paper[2] },
        s2 < 0
      )
  })
  part(r, (l) => {
    l.poly([8, 13, 16, 13, 18, 22, 6, 22], C.white)
    l.rect(8, 21, 8, 1, R.paper[1])
    l.ellipse(12, 9, 4.5, 4.5, R.skin[0])
    l.rect(8, 9, 1, 3, R.paper[1])
    l.rect(15, 9, 1, 3, R.paper[1])
    l.stamp(['K.K..K.K', '.K....K.'], 8, 8, { K: R.skin[3] })
    l.stamp(['.WWWW.', 'W....W'], 9, 11, { W: R.paper[1] })
    l.set(11, 13, R.skin[3])
    l.set(12, 13, R.skin[3])
    // A waving hand.
    l.line(17, 15, 20, 11 - flap, R.paper[1])
    l.ellipse(20.5, 10 - flap, 1.6, 1.6, R.skin[0])
  })
  part(
    r,
    (l) => {
      for (let a = 0; a < Math.PI * 2; a += 0.15) l.set(12 + Math.cos(a) * 4.5, 2.5 + Math.sin(a) * 1.3, R.yellow[0])
      l.set(2 + f * 5, 4 + (f % 2) * 5, R.yellow[0])
      l.set(21 - f * 3, 6 + (f % 3) * 4, R.yellow[1])
    },
    false
  )
  return r
}

/** A small calm soul (16×16, pivot bottom centre); the ghost wears a 天冠 headband. */
function soul(f: number, kind: 'soul' | 'ghost' | 'halo') {
  const r = new Raster(16, 16)
  const tail = [
    [5, 4],
    [6, 3],
    [7, 2],
    [6, 3]
  ][f]
  part(r, (l) => {
    if (kind === 'ghost') {
      ball(l, 8, 6, 4.5, 4.5, [C.white, C.white, R.paper[1], R.paper[2], R.paper[4]], false)
      l.poly([4, 7, 12, 7, 11, 13, 9 - (f % 2), 15, 7, 13 + (f % 2), 5, 15, 4, 11], C.white)
      l.poly([6, 3, 10, 3, 8, 0], R.paper[1])
      l.rect(5, 8, 2, 1, R.mint[3])
      l.rect(9, 8, 2, 1, R.mint[3])
      l.line(12, 9, 14, 11, R.paper[2])
      l.line(4, 9, 2, 11, R.paper[2])
      return
    }
    ball(l, 8, 9, 4.5, 4.5, [C.white, C.white, C.glow, R.mint[1], R.mint[3]], true)
    l.thick(8, 7, tail[0] + 1, tail[1] + (kind === 'halo' ? 2 : 0), 2.2, C.white)
    l.set(6, 10, R.mint[3])
    l.set(7, 10, R.mint[3])
    l.set(9, 10, R.mint[3])
    l.set(10, 10, R.mint[3])
  })
  return r
}

const TAG_DEATH: Record<string, string> = {
  money: 'starve',
  accident: 'runover',
  sickness: 'illness',
  insult: 'shatter',
  work: 'overwork',
  love: 'heartbreak',
  child: 'dogpile',
  exam: 'burnout',
  sports: 'heatstroke',
  class: 'overheat'
}
const BED_DEATH: Record<string, string> = {
  sickness: 'illness',
  money: 'starve',
  insult: 'shatter',
  accident: 'runover',
  people: 'lonely'
}

/** Which death plays: the killer's Tag picks it. 首吊り is adults-only; minors get ひとりぼっち instead. */
export function deathKind(tag: string | undefined, age: number, body: string) {
  if (!tag) return 'collapse'
  if (body === 'baby') return tag === 'sickness' ? 'illness' : tag === 'insult' ? 'shatter' : 'collapse'
  if (body === 'bed') return BED_DEATH[tag] ?? 'collapse'
  if (tag === 'people') return age >= 18 ? 'hang' : 'alone'
  return TAG_DEATH[tag] ?? 'collapse'
}

/** Where the soul is at `t` seconds after death began (relative to the pivot), or undefined before it appears. */
export function soulAt(t: number, animSeconds: number, kind: Anim['soul'] = 'soul') {
  const start = kind === 'halo' ? 0.3 : animSeconds * 0.8
  if (t < start) return undefined
  const rise = Math.min(1, (t - start) / (kind === 'halo' ? 2.6 : 0.9))
  return {
    dx: kind === 'halo' ? rise * 14 : 0,
    // The ghost rises from the chest of a body lying on its back.
    dy:
      (kind === 'halo' ? -22 - rise * 46 : kind === 'ghost' ? -6 - rise * 30 : -16 - rise * 18) +
      Math.sin((t - start) * 2.6) * 2 * rise,
    alpha: Math.min(1, (t - start) * 3)
  }
}
