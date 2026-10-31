import { describe, expect, it, vi } from 'vitest'
import { soundCatalog } from '../src/audio/SoundCatalog'
import { SoundPlayer } from '../src/audio/SoundPlayer'
import { soundEventKey } from '../src/game/CombatSoundEvents'

describe('additional sound cues', () => {
  it('selects assets for every added effect and interaction', () => {
    const ids = new Set(soundCatalog(new URL('https://example.invalid/')).map((entry) => entry.id))
    for (const id of ['healer_heal', 'support_heal', 'support_speed', 'support_armor', 'support_attack', 'mud_slow_apply', 'terrain_slow_enter', 'ui_place', 'ui_upgrade', 'ui_assault', 'ui_special', 'ui_win', 'ui_lose'])
      expect(ids.has(id)).toBe(true)
  })

  it('resolves each new melee enemy hit to a catalogued sound', () => {
    const catalog = soundCatalog(new URL('https://example.invalid/'))
    for (const unitType of ['crystalSentinel', 'koboldLancer', 'clockworkPatchling'] as const) {
      const key = soundEventKey({ unitType, kind: 'hit' })
      const entry = catalog.find((candidate) => soundEventKey(candidate) === key)
      expect(entry).toMatchObject({ id: `${unitType}_attack`, unitType, kind: 'hit' })
    }
  })

  it('drops rapid repeats and respects mute, zero volume and suspended audio', () => {
    const player = new SoundPlayer([])
    const internal = player as unknown as { context: { state: string; currentTime: number }; cues: Map<string, unknown>; play: () => void }
    internal.context = { state: 'running', currentTime: 1 }
    internal.cues.set('ui_place', { state: 'ready', buffer: {} })
    const play = vi.spyOn(internal, 'play').mockImplementation(() => {})
    player.playCue('ui_place')
    player.playCue('ui_place')
    expect(play).toHaveBeenCalledTimes(1)
    internal.context.currentTime += 0.2
    player.setEnabled(false)
    player.playCue('ui_place')
    player.setEnabled(true)
    player.setVolume(0)
    player.playCue('ui_place')
    player.setVolume(0.2)
    internal.context.state = 'suspended'
    player.playCue('ui_place')
    expect(play).toHaveBeenCalledTimes(1)
    internal.context.state = 'running'
    player.playCue('ui_place')
    expect(play).toHaveBeenCalledTimes(2)
  })
})
