export const environmentPackAvailable = import.meta.env.VITE_TOWER_ENVIRONMENT_AVAILABLE !== 'false'
export const audioPackAvailable = import.meta.env.VITE_TOWER_AUDIO_AVAILABLE !== 'false'

// Environment availability restricts both individual and all-art controls in every UI phase.
export function environmentArtControls(available: boolean, started: boolean, preparing: boolean) {
  return {
    environmentDisabled: !available || (started && !preparing),
    allArtDisabled: started && !preparing,
    threeDOptionDisabled: !available
  }
}
