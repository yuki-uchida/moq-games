import { C, DARKER, R } from './palette'
import { KEY, Raster, part, remap, shadeEdges, type Ramp } from './raster'

/** Every character frame is 64×64 with the feet on this row and centred on x = 32. */
export const SIZE = 64
export const GROUND = 58
export const CX = 32
export const SKIN = R.skin

export type Face = 'open' | 'blink' | 'pain' | 'calm' | 'down' | 'dead' | 'angry' | 'spiral' | 'smile' | 'none'

/** A pose for the 3/4-view humanoid rig. Limbs are drawn in place with pixel primitives — never rotated bitmaps. */
export interface Pose {
  /** Whole-figure offset. */
  x: number
  y: number
  /** Body drop (+ = down): step bob, breathing. Hips only ever drop, so planted feet stay planted. */
  bob: number
  /** The head follows the body a frame late. */
  headBob: number
  /** Shoulders and head shift in x relative to the hips (+ = forward). */
  lean: number
  /** Near (screen-left) and far foot [dx from hip, lift]. */
  front: [number, number]
  back: [number, number]
  /** Near / far hand offset from its shoulder [dx, dy]; undefined = hanging. */
  handN?: [number, number]
  handF?: [number, number]
  /** Hip drop for crouching and kneeling. */
  kneel: number
  /** 0..1 starvation thinning (narrower torso and limbs, hollow cheeks). */
  thin: number
  /** Torso squash in px (hurt recoil). */
  squash: number
  /** Extra head offset. */
  head: [number, number]
  face: Face
  /** Secondary motion (tie, bag, hair flick, briefcase pendulum): usually last frame's movement. */
  lag: number
  /** Item in hand is shown. */
  item: boolean
  tear: boolean
}

export const pose = (p: Partial<Pose> = {}): Pose => ({
  x: 0,
  y: 0,
  bob: 0,
  headBob: p.bob ?? 0,
  lean: 0,
  front: [0, 0],
  back: [0, 0],
  kneel: 0,
  thin: 0,
  squash: 0,
  head: [0, 0],
  face: 'open',
  lag: 0,
  item: true,
  tear: false,
  ...p
})

export interface Pt {
  x: number
  y: number
}

/** Two-bone IK: the middle joint for a limb from a to c; side +1 bends toward +x when the limb hangs down. */
export function joint(a: Pt, c: Pt, l1: number, l2: number, side: number): Pt {
  let dx = c.x - a.x
  let dy = c.y - a.y
  let d = Math.hypot(dx, dy) || 0.001
  const max = l1 + l2 - 0.01
  if (d > max) {
    dx = (dx / d) * max
    dy = (dy / d) * max
    d = max
  }
  const along = (l1 * l1 - l2 * l2 + d * d) / (2 * d)
  const out = Math.sqrt(Math.max(0, l1 * l1 - along * along))
  return { x: a.x + (dx / d) * along + (dy / d) * out * side, y: a.y + (dy / d) * along - (dx / d) * out * side }
}

/** A two-segment limb as its own outlined layer; `extra` paints cuffs, hands and shoes on the same layer. */
export function limb(
  r: Raster,
  a: Pt,
  c: Pt,
  l1: number,
  l2: number,
  side: number,
  width: number,
  ramp: Ramp,
  far = false,
  extra?: (layer: Raster, end: Pt, mid: Pt) => void
) {
  const mid = joint(a, c, l1, l2, side)
  const reach = Math.hypot(c.x - a.x, c.y - a.y)
  const end =
    reach > l1 + l2 ? { x: a.x + ((c.x - a.x) / reach) * (l1 + l2), y: a.y + ((c.y - a.y) / reach) * (l1 + l2) } : c
  part(r, (layer) => {
    layer.thick(a.x, a.y, mid.x, mid.y, width, ramp[1])
    layer.thick(mid.x, mid.y, end.x, end.y, width, ramp[1])
    shadeEdges(layer, ramp)
    // Fold at the joint: a short dark crease on the inner side.
    layer.paint(mid.x + 1, mid.y, ramp[3])
    extra?.(layer, end, mid)
    if (far) remap(layer, DARKER)
  })
  return { end, mid }
}

// ---------------------------------------------------------------------------------------------
// Heads: a round skull with authored shading clusters, an authored hair grid per stage, and
// hand-placed expression stamps (eyes with catchlights, brows that carry the mood, mouth, nose, ear).

export interface HeadSpec {
  w: number
  h: number
  hair: readonly string[]
  hairAt: [number, number]
  key: Record<string, number>
  /** Hair pixels marked 'f' swing with the lag (fringe flick). */
  eyes: 'adult' | 'kid' | 'elder'
  near: [number, number]
  far: [number, number]
  mouth: [number, number]
  nose?: [number, number]
  ear: [number, number]
  blush?: boolean
  brows?: number
  /** Drawn over everything else on the head layer (cap brim, mustache, plaster…). */
  extra?: (l: Raster, x: number, y: number, face: Face) => void
}

const EYES: Record<HeadSpec['eyes'], { near: Record<string, string[]>; far: Record<string, string[]> }> = {
  adult: {
    near: {
      open: ['wK', 'KK', 'KK'],
      blink: ['..', '..', 'KK'],
      pain: ['K.', '.K', 'K.'],
      calm: ['..', '.K', 'K.'],
      down: ['..', 'wK', 'KK'],
      dead: ['..', 'KK', '..'],
      angry: ['K.', 'KK', 'KK'],
      spiral: ['KKK', 'K.K', 'KK.'],
      smile: ['..', 'K.K', '...']
    },
    far: {
      open: ['K', 'K', 'K'],
      blink: ['.', '.', 'K'],
      pain: ['.K', 'K.', '.K'],
      calm: ['K.', '.K', '..'],
      down: ['.', 'K', 'K'],
      dead: ['.', 'K', '.'],
      angry: ['.K', 'KK', 'KK'],
      spiral: ['KK', '.K', 'KK'],
      smile: ['..', 'K.K']
    }
  },
  kid: {
    near: {
      open: ['KKK', 'wKK', 'KKK', '.ee'],
      blink: ['...', '...', 'KKK', '...'],
      pain: ['K..', '.KK', 'K..', '...'],
      calm: ['...', '.K.', 'K.K', '...'],
      down: ['...', 'KKK', 'wKK', '.ee'],
      dead: ['...', '...', 'KKK', '...'],
      angry: ['KK.', 'wKK', 'KKK', '.ee'],
      spiral: ['KKK', 'K.K', 'K.K', 'KK.'],
      smile: ['...', '.K.', 'K.K', '...']
    },
    far: {
      open: ['KK', 'wK', 'KK', 'e.'],
      blink: ['..', '..', 'KK', '..'],
      pain: ['.K', 'K.', '.K', '..'],
      calm: ['..', 'K.', '.K', '..'],
      down: ['..', 'KK', 'wK', 'e.'],
      dead: ['..', '..', 'KK', '..'],
      angry: ['.K', 'wK', 'KK', 'e.'],
      spiral: ['KK', '.K', 'KK', '..'],
      smile: ['..', '.K', 'K.', '..']
    }
  },
  elder: {
    near: {
      open: ['33', 'wK', 'KK'],
      blink: ['..', '33', 'KK'],
      pain: ['K.', '.K', 'K.'],
      calm: ['..', '33', 'KK'],
      down: ['33', '3K', 'KK'],
      dead: ['..', '33', 'KK'],
      angry: ['3.', 'wK', 'KK'],
      spiral: ['KKK', 'K.K', 'KK.'],
      smile: ['..', 'K.K', '...']
    },
    far: {
      open: ['3', 'K', 'K'],
      blink: ['.', '3', 'K'],
      pain: ['.K', 'K.', '.K'],
      calm: ['.', '3', 'K'],
      down: ['3', 'K', 'K'],
      dead: ['.', '3', 'K'],
      angry: ['3', 'K', 'K'],
      spiral: ['KK', '.K', 'KK'],
      smile: ['..', 'K.K']
    }
  }
}

const BROWS: Record<string, { near: string[]; far: string[] }> = {
  flat: { near: ['bbb'], far: ['bb'] },
  sad: { near: ['..b', 'bb.'], far: ['b.', '.b'] },
  angry: { near: ['bb.', '..b'], far: ['.b', 'b.'] }
}

const MOUTHS: Record<Face, string[]> = {
  open: ['mm'],
  blink: ['mm'],
  pain: ['KK', 'KR'],
  calm: ['m.', '.m'],
  down: ['.m.', 'm.m'],
  dead: ['mm'],
  angry: ['KKKK', 'wwKw', 'KKKK'],
  spiral: ['.KK.', 'K..K', '.KK.'],
  smile: ['m..m', '.mm.'],
  none: []
}

const FEATURE_KEY = { ...KEY, m: SKIN[3], R: R.red[2], e: R.hair[0], '3': SKIN[2] }

/** Paints a head with its top-left at (x, y). `lag` swings the fringe flick; `thin` hollows the cheeks. */
export function drawHead(r: Raster, h: HeadSpec, x: number, y: number, face: Face, thin = 0, lag = 0) {
  part(r, (l) => {
    const cx = x + h.w / 2
    const cy = y + h.h / 2
    l.ellipse(cx, cy, h.w / 2, h.h / 2, SKIN[1])
    // Cheeks and jaw are fuller toward the facing side (3/4 view turned right).
    l.ellipse(cx + 1, cy + 1.5, h.w / 2 - 1.5, h.h / 2 - 1.5, SKIN[1])
    l.map((c, px, py) => {
      const fx = (px + 0.5 - cx) / (h.w / 2)
      const fy = (py + 0.5 - cy) / (h.h / 2)
      if (fx > 0.66 && fy > -0.15) return SKIN[2] // far side plane
      if (fy > 0.8 && fx > -0.5) return SKIN[2] // under the jaw
      if (fx < -0.6 && fy > -0.4 && fy < 0.35 && !l.get(px - 1, py)) return SKIN[0] // lit cheek rim
      return c
    })
    // Near ear on the lit side.
    l.stamp(['12', '23', '22'], x + h.ear[0], y + h.ear[1])
    const hairColours = new Set(Object.values(h.key))
    const hair = h.hair.map((row) => row.replace(/f/g, '.'))
    l.stamp(hair, x + h.hairAt[0], y + h.hairAt[1], h.key)
    const flick = h.hair.map((row) => row.replace(/[^f]/g, '.'))
    l.stamp(flick, x + h.hairAt[0] + Math.sign(lag), y + h.hairAt[1], { ...h.key, f: h.key.H })
    // Hair and cap brims cast a 1px shadow onto the skin below them.
    const src = l.clone()
    l.map((c, px, py) => ((c === SKIN[1] || c === SKIN[0]) && hairColours.has(src.get(px, py - 1)) ? SKIN[2] : c))
    if (face !== 'none') {
      const E = EYES[h.eyes]
      const near = E.near[face] ?? E.near.open
      const far = E.far[face] ?? E.far.open
      l.stamp(near, x + h.near[0], y + h.near[1], FEATURE_KEY)
      l.stamp(far, x + h.far[0], y + h.far[1], FEATURE_KEY)
      const brows =
        BROWS[face === 'angry' ? 'angry' : face === 'pain' || face === 'down' || face === 'spiral' ? 'sad' : 'flat']
      const bk = { b: h.brows ?? R.hair[3] }
      const by = face === 'pain' || face === 'down' || face === 'angry' ? 3 : 2
      l.stamp(brows.near, x + h.near[0] - 1, y + h.near[1] - by, bk)
      l.stamp(brows.far, x + h.far[0], y + h.far[1] - by, bk)
      l.stamp(MOUTHS[face], x + h.mouth[0], y + h.mouth[1], FEATURE_KEY)
      if (h.nose) l.paint(x + h.nose[0], y + h.nose[1], SKIN[2])
      const eyeH = near.length
      if (h.blush && face !== 'dead' && face !== 'pain') {
        l.paint(x + h.near[0] - 1, y + h.near[1] + eyeH + 1, R.pink[1])
        l.paint(x + h.near[0], y + h.near[1] + eyeH + 1, R.pink[1])
        l.paint(x + h.far[0] + 1, y + h.far[1] + eyeH + 1, R.pink[1])
      }
      if (thin > 0.5) {
        // Hollow cheeks and eye bags.
        l.paint(x + h.near[0], y + h.near[1] + eyeH, SKIN[2])
        l.paint(x + h.near[0] + 1, y + h.near[1] + eyeH, SKIN[2])
        l.paint(x + h.near[0] - 2, y + h.near[1] + eyeH + 2, SKIN[2])
        l.paint(x + h.far[0] + 2, y + h.far[1] + eyeH + 2, SKIN[3])
      }
    }
    h.extra?.(l, x, y, face)
  })
}

// ---------------------------------------------------------------------------------------------
// The body painter shared by every humanoid (player stages, bully, later all people).

export interface Frame {
  hx: number
  /** Row of the torso bottom (moves with bob) and of the shoulders. */
  hy: number
  top: number
  lean: number
  p: Pose
}

/** A lying head drawn as one authored stamp (skin 1–4, closed eyes K, hair via `key`). */
export interface LieHead {
  grid: readonly string[]
  key: Record<string, number>
}

/** Lying-head shapes: face toward the camera, top of the head toward +x, hair falling to the floor. */
export const LIE = {
  short: [
    '.......33..JJJJ...',
    '.....12232JHHHHJJ.',
    '...112222JHHaaHHHJ',
    '..12222K2JHHaaHHHJ',
    '.122222K22JHHHHHHJ',
    '.1222222223JHHHHHJ',
    '.142222232JHHHHHHJ',
    '.142222222JHHHHHHJ',
    '.12222K222JHHHHHHJ',
    '..1222K22JHHHHHHJ.',
    '..3322222JHHHHHJJ.',
    '...33333JHHHHHHJ..',
    '.....JJHHHHHHHJ...',
    '....JHHHHHHHJJ....',
    '...JJJJJJJJJ......'
  ],
  fluffy: [
    '.......33.J.J.J...',
    '.....12232JHJHJH..',
    '...112222JHHaHHHJ.',
    '..12222K2JHaaHHHHJ',
    '.122222K22JHHHHHHH',
    '.1222222223JHHHHHJ',
    '.142222232JHHHHHHH',
    '.142222222JHHHHHHJ',
    '.12222K222JHHHHHHH',
    '..1222K22JHHHHHHJ.',
    '..3322222JHHHHHJH.',
    '...33333JHHHHHHJ..',
    '.....JHHHJHHHHJ.H.',
    '....JHH.JHHHJHJ...',
    '...JJ..JJJ.JJ.....'
  ],
  bald: [
    '.......33.........',
    '.....12232HH......',
    '...112222H12222...',
    '..1222aK2H122222..',
    '.12222aK2H1222222.',
    '.1222222223222222.',
    '.1a2222232H222222.',
    '.1a2222222H222223.',
    '.1a222aK22HH22223.',
    '..1222aK22HHH233..',
    '..33222222HHHH3...',
    '...333333HHHHH....',
    '.....HHHHHJHH.....',
    '....HJHHJHHJ......',
    '...JJJJJJJJ.......'
  ],
  receding: [
    '.......33...JJ....',
    '.....12232..JHJJ..',
    '...11222222JHHHHJ.',
    '..12222K22JHHaHHHJ',
    '.122222K222JHHHHHJ',
    '.12222222232JHHHHJ',
    '.1422222322JHHHHHJ',
    '.142222222JHHHHHHJ',
    '.12222K222JHHHHHHJ',
    '..1222K22JHHHHHHJ.',
    '..3322222JHHHHHJJ.',
    '...33333JHHHHHHJ..',
    '.....JJHHHHHHHJ...',
    '....JHHHHHHHJJ....',
    '...JJJJJJJJJ......'
  ]
} as const

export interface Body {
  /** Standing hip row and leg geometry. */
  hip: number
  thigh: number
  shin: number
  legW: number
  /** Legs sit at hx - gap (near) and hx + gap - 1 (far). */
  gap: number
  torsoH: number
  /** Shoulder half-span and arms. */
  span: number
  upper: number
  fore: number
  armW: number
  /** Hanging hand offset. */
  hang: [number, number]
  head: HeadSpec
  /** Head box offset from (hx, shoulder row). */
  headAt: [number, number]
  pants: Ramp
  sleeve: Ramp
  /** Short sleeves: the forearm is bare skin from this fraction of the arm on. */
  shortSleeve?: boolean
  cuff?: number
  hand?: (l: Raster, end: Pt) => void
  shoe: (l: Raster, end: Pt) => void
  torso: (l: Raster, f: Frame) => void
  behind?: (r: Raster, f: Frame) => void
  /** Near-hand item, drawn after the near arm. */
  item?: (r: Raster, f: Frame, hand: Pt) => void
  /** Far-hand item, drawn last (in front of everything). */
  farItem?: (r: Raster, f: Frame, hand: Pt) => void
  over?: (r: Raster, f: Frame) => void
  /** Lying: torso thickness, coat ramp, the authored lying head, optional details and props beside the body. */
  lie: {
    thick: number
    coat: Ramp
    head: LieHead
    detail?: (l: Raster, x0: number, x1: number, top: number, bottom: number) => void
    beside?: (r: Raster) => void
  }
}

export function defaultHand(l: Raster, end: Pt) {
  l.ellipse(end.x, end.y + 0.5, 2.2, 2.2, SKIN[1])
  l.set(Math.round(end.x) + 1, Math.round(end.y) + 1, SKIN[2])
  l.set(Math.round(end.x) - 1, Math.round(end.y) - 1, SKIN[0])
}

export function human(b: Body, p: Pose) {
  const r = new Raster(SIZE, SIZE)
  const hx = CX + p.x
  const hipY = b.hip + p.y + Math.max(0, p.bob) + p.kneel
  const hy = b.hip + p.y + p.bob + p.kneel
  const top = hy - b.torsoH + p.squash
  const headTop = b.hip + p.y + p.headBob + p.kneel - b.torsoH + p.squash
  const f: Frame = { hx, hy, top, lean: p.lean, p }
  const ankleY = GROUND - 3 + p.y
  const thinW = p.thin > 0.5 ? 1 : 0
  const arm = (s: Pt, h: [number, number] | undefined, far: boolean) => {
    const target = { x: s.x + (h?.[0] ?? (far ? -b.hang[0] : b.hang[0])), y: s.y + (h?.[1] ?? b.hang[1]) }
    return limb(r, s, target, b.upper, b.fore, far ? 1 : -1, b.armW - thinW, b.sleeve, far, (l, end, mid) => {
      if (b.shortSleeve) {
        const bare = new Raster(l.w, l.h)
        bare.thick((s.x + mid.x) / 2, (s.y + mid.y) / 2 + 1, mid.x, mid.y, b.armW - 1 - thinW, SKIN[1])
        bare.thick(mid.x, mid.y, end.x, end.y, b.armW - 1 - thinW, SKIN[1])
        shadeEdges(bare, SKIN)
        l.blit(bare)
      } else if (b.cuff) l.ellipse(end.x, end.y - 2, 1.6, 1.2, b.cuff)
      ;(b.hand ?? defaultHand)(l, end)
    }).end
  }
  b.behind?.(r, f)
  const farHand = arm({ x: hx + b.span + p.lean - thinW, y: top + 2 }, p.handF, true)
  const leg = (x: number, foot: [number, number], far: boolean) =>
    limb(
      r,
      { x, y: hipY },
      { x: x + foot[0], y: ankleY - foot[1] },
      b.thigh,
      b.shin,
      1,
      b.legW - thinW,
      b.pants,
      far,
      (l, end) => b.shoe(l, end)
    )
  leg(hx + b.gap - 1, p.back, true)
  leg(hx - b.gap, p.front, false)
  part(r, (l) => b.torso(l, f))
  drawHead(r, b.head, hx + b.headAt[0] + p.lean + p.head[0], headTop + b.headAt[1] + p.head[1], p.face, p.thin, p.lag)
  if (p.tear)
    part(r, (l) =>
      l.rect(hx + b.headAt[0] + p.lean + b.head.near[0], headTop + b.headAt[1] + b.head.near[1] + 4, 1, 2, R.mint[0])
    )
  const nearHand = arm({ x: hx - b.span + p.lean + thinW, y: top + 2 }, p.handN, false)
  if (p.item) b.item?.(r, f, nearHand)
  if (p.item) b.farItem?.(r, f, farHand)
  b.over?.(r, f)
  return r
}

/** Puffs of dust where a body hits the floor. */
export function dust(r: Raster, x: number, y: number, size: number) {
  part(r, (l) => {
    l.ellipse(x, y, size, size * 0.7, R.paper[2])
    l.ellipse(x - size * 0.6, y - size * 0.5, size * 0.6, size * 0.5, R.paper[1])
  })
}

/**
 * A body lying face-down on the floor, seen from the 3/4 side, fallen toward +x: legs trailing,
 * torso on the ground, head resting on its cheek (the head part turns a quarter — never the whole body),
 * arms reaching ahead. `squash` flattens it 1px on impact.
 */
export function lying(b: Body, o: { squash?: number; face?: Face; reach?: number; thin?: number } = {}) {
  const r = new Raster(SIZE, SIZE)
  const g = GROUND - 1
  const thick = b.lie.thick - (o.squash ?? 0) - Math.round((o.thin ?? 0) * 2)
  const x0 = 22
  const x1 = 37
  const top = g - thick + 1
  const reach = o.reach ?? 1
  // Far arm reaches ahead behind the head; far leg trails slightly higher.
  limb(
    r,
    { x: x1 - 2, y: top + 2 },
    { x: x1 + 12 + reach * 6, y: top - 1 },
    b.upper,
    b.fore,
    -1,
    b.armW,
    b.sleeve,
    true,
    (l, end) => (b.hand ?? defaultHand)(l, end)
  )
  // Legs trail straight behind (targets at full reach so the knees never fold).
  const legLen = b.thigh + b.shin
  limb(
    r,
    { x: x0 + 3, y: top + 3 },
    { x: x0 + 3 - legLen - 2, y: top + 1 },
    b.thigh,
    b.shin,
    -1,
    b.legW,
    b.pants,
    true,
    (l, end) => b.shoe(l, { x: end.x - 3, y: end.y - 1 })
  )
  limb(
    r,
    { x: x0 + 3, y: g - 2 },
    { x: x0 + 3 - legLen - 2, y: g - 2 },
    b.thigh,
    b.shin,
    1,
    b.legW,
    b.pants,
    false,
    (l, end) => b.shoe(l, { x: end.x - 3, y: end.y - 1 })
  )
  part(r, (l) => {
    const mid = (top + g) / 2
    const half = (g - top) / 2 + 0.5
    l.rect(x0 + 3, top, x1 - x0 - 3, g - top + 1, b.lie.coat[1])
    l.ellipse(x0 + 3, mid + 0.5, 4, half, b.lie.coat[1])
    l.ellipse(x1, mid + 0.5, 3, half, b.lie.coat[1])
    // The back dips at the waist; the seat makes a small bump.
    l.rect(x0 + 9, top, 7, 1, 0)
    l.ellipse(x0 + 4, top + 1, 3.5, 2, b.lie.coat[1])
    shadeEdges(l, b.lie.coat, 2, true)
    l.rect(x0 + 2, g - 1, x1 - x0, 1, b.lie.coat[3])
    l.line(x0 + 7, top + 2, x0 + 7, g - 2, b.lie.coat[2])
    b.lie.detail?.(l, x0, x1, top, g)
  })
  limb(
    r,
    { x: x1 - 1, y: g - 3 },
    { x: x1 + 10 + reach * 8, y: g - 1 },
    b.upper,
    b.fore,
    1,
    b.armW,
    b.sleeve,
    false,
    (l, end) => (b.hand ?? defaultHand)(l, end)
  )
  // The head rests on its cheek: an authored lying-head stamp, eyes closed, hair falling to the floor.
  const h = b.lie.head
  part(r, (l) => l.stamp(h.grid, x1 - 1, g + 1 - h.grid.length, { ...KEY, ...h.key }))
  b.lie.beside?.(r)
  return r
}

/** Where a body's head box sits for a pose (for effects drawn around the head). */
export function headBox(b: Body, p: Pose) {
  const top = b.hip + p.y + p.headBob + p.kneel - b.torsoH + p.squash
  const x = CX + p.x + b.headAt[0] + p.lean + p.head[0]
  const y = top + b.headAt[1] + p.head[1]
  return {
    x,
    y,
    w: b.head.w,
    h: b.head.h,
    cx: x + b.head.w / 2,
    mouth: { x: x + b.head.mouth[0], y: y + b.head.mouth[1] }
  }
}

/** Sitting on the floor: hips down, knees up, feet forward; `hug` brings both hands to the knees. */
export function sitting(b: Body, o: { hug?: boolean; slump?: number; face?: Face } = {}): Partial<Pose> {
  const kneel = GROUND - 7 - b.hip
  const shoulderY = b.hip + kneel - b.torsoH + 2
  const kneeY = GROUND - 5 - b.thigh
  const reach: [number, number] = o.hug ? [7, kneeY - shoulderY + 1] : [3, GROUND - 3 - shoulderY]
  return {
    kneel,
    front: [b.thigh + 1, 0],
    back: [b.thigh + 3, 0],
    handN: o.hug ? reach : [reach[0] - 1, reach[1]],
    handF: o.hug ? [reach[0] - 6, reach[1]] : [reach[0] + 1, reach[1]],
    lean: (o.hug ? 3 : 1) + (o.slump ?? 0),
    head: [o.hug ? 1 : 0, (o.slump ?? 0) > 1 ? 2 : o.hug ? 2 : 0],
    face: o.face ?? 'down',
    item: false
  }
}

/** A body flattened paper-thin on the floor (its own drawing, not a scaled squash), toward +x: head end. */
export function flatBody(b: Body, o: { tracks?: boolean; peel?: number } = {}) {
  const r = new Raster(SIZE, SIZE)
  const y = GROUND - 4
  part(r, (l) => {
    l.rect(8, y + 1, 8, 2, b.pants[2])
    l.rect(16, y, 14, 3, b.pants[1])
    l.rect(30, y - 1, 14, 4, b.lie.coat[1])
    l.rect(30, y - 1, 14, 1, b.lie.coat[0])
    l.rect(24, y - 3, 3, 2, SKIN[1])
    l.rect(40, y - 3, 3, 2, SKIN[1])
    l.ellipse(51, y + 1, 7, 2.6, SKIN[1])
    l.ellipse(54, y + 1, 4, 2.6, b.lie.head.key.H ?? R.hair[2])
    l.set(48, y, C.inkCool)
    l.set(48, y + 2, C.inkCool)
    if (o.tracks)
      for (let x = 12; x < 56; x += 6) {
        l.rect(x, y - 1, 3, 5, R.hair[3])
        l.paint(x + 3, y, R.hair[2])
      }
    if (o.peel) {
      // The feet end peels up like a sticker.
      l.rect(8, y + 1, 8, 2, 0)
      l.poly([8, y + 2 - o.peel * 3, 16, y, 16, y + 3], b.pants[0])
    }
  })
  return r
}
