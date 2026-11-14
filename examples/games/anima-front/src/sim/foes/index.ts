/**
 * Foes (DESIGN §11): spawning (difficulty and boss scaling, クロヅメ avatars), the per-tick update (spatial hash,
 * spawn/dying states, dome flags, behaviour dispatch) and death side effects (shards, コロガシ chain).
 */
import { FOES, KUROZUME_SQUADS, type FoeKind } from '../../data/enemies'
import { makeLoadout } from '../../data/loadout'
import { dropShards } from '../anima'
import { AVATAR_SKILL, BOSS_DIFFICULTY_SCALE, DT, FOE_DYING_TIME, FOE_SPAWN_TIME } from '../constants'
import { createPlayer } from '../player'
import { emit, FOE_SIDE, type Foe, type Sim } from '../state'
import type { ActorRef } from '../types'
import { r3v, type Vec } from '../vec'
import { foeBehaviour, foeDied } from './behaviours'
import { setState } from './common'

export interface SpawnOpts {
  wave?: number
  passive?: boolean
  yaw?: number
  /** クロヅメ squad loadout index (default: by spawn order). */
  squad?: number
}

export function spawnFoe(sim: Sim, kind: FoeKind, at: Vec, opts: SpawnOpts = {}): Foe {
  const def = FOES[kind]
  let hp = def.hp * (def.boss ? bossDifficultyHp(sim) : sim.diff.hp)
  if (def.boss) hp *= 0.55 + 0.15 * Math.max(1, sim.humans)
  const id = sim.nextFoe++
  const f: Foe = {
    id,
    kind,
    def,
    p: [at[0], at[1], at[2]],
    v: [0, 0, 0],
    yaw: opts.yaw ?? 0,
    hp,
    maxHp: hp,
    state: 'spawn',
    st: 0,
    attack: null,
    aim: null,
    cds: {},
    target: null,
    retargetAt: 0,
    damagers: new Map(),
    revealedUntil: 0,
    shielded: false,
    parts: undefined,
    grounded: !def.flying,
    r: def.radius,
    h: def.height,
    dmgMul: sim.diff.damage,
    avatar: null,
    mem: {},
    memV: [0, 0, 0],
    wave: opts.wave ?? -1,
    passive: opts.passive ?? false,
    dead: false
  }
  if (def.flying && def.hover) f.p[1] = Math.max(f.p[1], def.hover[0])
  if (kind === 'kurozume') {
    const sq = KUROZUME_SQUADS[(opts.squad ?? id) % KUROZUME_SQUADS.length]
    const av = createPlayer(
      sim,
      {
        id: `kz${id}`,
        name: 'クロヅメ兵',
        species: sq.species,
        loadout: makeLoadout(sq.r, sq.l, ['cheetah']),
        team: 0,
        bot: AVATAR_SKILL[sim.cfg.difficulty ?? 'normal'] ?? AVATAR_SKILL.normal
      },
      { p: f.p, yaw: f.yaw },
      FOE_SIDE
    )
    av.foe = f
    f.avatar = av
    f.r = av.r
    f.h = av.h
    f.hp = av.species.anima * sim.diff.hp
    f.maxHp = f.hp
  }
  sim.foes.push(f)
  emit(sim, { type: 'foeSpawn', foe: id, kind, at: r3v(f.p) })
  return f
}

/** Difficulty hp multiplier of bosses (and their parts): half the offset of the regular one. */
export const bossDifficultyHp = (sim: Sim) => 1 + (sim.diff.hp - 1) * BOSS_DIFFICULTY_SCALE

export const liveFoes = (sim: Sim) => sim.foes.reduce((n, f) => n + (f.dead ? 0 : 1), 0)

/** Per-tick update of every foe. */
export function foesTick(sim: Sim) {
  sim.foeHash.clear()
  for (const f of sim.foes) if (!f.dead) sim.foeHash.insert(f, f.p[0], f.p[2])
  // タテガミ domes.
  const domes = sim.foes.filter((g) => g.kind === 'tategami' && !g.dead && g.mem.dome === 1)
  for (const f of sim.foes) {
    f.shielded = false
    if (f.dead || f.def.faction !== 'machine' || !domes.length) continue
    for (const g of domes) {
      const r = g.def.attacks[0].radius ?? 6
      if (Math.hypot(f.p[0] - g.p[0], f.p[2] - g.p[2]) <= r) {
        f.shielded = true
        break
      }
    }
  }
  for (const f of sim.foes) {
    f.st += DT
    if (f.state === 'dying') continue
    if (f.state === 'spawn') {
      if (f.st >= FOE_SPAWN_TIME) setState(f, 'idle')
      else continue
    }
    foeBehaviour(sim, f)
  }
  if (sim.foes.some((f) => f.dead && f.st >= FOE_DYING_TIME)) {
    sim.foes = sim.foes.filter((f) => !(f.dead && f.st >= FOE_DYING_TIME))
  }
}

export { setState } from './common'

/** Death side effects (called by combat.killFoe before the mode hook). */
export function onFoeDeath(sim: Sim, f: Foe, killer: ActorRef | undefined) {
  dropShards(sim, f.p, f.def.drop)
  foeDied(sim, f, killer)
}
