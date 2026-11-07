import { test } from 'node:test'
import { collectRealisticSamples } from './realistic-formations.mjs'
import { testRealistic } from './realistic-test-helper.mjs'

export function testRealisticBattles(stage, policies) {
  test('realistic formations meet all bars', { concurrency: true }, async (parent) => {
    const samples = collectRealisticSamples([8, 15, 22], [22])
    const checks = []
    for (const policy of policies) {
      for (const group of stage === 8 ? ['fresh'] : ['fresh', 'old']) {
        checks.push(testRealistic(parent, samples, stage, policy, group))
      }
    }
    await Promise.all(checks)
  })
}
