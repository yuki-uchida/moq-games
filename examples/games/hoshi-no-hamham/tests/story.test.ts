import { afterEach, describe, expect, it } from 'vitest'
import { ENDING_PAGES, OPENING_PAGES, STAGES } from '../src/game/stages'
import { emptySave, loadSave, storeSave, type SaveData } from '../src/game/types'

function memoryStorage() {
  const map = new Map<string, string>()
  return {
    getItem: (key: string) => map.get(key) ?? null,
    setItem: (key: string, value: string) => void map.set(key, String(value)),
    removeItem: (key: string) => void map.delete(key),
    clear: () => map.clear(),
    get size() {
      return map.size
    }
  }
}

afterEach(() => {
  // @ts-expect-error resetting the global for the next test
  delete globalThis.localStorage
})

describe('story', () => {
  it('opens with the quarrel and the escape from the nest', () => {
    const text = OPENING_PAGES.join('\n')
    expect(text).toContain('ハム彦')
    expect(text).toContain('ハム代')
    expect(text).toContain('巣を飛び出しました')
  })

  it('follows the requested story beats in order', () => {
    const byNo = (no: number) => STAGES[no - 1]
    expect(byNo(1).name).toBe('おふくろの追撃')
    expect(byNo(1).intro.join('')).toContain('ハム代')
    expect(byNo(2).intro.join('')).toContain('ハム姫')
    expect(byNo(2).intro.join('')).toContain('ばくろ団')
    expect(byNo(3).intro.join('')).toContain('さらわれて')
    expect(byNo(4).name).toBe('奪還の作戦')
    expect(byNo(5).name).toBe('森の逃走')
    expect(byNo(6).name).toBe('森の巣')
    expect(byNo(6).intro.join('')).toContain('巣')
    expect(byNo(7).name).toBe('追っ手の反撃')
    expect(byNo(8).intro.join('')).toContain('再びさらわれて')
    expect(byNo(9).name).toBe('敵の本拠地')
    expect(byNo(10).name).toBe('星の決戦')
    expect(byNo(10).boss.name).toBe('黒ハム王')
  })

  it('ends with the rescue and a peaceful nest', () => {
    const text = ENDING_PAGES.join('\n')
    expect(text).toContain('ハム彦')
    expect(text).toContain('ハム姫')
    expect(text).toContain('ハム代')
    expect(text).toContain('おしまい')
  })

  it('gives every stage a distinct boss that matches its story', () => {
    expect(STAGES[0].boss.title).toBe('おふくろ')
    expect(STAGES[1].boss.art).toBe('crowBoss')
    expect(STAGES[5].boss.art).toBe('bearBoss')
    expect(STAGES[9].boss.art).toBe('king')
  })
})

describe('save data', () => {
  it('round-trips through storage', () => {
    const original = globalThis.localStorage
    //@ts-expect-error test double
    globalThis.localStorage = memoryStorage()
    try {
      const save: SaveData = { ...emptySave(), cleared: [1, 2, 3], unlocked: 4, best: { 'stage-1': 42.5 }, muted: true }
      storeSave(save)
      expect(loadSave()).toEqual(save)
    } finally {
      globalThis.localStorage = original
    }
  })

  it('rejects a different save version', () => {
    const original = globalThis.localStorage
    //@ts-expect-error test double
    globalThis.localStorage = memoryStorage()
    try {
      globalThis.localStorage.setItem('hoshi-no-hamham-v1', JSON.stringify({ version: 999 }))
      expect(loadSave()).toEqual(emptySave())
    } finally {
      globalThis.localStorage = original
    }
  })

  it('falls back to an empty save when storage throws', () => {
    const original = globalThis.localStorage
    //@ts-expect-error test double
    globalThis.localStorage = {
      getItem() {
        throw new Error('denied')
      },
      setItem() {
        throw new Error('denied')
      }
    }
    try {
      expect(loadSave()).toEqual(emptySave())
      storeSave(emptySave())
    } finally {
      globalThis.localStorage = original
    }
  })
})
