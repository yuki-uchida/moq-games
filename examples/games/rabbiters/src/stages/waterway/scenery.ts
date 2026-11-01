// Chapter 3 scenery: the height grid as a chunked ground mesh (off-screen chunks are culled), props merged into one
// mesh per colour, and a few animated pieces (water levels, valve wheel, the fence net, moonlight shafts).
import * as THREE from 'three'
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js'
import { CELL, TERRAIN, WATER_LEVEL, WORLD, heightAt } from '../../map'
import type { Scenery, SceneryState, StageLook } from '../../story'
import { inRect, segmentDistance, type Rect } from '../kit'
import {
  BENCHES,
  BRIDGE,
  BUSHES,
  CURRENT,
  FENCE_HOLE,
  FLOODED,
  FOOTBRIDGE,
  GRASS,
  LOOP,
  OVERHANGS,
  PIPE,
  PLAYGROUND,
  POND,
  RIVER,
  SANDBAR,
  SANDBOX,
  SEWER_CHANNEL,
  SHELTERS,
  SLIDE,
  SPOTS,
  STONES,
  TREES,
  ZONES
} from './map'
import { STEP, holdTicks, surging } from './script'

/** Sewer at night, the river at dawn, the park in the morning: the time of day follows the step. */
export const LOOK: StageLook = {
  sky: '#cfe6ef',
  nightSky: '#0b111a',
  fog: [34, 150],
  hemi: ['#e4f0f4', '#5a5040', 2.3],
  sun: ['#ffe6b8', 2.9],
  night: (state) => {
    const step = state.step ?? 0
    return step <= STEP.outfall ? 1 : step <= STEP.bridge ? 0.5 : 0
  },
  dark: true
}

type Shape = 'box' | 'cylinder' | 'sphere' | 'cone'
const UNIT: Record<Shape, THREE.BufferGeometry> = {
  box: new THREE.BoxGeometry(1, 1, 1),
  cylinder: new THREE.CylinderGeometry(0.5, 0.5, 1, 10),
  sphere: new THREE.SphereGeometry(0.5, 8, 5),
  cone: new THREE.ConeGeometry(0.5, 1, 6)
}
type V3 = [number, number, number]
/** A unit shape centred at `at`, scaled to `size` (full extents), rotated by `turn` (Euler). */
type Part = { shape: Shape; color: string; at: V3; size: V3; turn?: V3 }

function colorAt(x: number, z: number, y: number): string {
  if (x <= -45) {
    if (y >= 7) return '#1e2226'
    if (y > 0.2) return '#6a6e74'
    if (y < -1) return '#22302c'
    if (y < -0.1) return '#3b4a42'
    return inRect(x, z, PIPE) ? '#4d5257' : (Math.floor(x / 2) + Math.floor(z / 2)) & 1 ? '#5a5e62' : '#55595d'
  }
  if (x < 30 && y >= 5) return '#7f9c55' // levee top
  if (x < 18) {
    if (inRect(x, z, SANDBAR, 1)) return '#b3a789'
    if (y > 0.15 && x > RIVER.west && x < RIVER.east) return '#8f8f88' // stepping stones
    if (y < -1) return '#4f6a5e'
    if (y < -0.1) return '#7a8064'
    return x < RIVER.west ? (x < -38 ? '#a89b78' : '#93995f') : '#8aa45c'
  }
  if (y >= 3.5) return '#8a6d4a' // fences
  if (x > 126) return '#6f9a4e'
  if (y < -0.1) return y < -1 ? '#3f5d5a' : '#73806a'
  if (inRect(x, z, SANDBOX)) return '#e3d29a'
  if (inRect(x, z, PLAYGROUND)) return '#c9b98f'
  for (let index = 0; index < LOOP.length; index++) {
    const a = LOOP[index]
    const b = LOOP[(index + 1) % LOOP.length]
    if (segmentDistance(x, z, a.x, a.z, b.x, b.z) < 2.6) return '#d8c9a3'
  }
  return Math.hypot(x - POND.x, z - POND.z) < POND.shore + 1.5 ? '#9c9a7c' : '#86b85e'
}

/** Ground mesh in chunks of CHUNK cells so the camera only draws what it faces. */
const CHUNK = 44
function ground(root: THREE.Group, disposables: { dispose(): void }[]) {
  const { nx, nz, heights } = TERRAIN
  const material = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.95, flatShading: true })
  disposables.push(material)
  const color = new THREE.Color()
  for (let j0 = 0; j0 < nz - 1; j0 += CHUNK)
    for (let i0 = 0; i0 < nx - 1; i0 += CHUNK) {
      const ci = Math.min(CHUNK, nx - 1 - i0) + 1
      const cj = Math.min(CHUNK, nz - 1 - j0) + 1
      const positions = new Float32Array(ci * cj * 3)
      const colors = new Float32Array(ci * cj * 3)
      for (let j = 0; j < cj; j++)
        for (let i = 0; i < ci; i++) {
          const index = j * ci + i
          const x = WORLD.minX + (i0 + i) * CELL
          const z = WORLD.minZ + (j0 + j) * CELL
          const y = heights[(j0 + j) * nx + i0 + i]
          positions.set([x, y, z], index * 3)
          color.set(colorAt(x, z, y))
          colors.set([color.r, color.g, color.b], index * 3)
        }
      const indices: number[] = []
      for (let j = 0; j < cj - 1; j++)
        for (let i = 0; i < ci - 1; i++) {
          const a = j * ci + i
          indices.push(a, a + ci + 1, a + 1, a, a + ci, a + ci + 1) // same diagonal as map.heightAt
        }
      const geometry = new THREE.BufferGeometry()
      geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3))
      geometry.setAttribute('color', new THREE.BufferAttribute(colors, 3))
      geometry.setIndex(indices)
      geometry.computeVertexNormals()
      geometry.computeBoundingSphere()
      disposables.push(geometry)
      const mesh = new THREE.Mesh(geometry, material)
      mesh.receiveShadow = true
      mesh.name = 'terrain'
      root.add(mesh)
    }
}

/** Merges parts into one mesh per colour. */
function merge(parts: Part[], root: THREE.Group, disposables: { dispose(): void }[], shadows = true) {
  const byColor = new Map<string, THREE.BufferGeometry[]>()
  const matrix = new THREE.Matrix4()
  const rotation = new THREE.Quaternion()
  for (const part of parts) {
    rotation.setFromEuler(new THREE.Euler(...(part.turn ?? [0, 0, 0])))
    matrix.compose(new THREE.Vector3(...part.at), rotation, new THREE.Vector3(...part.size))
    const geometry = UNIT[part.shape].clone().applyMatrix4(matrix)
    const list = byColor.get(part.color)
    if (list) list.push(geometry)
    else byColor.set(part.color, [geometry])
  }
  for (const [color, list] of byColor) {
    const geometry = mergeGeometries(list)
    list.forEach((entry) => entry.dispose())
    const material = new THREE.MeshStandardMaterial({ color, roughness: 0.85, flatShading: true })
    disposables.push(geometry, material)
    const mesh = new THREE.Mesh(geometry, material)
    mesh.castShadow = shadows
    mesh.receiveShadow = true
    root.add(mesh)
  }
}

const box = (color: string, at: V3, size: V3, turn?: V3): Part => ({ shape: 'box', color, at, size, turn })
const cyl = (color: string, at: V3, size: V3, turn?: V3): Part => ({ shape: 'cylinder', color, at, size, turn })
const ball = (color: string, at: V3, size: V3): Part => ({ shape: 'sphere', color, at, size })
const ground0 = (x: number, z: number) => heightAt(x, z)

function sewerProps(parts: Part[]) {
  // Wall pipes and a rusty trim along both walkways.
  for (const z of [6.6, -24.6]) {
    parts.push(cyl('#6d5f4e', [-92, 3.2, z], [1.1, 70, 1.1], [0, 0, Math.PI / 2]))
    parts.push(cyl('#4f5a5f', [-92, 5.4, z], [0.6, 70, 0.6], [0, 0, Math.PI / 2]))
  }
  // Footbridge rails.
  for (const x of [FOOTBRIDGE.x - 2, FOOTBRIDGE.x + 2]) {
    parts.push(box('#8b9096', [x, 3.4, -10], [0.25, 0.2, 12]))
    for (let z = -15; z <= -5; z += 2.5) parts.push(box('#8b9096', [x, 1.8, z], [0.2, 3.2, 0.2]))
  }
  // The sluice gate at the channel's end and its frame.
  parts.push(box('#5a4a3a', [-58.4, 4, -10], [0.8, 8, 12.4]))
  parts.push(box('#3d3f42', [-58.4, 8.4, -10], [1.4, 0.8, 14]))
  // Valve posts (the wheels animate separately).
  parts.push(cyl('#59606a', [SPOTS.valve.x, 1.5, SPOTS.valve.z - 1.4], [0.9, 3, 0.9]))
  parts.push(cyl('#59606a', [SPOTS.valve2.x + 1.4, 1.5, SPOTS.valve2.z], [0.9, 3, 0.9]))
  // Junk heaps (the sewer bushes): crates and soggy boxes.
  for (const bush of BUSHES.filter((entry) => entry.x < -45)) {
    parts.push(box('#7a5c3a', [bush.x, 0.5, bush.z], [1.8, 1, 1.4], [0, 0.3, 0]))
    parts.push(box('#8e7048', [bush.x + 0.3, 1.3, bush.z - 0.2], [1.2, 0.7, 1], [0, -0.4, 0]))
  }
  // Fallen pipe sections on blocks (rabbits crouch underneath).
  for (const roof of OVERHANGS.filter((entry) => entry.maxX < -45)) {
    const x = (roof.minX + roof.maxX) / 2
    const z = (roof.minZ + roof.maxZ) / 2
    parts.push(cyl('#737a80', [x, roof.bottom + 1.3, z], [2.6, roof.maxX - roof.minX, 2.6], [0, 0, Math.PI / 2]))
    for (const end of [roof.minX + 0.3, roof.maxX - 0.3])
      parts.push(box('#4a4e52', [end, roof.bottom / 2, z], [0.5, roof.bottom, 1.6]))
  }
  // Rats' nest: shredded paper and scraps.
  for (let index = 0; index < 9; index++)
    parts.push(ball('#c9bfa2', [-108 + (index % 3) * 1.4, 0.25, -33.5 + Math.floor(index / 3) * 1.1], [1.3, 0.5, 1.1]))
  // Worker's room: ladder up the wall, a toolbox and a hard hat on the shelf.
  for (const dx of [-0.7, 0.7]) parts.push(box('#9aa0a6', [-88 + dx, 4, 17.6], [0.15, 8, 0.15]))
  for (let y = 0.8; y < 8; y += 0.9) parts.push(box('#9aa0a6', [-88, y, 17.6], [1.4, 0.1, 0.1]))
  parts.push(box('#c0392b', [-83, 0.4, 16], [1.6, 0.8, 0.9]))
  parts.push(box('#6b5233', [-94, 1.2, 16.5], [3, 0.2, 1.2]))
  parts.push(ball('#f2b417', [-94, 1.6, 16.5], [0.9, 0.6, 0.9]))
  // Gama's nook: an old drain spout and moss.
  parts.push(cyl('#6d5f4e', [-103, 2.4, 10.2], [1.2, 1.4, 1.2], [Math.PI / 2, 0, 0]))
  parts.push(ball('#3f6b3a', [-104.5, 0.1, 9.2], [2, 0.3, 1.2]))
  // Street grates overhead (dark bars at the wall tops) where moonlight falls in.
  for (const zone of ZONES.filter((entry) => entry.name === '月明かりの格子'))
    for (let x = zone.minX + 1; x < zone.maxX; x += 1.5)
      parts.push(box('#2a2d31', [x, 8.3, (zone.minZ + zone.maxZ) / 2], [0.25, 0.25, zone.maxZ - zone.minZ]))
  // Outfall mouth: a concrete frame where the pipe meets the river bank.
  parts.push(box('#7b7f85', [-44.6, 5, PIPE.minZ - 1], [1.2, 10, 1.4]))
  parts.push(box('#7b7f85', [-44.6, 5, PIPE.maxZ + 1], [1.2, 10, 1.4]))
  parts.push(box('#7b7f85', [-44.6, 6.5, (PIPE.minZ + PIPE.maxZ) / 2], [1.2, 1.5, PIPE.maxZ - PIPE.minZ + 3]))
}

function riverProps(parts: Part[]) {
  // The road bridge: deck, railings, piers in the deep water and abutments.
  const cx = (BRIDGE.minX + BRIDGE.maxX) / 2
  const cz = (BRIDGE.minZ + BRIDGE.maxZ) / 2
  parts.push(box('#9a9a92', [cx, 7.6, cz], [BRIDGE.maxX - BRIDGE.minX, 1.2, BRIDGE.maxZ - BRIDGE.minZ]))
  parts.push(box('#5d5f63', [cx, 8.25, cz], [BRIDGE.maxX - BRIDGE.minX, 0.1, BRIDGE.maxZ - BRIDGE.minZ - 2]))
  for (const z of [BRIDGE.minZ + 0.3, BRIDGE.maxZ - 0.3])
    parts.push(box('#b8b8b0', [cx, 9, z], [BRIDGE.maxX - BRIDGE.minX, 1.4, 0.4]))
  for (const x of [-24, -12]) parts.push(box('#85857e', [x, 2.5, cz], [2.4, 10, BRIDGE.maxZ - BRIDGE.minZ - 3]))
  // The strays' den: flattened boxes and an old blanket.
  parts.push(box('#a07c50', [SPOTS.den.x + 3, 0.05, SPOTS.den.z + 2], [5, 0.1, 3.4], [0, 0.2, 0]))
  parts.push(box('#7a4a5a', [SPOTS.den.x - 1, 0.08, SPOTS.den.z - 1], [3.6, 0.12, 2.6], [0, -0.3, 0]))
  // Rubbish heap the strays visit, and a sign by the ford.
  parts.push(box('#6b6f73', [9, 0.6, 50], [2.4, 1.2, 1.8], [0, 0.4, 0]))
  parts.push(box('#a07c50', [8, 1.6, 51], [1.6, 0.8, 1.2], [0, -0.2, 0]))
  parts.push(box('#3b6fb6', [10.5, 0.7, 49], [1.2, 1.4, 1.2]))
  // Rounded caps on the stepping stones.
  for (const stone of STONES) parts.push(ball('#9a9a92', [stone.x, 0.3, stone.z], [2.6, 0.5, 2.4]))
  // The angler's stool, bucket and rod.
  parts.push(box('#3d5a80', [-37.8, 0.9, 12.4], [1.2, 0.2, 1.2]))
  for (const dx of [-0.4, 0.4]) parts.push(box('#2b2b2b', [-37.8 + dx, 0.45, 12.4], [0.1, 0.9, 0.9]))
  parts.push(cyl('#d0d4d8', [-36.2, 0.5, 13.6], [0.9, 1, 0.9]))
  parts.push(cyl('#3a2f2a', [-33, 3.2, 12], [0.08, 9, 0.08], [0, 0, -1.1]))
  // Guard rail along the levee top.
  for (const [z0, z1] of [
    [-66, 32],
    [38, 66]
  ])
    parts.push(box('#c8ccd0', [23.5, 6.9, (z0 + z1) / 2], [0.2, 0.3, z1 - z0]))
}

function parkProps(parts: Part[]) {
  for (const tree of TREES) {
    const y = ground0(tree.x, tree.z)
    parts.push(cyl('#6b4a2e', [tree.x, y + 3, tree.z], [1.1, 6, 1.1]))
    parts.push(ball('#4f8f3e', [tree.x, y + 8, tree.z], [7, 6, 7]))
    parts.push(ball('#5fa04a', [tree.x + 1.2, y + 10, tree.z - 0.8], [4.6, 4, 4.6]))
  }
  for (const bush of BUSHES.filter((entry) => entry.x > 18)) {
    parts.push(ball('#4a8a3c', [bush.x, 0.9, bush.z], [bush.r * 2, 2.2, bush.r * 2]))
    parts.push(ball('#58994a', [bush.x + 0.5, 1.6, bush.z - 0.3], [bush.r * 1.2, 1.4, bush.r * 1.2]))
  }
  for (const { x, z, along } of BENCHES) {
    const turn: V3 = [0, along === 'x' ? 0 : Math.PI / 2, 0]
    const dx = along === 'x' ? 1 : 0
    const dz = along === 'x' ? 0 : 1
    for (let index = 0; index < 4; index++) {
      const off = -0.9 + index * 0.6
      parts.push(box('#a8743f', [x + dz * off, 1.6, z + dx * off], [9, 0.18, 0.45], turn))
    }
    parts.push(box('#a8743f', [x - dz * 1.35, 2.9, z - dx * 1.35], [9, 0.45, 0.15], turn))
    for (const side of [-1, 1])
      parts.push(box('#3d3f42', [x + dx * side * 4, 0.75, z + dz * side * 4], [0.25, 1.5, 2.6], turn))
  }
  // Slide: deck over SLIDE (rabbits shelter underneath), ladder posts and chute.
  const sx = (SLIDE.minX + SLIDE.maxX) / 2
  const sz = (SLIDE.minZ + SLIDE.maxZ) / 2
  for (const ox of [-1.8, 1.8])
    for (const oz of [-1.8, 1.8]) parts.push(cyl('#3d7cc9', [sx + ox, 2.8, sz + oz], [0.35, 5.6, 0.35]))
  parts.push(box('#f2b417', [sx, 2.4, sz], [4.2, 0.4, 4.2]))
  parts.push(box('#e8455a', [sx, 1.4, sz + 6], [2.4, 0.25, 9], [0.42, 0, 0]))
  for (let y = 0.6; y < 2.4; y += 0.6) parts.push(box('#9aa0a6', [sx, y, sz - 2.3], [2, 0.12, 0.12]))
  // Play tunnel (the shelter).
  for (const shelter of SHELTERS) {
    parts.push(cyl('#e8455a', [shelter.x, 1.6, shelter.z], [3.6, 5, 3.6], [0, 0, Math.PI / 2]))
    parts.push(cyl('#2d2224', [shelter.x, 1.5, shelter.z], [2.6, 5.05, 2.6], [0, 0, Math.PI / 2]))
  }
  // Sandbox frame, a swing frame and the pond's rim stones.
  for (const [x, z, w, d] of [
    [(SANDBOX.minX + SANDBOX.maxX) / 2, SANDBOX.minZ, SANDBOX.maxX - SANDBOX.minX, 0.4],
    [(SANDBOX.minX + SANDBOX.maxX) / 2, SANDBOX.maxZ, SANDBOX.maxX - SANDBOX.minX, 0.4],
    [SANDBOX.minX, (SANDBOX.minZ + SANDBOX.maxZ) / 2, 0.4, SANDBOX.maxZ - SANDBOX.minZ],
    [SANDBOX.maxX, (SANDBOX.minZ + SANDBOX.maxZ) / 2, 0.4, SANDBOX.maxZ - SANDBOX.minZ]
  ])
    parts.push(box('#b07a4a', [x, 0.2, z], [w, 0.4, d]))
  for (const ox of [-4, 4]) parts.push(box('#3d7cc9', [108 + ox, 4, 20], [0.3, 8, 0.3]))
  parts.push(box('#3d7cc9', [108, 8, 20], [8.6, 0.3, 0.3]))
  for (let index = 0; index < 22; index++) {
    const angle = (index / 22) * Math.PI * 2
    parts.push(
      ball(
        '#9b978a',
        [POND.x + Math.cos(angle) * (POND.shore + 0.4), 0.15, POND.z + Math.sin(angle) * (POND.shore + 0.4)],
        [1.4, 0.6, 1.1]
      )
    )
  }
  // Genji's sunning rock.
  parts.push(ball('#8a877c', [SPOTS.genji.x + 0.6, 0.1, SPOTS.genji.z], [3, 0.6, 2.4]))
  // Fence rails along the back fence and the perimeter.
  for (const [z0, z1] of [
    [-64, FENCE_HOLE.minZ],
    [FENCE_HOLE.maxZ, 64]
  ])
    parts.push(box('#6e5236', [124.5, 4.6, (z0 + z1) / 2], [0.4, 0.3, z1 - z0]))
  for (const z of [-64.5, 64.5]) parts.push(box('#6e5236', [77, 4.6, z], [94, 0.3, 0.4]))
  // The back hill's trees, and lamp posts along the loop.
  for (const z of [-56, -44, -22, -8, 6, 22, 40, 54]) {
    const y = ground0(130, z)
    parts.push(cyl('#5d4128', [130, y + 4, z], [1, 8, 1]))
    parts.push({ shape: 'cone', color: '#3f7a3c', at: [130, y + 10, z], size: [6, 10, 6] })
  }
}

/** Reeds and flowers on the grass patches, as thin blades merged by colour. */
function plants(parts: Part[]) {
  let seed = 7
  const random = () => ((seed = (seed * 16807) % 2147483647) - 1) / 2147483646
  for (const patch of GRASS) {
    const length = Math.hypot(patch.bx - patch.ax, patch.bz - patch.az)
    const count = Math.round(6 + length * 2.2)
    const park = patch.ax > 30
    for (let index = 0; index < count; index++) {
      const t = random()
      const angle = random() * Math.PI * 2
      const spread = random() * patch.r
      const x = patch.ax + (patch.bx - patch.ax) * t + Math.cos(angle) * spread
      const z = patch.az + (patch.bz - patch.az) * t + Math.sin(angle) * spread
      const y = Math.max(ground0(x, z), WATER_LEVEL)
      const tall = park ? 0.9 + random() * 0.5 : 1.8 + random() * 1.2
      parts.push({
        shape: 'cone',
        color: random() < 0.5 ? '#7d9a48' : '#97a85a',
        at: [x, y + tall / 2, z],
        size: [0.35, tall, 0.35]
      })
      if (park && random() < 0.5)
        parts.push(
          box(random() < 0.6 ? '#f2d03b' : '#f0a0c0', [x, y + tall + 0.1, z], [0.3, 0.18, 0.3], [0, random(), 0])
        )
    }
  }
}

const waterMaterial = () =>
  new THREE.MeshStandardMaterial({
    color: '#3f7f94',
    roughness: 0.25,
    transparent: true,
    opacity: 0.72,
    depthWrite: false
  })

function plane(rect: Rect, material: THREE.Material, y: number) {
  const mesh = new THREE.Mesh(
    new THREE.PlaneGeometry(rect.maxX - rect.minX, rect.maxZ - rect.minZ).rotateX(-Math.PI / 2),
    material
  )
  mesh.position.set((rect.minX + rect.maxX) / 2, y, (rect.minZ + rect.maxZ) / 2)
  return mesh
}

export function scenery(scene: THREE.Scene): Scenery {
  const root = new THREE.Group()
  const disposables: { dispose(): void }[] = []
  ground(root, disposables)
  const parts: Part[] = []
  sewerProps(parts)
  riverProps(parts)
  parkProps(parts)
  merge(parts, root, disposables)
  // Blades and flowers are too thin to need shadows: skip them in the shadow pass.
  const greenery: Part[] = []
  plants(greenery)
  merge(greenery, root, disposables, false)

  // Water: the sewer channel and the flood over the south walkway drop once the valve is turned.
  const water = waterMaterial()
  const sewerWater = waterMaterial()
  sewerWater.color.set('#2e4a48')
  disposables.push(water, sewerWater)
  const channel = plane(SEWER_CHANNEL, sewerWater, WATER_LEVEL)
  const flood = plane({ ...FLOODED, maxX: FLOODED.maxX + 1 }, sewerWater, 0.5)
  const river = plane(
    { minX: RIVER.west, maxX: RIVER.east + 1, minZ: WORLD.minZ, maxZ: WORLD.maxZ },
    water,
    WATER_LEVEL
  )
  const pond = new THREE.Mesh(new THREE.CircleGeometry(POND.shore - 0.6, 32).rotateX(-Math.PI / 2), water)
  pond.position.set(POND.x, WATER_LEVEL, POND.z)
  // Surges over the ford: the band of water at the stones swells and covers them.
  const ford = plane(CURRENT, water, WATER_LEVEL)
  for (const mesh of [channel, flood, river, pond, ford]) {
    disposables.push(mesh.geometry)
    root.add(mesh)
  }

  // Moonlight shafts through the street grates.
  const shaft = new THREE.MeshBasicMaterial({ color: '#c9dcff', transparent: true, opacity: 0.09, depthWrite: false })
  disposables.push(shaft)
  const shafts: THREE.BufferGeometry[] = ZONES.filter((zone) => zone.name === '月明かりの格子').map((zone) =>
    new THREE.BoxGeometry(zone.maxX - zone.minX - 1, 8, Math.min(8, zone.maxZ - zone.minZ - 1)).translate(
      (zone.minX + zone.maxX) / 2,
      4,
      (zone.minZ + zone.maxZ) / 2
    )
  )
  const shaftGeometry = mergeGeometries(shafts)
  shafts.forEach((entry) => entry.dispose())
  disposables.push(shaftGeometry)
  root.add(new THREE.Mesh(shaftGeometry, shaft))

  // The valve wheel spins as it is turned; the fence net hangs until gnawed through.
  const red = new THREE.MeshStandardMaterial({ color: '#c0392b', roughness: 0.4, metalness: 0.4 })
  const torus = new THREE.TorusGeometry(1.1, 0.16, 6, 18)
  const spoke = new THREE.BoxGeometry(2.1, 0.14, 0.14)
  disposables.push(red, torus, spoke)
  const wheels = [
    { x: SPOTS.valve.x, z: SPOTS.valve.z - 1.4, counter: 'A' as const, flag: 32 },
    { x: SPOTS.valve2.x + 1.4, z: SPOTS.valve2.z, counter: 'B' as const, flag: 64 }
  ].map((spot) => {
    const wheel = new THREE.Group()
    wheel.add(new THREE.Mesh(torus, red), new THREE.Mesh(spoke, red), new THREE.Mesh(spoke, red))
    wheel.children[2].rotation.z = Math.PI / 2
    wheel.position.set(spot.x, 3.1, spot.z)
    wheel.rotation.x = -Math.PI / 2
    root.add(wheel)
    return { wheel, ...spot }
  })
  const netMaterial = new THREE.MeshStandardMaterial({
    color: '#4e7d5a',
    transparent: true,
    opacity: 0.6,
    side: THREE.DoubleSide
  })
  const netGeometry = new THREE.PlaneGeometry(FENCE_HOLE.maxZ - FENCE_HOLE.minZ + 1, 3.6).rotateY(Math.PI / 2)
  disposables.push(netMaterial, netGeometry)
  const net = new THREE.Mesh(netGeometry, netMaterial)
  net.position.set(124.5, 1.8, (FENCE_HOLE.minZ + FENCE_HOLE.maxZ) / 2)
  root.add(net)

  scene.add(root)
  let last = NaN
  let channelY = WATER_LEVEL
  let floodY = 0.5
  let fordY = WATER_LEVEL
  return {
    update(state: SceneryState) {
      const dt = Number.isFinite(last) ? Math.min(0.25, Math.max(0, state.time - last)) : 10
      last = state.time
      const step = state.step ?? 0
      const drained = step >= STEP.drain
      // Levels ease toward their targets: the drop plays out over the valve_done lines.
      channelY += ((drained ? -0.85 : WATER_LEVEL) - channelY) * Math.min(1, dt * 0.15)
      floodY +=
        (((state.open ?? 0) & 1 || step > STEP.drain ? -0.9 : drained ? -0.2 : 0.5) - floodY) * Math.min(1, dt * 0.2)
      fordY += ((surging(state.time) ? 0.55 : WATER_LEVEL - 0.05) - fordY) * Math.min(1, dt * 3)
      ford.position.y = fordY
      channel.position.y = channelY
      flood.position.y = floodY
      flood.visible = floodY > -0.8
      for (const { wheel, counter, flag } of wheels) {
        const done = step > STEP.valve || ((state.flags ?? 0) & flag) !== 0
        wheel.rotation.z =
          (done ? 1800 : step === STEP.valve ? holdTicks({ flags: state.flags ?? 0 }, counter) : 0) * 0.01
      }
      net.visible = !((state.open ?? 0) & 2)
      shaft.opacity = step <= STEP.outfall ? 0.09 : 0
    },
    dispose() {
      disposables.forEach((entry) => entry.dispose())
      root.removeFromParent()
    }
  }
}

// Item parts are shared by every carried/placed copy (tiny; never disposed).
const ITEM = {
  red: new THREE.MeshStandardMaterial({ color: '#c0392b', roughness: 0.4, metalness: 0.4 }),
  stemMaterial: new THREE.MeshStandardMaterial({ color: '#4e8d53' }),
  petal: new THREE.MeshStandardMaterial({ color: '#f2d03b', roughness: 0.6 }),
  ring: new THREE.TorusGeometry(0.35, 0.07, 6, 14),
  bar: new THREE.BoxGeometry(0.7, 0.06, 0.06),
  stem: new THREE.CylinderGeometry(0.03, 0.03, 0.6, 5),
  flower: new THREE.SphereGeometry(0.18, 10, 6)
}
/** Carried items: the valve handle and Genji's dandelion. */
export function itemModel(kind: string): THREE.Object3D {
  const group = new THREE.Group()
  if (kind === 'handle') {
    const ring = new THREE.Mesh(ITEM.ring, ITEM.red)
    ring.rotation.x = Math.PI / 2
    ring.position.y = 0.12
    const bar = new THREE.Mesh(ITEM.bar, ITEM.red)
    bar.position.y = 0.12
    group.add(ring, bar)
  } else {
    const stem = new THREE.Mesh(ITEM.stem, ITEM.stemMaterial)
    stem.position.y = 0.3
    const flower = new THREE.Mesh(ITEM.flower, ITEM.petal)
    flower.position.y = 0.62
    flower.scale.y = 0.6
    group.add(stem, flower)
  }
  return group
}
