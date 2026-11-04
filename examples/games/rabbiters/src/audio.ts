import { coverAt, exposed, mapTerrain, SPRINT_NOISE, type GameState } from './game'
import { DiscoveryTracker } from './discoveries'
import { distance, STEALTH } from './stealth'
import { CAMPAIGN, nightVision } from './campaign'
import { ZONES, zonesAt } from './map'
import { inRect } from './stages/kit'
import { beamRect } from './stages/waterway/map'

const COVER_GRACE_SECONDS = 0.5

export function bindAudioResume(doc: Document, resume: () => void): () => void {
  const wake = (event: Event) => {
    if (!doc.hidden && (event.type !== 'keydown' || !(event as KeyboardEvent).repeat)) resume()
  }
  const events = ['visibilitychange', 'pointerdown', 'keydown'] as const
  for (const type of events) doc.addEventListener(type, wake, true)
  return () => {
    for (const type of events) doc.removeEventListener(type, wake, true)
  }
}

export class ThreatTracker {
  readonly targets = new Map<string, Set<string>>()
  private readonly obscuredSince = new Map<string, number>()

  reset(): void {
    this.targets.clear()
    this.obscuredSince.clear()
  }

  update(state: GameState): void {
    const retained = new Map(this.targets)
    const obscuredSince = new Map(this.obscuredSince)
    this.reset()
    if (state.phase !== 'playing') return
    const beam = ZONES.find((zone) => zone.id === 'beam')
    const worker = state.predators.find((predator) => predator.id === 'worker')
    const flashlight = worker && beam ? beamRect(worker) : undefined
    const activeTargets = new Map(
      [...state.players.filter((player) => !player.downed), ...state.kits].map((target) => [target.id, target])
    )
    for (const predator of state.predators) {
      if (predator.state === 'patrol') continue
      const targets = new Set(
        predator.state === 'suspicious'
          ? []
          : [...(retained.get(predator.id) ?? [])].filter((id) => {
              const target = activeTargets.get(id)
              if (!target) return false
              if (predator.state !== 'chase' || predator.targetId === id) return true
              const maximumLight = zonesAt(target.x, target.z).reduce(
                (light, zone) => light * (zone.id === 'beam' ? 1 : (zone.light ?? 1)),
                flashlight && inRect(target.x, target.z, flashlight) ? (beam?.light ?? 1) : 1
              )
              const maximumRange =
                STEALTH.sightRange[predator.kind] *
                SPRINT_NOISE *
                CAMPAIGN.carryDetection *
                Math.max(1, nightVision(predator.kind, state.time)) *
                maximumLight *
                STEALTH.farFraction
              const range = distance(predator, target)
              if (range > maximumRange) return false
              const sight = mapTerrain.sightLine(predator, target)
              const maximumReach = maximumRange * sight
              if (
                exposed(predator, target, coverAt(target.x, target.y, target.z, target.hidden)) &&
                sight > 0 &&
                (range < STEALTH.touchRange ||
                  (range < maximumReach &&
                    Math.cos(Math.atan2(target.x - predator.x, target.z - predator.z) - predator.angle) >
                      STEALTH.fieldOfView))
              )
                return true
              const key = JSON.stringify([predator.id, id])
              const since = obscuredSince.get(key) ?? state.time
              this.obscuredSince.set(key, since)
              return state.time - since < COVER_GRACE_SECONDS
            })
      )
      if (predator.targetId && activeTargets.has(predator.targetId)) targets.add(predator.targetId)
      if (targets.size) this.targets.set(predator.id, targets)
    }
  }
}

type Observation = {
  time: number
  playerId: string
  pregnant: boolean
  phase: GameState['phase']
  nests: Set<string>
  predators: Map<string, Pick<GameState['predators'][number], 'state' | 'targetId'>>
  threat: 'calm' | 'suspicious' | 'chase'
  chased: Set<string>
  chapter: number
  stage: number
  bedding: number
  kitsLost: number
}

export class RabbitersAudio {
  private readonly discoveries = new DiscoveryTracker()
  private context: AudioContext | null = null
  private master: GainNode | null = null
  private timer: ReturnType<typeof setInterval> | null = null
  private voices = new Set<OscillatorNode>()
  private muted = false
  private previous: Observation | null = null
  private lastQuery = -Infinity
  private beat = 0
  private musicAfter = 0
  private alarmUntil = 0
  private alarmReceived: number | null = null
  private evadedWhileHidden = false
  private pendingAlarm: { context: AudioContext; time: number; received: number } | null = null
  private pendingQuery: { context: AudioContext; time: number; received: number; predators: string[] } | null = null
  private readonly threats = new ThreatTracker()

  start(): void {
    try {
      if (!this.context || this.context.state === 'closed') {
        const Context =
          globalThis.AudioContext ??
          (globalThis as typeof globalThis & { webkitAudioContext?: typeof AudioContext }).webkitAudioContext
        if (!Context) return
        const pendingAlarm = this.pendingAlarm
        const pendingQuery = this.pendingQuery
        if (this.context) {
          this.context.onstatechange = null
          this.silence()
          this.master?.disconnect()
          this.musicAfter = 0
        }
        this.context = new Context()
        const context = this.context
        this.pendingAlarm = pendingAlarm ? { ...pendingAlarm, context } : null
        this.pendingQuery = pendingQuery ? { ...pendingQuery, context } : null
        context.onstatechange = () => this.playPendingAlarm(context)
        this.master = this.context.createGain()
        this.master.gain.value = this.muted ? 0 : 0.12
        this.master.connect(this.context.destination)
      }
      const context = this.context
      void context
        .resume()
        .then(() => this.playPendingAlarm(context))
        .catch(() => {})
      if (this.timer === null) this.timer = setInterval(() => this.music(), 250)
    } catch {
      this.stop()
    }
  }

  stop(): void {
    this.pendingAlarm = null
    this.discoveries.reset()
    if (this.timer !== null) clearInterval(this.timer)
    this.timer = null
    this.silence()
    try {
      if (this.context) this.context.onstatechange = null
      this.master?.disconnect()
      void this.context?.close().catch(() => {})
    } catch {}
    this.context = null
    this.master = null
    this.previous = null
    this.threats.reset()
    this.lastQuery = -Infinity
    this.beat = 0
    this.musicAfter = 0
    this.evadedWhileHidden = false
  }

  setMuted(muted: boolean): void {
    this.muted = muted
    if (muted) this.pendingAlarm = null
    if (muted) this.silence()
    if (this.master) this.master.gain.value = muted ? 0 : 0.12
  }

  update(state: GameState, localPlayerId: string): void {
    if (this.previous && state.time < this.previous.time) return
    if (this.previous && this.previous.stage !== (state.stage ?? 3)) this.threats.reset()
    const discoveries = this.discoveries.update(state)
    const player = state.players.find((entry) => entry.id === localPlayerId)
    this.threats.update(state)
    const next: Observation = {
      time: state.time,
      playerId: localPlayerId,
      pregnant: player?.pregnant ?? false,
      phase: state.phase,
      nests: new Set(state.nests.filter((nest) => nest.active).map((nest) => nest.id)),
      predators: new Map(
        state.predators.map((predator) => [predator.id, { state: predator.state, targetId: predator.targetId }])
      ),
      threat: state.predators.some((predator) => predator.state === 'chase')
        ? 'chase'
        : this.threats.targets.size > 0
          ? 'suspicious'
          : 'calm',
      chased: new Set(
        state.predators
          .filter((predator) => predator.state === 'chase')
          .flatMap((predator) => [...(this.threats.targets.get(predator.id) ?? [])])
      ),
      chapter: state.chapter,
      stage: state.stage ?? 3,
      bedding: state.bedding,
      kitsLost: state.kits.filter((kit) => kit.status === 'lost').length
    }
    const previous = this.previous
    this.previous = next
    if (previous && previous.chapter !== next.chapter) {
      this.pendingAlarm = null
      this.pendingQuery = null
    }
    if (previous && previous.stage !== next.stage) {
      this.pendingAlarm = null
      this.silence()
      this.musicAfter = 0
      this.lastQuery = -Infinity
    }
    if (
      this.pendingQuery &&
      (next.phase !== 'playing' ||
        previous?.playerId !== localPlayerId ||
        !player ||
        player.downed ||
        !this.pendingQuery.predators.some((id) => {
          const predator = next.predators.get(id)
          return predator?.state === 'suspicious' && predator.targetId === localPlayerId
        }))
    )
      this.pendingQuery = null
    if (
      !previous ||
      previous.playerId !== localPlayerId ||
      previous.stage !== next.stage ||
      next.phase !== 'playing' ||
      !player ||
      player.downed
    )
      this.evadedWhileHidden = false
    else if (player.hidden && previous.chased.has(localPlayerId) && !next.chased.has(localPlayerId))
      this.evadedWhileHidden = true
    const rediscoveredAfterHiding = this.evadedWhileHidden && next.chased.has(localPlayerId)
    if (rediscoveredAfterHiding) this.evadedWhileHidden = false
    if (next.phase !== 'playing' && next.phase !== 'lost') this.pendingAlarm = null
    if (!previous || (previous.phase !== 'playing' && next.phase === 'playing')) {
      if (previous) {
        this.silence()
        this.beat = 0
        this.musicAfter = 0
        this.lastQuery = -Infinity
      }
      if (
        next.phase === 'playing' &&
        player &&
        (next.chased.has(localPlayerId) ||
          discoveries.some(
            (entry) =>
              entry.targetId === localPlayerId &&
              (!previous || (entry.time !== undefined && entry.time > previous.time))
          ))
      ) {
        this.alarm()
      } else if (
        next.phase === 'playing' &&
        player &&
        !player.downed &&
        state.predators.some((predator) => predator.state === 'suspicious' && predator.targetId === localPlayerId)
      ) {
        this.query(state.time)
      }
      return
    }
    if (previous.threat !== next.threat || previous.phase !== next.phase) {
      this.beat = 0
      if (
        (previous.phase !== next.phase && next.phase !== 'lost') ||
        (this.context?.currentTime ?? 0) >= this.musicAfter
      ) {
        const query = this.pendingQuery
        this.silence()
        this.pendingQuery = query
        this.musicAfter = 0
      }
    }
    if (
      next.phase === 'lost' &&
      discoveries.some((entry) => entry.targetId === localPlayerId) &&
      (previous.stage !== next.stage || !previous.chased.has(localPlayerId))
    )
      this.alarm()
    if (previous.phase === 'playing' && next.phase !== 'playing') {
      this.chime(next.phase === 'won' ? [523, 659, 784, 1047] : [392, 330, 262, 196])
    }
    if (next.phase !== 'playing') return
    if ([...previous.nests].some((id) => !next.nests.has(id))) this.chime([180, 110, 65], 'sawtooth')
    // Any rabbit being spotted is a team-wide cue; "?" only sounds for suspicion aimed at you.
    if (
      rediscoveredAfterHiding ||
      discoveries.some(
        (entry) =>
          state.players.some((player) => player.id === entry.targetId) &&
          (previous.stage !== next.stage || !previous.chased.has(entry.targetId)) &&
          !(
            previous.stage === next.stage &&
            entry.targetId !== localPlayerId &&
            previous.predators.get(entry.predatorId)?.state === 'chase' &&
            next.predators.get(entry.predatorId)?.state === 'chase'
          )
      ) ||
      [...next.predators].some(
        ([id, predator]) =>
          predator.state === 'chase' &&
          predator.targetId &&
          next.chased.has(predator.targetId) &&
          (previous.stage !== next.stage || !previous.chased.has(predator.targetId)) &&
          ((player && predator.targetId === localPlayerId) ||
            previous.stage !== next.stage ||
            previous.predators.get(id)?.state !== 'chase')
      )
    ) {
      this.alarm()
    } else if (
      player &&
      !player.downed &&
      !next.chased.has(localPlayerId) &&
      state.predators.some((predator) => {
        const before = previous.stage === next.stage ? previous.predators.get(predator.id) : undefined
        return (
          predator.state === 'suspicious' &&
          predator.targetId === localPlayerId &&
          (before?.state !== 'chase' || before.targetId !== localPlayerId) &&
          (before?.state !== 'suspicious' || before.targetId !== localPlayerId)
        )
      })
    ) {
      this.query(state.time)
    }
    if (next.chapter > previous.chapter || next.stage > previous.stage) this.chime([392, 523, 659, 784, 1047])
    else if (next.bedding > previous.bedding) this.chime([587, 784])
    if (next.kitsLost > previous.kitsLost) this.chime([440, 330, 220], 'triangle')
    if (!player || previous.playerId !== localPlayerId) return
    if (!previous.pregnant && next.pregnant) this.chime([523, 659, 880])
  }

  private query(time: number): void {
    if (time - this.lastQuery < 2) return
    if (
      !this.context ||
      this.muted ||
      this.pendingAlarm ||
      (this.context.currentTime < this.alarmUntil &&
        this.alarmReceived !== null &&
        Date.now() - this.alarmReceived < 550)
    )
      return
    if (this.context.state !== 'running') {
      this.pendingQuery = {
        context: this.context,
        time,
        received: Date.now(),
        predators: [...this.previous!.predators]
          .filter(([, predator]) => predator.state === 'suspicious' && predator.targetId === this.previous!.playerId)
          .map(([id]) => id)
      }
      return
    }
    this.pendingQuery = null
    this.lastQuery = time
    this.tone(494, 0.12, 'triangle', 0, 520, 0.07)
    this.tone(587, 0.22, 'triangle', 0.11, 659, 0.07)
  }

  private silence(): void {
    this.pendingQuery = null
    this.alarmUntil = 0
    this.alarmReceived = null
    for (const voice of this.voices) {
      try {
        voice.stop()
      } catch {}
      voice.disconnect()
    }
    this.voices.clear()
  }

  private music(): void {
    if (this.previous?.phase !== 'playing') return
    if ((this.context?.currentTime ?? 0) < this.musicAfter) return
    if (this.previous.threat !== 'calm') {
      const step = this.beat++ % 8
      if (this.previous.threat === 'chase') {
        const bass = [98, 98, 104, 98, 98, 92, 104, 92][step]
        this.tone(bass, 0.22, 'triangle', 0, bass, 0.28, 0.6)
        this.tone(bass * 4, 0.1, 'square', 0.125, bass * 4, 0.14, 0.4)
        this.tone(step % 2 === 0 ? 150 : 120, 0.1, 'sine', 0, 48, 0.26)
        if (step % 2 === 1) this.tone(1760, 0.045, 'triangle', 0.125, 880, 0.06)
        if (step === 3 || step === 7) this.tone(587, 0.12, 'sine', 0.125, 740, 0.1, 0.3)
      } else if (step % 2 === 0) {
        this.tone(step % 4 === 0 ? 392 : 416, 0.36, 'triangle', 0, 370, 0.14, 0.45)
      }
      return
    }
    const melody = [72, 76, 79, 76, 74, 79, 81, 79, 76, 72, 69, 72, 74, 71, 67, 71]
    const step = this.beat++ % melody.length
    this.tone(440 * 2 ** ((melody[step] - 69) / 12), 0.18, 'sine')
    if (step % 4 === 0) this.tone([131, 147, 110, 98][step / 4], 0.45, 'triangle')
  }

  private alarm(): void {
    this.pendingQuery = null
    if (!this.context || this.muted) return
    if (this.context.state !== 'running') {
      this.pendingAlarm = { context: this.context, time: this.previous!.time, received: Date.now() }
      return
    }
    if (
      this.context.currentTime < this.alarmUntil &&
      this.alarmReceived !== null &&
      Date.now() - this.alarmReceived < 550
    )
      return
    this.pendingAlarm = null
    this.silence()
    this.alarmReceived = Date.now()
    this.alarmUntil = this.context.currentTime + 0.55
    this.musicAfter = this.context.currentTime + 0.55
    this.tone(160, 0.28, 'triangle', 0, 45, 0.36, 0.15)
    this.tone(830, 0.16, 'square', 0, 622, 0.36, 0.35)
    this.tone(1245, 0.22, 'triangle', 0.035, 932, 0.36, 0.4)
    this.tone(466, 0.36, 'sine', 0.16, 698, 0.36, 0.25)
  }

  private playPendingAlarm(context: AudioContext): void {
    if (this.context !== context || context.state !== 'running') return
    const query = this.pendingQuery
    if (
      context.currentTime < this.alarmUntil &&
      this.alarmReceived !== null &&
      Date.now() - this.alarmReceived >= 550
    ) {
      this.silence()
      this.musicAfter = 0
    }
    this.pendingQuery = null
    if (
      query?.context === context &&
      this.previous &&
      this.previous.time - query.time <= 0.55 &&
      Date.now() - query.received <= 550
    )
      this.query(this.previous.time)
    const pending = this.pendingAlarm
    if (!pending || pending.context !== context || this.context !== context || context.state !== 'running') return
    this.pendingAlarm = null
    if (
      !this.muted &&
      (this.previous?.phase === 'playing' || this.previous?.phase === 'lost') &&
      this.previous.time - pending.time <= 0.55 &&
      Date.now() - pending.received <= 550
    ) {
      this.alarm()
    }
  }

  private chime(notes: number[], type: OscillatorType = 'sine'): void {
    notes.forEach((frequency, index) => this.tone(frequency, 0.16, type, index * 0.09))
  }

  private tone(
    frequency: number,
    duration: number,
    type: OscillatorType,
    delay = 0,
    end = frequency,
    peak = 0.15,
    hold = 0
  ): void {
    const context = this.context
    if (!context || !this.master || this.muted || context.state !== 'running' || this.voices.size >= 16) return
    try {
      const oscillator = context.createOscillator()
      const envelope = context.createGain()
      const start = context.currentTime + delay
      oscillator.type = type
      oscillator.frequency.setValueAtTime(frequency, start)
      oscillator.frequency.exponentialRampToValueAtTime(end, start + duration)
      envelope.gain.setValueAtTime(0, start)
      envelope.gain.linearRampToValueAtTime(Math.min(peak, 0.36), start + 0.01)
      if (hold > 0) envelope.gain.setValueAtTime(Math.min(peak, 0.36), start + duration * hold)
      envelope.gain.exponentialRampToValueAtTime(0.001, start + duration)
      oscillator.connect(envelope)
      envelope.connect(this.master)
      this.voices.add(oscillator)
      oscillator.onended = () => {
        this.voices.delete(oscillator)
        oscillator.disconnect()
        envelope.disconnect()
      }
      oscillator.start(start)
      oscillator.stop(start + duration)
    } catch {}
  }
}
