import { expect, test } from 'vitest'
import { resultCategories, talentRadarPoints } from '../src/result'

test('talent radar follows the six talent categories and scales to the maximum', () => {
  expect(talentRadarPoints({ friend: 1.7, love: 0, sports: 0, hobby: 0, study: 0, invest: 0 })).toBe(
    '150.0,30.0 150.0,130.0 150.0,130.0 150.0,130.0 150.0,130.0 150.0,130.0'
  )
})

test('result categories group weapons and personalities independently in radar order', () => {
  const groups = resultCategories({
    weapons: [
      ['w_invest', 8, 123],
      ['w_study', 3, 42]
    ],
    passives: [
      ['p_greedy', 2],
      ['p_kind', 1]
    ]
  })
  expect(groups.map(({ category }) => category)).toEqual(['friend', 'love', 'sports', 'hobby', 'study', 'invest'])
  expect(groups[0].passives).toEqual([['p_kind', 1]])
  expect(groups[1].weapons).toEqual([])
  expect(groups[4].weapons).toEqual([['w_study', 3, 42]])
  expect(groups[5].weapons).toEqual([['w_invest', 8, 123]])
  expect(groups[5].passives).toEqual([['p_greedy', 2]])
})
