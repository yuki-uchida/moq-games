import type { Sheet } from './sheet'

/**
 * What an art module exports as `sheets`: builders keyed by sheet id. A builder returns the animations it
 * draws; several modules may contribute animations to the same sheet (the registry merges them).
 */
export type SheetModule = Record<string, () => Partial<Sheet>>
