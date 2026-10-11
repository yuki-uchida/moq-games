import { it, expect } from 'vitest'
import { sampleBlink, validateWolfLid } from './WolfLidMaterial'

it('interpolates only declared numeric material keys and preserves silent exact samples', () => {
  // Arrange
  const keys = [
    { timeMs: 0, blink: 0, depthMorph: 0 },
    { timeMs: 42, blink: 0.5, depthMorph: 0.875 },
    { timeMs: 83, blink: 1, depthMorph: 1 }
  ]
  // Act / Assert
  expect(sampleBlink(keys, 21)).toBe(0.25)
  expect(sampleBlink(keys, 42)).toBe(0.5)
  expect(sampleBlink(keys, 100)).toBe(1)
})
it('missing/unknown adapter fails instead of drawing open painted eyes', () => {
  // Arrange
  const imported = { adapterId: 'run-this-shader', source: 'untrusted shader' }
  // Act / Assert
  expect(() => validateWolfLid(imported)).toThrow(/unsupported/)
  expect(() => validateWolfLid(null)).toThrow()
})
