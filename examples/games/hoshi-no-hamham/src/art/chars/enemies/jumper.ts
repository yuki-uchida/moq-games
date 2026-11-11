/**
 * カエル団員 (`jumper`): a classic cartoon frog in three-quarter view. One round teal body with a wide head, two big
 * bulging eyes on top (the signature: they break the silhouette), a wide mouth line, a pale belly and throat, folded
 * hind legs with long webbed feet and the gang's red neckerchief at the throat. 42×42 physics box.
 */
import { C, R, hexOf, ramp } from '../../palette'
import { Painter, Raster, ball, bar, farRamp, type Pt } from '../../raster'
import { lazyAnim, memo } from '../../sheet'
import { bandanaTails, limb, neckerchief, patch, tumble } from './gang'

/** Leans toward teal so the frog does not melt into the meadow's grass green. */
export const FROG = ramp('#9ff5c8', '#2fbf96', '#22877f', '#165060', hexOf(R.frogGreen[4]))
const FAR = farRamp(FROG)
const BELLY = R.frogBelly
const EYEBALL = R.paper

export type JumperEyes = 'open' | 'wide' | 'hurt' | 'dead' | 'blink'

export interface JumperPose {
  /** Body lifted above the sitting rest (px). */
  lift: number
  /** Positive: squashed wide and flat. Negative: stretched tall. */
  squash: number
  /** Hind leg: knee and ankle offsets from the hip (near leg), and the toe direction (radians, 0 = forward). */
  knee: Pt
  ankle: Pt
  toes: number
  /** The far hind leg is the near one shifted by this much. */
  farLeg: Pt
  /** Front leg: hand offset from the shoulder. */
  hand: Pt
  /** Throat sac size 0..1. */
  throat: number
  eyes: JumperEyes
  /** Heavy upper lid over the eyes, in pixels. */
  lid: number
  mouth: 'closed' | 'open' | 'tongue'
  flutter: number
  /** Body lying flat (defeat end). */
  flat: number
  /** Head tilt: shifts the head (dx, dy) relative to the body. */
  head: Pt
}

export const jumperPose = (p: Partial<JumperPose> = {}): JumperPose => ({
  lift: 0,
  squash: 0,
  knee: [8, 2],
  ankle: [-6, 8],
  toes: 0,
  farLeg: [4, -1],
  hand: [1, 7],
  throat: 0,
  eyes: 'open',
  lid: 1,
  mouth: 'closed',
  flutter: 0,
  flat: 0,
  head: [0, 0],
  ...p
})

/** A bulging eye: a green socket, a white eyeball looking ahead and a black pupil. */
function eyeBulb(l: Raster, x: number, y: number, r: number, pose: JumperPose, far: boolean) {
  const ramp = far ? FAR : FROG
  ball(l, x, y, r, r * 0.95, ramp, !far)
  const cx = Math.round(x)
  const cy = Math.round(y)
  const K = { K: C.black, w: C.white, i: C.black, g: ramp[2], G: ramp[1] }
  switch (pose.eyes) {
    case 'open':
    case 'wide': {
      const wide = pose.eyes === 'wide'
      const ew = wide ? r - 0.4 : r - 1
      ball(l, x + 0.8, y + 0.4, ew, wide ? ew : ew * 0.95, EYEBALL, false)
      const px = cx + (wide ? 1 : 2)
      const py = cy + (wide ? 0 : 1)
      l.stamp(wide ? ['KK', 'KK'] : ['KK', 'KK', 'KK'], px, py - 1, K)
      l.set(px, py - 1, C.white)
      if (!wide && pose.lid > 0) {
        // heavy lid: the socket colour closes over the top of the eyeball
        for (let j = 0; j < pose.lid; j++)
          for (let i = -r; i <= r; i++) {
            const lx = cx + i
            const ly = Math.round(y - r + 1 + j)
            if (l.get(lx, ly) === EYEBALL[0] || l.get(lx, ly) === EYEBALL[1] || l.get(lx, ly) === EYEBALL[2])
              l.set(lx, ly, ramp[1])
          }
      }
      break
    }
    case 'blink':
      l.stamp(['....', 'iiii', '....'], cx - 2, cy, K)
      break
    case 'hurt':
      l.stamp(far ? ['..i', '.ii', 'ii.', '.ii', '..i'] : ['i..', 'ii.', '.ii', 'ii.', 'i..'], cx - 1, cy - 2, K)
      break
    case 'dead':
      l.stamp(['i..i', '.ii.', '.ii.', 'i..i'], cx - 2, cy - 2, K)
      break
  }
}

/** A webbed foot: a flat paddle pointing along `a`, ending in three fanned toes. */
function foot(l: Raster, ankle: Pt, a: number, ramp: typeof FROG) {
  const dx = Math.cos(a)
  const dy = Math.sin(a)
  const m = new Raster(l.w, l.h)
  bar(m, ankle, [ankle[0] + dx * 7, ankle[1] + dy * 7], 3, ramp[1])
  const tip: Pt = [ankle[0] + dx * 7, ankle[1] + dy * 7]
  for (const k of [-1, 0, 1]) {
    const na = a + k * 0.5
    const t: Pt = [tip[0] + Math.cos(na) * 4, tip[1] + Math.sin(na) * 4]
    m.ellipse(t[0], t[1], 1.5, 1.4, ramp[1])
    bar(m, tip, t, 2, ramp[1])
  }
  // web between the toes
  m.ellipse(tip[0] + dx * 1.5, tip[1] + dy * 1.5, 2.4, 2.4, ramp[1])
  for (let y = 0; y < m.h; y++)
    for (let x = 0; x < m.w; x++) {
      if (!m.get(x, y)) continue
      const dark = !m.get(x + 1, y) || !m.get(x, y + 1)
      m.set(x, y, dark ? ramp[2] : !m.get(x - 1, y) || !m.get(x, y - 1) ? ramp[0] : ramp[1])
    }
  l.blit(m)
}

export function drawJumper(pose: JumperPose): Raster {
  const g = new Painter(64, 64)
  const f = pose.flat
  const rx = 12.5 + pose.squash * 1.5 + f * 3
  const ry = 11 - pose.squash * 1.3 - f * 4
  const cx = 30
  const cy = 55 - ry - pose.lift + f * 0.5
  const hx = cx + 8 + pose.head[0] + f * 3
  const hy = cy - 6 + pose.head[1] + f * 6
  const hip: Pt = [cx - 5, cy + ry * 0.35]

  const hind = (l: Raster, far: boolean) => {
    const ramp = far ? FAR : FROG
    const o = far ? pose.farLeg : [0, 0]
    const h: Pt = [hip[0] + o[0], hip[1] + o[1] * 0.5]
    const knee: Pt = [h[0] + pose.knee[0] + o[0] * 0.3, h[1] + pose.knee[1] + o[1]]
    const ankle: Pt = [h[0] + pose.ankle[0] + o[0], Math.min(58, h[1] + pose.ankle[1] + o[1])]
    limb(l, knee, ankle, 4, ramp, 2.2)
    limb(l, h, knee, 8, ramp, 4.4)
    ball(l, h[0], h[1], 7.4, 6.6, ramp, !far)
    foot(l, ankle, pose.toes, ramp)
  }
  g.add(-3, (l) => hind(l, true))
  g.add(3, (l) => hind(l, false))
  g.add(-1, (l) => bandanaTails(l, hx - 9, hy + 3, 6, pose.flutter + 1))

  // front legs: small, planted in front of the chest
  const sh: Pt = [hx + 1, cy + ry * 0.45]
  const hand = (l: Raster, far: boolean, ox: number) => {
    const ramp = far ? FAR : FROG
    const s: Pt = [sh[0] + ox, sh[1]]
    const e: Pt = [s[0] + pose.hand[0] * (far ? 1.3 : 1), Math.min(58, s[1] + pose.hand[1])]
    limb(l, s, e, 3, ramp, 0)
    limb(l, [e[0] - 1, e[1]], [e[0] + 2.5, e[1] + 0.5], 3, ramp, 1.6, 1.2)
  }
  g.add(-2, (l) => hand(l, true, 5))
  g.add(5, (l) => hand(l, false, 0))

  // body: one round shape with the pale belly low on the front
  g.add(0, (l) => {
    ball(l, cx, cy, rx, ry, FROG)
    patch(l, cx + 6, cy + ry - 2.5, rx - 4, 4.8, BELLY[1])
    patch(l, cx + 7, cy + ry - 1, rx - 6, 2.4, BELLY[2])
    patch(l, cx + 4, cy + ry - 4.4, rx - 8, 1.4, BELLY[0])
    // back blotches
    patch(l, cx - 6, cy - ry + 3.5, 3, 1.8, FROG[2])
    patch(l, cx + 0.5, cy - ry + 2, 2.2, 1.4, FROG[2])
    patch(l, cx - 10, cy - 1, 1.6, 2.2, FROG[2])
  })

  // throat sac under the chin
  g.add(1, (l) => {
    const t = pose.throat
    ball(l, hx + 4, hy + 6.5 + t, 6 + t * 1.8, 3.4 + t * 2.2, BELLY, false)
    l.set(Math.round(hx + 2), Math.round(hy + 6), BELLY[0])
  })
  // neckerchief knotted at the throat
  g.add(6, (l) => neckerchief(l, hx - 5, hy + 5, 13, Math.max(4, 10 - f * 5)))

  // head: a wide flat shape that overhangs the body, with the mouth line across the face
  g.add(2, (l) => {
    ball(l, hx, hy, 12.5, 8.2 - f * 1.5, FROG)
    ball(l, hx + 5, hy + 1, 8.5, 6.4 - f, FROG)
    // pale lower jaw
    patch(l, hx + 4, hy + 6, 10, 2.2, FROG[2])
    // cheek highlight
    patch(l, hx - 2, hy - 4, 4, 1.4, FROG[0])
    // mouth: a wide line from the snout back to the cheek
    const mx = Math.round(hx + 14)
    const my = Math.round(hy + 3)
    if (pose.mouth === 'closed') {
      for (let x = 0; x < 15; x++) {
        const y = my + (x < 3 ? 0 : x < 11 ? 1 : 0) - (x > 12 ? 1 : 0)
        l.set(mx - x, y, C.ink)
      }
      l.set(mx - 15, my - 1, C.ink)
      l.set(mx - 16, my - 2, C.ink)
    } else {
      patch(l, mx - 7, my + 1.6, 6.4, 2.2, C.mouth)
      for (let x = 0; x < 15; x++) l.set(mx - x, my - 1 + (x > 12 ? -1 : 0), C.ink)
      if (pose.mouth === 'tongue') patch(l, mx - 6, my + 3, 4.4, 1.2, C.tongue)
      else l.rect(mx - 2, my, 2, 1, C.white)
    }
    // nostril
    l.set(Math.round(hx + 14), Math.round(hy - 1), FROG[3])
  })

  // eyes on top: the far one sits further forward and a little higher
  const ey = hy - 7.2
  g.add(2.5, (l) => eyeBulb(l, hx + 6.5, ey - 0.5, 4.4, pose, true))
  g.add(3.5, (l) => eyeBulb(l, hx - 3.5, ey, 5, pose, false))
  return g.render()
}

const idle = memo(() => [
  drawJumper(jumperPose({ throat: 0.1, flutter: 0 })),
  drawJumper(jumperPose({ throat: 1, lift: 0.5, squash: -0.4, flutter: 1.5, lid: 0, head: [0.5, -0.5] }))
])

// frame 0 rising: stretched, legs trailing behind; frame 1 falling: legs spread wide, eyes wide
const air = memo(() => [
  drawJumper(
    jumperPose({
      lift: 14,
      squash: -2.4,
      knee: [-7, 4],
      ankle: [-11, 9],
      toes: Math.PI - 0.5,
      farLeg: [2, 1],
      hand: [-1, 5],
      eyes: 'open',
      lid: 0,
      mouth: 'open',
      flutter: 3,
      head: [1, -1]
    })
  ),
  drawJumper(
    jumperPose({
      lift: 14,
      squash: 0.2,
      knee: [-9, 6],
      ankle: [-14, 14],
      toes: 1.9,
      farLeg: [10, -3],
      hand: [8, 4],
      eyes: 'wide',
      mouth: 'open',
      flutter: -2
    })
  )
])

const land = memo(() => [
  drawJumper(
    jumperPose({
      squash: 3.2,
      knee: [14, 3],
      ankle: [-9, 8],
      farLeg: [9, 0],
      hand: [9, 7],
      eyes: 'blink',
      throat: 1,
      flutter: -2
    })
  ),
  drawJumper(jumperPose({ squash: 1.2, knee: [10, 2], ankle: [-8, 8], hand: [5, 8], throat: 0.5, flutter: 1, lid: 0 }))
])

const hurt = memo(() => [
  drawJumper(
    jumperPose({
      lift: 3,
      squash: -1.5,
      eyes: 'hurt',
      mouth: 'open',
      knee: [-6, 4],
      ankle: [-8, 9],
      toes: 0.2,
      hand: [8, -3],
      flutter: 3,
      head: [-2, -1]
    })
  ),
  drawJumper(
    jumperPose({
      squash: 2,
      eyes: 'hurt',
      mouth: 'open',
      knee: [11, 2],
      ankle: [-8, 8],
      hand: [6, 7],
      flutter: -1,
      head: [-1, 1]
    })
  )
])

const spin = (o: Partial<JumperPose>) =>
  jumperPose({
    eyes: 'hurt',
    mouth: 'open',
    lift: 3,
    knee: [-6, 4],
    ankle: [-8, 9],
    toes: 0.2,
    hand: [8, -3],
    ...o
  })
const defeat = memo(() => [
  drawJumper(spin({ lift: 2, squash: -1, flutter: 3, head: [-2, -1] })),
  tumble(drawJumper(spin({ lift: 4, eyes: 'dead' })), -1.1, 30, 40, -3, -7),
  tumble(drawJumper(spin({ lift: 4, eyes: 'dead', flutter: -2 })), -3.1, 30, 40, 2, -8),
  tumble(drawJumper(spin({ lift: 2, eyes: 'dead', flutter: 2 })), -4.7, 30, 40, -3, -7),
  drawJumper(
    jumperPose({
      flat: 1,
      squash: 2,
      eyes: 'dead',
      mouth: 'tongue',
      knee: [13, 2],
      ankle: [-10, 7],
      farLeg: [8, 0],
      hand: [8, 6],
      flutter: 1
    })
  ).shifted(0, -1)
])

export const jumperSheet = () => ({
  idle: lazyAnim(idle, 4, true),
  air: lazyAnim(air, 8, false),
  land: lazyAnim(land, 14, false),
  hurt: lazyAnim(hurt, 12, false),
  defeat: lazyAnim(defeat, 12, false)
})
