/** What hidesBehind reads of an element's computed style. */
export interface PaintStyle {
  backgroundColor: string
  backgroundImage: string
  getPropertyValue(name: string): string
}

/**
 * Alpha of a computed colour: 0 for `transparent`, the value after a slash, the fourth value of `rgba(r, g, b, a)`, and
 * 1 for anything else (`rgb(r, g, b)`).
 */
export function colourAlpha(colour: string): number {
  if (colour === 'transparent') return 0
  const slash = /\/\s*([\d.]+)(%?)\s*\)$/.exec(colour)
  if (slash) return Number(slash[1]) / (slash[2] ? 100 : 1)
  const parts = /^rgba?\(([^)]*)\)$/.exec(colour)?.[1].split(',')
  return parts?.length === 4 ? Number(parts[3]) : 1
}

/**
 * True when what lies under an element cannot be seen through it: a mostly solid background colour or a background
 * image (unless the background is clipped to the text, which paints only the letters), or a backdrop filter.
 */
export function hidesBehind(style: PaintStyle): boolean {
  const filter = style.getPropertyValue('backdrop-filter') || style.getPropertyValue('-webkit-backdrop-filter')
  if (filter !== '' && filter !== 'none') return true
  const clip = style.getPropertyValue('background-clip') || style.getPropertyValue('-webkit-background-clip')
  if (clip.includes('text')) return false
  return colourAlpha(style.backgroundColor) >= 0.5 || style.backgroundImage !== 'none'
}
