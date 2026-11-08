/**
 * The falconer's hawk (`minion:hawk`, 64×64): a fierce brown hawk with a pale barred chest, drawn natively from
 * parametric shapes: a side view and a from-above view (heading down / up the screen) with a flap phase.
 * Wings are feathered polygons (finger-like primaries), shaded with the shared top-left light.
 */
import { MINION_SPEC } from '../contract'
import { C, R } from '../palette'
import { Raster, ball, outline, shadeEdges, despeckle, type Ramp } from '../raster'
import { anim, type Sheet } from '../sheet'

const FUR = R.hairBrown
const CREAM = R.wolfCream
const BEAK = R.beak

const dir = (deg: number): [number, number] => [Math.cos((deg * Math.PI) / 180), Math.sin((deg * Math.PI) / 180)]

interface HawkPose {
  /** Flap phase: -1 wings up, 0 level, +1 wings down. */
  wing: number
  /** Wings swept back (dives). */
  sweep?: number
  /** Talons thrust forward. */
  talons?: number
  /** Vertical bob of the body. */
  bob?: number
  /** Eyes squeezed shut (hurt). */
  shut?: boolean
  /** Beak open. */
  open?: boolean
  /** Whole-body rotation in degrees (clockwise). */
  turn?: number
  /** Feathers fluffed (hurt) / folded (death). */
  puff?: number
}

/** A feathered wing: leading edge R→T, fanned primaries along the trailing edge, secondaries back to the body. */
function wing(
  l: Raster,
  root: [number, number],
  phi: number,
  len: number,
  back: [number, number],
  far: boolean,
  flip = 1
) {
  const ramp: Ramp = far ? [FUR[1], FUR[2], FUR[3], FUR[3], FUR[4]] : FUR
  const at = (r: number, a: number): [number, number] => {
    const [dx, dy] = dir(a)
    return [root[0] + dx * r * flip, root[1] + dy * r]
  }
  const tips = [
    at(len, phi + 8),
    at(len * 0.97, phi - 4),
    at(len * 0.9, phi - 16),
    at(len * 0.8, phi - 28),
    at(len * 0.66, phi - 42)
  ]
  const lead = at(len * 0.52, phi + 18)
  const pts = [root[0], root[1], lead[0], lead[1], ...tips.flat(), back[0], back[1]]
  l.poly(pts, ramp[1])
  // Primary feather separations, darker tips and a lit leading edge.
  for (let i = 1; i < tips.length; i++) {
    const m = at(len * 0.3, phi - 8 - i * 10)
    l.line(m[0], m[1], tips[i][0], tips[i][1], ramp[2])
  }
  for (const t of tips) {
    const a = [root[0] + (t[0] - root[0]) * 0.82, root[1] + (t[1] - root[1]) * 0.82]
    l.line(a[0], a[1], t[0], t[1], ramp[3])
  }
  l.line(root[0], root[1], lead[0], lead[1], ramp[0])
  l.line(lead[0], lead[1], tips[0][0], tips[0][1], ramp[0])
}

function sideHawk(p: HawkPose): Raster {
  const l = new Raster(64, 64)
  const bob = p.bob ?? 0
  const cx = 31
  const cy = 33 + bob
  const sweep = p.sweep ?? 0
  const puff = p.puff ?? 0
  const phi = -105 - (p.wing + 1) * 75 + sweep * 28
  const far = new Raster(64, 64)
  wing(far, [cx + 1, cy - 3], phi + 6, 22, [cx - 5, cy + 2], true)
  outline(far)
  l.blit(far, -2, -1)
  // Tail fan.
  const t = new Raster(64, 64)
  const tp = 8 + puff * 2
  t.poly(
    [cx - 7, cy - 1, cx - 8 - tp, cy - 3 - puff, cx - 9 - tp, cy + 3, cx - 8 - tp + 1, cy + 8 + puff, cx - 5, cy + 4],
    FUR[1]
  )
  for (let i = 0; i < 3; i++) t.line(cx - 8 - i * 2.2, cy + 1 + i * 0.4, cx - 8 - tp - 0.4, cy - 2 + i * 3.4, FUR[2])
  t.line(cx - 6, cy + 1, cx - 8 - tp, cy + 2, FUR[3])
  t.rect(cx - 8 - tp, cy - 3, 2, 12, FUR[3])
  shadeEdges(t, FUR, 1, true)
  outline(t)
  l.blit(t)
  // Legs and talons (tucked or thrust forward).
  const leg = new Raster(64, 64)
  const tl = p.talons ?? 0
  const lx = cx + 3 + tl * 7
  const ly = cy + 7 + tl * 2
  leg.thick(cx + 2, cy + 3, lx, ly, 2, BEAK[1])
  for (let k = -1; k <= 1; k++) leg.line(lx, ly, lx + 3 + tl * 2, ly + 1 + k * 1.4 + tl * 0.6, BEAK[2])
  leg.set(lx + 3 + tl * 2, ly + 1 + tl * 0.6, C.black)
  outline(leg)
  l.blit(leg)
  // Body: shaded brown ball with a pale, barred chest.
  const body = new Raster(64, 64)
  ball(body, cx, cy, 10.5, 5.8, FUR)
  for (let y = 0; y < 64; y++)
    for (let x = 0; x < 64; x++) {
      const nx = (x + 0.5 - cx) / 10.5
      const ny = (y + 0.5 - cy) / 5.8
      if (body.get(x, y) && ny > -0.05 && nx > -0.35 && nx * nx + ny * ny < 0.92) {
        const bar = (x + y) % 4 === 0 && ny > 0.25
        body.set(x, y, bar ? CREAM[3] : ny > 0.55 ? CREAM[2] : CREAM[1])
      }
    }
  body.set(cx + 3, cy + 1, CREAM[0])
  body.set(cx + 2, cy, CREAM[0])
  outline(body)
  l.blit(body)
  // Head with a hooked beak and a fierce brow.
  const hx = cx + 10
  const hy = cy - 4
  const head = new Raster(64, 64)
  ball(head, hx, hy, 4.7, 4.4, FUR)
  head.rect(hx - 1, hy + 1, 4, 3, CREAM[1])
  head.set(hx + 1, hy + 1, CREAM[0])
  const o = p.open ? 1 : 0
  head.poly([hx + 3, hy - 2, hx + 8, hy - 0.4, hx + 7, hy + 2.4, hx + 4, hy + 2], BEAK[1])
  head.set(hx + 7, hy + 2, BEAK[2])
  head.set(hx + 8, hy + 1, BEAK[3])
  head.set(hx + 4, hy - 2, BEAK[0])
  head.set(hx + 5, hy - 1, BEAK[0])
  if (o) head.poly([hx + 4, hy + 3, hx + 7, hy + 4, hx + 4, hy + 5], BEAK[2])
  outline(head)
  if (p.shut) {
    head.line(hx + 1, hy - 1, hx + 3, hy, C.black)
  } else {
    head.rect(hx + 1, hy - 2, 3, 2, BEAK[0])
    head.set(hx + 2, hy - 2, C.black)
    head.set(hx + 3, hy - 2, C.black)
    head.line(hx, hy - 4 + 1, hx + 4, hy - 2, FUR[3])
    head.set(hx + 3, hy - 3, FUR[3])
  }
  l.blit(head)
  // Near wing in front of the body.
  const w = new Raster(64, 64)
  wing(w, [cx + 1, cy - 3], phi, 25, [cx - 6, cy + 3], false)
  outline(w)
  l.blit(w)
  return p.turn ? l.rotate((p.turn * Math.PI) / 180) : l
}

/** Seen from above: heading down (`dirY` +1, head at the bottom) or up (-1, head at the top). */
function topHawk(p: HawkPose, dirY: 1 | -1): Raster {
  const l = new Raster(64, 64)
  const Y = (y: number) => (dirY === 1 ? 37 : 29) + dirY * (y - 32) + (p.bob ?? 0)
  const bob = p.bob ?? 0
  void bob
  const sweep = p.sweep ?? 0
  const flap = (p.wing + 1) / 2 // 0 up .. 1 down
  const span = 13 + flap * 14 - sweep * 5
  const lift = (1 - flap) * 8
  const feat = (px: number, py: number): [number, number] => [px, Y(py)]
  for (const s of [-1, 1]) {
    const w = new Raster(64, 64)
    const rx = 32 + s * 4
    const ry = 29
    const T = feat(rx + s * span, 24 - lift * 0.4 + sweep * 3)
    const tips: [number, number][] = [
      T,
      feat(rx + s * (span - 2), 19 - lift * 0.2 + sweep * 2),
      feat(rx + s * (span - 5), 14 - lift * 0.2 + sweep * 2),
      feat(rx + s * (span - 9), 11 + sweep * 2),
      feat(rx + s * (span - 13), 9 + sweep)
    ]
    const lead = feat(rx + s * span * 0.55, 26 - lift * 0.25)
    const pts = [rx, Y(ry), lead[0], lead[1], ...tips.flat(), 32 + s * 3, Y(14)]
    w.poly(pts, s < 0 ? FUR[1] : FUR[1])
    for (let i = 1; i < tips.length; i++) w.line(rx + s * 4, Y(27), tips[i][0], tips[i][1], FUR[2])
    for (const t of tips) {
      w.line(t[0] + (rx - t[0]) * 0.18, t[1] + (Y(ry) - t[1]) * 0.18, t[0], t[1], FUR[3])
    }
    w.line(rx, Y(ry), lead[0], lead[1], FUR[0])
    w.line(lead[0], lead[1], T[0], T[1], FUR[0])
    // Pale covert band along the leading edge.
    w.line(rx + s * 3, Y(25), rx + s * span * 0.7, Y(21 - lift * 0.2), FUR[0])
    outline(w)
    l.blit(w)
  }
  // Tail fan at the back.
  const t = new Raster(64, 64)
  t.poly([29, Y(18), 35, Y(18), 38, Y(4), 32, Y(2), 26, Y(4)], FUR[1])
  for (const x of [29, 32, 35]) t.line(x, Y(17), x + (x - 32) * 0.8, Y(4), FUR[2])
  for (let x = 26; x <= 38; x += 2) t.set(x, Y(5), FUR[3])
  t.line(26, Y(8), 38, Y(8), FUR[3])
  shadeEdges(t, FUR, 1, true)
  outline(t)
  l.blit(t)
  // Talons trailing or thrust (dives).
  const tl = p.talons ?? 0
  if (tl > 0) {
    const g = new Raster(64, 64)
    for (const s of [-1, 1]) {
      g.thick(32 + s * 2, Y(38), 32 + s * 3, Y(46 + tl * 4), 2, BEAK[1])
      for (const k of [-1, 0, 1]) g.line(32 + s * 3, Y(46 + tl * 4), 32 + s * 3 + k * 2, Y(51 + tl * 4), BEAK[2])
    }
    outline(g)
    l.blit(g)
  }
  // Body.
  const body = new Raster(64, 64)
  ball(body, 32, Y(29), 6.2, 11, FUR)
  if (dirY === 1) {
    // Pale chest and throat seen under the head.
    for (let y = 30; y < 40; y++)
      for (let x = 27; x < 37; x++)
        if (body.get(x, Y(y)) && ((x - 32) / 4.4) ** 2 + ((y - 36) / 5.4) ** 2 < 1)
          body.set(x, Y(y), (x + y) % 5 === 0 && y > 35 ? CREAM[3] : y > 38 ? CREAM[2] : CREAM[1])
    body.set(30, Y(33), CREAM[0])
  } else {
    // Back barring.
    for (let y = 24; y < 36; y += 3) for (let x = 28; x < 37; x++) body.paint(x, Y(y), FUR[2])
    body.set(30, Y(26), FUR[0])
  }
  outline(body)
  l.blit(body)
  // Head.
  const head = new Raster(64, 64)
  const hy = Y(39)
  ball(head, 32, hy, 5, 4.6, FUR)
  if (dirY === 1) {
    head.rect(30, hy + 1, 5, 2, CREAM[1])
    head.poly([31, hy + 1, 34, hy + 1, 33, hy + 6, 32, hy + 6], BEAK[1])
    head.set(32, hy + 6, BEAK[3])
    head.set(31, hy + 2, BEAK[0])
    outline(head)
    if (p.shut) {
      head.line(28, hy - 1, 30, hy - 1, C.black)
      head.line(34, hy - 1, 36, hy - 1, C.black)
    } else {
      for (const x of [29, 34]) {
        head.rect(x, hy - 2, 2, 2, BEAK[0])
        head.set(x + (x < 32 ? 1 : 0), hy - 1, C.black)
      }
      head.line(28, hy - 3, 31, hy - 1, FUR[3])
      head.line(36, hy - 3, 33, hy - 1, FUR[3])
    }
  } else {
    head.set(30, hy - 2, FUR[0])
    outline(head)
  }
  l.blit(head)
  return l
}

export function hawkFrame(view: 'down' | 'up' | 'side', p: HawkPose): Raster {
  return despeckle(view === 'side' ? sideHawk(p) : topHawk(p, view === 'down' ? 1 : -1))
}

const FLAP = [-0.9, 0, 0.95, 0.1]
const BOB = [-1, 0, 1, 0]

export function buildHawkSheet(): Sheet {
  const spec = MINION_SPEC.hawk
  const sheet: Sheet = {}
  const views = ['down', 'up', 'side'] as const
  for (const v of views) {
    const fly = spec[`fly_${v}`]
    sheet[`fly_${v}`] = anim(
      FLAP.map((wing, i) => hawkFrame(v, { wing, bob: BOB[i] })),
      fly.fps,
      fly.loop,
      { lift: [14, 15, 16, 15] }
    )
    const sw = spec[`swoop_${v}`]
    sheet[`swoop_${v}`] = anim(
      [
        { wing: -0.7, sweep: 0.2, turn: v === 'side' ? -8 : 0, open: true },
        { wing: 0.4, sweep: 1, talons: 1, turn: v === 'side' ? 28 : 0, open: true },
        { wing: 0.9, sweep: 1, talons: 1, turn: v === 'side' ? 22 : 0, open: true, bob: 1 }
      ].map((p) => hawkFrame(v, p)),
      sw.fps,
      sw.loop,
      {}
    )
  }
  const hurt = spec.hurt
  sheet.hurt = anim(
    [
      hawkFrame('side', { wing: -1, turn: -22, shut: true, open: true, puff: 2, bob: -2 }),
      hawkFrame('side', { wing: 0.4, turn: -10, shut: true, puff: 1, bob: -1 })
    ],
    hurt.fps,
    hurt.loop
  )
  const death = spec.death
  const d = anim(
    [
      hawkFrame('side', { wing: -0.2, turn: 40, shut: true, open: true, puff: 2 }),
      hawkFrame('side', { wing: 0.9, turn: 110, shut: true, puff: 2, bob: 2 }),
      hawkFrame('side', { wing: 0.6, turn: 200, shut: true, puff: 3, bob: 4 }),
      hawkFrame('side', { wing: 0.3, turn: 255, shut: true, puff: 3, bob: 8 })
    ],
    death.fps,
    death.loop
  )
  d.alpha = [1, 1, 0.7, 0.3]
  sheet.death = d
  return sheet
}
