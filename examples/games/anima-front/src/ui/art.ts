/**
 * Vector art drawn by code: animal badges, the radio portraits (ゲンブ, ルリ, クロヅメ), antique glyphs, the
 * logo emblem. Everything is an SVG string (trusted, generated here) so it can be reused in menus and the HUD.
 */
import { ITEMS, type ItemCategory, type ItemId } from '../data/items'
import type { Speaker } from '../data/missions'
import type { SpeciesId } from '../data/species'
import { hex } from './dom'

interface Face {
  fur: string
  light: string
  inner: string
  eye: string
  ears: 'tri' | 'round' | 'long' | 'none' | 'small' | 'tuft' | 'fox'
  muzzle: string
  nose: string
  extra?: string
}

const FACES: Record<SpeciesId, Face> = {
  shiba: {
    fur: '#d9874a',
    light: '#f6e3c8',
    inner: '#f6e3c8',
    eye: '#2a1d18',
    ears: 'tri',
    muzzle: '#f6e3c8',
    nose: '#3a2420'
  },
  cat: {
    fur: '#f4efe6',
    light: '#ffffff',
    inner: '#f4b6c2',
    eye: '#3f8f4a',
    ears: 'tri',
    muzzle: '#ffffff',
    nose: '#e88a9a',
    extra:
      '<path d="M14 26 Q20 12 30 20 Q24 30 16 34 Z" fill="#e8913a"/><path d="M50 24 Q46 14 38 19 Q42 28 50 31 Z" fill="#2b2b33"/>'
  },
  rabbit: {
    fur: '#f7f4f2',
    light: '#ffffff',
    inner: '#f4a7b9',
    eye: '#c63d55',
    ears: 'long',
    muzzle: '#ffffff',
    nose: '#e88a9a'
  },
  bear: {
    fur: '#6b4430',
    light: '#c9a07a',
    inner: '#8a5a40',
    eye: '#1c120e',
    ears: 'round',
    muzzle: '#c9a07a',
    nose: '#24160f'
  },
  fox: {
    fur: '#e8792e',
    light: '#fff6ec',
    inner: '#3a2a2a',
    eye: '#2a1d18',
    ears: 'fox',
    muzzle: '#fff6ec',
    nose: '#2a1d18'
  },
  penguin: {
    fur: '#2b2f3a',
    light: '#f5f7fa',
    inner: '#2b2f3a',
    eye: '#14161c',
    ears: 'none',
    muzzle: '#f5f7fa',
    nose: '#f39a2b'
  },
  hamster: {
    fur: '#f2b45a',
    light: '#fff4e2',
    inner: '#f4b6c2',
    eye: '#2a1d18',
    ears: 'small',
    muzzle: '#fff4e2',
    nose: '#e88a9a'
  },
  owl: {
    fur: '#8a7560',
    light: '#f1e6d6',
    inner: '#5e4c3c',
    eye: '#f5a623',
    ears: 'tuft',
    muzzle: '#f1e6d6',
    nose: '#e0a640'
  }
}

function ears(f: Face): string {
  switch (f.ears) {
    case 'tri':
      return `<path d="M12 30 L16 8 L30 18 Z" fill="${f.fur}"/><path d="M16 26 L18 13 L26 19 Z" fill="${f.inner}"/>
<path d="M52 30 L48 8 L34 18 Z" fill="${f.fur}"/><path d="M48 26 L46 13 L38 19 Z" fill="${f.inner}"/>`
    case 'fox':
      return `<path d="M10 32 L14 4 L32 18 Z" fill="${f.fur}"/><path d="M13 14 L14 4 L21 10 Z" fill="${f.inner}"/>
<path d="M54 32 L50 4 L32 18 Z" fill="${f.fur}"/><path d="M51 14 L50 4 L43 10 Z" fill="${f.inner}"/>`
    case 'round':
      return `<circle cx="15" cy="18" r="8" fill="${f.fur}"/><circle cx="15" cy="18" r="4" fill="${f.inner}"/>
<circle cx="49" cy="18" r="8" fill="${f.fur}"/><circle cx="49" cy="18" r="4" fill="${f.inner}"/>`
    case 'small':
      return `<circle cx="17" cy="19" r="6" fill="${f.fur}"/><circle cx="17" cy="19" r="3.2" fill="${f.inner}"/>
<circle cx="47" cy="19" r="6" fill="${f.fur}"/><circle cx="47" cy="19" r="3.2" fill="${f.inner}"/>`
    case 'long':
      return `<ellipse cx="23" cy="10" rx="6" ry="15" transform="rotate(-10 23 10)" fill="${f.fur}"/>
<ellipse cx="23" cy="11" rx="3" ry="11" transform="rotate(-10 23 11)" fill="${f.inner}"/>
<ellipse cx="41" cy="10" rx="6" ry="15" transform="rotate(10 41 10)" fill="${f.fur}"/>
<ellipse cx="41" cy="11" rx="3" ry="11" transform="rotate(10 41 11)" fill="${f.inner}"/>`
    case 'tuft':
      return `<path d="M14 26 L12 8 L26 18 Z" fill="${f.inner}"/><path d="M50 26 L52 8 L38 18 Z" fill="${f.inner}"/>`
    default:
      return ''
  }
}

/** Round head badge of an animal (viewBox 64×64). */
export function speciesIconSvg(id: SpeciesId): string {
  const f = FACES[id]
  let face = ''
  if (id === 'penguin') {
    face = `<path d="M14 40 Q14 22 32 22 Q50 22 50 40 Q50 54 32 56 Q14 54 14 40 Z" fill="${f.light}"/>
<path d="M27 40 L37 40 L32 46 Z" fill="${f.nose}"/>`
  } else if (id === 'owl') {
    face = `<ellipse cx="23" cy="36" rx="10" ry="11" fill="${f.light}"/><ellipse cx="41" cy="36" rx="10" ry="11" fill="${f.light}"/>
<path d="M29 41 L35 41 L32 47 Z" fill="${f.nose}"/>`
  } else if (id === 'hamster') {
    face = `<ellipse cx="32" cy="46" rx="15" ry="10" fill="${f.light}"/><ellipse cx="16" cy="44" rx="7" ry="6" fill="${f.light}"/>
<ellipse cx="48" cy="44" rx="7" ry="6" fill="${f.light}"/><ellipse cx="32" cy="42" rx="2.4" ry="1.8" fill="${f.nose}"/>`
  } else {
    face = `<ellipse cx="32" cy="45" rx="11" ry="8" fill="${f.muzzle}"/><ellipse cx="32" cy="41" rx="3.2" ry="2.3" fill="${f.nose}"/>
<path d="M29 46 Q32 49 35 46" stroke="${f.nose}" stroke-width="1.4" fill="none" stroke-linecap="round"/>`
  }
  const eyeR = id === 'owl' ? 5.2 : 3.6
  const eyeY = id === 'owl' ? 35 : 35
  const eyes = `<ellipse cx="${id === 'owl' ? 23 : 23.5}" cy="${eyeY}" rx="${eyeR}" ry="${eyeR * 1.15}" fill="${f.eye}"/>
<ellipse cx="${id === 'owl' ? 41 : 40.5}" cy="${eyeY}" rx="${eyeR}" ry="${eyeR * 1.15}" fill="${f.eye}"/>
${id === 'owl' ? `<circle cx="23" cy="35" r="2.6" fill="#1a1410"/><circle cx="41" cy="35" r="2.6" fill="#1a1410"/>` : ''}
<circle cx="${id === 'owl' ? 24.6 : 24.8}" cy="${eyeY - 1.6}" r="1.4" fill="#fff"/><circle cx="${id === 'owl' ? 42.6 : 41.8}" cy="${eyeY - 1.6}" r="1.4" fill="#fff"/>`
  const blush = `<ellipse cx="16.5" cy="43" rx="3.6" ry="2" fill="#ff8fa3" opacity="0.55"/><ellipse cx="47.5" cy="43" rx="3.6" ry="2" fill="#ff8fa3" opacity="0.55"/>`
  return `<svg viewBox="0 0 64 64" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">
${ears(f)}<circle cx="32" cy="37" r="21" fill="${f.fur}"/>${f.extra ?? ''}${id === 'fox' ? `<path d="M11 38 Q20 50 32 50 Q44 50 53 38 Q50 56 32 58 Q14 56 11 38 Z" fill="${f.light}"/>` : ''}
${face}${eyes}${id === 'penguin' ? '' : blush}</svg>`
}

/** Radio / briefing portraits (viewBox 96×96, drawn inside a rounded frame by CSS). */
export function portraitSvg(who: Speaker): string {
  if (who === 'genbu') {
    return `<svg viewBox="0 0 96 96" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">
<defs><radialGradient id="gb-s" cx="50%" cy="40%" r="60%"><stop offset="0" stop-color="#a7b48a"/><stop offset="1" stop-color="#6d7a58"/></radialGradient></defs>
<path d="M6 96 Q10 70 48 66 Q86 70 90 96 Z" fill="#5a4b36"/>
<path d="M18 96 L24 80 L40 76 L56 76 L72 80 L78 96 Z" fill="#7a6648" stroke="#4a3c28" stroke-width="2"/>
<path d="M40 76 L48 88 L56 76" fill="none" stroke="#4a3c28" stroke-width="2"/>
<ellipse cx="48" cy="52" rx="24" ry="22" fill="url(#gb-s)"/>
<path d="M30 60 Q48 72 66 60" stroke="#55603f" stroke-width="2" fill="none"/>
<path d="M34 46 Q38 50 44 47" stroke="#3b4230" stroke-width="3" fill="none" stroke-linecap="round"/>
<path d="M52 47 Q58 50 62 46" stroke="#3b4230" stroke-width="3" fill="none" stroke-linecap="round"/>
<ellipse cx="39" cy="51" rx="3" ry="2.6" fill="#1d1f17"/><ellipse cx="57" cy="51" rx="3" ry="2.6" fill="#1d1f17"/>
<circle cx="40" cy="50" r="0.9" fill="#fff"/><circle cx="58" cy="50" r="0.9" fill="#fff"/>
<path d="M44 60 Q48 62 52 60" stroke="#2c3123" stroke-width="2" fill="none" stroke-linecap="round"/>
<path d="M22 36 Q48 14 74 36 L74 40 L22 40 Z" fill="#1f2a4a"/>
<rect x="20" y="36" width="56" height="7" rx="3" fill="#2c3a63"/>
<circle cx="48" cy="29" r="5" fill="#ff9a3c"/><circle cx="48" cy="29" r="2.2" fill="#ffe2b8"/>
</svg>`
  }
  if (who === 'ruri') {
    return `<svg viewBox="0 0 96 96" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">
<path d="M10 96 Q14 72 48 68 Q82 72 86 96 Z" fill="#2c3a63"/>
<path d="M36 70 L48 84 L60 70" fill="#ff9a3c"/>
<ellipse cx="48" cy="50" rx="25" ry="25" fill="#3fb6d8"/>
<path d="M26 44 Q30 22 48 22 Q66 22 70 44 Q62 34 48 34 Q34 34 26 44 Z" fill="#fff3a6"/>
<path d="M28 30 Q48 18 68 30" stroke="#2a8fb0" stroke-width="2.4" fill="none" stroke-dasharray="3 4"/>
<ellipse cx="38" cy="48" rx="4.2" ry="5" fill="#1a1f2e"/><ellipse cx="58" cy="48" rx="4.2" ry="5" fill="#1a1f2e"/>
<circle cx="39.6" cy="46" r="1.6" fill="#fff"/><circle cx="59.6" cy="46" r="1.6" fill="#fff"/>
<path d="M44 54 Q48 52 52 54 Q50 62 48 63 Q46 62 44 54 Z" fill="#f6c46a"/>
<circle cx="40" cy="66" r="2" fill="#1a1f2e"/><circle cx="48" cy="68" r="2" fill="#1a1f2e"/><circle cx="56" cy="66" r="2" fill="#1a1f2e"/>
<ellipse cx="30" cy="57" rx="4" ry="2.4" fill="#ff8fa3" opacity="0.6"/><ellipse cx="66" cy="57" rx="4" ry="2.4" fill="#ff8fa3" opacity="0.6"/>
<path d="M22 46 Q22 20 48 18 Q74 20 74 46" stroke="#1f2a4a" stroke-width="4" fill="none"/>
<rect x="17" y="42" width="9" height="14" rx="4" fill="#1f2a4a"/><rect x="70" y="42" width="9" height="14" rx="4" fill="#1f2a4a"/>
<path d="M22 54 Q24 66 36 66" stroke="#1f2a4a" stroke-width="2.4" fill="none"/><circle cx="37" cy="66" r="3" fill="#ff9a3c"/>
</svg>`
  }
  if (who === 'kurozume') {
    return `<svg viewBox="0 0 96 96" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">
<path d="M10 96 Q14 72 48 68 Q82 72 86 96 Z" fill="#2a2a30"/>
<path d="M18 30 L24 6 L42 24 Z" fill="#3a3a42"/><path d="M78 30 L72 6 L54 24 Z" fill="#3a3a42"/>
<ellipse cx="48" cy="48" rx="26" ry="24" fill="#4a4a54"/>
<path d="M30 46 L42 50 L30 52 Z" fill="#ffcf6e"/><path d="M66 46 L54 50 L66 52 Z" fill="#ffcf6e"/>
<ellipse cx="48" cy="60" rx="10" ry="7" fill="#5e5e68"/><ellipse cx="48" cy="57" rx="3" ry="2" fill="#16161a"/>
<path d="M20 72 Q48 82 76 72 L76 82 Q48 92 20 82 Z" fill="#c8323c"/>
<path d="M34 74 L38 84 M44 76 L47 87 M54 76 L56 86" stroke="#7a1820" stroke-width="2.6" stroke-linecap="round"/>
</svg>`
  }
  return speciesIconSvg(who)
}

const shapes: Record<ItemCategory, string> = {
  melee:
    '<path d="M14 50 L44 16 L50 14 L48 20 L18 54 Z" fill="C"/><path d="M12 44 L22 54 M10 54 L16 48" stroke="D" stroke-width="5" stroke-linecap="round"/><path d="M44 16 L50 14 L48 20" fill="#fff" opacity="0.6"/>',
  ranged:
    '<rect x="12" y="22" width="34" height="14" rx="7" fill="C"/><rect x="40" y="25" width="14" height="8" rx="4" fill="D"/><path d="M20 34 L18 50 L28 50 L30 34 Z" fill="D"/><circle cx="22" cy="29" r="3" fill="#fff" opacity="0.7"/>',
  armor:
    '<path d="M32 8 L52 16 L50 36 Q46 50 32 56 Q18 50 14 36 L12 16 Z" fill="C"/><path d="M32 16 L44 21 L43 35 Q40 44 32 48 Z" fill="#fff" opacity="0.28"/>',
  enhance:
    '<path d="M32 6 L54 32 L32 58 L10 32 Z" fill="C"/><path d="M32 18 L40 30 L35 30 L35 44 L29 44 L29 30 L24 30 Z" fill="#fff" opacity="0.85"/>',
  gadget:
    '<circle cx="32" cy="34" r="20" fill="C"/><circle cx="32" cy="34" r="9" fill="D"/><circle cx="32" cy="34" r="4" fill="#fff" opacity="0.8"/><rect x="28" y="6" width="8" height="10" rx="3" fill="D"/>'
}

const darken = (c: number, k = 0.55) => {
  const r = Math.round(((c >> 16) & 255) * k)
  const g = Math.round(((c >> 8) & 255) * k)
  const b = Math.round((c & 255) * k)
  return hex((r << 16) | (g << 8) | b)
}

/** Category glyph tinted with the antique's colour (viewBox 64×64). */
export function itemIconSvg(id: ItemId): string {
  const d = ITEMS[id]
  const body = shapes[d.category].replace(/"C"/g, `"${hex(d.color)}"`).replace(/"D"/g, `"${darken(d.color)}"`)
  return `<svg viewBox="0 0 64 64" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">${body}</svg>`
}

export function categoryIconSvg(c: ItemCategory): string {
  const body = shapes[c].replace(/"C"/g, '"currentColor"').replace(/"D"/g, '"rgba(0,0,0,0.35)"')
  return `<svg viewBox="0 0 64 64" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">${body}</svg>`
}

/** The ARK emblem: a paw print inside a shield with a glowing anima core. */
export function emblemSvg(): string {
  return `<svg viewBox="0 0 120 120" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">
<defs>
<linearGradient id="em-s" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#2f4176"/><stop offset="1" stop-color="#141d3a"/></linearGradient>
<radialGradient id="em-c" cx="50%" cy="50%" r="50%"><stop offset="0" stop-color="#fff4d6"/><stop offset="0.45" stop-color="#ffb25c"/><stop offset="1" stop-color="#ff7a1a" stop-opacity="0"/></radialGradient>
</defs>
<path d="M60 6 L104 22 Q104 76 60 114 Q16 76 16 22 Z" fill="url(#em-s)" stroke="#ffb25c" stroke-width="4"/>
<circle cx="60" cy="70" r="30" fill="url(#em-c)" opacity="0.9"/>
<ellipse cx="60" cy="74" rx="15" ry="13" fill="#fff3dc"/>
<ellipse cx="40" cy="54" rx="7" ry="8.5" fill="#fff3dc"/><ellipse cx="53" cy="44" rx="7" ry="9" fill="#fff3dc"/>
<ellipse cx="67" cy="44" rx="7" ry="9" fill="#fff3dc"/><ellipse cx="80" cy="54" rx="7" ry="8.5" fill="#fff3dc"/>
</svg>`
}

/** Small anima drop glyph (gauge, costs). */
export const ANIMA_GLYPH = `<svg viewBox="0 0 16 16" aria-hidden="true"><path d="M8 1 Q13 7 13 10 A5 5 0 0 1 3 10 Q3 7 8 1 Z" fill="currentColor"/></svg>`
