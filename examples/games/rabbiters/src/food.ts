import * as THREE from 'three'

export const FOOD_KINDS = {
  carrot: { label: 'ニンジン', nutrition: 28 },
  clover: { label: 'クローバー', nutrition: 24 },
  dandelion: { label: 'タンポポ', nutrition: 24 },
  cabbage: { label: 'キャベツ', nutrition: 34 },
  apple: { label: 'リンゴ', nutrition: 32 },
  berry: { label: 'ベリー', nutrition: 26 }
} as const

export type FoodKind = keyof typeof FOOD_KINDS
export const isFoodKind = (value: unknown): value is FoodKind =>
  typeof value === 'string' && Object.hasOwn(FOOD_KINDS, value)

// Geometries/materials are shared by every food item (never disposed per scene; they are tiny).
const geometries = {
  cone: new THREE.ConeGeometry(0.2, 0.65, 7),
  ball: new THREE.SphereGeometry(1, 12, 8),
  disc: new THREE.CylinderGeometry(0.06, 0.06, 0.06, 8),
  stem: new THREE.CylinderGeometry(0.025, 0.025, 0.4, 5)
}
const materials = new Map<string, THREE.MeshStandardMaterial>()
const material = (color: string) => {
  let found = materials.get(color)
  if (!found) materials.set(color, (found = new THREE.MeshStandardMaterial({ color, roughness: 0.85 })))
  return found
}
const part = (
  parent: THREE.Object3D,
  geometry: THREE.BufferGeometry,
  color: string,
  position: [number, number, number],
  scale: [number, number, number] = [1, 1, 1]
) => {
  const mesh = new THREE.Mesh(geometry, material(color))
  mesh.position.set(...position)
  mesh.scale.set(...scale)
  mesh.castShadow = true
  parent.add(mesh)
  return mesh
}
const ball = (parent: THREE.Object3D, color: string, position: [number, number, number], size: number, flat = 1) =>
  part(parent, geometries.ball, color, position, [size, size * flat, size])

export function buildFood(kind: FoodKind): THREE.Group {
  const group = new THREE.Group()
  if (kind === 'carrot') {
    part(group, geometries.cone, '#ef9648', [0, 0.43, 0]).rotation.z = Math.PI + 0.25
    for (let i = 0; i < 3; i++) {
      const leaf = part(group, geometries.ball, '#4e8d53', [(i - 1) * 0.12, 0.87, 0], [0.07, 0.25, 0.08])
      leaf.rotation.z = (i - 1) * 0.5
    }
  } else if (kind === 'clover') {
    // three-leaf clover: three flat green lobes on a short stem
    part(group, geometries.stem, '#3f8a45', [0, 0.2, 0])
    for (let i = 0; i < 3; i++) {
      const a = (i * Math.PI * 2) / 3
      ball(group, '#5cbf5f', [Math.sin(a) * 0.16, 0.42, Math.cos(a) * 0.16], 0.15, 0.3)
    }
  } else if (kind === 'dandelion') {
    part(group, geometries.stem, '#4e8d53', [0, 0.2, 0])
    ball(group, '#ffd93b', [0, 0.46, 0], 0.17)
    for (let i = 0; i < 6; i++) {
      const a = (i * Math.PI) / 3
      ball(group, '#ffe97a', [Math.sin(a) * 0.17, 0.46, Math.cos(a) * 0.17], 0.07)
    }
  } else if (kind === 'cabbage') {
    ball(group, '#8fd16a', [0, 0.3, 0], 0.32)
    for (let i = 0; i < 4; i++) {
      const a = (i * Math.PI) / 2
      const leaf = ball(group, '#b9e58f', [Math.sin(a) * 0.2, 0.32, Math.cos(a) * 0.2], 0.2, 1.3)
      leaf.rotation.set(Math.cos(a) * 0.5, 0, -Math.sin(a) * 0.5)
    }
  } else if (kind === 'apple') {
    ball(group, '#d9302c', [0, 0.3, 0], 0.27, 0.92)
    part(group, geometries.stem, '#6b4423', [0, 0.58, 0], [1, 0.4, 1])
    ball(group, '#4e8d53', [0.1, 0.62, 0], 0.09, 0.4)
  } else {
    // berry cluster
    for (const [x, y, z] of [
      [-0.1, 0.18, 0],
      [0.1, 0.18, 0.02],
      [0, 0.18, -0.12],
      [0, 0.34, -0.02]
    ])
      ball(group, '#7b2d8e', [x, y, z], 0.11)
    ball(group, '#4e8d53', [0, 0.46, 0], 0.09, 0.4)
  }
  const halo = part(group, new THREE.RingGeometry(0.37, 0.42, 28), '#f3d599', [0, 0.045, 0])
  halo.rotation.x = -Math.PI / 2
  halo.castShadow = false
  return group
}
