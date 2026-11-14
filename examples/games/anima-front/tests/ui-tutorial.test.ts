import { describe, expect, it } from 'vitest'
import type { HandView } from '../src/sim/types'
import { pawCard } from '../src/ui/hud/model'
import {
  nearReviveMarker,
  nextReviveHold,
  tutorialBuild,
  tutorialHint,
  TUTORIAL_REVIVE_STEP,
  type HintDevice,
  type TutorialBuild
} from '../src/ui/hud/tutorial'

const full: TutorialBuild = { weaponR: true, weaponL: true, hasR: true, hasL: true, switchHand: 'R' }
const devices: HintDevice[] = ['mouse', 'gamepad', 'touch']

describe('tutorial hints per device', () => {
  it('has a distinct hint for each of the 8 steps and every device', () => {
    for (const d of devices) {
      const texts = Array.from({ length: 8 }, (_, s) => tutorialHint(s, d, full))
      for (const t of texts) expect(t).toBeTruthy()
      expect(new Set(texts).size).toBe(8)
    }
    expect(tutorialHint(8, 'touch', full)).toBeNull()
    expect(tutorialHint(-1, 'touch', full)).toBeNull()
  })

  it('never mentions keyboard keys on gamepad or touch', () => {
    for (const d of ['gamepad', 'touch'] as const)
      for (let s = 0; s < 8; s++) {
        const t = tutorialHint(s, d, full)!
        expect(t).not.toMatch(/WASD|クリック|マウス|Shift|スペース|Q（|F/)
      }
  })

  it('touch hints name the on-screen controls', () => {
    expect(tutorialHint(2, 'touch', full)).toContain('ジャンプ')
    expect(tutorialHint(3, 'touch', full)).toContain('ダッシュ')
    expect(tutorialHint(TUTORIAL_REVIVE_STEP, 'touch', full)).toContain('救助')
  })

  it('adapts to the build like the sim does', () => {
    expect(tutorialHint(4, 'touch', { ...full, weaponR: false })).toContain('「左」')
    expect(tutorialHint(5, 'mouse', { ...full, switchHand: null })).toContain('持ち替えるアンティークがない')
    expect(tutorialHint(6, 'gamepad', { ...full, hasL: false })).toContain('左手は空')
  })

  it('reads the build from the paws', () => {
    const hand = (items: HandView['items']): HandView => ({
      items,
      sel: items.length ? 0 : -1,
      swap: 0,
      act: 'idle',
      charge: 0,
      cooldown: 0,
      uses: 0,
      combo: 0
    })
    expect(tutorialBuild([hand(['bee', 'hippo']), hand([])])).toMatchObject({
      hasR: true,
      hasL: false,
      switchHand: 'R',
      weaponR: true,
      weaponL: false
    })
  })

  it('counts the revive marker within 2.5 m horizontally', () => {
    expect(nearReviveMarker([0, 5, 0], [2.4, 0, 0])).toBe(true)
    expect(nearReviveMarker([0, 0, 0], [0, 0, 2.6])).toBe(false)
  })
})

describe('switch hint follows the paw lists', () => {
  const hand = (items: HandView['items']): HandView => ({
    items,
    sel: items.length ? 0 : -1,
    swap: 0,
    act: 'idle',
    charge: 0,
    cooldown: 0,
    uses: 0,
    combo: 0
  })
  const hintFor = (r: HandView['items'], l: HandView['items'], d: HintDevice) =>
    tutorialHint(5, d, tutorialBuild([hand(r), hand(l)]))!

  it('right with two or more switches the right paw', () => {
    expect(tutorialBuild([hand(['bee', 'hippo']), hand(['wood'])]).switchHand).toBe('R')
    expect(hintFor(['bee', 'hippo'], ['wood'], 'mouse')).toContain('Q')
    expect(hintFor(['bee', 'hippo'], ['wood'], 'gamepad')).toContain('RB')
    expect(hintFor(['bee', 'hippo'], ['wood'], 'touch')).toContain('「右」')
  })

  it('right with one and left with two switches the left paw', () => {
    expect(tutorialBuild([hand(['bee']), hand(['wood', 'hippo'])]).switchHand).toBe('L')
    expect(hintFor(['bee'], ['wood', 'hippo'], 'mouse')).toMatch(/Eで左手/)
    expect(hintFor(['bee'], ['wood', 'hippo'], 'gamepad')).toContain('LB')
    expect(hintFor(['bee'], ['wood', 'hippo'], 'touch')).toContain('「左」ボタンの上の↻')
    // An empty right paw with a switchable left paw also names the left paw.
    expect(hintFor([], ['wood', 'hippo'], 'mouse')).toMatch(/Eで左手/)
  })

  it('says nothing can be switched when no paw holds two', () => {
    for (const d of devices) expect(hintFor(['bee'], ['wood'], d)).toContain('持ち替えるアンティークがない')
    expect(tutorialBuild([hand(['bee']), hand([])]).switchHand).toBeNull()
  })

  it('steps 4 and 6 keep naming a paw that has an antique', () => {
    const b = tutorialBuild([hand([]), hand(['wood'])])
    expect(tutorialHint(4, 'mouse', b)).toContain('右クリック')
    expect(tutorialHint(6, 'mouse', b)).toContain('右クリック')
    const c = tutorialBuild([hand(['bee']), hand([])])
    expect(tutorialHint(6, 'touch', c)).toContain('左手は空')
  })
})

describe('paw card readouts', () => {
  it('exposes the numeric cost on the card', () => {
    const c = pawCard({ items: ['hippo'], sel: 0, swap: 0, act: 'idle', charge: 0, cooldown: 0, uses: 0, combo: 0 })
    expect(c.costValue).toBe(4)
  })
})

describe('revive hold progress', () => {
  it('grows while held next to the marker and resets on release', () => {
    let t = 0
    for (let i = 0; i < 60; i++) t = nextReviveHold(t, true, true, 1 / 60, 2)
    expect(t).toBeCloseTo(1)
    expect(nextReviveHold(t, true, false, 1 / 60, 2)).toBe(0)
    expect(nextReviveHold(t, false, true, 1 / 60, 2)).toBe(0)
    expect(nextReviveHold(1.99, true, true, 1, 2)).toBe(2)
  })
})
