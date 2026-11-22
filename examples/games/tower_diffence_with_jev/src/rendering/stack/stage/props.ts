import type { FieldId } from '../../../game/model'
import type { StackDesign } from '../StackDesign'
import type { StackKit } from '../StackModel'
import type { VoxelPart } from '../Voxel'

/**
 * Static scenery on the unified voxel=2 art-pixel grid (zero fractional scaling, zero random speckle).
 * Hero trees are authored taller than soldiers (~26–30 slices) with clean directional NW highlights.
 */
function prop(
  id: string,
  colors: Record<string, string>,
  build: (part: VoxelPart, kit: StackKit) => void,
  options: { shadow?: readonly [number, number]; sway?: number } = {}
): StackDesign {
  const sway = options.sway ?? 0
  return {
    type: `prop:${id}`,
    voxel: 2,
    walkDistance: 1,
    shadow: options.shadow ?? [7, 6],
    blueprint: {
      id,
      colors,
      layerCopies: 1,
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

// ---------- meadow ----------
const oak = prop(
  'oak',
  {
    bark: '#70492c',
    barkDark: '#4a2f1b',
    leaf: '#3e8536',
    leafLight: '#69b04a',
    leafDark: '#295e28',
    apple: '#e04634'
  },
  (p) => {
    // Tall hero oak (30 slices) towering over soldiers with sculpted multi-lobed canopy & clean NW light.
    p.cylinder(0.5, 0.5, 0, 12, 2.5, 1.8, 'bark')
      .box([-3, 0, -2], [3, 1, 2], 'barkDark')
      .box([-2, 0, -3], [2, 1, 3], 'barkDark')
    for (const [x, y, z, rx, ry] of [
      [0, 19, 0, 9.2, 7.2],
      [-5.5, 16, 2.5, 5.8, 4.8],
      [5.5, 16, -2.5, 6.0, 5.0],
      [-2.5, 17, -5.0, 5.4, 4.6],
      [2.5, 16, 4.8, 5.2, 4.4],
      [-1.0, 24, -0.5, 6.2, 4.8]
    ])
      p.ellipsoid([x + 0.5, y, z + 0.5], [rx, ry, rx], 'leaf')
    p.paint((x, y, z) =>
      y >= 21 && x <= 1 && z >= -3
        ? 'leafLight'
        : y >= 17 && x <= -4 && z >= 0
          ? 'leafLight'
          : y <= 14 && (x > 1 || z < -1)
            ? 'leafDark'
            : undefined
    )
    // Intentional crisp 2x2 apples nestled on sunlit lobes (no 1px noise).
    p.box([-5, 17, 6], [-4, 18, 6], 'apple').box([3, 19, 6], [4, 20, 6], 'apple')
  },
  { shadow: [12, 10], sway: 0.01 }
)

const oakYoung = prop(
  'oak-young',
  {
    bark: '#70492c',
    barkDark: '#4a2f1b',
    leaf: '#458f3b',
    leafLight: '#71b851',
    leafDark: '#2d662b'
  },
  (p) => {
    p.cylinder(0.5, 0.5, 0, 9, 1.8, 1.4, 'bark').box([-2, 0, -2], [2, 0, 2], 'barkDark')
    for (const [x, y, z, r] of [
      [0, 14, 0, 6.6],
      [-4, 12, 2, 4.4],
      [4, 12, -2, 4.4],
      [0, 18, 0, 4.5]
    ])
      p.ellipsoid([x + 0.5, y, z + 0.5], [r, r * 0.82, r], 'leaf')
    p.paint((x, y, z) => (y >= 16 && x <= 1 ? 'leafLight' : y <= 11 && x > 0 ? 'leafDark' : undefined))
  },
  { shadow: [9, 8], sway: 0.012 }
)

const pine = prop(
  'pine',
  { bark: '#614128', needle: '#296b42', needleLight: '#49945a', needleDark: '#1c4d31' },
  (p) => {
    p.cylinder(0.5, 0.5, 0, 8, 1.8, 1.4, 'bark')
    for (let tier = 0; tier < 4; tier++) {
      const y0 = 6 + tier * 5
      const r0 = 8.4 - tier * 1.65
      p.cylinder(0.5, 0.5, y0, y0 + 8, r0, 1.0, 'needle')
    }
    // Crisp directional NW foliage highlight + tier underside shadow (zero random hash speckle).
    p.paint((x, y, z) => {
      if (y < 6) return undefined
      const inTier = (y - 6) % 5
      if (inTier === 0) return 'needleDark'
      if (x <= -1 && z >= -2 && inTier >= 2) return 'needleLight'
      if (x >= 3 && z < 0) return 'needleDark'
      return undefined
    })
  },
  { shadow: [10, 8], sway: 0.008 }
)

const bush = prop(
  'bush',
  { leaf: '#4b8f3e', leafLight: '#76bd53', leafDark: '#30662a', berry: '#f2c844' },
  (p) => {
    p.ellipsoid([0.5, 3, 0.5], [5.2, 3.6, 4.6], 'leaf').ellipsoid([3.8, 2.5, 1.2], [3.4, 2.8, 3.2], 'leaf')
    p.paint((x, y) => (y >= 4 && x <= 1 ? 'leafLight' : y <= 1 ? 'leafDark' : undefined))
    p.box([-2, 4, 4], [-1, 5, 4], 'berry').box([3, 3, 4], [4, 4, 4], 'berry')
  },
  { shadow: [6, 5] }
)

const mossRock = prop(
  'moss-rock',
  { stone: '#83877e', stoneDark: '#5b5e58', stoneLight: '#a9ada3', moss: '#5c9440' },
  (p) => {
    p.ellipsoid([0.5, 2, 0.5], [5.6, 4.0, 4.6], 'stone').ellipsoid([4.2, 1.4, -1], [3.2, 2.6, 3.0], 'stone')
    p.paint((x, y, z) =>
      y >= 4 && !p.has(x, y + 1, z)
        ? 'moss'
        : y >= 3 && x < 0 && z > 0
          ? 'stoneLight'
          : y <= 1
            ? 'stoneDark'
            : undefined
    )
  },
  { shadow: [7, 5] }
)

const stump = prop(
  'stump',
  { bark: '#6b4528', barkDark: '#472c18', ring: '#d9b884', ringDark: '#b38f5b', cap: '#d9483b', spot: '#fff5e6' },
  (p) => {
    p.cylinder(0.5, 0.5, 0, 5, 3.6, 3.0, 'bark').box([-4, 0, -2], [4, 0, 2], 'barkDark')
    p.fill([-3, 5, -3], [3, 5, 3], 'ring', (x, y, z) => Math.hypot(x - 0.5, z - 0.5) <= 2.6)
    p.set(0, 5, 0, 'ringDark').set(1, 5, 0, 'ringDark')
    // Tiny cute red toadstool growing beside the stump.
    p.box([4, 0, 2], [4, 1, 2], 'ring').box([3, 2, 1], [5, 3, 3], 'cap').set(4, 3, 2, 'spot')
  },
  { shadow: [5, 4] }
)

const mushrooms = prop(
  'mushrooms',
  { stem: '#f0e2c6', cap: '#d44839', spot: '#fff7ed', cap2: '#e39a42' },
  (p) => {
    for (const [x, z, h, r, c] of [
      [0, 0, 5, 3.0, 'cap'],
      [3, 2, 4, 2.0, 'cap2'],
      [-3, 2, 3, 1.7, 'cap']
    ] as const) {
      p.box([x, 0, z], [x + 1, h - 1, z], 'stem')
      p.ellipsoid([x + 0.5, h, z + 0.5], [r, 1.4, r], c)
    }
    p.box([0, 6, 0], [1, 6, 0], 'spot').set(-1, 5, 1, 'spot')
  },
  { shadow: [5, 4] }
)

// ---------- desert ----------
const desertPalm = prop(
  'desert-palm',
  {
    trunk: '#8c5e34',
    trunkBand: '#633f20',
    frond: '#4e8a42',
    frondLight: '#7ab85c',
    frondDark: '#33612c',
    coconut: '#5c381c'
  },
  (p) => {
    // Graceful curved desert oasis palm (26 slices tall) giving desert a true hero tree silhouette!
    for (let y = 0; y <= 18; y++) {
      const leanX = Math.sin((y / 18) * 1.2) * 2.5
      p.cylinder(leanX, 0, y, y, 2.1 - y * 0.04, 2.1 - y * 0.04, y % 3 === 0 ? 'trunkBand' : 'trunk')
    }
    const tx = Math.sin(1.2) * 2.5
    p.box([Math.round(tx) - 1, 17, -1], [Math.round(tx) + 1, 18, 1], 'coconut')
    // Six arching palm fronds radiating outward from crown.
    for (let i = 0; i < 6; i++) {
      const a = (i / 6) * Math.PI * 2 + 0.3
      const dx = Math.cos(a),
        dz = Math.sin(a)
      p.segment([tx, 19, 0], [tx + dx * 6, 22, dz * 6], 1.7, i % 2 === 0 ? 'frondLight' : 'frond', 1.3)
      p.segment([tx + dx * 6, 22, dz * 6], [tx + dx * 10.5, 18.5, dz * 10.5], 1.2, 'frond', 0.6)
    }
  },
  { shadow: [10, 8], sway: 0.012 }
)

const cactus = prop(
  'cactus',
  { green: '#4d8c45', light: '#76b562', dark: '#346630', flower: '#f0739c' },
  (p) => {
    p.cylinder(0.5, 0.5, 0, 21, 2.6, 2.3, 'green')
    p.segment([2.5, 9, 0.5], [6.5, 9, 0.5], 1.7, 'green').cylinder(6.5, 0.5, 9, 16, 1.8, 1.5, 'green')
    p.segment([-1.5, 6, 0.5], [-5.5, 6, 0.5], 1.6, 'green').cylinder(-5.5, 0.5, 6, 13, 1.6, 1.4, 'green')
    // Clean vertical fluted saguaro ribs instead of noisy checkerboard.
    p.paint((x, y, z) => (x <= -1 && z >= 0 ? 'light' : x >= 2 && z < 0 ? 'dark' : undefined))
    p.box([0, 22, 0], [1, 22, 1], 'flower')
  },
  { shadow: [7, 6] }
)

const sandstone = prop(
  'sandstone',
  { rock: '#bd834d', band: '#966134', light: '#deab72' },
  (p) => {
    p.cylinder(0.5, 0.5, 0, 16, 6.2, 4.2, 'rock').ellipsoid([0.5, 16, 0.5], [4.6, 2.0, 4.6], 'light')
    p.paint((x, y) => (y % 4 === 1 ? 'band' : y >= 15 ? 'light' : undefined))
  },
  { shadow: [8, 6] }
)

const dryShrub = prop(
  'dry-shrub',
  { twig: '#8c693e', twigLight: '#b8925a' },
  (p) => {
    for (let i = 0; i < 7; i++) {
      const a = (i / 7) * Math.PI * 2
      p.segment(
        [0.5, 0, 0.5],
        [0.5 + Math.sin(a) * 5, 5 + (i % 3), 0.5 + Math.cos(a) * 5],
        0.7,
        i % 2 ? 'twig' : 'twigLight'
      )
    }
  },
  { shadow: [5, 4] }
)

const skull = prop(
  'bones',
  { bone: '#efe4cc', shade: '#c4b495', hole: '#38291f' },
  (p) => {
    p.ellipsoid([0.5, 2.5, 0.5], [3.0, 2.4, 2.8], 'bone')
      .box([-2, 1, 3], [-1, 2, 3], 'hole')
      .box([1, 1, 3], [2, 2, 3], 'hole')
    p.segment([-5, 0.5, -2], [5, 0.5, -3], 0.8, 'shade')
  },
  { shadow: [5, 4] }
)

// ---------- frost ----------
const snowPine = prop(
  'snow-pine',
  { bark: '#59402c', needle: '#266152', needleDark: '#184238', snow: '#edf6fc', snowShade: '#b8cfe0' },
  (p) => {
    // Tall snow-laden hero pine (30 slices) with crisp layered snow mantles & ZERO random speckle!
    p.cylinder(0.5, 0.5, 0, 8, 1.8, 1.4, 'bark')
    for (let tier = 0; tier < 4; tier++) {
      const y0 = 6 + tier * 5
      const r0 = 8.4 - tier * 1.65
      p.cylinder(0.5, 0.5, y0, y0 + 8, r0, 1.0, 'needle')
    }
    p.paint((x, y, z) => {
      if (y < 6) return undefined
      if (!p.has(x, y + 1, z)) return x >= 2 && z < 0 ? 'snowShade' : 'snow'
      if (!p.has(x, y + 2, z) && x < 1) return 'snow'
      if ((y - 6) % 5 === 0) return 'needleDark'
      return undefined
    })
  },
  { shadow: [10, 8], sway: 0.008 }
)

const snowPineYoung = prop(
  'snow-pine-young',
  { bark: '#59402c', needle: '#266152', snow: '#edf6fc', snowShade: '#b8cfe0' },
  (p) => {
    p.cylinder(0.5, 0.5, 0, 5, 1.4, 1.1, 'bark')
    for (let tier = 0; tier < 3; tier++)
      p.cylinder(0.5, 0.5, 4 + tier * 5, 10 + tier * 5, 6.2 - tier * 1.5, 0.9, 'needle')
    p.paint((x, y, z) => (y >= 4 && !p.has(x, y + 1, z) ? (x > 1 ? 'snowShade' : 'snow') : undefined))
  },
  { shadow: [8, 6], sway: 0.01 }
)

const iceCrystal = prop(
  'ice-crystal',
  { '*ice': '#ccf6ff', ice: '#7ecce6', iceDark: '#4893b5' },
  (p) => {
    for (const [x, z, h, lean] of [
      [0, 0, 15, 0],
      [3.5, 1, 10, 0.25],
      [-3, 2, 9, -0.3],
      [1, -3.5, 8, 0.1]
    ])
      p.segment([x + 0.5, 0, z + 0.5], [x + 0.5 + lean * h, h, z + 0.5], 2.1, 'ice', 0.45)
    p.paint((x, y, z) => (y >= 9 && x <= 0 ? '*ice' : y <= 2 ? 'iceDark' : undefined))
  },
  { shadow: [6, 5] }
)

const snowRock = prop(
  'snow-rock',
  { stone: '#6f7c8c', stoneDark: '#4c5766', snow: '#edf6fc' },
  (p) => {
    p.ellipsoid([0.5, 2, 0.5], [5.4, 4.0, 4.4], 'stone')
    p.paint((x, y, z) => (!p.has(x, y + 1, z) && y >= 2 ? 'snow' : y <= 1 ? 'stoneDark' : undefined))
  },
  { shadow: [7, 5] }
)

const snowman = prop(
  'snowman',
  { snow: '#eef7fc', shade: '#bfd3e3', coal: '#252530', carrot: '#f08232', scarf: '#d64738' },
  (p) => {
    p.ellipsoid([0.5, 3.5, 0.5], [4.0, 3.5, 4.0], 'snow').ellipsoid([0.5, 8.8, 0.5], [2.9, 2.7, 2.9], 'snow')
    p.paint((x, y) => (y <= 1 ? 'shade' : undefined))
    p.face(-1, 9, 'coal').face(1, 9, 'coal').face(0, 8, 'carrot', '+z', 1, 2)
    p.fill([-3, 6, -3], [3, 6, 3], 'scarf', (x, y, z) => Math.hypot(x - 0.5, z - 0.5) <= 3.0)
  },
  { shadow: [5, 4] }
)

// ---------- volcanic ----------
const deadTree = prop(
  'dead-tree',
  { bark: '#362a2a', barkLight: '#594542', emberRim: '#c94c24', '*ember': '#ff9938' },
  (p) => {
    // Tall charred dead tree (24 slices) with warm glowing ember tips & fissures so it pops off dark basalt!
    p.cylinder(0.5, 0.5, 0, 14, 2.3, 1.3, 'bark').box([-3, 0, -2], [3, 1, 2], 'bark')
    p.segment([0.5, 10, 0.5], [6.5, 17, 2], 1.1, 'barkLight', 0.6)
      .segment([0.5, 12, 0.5], [-5.5, 20, -1], 1.0, 'barkLight', 0.55)
      .segment([0.5, 13, 0.5], [1.5, 22, -4.5], 0.9, 'barkLight', 0.5)
    // Glowing ember crown tips & trunk fissure rim-light.
    p.box([6, 17, 1], [7, 18, 2], '*ember')
      .box([-6, 20, -1], [-5, 21, 0], '*ember')
      .box([1, 22, -5], [2, 23, -4], '*ember')
      .box([-1, 3, 2], [0, 8, 2], 'emberRim')
  },
  { shadow: [8, 6] }
)

const basalt = prop(
  'basalt',
  { rock: '#3b3240', top: '#69566b', rim: '#b84221', '*crack': '#ff8533' },
  (p) => {
    for (const [x, z, h] of [
      [0, 0, 16],
      [3.5, 1, 12],
      [-3, 2, 9],
      [1, -3.5, 13],
      [-3.5, -2.5, 7]
    ]) {
      p.box([Math.round(x) - 1, 0, Math.round(z) - 1], [Math.round(x) + 1, h, Math.round(z) + 1], 'rock')
      p.box([Math.round(x) - 1, h, Math.round(z) - 1], [Math.round(x) + 1, h, Math.round(z) + 1], 'top')
    }
    // Warm molten ember seam hugging the base of the basalt columns so they glow crisply against dark ash!
    p.box([-2, 1, 2], [2, 2, 2], '*crack').box([-3, 0, -3], [3, 0, 3], 'rim')
  },
  { shadow: [7, 6] }
)

const lavaVent = prop(
  'lava-vent',
  { rock: '#473a45', rim: '#78575c', '*lava': '#ffd24d', '*lavaHot': '#ff6a24' },
  (p) => {
    p.fill([-6, 0, -6], [5, 5, 5], 'rock', (x, y, z) => {
      const r = Math.hypot(x - 0.5, z - 0.5)
      return r <= 5.6 - y * 0.45 && !(r < 2.2 && y > 0)
    })
    p.paint((x, y) => (y === 5 ? 'rim' : undefined))
    p.fill([-3, 2, -3], [3, 3, 3], '*lavaHot', (x, y, z) => Math.hypot(x - 0.5, z - 0.5) <= 2.4)
    p.box([0, 3, 0], [1, 3, 1], '*lava')
  },
  { shadow: [7, 6] }
)

export type PropKind = 'tree' | 'rock' | 'small' | 'accent'
export const BIOME_PROPS: Record<FieldId, Record<PropKind, readonly StackDesign[]>> = {
  meadow: {
    tree: [oak, pine, oakYoung, oak],
    rock: [mossRock],
    small: [bush, mushrooms, bush, stump],
    accent: [bush, stump, mushrooms]
  },
  desert: {
    tree: [desertPalm, cactus, desertPalm, cactus],
    rock: [sandstone],
    small: [dryShrub, skull, dryShrub],
    accent: [dryShrub, skull]
  },
  frost: {
    tree: [snowPine, snowPineYoung, snowPine],
    rock: [snowRock, iceCrystal],
    small: [iceCrystal, snowRock, iceCrystal],
    accent: [iceCrystal, snowRock, snowman, iceCrystal, snowRock]
  },
  volcanic: {
    tree: [deadTree],
    rock: [basalt],
    small: [lavaVent, basalt, lavaVent],
    accent: [lavaVent, basalt]
  }
}
export const ALL_PROPS: readonly StackDesign[] = [
  ...new Set(Object.values(BIOME_PROPS).flatMap((kinds) => Object.values(kinds).flat()))
]
