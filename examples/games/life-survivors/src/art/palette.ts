/**
 * The one master palette every sprite, tile and prop is painted with (index 0 = transparent).
 * Ramps are hue-shifted: shadows lean blue/purple and lose saturation, highlights lean warm.
 * Each ramp is [highlight, base, shade, deep, line]; `line` is the darkest outline colour of that material.
 */

const INK_COOL = '#1f1b33'
const INK_WARM = '#3a1d2e'
const INK_GREEN = '#17302e'

const RAMP_HEX = {
  skin: ['#ffe4c8', '#f5b98e', '#d6876f', '#a3595d', INK_WARM],
  hair: ['#7a62a1', '#4f4176', '#342b55', '#271f3f', INK_COOL],
  brown: ['#dba26a', '#a8693f', '#74452f', '#4c2b2c', INK_WARM],
  red: ['#ff9b7c', '#e1464a', '#a72b48', '#6b1c3c', INK_WARM],
  orange: ['#ff9b7c', '#e0704f', '#b14b40', '#6b1c3c', INK_WARM],
  yellow: ['#fff3ad', '#f2cd4e', '#cf942f', '#74452f', INK_WARM],
  green: ['#d6f38a', '#8ccc69', '#4e985b', '#2e6152', INK_GREEN],
  mint: ['#c6f5e8', '#7fd3c3', '#4598a5', '#303a6c', INK_COOL],
  navy: ['#7085c4', '#45528f', '#303a6c', '#232850', INK_COOL],
  paper: ['#ffffff', '#ebe5db', '#c4bfd3', '#6d7391', INK_COOL],
  metal: ['#dfe3ea', '#a3aab9', '#6d7391', '#342b55', INK_COOL],
  purple: ['#ad8fd3', '#7a62a1', '#4f4176', '#342b55', INK_COOL],
  pink: ['#ffe4c8', '#f29cc0', '#c86a99', '#8b4776', INK_WARM],
  // Ground ramps: dark, low contrast and desaturated so characters always read on top.
  sky: ['#c4e2f6', '#86b9e2', '#5a86bd', '#303a6c', INK_COOL],
  matRose: ['#8e7380', '#826974', '#755f69', '#755f69', INK_WARM],
  matSage: ['#74877a', '#6a7c70', '#5f7065', '#5f7065', INK_COOL],
  matLilac: ['#7b7591', '#706a85', '#655f78', '#655f78', INK_COOL],
  matButter: ['#8e8870', '#837d66', '#76705b', '#76705b', INK_WARM],
  sand: ['#8e8264', '#83775a', '#766b51', '#766b51', INK_WARM],
  grass: ['#61805a', '#577450', '#4d6747', '#4d6747', INK_GREEN],
  wood: ['#8d6c50', '#806147', '#72563f', '#72563f', INK_WARM],
  paving: ['#6b6479', '#605a6e', '#555063', '#555063', INK_COOL],
  brick: ['#895a50', '#7c5047', '#6e473f', '#6e473f', INK_WARM],
  asphalt: ['#5a5d64', '#51545a', '#484b51', '#484b51', INK_COOL],
  gravel: ['#7e7b72', '#737067', '#67645c', '#67645c', INK_COOL],
  lino: ['#6e8079', '#64756f', '#5a6a64', '#5a6a64', INK_COOL],
  dirt: ['#7f6d56', '#72624c', '#655743', '#655743', INK_WARM],
  carpet: ['#5d6474', '#555c6b', '#4d5462', '#4d5462', INK_COOL]
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
  white: R.paper[0],
  chalk: indexOf('#a59d8e'),
  glow: indexOf('#9fe7ff')
}

/** RGBA hex of every palette index (index 0 is transparent). */
export const PALETTE: readonly string[] = ['#00000000', ...hexes]

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
  for (const ink of [C.inkCool, C.inkWarm, C.inkGreen]) table[ink] = { deep: ink, line: ink }
  return table
})()

/** One step darker within the same ramp (for back limbs and shading); line colours stay. */
export const DARKER: number[] = (() => {
  const table = PALETTE.map((_, i) => i)
  for (const ramp of Object.values(R))
    for (let i = 0; i < 4; i++) if (table[ramp[i]] === ramp[i]) table[ramp[i]] = ramp[i + 1]
  return table
})()

const rgb = (i: number) => [PALETTE_RGBA[i * 4], PALETTE_RGBA[i * 4 + 1], PALETTE_RGBA[i * 4 + 2]]

/**
 * Uniform dimming: every colour mapped to the palette colour nearest to it scaled by `k` (with a slight
 * cool shift). Keeps the figure's internal contrast while it darkens, unlike collapsing ramp steps.
 */
export function dimTable(k: number): number[] {
  return PALETTE.map((_, i) => {
    if (i === 0) return 0
    const [r, g, b] = rgb(i)
    const t = [r * k, g * k, b * k * 1.08]
    let best = i
    let bestD = Infinity
    for (let j = 1; j < PALETTE.length; j++) {
      const [r2, g2, b2] = rgb(j)
      const d = (r2 - t[0]) ** 2 + (g2 - t[1]) ** 2 + (b2 - t[2]) ** 2
      if (d < bestD) {
        bestD = d
        best = j
      }
    }
    return best
  })
}
