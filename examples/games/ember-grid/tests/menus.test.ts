import { describe, expect, it } from 'vitest'
import { chapterLine, chapterObjective } from '../src/menus'

describe('chapter menu lines', () => {
  it('shows the objective for an uncleared chapter', () => {
    expect(chapterObjective(0)).toBe('敵を全滅させる')
    expect(chapterLine(0, { cleared: [], bestTurns: {} })).toBe('敵を全滅させる')
  })
  it('adds the clear mark and best turns', () => {
    expect(chapterLine(3, { cleared: [3], bestTurns: { 3: 7 } })).toBe(
      '祠を制圧する（✦に味方を置いて味方フェイズ終了） · ✓ クリア · 最短 7 ターン'
    )
    expect(chapterLine(1, { cleared: [1], bestTurns: {} })).toBe('敵を全滅させる · ✓ クリア')
  })
  it('states the exact seize condition', () => {
    expect(chapterObjective(3)).toBe('祠を制圧する（✦に味方を置いて味方フェイズ終了）')
  })
  it('is empty for an unknown chapter', () => {
    expect(chapterObjective(99)).toBe('')
  })
})
