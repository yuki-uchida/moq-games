// Title-screen demo ("attract mode"): a real battle of the real simulation that a small bot plays behind the
// 作戦室 dialog. It builds its own cards and its own game state; it never reads or writes the campaign, storage,
// audio or the DOM, so the module is pure and testable in node.
import {
  POOPS,
  SPECIALS,
  MAX_UNITS,
  createGame,
  summon,
  upgrade,
  upgradeCost,
  burst,
  step,
  card,
  rng,
  OPENING
} from './simulation.js'

/** Demo units get ids far above any real battle's, so the shared model pool never mixes the two. */
export const ID_BASE = 1_000_000
/** The longest step the demo takes at once, however slow the frame. */
export const MAX_DT = 0.05
/** A battle that has not ended after this many seconds is restarted. */
export const ROUND_SECONDS = 200
/** After a fort falls, the result stays on screen this long before the next round. */
export const HOLD_SECONDS = 1.8
/** Stages (early, easy ones) the rounds cycle through. */
export const STAGE_CYCLE = [0, 1, 0, 2]
/** The first round is fixed, so the opening screen is stable for tests and screenshots. */
export const FIRST_FORMATION = ['katachi', 'korokoro', 'geri', 'aircon', 'jiro', 'curry']
export const FIRST_SEED = 20240

const LEVEL = 4
const entry = (uid, key) => {
  const t = POOPS.find((p) => p.key === key) ?? SPECIALS.find((p) => p.key === key)
  return card({ uid, key, level: LEVEL, hp: Math.round(t.hp * 1.1), atk: Math.round(t.atk * 1.1), spd: 1 })
}

/** A showy formation: a few poops (cheap tank first) and a few specials. Round 0 is fixed; later rounds vary. */
export function attractFormation(round) {
  if (round === 0) return FIRST_FORMATION
  const random = rng(round * 7919 + 13)
  const pick = (list, n) => {
    const pool = [...list]
    const out = []
    while (out.length < n && pool.length) out.push(pool.splice(Math.floor(random() * pool.length), 1)[0].key)
    return out
  }
  const poops = [
    'katachi',
    ...pick(
      POOPS.filter((p) => p.key !== 'katachi' && p.price <= 700),
      2
    )
  ]
  return [...poops, ...pick(SPECIALS, 3)]
}

export function createAttract(round = 0) {
  const keys = attractFormation(round)
  const deck = keys.map((key, i) => entry(i + 1, key))
  const stage = STAGE_CYCLE[round % STAGE_CYCLE.length]
  const state = createGame(stage, deck, round === 0 ? FIRST_SEED : (round * 104729 + 7) >>> 0)
  state.serial = ID_BASE
  return { round, state, random: rng(round * 31 + 5), next: 0.6, hold: 0, generation: 0 }
}

/** What a competent player would do now: hold the morning, then invest once, keep a varied army up, fart when swamped. */
export function act(a) {
  const s = a.state
  if (s.result) return
  const morning = s.opened < OPENING.at.length
  if (!morning && s.level < 2 && s.gold >= upgradeCost(s) + 50) upgrade(s)
  const allies = s.units.filter((u) => u.side === 1).length
  if (allies < MAX_UNITS - 4) {
    // The least-used card that is off cooldown, so every card is shown. Pricey ones are saved up for once a front
    // line of two stands; until then the cheap tank keeps coming.
    const wanted = s.deck
      .map((_, i) => i)
      .filter((i) => s.cooldowns[i] <= 0 && (allies >= 2 || s.deck[i].cost <= 70))
      .sort((x, y) => s.summons[x] - s.summons[y] || x - y)[0]
    if (wanted !== undefined) summon(s, wanted)
  }
  const near = s.units.filter((u) => u.side === -1 && u.x > 560).length
  if (near >= 3 || s.units.some((u) => u.side === -1 && u.x > 700)) burst(s)
}

/**
 * Advances the demo by `dt` seconds (capped) and restarts it after a fort falls or at the time limit.
 * `generation` changes on every restart so the renderer can drop its per-battle visuals.
 */
export function stepAttract(a, dt) {
  dt = Math.min(MAX_DT, Math.max(0, dt))
  const s = a.state
  if (s.result) {
    a.hold += dt
    if (a.hold >= HOLD_SECONDS) restart(a)
    return
  }
  step(s, dt)
  a.next -= dt
  if (a.next <= 0) {
    act(a)
    a.next = 0.45 + a.random() * 0.5
  }
  if (!s.result && s.time >= ROUND_SECONDS) restart(a)
}

function restart(a) {
  const fresh = createAttract(a.round + 1)
  Object.assign(a, fresh, { generation: a.generation + 1 })
}
