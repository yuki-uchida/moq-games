import { describe, expect, it } from 'vitest'
import { jingleNotes } from '../src/audio'

describe('result motifs', () => {
  it('descends for defeat and has a distinct final fanfare', () => {
    expect(jingleNotes.defeat).toEqual([392, 330, 262])
    expect(jingleNotes.victory).toEqual([523, 659, 784])
    expect(jingleNotes.final).toEqual([523, 659, 784, 1047])
  })
})
