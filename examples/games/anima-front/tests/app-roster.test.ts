import { describe, expect, it } from 'vitest'
import { makeLoadout, PRESETS } from '../src/data/loadout'
import { SPECIES, SPECIES_IDS } from '../src/data/species'
import { buildSeats } from '../src/app/match'
import { NAME_POOLS, PRESET_POOLS, pickName, seededRandom } from '../src/app/roster'

const me = {
  id: 'p1',
  name: 'ハヤテ',
  species: 'shiba' as const,
  loadout: makeLoadout(['bee'], ['orca'], ['koala']),
  loadoutName: 'テスト'
}

describe('squad roster', () => {
  it('every animal has unique names led by its ARK member and presets that exist', () => {
    const all = SPECIES_IDS.flatMap((s) => NAME_POOLS[s])
    expect(new Set(all).size).toBe(all.length)
    for (const s of SPECIES_IDS) {
      expect(NAME_POOLS[s][0]).toBe(SPECIES[s].name)
      expect(NAME_POOLS[s].length).toBeGreaterThanOrEqual(4)
      expect(PRESET_POOLS[s][0]).toBe(SPECIES[s].preset)
      for (const p of PRESET_POOLS[s]) expect(PRESETS.some((x) => x.id === p)).toBe(true)
    }
  })

  it('PvP: no numbered names, four different animals per team, teams differ', () => {
    for (let seed = 1; seed < 40; seed++) {
      const seats = buildSeats({ mode: 'pvp' }, { ...me, team: 0 }, [], seed)
      expect(new Set(seats.map((s) => s.name)).size).toBe(12)
      for (const s of seats) expect(s.name).not.toMatch(/[ⅡⅢⅣ0-9]| II/)
      const teams = [0, 1, 2].map((t) =>
        seats
          .filter((s) => s.team === t)
          .map((s) => s.species)
          .sort()
          .join()
      )
      for (const t of teams) expect(new Set(t.split(',')).size).toBe(4)
      expect(new Set(teams).size).toBeGreaterThan(1)
      for (const s of seats.slice(1))
        expect(PRESET_POOLS[s.species].map((id) => PRESETS.find((p) => p.id === id)!.name)).toContain(s.loadoutName)
    }
  })

  it('the PvE squad always includes the player and varies between seeds', () => {
    const squads = new Set<string>()
    for (let seed = 1; seed < 30; seed++) {
      const seats = buildSeats({ mode: 'pve', mission: 'sakura', difficulty: 'normal' }, me, [], seed)
      expect(seats[0]).toMatchObject({ id: 'p1', species: 'shiba', local: true })
      expect(new Set(seats.map((s) => s.species)).size).toBe(4)
      // squad mates are the ARK members of their animals
      for (const s of seats.slice(1)) expect(s.name).toBe(SPECIES[s.species].name)
      squads.add(seats.map((s) => s.species).join())
    }
    expect(squads.size).toBeGreaterThan(5)
  })

  it('is stable for the same selection (a lobby does not reshuffle)', () => {
    const a = buildSeats({ mode: 'pvp' }, me)
    const b = buildSeats({ mode: 'pvp' }, me)
    expect(a.map((s) => `${s.name}/${s.species}/${s.loadoutName}`)).toEqual(
      b.map((s) => `${s.name}/${s.species}/${s.loadoutName}`)
    )
  })

  it('falls back to numbered names only when a pool is exhausted', () => {
    const used = new Set(NAME_POOLS.owl)
    expect(pickName('owl', used, seededRandom(1))).toBe('ソラ2')
  })
})
