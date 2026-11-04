import { test } from 'node:test'
import assert from 'node:assert/strict'
import { POOPS, SPECIALS, rng } from './simulation.js'
import { playCampaign } from './bot.js'
import { specialScale, SPECIAL_CATCH_UP } from './campaign.js'
import { collectRealisticSamples, realisticFormation } from './realistic-formations.mjs'

test('realistic decks contain only unlocked, typically owned poops and the special under test', () => {
  const stages = [8, 15, 22]
  const samples = collectRealisticSamples(stages, [22])
  let firstClear
  playCampaign(rng(3), {
    casual: true,
    log: (_battle, report, campaign) => {
      if (!firstClear && report.victory && campaign.cleared === 23)
        firstClear = campaign.roster.map((entry) => ({ ...entry, equipped: campaign.loadout.includes(entry.uid) }))
    }
  })
  assert.deepEqual(samples[22][0], firstClear)
  for (const stage of stages) {
    const baseline = realisticFormation(stage, samples[stage]).deck
    const expected = POOPS.filter(
      (type) =>
        type.unlock <= stage &&
        samples[stage].filter((roster) => roster.some((entry) => entry.key === type.key)).length >= 4
    )
    assert.deepEqual(
      baseline.map((unit) => unit.key),
      expected.map((type) => type.key)
    )
    for (const type of [null, ...SPECIALS]) {
      const { deck, specialIndex } = realisticFormation(stage, samples[stage], type)
      const poops = deck.filter((unit) => POOPS.some((poop) => poop.key === unit.key))
      assert.deepEqual(
        poops.map((unit) => unit.key),
        baseline.map((unit) => unit.key)
      )
      for (const unit of poops) {
        const poop = POOPS.find((entry) => entry.key === unit.key)
        assert.ok(poop.unlock <= stage)
        assert.ok(samples[stage].filter((roster) => roster.some((entry) => entry.key === unit.key)).length >= 4)
        const levels = samples[stage]
          .flatMap((roster) => roster.filter((entry) => entry.key === unit.key).map((entry) => entry.level))
          .sort((a, b) => a - b)
        assert.equal(
          unit.level,
          Math.round((levels[Math.floor((levels.length - 1) / 2)] + levels[Math.floor(levels.length / 2)]) / 2)
        )
      }
      const specials = deck.filter((unit) => SPECIALS.some((entry) => entry.key === unit.key))
      assert.deepEqual(
        specials.map((unit) => unit.key),
        type ? [type.key] : []
      )
      assert.equal(specialIndex, type ? Math.min(4, poops.length) : -1)
      if (type) {
        assert.equal(deck[specialIndex].level, 1)
        assert.equal(deck[specialIndex].hp, Math.round(type.hp * specialScale(stage)))
        assert.equal(deck[specialIndex].atk, Math.round(type.atk * specialScale(stage)))
        assert.equal(deck[specialIndex].period, type.period)
      }
    }
    for (const roster of samples[stage]) {
      for (const entry of roster.filter((unit) => unit.equipped && SPECIALS.some((type) => type.key === unit.key))) {
        const type = SPECIALS.find((unit) => unit.key === entry.key)
        const { deck, specialIndex } = realisticFormation(stage, samples[stage], type, entry)
        assert.equal(deck[specialIndex].level, entry.level)
        assert.equal(deck[specialIndex].hp, entry.hp)
        assert.equal(deck[specialIndex].atk, entry.atk)
        assert.ok(entry.hp >= Math.round(type.hp * specialScale(stage) * SPECIAL_CATCH_UP))
        assert.ok(entry.atk >= Math.round(type.atk * specialScale(stage) * SPECIAL_CATCH_UP))
        assert.equal(deck.filter((unit) => SPECIALS.some((special) => special.key === unit.key)).length, 1)
        assert.deepEqual(
          deck.filter((unit) => unit.uid !== deck[specialIndex].uid).map((unit) => unit.key),
          baseline.map((unit) => unit.key)
        )
        assert.equal(new Set(deck.map((unit) => unit.uid)).size, deck.length)
      }
    }
  }
  assert.deepEqual(
    realisticFormation(8, samples[8]).deck.map((unit) => unit.key),
    ['katachi', 'korokoro', 'geri']
  )
})

test('realistic ownership uses four of six and the median of owners only', () => {
  const samples = Array.from({ length: 6 }, (_, index) => [
    { key: 'katachi', level: index + 1 },
    { key: 'korokoro', level: 1 },
    ...(index < 4 ? [{ key: 'bichi', level: [2, 5, 7, 12][index] }] : []),
    ...(index < 3 ? [{ key: 'dodeka', level: 20 }] : [])
  ])
  const deck = realisticFormation(15, samples).deck
  assert.deepEqual(
    deck.map((unit) => unit.key),
    ['katachi', 'korokoro', 'bichi']
  )
  assert.equal(deck.find((unit) => unit.key === 'bichi').level, 6)
  assert.ok(!realisticFormation(4, samples).deck.some((unit) => unit.key === 'bichi'))
})
