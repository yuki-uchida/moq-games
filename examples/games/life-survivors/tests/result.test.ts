import { expect, test } from 'vitest'
import { talentRadarPoints } from '../src/result'

test('talent radar follows the six talent categories and scales to the maximum', () => {
  expect(talentRadarPoints({ friend: 1.7, love: 0, sports: 0, hobby: 0, study: 0, invest: 0 })).toBe(
    '150.0,30.0 150.0,130.0 150.0,130.0 150.0,130.0 150.0,130.0 150.0,130.0'
  )
})
