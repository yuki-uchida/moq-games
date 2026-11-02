import { C, R, dimTable } from './palette'
import { Raster, ball, part, remap } from './raster'

const DIM = [dimTable(0.62), dimTable(0.38)]
import { ADULT, ELDER, KID, adult, baby, bed, bedPose, crawl, elder, kid } from './player'
import { STAGE_BODIES, STAGE_PAINTERS } from './people'
import { dust, lying, pose, type Body, type Pose } from './rig'
import type { Anim, Sheet } from './sheet'

/**
 * Death animations, chosen by the Tag of the enemy that dealt the final blow. Each works on a body
 * (its spec + painter), so later stages only need their body to get every death. Falls are authored
 * poses (no whole-body rotation), darkening uses palette steps (no dither), and fades are per-frame
 * renderer alpha. Frames never contain the soul: the renderer (and the review GIFs) float it in with `soulAt`.
 */

interface Kit {
  body: Body
  paint: (p: Pose) => Raster
}

/** Keeps every death frame on the baseline (a deep kneel never sinks below the floor). */
function settle(r: Raster) {
  let maxY = -1
  r.map((c, _x, y) => ((maxY = Math.max(maxY, y)), c))
  return maxY > 58 ? new Raster(r.w, r.h).blit(r, 0, 58 - maxY) : r
}
const once = (frames: Raster[], fps: number, alpha?: number[]): Anim => ({
  frames: frames.map(settle),
  fps,
  loop: false,
  alpha
})

const INKS = new Set([C.inkCool, C.inkWarm, C.inkGreen])
/** Darkens the whole figure uniformly in clean palette steps (1–2), then 3 = a flat silhouette with its outline. */
function darken(r: Raster, steps: number) {
  if (steps >= 3) return r.map((c) => (INKS.has(c) ? C.inkCool : R.hair[3]))
  return remap(r, DIM[steps - 1])
}

const over = (base: Raster, draw: (l: Raster) => void, outline = true) => {
  const r = base.clone()
  part(r, draw, outline)
  return r
}

/** ズーン: gloom lines beside the head and a small dark cloud above it. */
function gloom(r: Raster, x: number, y: number, cloud: boolean) {
  // Three clean vertical "ズーン" strokes beside the head.
  part(r, (l) => {
    for (let i = 0; i < 3; i++) l.rect(x + i * 3, y + i, 1, 7 - i, R.purple[2])
  })
  if (cloud)
    part(r, (l) => {
      ball(l, 28, 3.5, 4.5, 3.2, R.purple, false)
      ball(l, 34, 3, 4, 3, R.purple, false)
      ball(l, 38, 3.5, 3.5, 2, R.purple, false)
    })
}

/** The rope comes down from darkness: its top fades through palette steps into near-black. */
function rope(r: Raster, x: number, end: number, sway = 0) {
  const top = new Raster(r.w, r.h)
  part(top, (l) => {
    for (let y = 0; y <= end - 6; y++) {
      const px = Math.round(x + (sway * y) / Math.max(1, end))
      const [a, b] =
        y < 5
          ? [R.hair[3], R.hair[3]]
          : y < 10
            ? [R.brown[3], R.brown[3]]
            : y < 15
              ? [R.brown[2], R.brown[3]]
              : [R.brown[1], R.brown[2]]
      l.set(px, y, b)
      l.set(px + 1, y, a)
    }
    l.ellipse(x + sway + 0.5, end - 3, 3, 3.5, R.brown[1])
    l.ellipse(x + sway + 0.5, end - 3, 1.6, 2.2, 0)
  })
  return top.blit(r)
}

const knot = (r: Raster, x: number, y: number) =>
  over(r, (l) => {
    l.rect(x - 2, y, 5, 1, R.brown[1])
    l.set(x + 2, y - 1, R.brown[2])
  })

/** 首吊り (人間関係, adults only). Restrained: gloom, a noose from the dark, silhouette, lifted, a slow pendulum, fade. */
function hang(k: Kit) {
  const b = k.body
  const neck = b.hip - b.torsoH + 1
  const P = (q: Partial<Pose>) => k.paint(pose({ item: false, face: 'down', headBob: 1, head: [0, 1], ...q }))
  const gx = 11
  const frames: Raster[] = []
  const head = P({})
  frames.push(head)
  const sad = P({ tear: true })
  gloom(sad, gx, 10, false)
  frames.push(sad)
  const cloud = P({ tear: true })
  gloom(cloud, gx, 10, true)
  frames.push(cloud)
  for (const end of [10, 17, neck]) {
    const r = rope(P({}), 33, end)
    frames.push(end === neck ? knot(r, 33, neck + 1) : r)
  }
  for (const steps of [1, 2, 3]) frames.push(knot(rope(darken(P({ face: 'none' }), steps), 33, neck), 33, neck + 1))
  const hung = (lift: number, sway: number) =>
    knot(
      rope(darken(P({ face: 'none', y: -lift, x: sway, front: [0, 0], back: [0, 0] }), 3), 33, neck - lift, sway),
      33 + sway,
      neck - lift + 1
    )
  frames.push(hung(4, 0), hung(8, 0))
  // An eased pendulum: about ±4px at the feet.
  const sway = [2, 4, 3, 0, -3, -4, -2, 0]
  for (const s of sway) frames.push(hung(8, s))
  return once(frames, 8, [...frames.slice(0, -3).map(() => 1), 0.65, 0.35, 0])
}

/** The stumble → buckle → reach → fall → impact → settle sequence every humanoid shares. */
function fall(k: Kit, base: Partial<Pose>, o: { thin?: number; ground?: (r: Raster) => void } = {}) {
  const P = (q: Partial<Pose>) => k.paint(pose({ item: false, ...base, ...q }))
  const g = (r: Raster) => (o.ground ? withGround(r, o.ground) : r)
  const lie = (q: Parameters<typeof lying>[1]) => g(lying(k.body, { thin: o.thin, face: 'dead', ...q }))
  const impact = lie({ squash: 1, reach: 1.2 })
  dust(impact, 6, 56, 3)
  dust(impact, 50, 56, 3)
  const settled = lie({ reach: 1 })
  const settling = settled.clone()
  dust(settling, 5, 56, 2)
  return [
    P({ lean: 2, front: [4, 0], back: [-3, 1], handN: [-4, 8], handF: [5, 7], face: 'pain' }),
    P({ kneel: 3, lean: 3, front: [-1, 0], back: [-4, 0], handN: [2, 9], handF: [3, 9], face: 'down' }),
    P({ kneel: 5, lean: 6, front: [-4, 0], back: [-6, 0], handN: [7, 6], handF: [8, 5], face: 'pain' }),
    P({ kneel: 6, lean: 9, front: [-6, 0], back: [-7, 0], handN: [10, 3], handF: [11, 2], face: 'dead' }),
    impact,
    settling,
    settled
  ]
}

function withGround(r: Raster, ground: (r: Raster) => void) {
  const under = new Raster(r.w, r.h)
  ground(under)
  return under.blit(r)
}

function collapse(k: Kit, ground?: (r: Raster) => void) {
  const frames = [
    k.paint(pose({ item: false, face: 'pain', lean: -2, squash: 1, bob: 1, handN: [-4, 8], handF: [4, 8] })),
    ...fall(k, {}, { ground })
  ]
  const last = frames[frames.length - 1]
  return once([...frames, last, last, last, last], 10)
}

/** 「グゥ〜」 in a little speech bubble. */
const GUU = [
  '.K..K.K.......' + '.....',
  '.KKKK.....K...' + '.....',
  'K...K...KKKK..' + '.K...',
  '...K....K..K..' + 'K.K.K',
  '..K.......K...' + '...K.',
  'KK.......K....' + '.....'
]

function bubble(r: Raster, x: number, y: number) {
  part(r, (l) => {
    l.rect(x, y, 21, 9, R.paper[0])
    l.rect(x + 1, y - 1, 19, 11, R.paper[0])
    l.poly([x + 2, y + 9, x + 6, y + 9, x + 1, y + 13], R.paper[0])
  })
  part(r, (l) => l.stamp(GUU, x + 2, y + 1, { K: C.inkCool }), false)
}

function bowl(l: Raster) {
  l.rect(52, 52, 9, 4, R.paper[1])
  l.rect(53, 56, 7, 1, R.paper[2])
  l.rect(52, 51, 9, 1, R.paper[2])
  l.rect(53, 52, 7, 1, R.paper[3])
  l.rect(52, 54, 9, 1, R.navy[1])
  l.line(47, 57, 58, 50, R.brown[1])
  l.line(48, 57, 59, 50, R.brown[2])
}

function fly(r: Raster, x: number, y: number, up: boolean) {
  r.rect(x, y, 2, 1, C.inkCool)
  r.set(x, up ? y - 1 : y + 1, R.paper[2])
  r.set(x + 1, up ? y - 1 : y + 1, R.paper[2])
}

/** 餓死 (お金): グゥ〜, a hand on the stomach, sweat, the body thinning, knees give out, the fall, flies. Cartoon, not gruesome. */
function starve(k: Kit) {
  const P = (q: Partial<Pose>) => withGround(k.paint(pose({ item: false, ...q })), (l) => part(l, bowl))
  const sweat = (r: Raster) => over(r, (l) => l.stamp(['.c', 'cc', 'cc'], 42, 10, { c: R.mint[0] }))
  const growl = (r: Raster) => {
    bubble(r, 40, 2)
    return r
  }
  const belly: Partial<Pose> = { handN: [7, 6], handF: [-2, 7] }
  const frames = [
    P({ face: 'open' }),
    growl(P({ ...belly, face: 'down', bob: 1 })),
    sweat(growl(P({ ...belly, face: 'down', lean: -1, thin: 0.25 }))),
    sweat(P({ ...belly, face: 'down', lean: 1, thin: 0.5 })),
    growl(P({ ...belly, face: 'pain', lean: -1, thin: 0.75 })),
    sweat(P({ ...belly, face: 'down', lean: 1, thin: 1 })),
    P({ ...belly, face: 'down', thin: 1, kneel: 2, lean: 1 }),
    ...fall(k, { thin: 1 }, { thin: 1, ground: (l) => part(l, bowl) })
  ]
  const lyingFrame = frames[frames.length - 1]
  for (let i = 0; i < 4; i++) {
    const r = lyingFrame.clone()
    const a = i * 1.4
    fly(r, Math.round(30 + Math.cos(a) * 10), Math.round(40 + Math.sin(a) * 3), i % 2 === 0)
    if (i > 0) fly(r, Math.round(30 - Math.cos(a) * 8), Math.round(37 - Math.sin(a) * 2), i % 2 === 1)
    frames.push(r)
  }
  return once(frames, 8)
}

const KITS: Record<string, Kit> = {
  adult: { body: ADULT, paint: adult },
  kid: { body: KID, paint: kid },
  elder: { body: ELDER, paint: elder }
}

const repeat = <T>(n: number, f: (i: number) => T) => Array.from({ length: n }, (_, i) => f(i))

export const deathSheets: Record<string, () => Sheet> = {
  'death:adult': () => ({ hang: hang(KITS.adult), starve: starve(KITS.adult), collapse: collapse(KITS.adult) }),
  'death:kid': () => ({ collapse: collapse(KITS.kid) }),
  ...Object.fromEntries(
    Object.keys(STAGE_BODIES).map((id) => [
      `death:${id}`,
      () => ({ collapse: collapse({ body: STAGE_BODIES[id], paint: STAGE_PAINTERS[id] }) })
    ])
  ),
  'death:elder': () => ({
    collapse: collapse(KITS.elder)
  }),
  'death:baby': () => {
    const frames = [
      baby(crawl({ bob: 1, face: 'pain', tilt: 2 })),
      baby(crawl({ face: 'pain', tilt: 1, hands: [2, 0, 2, 0] })),
      ...repeat(3, (i) =>
        baby(crawl({ hands: [2 + i, 0, 2 + i, 0], bob: 1, lag: 1, face: 'down', sink: (i + 1) / 3 }))
      ),
      baby(crawl({ hands: [5, 0, 5, 0], bob: 1, lag: 1, face: 'dead', sink: 1 }))
    ]
    const flat = frames[frames.length - 1]
    const thud = flat.clone()
    dust(thud, 55, 56, 2.5)
    dust(thud, 10, 56, 2)
    return { collapse: once([...frames.slice(0, -1), thud, flat, flat, flat, flat, flat, flat], 10) }
  },
  'death:bed': () => ({
    collapse: once(
      [
        bed(bedPose({ hop: [1, 0], breath: 2, sway: -1, bagLag: 1, face: 'pain', head: -1 })),
        bed(bedPose({ breath: 1, bagLag: -1, face: 'pain' })),
        bed(bedPose({ breath: 1, face: 'down', head: 1 })),
        ...repeat(9, (i) => bed(bedPose({ breath: 0, face: i < 2 ? 'calm' : 'dead', head: 1 })))
      ],
      8
    )
  }),
  soul: () => ({ float: { frames: [0, 1, 2, 3].map(soul), fps: 6, loop: true } })
}

/** A small calm soul: a pale wisp with closed eyes and a flickering tail (16×16, pivot bottom centre). */
function soul(f: number) {
  const r = new Raster(16, 16)
  part(r, (l) => {
    ball(l, 8, 9, 4.5, 4.5, [C.white, C.white, C.glow, R.mint[1], R.mint[3]], true)
    const tail = [
      [5, 4],
      [6, 3],
      [7, 2],
      [6, 3]
    ][f]
    l.thick(8, 7, tail[0] + 1, tail[1], 2.2, C.white)
    l.set(tail[0], tail[1] - 1, C.glow)
    l.set(6, 10, R.mint[3])
    l.set(7, 10, R.mint[3])
    l.set(9, 10, R.mint[3])
    l.set(10, 10, R.mint[3])
  })
  return r
}

/** Which death plays: the killer's Tag picks it; 首吊り is adults-only (minors fall back for now). */
export function deathKind(tag: string | undefined, age: number, body: string) {
  if (body === 'adult' && tag === 'people' && age >= 18) return 'hang'
  if (body === 'adult' && tag === 'money') return 'starve'
  return 'collapse'
}

/** Where the soul is at `t` seconds after death began (relative to the pivot), or undefined before it appears. */
export function soulAt(t: number, animSeconds: number) {
  const start = animSeconds * 0.8
  if (t < start) return undefined
  const rise = Math.min(1, (t - start) / 0.9)
  return { dy: -16 - rise * 18 + Math.sin((t - start) * 2.6) * 2 * rise, alpha: Math.min(1, (t - start) * 3) }
}
