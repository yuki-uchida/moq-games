import { it, expect } from 'vitest'
import { frozenDraftTarget, subjectLabel, type DraftTarget } from './DraftContext'
const unit = {
  context: {
    role: 'soldier',
    roleRevision: 'soldier-v1',
    representation: 'source2DImage',
    motion: null,
    direction: null,
    timeMs: null,
    sourceFrameIndex: null,
    interpolationMode: 'source-clock',
    clipManifest: null,
    selectedAudio: null
  },
  attachments: [],
  subject: { kind: 'unit', role: 'soldier', roleRevision: 'soldier-v1', representation: 'source2DImage' }
} satisfies DraftTarget
it('draft subject, refs and retry context do not change with later selection', () => {
  const first = frozenDraftTarget(null, unit)
  const later = structuredClone(unit)
  later.context.role = 'healer'
  later.context.roleRevision = 'healer-v2'
  expect(frozenDraftTarget(first, later)).toEqual(first)
  expect(first.context.role).toBe('soldier')
  expect(frozenDraftTarget(null, later).context.role).toBe('healer')
})
it('audio feedback identifies desert BGM independently of the visible Soldier', () => {
  const ref = { assetId: 'synthetic', revision: 'v0', bytes: 1, sha256: '0'.repeat(64), mimeType: 'audio/wav' }
  const target: DraftTarget = {
    ...structuredClone(unit),
    subject: {
      kind: 'audio',
      batchId: 'bgm',
      candidateId: 'desert__v1',
      eventId: 'bgm_desert',
      category: 'bgm',
      unit: null,
      field: 'desert',
      asset: ref
    }
  }
  const frozen = frozenDraftTarget(null, target)
  ref.revision = 'changed'
  expect(subjectLabel(frozen.subject, frozen.context)).toContain('bgm_desert / desert__v1')
  expect(subjectLabel(frozen.subject, frozen.context)).not.toContain('Soldier')
  expect(frozen.subject?.kind === 'audio' && frozen.subject.asset.revision).toBe('v0')
})
