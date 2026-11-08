/**
 * The guild humanoid rig: a 3D-lite skeleton (forward / right / up, in pixels) projected into the three game views
 * (down, up, side-facing-right). Poses are written once and drawn from all three views, so a new job only needs data:
 * an `Outfit` (colours, hair, headgear, overlays) plus held items (see items.ts) and a move set (see moves.ts).
 *
 * Proportions: ~2.6 heads tall (hair top ≈ y 13, feet y 56 in a 64×64 frame), angular jaw and shoulders so humans read
 * sharper than the round monster heroes. Everything is drawn natively with the master palette, never scaled.
 */
import { C, DARKER, R } from '../palette'
import { Raster, outline, shadeEdges, type Ramp } from '../raster'

export type View = 'down' | 'up' | 'side'

/** Forward / right / up offsets in pixels (right = the character's right hand side). */
export interface V3 {
  f: number
  r: number
  u: number
}
export const V = (f = 0, r = 0, u = 0): V3 => ({ f, r, u })
export const vadd = (a: V3, b: V3) => V(a.f + b.f, a.r + b.r, a.u + b.u)
export const vsub = (a: V3, b: V3) => V(a.f - b.f, a.r - b.r, a.u - b.u)
export const vscale = (a: V3, k: number) => V(a.f * k, a.r * k, a.u * k)
export const vlen = (a: V3) => Math.hypot(a.f, a.r, a.u)
export const vdot = (a: V3, b: V3) => a.f * b.f + a.r * b.r + a.u * b.u
export const vnorm = (a: V3) => vscale(a, 1 / (vlen(a) || 1))
export const vlerp = (a: V3, b: V3, t: number) => V(a.f + (b.f - a.f) * t, a.r + (b.r - a.r) * t, a.u + (b.u - a.u) * t)

/** Direction from pitch (degrees from straight up toward forward) and yaw (toward the character's right). */
export interface Aim {
  p: number
  y?: number
}
export function aimDir(a: Aim): V3 {
  const p = (a.p * Math.PI) / 180
  const y = ((a.y ?? 0) * Math.PI) / 180
  return V(Math.sin(p) * Math.cos(y), Math.sin(y), Math.cos(p) * Math.cos(y))
}

export type Pt = [number, number]

/** Projection of body space into a view. Origin = the ground point under the body. */
export class Cam {
  constructor(
    readonly view: View,
    readonly ox = 32,
    readonly oy = 56,
    /** Rotation of the whole skeleton about the ground origin (degrees, + = falling backwards). */
    readonly tilt = 0,
    readonly at: V3 = V()
  ) {}

  /** Rotates by the pose tilt and shifts. */
  place(p: V3): V3 {
    if (!this.tilt) return vadd(p, this.at)
    const a = (this.tilt * Math.PI) / 180
    const c = Math.cos(a)
    const s = Math.sin(a)
    return vadd(V(p.f * c - p.u * s, p.r, p.f * s + p.u * c), this.at)
  }

  px(p: V3): Pt {
    const q = this.place(p)
    switch (this.view) {
      case 'side':
        return [this.ox + q.f, this.oy - q.u + q.r * 0.3]
      case 'down':
        return [this.ox - q.r, this.oy - q.u + q.f * 0.5]
      case 'up':
        return [this.ox + q.r, this.oy - q.u - q.f * 0.5]
    }
  }

  /** Larger = nearer to the viewer. */
  depth(p: V3): number {
    const q = this.place(p)
    return this.view === 'side' ? q.r : this.view === 'down' ? q.f : -q.f
  }

  /** The unit direction `d` projected as a 2D vector (for orienting items). */
  dir(d: V3): Pt {
    const a = this.px(V())
    const b = this.px(d)
    return [b[0] - a[0], b[1] - a[1]]
  }
}

/** Two-bone IK in 3D: the middle joint for a limb from `root` to `end`; `bend` is the direction the joint pokes out. */
export function ik(root: V3, end: V3, l1: number, l2: number, bend: V3): { mid: V3; end: V3 } {
  let d = vsub(end, root)
  let dist = vlen(d) || 0.001
  const max = l1 + l2 - 0.02
  if (dist > max) {
    d = vscale(d, max / dist)
    dist = max
    end = vadd(root, d)
  }
  const dir = vscale(d, 1 / dist)
  const along = (l1 * l1 - l2 * l2 + dist * dist) / (2 * dist)
  const out = Math.sqrt(Math.max(0, l1 * l1 - along * along))
  let perp = vsub(bend, vscale(dir, vdot(bend, dir)))
  if (vlen(perp) < 0.01) perp = V(0, 0, -1)
  return { mid: vadd(vadd(root, vscale(dir, along)), vscale(vnorm(perp), out)), end }
}

/** Snaps a coordinate so a brush of width `w` covers exactly `w` pixels (odd → pixel centre, even → pixel edge). */
const snap = (v: number, w: number) => (w % 2 ? Math.floor(v) + 0.5 : Math.round(v))

/** A bar of constant pixel width between two points. */
export function bar(l: Raster, a: Pt, b: Pt, w: number, c: number) {
  return l.thick(snap(a[0], w), snap(a[1], w), snap(b[0], w), snap(b[1], w), w, c)
}

/** Draws on a layer ordered by depth, each layer outlined as its own part so overlaps become inner contours. */
export class Painter {
  private list: { depth: number; seq: number; draw: (l: Raster) => void; line: boolean }[] = []
  constructor(
    readonly w = 64,
    readonly h = 64
  ) {}

  add(depth: number, draw: (l: Raster) => void, line = true) {
    this.list.push({ depth, seq: this.list.length, draw, line })
  }

  render(): Raster {
    const out = new Raster(this.w, this.h)
    const layer = new Raster(this.w, this.h)
    this.list.sort((a, b) => a.depth - b.depth || a.seq - b.seq)
    for (const it of this.list) {
      layer.data.fill(0)
      it.draw(layer)
      const b = layer.bounds()
      if (!b) continue
      // Outline only inside the part's bounding box (much cheaper than whole-frame passes).
      const crop = layer.crop(b.x - 2, b.y - 2, b.w + 4, b.h + 4)
      if (it.line) outline(crop)
      out.blit(crop, b.x - 2, b.y - 2)
    }
    return out
  }
}

/** Colours of limbs hidden behind the body: one ramp step darker. */
export const farRamp = (r: Ramp): Ramp => [r[1], r[2], r[3], r[3], r[4]]

// ---------------------------------------------------------------------------------------------------------
// Pose

export interface ItemState {
  aim: Aim
  /** Bow draw 0..1 (string pulled back). */
  draw?: number
  /** Wand/staff glow 0..1. */
  glow?: number
  /** Arc smear from this aim to `aim`. */
  smear?: Aim
  hidden?: boolean
  /** Shield facing: yaw of its normal toward the character's right (deg); 0 = facing straight ahead. */
  turn?: number
}

export type Face = 'normal' | 'shout' | 'hurt' | 'dead' | 'blink' | 'focus'

export interface Pose {
  /** Whole-body vertical offset (negative sinks). */
  bob: number
  /** Hips lowered (knees bend). */
  crouch: number
  /** Shoulders forward of the hips. */
  lean: number
  /** Shoulders toward the right of the hips. */
  sway: number
  /** Head offset from its rest on the shoulders. */
  head: V3
  /** Hands relative to their shoulder. */
  mainHand: V3
  offHand: V3
  /** Feet in body space (right foot = main side). */
  mainFoot: V3
  offFoot: V3
  main?: ItemState
  off?: ItemState
  face: Face
  /** Whole-skeleton tilt in degrees (death falls) and its shift. */
  tilt: number
  at: V3
  /** Cloth/hair sway in px used by trailing parts (hat tip, cape). */
  flow: number
}

export function pose(p: Partial<Pose> = {}): Pose {
  return {
    bob: 0,
    crouch: 0,
    lean: 0,
    sway: 0,
    head: V(),
    mainHand: V(0.5, 1, -9.5),
    offHand: V(0.5, -1, -9.5),
    mainFoot: V(0, 3, 0),
    offFoot: V(0, -3, 0),
    face: 'normal',
    tilt: 0,
    at: V(),
    flow: 0,
    ...p
  }
}

// ---------------------------------------------------------------------------------------------------------
// Outfits (data)

export type HairStyle = 'short' | 'spiky' | 'long' | 'bob' | 'none'
export type Brow = 'eager' | 'stern' | 'calm' | 'sly'

export interface Overlay {
  kind: 'vest' | 'belt' | 'mail' | 'robe' | 'tabard' | 'apron' | 'collar' | 'plate'
  ramp: Ramp
  /** Trim / buckle colour. */
  trim?: Ramp
}

export interface Outfit {
  skin: Ramp
  hair: Ramp
  hairStyle: HairStyle
  headgear?: { kind: string; ramp: Ramp; trim?: Ramp }
  brow: Brow
  tunic: Ramp
  /** Sleeve colour (default = tunic); `skin` for bare arms. */
  sleeves?: Ramp | 'skin'
  gloves?: Ramp
  overlays: Overlay[]
  pants: Ramp
  boots: Ramp
  /** Behind-the-back extras: quiver, cape ... (see BACK_ITEMS). */
  back?: { kind: string; ramp: Ramp; trim?: Ramp }
  /** The main (weapon) hand is the character's left. */
  lefty?: boolean
  /** Extra torso half-width (heavier build) and head scale tweaks. */
  bulk?: number
}

// ---------------------------------------------------------------------------------------------------------
// Items and extension registries

export interface ItemSpec {
  kind: string
  a: Ramp
  b?: Ramp
  trim?: Ramp
}

export interface ItemCtx {
  cam: Cam
  paint: Painter
  hand: V3
  /** The other hand (string hand of a bow). */
  other: V3
  state: ItemState
  spec: ItemSpec
  depth: number
  far: boolean
  /** The pose being drawn (for flow etc.). */
  pose: Pose
}

export const ITEMS: Record<string, (c: ItemCtx) => void> = {}
export const HEADGEAR: Record<string, (c: HeadCtx) => void> = {}
export const BACK_ITEMS: Record<string, (c: BackCtx) => void> = {}

export interface HeadCtx {
  paint: Painter
  view: View
  /** Head centre in screen px (x is an integer edge in down/up views). */
  cx: number
  cy: number
  depth: number
  gear: NonNullable<Outfit['headgear']>
  outfit: Outfit
  pose: Pose
}
export interface BackCtx {
  cam: Cam
  paint: Painter
  torso: TorsoGeom
  item: NonNullable<Outfit['back']>
  pose: Pose
}

export interface TorsoGeom {
  view: View
  /** Shoulder-line and hip-line centres (screen) and half widths. */
  sx: number
  sy: number
  hx: number
  hy: number
  ws: number
  wh: number
}

// ---------------------------------------------------------------------------------------------------------
// Torso geometry helpers

/** Half width and centre of a torso row. */
export function rowOf(T: TorsoGeom, y: number): { cx: number; hw: number } {
  const t = Math.min(1, Math.max(0, (y - T.sy) / Math.max(1, T.hy - T.sy)))
  return { cx: T.sx + (T.hx - T.sx) * t, hw: T.ws + (T.wh - T.ws) * t }
}

/** Fills the torso rows [y0, y1) (optionally inset / clipped by `pred`). */
export function fillTorso(
  l: Raster,
  T: TorsoGeom,
  y0: number,
  y1: number,
  c: number,
  pred?: (dx: number, y: number, hw: number) => boolean,
  inset = 0
) {
  for (let y = Math.round(y0); y < Math.round(y1); y++) {
    const { cx, hw } = rowOf(T, y + 0.5)
    const h = Math.round(hw) - inset
    const c0 = Math.round(cx)
    for (let x = c0 - h; x < c0 + h; x++) {
      const dx = x + 0.5 - cx
      if (!pred || pred(dx, y, h)) l.set(x, y, c)
    }
  }
}

// ---------------------------------------------------------------------------------------------------------
// Head

const clampHairTop = (dy: number) => dy
void clampHairTop

/** The skull mask in head-local coordinates (dx, dy from the head centre). */
export function inSkull(view: View, dx: number, dy: number): boolean {
  if (view === 'side') {
    if ((dx / 8.4) ** 2 + (dy / 7.8) ** 2 <= 1) return true
    // Jaw wedge toward the front.
    return dy > 1 && dy <= 8 && dx > -3 && dx < 5.5 - (dy - 1) * 0.55
  }
  if ((dx / 8.6) ** 2 + (dy / 7.8) ** 2 <= 1) return true
  return dy > 2 && dy <= 8.2 && Math.abs(dx) < 6.4 - (dy - 2) * 0.95
}

function drawSkull(l: Raster, view: View, cx: number, cy: number, skin: Ramp, pose: Pose, brow: Brow, o: Outfit) {
  const cxi = Math.round(cx)
  const cyi = Math.round(cy)
  for (let y = cyi - 9; y <= cyi + 9; y++)
    for (let x = cxi - 10; x <= cxi + 10; x++) {
      const dx = x + 0.5 - cxi
      const dy = y + 0.5 - cyi
      if (inSkull(view, dx, dy)) l.set(x, y, skin[1])
    }
  shadeEdges(l, skin, 1, false)
  // Nose / ear / cheek shade.
  const eyeInk = C.black
  if (view === 'down') {
    l.set(cxi, cyi + 3, skin[2])
    l.set(cxi - 1, cyi + 3, skin[1])
    if (pose.face === 'hurt' || pose.face === 'dead' || pose.face === 'blink') {
      // Closed eyes: short dashes (hurt: > <).
      for (const s of [-1, 1]) {
        const ex = cxi + s * 3.5 - (s < 0 ? 1.5 : 0.5)
        if (pose.face === 'dead') {
          l.set(ex, cyi, eyeInk)
          l.set(ex + 1, cyi + 1, eyeInk)
          l.set(ex + 1, cyi, eyeInk)
          l.set(ex, cyi + 1, eyeInk)
        } else {
          l.set(ex, cyi + (pose.face === 'hurt' ? 0 : 1), eyeInk)
          l.set(ex + 1, cyi + 1, eyeInk)
        }
      }
    } else {
      for (const s of [-1, 1]) {
        const ex = cxi + s * 3.5 - (s < 0 ? 1.5 : 0.5)
        l.set(ex, cyi, eyeInk)
        l.set(ex, cyi + 1, eyeInk)
        l.set(ex + 1, cyi, C.white)
        l.set(ex + 1, cyi + 1, eyeInk)
      }
    }
    brows(l, view, cxi, cyi, brow, pose.face, o)
    mouth(l, view, cxi, cyi + 5, pose.face, skin)
  } else if (view === 'side') {
    // Ear (back of head), eye and nose at the front.
    l.set(cxi - 2, cyi + 1, skin[2])
    l.set(cxi - 2, cyi + 2, skin[2])
    l.set(cxi - 3, cyi + 1, skin[3])
    const ex = cxi + 4
    if (pose.face === 'hurt' || pose.face === 'dead' || pose.face === 'blink') {
      l.set(ex, cyi + 1, eyeInk)
      l.set(ex + 1, cyi + (pose.face === 'hurt' ? 0 : 1), eyeInk)
    } else {
      l.set(ex, cyi, eyeInk)
      l.set(ex, cyi + 1, eyeInk)
      l.set(ex + 1, cyi, C.white)
      l.set(ex + 1, cyi + 1, eyeInk)
    }
    // Nose bump sticking out of the profile.
    l.set(cxi + 8, cyi + 2, skin[1])
    l.set(cxi + 8, cyi + 3, skin[2])
    brows(l, view, cxi, cyi, brow, pose.face, o)
    mouth(l, view, cxi + 4, cyi + 5, pose.face, skin)
  }
}

function brows(l: Raster, view: View, cx: number, cy: number, brow: Brow, face: Face, o: Outfit) {
  const ink = o.hair[3]
  if (face === 'dead') return
  const angry = face === 'shout' || brow === 'stern' || brow === 'eager'
  const drop = brow === 'sly' ? 1 : 0
  if (view === 'down') {
    for (const s of [-1, 1]) {
      const x0 = cx + (s < 0 ? -6 : 2)
      // Inner end lower = angry; hurt brows slant upward.
      const hurt = face === 'hurt'
      const inner = s < 0 ? x0 + 3 : x0
      const outer = s < 0 ? x0 : x0 + 3
      for (let i = 0; i < 4; i++) {
        const x = x0 + i
        const nearInner = Math.abs(x - inner) < Math.abs(x - outer)
        const y = cy - 2 + (angry && !hurt ? (nearInner ? 1 : 0) : hurt ? (nearInner ? 0 : 1) : 0) + drop
        if (brow === 'calm' && i === 3 - (s < 0 ? 3 : 0)) continue
        l.set(x, y, ink)
      }
    }
  } else if (view === 'side') {
    const y = cy - 2 + drop
    for (let i = 0; i < 4; i++) l.set(cx + 2 + i, y + (angry && i < 2 ? 1 : 0) - (angry && i > 2 ? 0 : 0), ink)
  }
}

function mouth(l: Raster, view: View, x: number, y: number, face: Face, skin: Ramp) {
  if (face === 'shout') {
    l.rect(x - 2, y - 1, 4, 3, C.black)
    l.set(x - 1, y + 1, R.jobRed[2])
    l.set(x, y + 1, R.jobRed[2])
  } else if (face === 'hurt') {
    l.rect(x - 1, y, 3, 2, C.black)
  } else if (face === 'dead') {
    l.rect(x - 1, y, 3, 1, skin[3])
  } else if (face === 'focus') {
    l.rect(x - 1, y, 2, 1, skin[3])
  } else {
    l.rect(x - 1, y, view === 'down' ? 3 : 2, 1, skin[3])
  }
}

/** Hair cap masks per style; returns true for pixels of the hair in head-local coordinates. */
function hairMask(style: HairStyle, view: View, dx: number, dy: number): boolean {
  if (style === 'none') return false
  const big = (dx / 9.3) ** 2 + ((dy + 0.7) / 8.7) ** 2 <= 1
  const long = style === 'long' || style === 'bob'
  if (view === 'up') {
    if (big && dy < 6.5 + (long ? 3 : 0)) return true
    if (long && Math.abs(dx) < 8.6 && dy < 11 - Math.abs(dx) * 0.6 && dy > 0) return true
    return false
  }
  if (view === 'down') {
    if (!big) return long && Math.abs(dx) > 7.2 && Math.abs(dx) < 9.2 && dy > 0 && dy < 8.5
    const fringe = -3.2 + (((Math.floor(dx + 9) * 7) % 5) / 5) * 2.6 + (Math.abs(dx) < 2 ? -0.5 : 0)
    if (dy < fringe) return true
    if (Math.abs(dx) > 7 && dy < 3.5) return true
    return long && Math.abs(dx) > 6.6 && dy < 9
  }
  // side: back + top, fringe at the front
  if (big && dx < 0.5 && dy < 3.6 + (long ? 3 : 0)) return true
  if (big && dy < -3.4 + Math.max(0, dx - 1) * 0.35) return true
  if (big && dx >= 0.5 && dx < 6.6 && dy < -1.4 - (dx > 4.5 ? 1.2 : 0)) return true
  if (long && dx < 1 && dx > -8.6 && dy < 10.5 - (dx + 8) * 0.25 && dy > 0) return true
  return false
}

function drawHair(l: Raster, view: View, cx: number, cy: number, style: HairStyle, ramp: Ramp, flow: number) {
  const cxi = Math.round(cx)
  const cyi = Math.round(cy)
  for (let y = cyi - 12; y <= cyi + 12; y++)
    for (let x = cxi - 11; x <= cxi + 11; x++) {
      if (hairMask(style, view, x + 0.5 - cxi, y + 0.5 - cyi)) l.set(x, y, ramp[1])
    }
  if (style === 'spiky') {
    // Hair spikes sweeping up and back.
    const spikes = view === 'side' ? [-6, -3, 0, 3] : [-6, -2.5, 1, 4.5]
    spikes.forEach((sx, i) => {
      const h = 4 + (i % 2)
      const lean = view === 'side' ? -1 : view === 'up' ? 0 : i - 1.5
      l.poly(
        [cxi + sx - 2, cyi - 6, cxi + sx + 2, cyi - 6, cxi + sx + lean * 0.6 + (flow > 0 ? 1 : 0), cyi - 7 - h],
        ramp[1]
      )
    })
  }
  shadeEdges(l, ramp, 1, true)
  // Highlight streak on the top-left and a darker root line under the fringe.
  if (view !== 'up') {
    l.paint(cxi - 4, cyi - 6, ramp[0])
    l.paint(cxi - 3, cyi - 7, ramp[0])
  } else {
    l.paint(cxi - 3, cyi - 6, ramp[0])
  }
}

// ---------------------------------------------------------------------------------------------------------
// The renderer

export interface Held {
  main?: ItemSpec
  off?: ItemSpec
}

/** Draws one frame of a humanoid in `view`. */
export function renderHuman(view: View, p: Pose, o: Outfit, held: Held = {}): Raster {
  const cam = new Cam(view, 32, 56, p.tilt, p.at)
  const paint = new Painter()
  const mainS = o.lefty ? -1 : 1
  const bulk = o.bulk ?? 0
  const hipU = 13 + p.bob - p.crouch
  const shU = hipU + 12 - p.crouch * 0.25
  const hipC = V(0, 0, hipU)
  const shC = V(p.lean, p.sway, shU)
  const headC = vadd(V(p.lean * 1.15, p.sway * 1.1, shU + 9.4), p.head)
  const [shx, shy] = cam.px(shC)
  const [hx, hy] = cam.px(hipC)
  const viewW = view === 'side' ? 5 : 6.5 + bulk
  const viewH = view === 'side' ? 4.5 : 5.5 + bulk
  const T: TorsoGeom = {
    view,
    sx: view === 'side' ? shx + 0.5 : Math.round(shx),
    sy: Math.round(shy) - 1,
    hx: view === 'side' ? hx + 0.5 : Math.round(hx),
    hy: Math.round(hy),
    ws: viewW,
    wh: viewH
  }
  const [hdx, hdy] = cam.px(headC)
  const headX = view === 'side' ? Math.round(hdx + 0.5) : Math.round(hdx)
  const headY = Math.round(hdy)
  const isRobe = o.overlays.some((v) => v.kind === 'robe')

  // Back items sit behind the body (in front of it when seen from behind).
  if (o.back) BACK_ITEMS[o.back.kind]?.({ cam, paint, torso: T, item: o.back, pose: p })
  const backDepth = view === 'up' ? 4 : -0.8
  void backDepth

  // Legs.
  const legL = 6.6
  for (const sgn of [mainS, -mainS] as const) {
    const foot = sgn === mainS ? p.mainFoot : p.offFoot
    const footW = V(foot.f, sgn * foot.r, foot.u)
    const hip = V(0, sgn * 2.8, hipU)
    const { mid, end } = ik(hip, footW, legL, legL, V(1, 0, 0.1))
    const far = view === 'side' && sgn * 1 < 0
    const depth = view === 'side' ? cam.depth(end) - 0.2 : -1
    const pants = far ? farRamp(o.pants) : o.pants
    const boots = far ? farRamp(o.boots) : o.boots
    const h = cam.px(hip)
    const m = cam.px(mid)
    const e = cam.px(end)
    paint.add(depth, (l) => {
      if (!isRobe) {
        bar(l, h, m, 5, pants[1])
        bar(l, m, e, 4, pants[1])
        shadeEdges(l, pants, 1, false)
      }
      // Boot: a 4-wide shaft, a cuff and a sole with a toe pointing forward.
      const bx = Math.round(e[0])
      const by = Math.round(e[1])
      l.rect(bx - 2, by - 4, 4, 4, boots[1])
      if (view === 'side') l.rect(bx - 2, by - 1, 7, 2, boots[1])
      else l.rect(bx - 3, by - 1, 6, 2, boots[1])
      shadeEdges(l, boots, 1, false)
      l.rect(bx - 2, by - 5, 4, 1, boots[0])
      l.rect(bx - 2, by - 4, 4, 1, boots[2])
    })
  }

  // Torso.
  const torsoDepth = 0
  paint.add(torsoDepth, (l) => {
    const body = o.tunic
    fillTorso(l, T, T.sy, T.hy + (isRobe ? 0 : 1), body[1], (dx, y, hw) => {
      // Angular shoulders: cut the top corners.
      return !(y <= T.sy && Math.abs(dx) > hw - 1.5)
    })
    shadeEdges(l, body, view === 'side' ? 2 : 2, false)
    // Folds
    if (view !== 'side')
      for (let y = T.sy + 4; y < T.hy - 2; y += 4) l.paint(T.hx + (view === 'down' ? 3 : -3), y, body[2])
    // collar / neck
    if (view === 'down') {
      l.rect(T.sx - 2, T.sy, 4, 2, o.skin[2])
      l.set(T.sx - 3, T.sy, body[0])
      l.set(T.sx + 2, T.sy, body[0])
    }
  })
  // Overlays.
  for (const ov of o.overlays) OVERLAYS[ov.kind]?.({ paint, T, view, ov, o, pose: p, hipU, cam })

  // Arms.
  const shoulderR = view === 'side' ? 0 : 6.2 + bulk
  for (const sgn of [mainS, -mainS] as const) {
    const isMain = sgn === mainS
    const off = isMain ? p.mainHand : p.offHand
    const sh = V(p.lean, p.sway + sgn * (view === 'side' ? 3.2 : shoulderR), shU - 1.6)
    const hand = vadd(sh, V(off.f, sgn * off.r, off.u))
    const { mid, end } = ik(sh, hand, 5.4, 5.6, V(-0.3, sgn * 0.8, -0.6))
    const far = view === 'side' && sgn < 0
    const sleeve = o.sleeves === 'skin' ? o.skin : (o.sleeves ?? o.tunic)
    const rs = far ? farRamp(sleeve) : sleeve
    const skin = far ? farRamp(o.skin) : o.skin
    const gl = o.gloves ? (far ? farRamp(o.gloves) : o.gloves) : undefined
    const handFront = view === 'down' ? end.f > 3 : view === 'up' ? -end.f > 3 : false
    const depth = view === 'side' ? cam.depth(end) * 1 + (sgn > 0 ? 0.8 : -0.8) : handFront ? 0.9 : 0.4
    const a = cam.px(sh)
    const m = cam.px(mid)
    const e = cam.px(end)
    const item = isMain ? held.main : held.off
    const state = isMain ? p.main : p.off
    if (item && state && !state.hidden) {
      const fn = ITEMS[item.kind]
      fn?.({
        cam,
        paint,
        hand: end,
        other: vadd(
          V(p.lean, p.sway - sgn * (view === 'side' ? 3.2 : shoulderR), shU - 1.6),
          V(
            (isMain ? p.offHand : p.mainHand).f,
            -sgn * (isMain ? p.offHand : p.mainHand).r,
            (isMain ? p.offHand : p.mainHand).u
          )
        ),
        state,
        spec: item,
        depth: view === 'up' && end.f > 3 ? -0.3 : depth + 0.002,
        far,
        pose: p
      })
    }
    paint.add(depth, (l) => {
      bar(l, a, m, 4, rs[1])
      bar(l, m, e, 3, o.sleeves === 'skin' ? skin[1] : (gl ?? rs)[1])
      shadeEdges(l, rs, 1, false)
      if (gl) shadeEdges(l, gl, 1, false)
    })
    paint.add(depth + 0.004, (l) => {
      // Fist (over the grip of whatever it holds).
      const fx = Math.round(e[0])
      const fy = Math.round(e[1])
      l.rect(fx - 1, fy - 1, 3, 3, skin[1])
      l.set(fx + 1, fy + 1, skin[2])
      l.set(fx, fy + 1, skin[2])
      l.set(fx - 1, fy - 1, skin[0])
    })
  }

  // Head.
  const headDepth = 0.5
  paint.add(headDepth, (l) => {
    drawSkull(l, view, headX, headY, o.skin, p, o.brow, o)
  })
  if (o.hairStyle !== 'none' && !(o.headgear && HEADGEAR_HIDES_HAIR.has(o.headgear.kind))) {
    paint.add(headDepth + 0.01, (l) => drawHair(l, view, headX, headY, o.hairStyle, o.hair, p.flow))
  }
  if (o.headgear)
    HEADGEAR[o.headgear.kind]?.({
      paint,
      view,
      cx: headX,
      cy: headY,
      depth: headDepth + 0.02,
      gear: o.headgear,
      outfit: o,
      pose: p
    })

  return paint.render()
}

/** Headgear kinds that replace the hair entirely. */
export const HEADGEAR_HIDES_HAIR = new Set<string>(['helmet'])

// ---------------------------------------------------------------------------------------------------------
// Torso overlays

export interface OverlayCtx {
  paint: Painter
  T: TorsoGeom
  view: View
  ov: Overlay
  o: Outfit
  pose: Pose
  hipU: number
  cam: Cam
}
export const OVERLAYS: Record<string, (c: OverlayCtx) => void> = {
  vest({ paint, T, view, ov }) {
    paint.add(0.1, (l) => {
      const r = ov.ramp
      fillTorso(l, T, T.sy + 1, T.hy - 1, r[1], (dx, y, hw) => {
        if (view === 'down') {
          const gap = 3 - Math.min(2, (y - T.sy) / 6)
          return Math.abs(dx) > gap
        }
        return view === 'side' ? dx < 1.5 : true
      })
      shadeEdges(l, r, 1, true)
      if (view === 'down')
        for (let y = T.sy + 3; y < T.hy - 2; y += 1) l.paint(T.sx + (y % 2 ? 2 : 3) - 3 + (y % 2 ? 0 : 0), y, r[2])
    })
  },
  belt({ paint, T, view, ov }) {
    paint.add(0.2, (l) => {
      const y = T.hy - 3
      fillTorso(l, T, y, y + 2, ov.ramp[1], undefined, 0)
      shadeEdges(l, ov.ramp, 1, false)
      if (view === 'down' && ov.trim) {
        l.rect(T.hx - 1, y, 2, 2, ov.trim[1])
        l.set(T.hx - 1, y, ov.trim[0])
      }
      if (view === 'side' && ov.trim) l.rect(Math.round(T.hx) + 3, y, 2, 2, ov.trim[1])
    })
  },
  mail({ paint, T, view, ov }) {
    // Chainmail coif collar + a ring texture drawn over the torso and a short skirt.
    paint.add(0.1, (l) => {
      const r = ov.ramp
      fillTorso(l, T, T.sy, T.hy + 3, r[1], (dx, y) => !(y <= T.sy && Math.abs(dx) > T.ws - 1.5))
      shadeEdges(l, r, 2, true)
      for (let y = T.sy + 1; y < T.hy + 3; y++)
        for (let x = Math.round(T.sx - T.ws); x < T.sx + T.ws; x++)
          if (l.get(x, y) === r[1] && (x + y) % 2 === 0 && (y % 3 !== 0 || x % 2 === 0)) l.set(x, y, r[2])
      if (view === 'down') {
        l.rect(T.sx - 3, T.sy - 1, 6, 2, r[1])
        l.set(T.sx - 3, T.sy - 1, r[0])
      }
    })
  },
  robe({ paint, T, view, ov, pose, hipU }) {
    // Long robe: widens to the hem near the ankles, swinging slightly with the pose.
    paint.add(0.15, (l) => {
      const r = ov.ramp
      const top = T.hy - 2
      const hem = 53 - Math.max(0, pose.bob < -1 ? 0 : 0) + Math.min(0, 0)
      const sway = Math.round(pose.flow * 0.5)
      for (let y = top; y < hem; y++) {
        const t = (y - top) / (hem - top)
        const hw = Math.round(T.wh + 1 + t * 3.2)
        const c0 = Math.round(T.hx + sway * t)
        for (let x = c0 - hw; x < c0 + hw; x++) {
          // Notched hem.
          if (y >= hem - 1 && (x + c0) % 4 === 0) continue
          l.set(x, y, r[1])
        }
      }
      shadeEdges(l, r, 2, true)
      if (view === 'down') for (let y = top + 3; y < hem - 1; y++) if ((y + 1) % 3 !== 0) l.paint(T.hx, y, r[2])
      if (view === 'up') for (let y = top + 3; y < hem - 1; y += 2) l.paint(T.hx + 1, y, r[2])
      void hipU
    })
  },
  tabard({ paint, T, view, ov }) {
    paint.add(0.12, (l) => {
      if (view === 'side') return
      fillTorso(l, T, T.sy + 2, T.hy + 3, ov.ramp[1], (dx) => Math.abs(dx) < 3.2)
      shadeEdges(l, ov.ramp, 1, true)
    })
  },
  apron({ paint, T, view, ov }) {
    paint.add(0.12, (l) => {
      fillTorso(l, T, T.sy + 3, T.hy + 4, ov.ramp[1], (dx) => (view === 'side' ? dx > -0.5 : Math.abs(dx) < 4.6))
      shadeEdges(l, ov.ramp, 1, true)
    })
  },
  collar({ paint, T, view, ov }) {
    paint.add(0.3, (l) => {
      if (view === 'up') return
      fillTorso(l, T, T.sy - 1, T.sy + 2, ov.ramp[1], (dx) => Math.abs(dx) < 4.6)
      shadeEdges(l, ov.ramp, 1, true)
    })
  },
  plate({ paint, T, view, ov }) {
    paint.add(0.1, (l) => {
      const r = ov.ramp
      fillTorso(l, T, T.sy, T.hy - 1, r[1], (dx, y) => !(y <= T.sy && Math.abs(dx) > T.ws - 1.5))
      shadeEdges(l, r, 2, true)
      if (view === 'down') l.rect(T.sx - 1, T.sy + 2, 1, T.hy - T.sy - 5, r[2])
    })
  }
}
