import { HorrorWorld, type Pose, type WorldFrame } from './world'
import { RITUAL_STEPS } from './ritual'

// Silent, self-playing lobby demo. It owns a separate HorrorWorld and never touches
// match, peer, microphone, sound, readiness, notices or the real world view.

type Key = { x: number; z: number; yaw: number; pitch: number; duration: number; completed?: number }
const HALF = Math.PI / 2
const LOOK = -0.38
// Each key is reached `duration` seconds after the previous one (ease in/out).
const ROUTE: readonly Key[] = Object.freeze([
  { x: -5, z: 7.4, yaw: 0, pitch: 0, duration: 0 },
  { x: -5, z: 5.45, yaw: 0, pitch: -0.08, duration: 3 },
  { x: -5, z: 5.45, yaw: 0, pitch: LOOK, duration: 1.6 },
  { x: -5, z: 5.45, yaw: 0, pitch: LOOK, duration: 2.2, completed: 1 },
  { x: -5, z: -0.8, yaw: 0, pitch: 0, duration: 6.5 },
  { x: -5, z: -3.55, yaw: 0, pitch: -0.08, duration: 3 },
  { x: -5, z: -3.55, yaw: 0, pitch: LOOK, duration: 1.6 },
  { x: -5, z: -3.55, yaw: 0, pitch: LOOK, duration: 2.2, completed: 2 },
  { x: -5, z: -3.55, yaw: Math.PI, pitch: 0, duration: 2.4 },
  { x: -5, z: -0.2, yaw: Math.PI, pitch: 0, duration: 3.2 },
  { x: -5, z: -0.2, yaw: HALF, pitch: 0, duration: 1.8 },
  { x: 2.6, z: 0, yaw: HALF, pitch: 0.04, duration: 6.4 },
  { x: 4.7, z: -1.4, yaw: 0.2, pitch: 0, duration: 2.6 },
  { x: 5, z: -3.55, yaw: 0, pitch: -0.08, duration: 2.6 },
  { x: 5, z: -3.55, yaw: 0, pitch: LOOK, duration: 1.6 },
  { x: 5, z: -3.55, yaw: 0, pitch: -0.12, duration: 4.6, completed: 3 },
  { x: 5, z: -3.55, yaw: Math.PI, pitch: 0, duration: 2.4 },
  { x: 5, z: 1.5, yaw: Math.PI, pitch: 0, duration: 4.6 },
  { x: 5, z: 3.55, yaw: Math.PI, pitch: -0.08, duration: 2.6 },
  { x: 5, z: 3.55, yaw: Math.PI, pitch: LOOK, duration: 1.6 },
  { x: 5, z: 3.55, yaw: Math.PI, pitch: LOOK, duration: 2.2, completed: 4 },
  { x: 5, z: 3.55, yaw: Math.PI + 0.5, pitch: -0.05, duration: 3.5 }
])
const STARTS = ROUTE.reduce<number[]>((times, key, index) => {
  times.push(index === 0 ? 0 : times[index - 1] + key.duration)
  return times
}, [])
const ROUTE_END = STARTS[STARTS.length - 1]
/** Length of one demo loop in seconds. */
export const ATTRACT_LOOP_SECONDS = ROUTE_END + 1
/** Largest demo time step, in seconds. */
export const ATTRACT_MAX_STEP = 0.05
const SEAM = 1.75
const MIRROR_KEY = ROUTE.findIndex((key) => key.completed === 3)
/** Visual-only ghost events: a blackout that hides the loop seam, one mid-walk blackout and one apparition. */
export const ATTRACT_EVENTS = Object.freeze([
  Object.freeze({ kind: 'blackout' as const, at: STARTS[11] - 4.2, id: 1 }),
  Object.freeze({ kind: 'apparition' as const, at: STARTS[MIRROR_KEY - 1] + 0.8, id: 3 }),
  Object.freeze({ kind: 'blackout' as const, at: ATTRACT_LOOP_SECONDS - SEAM, id: 2 })
])
const DEMO_HAUNTER: Pose = Object.freeze({ x: 6.1, z: -7.1, yaw: Math.PI + 0.45 })
/** Demo time to start from: just after the loop-seam blackout has faded. */
export const ATTRACT_START = SEAM + 0.05
const STILL_TIME = STARTS[MIRROR_KEY - 1] - 0.4

const ease = (value: number) => value * value * (3 - 2 * value)
const wrap = (time: number) => {
  const value = Number.isFinite(time) ? time % ATTRACT_LOOP_SECONDS : 0
  return value < 0 ? value + ATTRACT_LOOP_SECONDS : value
}

/** Advances demo time by a clamped step and wraps it into one loop. */
export function advanceAttract(time: number, deltaSeconds: number): number {
  const step = Number.isFinite(deltaSeconds) ? Math.min(Math.max(deltaSeconds, 0), ATTRACT_MAX_STEP) : 0
  return wrap(wrap(time) + step)
}

/** Deterministic first-person pose and clue progress at demo time `time`. */
export function attractPose(time: number): { pose: Pose; pitch: number; completed: number } {
  const t = Math.min(wrap(time), ROUTE_END)
  let index = 1
  while (index < ROUTE.length - 1 && STARTS[index] < t) index++
  const from = ROUTE[index - 1],
    to = ROUTE[index]
  const span = STARTS[index] - STARTS[index - 1]
  const amount = span > 0 ? ease(Math.min(1, Math.max(0, (t - STARTS[index - 1]) / span))) : 1
  const mix = (a: number, b: number) => a + (b - a) * amount
  let completed = 0
  for (let key = 0; key < ROUTE.length; key++)
    if (STARTS[key] <= t && ROUTE[key].completed !== undefined) completed = ROUTE[key].completed!
  return {
    pose: { x: mix(from.x, to.x), z: mix(from.z, to.z), yaw: mix(from.yaw, to.yaw) },
    pitch: mix(from.pitch, to.pitch),
    completed
  }
}

/** The ghost event active at demo time `time` (times are loop-relative seconds). */
export function attractEffect(time: number): WorldFrame['effect'] {
  const t = wrap(time)
  // The seam blackout started near the end of the previous loop.
  if (t < SEAM) return { kind: 'blackout', startedAt: -SEAM, id: 2 }
  for (const event of ATTRACT_EVENTS)
    if (t >= event.at && t < event.at + 3.5) return { kind: event.kind, startedAt: event.at, id: event.id }
  return null
}

/** The WorldFrame the demo renders. Reduced motion shows one still view without ghost events. */
export function attractFrame(time: number, reducedMotion = false): WorldFrame {
  const t = reducedMotion ? STILL_TIME : wrap(time)
  const { pose, pitch, completed } = attractPose(t)
  return {
    role: 'human',
    pitch,
    human: pose,
    haunter: { ...DEMO_HAUNTER },
    effect: reducedMotion ? null : attractEffect(t),
    ritual: { completed, elapsedMs: RITUAL_STEPS[RITUAL_STEPS.length - 1].availableMs },
    time: t
  }
}

// Captured before anything can replace the prototype method, so the demo's frames
// never reach observers of the real world's render calls.
const renderDemo = HorrorWorld.prototype.render

export interface AttractOptions {
  /** Element the demo is drawn behind (it gets a decorative, aria-hidden layer). */
  host: HTMLElement
  /** Whether the lobby still has no session; checked every frame. */
  active: () => boolean
  /** Pressing or clicking any of these stops the demo for good, before their own handlers run. */
  stopOn: readonly EventTarget[]
}

/** Starts the silent lobby demo and returns a function that stops it permanently. Never throws. */
export function startAttract({ host, active, stopOn }: AttractOptions): () => void {
  let stopped = false
  let world: HorrorWorld | undefined
  let layer: HTMLDivElement | undefined
  let frame = 0
  let timer: ReturnType<typeof setTimeout> | undefined
  let idle: number | undefined
  let resizer: ResizeObserver | undefined
  let watcher: IntersectionObserver | undefined
  let onScreen = true
  let time = ATTRACT_START
  let lastRender = -Infinity
  let reduced: MediaQueryList | undefined
  const listeners = new AbortController()
  const attempt = (action: () => void) => {
    try {
      action()
    } catch {}
  }
  const stop = () => {
    if (stopped) return
    stopped = true
    if (frame) attempt(() => cancelAnimationFrame(frame))
    if (timer !== undefined) attempt(() => clearTimeout(timer))
    if (idle !== undefined) attempt(() => cancelIdleCallback(idle!))
    attempt(() => listeners.abort())
    attempt(() => resizer?.disconnect())
    attempt(() => watcher?.disconnect())
    attempt(() => layer?.classList.add('stopped'))
    // Dispose the demo's own renderer (cheap); the real world's renderer and context are untouched.
    // Its WebGL context is left to garbage collection: forcing a context loss can block the page for
    // seconds on software renderers and would cost the lobby's own handlers their user activation.
    attempt(() => world?.dispose())
    world = undefined
  }
  const blocked = () => !active() || document.pointerLockElement != null || document.fullscreenElement != null
  const loop = (stamp: number) => {
    if (stopped) return
    try {
      if (blocked() || !world) return stop()
      frame = requestAnimationFrame(loop)
      if (document.hidden || !onScreen) {
        lastRender = -Infinity
        return
      }
      const now = Number.isFinite(stamp) ? stamp : performance.now()
      const still = reduced?.matches === true
      if (now - lastRender < (still ? 1000 : 33)) return
      const delta = Number.isFinite(lastRender) ? (now - lastRender) / 1000 : 0
      lastRender = now
      if (!still) time = advanceAttract(time, delta)
      renderDemo.call(world, attractFrame(time, still))
      if (world?.isHealthy === false) stop()
    } catch {
      stop()
    }
  }
  const create = () => {
    if (stopped) return
    try {
      if (blocked()) return stop()
      world = new HorrorWorld(layer!, stop, 1)
      world.resize()
      resizer = new ResizeObserver(() => attempt(() => world?.resize()))
      resizer.observe(layer!)
      watcher = new IntersectionObserver((entries) => {
        for (const entry of entries) onScreen = entry.isIntersecting
      })
      watcher.observe(host)
      frame = requestAnimationFrame(loop)
    } catch {
      stop()
    }
  }
  try {
    if (
      typeof window === 'undefined' ||
      typeof document === 'undefined' ||
      typeof window.matchMedia !== 'function' ||
      typeof IntersectionObserver !== 'function' ||
      typeof ResizeObserver !== 'function' ||
      typeof renderDemo !== 'function' ||
      !(host instanceof HTMLElement) ||
      typeof host.prepend !== 'function'
    )
      return () => {}
    reduced = window.matchMedia('(prefers-reduced-motion: reduce)')
    layer = document.createElement('div')
    layer.className = 'attract'
    layer.setAttribute('aria-hidden', 'true')
    layer.innerHTML = '<span class="attract-tag">無音の自動デモ</span>'
    host.prepend(layer)
    host.classList.add('has-attract')
    for (const target of stopOn)
      for (const type of ['pointerdown', 'click'])
        target.addEventListener(type, stop, { capture: true, signal: listeners.signal })
    for (const type of ['pointerlockchange', 'fullscreenchange'])
      document.addEventListener(type, () => blocked() && stop(), { signal: listeners.signal })
    window.addEventListener('pagehide', stop, { once: true, signal: listeners.signal })
    // Build the demo world only once the lobby is idle, so it never delays the lobby's first interaction.
    timer = setTimeout(() => {
      timer = undefined
      if (typeof requestIdleCallback === 'function') idle = requestIdleCallback(create, { timeout: 3000 })
      else create()
    }, 300)
  } catch {
    stop()
  }
  return stop
}
