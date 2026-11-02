import { describe, expect, it } from 'vitest'
import { availableLines, bosses, epilogue, intros, memorial, outros, prologue } from '../src/story'

describe('story', () => {
  const scenes = [prologue, ...intros, ...outros, ...Object.values(bosses), epilogue]
  it('uses valid speakers and short lines', () => {
    for (const line of scenes.flat()) {
      expect(['a', 'b', 'c', 'i', 'mist', 'dragon', 'narration']).toContain(line.speaker)
      expect(Array.from(line.text).length).toBeLessThanOrEqual(36)
    }
  })
  it('remains readable with any two lost allies', () => {
    const allies = ['a', 'b', 'c', 'i']
    for (const first of allies)
      for (const second of allies) {
        const present = allies.filter((id) => id !== first && id !== second)
        for (const scene of scenes) {
          const lines = availableLines(scene, present)
          expect(lines.length).toBeGreaterThan(0)
          expect(lines.some((line) => [first, second].includes(line.speaker))).toBe(false)
        }
      }
  })
  it('remembers runtime names individually', () => {
    expect(memorial(['燈守リオ', '風読みネリ']).map((line) => line.text)).toEqual([
      '燈守リオの想いも、この燈と共に。',
      '風読みネリの想いも、この燈と共に。'
    ])
  })
})
