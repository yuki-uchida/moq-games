/**
 * 防衛任務 (DESIGN §12): the five missions of src/data/missions.ts on top of the wave director (waves.ts).
 *
 * Objectives: defend (a lighthouse prop), capture (zones held in order with no foes inside, then the boss),
 * escort (the cart moves along its path while a living player is within its radius), destroy (nodes that keep
 * spawning foes while alive) and boss. Downs → revive or warp out; respawns cost squad tickets; with no living
 * animal and no ticket left the mission fails, as it does when the objective dies.
 *
 * Score (0..1000) and rank, documented for the results screen:
 *   clear      400 on victory
 *   objective  250 × objective share (defend/escort: hp left; capture/destroy: share done; boss: boss damage share)
 *   time       200 × clamp(2 − time / par, 0, 1) on victory (full at or under par, 0 at twice par)
 *   care       150 × max(0, 1 − squad downs / 8)
 * Rank: S ≥ mission.rank.s, A ≥ .a, B ≥ .b, else C (a failed mission is always C). MVP: modes/common mvpOf.
 */
import { FOES, type FoeKind } from '../../data/enemies'
import { MISSIONS, type MissionDef, type RadioLine } from '../../data/missions'
import { DOWN_TIME, DT, OBJECTIVE_HURT_GAP, PVE_PROTECT, AWAY_TIME } from '../constants'
import { liveFoes, spawnFoe } from '../foes/index'
import { addProp } from '../props'
import { respawn, setDown, settle, spawnPoints, warpAway } from '../player'
import { emit, FOE_SIDE, isOver, type Foe, type ModeCtl, type Prop, type Sim, type TargetRef } from '../state'
import type { MatchConfig, PveView } from '../types'
import { hdist, vdist, type Vec } from '../vec'
import { anchor, mvpOf, setPhase } from './common'
import { WaveDirector } from './waves'

export function createPve(cfg: MatchConfig): ModeCtl {
  const mission: MissionDef = MISSIONS[cfg.mission ?? 'sakura'] ?? MISSIONS.sakura
  const obj = mission.objective
  let started = -1
  let tickets = 0
  let hurtAt = -100
  let lowSent = false
  let result: PveView['result']
  let waves!: WaveDirector
  // Objective state.
  let main: Prop | null = null
  const zones: Prop[] = []
  let zoneIdx = 0
  let contested = false
  const nodes: Prop[] = []
  let cartDist = 0
  let cartLen = 0
  let cartPath: Vec[] = []
  let boss: Foe | null = null
  let bossSpawned = false
  let bossPhase = 1
  let coreLine = false
  let kneeling = false
  let nodeSpawnAt = 0

  const radio = (sim: Sim, l: RadioLine | undefined) => {
    if (l) emit(sim, { type: 'radio', who: l.who, text: l.text })
  }

  function defaultTag(sim: Sim, kind: FoeKind, k: number): string | undefined {
    if (kind === 'kurozume') return 'raid'
    if (FOES[kind].flying) return 'air'
    if (mission.id === 'sakura' || mission.id === 'nightraid') return ['north', 'north', 'east', 'west'][k % 4]
    if (mission.id === 'harbor') return 'drop'
    if (mission.id === 'blight') {
      const alive = nodes.map((n, i) => (n.gone ? null : `node${i + 1}`)).filter((x): x is string => !!x)
      return alive.length ? alive[k % alive.length] : undefined
    }
    if (mission.id === 'maw') return 'crater'
    void sim
    return undefined
  }

  function spawnBoss(sim: Sim, kind: FoeKind, at: Vec) {
    boss = spawnFoe(sim, kind, settle(sim, at, 2), { wave: -1, yaw: Math.PI })
    bossSpawned = true
    bossPhase = 1
  }

  function finish(sim: Sim, win: boolean) {
    if (isOver(sim)) return
    const time = sim.time - started
    const downs = sim.players.reduce((n, p) => n + p.stats.downs, 0)
    let share = 0
    if (obj.kind === 'defend' || obj.kind === 'escort')
      share = main && main.hp !== undefined ? main.hp / (main.maxHp ?? 1) : 0
    else if (obj.kind === 'capture')
      share = (zones.filter((z) => (z.state ?? 0) >= 1).length + (win ? 1 : 0)) / (zones.length + (obj.boss ? 1 : 0))
    else if (obj.kind === 'destroy') share = nodes.filter((n) => n.gone).length / Math.max(1, nodes.length)
    else if (obj.kind === 'boss') share = boss ? 1 - boss.hp / boss.maxHp : 0
    if (win && obj.kind !== 'defend' && obj.kind !== 'escort') share = 1
    let score = (win ? 400 : 0) + 250 * Math.max(0, Math.min(1, share)) + 150 * Math.max(0, 1 - downs / 8)
    if (win) score += 200 * Math.max(0, Math.min(1, 2 - time / mission.par))
    score = Math.round(score)
    const rank = !win
      ? 'C'
      : score >= mission.rank.s
        ? 'S'
        : score >= mission.rank.a
          ? 'A'
          : score >= mission.rank.b
            ? 'B'
            : 'C'
    result = { score, rank, time: Math.round(time * 10) / 10 }
    const mvp = mvpOf(sim.players)
    if (mvp) result.mvp = mvp
    emit(sim, { type: 'objective', what: win ? 'complete' : 'lost' })
    for (const l of win ? mission.radio.victory : mission.radio.defeat) radio(sim, l)
    setPhase(sim, win ? 'victory' : 'defeat')
  }

  function updateObjective(sim: Sim) {
    const alive = sim.players.filter((p) => p.state === 'alive')
    if (obj.kind === 'capture') {
      const z = zones[zoneIdx]
      if (z) {
        const r = z.r ?? obj.radius
        const inside = alive.some((p) => hdist(p.p, z.p) <= r)
        const foesIn = sim.foes.some((f) => !f.dead && f.state !== 'spawn' && hdist(f.p, z.p) <= r + f.r)
        if (inside && foesIn) {
          if (!contested) {
            contested = true
            emit(sim, { type: 'objective', what: 'contested', prop: z.id, label: z.label })
            if (sim.time - hurtAt >= OBJECTIVE_HURT_GAP) {
              hurtAt = sim.time
              radio(sim, mission.radio.objectiveHurt)
            }
          }
        } else contested = false
        if (inside && !foesIn) {
          const before = Math.floor((z.state ?? 0) * 4)
          z.state = Math.min(1, (z.state ?? 0) + DT / obj.hold)
          if (Math.floor(z.state * 4) > before && z.state < 1)
            emit(sim, { type: 'objective', what: 'progress', prop: z.id, label: z.label })
          if (z.state >= 1) {
            emit(sim, { type: 'objective', what: 'captured', prop: z.id, label: z.label })
            zoneIdx++
            contested = false
            if (zoneIdx < zones.length) waves.start(sim, zoneIdx)
            else if (obj.boss) {
              waves.start(sim, Math.min(zones.length, mission.waves.length - 1), true)
              spawnBoss(sim, obj.boss, anchor(sim, 'sea', 0, 1))
              radio(sim, mission.radio.boss?.[0])
            } else finish(sim, true)
          }
        }
      }
    } else if (obj.kind === 'escort' && main && !main.gone) {
      const moving = alive.some((p) => hdist(p.p, main!.p) <= obj.radius)
      if (moving && cartLen > 0) {
        cartDist = Math.min(cartLen, cartDist + obj.speed * DT)
        const before = Math.floor((main.state ?? 0) * 10)
        const pos = pointAt(cartPath, cartDist)
        main.yaw = Math.atan2(pos[0] - main.p[0], pos[2] - main.p[2]) || main.yaw
        main.p = [pos[0], sim.phys.groundHeight(pos[0], pos[2], 0.8, pos[1] + 1), pos[2]]
        main.state = cartDist / cartLen
        if (Math.floor(main.state * 10) > before && main.state < 1)
          emit(sim, { type: 'objective', what: 'progress', prop: main.id, label: main.label })
      }
      if (cartLen <= 0 || cartDist >= cartLen - 1e-6) {
        emit(sim, { type: 'objective', what: 'arrived', prop: main.id, label: main.label })
        finish(sim, true)
      }
    } else if (obj.kind === 'destroy') {
      // Living nodes keep spawning ツブテ.
      if (sim.time >= nodeSpawnAt) {
        nodeSpawnAt = sim.time + 20
        nodes.forEach((n, i) => {
          if (n.gone) return
          waves.extra(sim, 'tsubute', 3, `node${i + 1}`)
        })
      }
    }
    if (bossSpawned && boss) {
      const ph = boss.parts?.[1] ?? (boss.hp / boss.maxHp > 0.66 ? 1 : boss.hp / boss.maxHp > 0.33 ? 2 : 3)
      const lines = mission.radio.boss ?? []
      if (boss.kind === 'kuitsukushi') {
        // Line 0 the first time the core opens, line 1 on each phase change.
        if ((boss.parts?.[0] ?? 0) >= 1 && !coreLine) {
          coreLine = true
          radio(sim, lines[0])
        }
        if (ph > bossPhase) {
          bossPhase = ph
          if (mission.id === 'maw' && ph - 1 < mission.waves.length) waves.start(sim, ph - 1)
          radio(sim, lines[1])
        }
      } else if (boss.kind === 'goutetsu') {
        // Line 1 each time it kneels with the core exposed.
        const kneel = boss.state === 'stagger'
        if (kneel && !kneeling) radio(sim, lines[1])
        kneeling = kneel
      }
      if (boss.dead) finish(sim, true)
    }
  }

  const ctl: ModeCtl = {
    start(sim) {
      tickets = sim.diff.tickets
      waves = new WaveDirector(
        mission,
        sim.diff.peak,
        (kind, k) => defaultTag(sim, kind, k),
        obj.kind === 'defend' || obj.kind === 'escort'
      )
      if (obj.kind === 'defend') {
        main = addProp(sim, 'lighthouse', settle(sim, anchor(sim, obj.anchor), 1.5), 0, 0, {
          hp: obj.hp,
          r: 1.6,
          label: obj.label,
          data: { h: 7 }
        })
      } else if (obj.kind === 'capture') {
        obj.anchors.forEach((a, i) => {
          zones.push(
            addProp(sim, 'zone', anchor(sim, a, i, obj.anchors.length), 0, -1, {
              r: obj.radius,
              state: 0,
              label: String.fromCharCode(65 + i)
            })
          )
        })
      } else if (obj.kind === 'escort') {
        const path = sim.map.paths[obj.path]
        cartPath = path && path.length >= 2 ? path.map((p) => [p[0], p[1], p[2]] as Vec) : fallbackPath(sim)
        cartLen = 0
        for (let i = 1; i < cartPath.length; i++) cartLen += vdist(cartPath[i - 1], cartPath[i])
        main = addProp(sim, 'cart', cartPath[0], 0, 0, {
          hp: obj.hp,
          r: 1.4,
          state: 0,
          label: obj.label,
          data: { h: 2 }
        })
      } else if (obj.kind === 'destroy') {
        obj.anchors.forEach((a, i) => {
          nodes.push(
            addProp(sim, 'node', anchor(sim, a, i, obj.anchors.length), 0, FOE_SIDE, {
              hp: obj.hp * sim.diff.hp,
              r: 2.2,
              state: 1,
              label: String(i + 1),
              data: { h: 4 }
            })
          )
        })
      }
      // Squad base marker(s).
      for (const b of sim.map.bases) if (b.team === 'squad') addProp(sim, 'base', b.p, 0, 0, { r: b.r })
    },

    update(sim) {
      if (isOver(sim)) return
      if (started < 0) {
        started = sim.time
        radio(sim, mission.radio.start)
        if (obj.kind === 'boss') {
          spawnBoss(sim, obj.foe, anchor(sim, obj.anchor))
        }
        waves.start(sim, 0)
        nodeSpawnAt = sim.time + 20
      }
      // Downs, warps and respawns.
      for (const p of sim.players) {
        if (p.state === 'down') {
          p.timer -= DT
          if (p.timer <= 0) {
            if (tickets > 0) {
              tickets--
              warpAway(sim, p, AWAY_TIME)
            } else warpAway(sim, p, Infinity)
            if (!lowSent && tickets <= 1) {
              lowSent = true
              radio(sim, mission.radio.lowTickets)
            }
          }
        } else if (p.state === 'away' && p.timer !== Infinity) {
          p.timer -= DT
          if (p.timer <= 0) respawn(sim, p, ctl.spawnFor(sim, p), PVE_PROTECT)
        }
      }
      waves.update(sim)
      updateObjective(sim)
      if (isOver(sim)) return
      if (obj.kind === 'defend' && waves.allCleared(sim)) finish(sim, true)
      // Defeat: nobody standing and nobody coming back.
      const alive = sim.players.some((p) => p.state === 'alive')
      const coming = sim.players.some(
        (p) => (p.state === 'away' && p.timer !== Infinity) || (p.state === 'down' && tickets > 0)
      )
      if (sim.players.length && !alive && !coming) finish(sim, false)
    },

    onBroken(sim, p, by, assists, item) {
      emit(sim, {
        type: 'ko',
        who: p.id,
        assists,
        ...(by !== undefined ? { by } : {}),
        ...(item ? { item } : {})
      })
      setDown(sim, p, DOWN_TIME)
    },

    onFoeKilled(sim, f) {
      waves.onKilled(sim, f)
    },

    onPropDamaged(sim, r) {
      if ((r === main || r.kind === 'cart' || r.kind === 'lighthouse') && sim.time - hurtAt >= OBJECTIVE_HURT_GAP) {
        hurtAt = sim.time
        emit(sim, { type: 'objective', what: 'damaged', prop: r.id, label: r.label })
        radio(sim, mission.radio.objectiveHurt)
      }
    },

    onPropDestroyed(sim, r) {
      if (r === main) {
        emit(sim, { type: 'objective', what: 'destroyed', prop: r.id, label: r.label })
        finish(sim, false)
      } else if (r.kind === 'node') {
        emit(sim, { type: 'objective', what: 'destroyed', prop: r.id, label: r.label })
        const done = nodes.filter((n) => n.gone).length
        if (done >= nodes.length) finish(sim, true)
        else if (done < mission.waves.length) waves.start(sim, done)
      }
    },

    goal(sim, f): TargetRef | null {
      if (main && !main.gone && (obj.kind === 'defend' || obj.kind === 'escort')) {
        // クロヅメ and crowds go for the objective; ranged foes still prefer nearby players (foe AI decides).
        void f
        return { k: 'r', id: main.id }
      }
      void sim
      return null
    },

    focus(sim, side) {
      if (side === FOE_SIDE) return main && !main.gone ? [main.p[0], main.p[1], main.p[2]] : null
      if (main && !main.gone) return [main.p[0], main.p[1], main.p[2]]
      if (obj.kind === 'capture' && zones[zoneIdx]) return [...zones[zoneIdx].p] as Vec
      if (boss && !boss.dead) return [boss.p[0], 0, boss.p[2]]
      if (obj.kind === 'destroy') {
        const c = squadCentre(sim)
        let best: Prop | null = null
        for (const n of nodes) if (!n.gone && (!best || vdist(n.p, c) < vdist(best.p, c))) best = n
        if (best) return [best.p[0], best.p[1], best.p[2]]
      }
      return null
    },

    clock(sim) {
      return started < 0 ? 0 : result ? result.time : sim.time - started
    },

    pve(sim): PveView {
      const objective: PveView['objective'] = { label: obj.label }
      if (main) {
        objective.hp = Math.round(main.hp ?? 0)
        objective.maxHp = main.maxHp
        if (obj.kind === 'escort') objective.progress = Math.round((main.state ?? 0) * 1000) / 1000
      } else if (obj.kind === 'capture') {
        objective.step = Math.min(zoneIdx + 1, zones.length)
        objective.steps = zones.length
        objective.progress = Math.round((zones[zoneIdx]?.state ?? 1) * 1000) / 1000
      } else if (obj.kind === 'destroy') {
        objective.step = nodes.filter((n) => n.gone).length
        objective.steps = nodes.length
      }
      const v: PveView = {
        mission: mission.id,
        difficulty: sim.cfg.difficulty ?? 'normal',
        wave: Math.max(1, waves ? waves.current + 1 : 1),
        waves: mission.waves.length,
        next: waves ? Math.round(waves.nextIn(sim) * 10) / 10 : 0,
        foesLeft: liveFoes(sim) + (waves ? waves.queued() : 0),
        tickets,
        objective
      }
      if (boss && !boss.dead) {
        v.boss = {
          kind: boss.kind,
          name: boss.def.name,
          hp: Math.round(boss.hp),
          maxHp: Math.round(boss.maxHp),
          phase: boss.kind === 'kuitsukushi' ? bossPhase : (boss.parts?.filter((x) => x <= 0).length ?? 0) + 1
        }
      }
      if (result) v.result = result
      return v
    },

    spawnFor(sim, p) {
      const pts = spawnPoints(sim, 'squad')
      const i = Math.max(0, sim.players.indexOf(p))
      const s = pts[i % pts.length]
      return { p: [s.p[0], s.p[1], s.p[2]], yaw: s.yaw }
    }
  }
  return ctl
}

function squadCentre(sim: Sim): Vec {
  const alive = sim.players.filter((p) => p.state === 'alive')
  if (!alive.length) return [0, 0, 0]
  const c: Vec = [0, 0, 0]
  for (const p of alive) {
    c[0] += p.p[0] / alive.length
    c[1] += p.p[1] / alive.length
    c[2] += p.p[2] / alive.length
  }
  return c
}

function pointAt(path: Vec[], d: number): Vec {
  let left = d
  for (let i = 1; i < path.length; i++) {
    const seg = vdist(path[i - 1], path[i])
    if (left <= seg) {
      const t = seg > 0 ? left / seg : 0
      return [
        path[i - 1][0] + (path[i][0] - path[i - 1][0]) * t,
        path[i - 1][1] + (path[i][1] - path[i - 1][1]) * t,
        path[i - 1][2] + (path[i][2] - path[i - 1][2]) * t
      ]
    }
    left -= seg
  }
  const e = path[path.length - 1]
  return [e[0], e[1], e[2]]
}

function fallbackPath(sim: Sim): Vec[] {
  const b = sim.map.bounds
  const z = (b.min[1] + b.max[1]) / 2
  return [
    [b.max[0] - 10, 0, z],
    [(b.min[0] + b.max[0]) / 2, 0, z],
    [b.min[0] + 10, 0, z]
  ]
}
