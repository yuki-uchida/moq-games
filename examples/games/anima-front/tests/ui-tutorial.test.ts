import { describe, expect, it } from 'vitest'
import type { HandView } from '../src/sim/types'
import { pawAffordable, pawCard } from '../src/ui/hud/model'
import {
  nearReviveMarker,
  tutorialBuild,
  tutorialHint,
  TUTORIAL_REVIVE_STEP,
  type HintDevice,
  type TutorialBuild
} from '../src/ui/hud/tutorial'

const full: TutorialBuild = { weaponR: true, weaponL: true, hasR: true, hasL: true, canSwitch: true }
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
    expect(tutorialHint(5, 'mouse', { ...full, canSwitch: false })).toContain('持ち替えるアンティークがない')
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
      canSwitch: true,
      weaponR: true,
      weaponL: false
    })
  })

  it('counts the revive marker within 2.5 m horizontally', () => {
    expect(nearReviveMarker([0, 5, 0], [2.4, 0, 0])).toBe(true)
    expect(nearReviveMarker([0, 0, 0], [0, 0, 2.6])).toBe(false)
  })
})

describe('touch paw affordability', () => {
  it('needs anima >= cost + 1', () => {
    expect(pawAffordable(5, 4)).toBe(true)
    expect(pawAffordable(4.9, 4)).toBe(false)
    expect(pawAffordable(0, 0)).toBe(true)
  })

  it('exposes the numeric cost on the card', () => {
    const c = pawCard({ items: ['hippo'], sel: 0, swap: 0, act: 'idle', charge: 0, cooldown: 0, uses: 0, combo: 0 })
    expect(c.costValue).toBe(4)
  })
})
