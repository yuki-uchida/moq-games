import type { AllyType } from '../game/model'

const fields: readonly AllyType[] = ['healer', 'frost', 'ranger']
/** Preserve the authored radius. Motion adds height/rotation, never changes damage geometry. */
export function specialVfxMotion(type: AllyType, age: number, duration: number) {
  const progress = Math.max(0, Math.min(1, age / Math.max(duration, 0.001)))
  const field = fields.includes(type)
  const release = 1 - Math.exp(-Math.max(0, age) * 35)
  const tail = Math.min(1, Math.max(0, duration - age) / (field ? 0.4 : 0.22))
  const pulse = type === 'runner' ? 0.75 + 0.25 * Math.cos(age * Math.PI * 12) : 1
  return {
    field,
    progress,
    opacity:
      age < 0 || age >= duration
        ? 0
        : field
          ? (0.3 + 0.07 * Math.cos(age * 3)) * (0.65 + 0.35 * release) * tail
          : (0.72 - progress * 0.28) * pulse * tail,
    // A visible contact frame at release, followed by fast attack / slow settle.
    height: type === 'paladin' ? 0.2 + 0.8 * release : 1,
    lift: type === 'archer' ? 0.35 * (1 - Math.min(1, age / 0.2)) : type === 'mage' ? 0.12 * release : 0,
    rotation: field ? age * 0.15 : type === 'soldier' ? 0.9 * release : progress * 0.3
  }
}
