import { describe, it } from 'vitest'
import { playCampaign } from './campaign-play'

describe('Rabbiters seasons campaign', () => {
  it('plays the whole campaign among predators within an hour (seed 3)', () => playCampaign(3), 300_000)
})
