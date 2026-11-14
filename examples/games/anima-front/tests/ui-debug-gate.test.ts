import { describe, expect, it } from 'vitest'
import { debugEnabled } from '../src/app/debug'
import { netDebugEnabled } from '../src/net/debug'

describe('debug hooks exist only on the Vite dev server', () => {
  it('gates window.__anima on the dev flag, never on the URL', () => {
    expect(debugEnabled(true)).toBe(true)
    expect(debugEnabled(false)).toBe(false)
  })

  it('gates window.__animaNet on the dev flag and a window', () => {
    expect(netDebugEnabled(true, true)).toBe(true)
    expect(netDebugEnabled(false, true)).toBe(false)
    expect(netDebugEnabled(true, false)).toBe(false)
  })
})
