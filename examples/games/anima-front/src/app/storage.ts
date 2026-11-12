/**
 * Safe key/value persistence (DESIGN §1: keys start with `anima-front-v1:`). Every access is wrapped in
 * try/catch: storage can be missing, full or blocked (private windows, embedded previews) and the game must
 * keep working with in-memory defaults.
 */

export const STORAGE_PREFIX = 'anima-front-v1:'

export interface KeyValueStore {
  getItem(key: string): string | null
  setItem(key: string, value: string): void
  removeItem(key: string): void
}

/** The browser's localStorage, or null when it cannot be reached. */
export function browserStore(): KeyValueStore | null {
  try {
    const store = globalThis.localStorage
    if (!store) return null
    return store
  } catch {
    return null
  }
}

/** A Map-backed store (tests, or when the browser blocks storage). */
export function memoryStore(initial: Record<string, string> = {}): KeyValueStore & { data: Map<string, string> } {
  const data = new Map(Object.entries(initial))
  return {
    data,
    getItem: (key) => data.get(key) ?? null,
    setItem: (key, value) => void data.set(key, String(value)),
    removeItem: (key) => void data.delete(key)
  }
}

/** Parsed JSON under `anima-front-v1:<key>`; undefined when missing, unreadable or invalid. */
export function readJson(store: KeyValueStore | null, key: string): unknown {
  if (!store) return undefined
  try {
    const raw = store.getItem(STORAGE_PREFIX + key)
    if (raw == null) return undefined
    return JSON.parse(raw) as unknown
  } catch {
    return undefined
  }
}

/** Writes JSON; returns false when the store refused (quota, blocked). */
export function writeJson(store: KeyValueStore | null, key: string, value: unknown): boolean {
  if (!store) return false
  try {
    store.setItem(STORAGE_PREFIX + key, JSON.stringify(value))
    return true
  } catch {
    return false
  }
}

export function removeKey(store: KeyValueStore | null, key: string): void {
  if (!store) return
  try {
    store.removeItem(STORAGE_PREFIX + key)
  } catch {
    // ignore: nothing to clean up when storage is blocked
  }
}

export const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value)

export const clampNumber = (value: unknown, min: number, max: number, fallback: number): number =>
  typeof value === 'number' && Number.isFinite(value) ? Math.min(max, Math.max(min, value)) : fallback
