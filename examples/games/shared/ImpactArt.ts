export type ImpactStyle = 'cut' | 'pierce' | 'arcane' | 'ice' | 'fire' | 'spore' | 'heal'
export const IMPACT_LIFETIME = 0.16
const FRAMES = 8
const durations: Record<ImpactStyle, number> = {
  cut: 0.16,
  pierce: 0.12,
  arcane: 0.18,
  ice: 0.18,
  fire: 0.2,
  spore: 0.22,
  heal: 0.24
}
export const impactDuration = (style: ImpactStyle) => durations[style]
const colors: Record<ImpactStyle, string> = {
  cut: '#ffe6aa',
  pierce: '#ffcc72',
  arcane: '#c6b0ff',
  ice: '#8eeaff',
  fire: '#ff914e',
  spore: '#a9df94',
  heal: '#90ffc2'
}

/** Palette and silhouette distinguish damage types without relying on sound. */
export function impactStyle(type: string, healing = false): ImpactStyle {
  if (healing) return 'heal'
  if (['archer', 'ranger', 'runner'].includes(type)) return 'pierce'
  if (['mage', 'wraith'].includes(type)) return 'arcane'
  if (type === 'frost') return 'ice'
  if (['cannon', 'dragon'].includes(type)) return 'fire'
  if (type === 'shaman') return 'spore'
  return 'cut'
}

/** Absolute simulation age, never a wall-clock timer: misses cannot flash. */
export function impactFrame(age: number, hit: boolean, style?: ImpactStyle): number | null {
  const duration = style ? impactDuration(style) : IMPACT_LIFETIME
  return hit && age >= 0 && age < duration ? Math.min(FRAMES - 1, Math.floor((age / duration) * FRAMES)) : null
}

const canvases = new Map<string, HTMLCanvasElement>()
/** Original raster art, cached in at most seven styles by eight 32px frames. */
export function impactCanvas(style: ImpactStyle, frame: number): HTMLCanvasElement {
  frame = Math.max(0, Math.min(FRAMES - 1, Math.floor(frame)))
  const key = `${style}:${frame}`
  const cached = canvases.get(key)
  if (cached) return cached
  const canvas = document.createElement('canvas')
  canvas.width = canvas.height = 32
  const c = canvas.getContext('2d')!
  const t = frame / (FRAMES - 1),
    radius = 4 + 9 * (1 - (1 - t) ** 3)
  const pixel = (x: number, y: number, size: number, color: string) => {
    c.fillStyle = color
    c.fillRect(Math.round(x), Math.round(y), size, size)
  }
  const arms = style === 'ice' ? 6 : style === 'arcane' ? 4 : 5
  if (style === 'heal') {
    c.fillStyle = colors.heal
    c.fillRect(14, 5 - t * 3, 4, 17)
    c.fillRect(8, 11 - t * 3, 16, 4)
    for (let i = 0; i < 3; i++) pixel(5 + i * 10, 23 - t * (6 + i * 2), 2, '#d8ffe7')
  } else if (style === 'pierce') {
    // Shaft follows the incoming axis; just two lateral chips, unlike the wide slash.
    if (frame < 5) for (let i = -10; i <= 6; i++) pixel(15 + i, 14, frame < 2 ? 2 : 1, '#fff7df')
    pixel(17 + t * 7, 10 - t * 5, 2, colors.pierce)
    pixel(13 + t * 7, 20 + t * 4, 2, colors.pierce)
  } else if (style === 'spore') {
    // Three separated seed motes drift upward; no fire-like explosion or white core.
    for (let i = 0; i < 3; i++) {
      const x = 8 + i * 7 + Math.sin(t * 3 + i) * 3
      const y = 20 - i * 2 - t * (5 + i * 2)
      pixel(x, y, frame < 4 ? 4 : 2, colors.spore)
      if (frame < 4) pixel(x + 1, y, 1, '#e6ffd2')
    }
  } else {
    for (let i = 0; i < arms; i++) {
      const angle = (i * Math.PI * 2) / arms - Math.PI / 2
      const x = Math.cos(angle),
        y = Math.sin(angle)
      const length = 4
      for (let j = 0; j < length; j++) {
        pixel(15 + x * (radius - j), 15 + y * (radius - j), frame < 3 ? 3 : 2, colors[style])
      }
    }
    if (style === 'cut') {
      // Diagonal contact stroke collapses quickly; small shards carry the tail.
      if (frame < 5) for (let i = -6; i < 7; i++) pixel(15 + i, 15 - i * 0.6, frame < 2 ? 3 : 2, '#fff7df')
    } else if (frame < 4) {
      pixel(12, 14, 7 - frame, '#fff8e8')
      pixel(14, 11, 4, '#fff8e8')
    }
    if (style === 'fire') {
      for (let i = 0; i < 4; i++) pixel(6 + i * 6, 17 - t * (7 + i * 2), frame < 4 ? 3 : 2, colors[style])
    }
  }
  canvases.set(key, canvas)
  return canvas
}
