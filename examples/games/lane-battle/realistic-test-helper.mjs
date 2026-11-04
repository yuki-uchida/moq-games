import { test } from 'node:test'
import assert from 'node:assert/strict'
import { execFileSync } from 'node:child_process'
import { fileURLToPath } from 'node:url'
import { SPECIALS } from './simulation.js'
import { realisticBarFailures } from './realistic-bars.mjs'

export function testRealistic(stage, policy) {
  test(`stage ${stage} ${policy} formation meets realistic bars`, () => {
    const output = execFileSync(
      process.execPath,
      [fileURLToPath(new URL('./balance-report.mjs', import.meta.url)), `--realistic=${stage}:${policy}`],
      { encoding: 'utf8' }
    )
    const rows = output
      .split('\n')
      .filter((line) => line.startsWith(`${stage}\t${policy}\t`))
      .map((line) => {
        const [, , name, wins, time, summons, blocks] = line.split('\t')
        return {
          name,
          wins: Number.parseInt(wins),
          time: Number(time),
          summons: Number(summons),
          blocks: blocks.split(' ').map((block) => Number.parseInt(block))
        }
      })
    assert.equal(rows.length, SPECIALS.length + 1)
    const baseline = rows[0]
    assert.equal(baseline.name, '基準')
    for (const [index, type] of SPECIALS.entries()) {
      const row = rows[index + 1]
      assert.equal(row.name, type.name)
      assert.ok(Number.isFinite(row.time) && Number.isFinite(row.summons))
    }
    assert.deepEqual(realisticBarFailures(stage, policy, rows, 40), [])
  })
}
