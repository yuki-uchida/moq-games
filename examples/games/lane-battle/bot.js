// A simple reference player for balance tests: greedy summons, early 腸活, 大放屁 when the tower is threatened.
import {
  createGame,
  summon,
  step,
  upgrade,
  upgradeCost,
  burst,
  STAGES,
  POOPS,
  card,
  typeOf,
  rng,
  OPENING
} from './simulation.js'
import { newCampaign, settle, buy, deckOf, SLOTS } from './campaign.js'

/**
 * Both modes hold off 腸活 until both 朝の清掃 waves are out.
 * greedy: acts every 50ms, summons everything affordable (most expensive first), invests to 腸活 Lv.3.
 * casual: a human-paced player — one tap per second on a random ready card, stops investing at Lv.2,
 * and only notices a threat to the tower when enemies are close.
 */
export function playBattle(deck, stage, seed = 1, { maxTime = 900, casual = false } = {}) {
  const s = createGame(stage, deck, seed)
  const random = rng(seed ^ 0x5eed)
  const order = deck.map((_, i) => i).sort((a, b) => deck[b].cost - deck[a].cost)
  let next = 0
  while (!s.result && s.time < maxTime) {
    const morning = s.opened < OPENING.at.length
    if (!casual) {
      if (!morning && s.level < 3 && s.gold >= upgradeCost(s) + 30) upgrade(s)
      for (const i of order) summon(s, i)
      if (s.units.some((u) => u.side === -1 && u.x > 650)) burst(s)
    } else if (s.time >= next) {
      next = s.time + 1
      if (!morning && s.level < 2 && s.gold >= upgradeCost(s) + 40) upgrade(s)
      else {
        const ready = order.filter((i) => s.cooldowns[i] <= 0 && s.gold >= deck[i].cost)
        if (ready.length) summon(s, ready[Math.floor(random() * ready.length)])
      }
      if (s.units.some((u) => u.side === -1 && u.x > 800)) burst(s)
    }
    step(s, 0.05)
  }
  return s
}

export function summonKeepingOne(game, specialIndex, order, random) {
  const special = game.deck[specialIndex]
  if (
    game.cooldowns[specialIndex] <= 0 &&
    game.gold >= special.cost / 2 &&
    !game.units.some((unit) => unit.side === 1 && unit.uid === special.uid && unit.hp > 0)
  ) {
    if (game.gold >= special.cost) summon(game, specialIndex)
  } else {
    const ready = order.filter((index) => game.cooldowns[index] <= 0 && game.gold >= game.deck[index].cost)
    if (ready.length) summon(game, ready[Math.floor(random() * ready.length)])
  }
}

const score = (e) => {
  const d = card(e)
  return (d.hp * d.atk) / d.period / d.cost
}
/** Keeps up to four owned poops, then fills the formation with the strongest units per cost. */
export function chooseFormation(c) {
  const keep = c.roster.filter((e) => !typeOf(e.key).special).slice(0, 4)
  const rest = c.roster.filter((e) => !keep.includes(e)).sort((a, b) => score(b) - score(a))
  c.loadout = [...keep, ...rest].slice(0, SLOTS).map((e) => e.uid)
}

export const MENU_SECONDS = 45
/** Plays the campaign in order, retrying (and so grinding EXP) on defeat; `time` includes MENU_SECONDS per battle in the 作戦室. */
export function playCampaign(
  random,
  { tries = 200, casual = false, log = () => {}, untilCleared = STAGES.length } = {}
) {
  const c = newCampaign()
  let time = 0,
    battles = 0,
    defeats = 0
  while (c.cleared < untilCleared && c.cleared < STAGES.length && battles < tries) {
    for (const t of POOPS) buy(c, t.key)
    chooseFormation(c)
    const s = playBattle(deckOf(c), c.cleared, Math.floor(random() * 1e9), { casual })
    if (!s.result) s.result = 'defeat'
    const report = settle(c, s, random)
    time += s.time + MENU_SECONDS
    battles++
    if (!report.victory) defeats++
    log(s, report, c)
  }
  return { c, time, battles, defeats }
}
