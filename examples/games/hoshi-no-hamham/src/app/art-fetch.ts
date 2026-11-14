/**
 * The art of the screens around play, made ready the way a stage's is (see warm.ts): the art workers paint what a
 * list names, the page adopts and bakes the answers in small slices. `listReady` tells whether a picture can be
 * drawn now without painting anything on the page; `fetchArt` asks for what is missing.
 *
 * The screens draw a picture only once its art is here. Normally the app asked for it long before (in the
 * background, behind every stage warm-up and every dig); when a screen still has to wait it asks again as urgent,
 * keeps what it shows meanwhile and counts the wait in `screenArtStats.late`.
 */
import { backdropReady, clipReady, hasTile, sheet } from '../art'
import { sharedArtSource, type ArtHurry } from '../art/remote'
import type { ArtList, ClipRef } from '../ui/story-scenes'
import { backdropStep, clipStep, runSteps, SLICE_BUDGET_MS, tileSteps, yieldToBrowser, type WarmStep } from './warm'

/** How often a screen had to wait for art it was about to show (the browser checks expect none). */
export const screenArtStats = { late: 0 }

/** Every clip of a list, whole sheets spelled out, each once. */
export function listClips(list: ArtList): ClipRef[] {
  const seen = new Set<string>()
  const out: ClipRef[] = []
  const add = (ref: ClipRef) => {
    const key = `${ref.sheet}/${ref.clip}`
    if (seen.has(key)) return
    seen.add(key)
    out.push(ref)
  }
  for (const id of list.sheets ?? []) for (const clip of Object.keys(sheet(id))) add({ sheet: id, clip })
  for (const ref of list.clips) add(ref)
  return out
}

/** True when everything the list names is here, so drawing it paints nothing on the page. */
export function listReady(list: ArtList): boolean {
  return (
    list.backdrops.every(backdropReady) &&
    list.tiles.every(hasTile) &&
    listClips(list).every((ref) => clipReady(ref.sheet, ref.clip))
  )
}

/** The warm-up slices of a list: one per clip and backdrop, the tiles in batches. */
export function listSteps(list: ArtList, label = 'art'): WarmStep[] {
  return [
    ...list.backdrops.map(backdropStep),
    ...listClips(list).map((ref) => clipStep(ref.sheet, ref.clip)),
    ...tileSteps(list.tiles, `tiles:${label}`)
  ]
}

/** How much the art is wanted: ahead of time (behind every stage warm-up and dig), or now. */
export type Need = 'background' | 'urgent'

const fetching = new Map<string, Promise<void>>()

/**
 * Makes the list's art ready and resolves once it is baked here. `key` names the list (a screen, a shot): asking
 * again under the same key while a fetch of the same need runs shares it. An urgent fetch of a list that is already
 * being fetched in the background asks again in front of the queue (the second answer is simply not adopted).
 * Nothing is painted or baked in the caller's task: the requests go out, then the first slice waits for a turn.
 */
export function fetchArt(key: string, list: ArtList, need: Need = 'background'): Promise<void> {
  const id = `${need}:${key}`
  const running = fetching.get(id)
  if (running) return running
  if (listReady(list)) return Promise.resolve()
  const hurry: ArtHurry = need === 'urgent' ? { urgent: true } : { background: true }
  const promise = runSteps(
    listSteps(list, key),
    undefined,
    yieldToBrowser,
    SLICE_BUDGET_MS,
    () => performance.now(),
    sharedArtSource(),
    hurry,
    true
  ).finally(() => fetching.delete(id))
  fetching.set(id, promise)
  return promise
}

/**
 * For a screen about to draw a list: true when it can draw now. Otherwise the art is asked for in earnest, the wait
 * is counted, and `then` runs once it is here.
 */
export function whenArt(key: string, list: ArtList, then: () => void): boolean {
  if (listReady(list)) return true
  screenArtStats.late += 1
  fetchArt(key, list, 'urgent').then(then, then)
  return false
}
