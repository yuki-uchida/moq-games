/** Pickups: drops, bounce-in, magnet and collection (DESIGN §11). */
import { burst, dist, emit, fx, newId, pop, sfx } from './core'
import type { Hero, WorldState } from './state'
import type { PickupKind } from './types'

export function dropItems(W: WorldState, x: number, y: number, kinds: readonly PickupKind[]): void {
  kinds.forEach((kind, i) => {
    const a = (i / Math.max(1, kinds.length)) * Math.PI * 2 + W.rng.range(0, 1)
    const sp = kinds.length > 1 ? 70 : 20
    W.pickups.push({ id: newId(W), kind, x, y, st: W.t, vx: Math.cos(a) * sp, vy: Math.sin(a) * sp, taken: false })
  })
}

/** Random drop from defeated enemies, cut grass and broken pots. */
export function rollDrop(W: WorldState, x: number, y: number, table: 'enemy' | 'grass' | 'pot'): void {
  const r = W.rng.next()
  const odds = { enemy: [0.45, 0.2], grass: [0.22, 0.1], pot: [0.55, 0.25] }[table]
  if (r < odds[0]) dropItems(W, x, y, [W.rng.chance(0.15) ? 'gem_big' : 'gem'])
  else if (r < odds[0] + odds[1]) dropItems(W, x, y, ['heart'])
}

export function updatePickups(W: WorldState, dt: number): void {
  for (const p of W.pickups) {
    if (p.taken) continue
    p.x += p.vx * dt
    p.y += p.vy * dt
    p.vx *= Math.exp(-6 * dt)
    p.vy *= Math.exp(-6 * dt)
    if (W.t - p.st < 0.35) continue
    let best: Hero | undefined
    let bd = Infinity
    for (const h of W.heroes) {
      if (h.state === 'down' || h.state === 'fall' || h.state === 'tech') continue
      const d = dist(h.body.x, h.body.y, p.x, p.y)
      if (d < bd) (bd = d), (best = h)
    }
    if (!best) continue
    const magnet = p.kind === 'orb' ? 0 : 72
    if (bd < magnet && bd > 1) {
      const k = Math.min(1, (320 * dt) / bd)
      p.x += (best.body.x - p.x) * k
      p.y += (best.body.y - p.y) * k
    }
    if (bd <= (p.kind === 'orb' ? 40 : 22)) collect(W, best, p.kind, p.x, p.y) && (p.taken = true)
  }
  W.pickups = W.pickups.filter((p) => !p.taken)
}

function collect(W: WorldState, h: Hero, kind: PickupKind, x: number, y: number): boolean {
  switch (kind) {
    case 'heart':
      h.hp = Math.min(h.maxHp, h.hp + 2)
      sfx(W, 'heart', x, y)
      fx(W, 'heal', h.body.x, h.body.y)
      break
    case 'bigheart':
      h.hp = h.maxHp
      sfx(W, 'heart', x, y)
      fx(W, 'heal', h.body.x, h.body.y)
      pop(W, 'ぜんかい！', x, y - 40, h.slot)
      break
    case 'gem':
    case 'gem_big':
      W.party.gems += kind === 'gem' ? 1 : 5
      sfx(W, kind === 'gem' ? 'gem' : 'gemBig', x, y)
      fx(W, 'gem_sparkle', x, y)
      break
    case 'key':
      W.party.keys++
      sfx(W, 'key', x, y)
      break
    case 'orb':
      sfx(W, 'orbGet', x, y)
      burst(W, 'spark', x, y, 16)
      emit(W, 'notice', x, y, { s: '陣の宝珠を手に入れた！' })
      W.orbTaken = true
      break
  }
  return true
}
