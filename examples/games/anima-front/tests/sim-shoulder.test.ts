/**
 * The free shoulder (DESIGN §9): the aim pivot is pulled in toward the body axis so it never sits inside a map box or
 * a solid prop, for both shoulders, eased back out without jitter; the shoulder camera resolves the same pivot.
 */
import * as THREE from 'three'
import { describe, expect, it } from 'vitest'
import { shoulderOffset } from '../src/data/species'
import { aimPivot, CameraRig, freeShoulderFraction } from '../src/render/camera'
import { BoxGrid } from '../src/render/core/box-grid'
import { pivotOf } from '../src/sim/player'
import { getMap, MAP_IDS } from '../src/sim/api'
import { Physics } from '../src/sim/physics'
import { Rng } from '../src/sim/rng'
import { addProp } from '../src/sim/props'
import { SHOULDER_PAD, SHOULDER_REGROW } from '../src/sim/shoulder'
import type { MapBox } from '../src/sim/types'
import { rig } from './sim-helpers'
import { flatMap } from './sim-maps'

/** Distance from a point to a box (negative inside). */
const boxGap = (b: MapBox, q: readonly number[]) => {
  const inside = q.every((v, i) => v > b.min[i] && v < b.max[i])
  if (inside) return -Math.min(...q.map((v, i) => Math.min(v - b.min[i], b.max[i] - v)))
  return Math.hypot(...q.map((v, i) => Math.max(b.min[i] - v, 0, v - b.max[i])))
}

// A container whose west face is 0.5 m east of the player's axis; right = (−cos yaw, 0, sin yaw), so at yaw = π the
// right shoulder points +x, into it.
const CONTAINER: MapBox = { min: [0.5, 0, -3], max: [3, 2.6, 3], kind: 'container' }

function beside(shoulder: 1 | -1) {
  const map = flatMap()
  map.boxes.push(CONTAINER)
  const r = rig({ r: ['bee'], map })
  r.step(2)
  const p = r.player()
  p.p = [0, 0, 0]
  const inp = r.input()
  inp.yaw = Math.PI
  inp.shoulder = shoulder
  r.step(3)
  return { r, p, map }
}

describe('the shoulder pivot is never inside cover', () => {
  it('beside a container on the shoulder side, the pivot is pulled in clear of it (PAD) and the camera agrees', () => {
    const { r, p, map } = beside(1)
    const piv = pivotOf(p)
    expect(boxGap(CONTAINER, piv)).toBeGreaterThanOrEqual(SHOULDER_PAD - 1e-6)
    expect(p.shoulderK).toBeLessThan(1)
    // the full offset would be inside the container
    const full = shoulderOffset(p.species)
    expect(boxGap(CONTAINER, [p.p[0] + full, piv[1], p.p[2]])).toBeLessThan(0)
    // the camera's own resolution on the render grid gives the same fraction
    const grid = new BoxGrid(map)
    const k = freeShoulderFraction([p.p[0], p.p[1], p.p[2]], p.yaw, p.species.id, 1, grid, [])
    expect(k).toBeCloseTo(p.shoulderK, 6)
    const rigCam = new CameraRig()
    rigCam.setGrid(grid)
    rigCam.shoulder(
      { feet: [p.p[0], p.p[1], p.p[2]], species: p.species.id, yaw: p.yaw, pitch: 0, shoulder: 1, zoom: 0 },
      1 / 60
    )
    const pv = rigCam.aimPoint
    expect(pv.distanceTo(new THREE.Vector3(...piv))).toBeLessThan(1e-6)
    expect(boxGap(CONTAINER, [pv.x, pv.y, pv.z])).toBeGreaterThanOrEqual(SHOULDER_PAD - 1e-6)
    const cam = rigCam.camera.position
    expect(boxGap(CONTAINER, [cam.x, cam.y, cam.z])).toBeGreaterThan(0)
  })

  it('on the other shoulder (away from it) the full offset stays', () => {
    const { p } = beside(-1)
    expect(p.shoulderK).toBe(1)
  })

  it('both shoulders against a solid 灯台 and an enemy ヤドカリ wall stay outside them', () => {
    for (const shoulder of [1, -1] as const) {
      const r = rig({ r: ['bee'] })
      r.step(2)
      const p = r.player()
      // the lighthouse foot (r 2.1) just off the body on the shoulder's side; its shaft (r 1.5) above the foot
      addProp(r.sim, 'lighthouse', [2.1 + p.r + 0.05, 0, 0], 0, 0, { hp: 1000, r: 1.6, data: { h: 7 } })
      p.p = [0, 0, 0]
      r.input().yaw = shoulder === 1 ? Math.PI : 0
      r.input().shoulder = shoulder
      r.step(3)
      const piv = pivotOf(p)
      expect(Math.hypot(piv[0] - (2.1 + p.r + 0.05), piv[2]) - 1.5, `shoulder ${shoulder}`).toBeGreaterThanOrEqual(
        SHOULDER_PAD - 1e-6
      )
    }
  })

  it('stepping away from the container, the shoulder eases back out (no jump) and reaches the full offset', () => {
    const { r, p } = beside(1)
    const k0 = p.shoulderK
    p.p = [-3, 0, 0]
    r.step(1)
    expect(p.shoulderK - k0).toBeLessThanOrEqual(SHOULDER_REGROW / 60 + 1e-9)
    r.step(60)
    expect(p.shoulderK).toBe(1)
  })

  it('the review harbor pose (pressed against a container, right shoulder): pivot and camera outside it, the arm open', () => {
    // .build/review/harbor-camera.mjs frame 03: feet (−66.87, 0, 0.07), yaw 0.541; the container's south face is z 0.45
    const map = getMap('harbor')
    const grid = new BoxGrid(map)
    const feet: [number, number, number] = [-66.867416, 0, 0.07]
    const yaw = 0.541
    const full = aimPivot(feet, yaw, 'shiba', 1, new THREE.Vector3())
    const boxes = map.boxes.filter((b) => b.solid !== false && b.kind !== 'barrier')
    const inAny = (q: readonly number[]) => boxes.some((b) => boxGap(b, q) < 0)
    expect(inAny([full.x, full.y, full.z])).toBe(true) // the old, unresolved pivot
    const cam = new CameraRig()
    cam.setGrid(grid)
    for (let i = 0; i < 30; i++)
      cam.shoulder({ feet, species: 'shiba', yaw, pitch: 0.137, shoulder: 1, zoom: 0 }, 1 / 60)
    const pv = cam.aimPoint
    expect(inAny([pv.x, pv.y, pv.z])).toBe(false)
    expect(Math.min(...boxes.map((b) => boxGap(b, [pv.x, pv.y, pv.z])))).toBeGreaterThanOrEqual(SHOULDER_PAD - 1e-6)
    const c = cam.camera.position
    expect(inAny([c.x, c.y, c.z])).toBe(false)
    expect(c.distanceTo(pv)).toBeGreaterThan(1.5)
  })

  it('aimPivot with a fraction scales only the side offset', () => {
    const a = aimPivot([0, 0, 0], 0, 'shiba', 1, new THREE.Vector3())
    const b = aimPivot([0, 0, 0], 0, 'shiba', 1, new THREE.Vector3(), 0.5)
    expect(b.x).toBeCloseTo(a.x / 2, 9)
    expect(b.y).toBeCloseTo(a.y, 9)
  })
})

describe('tight spots on every map (alleys, container rows, arena walls)', () => {
  for (const id of MAP_IDS) {
    it(`${id}: for bodies pressed against cover at random yaws, both shoulders resolve outside every box`, () => {
      const map = getMap(id)
      const ph = new Physics(map)
      const grid = new BoxGrid(map)
      const boxes = map.boxes.filter((b) => b.solid !== false && b.kind !== 'barrier')
      const rng = new Rng(14)
      let tested = 0
      let pulled = 0
      for (let n = 0; n < 6000 && tested < 400; n++) {
        const b = boxes[rng.int(boxes.length)]
        // a point just outside one of the box's side faces, at the ground under it
        const side = rng.int(4)
        const r = 0.38
        const x = side === 0 ? b.min[0] - r - 0.02 : side === 1 ? b.max[0] + r + 0.02 : rng.range(b.min[0], b.max[0])
        const z = side === 2 ? b.min[2] - r - 0.02 : side === 3 ? b.max[2] + r + 0.02 : rng.range(b.min[2], b.max[2])
        if (!ph.inBounds(x, z, 1)) continue
        const y = ph.groundHeight(x, z, r * 0.7, 50)
        if (y > b.max[1] - 1 || ph.overlaps([x, y, z], r, 1.25)) continue
        tested++
        const yaw = rng.range(-Math.PI, Math.PI)
        for (const shoulder of [1, -1] as const) {
          const k = freeShoulderFraction([x, y, z], yaw, 'shiba', shoulder, grid, [])
          if (k < 1) pulled++
          const pv = aimPivot([x, y, z], yaw, 'shiba', shoulder, new THREE.Vector3(), k)
          const gap = Math.min(...boxes.map((bb) => boxGap(bb, [pv.x, pv.y, pv.z])))
          expect(
            gap,
            `${id} at ${x.toFixed(2)},${z.toFixed(2)} yaw ${yaw.toFixed(2)} shoulder ${shoulder}`
          ).toBeGreaterThan(0)
        }
      }
      expect(tested).toBeGreaterThan(100)
      expect(pulled).toBeGreaterThan(0)
    })
  }
})
