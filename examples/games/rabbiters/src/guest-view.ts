import { moveRabbit, type GameState, type Input, type Movement, type Player } from './game'
import { WORLD, setGates } from './map'

export interface InputAck {
  sentAt: number
  gameTime: number
}

type Pose = Pick<Player, 'x' | 'y' | 'z' | 'angle'>
type Sample = Pose & { time: number }
/** Host snapshot poses of everyone but the local rabbit, keyed `kind:id`, at host game time. */
type Frame = { time: number; poses: Map<string, Pose> }

/** Remote actors are drawn this far behind the newest snapshot so there is always a later one to move toward. */
const INTERPOLATION_DELAY = 0.15

const clamp = (value: number, min: number, max: number) => Math.max(min, Math.min(max, value))
const pose = (actor: Pose): Pose => ({ x: actor.x, y: actor.y, z: actor.z, angle: actor.angle })

export class GuestView {
  private snapshot?: GameState
  private snapshotAt = 0
  private visualTime = 0
  private localId = ''
  private local?: Pose
  private movement: Movement = { velocity: 0, jumpHeld: false }
  private history: Sample[] = []
  private correction = { x: 0, y: 0, z: 0 }
  private frames: Frame[] = []
  private remoteTime = 0
  private stage = -1

  private sampleAt(time: number): Pose | undefined {
    const first = this.history[0]
    const last = this.history[this.history.length - 1]
    if (!first || !last || time < first.time - 50 || time > last.time + 50) return undefined
    for (let index = 1; index < this.history.length; index++) {
      const after = this.history[index]
      if (after.time < time) continue
      const before = this.history[index - 1]
      const amount = clamp((time - before.time) / Math.max(1, after.time - before.time), 0, 1)
      return {
        x: before.x + (after.x - before.x) * amount,
        y: before.y + (after.y - before.y) * amount,
        z: before.z + (after.z - before.z) * amount,
        angle: after.angle
      }
    }
    return time < first.time ? first : last
  }

  private reconcile(state: GameState, player: Player, now: number, input: Input) {
    const acks = (state as GameState & { inputAcks?: Record<string, InputAck> }).inputAcks
    const ack = acks && typeof acks === 'object' ? acks[player.id] : undefined
    const age = ack && state.time - ack.gameTime
    const sample =
      ack &&
      Number.isFinite(ack.sentAt) &&
      ack.sentAt >= 0 &&
      ack.sentAt <= now &&
      typeof age === 'number' &&
      Number.isFinite(age) &&
      age >= 0
        ? this.sampleAt(ack.sentAt + Math.min(age, 0.5) * 1000)
        : undefined
    const target = sample ?? this.local!
    const dx = player.x - target.x
    const dy = player.y - target.y
    const dz = player.z - target.z
    if (sample && Math.hypot(dx, dy, dz) > 8) {
      this.local = pose(player)
      this.movement = { velocity: 0, jumpHeld: input.jump }
      this.history = []
      this.correction = { x: 0, y: 0, z: 0 }
      return
    }
    const margin = sample || (!input.moveX && !input.moveZ) ? 0 : 2
    const distance = Math.hypot(dx, dz)
    const scale = distance > margin ? (distance - margin) / distance : 0
    this.correction = { x: dx * scale, y: sample ? dy : 0, z: dz * scale }
  }

  /** Records a snapshot's remote poses and advances the playback clock that trails it. */
  private advanceRemotes(state: GameState, localId: string, changed: boolean, elapsed: number) {
    if (changed) {
      const poses = new Map<string, Pose>()
      for (const entry of state.players) if (entry.id !== localId) poses.set(`player:${entry.id}`, pose(entry))
      for (const entry of state.predators) poses.set(`predator:${entry.id}`, pose(entry))
      for (const entry of state.kits) poses.set(`kit:${entry.id}`, pose(entry))
      const last = this.frames[this.frames.length - 1]
      if (last && state.time < last.time) this.frames = [] // a new stage or a resumed game restarts the clock
      if (last && state.time === last.time) this.frames[this.frames.length - 1] = { time: state.time, poses }
      else this.frames.push({ time: state.time, poses })
    }
    const newest = this.frames[this.frames.length - 1]
    if (!newest) return
    const target = newest.time - INTERPOLATION_DELAY
    this.remoteTime += elapsed
    // Ease the clock toward the target so uneven snapshot arrival bends playback speed slightly instead of jerking it.
    if (this.frames.length === 1 || Math.abs(target - this.remoteTime) > 0.5) this.remoteTime = target
    else this.remoteTime += (target - this.remoteTime) * (1 - Math.exp(-2 * elapsed))
    this.remoteTime = Math.min(this.remoteTime, newest.time)
    while (this.frames.length > 2 && this.frames[1].time <= this.remoteTime) this.frames.shift()
  }

  private remote(key: string, latest: Pose): Pose {
    const before = this.frames[0]
    const after = this.frames.find((frame) => frame.time >= this.remoteTime) ?? this.frames[this.frames.length - 1]
    const from = before?.poses.get(key)
    const to = after?.poses.get(key)
    if (!from || !to || before.time >= after.time) return pose(to ?? latest)
    if (Math.hypot(to.x - from.x, to.y - from.y, to.z - from.z) > 8) return pose(to) // teleported: don't slide
    const amount = clamp((this.remoteTime - before.time) / (after.time - before.time), 0, 1)
    return {
      x: from.x + (to.x - from.x) * amount,
      y: from.y + (to.y - from.y) * amount,
      z: from.z + (to.z - from.z) * amount,
      angle: from.angle + Math.atan2(Math.sin(to.angle - from.angle), Math.cos(to.angle - from.angle)) * amount
    }
  }

  render(state: GameState, localId: string, input: Input, dt: number, now: number): GameState {
    const elapsed = Number.isFinite(dt) ? clamp(dt, 0, 0.1) : 0
    const changed = this.snapshot !== state
    if (changed) {
      this.snapshot = state
      this.snapshotAt = now
    }
    this.visualTime = Math.max(this.visualTime, state.time, Math.min(this.visualTime + elapsed, state.time + 0.25))
    const player = state.players.find((entry) => entry.id === localId)
    setGates(state.open ?? 0) // predict against the gates the host has open
    const newStage = state.stage !== this.stage
    this.stage = state.stage
    if (!player || !this.local || this.localId !== localId || newStage) {
      this.localId = localId
      this.local = player ? pose(player) : undefined
      this.movement = { velocity: 0, jumpHeld: false }
      this.history = []
      this.correction = { x: 0, y: 0, z: 0 }
    } else if (player.downed || state.phase !== 'playing') {
      this.local = pose(player)
      this.movement = { velocity: 0, jumpHeld: input.jump }
      this.history = []
      this.correction = { x: 0, y: 0, z: 0 }
    } else if (changed && this.local) this.reconcile(state, player, now, input)

    if (player && this.local && !player.downed && state.phase === 'playing' && now - this.snapshotAt <= 1000) {
      let remaining = elapsed
      while (remaining > 1e-9) {
        const delta = Math.min(remaining, 1 / 60)
        const moving = { ...this.local, pregnant: player.pregnant, carrying: player.carrying }
        moveRabbit(moving, input, delta, this.movement)
        Object.assign(this.local, pose(moving))
        remaining -= delta
      }
      const amount = 1 - Math.exp(-8 * elapsed)
      const dx = clamp(this.local.x + this.correction.x * amount, WORLD.minX, WORLD.maxX) - this.local.x
      const dy = this.correction.y * amount // moveRabbit keeps the rabbit on the terrain or tunnel floor
      const dz = clamp(this.local.z + this.correction.z * amount, WORLD.minZ, WORLD.maxZ) - this.local.z
      this.local.x += dx
      this.local.y += dy
      this.local.z += dz
      this.correction.x -= dx
      this.correction.y -= dy
      this.correction.z -= dz
      for (const sample of this.history) {
        sample.x += dx
        sample.y += dy
        sample.z += dz
      }
      this.history.push({ ...this.local, time: now })
      while (this.history.length && this.history[0].time < now - 5000) this.history.shift()
    }

    this.advanceRemotes(state, localId, changed, elapsed)
    const players = state.players.map((entry) =>
      entry.id === localId && this.local
        ? { ...entry, ...this.local }
        : { ...entry, ...this.remote(`player:${entry.id}`, entry) }
    )
    const predators = state.predators.map((entry) => ({ ...entry, ...this.remote(`predator:${entry.id}`, entry) }))
    const kits = state.kits.map((entry) => ({ ...entry, ...this.remote(`kit:${entry.id}`, entry) }))
    return { ...state, time: this.visualTime, players, predators, kits }
  }
}
