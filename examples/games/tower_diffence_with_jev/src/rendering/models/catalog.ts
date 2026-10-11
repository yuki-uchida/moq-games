import type { UnitType } from '../../game/model'
import type { UnitModelDefinition } from '../ModelUnitVisual'
import type { ModelAdapterFactory, ModelSource } from '../ModelAssetCache'
import * as adapters from './adapters'

// Original native camera horizontal spans are translated to gameplay pixels.
// Native glTF geometry, rigs, rest attributes and per-motion skins are unchanged.
// These are inspected candidates. Runtime visual acceptance is tracked separately.
const base = `${import.meta.env.BASE_URL}tower-defense-art/models/`
const source = (role: UnitType, file: string, clip: string, hooks: readonly ModelAdapterFactory[] = []): ModelSource => ({
  url: `${base}${role}/${file}`, clip, adapters: hooks
})

export const UNIT_MODEL_CATALOG: Readonly<Partial<Record<UnitType, UnitModelDefinition>>> = {
  tank: {
    scale: 128 / 3.12, origin: [0, 0, 0], yaw: 0,
    walkDistance: 20, provenance: 'tank-animated-glb-cloud-candidate.zip; source-preserved candidate, visual review pending',
    clips: {
      attack: source('tank', 'tank-attack-candidate.glb', 'attack', [adapters.tankMaterial, adapters.tankSkinning]),
      walk: source('tank', 'tank-walk-candidate.glb', 'walk', [adapters.tankMaterial, adapters.tankSkinning]),
      idle: source('tank', 'tank-idle-candidate.glb', 'idle', [adapters.tankMaterial, adapters.tankSkinning]),
    }
  },
  mage: {
    emitter: { node: 'Staff_Rigid_Control', local: [0.6569931349408655, 0.3104449969859895, -0.12662202592852762] },
    scale: 128 / 3.55, origin: [-0.14499999582767487, -0.9520019888877869, 0.014999999664723873], yaw: 0,
    walkDistance: 20, provenance: 'mage-animated-glb-cloud-candidate.zip; source-preserved candidate, visual review pending',
    clips: {
      idle: source('mage', 'mage-motion-v2-candidate.glb', 'idle', [adapters.mageMaterial]),
      walk: source('mage', 'mage-motion-v2-candidate.glb', 'walk', [adapters.mageMaterial]),
      attack: source('mage', 'mage-motion-v2-candidate.glb', 'attack', [adapters.mageMaterial]),
    }
  },
  frost: {
    emitter: { node: 'Staff_Rigid_Control', local: [0.6610382795333862, 0.3700866103172302, 0.284916490316391] },
    scale: 128 / 3.4, origin: [-0.11500000208616257, -0.9508733153343201, 0.014999999664723873], yaw: 0,
    walkDistance: 18, provenance: 'frost-animated-glb-cloud-candidate.zip; source-preserved candidate, visual review pending',
    clips: {
      idle: source('frost', 'frost-motion-v2-candidate.glb', 'idle', [adapters.frostMaterial]),
      walk: source('frost', 'frost-motion-v2-candidate.glb', 'walk', [adapters.frostMaterial]),
      attack: source('frost', 'frost-motion-v2-candidate.glb', 'attack', [adapters.frostMaterial]),
    }
  },
  healer: {
    emitter: { node: 'Staff_Rigid_Control', local: [0.6100544929504395, 0.15758058428764343, 0.06462452560663223] },
    scale: 128 / 4.24, origin: [-0.17000000178813934, -0.9452990293502808, 0.004999999888241291], yaw: 0,
    walkDistance: 18, provenance: 'healer-animated-glb-cloud-candidate.zip; source-preserved candidate, visual review pending',
    clips: {
      idle: source('healer', 'healer-motion-v2-candidate.glb', 'idle', [adapters.healerMaterial]),
      walk: source('healer', 'healer-motion-v2-candidate.glb', 'walk', [adapters.healerMaterial]),
      heal: source('healer', 'healer-motion-v2-candidate.glb', 'heal', [adapters.healerMaterial]),
    }
  },
  ranger: {
    emitter: { node: 'Ranger_Release_Emitter' },
    scale: 128 / 3.6700000762939453, origin: [0.07999999821186066, -0.9177075624465942, -0.019999999552965164], yaw: 0,
    walkDistance: 26, provenance: 'ranger-animated-glb-cloud-candidate.zip; source-preserved candidate, visual review pending',
    clips: {
      walk: source('ranger', 'ranger-walk-candidate.glb', 'walk', [adapters.rangerMaterial, adapters.rangerSkinning]),
      attack: source('ranger', 'ranger-attack-candidate.glb', 'attack', [adapters.rangerSkinning]),
      idle: source('ranger', 'ranger-idle-candidate.glb', 'idle', [adapters.rangerMaterial]),
    }
  },
  cannon: {
    emitter: { node: 'Cannon_Socket_Muzzle' },
    scale: 128 / 3.94, origin: [0.005, -0.9520441889762878, -0.02], yaw: 0,
    walkDistance: 24, provenance: 'cannon-animated-glb-cloud-candidate.zip; source-preserved candidate, visual review pending',
    clips: {
      idle: source('cannon', 'cannon-idle-candidate.glb', 'idle', [adapters.cannonMaterial]),
      walk: source('cannon', 'cannon-walk-candidate.glb', 'walk', [adapters.cannonMaterial, adapters.cannonSkinning]),
      attack: source('cannon', 'cannon-attack-candidate.glb', 'attack', [adapters.cannonSkinning]),
    }
  },
  paladin: {
    scale: 128 / 3.02, origin: [0.014999999664723873, -0.9522994756698608, 0.019999999552965164], yaw: 0,
    walkDistance: 24, provenance: 'paladin-damage-only-animated-glb-cloud-candidate.zip; source-preserved candidate, visual review pending',
    clips: {
      attack: source('paladin', 'paladin-motion-v2-candidate.glb', 'attack', [adapters.paladinMaterial]),
      walk: source('paladin', 'paladin-motion-v2-candidate.glb', 'walk', [adapters.paladinMaterial]),
      idle: source('paladin', 'paladin-motion-v2-candidate.glb', 'idle', [adapters.paladinMaterial]),
    }
  },
  goblin: {
    scale: 128 / 3.86, origin: [0, -0.9520249962806702, -0.02500000037252903], yaw: 0,
    walkDistance: 32, provenance: 'goblin-smooth-walk-candidate.zip; source-preserved candidate, visual review pending',
    clips: {
      idle: source('goblin', 'goblin-walk-smooth.glb', 'idle', [adapters.goblinMaterial]),
      walk: source('goblin', 'goblin-walk-smooth.glb', 'walk', [adapters.goblinMaterial]),
      attack: source('goblin', 'goblin-walk-smooth.glb', 'attack', [adapters.goblinMaterial]),
    }
  },
  wolf: {
    scale: 128 / 4.24, origin: [0.15, -0.8107264638, -0.02], yaw: 0,
    walkDistance: 44, provenance: 'wolf-walk-smooth-24-final.zip; source-preserved candidate, visual review pending',
    clips: {
      idle: source('wolf', 'wolf-walk-smooth.glb', 'idle', [adapters.wolfMaterial]),
      walk: source('wolf', 'wolf-walk-smooth.glb', 'walk', [adapters.wolfMaterial]),
      attack: source('wolf', 'wolf-walk-smooth.glb', 'attack', [adapters.wolfMaterial]),
    }
  },
  beetle: {
    scale: 128 / 4.4, origin: [0.0, -0.5641158819198608, -0.0], yaw: 0,
    walkDistance: 40, provenance: 'beetle-animated-glb-cloud-candidate.zip; source-preserved candidate, visual review pending',
    clips: {
      idle: source('beetle', 'beetle-motion-v2-candidate.glb', 'idle', [adapters.beetleMaterial]),
      walk: source('beetle', 'beetle-motion-v2-candidate.glb', 'walk', [adapters.beetleMaterial]),
      attack: source('beetle', 'beetle-motion-v2-candidate.glb', 'attack', [adapters.beetleMaterial]),
    }
  },
  shaman: {
    emitter: { node: 'Shaman_Staff_Rigid_Control', local: [0.8206073641777039, 0.29405713081359863, -0.2551731467247009] },
    scale: 128 / 3.75, origin: [-0.10000000149011612, -0.8902260065078735, -0.0], yaw: 0,
    walkDistance: 30, provenance: 'shaman-animated-glb-cloud-candidate.zip; source-preserved candidate, visual review pending',
    clips: {
      idle: source('shaman', 'shaman-motion-v2-candidate.glb', 'idle', [adapters.shamanMaterial]),
      walk: source('shaman', 'shaman-motion-v2-candidate.glb', 'walk', [adapters.shamanMaterial]),
      attack: source('shaman', 'shaman-motion-v2-candidate.glb', 'attack', [adapters.shamanMaterial]),
    }
  },
  brute: {
    scale: 128 / 3.4, origin: [0.0, -0.8542622327804565, -0.0], yaw: 0,
    walkDistance: 40, provenance: 'brute-animated-glb-cloud-candidate.zip; source-preserved candidate, visual review pending',
    clips: {
      idle: source('brute', 'brute-motion-v2-candidate.glb', 'idle', [adapters.bruteMaterial]),
      walk: source('brute', 'brute-motion-v2-candidate.glb', 'walk', [adapters.bruteMaterial]),
      attack: source('brute', 'brute-motion-v2-candidate.glb', 'attack', [adapters.bruteMaterial]),
    }
  },
  bat: {
    scale: 128 / 3.7, origin: [0.0, -1.0399999618530273, -0.0], yaw: 0,
    walkDistance: 62, provenance: 'bat-animated-glb-cloud-candidate.zip; source-preserved candidate, visual review pending',
    clips: {
      idle: source('bat', 'bat-motion-v2-candidate.glb', 'idle', [adapters.batMaterial]),
      walk: source('bat', 'bat-motion-v2-candidate.glb', 'walk', [adapters.batMaterial]),
      attack: source('bat', 'bat-motion-v2-candidate.glb', 'attack', [adapters.batMaterial]),
    }
  },
  wraith: {
    emitter: { node: 'hand.L', local: [-0.040000058710575104, 0.05674596503376961, -2.5630004785170968e-08] },
    scale: 128 / 4.8, origin: [0.0, -1.2300000190734863, -0.0], yaw: 0,
    walkDistance: 60, provenance: 'wraith-animated-glb-cloud-candidate.zip; source-preserved candidate, visual review pending',
    clips: {
      idle: source('wraith', 'wraith-motion-v2-candidate.glb', 'idle', [adapters.wraithMaterial]),
      walk: source('wraith', 'wraith-motion-v2-candidate.glb', 'walk', [adapters.wraithMaterial]),
      attack: source('wraith', 'wraith-motion-v2-candidate.glb', 'attack', [adapters.wraithMaterial]),
    }
  },
  ogre: {
    scale: 128 / 3.55, origin: [0.04500000178813934, -0.9521399736404419, -0.2849999964237213], yaw: 0,
    walkDistance: 40, provenance: 'ogre-walk-clear-step-candidate.zip; source-preserved candidate, visual review pending',
    clips: {
      idle: source('ogre', 'ogre-motion-arm-swing20.glb', 'idle', [adapters.ogreMaterial, adapters.ogreSkinning]),
      walk: source('ogre', 'ogre-motion-arm-swing20.glb', 'walk', [adapters.ogreMaterial, adapters.ogreSkinning]),
      attack: source('ogre', 'ogre-motion-arm-swing20.glb', 'attack', [adapters.ogreMaterial, adapters.ogreSkinning]),
    }
  },
  dragon: {
    emitter: { node: 'Dragon_Actual_Mouth_Emitter' },
    scale: 128 / 3.0, origin: [0.0, -1.2400000095367432, 0.07999999821186066], yaw: 0,
    walkDistance: 37, provenance: 'dragon-animated-glb-cloud-candidate.zip; source-preserved candidate, visual review pending',
    clips: {
      idle: source('dragon', 'dragon-motion-v2-candidate.glb', 'idle', [adapters.dragonMaterial, adapters.dragonSkinning]),
      walk: source('dragon', 'dragon-motion-v2-candidate.glb', 'walk', [adapters.dragonMaterial, adapters.dragonSkinning]),
      attack: source('dragon', 'dragon-motion-v2-candidate.glb', 'attack', [adapters.dragonMaterial, adapters.dragonSkinning]),
      breath: source('dragon', 'dragon-motion-v2-candidate.glb', 'breath', [adapters.dragonMaterial, adapters.dragonSkinning]),
    }
  },
  slime: {
    scale: 30, origin: [0, -0.027695, 0], yaw: 0, walkDistance: 32,
    provenance: 'slime-with-death-pilot.glb; measured ground, provisional gameplay scale; visual review pending',
    clips: {
      idle: source('slime', 'animated.glb', 'idle'), walk: source('slime', 'animated.glb', 'walk'),
      attack: source('slime', 'animated.glb', 'attack'), death: source('slime', 'animated.glb', 'death')
    }
  }
}

export function getUnitModelDefinition(type: UnitType): UnitModelDefinition | undefined { return UNIT_MODEL_CATALOG[type] }
export const MODEL_AVAILABILITY = {
  runner: 'Missing current animated candidate; no sprite or static-model fallback',
  visualAcceptance: 'Pending runtime review for every candidate; source inspection is not visual acceptance',
  death: 'Only Slime supplies authored death. Other roles retain their last 3D pose during the game-owned fade.'
} as const
