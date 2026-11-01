// Chapter 1 scenery: floors per room (wood, tatami, tiles, the genkan's earth floor), walls with door lintels and
// the living room window, furniture and the garden, all baked into one mesh per material. The cage door and the
// cat flap swing with their gates; furniture fades while the local rabbit is underneath it.
import * as THREE from 'three'
import type { Scenery, SceneryState, StageLook } from '../../story'
import {
  BUSHES,
  CAGE,
  CAGE_DOOR,
  DOMA,
  DOMA_DEPTH,
  FURNITURE,
  GATE,
  GRASS_PATCHES,
  ROOMS,
  SOLIDS,
  TUNNEL_NODES,
  WALLS,
  WORLD
} from './map'
import { STEPS } from './script'
import * as props from './props'

export const LOOK: StageLook = {
  sky: '#f3e6d0',
  nightSky: '#e9a878',
  fog: [70, 170],
  hemi: ['#fff4e0', '#8a6a4a', 2.4],
  sun: ['#ffe2b0', 2.6],
  // Morning into late afternoon as the chapter goes on.
  night: (state) => Math.min(0.45, Math.max(0, ((state.step ?? 0) - 2) / (STEPS - 2)) * 0.45),
  indoor: true
}

const FLOOR = {
  wood: '#c99a66',
  dining: '#d4a873',
  tatami: '#cdbf7e',
  tile: '#dfe4e6',
  doma: '#9a948a',
  garden: '#7fa85a',
  soil: '#8a6a48',
  outside: '#9aa08f',
  wall: '#f1e9dc',
  wallTop: '#a08870'
}

export function scenery(scene: THREE.Scene): Scenery {
  const kit = new props.Kit()
  const root = new THREE.Group()
  const statics = new THREE.Group()
  // Furniture people can't pass and rabbits crawl under fades while a rabbit is beneath it.
  const fade = kit.material('#7b8fb0', { roughness: 0.95, tag: 'fade' })
  const fadeWood = kit.material('#b07a4a', { tag: 'fade' })
  const fadeDark = kit.material('#8a5a36', { tag: 'fade' })
  const fadeLight = kit.material('#c9a77c', { tag: 'fade' })

  // Floors: the outside, the garden lawn, then each room.
  kit.block(statics, FLOOR.outside, WORLD.minX, WORLD.maxX, WORLD.minZ, WORLD.maxZ, -0.4, -0.05)
  kit.block(statics, FLOOR.garden, -40, 40, 24, 56.5, -0.2, 0)
  const floor = (rect: { minX: number; maxX: number; minZ: number; maxZ: number }, color: string, top = 0) =>
    kit.block(statics, color, rect.minX, rect.maxX, rect.minZ, rect.maxZ, top - 0.2, top)
  floor(ROOMS.living, FLOOR.wood)
  floor(ROOMS.dining, FLOOR.dining)
  floor(ROOMS.kitchen, FLOOR.tile)
  floor(ROOMS.washroom, FLOOR.tile)
  floor(ROOMS.hallway, FLOOR.wood)
  floor({ ...ROOMS.genkan, maxZ: -26 }, FLOOR.doma, DOMA_DEPTH)
  floor({ ...ROOMS.genkan, minZ: -26 }, FLOOR.wood)
  floor(ROOMS.bath, FLOOR.tile)
  floor(ROOMS.washitsu, FLOOR.tatami)
  floor(ROOMS.study, FLOOR.wood)
  // Tatami seams and the genkan step's edge.
  for (let x = -4; x <= 18; x += 5.5) kit.block(statics, '#b3a565', x - 0.08, x + 0.08, -36, -14, 0, 0.02)
  kit.block(statics, '#7a5236', DOMA.minX, DOMA.maxX, DOMA.maxZ - 0.3, DOMA.maxZ + 0.2, DOMA_DEPTH, 0.04)
  // Soil beds under the vegetable patch and flower beds.
  for (const patch of GRASS_PATCHES)
    kit.block(
      statics,
      FLOOR.soil,
      Math.min(patch.ax, patch.bx) - patch.r,
      Math.max(patch.ax, patch.bx) + patch.r,
      Math.min(patch.az, patch.bz) - patch.r,
      Math.max(patch.az, patch.bz) + patch.r,
      0,
      0.06
    )
  for (const patch of GRASS_PATCHES) {
    const count = Math.ceil(Math.hypot(patch.bx - patch.ax, patch.bz - patch.az) / 0.9)
    for (let index = 0; index <= count; index++) {
      const t = index / Math.max(1, count)
      kit.add(
        statics,
        'cone',
        index % 3 ? '#5f9e45' : '#e58fb0',
        [patch.ax + (patch.bx - patch.ax) * t, 0.6, patch.az + (patch.bz - patch.az) * t],
        [patch.r * 0.7, 1.2, patch.r * 0.7]
      )
    }
  }

  // Walls: fences in the garden are boards, the house walls plaster with a dark top edge.
  for (const wall of WALLS) {
    if (wall.minZ >= 24.5) {
      statics.add(props.boardFence(kit, wall.minX, wall.maxX, wall.minZ, wall.maxZ, wall.h))
      continue
    }
    kit.block(statics, FLOOR.wall, wall.minX, wall.maxX, wall.minZ, wall.maxZ, 0, wall.h)
    kit.block(statics, FLOOR.wallTop, wall.minX, wall.maxX, wall.minZ, wall.maxZ, wall.h, wall.h + 0.08)
  }
  // The window's frame and glass above the sill, and lintels over the doorways.
  const glass = kit.material('#bfe3f2', { opacity: 0.25, roughness: 0.1 })
  kit.block(statics, glass, -36, -14, 24.15, 24.35, 1, 6)
  kit.block(statics, FLOOR.wall, -36, -14, 24, 24.5, 6, 7)
  for (const x of [-36, -25, -14]) kit.block(statics, '#ffffff', x - 0.15, x + 0.15, 24.05, 24.45, 1, 6)
  const lintel = (minX: number, maxX: number, minZ: number, maxZ: number) =>
    kit.block(statics, FLOOR.wall, minX, maxX, minZ, maxZ, 6, 7)
  lintel(-14, -10, -6.25, -5.75)
  lintel(6, 10, -6.25, -5.75)
  lintel(-14, -11, -14.25, -13.75)
  lintel(17.75, 18.25, -12, -8)
  lintel(20, 23, 9.75, 10.25)
  // Front door, back door and the garden-side frames (closed for rabbits).
  kit.block(statics, '#7a5236', -33, -29, -36.6, -36.3, DOMA_DEPTH, 5.8)
  kit.block(statics, '#c9b08a', 33.6, 36.2, 24.45, 24.7, 0, 6)
  kit.block(statics, '#c9b08a', 33.6, 36.2, 23.8, 24.05, 0, 6)
  kit.block(statics, '#8a6a48', 30.8, 33.2, 24.45, 24.6, 1.4, 1.6) // cat flap frame
  // Fusuma (sliding paper doors) of the washitsu and the oshiire.
  kit.block(statics, '#efe6cf', 6, 9, -14.15, -13.85, 0, 6.5)
  kit.block(statics, '#efe6cf', 16.5, 18, -31.15, -30.85, 0, 6.5)
  // Mouse hole behind the fridge, and the burrow's run under the floor.
  kit.add(statics, 'sphere', '#2a1f18', [TUNNEL_NODES[0].x, 0.02, TUNNEL_NODES[0].z], [0.6, 0.05, 0.6])
  kit.add(statics, 'sphere', '#2a1f18', [TUNNEL_NODES[3].x, 0.02, TUNNEL_NODES[3].z], [0.6, 0.05, 0.6])
  const burrow = kit.material('#3d2c20', { roughness: 1 })
  burrow.side = THREE.DoubleSide
  for (let index = 1; index < TUNNEL_NODES.length; index++) {
    const a = TUNNEL_NODES[index - 1]
    const b = TUNNEL_NODES[index]
    const length = Math.hypot(b.x - a.x, b.z - a.z)
    kit.add(
      statics,
      'box',
      burrow,
      [(a.x + b.x) / 2, -1.5, (a.z + b.z) / 2],
      [2, 1.9, length + 2],
      [0, Math.atan2(b.x - a.x, b.z - a.z), 0]
    )
  }

  // Living room.
  statics.add(props.petCage(kit, (CAGE.minX + CAGE.maxX) / 2, (CAGE.minZ + CAGE.maxZ) / 2))
  const solid = (name: string) => SOLIDS.find((entry) => entry.name === name)!
  const roof = (name: string) => FURNITURE.find((entry) => entry.name === name)!
  const mid = (rect: { minX: number; maxX: number; minZ: number; maxZ: number }) => ({
    x: (rect.minX + rect.maxX) / 2,
    z: (rect.minZ + rect.maxZ) / 2,
    w: rect.maxX - rect.minX,
    d: rect.maxZ - rect.minZ
  })
  statics.add(props.birdcage(kit, mid(solid('birdstand')).x, mid(solid('birdstand')).z))
  {
    const s = mid(roof('sofa'))
    statics.add(props.sofa(kit, s.x, s.z, s.w, s.d, fade))
    const t = mid(roof('lowtable'))
    statics.add(props.table(kit, t.x, t.z, t.w, t.d, 1.1, fadeWood))
    const tv = solid('tv')
    kit.block(statics, '#6b4a32', tv.minX, tv.maxX, tv.minZ, tv.maxZ, 0, 2)
    kit.block(statics, '#1d1f24', tv.minX + 0.6, tv.minX + 0.9, tv.minZ + 0.8, tv.maxZ - 0.8, 2, 5.5)
    kit.block(statics, '#5a87b8', tv.minX + 0.9, tv.minX + 0.95, tv.minZ + 1.1, tv.maxZ - 1.1, 2.3, 5.2)
    const toy = mid(solid('toybox'))
    statics.add(props.toyBox(kit, toy.x, toy.z))
  }
  statics.add(props.curtain(kit, -37, 23, 3))
  statics.add(props.curtain(kit, -13, 23, 3))
  statics.add(props.housePlant(kit, -38, -3.5))
  kit.block(statics, '#c46a5a', -26, -8, 8, 17, 0, 0.04) // rug
  // Dining room.
  {
    const t = mid(roof('dining'))
    statics.add(props.table(kit, t.x, t.z, t.w, t.d, 2.6, fadeDark))
    for (const chairRoof of FURNITURE.filter((entry) => entry.name === 'chair')) {
      const c = mid(chairRoof)
      statics.add(props.chair(kit, c.x, c.z, c.z < t.z ? 0 : Math.PI, fadeDark))
    }
    kit.block(statics, '#8a5a36', -3.75, -2.5, 15, 23.5, 0, 3.4) // sideboard against the living wall
  }
  // Kitchen.
  {
    const f = mid(solid('fridge'))
    statics.add(props.fridge(kit, f.x, f.z))
    const c = mid(solid('counter'))
    statics.add(props.counter(kit, c.x + 0.05, c.z, c.d, 2))
    const p = roof('pantry')
    for (const y of [1.2, 2.4, 3.6]) kit.block(statics, fadeLight, p.minX, p.maxX, p.minZ, p.maxZ, y, y + 0.15)
    for (const x of [p.minX, p.maxX]) kit.block(statics, fadeLight, x - 0.1, x + 0.1, p.minZ, p.maxZ, 0, 3.8)
    kit.block(statics, '#e2b55a', p.minX + 0.5, p.minX + 2, p.minZ + 0.3, p.maxZ - 0.3, 1.35, 2.2) // rice sack
    kit.block(statics, '#c74a3a', p.maxX - 2.4, p.maxX - 0.6, p.minZ + 0.3, p.maxZ - 0.3, 2.55, 3.3)
  }
  // Washroom.
  {
    const w = mid(solid('washer'))
    statics.add(props.washer(kit, w.x, w.z))
    statics.add(props.laundryBasket(kit, 34, 14))
    const v = solid('vanity')
    kit.block(statics, '#f4efe6', v.minX, v.maxX, v.minZ, v.maxZ, 0, 3)
    kit.block(statics, '#bfe3f2', v.minX - 0.2, v.minX - 0.05, v.minZ + 1, v.maxZ - 1, 3.4, 6.2) // mirror
  }
  // Genkan, bath, washitsu, study.
  {
    const rack = roof('shoerack')
    const r = mid(rack)
    statics.add(props.shoeRack(kit, r.x, DOMA_DEPTH, r.z, r.w, fadeLight))
    kit.add(statics, 'cylinder', '#3f6b8a', [-23, DOMA_DEPTH + 1.1, -34.5], [0.8, 2.2, 0.8]) // umbrella stand
    for (const [dx, color] of [
      [-0.3, '#d9363e'],
      [0.35, '#2f7fe0']
    ] as const)
      kit.add(statics, 'cylinder', color, [-23 + dx, DOMA_DEPTH + 3, -34.5 + dx], [0.12, 3.2, 0.12], [0.15, 0, dx])
    kit.block(statics, '#c46a5a', -36, -26, -25.5, -22, 0, 0.04) // genkan mat
    for (const x of [-37.6, -38.6])
      kit.add(statics, 'sphere', x < -38 ? '#5a6a8a' : '#8a6a4a', [x, 3.4, -10], [0.9, 1.8, 1]) // coats
    const tub = solid('tub')
    kit.block(statics, '#f2f5f7', tub.minX, tub.maxX, tub.minZ, tub.maxZ, 0, 2.4)
    kit.block(statics, '#8fc7e0', tub.minX + 0.4, tub.maxX - 0.4, tub.minZ + 0.4, tub.maxZ - 0.4, 2.3, 2.42)
    const toilet = solid('toilet')
    kit.block(statics, '#ffffff', toilet.minX, toilet.maxX, toilet.minZ, toilet.maxZ, 0, 2)
    kit.add(statics, 'cylinder', '#d9d2c4', [-6.5, 0.9, -17], [1.1, 1.8, 1.1]) // laundry hamper
    statics.add(props.zabuton(kit, 8, -28))
    const chabudai = mid(roof('chabudai'))
    statics.add(props.table(kit, chabudai.x, chabudai.z, chabudai.w, chabudai.d, 1.2, fadeWood))
    const tansu = solid('tansu')
    kit.block(statics, '#7a5236', tansu.minX, tansu.maxX, tansu.minZ, tansu.maxZ, 0, 4)
    const desk = mid(roof('desk'))
    statics.add(props.table(kit, desk.x, desk.z, desk.w, desk.d, 2.3, fadeDark))
    kit.block(statics, '#3a3d44', desk.x - 1.5, desk.x + 1.5, desk.z - 1, desk.z + 0.5, 2.6, 4.4) // computer
    const shelf = solid('bookshelf')
    kit.block(statics, '#6b4a32', shelf.minX, shelf.maxX, shelf.minZ, shelf.maxZ, 0, 6)
    for (let z = shelf.minZ + 0.6; z < shelf.maxZ - 0.5; z += 1.1)
      for (const y of [0.3, 2.2, 4.1])
        kit.block(
          statics,
          ['#c0504d', '#5b7fb0', '#d9a441', '#6a9a5b'][Math.round(z) & 3],
          shelf.minX - 0.1,
          shelf.minX + 0.3,
          z,
          z + 0.8,
          y,
          y + 1.5
        )
  }
  // Garden: the engawa deck, shed, dog house, clothesline, hedges and the gap under the fence.
  {
    const deck = roof('engawa')
    kit.block(statics, fadeWood, deck.minX, deck.maxX, deck.minZ, deck.maxZ, 1, 1.3)
    for (let x = deck.minX + 0.5; x < deck.maxX; x += 4)
      kit.block(statics, '#7a5236', x, x + 0.3, deck.maxZ - 0.5, deck.maxZ - 0.2, 0, 1)
    const shed = roof('shed')
    kit.block(statics, '#8a8f78', shed.minX, shed.maxX, shed.minZ, shed.maxZ, 1, 6.5)
    kit.block(statics, '#5f6656', shed.minX - 0.5, shed.maxX + 0.5, shed.minZ - 0.5, shed.maxZ + 0.5, 6.5, 7)
    for (const x of [shed.minX + 0.3, shed.maxX - 0.3])
      for (const z of [shed.minZ + 0.3, shed.maxZ - 0.3])
        kit.block(statics, '#5a4030', x - 0.25, x + 0.25, z - 0.25, z + 0.25, 0, 1)
    const dog = mid(solid('doghouse'))
    statics.add(props.dogHouse(kit, dog.x, dog.z))
    for (const x of [17, 35]) kit.add(statics, 'cylinder', '#9aa0a6', [x, 3.5, 36], [0.15, 7, 0.15])
    kit.add(statics, 'cylinder', '#e0e0e0', [26, 6.6, 36], [0.04, 18, 0.04], [0, 0, Math.PI / 2])
    for (const [x, color] of [
      [20, '#7fa7d9'],
      [24, '#f2f2f2'],
      [28, '#e97f8c'],
      [32, '#f2d16b']
    ] as const)
      kit.block(statics, color, x - 1.4, x + 1.4, 35.9, 36.1, 4.2, 6.6)
    for (const bush of BUSHES) if (bush.z > 24.5) statics.add(props.hedge(kit, bush.x, bush.z, bush.r))
    const gap = roof('fencegap')
    kit.block(statics, '#2a1f18', gap.minX, gap.maxX, 56, 56.5, -0.1, 0.02)
  }
  const baked = kit.bake(statics)
  root.add(baked)

  // Moving parts: the cage door swings open on its hinge; the cat flap tilts up once the tag opens it.
  const door = props.cageDoor(kit)
  door.position.set(CAGE_DOOR.x - 1.25, 0.3, CAGE.minZ - 0.25)
  const flap = new THREE.Group()
  flap.position.set(32, 1.4, 24.25)
  kit.add(flap, 'box', kit.material('#c9b08a'), [0, -0.7, 0], [1.9, 1.35, 0.12])
  root.add(door, flap)
  const fading = [...kit.materials.values()].filter((material) => material.name === 'fade')
  scene.add(root)
  return {
    update(state: SceneryState, view) {
      const open = state.open ?? 0
      door.rotation.y = open & (1 << GATE.cage) ? 1.9 : 0
      flap.rotation.x = open & (1 << GATE.catflap) ? -1.2 : 0
      const under = !!view.under && view.under.bottom < 3
      for (const material of fading) {
        if (material.transparent !== under) material.needsUpdate = true
        material.transparent = under
        material.opacity = under ? 0.3 : 1
      }
    },
    dispose() {
      baked.children.forEach((child) => (child as THREE.Mesh).geometry.dispose())
      kit.dispose()
      root.removeFromParent()
    }
  }
}
