/** Presentation only: routes, combat distances and saved positions stay in world units. */
export const GAME_MODEL_PRESENTATION_SCALE = 1.5

export function modelPresentationScale(aspectExpansion: number): number {
  return 1 + (GAME_MODEL_PRESENTATION_SCALE - 1) * Math.min(1, aspectExpansion)
}

export function battlefieldPresentation(
  viewport: { width: number; height: number },
  field: { width: number; height: number; layoutRevision: number }
): { scaleX: number; scaleY: number; aspectExpansion: number; modelScale: number } {
  if (field.layoutRevision < 3) {
    const scale = Math.max(0.55, viewport.width / field.width)
    return { scaleX: scale, scaleY: scale, aspectExpansion: 1, modelScale: 1 }
  }
  const width = Math.max(1, viewport.width)
  const height = Math.max(1, viewport.height)
  const scaleY = height / field.height
  const scaleX = width / field.width
  const aspectExpansion = scaleX / scaleY
  return { scaleX, scaleY, aspectExpansion, modelScale: modelPresentationScale(aspectExpansion) }
}
