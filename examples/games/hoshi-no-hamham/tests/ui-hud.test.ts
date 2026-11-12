import { describe, expect, it } from 'vitest'
import {
  aimLine,
  arriveHold,
  stepHold,
  type DeckHold,
  bossRatio,
  DECK_TOAST_SECONDS,
  HINT_SECONDS,
  hintIndex,
  hintLine,
  trackRatio,
  type AimState,
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

describe('control deck: the aim line', () => {
  const base: AimState = {
    objective: 'reach',
    collected: 0,
    need: 0,
    goalOpen: true,
    state: 'play',
    boss: null
  }
  const boss = { name: 'いのしし番長', active: false, dead: false, stamina: false }

  it('points a plain stage at the goal', () => {
    expect(aimLine(base)).toEqual({ text: 'ゴールをめざせ！', tone: 'go' })
  })

  it('sends a boss stage on to the boss before the fight', () => {
    expect(aimLine({ ...base, objective: 'boss', goalOpen: false, boss })).toEqual({
      text: 'おくの ボスを めざせ！',
      tone: 'go'
    })
  })

  it('counts the materials while collecting', () => {
    const state: AimState = { ...base, objective: 'collect', need: 8, collected: 3, goalOpen: false, boss }
    expect(aimLine(state)).toEqual({ text: 'ざいりょう 3/8', tone: 'collect' })
    expect(aimLine({ ...state, collected: 0 }).text).toBe('ざいりょう 0/8')
  })

  it('names the boss while a fight is on, and says to run from a chaser', () => {
    const fight: AimState = { ...base, objective: 'boss', goalOpen: false, boss: { ...boss, active: true } }
    expect(aimLine(fight)).toEqual({ text: 'いのしし番長を たおせ！', tone: 'boss' })
    const chase: AimState = {
      ...base,
      boss: { name: 'ママ・ハム代', active: true, dead: false, stamina: true }
    }
    expect(aimLine(chase)).toEqual({ text: 'ママ・ハム代から にげきれ！', tone: 'boss' })
    // A boss that turns up on a collect stage takes over the line.
    expect(aimLine({ ...fight, objective: 'collect', need: 8, collected: 8 }).tone).toBe('boss')
  })

  it('announces the open goal once the boss is down or the materials are in', () => {
    const won: AimState = { ...base, objective: 'boss', goalOpen: true, boss: { ...boss, active: true, dead: true } }
    expect(aimLine(won)).toEqual({ text: 'ゴールがひらいた！', tone: 'open' })
    expect(aimLine({ ...won, goalOpen: false }).text).toBe('ボスをやっつけた！')
    expect(aimLine({ ...base, objective: 'collect', need: 8, collected: 8, goalOpen: true }).text).toBe(
      'ゴールがひらいた！'
    )
  })

  it('says the stage is cleared', () => {
    expect(aimLine({ ...base, state: 'clear', boss: { ...boss, active: true } })).toEqual({
      text: 'ステージクリア！',
      tone: 'clear'
    })
  })
})

describe('control deck: the hint cycle', () => {
  const hints = ['Z / X でかじる', '木は2回かじるとたおれる', '蜂の巣は敵も味方もさす']

  it('shows each hint in order for a few seconds and wraps around', () => {
    expect(HINT_SECONDS).toBeGreaterThanOrEqual(3)
    expect(HINT_SECONDS).toBeLessThanOrEqual(6)
    const at = (i: number) => hintIndex(i * HINT_SECONDS + 0.01, hints.length)
    expect([0, 1, 2, 3, 4, 5, 6].map(at)).toEqual([0, 1, 2, 0, 1, 2, 0])
    expect(hintIndex(HINT_SECONDS - 0.01, 3)).toBe(0)
    expect(hintIndex(-2, 3)).toBe(0)
  })

  it('has nothing to show without hints', () => {
    expect(hintIndex(10, 0)).toBe(-1)
    expect(hintLine([], 10, true)).toBe('')
  })

  it('words the hints for the input in use', () => {
    expect(hintLine(hints, 0, false)).toBe('Z / X でかじる')
    expect(hintLine(hints, 0, true)).toBe('「かじる」ボタンでかじる')
    expect(hintLine(hints, HINT_SECONDS * 4 + 1, true)).toBe('木は2回かじるとたおれる')
  })

  it('lets a toast hold the line for a moment, shorter than two hints', () => {
    expect(DECK_TOAST_SECONDS).toBeGreaterThan(1.5)
    expect(DECK_TOAST_SECONDS).toBeLessThan(HINT_SECONDS * 2)
  })
})

describe('control deck: the progress track', () => {
  it('places a position along the stage, clamped to the ends', () => {
    expect(trackRatio(0, 6400)).toBe(0)
    expect(trackRatio(3200, 6400)).toBe(0.5)
    expect(trackRatio(-40, 6400)).toBe(0)
    expect(trackRatio(9000, 6400)).toBe(1)
    expect(trackRatio(10, 0)).toBe(0)
  })
})

describe('control deck: speech lines and toasts share the line', () => {
  const hints = ['Z / X でかじる', 'あなをとびこえよう']
  const speech: DeckHold = { kind: 'speech', text: 'こらーっ！まちなさーい！', left: 2 }
  const toast: DeckHold = { kind: 'toast', text: 'スイッチ！門が開いた', left: DECK_TOAST_SECONDS }

  it('the newer one wins', () => {
    expect(arriveHold(null, speech, hints)).toBe(speech)
    expect(arriveHold(speech, toast, hints)).toBe(toast)
    expect(arriveHold(toast, speech, hints)).toBe(speech)
  })

  it('a toast that repeats a stage hint waits for the speech line (the hints come back after it)', () => {
    const hint: DeckHold = { kind: 'toast', text: hints[0], left: DECK_TOAST_SECONDS }
    expect(arriveHold(speech, hint, hints)).toBe(speech)
    expect(arriveHold(null, hint, hints)).toBe(hint)
    expect(arriveHold({ ...speech, left: 0 }, hint, hints)).toBe(hint)
  })

  it('a hold runs out after its seconds', () => {
    let hold: DeckHold | null = speech
    hold = stepHold(hold, 1.5)
    expect(hold?.left).toBeCloseTo(0.5)
    hold = stepHold(hold, 0.6)
    expect(hold).toBeNull()
    expect(stepHold(null, 1)).toBeNull()
  })
})
