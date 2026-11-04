import { chapters } from './story'

/** The victory condition shown under a chapter or mission, without a label prefix. */
export const chapterObjective = (index: number) => (chapters[index]?.[1] as string | undefined) ?? ''

/** One-line chapter summary for the title's chapter select: objective, clear mark and best turns. */
export function chapterLine(index: number, save: { cleared: number[]; bestTurns: Record<number, number> }): string {
  const parts: string[] = [chapterObjective(index)]
  if (save.cleared.includes(index)) {
    parts.push('✓ クリア')
    const best = save.bestTurns[index]
    if (Number.isFinite(best)) parts.push(`最短 ${best} ターン`)
  }
  return parts.join(' · ')
}
