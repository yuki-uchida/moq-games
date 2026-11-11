import { describe, expect, it } from 'vitest'
import {
  bossRatio,
  collectText,
  heartStates,
  hintForInput,
  hudScale,
  isLowHealth,
  newBossBar,
  padSide,
  settleHeart,
  stepBossBar,
  ZONES
} from '../src/ui/hud-model'

describe('heart states', () => {
  it('shows full and empty hearts when nothing changed', () => {
    expect(heartStates(2, 4, 2)).toEqual(['full', 'full', 'empty', 'empty'])
    expect(heartStates(3, 3, -1)).toEqual(['full', 'full', 'full'])
  })

  it('plays the lose clip on exactly the hearts that were lost', () => {
    expect(heartStates(1, 4, 3)).toEqual(['full', 'lose', 'lose', 'empty'])
  })

  it('plays the gain clip on healed hearts', () => {
    expect(heartStates(3, 4, 1)).toEqual(['full', 'gain', 'gain', 'empty'])
  })

  it('settles clips onto a still heart', () => {
    expect(settleHeart('lose')).toBe('empty')
    expect(settleHeart('gain')).toBe('full')
    expect(settleHeart('full')).toBe('full')
  })

  it('pulses at two hearts or fewer, but not at zero', () => {
    expect([0, 1, 2, 3, 5].map(isLowHealth)).toEqual([false, true, true, false, false])
  })
})

describe('boss bar', () => {
  it('turns a value into a clamped ratio', () => {
    expect(bossRatio(5, 10)).toBe(0.5)
    expect(bossRatio(-3, 10)).toBe(0)
    expect(bossRatio(30, 10)).toBe(1)
    expect(bossRatio(1, 0)).toBe(0)
  })

  it('drains the fill smoothly without overshooting, and the trail follows later', () => {
    const bar = newBossBar(1)
    expect(stepBossBar(bar, 0.5, 1 / 60)).toBe(true)
    expect(bar.fill).toBeLessThan(1)
    expect(bar.fill).toBeGreaterThan(0.5)
    expect(bar.trail).toBe(1)
    for (let i = 0; i < 20; i++) {
      stepBossBar(bar, 0.5, 1 / 60)
      expect(bar.fill).toBeGreaterThanOrEqual(0.5)
    }
    // Still inside the hold: the trail has not moved.
    expect(bar.trail).toBe(1)
    for (let i = 0; i < 60; i++) stepBossBar(bar, 0.5, 1 / 60)
    expect(bar.trail).toBeLessThan(1)
    for (let i = 0; i < 600; i++) stepBossBar(bar, 0.5, 1 / 60)
    expect(bar.fill).toBe(0.5)
    expect(bar.trail).toBe(0.5)
  })

  it('is frame-rate independent and reports a hit only when the target drops', () => {
    const a = newBossBar(1)
    const b = newBossBar(1)
    stepBossBar(a, 0.4, 0.1)
    for (let i = 0; i < 10; i++) stepBossBar(b, 0.4, 0.01)
    expect(a.fill).toBeCloseTo(b.fill, 2)
    const bar = newBossBar(0.8)
    expect(stepBossBar(bar, 0.8, 1 / 60)).toBe(false)
    expect(stepBossBar(bar, 0.9, 1 / 60)).toBe(false)
    expect(bar.trail).toBeGreaterThanOrEqual(bar.fill)
  })
})

describe('touch pad', () => {
  it('maps a touch to the side it is on, with a dead zone in the middle', () => {
    expect(padSide(110, 100, 200)).toBe('left')
    expect(padSide(290, 100, 200)).toBe('right')
    expect(padSide(200, 100, 200)).toBeNull()
    expect(padSide(207, 100, 200)).toBeNull()
    expect(padSide(220, 100, 200)).toBe('right')
    expect(padSide(180, 100, 200)).toBe('left')
  })

  it('keeps pressing an end when the thumb slides past it', () => {
    expect(padSide(-50, 100, 200)).toBe('left')
    expect(padSide(900, 100, 200)).toBe('right')
  })

  it('presses nothing on a pad without width', () => {
    expect(padSide(10, 10, 0)).toBeNull()
  })
})

describe('texts and scale', () => {
  it('formats the collect counter', () => {
    expect(collectText(3, 8)).toBe('3/8')
    expect(collectText(-1, 8)).toBe('0/8')
  })

  it('scales the HUD by whole numbers from the stage width', () => {
    expect([320, 640, 844, 1280, 1920].map(hudScale)).toEqual([1, 1, 1, 2, 3])
  })
})

describe('staging zones', () => {
  it('keep the card slot, the nameplate and the toast in their own bands', () => {
    // Upper third: the card slot; lower third: boss feet, nameplate and toast, above the letterbox bar.
    expect(ZONES.cardTop).toBeLessThan(ZONES.cardBottom)
    expect(ZONES.cardBottom).toBeLessThanOrEqual(0.4)
    expect(ZONES.plateBottom).toBeGreaterThan(ZONES.barHeight)
    expect(ZONES.toastBottom).toBeLessThan(ZONES.plateBottom)
    expect(ZONES.bossFeet).toBeGreaterThan(ZONES.cardBottom)
    expect(ZONES.bossFeet).toBeLessThan(1 - ZONES.plateBottom - 0.2)
  })
})

describe('hints follow the input', () => {
  it('keeps keyboard hints for keyboard players', () => {
    expect(hintForInput('Z / X でかじる', false)).toBe('Z / X でかじる')
  })

  it('names the button instead of the keys for touch players', () => {
    expect(hintForInput('Z / X でかじる', true)).toBe('「かじる」ボタンでかじる')
    expect(hintForInput('Z/X でかじる', true)).toBe('「かじる」ボタンでかじる')
  })

  it('leaves hints without keys alone', () => {
    expect(hintForInput('木は2回かじるとたおれる', true)).toBe('木は2回かじるとたおれる')
  })
})
