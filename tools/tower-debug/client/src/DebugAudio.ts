import type { AssetRef } from './contracts'
import { verifiedBytes } from './api'

export class DebugAudio {
  private context: AudioContext | null = null
  private gain: GainNode | null = null
  private voice: AudioBufferSourceNode | null = null
  private buffer: AudioBuffer | null = null
  private loadedId: string | null = null
  private loading: AbortController | null = null
  private generation = 0
  private disposed = false
  volume = 0.2
  muted = false
  constructor(
    private readonly status: (message: string) => void,
    private readonly createContext = () => new AudioContext(),
    private readonly loadBytes = verifiedBytes
  ) {}
  async unlockFromGesture(): Promise<void> {
    if (this.disposed) throw new Error('Audio player disposed')
    if (!this.context) {
      this.context = this.createContext()
      this.gain = this.context.createGain()
      this.gain.connect(this.context.destination)
      this.updateGain()
    }
    if (this.context.state !== 'running') await this.context.resume()
  }
  async prepare(reference: AssetRef): Promise<boolean> {
    if (this.disposed) return false
    this.stop()
    this.loading?.abort()
    this.buffer = null
    this.loadedId = null
    const generation = ++this.generation
    const controller = (this.loading = new AbortController())
    if (!this.context) {
      this.status('音声を有効にしてから試聴してください')
      return false
    }
    try {
      const bytes = await this.loadBytes(reference, controller.signal)
      if (generation !== this.generation) return false
      const buffer = await this.context.decodeAudioData(bytes)
      if (generation !== this.generation) return false
      this.buffer = buffer
      this.loadedId = reference.assetId
      this.status('読み込み済み・未採用')
      return true
    } catch (error) {
      if (generation === this.generation && !controller.signal.aborted)
        this.status(`音声を読み込めません: ${String(error)}`)
      return false
    }
  }
  playReady(reference: AssetRef, loop = false): boolean {
    if (
      !this.context ||
      this.context.state !== 'running' ||
      !this.gain ||
      !this.buffer ||
      this.loadedId !== reference.assetId ||
      this.muted
    )
      return false
    this.stop()
    const voice = this.context.createBufferSource()
    voice.buffer = this.buffer
    voice.loop = loop
    voice.playbackRate.value = 1
    voice.connect(this.gain)
    voice.onended = () => {
      voice.disconnect()
      if (this.voice === voice) this.voice = null
    }
    this.voice = voice
    voice.start()
    return true
  }
  async auditionFromGesture(reference: AssetRef, loop = false): Promise<void> {
    const gestureGeneration = this.generation
    await this.unlockFromGesture()
    if (gestureGeneration !== this.generation || this.disposed) return
    const pending = this.prepare(reference)
    const loadGeneration = this.generation
    const ready = await pending
    if (ready && loadGeneration === this.generation && !this.disposed) this.playReady(reference, loop)
  }
  setVolume(value: number): void {
    this.volume = Number.isFinite(value) ? Math.max(0, Math.min(1, value)) : 0.2
    this.updateGain()
  }
  setMuted(value: boolean): void {
    this.muted = value
    if (value) this.stop()
    this.updateGain()
  }
  private updateGain(): void {
    if (this.gain && this.context) this.gain.gain.setValueAtTime(this.muted ? 0 : this.volume, this.context.currentTime)
  }
  stop(): void {
    this.loading?.abort()
    this.generation++
    if (this.voice) {
      this.voice.onended = null
      this.voice.stop()
      this.voice.disconnect()
      this.voice = null
    }
  }
  cancelSelection(): void {
    this.stop()
    this.loading?.abort()
    this.generation++
    this.buffer = null
    this.loadedId = null
  }
  async dispose(): Promise<void> {
    this.disposed = true
    this.cancelSelection()
    this.gain?.disconnect()
    const context = this.context
    this.context = null
    this.gain = null
    if (context && context.state !== 'closed') await context.close()
  }
}
