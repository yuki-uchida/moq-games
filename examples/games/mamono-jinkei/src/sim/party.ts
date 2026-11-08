/**
 * Humans, slots and ownership (DESIGN §4): slot = job index; humans own slots in arrival order (respecting lobby
 * job picks); unowned slots are companions owned round-robin starting with the host; humans beyond four spectate.
 */
import { JOBS, type Job } from '../vocab'
import { emit, heroBy, sfx } from './core'
import { releaseHold } from './props'
import type { Human, WorldState } from './state'

export function newHuman(id: string, name: string): Human {
  return {
    id,
    name: name.slice(0, 12),
    input: {
      mx: 0,
      my: 0,
      aim: Math.PI / 2,
      attackHeld: false,
      actionHeld: false,
      attackPresses: 0,
      attackReleases: 0,
      actionPresses: 0,
      interactPresses: 0,
      switchPresses: 0,
      modePresses: 0,
      signalPresses: 0
    },
    seen: {
      attackPresses: 0,
      attackReleases: 0,
      actionPresses: 0,
      interactPresses: 0,
      switchPresses: 0,
      modePresses: 0,
      signalPresses: 0
    },
    ctrl: -1,
    mode: 'follow',
    jobAt: Infinity,
    spectator: false,
    menu: false,
    reportFresh: false
  }
}

/** Lobby job pick: granted when no other human holds it (first come). */
export function pickJob(W: WorldState, human: Human, job: Job): void {
  if (human.job === job) return
  if (W.humans.some((h) => h !== human && h.job === job)) return
  human.job = job
  human.jobAt = W.t
}

/** Assigns every slot at stage start. */
export function assignSlots(W: WorldState): void {
  const free = new Set(JOBS.map((_, i) => i))
  const players = W.humans.slice(0, 4)
  for (const h of W.humans) (h.ctrl = -1), (h.spectator = true)
  // Job picks first (earliest pick wins), then arrival order.
  const byPick = players.filter((h) => h.job).sort((a, b) => a.jobAt - b.jobAt)
  for (const h of byPick) {
    const slot = JOBS.indexOf(h.job!)
    if (free.has(slot)) {
      free.delete(slot)
      h.ctrl = slot
      h.spectator = false
    }
  }
  for (const h of players) {
    if (h.ctrl >= 0) continue
    const slot = [...free][0]
    free.delete(slot)
    h.ctrl = slot
    h.spectator = false
  }
  for (const hero of W.heroes) {
    const human = W.humans.find((h) => h.ctrl === hero.slot)
    hero.owner = human?.id ?? ''
  }
  distributeCompanions(W)
}

/** Unowned heroes go round-robin to the humans (host first). */
export function distributeCompanions(W: WorldState): void {
  const players = W.humans.filter((h) => !h.spectator)
  if (!players.length) return
  let k = 0
  for (const hero of W.heroes) {
    if (players.some((p) => p.id === hero.owner)) continue
    hero.owner = players[k++ % players.length].id
  }
}

export function ownedSlots(W: WorldState, human: Human): number[] {
  const own = W.heroes.filter((h) => h.owner === human.id).map((h) => h.slot)
  return [...own.filter((s) => s === human.ctrl), ...own.filter((s) => s !== human.ctrl).sort((a, b) => a - b)]
}

/** Tab: control the next owned hero; the previous one becomes a companion in the human's mode. */
export function switchHero(W: WorldState, human: Human): void {
  const own = W.heroes
    .filter((h) => h.owner === human.id)
    .map((h) => h.slot)
    .sort((a, b) => a - b)
  if (own.length < 2) return
  const prev = heroBy(W, human.ctrl)
  const i = own.indexOf(human.ctrl)
  for (let k = 1; k <= own.length; k++) {
    const next = heroBy(W, own[(i + k) % own.length])
    if (!next || next.state === 'down') continue
    human.ctrl = next.slot
    break
  }
  if (prev && prev.slot !== human.ctrl) {
    prev.intent = { ...prev.intent, mx: 0, my: 0, held: false, press: false, release: false }
    prev.holdAt = -1
    prev.charging = prev.chargeFull = false
    prev.anchor = human.mode === 'stay' ? { x: prev.body.x, y: prev.body.y } : undefined
    prev.ai.path = undefined
    prev.ai.queue = []
    prev.ai.ownerHeld = false
  }
  const cur = heroBy(W, human.ctrl)
  if (cur) {
    if (cur.holdKind === 'lift') releaseHold(W, cur)
    cur.anchor = undefined
    cur.ai.queue = []
    cur.ai.ownerHeld = false
  }
}

/** Q: the human's companions follow ⇄ stay. */
export function toggleMode(W: WorldState, human: Human): void {
  human.mode = human.mode === 'follow' ? 'stay' : 'follow'
  const ctrl = heroBy(W, human.ctrl)
  for (const h of W.heroes) {
    if (h.owner !== human.id || h.slot === human.ctrl) continue
    if (human.mode === 'stay') {
      h.anchor = { x: h.body.x, y: h.body.y }
      if (ctrl) h.aim = ctrl.aim
    } else h.anchor = undefined
    h.ai.path = undefined
  }
  if (ctrl)
    emit(W, 'pop', ctrl.body.x, ctrl.body.y - 70, {
      s: human.mode === 'stay' ? '待て！' : 'ついてこい！',
      a: ctrl.slot
    })
}

/** Updates humans from the host's player list (joins and leaves mid-game). */
export function syncPlayers(W: WorldState, list: readonly { id: string; name: string }[]): void {
  const inGame = W.heroes.length > 0
  const keep: Human[] = []
  for (const p of list) {
    let h = W.humans.find((q) => q.id === p.id)
    if (!h) {
      h = newHuman(p.id, p.name)
      if (inGame) h.spectator = true
    } else h.name = p.name.slice(0, 12)
    keep.push(h)
  }
  const left = W.humans.filter((h) => !keep.includes(h))
  W.humans = keep
  if (!inGame) return
  for (const h of left) {
    // Its heroes become companions of the others.
    const players = W.humans.filter((q) => !q.spectator)
    let k = 0
    for (const hero of W.heroes)
      if (hero.owner === h.id) {
        hero.owner = players.length ? players[k++ % players.length].id : ''
        hero.anchor = undefined
        hero.holdAt = -1
      }
    sfx(W, 'leave', 0, 0)
    emit(W, 'notice', 0, 0, { s: `${h.name}がぬけた` })
  }
  // Joiners (and spectators while a seat frees up) take over a companion.
  for (const h of W.humans) {
    if (!h.spectator || W.humans.filter((q) => !q.spectator).length >= 4) continue
    const counts = new Map<string, number>()
    for (const hero of W.heroes) counts.set(hero.owner, (counts.get(hero.owner) ?? 0) + 1)
    const candidates = W.heroes
      .filter((hero) => {
        const owner = W.humans.find((q) => q.id === hero.owner)
        return !owner || owner.ctrl !== hero.slot
      })
      .sort((a, b) => {
        const pa = h.job && JOBS[a.slot] === h.job ? -10 : 0
        const pb = h.job && JOBS[b.slot] === h.job ? -10 : 0
        return pa - (counts.get(a.owner) ?? 0) - (pb - (counts.get(b.owner) ?? 0))
      })
    const hero = candidates[0]
    if (!hero) continue
    hero.owner = h.id
    hero.anchor = undefined
    h.ctrl = hero.slot
    h.spectator = false
    sfx(W, 'join', hero.body.x, hero.body.y)
    emit(W, 'notice', hero.body.x, hero.body.y, { s: `${h.name}がさんかした` })
  }
  for (const h of W.humans)
    if (!h.spectator && !W.heroes.some((hero) => hero.slot === h.ctrl && hero.owner === h.id))
      h.ctrl = ownedSlots(W, h)[0] ?? -1
}
