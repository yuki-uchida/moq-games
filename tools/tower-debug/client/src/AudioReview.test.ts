import { it, expect } from 'vitest'
import { randomSelected, reviewKey } from './AudioReview'
import type { AudioCandidate, AudioReviews } from './contracts'
const candidates = ['a', 'b', 'c', 'd', 'e'].map((candidateId, i) => ({
  batchId: 'synthetic',
  candidateId,
  eventId: i === 4 ? 'other' : 'event'
})) as AudioCandidate[]
const reviews: AudioReviews = {
  generation: 0,
  regeneration: [],
  decisions: Object.fromEntries(
    candidates.map((c, i) => [
      reviewKey(c),
      {
        batchId: c.batchId,
        candidateId: c.candidateId,
        status: ['pending', 'selected', 'excluded', 'held', 'selected'][i],
        revision: 1,
        productionAdoption: 'not-adopted',
        history: []
      }
    ])
  )
} as AudioReviews
it('random audition uses selected candidates from only the requested event', () => {
  for (const value of [0, 0.1, 0.5, 0.999])
    expect(randomSelected(candidates, reviews, 'event', () => value)?.candidateId).toBe('b')
  expect(randomSelected(candidates, reviews, 'missing')).toBeNull()
  expect(randomSelected(candidates, reviews, 'event', () => 1)).toBeNull()
})
it('no decisions means no random fallback and changing a review never alters source candidates', () => {
  const source = structuredClone(candidates)
  expect(randomSelected(candidates, { ...reviews, decisions: {} }, 'event')).toBeNull()
  expect(candidates).toEqual(source)
})
