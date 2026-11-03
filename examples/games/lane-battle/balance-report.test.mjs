import { test } from 'node:test'
import assert from 'node:assert/strict'
import { execFileSync } from 'node:child_process'
import { fileURLToPath } from 'node:url'
import { POOPS, SPECIALS } from './simulation.js'

const output = execFileSync(
  process.execPath,
  [fileURLToPath(new URL('./balance-report.mjs', import.meta.url)), '--niche-only'],
  { encoding: 'utf8' }
)

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
  // Lv1 poop floors are the 50-seed means measured with the fixed tick.
  const baseline = [
    [3.64, 9.4, 0],
    [10.42, 13.59, 12.55],
    [9.5, 19.49, 0],
    [19.02, 54.7, 23.53],
    [11.75, 23.93, 19],
    [25.64, 86.82, 46.58]
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
