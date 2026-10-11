export type Motion = 'idle' | 'walk' | 'attack' | 'breath' | 'death'
export type Direction = 'n' | 'ne' | 'e' | 'se' | 's' | 'sw' | 'w' | 'nw'
export type RepresentationKind = 'source2DImage' | 'source2DSheet' | 'baked3DSheet' | 'actual3D'
export interface AssetRef {
  assetId: string
  revision: string
  sha256: string
  bytes: number
  mimeType: string
}
export interface FrameCell {
  index: number
  x: number
  y: number
  width: number
  height: number
  durationMs: number
  pivot: { x: number; y: number }
}
export interface Clock {
  durationMs: number
  loop: boolean
  frameStartTimesMs: number[]
  events: { type: 'hit' | 'release'; atMs: number }[]
}
export interface Clip extends Clock {
  motion: Motion
  direction: Direction
  manifest: AssetRef
  texture?: AssetRef
  textureWidth?: number
  textureHeight?: number
  frames?: FrameCell[]
  frameSize?: { width: number; height: number; pivot: { x: number; y: number } }
  gameCycleTravel: number | null
  gameClockRule: string
  authoredStride?: number
}
export interface ModelConfig {
  file: AssetRef
  adapter: AssetRef
  manifest: AssetRef
  cameraPresets: Partial<
    Record<
      Direction,
      {
        position: [number, number, number]
        target: [number, number, number]
        up?: [number, number, number]
        projection?: 'orthographic'
        verticalSpan?: number
        horizontalSpan?: number
      }
    >
  >
}
export interface Representation {
  kind: RepresentationKind
  state: string
  reason?: string
  image?: AssetRef
  width?: number
  height?: number
  clips?: Clip[]
  model?: ModelConfig
}
export interface Revision {
  role: string
  revision: string
  revisionKind: string
  snapshotSha256: string
  representations: Representation[]
}
export interface AudioCandidate {
  candidateId: string
  eventId: string
  category?: 'combat' | 'ui' | 'bgm'
  unit?: string | null
  field?: string | null
  batchId: string
  variant: number
  durationMs: number
  reviewFlags: string[]
  status: 'pending'
  subjectiveReview: 'unreviewed'
  productionAdoption: 'not-adopted'
  files: { raw_wav: AssetRef; wav: AssetRef; webm: AssetRef }
  prompt: string
  seed: number
  modelRevision: string
}
export interface Catalog {
  syntheticTestStore?: boolean
  catalogRevision: string
  displayName: string
  revisions: { revision: string; label: string }[]
  actual3DState: string
  audio: AudioCandidate[]
  roles?: {
    role: string
    displayName: string
    revisions: { revision: string; label: string }[]
    actual3DState: string
  }[]
  parentRoundtripVerified: false
}
export interface ViewerContext {
  role: string
  roleRevision: string
  representation: RepresentationKind
  motion: Motion | null
  direction: Direction | null
  timeMs: number | null
  sourceFrameIndex: number | null
  interpolationMode: 'continuous' | 'source-clock'
  clipManifest: AssetRef | null
  selectedAudio: {
    batchId: string
    candidateId: string
    assetRevision: string
    format: 'wav' | 'raw_wav'
    asset: AssetRef
  } | null
}
export interface Submission {
  subject?: FeedbackSubject
  schemaVersion: 1
  clientSubmissionId: string
  title: string
  text: string
  context: ViewerContext
  attachments: AssetRef[]
  intent: 'explicit-user-submit'
}
export interface Ticket {
  results?: TicketResult[]
  history?: {
    sequence: number
    revision: number
    at: string
    actor: string
    event: { kind: string; from?: string; to?: string; reason?: string; decision?: string; resultId?: string }
  }[]
  ticketId: string
  revision: number
  submittedAt: string
  submissionSha256: string
  originalSubmission: Submission
  status: string
  parentReceipts: {
    parentMessageRef: string
    recordedAt: string
    summary: string
    provenance: string
  }[]
}

export type ReviewStatus = 'pending' | 'held' | 'selected' | 'excluded'
export interface AudioDecision {
  batchId: string
  candidateId: string
  status: ReviewStatus
  revision: number
  productionAdoption: 'not-adopted'
  history: { revision: number; at: string; status: ReviewStatus; from: ReviewStatus; asset: AssetRef }[]
}
export interface AudioReviews {
  generation: number
  decisions: Record<string, AudioDecision>
  regeneration: { actionId: string; eventId: string; prompt: string; submittedAt: string; status: 'queued' }[]
}
export type FeedbackSubject =
  | { kind: 'unit'; role: string; roleRevision: string; representation: RepresentationKind }
  | {
      kind: 'audio'
      batchId: string
      candidateId: string
      eventId: string
      category: 'combat' | 'ui' | 'bgm'
      unit: string | null
      field: string | null
      asset: AssetRef
    }
export interface TicketResult {
  resultId: string
  at: string
  revision: number
  conclusion: string
  parentMessageRef: string
  decision: 'undecided' | 'adopted' | 'rejected' | 'held'
  media: AssetRef[]
}
