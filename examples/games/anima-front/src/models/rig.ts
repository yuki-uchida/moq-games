/**
 * The shared humanoid skeleton of every playable animal. All bones have identity rotation in the bind pose, so a
 * bone's local rotation is directly the pose rotation and bind-pose directions are plain offsets between joints.
 * Left (L) is +X, right (R) is −X (models face +Z).
 */
import * as THREE from 'three'
import type { Vec3 } from './sdf/sculpt'

export const BONE_NAMES = [
  'hips',
  'spine',
  'chest',
  'neck',
  'head',
  'earL1',
  'earL2',
  'earR1',
  'earR2',
  'tail1',
  'tail2',
  'tail3',
  'upperArmL',
  'lowerArmL',
  'pawL',
  'upperArmR',
  'lowerArmR',
  'pawR',
  'thighL',
  'shinL',
  'footL',
  'thighR',
  'shinR',
  'footR'
] as const
export type BoneName = (typeof BONE_NAMES)[number]

export const BONE_PARENT: Record<BoneName, BoneName | null> = {
  hips: null,
  spine: 'hips',
  chest: 'spine',
  neck: 'chest',
  head: 'neck',
  earL1: 'head',
  earL2: 'earL1',
  earR1: 'head',
  earR2: 'earR1',
  tail1: 'hips',
  tail2: 'tail1',
  tail3: 'tail2',
  upperArmL: 'chest',
  lowerArmL: 'upperArmL',
  pawL: 'lowerArmL',
  upperArmR: 'chest',
  lowerArmR: 'upperArmR',
  pawR: 'lowerArmR',
  thighL: 'hips',
  shinL: 'thighL',
  footL: 'shinL',
  thighR: 'hips',
  shinR: 'thighR',
  footR: 'shinR'
}

/** Bind-pose joint positions in model space (feet at the origin, facing +Z). */
export type Layout = Record<BoneName, Vec3>

export interface Rig {
  root: THREE.Bone
  bones: THREE.Bone[]
  byName: Record<BoneName, THREE.Bone>
  skeleton: THREE.Skeleton
}

export function buildRig(layout: Layout): Rig {
  const byName = {} as Record<BoneName, THREE.Bone>
  const bones: THREE.Bone[] = []
  for (const name of BONE_NAMES) {
    const bone = new THREE.Bone()
    bone.name = name
    const parent = BONE_PARENT[name]
    const p = layout[name]
    if (parent) {
      const q = layout[parent]
      bone.position.set(p[0] - q[0], p[1] - q[1], p[2] - q[2])
      byName[parent].add(bone)
    } else bone.position.set(p[0], p[1], p[2])
    byName[name] = bone
    bones.push(bone)
  }
  const root = byName.hips
  root.updateMatrixWorld(true)
  const skeleton = new THREE.Skeleton(bones)
  return { root, bones, byName, skeleton }
}

/** Joint positions that species recipes and the animation share. */
export interface BodyPlan {
  /** Body height (m). */
  H: number
  layout: Layout
  /** Head ellipsoid centre and radii. */
  headC: Vec3
  headR: Vec3
  /** Bone lengths used by the animation (m). */
  upperArm: number
  lowerArm: number
  thigh: number
  shin: number
}

export interface PlanParams {
  H: number
  /** Head centre height and radii as fractions of H. */
  headY?: number
  headR?: Vec3
  shoulder?: Vec3
  elbow?: Vec3
  wrist?: Vec3
  hip?: Vec3
  knee?: Vec3
  ankle?: Vec3
  /** Ear joints (left side; mirrored). */
  ear1?: Vec3
  ear2?: Vec3
  tail?: [Vec3, Vec3, Vec3]
  chestY?: number
  hipsY?: number
}

const scale = (v: Vec3, H: number): Vec3 => [v[0] * H, v[1] * H, v[2] * H]
const mirror = (v: Vec3): Vec3 => [-v[0], v[1], v[2]]
const dist = (a: Vec3, b: Vec3) => Math.hypot(a[0] - b[0], a[1] - b[1], a[2] - b[2])

/** A chibi body plan (all inputs are fractions of H). */
export function bodyPlan(p: PlanParams): BodyPlan {
  const H = p.H
  const headY = p.headY ?? 0.79
  const headR = p.headR ?? [0.235, 0.205, 0.205]
  const shoulder = scale(p.shoulder ?? [0.15, 0.53, 0], H)
  const elbow = scale(p.elbow ?? [0.24, 0.445, 0.01], H)
  const wrist = scale(p.wrist ?? [0.275, 0.36, 0.025], H)
  const hip = scale(p.hip ?? [0.09, 0.235, 0], H)
  const knee = scale(p.knee ?? [0.095, 0.13, 0.008], H)
  const ankle = scale(p.ankle ?? [0.095, 0.055, 0], H)
  const ear1 = scale(p.ear1 ?? [0.12, 0.93, 0], H)
  const ear2 = scale(p.ear2 ?? [0.15, 1.02, 0], H)
  const tail = (
    p.tail ?? [
      [0, 0.25, -0.13],
      [0, 0.3, -0.2],
      [0, 0.37, -0.24]
    ]
  ).map((v) => scale(v, H)) as [Vec3, Vec3, Vec3]
  const layout: Layout = {
    hips: [0, (p.hipsY ?? 0.27) * H, 0],
    spine: [0, 0.36 * H, 0],
    chest: [0, (p.chestY ?? 0.47) * H, 0],
    neck: [0, 0.6 * H, 0],
    head: [0, 0.65 * H, 0],
    earL1: ear1,
    earL2: ear2,
    earR1: mirror(ear1),
    earR2: mirror(ear2),
    tail1: tail[0],
    tail2: tail[1],
    tail3: tail[2],
    upperArmL: shoulder,
    lowerArmL: elbow,
    pawL: wrist,
    upperArmR: mirror(shoulder),
    lowerArmR: mirror(elbow),
    pawR: mirror(wrist),
    thighL: hip,
    shinL: knee,
    footL: ankle,
    thighR: mirror(hip),
    shinR: mirror(knee),
    footR: mirror(ankle)
  }
  return {
    H,
    layout,
    headC: [0, headY * H, 0.0],
    headR: scale(headR, H),
    upperArm: dist(shoulder, elbow),
    lowerArm: dist(elbow, wrist),
    thigh: dist(hip, knee),
    shin: dist(knee, ankle)
  }
}
