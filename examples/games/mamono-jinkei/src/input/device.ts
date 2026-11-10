/** Which input device the player used last, and the on-screen key labels for each (pure). */
export type InputDevice = 'keyboard' | 'pad'

/** Keyboard/mouse hint labels → the gamepad button that does the same thing (see PAD in map.ts). */
const PAD_LABEL: Record<string, string> = {
  クリック: 'Ⓐ',
  長押し: 'Ⓐ長押し',
  E: 'X',
  E長押し: 'X長押し',
  Space: 'B',
  Space長押し: 'B長押し',
  F: 'Y',
  Q: 'Back',
  Tab: 'LB/RB'
}

/** The label for a hint key on the given device; keys without a pad twin (陣形, カギ, ...) stay as they are. */
export const deviceKey = (key: string, device: InputDevice): string =>
  device === 'pad' ? (PAD_LABEL[key] ?? key) : key

/** Splits a pad label into its button glyph and a trailing suffix such as 長押し. */
export function splitPadKey(key: string): { glyph: string; rest: string } | undefined {
  const m = /^(Ⓐ|Back|LB\/RB|B|X|Y)(.*)$/.exec(key)
  return m ? { glyph: m[1], rest: m[2] } : undefined
}
