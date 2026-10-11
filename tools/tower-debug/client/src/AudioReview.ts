import type { AudioCandidate, AudioReviews, ReviewStatus } from './contracts'

export const reviewKey = (candidate: Pick<AudioCandidate, 'batchId' | 'candidateId'>) =>
  `${candidate.batchId}:${candidate.candidateId}`
export const reviewStatus = (candidate: AudioCandidate, reviews: AudioReviews): ReviewStatus =>
  reviews.decisions[reviewKey(candidate)]?.status ?? 'pending'
export function selectedForEvent(
  candidates: AudioCandidate[],
  reviews: AudioReviews,
  eventId: string
): AudioCandidate[] {
  return candidates.filter(
    (candidate) => candidate.eventId === eventId && reviewStatus(candidate, reviews) === 'selected'
  )
}
export function randomSelected(
  candidates: AudioCandidate[],
  reviews: AudioReviews,
  eventId: string,
  random = Math.random
) {
  const eligible = selectedForEvent(candidates, reviews, eventId)
  const value = random()
  if (!eligible.length || !Number.isFinite(value) || value < 0 || value >= 1) return null
  return eligible[Math.floor(value * eligible.length)]
}
