/**
 * The game renderer (DESIGN §15) behind src/render/api.ts: WebGL2, sRGB + ACES, PCF soft shadows following the
 * local player, fog, post-processing per quality (bloom, grading, vignette, FXAA/SMAA), quality presets with
 * 自動, the environment per map/theme, actors, effects for every SimEvent, sound direction, in-world markers,
 * the shoulder / spectate / down / cinematic cameras, project() and stats().
 */
import * as THREE from 'three'
import type { ModelKit, Quality } from '../models/api'
import { FOES } from '../data/enemies'
import type { ActorRef, MapDef, PropView, SimEvent, V3, View } from '../sim/types'
import { Characters } from './actors/characters'
import { Foes } from './actors/foes'
import { Props } from './actors/props'
import { Shots } from './actors/shots'
import type { CreateGameRenderer, FrameInput, GameRenderer, RendererOptions, RendererStats, ScreenPoint } from './api'
import { CameraRig, type CinematicSubject } from './camera'
import { BoxGrid } from './core/box-grid'
import { PostChain } from './core/post'
import { AutoQuality, FrameMeter, QUALITY_PRESETS, type QualityPreset } from './core/quality'
import { Environment } from './env/environment'
import { Effects, type FxContext } from './fx/effects'
import { Markers } from './markers'
import { SoundDirector, type SoundContext } from './sound'

export const createGameRenderer: CreateGameRenderer = (canvas, kit, audio, options): GameRenderer =>
  new Renderer(canvas, kit, audio, options)

/** Props the cinematic camera must not sit in or look through: [radius, height]. */
const BIG_PROPS: Partial<Record<PropView['kind'], [number, number]>> = {
  lighthouse: [3.2, 12],
  node: [2.4, 4],
  cart: [2, 2.5],
  target: [0.8, 2]
}

class Renderer implements GameRenderer {
  readonly canvas: HTMLCanvasElement
  private readonly gl: THREE.WebGLRenderer
  private readonly scene = new THREE.Scene()
  private readonly rig = new CameraRig()
  private readonly characters: Characters
  private readonly foes: Foes
  private readonly props: Props
  private readonly shots: Shots
  private readonly effects: Effects
  private readonly markers: Markers
  private readonly sound: SoundDirector
  private opts: RendererOptions
  private quality: Quality
  private preset: QualityPreset
  private readonly auto = new AutoQuality('medium')
  private readonly meter = new FrameMeter(60)
  private post: PostChain | null = null
  private env: Environment | null = null
  private grid: BoxGrid | null = null
  private width = 1
  private height = 1
  private dpr = 1
  private seenEvents = new WeakSet<SimEvent>()
  private hitStop = 0
  private hurtGlow = 0
  private readonly focus = new THREE.Vector3()
  private readonly v = new THREE.Vector3()
  private readonly players = new Map<string, V3>()
  private readonly foePos = new Map<number, V3>()
  private readonly propPos = new Map<number, V3>()
  private readonly warpAt = new Map<string, V3>()
  private readonly subjects: CinematicSubject[] = []
  private view: View | null = null
  private me: string | undefined
  private readonly fxCtx: FxContext
  private readonly soundCtx: SoundContext
  private lastStats: RendererStats = { fps: 0, frameMs: 0, drawCalls: 0, triangles: 0, quality: 'medium' }
  private disposed = false
  private debugCamera: { pos: V3; target: V3 } | null = null

  constructor(
    canvas: HTMLCanvasElement,
    private readonly kit: ModelKit,
    audio: Parameters<CreateGameRenderer>[2],
    options: RendererOptions
  ) {
    this.canvas = canvas
    this.opts = { ...options }
    this.gl = new THREE.WebGLRenderer({ canvas, antialias: false, powerPreference: 'high-performance', stencil: false })
    this.gl.outputColorSpace = THREE.SRGBColorSpace
    this.gl.toneMapping = THREE.ACESFilmicToneMapping
    this.gl.toneMappingExposure = 1
    this.gl.shadowMap.enabled = true
    this.gl.shadowMap.type = THREE.PCFSoftShadowMap
    this.gl.info.autoReset = false
    this.quality = options.quality === 'auto' ? this.auto.level : options.quality
    this.preset = QUALITY_PRESETS[this.quality]
    this.characters = new Characters(kit)
    this.foes = new Foes(kit)
    this.props = new Props(kit)
    this.shots = new Shots(kit)
    this.effects = new Effects(QUALITY_PRESETS.high.particles)
    this.markers = new Markers(canvas)
    this.sound = new SoundDirector(audio)
    this.scene.add(this.characters.group, this.foes.group, this.props.group, this.shots.group, this.effects.group)
    this.scene.add(this.rig.camera)
    this.applyOptions()

    const self = this
    this.fxCtx = {
      get me() {
        return self.me
      },
      rig: this.rig,
      get grid() {
        return self.grid
      },
      markers: this.markers,
      position: (ref) => this.position(ref),
      player: (id) => this.view?.players.find((p) => p.id === id),
      muzzle: (id, hand, out) => {
        const m = this.characters.model(id)
        if (!m) return false
        m.muzzle(hand, out)
        return true
      },
      flash: (ref, amount) => {
        if (typeof ref === 'string') this.characters.hit(ref, amount)
        else {
          this.foes.hit(ref, amount)
          this.characters.hit(`foe:${ref}`, amount)
        }
      },
      hurt: (id) => this.characters.hurtFlinch(id),
      hitStop: (s) => {
        if (!this.opts.reducedMotion) this.hitStop = Math.max(this.hitStop, s)
      }
    }
    this.soundCtx = {
      get me() {
        return self.me
      },
      position: (ref) => this.position(ref)
    }
  }

  private position(ref: ActorRef): V3 | undefined {
    return typeof ref === 'string' ? this.players.get(ref) : (this.foePos.get(ref) ?? this.propPos.get(ref))
  }

  // ------------------------------------------------------------------------------------------ options

  setOptions(next: Partial<RendererOptions>) {
    this.opts = { ...this.opts, ...next }
    if (next.quality && next.quality !== 'auto') this.setQuality(next.quality)
    this.applyOptions()
  }

  private applyOptions() {
    this.rig.baseFov = this.opts.fov
    this.rig.reducedMotion = this.opts.reducedMotion
    this.effects.reducedMotion = this.opts.reducedMotion
    this.markers.damageNumbers = this.opts.damageNumbers
    this.applyQuality()
  }

  private setQuality(q: Quality) {
    if (q === this.quality) return
    this.quality = q
    this.preset = QUALITY_PRESETS[q]
    this.applyQuality()
  }

  private applyQuality() {
    const p = this.preset
    const shadows = this.opts.shadows && p.shadows
    if (this.gl.shadowMap.enabled !== shadows) {
      this.gl.shadowMap.enabled = shadows
      this.scene.traverse((o) => {
        const m = (o as THREE.Mesh).material
        if (Array.isArray(m)) m.forEach((x) => (x.needsUpdate = true))
        else if (m) (m as THREE.Material).needsUpdate = true
      })
    }
    this.env?.configureShadows({ ...p, shadows })
    this.characters.outlines = p.outlines
    this.rig.camera.far = p.far
    this.rig.camera.updateProjectionMatrix()
    this.applySize()
    const wantPost = p.post
    if (this.post && (!wantPost || this.post.preset !== p)) {
      this.post.dispose()
      this.post = null
    }
    if (wantPost && !this.post) {
      this.post = new PostChain(this.gl, this.scene, this.rig.camera, p, this.opts.bloom)
      if (this.env) this.post.setTheme(this.env.theme)
    }
    this.post?.setBloom(this.opts.bloom)
  }

  private applySize() {
    const ratio = Math.min(this.dpr, this.preset.maxPixelRatio) * Math.max(0.5, Math.min(1, this.opts.resolutionScale))
    this.gl.setPixelRatio(ratio)
    this.gl.setSize(this.width, this.height, false)
    this.rig.setAspect(this.width / Math.max(1, this.height))
    this.post?.setSize(this.gl)
    this.markers.resize(this.width, this.height, this.dpr, this.canvas)
  }

  resize(width: number, height: number, dpr: number) {
    this.width = Math.max(1, Math.round(width))
    this.height = Math.max(1, Math.round(height))
    this.dpr = Math.max(0.5, dpr)
    this.applySize()
  }

  // ------------------------------------------------------------------------------------------ map

  async setMap(map: MapDef, variant?: 'night' | 'crater') {
    this.sound.stopAll()
    if (this.env) {
      this.scene.remove(this.env.group)
      this.env.dispose()
      this.env = null
    }
    await this.kit.prepare({ props: ['pad'] })
    // Yield once so a loading screen can paint before the heavy build.
    await new Promise((r) => setTimeout(r, 0))
    if (this.disposed) return
    this.env = new Environment(map, variant, this.preset)
    this.env.configureShadows({ ...this.preset, shadows: this.opts.shadows && this.preset.shadows })
    this.scene.add(this.env.group)
    this.scene.fog = this.env.fog
    this.scene.background = new THREE.Color(this.env.theme.fog.color)
    this.gl.toneMappingExposure = this.env.theme.exposure
    this.grid = new BoxGrid(map)
    this.rig.setGrid(this.grid)
    this.rig.setObstacles(this.env.plan.canopies)
    this.props.setMap(map)
    this.effects.setMap(this.env.theme, this.env.emitters)
    this.post?.setTheme(this.env.theme)
    this.sound.setAmbience(this.env.theme.ambience)
    this.seenEvents = new WeakSet<SimEvent>()
    // Compile shaders up front so the first frames do not hitch.
    this.gl.compile(this.scene, this.rig.camera)
  }

  // ------------------------------------------------------------------------------------------ frame

  frame(input: FrameInput) {
    if (this.disposed) return
    const dt = Math.min(0.1, Math.max(0, input.dt))
    const view = input.view
    this.view = view
    this.me = input.me
    this.meter.push(dt * 1000)
    if (this.opts.quality === 'auto' && dt > 0) {
      const next = this.auto.sample(dt * 1000, dt)
      if (next) this.setQuality(next)
    }

    // Lookups for this frame.
    this.players.clear()
    this.foePos.clear()
    this.propPos.clear()
    for (const p of view.players) this.players.set(p.id, p.p)
    for (const f of view.foes) this.foePos.set(f.id, f.p)
    for (const pr of view.props) this.propPos.set(pr.id, pr.p)

    // Actors first (muzzles and head tops are needed by effects and markers).
    this.hitStop = Math.max(0, this.hitStop - dt)
    this.characters.animScale = this.hitStop > 0 ? 0.05 : 1
    this.characters.shadowFocus.copy(this.focus)
    this.characters.update(view, input.me, dt)
    this.foes.update(view, dt)
    const mine = view.players.find((p) => p.id === input.me)
    this.props.update(view, mine?.team, dt)

    this.updateCamera(input, dt)
    this.rig.camera.updateMatrixWorld()
    this.sound.setListener(this.rig.camera)

    // Events: each event object once (the app may hand the same view or events to several frames). Ids are not
    // usable here: foe events reuse `id` for the foe id.
    for (const e of view.events) {
      if (this.seenEvents.has(e)) continue
      this.seenEvents.add(e)
      this.onEvent(e)
    }
    this.sound.frame(view, input.me, dt)

    // Effects, shots and shards.
    this.effects.beginFrame(this.rig.camera, dt)
    this.effects.frame(view, this.fxCtx, dt)
    this.shots.update(view, this.effects.add, this.effects.alpha, dt)
    this.effects.endFrame()

    // Environment: shadow box follows the local player (or the camera target).
    if (this.env) {
      this.env.update(view.time, this.rig.camera, this.focus)
    }

    // Hurt vignette: critical anima and recent hits.
    if (mine) {
      const frac = mine.anima / Math.max(1, mine.maxAnima)
      const target = mine.state === 'alive' && frac <= 0.15 ? 0.6 + 0.2 * Math.sin(view.time * 6) : 0
      this.hurtGlow += (Math.max(target, this.hurtGlow * 0.9) - this.hurtGlow) * Math.min(1, dt * 6)
      this.post?.setHurt(this.hurtGlow)
    }

    // Own model fades out when the camera is inside it.
    if (input.me) {
      const m = this.characters.model(input.me)
      if (m && this.rig.currentMode === 'shoulder' && !input.follow)
        m.root.visible = m.root.visible && this.rig.arm.length > 0.75
    }

    this.gl.info.reset()
    if (this.post) this.post.render(dt)
    else this.gl.render(this.scene, this.rig.camera)
    this.markers.draw(view, this.rig.camera, input.me, dt, (id) => {
      const m = this.characters.model(id)
      if (!m) return null
      m.headTop(this.v)
      return [this.v.x, this.v.y, this.v.z]
    })
    const info = this.gl.info.render
    this.lastStats = {
      fps: this.meter.fps,
      frameMs: this.meter.frameMs,
      drawCalls: info.calls,
      triangles: info.triangles,
      quality: this.quality
    }
  }

  private onEvent(e: SimEvent) {
    try {
      this.effects.event(e, this.fxCtx)
    } catch (err) {
      console.warn('render effect failed', e.type, err)
    }
    this.sound.event(e, this.soundCtx)
    if (e.type === 'warp') this.warpAt.set(e.who, e.at)
    if (e.type === 'respawn') this.warpAt.delete(e.who)
  }

  /**
   * Dev harness only: approximate draw calls of the main pass per top-level group (meshes in the view frustum)
   * and shadow casters inside the sun's shadow box, to see where the budget goes.
   */
  debugBreakdown(): Record<string, { main: number; shadow: number }> {
    const cam = this.rig.camera
    const frustum = new THREE.Frustum().setFromProjectionMatrix(
      new THREE.Matrix4().multiplyMatrices(cam.projectionMatrix, cam.matrixWorldInverse)
    )
    const sun = this.env?.sun
    const shadowFrustum = new THREE.Frustum()
    if (sun) {
      sun.shadow.camera.updateMatrixWorld()
      shadowFrustum.setFromProjectionMatrix(
        new THREE.Matrix4().multiplyMatrices(sun.shadow.camera.projectionMatrix, sun.shadow.camera.matrixWorldInverse)
      )
    }
    const out: Record<string, { main: number; shadow: number }> = {}
    const groups: [string, THREE.Object3D | undefined][] = [
      ['env', this.env?.group],
      ['characters', this.characters.group],
      ['foes', this.foes.group],
      ['props', this.props.group],
      ['shots', this.shots.group],
      ['effects', this.effects.group]
    ]
    for (const [name, g] of groups) {
      const row = { main: 0, shadow: 0 }
      out[name] = row
      if (!g) continue
      const visit = (o: THREE.Object3D) => {
        if (!o.visible) return
        const m = o as THREE.Mesh
        if (m.isMesh || (o as THREE.Points).isPoints || (o as THREE.Line).isLine) {
          const mats = Array.isArray(m.material) ? m.material.length : 1
          const inView = !o.frustumCulled || frustum.intersectsObject(o)
          if (inView) row.main += mats
          if (sun && o.castShadow && (!o.frustumCulled || shadowFrustum.intersectsObject(o))) row.shadow += mats
        }
        for (const c of o.children) visit(c)
      }
      visit(g)
    }
    return out
  }

  /** Dev harness only (not part of the API): a fixed review camera, or null for the normal cameras. */
  setDebugCamera(pos: V3 | null, target?: V3) {
    this.debugCamera = pos && target ? { pos, target } : null
  }

  private updateCamera(input: FrameInput, dt: number) {
    const view = input.view
    if (this.debugCamera) {
      const cam = this.rig.camera
      cam.position.set(...this.debugCamera.pos)
      cam.up.set(0, 1, 0)
      cam.lookAt(this.v.set(...this.debugCamera.target))
      this.rig.setAspect(this.width / Math.max(1, this.height))
      this.focus.set(this.debugCamera.target[0], 0, this.debugCamera.target[2])
      return
    }
    if (input.cinematic) {
      this.cinematic(view, dt)
      return
    }
    const id = input.follow ?? input.me
    const pv = id ? view.players.find((p) => p.id === id) : undefined
    if (!pv) {
      this.cinematic(view, dt)
      return
    }
    this.focus.set(pv.p[0], pv.p[1], pv.p[2])
    if (pv.state === 'down') {
      this.rig.down(pv.p, dt)
      return
    }
    if (pv.state === 'away') {
      this.rig.away(this.warpAt.get(pv.id) ?? pv.p, dt)
      return
    }
    const own = !input.follow && input.me === pv.id
    this.rig.shoulder(
      {
        feet: pv.p,
        species: pv.species,
        yaw: own ? input.camera.yaw : pv.yaw,
        pitch: own ? input.camera.pitch : pv.pitch,
        shoulder: own ? input.camera.shoulder : pv.shoulder,
        zoom: own ? input.camera.zoom : 0
      },
      dt
    )
  }

  private cinematic(view: View, dt: number) {
    // Squad members lead the shots; foes (and, in PvP, everyone) are framed when they are near the hero.
    this.subjects.length = 0
    for (const p of view.players)
      if (p.state === 'alive') this.subjects.push({ p: p.p, key: p.id, weight: 1, r: 0.8, h: 1.6 })
    for (const f of view.foes)
      if (f.state !== 'dying' && this.subjects.length < 64) {
        const def = FOES[f.kind]
        this.subjects.push({ p: f.p, key: `f${f.id}`, weight: 0.6, r: Math.max(0.6, def.height * 0.5), h: def.height })
      }
    for (const pr of view.props) {
      const big = BIG_PROPS[pr.kind]
      if (big) this.subjects.push({ p: pr.p, key: `pr${pr.id}`, weight: 0, r: big[0], h: big[1] })
    }
    if (!this.subjects.length) this.subjects.push({ p: [0, 0, 0], key: 'origin', weight: 1 })
    this.rig.cinematic(this.subjects, dt)
    this.focus.copy(this.rig.lastLook)
  }

  // ------------------------------------------------------------------------------------------ queries

  project(p: V3): ScreenPoint {
    const cam = this.rig.camera
    const distance = cam.position.distanceTo(this.v.set(p[0], p[1], p[2]))
    this.v.project(cam)
    const inFront = this.v.z > -1 && this.v.z < 1
    const x = (this.v.x * 0.5 + 0.5) * this.width
    const y = (-this.v.y * 0.5 + 0.5) * this.height
    return { x, y, onScreen: inFront && x >= 0 && y >= 0 && x <= this.width && y <= this.height, distance }
  }

  stats(): RendererStats {
    return { ...this.lastStats }
  }

  dispose() {
    this.disposed = true
    this.sound.stopAll()
    this.env?.dispose()
    this.characters.dispose()
    this.foes.dispose()
    this.props.dispose()
    this.shots.dispose()
    this.effects.dispose()
    this.markers.dispose()
    this.post?.dispose()
    this.gl.dispose()
  }
}
