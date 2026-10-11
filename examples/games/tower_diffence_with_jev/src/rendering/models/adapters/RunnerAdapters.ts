import * as THREE from 'three'
import type { ModelAdapterFactory } from '../../ModelAssetCache'
import { installRunnerMaterialAdapter } from './RunnerMaterial.js'

/** Exact authored lid shading. Bone/morph animation uses ordinary glTF skinning. */
export const runnerMaterial: ModelAdapterFactory = (root, clip) => {
  const adapter = installRunnerMaterialAdapter(root, THREE)
  let disposed = false
  return {
    update(seconds) { if (!disposed) adapter.update(clip, seconds) },
    dispose() { if (!disposed) { disposed = true; adapter.dispose() } },
  }
}
