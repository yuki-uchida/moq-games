import { test } from 'node:test'
import assert from 'node:assert/strict'
import { execFileSync } from 'node:child_process'
import { fileURLToPath } from 'node:url'
import { SPECIALS } from './simulation.js'

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
        return { name, wins: Number.parseInt(wins), time: Number(time), summons: Number(summons), blocks }
      })
    assert.equal(rows.length, SPECIALS.length + 1)
    const baseline = rows[0]
    assert.equal(baseline.name, 'ドデカ')
    const failures = []
    for (const [index, type] of SPECIALS.entries()) {
      const row = rows[index + 1]
      assert.equal(row.name, type.name)
      assert.ok(Number.isFinite(row.time) && Number.isFinite(row.summons))
      const minimum = baseline.wins >= 57 ? 54 : baseline.wins - 9
      if (row.wins < minimum || (policy === 'keep' && row.summons < 1))
        failures.push(`${stage} ${policy} ${row.name}: ${row.wins}/60, ${row.summons} summons; minimum ${minimum}`)
      if (baseline.wins >= 57 && Number.parseInt(row.blocks) < 34)
        failures.push(`${stage} ${policy} ${row.name}: first block ${row.blocks}`)
    }
    assert.deepEqual(failures, [])
  })
}
