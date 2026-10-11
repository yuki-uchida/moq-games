import type { AssetRef, FeedbackSubject, ViewerContext } from './contracts'
export interface DraftTarget {
  context: ViewerContext
  attachments: AssetRef[]
  subject?: FeedbackSubject
}
// A changed selection is an offered new target, never an implicit edit to an existing draft or retry.
export function frozenDraftTarget(current: DraftTarget | null, offered: DraftTarget): DraftTarget {
  return structuredClone(current ?? offered)
}
export function subjectLabel(subject: FeedbackSubject | undefined, context: ViewerContext): string {
  if (subject?.kind === 'audio')
    return `音声: ${subject.eventId} / ${subject.candidateId}\n${subject.category}${subject.field ? ` / ${subject.field}` : ''} · ${subject.batchId}\nSHA ${subject.asset.sha256}`
  return `ユニット: ${context.role} / ${context.roleRevision}\n${context.representation}`
}
