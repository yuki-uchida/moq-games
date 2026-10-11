export interface SoundPreferences {
  version: 1
  enabled: boolean
  volume: number
}
export const SOUND_PREFERENCES_KEY = 'tower-defense-audio-v1'
const defaults = (): SoundPreferences => ({ version: 1, enabled: true, volume: 0.2 })

export function loadSoundPreferences(): SoundPreferences {
  try {
    const raw = globalThis.localStorage?.getItem(SOUND_PREFERENCES_KEY)
    if (!raw || raw.length > 256) return defaults()
    const value = JSON.parse(raw)
    if (
      !value ||
      typeof value !== 'object' ||
      Object.keys(value).length !== 3 ||
      value.version !== 1 ||
      typeof value.enabled !== 'boolean' ||
      typeof value.volume !== 'number' ||
      !Number.isFinite(value.volume) ||
      value.volume < 0 ||
      value.volume > 1
    )
      return defaults()
    return { version: 1, enabled: value.enabled, volume: value.volume }
  } catch {
    return defaults()
  }
}

export function saveSoundPreferences(value: SoundPreferences): boolean {
  try {
    if (!globalThis.localStorage) return false
    globalThis.localStorage.setItem(
      SOUND_PREFERENCES_KEY,
      JSON.stringify({ version: 1, enabled: value.enabled, volume: Math.max(0, Math.min(1, value.volume)) })
    )
    return true
  } catch {
    return false
  }
}
