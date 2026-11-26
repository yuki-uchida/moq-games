import { coverAt, exposed, mapTerrain, SPRINT_NOISE, type GameState } from './game'
import { DiscoveryTracker } from './discoveries'
import { distance, STEALTH } from './stealth'
import { CAMPAIGN, nightVision } from './campaign'
import { ZONES, zonesAt } from './map'
import { inRect } from './stages/kit'
import { beamRect } from './stages/waterway/map'
import { CUES, soundBank, STAGE_BEDS, type CueId } from './sound-bank'

const COVER_GRACE_SECONDS = 0.5
const MASTER_GAIN = 1
const MAX_VOICES = 16
/** Bed level under each threat, relative to its calm level. */
const BED_LEVEL = { calm: 1, suspicious: 0.7, chase: 0.5 } as const

type Layer = { source: AudioBufferSourceNode; gain: GainNode }

export function bindAudioResume(doc: Document, resume: () => void): () => void {
  const wake = (event: Event) => {
    if (!doc.hidden && (event.type !== 'keydown' || !(event as KeyboardEvent).repeat)) resume()
  }
  const events = ['visibilitychange', 'pointerdown', 'keydown'] as const
  for (const type of events) doc.addEventListener(type, wake, { capture: true })
  return () => {
    for (const type of events) doc.removeEventListener(type, wake, { capture: true })
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
  private voices = new Set<AudioBufferSourceNode>()
  /** Looping music layers (stage bed and threat layers), kept across threat changes so they can crossfade. */
  private loops = new Map<CueId, Layer>()
  private muted = false
  private previous: Observation | null = null
  private lastQuery = -Infinity
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
        this.master.gain.value = this.muted ? 0 : MASTER_GAIN
        this.master.connect(this.context.destination)
        void soundBank(context).load()
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
    this.musicAfter = 0
    this.evadedWhileHidden = false
  }

  setMuted(muted: boolean): void {
    this.muted = muted
    if (muted) this.pendingAlarm = null
    if (muted) this.silence()
    if (this.master) this.master.gain.value = muted ? 0 : MASTER_GAIN
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
      if (
        (previous.phase !== next.phase && next.phase !== 'lost') ||
        (this.context?.currentTime ?? 0) >= this.musicAfter
      ) {
        const query = this.pendingQuery
        // A threat change crossfades the music layers; a phase change ends them.
        this.silence(previous.phase === next.phase)
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
      this.play(next.phase === 'won' ? 'won' : 'lost')
    }
    if (next.phase !== 'playing') return
    if ([...previous.nests].some((id) => !next.nests.has(id))) this.play('nest-broken')
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
    if (next.chapter > previous.chapter || next.stage > previous.stage) this.play('chapter')
    else if (next.bedding > previous.bedding) this.play('bedding')
    if (next.kitsLost > previous.kitsLost) this.play('kit-lost')
    if (!player || previous.playerId !== localPlayerId) return
    if (!previous.pregnant && next.pregnant) this.play('bloom')
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
    this.play('query')
  }

  /** Stops every sting; the music layers too unless `keepMusic` (they then follow the threat in music()). */
  private silence(keepMusic = false): void {
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
    if (!keepMusic) for (const id of [...this.loops.keys()]) this.release(id)
  }

  /** Keeps the stage bed and the threat layers playing at their levels for the current threat. */
  private music(): void {
    const context = this.context
    if (this.previous?.phase !== 'playing' || !context) return
    if (context.currentTime < this.musicAfter) return
    const threat = this.previous.threat
    const wanted = new Map<CueId, number>([[STAGE_BEDS[this.previous.stage] ?? 'bed-forest', BED_LEVEL[threat]]])
    if (threat !== 'calm') wanted.set('tension-search', 1)
    if (threat === 'chase') wanted.set('tension-chase', 1)
    for (const id of [...this.loops.keys()]) if (!wanted.has(id)) this.release(id, 0.25)
    for (const [id, level] of wanted) {
      const layer = this.loops.get(id)
      if (!layer) {
        const started = this.play(id, { level, loop: true })
        if (started) this.loops.set(id, started)
        continue
      }
      try {
        layer.gain.gain.setTargetAtTime(CUES[id].gain * level, context.currentTime, 0.25)
      } catch {}
    }
  }

  /** Fades out and stops one music layer. */
  private release(id: CueId, fade = 0.03): void {
    const layer = this.loops.get(id)
    if (!layer) return
    this.loops.delete(id)
    try {
      const now = this.context?.currentTime ?? 0
      layer.gain.gain.setTargetAtTime(0, now, fade)
      layer.source.stop(now + fade * 5)
    } catch {
      layer.source.disconnect()
      layer.gain.disconnect()
    }
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
    this.play('alarm-hit')
    this.play('alarm-crow', { delay: 0.03 })
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

  /** Plays a recorded cue (looped for music layers, which fade in and do not count as voices). */
  private play(id: CueId, { delay = 0, level = 1, loop = false } = {}): Layer | undefined {
    const context = this.context
    if (!context || !this.master || this.muted || context.state !== 'running') return
    if (!loop && this.voices.size >= MAX_VOICES) return
    const buffer = soundBank(context).get(id)
    if (!buffer) return
    try {
      const source = context.createBufferSource()
      const gain = context.createGain()
      const start = context.currentTime + delay
      const volume = CUES[id].gain * level
      source.buffer = buffer
      source.loop = loop
      if (loop) {
        gain.gain.setValueAtTime(0, start)
        gain.gain.linearRampToValueAtTime(volume, start + 0.6)
      } else gain.gain.setValueAtTime(volume, start)
      source.connect(gain)
      gain.connect(this.master)
      if (!loop) this.voices.add(source)
      source.onended = () => {
        this.voices.delete(source)
        source.disconnect()
        gain.disconnect()
      }
      source.start(start)
      return { source, gain }
    } catch {
      return
    }
  }
}
