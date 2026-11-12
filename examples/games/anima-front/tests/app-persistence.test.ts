import { describe, expect, it } from 'vitest'
import { PRESETS, makeLoadout } from '../src/data/loadout'
import { repairLoadout, repairLoadoutShape, placementError, pawLists, emptyLoadout } from '../src/app/loadouts'
import {
  ARMORY_KEY,
  deleteCustom,
  emptyProgress,
  loadArmory,
  loadProgress,
  missionUnlocked,
  recordMission,
  resolveLoadout,
  saveArmory,
  saveProgress,
  storeCustom
} from '../src/app/saves'
import {
  defaultSettings,
  loadSettings,
  rendererOptionsFrom,
  sanitizeSettings,
  saveSettings,
  withSetting
} from '../src/app/settings'
import { STORAGE_PREFIX, memoryStore, readJson, writeJson, type KeyValueStore } from '../src/app/storage'

const throwingStore: KeyValueStore = {
  getItem: () => {
    throw new Error('blocked')
  },
  setItem: () => {
    throw new Error('quota')
  },
  removeItem: () => {
    throw new Error('blocked')
  }
}

describe('storage', () => {
  it('prefixes keys and survives broken JSON and blocked storage', () => {
    const store = memoryStore()
    expect(writeJson(store, 'x', { a: 1 })).toBe(true)
    expect(store.data.get(`${STORAGE_PREFIX}x`)).toBe('{"a":1}')
    store.setItem(`${STORAGE_PREFIX}bad`, '{nope')
    expect(readJson(store, 'bad')).toBeUndefined()
    expect(readJson(throwingStore, 'x')).toBeUndefined()
    expect(writeJson(throwingStore, 'x', 1)).toBe(false)
    expect(readJson(null, 'x')).toBeUndefined()
  })
})

describe('settings', () => {
  it('defaults follow prefers-reduced-motion', () => {
    expect(defaultSettings(true).reducedMotion).toBe(true)
    expect(loadSettings(memoryStore(), true).reducedMotion).toBe(true)
  })

  it('persists and reloads', () => {
    const store = memoryStore()
    const s = withSetting(withSetting(defaultSettings(), 'mouseSensitivity', 1.7), 'quality', 'high')
    expect(saveSettings(store, s)).toBe(true)
    const back = loadSettings(store)
    expect(back.mouseSensitivity).toBe(1.7)
    expect(back.quality).toBe('high')
  })

  it('clamps ranges and rejects bad values', () => {
    const s = sanitizeSettings({ fov: 400, quality: 'ultra', invertY: 'yes', volumeMusic: -2, extra: 1 })
    expect(s.fov).toBe(100)
    expect(s.quality).toBe('auto')
    expect(s.invertY).toBe(false)
    expect(s.volumeMusic).toBe(0)
    expect('extra' in s).toBe(false)
    expect(sanitizeSettings('garbage')).toEqual(defaultSettings())
    expect(loadSettings(throwingStore)).toEqual(defaultSettings())
  })

  it('maps to renderer options', () => {
    const o = rendererOptionsFrom(withSetting(defaultSettings(), 'bloom', false))
    expect(o.bloom).toBe(false)
    expect(o.quality).toBe('auto')
  })
})

describe('loadout repair', () => {
  it('fixes the shape of untrusted data', () => {
    const l = repairLoadoutShape({ slots: [{ item: 'bee' }, { item: 'nope' }, { item: 'turtle', hand: 'L' }, 5] })
    expect(l.slots).toHaveLength(16)
    expect(l.slots[0]).toEqual({ item: 'bee', hand: 'R' })
    expect(l.slots[1]).toBeNull()
    expect(l.slots[2]).toEqual({ item: 'turtle' })
  })

  it('never lets a stub sanitizer wipe a valid build', () => {
    const preset = PRESETS[0].loadout
    const wiped = repairLoadout(preset, () => emptyLoadout())
    expect(wiped.slots.filter(Boolean).length).toBe(preset.slots.filter(Boolean).length)
    const thrown = repairLoadout(preset, () => {
      throw new Error('not yet')
    })
    expect(thrown.slots.filter(Boolean).length).toBeGreaterThan(0)
  })

  it('uses the sim sanitizer result when it is sane', () => {
    const preset = makeLoadout(['bee', 'orca'], ['frog'], ['koala'])
    const trimmed = repairLoadout(preset, (l) => {
      const copy = repairLoadoutShape(l)
      copy.slots[1] = null
      return copy
    })
    expect(trimmed.slots[1]).toBeNull()
    expect(trimmed.slots[0]).toEqual({ item: 'bee', hand: 'R' })
  })

  it('applies placement rules locally', () => {
    const l = makeLoadout(['bee'], ['bee'], ['koala', 'koala', 'koala', 'turtle'])
    expect(placementError(l, 10, { item: 'koala' })).toMatch('3')
    expect(placementError(l, 10, { item: 'turtle' })).toMatch('1つまで')
    expect(placementError(l, 10, { item: 'bee', hand: 'R' })).toMatch('同じ手')
    expect(placementError(l, 10, { item: 'wood', hand: 'R' })).toBeNull()
    expect(pawLists(l)).toEqual({ R: ['bee'], L: ['bee'], passive: ['koala', 'koala', 'koala', 'turtle'] })
  })
})

describe('progress', () => {
  it('unlocks missions in order and keeps the best record', () => {
    let p = emptyProgress()
    expect(missionUnlocked(p, 'sakura')).toBe(true)
    expect(missionUnlocked(p, 'harbor')).toBe(false)
    const lost = recordMission(p, 'sakura', false, null)
    expect(missionUnlocked(lost.progress, 'harbor')).toBe(false)
    const won = recordMission(p, 'sakura', true, { rank: 'B', score: 500, difficulty: 'normal', time: 300 })
    expect(won.unlocked).toBe('harbor')
    expect(won.newBest).toBe(true)
    p = won.progress
    expect(missionUnlocked(p, 'harbor')).toBe(true)
    const worse = recordMission(p, 'sakura', true, { rank: 'C', score: 900, difficulty: 'hard', time: 200 })
    expect(worse.newBest).toBe(false)
    const better = recordMission(p, 'sakura', true, { rank: 'S', score: 950, difficulty: 'easy', time: 200 })
    expect(better.newBest).toBe(true)
    expect(better.progress.best.sakura?.rank).toBe('S')
  })

  it('round-trips and repairs stored progress', () => {
    const store = memoryStore()
    const p = recordMission(emptyProgress(), 'sakura', true, {
      rank: 'A',
      score: 720,
      difficulty: 'hard',
      time: 280
    }).progress
    saveProgress(store, p)
    expect(loadProgress(store)).toEqual(p)
    writeJson(store, 'progress', { cleared: ['maw', 'zzz'], best: { harbor: { rank: 'Z' } }, pvpWins: 4 })
    const repaired = loadProgress(store)
    expect(repaired.cleared).toEqual(['maw'])
    expect(repaired.best).toEqual({})
    expect(repaired.pvpWins).toBe(0)
  })
})

describe('armory', () => {
  it('saves three customs per animal and reloads them', () => {
    const store = memoryStore()
    const sanitize = (l: unknown) => repairLoadoutShape(l)
    let a = loadArmory(store, sanitize)
    expect(resolveLoadout(a, 'bear').name).toBe('タンク')
    const build = makeLoadout(['bee', 'claw'], ['gecko'], ['koala'])
    a = storeCustom(a, 'bear', 2, { name: '森のくまさん', loadout: build, savedAt: 1 })
    a = { ...a, species: 'bear' }
    saveArmory(store, a)
    const back = loadArmory(store, sanitize)
    expect(back.species).toBe('bear')
    expect(resolveLoadout(back, 'bear')).toEqual({ loadout: build, name: '森のくまさん' })
    const cleared = deleteCustom(back, 'bear', 2)
    expect(resolveLoadout(cleared, 'bear').name).toBe('タンク')
  })

  it('migrates the version 1 shape', () => {
    const store = memoryStore()
    const build = makeLoadout(['wood'], ['bee'], ['hawk'])
    store.setItem(
      `${STORAGE_PREFIX}${ARMORY_KEY}`,
      JSON.stringify({ selected: 'owl', custom: { owl: [null, build] }, choice: { owl: { kind: 'custom', index: 1 } } })
    )
    const a = loadArmory(store, (l) => repairLoadoutShape(l))
    expect(a.version).toBe(2)
    expect(a.species).toBe('owl')
    expect(a.custom.owl[1]?.name).toBe('カスタム2')
    expect(resolveLoadout(a, 'owl').loadout).toEqual(build)
  })

  it('drops a custom choice that points at an empty slot', () => {
    const store = memoryStore()
    writeJson(store, ARMORY_KEY, { version: 2, species: 'cat', choice: { cat: { kind: 'custom', index: 0 } } })
    const a = loadArmory(store)
    expect(a.choice.cat).toEqual({ kind: 'preset', id: 'skirmisher' })
  })
})
