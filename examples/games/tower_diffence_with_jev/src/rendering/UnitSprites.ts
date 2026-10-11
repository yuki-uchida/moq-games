export type SpriteMotion = 'idle' | 'walk' | 'attack' | 'hit'
export const SPRITE_DIRECTIONS = ['n', 'ne', 'e', 'se', 's', 'sw', 'w', 'nw'] as const
export type SpriteDirection = (typeof SPRITE_DIRECTIONS)[number]
