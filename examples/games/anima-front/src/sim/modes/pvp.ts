/**
 * 三つ巴演習 (DESIGN §12): three teams on the arena, 6:00 by default. A KO scores +1 for the team that dealt the
 * last damage within 10 s (+2 during the last 60 s, ラストスパート). KO'd animals warp out at once and respawn
 * after 5 s with 2 s of protection. Team bases regenerate +12/s and hurt intruders 20/s. A tie at the top plays
 * 60 s of sudden death (first KO by a tied team wins), then a draw. MVP: most KOs (then assists, damage).
 */
import { PVP_RADIO } from '../../data/missions'
import { heal } from '../anima'
import { damagePlayer } from '../combat'
import {
  BASE_INTRUDER_DPS,
  BASE_REGEN,
  DEFAULT_PVP_DURATION,
  DT,
  PVP_LAST_SPURT,
  PVP_PROTECT,
  PVP_RESPAWN,
  PVP_SUDDEN_DEATH
} from '../constants'
import { addProp } from '../props'
import { respawn, spawnPoints, warpAway } from '../player'
import { emit, isOver, type ModeCtl, type Player, type Sim } from '../state'
import type { ActorRef, MatchConfig, PvpView, TeamId } from '../types'
import { hdist, type Vec } from '../vec'
import { anchor, setPhase } from './common'

export function createPvp(cfg: MatchConfig): ModeCtl {
  const duration = cfg.duration ?? DEFAULT_PVP_DURATION
  const scores: [number, number, number] = [0, 0, 0]
  let started = -1
  let lastSpurt = false
  let sudden = false
  let suddenAt = 0
  let tied: TeamId[] = []
  let winner: TeamId | -1 | undefined
  let mvp: string | undefined
  /** Last base that hurt each player (scores the base's team if nobody else did damage). */
  const baseHit = new Map<string, { team: TeamId; t: number }>()

  const bases = (sim: Sim) => sim.map.bases.filter((b) => typeof b.team === 'number')

  function finish(sim: Sim, w: TeamId | -1) {
    winner = w
    let best: Player | undefined
    for (const p of sim.players) {
      const s = p.stats
      const b = best?.stats
      if (
        !b ||
        s.kos > b.kos ||
        (s.kos === b.kos && (s.assists > b.assists || (s.assists === b.assists && s.damage > b.damage)))
      )
        best = p
    }
    mvp = best?.id
    setPhase(sim, w === -1 ? 'draw' : 'victory')
  }

  const ctl: ModeCtl = {
    start(sim) {
      for (const b of bases(sim)) addProp(sim, 'base', b.p, 0, b.team as number, { r: b.r })
    },

    update(sim) {
      if (isOver(sim)) return
      if (started < 0) {
        started = sim.time
        emit(sim, { type: 'radio', who: PVP_RADIO.start.who, text: PVP_RADIO.start.text })
      }
      const left = duration - (sim.time - started)
      if (!lastSpurt && left <= PVP_LAST_SPURT) {
        lastSpurt = true
        emit(sim, { type: 'lastSpurt' })
        emit(sim, { type: 'radio', who: PVP_RADIO.lastSpurt.who, text: PVP_RADIO.lastSpurt.text })
      }
      // Bases: regenerate own team, hurt intruders (0.25 s chunks).
      const chunk = sim.tick % 15 === 0
      for (const p of sim.players) {
        if (p.state !== 'alive') continue
        for (const b of bases(sim)) {
          if (hdist(p.p, b.p) > b.r || Math.abs(p.p[1] - b.p[1]) > 4) continue
          if (b.team === p.team) heal(sim, p, BASE_REGEN * DT, 'base')
          else if (chunk) {
            baseHit.set(p.id, { team: b.team as TeamId, t: sim.time })
            damagePlayer(sim, p, {
              amount: BASE_INTRUDER_DPS * 0.25,
              kind: 'hazard',
              side: b.team as number,
              at: [p.p[0], p.p[1] + p.h * 0.5, p.p[2]],
              from: [b.p[0], b.p[1], b.p[2]]
            })
          }
        }
      }
      // Respawns.
      for (const p of sim.players) {
        if (p.state !== 'away') continue
        p.timer -= DT
        if (p.timer <= 0) respawn(sim, p, ctl.spawnFor(sim, p), PVP_PROTECT)
      }
      if (!sudden && left <= 0) {
        const top = Math.max(...scores)
        tied = ([0, 1, 2] as TeamId[]).filter((t) => scores[t] === top && sim.players.some((p) => p.team === t))
        if (tied.length <= 1) finish(sim, tied[0] ?? -1)
        else {
          sudden = true
          suddenAt = sim.time
          emit(sim, { type: 'suddenDeath' })
          emit(sim, { type: 'radio', who: PVP_RADIO.suddenDeath.who, text: PVP_RADIO.suddenDeath.text })
        }
      } else if (sudden && sim.time - suddenAt >= PVP_SUDDEN_DEATH) finish(sim, -1)
    },

    onBroken(sim, p, by, assists, item) {
      let team: TeamId | undefined
      const killer = typeof by === 'string' ? sim.players.find((q) => q.id === by) : undefined
      if (killer && killer.team !== p.team) team = killer.team
      else {
        const bh = baseHit.get(p.id)
        if (bh && sim.time - bh.t <= 10 && bh.team !== p.team) team = bh.team
      }
      const points = isOver(sim) || team === undefined ? 0 : lastSpurt ? 2 : 1
      const ev: { assists: ActorRef[]; by?: ActorRef; item?: typeof item; team?: TeamId; points?: number } = {
        assists
      }
      if (by !== undefined) ev.by = by
      if (item) ev.item = item
      if (team !== undefined && points > 0) {
        ev.team = team
        ev.points = points
        scores[team] += points
      }
      emit(sim, { type: 'ko', who: p.id, ...ev })
      warpAway(sim, p, PVP_RESPAWN)
      if (sudden && team !== undefined && points > 0 && tied.includes(team) && !isOver(sim)) finish(sim, team)
    },

    onFoeKilled() {},

    goal() {
      return null
    },

    focus(sim) {
      return anchor(sim, 'plaza')
    },

    clock(sim) {
      if (started < 0) return duration
      if (sudden) return Math.max(0, PVP_SUDDEN_DEATH - (sim.time - suddenAt))
      return Math.max(0, duration - (sim.time - started))
    },

    pvp(): PvpView {
      const v: PvpView = { scores: [scores[0], scores[1], scores[2]], lastSpurt, suddenDeath: sudden }
      if (winner !== undefined) v.winner = winner
      if (mvp) v.mvp = mvp
      return v
    },

    spawnFor(sim, p) {
      const pts = spawnPoints(sim, p.team)
      const mates = sim.players.filter((q) => q.team === p.team)
      const i = Math.max(0, mates.indexOf(p))
      const s = pts[i % pts.length]
      const at: Vec = [s.p[0], s.p[1], s.p[2]]
      return { p: at, yaw: s.yaw }
    }
  }
  return ctl
}
