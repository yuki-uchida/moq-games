import { expect, test } from 'vitest'
import { careerFor, careerSheets } from '../src/art/careers'
import { sheet } from '../src/art/index'

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
  }
})
