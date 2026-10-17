// Preserve the frozen arithmetic oracle while aligning only the game registry
// in its disposable copy. Verified fixture files are never rewritten.
const regions = [
  ['export const ENEMY_TYPES = [', '] as const'],
  ['export const ENEMY_MELEE_TYPES:', 'export function isEnemyMelee'],
  ['export const DEFINITIONS: Record<UnitType, UnitDefinition> = {', 'export type FieldId']
]
function region(source, start, end) {
  const begin = source.indexOf(start)
  if (begin < 0 || source.indexOf(start, begin + start.length) >= 0) throw Error(`Ambiguous catalog start: ${start}`)
  const finish = source.indexOf(end, begin + start.length)
  if (finish < 0) throw Error(`Missing catalog end: ${end}`)
  return { begin, finish: finish + (end === '] as const' ? end.length : 0) }
}
export function alignForecastReferenceCatalog(reference, current) {
  let aligned = reference
  for (const [start, end] of regions) {
    const before = region(aligned, start, end),
      after = region(current, start, end)
    aligned = aligned.slice(0, before.begin) + current.slice(after.begin, after.finish) + aligned.slice(before.finish)
  }
  return aligned
}
