/** Mode controller factory. */
import type { ModeCtl } from '../state'
import type { MatchConfig } from '../types'
import { createPve } from './pve'
import { createPvp } from './pvp'
import { createTraining } from './training'

export function createMode(cfg: MatchConfig): ModeCtl {
  if (cfg.mode === 'pvp') return createPvp(cfg)
  if (cfg.mode === 'training') return createTraining(cfg)
  return createPve(cfg)
}
