import { campaign } from './campaign'
import {
  attack,
  beginAlly,
  beginEnemy,
  createGame,
  damage,
  distance,
  enemyStep,
  key,
  move,
  reachable,
  recover,
  seeded,
  staffHeal,
  type Game,
  type Unit
} from './game'
import type { Save } from './save'

/**
 * Title-screen demo ("attract mode"): a self-playing skirmish on the real rules. It owns its own Game and
 * RNG and never touches the player's battle, save or settings; main.ts only shows it on the stage.
 */
type Point = { x: number; y: number }
export type AttractAction = { kind: 'attack' | 'heal'; target: Unit; amount?: number }
export type AttractHost = {
  /** False once the demo should stop (title closed, superseded or out of time). */
  live(): boolean
  /** Mirror the current logical state on the board. */
  show(game: Game): void
  /** Animate one action; `before` is the state ahead of it. */
  present(game: Game, before: Unit[], unit: Unit, action?: AttractAction): Promise<void>
  /** Breathing room between actions (the host decides how it waits). */
  rest(ms: number): Promise<void>
}
export const attractTurns = 15
const snapshot = (game: Game) => game.units.map((u) => ({ ...u }))

/** The chapter the title most likely leads to, so its models double as a prefetch: continue, else chapter 1. */
export function attractStage(save: Save | undefined) {
  if (!save) return 0
  return Math.max(0, Math.min(campaign.length - 1, Math.trunc(save.suspend?.stage ?? save.furthest) || 0))
}
/** A fresh battle for the demo; loop 0 is fixed, later loops roll different growth. Reads the save only. */
export function attractGame(save: Save | undefined, loop: number): Game {
  const stage = attractStage(save)
  return createGame(stage, save?.formation ?? 'balanced', save?.checkpoints[stage], seeded(0x5eed + loop * 7919))
}

/** A greedy but sensible player: finish weakened foes, use matchups and groves, heal the hurt, avoid exposure. */
export function allyPlan(game: Game, unit: Unit, noise: () => number = () => 0) {
  const enemies = game.units.filter((e) => e.side === 'enemy' && e.hp > 0)
  const wounded = game.units.filter((a) => a.side === 'ally' && a.hp > 0 && a.hp < a.max && a.id !== unit.id)
  const allies = game.units.filter((a) => a.side === 'ally' && a.hp > 0 && a.id !== unit.id)
  const objective = campaign[game.stage].objective
  const options: Point[] = [...reachable(game, unit).keys()].map((k) => {
    const [x, y] = k.split(',').map(Number)
    return { x, y }
  })
  const grove = (p: Point) => (game.groves.has(key(p.x, p.y)) ? 3 : 0)
  const threat = (p: Point) =>
    enemies.reduce(
      (sum, e) =>
        sum + (distance(p, e) <= e.range + (e.ai === 'hold' ? 0 : e.move) ? damage(e, { ...unit, ...p }, game) : 0),
      0
    )
  const targetScore = (e: Unit) => damage(unit, e, game) * 3 + (damage(unit, e, game) >= e.hp ? 30 : 0) - e.hp / 5
  const healable = (p: Point) => wounded.filter((a) => distance(p, a) >= 1 && distance(p, a) <= 2)
  const rank = (p: Point) => {
    if (unit.heal) {
      const near = healable(p)
      const company = allies.length ? Math.min(...allies.map((a) => distance(p, a))) : 0
      return (near.length ? 50 + Math.max(...near.map((a) => a.max - a.hp)) : 0) - threat(p) * 2 - company + grove(p)
    }
    const inRange = enemies.filter((e) => distance(p, e) <= unit.range)
    const strike = inRange.length ? Math.max(...inRange.map(targetScore)) + 40 : 0
    const approach = enemies.length ? Math.min(...enemies.map((e) => Math.max(0, distance(p, e) - unit.range))) : 0
    const seize = objective.type === 'seize' ? Math.max(0, 20 - distance(p, objective) * 2) : 0
    return strike - approach * 8 - threat(p) * 1.5 + seize + grove(p)
  }
  const scored = options.map((p) => ({ p, score: rank(p) + noise() }))
  scored.sort((a, b) => b.score - a.score)
  let to = scored[0]?.p ?? { x: unit.x, y: unit.y }
  const target = unit.heal
    ? undefined
    : enemies.filter((e) => distance(to, e) <= unit.range).sort((a, b) => targetScore(b) - targetScore(a))[0]
  const heal = unit.heal ? healable(to).sort((a, b) => b.max - b.hp - (a.max - a.hp) || a.hp - b.hp)[0] : undefined
  // Badly hurt with no kill on offer: fall back to the safest square and drink a potion.
  const potion =
    !unit.heal && game.potions > 0 && unit.hp <= unit.max * 0.4 && !(target && damage(unit, target, game) >= target.hp)
  if (potion) to = options.reduce((best, p) => (threat(p) - grove(p) < threat(best) - grove(best) ? p : best), to)
  return { to, target: potion ? undefined : target, heal, potion }
}

/** Apply one ally's whole action through the game's own rules. */
export function allyStep(game: Game, unit: Unit, noise?: () => number) {
  const before = snapshot(game)
  const plan = allyPlan(game, unit, noise)
  if (plan.to.x !== unit.x || plan.to.y !== unit.y) move(game, unit, plan.to.x, plan.to.y)
  let action: AttractAction | undefined
  if (plan.heal && staffHeal(game, unit, plan.heal)) action = { kind: 'heal', target: plan.heal }
  else if (plan.target && attack(game, unit, plan.target))
    action = {
      kind: 'attack',
      target: plan.target,
      amount: damage(before.find((u) => u.id === unit.id)!, plan.target, game)
    }
  else if (plan.potion) recover(game, unit)
  unit.done = true
  game.progress = undefined
  return { before, action }
}

const over = (game: Game) => game.phase === 'won' || game.phase === 'lost'

/** Plays turns until a side wins, the turn cap is reached or the host stops it. */
export async function playAttract(game: Game, host: AttractHost, noise?: () => number) {
  while (host.live() && !over(game) && game.turn <= attractTurns) {
    const order = game.units
      .filter((u) => u.side === 'ally')
      .sort((a, b) => Number(Boolean(a.heal)) - Number(Boolean(b.heal)))
    for (const unit of order) {
      if (unit.hp <= 0 || game.phase !== 'ally') continue
      await host.rest(420)
      if (!host.live()) return
      const { before, action } = allyStep(game, unit, noise)
      await host.present(game, before, unit, action)
      if (!host.live()) return
      host.show(game)
      if (over(game)) return
    }
    if (!beginEnemy(game)) return
    host.show(game)
    for (const unit of game.units.filter((u) => u.side === 'enemy' && u.hp > 0)) {
      await host.rest(320)
      if (!host.live()) return
      const before = snapshot(game)
      const target = enemyStep(game, unit)
      game.progress = undefined
      await host.present(
        game,
        before,
        unit,
        target
          ? { kind: 'attack', target, amount: damage(before.find((u) => u.id === unit.id)!, target, game) }
          : undefined
      )
      if (!host.live()) return
      host.show(game)
      if (game.phase !== 'enemy') return
    }
    beginAlly(game)
    host.show(game)
  }
}
