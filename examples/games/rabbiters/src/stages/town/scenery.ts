// Chapter 2 scenery: the height grid (roofs, walls, levee) coloured by area, every prop baked into one mesh per
// finish (see Kit), plus three night layers that brighten as the evening goes: lit windows and lamp heads (emissive, merged),
// pools of light under the streetlights, and headlight beams that follow the cars (one InstancedMesh).
import * as THREE from 'three'
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js'
import { CELL, LANES, TERRAIN, heightAt, vehiclesAt } from '../../map'
import { buildCar } from '../../models'
import type { Scenery, SceneryState, StageLook } from '../../story'
import { Kit, buildScenery, gableRoof } from '../scenery-kit'
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

type V3 = [number, number, number]
/** A night-layer box: y is its bottom. */
type Lit = { x: number; y: number; z: number; w: number; h: number; d: number }

/** Every static prop, built with the kit and baked by the caller; returns the night layer's lit boxes. */
function props(kit: Kit, statics: THREE.Group): Lit[] {
  const lit: Lit[] = []
  const part = (
    shape: Parameters<Kit['add']>[1],
    color: string,
    position: V3,
    size: V3,
    rotation: V3 = [0, 0, 0],
    parent: THREE.Object3D = statics
  ) => kit.add(parent, shape, color, position, size, rotation)
  // Boxes by their bottom (y), optionally turned or bevelled.
  const box = (
    x: number,
    y: number,
    z: number,
    w: number,
    h: number,
    d: number,
    color: string,
    turn = 0,
    shape: 'box' | 'soft' = 'box'
  ) => part(shape, color, [x, y + h / 2, z], [w, h, d], [0, turn, 0])
  const place = (x: number, y: number, z: number, turn = 0) => {
    const root = new THREE.Group()
    root.position.set(x, y, z)
    root.rotation.y = turn
    statics.add(root)
    return root
  }
  const map = buildMap()
  // Parked cars: the same model as the traffic (lights off), over a damp patch of shade.
  const paint = ['#d0d4d8', '#7a2a2a', '#2f3a4a', '#e0d6c0']
  PARKED.forEach((area, index) => {
    const x = (area.minX + area.maxX) / 2
    const z = (area.minZ + area.maxZ) / 2
    box(x, 0, z, 6.4, 0.04, 15.4, '#2b2b2b')
    const car = buildCar(paint[index % paint.length])
    car.position.set(x, 0, z)
    car.rotation.y = index % 2 ? Math.PI : 0
    statics.add(car)
  })
  // Road markings: centre line, crosswalks, side street line.
  for (let z = -78; z < 78; z += 8) box(-49, 0.01, z, 0.3, 0.03, 4, '#e8e2c8')
  for (let z = -78; z < 78; z += 8) box(52, 0.01, z, 0.3, 0.03, 4, '#e8e2c8')
  for (let x = -64; x <= -40; x += 2) box(x, 0.01, -2, 1, 0.03, 7, '#e8e8e8')
  for (let x = 44; x <= 60; x += 2) box(x, 0.01, 0, 1, 0.03, 7, '#e8e8e8')
  // Drain grates: a frame with slots.
  for (const z of DRAINS.z)
    for (const x of [DRAINS.west, DRAINS.east]) {
      box(x, 0.28, z, 1.8, 0.06, 1.8, '#3a3c40')
      for (let slot = -0.6; slot <= 0.61; slot += 0.3) box(x + slot, 0.33, z, 0.12, 0.02, 1.5, '#1d1f22')
    }
  // Garbage point: the green net cage (wider than the raised block it stands on, so the two never flicker), and
  // the bags under the blue crow net beside it (the overhang's lid at 1.6).
  const cage = GARBAGE_CAGE
  const [cx, cz] = [(cage.minX + cage.maxX) / 2, (cage.minZ + cage.maxZ) / 2]
  const [cw, cd] = [cage.maxX - cage.minX, cage.maxZ - cage.minZ]
  box(cx, 0, cz, cw + 0.12, 2.66, cd + 0.12, '#3f7a4a')
  for (const sx of [-1, 1])
    for (const sz of [-1, 1]) box(cx + (sx * cw) / 2, 0, cz + (sz * cd) / 2, 0.2, 2.74, 0.2, '#2c5a36')
  for (const sz of [-1, 1]) box(cx, 2.6, cz + (sz * cd) / 2, cw, 0.14, 0.16, '#2c5a36')
  for (let x = cage.minX + 0.5; x < cage.maxX; x += 0.5) box(x, 0.05, cage.maxZ + 0.07, 0.05, 2.55, 0.03, '#62a06c')
  for (let y = 0.45; y < 2.6; y += 0.5) box(cx, y, cage.maxZ + 0.08, cw, 0.05, 0.03, '#62a06c')
  for (const [x, z, s] of [
    [-87.6, -43.5, 0.85],
    [-84, -43.7, 1],
    [-81.5, -43.6, 0.9],
    [-79.6, -43.4, 1.05]
  ]) {
    part('lump', '#e8e4d0', [x, 0.6 * s, z], [0.85 * s, 0.65 * s, 0.7 * s], [0, x, 0])
    part('cone', '#dcd6bf', [x, 1.38 * s, z], [0.18 * s, 0.4 * s, 0.18 * s])
  }
  for (let x = -88.5; x < -79; x += 0.5) box(x, 1.55, -43.5, 0.05, 0.05, 2, '#3a6ab0')
  for (let z = -44.25; z < -42.5; z += 0.5) box(-83.75, 1.55, z, 9.5, 0.05, 0.05, '#3a6ab0')
  // Alley clutter: polybuckets with lids, flowerpots, cardboard (the bushes), bicycles, utility poles.
  for (const [x, z, h, color, lid] of [
    [-120.25, -2.05, 2.2, '#3b6fb6', '#2f5a96'],
    [-109.25, 2.05, 2.2, '#4a8a4a', '#3a6e3a'],
    [-140.05, 20.75, 2.2, '#3b6fb6', '#2f5a96'],
    [-103.05, -19.25, 0.6, '#b0603a', ''],
    [-129.05, 12.75, 0.6, '#b0603a', '']
  ] as const)
    if (lid) {
      part('cylinder', color, [x, 1, z], [0.72, 2, 0.72])
      part('cylinder', lid, [x, 2.1, z], [0.78, 0.2, 0.78])
      part('box', lid, [x, 2.26, z], [0.7, 0.12, 0.14])
    } else {
      part('frustum', color, [x, h / 2, z], [0.75, h, 0.75], [Math.PI, 0, 0])
      part('lump', '#5f8a45', [x, h + 0.3, z], [0.55, 0.45, 0.55])
      part('pebble', '#e07aa0', [x + 0.2, h + 0.65, z + 0.1], [0.16, 0.14, 0.16])
    }
  for (const bush of map.bushes)
    if (bush.x < 113 && !(bush.x > 62 && bush.x < 112)) {
      const r = bush.r
      const low = place(bush.x, 0, bush.z, bush.x * 0.3)
      kit.add(low, 'box', '#b88a55', [0, r * 0.55, 0], [r * 1.3, r * 1.1, r * 1.2])
      kit.add(low, 'box', '#d9c49a', [0, r * 1.1, 0], [r * 1.32, 0.03, 0.3])
      const top = place(bush.x + 0.2, r * 1.1, bush.z - 0.1, bush.z * 0.2)
      kit.add(top, 'box', '#c99a62', [0, r * 0.35, 0], [r * 1.1, r * 0.7, r])
      // Open flaps, hinged on the long top edges and tipped outward.
      for (const side of [-1, 1])
        kit.add(
          top,
          'box',
          '#b88a55',
          [0, r * 0.7 + 0.1, side * (r * 0.5 + 0.18)],
          [r * 1.08, 0.04, r * 0.4],
          [-side * 0.5, 0, 0]
        )
    }
  bicycle(kit, place(-100, 0, 2.2, Math.PI / 2), '#d9d4c8')
  bicycle(kit, place(-146, 0, -12.9, Math.PI / 2 + 0.05), '#3a8ac0')
  for (const stand of STANDS) {
    // Bus-stop bench (slats on a steel frame, with the stop's sign) and the pet-shop stand: a top on two legs.
    const x = (stand.minX + stand.maxX) / 2
    const z = (stand.minZ + stand.maxZ) / 2
    const [w, d] = [stand.maxX - stand.minX, stand.maxZ - stand.minZ]
    const top = heightAt(x, z) + stand.bottom
    if (stand === STANDS[0]) {
      for (const dx of [-0.55, 0, 0.55]) box(x + dx, top, z, 0.45, 0.22, d, '#a8743f', 0, 'soft')
      for (const end of [-1, 1]) {
        for (const dx of [-0.6, 0.6]) box(x + dx, 0, z + end * (d / 2 - 0.6), 0.14, top, 0.14, '#55585c')
        box(x, top - 0.14, z + end * (d / 2 - 0.6), w - 0.1, 0.14, 0.18, '#55585c')
      }
      const [sx, sz] = [x + 0.3, stand.minZ - 0.9]
      part('cylinder', '#9aa0a6', [sx, 3.5, sz], [0.1, 7, 0.1])
      part('cylinder', '#2f6fb3', [sx, 6.7, sz], [0.75, 0.08, 0.75], [0, 0, Math.PI / 2])
      part('cylinder', '#f4f4f0', [sx, 6.7, sz], [0.52, 0.1, 0.52], [0, 0, Math.PI / 2])
      box(sx, 3.6, sz, 0.1, 1.5, 1, '#f4f4f0', 0, 'soft')
    } else {
      box(x, top, z, w, 0.25, d, '#9a6a3a', 0, 'soft')
      for (const side of [-1, 1]) box(x + side * (w / 2 - 0.15), 0, z, 0.2, top, d, '#555')
    }
  }
  for (const post of POSTS)
    if (post.r < 0.4) {
      const lamp = LAMPS.some((entry) => entry.x === post.x && entry.z === post.z)
      const radius = lamp ? 0.2 : 0.3
      part('cylinder', lamp ? '#6a6d70' : '#8d9094', [post.x, post.top / 2, post.z], [radius, post.top, radius])
      if (lamp) part('cylinder', '#4a4d50', [post.x, post.top - 0.1, post.z], [0.75, 0.2, 0.75])
      else {
        box(post.x, post.top - 2.5, post.z, 2.4, 0.15, 0.15, '#6a6d70') // crossarm and insulators
        for (const dx of [-1, 0.25, 1])
          part('cylinder', '#e8e4dc', [post.x + dx, post.top - 2.15, post.z], [0.1, 0.4, 0.1])
        box(post.x, 0, post.z, radius * 2.3, 1.6, radius * 2.3, '#e8c84a') // the yellow guard at its foot
        for (const y of [0.3, 0.9]) box(post.x, y, post.z, radius * 2.36, 0.3, radius * 2.36, '#2b2b2b')
      }
    }
  // Shopping street: striped awnings over the displays, signs, planters, vending machines, crates, bakery.
  const awnings = ['#d94a3a', '#3a8a5a', '#e0a030', '#3a6aa8', '#c04a8a', '#7a5a3a']
  const awning = (x: number, facade: number, color: string) => {
    // A vending machine stands out in the open (it is taller than the awning).
    if (
      VENDING.some((area) => area.minX < x + 3.7 && area.maxX > x - 3.7 && Math.sign(area.minZ) === Math.sign(facade))
    )
      return
    const facing = facade < 0 ? 1 : -1 // toward the street
    const root = place(x, 4.75, facade)
    root.rotation.x = facing * 0.3
    for (let stripe = 0; stripe < 6; stripe++)
      kit.add(
        root,
        'box',
        stripe % 2 ? '#f4efe6' : color,
        [-3.7 + (stripe + 0.5) * (7.4 / 6), 0, facing * 1.4],
        [7.4 / 6, 0.12, 2.8]
      )
    kit.add(root, 'box', color, [0, -0.28, facing * 2.78], [7.4, 0.5, 0.05], [-facing * 0.3, 0, 0])
  }
  for (let x = -28; x < 40; x += 8) {
    awning(x, -9, awnings[((x + 28) / 8) % awnings.length])
    awning(x + 2, 9, awnings[((x + 31) / 8) % awnings.length])
    lit.push({ x, y: 5.4, z: -9.05, w: 4, h: 1.2, d: 0.1 }, { x: x + 2, y: 5.4, z: 9.05, w: 4, h: 1.2, d: 0.1 })
  }
  const goods = ['#e05a3a', '#f0c040', '#6cbf4a', '#e07aa0', '#8a5ac0', '#f08a30']
  DISPLAYS.forEach((stand, index) => {
    // A shelf of shallow crates, each heaped with fruit or vegetables.
    const x = (stand.minX + stand.maxX) / 2
    const z = (stand.minZ + stand.maxZ) / 2
    const top = heightAt(x, z) + stand.bottom
    box(x, top, z, stand.maxX - stand.minX, 0.2, stand.maxZ - stand.minZ, '#9a7a5a')
    for (const end of [-1, 1]) box(x + end * 2.8, 0, z, 0.2, top, 1, '#7a5a3a')
    for (let k = -2; k <= 2; k++) {
      const [gx, color] = [x + k * 1.1, goods[(index + k + 5) % goods.length]]
      box(gx, top + 0.2, z, 0.95, 0.3, 1.1, '#b58a5a')
      part('pebble', color, [gx, top + 0.55, z], [0.42, 0.2, 0.5])
      part('pebble', color, [gx - 0.1, top + 0.72, z + 0.12], [0.2, 0.18, 0.2], [0, k, 0])
    }
  })
  for (const x of PLANTERS) {
    box(x, 0.1, 0, 4, 0.8, 2, '#9a7a5a', 0, 'soft')
    box(x, 0.86, 0, 3.7, 0.06, 1.7, '#5a4030')
    for (let leaf = 0; leaf < 4; leaf++)
      part(
        'pebble',
        leaf % 2 ? '#4f8a3c' : '#5f9e45',
        [x - 1.35 + leaf * 0.9, 1.1, (leaf % 2) - 0.5],
        [0.6, 0.42, 0.55]
      )
    for (let flower = 0; flower < 7; flower++)
      part(
        'pebble',
        ['#e07aa0', '#f2d14b', '#ffffff'][flower % 3],
        [x - 1.6 + flower * 0.53, 1.42, ((flower * 5) % 3) * 0.4 - 0.4],
        [0.2, 0.15, 0.2]
      )
  }
  const cans = ['#d9363e', '#f2c94c', '#3a8a5a', '#f4f4f0', '#2f6fb3', '#8a5a3a']
  VENDING.forEach((area, index) => {
    // Drinks behind the window, buttons under each, the coin panel and the dispenser slot (front toward the street).
    const [w, d] = [area.maxX - area.minX, area.maxZ - area.minZ]
    const z = (area.minZ + area.maxZ) / 2
    const root = place((area.minX + area.maxX) / 2, 0.1, z, z < 0 ? 0 : Math.PI)
    const front = d / 2
    kit.add(root, 'soft', index % 2 ? '#3a6fd9' : '#d9363e', [0, 2.8, 0], [w, 5.6, d])
    kit.add(root, 'box', '#e8eef0', [0, 4.05, front + 0.01], [w - 0.4, 2.3, 0.04])
    for (const [row, y] of [3.2, 3.9, 4.6].entries())
      for (let column = 0; column < 6; column++) {
        const x = -w / 2 + 0.45 + column * ((w - 0.9) / 5)
        kit.add(
          root,
          'cylinder',
          cans[(column + row * 2 + index) % cans.length],
          [x, y + 0.24, front + 0.07],
          [0.13, 0.42, 0.13]
        )
        kit.add(root, 'box', '#3a3d42', [x, y - 0.06, front + 0.05], [0.16, 0.08, 0.05])
      }
    kit.add(root, 'box', '#f4f4f0', [0, 5.35, front + 0.02], [w - 0.3, 0.35, 0.04])
    kit.add(root, 'box', '#c9ccd0', [w / 2 - 0.45, 2.4, front + 0.03], [0.4, 0.9, 0.05])
    kit.add(root, 'box', '#1d1f24', [0, 0.85, front + 0.02], [w - 0.6, 0.55, 0.06])
  })
  // Greengrocer crates: cabbages and oranges.
  for (const [x, color, size] of [
    [-12, '#7ec35a', 0.45],
    [-6, '#f08a30', 0.28]
  ] as const) {
    box(x, 0.1, -12.75, 4, 1.1, 1.5, '#b07a4a', 0, 'soft')
    for (const y of [0.45, 0.8]) box(x, y, -11.99, 3.8, 0.05, 0.03, '#7a5236')
    for (let at = -1.6; at <= 1.61; at += size * 2.1)
      for (const dz of size > 0.3 ? [0] : [-0.3, 0.3])
        part('pebble', color, [x + at, 1.2 + size * 0.7, -12.75 + dz], [size, size * 0.85, size], [0, at, 0])
  }
  // Bakery counter with loaves, a baguette and buns.
  box(BREAD.x, 0.1, BREAD.z + 1, 6, 1.4, 1.4, '#d8b080', 0, 'soft')
  for (const dx of [-2, -1, 0]) box(BREAD.x + dx, 1.5, BREAD.z + 1, 0.8, 0.4, 0.55, '#c98a45', 0.15 * dx, 'soft')
  part('cylinder', '#d9a35a', [BREAD.x + 1.4, 1.62, BREAD.z + 1.1], [0.15, 2.2, 0.15], [0, 0.3, Math.PI / 2])
  for (const [dx, dz] of [
    [2.3, 0.8],
    [2.6, 1.3],
    [2.1, 1.3]
  ])
    part('pebble', '#d9a35a', [BREAD.x + dx, 1.62, BREAD.z + dz], [0.28, 0.18, 0.28])
  // Shrine: the torii, guardian dogs' pedestals, the hall on its raised floor, the offering box.
  for (const z of [-4.5, 4.5]) {
    part('cylinder', '#d9472a', [66, 4.5, z], [0.45, 9, 0.45])
    part('cylinder', '#2a2420', [66, 0.4, z], [0.55, 0.8, 0.55])
  }
  box(66, 6.5, 0, 0.6, 0.55, 11.4, '#d9472a') // nuki
  box(66, 7.05, 0, 0.45, 0.85, 0.45, '#d9472a')
  box(65.7, 7.1, 0, 0.12, 0.75, 0.6, '#2a2420') // the name plaque, toward the approach
  box(66, 7.9, 0, 0.9, 0.5, 11.6, '#d9472a') // shimaki
  box(66, 8.4, 0, 1.2, 0.45, 9, '#2a2420') // kasagi, its ends sweeping up
  for (const side of [-1, 1]) part('box', '#2a2420', [66, 8.78, side * 5.6], [1.2, 0.45, 2.6], [-side * 0.12, 0, 0])
  for (const z of [-5, 5]) box(74, 0, z, 1.6, 0.9, 1.6, '#8a8478', 0, 'soft') // guardian pedestals (see shrineRounds)
  const hall = SHRINE_FLOOR
  const [hx, hz] = [(hall.minX + hall.maxX) / 2, (hall.minZ + hall.maxZ) / 2]
  const [hw, hd] = [hall.maxX - hall.minX, hall.maxZ - hall.minZ]
  for (const x of [hall.minX + 0.3, hx, hall.maxX - 0.3])
    for (const z of [hall.minZ + 0.3, hall.maxZ - 0.3]) part('cylinder', '#7a3a26', [x, 3.4, z], [0.32, 6.8, 0.32])
  box(hx, hall.bottom, hz, hw, 0.4, hd, '#8a5a3a', 0, 'soft')
  box(hx + 1, hall.bottom + 0.4, hz, hw - 4, 4.6, hd - 2, '#c8a878')
  for (let z = -hd / 2 + 1.6; z < hd / 2 - 1.5; z += 0.6) box(hx - hw / 2 + 2.97, 2.3, z, 0.06, 3.9, 0.08, '#6a3a24')
  for (const y of [2.3, 4.25, 6.2]) box(hx - hw / 2 + 2.96, y, hz, 0.08, 0.12, hd - 2.2, '#6a3a24')
  for (const x of [hall.minX, hall.maxX]) box(x, 6.3, hz, 0.6, 0.5, hd + 0.6, '#7a3a26')
  part('gable', '#c8a878', [hx, 6.6, hz], [hw, 2.9, hd])
  gableRoof(kit, statics, '#3a3a40', [hx, 6.6, hz], hw / 2 + 1, 3, hd + 2, 1.2, 0.4)
  box(hx, 9.75, hz, 0.7, 0.5, hd + 4.4, '#2a2a30')
  part('cylinder', '#d8c48a', [hall.minX - 0.3, 6.1, hz], [0.2, 9, 0.2], [Math.PI / 2, 0, 0]) // shimenawa and shide
  for (const z of [-3, 0, 3]) box(hall.minX - 0.3, 5.3, hz + z, 0.05, 0.7, 0.35, '#f8f6ee')
  part('sphere', '#c9a227', [hall.minX - 0.6, 5.6, hz], [0.35, 0.35, 0.35]) // the bell and its rope
  part('cylinder', '#d9472a', [hall.minX - 0.6, 4, hz], [0.06, 3, 0.06])
  box(90, 0, 0, 2, 1.4, 2.4, '#7a4a2a', 0, 'soft') // offering box
  for (let z = -0.9; z <= 0.91; z += 0.3) box(90, 1.4, z, 1.8, 0.04, 0.12, '#3a2414')
  // Grove trees, guardian dogs and stone lanterns are rounded shapes: see shrineRounds.
  for (const bush of map.bushes)
    if (bush.x > 62 && bush.x < 120)
      for (let lump = 0; lump < 3; lump++) {
        const angle = lump * 2.1 + bush.x
        part(
          'lump',
          ['#4f7a3f', '#5a8a48', '#466e38'][lump],
          [
            bush.x + Math.cos(angle) * bush.r * 0.4,
            bush.r * (0.5 + lump * 0.12),
            bush.z + Math.sin(angle) * bush.r * 0.4
          ],
          [bush.r * 0.75, bush.r * 0.6, bush.r * 0.75],
          [0, angle, 0]
        )
      }
  // Embankment: the town-side block wall, guard rails on posts along the levee road, the drain's concrete mouth.
  box(118, 0, -30.5, 8, 3.2, 0.4, '#8a8478', 0, 'soft')
  for (const x of [130.6, 141.4]) {
    box(x, LEVEE + 0.5, 0, 0.12, 0.35, 160, '#d8dce0')
    for (let z = -78; z <= 78; z += 4) box(x, LEVEE, z, 0.16, 0.95, 0.16, '#9aa0a6')
  }
  const mouth = DRAIN_MOUTH
  box(mouth.minX + 0.4, 0, (mouth.minZ + mouth.maxZ) / 2, 0.8, 4, mouth.maxZ - mouth.minZ, '#7a7a74')
  box((mouth.minX + mouth.maxX) / 2, 2.8, (mouth.minZ + mouth.maxZ) / 2 - 1, mouth.maxX - mouth.minX, 1.4, 5, '#8a8a82')
  box(mouth.minX + 1, 0, (mouth.minZ + mouth.maxZ) / 2, 0.4, 2.6, 5, '#121418') // the dark hole
  // Hinata's garden fence on the west edge.
  for (let z = -13; z <= 13; z += 1.3) box(-157.6, 0, z, 0.3, 4.2, 1.1, '#b8946a')
  // Lit windows on the building faces along the lanes and the main road (night layer).
  for (let z = -76; z < 76; z += 9) if (Math.abs(z) > 12) lit.push({ x: -31.9, y: 4, z, w: 0.1, h: 1.6, d: 2.4 })
  for (let z = -70; z < 70; z += 11) lit.push({ x: -72.6, y: 4, z, w: 0.1, h: 1.6, d: 2.4 })
  for (let x = -150; x < -86; x += 9)
    lit.push({ x, y: 4, z: -3.6, w: 2.2, h: 1.4, d: 0.1 }, { x: x + 4, y: 4, z: 3.6, w: 2.2, h: 1.4, d: 0.1 })
  // Lamp heads.
  for (const post of POSTS) if (post.r < 0.4) lit.push({ x: post.x, y: post.top - 0.6, z: post.z, w: 1, h: 0.4, d: 1 })
  shrineRounds(kit, statics, map.trees)
  return lit
}

/** A shopping bicycle with a front basket, along its group's z (kickstand down). */
function bicycle(kit: Kit, root: THREE.Group, color: string) {
  const tube = ([ax, ay, az]: V3, [bx, by, bz]: V3, radius = 0.07, paint = color) => {
    const length = Math.hypot(bx - ax, by - ay, bz - az)
    const mesh = kit.add(
      root,
      'cylinder',
      paint,
      [(ax + bx) / 2, (ay + by) / 2, (az + bz) / 2],
      [radius, length, radius]
    )
    mesh.quaternion.setFromUnitVectors(
      new THREE.Vector3(0, 1, 0),
      new THREE.Vector3(bx - ax, by - ay, bz - az).normalize()
    )
  }
  for (const end of [-1, 1]) {
    kit.add(root, 'ring', '#2b2b2b', [0, 1.1, end * 1.9], [1.05, 1.05, 1.4], [0, Math.PI / 2, 0])
    kit.add(root, 'cylinder', '#9aa0a6', [0, 1.1, end * 1.9], [0.1, 0.24, 0.1], [0, 0, Math.PI / 2])
  }
  tube([0, 1.0, -0.2], [0, 2.6, -0.75]) // seat tube
  tube([0, 1.0, -0.2], [0, 2.5, 1.45]) // down tube
  tube([0, 1.0, -0.2], [0, 1.1, -1.9], 0.05) // chain stay
  tube([0, 2.5, -0.65], [0, 1.1, -1.9], 0.05) // seat stay
  tube([0, 1.1, 1.9], [0, 2.9, 1.3], 0.06) // fork and stem
  tube([-0.8, 3.0, 1.2], [0.8, 3.0, 1.2], 0.05, '#2b2b2b') // handlebar
  kit.add(root, 'soft', '#2b2b2b', [0, 2.75, -0.8], [0.45, 0.2, 0.9])
  kit.add(root, 'soft', '#c9ccd0', [0, 2.5, 2.25], [1.1, 0.75, 0.9]) // basket
  kit.add(root, 'cylinder', '#7a7d80', [0.25, 0.9, -0.3], [0.07, 0.25, 0.07])
  kit.add(root, 'box', '#55585c', [0.35, 0.5, -0.4], [0.05, 1.0, 0.05], [0.3, 0, 0.2]) // kickstand
}

/**
 * The shrine's rounded pieces: two seated guardian dogs (komainu) facing the approach, stone lanterns and the
 * grove's trees (trunk under lumpy crowns, like the forest's).
 */
function shrineRounds(kit: Kit, statics: THREE.Group, trees: readonly { x: number; z: number; top: number }[]) {
  const add = (
    color: string,
    shape: 'sphere' | 'lump' | 'cylinder' | 'pyramid' | 'torus',
    position: V3,
    size: V3,
    rotation: V3 = [0, 0, 0],
    parent: THREE.Object3D = statics
  ) => kit.add(parent, shape, color, position, size, rotation)
  const stone = '#a8a296'
  const shade = '#8f897e'
  for (const side of [-1, 1]) {
    // Seated on the pedestal (top 0.9), facing the torii to the west (−x), heads turned slightly to the path.
    const frame = new THREE.Group()
    frame.position.set(74, 0.9, side * 5)
    frame.rotation.y = -Math.PI / 2 - side * 0.35
    statics.add(frame)
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
    add(stone, 'pyramid', [82, 3.2, z], [0.95, 0.6, 0.95], [0, Math.PI / 4, 0])
    add(stone, 'sphere', [82, 3.6, z], [0.16, 0.2, 0.16])
  }
  for (const tree of trees) {
    add('#6a4a32', 'cylinder', [tree.x, (tree.top - 3) / 2, tree.z], [0.45, tree.top - 3, 0.45])
    add('#3f6a3a', 'lump', [tree.x, tree.top - 3.5, tree.z], [3, 2.2, 3], [0, tree.x, 0])
    add('#4a7a40', 'lump', [tree.x + 0.8, tree.top - 1.6, tree.z - 0.5], [2.2, 1.8, 2.2], [0, tree.z, 0])
    add('#557f45', 'lump', [tree.x - 1, tree.top - 2.2, tree.z + 0.8], [1.8, 1.5, 1.8], [0, tree.x + tree.z, 0])
  }
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
const boxGeometry = (entry: Lit) =>
  unitBox.clone().scale(entry.w, entry.h, entry.d).translate(entry.x, entry.y, entry.z)

export function scenery(scene: THREE.Scene): Scenery {
  const kit = new Kit()
  const statics = new THREE.Group()
  const lit = props(kit, statics)
  // Bake per 40 m square, so the camera and the sun's shadow box cull the props out of their view.
  const cells = new Map<string, THREE.Group>()
  for (const child of [...statics.children]) {
    const key = `${Math.floor(child.position.x / 40)}:${Math.floor(child.position.z / 40)}`
    let cell = cells.get(key)
    if (!cell) cells.set(key, (cell = new THREE.Group()))
    cell.add(child)
  }
  const baked = new THREE.Group()
  for (const cell of cells.values()) baked.add(...kit.bake(cell).children)
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
    bars.push(boxGeometry({ x: GRATE.ax, y: 0, z, w: 0.14, h: 2.6, d: 0.14 }))
  for (const y of [0.8, 2])
    bars.push(boxGeometry({ x: GRATE.ax, y, z: (GRATE.az + GRATE.bz) / 2, w: 0.16, h: 0.16, d: GRATE.bz - GRATE.az }))
  const grate = new THREE.Mesh(
    mergeGeometries(bars),
    new THREE.MeshStandardMaterial({ color: '#6a4a36', roughness: 0.6, metalness: 0.4 })
  )
  bars.forEach((bar) => bar.dispose())
  const view = buildScenery(scene, {
    colorAt,
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
  view.root.add(windows, pools, beams, grate, baked)
  return {
    update: view.update,
    dispose() {
      for (const object of [
        windows,
        pools,
        beams,
        grate,
        ...(ground.children as THREE.Mesh[]),
        ...(baked.children as THREE.Mesh[])
      ])
        object.geometry.dispose()
      for (const material of [glow, poolMaterial, beamMaterial, grate.material]) material.dispose()
      kit.dispose()
      view.dispose()
    }
  }
}
