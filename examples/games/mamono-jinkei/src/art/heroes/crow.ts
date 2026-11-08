/**
 * The crow heroes `hero:crow:<job>` and the crow co-op technique sprites `tech:crow`, built lazily.
 * Ids missing here fall back to placeholders.
 *
 * A little blue-black crow adventurer: the wings are the arms (the wing-tip "fist" grips the weapon), the job
 * outfits come from jobs.ts. Frame poses are tables below; the drawing lives in crow-body.ts / crow-down.ts.
 */
import { heroSpec } from '../contract'
import { R } from '../palette'
import { Raster } from '../raster'
import { anim, type Anim, type Sheet } from '../sheet'
import { JOBS } from '../../vocab'
import { JOB_RAMP, type Dir, type JobId } from './jobs'
import { hold, smear } from './slime'
import {
  REST_ANG,
  glint,
  renderCrow,
  sparkle,
  sweat,
  looseFeather,
  type A,
  type CPose,
  type V,
  type Wing
} from './crow-body'
import { renderLying } from './crow-down'
import { crowTechSheet } from './crow-tech'

const rd = Math.round
const arm = (x: number, y: number, tips = false): Wing => ({ arm: [x, y], tips })

/** Job-coloured sparkles around the crow. */
const SPARK: V[] = [
  [-19, -14],
  [18, -18],
  [-14, -30],
  [21, -4],
  [-22, 0],
  [11, -33]
]
function sparkles(r: Raster, a: A, ramp: (typeof R)['jobRed'], n: number, phase: number, big = false) {
  for (let i = 0; i < n; i++) {
    const [dx, dy] = SPARK[(i + phase) % SPARK.length]
    if ((i + phase) % 2 === 0) sparkle(r, a.cx + dx, a.feet + dy, ramp, big ? 2 : 1)
    else glint(r, a.cx + dx, a.feet + dy, i % 2 ? ramp : R.gold)
  }
}

/** Slime hold tables use big pseudopods; pull raised wing-tips down a little so staffs stay in the frame. */
const lowered = (v: V, by: number): V => [v[0], v[1] < -6 ? v[1] + by : v[1]]

function frames(job: JobId, dir: Dir, name: string): Raster[] {
  const ramp = JOB_RAMP[job]
  const side = dir === 'side'
  const up = dir === 'up'
  const R_ = (p: CPose) => renderCrow(job, dir, p)
  const FACE = { eyes: 'open' } as const
  // In profile a staff held close to the body keeps the face clear.
  const staff = job === 'mage' || job === 'cleric'
  /** Staffs stay close to the body in profile so they never cover the eye. */
  const sv = (v: V): V => (side && staff && v[0] < 5 ? [v[0] - 4, v[1]] : v)
  const restX = side ? (job === 'mage' || job === 'cleric' ? -1 : 6) : 4
  switch (name) {
    case 'idle': {
      return [0, 1, 2, 3].map((i) =>
        R_({
          hdy: [0, 0, 1, 1][i],
          squash: [0, 0, 1, 0.5][i],
          wR: arm(restX, 7 - (i === 2 ? 1 : 0)),
          wL: arm(side ? 3 : -4, 7 - (i === 2 ? 1 : 0)),
          sway: [0, 0, 1, 1][i],
          tail: [0, 0, 1, 1][i],
          face: i === 3 ? { eyes: 'half' } : FACE
        })
      )
    }
    case 'walk': {
      const dys = [0, 2, 4, 3, 0, 0]
      const sq = [2, 0, 0, 0, 2, 1]
      const hdy = [1, 0, -1, 0, 1, 1]
      return [0, 1, 2, 3, 4, 5].map((i) =>
        R_({
          dy: dys[i],
          squash: sq[i],
          hdy: hdy[i],
          lean: side ? [0, 1, 2, 2, 1, 0][i] : 0,
          legs: dys[i] >= 3 ? 'tuck' : 'stand',
          stride: [-0.3, 0, 0.3, 0.3, 0, -0.3][i],
          wR: arm(restX + (!side && i % 3 === 1 ? 1 : 0), 7 + [1, -1, -2, -1, 1, 2][i]),
          wL: arm(side ? 3 : -4, 7 + [1, -1, -2, -1, 1, 2][i]),
          sway: [2, 0, -1, 0, 1, 3][i],
          tail: [0, 1, 3, 2, 0, 0][i],
          face: { eyes: 'open', beak: i === 2 || i === 3 ? 1 : 0 }
        })
      )
    }
    case 'attack': {
      const bodies = [
        { squash: 2, lean: side ? -1 : 0, hdy: 1 },
        { squash: 0, lean: side ? 3 : 0, hdy: -1 },
        { squash: 1, lean: side ? 2 : 0, hdy: 0 },
        { squash: 0, lean: 0, hdy: 0 }
      ]
      return bodies.map((bd, i) => {
        const t = hold(job, dir, i)
        return R_({
          ...bd,
          wR: arm(...sv(lowered(t.armR, 3))),
          ang: t.ang,
          wfx: t.wfx,
          wL: job === 'sword' && i === 1 ? arm(-3, 3) : arm(side ? 3 : -4, 7),
          sway: [-1, 3, 4, 1][i],
          face: i === 0 ? { eyes: 'angry' } : i === 3 ? FACE : { eyes: 'wide', beak: 2 },
          mid:
            job === 'sword' && i === 1
              ? (rr, a) => {
                  const o: V = [a.cx + 2, rd(a.bcy - 6)]
                  const sgn = dir === 'up' ? -1 : 1
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
        return R_({
          squash: 3,
          dx: i === 0 ? -1 : 1,
          lean: side ? -1 : 0,
          wR: arm(...sv([t.armR[0] - (i ? 1 : 0), lowered(t.armR, 3)[1]])),
          ang: t.ang + (i ? 0.08 : -0.08),
          wfx: job === 'archer' ? { draw: 0.7 } : { glow: job === 'mage' || job === 'cleric' ? 1 : 0 },
          wL: arm(side ? 3 : -4, 7),
          sway: i ? 2 : -1,
          face: { eyes: 'angry', beak: 0 },
          fx: (rr, a) => {
            sparkles(rr, a, ramp, 3, i * 2)
            glint(rr, a.cx + 15 - i * 28, a.feet - 2, ramp)
          }
        })
      })
    }
    case 'skill': {
      return [0, 1, 2, 3].map((i) => {
        const bodyS = [{ squash: 3 }, { squash: -1 }, { squash: 0 }, { squash: 0 }][i]
        const lean = side ? [0, 2, 1, 0][i] : 0
        const face = i === 0 ? { eyes: 'angry' as const } : i === 3 ? FACE : { eyes: 'wide' as const, beak: 2 as const }
        if (job === 'sword') {
          const angs = [-2.6, -0.1, 1.5, -1.2]
          const arms: V[] = [
            [-2, -6],
            [11, -2],
            [3, 9],
            [4, 2]
          ]
          return R_({
            ...bodyS,
            lean,
            wR: arm(...arms[i]),
            ang: angs[i],
            face,
            sway: [-1, 4, 5, 2][i],
            mid:
              i === 1 || i === 2
                ? (rr, a) => {
                    const cy = rd(a.bcy - 4)
                    if (i === 1) smear(rr, a.cx, cy, 22, 0.5, 4.9, 6)
                    else smear(rr, a.cx, cy, 22, 2.7, 7.0, 6)
                  }
                : undefined
          })
        }
        if (job === 'mage' || job === 'cleric') {
          const arms: V[] =
            job === 'mage'
              ? [
                  [3, 5],
                  [3, -9],
                  [3, -10],
                  [3, -5]
                ]
              : [
                  [3, 3],
                  [3, -9],
                  [3, -10],
                  [3, -5]
                ]
          return R_({
            ...bodyS,
            lean,
            wR: arm(...sv(arms[i])),
            ang: -1.52,
            wfx: { glow: [0, 2, 2, 1][i] },
            wL: arm(side ? -2 : -4, i === 1 || i === 2 ? -6 : 7),
            face,
            sway: [0, 4, 3, 1][i],
            fx: (rr, a) => {
              if (i === 1 || i === 2) sparkles(rr, a, job === 'mage' ? ramp : R.holy, 3, i, job === 'cleric' && i === 2)
            }
          })
        }
        const aim = dir === 'down' ? 1.15 : dir === 'up' ? -1.15 : -0.55
        const arms: V[] = side
          ? [
              [7, -5],
              [10, -7],
              [9, -6],
              [4, 2]
            ]
          : dir === 'down'
            ? [
                [4, 6],
                [4, 7],
                [4, 8],
                [4, 3]
              ]
            : [
                [4, -5],
                [4, -6],
                [4, -7],
                [4, 3]
              ]
        return R_({
          ...bodyS,
          lean,
          wR: arm(...arms[i]),
          ang: i === 3 ? 0.1 : aim,
          wfx: { draw: [0.5, 1, 0, 0][i] },
          face,
          sway: [0, 3, 3, 1][i],
          fx: (rr, a, hand) => {
            if (i === 2) {
              glint(rr, hand[0] + (side ? 9 : 3), hand[1] + (up ? -9 : dir === 'down' ? 9 : -5), ramp)
              sparkle(rr, hand[0] + (side ? 12 : 4), hand[1] + (up ? -12 : dir === 'down' ? 12 : -7), ramp)
            }
            void a
          }
        })
      })
    }
    case 'hurt': {
      return [0, 1].map((i) =>
        R_({
          squash: i === 0 ? 4 : 2,
          lean: side ? (i === 0 ? -3 : -1) : 0,
          hdy: i === 0 ? 2 : 1,
          dx: i === 0 && side ? -1 : 0,
          wR: arm(side ? 5 : 8, i === 0 ? -3 : 0),
          wL: arm(side ? 2 : -8, i === 0 ? -3 : 0),
          ang: job === 'archer' ? 0.7 : 0.9,
          sway: i === 0 ? 5 : 3,
          tilt: i === 0 ? 2 : 1,
          face: i === 0 ? { eyes: 'squint', beak: 2 } : { eyes: 'shut', beak: 1 },
          fx: (rr, a) => {
            if (i === 0) {
              looseFeather(rr, a.cx + 15, a.bcy - 8, -0.5, 6, 2.6)
              looseFeather(rr, a.cx - 18, a.bcy - 2, 2.9, 6, 2.6)
            } else looseFeather(rr, a.cx - 17, a.bcy + 3, 0.4, 5, 2.4)
          }
        })
      )
    }
    case 'push': {
      return [0, 1, 2, 3].map((i) =>
        R_({
          squash: 2 + (i % 2),
          lean: side ? 3 + (i % 2) : 0,
          dx: side ? 0 : i % 2 ? 1 : -1,
          wR: side ? arm(10 + (i % 2), -1 + (i === 1 ? 1 : 0)) : dir === 'down' ? arm(2, 9) : arm(3, -8),
          wL: side ? arm(8, 2) : dir === 'down' ? arm(-2, 9) : arm(-3, -8),
          wingsBack: up,
          slung: true,
          face: { eyes: 'squint', beak: 1 },
          sway: [1, 2, 1, 0][i],
          legs: 'stand',
          stride: side ? [-0.5, 0, 0.5, 0][i] : 0,
          fx: (rr, a) => sweat(rr, side ? a.cx - 9 : a.cx + 15, a.headTop - 2 + (i % 2))
        })
      )
    }
    case 'carry': {
      return [0, 1, 2, 3].map((i) => {
        const raise = [0, -1, 0, 1][i]
        return R_({
          squash: i % 2,
          dy: [0, 1, 0, 1][i],
          wR: side ? arm(-6, -19 + raise) : arm(5, -15 + raise),
          wL: side ? arm(-3, -19 - raise) : arm(-5, -15 - raise),
          wingsBack: true,
          lean: side ? 1 : 0,
          slung: true,
          legs: [0, 1, 0, 1][i] ? 'tuck' : 'stand',
          sway: [0, 1, 0, -1][i],
          face: { eyes: 'open', beak: i % 2 ? 1 : 0 }
        })
      })
    }
    case 'grip': {
      return [0, 1].map((i) =>
        R_({
          squash: 3,
          dx: i ? 1 : -1,
          lean: side ? 2 : 0,
          wR: side ? arm(9, 4) : dir === 'down' ? arm(4, 9) : arm(4, -7),
          wL: side ? arm(8, 2) : dir === 'down' ? arm(-4, 9) : arm(-4, -7),
          wingsBack: up,
          slung: true,
          sway: i ? 2 : 0,
          face: { eyes: 'squint', beak: 1 },
          fx: (rr, a) => {
            sweat(rr, a.cx + (side ? -10 : 16 - i * 3), a.headTop + i)
            if (!side) sweat(rr, a.cx - 17 + i * 2, a.headTop + 4 - i)
          }
        })
      )
    }
    case 'action': {
      // Flapping flight: wings fully spread, body pitched forward, feet tucked.
      const fans = side ? [-1.15, -0.25, 0.95, 0.25] : [-0.95, -0.2, 0.5, 0.1]
      return fans.map((f, i) => {
        const w: Wing = { fan: f, len: side ? 21 : 22, n: 6, spread: 0.15 }
        const wFar: Wing = { fan: side ? f + 0.35 : f, len: side ? 17 : 22, n: 6, spread: 0.15 }
        return R_({
          dy: 3,
          squash: side ? 3 : 1,
          shear: side ? 0.3 : 0,
          hdy: side ? 1 : [0, 1, 2, 1][i],
          lean: side ? 2 : 0,
          wR: w,
          wL: wFar,
          wingsBack: side || up,
          legs: 'tuck',
          slung: true,
          tail: [2, 1, -1, 0][i],
          sway: [3, 4, 2, 1][i],
          face: { eyes: 'wide', beak: i % 2 ? 1 : 0 }
        })
      })
    }
    case 'down':
      return downFrames(job, 'down')
    case 'revive':
      return downFrames(job, 'revive')
    case 'victory': {
      const dirs: Dir[] = ['down', 'down', 'side', 'up', 'side', 'down']
      const dys = [0, 4, 8, 8, 4, 0]
      return [0, 1, 2, 3, 4, 5].map((i) => {
        const d = dirs[i]
        const spread = [-0.2, -0.9, -1.0, -1.0, -0.9, -0.3][i]
        const w: Wing =
          i === 0 || i === 5
            ? arm(5, -12 + (i === 5 ? 1 : 0))
            : { fan: d === 'side' ? spread - 0.2 : spread, len: d === 'side' ? 20 : 22, n: 6, spread: 0.15 }
        const wl: Wing =
          i === 0 || i === 5
            ? arm(-5, -12 + (i === 5 ? 1 : 0))
            : { fan: d === 'side' ? spread + 0.3 : spread, len: d === 'side' ? 17 : 22, n: 6, spread: 0.15 }
        const img = renderCrow(job, d, {
          dy: dys[i],
          squash: i === 0 ? 3 : i === 5 ? 2 : -1,
          wR: w,
          wL: wl,
          wingsBack: i === 0 || i === 5 || d !== 'down',
          slung: true,
          legs: i === 0 || i === 5 ? 'stand' : 'tuck',
          sway: [0, 2, 4, 4, 2, 0][i],
          face: { eyes: 'happy', beak: i > 0 && i < 5 ? 1 : 0 },
          fx: (rr, a) => {
            if (i > 0 && i < 5) sparkles(rr, a, ramp, 3 + (i % 2), i * 2, i % 2 === 0)
          }
        })
        return i === 4 ? img.flipX() : img
      })
    }
    case 'fall': {
      const s = [1, 0.78, 0.55, 0.34]
      const dim = [1, 0.85, 0.62, 0.4]
      return [0, 1, 2, 3].map((i) =>
        renderCrow(job, 'down', {
          s: s[i],
          dy: i === 0 ? 1 : 0,
          wR: i < 3 ? arm(7, -9 + i * 2) : null,
          wL: i < 3 ? arm(-7, -9 + i * 2) : null,
          wingsBack: true,
          noGear: i >= 2,
          noHat: i >= 2,
          slung: true,
          legs: i < 3 ? 'tuck' : 'none',
          face: { eyes: 'wide', beak: 2, blush: i < 2 },
          dim: i ? dim[i] : undefined,
          sway: 3
        })
      )
    }
  }
  throw new Error(`unknown animation ${name}`)
}

/** Down (knocked flat) and revive (comes to and hops up). */
function downFrames(job: JobId, kind: 'down' | 'revive'): Raster[] {
  const ramp = JOB_RAMP[job]
  if (kind === 'down') {
    return [
      renderCrow(job, 'down', {
        squash: 4,
        hdy: 2,
        dx: 0,
        lean: -2,
        wR: arm(8, -5),
        wL: arm(-8, -5),
        wingsBack: true,
        slung: true,
        noHat: false,
        face: { eyes: 'x', beak: 2 },
        sway: 5,
        tilt: 3,
        fx: (rr, a) => {
          looseFeather(rr, a.cx + 18, a.bcy - 10, -0.6, 6, 2.6)
          looseFeather(rr, a.cx - 19, a.bcy - 4, 2.6, 6, 2.6)
        }
      }),
      renderLying(job, {
        wingUp: -1.6,
        wingDown: 0.2,
        legs: 7,
        legTilt: 3,
        eyes: 'x',
        beak: 1,
        hat: true,
        gear: false,
        feathers: [
          [46, 33],
          [8, 54]
        ],
        dx: 0
      }),
      renderLying(job, {
        wingUp: -1.15,
        wingDown: 0.5,
        legs: 6,
        legTilt: 1,
        eyes: 'x',
        hat: true,
        gear: true,
        feathers: [
          [50, 36],
          [12, 56],
          [57, 54]
        ]
      }),
      renderLying(job, {
        wingUp: -0.95,
        wingDown: 0.7,
        legs: 5,
        legTilt: 0,
        eyes: 'x',
        hat: true,
        gear: true,
        feathers: [
          [52, 40],
          [13, 57],
          [58, 56]
        ]
      })
    ]
  }
  return [
    renderLying(job, {
      wingUp: -0.95,
      wingDown: 0.7,
      legs: 5,
      eyes: 'x',
      hat: true,
      gear: true,
      feathers: [[13, 57]]
    }),
    renderLying(job, {
      wingUp: -1.3,
      wingDown: 0.35,
      legs: 7,
      legTilt: 2,
      eyes: 'half',
      beak: 1,
      lift: 2,
      hat: true,
      gear: true,
      feathers: [],
      dx: 1,
      stars: true
    }),
    renderCrow(job, 'down', {
      squash: -1,
      wR: arm(6, -10),
      wL: arm(-6, -10),
      wingsBack: true,
      slung: true,
      hdy: -1,
      sway: 4,
      legs: 'stand',
      face: { eyes: 'wide', beak: 1 },
      fx: (rr, a) => {
        sparkle(rr, a.cx - 19, a.feet - 28, ramp, 2)
        sparkle(rr, a.cx + 18, a.feet - 33, ramp)
        glint(rr, a.cx + 21, a.feet - 17, ramp)
      }
    }),
    renderCrow(job, 'down', {
      face: { eyes: 'open' },
      sway: 2,
      fx: (rr, a) => {
        glint(rr, a.cx - 20, a.feet - 30, ramp)
        glint(rr, a.cx + 21, a.feet - 26, ramp)
      }
    })
  ]
}

/* ------------------------------------------------------------------ sheet */

const cache = new Map<string, Sheet>()

/** Builds `hero:crow:<job>`. */
export function crowSheet(job: JobId): Sheet {
  const spec = heroSpec('crow')
  const sheet: Sheet = {}
  for (const [name, want] of Object.entries(spec)) {
    const m = /^(\w+?)_(down|up|side)$/.exec(name)
    const fr = m ? frames(job, m[2] as Dir, m[1]) : frames(job, 'down', name)
    const extra: Partial<Anim> = {}
    if (want.lift) extra.lift = [8, 14, 12, 6]
    sheet[name] = anim(fr, want.fps, want.loop, extra)
  }
  return sheet
}

export const crowSheets: Record<string, () => Sheet> = {
  ...Object.fromEntries(JOBS.map((job) => [`hero:crow:${job}`, () => crowSheet(job)])),
  'tech:crow': crowTechSheet
}

void REST_ANG
void cache
