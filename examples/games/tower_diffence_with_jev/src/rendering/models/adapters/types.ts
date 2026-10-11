import type { AnimationClip } from 'three'

/** Narrow, typed boundary around byte-preserved source adapter modules. */
export interface SourceMaterialAdapter {
  update(clip: AnimationClip, clipLocalSeconds: number): void
  dispose?(): void
}
export interface SourceSkinningAdapter {
  update?(): void
  dispose(): void
}
