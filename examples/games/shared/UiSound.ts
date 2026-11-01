/** Short synthesized UI cues. No audio files; each game supplies its own mute/volume. */
export type UiSound = 'hover' | 'tap' | 'select' | 'confirm' | 'cancel' | 'turn'

// wave, start Hz, end Hz, seconds, peak gain when sent straight to the speakers
const SHAPES: Record<UiSound, readonly [OscillatorType, number, number, number, number]> = {
  hover: ['sine', 1320, 1480, 0.035, 0.006],
  tap: ['triangle', 880, 660, 0.06, 0.02],
  select: ['triangle', 660, 990, 0.08, 0.022],
  confirm: ['triangle', 523, 1047, 0.16, 0.025],
  cancel: ['triangle', 620, 330, 0.1, 0.018],
  turn: ['sine', 392, 784, 0.3, 0.03]
}

export function playUiSound(
  kind: UiSound,
  context: AudioContext | null | undefined,
  destination: AudioNode | undefined = context?.destination,
  scale = 1
): void {
  if (!context || !destination || context.state !== 'running' || scale <= 0) return
  const [type, from, to, seconds, peak] = SHAPES[kind]
  try {
    const voice = context.createOscillator()
    const gain = context.createGain()
    const now = context.currentTime
    voice.type = type
    voice.frequency.setValueAtTime(from, now)
    voice.frequency.exponentialRampToValueAtTime(to, now + seconds)
    gain.gain.setValueAtTime(0, now)
    gain.gain.linearRampToValueAtTime(peak * scale, now + 0.005)
    gain.gain.exponentialRampToValueAtTime(0.0001, now + seconds)
    voice.connect(gain).connect(destination)
    voice.onended = () => gain.disconnect()
    voice.start(now)
    voice.stop(now + seconds + 0.01)
  } catch {
    /* UI sound is optional. */
  }
}

let shared: AudioContext | undefined
/** For games without a Web Audio graph. Creates its context only from a click, never from hover. */
export function playSharedUiSound(kind: UiSound, volume = 1): void {
  if (volume <= 0 || (!shared && kind === 'hover')) return
  try {
    shared ??= new AudioContext()
    if (shared.state === 'suspended') void shared.resume().catch(() => {})
  } catch {
    return
  }
  playUiSound(kind, shared, shared.destination, volume)
}

/**
 * The first AudioContext in a page can block the main thread for ~250ms while the audio
 * device opens. Pay that once while idle so the first click answers immediately.
 */
export function warmUpAudio(): void {
  const warm = () => {
    try {
      void new AudioContext().close().catch(() => {})
    } catch {
      /* Audio is optional. */
    }
  }
  if ('requestIdleCallback' in globalThis) requestIdleCallback(warm, { timeout: 2000 })
  else setTimeout(warm, 500)
}

/** Delegated button feedback: click plays data-sfx (or cancel/tap by id), mouse hover a soft tick. */
export function bindUiSounds(root: EventTarget, play: (kind: UiSound) => void, hoverSelector = 'button'): void {
  root.addEventListener('click', (event) => {
    const button = (event.target as Element | null)?.closest?.<HTMLElement>('button')
    if (!button || (button as HTMLButtonElement).disabled) return
    const kind = button.dataset.sfx ?? (/close|cancel|return|back/i.test(button.id) ? 'cancel' : 'tap')
    if (kind in SHAPES) play(kind as UiSound)
  })
  root.addEventListener('pointerover', (event) => {
    const { pointerType, target, relatedTarget } = event as PointerEvent
    if (pointerType !== 'mouse') return
    const button = (target as Element | null)?.closest?.<HTMLButtonElement>(hoverSelector)
    if (!button || button.disabled || button.contains(relatedTarget as Node | null)) return
    play('hover')
  })
}
