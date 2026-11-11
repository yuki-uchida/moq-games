/**
 * The master palette every sprite, tile, backdrop and effect is painted with (index 0 = transparent).
 *
 * Ramps are `[highlight, base, shade, deep, line]` and hue-shifted: shadows lean purple/blue and lose a little
 * saturation, highlights lean warm. `line` is the darkest outline colour of that material. Characters use bright,
 * saturated ramps; ground and backdrop ramps are calmer so characters always read on top.
 *
 * The palette is append-only: art modules may add their own ramps with `ramp(...)` (and single colours with
 * `color(...)`) at module scope. Registering the same hex twice returns the same index.
 */

export type Ramp = readonly [number, number, number, number, number]

const hexes: string[] = ['#00000000']
const lookup = new Map<string, number>()
let table = new Uint8Array(4 * 512)

/** One step darker within the ramp a colour was first registered in (line colours stay). */
export const DARKER: number[] = [0]
/** One step lighter within the ramp a colour was first registered in (highlights stay). */
export const LIGHTER: number[] = [0]
/** For outlining: the deep and line colour of the material a palette index belongs to. */
export const OUTLINE_OF: { deep: number; line: number }[] = [{ deep: 0, line: 0 }]

const ramped = new Set<number>()

/** Palette index of a `#rrggbb` colour, registering it when new. */
export function color(hex: string): number {
  const key = hex.toLowerCase()
  if (!/^#[0-9a-f]{6}$/.test(key)) throw new Error(`palette: '${hex}' is not #rrggbb`)
  const known = lookup.get(key)
  if (known !== undefined) return known
  const i = hexes.push(key) - 1
  lookup.set(key, i)
  if (i * 4 + 4 > table.length) {
    const grown = new Uint8Array(table.length * 2)
    grown.set(table)
    table = grown
  }
  table[i * 4] = parseInt(key.slice(1, 3), 16)
  table[i * 4 + 1] = parseInt(key.slice(3, 5), 16)
  table[i * 4 + 2] = parseInt(key.slice(5, 7), 16)
  table[i * 4 + 3] = 255
  DARKER[i] = i
  LIGHTER[i] = i
  // Until a ramp claims the colour it outlines with itself; `ramp()` replaces this.
  OUTLINE_OF[i] = { deep: i, line: i }
  return i
}

/** Registers a five-step ramp and returns its palette indices. */
export function ramp(highlight: string, base: string, shade: string, deep: string, line: string): Ramp {
  const r = [color(highlight), color(base), color(shade), color(deep), color(line)] as const
  for (let i = 0; i < 5; i++) {
    const c = r[i]
    if (ramped.has(c)) continue
    ramped.add(c)
    OUTLINE_OF[c] = i === 4 ? { deep: c, line: c } : { deep: r[3], line: r[4] }
    if (i < 4) DARKER[c] = r[i + 1]
    if (i > 0) LIGHTER[c] = r[i - 1]
  }
  return r
}

const INK = '#2a1230' // plum: the character outline of this game
const INK_WARM = '#3a1a22'
const INK_COOL = '#1c1830'
const INK_GREEN = '#10261f'
const INK_BLUE = '#121b36'

/** Single colours. */
export const C = {
  ink: color(INK),
  inkWarm: color(INK_WARM),
  inkCool: color(INK_COOL),
  inkGreen: color(INK_GREEN),
  inkBlue: color(INK_BLUE),
  white: color('#ffffff'),
  /** Pure dark for pupils and the deepest voids. */
  black: color('#0c0814'),
  /** Warm glow for lamps, stars and eyes in the dark. */
  glow: color('#fff3b8'),
  /** Cold glint for steel and water sparkles. */
  spark: color('#d8f6ff'),
  /** Cheek blush. */
  blush: color('#ff8fb0'),
  /** Mouth interior and tongues. */
  mouth: color('#8a2a4a'),
  tongue: color('#ff7f9a')
}
for (const ink of [C.ink, C.inkWarm, C.inkCool, C.inkGreen, C.inkBlue, C.black]) {
  ramped.add(ink)
  OUTLINE_OF[ink] = { deep: ink, line: ink }
}

/** Shared ramps. Add game-wide materials here; one-off materials belong to the module that draws them. */
export const R = {
  // --- hamsters
  hamPink: ramp('#ffe3ee', '#ffb3cf', '#f07fa8', '#b84f80', INK),
  hamCream: ramp('#fffaf0', '#fff1d6', '#f2cfa8', '#c79a80', INK_WARM),
  hamEar: ramp('#ffc2d6', '#ff7fb0', '#d94f8c', '#96305f', INK),
  scarf: ramp('#7f9cff', '#3f58c8', '#2a3a94', '#1c2460', INK_COOL),
  princessWhite: ramp('#ffffff', '#fff6fb', '#ecd3e6', '#b99ac4', INK),
  princessPink: ramp('#ffd9ea', '#ff9ecb', '#f2639f', '#a83a78', INK),
  momOrange: ramp('#ffd6a0', '#ffab63', '#e07f3c', '#a8552a', INK_WARM),
  momCream: ramp('#fff4dc', '#ffe6bd', '#e8bd8a', '#b48a62', INK_WARM),
  kingPurple: ramp('#9b86d6', '#5b4a86', '#43356e', '#2a1f4a', INK_COOL),
  kingBelly: ramp('#d8ccf5', '#a898dc', '#7664b4', '#4a3c80', INK_COOL),
  crimson: ramp('#ff8f9a', '#e0405a', '#a82848', '#6a1a3a', INK_WARM),
  // --- gang and bosses
  bandana: ramp('#ff9a8a', '#e8483a', '#b02a34', '#701c30', INK_WARM),
  ratGray: ramp('#d8c8b8', '#a8927f', '#7a6560', '#4f4049', INK_COOL),
  crowBlue: ramp('#6c78a8', '#3f4470', '#2a2d50', '#1a1c36', '#0e0f1e'),
  beak: ramp('#ffe28a', '#ffb03a', '#d07a2a', '#8a4a1f', INK_WARM),
  frogGreen: ramp('#c8f59a', '#6cc95a', '#3a9455', '#22604a', INK_GREEN),
  frogBelly: ramp('#f4ffd8', '#d8f5b0', '#a8d088', '#70a068', INK_GREEN),
  squirrelRed: ramp('#ffb08a', '#e86a4a', '#b84438', '#7a2a30', INK_WARM),
  moleBrown: ramp('#b89878', '#8a6a4a', '#5e452f', '#3c2a22', INK_WARM),
  weaselTan: ramp('#f0d8a8', '#c9a468', '#96703f', '#5e4428', INK_WARM),
  boarBrown: ramp('#c8a078', '#96704c', '#684a32', '#402c22', INK_WARM),
  wolfGray: ramp('#d6dcea', '#9aa4bc', '#6b7390', '#454a66', INK_COOL),
  bearViolet: ramp('#b89ac8', '#7a5a8c', '#523a63', '#342440', INK_COOL),
  foxOrange: ramp('#ffc888', '#f08a3c', '#b85c1e', '#783818', INK_WARM),
  apeCharcoal: ramp('#8a8494', '#5a5466', '#3c3848', '#26232f', INK_COOL),
  darkFur: ramp('#5a5470', '#36324a', '#24212f', '#17151f', INK_COOL),
  // --- shared materials
  paper: ramp('#ffffff', '#eef0f5', '#c8cbd8', '#8a8fa8', INK_COOL),
  cream: ramp('#fffdf2', '#fff1d6', '#e8cfa6', '#b4977a', INK_WARM),
  gold: ramp('#fff6b0', '#ffd45e', '#e0a428', '#96641e', INK_WARM),
  steel: ramp('#f0f4f8', '#b8c0cc', '#7d8698', '#4c5266', INK_COOL),
  wood: ramp('#e8b878', '#c98b4b', '#9a6230', '#63391d', INK_WARM),
  bark: ramp('#b07a4a', '#8a5a34', '#63391d', '#3f2414', INK_WARM),
  leaf: ramp('#b8f08a', '#4fbf67', '#2f8f4e', '#1f6040', INK_GREEN),
  pineLeaf: ramp('#7fc898', '#3f8f6a', '#2a6a52', '#1a4a40', INK_GREEN),
  rock: ramp('#dcd6e8', '#a8a0b8', '#776e8c', '#4a4460', INK_COOL),
  water: ramp('#d0f4ff', '#57b8ff', '#2f7fd0', '#1f4f9a', INK_BLUE),
  pipe: ramp('#b8f5ea', '#58c7c0', '#2f8f8a', '#1f5f66', INK_BLUE),
  honey: ramp('#fff0a0', '#f2c14a', '#c08d20', '#7a5518', INK_WARM),
  fruitRed: ramp('#ffb0b0', '#ff5f6d', '#c93a4a', '#8a2038', INK_WARM),
  berry: ramp('#f0b8ff', '#d06ae8', '#9a40b8', '#602878', INK_COOL),
  /** Switch 1 and its doors. */
  sun: ramp('#fff3b8', '#ffb03a', '#e0702a', '#96401f', INK_WARM),
  /** Switch 2 and its doors. */
  moon: ramp('#d8f0ff', '#6eb4ff', '#3f70d8', '#2a4496', INK_BLUE),
  // --- terrain
  grass: ramp('#c4f58a', '#7fd464', '#3fa850', '#2a7a48', INK_GREEN),
  grassForest: ramp('#8fd07a', '#4f9f52', '#2f7a45', '#1f5238', INK_GREEN),
  grassNight: ramp('#7fc0a0', '#4f9f7a', '#357860', '#235048', INK_BLUE),
  soil: ramp('#e6b880', '#b5793f', '#8a5527', '#5e3820', INK_WARM),
  soilNight: ramp('#a88ac8', '#6a4a8c', '#4a3166', '#2f1f44', INK_COOL),
  soilForest: ramp('#a88060', '#6b4a34', '#4a3122', '#2f1f18', INK_WARM),
  /** Diggable dirt: brighter than any ground so it always reads as "bite me". */
  clay: ramp('#ffe0a8', '#e8b070', '#c0803c', '#844e24', INK_WARM),
  caveRock: ramp('#9a88c0', '#6a5a8c', '#4a3f68', '#2f2848', INK_COOL),
  stone: ramp('#dfe5f5', '#9aa4c0', '#6a7391', '#444a66', INK_COOL),
  brick: ramp('#f0a08a', '#c8604f', '#96402f', '#5e2828', INK_WARM),
  castleStone: ramp('#b0a4d8', '#8a7fb8', '#5d5486', '#3a3458', INK_COOL),
  starRock: ramp('#8a7cc8', '#4a3f7a', '#2f2750', '#1c1636', INK_COOL),
  // --- backdrops (calm, low contrast)
  skyDay: ramp('#e6f8ff', '#a8dcff', '#6ec3ff', '#4a9ae8', INK_BLUE),
  cloud: ramp('#ffffff', '#f4f8ff', '#d0def5', '#a0b4dc', INK_BLUE),
  farGreen: ramp('#c8ecc0', '#a8d8a0', '#88c488', '#6aac78', INK_GREEN),
  midGreen: ramp('#9ad890', '#6fbf72', '#4fa262', '#3f8650', INK_GREEN),
  skyNight: ramp('#6a5aa8', '#4a3580', '#2a1f5a', '#150d38', '#0a0620'),
  nightFar: ramp('#5a4a90', '#3a2a68', '#2a1f52', '#1b1440', '#0e0a24'),
  forestDeep: ramp('#3f8f6a', '#2a6b46', '#1f5236', '#123a26', INK_GREEN),
  caveDeep: ramp('#5a4470', '#463560', '#352849', '#241a33', INK_COOL),
  fortWall: ramp('#8a90a8', '#565b74', '#42465e', '#2c3042', INK_COOL),
  castleWall: ramp('#7a6ea8', '#5d5486', '#463d68', '#2f2849', INK_COOL),
  cosmos: ramp('#8a5ac8', '#4a2a7a', '#2a1a50', '#0d0722', '#060312'),
  nebula: ramp('#ffb8e8', '#e070c0', '#a04098', '#602868', INK_COOL),
  // --- effects and interface
  fire: ramp('#fff8c2', '#ffc942', '#f17932', '#c13929', INK_WARM),
  magic: ramp('#e2f8ff', '#82d9ff', '#5189f1', '#5141c1', INK_COOL),
  dark: ramp('#d0a8ff', '#9a60e8', '#6a38b8', '#3e2080', INK_COOL),
  dust: ramp('#fffaf0', '#e8dcc8', '#c0b09a', '#8a7a6a', INK_WARM),
  uiNight: ramp('#4a3a80', '#2f2460', '#1b1035', '#120a26', '#0a0518')
} as const

export type RampName = keyof typeof R

/** Number of palette entries (including the transparent index 0). */
export const paletteSize = () => hexes.length

/** `#rrggbb` of a palette index (index 0 is `#00000000`). */
export const hexOf = (i: number) => hexes[i]

/** RGBA bytes of every palette index, 4 per index. The array may be replaced when the palette grows. */
export const paletteRgba = () => table

export const rgbOf = (i: number): [number, number, number] => [table[i * 4], table[i * 4 + 1], table[i * 4 + 2]]

/** Palette index of an RGB value, registering it when new (used by converters, never by hand-drawn art). */
export function colorOfRgb(r: number, g: number, b: number): number {
  const h = (v: number) =>
    Math.max(0, Math.min(255, Math.round(v)))
      .toString(16)
      .padStart(2, '0')
  return color(`#${h(r)}${h(g)}${h(b)}`)
}

/** Nearest existing palette colour to an RGB value (for dimming and tinting tables). */
export function nearest(r: number, g: number, b: number): number {
  let best = 1
  let bestD = Infinity
  for (let j = 1; j < hexes.length; j++) {
    const d = (table[j * 4] - r) ** 2 + (table[j * 4 + 1] - g) ** 2 + (table[j * 4 + 2] - b) ** 2
    if (d < bestD) {
      bestD = d
      best = j
    }
  }
  return best
}

/** Every colour mapped to one ramp by brightness (silhouettes, petrified or ghost tints). */
export function toneTable(target: readonly number[]): number[] {
  const lum = (i: number) => {
    const [r, g, b] = rgbOf(i)
    return 0.3 * r + 0.59 * g + 0.11 * b
  }
  return hexes.map((_, i) => {
    if (i === 0) return 0
    const l = lum(i)
    let best = target[0]
    for (const t of target) if (Math.abs(lum(t) - l) < Math.abs(lum(best) - l)) best = t
    return best
  })
}
