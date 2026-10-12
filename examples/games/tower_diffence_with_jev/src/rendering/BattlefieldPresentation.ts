/** Presentation only: routes, combat distances and saved positions stay in world units. */
export const BATTLEFIELD_INSETS = { top: 72, bottom: 16, sides: 12 } as const
export const MAX_FIELD_ASPECT_EXPANSION = 1.4
export const GAME_MODEL_PRESENTATION_SCALE = 1.18

export function battlefieldPresentation(
  viewport: { width: number; height: number },
  field: { width: number; height: number; layoutRevision: number }
): { scaleX: number; scaleY: number; aspectExpansion: number; modelScale: number } {
  if (field.layoutRevision < 3) {
    const scale = Math.max(0.55, viewport.width / field.width)
    return { scaleX: scale, scaleY: scale, aspectExpansion: 1, modelScale: 1 }
  }
  const width = Math.max(1, viewport.width - BATTLEFIELD_INSETS.sides * 2)
  const height = Math.max(1, viewport.height - BATTLEFIELD_INSETS.top - BATTLEFIELD_INSETS.bottom)
  const scaleY = Math.min(width / field.width, height / field.height)
  const scaleX = Math.min(width / field.width, scaleY * MAX_FIELD_ASPECT_EXPANSION)
  return { scaleX, scaleY, aspectExpansion: scaleX / scaleY, modelScale: GAME_MODEL_PRESENTATION_SCALE }
}
