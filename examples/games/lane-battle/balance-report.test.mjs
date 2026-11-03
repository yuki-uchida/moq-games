import { test } from 'node:test'
import assert from 'node:assert/strict'
import { execFileSync } from 'node:child_process'
import { fileURLToPath } from 'node:url'
import { POOPS, SPECIALS } from './simulation.js'

const output = execFileSync(process.execPath, [fileURLToPath(new URL('./balance-report.mjs', import.meta.url))], {
  encoding: 'utf8'
})

test('niche report keeps specials useful and preserves the Lv1 poop baseline', () => {
  const table = output
    .split('ニッチ測定:')[1]
    .split('\n')
    .slice(2, 2 + POOPS.length + SPECIALS.length)
  assert.equal(table.length, POOPS.length + SPECIALS.length)
  const rows = table.map((line) => {
    const [name, cost, ...scenarios] = line.split('\t')
    const cleared = scenarios.map((scenario) => Number.parseFloat(scenario))
    assert.equal(cleared.length, 3)
    assert.ok(cleared.every(Number.isFinite))
    return { name, cost: Number(cost), cleared }
  })
  const baseline = [
    [3.64, 9.4, 0],
    [10.42, 13.59, 12.55],
    [9.5, 19.49, 0],
    [19.02, 56.55, 23.53],
    [11.75, 29.59, 19],
    [25.64, 88.28, 46.58]
  ]
  for (const [index, unit] of POOPS.entries()) {
    assert.equal(rows[index].name, unit.name)
    for (const [scenario, value] of rows[index].cleared.entries()) {
      assert.ok(value >= baseline[index][scenario], `${unit.name} scenario ${scenario}`)
    }
  }
  const specials = rows.slice(POOPS.length)
  const medians = [0, 1, 2].map((scenario) => {
    const values = specials.map((row) => row.cleared[scenario] / row.cost).sort((a, b) => a - b)
    return (values[5] + values[6]) / 2
  })
  for (const [index, unit] of SPECIALS.entries()) {
    const row = specials[index]
    assert.equal(row.name, unit.name)
    assert.equal(row.cost, unit.cost)
    assert.ok(
      row.cleared.some((value, scenario) => value / row.cost >= medians[scenario]),
      unit.name
    )
    assert.ok(unit.cost >= 200 || row.cleared.some((value) => value < 100), unit.name)
  }
  for (let scenario = 0; scenario < 3; scenario++) {
    const perCost = specials.map((row) => row.cleared[scenario] / row.cost)
    assert.ok(Math.max(...perCost) <= 2 * Math.min(...perCost), `scenario ${scenario}`)
  }
})

test('every special wins reliably and is summoned in the realistic formation', () => {
  const formation = output
    .split('実戦編成:')[1]
    .split('\n')
    .slice(2, 3 + SPECIALS.length)
  assert.equal(formation.length, SPECIALS.length + 1)
  const [baselineName, baselineWins, baselineTime, baselineSummons] = formation[0].split('\t')
  assert.equal(baselineName, 'なし')
  assert.match(baselineWins, /^(?:[0-9]|[1-3][0-9]|40)\/40$/)
  assert.ok(Number.isFinite(Number(baselineTime)))
  assert.equal(Number(baselineSummons), 0)
  const regressions = []
  for (const [index, row] of formation.slice(1).entries()) {
    const [name, winsText, timeText, summonsText] = row.split('\t')
    assert.equal(name, SPECIALS[index].name)
    assert.match(winsText, /^(?:[0-9]|[1-3][0-9]|40)\/40$/)
    const wins = Number.parseFloat(winsText)
    const time = Number.parseFloat(timeText)
    const summons = Number(summonsText)
    assert.ok(Number.isFinite(time) && Number.isFinite(summons), name)
    if (wins < 34 || summons < 1) regressions.push(`${name}: ${winsText}, ${summons} summons`)
  }
  assert.deepEqual(regressions, [])
})
