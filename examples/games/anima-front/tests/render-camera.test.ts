import * as THREE from 'three'
import { describe, expect, it } from 'vitest'
import { SPECIES, SPECIES_IDS, eyeHeight, shoulderOffset } from '../src/data/species'
import {
  aimDirection,
  aimPivot,
  angleDelta,
  ARM_LENGTH,
  armScale,
  CameraRig,
  SpringArm,
  verticalFov
} from '../src/render/camera'
import { BoxGrid } from '../src/render/core/box-grid'
import { AutoQuality } from '../src/render/core/quality'
import { stepBodyYaw, derivePose, newPose, TURN_THRESHOLD } from '../src/render/actors/pose'
import type { MapDef } from '../src/sim/types'

const emptyMap = (boxes: MapDef['boxes'] = []): MapDef => ({
  id: 'range',
  name: 't',
  theme: 'day',
  bounds: { min: [-50, -50], max: [50, 50] },
  boxes,
  spawns: [],
  bases: [],
  foeSpawns: [],
  pads: [],
  anchors: {},
  paths: {},
  decor: []
})

/** The sim's formula (DESIGN §9): feet + eye height + right × shoulder offset × side. */
function simPivot(feet: [number, number, number], yaw: number, species: (typeof SPECIES_IDS)[number], side: 1 | -1) {
  const def = SPECIES[species]
  const right = [-Math.cos(yaw), 0, Math.sin(yaw)]
  const off = shoulderOffset(def) * side
  return new THREE.Vector3(feet[0] + right[0] * off, feet[1] + eyeHeight(def), feet[2] + right[2] * off)
}

describe('render camera', () => {
  it('pivot matches the sim formula and the camera sits on the aim ray', () => {
    const rig = new CameraRig(16 / 9)
    for (const species of SPECIES_IDS)
      for (const side of [1, -1] as const)
        for (const [yaw, pitch] of [
          [0, 0],
          [1.2, 0.4],
          [-2.5, -0.8],
          [3.1, 1.2]
        ]) {
          const feet: [number, number, number] = [3, 1, -7]
          const pivot = aimPivot(feet, yaw, species, side, new THREE.Vector3())
          expect(pivot.distanceTo(simPivot(feet, yaw, species, side))).toBeLessThan(1e-9)
          for (let i = 0; i < 120; i++) rig.shoulder({ feet, species, yaw, pitch, shoulder: side, zoom: 0 }, 1 / 60)
          rig.camera.updateMatrixWorld()
          const cam = rig.camera.position
          const dir = aimDirection(yaw, pitch, new THREE.Vector3())
          // Camera → pivot is parallel to the aim direction (collinear with the aim ray).
          const toPivot = pivot.clone().sub(cam)
          expect(toPivot.length()).toBeCloseTo(rig.arm.length, 5)
          expect(toPivot.normalize().dot(dir)).toBeGreaterThan(0.999999)
          // The camera looks along the aim direction: screen centre = aim ray.
          const fwd = rig.camera.getWorldDirection(new THREE.Vector3())
          expect(fwd.dot(dir)).toBeGreaterThan(0.999999)
          if (pitch <= 0.4) expect(rig.arm.length).toBeCloseTo(ARM_LENGTH * armScale(species), 1)
          else expect(rig.camera.position.y).toBeGreaterThan(0.15)
        }
  })

  it('spring arm shortens against walls and eases back out', () => {
    const arm = new SpringArm()
    arm.update(3.2, 1.2, 1 / 60)
    for (let i = 0; i < 30; i++) arm.update(3.2, 1.2, 1 / 60)
    expect(arm.length).toBeLessThan(1.0)
    const blocked = arm.length
    arm.update(3.2, 100, 1 / 60)
    expect(arm.length).toBeGreaterThan(blocked)
    expect(arm.length).toBeLessThan(3.2)
    for (let i = 0; i < 300; i++) arm.update(3.2, 100, 1 / 60)
    expect(arm.length).toBeCloseTo(3.2, 2)
  })

  it('shoulder camera collides with a wall behind the player', () => {
    const wall = {
      kind: 'wall' as const,
      min: [-5, 0, -2.2] as [number, number, number],
      max: [5, 4, -2] as [number, number, number]
    }
    const rig = new CameraRig()
    rig.setGrid(new BoxGrid(emptyMap([wall])))
    for (let i = 0; i < 60; i++)
      rig.shoulder({ feet: [0, 0, 0], species: 'shiba', yaw: 0, pitch: 0, shoulder: 1, zoom: 0 }, 1 / 60)
    // Facing +Z, the camera goes towards −Z and must stop in front of the wall at z = −2.
    expect(rig.camera.position.z).toBeGreaterThan(-2)
  })

  it('box grid raycasts match brute force', () => {
    const boxes: MapDef['boxes'] = []
    for (let i = 0; i < 40; i++) {
      const x = ((i * 37) % 80) - 40
      const z = ((i * 53) % 80) - 40
      boxes.push({ kind: 'building', min: [x, 0, z], max: [x + 3, 6, z + 4] })
    }
    const grid = new BoxGrid(emptyMap(boxes))
    let seed = 3
    const rnd = () => ((seed = (seed * 16807) % 2147483647) / 2147483647) * 2 - 1
    for (let k = 0; k < 200; k++) {
      const o = [rnd() * 45, 1 + Math.abs(rnd()) * 4, rnd() * 45]
      const d = new THREE.Vector3(rnd(), rnd() * 0.3, rnd()).normalize()
      const got = grid.raycast(o[0], o[1], o[2], d.x, d.y, d.z, 60)
      const ray = new THREE.Ray(new THREE.Vector3(...o), d)
      let best = 60
      for (const b of boxes) {
        const box = new THREE.Box3(new THREE.Vector3(...b.min), new THREE.Vector3(...b.max))
        if (box.containsPoint(ray.origin)) best = 0
        const hit = ray.intersectBox(box, new THREE.Vector3())
        if (hit) best = Math.min(best, hit.distanceTo(ray.origin))
      }
      expect(got).toBeCloseTo(best, 4)
    }
  })

  it('cinematic camera frames the squad, never ends inside a building and keeps its line of sight', () => {
    // A street canyon: two long buildings either side of the squad, foes up the street.
    const boxes: MapDef['boxes'] = [
      { kind: 'building', min: [-20, 0, 3], max: [20, 14, 12] },
      { kind: 'building', min: [-20, 0, -12], max: [20, 14, -3] }
    ]
    const grid = new BoxGrid(emptyMap(boxes))
    const rig = new CameraRig(16 / 9)
    rig.setGrid(grid)
    const subjects = [
      { p: [0, 0, 0] as [number, number, number], key: 'p0', weight: 1 },
      { p: [2, 0, 1] as [number, number, number], key: 'p1', weight: 1 },
      { p: [9, 0, 0] as [number, number, number], key: 'f1', weight: 0.6 }
    ]
    const cam = rig.camera
    const dir = new THREE.Vector3()
    const fwd = new THREE.Vector3()
    for (let i = 0; i < 60 * 40; i++) {
      rig.cinematic(subjects, 1 / 60)
      const p = cam.position
      for (const b of boxes)
        expect(
          p.x > b.min[0] && p.x < b.max[0] && p.y < b.max[1] && p.z > b.min[2] && p.z < b.max[2],
          `inside a box at frame ${i}`
        ).toBe(false)
      // The squad stays in front of the camera and nothing solid sits between them (after easing settles).
      if (i % 30 === 29) {
        cam.getWorldDirection(fwd)
        dir.set(1, 1, 0.5).sub(p)
        expect(dir.dot(fwd), `squad behind the camera at frame ${i}`).toBeGreaterThan(0)
        const len = dir.length()
        dir.divideScalar(len)
        expect(grid.raycast(p.x, p.y, p.z, dir.x, dir.y, dir.z, len)).toBeGreaterThan(len - 1.5)
      }
    }
  })

  it('FOV is Hor+ above 16:9 and keeps the horizontal FOV below', () => {
    const v169 = verticalFov(75, 16 / 9)
    expect(verticalFov(75, 21 / 9)).toBeCloseTo(v169, 6)
    expect(verticalFov(75, 4 / 3)).toBeGreaterThan(v169)
  })

  it('body yaw turns toward the aim when moving or past the threshold', () => {
    const body = { yaw: 0, turning: false }
    stepBodyYaw(body, 0.5, 0, 1 / 60)
    expect(body.yaw).toBe(0)
    for (let i = 0; i < 60; i++) stepBodyYaw(body, TURN_THRESHOLD + 0.2, 0, 1 / 60)
    expect(Math.abs(angleDelta(body.yaw, TURN_THRESHOLD + 0.2))).toBeLessThan(0.15)
    const moving = { yaw: 0, turning: false }
    for (let i = 0; i < 60; i++) stepBodyYaw(moving, 0.4, 5, 1 / 60)
    expect(Math.abs(moving.yaw - 0.4)).toBeLessThan(0.01)
  })

  it('pose: local velocity in the body frame and aim relative to the body', () => {
    const hand = { items: [], sel: -1, swap: 0, act: 'idle' as const, charge: 0, cooldown: 0, uses: 0, combo: 0 }
    const pose = derivePose(
      {
        v: [0, 0, 3],
        yaw: 0.5,
        pitch: 0.2,
        grounded: true,
        move: 'run',
        hands: [hand, hand],
        state: 'alive',
        revive: 0,
        reviving: false
      },
      0,
      2,
      undefined,
      newPose()
    )
    expect(pose.localVel[1]).toBeCloseTo(3)
    expect(pose.localVel[0]).toBeCloseTo(0)
    expect(pose.aimYaw).toBeCloseTo(0.5)
    expect(pose.hurt).toBe(2)
    // Moving along the body's right (−cos yaw, 0, sin yaw) at yaw 0 = −X.
    const right = derivePose(
      {
        v: [-2, 0, 0],
        yaw: 0,
        pitch: 0,
        grounded: true,
        move: 'run',
        hands: [hand, hand],
        state: 'alive',
        revive: 0,
        reviving: false
      },
      0,
      0,
      undefined,
      newPose()
    )
    expect(right.localVel[0]).toBeCloseTo(2)
  })

  it('自動 drops a level after 3 s of slow frames', () => {
    const auto = new AutoQuality('high')
    let changed = null
    for (let i = 0; i < 100 && !changed; i++) changed = auto.sample(30, 1 / 30)
    expect(changed).toBe('medium')
    // A short spike does not drop.
    const a2 = new AutoQuality('medium')
    for (let i = 0; i < 30; i++) expect(a2.sample(30, 1 / 30)).toBeNull()
    for (let i = 0; i < 10; i++) a2.sample(10, 1 / 100)
    expect(a2.level).toBe('medium')
  })
})
