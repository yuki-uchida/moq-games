import { expect, test } from 'vitest'
import { careerFor, careerSheets } from '../src/art/careers'
import { sheet } from '../src/art/index'
import { rankedCareer } from '../src/careers'
import { MAX_WEAPON_LEVEL, PARENTS, PASSIVES, TALENT_WEAPONS } from '../src/data'

const appearances: Record<string, string> = {
  w_friend: 'social',
  w_sns: 'social',
  w_pet: 'social',
  w_love: 'romantic',
  w_beauty: 'romantic',
  w_ring: 'romantic',
  w_perfume: 'romantic',
  w_hobby: 'creative',
  w_karaoke: 'creative',
  w_travel: 'creative',
  w_cooking: 'creative',
  w_sports: 'soccer',
  w_muscle: 'soccer',
  w_study: 'bureaucrat',
  w_reading: 'bureaucrat',
  w_work: 'bureaucrat',
  w_overtime: 'bureaucrat',
  w_invest: 'entrepreneur',
  w_savings: 'entrepreneur',
  w_gamble: 'entrepreneur'
}

test('all twenty talents require owned Lv4; evolution only boosts owned maximum-level weapons', () => {
  expect(Object.keys(appearances).sort()).toEqual(TALENT_WEAPONS.map(({ id }) => id).sort())
  for (const weapon of TALENT_WEAPONS) {
    for (let level = 1; level <= MAX_WEAPON_LEVEL; level++) {
      const passives: [string, number][] = [[weapon.evolve!.passive, 1]]
      expect(careerFor({ weapons: [[weapon.id, level, 999999]], passives })).toBe(
        level >= 4 ? appearances[weapon.id] : undefined
      )
    }
    const competitor = TALENT_WEAPONS.find(
      (other) => appearances[other.id] !== appearances[weapon.id] && other.evolve!.passive !== weapon.evolve!.passive
    )!
    const weapons: [string, number, number][] = [
      [competitor.id, 8, 0],
      [weapon.id, 7, 0]
    ]
    expect(careerFor({ weapons, passives: [[weapon.evolve!.passive, 1]] })).toBe(appearances[competitor.id])
    weapons[1][1] = 8
    expect(careerFor({ weapons, passives: [[weapon.evolve!.passive, 1]] })).toBe(appearances[weapon.id])
    expect(careerFor({ weapons, passives: [[weapon.evolve!.passive, 0]] })).toBe(
      appearances[TALENT_WEAPONS.find((entry) => weapons.some(([id]) => id === entry.id))!.id]
    )
  }
  expect(
    careerFor({ weapons: PARENTS.map(({ id }) => [id, 8, 0]), passives: PASSIVES.map(({ id }) => [id, 5]) })
  ).toBeUndefined()
  expect(careerFor({ weapons: [], passives: PASSIVES.map(({ id }) => [id, 5]) })).toBeUndefined()
})

test('ties use definition order for every pair, regardless of inventory order', () => {
  for (const [index, first] of TALENT_WEAPONS.entries()) {
    for (const second of TALENT_WEAPONS.slice(index + 1)) {
      const weapons: [string, number, number][] = [
        [second.id, 4, 0],
        [first.id, 4, 0]
      ]
      expect(careerFor({ weapons, passives: [] })).toBe(appearances[first.id])
      expect(careerFor({ weapons: weapons.reverse(), passives: [] })).toBe(appearances[first.id])
    }
  }
})

test('new styles never rank for career events, even evolved or explicitly eligible', () => {
  const existing = ['soccer', 'bureaucrat', 'entrepreneur'] as const
  for (const weapon of TALENT_WEAPONS.filter(
    ({ id }) => !existing.includes(appearances[id] as (typeof existing)[number])
  )) {
    const passives: [string, number][] = [[weapon.evolve!.passive, 1]]
    expect(rankedCareer([[weapon.id, 8]], passives)).toBeUndefined()
    for (const [id, career] of [
      ['w_work', 'bureaucrat'],
      ['w_sports', 'soccer'],
      ['w_invest', 'entrepreneur']
    ] as const) {
      expect(
        rankedCareer(
          [
            [weapon.id, 8],
            [id, 4]
          ],
          passives,
          existing
        )
      ).toBe(career)
      expect(
        rankedCareer(
          [
            [weapon.id, 8],
            [id, 4]
          ],
          passives,
          []
        )
      ).toBeUndefined()
    }
  }
})

test('weapon replacement immediately removes old styles and does not borrow other participants weapons', () => {
  const players: { weapons: [string, number, number][]; passives: [string, number][] }[] = [
    { weapons: [['w_friend', 8, 0]], passives: [['p_kind', 1]] },
    { weapons: [['w_love', 8, 0]], passives: [['p_stubborn', 1]] },
    { weapons: [['w_hobby', 8, 0]], passives: [['p_optimist', 1]] }
  ]
  expect(JSON.parse(JSON.stringify(players)).map(careerFor)).toEqual(['social', 'romantic', 'creative'])
  players[0].weapons = [['w_cooking', 1, 0]]
  expect(players.map(careerFor)).toEqual([undefined, 'romantic', 'creative'])
  players[0].weapons[0][1] = 4
  expect(players.map(careerFor)).toEqual(['creative', 'romantic', 'creative'])
})

test('careers reflect training, evolution and stable ties, never accumulated damage', () => {
  expect(careerFor({ weapons: [['w_sports', 3, 999999]], passives: [] })).toBeUndefined()
  expect(careerFor({ weapons: [['p_rich', 8, 0]], passives: [] })).toBeUndefined()
  expect(careerFor({ weapons: [['w_sports', 4, 0]], passives: [] })).toBe('soccer')
  expect(careerFor({ weapons: [['w_study', 5, 0]], passives: [] })).toBe('bureaucrat')
  expect(careerFor({ weapons: [['w_invest', 6, 0]], passives: [] })).toBe('entrepreneur')
  const weapons: [string, number, number][] = [
    ['w_invest', 8, 0],
    ['w_sports', 8, 0]
  ]
  expect(careerFor({ weapons, passives: [] })).toBe('soccer')
  expect(careerFor({ weapons: [...weapons].reverse(), passives: [] })).toBe('soccer')
  expect(careerFor({ weapons, passives: [['p_greedy', 1]] })).toBe('entrepreneur')
})

test('co-op snapshots independently select each participant appearance', () => {
  const players = JSON.parse(
    JSON.stringify([
      { weapons: [['w_sports', 5, 0]], passives: [] },
      { weapons: [['w_work', 5, 0]], passives: [] },
      { weapons: [['w_invest', 5, 0]], passives: [] }
    ])
  )
  expect(players.map(careerFor)).toEqual(['soccer', 'bureaucrat', 'entrepreneur'])
})

test('every career uses complete age-specific idle, walk and hurt frames', () => {
  for (const id of Object.keys(careerSheets)) {
    const dressed = sheet(id)
    const original = sheet(id.split(':').slice(0, 2).join(':'))
    expect(Object.keys(dressed).sort()).toEqual(['hurt', 'idle', 'walk'])
    for (const anim of Object.values(dressed)) {
      for (const frame of anim.frames) {
        expect([frame.w, frame.h]).toEqual([64, 64])
        expect(frame.data.some((pixel) => pixel !== 0)).toBe(true)
      }
    }
    expect(dressed.idle.frames[0].data).not.toEqual(original.idle.frames[0].data)
    for (const name of ['idle', 'walk', 'hurt'] as const) {
      const reference = sheet(`${id.split(':').slice(0, 2).join(':')}:soccer`)[name]
      expect({ ...dressed[name], frames: dressed[name].frames.length }).toEqual({
        ...reference,
        frames: reference.frames.length
      })
    }
  }
})
