import type { Object3D, AnimationClip } from 'three'
export const runnerBlinkGLSL: string
export const runnerSourceIOR: number
export function sampleRunnerBlink(clip: AnimationClip, seconds: number): number
export function installRunnerMaterialAdapter(root: Object3D, options?: unknown): {
  update(clip: AnimationClip, seconds: number): void
  setBlinkAmount(value: number): void
  dispose(): void
}
