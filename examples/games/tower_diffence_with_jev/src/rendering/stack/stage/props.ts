import type { FieldId } from '../../../game/model'
import type { StackDesign } from '../StackDesign'
import type { StackKit } from '../StackModel'
import type { VoxelPart } from '../Voxel'

/** Static scenery is a single-part stack with an optional gentle sway. */
function prop(
  id: string,
  colors: Record<string, string>,
  build: (part: VoxelPart, kit: StackKit) => void,
  options: { voxel?: number; shadow?: readonly [number, number]; sway?: number } = {}
): StackDesign {
  const sway = options.sway ?? 0
  return {
    type: `prop:${id}`,
    voxel: options.voxel ?? 2,
    walkDistance: 1,
    shadow: options.shadow ?? [6, 5],
    blueprint: {
      id,
      colors,
      layerCopies: 2,
      build(kit) {
        build(kit.part('body'), kit)
      }
    },
    pose: (input) =>
      sway
        ? {
            body: {
              rz: Math.sin(input.time * 1.1 + input.seed * 9) * sway,
              rx: Math.cos(input.time * 0.8 + input.seed * 5) * sway
            }
          }
        : {}
  }
}

const hash = (x: number, y: number, z: number) => {
  let h = (x * 73856093) ^ (y * 19349663) ^ (z * 83492791)
  h = Math.imul(h ^ (h >>> 13), 1274126177)
  return ((h ^ (h >>> 16)) >>> 0) / 4294967295
}

// ---------- meadow ----------
const oak = prop(
  'oak',
  {
    bark: '#7a5233',
    barkDark: '#5a3b24',
    leaf: '#4f9a3e',
    leafLight: '#7cc458',
    leafDark: '#3a7a33',
    apple: '#e8503a'
  },
  (p) => {
    p.cylinder(0.5, 0.5, 0, 9, 1.8, 1.4, 'bark').box([-2, 0, -1], [2, 0, 1], 'barkDark')
    for (const [x, y, z, r] of [
      [0, 14, 0, 6.5],
      [-4, 12, 2, 4.4],
      [4, 12, -2, 4.6],
      [1, 18, -1, 4.4],
      [-2, 12, -4, 4]
    ])
      p.ellipsoid([x + 0.5, y, z + 0.5], [r, r * 0.8, r], 'leaf')
    p.paint((x, y, z) =>
      y > 14 && hash(x, y, z) > 0.45 ? 'leafLight' : y < 11 && hash(x, y, z) > 0.4 ? 'leafDark' : undefined
    )
    p.paint((x, y, z) => (y > 10 && hash(x, z, y) > 0.985 ? 'apple' : undefined))
  },
  { shadow: [9, 8], sway: 0.012 }
)
const pine = prop(
  'pine',
  { bark: '#6b4a2e', needle: '#2f7a4a', needleLight: '#4ea062', needleDark: '#245e3a' },
  (p) => {
    p.cylinder(0.5, 0.5, 0, 5, 1.3, 1.1, 'bark')
    for (let tier = 0; tier < 4; tier++)
      p.cylinder(0.5, 0.5, 4 + tier * 4, 10 + tier * 4, 6 - tier * 1.2, 0.8, 'needle')
    p.paint((x, y, z) => (hash(x, y, z) > 0.7 ? 'needleLight' : (x + z) % 4 === 0 ? 'needleDark' : undefined))
  },
  { shadow: [7, 6], sway: 0.01 }
)
const bush = prop(
  'bush',
  { leaf: '#5aa048', leafLight: '#86c95e', berry: '#f2d14c' },
  (p) => {
    p.ellipsoid([0.5, 2.5, 0.5], [4, 3, 3.6], 'leaf').ellipsoid([3, 2, 1], [2.6, 2.2, 2.4], 'leaf')
    p.paint((x, y, z) => (y >= 3 && hash(x, y, z) > 0.5 ? 'leafLight' : hash(z, x, y) > 0.93 ? 'berry' : undefined))
  },
  { shadow: [5, 4] }
)
const mossRock = prop(
  'moss-rock',
  { stone: '#8d8f86', stoneDark: '#686a63', moss: '#6fa64a' },
  (p) => {
    p.ellipsoid([0.5, 1.5, 0.5], [4.6, 3.4, 3.8], 'stone').ellipsoid([3.5, 1, -1], [2.4, 2, 2.4], 'stone')
    p.paint((x, y, z) => (y >= 3 ? (hash(x, y, z) > 0.4 ? 'moss' : undefined) : y <= 0 ? 'stoneDark' : undefined))
  },
  { shadow: [5, 4] }
)
const mushrooms = prop(
  'mushrooms',
  { stem: '#f2e6cc', cap: '#d9503f', spot: '#fff6ee', cap2: '#e8a04a' },
  (p) => {
    for (const [x, z, h, r, c] of [
      [0, 0, 4, 2.4, 'cap'],
      [3, 2, 3, 1.6, 'cap2'],
      [-2, 2, 2, 1.3, 'cap']
    ] as const) {
      p.box([x, 0, z], [x, h - 1, z], 'stem')
      p.ellipsoid([x + 0.5, h, z + 0.5], [r, 1.1, r], c)
    }
    p.set(0, 5, 0, 'spot').set(-1, 4, 1, 'spot')
  },
  { shadow: [4, 3] }
)

// ---------- desert ----------
const cactus = prop(
  'cactus',
  { green: '#5f9e54', light: '#86c070', dark: '#457a3e', flower: '#f27fa6' },
  (p) => {
    p.cylinder(0.5, 0.5, 0, 16, 2.2, 2, 'green')
    p.segment([2.5, 7, 0.5], [5.5, 7, 0.5], 1.3, 'green').cylinder(5.5, 0.5, 7, 12, 1.4, 1.2, 'green')
    p.segment([-1.5, 5, 0.5], [-4.5, 5, 0.5], 1.2, 'green').cylinder(-4.5, 0.5, 5, 9, 1.2, 1, 'green')
    p.paint((x, y, z) => ((x + z) % 2 === 0 ? 'light' : (x - z) % 3 === 0 ? 'dark' : undefined))
    p.box([0, 17, 0], [0, 17, 0], 'flower')
  },
  { shadow: [5, 4] }
)
const sandstone = prop(
  'sandstone',
  { rock: '#d29b62', band: '#b97d4a', light: '#ecc28a' },
  (p) => {
    p.cylinder(0.5, 0.5, 0, 12, 4.8, 3.2, 'rock').ellipsoid([0.5, 12, 0.5], [3.6, 1.6, 3.6], 'rock')
    p.paint((x, y) => (y % 4 === 1 ? 'band' : y > 11 ? 'light' : undefined))
  },
  { shadow: [6, 5] }
)
const dryShrub = prop(
  'dry-shrub',
  { twig: '#9c7a4a', twigLight: '#c7a46a' },
  (p) => {
    for (let i = 0; i < 7; i++) {
      const a = (i / 7) * Math.PI * 2
      p.segment(
        [0.5, 0, 0.5],
        [0.5 + Math.sin(a) * 4, 4 + (i % 3), 0.5 + Math.cos(a) * 4],
        0.5,
        i % 2 ? 'twig' : 'twigLight'
      )
    }
  },
  { shadow: [4, 3] }
)
const skull = prop(
  'bones',
  { bone: '#f1e8d2', shade: '#cfc2a2', hole: '#3a2c22' },
  (p) => {
    p.ellipsoid([0.5, 2, 0.5], [2.4, 2, 2.2], 'bone')
      .box([-1, 1, 2], [0, 1, 2], 'hole')
      .box([1, 1, 2], [2, 1, 2], 'hole')
    p.segment([-4, 0.5, -2], [4, 0.5, -3], 0.6, 'shade')
  },
  { shadow: [4, 3] }
)

// ---------- frost ----------
const snowPine = prop(
  'snow-pine',
  { bark: '#5e4632', needle: '#2e6e5c', snow: '#f5fafd', snowShade: '#cfe0ea' },
  (p) => {
    p.cylinder(0.5, 0.5, 0, 5, 1.3, 1.1, 'bark')
    for (let tier = 0; tier < 4; tier++)
      p.cylinder(0.5, 0.5, 4 + tier * 4, 10 + tier * 4, 6 - tier * 1.2, 0.8, 'needle')
    p.paint((x, y, z) =>
      !p.has(x, y + 1, z) && hash(x, y, z) > 0.15 ? 'snow' : (x + z + y) % 5 === 0 ? 'snowShade' : undefined
    )
  },
  { shadow: [7, 6] }
)
const iceCrystal = prop(
  'ice-crystal',
  { '*ice': '#bff3ff', ice: '#8fd8ea', iceDark: '#5fb0cc' },
  (p) => {
    for (const [x, z, h, lean] of [
      [0, 0, 12, 0],
      [3, 1, 8, 0.25],
      [-2, 2, 7, -0.3],
      [1, -3, 6, 0.1]
    ])
      p.segment([x + 0.5, 0, z + 0.5], [x + 0.5 + lean * h, h, z + 0.5], 1.7, 'ice', 0.4)
    p.paint((x, y, z) => (hash(x, y, z) > 0.75 ? '*ice' : y < 2 ? 'iceDark' : undefined))
  },
  { shadow: [5, 4] }
)
const snowRock = prop(
  'snow-rock',
  { stone: '#7d8794', stoneDark: '#5b6470', snow: '#f4f9fc' },
  (p) => {
    p.ellipsoid([0.5, 1.5, 0.5], [4.4, 3.4, 3.8], 'stone')
    p.paint((x, y, z) => (!p.has(x, y + 1, z) && y >= 2 ? 'snow' : y <= 0 ? 'stoneDark' : undefined))
  },
  { shadow: [5, 4] }
)
const snowman = prop(
  'snowman',
  { snow: '#f6fbff', shade: '#d6e4ee', coal: '#2a2a33', carrot: '#f08a3a', scarf: '#d8553a' },
  (p) => {
    p.ellipsoid([0.5, 3, 0.5], [3.4, 3, 3.4], 'snow').ellipsoid([0.5, 7.5, 0.5], [2.4, 2.2, 2.4], 'snow')
    p.paint((x, y) => (y <= 1 ? 'shade' : undefined))
    p.face(-1, 8, 'coal').face(1, 8, 'coal').face(0, 7, 'carrot', '+z', 1, 2)
    p.fill([-3, 5, -3], [3, 5, 3], 'scarf', (x, y, z) => Math.hypot(x - 0.5, z - 0.5) <= 2.4)
  },
  { shadow: [4, 3] }
)

// ---------- volcanic ----------
const basalt = prop(
  'basalt',
  { rock: '#3d3440', top: '#57495a', '*crack': '#ff7a3c' },
  (p) => {
    for (const [x, z, h] of [
      [0, 0, 11],
      [3, 1, 8],
      [-2, 2, 6],
      [1, -3, 9],
      [-3, -2, 5]
    ])
      p.box([x - 1, 0, z - 1], [x, h, z], 'rock').box([x - 1, h, z - 1], [x, h, z], 'top')
    p.paint((x, y, z) => (y < 3 && hash(x, y, z) > 0.88 ? '*crack' : undefined))
  },
  { shadow: [5, 4] }
)
const deadTree = prop(
  'dead-tree',
  { bark: '#3b2f2c', barkLight: '#5a4842', '*ember': '#ff9a4a' },
  (p) => {
    p.cylinder(0.5, 0.5, 0, 10, 1.6, 0.9, 'bark')
    p.segment([0.5, 7, 0.5], [4.5, 12, 1.5], 0.7, 'barkLight')
      .segment([0.5, 9, 0.5], [-3.5, 14, -0.5], 0.6, 'bark')
      .segment([0.5, 10, 0.5], [1, 15, -3], 0.5, 'barkLight')
    p.set(4, 12, 1, '*ember')
  },
  { shadow: [4, 3] }
)
const lavaVent = prop(
  'lava-vent',
  { rock: '#4a3d44', rim: '#6a5258', '*lava': '#ffb347', '*lavaHot': '#ff6a2a' },
  (p) => {
    p.fill([-5, 0, -5], [4, 3, 4], 'rock', (x, y, z) => {
      const r = Math.hypot(x - 0.5, z - 0.5)
      return r <= 4.6 - y * 0.4 && !(r < 1.8 && y > 0)
    })
    p.paint((x, y) => (y === 3 ? 'rim' : undefined))
    p.fill([-2, 1, -2], [2, 1, 2], '*lava', (x, y, z) => Math.hypot(x - 0.5, z - 0.5) <= 1.8)
    p.set(0, 1, 0, '*lavaHot')
  },
  { shadow: [5, 4] }
)

export type PropKind = 'tree' | 'rock' | 'small' | 'accent'
export const BIOME_PROPS: Record<FieldId, Record<PropKind, readonly StackDesign[]>> = {
  meadow: { tree: [oak, pine, oak], rock: [mossRock], small: [bush, mushrooms], accent: [bush] },
  desert: { tree: [cactus, cactus], rock: [sandstone], small: [dryShrub, skull], accent: [dryShrub] },
  frost: { tree: [snowPine], rock: [snowRock, iceCrystal], small: [iceCrystal, snowRock], accent: [snowman] },
  volcanic: { tree: [deadTree], rock: [basalt], small: [lavaVent, basalt], accent: [lavaVent] }
}
export const ALL_PROPS: readonly StackDesign[] = [
  ...new Set(Object.values(BIOME_PROPS).flatMap((kinds) => Object.values(kinds).flat()))
]
