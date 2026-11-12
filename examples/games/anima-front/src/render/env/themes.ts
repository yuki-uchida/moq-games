/**
 * Lighting, sky and grading per map theme (DESIGN §15). Pure data: colours are sRGB hex, the builder converts.
 */
import type { LoopName } from '../../audio/api'
import type { MapDef, MapTheme } from '../../sim/types'

export interface ThemeDef {
  id: MapTheme
  sky: { top: number; horizon: number; bottom: number; haze: number }
  /** Direction towards the sun/moon (normalised by the builder). */
  sunDir: [number, number, number]
  sunColor: number
  sunIntensity: number
  /** Visible disc on the sky dome. */
  disc: { color: number; size: number; glow: number }
  hemi: { sky: number; ground: number; intensity: number }
  fog: { color: number; near: number; far: number }
  clouds: { color: number; shade: number; cover: number; speed: number }
  stars: number
  exposure: number
  /** 0..1: how strongly night-only emissives (windows, lamps, lanterns) glow. */
  nightGlow: number
  /** Always-on accents (crystals, virtual seams) multiplier. */
  accentGlow: number
  bloom: { strength: number; radius: number; threshold: number }
  grade: { lift: [number, number, number]; gain: [number, number, number]; saturation: number; vignette: number }
  /** Ambient particles: petals, spores, dust, data motes. */
  motes: { kind: 'petals' | 'spores' | 'dust' | 'data' | 'fireflies'; color: number; count: number }
  ambience: LoopName
  /** Extra aerial haze on the distant backdrop (0..1 towards the fog colour). */
  farHaze?: number
  /** Unshadowed back light that rims silhouettes (moonlight at night, crystal glow in the blight). */
  rim?: { color: number; intensity: number; dir: [number, number, number] }
}

export const THEMES: Record<MapTheme, ThemeDef> = {
  day: {
    id: 'day',
    sky: { top: 0x3f8fe0, horizon: 0xbfe3f5, bottom: 0xd9e7d4, haze: 0xfff1d6 },
    sunDir: [0.45, 0.78, 0.36],
    sunColor: 0xffecc8,
    sunIntensity: 2.5,
    disc: { color: 0xfff6dc, size: 0.035, glow: 0.35 },
    hemi: { sky: 0xbfdcff, ground: 0x8a7f5c, intensity: 0.95 },
    fog: { color: 0xc6dfe9, near: 90, far: 420 },
    clouds: { color: 0xffffff, shade: 0xb9c9dd, cover: 0.5, speed: 0.006 },
    stars: 0,
    exposure: 1.0,
    nightGlow: 0.05,
    accentGlow: 1,
    bloom: { strength: 0.55, radius: 0.55, threshold: 1.7 },
    grade: { lift: [0.0, 0.004, 0.012], gain: [1.03, 1.0, 0.97], saturation: 1.12, vignette: 0.28 },
    motes: { kind: 'petals', color: 0xffc4d6, count: 60 },
    ambience: 'ambCity',
    farHaze: 0.5
  },
  sunset: {
    id: 'sunset',
    sky: { top: 0x3c4f8e, horizon: 0xffb877, bottom: 0x7a5a58, haze: 0xffd496 },
    sunDir: [-0.75, 0.2, 0.42],
    sunColor: 0xffb468,
    sunIntensity: 2.7,
    disc: { color: 0xffe2a8, size: 0.05, glow: 0.75 },
    hemi: { sky: 0xb7a6c8, ground: 0x6e4e34, intensity: 0.9 },
    fog: { color: 0xe9ae80, near: 70, far: 380 },
    clouds: { color: 0xffc898, shade: 0x8e6680, cover: 0.5, speed: 0.004 },
    stars: 0.05,
    exposure: 1.05,
    nightGlow: 0.45,
    accentGlow: 1,
    bloom: { strength: 0.65, radius: 0.6, threshold: 1.55 },
    grade: { lift: [0.02, 0.008, 0.0], gain: [1.06, 1.0, 0.9], saturation: 1.1, vignette: 0.3 },
    motes: { kind: 'dust', color: 0xffd8a0, count: 50 },
    ambience: 'ambHarbor',
    farHaze: 0.55
  },
  night: {
    id: 'night',
    sky: { top: 0x070b1e, horizon: 0x24305a, bottom: 0x10131f, haze: 0x3a4a7a },
    sunDir: [-0.35, 0.72, -0.5],
    sunColor: 0x9fb6ff,
    sunIntensity: 0.95,
    disc: { color: 0xeef2ff, size: 0.03, glow: 0.4 },
    hemi: { sky: 0x4a5c9a, ground: 0x241f2c, intensity: 0.75 },
    fog: { color: 0x1a2240, near: 40, far: 210 },
    clouds: { color: 0x3a4570, shade: 0x141a30, cover: 0.45, speed: 0.004 },
    stars: 1,
    exposure: 1.15,
    nightGlow: 1,
    accentGlow: 1,
    bloom: { strength: 0.75, radius: 0.6, threshold: 1.0 },
    grade: { lift: [0.0, 0.01, 0.035], gain: [0.95, 1.0, 1.08], saturation: 1.05, vignette: 0.42 },
    motes: { kind: 'fireflies', color: 0xffe08a, count: 70 },
    ambience: 'ambCity',
    farHaze: 0.55,
    rim: { color: 0x9db8ff, intensity: 0.85, dir: [0.45, 0.4, 0.6] }
  },
  blight: {
    id: 'blight',
    sky: { top: 0x1c0f33, horizon: 0x8a4ab0, bottom: 0x2a1838, haze: 0xc77bdc },
    sunDir: [0.3, 0.55, -0.6],
    sunColor: 0xe7b8ff,
    sunIntensity: 1.6,
    disc: { color: 0xffd8f6, size: 0.06, glow: 0.8 },
    hemi: { sky: 0x9d74d0, ground: 0x3a2048, intensity: 0.9 },
    fog: { color: 0x6c3f8c, near: 30, far: 200 },
    clouds: { color: 0xa06ac0, shade: 0x401e5a, cover: 0.7, speed: 0.008 },
    stars: 0.25,
    exposure: 1.05,
    nightGlow: 0.35,
    accentGlow: 1.3,
    bloom: { strength: 0.7, radius: 0.6, threshold: 1.35 },
    grade: { lift: [0.02, 0.0, 0.04], gain: [1.02, 0.94, 1.06], saturation: 1.05, vignette: 0.45 },
    motes: { kind: 'spores', color: 0xd59cff, count: 120 },
    ambience: 'ambBlight',
    farHaze: 0.6,
    rim: { color: 0xff86e0, intensity: 0.55, dir: [-0.4, 0.3, 0.7] }
  },
  virtual: {
    id: 'virtual',
    sky: { top: 0x3f8fe6, horizon: 0xd4ecfb, bottom: 0xdfeefa, haze: 0xffffff },
    sunDir: [0.3, 0.85, 0.42],
    sunColor: 0xffffff,
    sunIntensity: 2.3,
    disc: { color: 0xffffff, size: 0.02, glow: 0.25 },
    hemi: { sky: 0xd0e6ff, ground: 0x8ea4bc, intensity: 1.05 },
    fog: { color: 0xcfe5f4, near: 110, far: 460 },
    clouds: { color: 0xffffff, shade: 0xc4dcef, cover: 0.3, speed: 0.01 },
    stars: 0,
    exposure: 0.95,
    nightGlow: 0.2,
    accentGlow: 1,
    bloom: { strength: 0.6, radius: 0.5, threshold: 1.9 },
    grade: { lift: [0.0, 0.005, 0.015], gain: [0.97, 1.0, 1.04], saturation: 1.12, vignette: 0.26 },
    motes: { kind: 'data', color: 0x7ff3ff, count: 70 },
    ambience: 'ambVirtual',
    farHaze: 0.35
  }
}

/** Theme for a map and variant (oldtown night → night; the blight crater stays blight but darker). */
export function themeFor(map: MapDef, variant?: 'night' | 'crater'): ThemeDef {
  if (variant === 'night') return THEMES.night
  const base = THEMES[map.theme] ?? THEMES.day
  if (variant === 'crater') {
    return {
      ...base,
      sky: { ...base.sky, top: 0x12081f, horizon: 0x7a2f8a },
      fog: { ...base.fog, near: 25, far: 170 },
      exposure: base.exposure * 0.95
    }
  }
  return base
}
