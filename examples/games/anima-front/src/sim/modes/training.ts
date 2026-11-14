/**
 * 訓練場 (DESIGN §12): static targets at `target1…8` (respawning), moving targets along `mover1/mover2`, a dummy
 * squad of passive クロヅメ animals at `dummy` (respawning), the optional infinite anima (MatchConfig.training)
 * and the 8-step tutorial whose steps complete only by doing the action. Broken armour warps out and respawns.
 */
import { ITEMS } from '../../data/items'
import { DT, REVIVE_RANGE, REVIVE_TIME, TRAINING_RESPAWN } from '../constants'
import { spawnFoe } from '../foes/index'
import { addProp } from '../props'
import { respawn, spawnPoints, warpAway } from '../player'
import { emit, type Foe, type ModeCtl, type Player, type Prop, type Sim } from '../state'
import { BTN, type MatchConfig, type SimEvent, type TrainingView } from '../types'
import { vdist, type Vec } from '../vec'
import { anchor } from './common'

export const TUTORIAL_HINTS = [
  'WASDで移動しよう。マーカーの方へ歩いてみて',
  'マウスで周りを見渡そう',
  'スペースでジャンプ。長押しすると滑空できる動物もいるよ',
  'Shiftでダッシュ。敵の攻撃の予兆が見えたら横へ避けよう',
  '左クリックで右手のアンティークを使い、的に当てよう。使うたびにアニマが減るよ',
  'Q（またはホイール）で右手のアンティークを持ち替えよう',
  '右クリックで左手のアンティークを使おう。アニマは体力でもあるから、使いすぎに注意',
  '倒れた仲間のそばでFを長押しして助け起こそう'
] as const
/** Seconds a switch step waits before moving on when the build has nothing to switch. */
const NO_SWITCH_BEAT = 1.5
/** Seconds a shield/guard/charge must be held to count as using a paw. */
const HOLD_USE = 0.3
export const TUTORIAL_DONE = 'チュートリアル完了！ ここからは自由に練習しよう'

const REVIVE_STEP = 7
const TARGET_HP = 200
const TARGET_RESPAWN = 3
const DUMMY_RESPAWN = 5
const MOVER_SPEED = 3

export function createTraining(cfg: MatchConfig): ModeCtl {
  const tutorial = !!cfg.training?.tutorial
  let step = tutorial ? 0 : -1
  let lastEvent = 0
  let base = { walked: 0, turned: 0 }
  let reviveT = 0
  let stepAt = 0
  let holdT = 0
  let usesBase: [number, number] = [0, 0]
  let tutorialProp: Prop | null = null
  const respawns: { at: number; fn: () => void }[] = []
  const movers: { prop: Prop; path: Vec[]; d: number; dir: 1 | -1 }[] = []
  const dummies: (Foe | undefined)[] = []

  function addTarget(sim: Sim, at: Vec, moving: boolean): Prop {
    return addProp(sim, 'target', at, 0, -1, { hp: TARGET_HP, r: 0.6, state: moving ? 1 : 0, data: { h: 1.8 } })
  }

  function spawnDummy(sim: Sim, i: number) {
    const c = anchor(sim, 'dummy', 2, 3)
    const at: Vec = [c[0] + (i - 1) * 2.5, c[1], c[2]]
    const f = spawnFoe(sim, 'kurozume', at, { passive: true, squad: i, yaw: Math.PI })
    dummies[i] = f
  }

  function placeTutorialMarker(sim: Sim) {
    if (tutorialProp) tutorialProp.gone = true
    tutorialProp = null
    if (step < 0 || step >= TUTORIAL_HINTS.length) return
    // The revive step uses the training dummies' area so the marker always sits where the learner can stand.
    const at =
      step === REVIVE_STEP && sim.map.anchors.dummy
        ? anchor(sim, 'dummy')
        : anchor(sim, `tutorial${step + 1}`, step, TUTORIAL_HINTS.length)
    tutorialProp = addProp(sim, 'tutorial', at, 0, -1, { state: step, label: String(step + 1) })
  }

  const hand = (p: Player, h: 'R' | 'L') => p.hands.find((x) => x.hand === h)
  const hasItems = (p: Player, h: 'R' | 'L') => (hand(p, h)?.items.length ?? 0) > 0
  const canSwitch = (p: Player) => p.hands.some((h) => h.items.length >= 2)
  const hasWeapon = (p: Player, h: 'R' | 'L') =>
    (hand(p, h)?.items ?? []).some((i) => ITEMS[i].category === 'melee' || ITEMS[i].category === 'ranged')

  /** The hint of a step, adapted to the learner's build so that every step can be done. */
  function hintFor(p: Player | undefined, s: number): string {
    if (!p) return TUTORIAL_HINTS[s]
    if (s === 4 && !hasWeapon(p, 'R') && hasWeapon(p, 'L'))
      return '右クリックで左手のアンティークを使い、的に当てよう。使うたびにアニマが減るよ'
    if (s === 5 && !canSwitch(p)) return 'この構成には持ち替えるアンティークがないよ。このまま次へ進もう'
    if (s === 5 && !hasItems(p, 'R') && canSwitch(p)) return 'Q（またはホイール）でアンティークを持ち替えよう'
    if (s === 6 && !hasItems(p, 'L')) return '左手は空なので、左クリックで右手のアンティークをもう一度使おう'
    return TUTORIAL_HINTS[s]
  }

  function tutorPlayer(sim: Sim) {
    return sim.players.find((q) => q.bot === undefined) ?? sim.players[0]
  }

  function advance(sim: Sim, p: Player) {
    step++
    base = { walked: p.walked, turned: p.turned }
    reviveT = 0
    stepAt = sim.time
    holdT = 0
    usesBase = [hand(p, 'R')?.uses ?? 0, hand(p, 'L')?.uses ?? 0]
    if (step >= TUTORIAL_HINTS.length) {
      emit(sim, { type: 'tutorial', step: TUTORIAL_HINTS.length, hint: TUTORIAL_DONE })
      step = -1
      placeTutorialMarker(sim)
      return
    }
    emit(sim, { type: 'tutorial', step, hint: hintFor(p, step) })
    placeTutorialMarker(sim)
  }

  /** True when this tick's events show the learner doing the current step. */
  function stepDone(sim: Sim, p: Player, evs: SimEvent[]): boolean {
    const mine = (e: SimEvent) => 'who' in e && e.who === p.id
    switch (step) {
      case 0:
        return p.walked - base.walked >= 8
      case 1:
        return p.turned - base.turned >= 3
      case 2:
        return evs.some((e) => e.type === 'jump' && mine(e))
      case 3:
        return evs.some((e) => e.type === 'dash' && mine(e))
      case 4:
        return evs.some(
          (e) =>
            e.type === 'hit' && e.by === p.id && e.amount > 0 && (e.targetKind === 'prop' || e.targetKind === 'foe')
        )
      case 5:
        // Switching either paw counts; a build with nothing to switch moves on by itself after a short beat.
        if (evs.some((e) => e.type === 'swap' && mine(e))) return true
        return !canSwitch(p) && sim.time - stepAt >= NO_SWITCH_BEAT
      case 6: {
        // Any use of the left paw (right paw when the left one is empty): a shot, swing, gadget or a held shield.
        const side = hasItems(p, 'L') ? 'L' : 'R'
        const h = hand(p, side)
        if (!h) return false
        if (
          evs.some((e) => (e.type === 'fire' || e.type === 'swing' || e.type === 'empty') && mine(e) && e.hand === side)
        )
          return true
        if (h.uses > usesBase[side === 'R' ? 0 : 1]) return true
        const holding = h.mode === 'shield' || h.mode === 'guard' || h.act === 'guard' || h.act === 'charge'
        holdT = holding ? holdT + DT : 0
        return holdT >= HOLD_USE
      }
      case REVIVE_STEP: {
        // Hold interact next to the downed dummy marker for the revive time.
        const near = tutorialProp && Math.hypot(p.p[0] - tutorialProp.p[0], p.p[2] - tutorialProp.p[2]) <= REVIVE_RANGE
        if (near && (p.input.held & BTN.INTERACT) !== 0) reviveT += DT
        else reviveT = 0
        if (tutorialProp) tutorialProp.data.revive = Math.min(1, reviveT / REVIVE_TIME)
        return reviveT >= REVIVE_TIME
      }
      default:
        return false
    }
  }

  const ctl: ModeCtl = {
    start(sim) {
      for (let i = 1; i <= 8; i++) {
        const a = sim.map.anchors[`target${i}`]
        if (a) addTarget(sim, [a[0], a[1], a[2]], false)
      }
      for (const name of ['mover1', 'mover2']) {
        const path = sim.map.paths[name]
        if (!path || path.length < 2) continue
        const pts = path.map((q) => [q[0], q[1], q[2]] as Vec)
        movers.push({ prop: addTarget(sim, pts[0], true), path: pts, d: 0, dir: 1 })
      }
      if (sim.map.anchors.dummy) for (let i = 0; i < 3; i++) spawnDummy(sim, i)
      if (tutorial) {
        placeTutorialMarker(sim)
        emit(sim, { type: 'tutorial', step: 0, hint: hintFor(tutorPlayer(sim), 0) })
      }
    },

    update(sim) {
      // Respawns of targets and dummies.
      for (let i = respawns.length - 1; i >= 0; i--) {
        if (sim.time >= respawns[i].at) {
          respawns[i].fn()
          respawns.splice(i, 1)
        }
      }
      for (let i = 0; i < dummies.length; i++) {
        const f = dummies[i]
        if (f && f.dead) {
          dummies[i] = undefined
          respawns.push({ at: sim.time + DUMMY_RESPAWN, fn: () => spawnDummy(sim, i) })
        }
      }
      // Moving targets go back and forth along their lanes.
      for (const m of movers) {
        if (m.prop.gone) continue
        const len = pathLength(m.path)
        m.d += MOVER_SPEED * DT * m.dir
        if (m.d >= len) {
          m.d = len
          m.dir = -1
        } else if (m.d <= 0) {
          m.d = 0
          m.dir = 1
        }
        const at = pointOnPath(m.path, m.d)
        m.prop.yaw = m.dir > 0 ? Math.PI / 2 : -Math.PI / 2
        m.prop.p = at
      }
      // Armour breaks: warp out and come back.
      for (const p of sim.players) {
        if (p.state !== 'away') continue
        p.timer -= DT
        if (p.timer <= 0) respawn(sim, p, ctl.spawnFor(sim, p), 1)
      }
      // Tutorial (driven by the first human player, else the first player).
      if (step >= 0) {
        const p = tutorPlayer(sim)
        const evs: SimEvent[] = []
        for (let i = sim.events.length - 1; i >= 0 && sim.events[i].id > lastEvent; i--) evs.push(sim.events[i])
        if (sim.events.length) lastEvent = Math.max(lastEvent, sim.events[sim.events.length - 1].id)
        if (p && p.state === 'alive' && stepDone(sim, p, evs)) advance(sim, p)
      }
    },

    onBroken(sim, p) {
      emit(sim, { type: 'ko', who: p.id, assists: [] })
      warpAway(sim, p, TRAINING_RESPAWN)
    },

    onFoeKilled() {},

    onPropDestroyed(sim, r) {
      if (r.kind !== 'target') return
      const mover = movers.find((m) => m.prop === r)
      respawns.push({
        at: sim.time + TARGET_RESPAWN,
        fn: () => {
          const t = addTarget(sim, r.p, !!mover)
          if (mover) mover.prop = t
        }
      })
    },

    goal() {
      return null
    },

    focus(sim) {
      return tutorialProp ? [tutorialProp.p[0], tutorialProp.p[1], tutorialProp.p[2]] : anchor(sim, 'dummy')
    },

    clock(sim) {
      return sim.time
    },

    training(sim): TrainingView {
      const v: TrainingView = {
        infinite: !!sim.cfg.training?.infiniteAnima,
        step,
        steps: TUTORIAL_HINTS.length
      }
      if (step >= 0) v.hint = hintFor(tutorPlayer(sim), step)
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

function pathLength(path: Vec[]) {
  let l = 0
  for (let i = 1; i < path.length; i++) l += vdist(path[i - 1], path[i])
  return l
}

function pointOnPath(path: Vec[], d: number): Vec {
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
