import type { GameState } from './game'
import type { JuiceEvent, JuicePoint } from './juice-events'
import { floorAt } from './map'

const STEP_WALK = 0.55
const STEP_SPRINT = 0.8
const SPRINT_SPEED = 4.5
const CROUCH_SPEED = 1.6
const TELEPORT = 3
const EAT_STREAK_WINDOW = 4
const FALL_FULL_IMPACT = 1.5

type Task = { label: string; progress: number }
/** The hold-E job under way, if the host sends one (older hosts don't). */
const taskOf = (player: object | undefined): Task | undefined => (player as { task?: Task } | undefined)?.task

type Snapshot = {
  time: number
  playerId: string
  hasPlayer: boolean
  x: number
  y: number
  z: number
  height: number
  hidden: boolean
  carrying: string | null
  foodEaten: number
  health: number
  downed: boolean
  growth: number
  pregnant: boolean
  phase: GameState['phase']
  stage: number
  chapter: number
  step: number
  bedding: number
  kitsSafe: number
  kitsLost: number
  talk: string | null
  nests: Map<string, JuicePoint & { active: boolean }>
  foods: Map<string, JuicePoint & { active: boolean; kind: string }>
  predators: Map<string, { state: string; targetId?: string | null; at: JuicePoint }>
  chasingMe: number
}

const point = (value: { x: number; y: number; z: number }): JuicePoint => ({ x: value.x, y: value.y, z: value.z })

/** Derives game-feel events by diffing consecutive GameState snapshots (identical on host and guests). */
export class JuiceDetector {
  private previous: Snapshot | null = null
  private travelled = 0
  private airborne = false
  private peak = 0
  private lastEat = -Infinity
  private streak = 0
  private tickBucket = 0
  private taskLabel: string | null = null
  private taskDoneFired = false
  private taskProgress = 0

  reset(): void {
    this.previous = null
    this.travelled = 0
    this.airborne = false
    this.peak = 0
    this.lastEat = -Infinity
    this.streak = 0
    this.clearTask()
  }

  update(state: GameState, localPlayerId: string): JuiceEvent[] {
    const previous = this.previous
    if (previous && state.time < previous.time) return []
    const next = this.observe(state, localPlayerId)
    this.previous = next
    if (!previous || previous.playerId !== localPlayerId) {
      this.resync(next, state, localPlayerId)
      return []
    }
    const events: JuiceEvent[] = []
    if (previous.phase === 'playing' && next.phase !== 'playing') {
      events.push({ type: next.phase === 'won' ? 'won' : 'lost' })
    }
    if (next.phase !== 'playing') return events
    const stageChanged = next.stage !== previous.stage

    for (const [id, was] of previous.nests) {
      if (was.active && next.nests.get(id)?.active === false) events.push({ type: 'nestBroken', at: point(was) })
    }
    for (const [id, predator] of next.predators) {
      const before = previous.predators.get(id)
      if (!before) continue
      if (predator.state === 'chase' && before.state !== 'chase') {
        events.push({ type: 'spotted', at: predator.at, you: predator.targetId === localPlayerId })
      } else if (
        predator.state === 'suspicious' &&
        before.state !== 'suspicious' &&
        predator.targetId === localPlayerId
      ) {
        events.push({ type: 'suspicious', at: predator.at })
      }
    }
    const here = next.hasPlayer ? { x: next.x, y: next.y, z: next.z } : undefined
    if (next.talk && next.talk !== previous.talk) events.push({ type: 'talk', ...(here ? { at: here } : {}) })
    if (next.chapter > previous.chapter || next.stage > previous.stage) events.push({ type: 'chapter' })
    else if (!stageChanged && next.step > previous.step)
      events.push({ type: 'objective', ...(here ? { at: here } : {}) })
    if (next.bedding > previous.bedding) events.push({ type: 'bedding', ...(here ? { at: here } : {}) })
    if (next.kitsSafe > previous.kitsSafe) events.push({ type: 'kitSafe', ...(here ? { at: here } : {}) })
    if (next.kitsLost > previous.kitsLost) events.push({ type: 'kitLost', ...(here ? { at: here } : {}) })

    const player = state.players.find((entry) => entry.id === localPlayerId)
    if (!player || !previous.hasPlayer) {
      this.clearTask()
      return events
    }
    const at = point(player)
    if (previous.chasingMe > 0 && next.chasingMe === 0 && !stageChanged && !next.downed) {
      events.push({ type: 'escaped', at })
    }
    const dt = next.time - previous.time
    const moved = Math.hypot(next.x - previous.x, next.z - previous.z)
    const teleported = Math.hypot(moved, next.y - previous.y) > TELEPORT || stageChanged
    if (teleported) {
      this.travelled = 0
      this.airborne = false
      this.peak = 0
    }

    // Jumping and landing.
    if (!teleported) {
      if (previous.height <= 0.01 && next.height > 0.05) {
        events.push({ type: 'jump', at })
        this.airborne = true
        this.peak = next.height
      } else if (this.airborne && next.height <= 0.01) {
        events.push({ type: 'land', at, impact: Math.min(1, this.peak / FALL_FULL_IMPACT) })
        this.airborne = false
        this.peak = 0
      } else if (next.height > 0.05) {
        this.airborne = true
        this.peak = Math.max(this.peak, next.height)
      }
    }

    // Footsteps: one per stretch of ground covered.
    const speed = dt > 0 ? moved / dt : 0
    const grounded = next.height <= 0.05 && !this.airborne
    if (grounded && !teleported && !next.downed && speed > 0.3) {
      const sprint = speed > SPRINT_SPEED
      const crouch = next.hidden || speed < CROUCH_SPEED
      const stride = sprint ? STEP_SPRINT : STEP_WALK
      this.travelled += moved
      if (this.travelled >= stride) {
        this.travelled = Math.min(this.travelled - stride, stride * 0.5)
        events.push({ type: 'step', at, sprint, crouch: crouch && !sprint })
      }
    } else if (speed <= 0.3) {
      this.travelled = Math.min(this.travelled, STEP_WALK * 0.5)
    }

    if (next.hidden !== previous.hidden) events.push({ type: next.hidden ? 'hide' : 'unhide', at })

    if (next.foodEaten > previous.foodEaten) {
      let kind: string | undefined
      let best = Infinity
      for (const [id, was] of previous.foods) {
        if (!was.active || next.foods.get(id)?.active !== false) continue
        const distance = Math.hypot(was.x - player.x, was.y - player.y, was.z - player.z)
        if (distance < best) {
          best = distance
          kind = was.kind
        }
      }
      this.streak = next.time - this.lastEat <= EAT_STREAK_WINDOW ? this.streak + 1 : 1
      this.lastEat = next.time
      events.push({ type: 'eat', at, ...(kind ? { kind } : {}), streak: this.streak })
    }

    if (next.carrying && !previous.carrying) events.push({ type: 'pickup', at })
    else if (!next.carrying && previous.carrying) events.push({ type: 'drop', at })

    this.task(taskOf(player), at, events)

    if (next.health < previous.health) events.push({ type: 'hurt', at, amount: previous.health - next.health })
    if (next.downed !== previous.downed) events.push({ type: next.downed ? 'downed' : 'revived', at })
    if (previous.growth < 1 && next.growth >= 1) events.push({ type: 'grown', at })
    if (!previous.pregnant && next.pregnant) events.push({ type: 'pregnant', at })
    return events
  }

  private task(task: Task | undefined, at: JuicePoint, events: JuiceEvent[]): void {
    if (task && task.label === this.taskLabel) {
      const bucket = Math.floor(task.progress * 10 + 1e-9)
      if (bucket > this.tickBucket && task.progress < 0.999) {
        events.push({ type: 'taskTick', at, progress: task.progress })
      }
      this.tickBucket = Math.max(this.tickBucket, bucket)
      this.taskProgress = task.progress
      if (task.progress >= 0.999 && !this.taskDoneFired) {
        this.taskDoneFired = true
        events.push({ type: 'taskDone', at })
      }
      return
    }
    // A job only counts as done when it reports 100% (Game.work keeps a finished job on the gauge for a moment);
    // letting go or being interrupted at any earlier point is not a success, however close.
    this.clearTask()
    if (task) {
      this.taskLabel = task.label
      this.tickBucket = Math.floor(task.progress * 10 + 1e-9)
      this.taskProgress = task.progress
      this.taskDoneFired = task.progress >= 0.999
    }
  }

  private clearTask(): void {
    this.taskLabel = null
    this.tickBucket = 0
    this.taskProgress = 0
    this.taskDoneFired = false
  }

  /** First frame (or a new local player): adopt the current movement/task state without announcing it. */
  private resync(next: Snapshot, state: GameState, localPlayerId: string): void {
    this.travelled = 0
    this.airborne = next.height > 0.05
    this.peak = next.height
    this.streak = 0
    this.lastEat = -Infinity
    this.clearTask()
    const task = taskOf(state.players.find((entry) => entry.id === localPlayerId))
    if (task) {
      this.taskLabel = task.label
      this.tickBucket = Math.floor(task.progress * 10 + 1e-9)
      this.taskProgress = task.progress
      this.taskDoneFired = task.progress >= 0.999
    }
  }

  private observe(state: GameState, localPlayerId: string): Snapshot {
    const player = state.players.find((entry) => entry.id === localPlayerId)
    return {
      time: state.time,
      playerId: localPlayerId,
      hasPlayer: Boolean(player),
      x: player?.x ?? 0,
      y: player?.y ?? 0,
      z: player?.z ?? 0,
      height: player ? Math.max(0, player.y - floorAt(player.x, player.y, player.z)) : 0,
      hidden: player?.hidden ?? false,
      carrying: player?.carrying ?? null,
      foodEaten: player?.foodEaten ?? 0,
      health: player?.health ?? 0,
      downed: player?.downed ?? false,
      growth: player?.growth ?? 0,
      pregnant: player?.pregnant ?? false,
      phase: state.phase,
      stage: state.stage ?? 3,
      chapter: state.chapter,
      step: state.step,
      bedding: state.bedding,
      kitsSafe: state.kits.filter((kit) => kit.status === 'safe').length,
      kitsLost: state.kits.filter((kit) => kit.status === 'lost').length,
      talk: state.talk ? `${state.talk.id}@${state.talk.at}` : null,
      nests: new Map(state.nests.map((nest) => [nest.id, { ...point(nest), active: nest.active }])),
      foods: new Map(state.foods.map((food) => [food.id, { ...point(food), active: food.active, kind: food.kind }])),
      predators: new Map(
        state.predators.map((predator) => [
          predator.id,
          { state: predator.state, targetId: predator.targetId, at: point(predator) }
        ])
      ),
      chasingMe: state.predators.filter((predator) => predator.state === 'chase' && predator.targetId === localPlayerId)
        .length
    }
  }
}
