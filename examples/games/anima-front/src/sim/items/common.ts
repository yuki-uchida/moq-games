/**
 * Shared helpers for antique behaviours: costs and damage with mods, aim point and fire direction, the 'empty'
 * click, use bookkeeping (uses counter, cloak reveal, same antique in both paws alternating) and bullets.
 */
import { ITEMS, type ItemDef, type ItemId } from '../../data/items'
import { rayActors } from '../actors'
import { spend } from '../anima'
import { AIM_RANGE, AVATAR_DAMAGE, BEAR_MELEE, EMPTY_GAP, SHOT_RADIUS } from '../constants'
import { itemCost, modsOf, periodScale } from '../loadout'
import { aimOf, muzzleOf, pivotOf } from '../player'
import { spawnShot, type ShotSpec } from '../projectiles'
import { emit, type HandSt, type Player, type Sim } from '../state'
import { deg, jitterDir, r3, r3v, vnorm, type Vec } from '../vec'

export const costOf = (p: Player, def: ItemDef, base?: number) => itemCost(modsOf(p), def, base)
export const periodOf = (p: Player, base: number, def?: ItemDef) => base * periodScale(modsOf(p)) + (def?.cooldown ?? 0)
/** クロヅメ avatars hit with the difficulty multiplier × AVATAR_DAMAGE (they come in numbers). */
const foeMul = (p: Player) => (p.foe ? p.foe.dmgMul * AVATAR_DAMAGE : 1)
export const meleeMul = (p: Player) =>
  (1 + modsOf(p).meleeDamage) * (p.species.trait === 'strong' ? BEAR_MELEE : 1) * foeMul(p)
export const rangedMul = (p: Player) => (1 + modsOf(p).rangedDamage) * foeMul(p)
export const spreadMul = (p: Player) => Math.max(0, 1 + modsOf(p).spread)

export const isReady = (sim: Sim, h: HandSt) => sim.time >= h.readyAt - 1e-9

export function emptyClick(sim: Sim, p: Player, h: HandSt, force = false) {
  if (!force && sim.time - h.emptyAt < EMPTY_GAP) return
  h.emptyAt = sim.time
  emit(sim, { type: 'empty', who: p.id, hand: h.hand })
}

/** Pays a cost or plays the empty click. */
export function pay(sim: Sim, p: Player, h: HandSt, def: ItemDef, amount = costOf(p, def)): boolean {
  if (spend(sim, p, amount, def.id)) return true
  emptyClick(sim, p, h, true)
  return false
}

/** Bookkeeping after any use: uses counter, cloak reveal, alternate fire with the same antique in the other paw. */
export function used(sim: Sim, p: Player, h: HandSt, def: ItemDef, period: number) {
  h.uses++
  h.readyAt = sim.time + period
  if (def.category === 'melee' || def.category === 'ranged') {
    const u = ITEMS.leaf.use
    p.attackRevealUntil = sim.time + (u?.kind === 'cloak' ? u.revealAfterAttack : 1)
  }
  const other = p.hands[h.hand === 'R' ? 1 : 0]
  if (other.sel >= 0 && other.items[other.sel] === def.id) {
    other.readyAt = Math.max(other.readyAt, sim.time + period / 2)
  }
}

/** First point along the aim ray (boxes and hostile actors), or AIM_RANGE metres along it. */
export function aimPoint(sim: Sim, p: Player, range = AIM_RANGE): Vec {
  const o = pivotOf(p)
  const d = aimOf(p)
  const skip = p.foe ? p.foe.id : p.id
  const wall = sim.phys.raycast(o, d, range, 0, p.side)
  const act = rayActors(sim, p.side, o, d, wall ? wall.t : range, 0, skip, true)
  const t = act ? act.t : wall ? wall.t : range
  return [o[0] + d[0] * t, o[1] + d[1] * t, o[2] + d[2] * t]
}

/** Direction from the paw muzzle toward the aim point, jittered by `spreadDeg` (normal-ish distribution). */
export function fireDir(sim: Sim, p: Player, from: Vec, target: Vec, spreadDeg: number): Vec {
  const d = vnorm([target[0] - from[0], target[1] - from[1], target[2] - from[2]])
  if (spreadDeg <= 0) return d
  return jitterDir(d, deg(spreadDeg), sim.rng.gauss() * 0.5, sim.rng.gauss() * 0.5)
}

export function fireEvent(sim: Sim, p: Player, h: HandSt, item: ItemId, from: Vec, dir: Vec) {
  emit(sim, {
    type: 'fire',
    who: p.foe ? p.foe.id : p.id,
    item,
    hand: h.hand,
    from: r3v(from),
    dir: [r3(dir[0]), r3(dir[1]), r3(dir[2])]
  })
}

/** Spawns a bullet from the paw toward the aim point (one projectile; caller handles cost/cooldown). */
export function bullet(
  sim: Sim,
  p: Player,
  h: HandSt,
  def: ItemDef,
  o: { speed: number; dmg: number; spread: number; headMult?: number; range: number; falloff?: number },
  target = aimPoint(sim, p),
  event = true
): Vec {
  const from = muzzleOf(p, h.hand)
  const dir = fireDir(sim, p, from, target, o.spread)
  const spec: ShotSpec = {
    kind: def.id,
    item: def.id,
    side: p.side,
    owner: p.foe ? p.foe.id : p.id,
    hand: h.hand,
    p: from,
    v: [dir[0] * o.speed, dir[1] * o.speed, dir[2] * o.speed],
    dmg: o.dmg,
    headMult: o.headMult ?? 1,
    range: o.range,
    life: o.range / o.speed + 0.1,
    r: SHOT_RADIUS,
    falloff: o.falloff
  }
  spawnShot(sim, spec)
  p.stats.shots++
  if (event) fireEvent(sim, p, h, def.id, from, dir)
  return dir
}
