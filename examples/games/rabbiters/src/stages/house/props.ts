// Rabbit-scale house props, adapted from the lead's prototypes (/tmp/rabbiters-models/props.ts). Builders add
// shared unit shapes to a group; the scenery then bakes every static mesh into one mesh per finish (see Kit), so
// the whole house costs a few draw calls. Furniture that fades while a rabbit is underneath takes its material,
// and its trim shares that material's tag.
import * as THREE from 'three'
import { gableRoof, type Kit } from '../scenery-kit'

type Paint = THREE.MeshStandardMaterial

const group = (x = 0, z = 0, turn = 0) => {
  const root = new THREE.Group()
  root.position.set(x, 0, z)
  root.rotation.y = turn
  return root
}
/** Another colour in `paint`'s finish (so it fades with it). */
const tone = (kit: Kit, paint: Paint, color: string) =>
  kit.material(color, { tag: paint.name, roughness: paint.roughness })
const brass = (kit: Kit) => kit.material('#c9a227', { metal: 0.7, roughness: 0.3 })
const steel = (kit: Kit) => kit.material('#aeb6bd', { metal: 0.8, roughness: 0.25 })

/** Wire walls and tray of the 6×4 cage (the door is separate so it can swing). */
export function petCage(kit: Kit, x: number, z: number) {
  const root = group(x, z)
  const wire = kit.material('#d9dde2', { metal: 0.6, roughness: 0.35 })
  // A thin tray and bedding, flush with the floor the rabbit walks on (floors stay solid in the see-through cut).
  kit.add(root, 'box', '#e6c9a0', [0, 0.03, 0], [6.6, 0.06, 4.6])
  kit.add(root, 'box', '#f3e6c8', [0, 0.07, 0], [6, 0.02, 4])
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
  kit.add(root, 'frustum', '#8fb6d9', [-2, 0.25, 1.4], [0.6, 0.35, 0.45], [Math.PI, 0, 0]) // pellet bowl
  kit.add(root, 'cylinder', '#c4e3f2', [2.8, 1.8, 1.9], [0.25, 1.2, 0.25]) // water bottle
  kit.add(root, 'cylinder', wire, [2.8, 1.1, 1.9], [0.06, 0.4, 0.06])
  // Wooden hut with a round doorway and a pitched roof.
  kit.add(root, 'soft', '#c7955c', [2, 0.58, 1.1], [1.6, 1.0, 1.4])
  kit.add(root, 'gable', '#c7955c', [2, 1.08, 1.1], [1.6, 0.45, 1.4])
  gableRoof(kit, root, '#a5733f', [2, 1.08, 1.1], 0.8, 0.45, 1.4, 0.12, 0.08)
  kit.add(root, 'cylinder', '#5a3a22', [2, 0.48, 0.39], [0.35, 0.02, 0.35], [Math.PI / 2, 0, 0])
  return root
}

export function cageDoor(kit: Kit) {
  const door = new THREE.Group()
  const wire = kit.material('#d9dde2', { metal: 0.6, roughness: 0.35 })
  for (let px = 0; px <= 2.51; px += 0.5) kit.add(door, 'box', wire, [px, 1.6, 0], [0.06, 3.1, 0.06])
  for (const y of [0.4, 1.8, 3.1]) kit.add(door, 'box', wire, [1.25, y, 0], [2.5, 0.07, 0.07])
  kit.add(door, 'box', brass(kit), [2.4, 1.8, -0.1], [0.3, 0.45, 0.14])
  return door
}

export function birdcage(kit: Kit, x: number, z: number) {
  const root = group(x, z)
  const wire = kit.material('#e8d8a8', { metal: 0.7, roughness: 0.3 })
  kit.add(root, 'soft', '#9a7650', [0, 1.5, 0], [1, 3, 1])
  kit.add(root, 'cylinder', wire, [0, 3.05, 0], [1.1, 0.1, 1.1])
  for (let index = 0; index < 12; index++) {
    const angle = (index / 12) * Math.PI * 2
    kit.add(root, 'cylinder', wire, [Math.cos(angle) * 1.05, 3.9, Math.sin(angle) * 1.05], [0.03, 1.7, 0.03])
  }
  kit.add(root, 'sphere', wire, [0, 4.75, 0], [1.08, 0.5, 1.08])
  kit.add(root, 'box', '#e88f6a', [0.7, 3.25, 0.5], [0.35, 0.25, 0.3])
  return root
}

/** Sofa over the crawl space, facing +z: seat 2.1, back 3.7; the base starts at the overhang's 0.9. */
export function sofa(kit: Kit, x: number, z: number, length: number, depth: number, frame: Paint) {
  const root = group(x, z)
  const cushion = tone(kit, frame, '#8b9fc0')
  kit.add(root, 'soft', frame, [0, 1.25, 0.2], [length - 1, 0.7, depth - 0.8])
  kit.add(root, 'soft', frame, [0, 2.6, -depth / 2 + 0.6], [length - 1, 2.2, 1.2])
  for (const side of [-1, 1])
    kit.add(root, 'soft', frame, [side * (length / 2 - 0.6), 1.85, 0.05], [1.2, 1.9, depth - 0.3])
  const seat = (length - 2.4) / 3
  for (let index = -1; index <= 1; index++) {
    kit.add(root, 'soft', cushion, [index * (seat + 0.04), 1.85, 0.45], [seat, 0.55, depth - 1.5])
    kit.add(root, 'soft', cushion, [index * (seat + 0.04), 2.8, -depth / 2 + 1.4], [seat, 1.5, 0.6], [-0.12, 0, 0])
  }
  for (const sx of [-1, 1])
    for (const sz of [-1, 1])
      kit.add(
        root,
        'frustum',
        tone(kit, frame, '#5a4030'),
        [sx * (length / 2 - 1), 0.45, sz * (depth / 2 - 0.6)],
        [0.2, 0.9, 0.2],
        [Math.PI, 0, 0]
      )
  kit.add(
    root,
    'soft',
    tone(kit, frame, '#f2c94c'),
    [-length / 4, 2.6, -depth / 2 + 1.9],
    [1.6, 1.4, 0.5],
    [-0.3, 0.2, 0.05]
  )
  return root
}

/** Table with four legs and its top at `top`; tall ones get an apron (low ones keep the crawl space clear). */
export function table(kit: Kit, x: number, z: number, width: number, depth: number, top: number, wood: Paint) {
  const root = group(x, z)
  kit.add(root, 'soft', wood, [0, top + 0.15, 0], [width, 0.3, depth])
  for (const sx of [-1, 1])
    for (const sz of [-1, 1])
      kit.add(root, 'box', wood, [sx * (width / 2 - 0.45), top / 2, sz * (depth / 2 - 0.45)], [0.35, top, 0.35])
  if (top > 2)
    for (const sz of [-1, 1])
      kit.add(root, 'box', wood, [0, top - 0.15, sz * (depth / 2 - 0.45)], [width - 1.1, 0.3, 0.12])
  return root
}

export function chair(kit: Kit, x: number, z: number, turn: number, wood: Paint) {
  const root = group(x, z, turn)
  kit.add(root, 'soft', wood, [0, 1.55, 0], [1.9, 0.2, 1.9])
  kit.add(root, 'soft', tone(kit, wood, '#e9d8b4'), [0, 1.72, 0.05], [1.7, 0.16, 1.7])
  for (const sx of [-1, 1]) {
    kit.add(root, 'box', wood, [sx * 0.8, 2.55, -0.85], [0.2, 1.8, 0.2])
    for (const sz of [-1, 1]) kit.add(root, 'box', wood, [sx * 0.8, 0.75, sz * 0.8], [0.2, 1.5, 0.2])
  }
  kit.add(root, 'soft', wood, [0, 3.2, -0.85], [1.9, 0.5, 0.22])
  kit.add(root, 'box', wood, [0, 2.45, -0.85], [1.4, 0.16, 0.12])
  return root
}

/** TV board (top 2, as the height grid) facing +x, with the TV on a stand. */
export function tvSet(kit: Kit, x: number, z: number, width: number, length: number) {
  const root = group(x, z)
  kit.add(root, 'soft', '#6b4a32', [0, 1.1, 0], [width, 1.8, length])
  for (const sx of [-1, 1])
    for (const sz of [-1, 1])
      kit.add(root, 'box', '#4a3322', [sx * (width / 2 - 0.3), 0.1, sz * (length / 2 - 0.3)], [0.3, 0.2, 0.3])
  for (const sz of [-1, 1]) {
    kit.add(root, 'box', '#7d5a3e', [width / 2 + 0.02, 1.1, (sz * length) / 4], [0.06, 1.3, length / 2 - 0.5])
    kit.add(root, 'box', brass(kit), [width / 2 + 0.08, 1.45, (sz * length) / 4], [0.08, 0.12, 0.9])
  }
  kit.add(root, 'soft', '#2a2c31', [-0.2, 2.06, 0], [1.4, 0.12, 3])
  kit.add(root, 'box', '#2a2c31', [-0.35, 2.3, 0], [0.25, 0.5, 0.6])
  kit.add(root, 'soft', '#1d1f24', [-0.35, 4.0, 0], [0.3, 3.1, length - 1.6])
  kit.add(root, 'box', '#5a87b8', [-0.18, 4.0, 0], [0.04, 2.8, length - 2.1])
  kit.add(root, 'box', '#7aa6d0', [-0.155, 4.6, -length / 6], [0.02, 1.2, 0.5], [0.6, 0, 0]) // glare
  return root
}

/** Sideboard against a wall, doors facing +x, a fruit bowl on top. Not in the height grid (rabbits pass by). */
export function sideboard(kit: Kit, x: number, z: number, width: number, length: number, height: number) {
  const root = group(x, z)
  kit.add(root, 'soft', '#8a5a36', [0, height / 2 + 0.1, 0], [width, height - 0.2, length])
  kit.add(root, 'box', '#5a3a24', [0, 0.1, 0], [width - 0.2, 0.2, length - 0.3])
  for (const index of [-1, 0, 1]) {
    kit.add(
      root,
      'box',
      '#9a6a44',
      [width / 2 + 0.02, height / 2, (index * length) / 3],
      [0.05, height - 0.9, length / 3 - 0.3]
    )
    kit.add(
      root,
      'sphere',
      brass(kit),
      [width / 2 + 0.1, height / 2 + 0.4, (index * length) / 3 + length / 6 - 0.5],
      [0.09, 0.09, 0.09]
    )
  }
  kit.add(root, 'frustum', '#ece6da', [0, height + 0.2, 1.5], [0.5, 0.4, 0.5], [Math.PI, 0, 0])
  for (const [dz, dy, color] of [
    [-0.15, 0.45, '#e8732a'],
    [0.2, 0.45, '#d9363e'],
    [0.05, 0.65, '#f2c94c']
  ] as const)
    kit.add(root, 'pebble', color, [0, height + dy, 1.5 + dz], [0.22, 0.22, 0.22])
  kit.add(root, 'soft', '#d8c8a8', [-0.1, height + 0.55, -1.8], [0.12, 1.1, 0.9], [0, 0, 0.12]) // a photo frame
  kit.add(root, 'box', '#7fa7d9', [-0.03, height + 0.55, -1.8], [0.02, 0.8, 0.6], [0, 0, 0.12])
  return root
}

export function fridge(kit: Kit, x: number, z: number) {
  const root = group(x, z)
  kit.add(root, 'soft', '#eef1f2', [0, 3.1, 0], [3.2, 6.2, 2.4])
  for (const y of [2.1, 4.2]) kit.add(root, 'box', '#c9cfd3', [0, y, 1.2], [3.1, 0.06, 0.04])
  kit.add(root, 'box', '#9aa3a8', [1.35, 5.0, 1.25], [0.12, 1.2, 0.1])
  for (const y of [1.85, 3.95]) kit.add(root, 'box', '#9aa3a8', [0, y, 1.25], [1.6, 0.1, 0.1])
  kit.add(root, 'box', '#3a3d42', [0, 0.06, 1.1], [3, 0.12, 0.1]) // vent
  kit.add(root, 'box', '#e45d5d', [-0.6, 5.3, 1.22], [0.35, 0.35, 0.05])
  kit.add(root, 'box', '#5aa9e6', [0.7, 3.4, 1.22], [0.3, 0.3, 0.05])
  kit.add(root, 'box', '#ffffff', [-0.2, 4.9, 1.22], [0.8, 1.0, 0.03]) // a drawing by Hinata
  kit.add(root, 'pebble', '#f2c94c', [-0.25, 5.05, 1.24], [0.16, 0.16, 0.02])
  kit.add(root, 'box', '#6cbf4a', [-0.2, 4.55, 1.24], [0.6, 0.12, 0.02])
  return root
}

/** Counter run along z (against the east wall), sink at `sinkZ`, a pot on the stove. */
export function counter(kit: Kit, x: number, z: number, length: number, sinkZ: number) {
  const root = group(x, z, Math.PI / 2)
  const metal = steel(kit)
  kit.add(root, 'soft', '#f4efe6', [0, 1.6, 0.05], [length, 3.0, 2.3])
  kit.add(root, 'box', '#c9c3b9', [0, 3.15, 0], [length + 0.1, 0.12, 2.5])
  kit.add(root, 'box', '#8a8278', [0, 0.1, -1.05], [length - 0.2, 0.2, 0.1]) // toe kick
  for (let px = -length / 2 + 1.5; px < length / 2; px += 3) {
    kit.add(root, 'box', '#d7d0c4', [px, 1.7, -1.13], [2.7, 2.6, 0.04])
    kit.add(root, 'box', metal, [px, 2.75, -1.19], [1.2, 0.08, 0.08])
  }
  const sink = -(sinkZ - z)
  kit.add(root, 'box', metal, [sink, 3.2, 0], [2.6, 0.06, 1.6])
  kit.add(root, 'box', '#6f777e', [sink, 3.235, -0.05], [2.2, 0.02, 1.2])
  kit.add(root, 'cylinder', metal, [sink, 3.8, 0.9], [0.08, 1.2, 0.08])
  kit.add(root, 'cylinder', metal, [sink, 4.35, 0.62], [0.07, 0.6, 0.07], [Math.PI / 2, 0, 0])
  for (const px of [sink + 5, sink + 6.2])
    kit.add(root, 'torus', '#2b2b2b', [px, 3.25, 0], [0.4, 0.4, 0.4], [Math.PI / 2, 0, 0])
  kit.add(root, 'cylinder', metal, [sink + 5, 3.65, 0], [0.55, 0.7, 0.55])
  kit.add(root, 'cylinder', '#8a939a', [sink + 5, 4.03, 0], [0.57, 0.06, 0.57])
  kit.add(root, 'sphere', '#2b2b2b', [sink + 5, 4.1, 0], [0.1, 0.08, 0.1])
  kit.add(root, 'box', '#2b2b2b', [sink + 5.75, 3.85, 0], [0.5, 0.08, 0.12])
  kit.add(root, 'soft', '#e0b882', [sink - 3, 3.27, -0.1], [1.6, 0.1, 1.1]) // cutting board, a carrot on it
  kit.add(root, 'cone', '#e8732a', [sink - 3, 3.42, -0.1], [0.12, 0.8, 0.12], [0, 0, Math.PI / 2])
  return root
}

export function washer(kit: Kit, x: number, z: number) {
  const root = group(x, z, -Math.PI / 2)
  kit.add(root, 'soft', '#f7f7f5', [0, 1.8, 0], [3.4, 3.6, 3.4])
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
  kit.add(root, 'cylinder', '#9aa3a8', [1.1, 3.3, 1.74], [0.16, 0.06, 0.16], [Math.PI / 2, 0, 0])
  kit.add(root, 'box', '#5a6a7a', [-0.6, 3.3, 1.73], [1.2, 0.25, 0.02])
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

/** Vanity against the wall at x = `x` − width/2 (doors facing +x), with its basin and the mirror on the wall. */
export function vanity(kit: Kit, x: number, z: number, width: number, length: number, wallFace: number) {
  const root = group(x, z)
  const metal = steel(kit)
  kit.add(root, 'soft', '#f4efe6', [0, 1.45, 0], [width, 2.7, length])
  kit.add(root, 'soft', '#e6e1d8', [0.05, 2.9, 0], [width + 0.1, 0.2, length + 0.1])
  for (const sz of [-1, 1]) {
    kit.add(root, 'box', '#ebe5da', [width / 2 + 0.02, 1.5, (sz * length) / 4], [0.05, 2.2, length / 2 - 0.4])
    kit.add(root, 'box', metal, [width / 2 + 0.08, 2.3, sz * 0.5], [0.06, 0.6, 0.08])
  }
  kit.add(root, 'cylinder', '#ffffff', [0.2, 3.02, 0], [0.85, 0.06, 1.4])
  kit.add(root, 'cylinder', '#cfe0e8', [0.2, 3.06, 0], [0.7, 0.02, 1.2])
  kit.add(root, 'cylinder', metal, [-0.85, 3.35, 0], [0.08, 0.7, 0.08])
  kit.add(root, 'cylinder', metal, [-0.6, 3.68, 0], [0.06, 0.5, 0.06], [0, 0, Math.PI / 2])
  kit.add(root, 'cylinder', '#7fd0c0', [-0.6, 3.25, 2.6], [0.2, 0.5, 0.2]) // toothbrush cup
  kit.add(root, 'box', '#f2f2f2', [-0.6, 3.6, 2.6], [0.05, 0.6, 0.05], [0.2, 0, 0])
  const wall = wallFace - x
  kit.add(root, 'box', '#d9d2c4', [wall + 0.03, 4.8, 0], [0.05, 3.0, 5.8])
  kit.add(
    root,
    'box',
    kit.material('#bfe3f2', { roughness: 0.05, metal: 0.5 }),
    [wall + 0.06, 4.8, 0],
    [0.04, 2.8, 5.6]
  )
  return root
}

/** The bathtub (rim at `top`, as the height grid), water inside, the lid rolled up at the back. */
export function bathtub(kit: Kit, x: number, z: number, width: number, length: number, top: number) {
  const root = group(x, z)
  kit.add(root, 'soft', '#f2f5f7', [0, (top - 0.2) / 2, 0], [width, top - 0.2, length])
  kit.add(root, 'box', '#8fc7e0', [0, top - 0.12, 0], [width - 0.8, 0.06, length - 0.8])
  for (const side of [-1, 1]) {
    kit.add(root, 'soft', '#ffffff', [side * (width / 2 - 0.2), top - 0.1, 0], [0.4, 0.2, length])
    kit.add(root, 'soft', '#ffffff', [0, top - 0.1, side * (length / 2 - 0.2)], [width, 0.2, 0.4])
  }
  kit.add(
    root,
    'cylinder',
    '#c9d6dc',
    [0, top + 0.45, -length / 2 + 0.6],
    [0.45, width - 0.8, 0.45],
    [0, 0, Math.PI / 2]
  )
  return root
}

/** Wash stool and bucket by the tub (solid: see SOLIDS). */
export function bathStool(kit: Kit, x: number, z: number) {
  const root = group(x, z)
  kit.add(root, 'soft', '#e8a0a8', [0, 0.8, 0], [1.4, 0.2, 1.0])
  for (const side of [-1, 1]) kit.add(root, 'box', '#e8a0a8', [side * 0.55, 0.35, 0], [0.15, 0.7, 0.9])
  kit.add(root, 'frustum', '#d9b37a', [1.6, 0.4, 0.3], [0.55, 0.8, 0.55], [Math.PI, 0, 0])
  kit.add(root, 'cylinder', '#a07c4a', [1.6, 0.8, 0.3], [0.56, 0.06, 0.56])
  return root
}

/** Toilet against the wall behind it (−z), facing +z: tank top at 2, as the height grid. */
export function toilet(kit: Kit, x: number, z: number) {
  const root = group(x, z)
  kit.add(root, 'frustum', '#ffffff', [0, 0.5, 0.2], [0.55, 1.0, 0.7])
  kit.add(root, 'sphere', '#ffffff', [0, 1.15, 0.35], [0.85, 0.45, 1.05])
  kit.add(root, 'sphere', '#eef0f2', [0, 1.62, 0.35], [0.82, 0.08, 1.0])
  kit.add(root, 'soft', '#ffffff', [0, 1.3, -1.05], [1.8, 1.4, 0.75])
  kit.add(root, 'box', steel(kit), [-0.75, 1.75, -0.66], [0.3, 0.08, 0.08])
  return root
}

/** Paulownia-style chest of drawers, facing +z, with brass ring pulls. */
export function tansu(kit: Kit, x: number, z: number, width: number, depth: number, height: number) {
  const root = group(x, z)
  const front = depth / 2 + 0.02
  kit.add(root, 'soft', '#7a5236', [0, height / 2 + 0.1, 0], [width, height - 0.2, depth])
  kit.add(root, 'box', '#5a3a24', [0, 0.1, 0], [width - 0.2, 0.2, depth - 0.2])
  const rows = [
    [0.75, 2],
    [1.65, 2],
    [2.55, 2],
    [3.45, 3]
  ]
  for (const [y, columns] of rows)
    for (let column = 0; column < columns; column++) {
      const cx = (column - (columns - 1) / 2) * (width / columns)
      kit.add(root, 'box', '#8a6040', [cx, y, front], [width / columns - 0.14, 0.76, 0.05])
      kit.add(root, 'box', brass(kit), [cx, y + 0.12, front + 0.03], [0.34, 0.12, 0.03])
      kit.add(root, 'torus', brass(kit), [cx, y - 0.04, front + 0.05], [0.14, 0.14, 0.14])
    }
  return root
}

/** Bookshelf against the wall behind it (+x), open toward −x: frame, shelves and books of varied size. */
export function bookshelf(kit: Kit, x: number, z: number, width: number, length: number, height: number) {
  const root = group(x, z)
  const wood = '#6b4a32'
  kit.add(root, 'box', '#5a3d28', [width / 2 - 0.08, height / 2, 0], [0.16, height, length])
  for (const side of [-1, 1])
    kit.add(root, 'soft', wood, [0, height / 2, side * (length / 2 - 0.1)], [width, height, 0.2])
  kit.add(root, 'soft', wood, [0, height - 0.1, 0], [width + 0.1, 0.2, length])
  kit.add(root, 'box', wood, [0, height / 2, 0], [width - 0.1, height - 0.2, 0.15])
  const books = ['#c0504d', '#5b7fb0', '#d9a441', '#6a9a5b', '#8a5a8a', '#e8e0cc', '#3f5a7a']
  let seed = 7
  const next = () => (seed = (seed * 9301 + 49297) % 233280) / 233280
  for (const floor of [0, 1.95, 3.9]) {
    kit.add(root, 'box', wood, [0, floor + 0.08, 0], [width - 0.1, 0.16, length - 0.3])
    for (const half of [-1, 1]) {
      let at = 0.25
      while (at < length / 2 - 0.9) {
        const thick = 0.3 + next() * 0.35
        const tall = 1.05 + next() * 0.55
        if (next() > 0.12) {
          const lean = next() > 0.9 ? 0.18 : 0
          kit.add(
            root,
            'box',
            books[Math.floor(next() * books.length)],
            [-0.1 - next() * 0.15, floor + 0.16 + tall / 2, half * (at + thick / 2)],
            [width - 0.6, tall, thick],
            [lean * half, 0, 0]
          )
        }
        at += thick + 0.04
      }
    }
  }
  return root
}

/** Monitor, keyboard and a mug on a desk top at `y` (the monitor stands toward −z). */
export function computer(kit: Kit, x: number, y: number, z: number) {
  const root = group(x, z)
  kit.add(root, 'soft', '#2b2e35', [0, y + 0.06, -0.6], [1.4, 0.12, 0.9])
  kit.add(root, 'box', '#2b2e35', [0, y + 0.45, -0.75], [0.2, 0.7, 0.2])
  kit.add(root, 'soft', '#2b2e35', [0, y + 1.65, -0.65], [3.2, 1.9, 0.2])
  kit.add(root, 'box', '#6f9fc4', [0, y + 1.65, -0.54], [2.95, 1.65, 0.03])
  kit.add(root, 'soft', '#d9dadc', [0, y + 0.06, 0.55], [2.4, 0.12, 0.75])
  kit.add(root, 'pebble', '#d9dadc', [1.7, y + 0.06, 0.55], [0.16, 0.08, 0.24])
  kit.add(root, 'cylinder', '#e86a5a', [-2.3, y + 0.23, 0.2], [0.22, 0.45, 0.22])
  kit.add(root, 'soft', '#f4f1e8', [2.6, y + 0.1, -0.3], [1.2, 0.2, 1.5], [0, 0.2, 0]) // papers
  return root
}

/** Shoe cabinet on legs (the doma floor at `y`), doors facing +z, a little plant and key tray on top. */
export function shoeRack(kit: Kit, x: number, y: number, z: number, length: number, wood: Paint) {
  const root = group(x, z)
  root.position.y = y
  kit.add(root, 'soft', wood, [0, 1.75, 0], [length, 1.7, 2.4])
  for (const side of [-1, 1]) kit.add(root, 'box', wood, [side * (length / 2 - 0.15), 0.45, 0], [0.3, 0.9, 2.4])
  for (const index of [-1, 0, 1]) {
    kit.add(root, 'box', tone(kit, wood, '#d6b88e'), [(index * length) / 3, 1.75, 1.22], [length / 3 - 0.2, 1.4, 0.05])
    kit.add(root, 'box', brass(kit), [(index * length) / 3 + length / 6 - 0.45, 1.75, 1.27], [0.08, 0.5, 0.06])
  }
  kit.add(root, 'frustum', '#e8e4d8', [-2.2, 2.9, 0], [0.3, 0.4, 0.3], [Math.PI, 0, 0])
  for (const angle of [0, 2.1, 4.2])
    kit.add(root, 'pebble', '#5f9e45', [-2.2 + Math.cos(angle) * 0.2, 3.3, Math.sin(angle) * 0.2], [0.3, 0.25, 0.3])
  kit.add(root, 'soft', '#8a6a48', [1.6, 2.65, 0.2], [1.0, 0.1, 0.7])
  kit.add(root, 'torus', brass(kit), [1.5, 2.72, 0.2], [0.12, 0.12, 0.12], [Math.PI / 2, 0, 0])
  return root
}

/** A pair of shoes, toes toward +z after `turn`. */
export function shoes(kit: Kit, x: number, y: number, z: number, color: string, turn = 0, size = 1) {
  const root = group(x, z, turn)
  root.position.y = y
  for (const side of [-1, 1]) {
    kit.add(root, 'soft', color, [side * 0.32 * size, 0.18 * size, 0], [0.5 * size, 0.36 * size, 1.2 * size])
    kit.add(root, 'box', '#f2f0ea', [side * 0.32 * size, 0.03, 0], [0.52 * size, 0.06, 1.22 * size])
  }
  return root
}

export function zabuton(kit: Kit, x: number, z: number, color = '#7b4a8f') {
  const root = group(x, z)
  kit.add(root, 'soft', color, [0, 0.12, 0], [3, 0.25, 3])
  for (const sx of [-1, 1])
    for (const sz of [-1, 1]) kit.add(root, 'sphere', '#e8c86a', [sx * 1.4, 0.2, sz * 1.4], [0.12, 0.12, 0.12])
  return root
}

export function toyBox(kit: Kit, x: number, z: number) {
  const root = group(x, z)
  kit.add(root, 'soft', '#f29e4c', [0, 1.2, 0], [4, 2.4, 3])
  kit.add(root, 'box', '#e8873a', [0, 1.2, 1.52], [3.4, 1.6, 0.05])
  kit.add(root, 'pebble', '#f2c94c', [0, 1.2, 1.56], [0.5, 0.5, 0.04])
  kit.add(root, 'soft', '#5aa9e6', [0, 3.9, -1.92], [4.1, 3.1, 0.15], [-0.25, 0, 0]) // the lid, open
  kit.add(root, 'sphere', '#b07a4a', [0.6, 2.6, 0.2], [0.7, 0.7, 0.6]) // the bear: body, head and ears
  kit.add(root, 'sphere', '#b07a4a', [0.6, 3.35, 0.3], [0.45, 0.42, 0.4])
  for (const side of [-1, 1]) kit.add(root, 'sphere', '#9a6a3e', [0.6 + side * 0.32, 3.7, 0.3], [0.14, 0.14, 0.1])
  kit.add(root, 'sphere', '#2a1f18', [0.6, 3.3, 0.68], [0.07, 0.06, 0.04])
  kit.add(root, 'sphere', '#e8455a', [-1, 2.5, 0.5], [0.45, 0.45, 0.45])
  kit.add(root, 'soft', '#6cbf4a', [-0.9, 2.45, -0.7], [0.7, 0.7, 0.7], [0, 0.5, 0]) // a block
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

/** Dog house: walls, a gable over the arched doorway (+z), the roof and Gon's name plate and bowl. */
export function dogHouse(kit: Kit, x: number, z: number) {
  const root = group(x, z)
  kit.add(root, 'soft', '#c98d55', [0, 1.6, 0], [5, 3.2, 5])
  kit.add(root, 'gable', '#c98d55', [0, 3.15, 0], [5, 1.5, 5])
  gableRoof(kit, root, '#8c3b2e', [0, 3.15, 0], 2.5, 1.5, 5, 0.45, 0.25)
  kit.add(root, 'box', '#2a1d14', [0, 1.1, 2.51], [2, 1.8, 0.05])
  kit.add(root, 'cylinder', '#2a1d14', [0, 2.0, 2.51], [1, 0.05, 1], [Math.PI / 2, 0, 0])
  kit.add(root, 'soft', '#f6efe0', [0, 3.75, 2.56], [1.5, 0.5, 0.1])
  kit.add(root, 'box', '#5a3a22', [0, 3.75, 2.62], [0.9, 0.12, 0.02])
  kit.add(root, 'frustum', '#d9534f', [2, 0.2, 3.6], [0.55, 0.4, 0.55], [Math.PI, 0, 0])
  kit.add(root, 'cylinder', '#a8703a', [2, 0.38, 3.6], [0.45, 0.04, 0.45])
  return root
}

/** Garden shed on four posts (the crawl space under it), ribbed walls, double doors toward the house (−z). */
export function shed(kit: Kit, x: number, z: number, width: number, depth: number) {
  const root = group(x, z)
  for (const sx of [-1, 1])
    for (const sz of [-1, 1])
      kit.add(root, 'box', '#5a4030', [sx * (width / 2 - 0.3), 0.5, sz * (depth / 2 - 0.3)], [0.5, 1, 0.5])
  kit.add(root, 'box', '#6a5a48', [0, 1.12, 0], [width + 0.2, 0.25, depth + 0.2])
  kit.add(root, 'soft', '#8a8f78', [0, 3.75, 0], [width, 5, depth])
  for (let px = -width / 2 + 0.5; px < width / 2; px += 0.8)
    for (const side of [-1, 1])
      if (side > 0 || Math.abs(px) > 2.6)
        kit.add(root, 'box', '#7a7f6a', [px, 3.75, side * (depth / 2 + 0.02)], [0.14, 4.8, 0.06])
  for (const side of [-1, 1]) {
    kit.add(root, 'box', '#6f7562', [side * 1.25, 3.4, -depth / 2 - 0.04], [2.4, 4, 0.08])
    kit.add(root, 'box', steel(kit), [side * 0.3, 3.4, -depth / 2 - 0.12], [0.1, 0.6, 0.08])
  }
  const roof = new THREE.Group()
  roof.rotation.y = Math.PI / 2
  root.add(roof)
  kit.add(roof, 'gable', '#8a8f78', [0, 6.2, 0], [depth, 1.2, width])
  gableRoof(kit, roof, '#5f6656', [0, 6.2, 0], depth / 2, 1.2, width, 0.5, 0.25)
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
