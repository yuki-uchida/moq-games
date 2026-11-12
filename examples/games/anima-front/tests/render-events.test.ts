import { describe, expect, it } from 'vitest'
import { SFX } from '../src/audio/api'
import { FOES, type FoeAttack } from '../src/data/enemies'
import { ITEM_IDS } from '../src/data/items'
import { EVENT_EFFECTS, FIRE_LOOK, HIT_LOOK, IMPACT_LOOK, TELEGRAPH, shotColor } from '../src/render/fx/tables'
import { attenuation } from '../src/render/sound'
import {
  ATTACK_SFX,
  EVENT_SFX,
  FIRE_SFX,
  HIT_SFX,
  IMPACT_SFX,
  PROP_BREAK_SFX,
  WINDUP_SFX
} from '../src/render/sound-map'
import type { ShotKind, SimEventType } from '../src/sim/types'

const EVENT_TYPES: SimEventType[] = [
  'phase',
  'countdown',
  'fire',
  'swing',
  'hit',
  'impact',
  'blast',
  'empty',
  'swap',
  'jump',
  'land',
  'dash',
  'launch',
  'hook',
  'glide',
  'cloak',
  'deploy',
  'propHit',
  'propBreak',
  'passives',
  'critical',
  'armorBreak',
  'down',
  'reviveStart',
  'revive',
  'warp',
  'respawn',
  'ko',
  'shard',
  'heal',
  'reveal',
  'foeSpawn',
  'foeWindup',
  'foeAttack',
  'foeDie',
  'bossPhase',
  'bossPart',
  'wave',
  'waveClear',
  'objective',
  'radio',
  'lastSpurt',
  'suddenDeath',
  'tutorial'
]
const SHOT_KINDS: ShotKind[] = [...ITEM_IDS, 'acid', 'laser', 'plasma', 'missile', 'acidRain']
const ATTACKS = [...new Set(Object.values(FOES).flatMap((f) => f.attacks.map((a) => a.id)))] as FoeAttack[]
const sfx = new Set<string>(SFX)

describe('event → effect and sound maps', () => {
  it('every SimEvent type has a visual answer and a sound entry', () => {
    for (const t of EVENT_TYPES) {
      expect(EVENT_EFFECTS[t], t).toBeTruthy()
      expect(t in EVENT_SFX, t).toBe(true)
      const s = EVENT_SFX[t]
      if (s && s !== 'byItem' && s !== 'bySurface' && s !== 'byKind') expect(sfx.has(s), t).toBe(true)
    }
    expect(Object.keys(EVENT_EFFECTS).sort()).toEqual([...EVENT_TYPES].sort())
  })

  it('every ShotKind fires with a look, a colour and a real sound', () => {
    for (const k of SHOT_KINDS) {
      expect(FIRE_LOOK[k], k).toBeDefined()
      expect(Number.isInteger(shotColor(k)), k).toBe(true)
      expect(sfx.has(FIRE_SFX[k]), k).toBe(true)
    }
  })

  it('every FoeAttack has a telegraph, a wind-up sound and an attack sound', () => {
    expect(ATTACKS.length).toBeGreaterThan(10)
    for (const a of ATTACKS) {
      expect(TELEGRAPH[a], a).toBeDefined()
      expect(sfx.has(WINDUP_SFX[a]), a).toBe(true)
      expect(sfx.has(ATTACK_SFX[a]), a).toBe(true)
    }
  })

  it('surfaces and props map to existing sounds and looks', () => {
    for (const [k, v] of Object.entries(IMPACT_SFX)) {
      expect(sfx.has(v), k).toBe(true)
      expect(IMPACT_LOOK[k as keyof typeof IMPACT_LOOK], k).toBeDefined()
    }
    for (const [k, v] of Object.entries(HIT_SFX)) {
      expect(sfx.has(v), k).toBe(true)
      expect(HIT_LOOK[k as keyof typeof HIT_LOOK], k).toBeDefined()
    }
    for (const v of Object.values(PROP_BREAK_SFX)) expect(sfx.has(v)).toBe(true)
  })

  it('distance attenuation falls off smoothly to silence', () => {
    expect(attenuation(0)).toBeCloseTo(1)
    expect(attenuation(14)).toBeCloseTo(0.5, 1)
    expect(attenuation(50)).toBeLessThan(attenuation(20))
    expect(attenuation(200)).toBe(0)
  })
})
