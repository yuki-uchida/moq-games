/**
 * The title's live attract demo (DESIGN §17.2): a real World with all-bot squads, drawn by the game renderer
 * on a light quality budget. The camera follows the busiest fighter over the shoulder (the spring arm keeps it
 * out of walls) and cuts to another every few seconds; `?attractcam=cinematic` uses the renderer's cinematic
 * camera instead. It never makes a sound (the renderer gets a
 * silent GameAudio), pauses while another screen is shown, renders a single still frame for reduced motion
 * and gives up (the caller falls back to the plaza backdrop) when the device cannot keep up.
 */
import type { GameAudio } from '../audio/api'
import type { ModelKit, Quality } from '../models/api'
import { createGameRenderer } from '../render'
import type { GameRenderer } from '../render/api'
import { createWorld, type World } from '../sim/api'
import type { PlayerInput, View } from '../sim/types'
import {
  ATTRACT_SCENE_SECONDS,
  ATTRACT_WARMUP,
  attractConfig,
  FOLLOW_SHOT_SECONDS,
  pickFollow,
  shotYaw,
  SlowWatch
} from './attract-plan'
import { prepareRequestFor } from './match'
import { FixedStepper } from './session'

/** Every call is a no-op: the demo is silent by contract. */
export const SILENT_AUDIO: GameAudio = {
  unlock() {},
  setMusic() {},
  sfx() {},
  loop() {},
  setVolume() {},
  setMuted() {},
  muted: true,
  setDuck() {},
  dispose() {}
}

export interface AttractStatus {
  scene: number
  mode: string
  /** Sim seconds of the current scene. */
  time: number
  frames: number
  foes: number
  players: number
  /** Player the camera follows (null: cinematic camera). */
  follow: string | null
  running: boolean
}

export interface AttractDemo {
  readonly el: HTMLElement
  /** True once a frame of the demo is on screen. */
  readonly live: boolean
  /** Runs (title) or pauses (any other screen). */
  setActive(on: boolean): void
  status(): AttractStatus
  dispose(): void
}

export interface AttractOptions {
  still: boolean
  quality: Quality
  /** First frame on screen (the plaza can stop drawing). */
  onLive(): void
  /** The demo failed or ran too slowly: dispose it and show the plaza. */
  onGiveUp(reason: string): void
}

const NO_INPUTS: ReadonlyMap<string, PlayerInput> = new Map()
const nextFrame = () => new Promise<void>((r) => requestAnimationFrame(() => r()))

export function createAttractDemo(kit: ModelKit, o: AttractOptions): AttractDemo {
  const el = document.createElement('div')
  el.className = 'af-attract'
  el.setAttribute('aria-hidden', 'true')
  const canvas = document.createElement('canvas')
  canvas.className = 'af-attract-canvas'
  el.append(canvas)

  let renderer: GameRenderer | null = null
  let world: World | null = null
  let view: View | null = null
  let scene = 0
  let sceneStart = 0
  let frames = 0
  let active = false
  let live = false
  let disposed = false
  let switching = false
  let raf = 0
  let last = 0
  let stillDrawn = false
  const stepper = new FixedStepper()
  const slow = new SlowWatch()
  const seed0 = (Math.random() * 0xffffffff) >>> 0
  const cinematic = new URLSearchParams(location.search).get('attractcam') === 'cinematic'

  const resize = () => {
    if (!renderer) return
    renderer.resize(window.innerWidth, window.innerHeight, 1)
    if (o.still && stillDrawn && view) draw(0)
  }

  let follow: string | null = null
  let shotAt = -Infinity
  let camYaw = 0
  let clock = 0
  function draw(dt: number) {
    if (!renderer || !view) return
    clock += dt
    if (!cinematic) {
      const target = view.players.find((p) => p.id === follow)
      if (!target || target.state !== 'alive' || view.time - shotAt > FOLLOW_SHOT_SECONDS) {
        follow = pickFollow(view, follow)
        shotAt = view.time
        if (follow) camYaw = shotYaw(view, follow) ?? 0
      }
    }
    if (follow && !cinematic) {
      // An over-the-shoulder chase camera we steer ourselves (the renderer's spring arm keeps it out of walls):
      // it eases toward the fight and sways slowly; the subject stands right of centre, clear of the menu.
      const want = (shotYaw(view, follow) ?? camYaw) + Math.sin(clock * 0.23) * 0.35
      const diff = Math.atan2(Math.sin(want - camYaw), Math.cos(want - camYaw))
      camYaw += diff * (1 - Math.exp(-1.6 * dt))
      const wide = window.innerWidth > window.innerHeight * 1.1
      renderer.frame({
        view,
        dt,
        me: follow,
        camera: { yaw: camYaw, pitch: -0.2 + Math.sin(clock * 0.17) * 0.06, shoulder: wide ? -1 : 1, zoom: 0 }
      })
    } else {
      renderer.frame({ view, dt, camera: { yaw: 0, pitch: 0, shoulder: 1, zoom: 0 }, cinematic: true })
    }
    frames++
  }

  /** Builds a scene: models, world, map, warm-up. Returns false when disposed meanwhile. */
  async function load(index: number): Promise<boolean> {
    const config = attractConfig(index, (seed0 + index * 7919) >>> 0)
    await kit.prepare(prepareRequestFor(config))
    if (disposed) return false
    world = createWorld(config)
    if (!renderer) {
      renderer = createGameRenderer(canvas, kit, SILENT_AUDIO, {
        quality: o.quality,
        shadows: false,
        bloom: true,
        resolutionScale: 0.8,
        fov: 62,
        damageNumbers: false,
        reducedMotion: o.still
      })
      resize()
    }
    await renderer.setMap(world.map, config.variant)
    if (disposed) return false
    // Skip the countdown and the quiet start of the scene, a few hundred steps per frame so menus stay smooth.
    const mode = config.mode === 'pvp' ? 'pvp' : 'pve'
    const warm = (o.still ? 2.2 : 1) * ATTRACT_WARMUP[mode]
    while (world.time < warm) {
      for (let i = 0; i < 240 && world.time < warm; i++) world.step(NO_INPUTS)
      await nextFrame()
      if (disposed) return false
    }
    world.view() // drop the warm-up events (no burst of old effects)
    sceneStart = world.time
    follow = null
    stepper.reset()
    world.step(NO_INPUTS)
    view = world.view()
    return true
  }

  async function begin(index: number) {
    switching = true
    el.classList.remove('is-live')
    try {
      if (live) await new Promise((r) => setTimeout(r, 700)) // let the fade-out finish
      if (!(await load(index))) return
    } catch (err) {
      console.warn('[anima-front] attract demo unavailable', err)
      o.onGiveUp('error')
      return
    }
    scene = index
    switching = false
    slow.reset()
    last = performance.now()
    if (o.still) {
      // let the cinematic camera settle on the action, then keep one frame
      for (let i = 0; i < 40; i++) draw(0.1)
      stillDrawn = true
    } else draw(1 / 60)
    el.classList.add('is-live')
    if (!live) {
      live = true
      o.onLive()
    }
  }

  const loop = (now: number) => {
    if (disposed) return
    raf = requestAnimationFrame(loop)
    const raw = now - last
    if (!active || switching || !world || !renderer || document.hidden || o.still) {
      last = now
      return
    }
    // ~40 fps is plenty behind the menu and leaves the main thread to the UI
    if (raw < 1000 / 42) return
    last = now
    const dt = Math.min(0.1, raw / 1000)
    try {
      stepper.advance(dt, () => world!.step(NO_INPUTS))
      view = world.view()
      draw(dt)
    } catch (err) {
      console.warn('[anima-front] attract demo frame failed', err)
      o.onGiveUp('error')
      return
    }
    if (slow.push(raw)) {
      o.onGiveUp('slow')
      return
    }
    if (world.over || world.time - sceneStart > ATTRACT_SCENE_SECONDS) void begin(scene + 1)
  }

  window.addEventListener('resize', resize)
  void begin(0)
  raf = requestAnimationFrame(loop)

  return {
    el,
    get live() {
      return live
    },
    setActive(on) {
      if (active === on) return
      active = on
      last = performance.now()
      stepper.reset()
      slow.reset()
      el.classList.toggle('is-active', on)
    },
    status() {
      return {
        scene,
        mode: world?.config.mode ?? '',
        time: world ? world.time - sceneStart : 0,
        frames,
        foes: view?.foes.length ?? 0,
        players: view?.players.length ?? 0,
        follow,
        running: active && live && !switching && !o.still
      }
    },
    dispose() {
      if (disposed) return
      disposed = true
      cancelAnimationFrame(raf)
      window.removeEventListener('resize', resize)
      try {
        renderer?.dispose()
      } catch (err) {
        console.warn('[anima-front] attract demo dispose failed', err)
      }
      renderer = null
      world = null
      view = null
      el.remove()
    }
  }
}
