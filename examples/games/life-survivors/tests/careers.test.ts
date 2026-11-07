import { createHash } from 'node:crypto'
import { expect, test } from 'vitest'
import { careerFor, careerSheets } from '../src/art/careers'
import { sheet } from '../src/art/index'
import { rankedCareer } from '../src/careers'
import { MAX_WEAPON_LEVEL, PARENTS, PASSIVES, TALENT_WEAPONS, stageAt, timeAtAge } from '../src/data'
import { R } from '../src/art/palette'
import { CASUAL_PRIME, PRIME, STAGE_BODIES } from '../src/art/people'
import { ADULT, CASUAL_ADULT } from '../src/art/player'
import { lying } from '../src/art/rig'
import { bodyFor } from '../src/render'

const appearances: Record<string, string> = {
  w_friend: 'social',
  w_sns: 'social',
  w_pet: 'social',
  w_love: 'romantic',
  w_beauty: 'romantic',
  w_ring: 'romantic',
  w_perfume: 'romantic',
  w_hobby: 'creative',
  w_observe: 'creative',
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

test('adult and prime dedicated outfits retain their original pixels', () => {
  const hash = createHash('sha256')
  for (const body of ['adult', 'prime'])
    for (const style of ['soccer', 'bureaucrat', 'entrepreneur', 'social', 'romantic', 'creative'])
      for (const animation of Object.values(sheet(`player:${body}:${style}`)))
        for (const frame of animation.frames) hash.update(frame.data)
  expect(hash.digest('hex')).toMatchInlineSnapshot(`"a9320a487ee190121be035103c9110886e6987b047f50e81a40087ed1ad92779"`)
})

test.each([
  ['adult', ADULT, CASUAL_ADULT],
  ['prime', PRIME, CASUAL_PRIME]
] as const)('%s keeps its age-specific anatomy in casual clothes, including downed poses', (body, original, casual) => {
  for (const key of [
    'head',
    'headAt',
    'hip',
    'thigh',
    'shin',
    'legW',
    'gap',
    'torsoH',
    'span',
    'upper',
    'fore',
    'armW',
    'hang'
  ] as const)
    expect(casual[key]).toEqual(original[key])
  expect(CASUAL_ADULT.head).not.toBe(CASUAL_PRIME.head)
  expect(casual.item).toBeUndefined()
  expect(casual.behind).toBeUndefined()
  expect(casual.lie.coat).toBe(R.sky)
  expect(casual.lie.detail).toBeUndefined()
  for (const animation of Object.values(sheet(`player:${body}`)))
    for (const frame of animation.frames) {
      expect(frame.data.includes(R.sky[1])).toBe(true)
      expect(frame.data.includes(R.red[1])).toBe(false)
    }
  expect(lying(casual).data.includes(R.sky[1])).toBe(true)
  expect(sheet(`death:${body}`).collapse.frames.some((frame) => frame.data.includes(R.sky[1]))).toBe(true)
  expect(STAGE_BODIES.prime).toBe(CASUAL_PRIME)
})

test('age boundaries and each participants current loadout select standard or dedicated outfits independently', () => {
  const host = { weapons: [['w_work', 3, 0]] as [string, number, number][], passives: [] }
  const guest = { weapons: [['w_sports', 4, 0]] as [string, number, number][], passives: [] }
  for (const [age, expectedBody] of [
    [22.99, 'college'],
    [23, 'adult'],
    [34.99, 'adult'],
    [35, 'prime'],
    [49.99, 'prime'],
    [50, 'middle']
  ] as const) {
    const body = bodyFor(stageAt(timeAtAge(age)))
    expect(body).toBe(expectedBody)
    const appearance = (player: typeof host) => {
      const style = careerFor(player)
      return sheet(`player:${body}${style ? `:${style}` : ''}`)
    }
    expect(appearance(host)).toBe(sheet(`player:${body}`))
    expect(appearance(guest)).toBe(sheet(`player:${body}:soccer`))
    host.weapons[0][1] = 4
    expect(appearance(host)).toBe(sheet(`player:${body}:bureaucrat`))
    host.weapons = [['w_hobby', 1, 0]]
    expect(appearance(host)).toBe(sheet(`player:${body}`))
    expect(appearance(guest)).toBe(sheet(`player:${body}:soccer`))
    host.weapons = [['w_work', 3, 0]]
  }
})

test.each(['w_hobby', 'w_karaoke', 'w_travel', 'w_cooking'])(
  '%s joins career ranking at Lv4 without changing appearance ranking',
  (weapon) => {
    expect(rankedCareer([[weapon, 3]], [])).toBeUndefined()
    expect(rankedCareer([[weapon, 4]], [])).toBe('creative')
    expect(rankedCareer([[weapon, 8]], [], [])).toBeUndefined()
    expect(careerFor({ weapons: [[weapon, 4, 0]], passives: [] })).toBe('creative')
  }
)

test('all talents require owned Lv4; evolution only boosts owned maximum-level weapons', () => {
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

test('appearance-only styles never rank for career events, even evolved or explicitly eligible', () => {
  const existing = ['soccer', 'bureaucrat', 'entrepreneur', 'creative', 'social'] as const
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
