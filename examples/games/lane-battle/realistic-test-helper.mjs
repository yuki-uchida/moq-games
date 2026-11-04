import assert from 'node:assert/strict'
import { execFile } from 'node:child_process'
import { promisify } from 'node:util'
import { fileURLToPath } from 'node:url'
import { SPECIALS } from './simulation.js'
import { realisticBarFailures } from './realistic-bars.mjs'

const run = promisify(execFile)

export function testRealistic(parent, samples, stage, policy, group = '') {
  return parent.test(`stage ${stage} ${policy} ${group} formations meet realistic bars`, async () => {
    const { stdout: output } = await run(
      process.execPath,
      [
        fileURLToPath(new URL('./balance-report.mjs', import.meta.url)),
        `--realistic=${stage}:${policy}:${group}`,
        '--samples-from-env'
      ],
      { encoding: 'utf8', env: { ...process.env, LANE_REALISTIC_SAMPLES: JSON.stringify(samples) } }
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
    const fresh = group === 'old' ? [] : rows.slice(1, SPECIALS.length + 1)
    const old = rows.slice(1 + fresh.length)
    if (group !== 'old') assert.equal(fresh.length, SPECIALS.length)
    if (stage === 8 || group === 'fresh') assert.equal(old.length, 0)
    else assert.ok(old.length > 0 && old.every((row) => row.name.startsWith('旧加入')))
    const baseline = rows[0]
    assert.equal(baseline.name, '基準')
    for (const [index, row] of fresh.entries()) assert.equal(row.name, SPECIALS[index].name)
    for (const row of rows.slice(1)) {
      assert.ok(Number.isFinite(row.time) && Number.isFinite(row.summons))
    }
    assert.deepEqual(realisticBarFailures(stage, policy, rows, 40), [])
  })
}
