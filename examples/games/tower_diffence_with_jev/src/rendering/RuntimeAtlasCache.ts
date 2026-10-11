import { loadRuntimeWholeFrameAtlas, RUNTIME_ATLAS_MAX_BYTES, type WholeFrameAtlas } from './WholeFrameAtlas'

type Loader = (url: string, signal: AbortSignal) => Promise<WholeFrameAtlas>
interface Entry {
  atlas: WholeFrameAtlas
  bytes: number
  touched: number
  resourceKey: string
}

export class RuntimeAtlasCache {
  private entries = new Map<string, Entry>()
  private pending = new Map<string, AbortController>()
  private failures = new Map<string, string>()
  private knownSources = new Map<string, { bytes: number; resourceKey: string }>()
  private used = new Set<string>()
  private usedBytes = 0
  private usedResources = new Set<string>()
  private tick = 0
  private disposed = false

  constructor(
    private load: Loader = loadRuntimeWholeFrameAtlas,
    private maxBytes = 160 * 1024 * 1024,
    private maxConcurrent = 2
  ) {
    if (
      !Number.isSafeInteger(maxBytes) ||
      maxBytes <= 0 ||
      !Number.isSafeInteger(maxConcurrent) ||
      maxConcurrent <= 0 ||
      maxConcurrent > 2
    )
      throw new Error('Invalid runtime atlas cache limits')
  }

  beginFrame(): void {
    this.used.clear()
    this.usedResources.clear()
    this.usedBytes = 0
  }

  get(url: string, pin = true): WholeFrameAtlas | undefined {
    if (this.disposed) return undefined
    const entry = this.entries.get(url)
    if (entry) {
      if (pin && !this.used.has(url)) {
        if (!this.usedResources.has(entry.resourceKey)) {
          if (this.usedBytes + entry.bytes > this.maxBytes) return undefined
          this.usedResources.add(entry.resourceKey)
          this.usedBytes += entry.bytes
        }
        this.used.add(url)
      }
      entry.touched = ++this.tick
      return entry.atlas
    }
    if (this.pending.has(url) || this.failures.has(url) || this.pending.size >= this.maxConcurrent) return undefined
    const known = this.knownSources.get(url)
    if (known && !this.usedResources.has(known.resourceKey) && this.usedBytes + known.bytes > this.maxBytes)
      return undefined
    const controller = new AbortController()
    this.pending.set(url, controller)
    void Promise.resolve()
      .then(() => this.load(url, controller.signal))
      .then((atlas) => {
        if (this.disposed || controller.signal.aborted) {
          atlas.dispose()
          return
        }
        const bytes = atlas.manifest.textureWidth * atlas.manifest.textureHeight * 4
        if (!Number.isSafeInteger(bytes) || bytes <= 0 || bytes > Math.min(this.maxBytes, RUNTIME_ATLAS_MAX_BYTES)) {
          atlas.dispose()
          throw new Error('Runtime atlas exceeds the decoded memory budget')
        }
        const resourceKey = atlas.resourceKey ?? url
        this.knownSources.set(url, { bytes, resourceKey })
        this.entries.set(url, { atlas, bytes, touched: ++this.tick, resourceKey })
      })
      .catch((error) => {
        if (!this.disposed && !controller.signal.aborted) this.failures.set(url, String(error))
      })
      .finally(() => {
        if (this.pending.get(url) === controller) this.pending.delete(url)
      })
    return undefined
  }

  endFrame(): void {
    const unused = [...this.entries]
      .filter(([, entry]) => !this.usedResources.has(entry.resourceKey))
      .sort((a, b) => a[1].touched - b[1].touched)
    for (const [url, entry] of unused) {
      if (this.residentBytes <= this.maxBytes) break
      this.entries.delete(url)
      entry.atlas.dispose()
    }
  }

  get residentBytes(): number {
    return [...new Map([...this.entries.values()].map((entry) => [entry.resourceKey, entry.bytes])).values()].reduce(
      (sum, bytes) => sum + bytes,
      0
    )
  }
  get inFlight(): number {
    return this.pending.size
  }
  error(url: string): string | undefined {
    return this.failures.get(url)
  }

  invalidate(urls: Iterable<string>): void {
    for (const url of urls) {
      this.pending.get(url)?.abort()
      this.pending.delete(url)
      this.entries.get(url)?.atlas.dispose()
      this.entries.delete(url)
      this.failures.delete(url)
      this.knownSources.delete(url)
      this.used.delete(url)
    }
    this.usedResources.clear()
    this.usedBytes = 0
    for (const url of this.used) {
      const entry = this.entries.get(url)
      if (entry && !this.usedResources.has(entry.resourceKey)) {
        this.usedResources.add(entry.resourceKey)
        this.usedBytes += entry.bytes
      }
    }
  }

  dispose(): void {
    if (this.disposed) return
    this.disposed = true
    for (const controller of this.pending.values()) controller.abort()
    for (const entry of this.entries.values()) entry.atlas.dispose()
    this.entries.clear()
    this.failures.clear()
    this.knownSources.clear()
    this.used.clear()
    this.usedResources.clear()
    this.usedBytes = 0
  }
}
