/** The bold rounded bitmap font: 6×8 glyph bodies, outlined to 8×10 cells. */
import { C, R } from '../palette'
import { Raster, outlineWith } from '../raster'

export type TextStyle = 'damage' | 'crit' | 'heal' | 'label' | 'warn'

const G: Record<string, string[]> = {
  '0': ['.####.', '##..##', '##..##', '##..##', '##..##', '##..##', '##..##', '.####.'],
  '1': ['..##..', '.###..', '####..', '..##..', '..##..', '..##..', '..##..', '.####.'],
  '2': ['.####.', '##..##', '....##', '...##.', '..##..', '.##...', '##....', '######'],
  '3': ['.####.', '##..##', '....##', '..###.', '....##', '....##', '##..##', '.####.'],
  '4': ['...##.', '..###.', '.####.', '##.##.', '##.##.', '######', '...##.', '...##.'],
  '5': ['######', '##....', '##....', '#####.', '....##', '....##', '##..##', '.####.'],
  '6': ['.####.', '##..##', '##....', '#####.', '##..##', '##..##', '##..##', '.####.'],
  '7': ['######', '....##', '...##.', '...##.', '..##..', '..##..', '..##..', '..##..'],
  '8': ['.####.', '##..##', '##..##', '.####.', '##..##', '##..##', '##..##', '.####.'],
  '9': ['.####.', '##..##', '##..##', '.#####', '....##', '....##', '##..##', '.####.'],
  A: ['.####.', '##..##', '##..##', '##..##', '######', '##..##', '##..##', '##..##'],
  B: ['#####.', '##..##', '##..##', '#####.', '##..##', '##..##', '##..##', '#####.'],
  C: ['.####.', '##..##', '##....', '##....', '##....', '##....', '##..##', '.####.'],
  D: ['#####.', '##..##', '##..##', '##..##', '##..##', '##..##', '##..##', '#####.'],
  E: ['######', '##....', '##....', '#####.', '##....', '##....', '##....', '######'],
  F: ['######', '##....', '##....', '#####.', '##....', '##....', '##....', '##....'],
  G: ['.####.', '##..##', '##....', '##.###', '##..##', '##..##', '##..##', '.####.'],
  H: ['##..##', '##..##', '##..##', '######', '##..##', '##..##', '##..##', '##..##'],
  I: ['.####.', '..##..', '..##..', '..##..', '..##..', '..##..', '..##..', '.####.'],
  J: ['..####', '....##', '....##', '....##', '....##', '##..##', '##..##', '.####.'],
  K: ['##..##', '##.##.', '####..', '###...', '####..', '##.##.', '##..##', '##..##'],
  L: ['##....', '##....', '##....', '##....', '##....', '##....', '##....', '######'],
  M: ['##..##', '######', '######', '######', '##..##', '##..##', '##..##', '##..##'],
  N: ['##..##', '###.##', '######', '######', '##.###', '##..##', '##..##', '##..##'],
  O: ['.####.', '##..##', '##..##', '##..##', '##..##', '##..##', '##..##', '.####.'],
  P: ['#####.', '##..##', '##..##', '#####.', '##....', '##....', '##....', '##....'],
  Q: ['.####.', '##..##', '##..##', '##..##', '##..##', '##.###', '.####.', '....##'],
  R: ['#####.', '##..##', '##..##', '#####.', '####..', '##.##.', '##..##', '##..##'],
  S: ['.#####', '##....', '##....', '.####.', '....##', '....##', '....##', '#####.'],
  T: ['######', '..##..', '..##..', '..##..', '..##..', '..##..', '..##..', '..##..'],
  U: ['##..##', '##..##', '##..##', '##..##', '##..##', '##..##', '##..##', '.####.'],
  V: ['##..##', '##..##', '##..##', '##..##', '##..##', '.####.', '.####.', '..##..'],
  W: ['##..##', '##..##', '##..##', '##..##', '######', '######', '######', '##..##'],
  X: ['##..##', '##..##', '.####.', '..##..', '..##..', '.####.', '##..##', '##..##'],
  Y: ['##..##', '##..##', '.####.', '..##..', '..##..', '..##..', '..##..', '..##..'],
  Z: ['######', '....##', '...##.', '..##..', '.##...', '##....', '##....', '######'],
  '+': ['......', '..##..', '..##..', '######', '######', '..##..', '..##..', '......'],
  '-': ['......', '......', '......', '.####.', '.####.', '......', '......', '......'],
  '×': ['......', '##..##', '.####.', '..##..', '..##..', '.####.', '##..##', '......'],
  '/': ['....##', '....##', '...##.', '..##..', '..##..', '.##...', '##....', '##....'],
  '!': ['..##..', '..##..', '..##..', '..##..', '..##..', '......', '..##..', '..##..'],
  '?': ['.####.', '##..##', '....##', '...##.', '..##..', '..##..', '......', '..##..'],
  ':': ['......', '..##..', '..##..', '......', '......', '..##..', '..##..', '......'],
  '.': ['......', '......', '......', '......', '......', '......', '..##..', '..##..']
}
G['x'] = G['×']

interface Look {
  /** Fill colour by glyph row 0..7. */
  fill: (row: number) => number
  outline: number
  diagonal: boolean
  /** Drop shadow colour, drawn one pixel down-right of the outlined glyph. */
  shadow?: number
}

const LOOKS: Record<TextStyle, Look> = {
  damage: { fill: (y) => (y >= 6 ? R.paper[2] : y >= 5 ? R.paper[1] : C.white), outline: C.inkCool, diagonal: true },
  crit: {
    fill: (y) => (y >= 6 ? R.fire[2] : y >= 3 ? R.fire[1] : R.fire[0]),
    outline: C.inkWarm,
    diagonal: true,
    shadow: R.jobRed[3]
  },
  heal: {
    fill: (y) => (y >= 6 ? R.jobGreen[2] : y >= 3 ? R.poison[1] : R.poison[0]),
    outline: C.inkGreen,
    diagonal: true
  },
  label: { fill: (y) => (y >= 6 ? R.paper[2] : C.white), outline: C.inkCool, diagonal: false },
  warn: {
    fill: (y) => (y >= 6 ? R.jobRed[2] : y >= 3 ? R.jobRed[1] : R.jobRed[0]),
    outline: C.inkWarm,
    diagonal: true
  }
}

interface Glyph {
  rows: string[]
  /** Inclusive column range holding ink. */
  x0: number
  x1: number
}

const glyphCache = new Map<string, Glyph | undefined>()
function glyph(ch: string): Glyph | undefined {
  if (glyphCache.has(ch)) return glyphCache.get(ch)
  const rows = G[ch] ?? G[ch.toUpperCase()]
  let g: Glyph | undefined
  if (rows) {
    let x0 = 6
    let x1 = 0
    for (const row of rows)
      for (let i = 0; i < 6; i++)
        if (row[i] === '#') {
          x0 = Math.min(x0, i)
          x1 = Math.max(x1, i)
        }
    // Digits keep a fixed cell so numbers do not jitter as they change.
    g = /[0-9]/.test(ch) ? { rows, x0: 0, x1: 5 } : { rows, x0, x1 }
  }
  glyphCache.set(ch, g)
  return g
}

/** Plain 6×8 fill of one glyph in `style` (no outline), for UI that wants the letter shapes. */
export function glyphRaster(ch: string, style: TextStyle = 'label'): Raster | undefined {
  const g = glyph(ch)
  if (!g) return undefined
  const look = LOOKS[style]
  const r = new Raster(6, 8)
  g.rows.forEach((row, y) => {
    for (let x = 0; x < 6; x++) if (row[x] === '#') r.set(x, y, look.fill(y))
  })
  return r
}

const textCache = new Map<string, Raster>()

/** Outlined text in the bitmap font; characters outside the font are skipped. Results are cached. */
export function textRaster(text: string, style: TextStyle): Raster {
  const key = `${style}|${text}`
  const hit = textCache.get(key)
  if (hit) return hit
  const look = LOOKS[style]
  let width = 0
  const placed: [Glyph, number][] = []
  for (const ch of text) {
    if (ch === ' ') {
      width += 4
      continue
    }
    const g = glyph(ch)
    if (!g) continue
    placed.push([g, width - g.x0])
    width += g.x1 - g.x0 + 1 + 1
  }
  const pad = 1
  const extra = look.shadow ? 1 : 0
  const inner = new Raster(Math.max(1, width - 1) + pad * 2 + extra, 8 + pad * 2 + extra)
  for (const [g, x0] of placed)
    g.rows.forEach((row, y) => {
      for (let x = 0; x < 6; x++) if (row[x] === '#') inner.set(pad + x0 + x, pad + y, look.fill(y))
    })
  const out = new Raster(inner.w, inner.h)
  if (look.shadow) {
    const sil = inner.clone()
    outlineWith(sil, look.outline, look.diagonal)
    out.blit(
      sil.map(() => look.shadow as number),
      1,
      1
    )
    outlineWith(inner, look.outline, look.diagonal)
    out.blit(inner)
  } else {
    outlineWith(inner, look.outline, look.diagonal)
    out.blit(inner)
  }
  if (textCache.size > 400) textCache.clear()
  textCache.set(key, out)
  return out
}
