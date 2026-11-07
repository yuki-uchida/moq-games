import { describe } from 'vitest'
import { registerPartitionInvariance } from './main-clock-fixture'

describe('actual main/peer clock with existing broker, no browser or I/O', () => {
  registerPartitionInvariance('varying')
})
