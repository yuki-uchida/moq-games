/**
 * Player settings (DESIGN §17.12): persisted under `anima-front-v1:settings`, versioned, applied live to the
 * renderer, audio and input. Pure: storage is injected so the rules are unit-tested.
 */
import type { RendererOptions } from '../render/api'
import { clampNumber, isRecord, readJson, writeJson, type KeyValueStore } from './storage'

export const SETTINGS_KEY = 'settings'
export const SETTINGS_VERSION = 1

export type QualitySetting = 'low' | 'medium' | 'high' | 'auto'
export type AimAssist = 'off' | 'low' | 'high'

export interface Settings {
  version: typeof SETTINGS_VERSION
  mouseSensitivity: number
  invertY: boolean
  fov: number
  quality: QualitySetting
  shadows: boolean
  bloom: boolean
  resolutionScale: number
  volumeMaster: number
  volumeMusic: number
  volumeSfx: number
  reducedMotion: boolean
  damageNumbers: boolean
  controlHints: boolean
  gamepadSensitivity: number
  aimAssist: AimAssist
}

export const defaultSettings = (prefersReducedMotion = false): Settings => ({
  version: SETTINGS_VERSION,
  mouseSensitivity: 1,
  invertY: false,
  fov: 75,
  quality: 'auto',
  shadows: true,
  bloom: true,
  resolutionScale: 1,
  volumeMaster: 0.8,
  volumeMusic: 0.7,
  volumeSfx: 0.8,
  reducedMotion: prefersReducedMotion,
  damageNumbers: true,
  controlHints: true,
  gamepadSensitivity: 1,
  aimAssist: 'low'
})

export type SettingKey = Exclude<keyof Settings, 'version'>

/** How each setting is shown on the 設定 screen (also the validation ranges). */
export type SettingSpec =
  | {
      key: SettingKey
      label: string
      kind: 'range'
      min: number
      max: number
      step: number
      format: (v: number) => string
    }
  | { key: SettingKey; label: string; kind: 'toggle' }
  | { key: SettingKey; label: string; kind: 'choice'; options: readonly { value: string; label: string }[] }

const pct = (v: number) => `${Math.round(v * 100)}%`

export const SETTING_GROUPS: readonly { id: string; label: string; items: readonly SettingSpec[] }[] = [
  {
    id: 'controls',
    label: '操作',
    items: [
      {
        key: 'mouseSensitivity',
        label: 'マウス感度',
        kind: 'range',
        min: 0.2,
        max: 3,
        step: 0.05,
        format: (v) => v.toFixed(2)
      },
      { key: 'invertY', label: '上下反転', kind: 'toggle' },
      {
        key: 'gamepadSensitivity',
        label: 'パッド感度',
        kind: 'range',
        min: 0.3,
        max: 2.5,
        step: 0.05,
        format: (v) => v.toFixed(2)
      },
      {
        key: 'aimAssist',
        label: 'エイムアシスト（パッド・タッチ）',
        kind: 'choice',
        options: [
          { value: 'off', label: 'なし' },
          { value: 'low', label: '弱' },
          { value: 'high', label: '強' }
        ]
      },
      { key: 'controlHints', label: '操作ヒントを表示', kind: 'toggle' }
    ]
  },
  {
    id: 'video',
    label: '画面',
    items: [
      { key: 'fov', label: '視野角', kind: 'range', min: 60, max: 100, step: 1, format: (v) => `${Math.round(v)}°` },
      {
        key: 'quality',
        label: '画質',
        kind: 'choice',
        options: [
          { value: 'low', label: '低' },
          { value: 'medium', label: '中' },
          { value: 'high', label: '高' },
          { value: 'auto', label: '自動' }
        ]
      },
      { key: 'shadows', label: '影', kind: 'toggle' },
      { key: 'bloom', label: 'ブルーム（発光）', kind: 'toggle' },
      { key: 'resolutionScale', label: '解像度', kind: 'range', min: 0.5, max: 1, step: 0.05, format: pct },
      { key: 'damageNumbers', label: 'ダメージ数値', kind: 'toggle' },
      { key: 'reducedMotion', label: '動きを減らす', kind: 'toggle' }
    ]
  },
  {
    id: 'audio',
    label: '音量',
    items: [
      { key: 'volumeMaster', label: '全体', kind: 'range', min: 0, max: 1, step: 0.05, format: pct },
      { key: 'volumeMusic', label: '音楽', kind: 'range', min: 0, max: 1, step: 0.05, format: pct },
      { key: 'volumeSfx', label: '効果音', kind: 'range', min: 0, max: 1, step: 0.05, format: pct }
    ]
  }
]

export const SETTING_SPECS: readonly SettingSpec[] = SETTING_GROUPS.flatMap((g) => g.items)

/** Repairs any stored value into valid settings (unknown keys dropped, out-of-range values clamped). */
export function sanitizeSettings(raw: unknown, prefersReducedMotion = false): Settings {
  const base = defaultSettings(prefersReducedMotion)
  if (!isRecord(raw)) return base
  const out: Settings = { ...base }
  const target = out as unknown as Record<string, unknown>
  for (const spec of SETTING_SPECS) {
    const value = raw[spec.key]
    if (spec.kind === 'range') {
      target[spec.key] = clampNumber(value, spec.min, spec.max, base[spec.key] as number)
    } else if (spec.kind === 'toggle') {
      if (typeof value === 'boolean') target[spec.key] = value
    } else if (typeof value === 'string' && spec.options.some((o) => o.value === value)) {
      target[spec.key] = value
    }
  }
  return out
}

export function loadSettings(store: KeyValueStore | null, prefersReducedMotion = false): Settings {
  return sanitizeSettings(readJson(store, SETTINGS_KEY), prefersReducedMotion)
}

export function saveSettings(store: KeyValueStore | null, settings: Settings): boolean {
  return writeJson(store, SETTINGS_KEY, settings)
}

/** Returns a copy with one setting changed (validated through the same rules as loading). */
export function withSetting(settings: Settings, key: SettingKey, value: unknown): Settings {
  return sanitizeSettings({ ...settings, [key]: value }, settings.reducedMotion)
}

export function rendererOptionsFrom(settings: Settings): RendererOptions {
  return {
    quality: settings.quality,
    shadows: settings.shadows,
    bloom: settings.bloom,
    resolutionScale: settings.resolutionScale,
    fov: settings.fov,
    damageNumbers: settings.damageNumbers,
    reducedMotion: settings.reducedMotion
  }
}

export const AIM_ASSIST_STRENGTH: Record<AimAssist, number> = { off: 0, low: 0.35, high: 0.6 }
