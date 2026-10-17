import { installArcherMaterialAdapter } from './source/archer-material-adapter.js'
import { installSoldierMaterialAdapter } from './source/soldier-material-adapter.js'
import { installSoldierDQSkinningAdapter } from './runtime/soldier-dq-skinning-adapter.js'
import * as THREE from 'three'
import type { ModelAdapterFactory } from '../../ModelAssetCache'
import type { SourceMaterialAdapter, SourceSkinningAdapter } from './types'
import { applyWolfLidMaterial } from './WolfLidMaterial'
import wolfLidConfig from './wolf-lid-config.json'
import { installBatMaterialAdapter } from './source/bat-material-adapter.js'
import { installBeetleMaterialAdapter } from './source/beetle-material-adapter.js'
import { installBruteMaterialAdapter } from './source/brute-material-adapter.js'
import { installCannonExtraSkinning } from './source/cannon-extra-skinning-adapter.js'
import { installCannonMaterialAdapter } from './source/cannon-material-adapter.js'
import { installDragonDQSkinningAdapter } from './runtime/dragon-dq-skinning-adapter.js'
import { installDragonMaterialAdapter } from './source/dragon-material-adapter.js'
import { installFrostMaterialAdapter } from './source/frost-material-adapter.js'
import { installGoblinMaterialAdapter } from './source/goblin-material-adapter.js'
import { installHealerMaterialAdapter } from './source/healer-material-adapter.js'
import { installMageMaterialAdapter } from './source/mage-material-adapter.js'
import { installOgreDQSkinningAdapter } from './runtime/ogre-dq-skinning-adapter.js'
import { installOgreMaterialAdapter } from './source/ogre-material-adapter.js'
import { installPaladinMaterialAdapter } from './source/paladin-material-adapter.js'
import { installRangerExtraSkinning } from './source/ranger-extra-skinning-adapter.js'
import { installRangerMaterialAdapter } from './source/ranger-material-adapter.js'
import { installShamanMaterialAdapter } from './source/shaman-material-adapter.js'
import { installTankDQSkinningAdapter } from './runtime/tank-dq-skinning-adapter.js'
import { installTankMaterialAdapter } from './source/tank-material-adapter.js'
import { installWraithMaterialAdapter } from './source/wraith-material-adapter.js'

/** Per-instance adapters always see the selected clip's exact local clock. */
function material(install: (root: THREE.Object3D, options?: unknown) => SourceMaterialAdapter): ModelAdapterFactory {
  return (root, clip) => {
    const extras = (clip as THREE.AnimationClip & { userData?: { blinkAmountSamples?: unknown } }).userData
    if (!Array.isArray(extras?.blinkAmountSamples) || extras.blinkAmountSamples.length < 2) {
      throw new Error(`Missing authored blink samples for ${clip.name}`)
    }
    const originalHooks = new Map<THREE.Material, { before: THREE.Material['onBeforeCompile']; key: THREE.Material['customProgramCacheKey'] }>()
    root.traverse(object => {
      if (!(object instanceof THREE.Mesh)) return
      for (const value of Array.isArray(object.material) ? object.material : [object.material]) {
        originalHooks.set(value, { before: value.onBeforeCompile, key: value.customProgramCacheKey })
      }
    })
    const adapter = install(root, THREE)
    let disposed = false
    return {
      update(seconds) { if (!disposed) adapter.update(clip, seconds) },
      dispose() {
        if (disposed) return
        disposed = true
        adapter.dispose?.()
        // Early source adapters patch the lease-owned material in place. Restore
        // hooks before the cache disposes those materials; never shared textures.
        for (const [value, hooks] of originalHooks) {
          value.onBeforeCompile = hooks.before
          value.customProgramCacheKey = hooks.key
          value.needsUpdate = true
        }
      }
    }
  }
}
function skinning(install: (root: THREE.Object3D, options?: unknown) => SourceSkinningAdapter): ModelAdapterFactory {
  return root => {
    const adapter = install(root, { THREE })
    let disposed = false
    return {
      update() { if (!disposed) adapter.update?.() },
      dispose() { if (!disposed) { disposed = true; adapter.dispose() } }
    }
  }
}

export const batMaterial: ModelAdapterFactory = material(installBatMaterialAdapter)
export const beetleMaterial: ModelAdapterFactory = material(installBeetleMaterialAdapter)
export const bruteMaterial: ModelAdapterFactory = material(installBruteMaterialAdapter)
export const cannonSkinning: ModelAdapterFactory = skinning(installCannonExtraSkinning)
export const cannonMaterial: ModelAdapterFactory = material(installCannonMaterialAdapter)
export const dragonSkinning: ModelAdapterFactory = skinning(installDragonDQSkinningAdapter)
export const dragonMaterial: ModelAdapterFactory = material(installDragonMaterialAdapter)
export const frostMaterial: ModelAdapterFactory = material(installFrostMaterialAdapter)
export const goblinMaterial: ModelAdapterFactory = material(installGoblinMaterialAdapter)
export const healerMaterial: ModelAdapterFactory = material(installHealerMaterialAdapter)
export const mageMaterial: ModelAdapterFactory = material(installMageMaterialAdapter)
export const ogreSkinning: ModelAdapterFactory = skinning(installOgreDQSkinningAdapter)
export const ogreMaterial: ModelAdapterFactory = material(installOgreMaterialAdapter)
export const paladinMaterial: ModelAdapterFactory = material(installPaladinMaterialAdapter)
export const rangerSkinning: ModelAdapterFactory = skinning(installRangerExtraSkinning)
export const rangerMaterial: ModelAdapterFactory = material(installRangerMaterialAdapter)
export const shamanMaterial: ModelAdapterFactory = material(installShamanMaterialAdapter)
export const tankSkinning: ModelAdapterFactory = skinning(installTankDQSkinningAdapter)
export const tankMaterial: ModelAdapterFactory = material(installTankMaterialAdapter)
export const wraithMaterial: ModelAdapterFactory = material(installWraithMaterialAdapter)

export const wolfMaterial: ModelAdapterFactory = (root, clip) => {
  if (clip.name !== 'idle' && clip.name !== 'walk' && clip.name !== 'attack') {
    throw new Error(`Unsupported Wolf clip ${clip.name}`)
  }
  const motion = clip.name
  const adapter = applyWolfLidMaterial(root, wolfLidConfig)
  return { update: seconds => adapter.sample(motion, seconds * 1000), dispose: () => adapter.dispose() }
}

export const soldierSkinning: ModelAdapterFactory = skinning(installSoldierDQSkinningAdapter)

export const soldierMaterial: ModelAdapterFactory = material(installSoldierMaterialAdapter)

export const archerMaterial: ModelAdapterFactory = material(installArcherMaterialAdapter)

export { runnerMaterial } from './RunnerAdapters'
