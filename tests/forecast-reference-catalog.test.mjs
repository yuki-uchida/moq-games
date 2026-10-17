import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { createHash } from 'node:crypto'
import { alignForecastReferenceCatalog } from '../scripts/forecast-reference-catalog.mjs'
const reference = readFileSync('tests/performance/forecast-baseline/model.ts', 'utf8')
const current = readFileSync('examples/games/tower_diffence_with_jev/src/game/model.ts', 'utf8')
const strip = (source) =>
  source
    .replace(/export const ENEMY_TYPES = \[[\s\S]*?\] as const/, 'ENEMY_TYPES')
    .replace(/export const ENEMY_MELEE_TYPES:[\s\S]*?(?=export function isEnemyMelee)/, 'ENEMY_MELEE_TYPES')
    .replace(
      /export const DEFINITIONS: Record<UnitType, UnitDefinition> = \{[\s\S]*?(?=export type FieldId)/,
      'DEFINITIONS'
    )
test('only aligns declarative catalogs and preserves the hashed forecast oracle', () => {
  const aligned = alignForecastReferenceCatalog(reference, current)
  assert.equal(strip(aligned), strip(reference))
  for (const id of ['crystalSentinel', 'koboldLancer', 'clockworkPatchling']) assert.ok(aligned.includes(id))
  assert.equal(alignForecastReferenceCatalog(aligned, current), aligned)
  const manifest = JSON.parse(readFileSync('tests/performance/forecast-baseline/manifest.json', 'utf8'))
  assert.equal(createHash('sha256').update(reference).digest('hex'), manifest.sha256['model.ts'])
})
test('fails closed on absent or ambiguous registry boundaries', () => {
  assert.throws(() => alignForecastReferenceCatalog('', current), /catalog start/)
  assert.throws(() => alignForecastReferenceCatalog(reference + '\nexport const ENEMY_TYPES = [', current), /Ambiguous/)
  assert.throws(
    () => alignForecastReferenceCatalog(reference, current.replace('export type FieldId', 'export type Missing')),
    /catalog end/
  )
})
