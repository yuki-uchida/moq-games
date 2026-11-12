/** Placeholder until the sim is implemented (owned by the sim workstream). */
import type { World } from './api'
import type { MatchConfig } from './types'

export function createWorld(config: MatchConfig): World {
  throw new Error(`createWorld(${config.mode}) is not implemented yet`)
}
