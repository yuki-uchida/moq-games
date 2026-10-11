import { RuntimeAtlasCache } from './RuntimeAtlasCache'
import type { WholeFrameSample } from './WholeFrameAtlas'

export class EquipmentArtCache {
  private clips: Readonly<Record<string, string>> = {}
  private disposed = false
  constructor(private readonly cache = new RuntimeAtlasCache()) {}

  select(clips: Readonly<Record<string, string>>): void {
    if (this.disposed) return
    const retained = new Set(Object.values(clips))
    this.cache.invalidate(Object.values(this.clips).filter((url) => !retained.has(url)))
    this.clips = { ...clips }
  }

  sample(key: string, elapsedMs: number): WholeFrameSample | undefined {
    if (this.disposed) return undefined
    const url = this.clips[key]
    if (!url) return undefined
    this.cache.beginFrame()
    const frame = this.cache.get(url)?.sample(elapsedMs)
    this.cache.endFrame()
    return frame
  }

  get residentBytes(): number {
    return this.cache.residentBytes
  }

  dispose(): void {
    if (this.disposed) return
    this.disposed = true
    this.clips = {}
    this.cache.dispose()
  }
}
