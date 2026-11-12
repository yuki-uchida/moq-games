import { expect, test } from 'vitest'
import { isPinch } from '../src/ui/zoom-guard'

const touches = (n: number) => ({ touches: { length: n } as unknown as TouchList })

test('only a touch with two or more fingers counts as a pinch', () => {
  expect(isPinch(touches(0))).toBe(false)
  expect(isPinch(touches(1))).toBe(false)
  expect(isPinch(touches(2))).toBe(true)
  expect(isPinch(touches(3))).toBe(true)
})
