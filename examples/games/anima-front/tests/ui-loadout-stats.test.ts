/** The loadout editor's sustain readout (DESIGN §7). */
import { describe, expect, it } from 'vitest'
import { formatSustain } from '../src/ui/screens/loadout-stats'

describe('formatSustain', () => {
  it('rounds to whole seconds before splitting minutes (never 1分60秒)', () => {
    expect(formatSustain(119.6)).toBe('2分00秒')
    expect(formatSustain(119.4)).toBe('1分59秒')
    expect(formatSustain(59.6)).toBe('1分00秒')
    expect(formatSustain(59.4)).toBe('59秒')
    expect(formatSustain(435)).toBe('7分15秒')
    expect(formatSustain(600)).toBe('10分以上')
    expect(formatSustain(Infinity)).toBe('∞')
  })
})
