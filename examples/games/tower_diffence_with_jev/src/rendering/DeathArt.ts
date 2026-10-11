import { AUTHORED_ROSTER, DIRECTIONS } from './AuthoredRoster'
import type { WholeFrameManifest } from './WholeFrameAtlas'

export const AUTHORED_DEATH_ROLES = ['soldier', 'archer', 'ranger'] as const

export function authoredDeathClips(base: URL): Readonly<Record<string, string>> {
  return Object.fromEntries(
    AUTHORED_DEATH_ROLES.flatMap((type) =>
      DIRECTIONS.map((direction) => [
        `${AUTHORED_ROSTER[type].owner}:${type}:death:${direction}`,
        new URL(`${type}/${AUTHORED_ROSTER[type].character}-death-${direction}.json`, base).href
      ])
    )
  )
}

export function deathEntryOffset(manifest: WholeFrameManifest, activePose: boolean): number {
  if (manifest.motion !== 'death' || manifest.loop || manifest.events.length)
    throw new Error('Invalid death playback clip')
  const first = activePose ? (manifest.activePoseStartFrame ?? 0) : 0
  return manifest.frames.slice(0, first).reduce((elapsed, frame) => elapsed + frame.durationMs, 0)
}
