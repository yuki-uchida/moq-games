/**
 * The one master palette every sprite, tile and effect is painted with (index 0 = transparent).
 * Ramps are hue-shifted: shadows lean blue/purple and lose saturation, highlights lean warm.
 * Each ramp is [highlight, base, shade, deep, line]; `line` is the darkest outline colour of that material.
 * Characters use saturated, high-contrast ramps; ground ramps are calmer so characters always read on top.
 */

const INK_COOL = '#1a1626'
const INK_WARM = '#2e1820'
const INK_GREEN = '#10261f'
const INK_BLUE = '#121b30'

const RAMP_HEX = {
  // Job colours: slime bodies and every hero's outfit accents.
  jobRed: ['#ffb59a', '#ec5b50', '#b8344a', '#7a1f45', INK_WARM],
  jobBlue: ['#a6dcff', '#4f8fe8', '#3858b8', '#2a357a', INK_COOL],
  jobGreen: ['#d4f59a', '#6cc95a', '#3a9455', '#22604a', INK_GREEN],
  jobGold: ['#fff3b8', '#f2c84a', '#cf8e2e', '#8a5226', INK_WARM],
  // Hero species.
  ratFur: ['#d8c8b8', '#a8927f', '#7a6560', '#4f4049', INK_COOL],
  ratPink: ['#ffd6d0', '#f0a0a0', '#c8707e', '#8a4a62', INK_WARM],
  crowFeather: ['#6c78a8', '#3a3f62', '#262a45', '#181a2e', '#0c0d18'],
  crowSheen: ['#c8b4ff', '#8f78d8', '#5e4fa0', '#3c3470', INK_COOL],
  beak: ['#ffe28a', '#f2b33d', '#c97a2a', '#80461f', INK_WARM],
  wolfFur: ['#d6dcea', '#9aa4bc', '#6b7390', '#454a66', INK_COOL],
  wolfCream: ['#fffaf0', '#ece2cf', '#c9bba8', '#948677', INK_WARM],
  paper: ['#ffffff', '#eef0f5', '#c8cbd8', '#8a8fa8', INK_COOL],
  // People of the adventurers' guild.
  skinLight: ['#ffe6cf', '#f6c49c', '#d9927a', '#a35f5d', INK_WARM],
  skinTan: ['#f7cfa4', '#d9a06e', '#b07250', '#76473d', INK_WARM],
  skinDark: ['#c99070', '#8f5b40', '#6a3f32', '#452a2a', INK_WARM],
  hairBrown: ['#c0875a', '#8a5636', '#5e3828', '#3c2422', INK_WARM],
  hairBlonde: ['#fff0a8', '#e8c060', '#bf8a3a', '#7d5428', INK_WARM],
  hairBlack: ['#5a5470', '#36324a', '#24212f', '#17151f', INK_COOL],
  hairRed: ['#ff9a6a', '#d0553a', '#9a3530', '#622228', INK_WARM],
  hairSilver: ['#f8f9fc', '#d8dbe6', '#a6abc0', '#6e7390', INK_COOL],
  clothCrimson: ['#f08a8a', '#c43c4c', '#8e2a44', '#5a1c36', INK_WARM],
  clothNavy: ['#7a90d0', '#3f509a', '#2c3770', '#1e244c', INK_COOL],
  clothForest: ['#9ad08a', '#4f8f52', '#356a45', '#22463a', INK_GREEN],
  clothOchre: ['#f0d080', '#c99a40', '#96692f', '#5e4026', INK_WARM],
  clothPurple: ['#c8a0e8', '#8a5cc0', '#613f92', '#3e2864', INK_COOL],
  clothWhite: ['#fdfcf8', '#e6e2da', '#bdb6b0', '#827a80', INK_COOL],
  clothBlack: ['#6a6680', '#403c52', '#2a2738', '#1a1824', INK_COOL],
  leather: ['#d9a06a', '#a46a40', '#74482e', '#4a2e24', INK_WARM],
  steel: ['#f0f4f8', '#b8c0cc', '#7d8698', '#4c5266', INK_COOL],
  gold: ['#fff6b0', '#f0c440', '#c08a28', '#7c5420', INK_WARM],
  wood: ['#d8a870', '#a87448', '#784e34', '#4e3226', INK_WARM],
  // Stage 1: meadow and ruins.
  grass: ['#a9cf72', '#7fac54', '#628d45', '#476b3b', INK_GREEN],
  grassDark: ['#86b55c', '#558f41', '#3d6c38', '#2a4f30', INK_GREEN],
  dirt: ['#e6cc94', '#c8a46c', '#a07c54', '#715642', INK_WARM],
  stone: ['#e4dece', '#bab29e', '#8e8679', '#605b59', INK_COOL],
  water: ['#b4eef4', '#62c3da', '#3c90ba', '#2b5f8c', INK_BLUE],
  // Stage 2: sewer and granary.
  brick: ['#bc8e7b', '#8f675a', '#684b49', '#47353b', INK_WARM],
  sewerStone: ['#9ea89e', '#76807a', '#58625f', '#3d4547', INK_COOL],
  sludge: ['#accb92', '#6f9c6b', '#4b7559', '#315147', INK_GREEN],
  hay: ['#fff1a4', '#e9c96a', '#c19b4a', '#8b6b37', INK_WARM],
  cheese: ['#fff4a6', '#f7d253', '#d9a13a', '#a16b2b', INK_WARM],
  // Stage 3: cliffs and clocktower.
  rock: ['#dccbb6', '#ab9b8a', '#7e7069', '#564b4d', INK_COOL],
  sky: ['#eaf7ff', '#aad9f9', '#72a9e1', '#4b79b9', INK_BLUE],
  roofTile: ['#ea9a82', '#ba624e', '#8b4541', '#5b2d35', INK_WARM],
  // Stage 4: moonlit forest and snow fort.
  nightLeaf: ['#5c8c8a', '#3b656a', '#294950', '#1b3139', INK_BLUE],
  nightGround: ['#5e6c82', '#47536a', '#353e54', '#252b3d', INK_COOL],
  snow: ['#ffffff', '#e5edf7', '#b9c7dd', '#8797b5', INK_COOL],
  ice: ['#eafcff', '#aae5f5', '#71b5d9', '#4b81b1', INK_BLUE],
  moon: ['#fffde2', '#f9eba2', '#d9c172', '#a18b51', INK_WARM],
  // Effects.
  fire: ['#fff8c2', '#ffc942', '#f17932', '#c13929', INK_WARM],
  magic: ['#e2f8ff', '#82d9ff', '#5189f1', '#5141c1', INK_COOL],
  holy: ['#fffffa', '#fff3b2', '#f7d172', '#d1a152', INK_WARM],
  poison: ['#e9ffa2', '#a9e152', '#71a142', '#49693b', INK_GREEN],
  shadow: ['#a189c9', '#6b5199', '#473571', '#2d2149', INK_COOL]
} as const

export type RampName = keyof typeof RAMP_HEX

const hexes: string[] = []
const indexOf = (hex: string) => {
  let i = hexes.indexOf(hex)
  if (i < 0) i = hexes.push(hex) - 1
  return i + 1
}

/** Palette indices of each ramp: [highlight, base, shade, deep, line]. */
export const R = Object.fromEntries(
  Object.entries(RAMP_HEX).map(([name, ramp]) => [name, ramp.map(indexOf)])
) as unknown as Record<RampName, readonly [number, number, number, number, number]>

/** Extra single colours. */
export const C = {
  inkCool: indexOf(INK_COOL),
  inkWarm: indexOf(INK_WARM),
  inkGreen: indexOf(INK_GREEN),
  inkBlue: indexOf(INK_BLUE),
  white: R.paper[0],
  /** Pure black for pupils and the deepest voids (pits). */
  black: indexOf('#08070c'),
  /** Warm glow for lamps and eyes in the dark. */
  glow: indexOf('#ffe9a0'),
  /** Cold glow for magic sparks. */
  spark: indexOf('#c8f4ff'),
  /** Blush on cheeks. */
  blush: indexOf('#ff8f9a')
}

/** RGBA hex of every palette index (index 0 is transparent). */
export const PALETTE: readonly string[] = ['#00000000', ...hexes]

if (PALETTE.length > 256) throw new Error(`Palette has ${PALETTE.length} entries; indexed rasters hold 256`)

export const PALETTE_RGBA: Uint8Array = (() => {
  const out = new Uint8Array(PALETTE.length * 4)
  PALETTE.forEach((hex, i) => {
    if (i === 0) return
    out[i * 4] = parseInt(hex.slice(1, 3), 16)
    out[i * 4 + 1] = parseInt(hex.slice(3, 5), 16)
    out[i * 4 + 2] = parseInt(hex.slice(5, 7), 16)
    out[i * 4 + 3] = 255
  })
  return out
})()

/** For outlining: the deep and line colour of whatever material a palette index belongs to. */
export const OUTLINE_OF: { deep: number; line: number }[] = (() => {
  const table = PALETTE.map(() => ({ deep: C.inkCool, line: C.inkCool }))
  for (const ramp of Object.values(R))
    for (const index of ramp) if (table[index].deep === C.inkCool) table[index] = { deep: ramp[3], line: ramp[4] }
  for (const ink of [C.inkCool, C.inkWarm, C.inkGreen, C.inkBlue, C.black]) table[ink] = { deep: ink, line: ink }
  return table
})()

/** One step darker within the same ramp (for back limbs and shading); line colours stay. */
export const DARKER: number[] = (() => {
  const table = PALETTE.map((_, i) => i)
  for (const ramp of Object.values(R))
    for (let i = 0; i < 4; i++) if (table[ramp[i]] === ramp[i]) table[ramp[i]] = ramp[i + 1]
  return table
})()

/** One step lighter within the same ramp (rim light); highlights stay. */
export const LIGHTER: number[] = (() => {
  const table = PALETTE.map((_, i) => i)
  for (const ramp of Object.values(R))
    for (let i = 1; i < 5; i++) if (table[ramp[i]] === ramp[i]) table[ramp[i]] = ramp[i - 1]
  return table
})()

export const rgbOf = (i: number): [number, number, number] => [
  PALETTE_RGBA[i * 4],
  PALETTE_RGBA[i * 4 + 1],
  PALETTE_RGBA[i * 4 + 2]
]

/** Nearest palette colour to an RGB value (for remapping effects such as dimming or tinting). */
export function nearest(r: number, g: number, b: number): number {
  let best = 1
  let bestD = Infinity
  for (let j = 1; j < PALETTE.length; j++) {
    const d = (PALETTE_RGBA[j * 4] - r) ** 2 + (PALETTE_RGBA[j * 4 + 1] - g) ** 2 + (PALETTE_RGBA[j * 4 + 2] - b) ** 2
    if (d < bestD) {
      bestD = d
      best = j
    }
  }
  return best
}

/** Every colour scaled by `k` (slightly cooled) and snapped back to the palette: night, shade, distance. */
export function dimTable(k: number): number[] {
  return PALETTE.map((_, i) => {
    if (i === 0) return 0
    const [r, g, b] = rgbOf(i)
    return nearest(r * k, g * k, Math.min(255, b * k * 1.08))
  })
}

/** Every colour mapped to one ramp by brightness (petrify, silhouettes, ghost tints). */
export function toneTable(ramp: readonly number[]): number[] {
  const lum = (i: number) => {
    const [r, g, b] = rgbOf(i)
    return 0.3 * r + 0.59 * g + 0.11 * b
  }
  return PALETTE.map((_, i) => {
    if (i === 0) return 0
    const l = lum(i)
    let best = ramp[0]
    for (const t of ramp) if (Math.abs(lum(t) - l) < Math.abs(lum(best) - l)) best = t
    return best
  })
}
