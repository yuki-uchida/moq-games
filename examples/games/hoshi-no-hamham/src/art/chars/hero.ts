/**
 * ハム彦 (`hero`): a two-heads-tall pink hamster kid in three-quarter view, facing right. Big mochi head with a cream
 * mask, round ears, a three-spike tuft; a small pear body; short arms with peach paws; stub legs with peach feet; a
 * navy neckerchief knotted at the back of the neck with a swallowtail end, and a gold star clasp at the front.
 *
 * Drawn on the hamster family build (`hamster.ts`): this file is his look (ramps, the family's 1× stamps), his
 * accessories (the scarf and the star clasp) and his clips, every clip a few key poses on a `track()` with ears,
 * tuft, tail and scarf driven by `lag()` / `follow()`.
 *
 * Depth (back to front): far ear, tail, short scarf end, long scarf end, far leg, far foot, near leg, body, far
 * arm, near foot, scarf band, knot, clasp, near ear, head + face, near arm (the far arm comes to the front when the
 * pose says so: facing the camera). Raised arms (`up`) sit between the near ear and the head; the face wash puts
 * the forearms under the scarf band and both paws over the face. Speed streaks of a smear frame go behind everything.
 */
import type { SheetModule } from '../module'
import { clamp, ease, lag, type Key } from '../motion'
import { R, ramp } from '../palette'
import { Raster, farRamp, type Pt } from '../raster'
import { Frame, carve, cel, fill, oval, polygon, ribbon, shadow, smooth, spline } from '../rig'
import { lazyAnim, memo } from '../sheet'
import {
  LONG,
  cyc,
  drawHamster,
  hamLook,
  hamPose,
  sample,
  shift,
  stampOn,
  type Foot,
  type HamAccessory,
  type HamPose,
  type Hand
} from './hamster'

export { hamPose, type Brow, type Eyes, type Foot, type HamPose, type Hand, type Mouth, type Tuft } from './hamster'

const PINK = R.hamPink
const PINK_HEX = ['#ffe3ee', '#ffb3cf', '#f07fa8', '#b84f80'] as const
const CREAM = R.hamCream
const SCARF = R.scarf
const SCARF_FAR = farRamp(SCARF)
const GOLD = R.gold
// peach paws and feet: their shadows borrow the pink fur's shade and deep (fewer colours per frame)
const PAW = ramp('#ffe6dc', '#ffc8b4', PINK_HEX[2], PINK_HEX[3], '#3a1a22')

// ------------------------------------------------------------------------------------------------ accessories

/** The neckerchief: two ends knotted at the back of the neck (the long one with a swallowtail), the band, the knot. */
const scarf: HamAccessory = ({ g, pose: p, torso, head, knot: knotFrame, headShape, side }) => {
  const knot = knotFrame.pt(0, 0)
  const endPath = (angle: number, len: number, phase: number): Pt[] => {
    const a = ((angle + p.turn + p.lean * 0.3) * Math.PI) / 180
    const dir = [-Math.cos(a), Math.sin(a)]
    const perp = [-dir[1], dir[0]]
    const pts: Pt[] = []
    for (let i = 0; i <= 5; i++) {
      const s = i / 5
      const w = p.scarf[2] * Math.sin(phase - s * 3.6) * s * 1.9
      pts.push([knot[0] + dir[0] * len * s + perp[0] * w, knot[1] + dir[1] * len * s + perp[1] * w])
    }
    return spline(pts)
  }
  g.add(-4.2, (l) => {
    const path = endPath(p.scarf[0] + 30, p.scarf[1] * 0.5, p.scarf[3] + 1.9)
    ribbon(l, path, (t) => 2.8 + t * 0.4, SCARF_FAR[1])
    cel(l, { shade: 1.2 })
  })
  g.add(-4, (l) => {
    const path = endPath(p.scarf[0], p.scarf[1], p.scarf[3])
    ribbon(l, path, (t) => 2.8 + t * 1.8, SCARF[1])
    // the swallowtail: a notch cut into the end
    const end = path[path.length - 1]
    const before = path[Math.max(0, path.length - 5)]
    const d = Math.hypot(end[0] - before[0], end[1] - before[1]) || 1
    const ux = (end[0] - before[0]) / d
    const uy = (end[1] - before[1]) / d
    carve(
      l,
      Frame.at(0, 0),
      polygon([
        [end[0] + ux * 3 - uy * 1.7, end[1] + uy * 3 + ux * 1.7],
        [end[0] - ux * 1.9, end[1] - uy * 1.9],
        [end[0] + ux * 3 + uy * 1.7, end[1] + uy * 3 - ux * 1.7]
      ])
    )
    smooth(l)
    cel(l, { shade: 1.3, rim: 1 })
  })
  g.add(1, (l) => {
    const band = spline([torso.pt(-9.5, -15.6), torso.pt(-3, -13.4), torso.pt(5, -13.2), torso.pt(11, -15.4)])
    ribbon(l, band, () => 3.8, SCARF[1])
    cel(l, { shade: 1.4, rim: 1 })
    shadow(l, head.moved(0.5, 1.6), headShape)
  })
  if (side > 0.4)
    g.add(1.1, (l) => {
      fill(l, Frame.at(knot[0], knot[1]), oval(0, 0, 2.5, 2.4), SCARF[1])
      cel(l, { shade: 1.2, rim: 1 })
    })
}

/** The gold star clasp at the front of the band. */
const clasp: HamAccessory = ({ g, torso, f }) =>
  g.add(1.2, (l) => {
    stampOn(l, torso, ['..h..', '.hyy.', 'yyyyy', '.yYy.', '.Y.Y.'], 0.5 + 7.7 * f, -12.4, {
      h: GOLD[0],
      y: GOLD[1],
      Y: GOLD[2]
    })
  })

/** ハム彦's look: the family build at scale 1 in pink, cream and peach, with the scarf and the clasp. */
export const HERO_LOOK = hamLook({
  fur: PINK,
  furFar: farRamp(PINK),
  mask: CREAM,
  earBowl: R.hamEar,
  paw: PAW,
  pawFar: farRamp(PAW),
  streak: SCARF[1],
  accessories: [scarf, clasp]
})

/** One frame of ハム彦. */
export const drawHam = (p: HamPose): Raster => drawHamster(HERO_LOOK, p)

// ----------------------------------------------------------------------------------------------------- clips

const N = 8
const draw = (poses: HamPose[]) => poses.map(drawHam)

const idlePoses = memo(() => {
  const breath = Array.from({ length: N }, (_, i) => 0.5 - 0.5 * Math.cos(cyc(i)))
  const late = lag(breath, { stiffness: 0.35, damping: 0.5, loop: true })
  return breath.map((b, i) =>
    hamPose({
      squash: 0.5 - b * 1.2,
      head: [0, b > 0.6 ? 1 : 0],
      earN: 2 + late[i] * 9,
      earF: 1 + late[i] * 7,
      tuftY: late[i] > 0.12 ? 1 : 0,
      armN: [7, 2.5 - Math.round(b)],
      armF: [2, 2.5 - Math.round(b)],
      scarf: [40 + Math.sin(cyc(i)) * 4, 12, 0.9, 0.6 + cyc(i)],
      tail: -late[i] * 1.5
    })
  )
})

const idle = () => draw(idlePoses())
const blink = () => draw(idlePoses().map((p) => ({ ...p, eyes: 'closed' as const })))

const run = () => {
  // contact (0, 4), down (1, 5), passing (2, 6), up (3, 7)
  const FOOT_CYCLE: Foot[] = [
    [11, 0, -10], // contact: heel first, well ahead
    [5.5, 0, 0], // down: the body sinks over the planted foot
    [0, 0, 0], // passing
    [-5.5, 0.5, 26], // push-off from the toe
    [-10, 4.5, 68], // kicked up behind, sole showing
    [-6, 7.5, 45], // swinging through
    [2, 6, 8], // crossing under the body
    [9, 2.5, -16] // reaching for the next contact
  ]
  const BOB = [1, 0, 1, 2]
  const SQUASH = [0.5, 1.4, 0, -1.2]
  const bob = Array.from({ length: N }, (_, i) => BOB[i % 4])
  const late = lag(bob, { stiffness: 0.3, damping: 0.4, loop: true })
  return draw(
    Array.from({ length: N }, (_, i) => {
      const swing = Math.cos(cyc(i - 3.5)) // near arm forward while the near foot pushes off
      return hamPose({
        x: 2,
        y: 3 + bob[i],
        lean: 12,
        squash: SQUASH[i % 4],
        head: [1, Math.round(-bob[i] * 0.4)],
        nod: 2 + late[i] * 2,
        earN: 24 + late[i] * 8,
        earF: 20 + late[i] * 7,
        tuft: 'back',
        tuftY: late[i] > 0.4 ? -1 : 0,
        // in the run both feet travel under the hips (the near one sits further back when standing)
        footN: shift(FOOT_CYCLE[i], 3.5),
        footF: shift(FOOT_CYCLE[(i + 4) % N], -2),
        armN: [1 + swing * 6, 4.5 - Math.abs(swing) * 1.5],
        armF: [-1 - swing * 5, 4 - Math.abs(swing) * 1.5],
        scarf: [-4 + Math.sin(cyc(i) + 1) * 6, 14, 2.4, cyc(i) * 2],
        tail: -late[i],
        mouth: 'open'
      })
    })
  )
}

/** Looks back over his shoulder, grooms the near cheek with both paws (two strokes), settles. */
const wait = () => {
  const keys: Key<HamPose>[] = [
    { at: 0, pose: {} },
    { at: 1, pose: { face: 0.35, nod: -3, lean: -2, earN: 6, earF: -2, tail: -1 } },
    { at: 2, pose: { face: -0.7, nod: -6, lean: -4, head: [-1, 0], earN: 12, earF: -6, eyes: 'open', brow: 'raised' } },
    {
      at: 3,
      pose: {
        face: 1,
        nod: 6,
        lean: 2,
        head: [0, -1],
        armN: [6, -2],
        armF: [4, -2],
        earN: 0,
        earF: 2,
        eyes: 'happy',
        brow: 'none'
      },
      ease: ease.out
    },
    // the face wash: head bowed, both paws on the muzzle, two strokes down (cheeks squashed under the paws)
    { at: 4, pose: { head: [1, -3], nod: 13, lean: 4, groom: 1, rub: 0, squish: 0.3, earN: -6, earF: -4 } },
    { at: 5, pose: { head: [1, -4], nod: 15, rub: 1, squish: 1, earN: -2, earF: -1 } },
    { at: 6, pose: { head: [1, -3], nod: 13, rub: 0, squish: 0.3, earN: -6, earF: -4 } },
    { at: 7, pose: { head: [1, -4], nod: 15, rub: 1, squish: 1, earN: -2, earF: -1 } },
    {
      at: 8,
      pose: {
        head: [0, -1],
        nod: 4,
        lean: 1,
        groom: 0,
        rub: 0,
        armN: [6, 0.5],
        armF: [3, 1],
        squish: 0,
        earN: 7,
        earF: 5
      }
    },
    { at: 9, pose: { nod: 0, armN: [7, 2.5], armF: [2, 2.5], eyes: 'open', earN: 3, earF: 2 }, ease: ease.out },
    { at: 11, pose: { earN: 2, earF: 1 } }
  ]
  const poses = sample(idlePoses()[0], keys, 12)
  // the head swing drives the ears and the scarf a beat late
  const late = lag(
    poses.map((p) => p.face * 10 + p.nod),
    { stiffness: 0.35, damping: 0.45 }
  )
  return draw(
    poses.map((p, i) =>
      hamPose({
        ...p,
        earN: p.earN + late[i] * 0.6,
        earF: p.earF + late[i] * 0.5,
        tuftY: Math.abs(late[i]) > 3 ? -1 : 0,
        scarf: [40 - late[i] * 1.5, 12, 1, 0.6 + i * 0.7],
        tail: p.tail + (i === 10 ? -1 : 0)
      })
    )
  )
}

/** Turning on the spot: facing the camera, then three-quarters of the way to the new facing. */
const turn = () =>
  draw([
    hamPose({
      face: 0,
      armN: [-3, 6],
      armF: [3, 6],
      footN: [1.5, 0, 0],
      footF: [-1.5, 0, 0],
      scarf: [95, 11, 1.4, 1.5],
      earLift: 0.5,
      tuftY: -1,
      squash: -0.3
    }),
    hamPose({
      face: 0.7,
      look: -0.5,
      armN: [5, 3],
      armF: [2, 3.5],
      scarf: [62, 12, 1.4, 3],
      earN: 6,
      earF: 4
    })
  ])

/** Braking: leaning back, heels dug in, arms flailing forward, scarf and ears thrown forward. */
const skid = () =>
  draw([
    hamPose({
      x: 2,
      lean: -12,
      squash: 1,
      head: [-1, 0],
      nod: -5,
      footN: [7, 0, -24],
      footF: [3, 0, -20],
      armN: [-9, -3],
      armF: [9, -1],
      earN: -22,
      earF: -18,
      tuft: 'up',
      scarf: [-60, 13, 1.5, 0],
      eyes: 'wide',
      brow: 'raised',
      mouth: 'o'
    }),
    hamPose({
      x: 1,
      lean: -19,
      squash: 1.6,
      head: [-1, 0],
      nod: -7,
      footN: [8, 0, -32],
      footF: [4, 0, -26],
      armN: [-9, -5],
      armF: [9, -3],
      earN: -30,
      earF: -26,
      tuft: 'up',
      scarf: [-76, 13, 2.2, 1.6],
      eyes: 'wide',
      brow: 'raised',
      mouth: 'o'
    }),
    hamPose({
      x: 2,
      y: 0.6,
      lean: -17,
      squash: 1.3,
      head: [-1, 1],
      nod: -6,
      footN: [8, 0, -29],
      footF: [4, 0, -23],
      armN: [-8, -6],
      armF: [9, -0.5],
      earN: -26,
      earF: -22,
      tuft: 'up',
      tuftY: -1,
      scarf: [-72, 13, 2.2, 3.6],
      eyes: 'wide',
      brow: 'raised',
      mouth: 'o'
    })
  ])

/** Launch: stretched tall and arched back, arms thrown up; then rising, ears and scarf pulled down (flutter). */
const jump = () =>
  draw([
    hamPose({
      ...LONG,
      up: true,
      air: 2,
      x: -1,
      lean: -9,
      squash: -3.6,
      headSquash: -1,
      head: [-1, 1],
      nod: -7,
      armN: [-17, -9],
      armF: [15, -12],
      footN: [-4, 1, 46],
      footF: [-1, 0.5, 34],
      earN: 30,
      earF: 26,
      earLift: -0.5,
      tuft: 'back',
      scarf: [86, 17, 1.4, 0],
      eyes: 'wide',
      brow: 'raised',
      mouth: 'open'
    }),
    hamPose({
      ...LONG,
      up: true,
      air: 4,
      lean: -5,
      squash: -2.2,
      headSquash: -0.5,
      nod: -5,
      armN: [-17, -7],
      armF: [16, -10],
      footN: [-4, 3, 38],
      footF: [-1, 2, 26],
      earN: 38,
      earF: 33,
      earLift: -1,
      tuft: 'back',
      scarf: [80, 18, 2.6, 1.2],
      mouth: 'open'
    }),
    hamPose({
      ...LONG,
      up: true,
      air: 4,
      y: 0.6,
      lean: -6,
      squash: -1.9,
      headSquash: -0.5,
      nod: -6,
      armN: [-17, -6],
      armF: [16, -9],
      footN: [-3, 3.5, 42],
      footF: [0, 2.4, 22],
      earN: 34,
      earF: 30,
      earLift: -0.7,
      tuft: 'back',
      tuftY: 1,
      scarf: [88, 18, 2.6, 3.2],
      mouth: 'open'
    })
  ])

/** The top of the arc: tucked into a ball while still rising, then opening out into a float. */
const apex = () =>
  draw([
    hamPose({
      air: 6,
      lean: 8,
      squash: 1.8,
      headSquash: 0.5,
      head: [1, -1],
      nod: 10,
      footN: [4, 7, 16],
      footF: [6, 6, 8],
      armN: [7, 2],
      armF: [4, 1],
      earN: 16,
      earF: 13,
      scarf: [58, 15, 1.8, 0.5],
      eyes: 'squint',
      mouth: 'o'
    }),
    hamPose({
      ...LONG,
      air: 5,
      lean: -6,
      squash: -1.4,
      head: [-1, 1],
      nod: -12,
      footN: [-5, 2, 28],
      footF: [7, 3, -14],
      armN: [-14, -6],
      armF: [14, -4],
      open: true,
      earN: -16,
      earF: -13,
      earLift: 2,
      tuft: 'up',
      tuftY: -1,
      scarf: [12, 17, 2.4, 2],
      eyes: 'wide',
      mouth: 'open'
    })
  ])

/** Falling: arms up and out with the paws open, feet dangling, ears, tuft and scarf streaming upward. */
const fall = () => {
  const n = 3
  const flutter = Array.from({ length: n }, (_, i) => Math.sin(cyc(i, n)))
  return draw(
    flutter.map((w, i) =>
      hamPose({
        ...LONG,
        up: true,
        open: true,
        air: 4,
        lean: -4,
        squash: -1.8,
        headSquash: -0.4,
        nod: 11,
        armN: [-14 + w, -12 - w],
        armF: [17 - w, -5 + w],
        footN: [-1, 1 + w * 0.6, 34],
        footF: [2, 0.5 - w * 0.6, 26],
        earN: -22 - w * 6,
        earF: -18 + w * 5,
        earLift: 2.4,
        tuft: 'up',
        tuftY: i === 1 ? -1 : 0,
        scarf: [-84 + w * 10, 18, 2.8, cyc(i, n)],
        eyes: 'wide',
        brow: 'raised',
        mouth: 'o'
      })
    )
  )
}

/** Landing: squash, rebound with the ears flying up, a small overshoot, settle. */
const land = () =>
  draw([
    hamPose({
      squash: 3.6,
      headSquash: 1.4,
      head: [0, -1],
      y: -1,
      footN: [-3, 0, 0],
      footF: [3, 0, 0],
      armN: [9, 5],
      armF: [5, 6],
      earN: -14,
      earF: -12,
      earLift: -1,
      tuft: 'up',
      scarf: [92, 10, 1, 0],
      eyes: 'squint',
      mouth: 'grit'
    }),
    hamPose({
      squash: -1.6,
      headSquash: -0.5,
      y: 1,
      head: [0, 1],
      footN: [-1, 0, 0],
      footF: [1, 0, 0],
      armN: [6, 1],
      armF: [2, 1],
      earN: 10,
      earF: 8,
      earLift: 2,
      tuft: 'up',
      tuftY: -1,
      scarf: [60, 11, 1.5, 1],
      eyes: 'open',
      mouth: 'open'
    }),
    hamPose({
      squash: 1,
      headSquash: 0.3,
      armN: [7, 3],
      armF: [2, 3],
      earN: -5,
      earF: -4,
      scarf: [48, 12, 1.2, 2],
      mouth: 'smile'
    }),
    hamPose({ squash: 0.3, earN: 3, earF: 2, scarf: [40, 12, 1, 3] })
  ])

/**
 * The bite: lunge (the contact frame), CHOMP, recoil, chew, settle. It opens on the lunge with no wind-up: the
 * simulation bites on the frame of the press.
 */
const bite = () =>
  draw([
    // the lunge: a smear frame, the body drawn out along its path, feet left behind, speed streaks trailing
    hamPose({
      x: 3,
      y: 1,
      lean: 26,
      squash: 0.4,
      smear: 4,
      nod: 4,
      armN: [9, -3],
      armF: [9, -4],
      footN: [-12, 1.5, 58],
      footF: [-8, 0.5, 38],
      earN: 48,
      earF: 42,
      tuft: 'back',
      scarf: [-4, 18, 2.4, 1],
      jaw: 1.2,
      eyes: 'open',
      brow: 'hard',
      mouth: 'bite'
    }),
    hamPose({
      x: 3,
      y: -0.5,
      lean: 16,
      squash: 2.2,
      headSquash: 0.6,
      nod: 6,
      armN: [8, 0],
      armF: [8, -1],
      footN: [-6, 0, 10],
      footF: [-1, 0, 0],
      earN: -20,
      earF: -10,
      tuft: 'up',
      scarf: [-48, 14, 2, 2.6],
      jaw: 0.5,
      eyes: 'squint',
      brow: 'hard',
      mouth: 'chomp'
    }),
    // the recoil overshoots backward
    hamPose({
      x: 0,
      lean: -9,
      squash: -1.2,
      nod: -7,
      armN: [6, 3],
      armF: [3, 3],
      footN: [-2, 0, 0],
      footF: [2, 0, -6],
      earN: 22,
      earF: 18,
      scarf: [8, 13, 1.6, 3.6],
      jaw: 0.2,
      eyes: 'half',
      mouth: 'grit'
    }),
    hamPose({
      x: 1,
      lean: 3,
      squash: 0.6,
      nod: 3,
      puff: 1,
      earN: 3,
      earF: 2,
      scarf: [30, 12, 1.2, 4.6],
      eyes: 'happy',
      mouth: 'flat'
    }),
    hamPose({ puff: 0.4, earN: 1, scarf: [38, 12, 1, 5.6], eyes: 'happy', mouth: 'smile' })
  ])

/** Knocked back: limbs out, eyes > <; recoil; recover with a wince. */
const hurt = () =>
  draw([
    hamPose({
      ...LONG,
      x: 3,
      air: 3,
      lean: -22,
      squash: -1.6,
      headSquash: -0.5,
      head: [-1, 0],
      nod: -14,
      armN: [-14, -3],
      armF: [15, -3],
      open: true,
      footN: [6, 3, -28],
      footF: [9, 4, -32],
      earN: -30,
      earF: -26,
      earLift: 1,
      tuft: 'up',
      scarf: [-66, 14, 2.4, 0],
      eyes: 'hurt',
      brow: 'worried',
      mouth: 'open'
    }),
    hamPose({
      x: -2,
      lean: -8,
      squash: 2,
      headSquash: 0.6,
      nod: 7,
      armN: [-8, 1],
      armF: [9, 2],
      footN: [1, 0, 0],
      footF: [4, 0, -8],
      earN: -6,
      earF: -5,
      scarf: [14, 12, 1.6, 1.6],
      eyes: 'hurt',
      brow: 'worried',
      mouth: 'grit'
    }),
    hamPose({
      x: -1,
      lean: -3,
      squash: 0.3,
      armN: [6, 3],
      armF: [2, 3],
      earN: 6,
      earF: 5,
      scarf: [32, 12, 1.2, 3],
      eyes: 'half',
      brow: 'worried',
      mouth: 'grit'
    })
  ])

/** Knock-out: flung back, three tumbling quarter turns, landing on his back with a bounce, flat out and dizzy. */
const die = () => {
  const flail = (i: number) =>
    hamPose({
      armN: [-6 + i * 2, -6 + i * 3],
      armF: [8 - i * 3, -8 + i * 2],
      footN: [5 - i * 2, 4, -30 + i * 20],
      footF: [7, 6 - i, -40],
      earN: -20 + i * 15,
      earF: -16 + i * 12,
      tuft: 'up',
      scarf: [-40 + i * 25, 13, 2.2, i * 1.7],
      eyes: 'hurt',
      brow: 'worried',
      mouth: 'open'
    })
  /**
   * Flat out on his back (designed, not a turned standing pose): the rig lies with the head at the left and the
   * belly up, the head tipped back, both feet up in the air at the right, the arms flopped down onto the ground, the
   * scarf lying along the ground and the tuft flattened. `twitch` kicks the feet for the sustained loop.
   */
  const flat = (twitch: number) =>
    hamPose({
      lie: true,
      face: 0,
      turn: -90,
      air: -7,
      x: 4,
      squash: 0.6,
      nod: -40,
      head: [-6, 7],
      armN: [-7, -5],
      armF: [-3, -8],
      footN: [11 + twitch, 0.5 - twitch, -45 + twitch * 14],
      footF: [6 - twitch, -0.5 + twitch, -40 - twitch * 10],
      earN: 34,
      earF: 30,
      tuft: 'back',
      tail: 1,
      scarf: [92, 13, 0.4, 1],
      eyes: 'dizzy',
      mouth: 'tongue'
    })
  return draw([
    { ...flail(0), turn: -14, air: 3, x: -2, lean: -12 },
    { ...flail(1), turn: -90, air: 1, x: -1 },
    { ...flail(2), turn: -180, air: 1.5, x: 0 },
    { ...flail(1), turn: -270, air: 0, x: 1 },
    // lands: squashed flat, feet flung up, eyes still > <
    { ...flat(0.6), air: -6, squash: 2, headSquash: 0.6, eyes: 'hurt', mouth: 'open', earN: 16, earF: 12 },
    // the bounce
    { ...flat(-0.4), air: -4.5, squash: -0.8, headSquash: -0.3, eyes: 'hurt', mouth: 'o', earN: 44, earF: 38 },
    // out cold: the feet twitch, the spirals turn
    flat(0),
    { ...flat(1), eyes: 'dizzy2' }
  ])
}

/** Victory: crouch, spring up with both arms in a V, float, come down, squash, rebound. */
const cheer = () => {
  // the V: both arms raised behind the head, paws out beside and above the ears
  const V_N: Hand = [-18, -13]
  const V_F: Hand = [17, -12]
  const keys: Key<HamPose>[] = [
    {
      at: 0,
      pose: {
        squash: 3.2,
        headSquash: 1,
        y: -1.5,
        air: 0,
        lean: 6,
        nod: 9,
        up: false,
        armN: [5, 4],
        armF: [2, 5],
        footN: [0, 0, 0]
      }
    },
    {
      at: 1,
      pose: {
        squash: -3,
        headSquash: -1,
        y: 0,
        air: 3,
        lean: -6,
        nod: -6,
        up: true,
        armN: [-17, -10],
        armF: [16, -9],
        footN: [-2, 1, 36]
      }
    },
    {
      at: 2,
      pose: { squash: -1.4, headSquash: -0.4, air: 6.5, nod: -8, armN: V_N, armF: V_F, footN: [0, 2.5, 24] },
      ease: ease.out
    },
    { at: 3, pose: { squash: 0, headSquash: 0, air: 8, lean: -4, nod: -8, footN: [1, 3, 16] } },
    { at: 4, pose: { air: 7.5, nod: -6, armN: [-18, -12], armF: [17, -11] }, ease: ease.inOut },
    {
      at: 5,
      pose: { air: 3.5, squash: -1.2, lean: 0, nod: -2, up: false, armN: [-9, -4], armF: [9, -3], footN: [0, 0.5, 10] },
      ease: ease.in
    },
    {
      at: 6,
      pose: {
        air: 0,
        squash: 3,
        headSquash: 1,
        y: -1.5,
        lean: 5,
        nod: 8,
        armN: [-5, -3],
        armF: [7, -3],
        footN: [0, 0, 0]
      }
    },
    { at: 7, pose: { squash: -1, headSquash: -0.3, y: 0, lean: 2, nod: 2, armN: [2, -1], armF: [4, -1] } }
  ]
  const poses = sample(hamPose({ ...LONG, eyes: 'happy', mouth: 'wide' }), keys, N)
  const late = lag(
    poses.map((p) => p.air),
    { stiffness: 0.35, damping: 0.4, loop: true }
  )
  return draw(
    poses.map((p, i) => ({
      ...p,
      footF: [p.footN[0] + 1, p.footN[1], p.footN[2]] as Foot,
      earN: 4 + late[i] * 4,
      earF: 3 + late[i] * 3.5,
      earLift: clamp(-late[i] * 0.6, -1, 2),
      tuft: late[i] > 1 ? ('back' as const) : late[i] < -1 ? ('up' as const) : ('neutral' as const),
      scarf: [50 + late[i] * 9, 12, 1.6, i * 0.9] as const,
      mouth: i === 0 || i === 6 ? ('grin' as const) : ('wide' as const)
    }))
  )
}

/** Paddling: tilted forward, cheeks puffed, arms and feet paddling in alternation, the scarf trailing. */
const swim = () => {
  const n = 6
  const bob = Array.from({ length: n }, (_, i) => Math.sin(cyc(i, n)))
  const late = lag(bob, { stiffness: 0.3, damping: 0.4, loop: true })
  return draw(
    bob.map((b, i) => {
      const a = cyc(i, n)
      return hamPose({
        y: 2 + Math.round(b * 0.6),
        lean: 26,
        nod: -10,
        armN: [5 + Math.cos(a) * 5, 3 + Math.sin(a) * 3],
        armF: [5 - Math.cos(a) * 4, 3 - Math.sin(a) * 2.5],
        footN: [-7 + Math.cos(a) * 3, 4 + Math.sin(a) * 2, 50],
        footF: [-4 - Math.cos(a) * 3, 4 - Math.sin(a) * 2, 45],
        earN: 18 + late[i] * 6,
        earF: 15 + late[i] * 5,
        tuft: 'back',
        scarf: [4 + late[i] * 6, 13, 1.4, a],
        tail: late[i],
        puff: 1.3,
        eyes: 'open',
        brow: 'hard',
        mouth: 'flat'
      })
    })
  )
}

export const sheets: SheetModule = {
  hero: () => ({
    idle: lazyAnim(idle, 8, true),
    blink: lazyAnim(blink, 8, true),
    wait: lazyAnim(wait, 8, false, { hold: [1, 1, 4, 1, 1, 1, 1, 1, 2, 1, 1, 1] }),
    run: lazyAnim(run, 14, true),
    turn: lazyAnim(turn, 20, false),
    skid: lazyAnim(skid, 14, false, { sustain: 2 }),
    jump: lazyAnim(jump, 14, false, { sustain: 2 }),
    apex: lazyAnim(apex, 10, false),
    fall: lazyAnim(fall, 12, true),
    land: lazyAnim(land, 18, false),
    bite: lazyAnim(bite, 24, false),
    hurt: lazyAnim(hurt, 12, false),
    die: lazyAnim(die, 10, false, { sustain: 2 }),
    cheer: lazyAnim(cheer, 12, true),
    swim: lazyAnim(swim, 10, true)
  })
}
