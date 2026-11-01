// Chapter 2 scenery: the height grid (roofs, walls, levee) coloured by area, every prop merged into one mesh per
// colour, plus three night layers that brighten as the evening goes: lit windows and lamp heads (emissive, merged),
// pools of light under the streetlights, and headlight beams that follow the cars (one InstancedMesh).
import * as THREE from 'three'
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js'
import { CELL, LANES, TERRAIN, vehiclesAt } from '../../map'
import type { Scenery, SceneryState, StageLook } from '../../story'
import { buildScenery, type Box } from '../scenery-kit'
import {
  BREAD,
  DISPLAYS,
  DRAIN_MOUTH,
  DRAINS,
  GARBAGE_CAGE,
  GRATE,
  LAMPS,
  LEVEE,
  PARKED,
  PLANTERS,
  POSTS,
  SHRINE_FLOOR,
  STANDS,
  VENDING,
  WORLD,
  buildMap
} from './map'

/** Evening at the start, sunset at the shrine, night on the embankment. */
const NIGHT_BY_STEP = [0.12, 0.12, 0.12, 0.12, 0.12, 0.2, 0.3, 0.3, 0.45, 0.55, 0.65, 0.88]
export const LOOK: StageLook = {
  sky: '#f0b48a',
  nightSky: '#1d2440',
  fog: [60, 170],
  hemi: ['#ffe0c4', '#5a4a40', 2.2],
  sun: ['#ffc58a', 2.6],
  night: (state) => NIGHT_BY_STEP[state.step ?? 0] ?? 0.85
}

const ROOFS = ['#6b5e57', '#4f5d6b', '#8a4b3a', '#5c6b58', '#7a6a5a']
function colorAt(x: number, z: number, y: number) {
  if (y > 5) return ROOFS[(Math.floor((x + 400) / 13) * 7 + Math.floor((z + 400) / 11) * 3) % ROOFS.length]
  if (y > 2.4 && x > 60 && x < 116) return '#a19a8c' // shrine stone wall
  if (x >= 122 && x <= 150 && y > 0.1) return x > 130.5 && x < 141.5 && y > LEVEE - 0.1 ? '#4a4b50' : '#5f7a45'
  if (x > 150) return y < -0.2 ? '#6a6550' : '#8e8a6a'
  if (x >= 114) return '#6f7a55'
  if (x > 62.5) return Math.abs(z) < 3 && x < 92 ? '#b8ad98' : '#cfc6b0' // gravel, stone path
  if (x > 42) return '#4d4d52'
  if (x > -32) return Math.abs(z) <= 9 ? '#bfae92' : '#a99a80'
  if (x > -39) return '#a9a39a'
  if (x > -66) return '#4a4a50'
  if (x > -72.5) return '#a9a39a'
  return y > 0.5 ? '#9a8a74' : '#8f8b84'
}

function props(): { boxes: Box[]; lit: Box[] } {
  const boxes: Box[] = []
  const lit: Box[] = []
  const box = (x: number, y: number, z: number, w: number, h: number, d: number, color: string, turn = 0) =>
    boxes.push({ x, y, z, w, h, d, color, turn })
  const map = buildMap()
  // Parked cars: shadow under, body, cabin, glass.
  const paint = ['#d0d4d8', '#7a2a2a', '#2f3a4a', '#e0d6c0']
  PARKED.forEach((area, index) => {
    const x = (area.minX + area.maxX) / 2
    const z = (area.minZ + area.maxZ) / 2
    box(x, 0.05, z, 6.3, 0.1, 15.6, '#2b2b2b')
    box(x, 0.9, z, 6.5, 2.7, 16, paint[index % paint.length])
    box(x, 3.6, z - 0.8, 5.7, 1.9, 8.8, paint[index % paint.length])
    box(x, 3.8, z - 0.8, 5.8, 1.2, 8, '#25313d')
    for (const end of [-1, 1]) for (const side of [-1, 1]) box(x + side * 3, 0, z + end * 5, 0.5, 1.8, 1.8, '#1e1e1e')
  })
  // Road markings: centre line, crosswalks, side street line.
  for (let z = -78; z < 78; z += 8) box(-49, 0.01, z, 0.3, 0.03, 4, '#e8e2c8')
  for (let z = -78; z < 78; z += 8) box(52, 0.01, z, 0.3, 0.03, 4, '#e8e2c8')
  for (let x = -64; x <= -40; x += 2) box(x, 0.01, -2, 1, 0.03, 7, '#e8e8e8')
  for (let x = 44; x <= 60; x += 2) box(x, 0.01, 0, 1, 0.03, 7, '#e8e8e8')
  // Drain grates.
  for (const z of DRAINS.z) for (const x of [DRAINS.west, DRAINS.east]) box(x, 0.3, z, 1.8, 0.06, 1.8, '#3a3c40')
  // Garbage point: the net cage, bags, Ponta's cardboard.
  const cage = GARBAGE_CAGE
  box((cage.minX + cage.maxX) / 2, 0, (cage.minZ + cage.maxZ) / 2, cage.maxX - cage.minX, 2.6, 2.5, '#3f7a4a')
  for (const [x, z] of [
    [-84, -44],
    [-81.5, -44.2],
    [-79.5, -43.8]
  ])
    box(x, 0, z, 1.6, 1.3, 1.2, '#e8e4d0')
  // Alley clutter: bins, flowerpots, cardboard (the bushes), bicycles, utility poles.
  for (const [x, z, h, color] of [
    [-120.25, -2.05, 2.2, '#3b6fb6'],
    [-109.25, 2.05, 2.2, '#4a8a4a'],
    [-140.05, 20.75, 2.2, '#3b6fb6'],
    [-103.05, -19.25, 0.6, '#b0603a'],
    [-129.05, 12.75, 0.6, '#b0603a']
  ] as const)
    box(x, 0, z, 1.5, h, 1.5, color)
  for (const bush of map.bushes)
    if (bush.x < 113 && !(bush.x > 62 && bush.x < 112)) {
      box(bush.x, 0, bush.z, bush.r * 1.3, bush.r * 1.1, bush.r * 1.2, '#b88a55', bush.x * 0.3)
      box(bush.x + 0.2, bush.r * 1.1, bush.z - 0.1, bush.r * 1.1, bush.r * 0.7, bush.r, '#c99a62', bush.z * 0.2)
    }
  for (const stand of STANDS) {
    // Bus-stop bench / pet-shop stand: a top on two legs.
    const x = (stand.minX + stand.maxX) / 2
    const z = (stand.minZ + stand.maxZ) / 2
    const [w, d] = [stand.maxX - stand.minX, stand.maxZ - stand.minZ]
    box(x, stand.bottom, z, w, 0.25, d, '#9a6a3a')
    for (const side of [-1, 1])
      if (w > d) box(x + side * (w / 2 - 0.15), 0, z, 0.2, stand.bottom, d, '#555')
      else box(x, 0, z + side * (d / 2 - 0.15), w, stand.bottom, 0.2, '#555')
  }
  for (const post of POSTS)
    if (post.r < 0.4) {
      box(post.x, 0, post.z, 0.6, post.top, 0.6, '#8d9094')
      if (!LAMPS.some((lamp) => lamp.x === post.x && lamp.z === post.z))
        box(post.x, post.top - 2.5, post.z, 2.4, 0.15, 0.15, '#6a6d70') // crossarm
    }
  // Shopping street: awnings, signs, planters, vending machines, crates, bakery.
  const awnings = ['#d94a3a', '#3a8a5a', '#e0a030', '#3a6aa8', '#c04a8a', '#7a5a3a']
  for (let x = -28; x < 40; x += 8) {
    box(x, 4.2, -10, 7.4, 0.4, 2.4, awnings[((x + 28) / 8) % awnings.length])
    box(x + 2, 4.2, 10, 7.4, 0.4, 2.4, awnings[((x + 31) / 8) % awnings.length])
    lit.push(
      { x, y: 5.4, z: -9.05, w: 4, h: 1.2, d: 0.1, color: '' },
      { x: x + 2, y: 5.4, z: 9.05, w: 4, h: 1.2, d: 0.1, color: '' }
    )
  }
  const goods = ['#e05a3a', '#f0c040', '#6cbf4a', '#e07aa0', '#8a5ac0', '#f08a30']
  DISPLAYS.forEach((stand, index) => {
    const x = (stand.minX + stand.maxX) / 2
    const z = (stand.minZ + stand.maxZ) / 2
    box(x, stand.bottom, z, stand.maxX - stand.minX, 0.2, stand.maxZ - stand.minZ, '#9a7a5a')
    for (const end of [-1, 1]) box(x + end * 2.8, 0, z, 0.2, stand.bottom, 1, '#7a5a3a')
    for (let k = -2; k <= 2; k++)
      box(x + k * 1.1, stand.bottom + 0.2, z, 0.9, 0.5, 0.9, goods[(index + k + 5) % goods.length])
  })
  for (const x of PLANTERS) {
    box(x, 0.1, 0, 4, 0.8, 2, '#9a7a5a')
    box(x, 0.9, 0, 3.6, 0.5, 1.6, '#e07aa0')
  }
  VENDING.forEach((area, index) =>
    box(
      (area.minX + area.maxX) / 2,
      0.1,
      (area.minZ + area.maxZ) / 2,
      area.maxX - area.minX,
      5.6,
      area.maxZ - area.minZ,
      index % 2 ? '#3a6fd9' : '#d9363e'
    )
  )
  for (const x of [-12, -6]) {
    box(x, 0.1, -12.75, 4, 1.1, 1.5, '#b07a4a')
    box(x, 1.2, -12.75, 3.6, 0.4, 1.2, x === -12 ? '#6cbf4a' : '#f08a30')
  }
  box(BREAD.x, 0.1, BREAD.z + 1, 6, 1.4, 1.4, '#d8b080') // bakery counter
  // Shrine: torii, guardian dogs, lanterns, the hall on its raised floor, the offering box.
  for (const z of [-4.5, 4.5]) box(66, 0, z, 1, 9, 1, '#d9472a')
  box(66, 8.2, 0, 1.2, 0.8, 13, '#2a2420')
  box(66, 6.6, 0, 0.8, 0.6, 11, '#d9472a')
  for (const z of [-5, 5]) box(74, 0, z, 1.6, 0.9, 1.6, '#8a8478') // guardian pedestals (statues: shrineRounds)
  const hall = SHRINE_FLOOR
  const [hx, hz] = [(hall.minX + hall.maxX) / 2, (hall.minZ + hall.maxZ) / 2]
  for (const x of [hall.minX + 0.3, hx, hall.maxX - 0.3])
    for (const z of [hall.minZ + 0.3, hall.maxZ - 0.3]) box(x, 0, z, 0.6, 7, 0.6, '#7a3a26')
  box(hx, hall.bottom, hz, hall.maxX - hall.minX, 0.4, hall.maxZ - hall.minZ, '#8a5a3a')
  box(hx + 1, hall.bottom + 0.4, hz, hall.maxX - hall.minX - 4, 4.6, hall.maxZ - hall.minZ - 2, '#c8a878')
  box(hx, 6.6, hz, hall.maxX - hall.minX + 4, 0.8, hall.maxZ - hall.minZ + 5, '#3a3a40')
  box(hx, 7.4, hz, hall.maxX - hall.minX, 1.4, hall.maxZ - hall.minZ + 2, '#3a3a40')
  box(90, 0, 0, 2, 1.4, 2.4, '#7a4a2a')
  // Grove trees, guardian dogs and stone lanterns are rounded shapes: see shrineRounds.
  for (const bush of map.bushes)
    if (bush.x > 62 && bush.x < 120) box(bush.x, 0, bush.z, bush.r * 1.8, bush.r, bush.r * 1.8, '#4f7a3f', bush.x)
  // Embankment: town-side fence, guard rails on the levee road, the drain's concrete mouth.
  box(118, 0, -30.5, 8, 3.2, 0.4, '#8a8478')
  for (const x of [130.6, 141.4]) box(x, LEVEE, 0, 0.2, 1, 160, '#c8ccd0')
  const mouth = DRAIN_MOUTH
  box(mouth.minX + 0.4, 0, (mouth.minZ + mouth.maxZ) / 2, 0.8, 4, mouth.maxZ - mouth.minZ, '#7a7a74')
  box((mouth.minX + mouth.maxX) / 2, 2.8, (mouth.minZ + mouth.maxZ) / 2 - 1, mouth.maxX - mouth.minX, 1.4, 5, '#8a8a82')
  box(mouth.minX + 1, 0, (mouth.minZ + mouth.maxZ) / 2, 0.4, 2.6, 5, '#121418') // the dark hole
  // Hinata's garden fence on the west edge.
  for (let z = -13; z <= 13; z += 1.3) box(-157.6, 0, z, 0.3, 4.2, 1.1, '#b8946a')
  // Lit windows on the building faces along the lanes and the main road (night layer).
  for (let z = -76; z < 76; z += 9)
    if (Math.abs(z) > 12) lit.push({ x: -31.9, y: 4, z, w: 0.1, h: 1.6, d: 2.4, color: '' })
  for (let z = -70; z < 70; z += 11) lit.push({ x: -72.6, y: 4, z, w: 0.1, h: 1.6, d: 2.4, color: '' })
  for (let x = -150; x < -86; x += 9)
    lit.push(
      { x, y: 4, z: -3.6, w: 2.2, h: 1.4, d: 0.1, color: '' },
      { x: x + 4, y: 4, z: 3.6, w: 2.2, h: 1.4, d: 0.1, color: '' }
    )
  // Lamp heads.
  for (const post of POSTS)
    if (post.r < 0.4) lit.push({ x: post.x, y: post.top - 0.6, z: post.z, w: 1, h: 0.4, d: 1, color: '' })
  return { boxes, lit }
}

/**
 * The ground as 80 m square chunks (same vertices, colours and diagonal as scenery-kit's single mesh), so the
 * camera only draws the chunks in view: the town is long and the whole grid would be ~100k triangles.
 */
function chunkedGround(material: THREE.Material) {
  const { nx, nz, heights } = TERRAIN
  const group = new THREE.Group()
  const color = new THREE.Color()
  const SIZE = 80
  for (let j0 = 0; j0 < nz - 1; j0 += SIZE)
    for (let i0 = 0; i0 < nx - 1; i0 += SIZE) {
      const [i1, j1] = [Math.min(i0 + SIZE, nx - 1), Math.min(j0 + SIZE, nz - 1)]
      const w = i1 - i0 + 1
      const positions: number[] = []
      const colors: number[] = []
      for (let j = j0; j <= j1; j++)
        for (let i = i0; i <= i1; i++) {
          const [x, y, z] = [WORLD.minX + i * CELL, heights[j * nx + i], WORLD.minZ + j * CELL]
          positions.push(x, y, z)
          color.set(colorAt(x, z, y))
          colors.push(color.r, color.g, color.b)
        }
      const indices: number[] = []
      for (let j = 0; j < j1 - j0; j++)
        for (let i = 0; i < i1 - i0; i++) {
          const a = j * w + i
          indices.push(a, a + w + 1, a + 1, a, a + w, a + w + 1)
        }
      const geometry = new THREE.BufferGeometry()
      geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3))
      geometry.setAttribute('color', new THREE.Float32BufferAttribute(colors, 3))
      geometry.setIndex(indices)
      geometry.computeVertexNormals()
      geometry.computeBoundingSphere()
      const mesh = new THREE.Mesh(geometry, material)
      mesh.receiveShadow = true
      group.add(mesh)
    }
  return group
}

const unitBox = new THREE.BoxGeometry(1, 1, 1).translate(0, 0.5, 0)
const boxGeometry = (entry: Box) =>
  unitBox.clone().scale(entry.w, entry.h, entry.d).translate(entry.x, entry.y, entry.z)

/**
 * The shrine's rounded pieces, merged into one mesh per colour: two seated guardian dogs (komainu) facing the
 * approach, stone lanterns and the grove's trees (trunk under lumpy crowns, like the forest's).
 */
function shrineRounds(trees: readonly { x: number; z: number; top: number }[]): THREE.Group {
  const byColor = new Map<string, THREE.BufferGeometry[]>()
  const unit = {
    sphere: new THREE.SphereGeometry(1, 12, 9),
    lump: new THREE.IcosahedronGeometry(1, 1),
    cylinder: new THREE.CylinderGeometry(1, 1, 1, 12),
    cone: new THREE.ConeGeometry(1, 1, 4),
    torus: new THREE.TorusGeometry(1, 0.35, 8, 16)
  }
  const add = (
    color: string,
    shape: keyof typeof unit,
    [x, y, z]: number[],
    [sx, sy, sz]: number[],
    [rx, ry, rz]: number[] = [0, 0, 0],
    frame?: THREE.Matrix4
  ) => {
    const matrix = new THREE.Matrix4().compose(
      new THREE.Vector3(x, y, z),
      new THREE.Quaternion().setFromEuler(new THREE.Euler(rx, ry, rz)),
      new THREE.Vector3(sx, sy, sz)
    )
    if (frame) matrix.premultiply(frame)
    const geometry = unit[shape].toNonIndexed().applyMatrix4(matrix)
    const list = byColor.get(color)
    if (list) list.push(geometry)
    else byColor.set(color, [geometry])
  }
  const stone = '#a8a296'
  const shade = '#8f897e'
  for (const side of [-1, 1]) {
    // Seated on the pedestal (top 0.9), facing the torii to the west (−x), heads turned slightly to the path.
    const frame = new THREE.Matrix4().compose(
      new THREE.Vector3(74, 0.9, side * 5),
      new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), -Math.PI / 2 - side * 0.35),
      new THREE.Vector3(1, 1, 1)
    )
    add(stone, 'sphere', [0, 0.7, -0.1], [0.5, 0.65, 0.6], [0, 0, 0], frame) // body
    add(stone, 'sphere', [0, 0.85, 0.3], [0.42, 0.55, 0.36], [0, 0, 0], frame) // chest
    for (const leg of [-1, 1]) {
      add(stone, 'cylinder', [leg * 0.22, 0.35, 0.42], [0.12, 0.7, 0.12], [0, 0, 0], frame) // front legs
      add(stone, 'sphere', [leg * 0.22, 0.05, 0.5], [0.16, 0.1, 0.2], [0, 0, 0], frame)
      add(stone, 'sphere', [leg * 0.32, 0.3, -0.35], [0.22, 0.28, 0.32], [0, 0, 0], frame) // haunches
    }
    add(shade, 'torus', [0, 1.45, 0.25], [0.42, 0.42, 0.42], [Math.PI / 2 - 0.3, 0, 0], frame) // curly mane
    add(stone, 'sphere', [0, 1.55, 0.35], [0.4, 0.38, 0.38], [0, 0, 0], frame) // head
    add(stone, 'sphere', [0, 1.45, 0.68], [0.24, 0.18, 0.18], [0, 0, 0], frame) // muzzle
    add('#3a3632', 'sphere', [0, 1.5, 0.84], [0.06, 0.05, 0.04], [0, 0, 0], frame) // nose
    for (const eye of [-1, 1]) {
      add('#3a3632', 'sphere', [eye * 0.16, 1.66, 0.66], [0.06, 0.07, 0.04], [0, 0, 0], frame)
      add(shade, 'sphere', [eye * 0.3, 1.78, 0.25], [0.12, 0.16, 0.08], [0, 0, eye * 0.4], frame) // ears
    }
    for (let curl = 0; curl < 3; curl++)
      add(shade, 'sphere', [0, 1.0 + curl * 0.22, -0.65 - curl * 0.05], [0.2, 0.18, 0.18], [0, 0, 0], frame) // tail
  }
  for (const z of [-4, 4]) {
    // Stone lanterns: base, post, fire box with a warm window, a wide roof and a knob.
    add(shade, 'cylinder', [82, 0.2, z], [0.55, 0.4, 0.55])
    add(stone, 'cylinder', [82, 1.2, z], [0.22, 1.6, 0.22])
    add(stone, 'cylinder', [82, 2.1, z], [0.6, 0.2, 0.6])
    add(stone, 'cylinder', [82, 2.55, z], [0.45, 0.7, 0.45])
    add('#f2c66a', 'cylinder', [82, 2.55, z], [0.46, 0.3, 0.2])
    add(stone, 'cone', [82, 3.2, z], [0.95, 0.6, 0.95], [0, Math.PI / 4, 0])
    add(stone, 'sphere', [82, 3.6, z], [0.16, 0.2, 0.16])
  }
  for (const tree of trees) {
    add('#6a4a32', 'cylinder', [tree.x, (tree.top - 3) / 2, tree.z], [0.45, tree.top - 3, 0.45])
    add('#3f6a3a', 'lump', [tree.x, tree.top - 3.5, tree.z], [3, 2.2, 3], [0, tree.x, 0])
    add('#4a7a40', 'lump', [tree.x + 0.8, tree.top - 1.6, tree.z - 0.5], [2.2, 1.8, 2.2], [0, tree.z, 0])
    add('#557f45', 'lump', [tree.x - 1, tree.top - 2.2, tree.z + 0.8], [1.8, 1.5, 1.8], [0, tree.x + tree.z, 0])
  }
  const group = new THREE.Group()
  for (const [color, parts] of byColor) {
    const mesh = new THREE.Mesh(
      mergeGeometries(parts),
      new THREE.MeshStandardMaterial({ color, roughness: 0.9, flatShading: true })
    )
    parts.forEach((part) => part.dispose())
    mesh.castShadow = mesh.receiveShadow = true
    group.add(mesh)
  }
  Object.values(unit).forEach((geometry) => geometry.dispose())
  return group
}

export function scenery(scene: THREE.Scene): Scenery {
  const { boxes, lit } = props()
  // Night layers, all driven by LOOK.night.
  const glow = new THREE.MeshStandardMaterial({ color: '#4a4030', emissive: '#ffd58a', emissiveIntensity: 0 })
  const parts = lit.map(boxGeometry)
  const windows = new THREE.Mesh(mergeGeometries(parts), glow)
  parts.forEach((part) => part.dispose())
  const poolMaterial = new THREE.MeshBasicMaterial({
    color: '#ffe2a0',
    transparent: true,
    opacity: 0,
    depthWrite: false
  })
  const disc = new THREE.CircleGeometry(4.5, 20).rotateX(-Math.PI / 2)
  const pools = new THREE.InstancedMesh(disc, poolMaterial, LAMPS.length)
  LAMPS.forEach((lamp, index) => pools.setMatrixAt(index, new THREE.Matrix4().makeTranslation(lamp.x, 0.05, lamp.z)))
  const beamMaterial = new THREE.MeshBasicMaterial({
    color: '#fff2c0',
    transparent: true,
    opacity: 0,
    depthWrite: false
  })
  // A flat wedge of light ahead of each car, pointing +z like the car models.
  const beam = new THREE.ConeGeometry(3.2, 14, 12, 1, true)
    .rotateX(Math.PI / 2)
    .translate(0, 1.6, 15)
    .scale(1, 0.35, 1)
  const carCount = LANES.reduce((sum, lane) => sum + lane.cars.length, 0)
  const beams = new THREE.InstancedMesh(beam, beamMaterial, carCount)
  const transform = new THREE.Matrix4()
  // The rusty grate: bars across the mouth until its gate bit opens.
  const bars: THREE.BufferGeometry[] = []
  for (let z = GRATE.az + 0.4; z < GRATE.bz; z += 0.55)
    bars.push(boxGeometry({ x: GRATE.ax, y: 0, z, w: 0.14, h: 2.6, d: 0.14, color: '' }))
  for (const y of [0.8, 2])
    bars.push(
      boxGeometry({ x: GRATE.ax, y, z: (GRATE.az + GRATE.bz) / 2, w: 0.16, h: 0.16, d: GRATE.bz - GRATE.az, color: '' })
    )
  const grate = new THREE.Mesh(
    mergeGeometries(bars),
    new THREE.MeshStandardMaterial({ color: '#6a4a36', roughness: 0.6, metalness: 0.4 })
  )
  bars.forEach((bar) => bar.dispose())
  const view = buildScenery(scene, {
    colorAt,
    boxes,
    water: [{ minX: 155.5, maxX: 160, minZ: WORLD.minZ, maxZ: WORLD.maxZ }],
    update(state: SceneryState) {
      grate.visible = !((state.open ?? 0) & 1)
      const night = LOOK.night!(state)
      glow.emissiveIntensity = Math.max(0, night - 0.1) * 2.4
      poolMaterial.opacity = Math.max(0, night - 0.3) * 0.45
      beamMaterial.opacity = Math.max(0, night - 0.35) * 0.35
      beams.visible = pools.visible = night > 0.35
      if (!beams.visible) return
      vehiclesAt(state.time).forEach((vehicle, index) => {
        if (index >= carCount) return
        transform.makeRotationY(vehicle.angle).setPosition(vehicle.x, 0, vehicle.z)
        beams.setMatrixAt(index, transform)
      })
      beams.instanceMatrix.needsUpdate = true
    }
  })
  // Swap the kit's one-piece ground for culled chunks.
  const whole = view.root.getObjectByName('terrain') as THREE.Mesh
  const ground = chunkedGround(whole.material as THREE.Material)
  ground.name = 'terrain'
  whole.removeFromParent()
  whole.geometry.dispose()
  view.root.add(ground)
  const rounds = shrineRounds(buildMap().trees)
  view.root.add(windows, pools, beams, grate, rounds)
  return {
    update: view.update,
    dispose() {
      for (const object of [
        windows,
        pools,
        beams,
        grate,
        ...(ground.children as THREE.Mesh[]),
        ...(rounds.children as THREE.Mesh[])
      ])
        object.geometry.dispose()
      for (const mesh of rounds.children as THREE.Mesh[]) (mesh.material as THREE.Material).dispose()
      for (const material of [glow, poolMaterial, beamMaterial, grate.material]) material.dispose()
      view.dispose()
    }
  }
}
