import {
  soundEventKey,
  type CombatSoundEvent,
  type CombatSoundKind,
  type SoundUnitType
} from '../game/CombatSoundEvents'

export interface SoundCatalogEntry {
  id: string
  unitType: SoundUnitType
  kind: CombatSoundKind
  url: string
  sha256: string
  durationSeconds: number
}

export type SoundPlayerState = 'locked' | 'loading' | 'ready' | 'suspended' | 'unavailable' | 'error' | 'destroyed'

export interface SoundPlayerStatus {
  state: SoundPlayerState
  enabled: boolean
  volume: number
  ready: number
  total: number
  failed: number
  message: string
}

export interface SoundPlayerDiagnostics extends SoundPlayerStatus {
  activeVoices: number
  queuedLoads: number
  loading: number
  played: number
  dropped: number
  recentEventCount: number
}

interface SoundAsset {
  entry: SoundCatalogEntry
  state: 'idle' | 'queued' | 'loading' | 'ready' | 'failed'
  attempts: number
  buffer?: AudioBuffer
  peak: number
  error?: string
}

interface SoundVoice {
  source: AudioBufferSourceNode
  gain: GainNode
  peak: number
}

const MAX_LOADS = 4
const MAX_VOICES = 8
const MAX_RECENT_EVENTS = 256
const MAX_EVENT_AGE = 0.15
const EVENT_TIME_EPSILON = 1e-9
const MAX_DURATION = 10
const MAX_ASSET_BYTES = 4 * 1024 * 1024
const MAX_LOAD_ATTEMPTS = 3
const MIX_HEADROOM = 0.9

export class SoundPlayer {
  private context: AudioContext | null = null
  private master: GainNode | null = null
  private readonly assets = new Map<string, SoundAsset>()
  private readonly cues = new Map<string, SoundAsset>()
  private readonly loadQueue: SoundAsset[] = []
  private readonly requests = new Set<AbortController>()
  private readonly voices = new Set<SoundVoice>()
  private readonly recentEvents = new Set<string>()
  private currentBattle: { battleId: number; stage: number } | null = null
  private resumePending: Promise<void> | null = null
  private activeLoads = 0
  private played = 0
  private dropped = 0
  private isEnabled = true
  private gainVolume = 0.2
  private isDestroyed = false
  private unavailable = false
  private contextError = ''
  private lastPublished = ''

  constructor(
    catalog: readonly SoundCatalogEntry[],
    private readonly onStatus?: (status: SoundPlayerStatus) => void
  ) {
    for (const entry of catalog) {
      const cue = soundEventKey(entry)
      if (!cue) continue
      const key = `${entry.url}\n${entry.sha256.toLowerCase()}`
      let asset = this.assets.get(key)
      if (!asset) {
        asset = { entry: { ...entry }, state: 'idle', attempts: 0, peak: 0 }
        this.assets.set(key, asset)
      }
      this.cues.set(cue, asset)
    }
    this.publishStatus()
  }

  get enabled(): boolean {
    return this.isEnabled
  }

  get volume(): number {
    return this.gainVolume
  }

  get status(): SoundPlayerStatus {
    const assets = [...this.assets.values()]
    const ready = assets.filter((asset) => asset.state === 'ready' && asset.buffer).length
    const failed = assets.filter((asset) => asset.state === 'failed').length
    let state: SoundPlayerState
    if (this.isDestroyed) state = 'destroyed'
    else if (this.unavailable) state = 'unavailable'
    else if (!this.context) state = 'locked'
    else if (this.contextError) state = 'error'
    else if (this.context.state !== 'running') state = 'suspended'
    else if (failed) state = 'error'
    else if (ready < assets.length) state = 'loading'
    else state = 'ready'
    const message =
      this.contextError || assets.find((asset) => asset.state === 'failed')?.error || this.statusMessage(state)
    return { state, enabled: this.isEnabled, volume: this.gainVolume, ready, total: assets.length, failed, message }
  }

  get diagnostics(): SoundPlayerDiagnostics {
    return {
      ...this.status,
      activeVoices: this.voices.size,
      queuedLoads: this.loadQueue.length,
      loading: this.activeLoads,
      played: this.played,
      dropped: this.dropped,
      recentEventCount: this.recentEvents.size
    }
  }

  unlock(): Promise<void> {
    if (this.isDestroyed) return Promise.resolve()
    // A resume attempted before mobile activation may remain pending indefinitely.
    // A later trusted gesture must still call resume synchronously.
    if (this.resumePending && this.context?.state === 'running') return this.resumePending
    try {
      if (!this.context) {
        const AudioContextClass = globalThis.AudioContext
        if (!AudioContextClass) {
          this.unavailable = true
          this.publishStatus()
          return Promise.resolve()
        }
        this.context = new AudioContextClass()
        this.master = this.context.createGain()
        this.updateMasterGain()
        this.master.connect(this.context.destination)
        this.context.onstatechange = () => {
          if (this.context?.state !== 'running') this.stopVoices()
          this.publishStatus()
        }
      }
      this.unavailable = false
      this.contextError = ''
      const resumed = this.context.state === 'running' ? Promise.resolve() : this.context.resume()
      const pending = resumed
        .then(() => {
          if (this.isDestroyed) return
          for (const asset of this.assets.values()) this.ensureLoad(asset)
        })
        .catch(() => {
          if (!this.isDestroyed) this.contextError = '音声を開始できません。操作して再試行してください。'
        })
        .finally(() => {
          if (this.resumePending === pending) this.resumePending = null
          this.publishStatus()
        })
      this.resumePending = pending
      return pending
    } catch {
      this.unavailable = true
      this.publishStatus()
      return Promise.resolve()
    }
  }

  setEnabled(enabled: boolean): void {
    if (this.isDestroyed) return
    this.isEnabled = enabled
    this.updateMasterGain()
    if (!enabled) this.stopVoices()
    this.publishStatus()
  }

  setVolume(volume: number): void {
    if (this.isDestroyed || !Number.isFinite(volume)) return
    this.gainVolume = Math.max(0, Math.min(1, volume))
    this.updateMasterGain()
    if (this.gainVolume === 0) this.stopVoices()
    this.publishStatus()
  }

  setBattle(battleId: number, stage: number): void {
    if (this.isDestroyed || (this.currentBattle?.battleId === battleId && this.currentBattle.stage === stage)) return
    this.stopVoices()
    this.recentEvents.clear()
    this.currentBattle =
      Number.isSafeInteger(battleId) && Number.isSafeInteger(stage) && stage > 0 ? { battleId, stage } : null
  }

  consume(events: readonly CombatSoundEvent[], simulationTime: number): void {
    if (this.isDestroyed) return
    for (const event of events) {
      if (
        !this.currentBattle ||
        event.battleId !== this.currentBattle.battleId ||
        event.stage !== this.currentBattle.stage ||
        !event.id ||
        this.recentEvents.has(event.id)
      ) {
        this.dropped++
        continue
      }
      this.recentEvents.add(event.id)
      if (this.recentEvents.size > MAX_RECENT_EVENTS) this.recentEvents.delete(this.recentEvents.values().next().value!)
      const asset = this.cues.get(soundEventKey(event) ?? '')
      if (asset) this.ensureLoad(asset)
      if (
        !Number.isFinite(simulationTime) ||
        !Number.isFinite(event.at) ||
        event.at < 0 ||
        event.at > simulationTime + EVENT_TIME_EPSILON ||
        simulationTime - event.at > MAX_EVENT_AGE ||
        !this.isEnabled ||
        this.gainVolume === 0 ||
        this.context?.state !== 'running' ||
        !asset?.buffer ||
        asset.state !== 'ready'
      ) {
        this.dropped++
        continue
      }
      this.play(asset)
    }
  }

  retryFailed(): void {
    if (this.isDestroyed) return
    for (const asset of this.assets.values()) {
      if (asset.state !== 'failed' || asset.attempts >= MAX_LOAD_ATTEMPTS) continue
      asset.state = 'idle'
      asset.error = undefined
      this.ensureLoad(asset)
    }
    this.publishStatus()
  }

  destroy(): void {
    if (this.isDestroyed) return
    this.isDestroyed = true
    this.stopVoices()
    for (const request of this.requests) request.abort()
    this.loadQueue.length = 0
    this.recentEvents.clear()
    for (const asset of this.assets.values()) asset.buffer = undefined
    if (this.context) {
      this.context.onstatechange = null
      void this.context.close().catch(() => {})
    }
    this.master?.disconnect()
    this.publishStatus()
  }

  private ensureLoad(asset: SoundAsset): void {
    if (this.isDestroyed || !this.context || asset.state !== 'idle') return
    asset.state = 'queued'
    this.loadQueue.push(asset)
    this.pumpLoads()
  }

  private pumpLoads(): void {
    while (!this.isDestroyed && this.activeLoads < MAX_LOADS && this.loadQueue.length) {
      const asset = this.loadQueue.shift()!
      asset.state = 'loading'
      asset.attempts++
      this.activeLoads++
      void this.load(asset).finally(() => {
        this.activeLoads--
        this.pumpLoads()
        this.publishStatus()
      })
    }
    this.publishStatus()
  }

  private async load(asset: SoundAsset): Promise<void> {
    const request = new AbortController()
    this.requests.add(request)
    try {
      const { entry } = asset
      if (
        !/^[a-f\d]{64}$/i.test(entry.sha256) ||
        !Number.isFinite(entry.durationSeconds) ||
        entry.durationSeconds <= 0 ||
        entry.durationSeconds > MAX_DURATION
      )
        throw new Error('invalid metadata')
      const response = await fetch(entry.url, { signal: request.signal })
      if (!response.ok) throw new Error(`HTTP ${response.status}`)
      if (Number(response.headers.get('content-length')) > MAX_ASSET_BYTES) throw new Error('asset too large')
      const bytes = await response.arrayBuffer()
      if (!bytes.byteLength || bytes.byteLength > MAX_ASSET_BYTES) throw new Error('invalid asset size')
      const digest = await globalThis.crypto.subtle.digest('SHA-256', bytes)
      const sha256 = [...new Uint8Array(digest)].map((byte) => byte.toString(16).padStart(2, '0')).join('')
      if (sha256 !== entry.sha256.toLowerCase()) throw new Error('SHA-256 mismatch')
      if (this.isDestroyed || !this.context) return
      const buffer = await this.context.decodeAudioData(bytes)
      if (this.isDestroyed) return
      if (
        !Number.isFinite(buffer.duration) ||
        buffer.duration <= 0 ||
        buffer.duration > MAX_DURATION ||
        Math.abs(buffer.duration - entry.durationSeconds) > Math.max(0.1, entry.durationSeconds * 0.02) ||
        buffer.numberOfChannels < 1 ||
        buffer.numberOfChannels > 2
      )
        throw new Error('invalid decoded audio')
      let peak = 0
      for (let channel = 0; channel < buffer.numberOfChannels; channel++) {
        for (const sample of buffer.getChannelData(channel)) {
          if (!Number.isFinite(sample) || Math.abs(sample) > 1) throw new Error('invalid decoded sample')
          peak = Math.max(peak, Math.abs(sample))
        }
      }
      asset.peak = peak
      asset.buffer = buffer
      asset.state = 'ready'
      asset.error = undefined
    } catch {
      if (!this.isDestroyed) {
        asset.state = 'failed'
        asset.error = `効果音を読み込めませんでした: ${asset.entry.id}`
      }
    } finally {
      this.requests.delete(request)
    }
  }

  private play(asset: SoundAsset): void {
    const context = this.context
    if (!context || !this.master || !asset.buffer) return
    while (this.voices.size >= MAX_VOICES) this.removeVoice(this.voices.values().next().value!, true)
    let voice: SoundVoice | undefined
    try {
      const source = context.createBufferSource()
      const gain = context.createGain()
      voice = { source, gain, peak: asset.peak }
      source.buffer = asset.buffer
      source.connect(gain)
      gain.connect(this.master)
      this.voices.add(voice)
      const playingVoice = voice
      source.onended = () => this.removeVoice(playingVoice, false)
      this.updateVoiceGains()
      source.start(context.currentTime)
      this.played++
    } catch {
      if (voice) this.removeVoice(voice, true)
      this.dropped++
      this.contextError = '効果音を再生できません。操作して再試行してください。'
      this.publishStatus()
    }
  }

  private updateMasterGain(): void {
    if (!this.master || !this.context) return
    this.master.gain.setValueAtTime(this.isEnabled ? this.gainVolume : 0, this.context.currentTime)
  }

  private updateVoiceGains(): void {
    if (!this.context) return
    const peakSum = [...this.voices].reduce((sum, voice) => sum + voice.peak, 0)
    const gain = peakSum > 0 ? Math.min(1, MIX_HEADROOM / peakSum) : 1
    for (const voice of this.voices) voice.gain.gain.setValueAtTime(gain, this.context.currentTime)
  }

  private removeVoice(voice: SoundVoice, stop: boolean): void {
    if (!this.voices.delete(voice)) return
    voice.source.onended = null
    if (stop) {
      try {
        voice.source.stop()
      } catch {}
    }
    voice.source.disconnect()
    voice.gain.disconnect()
    this.updateVoiceGains()
  }

  private stopVoices(): void {
    for (const voice of [...this.voices]) this.removeVoice(voice, true)
  }

  private publishStatus(): void {
    const status = this.status
    const serialized = JSON.stringify(status)
    if (serialized === this.lastPublished) return
    this.lastPublished = serialized
    try {
      this.onStatus?.(status)
    } catch {}
  }

  private statusMessage(state: SoundPlayerState): string {
    switch (state) {
      case 'locked':
        return '画面を操作すると効果音を有効にできます。'
      case 'loading':
        return '効果音を読み込み中です。'
      case 'ready':
        return '効果音の準備ができました。'
      case 'suspended':
        return '効果音は一時停止中です。操作して再開できます。'
      case 'unavailable':
        return 'この環境では効果音を利用できません。'
      case 'error':
        return '一部の効果音を利用できません。'
      case 'destroyed':
        return '効果音を終了しました。'
    }
  }
}
