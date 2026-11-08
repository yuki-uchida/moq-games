/** Saved data in localStorage['mamono-jinkei-v1']: progress, settings and the player name (all failures ignored). */
import type { Progress } from '../sim/api'
import { STAGES, type StageId } from '../vocab'

export const SAVE_KEY = 'mamono-jinkei-v1'

export interface Settings {
  music: number
  sfx: number
  shake: boolean
  muted: boolean
}

export interface SaveData {
  progress: Progress
  settings: Settings
  name: string
  best?: Partial<Record<StageId, { rank: string; time: number }>>
}

export const DEFAULT_SAVE: SaveData = {
  progress: { cleared: [] },
  settings: { music: 0.7, sfx: 0.9, shake: true, muted: false },
  name: ''
}

const clamp01 = (v: unknown, d: number) =>
  typeof v === 'number' && Number.isFinite(v) ? Math.min(1, Math.max(0, v)) : d

/** Parses stored JSON defensively; anything malformed falls back to defaults. */
export function parseSave(text: string | null): SaveData {
  const d = DEFAULT_SAVE
  if (!text) return structuredClone(d)
  try {
    const raw = JSON.parse(text) as Partial<SaveData>
    const cleared = Array.isArray(raw.progress?.cleared)
      ? raw.progress.cleared.filter((s): s is StageId => (STAGES as readonly string[]).includes(s))
      : []
    const s = (raw.settings ?? {}) as Partial<Settings>
    return {
      progress: { cleared: [...new Set(cleared)] },
      settings: {
        music: clamp01(s.music, d.settings.music),
        sfx: clamp01(s.sfx, d.settings.sfx),
        shake: typeof s.shake === 'boolean' ? s.shake : d.settings.shake,
        muted: typeof s.muted === 'boolean' ? s.muted : d.settings.muted
      },
      name: typeof raw.name === 'string' ? raw.name.slice(0, 12) : '',
      best: raw.best && typeof raw.best === 'object' ? raw.best : undefined
    }
  } catch {
    return structuredClone(d)
  }
}

export function loadSave(): SaveData {
  try {
    return parseSave(localStorage.getItem(SAVE_KEY))
  } catch {
    return parseSave(null)
  }
}

export function storeSave(data: SaveData): void {
  try {
    localStorage.setItem(SAVE_KEY, JSON.stringify(data))
  } catch {
    // Private mode or storage full: progress just is not kept.
  }
}
