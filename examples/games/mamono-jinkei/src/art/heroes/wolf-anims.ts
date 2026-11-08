/**
 * Pose tables of the wolf heroes: every animation of `heroSpec('wolf')`, as frame lists per job and direction.
 * Poses are fed to renderWolf (wolf-render.ts); lying/collapsed poses live in wolf-down.ts.
 */
import { C, R, type RampName } from '../palette'
import { Raster, type Ramp } from '../raster'
import { glint, sparkle, sweat } from './body'
import { JOB_RAMP, drawHeadgear, type Dir, type JobId } from './jobs'
import { hold, smear } from './slime'
import { lyingFrame } from './wolf-down'
import { renderWolf, type Anchors, type LegPose, type WolfPose } from './wolf-render'
import type { V } from './wolf-parts'

export type { Dir, JobId }
void C
const TAU = Math.PI * 2
const L0: LegPose = { ox: 0, lift: 0 }
type Legs = [LegPose, LegPose]

/** Slime pseudopod offsets (relative to its shoulder, rest = [3, 2]) → wolf hand offsets (rest = [0, 0]). */
function fromSlime(o: V): V {
  const dx = (o[0] - 3) * 0.8
  const dy = (o[1] - 2) * 0.8
  const len = Math.hypot(dx, dy)
  const k = len > 13 ? 13 / len : 1
  return [dx * k, dy * k]
}

/** Pale sound arcs radiating from a point (the howl). */
function soundArcs(r: Raster, cx: number, cy: number, dir: number, n: number, spread = 0.55, r0 = 6) {
  const cols = [R.magic[0], R.paper[1], R.magic[1]]
  for (let i = 0; i < n; i++) {
    const rad = r0 + i * 4
    const a = spread * (1 - i * 0.12)
    r.ring(cx, cy, rad, rad + 1, cols[i % 3], dir - a, dir + a)
  }
}

const sparkleSpots: V[] = [
  [-17, -14],
  [16, -18],
  [-14, -30],
  [19, -6],
  [-20, -4],
  [10, -33]
]

function sparkles(r: Raster, a: Anchors, ramp: Ramp, n: number, phase: number, big = false) {
  for (let i = 0; i < n; i++) {
    const [dx, dy] = sparkleSpots[(i + phase) % sparkleSpots.length]
    const x = a.gx + dx
    const y = 56 + dy
    if ((i + phase) % 2 === 0) sparkle(r, x, y, ramp, big ? 2 : 1)
    else glint(r, x, y, i % 2 ? ramp : R.gold)
  }
}

const REST_FX = { glow: 0 }
void REST_FX

/** Frames of one animation for one job and direction. */
function frames(job: JobId, dir: Dir, name: string): Raster[] {
  const ramp = JOB_RAMP[job]
  const side = dir === 'side'
  const back = dir === 'up'
  const W = (p: WolfPose) => renderWolf(job, dir, p)
  const sgn = back ? -1 : 1
  switch (name) {
    case 'idle': {
      return [0, 1, 2, 3].map((i) =>
        W({
          crouch: [0, 0, 1, 0][i],
          chest: [0, 0.6, 0.4, 0][i],
          tail: [-0.6, 0, 0.7, 0.2][i],
          tailUp: [0, 0.1, 0, 0][i],
          ears: [0, 0, 0.25, 0][i],
          hdy: [0, 0, 0.5, 0][i],
          sway: [0, 0, 1, 1][i],
          eyes: i === 3 ? 'half' : 'open',
          armR: [0, [0, 0, 0.5, 0][i]],
          armL: [0, [0, 0, 0.5, 0][i]]
        })
      )
    }
    case 'walk': {
      return [0, 1, 2, 3, 4, 5].map((i) => {
        const ph = (i / 6) * TAU
        const crouch = [1, 0, 0, 1, 0, 0][i]
        const legs: Legs = side
          ? [
              { ox: 4 * Math.sin(ph), lift: Math.max(0, Math.cos(ph)) * 3.4 },
              { ox: -4 * Math.sin(ph), lift: Math.max(0, -Math.cos(ph)) * 3.4 }
            ]
          : [
              { ox: 0, lift: Math.max(0, Math.sin(ph)) * 3.4 },
              { ox: 0, lift: Math.max(0, -Math.sin(ph)) * 3.4 }
            ]
        const swing = side ? -3 * Math.sin(ph) : 0
        return W({
          crouch,
          legs,
          lean: side ? 1 : 0,
          tail: Math.sin(ph + 1) * 1.1,
          tailUp: 0.15,
          ears: 0.12 + (crouch ? 0.15 : 0),
          sway: 2 * Math.cos(ph) + 1,
          mouth: i % 3 === 1 ? 'open' : 'smile',
          armR: side ? [swing, -Math.abs(Math.sin(ph))] : [0, -2.2 * Math.sin(ph) * sgn],
          armL: side ? [-swing, 0] : [0, 2.2 * Math.sin(ph) * sgn],
          ang: undefined
        })
      })
    }
    case 'attack': {
      const B: WolfPose[] = [
        { crouch: 2, lean: -2, dx: -1, eyes: 'angry', mouth: 'grit', ears: 0.5, tail: -1, tailUp: 0.4 },
        { crouch: 0, lean: 4, dx: 1, eyes: 'angry', mouth: 'open', ears: 0.35, tail: 1, tailUp: 0.2 },
        { crouch: 1, lean: 3, dx: 1, eyes: 'angry', mouth: 'open', ears: 0.3, tail: 0.5 },
        { crouch: 0, lean: 0, eyes: 'open', mouth: 'smile', ears: 0, tail: -0.3 }
      ]
      const L: Legs[] = side
        ? [
            [
              { ox: -3, lift: 0 },
              { ox: 3, lift: 0 }
            ],
            [
              { ox: 4, lift: 0 },
              { ox: -4, lift: 0 }
            ],
            [
              { ox: 3, lift: 0 },
              { ox: -3, lift: 0 }
            ],
            [L0, L0]
          ]
        : [
            [
              { ox: 1, lift: 0 },
              { ox: -1, lift: 0 }
            ],
            [
              { ox: 2, lift: 0 },
              { ox: -2, lift: 0 }
            ],
            [
              { ox: 1.5, lift: 0 },
              { ox: -1.5, lift: 0 }
            ],
            [L0, L0]
          ]
      return [0, 1, 2, 3].map((i) => {
        const t = hold(job, dir, i)
        const windUp = job === 'sword' && i === 0 && !side
        return W({
          ...B[i],
          legs: L[i],
          armR: windUp ? [fromSlime(t.armR)[0] + 3, fromSlime(t.armR)[1]] : fromSlime(t.armR),
          ang: windUp ? -1.45 : t.ang,
          wfx: t.wfx,
          armL: job === 'sword' && i === 1 ? [2, -2] : [0, 0],
          sway: [-1, 3, 4, 1][i],
          fx:
            job === 'sword' && i === 1
              ? (rr, a) => {
                  const o = side ? [a.gx + 2, a.hipY - 14] : [a.gx + 2, a.hipY - 12]
                  if (side) smear(rr, o[0], o[1], 22, -1.6, 1.0, 5)
                  else smear(rr, o[0], o[1], 22, sgn * -0.7, sgn * 2.5, 5)
                }
              : undefined
        })
      })
    }
    case 'charge': {
      return [0, 1].map((i) => {
        const t = hold(job, dir, 0)
        return W({
          crouch: 3,
          lean: side ? -1 : 0,
          dx: i === 0 ? -0.5 : 0.5,
          eyes: 'angry',
          mouth: 'grit',
          ears: 0.55,
          tail: i ? 1 : -1,
          tailUp: 0.5,
          armR: fromSlime([t.armR[0] - (i ? 1 : 0), t.armR[1]]),
          ang: (job === 'sword' && !side ? -1.45 : t.ang) + (i ? 0.08 : -0.08),
          wfx: job === 'archer' ? { draw: 0.7 } : { glow: job === 'mage' || job === 'cleric' ? 1 : 0 },
          sway: i ? 2 : -1,
          fx: (rr, a) => {
            sparkles(rr, a, ramp, 3, i * 2)
            glint(rr, a.gx + 15 - i * 28, 54, ramp)
          }
        })
      })
    }
    case 'skill': {
      return [0, 1, 2, 3].map((i) => {
        const body: WolfPose[] = [
          { crouch: 3, eyes: 'angry', mouth: 'grit', ears: 0.5, tailUp: 0.5, tail: -1 },
          { hop: 2, chest: 1.5, eyes: 'wide', mouth: 'open', ears: 0.3, tailUp: 0.9, tail: 1 },
          { hop: 1, chest: 1, eyes: 'wide', mouth: 'open', ears: 0.2, tailUp: 0.6, tail: 0.4 },
          { crouch: 1, eyes: 'open', mouth: 'smile', tailUp: 0.2 }
        ]
        const legsAir: Legs = [
          { ox: side ? 2 : 1, lift: 0 },
          { ox: side ? -2 : -1, lift: 0 }
        ]
        const pose: WolfPose = {
          ...body[i],
          lean: side ? [0, 2, 1, 0][i] : 0,
          legs: i === 1 || i === 2 ? legsAir : [L0, L0]
        }
        if (job === 'sword') {
          const angs = [side ? -2.6 : -1.6, -0.1, 1.5, -1.2]
          const arms: V[] = [
            [-2, -6],
            [11, -2],
            [3, 10],
            [4, 0]
          ]
          return W({
            ...pose,
            armR: fromSlime(arms[i]),
            ang: angs[i],
            sway: [-1, 4, 5, 2][i],
            fx:
              i === 1 || i === 2
                ? (rr, a) => {
                    const cy = a.hipY - 14
                    if (i === 1) smear(rr, a.gx, cy, 22, 0.5, 4.9, 6)
                    else smear(rr, a.gx, cy, 22, 2.7, 7.0, 6)
                  }
                : undefined
          })
        }
        if (job === 'mage' || job === 'cleric') {
          const arms: V[] =
            job === 'mage'
              ? [
                  [3, 2],
                  [3, -13],
                  [3, -14],
                  [3, -9]
                ]
              : [
                  [3, 1],
                  [3, -12],
                  [3, -13],
                  [3, -9]
                ]
          return W({
            ...pose,
            armR: fromSlime(arms[i]),
            armL: [0, i === 1 || i === 2 ? -9 : 0],
            ang: back ? -1.5 : -1.52,
            wfx: { glow: [0, 2, 2, 1][i] },
            sway: [0, 3, 3, 1][i],
            fx: (rr, a) => {
              if (i === 1 || i === 2) sparkles(rr, a, job === 'mage' ? ramp : R.holy, 3, i, i === 2 && job === 'cleric')
            }
          })
        }
        const aim = dir === 'down' ? 1.15 : dir === 'up' ? -1.15 : -0.55
        const arms: V[] = side
          ? [
              [7, -6],
              [10, -8],
              [9, -7],
              [4, 0]
            ]
          : dir === 'down'
            ? [
                [4, 5],
                [4, 6],
                [4, 7],
                [4, 2]
              ]
            : [
                [4, -5],
                [4, -6],
                [4, -7],
                [4, 2]
              ]
        return W({
          ...pose,
          armR: fromSlime(arms[i]),
          ang: i === 3 ? 0.1 : aim,
          wfx: { draw: [0.5, 1, 0, 0][i] },
          sway: [0, 3, 3, 1][i],
          fx: (rr, a) => {
            if (i === 2)
              sparkle(rr, a.gx + (side ? 18 : 8), 56 + (dir === 'up' ? -38 : dir === 'down' ? -20 : -34), ramp)
          }
        })
      })
    }
    case 'hurt': {
      return [0, 1].map((i) =>
        W({
          crouch: i === 0 ? 2 : 1,
          dx: i === 0 ? -1 : 0,
          lean: side ? (i === 0 ? -3 : -1) : 0,
          hdy: i === 0 ? 1 : 0,
          eyes: i === 0 ? 'shut' : 'squint',
          mouth: i === 0 ? 'frown' : 'o',
          ears: i === 0 ? 1 : 0.7,
          tail: i === 0 ? -1 : -0.5,
          tailUp: 0,
          chest: 0,
          armR: [0, 1],
          armL: [0, 1],
          ang: job === 'archer' ? 0.7 : 0.9,
          sway: i === 0 ? 5 : 3,
          hatTilt: i === 0 ? 2 : 1,
          tilt: i === 0 && !back ? 0.35 : 0,
          legs: [
            { ox: side ? -2 : 1, lift: 0 },
            { ox: side ? 2 : -1, lift: 0 }
          ],
          fx: (rr, a) => {
            if (i === 0) {
              for (const [dx, dy] of [
                [13, -10],
                [12, -11],
                [14, -11],
                [13, -12],
                [-15, -8]
              ])
                rr.set(a.gx + dx, 56 + dy - 16, C.white)
            }
          }
        })
      )
    }
    case 'push': {
      return [0, 1, 2, 3].map((i) => {
        const alt = i % 2
        const legs: Legs = side
          ? [
              { ox: i < 2 ? -3 : 2, lift: i === 1 || i === 3 ? 1 : 0 },
              { ox: i < 2 ? 3 : -2, lift: i === 0 || i === 2 ? 1 : 0 }
            ]
          : [
              { ox: 0, lift: i === 1 ? 2 : 0 },
              { ox: 0, lift: i === 3 ? 2 : 0 }
            ]
        return W({
          crouch: 2,
          lean: side ? 4 + alt : 0,
          hdy: 1,
          eyes: 'squint',
          mouth: 'grit',
          ears: 0.45,
          tail: [0.5, -0.3, 0.5, -0.3][i],
          tailUp: 0.4,
          chest: 0,
          legs,
          slung: true,
          armR: side ? [9 + alt, -3] : dir === 'down' ? [-2.5, 2] : [-3, -4],
          armL: side ? [9, -1] : dir === 'down' ? [2.5, 2] : [3, -4],
          fx: (rr, a) => {
            sweat(rr, side ? a.gx - 9 : a.gx + 15, 20 + (i % 2))
          }
        })
      })
    }
    case 'carry': {
      return [0, 1, 2, 3].map((i) => {
        const bob = [0, 1, 0, 1][i]
        const raise = [0, -1, 0, 1][i]
        return W({
          crouch: bob,
          hdy: bob ? 0.5 : 0,
          lean: side ? 1 : 0,
          eyes: 'open',
          mouth: i % 2 ? 'o' : 'smile',
          ears: 0.2,
          tail: [-0.5, 0, 0.5, 0][i],
          tailUp: 0.3,
          slung: true,
          armR: side ? [5, -19 + raise] : [3.5, -14 + raise],
          armL: side ? [9, -18 - raise] : [-3.5, -14 - raise],
          sway: [0, 1, 0, -1][i],
          legs: [
            { ox: 0, lift: i === 1 ? 1 : 0 },
            { ox: 0, lift: i === 3 ? 1 : 0 }
          ]
        })
      })
    }
    case 'grip': {
      return [0, 1].map((i) =>
        W({
          crouch: 3,
          dx: i ? 0.5 : -0.5,
          lean: side ? 2 : 0,
          hdy: 1,
          eyes: 'squint',
          mouth: 'grit',
          ears: 0.6,
          tail: i ? 0.8 : -0.8,
          tailUp: 0.3,
          slung: true,
          armR: side ? [10, 0] : dir === 'down' ? [-2, 3] : [-3, -5],
          armL: side ? [10, 2] : dir === 'down' ? [2, 3] : [3, -5],
          sway: i ? 2 : 0,
          legs: [
            { ox: side ? -3 : 1.5, lift: 0 },
            { ox: side ? 3 : -1.5, lift: 0 }
          ],
          fx: (rr, a) => {
            sweat(rr, a.gx + (side ? -10 : 16 - i * 3), 21 + i * 2)
          }
        })
      )
    }
    case 'action': {
      // The howl: inhale, head back with the muzzle open, hold, release.
      const spec = [
        { tilt: 0.15, mouth: 'closed', eyes: 'half', ears: 0.2, chest: 2, crouch: 1, tailUp: 0.2, arcs: 0 },
        { tilt: 0.85, mouth: 'howl', eyes: 'happy', ears: 0.85, chest: 2, crouch: 0, tailUp: 0.8, arcs: 2 },
        { tilt: 1.05, mouth: 'howl', eyes: 'happy', ears: 1, chest: 2, crouch: 0, tailUp: 1, arcs: 3 },
        { tilt: 0.55, mouth: 'open', eyes: 'happy', ears: 0.6, chest: 1, crouch: 0, tailUp: 0.5, arcs: 1 }
      ] as const
      return spec.map((s, i) =>
        W({
          tilt: s.tilt,
          mouth: s.mouth,
          eyes: s.eyes,
          ears: s.ears,
          chest: s.chest,
          crouch: s.crouch,
          tailUp: s.tailUp,
          tail: [-0.5, 0.8, -0.6, 0.3][i],
          hdy: side ? -1.5 - s.tilt * 2.2 : back ? s.tilt * 1.2 : -s.tilt * 2.2,
          hdx: side ? -s.tilt * 0.4 : 0,
          lean: side ? s.tilt * 0.5 : 0,
          sway: [0, 3, 4, 2][i],
          fx: (rr, a) => {
            if (!s.arcs) return
            if (side) {
              const dirA = -s.tilt
              soundArcs(rr, a.hx + 13 * Math.cos(dirA) - 1, a.hy + 13 * Math.sin(dirA) + 2, dirA - 0.1, s.arcs, 0.5, 5)
            } else {
              const up = back ? 1 : 1
              void up
              for (const sd of [-1, 1])
                soundArcs(rr, a.hx + sd * 11, a.hy - 5, sd > 0 ? -0.5 : Math.PI + 0.5, s.arcs, 0.42, 5)
            }
          }
        })
      )
    }
    case 'victory': {
      const hops = [0, 2, 4, 3, 1, 0]
      return [0, 1, 2, 3, 4, 5].map((i) => {
        const howl = i > 0 && i < 5
        return W({
          hop: hops[i],
          crouch: i === 0 || i === 5 ? 1 : 0,
          tilt: howl ? 0.7 + (i === 2 || i === 3 ? 0.25 : 0) : 0.1,
          mouth: howl ? 'howl' : 'smile',
          eyes: 'happy',
          ears: howl ? 0.7 : 0,
          chest: 2,
          hdy: howl ? -1.5 : 0,
          tailUp: howl ? 0.9 : 0.4,
          tail: [-0.5, 0.8, -0.6, 0.8, -0.6, 0][i],
          armR: [1.5, i % 2 ? -17 : -16],
          armL: [-1.5, i % 2 ? -14 : -15],
          ang: REST_ANG_UP[job] + (i % 2 ? 0.12 : -0.12),
          wfx: { glow: job === 'mage' || job === 'cleric' ? (howl ? 2 : 1) : 0, draw: 0 },
          sway: [0, 2, 4, 4, 2, 0][i],
          legs: [
            { ox: 0.5, lift: hops[i] > 1 ? 1 : 0 },
            { ox: -0.5, lift: 0 }
          ],
          fx: (rr, a) => {
            if (howl) {
              soundArcs(rr, a.hx + 12, a.hy - 6, -0.5, i === 2 || i === 3 ? 3 : 2, 0.4, 4)
              soundArcs(rr, a.hx - 12, a.hy - 6, Math.PI + 0.5, i === 2 || i === 3 ? 3 : 2, 0.4, 4)
              sparkles(rr, a, ramp, 3 + (i % 2), i * 2, i % 2 === 0)
            }
          }
        })
      })
    }
    case 'fall': {
      const dim = [1, 0.85, 0.62, 0.4]
      return [0, 1, 2, 3].map((i) =>
        W({
          crouch: [0, 3, 8, 13][i],
          clipY: [64, 52, 47, 44][i],
          eyes: 'wide',
          mouth: 'o',
          ears: [0.3, 0.2, 0, 0][i],
          tail: 0,
          tailUp: 1,
          armR: i < 3 ? [2, -15] : null,
          armL: i < 3 ? [-2, -14] : null,
          noGear: i >= 2,
          noHat: i >= 3,
          sway: 3,
          dim: i ? dim[i] : undefined
        })
      )
    }
  }
  throw new Error(`unknown animation ${name}`)
}

const REST_ANG_UP: Record<JobId, number> = { sword: -1.5, mage: -1.52, archer: -1.2, cleric: -1.52 }

/** Down (collapse) and revive (get up). */
function lyingFrames(job: JobId, kind: 'down' | 'revive'): Raster[] {
  const ramp = JOB_RAMP[job]
  const stand = (p: WolfPose) => renderWolf(job, 'side', { noGear: true, noHat: false, ...p })
  if (kind === 'down') {
    return [
      stand({
        crouch: 2,
        lean: -3,
        dx: -1,
        eyes: 'x',
        mouth: 'frown',
        ears: 1,
        tilt: 0.3,
        tail: -1,
        tailUp: 0,
        armR: [0, 3],
        armL: [0, 3],
        sway: 4,
        hatTilt: 2
      }),
      stand({
        crouch: 6,
        lean: 3,
        hdy: 2,
        eyes: 'x',
        mouth: 'frown',
        ears: 1,
        tail: -1,
        tailUp: 0,
        armR: [0, 3],
        armL: [0, 3],
        sway: 5,
        hatTilt: 5,
        legs: [
          { ox: 2, lift: 0 },
          { ox: -2, lift: 0 }
        ]
      }),
      lyingFrame(job, 0),
      lyingFrame(job, 1)
    ]
  }
  return [
    lyingFrame(job, 1, true),
    lyingFrame(job, 0, true),
    stand({
      crouch: 5,
      lean: 2,
      hdy: 2,
      eyes: 'wide',
      mouth: 'o',
      ears: 0.6,
      tailUp: 0.3,
      armR: [0, 3],
      armL: [0, 3],
      sway: 4,
      fx: (rr, a) => {
        sparkle(rr, a.gx + 14, 38, ramp)
        sparkle(rr, a.gx - 16, 30, ramp, 2)
      }
    }),
    stand({
      crouch: 0,
      eyes: 'open',
      mouth: 'smile',
      tailUp: 0.3,
      sway: 2,
      fx: (rr, a) => {
        glint(rr, a.gx - 19, 30, ramp)
        glint(rr, a.gx + 20, 34, ramp)
      }
    })
  ]
}

/** The frames of every animation, keyed by sheet name (`idle_down`, `down`, ...). */
export function wolfFrames(job: JobId, name: string): Raster[] {
  const m = /^(\w+?)_(down|up|side)$/.exec(name)
  if (m) return frames(job, m[2] as Dir, m[1])
  if (name === 'down') return lyingFrames(job, 'down')
  if (name === 'revive') return lyingFrames(job, 'revive')
  return frames(job, 'down', name)
}

void drawHeadgear
export type { RampName }
