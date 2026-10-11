import { it, expect, vi, afterEach } from 'vitest'
const mock = vi.hoisted(() => ({
  receive: undefined as ((v: unknown) => void) | undefined,
  close: undefined as (() => void) | undefined,
  send: vi.fn<(value: unknown) => Promise<boolean>>(async () => true)
}))
vi.mock('../src/network/MoqChannel', () => ({
  MoqChannel: class {
    constructor(
      _n: unknown,
      _p: unknown,
      _s: unknown,
      receive: (v: unknown) => void,
      _status: unknown,
      close: () => void
    ) {
      mock.receive = receive
      mock.close = close
    }
    connect = async () => {}
    send = mock.send
  }
}))
import { JevConnection } from '../src/network/JevConnection'
import { initialState } from '../src/game/model'
function assault() {
  const state = initialState()
  state.phase = 'assault'
  state.cooldowns.shaman = 5
  return state
}
function request() {
  return mock.send.mock.calls.at(-1)?.[0] as { version: number; session: string; requestId: string }
}
async function accepted(pending: ReturnType<JevConnection['decide']>) {
  const result = await pending
  if (!result || !('action' in result)) throw new Error('Expected an accepted decision')
  return result
}
const slime = { type: 'spawn', unitType: 'slime' } as const
const wait = { type: 'wait', unitType: 'shaman' } as const
afterEach(() => {
  vi.clearAllTimers()
  vi.useRealTimers()
  mock.send.mockReset().mockResolvedValue(true)
})
it('correlates replies and ignores wrong sessions, wrong requests, and duplicates', async () => {
  // Arrange
  const status = vi.fn()
  const connection = new JevConnection('room', status)
  const pending = connection.decide(assault())
  const envelope = request()
  // Act
  mock.receive?.({ ...envelope, session: 'wrong', action: wait })
  mock.receive?.({ ...envelope, requestId: 'wrong', action: wait })
  mock.receive?.({ ...envelope, source: 'jev', action: slime })
  const result = await pending
  const calls = status.mock.calls.length
  mock.receive?.({ ...envelope, action: wait })
  // Assert
  expect(result).toEqual({
    action: slime,
    scores: [{ action: slime, score: 1 }],
    scoreSource: 'selected-action-fallback',
    source: 'jev'
  })
  expect(status).toHaveBeenCalledTimes(calls)
})
it('rejects a correlated action outside the snapshot legal set', async () => {
  // Arrange
  const connection = new JevConnection('room', () => {})
  const pending = connection.decide(assault())
  // Act
  mock.receive?.({ ...request(), action: { type: 'spawn', unitType: 'dragon', boss: true } })
  // Assert
  expect(await pending).toEqual({ type: 'unavailable', reason: 'error', source: 'bot' })
})
it('sanitizes and normalizes finite scores for legal campaign actions', async () => {
  // Arrange
  const connection = new JevConnection('room', () => {})
  const pending = connection.decide(assault())
  // Act
  mock.receive?.({
    ...request(),
    action: slime,
    source: 'jev',
    scores: [
      { action: slime, score: 3 },
      { action: { type: 'spawn', unitType: 'dragon' }, score: 999 },
      { action: wait, score: 1 }
    ]
  })
  // Assert
  expect((await accepted(pending)).scores).toEqual([
    { action: slime, score: 0.75 },
    { action: wait, score: 0.25 }
  ])
})
it('falls back to the selected action when scores are nonfinite or invalid', async () => {
  // Arrange
  const connection = new JevConnection('room', () => {})
  const pending = connection.decide(assault())
  // Act
  mock.receive?.({
    ...request(),
    action: wait,
    scores: [
      { action: slime, score: Infinity },
      { action: wait, score: -1 },
      { action: slime, score: '1' }
    ]
  })
  // Assert
  expect((await accepted(pending)).scores).toEqual([{ action: wait, score: 1 }])
})
it('keeps a selected wait even when spawn probabilities are higher', async () => {
  // Arrange
  const connection = new JevConnection('room', () => {})
  const pending = connection.decide(assault())
  // Act
  mock.receive?.({ ...request(), action: wait, source: 'jev', scores: [{ action: slime, score: 1 }] })
  // Assert
  expect((await accepted(pending)).action).toEqual(wait)
})
it('times out and ignores a late reply after a newer request starts', async () => {
  // Arrange
  vi.useFakeTimers()
  const connection = new JevConnection('room', () => {})
  const first = connection.decide(assault())
  const old = request()
  // Act
  await vi.advanceTimersByTimeAsync(5000)
  const second = connection.decide(assault())
  mock.receive?.({ ...old, action: slime })
  mock.receive?.({ ...request(), action: wait })
  // Assert
  expect(await first).toEqual({ type: 'unavailable', reason: 'timeout', source: 'connection' })
  expect((await accepted(second)).action).toEqual(wait)
})
it('allows at most one request per five wall-clock seconds without queuing', async () => {
  // Arrange
  vi.useFakeTimers()
  const connection = new JevConnection('room', () => {})
  const first = connection.decide(assault())
  mock.receive?.({ ...request(), action: wait })
  await first
  // Act
  await vi.advanceTimersByTimeAsync(4999)
  const throttled = await connection.decide(assault())
  await vi.advanceTimersByTimeAsync(1)
  const second = connection.decide(assault())
  mock.receive?.({ ...request(), action: wait })
  // Assert
  expect(throttled).toEqual({ type: 'unavailable', reason: 'throttled', source: 'connection' })
  expect(mock.send).toHaveBeenCalledTimes(2)
  expect((await accepted(second)).action).toEqual(wait)
})
it('keeps only one request in flight even after the throttle interval', async () => {
  // Arrange
  vi.useFakeTimers()
  const connection = new JevConnection('room', () => {})
  const first = connection.decide(assault())
  // Act
  await vi.advanceTimersByTimeAsync(1200)
  const overlapping = await connection.decide(assault())
  mock.receive?.({ ...request(), action: wait })
  // Assert
  expect(overlapping).toEqual({ type: 'unavailable', reason: 'busy', source: 'connection' })
  expect(mock.send).toHaveBeenCalledTimes(1)
  expect((await accepted(first)).action).toEqual(wait)
})
it('does not overlap transport sends after a decision timeout', async () => {
  // Arrange
  vi.useFakeTimers()
  let finishSend!: (sent: boolean) => void
  mock.send.mockImplementationOnce(
    () =>
      new Promise((resolve) => {
        finishSend = resolve
      })
  )
  const connection = new JevConnection('room', () => {})
  const first = connection.decide(assault())
  // Act
  await vi.advanceTimersByTimeAsync(3000)
  const blocked = await connection.decide(assault())
  finishSend(true)
  await vi.advanceTimersByTimeAsync(2000)
  const second = connection.decide(assault())
  mock.receive?.({ ...request(), action: wait })
  // Assert
  expect(await first).toEqual({ type: 'unavailable', reason: 'timeout', source: 'connection' })
  expect(blocked).toEqual({ type: 'unavailable', reason: 'busy', source: 'connection' })
  expect(mock.send).toHaveBeenCalledTimes(2)
  expect((await accepted(second)).action).toEqual(wait)
})
it('explains when no bot is subscribed', async () => {
  // Arrange
  const status = vi.fn()
  const connection = new JevConnection('room', status)
  mock.send.mockResolvedValueOnce(false)
  // Act
  const result = await connection.decide(assault())
  // Assert
  expect(result).toEqual({ type: 'unavailable', reason: 'unavailable', source: 'connection' })
  expect(status).toHaveBeenLastCalledWith(expect.stringContaining('Bot未接続'))
})
it('reports send errors and correlated bot failures immediately', async () => {
  // Arrange
  const status = vi.fn()
  mock.send.mockRejectedValueOnce(new Error('offline'))
  const connection = new JevConnection('room', status)
  // Act
  const failed = await connection.decide(assault())
  const another = new JevConnection('room', status)
  const pending = another.decide(assault())
  mock.receive?.({ ...request(), error: 'Jev request failed' })
  // Assert
  expect(failed).toEqual({ type: 'unavailable', reason: 'error', source: 'connection' })
  expect(await pending).toEqual({ type: 'unavailable', reason: 'error', source: 'bot' })
  expect(status).toHaveBeenLastCalledWith('Jevエラー: Jev request failed')
})
it('cancels pending work and its timeout when changing mode', async () => {
  // Arrange
  vi.useFakeTimers()
  const status = vi.fn()
  const connection = new JevConnection('room', status)
  const pending = connection.decide(assault())
  const envelope = request()
  // Act
  connection.cancelPending()
  mock.receive?.({ ...envelope, source: 'jev', action: slime })
  await vi.advanceTimersByTimeAsync(3000)
  // Assert
  expect(await pending).toBeNull()
  expect(status).not.toHaveBeenCalled()
})
it('cancels pending work when the MoQ channel closes', async () => {
  // Arrange
  const onClosed = vi.fn()
  const connection = new JevConnection('room', () => {}, onClosed)
  const pending = connection.decide(assault())
  // Act
  mock.close?.()
  // Assert
  expect(await pending).toBeNull()
  expect(onClosed).toHaveBeenCalledOnce()
})
it('sends nothing when the current phase has no legal spawn', async () => {
  // Arrange
  const connection = new JevConnection('room', () => {})
  // Act
  const result = await connection.decide(initialState())
  // Assert
  expect(result).toMatchObject({ type: 'unavailable', reason: 'no-legal-actions' })
  expect(mock.send).not.toHaveBeenCalled()
})

it('uses v2 to fail closed against older bots and accepts an unchanged single-spawn action', async () => {
  // Arrange
  const connection = new JevConnection('room', () => {})
  const pending = connection.decide(assault())
  const envelope = request()
  // Act
  mock.receive?.({ ...envelope, version: 1, action: slime })
  mock.receive?.({ ...envelope, action: slime })
  // Assert
  expect(envelope.version).toBe(2)
  expect((await accepted(pending)).action).toEqual(slime)
})

it('publishes bounded observation-only records without pending decisions or response timeouts', async () => {
  // Arrange
  vi.useFakeTimers()
  const status = vi.fn(),
    connection = new JevConnection('room', status)
  // Act
  await connection.observe(assault())
  const first = request()
  await connection.observe(assault())
  await vi.advanceTimersByTimeAsync(999)
  await connection.observe(assault())
  await vi.advanceTimersByTimeAsync(1)
  await connection.observe(assault())
  mock.receive?.({ ...first, action: slime })
  await vi.advanceTimersByTimeAsync(3000)
  // Assert
  expect(first).toMatchObject({ version: 2, kind: 'observation' })
  expect(mock.send).toHaveBeenCalledTimes(2)
  expect(status).not.toHaveBeenCalled()
})

it('never overlaps observation sends with a decision or queues one after the request', async () => {
  // Arrange
  vi.useFakeTimers()
  const connection = new JevConnection('room', () => {})
  const pending = connection.decide(assault())
  // Act
  await vi.advanceTimersByTimeAsync(1000)
  await connection.observe(assault())
  mock.receive?.({ ...request(), action: wait })
  await pending
  await vi.advanceTimersByTimeAsync(1000)
  // Assert
  expect(mock.send).toHaveBeenCalledTimes(1)
})

it('accepts only an offered fixed formation and ignores duplicate formation responses', async () => {
  // Arrange
  const connection = new JevConnection('room', () => {})
  const pending = connection.decide(assault()),
    envelope = request()
  const formation = { type: 'formation', formationId: 'skirmish' }
  // Act
  mock.receive?.({ ...envelope, action: formation, source: 'jev' })
  const result = await accepted(pending)
  mock.receive?.({ ...envelope, action: formation, source: 'jev' })
  // Assert
  expect(result?.action).toEqual(formation)
  expect(mock.send).toHaveBeenCalledTimes(1)
})

it('keeps genuine API values separate from normalized gameplay scores', async () => {
  // Arrange
  const connection = new JevConnection('room', () => {})
  const pending = connection.decide(assault())
  const probabilityEvidence = {
    offeredActions: [slime, wait],
    provided: [
      { action: slime, probability: 0.9 },
      { action: wait, probability: 0.3 }
    ],
    status: 'complete'
  }
  // Act
  mock.receive?.({
    ...request(),
    action: slime,
    source: 'jev',
    probabilityEvidence,
    scores: [
      { action: slime, score: 3 },
      { action: wait, score: 1 }
    ]
  })
  const decision = await accepted(pending)
  // Assert
  expect(decision?.probabilityEvidence).toEqual(probabilityEvidence)
  expect(decision?.scores).toEqual([
    { action: slime, score: 0.75 },
    { action: wait, score: 0.25 }
  ])
  expect(decision?.scoreSource).toBe('provided-scores')
})

it.each([
  { offeredActions: [slime, wait], provided: [{ action: wait, probability: 0.2 }], status: 'partial' },
  { offeredActions: [slime], provided: [{ action: slime, probability: 1 }], status: 'complete' },
  { offeredActions: [slime, wait], provided: [], status: 'unavailable' },
  {
    offeredActions: [slime, wait],
    provided: [
      { action: slime, probability: 0 },
      { action: wait, probability: 0 }
    ],
    status: 'unavailable'
  }
])('preserves partial, wait-removed or unusable API evidence exactly: %j', async (probabilityEvidence) => {
  // Arrange
  const connection = new JevConnection('room', () => {})
  const pending = connection.decide(assault())
  // Act
  mock.receive?.({
    ...request(),
    action: slime,
    source: 'jev',
    probabilityEvidence,
    confidence: 0.99,
    scoreSource: 'selected-action-fallback',
    scores: [{ action: slime, score: 1 }]
  })
  const decision = await accepted(pending)
  // Assert
  expect(decision?.probabilityEvidence).toEqual(probabilityEvidence)
  expect(decision?.scoreSource).toBe('selected-action-fallback')
  expect(decision?.scores).toEqual([{ action: slime, score: 1 }])
})

it('does not infer raw evidence or offered actions from legacy scores, probabilities or confidence', async () => {
  // Arrange
  const connection = new JevConnection('room', () => {})
  const pending = connection.decide(assault())
  // Act
  mock.receive?.({
    ...request(),
    action: slime,
    source: 'jev',
    confidence: 0.99,
    probabilities: { 'spawn:slime:0': 1 },
    scores: [{ action: slime, score: 1 }]
  })
  const decision = await accepted(pending)
  // Assert
  expect(decision?.probabilityEvidence).toBeUndefined()
  expect(decision?.scoreSource).toBe('provided-scores')
})

it.each([
  null,
  {},
  { offeredActions: [], provided: [], status: 'unavailable' },
  { offeredActions: [wait], provided: [{ action: wait, probability: 1 }], status: 'complete' },
  { offeredActions: [slime, slime], provided: [], status: 'unavailable' },
  { offeredActions: [slime, { ...slime, boss: false }], provided: [], status: 'unavailable' },
  { offeredActions: [slime, { type: 'spawn', unitType: 'dragon' }], provided: [], status: 'unavailable' },
  { offeredActions: [slime], provided: [{ action: wait, probability: 1 }], status: 'complete' },
  {
    offeredActions: [slime, wait],
    provided: [
      { action: slime, probability: 0.4 },
      { action: slime, probability: 0.6 }
    ],
    status: 'complete'
  },
  ...['1', true, NaN, Infinity, -1, 1.01].map((probability) => ({
    offeredActions: [slime],
    provided: [{ action: slime, probability }],
    status: 'complete'
  })),
  { offeredActions: [slime], provided: [{ action: slime, probability: 0 }], status: 'complete' },
  { offeredActions: [slime, wait], provided: [{ action: slime, probability: 1 }], status: 'complete' },
  { offeredActions: [slime], provided: [{ action: slime, probability: 1 }], status: 'unavailable' },
  { offeredActions: [slime], provided: [{ action: slime, probability: 1 }], status: 'partial' },
  { offeredActions: [slime], provided: [], status: 'unknown' },
  { offeredActions: Array(65).fill(slime), provided: [], status: 'unavailable' },
  {
    offeredActions: [slime],
    provided: [{ action: slime, probability: 1, confidence: 1 }],
    status: 'complete'
  },
  { offeredActions: [slime], provided: [], status: 'unavailable', confidence: 1 }
])('discards malformed evidence without rejecting a correlated legal action: %j', async (probabilityEvidence) => {
  // Arrange
  const connection = new JevConnection('room', () => {})
  const pending = connection.decide(assault())
  // Act
  mock.receive?.({
    ...request(),
    action: slime,
    source: 'jev',
    probabilityEvidence,
    scores: [{ action: slime, score: 1 }]
  })
  const decision = await accepted(pending)
  // Assert
  expect(decision?.action).toEqual(slime)
  expect(decision?.probabilityEvidence).toBeUndefined()
  expect(decision?.scores).toEqual([{ action: slime, score: 1 }])
})

it('does not label non-Jev fallback responses as model probability evidence', async () => {
  // Arrange
  const connection = new JevConnection('room', () => {})
  const pending = connection.decide(assault())
  // Act
  mock.receive?.({
    ...request(),
    action: wait,
    source: 'jev-backoff',
    probabilityEvidence: {
      offeredActions: [wait],
      provided: [{ action: wait, probability: 1 }],
      status: 'complete'
    }
  })
  const decision = await accepted(pending)
  // Assert
  expect(decision?.source).toBe('jev-backoff')
  expect(decision?.probabilityEvidence).toBeUndefined()
})

it('accepts a reported selection fallback only for selected-action-only scores', async () => {
  // Arrange
  const connection = new JevConnection('room', () => {})
  const pending = connection.decide(assault())
  // Act
  mock.receive?.({
    ...request(),
    action: slime,
    source: 'jev',
    scoreSource: 'selected-action-fallback',
    scores: [
      { action: slime, score: 0.4 },
      { action: wait, score: 0.6 }
    ]
  })
  // Assert
  expect((await accepted(pending)).scoreSource).toBe('provided-scores')
})
