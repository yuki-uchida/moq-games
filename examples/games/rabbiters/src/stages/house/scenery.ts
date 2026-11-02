// Chapter 1 scenery: floors per room (wood, tatami, tiles, the genkan's earth floor), walls with door lintels and
// the living room window, furniture and the garden, baked into one vertex-coloured mesh per finish (the house and
// the garden apart). The cage door and the cat flap swing with their gates; furniture fades while the local rabbit is
// underneath it.
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
import { Kit } from '../scenery-kit'

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
  const kit = new Kit()
  const root = new THREE.Group()
  const statics = new THREE.Group()
  // The garden bakes separately, so its beds and hedges drop out of view (and draw) from inside the house.
  const garden = new THREE.Group()
  // Furniture people can't pass and rabbits crawl under fades while a rabbit is beneath it.
  const fade = kit.material('#7b8fb0', { roughness: 0.95, tag: 'fade' })
  const fadeWood = kit.material('#b07a4a', { tag: 'fade' })
  const fadeDark = kit.material('#8a5a36', { tag: 'fade' })
  const fadeLight = kit.material('#c9a77c', { tag: 'fade' })

  // Floors: the outside, the garden lawn, then each room.
  kit.block(statics, FLOOR.outside, WORLD.minX, WORLD.maxX, WORLD.minZ, WORLD.maxZ, -0.4, -0.05)
  kit.block(garden, FLOOR.garden, -40, 40, 24, 56.5, -0.2, 0)
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
      garden,
      FLOOR.soil,
      Math.min(patch.ax, patch.bx) - patch.r,
      Math.max(patch.ax, patch.bx) + patch.r,
      Math.min(patch.az, patch.bz) - patch.r,
      Math.max(patch.az, patch.bz) + patch.r,
      0,
      0.06
    )
  // Leafy clumps along each bed, flowering (pink, yellow, white) in the flower beds and with round cabbages in
  // the vegetable patch (the bed nearest the house's west end).
  for (const [bed, patch] of GRASS_PATCHES.entries()) {
    const count = Math.ceil(Math.hypot(patch.bx - patch.ax, patch.bz - patch.az) / 0.9)
    for (let index = 0; index <= count; index++) {
      const t = index / Math.max(1, count)
      const x = patch.ax + (patch.bx - patch.ax) * t + Math.sin(index * 2.3 + bed) * patch.r * 0.25
      const z = patch.az + (patch.bz - patch.az) * t + Math.cos(index * 1.7 + bed) * patch.r * 0.25
      const size = patch.r * (0.55 + 0.15 * Math.sin(index * 3.1 + bed))
      kit.add(
        garden,
        'lump',
        index % 2 ? '#5f9e45' : '#4f8a3c',
        [x, size * 0.55, z],
        [size, size * 0.85, size],
        [0, index, 0]
      )
      if (bed <= 1) kit.add(garden, 'pebble', '#a9cf7a', [x, size * 1.2, z], [size * 0.5, size * 0.45, size * 0.5])
      else
        for (let petal = 0; petal < 3; petal++) {
          const angle = petal * 2.1 + index
          kit.add(
            garden,
            'pebble',
            ['#e58fb0', '#f2d14b', '#ffffff'][(index + petal + bed) % 3],
            [x + Math.cos(angle) * size * 0.55, size * 1.25, z + Math.sin(angle) * size * 0.55],
            [0.28, 0.2, 0.28]
          )
        }
    }
  }

  // Walls: fences in the garden are boards, the house walls plaster with a dark top edge.
  for (const wall of WALLS) {
    if (wall.minZ >= 24.5) {
      garden.add(props.boardFence(kit, wall.minX, wall.maxX, wall.minZ, wall.maxZ, wall.h))
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
  const burrow = kit.material('#3d2c20', { roughness: 1, side: THREE.DoubleSide })
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
    const tv = mid(solid('tv'))
    statics.add(props.tvSet(kit, tv.x, tv.z, tv.w, tv.d))
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
    statics.add(props.sideboard(kit, -3.125, 19.25, 1.25, 8.5, 3.4)) // against the living-room wall
  }
  // Kitchen.
  {
    const f = mid(solid('fridge'))
    statics.add(props.fridge(kit, f.x, f.z))
    const c = mid(solid('counter'))
    statics.add(props.counter(kit, c.x + 0.05, c.z, c.d, 2))
    // Pantry shelves: a rice sack, jars and cans.
    const p = roof('pantry')
    for (const y of [1.2, 2.4, 3.6]) kit.block(statics, fadeLight, p.minX, p.maxX, p.minZ, p.maxZ, y, y + 0.15)
    for (const x of [p.minX, p.maxX]) kit.block(statics, fadeLight, x - 0.1, x + 0.1, p.minZ, p.maxZ, 0, 3.8)
    kit.block(statics, '#e2b55a', p.minX + 0.5, p.minX + 2, p.minZ + 0.3, p.maxZ - 0.3, 1.35, 2.15, 'soft')
    kit.block(statics, '#c9a24a', p.minX + 0.9, p.minX + 1.6, p.minZ + 0.35, p.maxZ - 0.35, 2.1, 2.3, 'soft')
    for (const [dx, y, color, r, h] of [
      [2.6, 1.35, '#d9363e', 0.3, 0.7],
      [3.4, 1.35, '#d9363e', 0.3, 0.7],
      [4.6, 1.35, '#f2f2ea', 0.4, 0.9],
      [0.9, 2.55, '#e8c060', 0.35, 0.8],
      [1.8, 2.55, '#8a5a8a', 0.35, 0.8],
      [3.2, 2.55, '#c74a3a', 0.45, 0.75],
      [4.4, 2.55, '#5b7fb0', 0.3, 0.6],
      [1.4, 3.75, '#6cbf4a', 0.35, 0.6],
      [2.8, 3.75, '#f2f2ea', 0.4, 0.9]
    ] as const) {
      kit.add(statics, 'cylinder', color, [p.minX + dx, y + h / 2, (p.minZ + p.maxZ) / 2], [r, h, r])
      kit.add(statics, 'cylinder', '#9aa3a8', [p.minX + dx, y + h + 0.04, (p.minZ + p.maxZ) / 2], [r, 0.08, r])
    }
  }
  // Washroom.
  {
    const w = mid(solid('washer'))
    statics.add(props.washer(kit, w.x, w.z))
    statics.add(props.laundryBasket(kit, 34, 14))
    const v = mid(solid('vanity'))
    statics.add(props.vanity(kit, v.x, v.z, v.w, v.d, 18.25))
  }
  // Genkan, bath, washitsu, study.
  {
    const rack = roof('shoerack')
    const r = mid(rack)
    statics.add(props.shoeRack(kit, r.x, DOMA_DEPTH, r.z, r.w, fadeLight))
    // Shoes left on the earth floor, and the umbrella stand with two furled umbrellas.
    statics.add(props.shoes(kit, -27.5, DOMA_DEPTH, -28, '#2d2d2d', Math.PI, 1.1))
    statics.add(props.shoes(kit, -24.8, DOMA_DEPTH, -27.8, '#e8455a', Math.PI - 0.2, 0.75))
    statics.add(props.shoes(kit, -36.5, DOMA_DEPTH, -29, '#c9b8a0', Math.PI / 2))
    kit.add(statics, 'cylinder', '#3f6b8a', [-23, DOMA_DEPTH + 1.1, -34.5], [0.8, 2.2, 0.8])
    kit.add(statics, 'torus', '#2f5068', [-23, DOMA_DEPTH + 2.2, -34.5], [0.8, 0.8, 0.5], [Math.PI / 2, 0, 0])
    for (const [dx, color] of [
      [-0.3, '#d9363e'],
      [0.35, '#2f7fe0']
    ] as const) {
      const umbrella = new THREE.Group()
      umbrella.position.set(-23 + dx, DOMA_DEPTH + 0.4, -34.5 + dx)
      umbrella.rotation.set(0.15, 0, dx)
      kit.add(umbrella, 'cylinder', '#2b2b2b', [0, 2.2, 0], [0.06, 4.4, 0.06])
      kit.add(umbrella, 'cone', color, [0, 2.2, 0], [0.3, 3.2, 0.3], [Math.PI, 0, 0])
      kit.add(umbrella, 'torus', '#5a3a22', [0.2, 4.45, 0], [0.2, 0.2, 0.25], [0, 0, 0])
      statics.add(umbrella)
    }
    kit.block(statics, '#c46a5a', -36, -26, -25.5, -22, 0, 0.04) // genkan mat
    for (const x of [-37.6, -38.6])
      kit.add(statics, 'sphere', x < -38 ? '#5a6a8a' : '#8a6a4a', [x, 3.4, -10], [0.9, 1.8, 1]) // coats
    const tub = mid(solid('tub'))
    statics.add(props.bathtub(kit, tub.x, tub.z, tub.w, tub.d, 2.4))
    statics.add(props.bathStool(kit, -10, -30.5))
    const toilet = mid(solid('toilet'))
    statics.add(props.toilet(kit, toilet.x, toilet.z))
    kit.add(statics, 'cylinder', '#d9d2c4', [-6.5, 0.9, -17], [1.1, 1.8, 1.1]) // laundry hamper
    statics.add(props.zabuton(kit, 8, -28))
    const chabudai = mid(roof('chabudai'))
    statics.add(props.table(kit, chabudai.x, chabudai.z, chabudai.w, chabudai.d, 1.2, fadeWood))
    const tansu = mid(solid('tansu'))
    statics.add(props.tansu(kit, tansu.x, tansu.z, tansu.w, tansu.d, 4))
    const desk = mid(roof('desk'))
    statics.add(props.table(kit, desk.x, desk.z, desk.w, desk.d, 2.3, fadeDark))
    statics.add(props.computer(kit, desk.x, 2.6, desk.z))
    const shelf = mid(solid('bookshelf'))
    statics.add(props.bookshelf(kit, shelf.x, shelf.z, shelf.w, shelf.d, 6))
  }
  // Garden: the engawa deck, shed, dog house, clothesline, hedges and the gap under the fence.
  {
    const deck = roof('engawa')
    kit.block(garden, fadeWood, deck.minX, deck.maxX, deck.minZ, deck.maxZ, 1, 1.3)
    for (let z = deck.minZ + 0.6; z < deck.maxZ; z += 0.6)
      kit.block(garden, fadeDark, deck.minX, deck.maxX, z - 0.03, z + 0.03, 1.3, 1.31)
    for (let x = deck.minX + 0.5; x < deck.maxX; x += 4)
      kit.block(garden, '#7a5236', x, x + 0.3, deck.maxZ - 0.5, deck.maxZ - 0.2, 0, 1)
    const shed = mid(roof('shed'))
    garden.add(props.shed(kit, shed.x, shed.z, shed.w, shed.d))
    const dog = mid(solid('doghouse'))
    garden.add(props.dogHouse(kit, dog.x, dog.z))
    for (const x of [17, 35]) kit.add(garden, 'cylinder', '#9aa0a6', [x, 3.5, 36], [0.15, 7, 0.15])
    kit.add(garden, 'cylinder', '#e0e0e0', [26, 6.6, 36], [0.04, 18, 0.04], [0, 0, Math.PI / 2])
    for (const [x, color] of [
      [20, '#7fa7d9'],
      [24, '#f2f2f2'],
      [28, '#e97f8c'],
      [32, '#f2d16b']
    ] as const)
      kit.block(garden, color, x - 1.4, x + 1.4, 35.9, 36.1, 4.2, 6.6)
    for (const bush of BUSHES) if (bush.z > 24.5) garden.add(props.hedge(kit, bush.x, bush.z, bush.r))
    const gap = roof('fencegap')
    kit.block(garden, '#2a1f18', gap.minX, gap.maxX, 56, 56.5, -0.1, 0.02)
  }
  const baked = [kit.bake(statics), kit.bake(garden)]
  root.add(...baked)

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
      for (const group of baked) group.children.forEach((child) => (child as THREE.Mesh).geometry.dispose())
      kit.dispose()
      root.removeFromParent()
    }
  }
}
