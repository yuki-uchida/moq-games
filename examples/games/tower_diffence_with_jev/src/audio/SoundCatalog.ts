import { audioPackAvailable } from '../BuildAssets'
import type { SoundCatalogEntry } from './SoundPlayer'
import { EFFECT_SOUND_BINDINGS, type EffectSoundKey } from '../game/CombatSoundEvents'

const entries = [
  {
    id: 'soldier_attack',
    unitType: 'soldier',
    kind: 'hit',
    file: 'soldier_attack.wav',
    sha256: 'cf24d91075fe077ba2161e993b05b951f5773934a7f0b065564dc7aeaf5bc9fc',
    durationSeconds: 0.65
  },
  {
    id: 'archer_attack',
    unitType: 'archer',
    kind: 'release',
    file: 'archer_attack.wav',
    sha256: '65baefb3091afbd0d819ed993329e092852891a8e9b5c9d31898c0d81bca6d07',
    durationSeconds: 0.4879818594104308
  },
  {
    id: 'runner_attack',
    unitType: 'runner',
    kind: 'hit',
    file: 'runner_attack.wav',
    sha256: '7bdf5244c436e1255ad531f0d7ba2711fdecbd8708946e04d44898d1b5d982b8',
    durationSeconds: 0.09
  },
  {
    id: 'tank_attack',
    unitType: 'tank',
    kind: 'hit',
    file: 'tank_attack.wav',
    sha256: '0991ac7c17f3cee9bc084e2333dcc661f504667ac8bf862a0d89cf25fca6a4da',
    durationSeconds: 0.17798185941043085
  },
  {
    id: 'mage_attack',
    unitType: 'mage',
    kind: 'release',
    file: 'mage_attack.wav',
    sha256: '87894a7bf6979242b43cfde074cef5346c1c6d50d0acf158d03923e65789584f',
    durationSeconds: 0.5479818594104309
  },
  {
    id: 'frost_attack',
    unitType: 'frost',
    kind: 'release',
    file: 'frost_attack.wav',
    sha256: '79f2eec495e2fbab955da7cd697b4f4dc49f3ee62a478d2ee2698bbaa67177fd',
    durationSeconds: 0.65
  },
  {
    id: 'ranger_attack',
    unitType: 'ranger',
    kind: 'release',
    file: 'ranger_attack.wav',
    sha256: '98d366f5757ff482ae2ad39c5b9c163ee18613e2062dd3c5a9c13b0ed96ce9e9',
    durationSeconds: 0.39798185941043085
  },
  {
    id: 'cannon_attack',
    unitType: 'cannon',
    kind: 'release',
    file: 'cannon_attack.wav',
    sha256: '0c5c28209f905e03c5fef21bed2982a7bb7df641a7f2c6b500f0df826c8e66fa',
    durationSeconds: 0.37
  },
  {
    id: 'paladin_attack',
    unitType: 'paladin',
    kind: 'hit',
    file: 'paladin_attack.wav',
    sha256: '3beb768894055be8631ca0854bfa6ca4e8874fa2262a5d61c8d15e3e24948e6b',
    durationSeconds: 0.24798185941043083
  },
  {
    id: 'slime_attack',
    unitType: 'slime',
    kind: 'hit',
    file: 'slime_attack.wav',
    sha256: '75d81b820e50ea999933f7eaeea35ed8cc2abc2d6511aa9520f0080af0fb7ee3',
    durationSeconds: 0.65
  },
  {
    id: 'goblin_attack',
    unitType: 'goblin',
    kind: 'hit',
    file: 'goblin_attack.wav',
    sha256: 'f4554023041eb9829e848b7bf379e647a0b8e30f91a81a35cd105b0839a59c01',
    durationSeconds: 0.65
  },
  {
    id: 'wolf_attack',
    unitType: 'wolf',
    kind: 'hit',
    file: 'wolf_attack.wav',
    sha256: 'b5295c05014471415b3ab9f02835d94ecaa96193b6de21386440e694c91ae03f',
    durationSeconds: 0.65
  },
  {
    id: 'beetle_attack',
    unitType: 'beetle',
    kind: 'hit',
    file: 'beetle_attack.wav',
    sha256: '7fe3f6fa9ceb3594f83d0d4d55d536c6f10698fe1492d5c0d882e862d4d8acac',
    durationSeconds: 0.12798185941043083
  },
  {
    id: 'shaman_attack',
    unitType: 'shaman',
    kind: 'release',
    file: 'shaman_attack.wav',
    sha256: '583df429c6f8fa2300a97372f5eb31d55b65941afbedb889269e2d0d252acbf4',
    durationSeconds: 0.25798185941043084
  },
  {
    id: 'brute_attack',
    unitType: 'brute',
    kind: 'hit',
    file: 'brute_attack.wav',
    sha256: '7b1d553b87f17e249554cf78d7ba03729f63cf14b9ed9c5b6a6d3ea845838718',
    durationSeconds: 0.65
  },
  {
    id: 'bat_attack',
    unitType: 'bat',
    kind: 'hit',
    file: 'bat_attack.wav',
    sha256: '988d801ed16f9d4fa3081a119db3f3668d8f62b2c72e3c526bae36ca2f23947f',
    durationSeconds: 0.65
  },
  {
    id: 'wraith_attack',
    unitType: 'wraith',
    kind: 'release',
    file: 'wraith_attack.wav',
    sha256: 'cc9c2ed2e10dc42fde459990d11e2f9bf8d3e1baff850ac120499f6150a5a738',
    durationSeconds: 0.4879818594104308
  },
  {
    id: 'ogre_attack',
    unitType: 'ogre',
    kind: 'hit',
    file: 'ogre_attack.wav',
    sha256: '08ea36da65d1234e9837adca9ef65f12d461128ed16081710ec876b7976c0099',
    durationSeconds: 0.65
  },
  {
    id: 'dragon_attack',
    unitType: 'dragon',
    kind: 'release',
    file: 'dragon_attack.wav',
    sha256: '7ef8e3625f26f2e0d5f96b1705211fdeb9c71d13951b42f9487fd99cb4c32153',
    durationSeconds: 0.65
  },
  {
    id: 'dragon_breath',
    unitType: 'dragon',
    kind: 'breath_start',
    file: 'dragon_breath.wav',
    sha256: '99d852a38ab43e49a7f46e49419f11fcc94c3784524bd7a369302c1e76a61a7d',
    durationSeconds: 0.6
  },
  {
    id: 'frost_slow_apply',
    unitType: 'frost',
    kind: 'slow_apply',
    file: 'frost_slow_apply.wav',
    sha256: '8afb583b98369e582378872080ae0ee1db2b139128cc41666a990491e83f0f4c',
    durationSeconds: 0.4
  }
] as const

export interface SelectedEffectSound {
  readonly file: string
  readonly sha256: string
  readonly durationSeconds: number
}
export const UNSELECTED_EFFECT_SOUNDS: Readonly<Record<EffectSoundKey, null>> = {
  healer_heal: null,
  support_heal: null,
  support_speed: null,
  support_armor: null,
  support_attack: null,
  mud_slow_apply: null,
  terrain_slow_enter: null
}
export function soundCatalog(
  base: URL,
  selectedEffects: Readonly<Partial<Record<EffectSoundKey, SelectedEffectSound | null>>> = UNSELECTED_EFFECT_SOUNDS
): SoundCatalogEntry[] {
  if (!audioPackAvailable) return []
  return [
    ...entries.map(({ file, ...entry }) => ({ ...entry, url: new URL(file, base).href })),
    ...Object.entries(EFFECT_SOUND_BINDINGS).flatMap(([id, binding]) => {
      const selected = selectedEffects[id as EffectSoundKey]
      return selected
        ? [
            {
              id,
              ...binding,
              sha256: selected.sha256,
              durationSeconds: selected.durationSeconds,
              url: new URL(selected.file, base).href
            }
          ]
        : []
    })
  ]
}
