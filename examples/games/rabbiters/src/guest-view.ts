import { moveRabbit, type GameState, type Input, type Movement, type Player } from './game'

export interface InputAck {
  sentAt: number
  gameTime: number
}

type Pose = Pick<Player, 'x' | 'y' | 'z' | 'angle'>
type Sample = Pose & { time: number }

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
  private remotes = new Map<string, Pose>()

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

  private smooth(key: string, target: Pose, elapsed: number): Pose {
    let current = this.remotes.get(key)
    if (!current || Math.hypot(target.x - current.x, target.y - current.y, target.z - current.z) > 8) {
      current = pose(target)
      this.remotes.set(key, current)
      return current
    }
    const amount = 1 - Math.exp(-14 * elapsed)
    current.x += (target.x - current.x) * amount
    current.y += (target.y - current.y) * amount
    current.z += (target.z - current.z) * amount
    current.angle += Math.atan2(Math.sin(target.angle - current.angle), Math.cos(target.angle - current.angle)) * amount
    return current
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
    if (!player || !this.local || this.localId !== localId) {
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
        const moving = { ...this.local, pregnant: player.pregnant }
        moveRabbit(moving, input, delta, this.movement)
        Object.assign(this.local, pose(moving))
        remaining -= delta
      }
      const amount = 1 - Math.exp(-8 * elapsed)
      const dx = clamp(this.local.x + this.correction.x * amount, -45, 45) - this.local.x
      const dy = Math.max(0, this.local.y + this.correction.y * amount) - this.local.y
      const dz = clamp(this.local.z + this.correction.z * amount, -32, 32) - this.local.z
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

    const active = new Set<string>()
    const players = state.players.map((entry) => {
      if (entry.id === localId && this.local) return { ...entry, ...this.local }
      const key = `player:${entry.id}`
      active.add(key)
      return { ...entry, ...this.smooth(key, entry, elapsed) }
    })
    const predators = state.predators.map((entry) => {
      const key = `predator:${entry.id}`
      active.add(key)
      return { ...entry, ...this.smooth(key, entry, elapsed) }
    })
    for (const key of this.remotes.keys()) if (!active.has(key)) this.remotes.delete(key)
    return { ...state, time: this.visualTime, players, predators }
  }
}
