import { describe, expect, it } from 'vitest'
import { sheetIds } from '../src/art'
import { OPENING_PAGES, STAGES, ENDING_PAGES, stageByNo } from '../src/game/stages'
import { MAPS } from '../src/game/maps'
import type { StageDef } from '../src/game/types'

const GIMMICK_CHARS = new Set(['T', 'N', 'P', 'H', 'A', 'R', '1', '2', 'x', 'y', 'D'])

function charsOf(stage: StageDef): string[] {
  return stage.map.flatMap((row) => [...row])
}

describe('stage catalogue', () => {
  it('has exactly ten stages with unique ids, names and bosses', () => {
    expect(STAGES).toHaveLength(10)
    expect(new Set(STAGES.map((stage) => stage.id)).size).toBe(10)
    expect(new Set(STAGES.map((stage) => stage.name)).size).toBe(10)
    expect(new Set(STAGES.map((stage) => stage.boss.name)).size).toBe(10)
    expect(STAGES.map((stage) => stage.no)).toEqual([1, 2, 3, 4, 5, 6, 7, 8, 9, 10])
  })

  it('gives every stage a boss with valid stats and a known body', () => {
    const sheets = sheetIds()
    for (const stage of STAGES) {
      const boss = stage.boss
      expect(boss.hp).toBeGreaterThan(0)
      expect(boss.speed).toBeGreaterThan(0)
      expect(boss.scale).toBeGreaterThan(0)
      expect(boss.art).toBeTruthy()
      expect(sheets).toContain(boss.art)
      expect(['chaser', 'brute', 'flyer', 'tank', 'swarm', 'final']).toContain(boss.kind)
    }
  })

  it('loads every map with a start, an exit and at least two gimmicks', () => {
    for (const stage of STAGES) {
      const map = MAPS[stage.id]
      expect(map.length).toBeGreaterThan(10)
      const chars = charsOf(stage)
      expect(chars).toContain('@')
      expect(chars.some((ch) => ch === 'G' || ch === 'n')).toBe(true)
      const gimmicks = new Set(chars.filter((ch) => GIMMICK_CHARS.has(ch)))
      expect(gimmicks.size).toBeGreaterThanOrEqual(2)
      expect(new Set(map.map((row) => row.length)).size).toBe(1)
    }
  })

  it('uses all five core gimmicks across the campaign', () => {
    const chars = STAGES.flatMap(charsOf)
    for (const ch of ['T', 'D', 'P', 'H', 'A']) expect(chars).toContain(ch)
  })

  it('has story text on every stage and a prologue and ending', () => {
    for (const stage of STAGES) {
      expect(stage.intro.length).toBeGreaterThan(0)
      expect(stage.clear.length).toBeGreaterThan(0)
      expect(stage.hints.length).toBeGreaterThan(0)
      expect(stage.subtitle).toBeTruthy()
    }
    expect(OPENING_PAGES.length).toBeGreaterThan(2)
    expect(ENDING_PAGES.length).toBeGreaterThan(2)
  })

  it('only the nest stage requires collecting materials', () => {
    const collect = STAGES.filter((stage) => stage.objective === 'collect')
    expect(collect).toHaveLength(1)
    expect(collect[0].id).toBe('stage-6')
    expect(collect[0].collect).toBe(8)
    for (const stage of STAGES) {
      if (stage.objective === 'collect') continue
      expect(['reach', 'boss']).toContain(stage.objective)
    }
  })

  it('resolves stages by number', () => {
    expect(stageByNo(1).id).toBe('stage-1')
    expect(stageByNo(10).id).toBe('stage-10')
    expect(stageByNo(99).id).toBe('stage-1')
  })
})
