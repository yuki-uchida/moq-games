import type { UnitType } from '../game/model'

export const AUTHORED_ROSTER = {
  soldier: { owner: 'player', character: 'leaf-squire' },
  slime: { owner: 'ai', character: 'purupuru-slime' },
  archer: { owner: 'player', character: 'forest-archer' },
  mage: { owner: 'player', character: 'star-mage' },
  healer: { owner: 'player', character: 'flower-healer' },
  wolf: { owner: 'ai', character: 'dusk-wolf' },
  bat: { owner: 'ai', character: 'night-bat' },
  runner: { owner: 'player', character: 'spear-scout' },
  frost: { owner: 'player', character: 'frost-caster' },
  tank: { owner: 'player', character: 'shield-knight' },
  paladin: { owner: 'player', character: 'sun-paladin' },
  brute: { owner: 'ai', character: 'crystal-stone-brute' },
  beetle: { owner: 'ai', character: 'ironclad-beetle' },
  wraith: { owner: 'ai', character: 'mist-wraith' },
  ranger: { owner: 'player', character: 'falcon-ranger' },
  cannon: { owner: 'player', character: 'powder-engineer' },
  goblin: { owner: 'ai', character: 'mischief-goblin' },
  shaman: { owner: 'ai', character: 'mushroom-mage' },
  ogre: { owner: 'ai', character: 'potbelly-club-ogre' },
  dragon: { owner: 'ai', character: 'emberwing-baby-dragon' }
} as const

export type AuthoredSpriteRole = keyof typeof AUTHORED_ROSTER

/** Real-3D-only roles deliberately have no authored sprite entry. */
export function authoredRole(type: UnitType): (typeof AUTHORED_ROSTER)[AuthoredSpriteRole] | undefined {
  return Object.hasOwn(AUTHORED_ROSTER, type) ? AUTHORED_ROSTER[type as AuthoredSpriteRole] : undefined
}

export const DIRECTIONS = ['n', 'ne', 'e', 'se', 's', 'sw', 'w', 'nw'] as const
export const MOTIONS = ['idle', 'walk', 'attack'] as const

export function authoredRosterClips(base: URL): Readonly<Record<string, string>> {
  return Object.fromEntries(
    Object.entries(AUTHORED_ROSTER).flatMap(([type, role]) =>
      DIRECTIONS.flatMap((direction) =>
        MOTIONS.map((motion) => [
          `${role.owner}:${type}:${motion}:${direction}`,
          new URL(`${type}/${role.character}-${motion}-${direction}.json`, base).href
        ])
      )
    )
  )
}

// Original concept images are UI portraits only; they do not add sprite clips.
export const MODEL_ONLY_PORTRAITS = {
  crystalSentinel: 'crystalSentinel/portrait.png',
  koboldLancer: 'koboldLancer/portrait.png',
  clockworkPatchling: 'clockworkPatchling/portrait.png'
} as const

export function authoredPortrait(type: UnitType, base: URL): string | undefined {
  if (Object.hasOwn(MODEL_ONLY_PORTRAITS, type))
    return new URL(MODEL_ONLY_PORTRAITS[type as keyof typeof MODEL_ONLY_PORTRAITS], base).href
  return Object.hasOwn(AUTHORED_ROSTER, type) ? new URL(`${type}/portrait.png`, base).href : undefined
}
