// A simple reference player for balance tests: greedy summons, early 腸活, 大放屁 when the tower is threatened.
import { createGame, summon, step, upgrade, upgradeCost, burst, STAGES, POOPS, card, typeOf } from './simulation.js'
import { newCampaign, settle, buy, deckOf, SLOTS } from './campaign.js'

export function playBattle(deck, stage, seed = 1, { maxTime = 900 } = {}) {
  const s = createGame(stage, deck, seed)
  const order = deck.map((_, i) => i).sort((a, b) => deck[b].cost - deck[a].cost)
  while (!s.result && s.time < maxTime) {
    if (s.level < 3 && s.gold >= upgradeCost(s) + 30) upgrade(s)
    for (const i of order) summon(s, i)
    if (s.units.some((u) => u.side === -1 && u.x > 650)) burst(s)
    step(s, 0.05)
  }
  return s
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

/** Plays the campaign in order, retrying (and so grinding EXP) on defeat. */
export function playCampaign(random, { tries = 200, log = () => {} } = {}) {
  const c = newCampaign()
  let time = 0,
    battles = 0,
    defeats = 0
  while (c.cleared < STAGES.length && battles < tries) {
    for (const t of POOPS) buy(c, t.key)
    chooseFormation(c)
    const s = playBattle(deckOf(c), c.cleared, Math.floor(random() * 1e9))
    if (!s.result) s.result = 'defeat'
    const report = settle(c, s, random)
    time += s.time
    battles++
    if (!report.victory) defeats++
    log(s, report, c)
  }
  return { c, time, battles, defeats }
}
