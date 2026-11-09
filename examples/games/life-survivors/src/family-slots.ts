/**
 * The family are support, not units: drawn smaller than the player and walking behind them — on the side away
 * from the way the player faces and a step further back. Slots are offsets from the player's position (dx is
 * multiplied by `back`: 1 while the player faces left, -1 otherwise). The renderer walks them there; the game keeps
 * resting pets clear of the same spots.
 */
export const FAMILY_SCALE = 0.75
export const FAMILY_SLOTS = [
  { sheet: 'family:spouse', dx: 16, dy: -7 },
  { sheet: 'player:kid', dx: 28, dy: -1 }
] as const
