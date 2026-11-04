import { test } from 'node:test'
import assert from 'node:assert/strict'
import { STAGES, SPECIALS, rng, typeOf, createGame } from './simulation.js'
import {
  newCampaign,
  addEntry,
  levelUp,
  toggle,
  buy,
  settle,
  load,
  save,
  deckOf,
  SLOTS,
  GROWTH,
  specialScale
} from './campaign.js'
import { playBattle, playCampaign } from './bot.js'

test('a new campaign owns the two starter poops in its formation', () => {
  const c = newCampaign()
  assert.deepEqual(
    c.roster.map((e) => e.key),
    ['katachi', 'korokoro']
  )
  assert.deepEqual(
    deckOf(c).map((d) => d.cost),
    [35, 65]
  )
})

test('formation holds at most six units and never empties', () => {
  const c = newCampaign()
  for (const t of SPECIALS.slice(0, 6)) addEntry(c, t.key, 3)
  assert.equal(c.loadout.length, SLOTS)
  const extra = c.roster.at(-1)
  assert.equal(toggle(c, extra.uid), false, 'full')
  assert.ok(toggle(c, c.loadout[0]))
  assert.ok(toggle(c, extra.uid))
  const solo = newCampaign()
  toggle(solo, solo.loadout[0])
  assert.equal(toggle(solo, solo.loadout[0]), false)
})

test('poops are bought with 🧻 once unlocked', () => {
  const c = newCampaign()
  c.coins = 1000
  assert.equal(buy(c, 'geri'), false, 'locked before the first clear')
  c.cleared = 1
  assert.ok(buy(c, 'geri'))
  assert.equal(c.coins, 850)
  assert.equal(buy(c, 'geri'), false, 'owned')
  assert.equal(buy(c, 'ramen'), false, 'specials are not for sale')
})

test('poops grow reliably; specials start stronger and can grow', () => {
  const random = rng(5)
  const c = newCampaign()
  const poop = c.roster[0]
  const special = addEntry(c, 'ramen', 10)
  assert.ok(special.hp > poop.hp && special.atk > poop.atk, 'special starts stronger')
  const grown = { poop: { hp: 0, blank: 0 }, special: { hp: 0, blank: 0 } }
  for (let i = 0; i < 400; i++)
    for (const [kind, e] of [
      ['poop', { ...poop }],
      ['special', { ...special }]
    ]) {
      const g = levelUp(e, random)
      grown[kind].hp += g.hp > 0
      grown[kind].blank += !g.hp && !g.atk && !g.spd
    }
  assert.equal(grown.poop.blank, 0, 'a poop level always grows something')
  assert.ok(grown.special.blank > 0, 'specials can have empty levels')
  assert.ok(grown.poop.hp / 400 > GROWTH.poop.hp - 0.06)
  assert.ok(Math.abs(grown.special.hp / 400 - GROWTH.special.hp) < 0.08)
})

test('special joining strength follows the stage and keeps early scaling unchanged', () => {
  assert.equal(specialScale(0), 1)
  assert.equal(specialScale(15), 1.45)
  assert.equal(specialScale(22), 3.62)
  assert.ok(GROWTH.special.hp > 0.22 && GROWTH.special.hp < GROWTH.poop.hp)
  assert.ok(GROWTH.special.atk > 0.2 && GROWTH.special.atk < GROWTH.poop.atk)
})

test('victory pays EXP, 🧻 and a random special on the first clear only', () => {
  const c = newCampaign()
  const game = playBattle(deckOf(c), 0)
  assert.equal(game.result, 'victory')
  const report = settle(c, game, rng(1))
  assert.ok(report.first && report.coins > 0)
  assert.ok(typeOf(report.special.key).special)
  assert.equal(c.cleared, 1)
  assert.ok(report.units.every((u) => u.exp > 0))
  assert.ok(c.roster[0].level > 1)
  const replay = settle(c, { ...playBattle(deckOf(c), 0), deck: game.deck }, rng(2))
  assert.equal(replay.special, null)
  assert.equal(c.cleared, 1)
  assert.ok(replay.coins < report.coins)
})

test('defeat keeps kill EXP but gives no clear bonus or reward', () => {
  const c = newCampaign()
  const game = createGame(0, deckOf(c))
  game.result = 'defeat'
  game.exp = { 1: 30 }
  const report = settle(c, game, rng(1))
  assert.equal(report.coins, 0)
  assert.equal(report.special, null)
  assert.equal(report.units[0].exp, 30)
  assert.equal(report.units[1].exp, 0)
})

test('each battle grants at most two levels and carries excess EXP forward', () => {
  const c = newCampaign()
  const game = createGame(0, deckOf(c))
  game.result = 'defeat'
  game.exp = { 1: 1000 }
  const first = settle(c, game, rng(1))
  assert.equal(first.units[0].ups.length, 2)
  assert.equal(c.roster[0].level, 3)
  assert.equal(c.roster[0].exp, 1000 - 110 - 140)
  game.exp = {}
  const second = settle(c, game, rng(2))
  assert.equal(second.units[0].ups.length, 2)
  assert.equal(c.roster[0].level, 5)
  assert.equal(c.roster[0].exp, 1000 - 110 - 140 - 170 - 200)
})

test('save data round-trips and survives corruption', () => {
  const store = new Map()
  const storage = {
    getItem: (k) => store.get(k) ?? null,
    setItem: (k, v) => store.set(k, v),
    removeItem: (k) => store.delete(k)
  }
  const c = newCampaign()
  addEntry(c, 'jiro', 4)
  c.coins = 77
  save(c, storage)
  assert.deepEqual(load(storage), c)
  store.set([...store.keys()][0], '{broken')
  assert.equal(load(storage).roster.length, 2)
})

test('a human-paced player clears all 30 stages in under two hours', () => {
  // One tap per second, random ready card, partial 腸活, late 大放屁, plus MENU_SECONDS in the 作戦室 per battle.
  const minutes = [3, 11, 29, 42, 77, 101].map((seed) => {
    const { c, time } = playCampaign(rng(seed), { casual: true })
    assert.equal(c.cleared, STAGES.length, `seed ${seed}`)
    const specials = c.roster.filter((e) => typeOf(e.key).special).length
    assert.ok(
      specials >= 3 && specials <= 18,
      `seed ${seed}: ${specials} specials joined in ${STAGES.length} first clears`
    )
    assert.ok(time / 60 > 90 && time / 60 < 150, `seed ${seed}: ${(time / 60).toFixed(1)} min`)
    return time / 60
  })
  const mean = minutes.reduce((a, b) => a + b) / minutes.length
  assert.ok(mean > 95 && mean < 135, `mean ${mean.toFixed(1)} min`)
})

test('a greedy player also finishes the campaign', () => {
  const { c, time } = playCampaign(rng(11))
  assert.equal(c.cleared, STAGES.length)
  assert.ok(time / 60 > 80 && time / 60 < 150, `${(time / 60).toFixed(1)} min`)
})

test('growth matters: an unleveled starter army cannot take the final stage', () => {
  assert.notEqual(playBattle(deckOf(newCampaign()), STAGES.length - 1, 1, { maxTime: 600 }).result, 'victory')
})
