// Recorded sound bank: WAVs rendered offline with Lumina SFX (see sounds/README.md). Each cue lists its measured
// loudness (max momentary LUFS of the file) and the level it should reach in the mix; the gain follows from both.

const cue = (file: string, measured: number, target: number) => ({
  url: file,
  gain: 10 ** ((target - measured) / 20)
})

export const CUES = {
  // Stage beds (index = stage: house, town, waterway, forest) and the threat layers over them.
  'bed-house': cue(new URL('./sounds/bed-house.wav', import.meta.url).href, -36.4, -45),
  'bed-town': cue(new URL('./sounds/bed-town.wav', import.meta.url).href, -34.1, -45),
  'bed-waterway': cue(new URL('./sounds/bed-waterway.wav', import.meta.url).href, -22.7, -45),
  'bed-forest': cue(new URL('./sounds/bed-forest.wav', import.meta.url).href, -32.8, -45),
  'tension-search': cue(new URL('./sounds/tension-search.wav', import.meta.url).href, -20.1, -42),
  'tension-chase': cue(new URL('./sounds/tension-chase.wav', import.meta.url).href, -19.9, -38),
  // Stings
  'alarm-hit': cue(new URL('./sounds/alarm-hit.wav', import.meta.url).href, -20.1, -30.5),
  'alarm-crow': cue(new URL('./sounds/alarm-crow.wav', import.meta.url).href, -19.3, -29.5),
  query: cue(new URL('./sounds/query.wav', import.meta.url).href, -23.4, -37),
  won: cue(new URL('./sounds/won.wav', import.meta.url).href, -25.7, -33),
  lost: cue(new URL('./sounds/lost.wav', import.meta.url).href, -24.7, -34),
  'nest-broken': cue(new URL('./sounds/nest-broken.wav', import.meta.url).href, -22.7, -35),
  chapter: cue(new URL('./sounds/chapter.wav', import.meta.url).href, -29.4, -34),
  bedding: cue(new URL('./sounds/bedding.wav', import.meta.url).href, -28.2, -37),
  'kit-lost': cue(new URL('./sounds/kit-lost.wav', import.meta.url).href, -25.3, -35),
  bloom: cue(new URL('./sounds/bloom.wav', import.meta.url).href, -22, -35),
  // Actions
  step: cue(new URL('./sounds/step.wav', import.meta.url).href, -39.4, -44),
  jump: cue(new URL('./sounds/jump.wav', import.meta.url).href, -34.7, -40),
  land: cue(new URL('./sounds/land.wav', import.meta.url).href, -36.3, -40),
  'land-heavy': cue(new URL('./sounds/land-heavy.wav', import.meta.url).href, -30.4, -36),
  chew: cue(new URL('./sounds/chew.wav', import.meta.url).href, -23.1, -42),
  coin: cue(new URL('./sounds/coin.wav', import.meta.url).href, -31.6, -42),
  pickup: cue(new URL('./sounds/pickup.wav', import.meta.url).href, -39.6, -39),
  drop: cue(new URL('./sounds/drop.wav', import.meta.url).href, -38.8, -39),
  'task-tick': cue(new URL('./sounds/task-tick.wav', import.meta.url).href, -45.8, -43),
  'task-done': cue(new URL('./sounds/task-done.wav', import.meta.url).href, -29.6, -37),
  grown: cue(new URL('./sounds/grown.wav', import.meta.url).href, -22.5, -36.5),
  hurt: cue(new URL('./sounds/hurt.wav', import.meta.url).href, -23.2, -34),
  downed: cue(new URL('./sounds/downed.wav', import.meta.url).href, -28.7, -35.5),
  escaped: cue(new URL('./sounds/escaped.wav', import.meta.url).href, -24.5, -38),
  hide: cue(new URL('./sounds/hide.wav', import.meta.url).href, -26.2, -40),
  unhide: cue(new URL('./sounds/unhide.wav', import.meta.url).href, -31.4, -41),
  talk: cue(new URL('./sounds/talk.wav', import.meta.url).href, -48.2, -45),
  reveal: cue(new URL('./sounds/reveal.wav', import.meta.url).href, -30.3, -40),
  rustle: cue(new URL('./sounds/rustle.wav', import.meta.url).href, -24.4, -41),
  sparkle: cue(new URL('./sounds/sparkle.wav', import.meta.url).href, -27.4, -38),
  heartbeat: cue(new URL('./sounds/heartbeat.wav', import.meta.url).href, -25.7, -38),
  // Menus
  'ui-hover': cue(new URL('./sounds/ui-hover.wav', import.meta.url).href, -42, -47),
  'ui-tap': cue(new URL('./sounds/ui-tap.wav', import.meta.url).href, -34.2, -37),
  'ui-toggle': cue(new URL('./sounds/ui-toggle.wav', import.meta.url).href, -38.4, -38),
  'ui-open': cue(new URL('./sounds/ui-open.wav', import.meta.url).href, -28.5, -38),
  'ui-close': cue(new URL('./sounds/ui-close.wav', import.meta.url).href, -31.8, -38)
} as const

export type CueId = keyof typeof CUES

export const STAGE_BEDS: readonly CueId[] = ['bed-house', 'bed-town', 'bed-waterway', 'bed-forest']

/** Fetched file bytes, shared by every AudioContext (each context decodes its own copy). */
const files = new Map<string, Promise<ArrayBuffer | null>>()
const banks = new WeakMap<BaseAudioContext, SoundBank>()

function fetchFile(url: string): Promise<ArrayBuffer | null> {
  let file = files.get(url)
  if (!file) {
    file = Promise.resolve()
      .then(() => fetch(url))
      .then((response) => (response.ok ? response.arrayBuffer() : null))
      .catch(() => null)
    files.set(url, file)
  }
  return file
}

/** Starts downloading every cue before any AudioContext exists, so the first sting is ready when play starts. */
export function prefetchSounds(): void {
  for (const cue of Object.values(CUES)) void fetchFile(cue.url)
}

/** Decoded buffers for one AudioContext. Cues that are not decoded yet are simply skipped by the players. */
export class SoundBank {
  private readonly buffers = new Map<CueId, AudioBuffer>()
  private loading: Promise<void> | null = null

  constructor(private readonly context: BaseAudioContext) {}

  get(id: CueId): AudioBuffer | undefined {
    return this.buffers.get(id)
  }

  /** Makes a decoded buffer available immediately (tests and offline renders). */
  put(id: CueId, buffer: AudioBuffer): void {
    this.buffers.set(id, buffer)
  }

  load(): Promise<void> {
    if (!this.loading)
      this.loading = Promise.all(
        (Object.keys(CUES) as CueId[]).map(async (id) => {
          if (this.buffers.has(id)) return
          const bytes = await fetchFile(CUES[id].url)
          if (!bytes) return
          try {
            const buffer = await this.context.decodeAudioData(bytes.slice(0))
            if (!this.buffers.has(id)) this.buffers.set(id, buffer)
          } catch {}
        })
      ).then(() => {})
    return this.loading
  }
}

export function soundBank(context: BaseAudioContext): SoundBank {
  let bank = banks.get(context)
  if (!bank) {
    bank = new SoundBank(context)
    banks.set(context, bank)
  }
  return bank
}
