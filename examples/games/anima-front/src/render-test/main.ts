/**
 * Render harness (dev only): drives the renderer without the sim. URL parameters:
 *   scene=env|combat|stress|events|actors   theme=day|sunset|night|blight|virtual   quality=low|medium|high|auto
 *   map=test|oldtown|harbor|blight|arena|range   variant=night|crater   view=N (fixed review camera)
 *   cam=shoulder|cinematic   fixed=1 (advance exactly 1/60 s per frame)   hud=0   w=, h= (canvas size)
 * Exposes window.__render for scripts/anima-front-render.mjs.
 */
import type { GameAudio, LoopName, SfxName } from '../audio/api'
import { FOE_KINDS } from '../data/enemies'
import { ITEM_IDS } from '../data/items'
import { SPECIES_IDS } from '../data/species'
import { createModelKit } from '../models'
import { createGameRenderer } from '../render'
import { DEFAULT_RENDERER_OPTIONS } from '../render/api'
import { QUALITY_LABELS } from '../render/core/quality'
import { getMap } from '../sim/maps'
import type { MapId, MapTheme } from '../sim/types'
import { buildScene } from './scenes'
import { buildTestMap } from './testmap'

const params = new URLSearchParams(location.search)
const sceneName = params.get('scene') ?? 'env'
const theme = (params.get('theme') ?? 'day') as MapTheme
const quality = (params.get('quality') ?? 'medium') as 'low' | 'medium' | 'high' | 'auto'
const mapId = params.get('map') ?? 'test'
const variant = (params.get('variant') ?? undefined) as 'night' | 'crater' | undefined
const viewIndex = params.has('view') ? Number(params.get('view')) : null
const fixed = params.get('fixed') === '1'
const showHud = params.get('hud') !== '0'

/** Silent audio that counts what the renderer asked for (sound coverage review). */
function recordingAudio(): GameAudio & { counts: Record<string, number>; loops: Set<string> } {
  const counts: Record<string, number> = {}
  const loops = new Set<string>()
  return {
    counts,
    loops,
    unlock() {},
    setMusic() {},
    sfx(name: SfxName) {
      counts[name] = (counts[name] ?? 0) + 1
    },
    loop(id: string, name: LoopName | null) {
      if (name) {
        loops.add(name)
        counts[`loop:${name}`] = (counts[`loop:${name}`] ?? 0) + 1
      }
      void id
    },
    setVolume() {},
    setMuted() {},
    muted: false,
    setDuck() {},
    dispose() {}
  }
}

async function main() {
  const app = document.getElementById('app')!
  const canvas = document.createElement('canvas')
  canvas.style.display = 'block'
  canvas.style.width = '100%'
  canvas.style.height = '100%'
  app.append(canvas)
  const hud = document.createElement('pre')
  hud.style.cssText =
    'position:absolute;left:8px;top:8px;margin:0;padding:6px 8px;background:rgba(10,12,20,.6);color:#e8f0ff;font:12px/1.4 monospace;pointer-events:none;z-index:5'
  if (showHud) app.append(hud)

  const kit = createModelKit({ quality: quality === 'auto' ? 'medium' : quality })
  const audio = recordingAudio()
  const renderer = createGameRenderer(canvas, kit, audio, { ...DEFAULT_RENDERER_OPTIONS, quality })
  const size = () => {
    const w = Number(params.get('w')) || window.innerWidth
    const h = Number(params.get('h')) || window.innerHeight
    renderer.resize(w, h, window.devicePixelRatio || 1)
  }
  size()
  window.addEventListener('resize', size)

  await kit.prepare({ species: [...SPECIES_IDS], items: [...ITEM_IDS], foes: [...FOE_KINDS] })
  const map =
    mapId === 'test'
      ? buildTestMap(theme)
      : { ...getMap(mapId as MapId, variant), ...(params.has('theme') ? { theme } : {}) }
  const t0 = performance.now()
  await renderer.setMap(map, variant)
  const buildMs = performance.now() - t0
  const scene = buildScene(sceneName, map)
  const debug = renderer as unknown as { setDebugCamera(pos: unknown, target?: unknown): void }
  const applyView = (i: number | null) => {
    if (i === null || !scene.views.length) debug.setDebugCamera(null)
    else {
      const v = scene.views[((i % scene.views.length) + scene.views.length) % scene.views.length]
      debug.setDebugCamera(v.pos, v.target)
    }
  }
  applyView(viewIndex ?? (scene.me ? null : 0))

  let frames = 0
  let sceneTime = 0
  let last = performance.now()
  let paused = false
  const STEP = 1 / 60
  let acc = 0
  const loop = () => {
    const now = performance.now()
    const real = Math.min(0.1, (now - last) / 1000)
    last = now
    const dt = fixed ? STEP : real
    if (!paused) {
      acc += dt
      while (acc >= STEP - 1e-6) {
        acc -= STEP
        sceneTime += STEP
        scene.script?.(scene.world, sceneTime)
        scene.world.step(STEP)
      }
    }
    const view = scene.world.view()
    const me = scene.world.players.find((p) => p.id === scene.me)
    renderer.frame({
      view,
      dt: paused ? 0 : dt,
      me: scene.me,
      camera: { yaw: me?.yaw ?? 0, pitch: Math.max(-0.5, Math.min(0.5, (me?.pitch ?? 0) * 0.5)), shoulder: 1, zoom: 0 },
      cinematic: params.get('cam') === 'cinematic'
    })
    frames++
    if (showHud && frames % 10 === 0) {
      const s = renderer.stats()
      hud.textContent = [
        `scene ${sceneName}  theme ${map.theme}${variant ? '/' + variant : ''}  quality ${QUALITY_LABELS[s.quality]}${quality === 'auto' ? ' (自動)' : ''}`,
        `fps ${s.fps.toFixed(0)}  frame ${s.frameMs.toFixed(1)} ms  draws ${s.drawCalls}  tris ${(s.triangles / 1000).toFixed(0)}k`,
        `players ${view.players.length}  foes ${view.foes.length}  shots ${view.shots.length}  build ${buildMs.toFixed(0)} ms`,
        scene.label ? `event: ${scene.label()}` : ''
      ].join('\n')
    }
    requestAnimationFrame(loop)
  }
  requestAnimationFrame(loop)

  Object.assign(window, {
    __render: {
      ready: true,
      renderer,
      world: scene.world,
      buildMs,
      get frames() {
        return frames
      },
      get sceneTime() {
        return sceneTime
      },
      stats: () => renderer.stats(),
      sounds: () => ({ ...audio.counts }),
      label: () => scene.label?.() ?? '',
      steps: scene.steps ?? 0,
      setView: (i: number | null) => applyView(i),
      setPaused: (p: boolean) => (paused = p),
      setOptions: (o: Parameters<typeof renderer.setOptions>[0]) => renderer.setOptions(o),
      counts: () => ({ players: scene.world.players.length, foes: scene.world.foes.length })
    }
  })
}

main().catch((err) => {
  console.error(err)
  document.body.textContent = String(err)
})
