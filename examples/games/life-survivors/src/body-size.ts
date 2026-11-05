export function bodyScale(large: number, small: number) {
  return Math.max(0.75, Math.min(1.25, 1 + 0.05 * (large - small)))
}
