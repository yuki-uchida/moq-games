/**
 * Squad identities for bot seats: every animal has a pool of individual names (the ARK member from DESIGN §4
 * first) and a few presets that suit it, so filled seats read as different animals rather than "ハヤテ II".
 * Pure and seeded: the same lobby always shows the same bots.
 */
import { SPECIES, SPECIES_IDS, type SpeciesId } from '../data/species'

/** Individual names per animal; the first is the ARK member of DESIGN §4. */
export const NAME_POOLS: Record<SpeciesId, readonly string[]> = {
  shiba: ['ハヤテ', 'コテツ', 'アズキ', 'ムサシ', 'ゲンタ', 'ワカバ'],
  cat: ['ミケ', 'ナツメ', 'スズ', 'トラマル', 'シオン', 'ココア'],
  rabbit: ['ユキ', 'モモ', 'ミルク', 'ハル', 'ウタ', 'シラタマ'],
  bear: ['ゴウ', 'ダイチ', 'イワオ', 'モンタ', 'クヌギ', 'ゴロウ'],
  fox: ['コノハ', 'ヨモギ', 'カエデ', 'ツムギ', 'ホムラ', 'キツネビ'],
  penguin: ['ペンタ', 'ナギ', 'フブキ', 'ペコ', 'ヒョウガ', 'ミナト'],
  hamster: ['モチ', 'キナコ', 'ダイフク', 'マメ', 'ゴマ', 'クルミ'],
  owl: ['ソラ', 'ヨル', 'ツキミ', 'フクマル', 'シズク', 'ホシノ']
}

/** Presets that suit each animal (the species default first). */
export const PRESET_POOLS: Record<SpeciesId, readonly string[]> = {
  shiba: ['attacker', 'gunner', 'skirmisher'],
  cat: ['skirmisher', 'attacker', 'sniper'],
  rabbit: ['sniper', 'skirmisher', 'support'],
  bear: ['tank', 'gunner', 'attacker'],
  fox: ['skirmisher', 'support', 'attacker'],
  penguin: ['gunner', 'tank', 'support'],
  hamster: ['support', 'gunner', 'sniper'],
  owl: ['sniper', 'support', 'gunner']
}

/** Small deterministic PRNG (mulberry32): 0..1. */
export function seededRandom(seed: number): () => number {
  let a = seed >>> 0
  return () => {
    a = (a + 0x6d2b79f5) >>> 0
    let t = a
    t = Math.imul(t ^ (t >>> 15), t | 1)
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61)
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

/** Stable 32-bit hash of a string (FNV-1a). */
export function hashString(s: string): number {
  let h = 0x811c9dc5
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i)
    h = Math.imul(h, 0x01000193)
  }
  return h >>> 0
}

export function shuffled<T>(list: readonly T[], rnd: () => number): T[] {
  const out = [...list]
  for (let i = out.length - 1; i > 0; i--) {
    const j = Math.floor(rnd() * (i + 1))
    ;[out[i], out[j]] = [out[j], out[i]]
  }
  return out
}

/**
 * Picks `count` animals for a team: `keep` first (already seated), then a shuffled mix that avoids repeating
 * an animal inside the team and prefers animals other teams have used least.
 */
export function pickTeamSpecies(
  count: number,
  keep: readonly SpeciesId[],
  usedElsewhere: ReadonlyMap<SpeciesId, number>,
  rnd: () => number
): SpeciesId[] {
  const out = [...keep]
  const pool = shuffled(SPECIES_IDS, rnd)
    .filter((s) => !out.includes(s))
    .sort((a, b) => (usedElsewhere.get(a) ?? 0) - (usedElsewhere.get(b) ?? 0))
  for (const s of pool) {
    if (out.length >= count) break
    out.push(s)
  }
  // more seats than animals: repeat (never happens with 4-seat teams)
  while (out.length < count) out.push(SPECIES_IDS[Math.floor(rnd() * SPECIES_IDS.length)])
  return out.slice(keep.length)
}

/** The first unused name of the animal's pool (its ARK member first), or a numbered fallback. */
export function pickName(species: SpeciesId, used: ReadonlySet<string>, rnd: () => number, first = false): string {
  const pool = NAME_POOLS[species]
  if (first && !used.has(pool[0])) return pool[0]
  const free = pool.filter((n) => !used.has(n))
  if (free.length) {
    // the ARK member usually leads; others are mixed so repeated matches meet different animals
    if (!used.has(pool[0]) && rnd() < 0.6) return pool[0]
    return free[Math.floor(rnd() * free.length)]
  }
  for (let n = 2; ; n++) {
    const name = `${SPECIES[species].name}${n}`
    if (!used.has(name)) return name
  }
}

/** A preset suiting the animal, avoiding presets the team already has when possible. */
export function pickPreset(species: SpeciesId, teamPresets: readonly string[], rnd: () => number): string {
  const pool = PRESET_POOLS[species]
  const fresh = pool.filter((p) => !teamPresets.includes(p))
  const from = fresh.length ? fresh : pool
  // the species default is the most likely pick
  if (from[0] === pool[0] && rnd() < 0.5) return pool[0]
  return from[Math.floor(rnd() * from.length)]
}
