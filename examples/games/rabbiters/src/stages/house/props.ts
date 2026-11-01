// Rabbit-scale house props, adapted from the lead's prototypes (/tmp/rabbiters-models/props.ts). Builders add
// shared unit shapes to a group; `bake` then merges every static mesh into one geometry per material, so the
// whole house costs a few dozen draw calls.
import * as THREE from 'three'
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js'

type V3 = [number, number, number]

export class Kit {
  readonly materials = new Map<string, THREE.MeshStandardMaterial>()
  readonly geometry = {
    box: new THREE.BoxGeometry(1, 1, 1),
    cylinder: new THREE.CylinderGeometry(1, 1, 1, 10),
    sphere: new THREE.SphereGeometry(1, 10, 8),
    cone: new THREE.ConeGeometry(1, 1, 8),
    frustum: new THREE.CylinderGeometry(0.55, 1, 1, 12),
    torus: new THREE.TorusGeometry(1, 0.3, 6, 16)
  }

  material(color: string, options: { roughness?: number; metal?: number; opacity?: number; tag?: string } = {}) {
    const { roughness = 0.85, metal = 0, opacity = 1, tag = '' } = options
    const key = `${color}:${roughness}:${metal}:${opacity}:${tag}`
    let material = this.materials.get(key)
    if (!material) {
      material = new THREE.MeshStandardMaterial({
        color,
        roughness,
        metalness: metal,
        flatShading: true,
        transparent: opacity < 1,
        opacity
      })
      material.name = tag
      this.materials.set(key, material)
    }
    return material
  }

  add(
    parent: THREE.Object3D,
    shape: keyof Kit['geometry'],
    color: string | THREE.Material,
    [x, y, z]: V3,
    [sx, sy, sz]: V3,
    [rx, ry, rz]: V3 = [0, 0, 0]
  ) {
    const mesh = new THREE.Mesh(this.geometry[shape], typeof color === 'string' ? this.material(color) : color)
    mesh.position.set(x, y, z)
    mesh.scale.set(sx, sy, sz)
    mesh.rotation.set(rx, ry, rz)
    parent.add(mesh)
    return mesh
  }

  /** A box by its floor rect and height range (walls, floors, furniture blocks). */
  block(
    parent: THREE.Object3D,
    color: string | THREE.Material,
    minX: number,
    maxX: number,
    minZ: number,
    maxZ: number,
    y0: number,
    y1: number
  ) {
    return this.add(
      parent,
      'box',
      color,
      [(minX + maxX) / 2, (y0 + y1) / 2, (minZ + maxZ) / 2],
      [maxX - minX, y1 - y0, maxZ - minZ]
    )
  }

  /** Merges every mesh under `root` into one mesh per material (world transforms baked in). */
  bake(root: THREE.Object3D, shadows = true): THREE.Group {
    root.updateMatrixWorld(true)
    const byMaterial = new Map<THREE.Material, THREE.BufferGeometry[]>()
    root.traverse((object) => {
      if (!(object instanceof THREE.Mesh)) return
      const geometry = (object.geometry as THREE.BufferGeometry).index
        ? (object.geometry as THREE.BufferGeometry).toNonIndexed()
        : (object.geometry as THREE.BufferGeometry).clone()
      geometry.applyMatrix4(object.matrixWorld)
      const list = byMaterial.get(object.material as THREE.Material)
      if (list) list.push(geometry)
      else byMaterial.set(object.material as THREE.Material, [geometry])
    })
    const baked = new THREE.Group()
    for (const [material, parts] of byMaterial) {
      const merged = mergeGeometries(parts)
      parts.forEach((part) => part.dispose())
      const mesh = new THREE.Mesh(merged, material)
      mesh.castShadow = shadows && !(material as THREE.MeshStandardMaterial).transparent
      mesh.receiveShadow = true
      baked.add(mesh)
    }
    return baked
  }

  dispose() {
    Object.values(this.geometry).forEach((geometry) => geometry.dispose())
    this.materials.forEach((material) => material.dispose())
  }
}

const group = (x = 0, z = 0, turn = 0) => {
  const root = new THREE.Group()
  root.position.set(x, 0, z)
  root.rotation.y = turn
  return root
}

/** Wire walls and tray of the 6×4 cage (the door is separate so it can swing). */
export function petCage(kit: Kit, x: number, z: number) {
  const root = group(x, z)
  const wire = kit.material('#d9dde2', { metal: 0.6, roughness: 0.35 })
  kit.add(root, 'box', '#e6c9a0', [0, 0.15, 0], [6.6, 0.3, 4.6])
  kit.add(root, 'box', '#f3e6c8', [0, 0.31, 0], [6, 0.04, 4])
  for (let px = -3.25; px <= 3.251; px += 0.5)
    for (const pz of [-2.25, 2.25])
      if (pz > 0 || Math.abs(px) > 1.3) kit.add(root, 'box', wire, [px, 1.6, pz], [0.06, 3.2, 0.06])
  for (let pz = -2.25; pz <= 2.251; pz += 0.5)
    for (const px of [-3.25, 3.25]) kit.add(root, 'box', wire, [px, 1.6, pz], [0.06, 3.2, 0.06])
  for (const y of [0.4, 1.8, 3.2]) {
    for (const pz of [-2.25, 2.25]) kit.add(root, 'box', wire, [0, y, pz], [6.5, 0.07, 0.07])
    for (const px of [-3.25, 3.25]) kit.add(root, 'box', wire, [px, y, 0], [0.07, 0.07, 4.5])
  }
  for (let px = -3.25; px <= 3.251; px += 0.75) kit.add(root, 'box', wire, [px, 3.2, 0], [0.05, 0.05, 4.5])
  kit.add(root, 'box', '#8fb6d9', [-2, 0.5, 1.4], [1.2, 0.35, 0.7]) // pellet bowl
  kit.add(root, 'cylinder', '#c4e3f2', [2.8, 1.8, 1.9], [0.25, 1.2, 0.25]) // water bottle
  kit.add(root, 'box', '#c7955c', [2, 0.9, 1.1], [1.6, 1.1, 1.4]) // wooden hut
  return root
}

export function cageDoor(kit: Kit) {
  const door = new THREE.Group()
  const wire = kit.material('#d9dde2', { metal: 0.6, roughness: 0.35 })
  for (let px = 0; px <= 2.51; px += 0.5) kit.add(door, 'box', wire, [px, 1.6, 0], [0.06, 3.1, 0.06])
  for (const y of [0.4, 1.8, 3.1]) kit.add(door, 'box', wire, [1.25, y, 0], [2.5, 0.07, 0.07])
  kit.add(door, 'box', kit.material('#c9a227', { metal: 0.7, roughness: 0.3 }), [2.4, 1.8, -0.1], [0.3, 0.45, 0.14])
  return door
}

export function birdcage(kit: Kit, x: number, z: number) {
  const root = group(x, z)
  const wire = kit.material('#e8d8a8', { metal: 0.7, roughness: 0.3 })
  kit.add(root, 'box', '#9a7650', [0, 1.5, 0], [1, 3, 1])
  kit.add(root, 'cylinder', wire, [0, 3.05, 0], [1.1, 0.1, 1.1])
  for (let index = 0; index < 12; index++) {
    const angle = (index / 12) * Math.PI * 2
    kit.add(root, 'cylinder', wire, [Math.cos(angle) * 1.05, 3.9, Math.sin(angle) * 1.05], [0.03, 1.7, 0.03])
  }
  kit.add(root, 'sphere', wire, [0, 4.75, 0], [1.08, 0.5, 1.08])
  kit.add(root, 'box', '#e88f6a', [0.7, 3.25, 0.5], [0.35, 0.25, 0.3])
  return root
}

/** Sofa over the crawl space: seat 1.6, back 3.4; the base starts at the overhang's 0.9. */
export function sofa(kit: Kit, x: number, z: number, length: number, depth: number, material: THREE.Material) {
  const root = group(x, z)
  kit.add(root, 'box', material, [0, 1.25, 0.2], [length - 1, 0.7, depth - 0.8])
  for (let index = -1; index <= 1; index++)
    kit.add(root, 'box', material, [(index * (length - 2)) / 3, 1.75, 0.5], [(length - 2) / 3 - 0.1, 0.5, depth - 1.4])
  kit.add(root, 'box', material, [0, 2.6, -depth / 2 + 0.6], [length - 1, 2.2, 1.2])
  for (const side of [-1, 1]) kit.add(root, 'box', material, [side * (length / 2 - 0.6), 1.8, 0], [1.2, 1.8, depth])
  for (const sx of [-1, 1])
    for (const sz of [-1, 1])
      kit.add(root, 'box', '#5a4030', [sx * (length / 2 - 1), 0.45, sz * (depth / 2 - 0.6)], [0.3, 0.9, 0.3])
  kit.add(root, 'box', '#f2c94c', [-length / 4, 2.4, -depth / 2 + 1.4], [1.6, 1.4, 0.5], [0.2, 0.2, 0])
  return root
}

/** Table with four legs and its top at `top`. */
export function table(
  kit: Kit,
  x: number,
  z: number,
  width: number,
  depth: number,
  top: number,
  wood: string | THREE.Material
) {
  const root = group(x, z)
  kit.add(root, 'box', wood, [0, top + 0.15, 0], [width, 0.3, depth])
  for (const sx of [-1, 1])
    for (const sz of [-1, 1])
      kit.add(root, 'box', wood, [sx * (width / 2 - 0.4), top / 2, sz * (depth / 2 - 0.4)], [0.35, top, 0.35])
  return root
}

export function chair(kit: Kit, x: number, z: number, turn: number, wood: string | THREE.Material) {
  const root = group(x, z, turn)
  kit.add(root, 'box', wood, [0, 1.55, 0], [1.9, 0.2, 1.9])
  kit.add(root, 'box', '#e9d8b4', [0, 1.7, 0.05], [1.7, 0.12, 1.7])
  kit.add(root, 'box', wood, [0, 2.5, -0.85], [1.9, 1.6, 0.2])
  for (const sx of [-1, 1])
    for (const sz of [-1, 1]) kit.add(root, 'box', wood, [sx * 0.8, 0.75, sz * 0.8], [0.2, 1.5, 0.2])
  return root
}

export function fridge(kit: Kit, x: number, z: number) {
  const root = group(x, z)
  kit.add(root, 'box', '#eef1f2', [0, 3.1, 0], [3.2, 6.2, 2.4])
  kit.add(root, 'box', '#d5dadd', [0, 4.2, 1.21], [3.1, 0.05, 0.02])
  for (const y of [2.2, 5.0]) kit.add(root, 'box', '#9aa3a8', [1.35, y, 1.25], [0.12, 1.2, 0.1])
  kit.add(root, 'box', '#e45d5d', [-0.6, 5.3, 1.22], [0.35, 0.35, 0.05])
  kit.add(root, 'box', '#ffffff', [-0.2, 4.9, 1.22], [0.8, 1.0, 0.03]) // a drawing by Hinata
  return root
}

/** Counter run along z (against the east wall), sink at `sinkZ`. */
export function counter(kit: Kit, x: number, z: number, length: number, sinkZ: number) {
  const root = group(x, z, Math.PI / 2)
  const steel = kit.material('#aeb6bd', { metal: 0.8, roughness: 0.25 })
  kit.add(root, 'box', '#f4efe6', [0, 1.55, 0], [length, 3.1, 2.4])
  kit.add(root, 'box', '#c9c3b9', [0, 3.15, 0], [length + 0.1, 0.12, 2.5])
  for (let px = -length / 2 + 1.5; px < length / 2; px += 3)
    kit.add(root, 'box', '#d7d0c4', [px, 1.6, -1.2], [2.7, 2.6, 0.04])
  const sink = -(sinkZ - z)
  kit.add(root, 'box', steel, [sink, 3.2, 0], [2.6, 0.06, 1.6])
  kit.add(root, 'cylinder', steel, [sink, 3.8, 0.9], [0.08, 1.2, 0.08])
  for (const px of [sink + 5, sink + 6.2])
    kit.add(root, 'torus', '#2b2b2b', [px, 3.25, 0], [0.4, 0.4, 0.4], [Math.PI / 2, 0, 0])
  return root
}

export function washer(kit: Kit, x: number, z: number) {
  const root = group(x, z, -Math.PI / 2)
  kit.add(root, 'box', '#f7f7f5', [0, 1.8, 0], [3.4, 3.6, 3.4])
  kit.add(root, 'torus', '#b9c2c9', [0, 1.7, 1.72], [0.95, 0.95, 0.95])
  kit.add(
    root,
    'cylinder',
    kit.material('#7aa6c2', { roughness: 0.1, metal: 0.3 }),
    [0, 1.7, 1.7],
    [0.85, 0.05, 0.85],
    [Math.PI / 2, 0, 0]
  )
  kit.add(root, 'box', '#d0d6db', [0, 3.3, 1.68], [3.2, 0.5, 0.08])
  return root
}

export function laundryBasket(kit: Kit, x: number, z: number) {
  const root = group(x, z)
  kit.add(root, 'cylinder', '#c9a46a', [0, 1, 0], [1.8, 2, 1.8])
  const colors = ['#7fa7d9', '#f2f2f2', '#e97f8c', '#a6c97a', '#f2d16b']
  colors.forEach((color, index) => {
    const angle = index * 1.3
    kit.add(
      root,
      'sphere',
      color,
      [Math.cos(angle) * 0.8, 2.1, Math.sin(angle) * 0.8],
      [1.0, 0.45, 0.8],
      [0, angle, 0.3]
    )
  })
  return root
}

export function shoeRack(kit: Kit, x: number, y: number, z: number, length: number, material: THREE.Material) {
  const root = group(x, z)
  root.position.y = y
  kit.add(root, 'box', material, [0, 1.75, 0], [length, 1.7, 2.4])
  for (const side of [-1, 1]) kit.add(root, 'box', material, [side * (length / 2 - 0.15), 0.45, 0], [0.3, 0.9, 2.4])
  kit.add(root, 'box', '#2d2d2d', [-2, 2.85, 0.2], [1.4, 0.5, 2.2])
  kit.add(root, 'box', '#e8455a', [1.6, 2.8, 0.3], [1.0, 0.4, 1.6])
  return root
}

export function zabuton(kit: Kit, x: number, z: number, color = '#7b4a8f') {
  const root = group(x, z)
  kit.add(root, 'box', color, [0, 0.1, 0], [3, 0.2, 3])
  for (const sx of [-1, 1])
    for (const sz of [-1, 1]) kit.add(root, 'sphere', '#e8c86a', [sx * 1.4, 0.2, sz * 1.4], [0.12, 0.12, 0.12])
  return root
}

export function toyBox(kit: Kit, x: number, z: number) {
  const root = group(x, z)
  kit.add(root, 'box', '#f29e4c', [0, 1.2, 0], [4, 2.4, 3])
  kit.add(root, 'box', '#5aa9e6', [0, 2.45, -1.3], [4.1, 0.15, 3.1], [0.9, 0, 0])
  kit.add(root, 'sphere', '#b07a4a', [0.6, 2.6, 0.2], [0.7, 0.7, 0.6])
  kit.add(root, 'sphere', '#e8455a', [-1, 2.5, 0.5], [0.45, 0.45, 0.45])
  return root
}

export function housePlant(kit: Kit, x: number, z: number) {
  const root = group(x, z)
  kit.add(root, 'frustum', '#c8714a', [0, 0.8, 0], [1.0, 1.6, 1.0], [Math.PI, 0, 0])
  for (let index = 0; index < 7; index++) {
    const angle = index * 0.9
    kit.add(
      root,
      'sphere',
      index % 2 ? '#4f8a4a' : '#62a35a',
      [Math.cos(angle) * 0.9, 2.4 + (index % 3) * 0.5, Math.sin(angle) * 0.9],
      [0.9, 0.35, 0.5],
      [0.4, angle, 0.5]
    )
  }
  return root
}

export function curtain(kit: Kit, x: number, z: number, width: number, color = '#e9dfc7') {
  const root = group(x, z)
  for (let px = -width / 2 + 0.35; px < width / 2; px += 0.7)
    kit.add(root, 'cylinder', color, [px, 3.5, 0], [0.38, 7, 0.3])
  return root
}

export function dogHouse(kit: Kit, x: number, z: number) {
  const root = group(x, z)
  kit.add(root, 'box', '#c98d55', [0, 1.6, 0], [5, 3.2, 5])
  for (const side of [-1, 1])
    kit.add(root, 'box', '#8c3b2e', [side * 1.6, 4.1, 0], [3.6, 0.3, 5.6], [0, 0, side * -0.6])
  kit.add(root, 'box', '#2a1d14', [0, 1.3, 2.51], [2, 2.4, 0.05])
  kit.add(root, 'box', '#f6efe0', [0, 3.0, 2.53], [1.6, 0.5, 0.05])
  return root
}

/** Wooden fence boards along a rect's long side. */
export function boardFence(kit: Kit, minX: number, maxX: number, minZ: number, maxZ: number, height: number) {
  const root = new THREE.Group()
  const alongX = maxX - minX >= maxZ - minZ
  const length = alongX ? maxX - minX : maxZ - minZ
  for (let at = 0.6; at < length; at += 1.25) {
    const x = alongX ? minX + at : (minX + maxX) / 2
    const z = alongX ? (minZ + maxZ) / 2 : minZ + at
    kit.add(root, 'box', '#b8946a', [x, height / 2, z], alongX ? [1.1, height, 0.3] : [0.3, height, 1.1])
  }
  for (const y of [1.2, height - 1.2])
    kit.add(
      root,
      'box',
      '#8f7050',
      [(minX + maxX) / 2, y, (minZ + maxZ) / 2],
      alongX ? [length, 0.4, 0.4] : [0.4, 0.4, length]
    )
  return root
}

export function hedge(kit: Kit, x: number, z: number, radius: number) {
  const root = group(x, z)
  for (let index = 0; index < 5; index++) {
    const angle = index * 1.26
    kit.add(
      root,
      'sphere',
      index % 2 ? '#4f8a4a' : '#5f9e55',
      [Math.cos(angle) * radius * 0.45, 1.2 + (index % 2) * 0.5, Math.sin(angle) * radius * 0.45],
      [radius * 0.7, 1.4, radius * 0.7]
    )
  }
  return root
}

/** Carried items: Tama's niboshi and her old collar tag. */
export function itemModel(kind: string): THREE.Object3D {
  const root = new THREE.Group()
  const mesh = (geometry: THREE.BufferGeometry, color: string, metal = 0) =>
    new THREE.Mesh(
      geometry,
      new THREE.MeshStandardMaterial({ color, metalness: metal, roughness: 0.4, flatShading: true })
    )
  if (kind === 'niboshi') {
    const body = mesh(new THREE.SphereGeometry(0.3, 8, 6), '#b9c4cc', 0.5)
    body.scale.set(0.45, 0.4, 1.4)
    body.position.y = 0.15
    const tail = mesh(new THREE.ConeGeometry(0.16, 0.3, 4), '#9aa6ae', 0.5)
    tail.rotation.x = -Math.PI / 2
    tail.position.set(0, 0.15, -0.5)
    root.add(body, tail)
  } else {
    const disc = mesh(new THREE.CylinderGeometry(0.28, 0.28, 0.06, 14), '#e2b53a', 0.8)
    disc.position.y = 0.05
    const ring = mesh(new THREE.TorusGeometry(0.1, 0.03, 6, 10), '#c74a3a')
    ring.position.set(0, 0.06, -0.32)
    ring.rotation.x = Math.PI / 2
    root.add(disc, ring)
  }
  return root
}
