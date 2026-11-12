/** Placeholder until the synthesized audio is implemented (owned by the audio workstream): silent. */
import type { GameAudio } from './api'

export function createAudio(): GameAudio {
  let muted = false
  return {
    unlock() {},
    setMusic() {},
    sfx() {},
    loop() {},
    setVolume() {},
    setMuted(value: boolean) {
      muted = value
    },
    get muted() {
      return muted
    },
    setDuck() {},
    dispose() {}
  }
}
