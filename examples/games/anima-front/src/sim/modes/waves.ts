/**
 * Wave director (DESIGN §12): schedules each wave's spawn groups in bursts (counts × peak / 90), spawns them at the
 * map's tagged spawn points while the live count is below the difficulty peak (the rest waits in a queue), detects
 * clears and — for auto-paced missions — starts the next wave 8 s after a clear or 70 s after the wave began.
 */
import { FOES, type FoeKind } from '../../data/enemies'
import type { MissionDef } from '../../data/missions'
import { WAVE_GAP, WAVE_MAX } from '../constants'
import { spawnFoe } from '../foes/index'
import { settle } from '../player'
import { emit, type Foe, type Sim } from '../state'
import type { Vec } from '../vec'
import { foeSpawnPoints } from './common'

interface Pending {
  kind: FoeKind
  at: number
  tag: string | undefined
  wave: number
}

export class WaveDirector {
  current = -1
  private startedAt = 0
  private clearedAt = -1
  private queue: Pending[] = []
  private serial = 0

  constructor(
    private readonly mission: MissionDef,
    private readonly peak: number,
    private readonly tagFor: (kind: FoeKind, k: number) => string | undefined,
    private readonly auto: boolean
  ) {}

  get waves() {
    return this.mission.waves.length
  }

  start(sim: Sim, i: number, boss = false) {
    if (i < 0 || i >= this.waves) return
    this.current = i
    this.startedAt = sim.time
    this.clearedAt = -1
    const w = this.mission.waves[i]
    emit(sim, { type: 'wave', wave: i + 1, waves: this.waves, ...(boss ? { boss: true } : {}) })
    if (w.radio) emit(sim, { type: 'radio', who: w.radio.who, text: w.radio.text })
    const scale = this.peak / 90
    for (const g of w.groups) {
      const n = Math.max(1, Math.round(g.count * scale))
      const burst = Math.max(1, g.burst ?? 4)
      const interval = g.interval ?? 0.35
      for (let k = 0; k < n; k++) {
        this.queue.push({
          kind: g.kind,
          at: sim.time + g.delay + Math.floor(k / burst) * interval,
          tag: g.tag ?? this.tagFor(g.kind, this.serial++),
          wave: i
        })
      }
    }
    this.queue.sort((a, b) => a.at - b.at)
  }

  /** Immediate extra spawns that do not belong to a wave (node spawns). */
  extra(sim: Sim, kind: FoeKind, count: number, tag?: string) {
    const n = Math.max(1, Math.round(count * (this.peak / 90)))
    for (let k = 0; k < n; k++) this.queue.push({ kind, at: sim.time + k * 0.3, tag, wave: -2 })
    this.queue.sort((a, b) => a.at - b.at)
  }

  private live(sim: Sim) {
    let n = 0
    for (const f of sim.foes) if (!f.dead) n++
    return n
  }

  private spawnOne(sim: Sim, q: Pending) {
    const flying = !!FOES[q.kind].flying
    const pts = foeSpawnPoints(sim, q.tag, flying)
    const s = pts[sim.rng.int(pts.length)]
    const j = FOES[q.kind].boss ? 0 : 2
    let at: Vec = [s.p[0] + sim.rng.range(-j, j), s.p[1], s.p[2] + sim.rng.range(-j, j)]
    if (!sim.phys.inBounds(at[0], at[2], 1)) at = [s.p[0], s.p[1], s.p[2]]
    if (!flying) at = settle(sim, at, FOES[q.kind].radius)
    spawnFoe(sim, q.kind, at, { wave: q.wave })
  }

  update(sim: Sim) {
    let live = this.live(sim)
    while (this.queue.length && this.queue[0].at <= sim.time && live < this.peak) {
      this.spawnOne(sim, this.queue.shift()!)
      live++
    }
    if (this.current >= 0 && this.clearedAt < 0 && this.waveDone(sim, this.current)) {
      this.clearedAt = sim.time
      emit(sim, { type: 'waveClear', wave: this.current + 1 })
    }
    if (this.auto && this.current >= 0 && this.current < this.waves - 1) {
      const cleared = this.clearedAt >= 0 && sim.time - this.clearedAt >= WAVE_GAP
      if (cleared || sim.time - this.startedAt >= WAVE_MAX) this.start(sim, this.current + 1)
    }
  }

  private waveDone(sim: Sim, i: number) {
    if (this.queue.some((q) => q.wave === i)) return false
    return !sim.foes.some((f: Foe) => !f.dead && f.wave === i)
  }

  /** Every wave has started, nothing is queued and no wave foe is alive. */
  allCleared(sim: Sim) {
    if (this.current < this.waves - 1 || this.queue.some((q) => q.wave >= 0)) return false
    return !sim.foes.some((f) => !f.dead && f.wave >= 0)
  }

  nextIn(sim: Sim) {
    if (!this.auto || this.current < 0 || this.current >= this.waves - 1) return 0
    if (this.clearedAt >= 0) return Math.max(0, WAVE_GAP - (sim.time - this.clearedAt))
    return 0
  }

  queued() {
    return this.queue.length
  }

  onKilled(_sim: Sim, _f: Foe) {}
}
