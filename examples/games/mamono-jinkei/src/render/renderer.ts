/**
 * The world renderer (DESIGN §3): Canvas 2D, sharp-bilinear scaling, a smoothed camera on the controlled hero,
 * pre-rendered ground chunks, y-sorted actors and props, telegraphs, formation links and rings, charge auras,
 * effects, particles, damage numbers, lighting, vignette, and screen-space labels drawn crisp at device resolution.
 */
import { canvasOf } from '../art/canvas'
import { anchorOf, frameAt, type Anim } from '../art/index'
import type {
  BossView,
  EnemyView,
  EventView,
  HeroView,
  PickupView,
  PropView,
  ShotView,
  StageInfo,
  TechView,
  Telegraph,
  View
} from '../sim/types'
import { JOBS, JOB_COLORS, TILE, dirOf } from '../vocab'
import { interactTarget } from '../ui/hints'
import { BASE_VIEW_H, clampCamera, cursorLead, scalingFor, smoothing, turnOf, viewOrigin } from './camera'
import { BarrierWalls } from './barrier'
import { hiddenDelivered } from './delivered'
import { propSortY } from './depth'
import { FxAnims, Numbers, Particles } from './effects'
import { Ambience } from './ambience'
import { Ground } from './ground'
import { Lighting, flicker, type LightColor } from './lighting'
import { blitAnim, findAnim, findFlash, pickName, propName, tinted } from './sprites'
import { bridgeReach, downName, edgeName, layoutBridges, upName, type BridgePiece } from './drawbridges'

export interface RenderInput {
  view: View
  info: StageInfo
  myId: string
  /** Cursor in CSS px relative to the canvas. */
  cursor: { x: number; y: number; inside: boolean }
  showCursor: boolean
  shake: boolean
  reducedMotion: boolean
  /** 0..1 black fade over the frame (attract-mode stage changes). */
  fade?: number
  /** Attract mode: slower camera, no in-world UI. */
  demo?: boolean
  /** Shifts the followed hero right by this fraction of the view width (title layout). */
  shiftX?: number
}

export interface CameraInfo {
  /** Camera centre in art px. */
  x: number
  y: number
  viewW: number
  viewH: number
  /** Device px per art px. */
  scale: number
  /** The followed hero's screen position (CSS px), for aiming. */
  heroCss?: { x: number; y: number }
  /** Art px per CSS px. */
  artPerCss: number
}

const MODE_STAY = ['##.##', '##.##', '##.##', '##.##', '##.##']
const MODE_FOLLOW = ['..#..', '.#.#.', '#.#.#', '.#.#.', '#...#']
const FORMATION_NAMES: Record<number, string> = { 2: 'ペア陣', 3: '三角陣', 4: '四方陣' }
const LINK = 110
const FLAT_PROPS = new Set(['plate', 'plate2', 'bigplate'])
/** One-pixel offsets that trace a silhouette's rim (Leon's parry glow). */
const RIM_OFFSETS = [
  [-1, 0],
  [1, 0],
  [0, -1],
  [0, 1]
] as const
/** Light sources among the props and decoration (animation base or `${kind}_${state}`). */
const WARM_DECOR = new Set(['lamp', 'torch', 'brazier'])
const MOON_PROPS = new Set(['moonstone', 'bigmoon'])
const COOL_PROPS = new Set(['crystal_on', 'scale_on', 'moonstone_on', 'bigmoon_on', 'pedestal_on', 'hook_on'])

type DrawKind = 0 | 1 | 2 | 3 | 4 | 5 | 6 | 7 | 8 | 9
const K_DECOR = 0
const K_NPC = 1
const K_PROP = 2
const K_HERO = 3
const K_ENEMY = 4
const K_BOSS = 5
const K_PICKUP = 6
const K_TECH = 7
const K_PET = 8
const K_MINION = 9
/** Techniques whose members stay visible (running or flying) instead of merging into one sprite. */
const SHOWN_TECHS = new Set(['stampede', 'tornado', 'pack'])
interface DrawItem {
  y: number
  kind: DrawKind
  i: number
}

interface Label {
  x: number
  y: number
  text: string
  color: string
  size: number
  alpha: number
  /** Pill background colour (optional). */
  bg: string
}

export class Renderer {
  readonly camera: CameraInfo = { x: 0, y: 0, viewW: 1024, viewH: BASE_VIEW_H, scale: 1, artPerCss: 1 }
  /** Last frame time (ms) of the world pass, for profiling. */
  lastMs = 0
  private readonly ctx: CanvasRenderingContext2D
  private readonly world = document.createElement('canvas')
  private readonly wctx: CanvasRenderingContext2D
  private readonly up = document.createElement('canvas')
  private readonly uctx: CanvasRenderingContext2D
  private ground?: Ground
  private groundStage = ''
  private readonly particles = new Particles()
  private readonly fx = new FxAnims()
  private readonly barrier = new BarrierWalls()
  /** Staggered one-shot fx waiting for their start time (sim seconds). */
  private delayedFx: { a: Anim; x: number; y: number; at: number; flip: boolean; alpha: number }[] = []
  private readonly numbers = new Numbers()
  private readonly lighting = new Lighting()
  private readonly ambience = new Ambience(this.particles, this.fx)
  /** 0..1 running water near the view (audio loop level). */
  get water() {
    return this.ambience.water
  }
  /** Recent positions of dashing heroes (afterimages). */
  private trails = new Map<number, { x: number; y: number; z: number; t: number }[]>()
  private lastFollow?: { x: number; y: number; slot: number }
  /** Prop states last frame (transition effects: dust, bell rings). */
  private propStates = new Map<number, string>()
  /** Drawbridge pieces laid out as runs (per stage and set of pieces). */
  private bridges = new Map<number, BridgePiece>()
  private bridgesKey = ''
  private bellRings = new Map<number, number>()
  private heroZ = new Map<number, number>()
  /** Estimated flight stamina of crows (the view does not carry it): seconds left of 1.5. */
  private stamina = new Map<number, number>()
  private bossZ = 0
  /** A solved puzzle draws the camera toward it for a moment. */
  private look?: { x: number; y: number; until: number }
  private ventGlow?: HTMLCanvasElement
  /** Full-screen colour washes (technique dims, moon flashes, the awakening), in real time (ms). */
  private washes: { color: string; a: number; t0: number; dur: number }[] = []
  /** Brief zoom-in for dramatic moments (Leon's awakening). */
  private punchUntil = 0
  private bossAnim = ''
  /** Per-hero motion memory for sprint dust and ice skids. */
  private moving = new Map<number, { x: number; y: number; run: number; puff: number }>()
  private fade = 0
  /** 0..1 wind zones under the view (audio loop level). */
  get wind() {
    return this.ambience.wind
  }
  private catchUntil = 0
  private items: DrawItem[] = []
  private itemCount = 0
  private labels: Label[] = []
  private labelCount = 0
  private zoom = BASE_VIEW_H
  private camReady = false
  private shakeAmp = 0
  private stopUntil = 0
  private lastT = 0
  private realLast = 0
  private chargeWas = new Map<number, number>()
  private flashes: { x: number; y: number; t0: number; color: string }[] = []
  private shadowCache = new Map<number, HTMLCanvasElement>()
  private vignette?: { w: number; h: number; c: HTMLCanvasElement; light: string }
  private cssW = 1
  private cssH = 1
  private dpr = 1
  private view?: View
  private info?: StageInfo
  private ox = 0
  private oy = 0
  private artW = 1
  private artH = 1

  constructor(readonly canvas: HTMLCanvasElement) {
    this.ctx = canvas.getContext('2d', { alpha: false })!
    this.wctx = this.world.getContext('2d', { alpha: false })!
    this.uctx = this.up.getContext('2d', { alpha: false })!
  }

  /** Forget transient visuals (new session / stage). */
  reset() {
    this.particles.clear()
    this.fx.clear()
    this.numbers.clear()
    this.flashes.length = 0
    this.chargeWas.clear()
    this.camReady = false
    this.shakeAmp = 0
    this.stopUntil = 0
    this.lighting.clear()
    this.trails.clear()
    this.lunges.length = 0
    this.delayedFx.length = 0
  }

  /** Feeds a visual event. Sounds and HUD texts are handled elsewhere. */
  event(e: EventView, now: number, shake: boolean, reduced: boolean) {
    const t = this.lastT
    switch (e.k) {
      case 'burst':
        this.particles.burst(e.s ?? 'dust', e.x, e.y, e.a ?? 8)
        break
      case 'fx': {
        const name = e.s ?? ''
        const turn = turnOf(e.a ?? 0)
        const tech = `tech:${this.view?.species ?? 'slime'}`
        const turned = findAnim('fx', `${name}_${turn}`) ?? findAnim(tech, `${name}_${turn}`)
        const a = findAnim('fx', name) ?? findAnim(tech, name) ?? turned
        if (name === 'dust' && a && this.bridgeDust(a, e.x, e.y, t)) break
        // Directionless sheets (dust trails, dash afterimages) mirror for leftward motion.
        if (a) this.fx.add(a, e.x, e.y, t, !turned && e.a !== undefined && Math.cos(e.a) < -0.2)
        this.fxLight(name, e.x, e.y, t)
        if (name === 'howl' && shake) this.shakeAmp = Math.min(14, this.shakeAmp + (reduced ? 0.5 : 2))
        if (name === 'gnaw_chips') {
          // A barricade gives way: heavy shake and a burst of splinters.
          if (shake) this.shakeAmp = Math.min(16, this.shakeAmp + (reduced ? 4 : 11))
          this.particles.burst('rubble', e.x, e.y - 20, 16)
          this.particles.burst('dust', e.x, e.y, 10)
        } else if (name === 'smoke' && this.view?.species === 'rat') this.particles.burst('dust', e.x, e.y + 8, 6)
        break
      }
      case 'hit': {
        const amount = e.a ?? 0
        if (amount > 0) {
          // Whole numbers read better than the formation multiplier's decimals.
          const text = String(Math.max(1, Math.round(amount)))
          if (!this.numbers.add(text, e.s === 'hero' ? 'warn' : e.b ? 'crit' : 'damage', e.x, e.y, t))
            this.popText(text, e.x, e.y, -1, t)
        }
        break
      }
      case 'heal':
        if ((e.a ?? 0) > 0) this.numbers.add(`+${e.a}`, 'heal', e.x, e.y, t)
        break
      case 'clang': {
        const a = findAnim('fx', 'clang')
        if (a) this.fx.add(a, e.x, e.y, t)
        this.particles.burst('spark', e.x, e.y, 5)
        break
      }
      case 'kill':
        this.particles.burst('smoke', e.x, e.y - 10, 4)
        break
      case 'pop':
        // The strain meter already shows 「おもい！」 while pushing or gripping.
        // Numeric pops duplicate the 'hit' damage numbers drawn in the bitmap font.
        if ((e.x || e.y) && !e.s?.startsWith('おもい') && !/^[\d.]+$/.test(e.s ?? ''))
          this.popText(e.s ?? '', e.x, e.y, e.a ?? -1, t)
        // A thief stole gems: a few of them glint away.
        if (e.s?.includes('とられた')) {
          const g = findAnim('fx', 'gem_sparkle')
          for (let i = 0; i < 4; i++) if (g) this.fx.add(g, e.x + (i - 1.5) * 12, e.y + 30 - (i % 2) * 10, t + i * 0.05)
          this.particles.burst('spark', e.x, e.y + 40, 6)
        }
        break
      case 'shake':
        if (shake) this.shakeAmp = Math.min(14, this.shakeAmp + (e.a ?? 3) * (reduced ? 0.35 : 1))
        break
      case 'stop':
        if (!reduced) this.stopUntil = Math.max(this.stopUntil, now + Math.min(120, e.a ?? 60))
        break
      case 'tech':
        this.lighting.flash(e.x, e.y, 360, 'white', t, 0.5)
        // 月下群狼陣: the night darkens, then the moon flares.
        if (this.view?.species === 'wolf') {
          this.wash('rgb(8, 12, 40)', reduced ? 0.25 : 0.5, 0, 700)
          this.wash('rgb(230, 240, 255)', reduced ? 0.1 : 0.28, 260, 450)
        }
        if (shake) this.shakeAmp = Math.min(14, this.shakeAmp + (reduced ? 1 : 3))
        break
      case 'solve':
        this.look = { x: e.x, y: e.y, until: performance.now() + 1400 }
        break
      case 'form':
        if ((e.a ?? 0) >= 2) this.flashes.push({ x: e.x, y: e.y, t0: t, color: '#fff2b0' })
        break
    }
  }

  /** Queues a full-screen colour wash starting `delay` ms from now. */
  /**
   * A drawbridge settling down sends one 'dust' fx per deck piece at the same instant; stamped on every tile that
   * reads as a grid. Thin them out (mostly along the hinge and the free end), scatter them and stagger them a little.
   * Returns false when (x, y) is not a drawbridge piece.
   */
  private bridgeDust(a: Anim, x: number, y: number, t: number): boolean {
    const p = this.view?.props.find((q) => q.kind === 'drawbridge' && Math.abs(q.x - x) < 2 && Math.abs(q.y - y) < 2)
    const b = p && this.bridges.get(p.id)
    if (!b) return false
    const keep = b.col === 'm' ? 0.2 : b.n === 1 ? 1 : 0.6
    if (Math.random() >= keep) return true
    const at = t + Math.random() * 0.28
    const dx = (Math.random() - 0.5) * 30 + (b.col === 'h' ? -b.dir * 10 : b.col === 'e' ? b.dir * 10 : 0)
    const dy = (Math.random() - 0.5) * 22
    if (Math.random() < 0.35) this.particles.burst('dust', x + dx, y + dy + 8, 3 + ((Math.random() * 4) | 0))
    else
      this.delayedFx.push({
        a,
        x: x + dx,
        y: y + dy,
        at,
        flip: Math.random() < 0.5,
        alpha: 0.55 + Math.random() * 0.45
      })
    return true
  }

  private wash(color: string, a: number, delay: number, dur: number) {
    if (this.washes.length > 8) this.washes.shift()
    this.washes.push({ color, a, t0: performance.now() + delay, dur })
  }

  /** Effects that light up the dark. */
  private fxLight(name: string, x: number, y: number, t: number) {
    const l: [number, LightColor, number] | undefined =
      name === 'howl' || name === 'howl_wave'
        ? [520, 'white', 0.8]
        : name === 'bomb_burst' || name === 'bigburst' || name === 'fire_breath'
          ? [220, 'fire', 0.45]
          : name === 'burst' || name === 'holy' || name === 'spin' || name === 'shock'
            ? [200, 'cool', 0.35]
            : name === 'hit' || name === 'clang'
              ? [90, 'warm', 0.15]
              : name === 'revive' || name === 'heal' || name === 'checkpoint'
                ? [140, 'cool', 0.5]
                : undefined
    if (l) this.lighting.flash(x, y, l[0], l[1], t, l[2])
  }

  private pops: { text: string; x: number; y: number; t0: number; color: string }[] = []
  private popText(text: string, x: number, y: number, colour: number, t: number) {
    if (!text) return
    if (this.pops.length > 16) this.pops.shift()
    this.pops.push({ text, x, y, t0: t, color: colour >= 0 && colour < 4 ? JOB_COLORS[JOBS[colour]] : '#fff6dc' })
  }

  private resize() {
    const r = this.canvas.getBoundingClientRect()
    const dpr = Math.min(3, window.devicePixelRatio || 1)
    const w = Math.max(1, Math.round(r.width * dpr))
    const h = Math.max(1, Math.round(r.height * dpr))
    if (this.canvas.width !== w || this.canvas.height !== h) {
      this.canvas.width = w
      this.canvas.height = h
    }
    this.cssW = Math.max(1, r.width)
    this.cssH = Math.max(1, r.height)
    this.dpr = dpr
  }

  private ensure(c: HTMLCanvasElement, w: number, h: number) {
    if (c.width < w || c.height < h) {
      c.width = Math.max(c.width, w)
      c.height = Math.max(c.height, h)
      return true
    }
    return false
  }

  /** Draws one frame. */
  render(input: RenderInput): CameraInfo {
    const started = performance.now()
    const real = started / 1000
    const realDt = this.realLast ? Math.min(0.1, real - this.realLast) : 0
    this.realLast = real
    this.resize()
    const { view, info } = input
    this.view = view
    this.info = info
    if (info.id !== this.groundStage || !this.ground) {
      this.ground = new Ground(info)
      this.groundStage = info.id
      this.ambience.setStage(info)
      this.reset()
    }
    this.ground.setFills(view.fills)

    const t = view.t
    const dt = Math.min(0.05, Math.max(0, t - this.lastT))
    if (Math.abs(t - this.lastT) > 1) this.camReady = false
    this.lastT = t

    // Hit-stop: hold the previous image for a few frames.
    if (performance.now() < this.stopUntil && this.camReady) {
      this.composite()
      this.screenOverlay(input)
      return this.camera
    }

    this.fade = input.fade ?? 0
    this.updateCamera(input, realDt)
    const ctx = this.wctx
    const { ox, oy, artW, artH } = this
    ctx.imageSmoothingEnabled = false
    ctx.fillStyle = '#1b1a2b'
    ctx.fillRect(0, 0, artW, artH)
    this.ground.draw(ctx, ox, oy, artW, artH, t)
    if (!this.ground.warm(0)) this.ground.warm(1)

    this.labelCount = 0
    this.drawFloor(view, t, input)
    this.barrier.draw(ctx, view, info, ox, oy, artW, artH, t, this.particles)
    this.collect(view, info)
    this.drawSorted(view, info, t)
    this.drawShots(view.shots, t)
    if (this.delayedFx.length) {
      this.delayedFx = this.delayedFx.filter((d) => {
        if (d.at > t && d.at - t < 2) return true
        if (d.at <= t) this.fx.add(d.a, d.x, d.y, d.at, d.flip, d.alpha)
        return false
      })
    }
    this.fx.draw(ctx, ox, oy, t)
    this.drawFlashes(t)
    this.drawLunges(t)
    this.ambience.update(dt, t, view, ox, oy, artW, artH)
    this.particles.update(dt)
    this.particles.draw(ctx, ox, oy, artW, artH)
    if (info.light !== 'day') this.drawLighting(view, info, t)
    this.particles.draw(ctx, ox, oy, artW, artH, true)
    this.numbers.draw(ctx, ox, oy, t)
    if (!input.demo) this.drawOverheads(view, info, t, input)
    this.composite()
    this.screenOverlay(input)
    this.lastMs = performance.now() - started
    return this.camera
  }

  /* ----------------------------------------------------------------------------------------------- camera */

  private followTarget(view: View, myId: string): HeroView | undefined {
    const me = view.players.find((p) => p.id === myId)
    const mine = me && me.ctrl >= 0 ? view.heroes.find((h) => h.slot === me.ctrl) : undefined
    return mine ?? view.heroes.find((h) => h.ctrl) ?? view.heroes[0]
  }

  private updateCamera(input: RenderInput, dt: number) {
    const { view, info } = input
    const hero = this.followTarget(view, input.myId)
    const tech = hero?.state === 'tech' ? view.techs.find((x) => x.slots.includes(hero.slot)) : undefined
    let tx = tech ? tech.x : (hero?.x ?? (info.w * TILE) / 2)
    let ty = tech ? tech.y - 24 - tech.z * 0.5 : hero ? hero.y - 24 : (info.h * TILE) / 2
    // 月下群狼陣: frame the pack and the enemies it lunges at.
    if (tech?.kind === 'pack' && tech.points?.length) {
      let sx = 0
      let sy = 0
      for (const [px, py] of tech.points) (sx += px), (sy += py)
      tx = (tx + sx / tech.points.length) / 2
      ty = (ty + sy / tech.points.length) / 2 - 24
    }
    // The room the followed hero is in decides the zoom.
    const htx = tx / TILE
    const hty = ty / TILE
    const room = info.rooms.find((r) => htx >= r.x && htx < r.x + r.w && hty >= r.y && hty < r.y + r.h)
    const wantZoom = (room?.zoom ?? BASE_VIEW_H) - (performance.now() < this.punchUntil ? 150 : 0)
    // A puzzle just solved nearby (a drawbridge lowering, a door opening): glance toward it.
    const look = this.look
    if (look && hero && !tech && performance.now() < look.until && Math.hypot(look.x - tx, look.y - ty) < 12 * TILE) {
      tx += (look.x - tx) * 0.45
      ty += (look.y - 40 - ty) * 0.45
    }
    // In a boss arena, frame the boss too: lean the camera a third of the way toward it.
    const boss = view.boss
    if (boss && room?.zoom && hero && !tech) {
      const bx = boss.x / TILE
      const by = boss.y / TILE
      if (bx >= room.x && bx < room.x + room.w && by >= room.y && by < room.y + room.h) {
        tx += (boss.x - tx) * 0.33
        ty += (boss.y - boss.z - 40 - ty) * 0.33
      }
    }
    this.zoom += (wantZoom - this.zoom) * (this.camReady ? smoothing(2.2, dt) : 1)
    if (Math.abs(wantZoom - this.zoom) < 0.5) this.zoom = wantZoom
    const sc = scalingFor(this.canvas.width, this.canvas.height, this.zoom)
    this.artW = sc.artW
    this.artH = sc.artH
    const cam = this.camera
    cam.scale = sc.scale
    cam.viewW = sc.artW
    cam.viewH = sc.artH
    cam.artPerCss = this.dpr / sc.scale
    if (!input.demo && input.cursor.inside && hero) {
      const lead = cursorLead(
        (input.cursor.x - this.cssW / 2) * cam.artPerCss,
        (input.cursor.y - this.cssH / 2) * cam.artPerCss
      )
      tx += lead.x
      ty += lead.y
    }
    if (input.shiftX) tx -= sc.artW * input.shiftX
    const want = clampCamera(tx, ty, sc.artW, sc.artH, info.w * TILE, info.h * TILE)
    if (!this.camReady) {
      cam.x = want.x
      cam.y = want.y
      this.camReady = true
    } else {
      // A long jump of the followed hero (mouse hole, respawn): glide over instead of snapping.
      const last = this.lastFollow
      if (hero && last?.slot === hero.slot && Math.hypot(hero.x - last.x, hero.y - last.y) > 3 * TILE)
        this.catchUntil = performance.now() + 900
      const k = smoothing(input.demo ? 1.6 : performance.now() < this.catchUntil ? 3.2 : 7, dt)
      cam.x += (want.x - cam.x) * k
      cam.y += (want.y - cam.y) * k
    }
    if (hero) this.lastFollow = { x: hero.x, y: hero.y, slot: hero.slot }
    const c = clampCamera(cam.x, cam.y, sc.artW, sc.artH, info.w * TILE, info.h * TILE)
    cam.x = c.x
    cam.y = c.y
    const o = viewOrigin(cam.x, cam.y, sc.artW, sc.artH)
    this.shakeAmp *= Math.exp(-dt * 9)
    if (this.shakeAmp < 0.3) this.shakeAmp = 0
    const s = input.shake ? this.shakeAmp : 0
    this.ox = o.x + Math.round((Math.random() * 2 - 1) * s)
    this.oy = o.y + Math.round((Math.random() * 2 - 1) * s)
    this.ensure(this.world, sc.artW, sc.artH)
    if (hero) {
      const k = sc.scale / this.dpr
      cam.heroCss = { x: (hero.x - this.ox) * k, y: (hero.y - hero.z - 14 - this.oy) * k }
    } else cam.heroCss = undefined
  }

  /* ------------------------------------------------------------------------------------------------ floor */

  private shadow(r: number): HTMLCanvasElement {
    const key = Math.max(3, Math.round(r))
    let c = this.shadowCache.get(key)
    if (c) return c
    c = document.createElement('canvas')
    c.width = key * 2 + 2
    c.height = Math.ceil(key * 0.9) + 2
    const g = c.getContext('2d')!
    g.fillStyle = 'rgba(24, 18, 40, 0.34)'
    g.beginPath()
    g.ellipse(c.width / 2, c.height / 2, key, key * 0.42, 0, 0, Math.PI * 2)
    g.fill()
    g.fillStyle = 'rgba(24, 18, 40, 0.18)'
    g.beginPath()
    g.ellipse(c.width / 2, c.height / 2, key * 0.65, key * 0.28, 0, 0, Math.PI * 2)
    g.fill()
    this.shadowCache.set(key, c)
    return c
  }

  private drawShadow(x: number, y: number, r: number, z: number) {
    const k = Math.max(0.45, 1 - z / 120)
    const c = this.shadow(r * k)
    const a = Math.max(0.35, 1 - z / 140)
    if (a < 1) this.wctx.globalAlpha = a
    this.wctx.drawImage(c, Math.round(x - this.ox - c.width / 2), Math.round(y - this.oy - c.height / 2))
    if (a < 1) this.wctx.globalAlpha = 1
  }

  private drawFloor(view: View, t: number, input: RenderInput) {
    const ctx = this.wctx
    const sheetId = `props:${view.stage}`
    this.drawBridges(view, t)
    for (const p of view.props) {
      if (!FLAT_PROPS.has(p.kind)) continue
      if (!this.visible(p.x, p.y, 80)) continue
      const name = propName(sheetId, p.kind, p.state)
      const a = name && findAnim(sheetId, name)
      if (a) blitAnim(ctx, a, t - p.st, p.x - this.ox, p.y - this.oy)
    }
    // Telegraphs.
    for (const e of view.enemies) if (e.tele && e.state !== 'death') this.drawTele(e.tele, t)
    if (view.boss?.tele) for (const tl of view.boss.tele) this.drawTele(tl, t)
    if (view.bossPet?.tele) for (const tl of view.bossPet.tele) this.drawTele(tl, t)
    if (view.minions) for (const m of view.minions) if (m.tele && m.state !== 'death') this.drawTele(m.tele, t)
    // Updraft vents breathe a soft glow.
    for (const p of view.props) {
      if (p.kind !== 'vent' || !this.visible(p.x, p.y, 80)) continue
      const g = this.ventSprite()
      ctx.globalCompositeOperation = 'lighter'
      ctx.globalAlpha = 0.28 + 0.12 * Math.sin(t * 3 + p.id)
      ctx.drawImage(g, Math.round(p.x - this.ox - g.width / 2), Math.round(p.y - this.oy - g.height / 2 - 6))
      ctx.globalAlpha = 1
      ctx.globalCompositeOperation = 'source-over'
    }
    // Rat-catcher snares lie on the ground; a sprung one holds its hero.
    if (view.snares) {
      const idle = findAnim('fx', 'snare')
      const snap = findAnim('fx', 'snare_snap')
      for (const sn of view.snares) {
        if (!this.visible(sn.x, sn.y, 40)) continue
        const a = sn.slot !== undefined ? snap : idle
        if (a) blitAnim(ctx, a, t - sn.st, sn.x - this.ox, sn.y - this.oy)
      }
    }
    // Technique landing marker.
    for (const x of view.techs) {
      if (x.kind === 'stampede') {
        if (x.stage === 'form' || x.stage === 'run') this.drawPath(x, t)
      } else if (x.stage === 'form' || x.stage === 'jump') this.drawTarget(x, t)
    }
    if (!input.demo) for (const f of view.formations) this.drawFormation(f, view, t)
    // Shadows of everything standing on the ground.
    for (const h of view.heroes)
      if (h.state !== 'tech' && this.visible(h.x, h.y, 64)) this.drawShadow(h.x, h.y + 1, 15, h.z)
    for (const e of view.enemies)
      if (e.state !== 'death' && this.visible(e.x, e.y, 64)) this.drawShadow(e.x, e.y + 1, 15, e.z ?? 0)
    if (view.boss) {
      // A wyvern high in the air still throws a broad shadow so you can read where it is.
      const big = (findAnim(`boss:${view.boss.kind}`, view.boss.animKey ?? view.boss.anim)?.frames[0].w ?? 128) > 128
      if (big) this.drawShadow(view.boss.x, view.boss.y + 2, 70 * Math.max(0.6, 1 - view.boss.z / 260), 0)
      else this.drawShadow(view.boss.x, view.boss.y + 2, 38, view.boss.z)
    }
    if (view.minions)
      for (const m of view.minions)
        if (m.state !== 'death' && this.visible(m.x, m.y, 64)) this.drawShadow(m.x, m.y + 1, 12, m.z)
    if (view.bossPet) this.drawShadow(view.bossPet.x, view.bossPet.y + 2, 44, view.bossPet.z)
    for (const p of view.pickups) if (this.visible(p.x, p.y, 32)) this.drawShadow(p.x, p.y + 1, 7, 0)
    for (const x of view.techs) if (x.kind === 'jumbo') this.drawShadow(x.x, x.y, 30 + x.tier * 12, x.z)
    for (const h of view.heroes)
      if (h.state === 'tech' && this.stampeding(h, view)) this.drawShadow(h.x, h.y + 1, 15, h.z)
    for (const s of view.shots)
      if (this.visible(s.x, s.y, 32))
        this.drawShadow(s.x, s.y, s.kind === 'pot' || s.kind === 'barrel' ? 12 : s.kind === 'bomb' ? 8 : 5, s.z)
    for (const p of view.props)
      if ((p.z ?? 0) > 0) this.drawShadow(p.x, p.y, p.kind === 'acorn' || p.kind === 'cheese' ? 30 : 13, p.z ?? 0)
  }

  /**
   * Drawbridges lie flat under everything: whole runs of decking when down, only the raised leaf on the hinge
   * column when up, and while lowering the deck unrolled from the hinge up to the leaf's falling free edge.
   */
  private drawBridges(view: View, t: number) {
    const sheetId = `props:${view.stage}`
    let key = ''
    for (const p of view.props) if (p.kind === 'drawbridge') key += `${p.id},`
    if (!key || !this.info) return
    key = `${view.stage}:${key}`
    if (key !== this.bridgesKey) {
      this.bridges = layoutBridges(view.props, this.info)
      this.bridgesKey = key
    }
    const ctx = this.wctx
    for (const p of view.props) {
      if (p.kind !== 'drawbridge' || !this.visible(p.x, p.y, 96)) continue
      const b = this.bridges.get(p.id)
      if (!b) continue
      const flip = b.dir < 0
      const x = p.x - this.ox
      const y = p.y - this.oy
      if (p.state === 'up') {
        const a = b.col === 'h' && findAnim(sheetId, upName(b))
        if (a) blitAnim(ctx, a, 0, x, y, flip)
        continue
      }
      const deck = findAnim(sheetId, downName(b))
      if (!deck) continue
      if (p.state !== 'lowering') {
        blitAnim(ctx, deck, 0, x, y, flip)
        continue
      }
      // The deck reaches `reach` px out from the hinge; the leaf's free edge rides its front.
      const age = t - p.st
      const reach = bridgeReach(b, age)
      const cover = Math.min(TILE, reach - b.i * TILE)
      if (cover <= 0) continue
      // (the hinge column's beam and posts stand 8 px out on the bank)
      const back = b.col === 'h' ? 8 : 0
      const left = b.dir > 0 ? p.x - TILE / 2 - back : p.x + TILE / 2 - cover
      ctx.save()
      ctx.beginPath()
      ctx.rect(Math.round(left - this.ox), Math.round(y - 64), Math.round(cover + back), 128)
      ctx.clip()
      blitAnim(ctx, deck, 0, x, y, flip)
      ctx.restore()
      if (cover < TILE) {
        const edge = findAnim(sheetId, edgeName(b))
        if (edge) blitAnim(ctx, edge, age, b.hingeX + b.dir * reach - this.ox, y, flip)
      }
    }
  }

  private drawTele(tl: Telegraph, t: number) {
    const ctx = this.wctx
    const span = Math.max(0.05, tl.until - tl.from)
    const p = Math.min(1, Math.max(0, (t - tl.from) / span))
    if (t > tl.until + 0.15) return
    const pulse = 0.5 + 0.5 * Math.sin(t * 20)
    const x = tl.x - this.ox
    const y = tl.y - this.oy
    ctx.save()
    ctx.translate(x, y)
    ctx.beginPath()
    if (tl.kind === 'circle') ctx.arc(0, 0, tl.r, 0, Math.PI * 2)
    else if (tl.kind === 'cone') {
      const s = tl.spread ?? 0.6
      ctx.moveTo(0, 0)
      ctx.arc(0, 0, tl.r, (tl.a ?? 0) - s, (tl.a ?? 0) + s)
      ctx.closePath()
    } else {
      ctx.rotate(tl.a ?? 0)
      ctx.rect(0, -tl.r / 2, tl.len ?? 200, tl.r)
    }
    ctx.fillStyle = 'rgba(214, 38, 46, 0.17)'
    ctx.fill()
    ctx.lineWidth = 2
    ctx.strokeStyle = `rgba(255, ${90 + pulse * 60}, 80, ${0.45 + pulse * 0.45})`
    ctx.stroke()
    // Fill toward the moment it lands.
    ctx.beginPath()
    if (tl.kind === 'circle') ctx.arc(0, 0, tl.r * p, 0, Math.PI * 2)
    else if (tl.kind === 'cone') {
      const s = tl.spread ?? 0.6
      ctx.moveTo(0, 0)
      ctx.arc(0, 0, tl.r * p, (tl.a ?? 0) - s, (tl.a ?? 0) + s)
      ctx.closePath()
    } else ctx.rect(0, -tl.r / 2, (tl.len ?? 200) * p, tl.r)
    ctx.fillStyle = `rgba(255, 70, 60, ${0.18 + p * 0.2})`
    ctx.fill()
    ctx.restore()
  }

  private drawTarget(x: TechView, t: number) {
    const ctx = this.wctx
    const r = [0, 0, 90, 120, 150][x.tier] ?? 100
    const pulse = 0.5 + 0.5 * Math.sin(t * 14)
    ctx.save()
    ctx.translate(x.tx - this.ox, x.ty - this.oy)
    ctx.beginPath()
    ctx.arc(0, 0, r, 0, Math.PI * 2)
    ctx.fillStyle = 'rgba(255, 220, 110, 0.12)'
    ctx.fill()
    ctx.setLineDash([6, 4])
    ctx.lineDashOffset = -t * 30
    ctx.lineWidth = 2
    ctx.strokeStyle = `rgba(255, 236, 160, ${0.55 + 0.4 * pulse})`
    ctx.stroke()
    ctx.setLineDash([])
    ctx.restore()
  }

  private drawFormation(f: View['formations'][number], view: View, t: number) {
    const ctx = this.wctx
    const members: HeroView[] = []
    for (const s of f.slots) {
      const h = view.heroes.find((q) => q.slot === s)
      if (h && h.state !== 'tech') members.push(h)
    }
    if (members.length < 2) return
    const n = f.slots.length
    const pulse = f.ready ? 0.5 + 0.5 * Math.sin(t * 12) : 0.5 + 0.5 * Math.sin(t * 3)
    ctx.save()
    ctx.globalCompositeOperation = 'lighter'
    ctx.lineCap = 'round'
    for (let i = 0; i < members.length; i++)
      for (let j = i + 1; j < members.length; j++) {
        const a = members[i]
        const b = members[j]
        if (Math.hypot(a.x - b.x, a.y - b.y) > LINK) continue
        const ax = a.x - this.ox
        const ay = a.y - this.oy - 4
        const bx = b.x - this.ox
        const by = b.y - this.oy - 4
        const g = ctx.createLinearGradient(ax, ay, bx, by)
        g.addColorStop(0, JOB_COLORS[a.job])
        g.addColorStop(1, JOB_COLORS[b.job])
        ctx.strokeStyle = g
        ctx.globalAlpha = 0.22 + 0.12 * pulse
        ctx.lineWidth = 7
        ctx.beginPath()
        ctx.moveTo(ax, ay)
        ctx.lineTo(bx, by)
        ctx.stroke()
        ctx.globalAlpha = 0.7
        ctx.lineWidth = 2
        ctx.stroke()
      }
    // Centroid ring.
    const r = 26 + n * 9 + (f.ready ? pulse * 4 : 0)
    const cx = f.x - this.ox
    const cy = f.y - this.oy
    ctx.globalAlpha = f.ready ? 0.55 + 0.4 * pulse : 0.45
    ctx.strokeStyle = f.ready ? '#fff1a8' : '#f7e7c0'
    ctx.lineWidth = f.ready ? 3 : 2
    ctx.beginPath()
    ctx.ellipse(cx, cy, r, r * 0.5, 0, 0, Math.PI * 2)
    ctx.stroke()
    ctx.globalAlpha = 0.25
    ctx.lineWidth = 1
    ctx.beginPath()
    ctx.ellipse(cx, cy, r + 5, (r + 5) * 0.5, 0, 0, Math.PI * 2)
    ctx.stroke()
    // Member pips around the ring in job colours.
    ctx.globalCompositeOperation = 'source-over'
    ctx.globalAlpha = 1
    for (let i = 0; i < n; i++) {
      const h = view.heroes.find((q) => q.slot === f.slots[i])
      if (!h) continue
      const a = -Math.PI / 2 + (i / n) * Math.PI * 2 + t * 0.6
      ctx.fillStyle = JOB_COLORS[h.job]
      ctx.fillRect(Math.round(cx + Math.cos(a) * r) - 2, Math.round(cy + Math.sin(a) * r * 0.5) - 2, 4, 4)
    }
    ctx.restore()
    this.label(
      f.x,
      f.y + r * 0.5 + 12,
      FORMATION_NAMES[n] ?? '陣形',
      f.ready ? '#fff1a8' : '#fff8e6',
      f.ready ? 15 + pulse * 2 : 13,
      0.95,
      'rgba(40,24,52,0.72)'
    )
  }

  /* ----------------------------------------------------------------------------------------------- sorted */

  private push(y: number, kind: DrawKind, i: number) {
    let it = this.items[this.itemCount]
    if (!it) this.items[this.itemCount] = it = { y, kind, i }
    else (it.y = y), (it.kind = kind), (it.i = i)
    this.itemCount++
  }

  private visible(x: number, y: number, m: number) {
    return x > this.ox - m && x < this.ox + this.artW + m && y > this.oy - m && y < this.oy + this.artH + m * 2.5
  }

  private collect(view: View, info: StageInfo) {
    this.itemCount = 0
    info.decor.forEach((d, i) => {
      if (this.visible(d.x, d.y, 140)) this.push(d.y, K_DECOR, i)
    })
    info.npcs.forEach((n, i) => {
      if (this.visible(n.x, n.y, 64)) this.push(n.y, K_NPC, i)
    })
    // A delivered bell or log is pictured by its hook or ram cradle; drawing the item too would show it twice.
    const delivered = hiddenDelivered(view.props)
    view.props.forEach((p, i) => {
      if (FLAT_PROPS.has(p.kind) || p.kind === 'drawbridge' || delivered.has(p.id)) return
      const at = this.propPos(p)
      if (!this.visible(at.x, at.y, 140)) return
      this.push(propSortY(p, at.y), K_PROP, i)
    })
    view.heroes.forEach((h, i) => {
      if ((h.state !== 'tech' || this.stampeding(h, view)) && this.visible(h.x, h.y, 64)) this.push(h.y, K_HERO, i)
    })
    view.enemies.forEach((e, i) => {
      if (this.visible(e.x, e.y, 64)) this.push(e.y, K_ENEMY, i)
    })
    if (view.boss) this.push(view.boss.y, K_BOSS, 0)
    if (view.bossPet) this.push(view.bossPet.y, K_PET, 0)
    view.minions?.forEach((m, i) => {
      if (this.visible(m.x, m.y, 64)) this.push(m.y, K_MINION, i)
    })
    this.transitions(view)
    view.pickups.forEach((p, i) => {
      if (this.visible(p.x, p.y, 32)) this.push(p.y, K_PICKUP, i)
    })
    view.techs.forEach((x, i) => this.push(x.y, K_TECH, i))
    const items = this.items
    // Insertion sort: the list is nearly sorted frame to frame and short.
    for (let i = 1; i < this.itemCount; i++) {
      const it = items[i]
      let j = i - 1
      while (j >= 0 && items[j].y > it.y) {
        items[j + 1] = items[j]
        j--
      }
      items[j + 1] = it
    }
  }

  private propPos(p: PropView): { x: number; y: number } {
    if (p.from && p.to && p.dur && p.state === 'sliding') {
      const k = Math.min(1, Math.max(0, ((this.view?.t ?? 0) - p.st) / p.dur))
      const e = k * k * (3 - 2 * k)
      return { x: p.from[0] + (p.to[0] - p.from[0]) * e, y: p.from[1] + (p.to[1] - p.from[1]) * e }
    }
    return p
  }

  private drawSorted(view: View, info: StageInfo, t: number) {
    const ctx = this.wctx
    const propSheet = `props:${view.stage}`
    for (let n = 0; n < this.itemCount; n++) {
      const it = this.items[n]
      switch (it.kind) {
        case K_DECOR: {
          const d = info.decor[it.i]
          const name = propName(propSheet, d.kind, 'idle')
          const a = name && findAnim(propSheet, name)
          // Desynchronise swaying canopies and flickering torches.
          const seed = ((d.x * 13 + d.y * 7) % 97) / 10
          // Clouds drift lazily over the sky sea.
          const dx = d.kind === 'cloud' ? Math.sin(t * 0.07 + seed) * 28 : 0
          const dy = d.kind === 'cloud' ? Math.sin(t * 0.05 + seed * 2) * 5 : 0
          if (a) blitAnim(ctx, a, t + seed, d.x - this.ox + dx, d.y - this.oy + dy, !!d.flip)
          break
        }
        case K_NPC: {
          const npc = info.npcs[it.i]
          const talking = view.dialogs.some((dl) => Math.hypot(dl.x - npc.x, dl.y - npc.y) < 120)
          const a = findAnim(`npc:${npc.kind}`, talking ? 'talk' : 'idle')
          if (a) {
            this.drawShadow(npc.x, npc.y + 1, 15, 0)
            blitAnim(ctx, a, t, npc.x - this.ox, npc.y - this.oy)
          }
          break
        }
        case K_PROP:
          this.drawProp(view.props[it.i], propSheet, t)
          break
        case K_HERO:
          this.drawHero(view.heroes[it.i], view, t)
          break
        case K_ENEMY:
          this.drawEnemy(view.enemies[it.i], t)
          break
        case K_BOSS:
          if (view.boss) this.drawBoss(view.boss, `boss:${view.boss.kind}`, t)
          break
        case K_PET:
          if (view.bossPet) this.drawBoss(view.bossPet, `boss:${view.bossPet.kind}`, t)
          break
        case K_MINION:
          if (view.minions) this.drawMinion(view.minions[it.i], t)
          break
        case K_PICKUP:
          this.drawPickup(view.pickups[it.i], t)
          break
        case K_TECH:
          this.drawTech(view.techs[it.i], view, t)
          break
      }
    }
  }

  private drawProp(p: PropView, sheetId: string, t: number) {
    const name = propName(sheetId, p.kind, p.state)
    const a = name && findAnim(sheetId, name)
    if (!a) return
    const at = this.propPos(p)
    const z = p.z ?? 0
    // Lifted things bob gently with the carrier's steps.
    const bob = z > 0 ? Math.round(Math.sin(t * 9) * 1) : 0
    blitAnim(this.wctx, a, t - p.st, at.x - this.ox, at.y - z - this.oy + bob)
    if (MOON_PROPS.has(p.kind) && p.state === 'on') {
      const glow = findAnim('fx', 'moonlight')
      if (glow)
        blitAnim(
          this.wctx,
          glow,
          t + p.id * 0.13,
          at.x - this.ox,
          at.y - this.oy - (p.kind === 'bigmoon' ? 56 : 34),
          false,
          0.85
        )
    }
    if (p.kind === 'iceblock' && p.state === 'sliding' && Math.random() < 0.6) {
      this.particles.spawn('skid', at.x + (Math.random() - 0.5) * 40, at.y + 26, 0, 0, 0, 0, 1.4)
      if (Math.random() < 0.3) this.particles.burst('snowball', at.x, at.y + 20, 1)
    }
    const rang = this.bellRings.get(p.id)
    if (rang !== undefined && t - rang < 0.9) this.drawRing(at.x, at.y - 56, t - rang)
  }

  /** Sound lines spreading from a ringing bell. */
  private drawRing(x: number, y: number, age: number) {
    const ctx = this.wctx
    ctx.lineWidth = 2
    for (let k = 0; k < 3; k++) {
      const a = age - k * 0.14
      if (a <= 0 || a > 0.6) continue
      const r = 16 + a * 70
      ctx.globalAlpha = (1 - a / 0.6) * 0.9
      ctx.strokeStyle = k === 0 ? '#fff6c8' : '#ffd96a'
      for (const side of [0, Math.PI]) {
        ctx.beginPath()
        ctx.arc(x - this.ox, y - this.oy, r, side - 0.6, side + 0.6)
        ctx.stroke()
      }
    }
    ctx.globalAlpha = 1
  }

  /** Effects on prop state changes: bells ring, drawbridges and doors raise dust, windmills kick up a gust. */
  private transitions(view: View) {
    for (const p of view.props) {
      const prev = this.propStates.get(p.id)
      if (prev === p.state) continue
      this.propStates.set(p.id, p.state)
      if (prev === undefined) continue
      if (p.state === 'ring') this.bellRings.set(p.id, view.t)
      else if (p.state === 'lowering' || p.state === 'opening') {
        // A drawbridge shakes its dust off at the hinge, not over the open sky.
        const b = p.kind === 'drawbridge' ? this.bridges.get(p.id) : undefined
        if (b && b.col !== 'h') continue
        this.particles.burst('dust', p.x, p.y + 10, 14)
        if (p.kind === 'drawbridge' || p.kind === 'lockdoor') this.particles.burst('rubble', p.x, p.y, 6)
      } else if (p.kind === 'moonstone' && p.state === 'on') {
        this.particles.burst('spark', p.x, p.y - 30, 8)
        this.lighting.flash(p.x, p.y - 30, 220, 'cool', view.t, 0.6)
      } else if (p.kind === 'bigmoon' && p.state === 'on') {
        // Resonance: two howl rings close in on the great moonstone, then it blazes.
        const howl = findAnim('fx', 'howl')
        if (howl) for (const dx of [-70, 70]) this.fx.add(howl, p.x + dx, p.y - 30, view.t)
        this.lighting.flash(p.x, p.y - 40, 560, 'cool', view.t + 0.2, 1.2)
        this.particles.burst('spark', p.x, p.y - 40, 24)
        this.shakeAmp = Math.min(14, this.shakeAmp + 8)
        this.wash('rgb(220, 236, 255)', 0.4, 200, 600)
      } else if (p.kind === 'iceblock' && p.state === 'sliding') {
        this.particles.burst('dust', p.x, p.y + 20, 6)
        this.particles.burst('snowball', p.x, p.y, 6)
      } else if (p.kind === 'icewall' && p.state === 'break') {
        this.particles.burst('shard', p.x, p.y - 40, 24)
        this.particles.burst('snowball', p.x, p.y - 30, 20)
        this.lighting.flash(p.x, p.y - 40, 300, 'cool', view.t, 0.5)
        this.shakeAmp = Math.min(16, this.shakeAmp + 9)
      } else if (p.kind === 'ramslot' && p.state === 'on') {
        // The battering ram hits the fortress gate.
        this.particles.burst('rubble', p.x, p.y - 30, 24)
        this.particles.burst('dust', p.x, p.y, 18)
        this.shakeAmp = 16
        this.wash('rgb(255, 250, 235)', 0.3, 0, 300)
      } else if (p.kind === 'snowpile' && p.state === 'dig') {
        this.particles.burst('snowball', p.x, p.y - 10, 18)
        this.particles.burst('dust', p.x, p.y, 6)
      } else if (p.state === 'spin') {
        this.particles.burst('dust', p.x, p.y + 20, 10)
        this.particles.burst('feather', p.x, p.y - 80, 6)
      }
    }
  }

  private ventSprite(): HTMLCanvasElement {
    if (this.ventGlow) return this.ventGlow
    const c = document.createElement('canvas')
    c.width = 96
    c.height = 48
    const g = c.getContext('2d')!
    const grad = g.createRadialGradient(48, 24, 0, 48, 24, 48)
    grad.addColorStop(0, 'rgba(210, 245, 255, 0.9)')
    grad.addColorStop(0.5, 'rgba(160, 220, 255, 0.35)')
    grad.addColorStop(1, 'rgba(160, 220, 255, 0)')
    g.setTransform(1, 0, 0, 0.5, 0, 12)
    g.fillStyle = grad
    g.fillRect(0, 0, 96, 96)
    return (this.ventGlow = c)
  }

  private drawMinion(m: NonNullable<View['minions']>[number], t: number) {
    const sheetId = `minion:${m.kind}`
    const { dir, flip } = dirOf(m.facing)
    const name = pickName(sheetId, `${m.state}_${dir}`, m.state, `fly_${dir}`)
    const a = name && findAnim(sheetId, name)
    if (!a || !name) return
    const mirror = name.endsWith('_side') && flip
    const x = m.x - this.ox
    const y = m.y - this.oy - m.z
    blitAnim(this.wctx, a, t - m.st, x, y, mirror, 1, m.z > 0.5)
    if (m.hitAt !== undefined && t - m.hitAt < 0.1 && t >= m.hitAt) {
      const fa = findFlash(sheetId, name)
      if (fa) blitAnim(this.wctx, fa, t - m.st, x, y, mirror, 0.85, m.z > 0.5)
    }
  }

  /** A hero inside a stampede is drawn running (other techniques hide their members). */
  private stampeding(h: HeroView, view: View): boolean {
    return view.techs.some((x) => SHOWN_TECHS.has(x.kind) && x.slots.includes(h.slot))
  }

  private heroAnim(h: HeroView, species: string): { sheet: string; name: string; flip: boolean } {
    const sheetId = `hero:${species}:${h.job}`
    const { dir, flip } = dirOf(h.facing)
    let name: string
    switch (h.state) {
      case 'tech':
        name = pickName(sheetId, `action_${dir}`, `walk_${dir}`) ?? `idle_${dir}`
        break
      case 'down':
      case 'revive':
      case 'victory':
      case 'fall':
        name = h.state
        break
      default:
        name = pickName(sheetId, `${h.state}_${dir}`, `idle_${dir}`) ?? `idle_${dir}`
    }
    return { sheet: sheetId, name, flip: dir === 'side' && flip }
  }

  private drawHero(h: HeroView, view: View, t: number) {
    const { sheet, name, flip } = this.heroAnim(h, view.species)
    const at = t - h.st
    const flash = h.state === 'hurt' && at < 0.1
    const a = findAnim(sheet, name)
    if (!a) return
    let alpha = 1
    if (h.inv > t && h.state !== 'down' && Math.floor(t * 18) % 2 === 0) alpha = 0.35
    // A snared hero struggles in place.
    const shakeX = (h.snared ?? 0) > t ? (Math.floor(t * 24) % 2 ? 1 : -1) : 0
    const x = h.x - this.ox + shakeX
    let y = h.y - this.oy - h.z
    // Falling into a pit or the sky: drop away and fade.
    if (h.state === 'fall') {
      alpha *= Math.max(0, 1 - at / 0.7)
      y += at * at * 180
    }
    // Crows kick up dust and a feather as they take off.
    const pz = this.heroZ.get(h.slot) ?? 0
    if (view.species === 'crow' && pz < 1 && h.z > 3 && h.state !== 'tech') {
      this.particles.burst('dust', h.x, h.y, 6)
      this.particles.burst('feather', h.x, h.y - 20, 2)
    }
    this.heroZ.set(h.slot, h.z)
    this.footwork(h, view, t)
    const running = view.techs.some(
      (q) => (q.kind === 'stampede' || (q.kind === 'pack' && q.stage === 'lunge')) && q.slots.includes(h.slot)
    )
    const dashing = running || (h.state === 'action' && view.species === 'rat')
    this.drawTrail(h, a, at, flip, dashing, t)
    if (running && view.species === 'rat') {
      const aura = findAnim(`tech:${view.species}`, 'rush_aura')
      if (aura) blitAnim(this.wctx, aura, t + h.slot * 0.07, x, y, flip, 0.9)
    }
    if (h.state === 'charge' && h.charge >= 1) {
      const aura = findAnim('fx', 'charge_full')
      if (aura) blitAnim(this.wctx, aura, t, x, h.y - this.oy, false, 0.85)
    }
    blitAnim(this.wctx, a, at, x, y, flip, alpha, h.z > 0.5)
    if (flash) {
      const fa = findFlash(sheet, name)
      if (fa) blitAnim(this.wctx, fa, at, x, y, flip, 0.75 * alpha, h.z > 0.5)
    }
    if (h.state === 'down') {
      const soul = findAnim('fx', 'soul')
      if (soul) blitAnim(this.wctx, soul, t, x, y - 34)
    }
  }

  /** Wolves kick up snow when sprinting; anyone skids on ice. */
  private footwork(h: HeroView, view: View, t: number) {
    const m = this.moving.get(h.slot) ?? { x: h.x, y: h.y, run: 0, puff: 0 }
    const d = Math.hypot(h.x - m.x, h.y - m.y)
    const moving = d > 0.6 && d < 40 && h.z < 1
    const dt = 1 / 60
    m.run = moving ? m.run + dt : 0
    m.puff -= dt
    const info = this.info
    const tile = info ? info.tiles[Math.floor(h.y / TILE) * info.w + Math.floor(h.x / TILE)] : undefined
    if (moving && m.puff <= 0) {
      if (tile === 'ice') {
        this.particles.spawn('skid', h.x + (Math.random() - 0.5) * 8, h.y + 1, 0, 0, 0, 0, 1.6)
        if (Math.random() < 0.25) this.particles.spawn('chargeSpark', h.x, h.y, 2, 0, 0, 20, 0.4)
        m.puff = 0.05
      } else if (view.species === 'wolf' && m.run > 0.6) {
        this.particles.spawn('dust', h.x - (h.x - m.x) * 3, h.y + 2, 2, -(h.x - m.x) * 10, -(h.y - m.y) * 10, 8, 0.4)
        if (tile === 'snow') this.particles.burst('snowball', h.x, h.y, 1)
        m.puff = 0.1
      }
    }
    m.x = h.x
    m.y = h.y
    this.moving.set(h.slot, m)
    void t
  }

  /** Afterimages behind a dashing rat (and the stampede line): fading copies at recent positions. */
  private drawTrail(h: HeroView, a: Anim, at: number, flip: boolean, dashing: boolean, t: number) {
    let list = this.trails.get(h.slot)
    if (!dashing) {
      if (list?.length) list.length = 0
      return
    }
    if (!list) this.trails.set(h.slot, (list = []))
    const last = list[list.length - 1]
    if (!last || t - last.t >= 1 / 30) list.push({ x: h.x, y: h.y, z: h.z, t })
    while (list.length > 5 || (list.length && t - list[0].t > 0.2)) list.shift()
    const ghost = findFlash(
      `hero:${this.view?.species ?? 'rat'}:${h.job}`,
      this.heroAnim(h, this.view?.species ?? 'rat').name
    )
    for (let i = 0; i < list.length - 1; i++) {
      const p = list[i]
      const k = (i + 1) / list.length
      this.wctx.globalCompositeOperation = 'lighter'
      blitAnim(this.wctx, ghost ?? a, at, p.x - this.ox, p.y - p.z - this.oy, flip, 0.12 + 0.2 * k, true)
      this.wctx.globalCompositeOperation = 'source-over'
    }
  }

  private enemyName(e: EnemyView, sheetId: string): { name?: string; flip: boolean } {
    if (e.state === 'death') return { name: pickName(sheetId, 'death'), flip: false }
    const { dir, flip } = dirOf(e.facing)
    if (e.state === 'heal') return { name: pickName(sheetId, 'heal', `idle_${dir}`), flip: dir === 'side' && flip }
    return { name: pickName(sheetId, `${e.state}_${dir}`, `idle_${dir}`), flip: dir === 'side' && flip }
  }

  private drawEnemy(e: EnemyView, t: number) {
    const sheetId = `enemy:${e.kind}`
    // Caught in a tornado: spun round and round.
    const spun = this.view?.techs.some(
      (x) => x.kind === 'tornado' && x.stage === 'spin' && Math.hypot(e.x - x.x, e.y - x.y) < 200
    )
    if (spun && e.state !== 'death') e = { ...e, facing: t * 14 + e.id }
    const { name, flip } = this.enemyName(e, sheetId)
    if (!name) return
    const flash = e.hitAt !== undefined && t - e.hitAt < 0.1 && t >= e.hitAt
    const a = findAnim(sheetId, name)
    if (!a) return
    const x = e.x - this.ox
    const y = e.y - this.oy - (e.z ?? 0)
    const at = t - e.st
    blitAnim(this.wctx, a, at, x, y, flip)
    if (flash) {
      const fa = findFlash(sheetId, name)
      if (fa) blitAnim(this.wctx, fa, at, x, y, flip, 0.9)
    }
    if ((e.ward ?? 0) > t && e.state !== 'death') this.drawWard(x, y, t, e.ward! - t)
  }

  /** The bell monk's ward: a soft golden bubble with a shimmer sweeping over it. */
  private drawWard(x: number, y: number, t: number, left: number) {
    const ctx = this.wctx
    const fade = Math.min(1, left * 2)
    ctx.save()
    ctx.translate(x, y - 26)
    ctx.globalAlpha = 0.16 * fade
    ctx.fillStyle = '#ffe9a0'
    ctx.beginPath()
    ctx.ellipse(0, 0, 24, 30, 0, 0, Math.PI * 2)
    ctx.fill()
    ctx.globalAlpha = (0.5 + 0.25 * Math.sin(t * 6)) * fade
    ctx.strokeStyle = '#ffd96a'
    ctx.lineWidth = 1.5
    ctx.stroke()
    const a = (t * 2.4) % (Math.PI * 2)
    ctx.globalAlpha = 0.85 * fade
    ctx.strokeStyle = '#fffbe8'
    ctx.lineWidth = 2
    ctx.beginPath()
    ctx.ellipse(0, 0, 24, 30, 0, a, a + 0.7)
    ctx.stroke()
    ctx.restore()
  }

  private drawBoss(b: Omit<BossView, 'kind'>, sheetId: string, t: number) {
    const { dir, flip } = dirOf(b.facing)
    const name = pickName(sheetId, b.animKey ?? '', b.anim, `${b.anim}_${dir}`, `idle_${dir}`, 'idle_down')
    if (!name) return
    const a = findAnim(sheetId, name)
    if (!a) return
    const mirror = name.endsWith('_side') && flip
    const x = b.x - this.ox
    // Hovering bosses (milda on her broom) bob with their own lift on top of the hover height.
    const y = b.y - this.oy - b.z
    // Leon's parry stance (attacks bounce off): a pulsing bright rim behind the body, so his face, armour and sword
    // stay readable instead of washing out to a white silhouette.
    const parrying = (b.parry ?? 0) > t
    if (parrying) {
      const fh = findFlash(sheetId, name)
      if (fh) {
        const k = 0.55 + 0.3 * Math.sin(t * 18)
        this.wctx.globalCompositeOperation = 'lighter'
        for (const [dx, dy] of RIM_OFFSETS) blitAnim(this.wctx, fh, t - b.st, x + dx, y + dy, mirror, k)
        this.wctx.globalCompositeOperation = 'source-over'
      }
    }
    blitAnim(this.wctx, a, t - b.st, x, y, mirror)
    if (b.hitAt !== undefined && t - b.hitAt < 0.1 && t >= b.hitAt) {
      const fa = findFlash(sheetId, name)
      if (fa) blitAnim(this.wctx, fa, t - b.st, x, y, mirror, 0.8)
    }
    if (parrying) {
      const fa = findFlash(sheetId, name)
      if (fa) {
        this.wctx.globalCompositeOperation = 'lighter'
        blitAnim(this.wctx, fa, t - b.st, x, y, mirror, 0.06 + 0.04 * Math.sin(t * 18))
        this.wctx.globalCompositeOperation = 'source-over'
      }
      this.label(b.x, b.y - b.z - 132, '受け流しの構え', '#fff1a8', 12, 1, 'rgba(60,40,10,0.75)')
    }
    if (b.anim === 'shield') this.drawHolyShield(x, y, t)
    if (sheetId === `boss:${this.view?.boss?.kind}`) {
      if (b.anim === 'awaken' && this.bossAnim !== 'awaken') {
        this.punchUntil = performance.now() + 1500
        this.wash('rgb(255, 248, 220)', 0.65, 0, 700)
        this.lighting.flash(b.x, b.y - 60, 600, 'white', t, 1.2)
        this.shakeAmp = Math.min(16, this.shakeAmp + 8)
      }
      this.bossAnim = b.anim
      if (this.bossZ > 20 && b.z < 4) {
        this.particles.burst('dust', b.x, b.y, 16)
        this.particles.burst('feather', b.x, b.y - 40, 4)
        this.shakeAmp = Math.min(14, this.shakeAmp + 4)
      }
      this.bossZ = b.z
    }
    if ((b.broken ?? 0) > t || b.anim === 'downed') {
      const stun = findAnim('fx', 'stun')
      if (stun) blitAnim(this.wctx, stun, t, x, y - (a.frames[0].h > 128 ? 150 : 104))
    }
  }

  /** The holy shield bubble: immune until the pack technique shatters it. */
  private drawHolyShield(x: number, y: number, t: number) {
    const ctx = this.wctx
    const pulse = 0.5 + 0.5 * Math.sin(t * 5)
    ctx.save()
    ctx.translate(x, y - 56)
    ctx.globalCompositeOperation = 'lighter'
    ctx.globalAlpha = 0.16 + 0.06 * pulse
    ctx.fillStyle = '#ffe9a8'
    ctx.beginPath()
    ctx.ellipse(0, 0, 66, 78, 0, 0, Math.PI * 2)
    ctx.fill()
    ctx.globalCompositeOperation = 'source-over'
    ctx.globalAlpha = 0.7 + 0.3 * pulse
    ctx.strokeStyle = '#fff4c0'
    ctx.lineWidth = 2
    ctx.stroke()
    // Runes orbiting the bubble.
    ctx.fillStyle = '#fffbe8'
    for (let i = 0; i < 6; i++) {
      const a = t * 1.4 + (i / 6) * Math.PI * 2
      ctx.fillRect(Math.round(Math.cos(a) * 66) - 1, Math.round(Math.sin(a) * 78) - 1, 3, 3)
    }
    ctx.restore()
  }

  private drawPickup(p: PickupView, t: number) {
    const a = findAnim('items', p.kind)
    if (!a) return
    const age = t - p.st
    const hop = age < 0.45 ? Math.sin((age / 0.45) * Math.PI) * 18 : Math.max(0, Math.sin(t * 4 + p.id)) * 2
    blitAnim(this.wctx, a, t, p.x - this.ox, p.y - this.oy - hop)
  }

  private drawTech(x: TechView, view: View, t: number) {
    if (x.kind === 'tornado') return this.drawTornado(x, view, t)
    if (x.kind === 'pack') return this.drawPack(x, t)
    if (x.kind !== 'jumbo') return
    const stage = x.stage === 'form' || x.stage === 'jump' || x.stage === 'land' ? x.stage : undefined
    if (!stage) return
    const sheetId = `tech:${view.species}`
    const a = findAnim(sheetId, `jumbo_${x.tier}_${stage}`)
    if (!a) return
    blitAnim(this.wctx, a, t - x.st, x.x - this.ox, x.y - x.z - this.oy, false, 1, x.z > 0.5)
  }

  /**
   * 月下群狼陣: each lunge leaves a moonlit streak from the pack's centre to its target that lingers and fades,
   * with a burst of sparks where it lands (the howl, moon and crescent come as fx events).
   */
  private drawPack(x: TechView, t: number) {
    if (x.stage !== 'lunge' || !x.points?.length) return
    const upTo = Math.min(x.points.length - 1, x.index ?? 0)
    for (let i = 0; i <= upTo; i++) {
      const key = x.id * 16 + i
      if (this.lungeSeen.has(key)) continue
      this.lungeSeen.add(key)
      const [qx, qy] = x.points[i]
      const [px, py] = i > 0 ? x.points[i - 1] : [x.x, x.y]
      this.lunges.push({ x0: px, y0: py, x1: qx, y1: qy, t0: t })
      this.particles.burst('spark', qx, qy - 20, 12)
      this.particles.burst('snowball', qx, qy, 8)
      const hit = findAnim('fx', 'hit')
      if (hit) this.fx.add(hit, qx, qy - 24, t)
      this.lighting.flash(qx, qy - 20, 180, 'cool', t, 0.4)
    }
    if (this.lungeSeen.size > 200) this.lungeSeen.clear()
  }

  private lunges: { x0: number; y0: number; x1: number; y1: number; t0: number }[] = []
  private lungeSeen = new Set<number>()

  /** Lingering lunge streaks (drawn after the actors). */
  private drawLunges(t: number) {
    const ctx = this.wctx
    let keep = 0
    for (const l of this.lunges) {
      const age = t - l.t0
      if (age > 0.7 || age < -1) continue
      this.lunges[keep++] = l
      const k = Math.min(1, age / 0.08)
      const fade = 1 - age / 0.7
      const ex = l.x0 + (l.x1 - l.x0) * k
      const ey = l.y0 + (l.y1 - l.y0) * k
      ctx.save()
      ctx.globalCompositeOperation = 'lighter'
      ctx.lineCap = 'round'
      ctx.beginPath()
      ctx.moveTo(l.x0 - this.ox, l.y0 - this.oy - 20)
      ctx.lineTo(ex - this.ox, ey - this.oy - 20)
      ctx.globalAlpha = 0.45 * fade
      ctx.strokeStyle = '#8fc8ff'
      ctx.lineWidth = 12 * fade + 2
      ctx.stroke()
      ctx.globalAlpha = 0.95 * fade
      ctx.strokeStyle = '#ffffff'
      ctx.lineWidth = 3
      ctx.stroke()
      ctx.restore()
    }
    this.lunges.length = keep
  }

  /** 黒羽の大旋風: the whirlwind sprite with black feathers spiralling up around it. */
  private drawTornado(x: TechView, view: View, t: number) {
    if (x.stage !== 'spin' && x.stage !== 'end') return
    const sheetId = `tech:${view.species}`
    const a = findAnim(sheetId, `tornado_${x.tier}`)
    const fade = x.stage === 'end' ? Math.max(0, 1 - (t - x.st) / 0.5) : Math.min(1, (t - x.st) / 0.2)
    const cx = x.x - this.ox
    const cy = x.y - this.oy
    if (a) blitAnim(this.wctx, a, t, cx, cy, false, 0.92 * fade)
    const feather = findAnim(sheetId, 'feather')
    if (!feather) return
    const r = [0, 0, 80, 100, 130][x.tier] ?? 100
    for (let i = 0; i < 14; i++) {
      const k = ((i * 37) % 14) / 14
      const ang = t * (5 + k * 3) + (i / 14) * Math.PI * 2
      const h = ((t * 60 + i * 23) % 150) + 6
      const rad = r * (0.25 + 0.55 * k) * (0.7 + h / 300)
      blitAnim(
        this.wctx,
        feather,
        t + i * 0.1,
        cx + Math.cos(ang) * rad,
        cy + Math.sin(ang) * rad * 0.4 - h,
        i % 2 === 0,
        fade
      )
    }
  }

  /* ------------------------------------------------------------------------------------------------ shots */

  private drawShots(shots: ShotView[], t: number) {
    const ctx = this.wctx
    for (const s of shots) {
      if (!this.visible(s.x, s.y, 32)) continue
      let a: Anim | undefined
      if (s.kind === 'arrow' || s.kind === 'enemy_arrow')
        a = findAnim('fx', `${s.kind}_${turnOf(Math.atan2(s.vy, s.vx))}`)
      else if (s.kind === 'pot' || s.kind === 'barrel') {
        // Thrown props tumble along their arc.
        const sheet = `props:${this.view?.stage ?? 'meadow'}`
        a = findAnim(sheet, s.prop ?? s.kind) ?? findAnim(sheet, 'pot')
      } else a = findAnim('fx', s.kind)
      if (!a) continue
      if (s.kind === 'gust' && Math.random() < 0.35)
        this.particles.spawn('dust', s.x, s.y, 2, -s.vx * 0.1, -s.vy * 0.1, 6, 0.45)
      blitAnim(ctx, a, t + s.id * 0.07, s.x - this.ox, s.y - s.z - this.oy, false, 1, true)
    }
  }

  /** The stampede's path: a dusty band from the line toward the end point. */
  private drawPath(x: TechView, t: number) {
    const ctx = this.wctx
    const w = [0, 0, 48, 56, 64][x.tier] ?? 56
    const len = Math.hypot(x.tx - x.x, x.ty - x.y)
    if (len < 4) return
    ctx.save()
    ctx.translate(x.x - this.ox, x.y - this.oy)
    ctx.rotate(Math.atan2(x.ty - x.y, x.tx - x.x))
    ctx.fillStyle = 'rgba(255, 226, 150, 0.12)'
    ctx.fillRect(0, -w / 2, len, w)
    ctx.setLineDash([10, 6])
    ctx.lineDashOffset = -t * 60
    ctx.strokeStyle = 'rgba(255, 236, 170, 0.75)'
    ctx.lineWidth = 2
    ctx.strokeRect(0, -w / 2, len, w)
    ctx.setLineDash([])
    // Chevrons racing toward the end.
    ctx.fillStyle = 'rgba(255, 244, 200, 0.8)'
    for (let d = ((t * 160) % 40) + 10; d < len - 6; d += 40) {
      ctx.beginPath()
      ctx.moveTo(d, -8)
      ctx.lineTo(d + 8, 0)
      ctx.lineTo(d, 8)
      ctx.lineTo(d + 3, 0)
      ctx.closePath()
      ctx.fill()
    }
    ctx.restore()
  }

  private drawFlashes(t: number) {
    const ctx = this.wctx
    let keep = 0
    for (const f of this.flashes) {
      const age = t - f.t0
      if (age > 0.45 || age < -1) continue
      this.flashes[keep++] = f
      const k = age / 0.45
      ctx.globalAlpha = (1 - k) * 0.8
      ctx.strokeStyle = f.color
      ctx.lineWidth = 3 * (1 - k) + 1
      ctx.beginPath()
      ctx.ellipse(f.x - this.ox, f.y - this.oy - 8, 14 + k * 46, (14 + k * 46) * 0.55, 0, 0, Math.PI * 2)
      ctx.stroke()
    }
    ctx.globalAlpha = 1
    this.flashes.length = keep
  }

  /* ------------------------------------------------------------------------------------------- overheads */

  private drawOverheads(view: View, info: StageInfo, t: number, input: RenderInput) {
    const ctx = this.wctx
    const me = view.players.find((p) => p.id === input.myId)
    const multi = view.players.filter((p) => !p.spectator).length > 1
    // Enemies: hp bars, alert and stun marks.
    for (const e of view.enemies) {
      if (e.state === 'death' || !this.visible(e.x, e.y, 32)) continue
      const x = Math.round(e.x - this.ox)
      const y = Math.round(e.y - this.oy - (e.z ?? 0))
      if (e.hp < e.maxHp) {
        ctx.fillStyle = '#2a1d2e'
        ctx.fillRect(x - 13, y - 61, 26, 5)
        ctx.fillStyle = '#5b2733'
        ctx.fillRect(x - 12, y - 60, 24, 3)
        ctx.fillStyle = e.state === 'guard' ? '#d9e2f2' : '#ff5d4f'
        ctx.fillRect(x - 12, y - 60, Math.max(1, Math.round((24 * e.hp) / e.maxHp)), 3)
      }
      if (e.alertAt !== undefined && t - e.alertAt < 0.7 && t >= e.alertAt) {
        const al = findAnim('fx', 'alert')
        if (al) blitAnim(ctx, al, t - e.alertAt, x, y - 60)
      }
      if ((e.stun ?? 0) > t) {
        const st = findAnim('fx', 'stun')
        if (st) blitAnim(ctx, st, t, x, y - 54)
      }
    }
    // Heroes: charge gauges, companion badges, name tags, revive rings.
    for (const h of view.heroes) {
      if (h.state === 'tech') continue
      const x = Math.round(h.x - this.ox)
      const y = Math.round(h.y - this.oy - h.z)
      const prev = this.chargeWas.get(h.slot) ?? 0
      if (h.charge >= 1 && prev < 1) this.flashes.push({ x: h.x, y: h.y - h.z - 20, t0: t, color: '#ffffff' })
      this.chargeWas.set(h.slot, h.charge)
      if (h.charge > 0 && this.visible(h.x, h.y, 32)) {
        this.drawGauge(x, y - 60, h.charge, JOB_COLORS[h.job], t)
        if (h.charge >= 1 && Math.random() < 0.5)
          this.particles.spawn(
            'chargeSpark',
            h.x + (Math.random() - 0.5) * 30,
            h.y + 2,
            4,
            0,
            0,
            40 + Math.random() * 30,
            0.7
          )
      }
      if (view.species === 'crow' && h.ctrl && h.owner === input.myId) this.drawStamina(h, view, x, y, t)
      if (h.state === 'down' && (h.revive ?? 0) > 0) this.drawGauge(x, y - 46, h.revive ?? 0, '#9ff0a0', t)
      const owner = view.players.find((p) => p.id === h.owner)
      if (h.ctrl && owner && (multi || owner.id !== input.myId)) {
        const mine = owner.id === input.myId
        this.label(
          h.x,
          h.y - h.z - 66,
          mine ? `${owner.name || 'あなた'}` : owner.name || 'なかま',
          JOB_COLORS[h.job],
          13,
          1,
          'rgba(26,18,40,0.78)'
        )
      } else if (h.ctrl && owner?.id === input.myId) {
        // Solo: a bobbing marker over the hero you control.
        const bob = Math.round(Math.sin(t * 5) * 1.5)
        ctx.fillStyle = '#2a1d2e'
        ctx.fillRect(x - 5, y - 70 + bob, 11, 2)
        ctx.fillRect(x - 4, y - 68 + bob, 9, 2)
        ctx.fillRect(x - 2, y - 66 + bob, 5, 2)
        ctx.fillStyle = JOB_COLORS[h.job]
        ctx.fillRect(x - 4, y - 70 + bob, 9, 1)
        ctx.fillRect(x - 3, y - 69 + bob, 7, 2)
        ctx.fillRect(x - 1, y - 67 + bob, 3, 1)
      } else if (!h.ctrl && h.owner === input.myId && h.state !== 'down') {
        this.drawModeIcon(x + 15, y - 46, h.mode === 'stay', JOB_COLORS[h.job])
      }
    }
    // Heavy objects: strain meter.
    for (const p of view.props) {
      if (!p.weight || !p.strength || p.weight < 2 || p.state === 'lifted') continue
      const at = this.propPos(p)
      if (!this.visible(at.x, at.y, 64)) continue
      const top = this.propTop(p, view.stage)
      this.drawPips(at.x, at.y - (p.z ?? 0) - top, p.strength, p.weight)
      if (p.strength < p.weight) {
        const wob = Math.sin(t * 16) * 1.5
        this.label(
          at.x + wob,
          at.y - (p.z ?? 0) - top - 22,
          `おもい！ ${p.strength}/${p.weight}`,
          '#ffe0a0',
          13,
          1,
          'rgba(90,30,20,0.8)'
        )
      }
    }
    // Interaction bubble.
    const hero = me && me.ctrl >= 0 ? view.heroes.find((h) => h.slot === me.ctrl) : undefined
    if (hero && view.phase === 'play') {
      const target = interactTarget(view, info, hero)
      const bub = target && findAnim('ui', 'bubble')
      if (target && bub)
        blitAnim(ctx, bub, t, target.x - this.ox, target.y - this.oy - 10 + Math.round(Math.sin(t * 4) * 2))
    }
    // Off-screen allies.
    const arrowMargin = 14
    for (const h of view.heroes) {
      if (h.state === 'tech') continue
      const x = h.x - this.ox
      const y = h.y - this.oy - 20
      if (x > 0 && y > 0 && x < this.artW && y < this.artH) continue
      const cx = this.artW / 2
      const cy = this.artH / 2
      const ang = Math.atan2(y - cy, x - cx)
      const c = Math.cos(ang)
      const s = Math.sin(ang)
      const k = Math.min(Math.abs((cx - arrowMargin) / (c || 1e-6)), Math.abs((cy - arrowMargin) / (s || 1e-6)))
      const ux = Math.round(cx + c * k)
      const uy = Math.round(cy + s * k)
      const turn = turnOf(ang)
      const arrow = findAnim('ui', `offscreen_${turn}`)
      if (arrow) {
        const img = tinted(arrow.frames[0], JOB_COLORS[h.job], `off${turn}${h.job}`)
        const [ax, ay] = anchorOf(arrow)
        ctx.drawImage(img, ux - ax, uy - ay)
      }
    }
    // Pop texts (Japanese) rise as crisp labels.
    let keep = 0
    for (const p of this.pops) {
      const age = t - p.t0
      if (age > 1.2 || age < -1) continue
      this.pops[keep++] = p
      this.label(
        p.x,
        p.y - Math.min(18, age * 50),
        p.text,
        p.color,
        15,
        age > 0.9 ? (1.2 - age) / 0.3 : 1,
        'rgba(26,18,40,0.75)'
      )
    }
    this.pops.length = keep
  }

  /** A tiny badge over a companion: pause bars (stay) or chevrons (follow). */
  private drawModeIcon(x: number, y: number, stay: boolean, color: string) {
    const ctx = this.wctx
    const rows = stay ? MODE_STAY : MODE_FOLLOW
    ctx.fillStyle = 'rgba(26,18,40,0.85)'
    ctx.fillRect(x - 4, y - 4, 9, 9)
    ctx.fillRect(x - 3, y - 5, 7, 11)
    ctx.fillRect(x - 5, y - 3, 11, 7)
    ctx.fillStyle = stay ? '#ffb35c' : color
    for (let r = 0; r < 5; r++)
      for (let c = 0; c < 5; c++) if (rows[r][c] === '#') ctx.fillRect(x - 2 + c, y - 2 + r, 1, 1)
  }

  /** Flight stamina of the controlled crow (estimated: 1.5 s in the air, refilled on the ground and by vents). */
  private drawStamina(h: HeroView, view: View, x: number, y: number, t: number) {
    const last = this.stamina.get(h.slot) ?? 1.5
    const dt = Math.min(0.05, Math.max(0, t - (this.staminaT ?? t)))
    const flying = h.z > 1 && h.state !== 'tech'
    const overVent = view.props.some((p) => p.kind === 'vent' && Math.hypot(p.x - h.x, p.y - h.y) < 52)
    const exact = (h as HeroView & { stamina?: number }).stamina
    const s =
      exact !== undefined
        ? exact * 1.5
        : Math.max(0, Math.min(1.5, flying && !overVent ? last - dt : last + (overVent ? 3 : 1) * dt))
    this.stamina.set(h.slot, s)
    this.staminaT = t
    if (s >= 1.5 && !flying) return
    const v = s / 1.5
    this.drawGauge(x - 14, y - 52, v, v < 0.3 ? '#ff8a70' : '#9fd8f2', t)
    // A tiny feather beside the gauge.
    const ctx = this.wctx
    ctx.fillStyle = '#2a1d2e'
    ctx.fillRect(x - 25, y - 56, 2, 7)
    ctx.fillStyle = '#e8f6ff'
    ctx.fillRect(x - 24, y - 57, 2, 6)
  }

  private staminaT?: number

  /** Height of a prop's sprite above its anchor (where the strain meter sits). */
  private propTop(p: PropView, stage: string): number {
    const sheet = `props:${stage}`
    const name = propName(sheet, p.kind, p.state)
    const a = name ? findAnim(sheet, name) : undefined
    return a ? anchorOf(a)[1] + 2 : 66
  }

  private drawGauge(x: number, y: number, v: number, color: string, t: number) {
    const ctx = this.wctx
    const full = v >= 1
    ctx.lineWidth = 3
    ctx.strokeStyle = 'rgba(26,18,40,0.8)'
    ctx.beginPath()
    ctx.arc(x, y, 6, 0, Math.PI * 2)
    ctx.stroke()
    ctx.strokeStyle = full ? (Math.floor(t * 12) % 2 ? '#ffffff' : color) : color
    ctx.lineWidth = 2
    ctx.beginPath()
    ctx.arc(x, y, 6, -Math.PI / 2, -Math.PI / 2 + Math.PI * 2 * Math.min(1, v))
    ctx.stroke()
    if (full) {
      ctx.fillStyle = '#fffbe0'
      ctx.fillRect(x - 1, y - 1, 2, 2)
    }
  }

  private drawPips(x: number, y: number, n: number, of: number) {
    const full = findAnim('ui', 'pip_full')
    const empty = findAnim('ui', 'pip_empty')
    if (!full || !empty) return
    const w = 13
    const x0 = Math.round(x - (of * w) / 2 + w / 2)
    for (let i = 0; i < of; i++) blitAnim(this.wctx, i < n ? full : empty, 0, x0 + i * w - this.ox, y - this.oy)
  }

  private label(x: number, y: number, text: string, color: string, size: number, alpha: number, bg: string) {
    let l = this.labels[this.labelCount]
    if (!l) this.labels[this.labelCount] = l = { x, y, text, color, size, alpha, bg }
    else Object.assign(l, { x, y, text, color, size, alpha, bg })
    this.labelCount++
  }

  /* ---------------------------------------------------------------------------------------------- ambient */

  private drawLighting(view: View, info: StageInfo, t: number) {
    const L = this.lighting
    const night = info.light === 'night'
    L.begin()
    const heroR = night ? 130 : 190
    for (const h of view.heroes)
      L.add(h.x, h.y - 20 - h.z, heroR * flicker(t, h.slot * 3.1, 0.6), 'hero', night ? 0.38 : 0.5)
    // Enemies keep a faint pool so they read in the dark.
    for (const e of view.enemies)
      if (e.state !== 'death' && this.visible(e.x, e.y, 80)) L.add(e.x, e.y - 24, 64, 'faint', 0.7)
    // The boss is always readable; telegraphs glow red through the dark.
    if (view.boss)
      L.add(
        view.boss.x,
        view.boss.y - 50 - view.boss.z,
        night ? 200 : 120,
        night ? 'hero' : 'faint',
        night ? 0.45 : 0.8
      )
    const teles = (tl: Telegraph | undefined) => {
      if (tl && tl.until > view.t) L.add(tl.x, tl.y, Math.min(300, tl.r * 1.4 + 40), 'fire', 0.55)
    }
    for (const e of view.enemies) {
      teles(e.tele)
      if (e.state === 'heal') L.add(e.x, e.y - 30, 120, 'cool', 0.9)
    }
    for (const tl of view.boss?.tele ?? []) teles(tl)
    if (view.bossPet) L.add(view.bossPet.x, view.bossPet.y - 40, 120, 'faint', 0.7)
    for (const d of info.decor) {
      if (!WARM_DECOR.has(d.kind) || !this.visible(d.x, d.y, 200)) continue
      const seed = d.x * 0.013 + d.y * 0.007
      L.add(d.x, d.y - 40, 240 * flicker(t, seed), 'warm', 1)
    }
    for (const p of view.props) {
      if (!this.visible(p.x, p.y, 160)) continue
      const key = `${p.kind}_${p.state}`
      if (COOL_PROPS.has(key))
        L.add(p.x, p.y - 40, (p.kind === 'bigmoon' ? 320 : 170) * flicker(t, p.id, 0.4), 'cool', 1)
      else if (p.kind === 'torch') L.add(p.x, p.y - 40, 160 * flicker(t, p.id), 'warm', 0.9)
    }
    for (const p of view.pickups) {
      if (!this.visible(p.x, p.y, 120)) continue
      if (p.kind === 'orb') L.add(p.x, p.y - 30, 150, 'cool', 1)
      else if (p.kind === 'gem' || p.kind === 'gem_big') L.add(p.x, p.y - 10, 40, 'cool', 0.6)
    }
    for (const s of view.shots) {
      if (!this.visible(s.x, s.y, 80)) continue
      const c: LightColor | undefined =
        s.kind === 'fireball' || s.kind === 'bomb'
          ? 'fire'
          : s.kind === 'hex'
            ? 'violet'
            : s.kind === 'orb' || s.kind === 'bolt'
              ? 'cool'
              : undefined
      if (c) L.add(s.x, s.y - s.z, s.kind === 'bomb' ? 44 : 80, c, 0.9)
    }
    L.apply(this.wctx, this.ox, this.oy, this.artW, this.artH, night ? 'night' : 'dim', t)
  }

  /* ---------------------------------------------------------------------------------------------- output */

  private composite() {
    const { artW, artH } = this
    const k = Math.max(1, Math.ceil(this.camera.scale - 1e-6))
    this.ensure(this.up, artW * k, artH * k)
    const u = this.uctx
    u.imageSmoothingEnabled = false
    u.drawImage(this.world, 0, 0, artW, artH, 0, 0, artW * k, artH * k)
    const ctx = this.ctx
    ctx.setTransform(1, 0, 0, 1, 0, 0)
    ctx.imageSmoothingEnabled = true
    ctx.imageSmoothingQuality = 'high'
    ctx.drawImage(this.up, 0, 0, artW * k, artH * k, 0, 0, artW * this.camera.scale, artH * this.camera.scale)
    this.drawVignette(this.info?.light ?? 'day')
    const now = performance.now()
    let keep = 0
    for (const w of this.washes) {
      const p = (now - w.t0) / w.dur
      if (p >= 1) continue
      this.washes[keep++] = w
      if (p < 0) continue
      ctx.globalAlpha = w.a * (p < 0.15 ? p / 0.15 : 1 - (p - 0.15) / 0.85)
      ctx.fillStyle = w.color
      ctx.fillRect(0, 0, this.canvas.width, this.canvas.height)
    }
    this.washes.length = keep
    if (this.fade > 0) {
      ctx.globalAlpha = Math.min(1, this.fade)
      ctx.fillStyle = '#0d0a16'
      ctx.fillRect(0, 0, this.canvas.width, this.canvas.height)
    }
    ctx.globalAlpha = 1
  }

  private drawVignette(light: 'day' | 'dim' | 'night') {
    if (light === 'dim') return
    const w = this.canvas.width
    const h = this.canvas.height
    if (!this.vignette || this.vignette.w !== w || this.vignette.h !== h || this.vignette.light !== light) {
      const c = document.createElement('canvas')
      c.width = w
      c.height = h
      const g = c.getContext('2d')!
      const r = Math.hypot(w, h) / 2
      const grad = g.createRadialGradient(w / 2, h / 2, r * 0.45, w / 2, h / 2, r)
      if (light === 'night') {
        // Deep blue edges and a faint moon glow from the upper right.
        grad.addColorStop(0, 'rgba(10, 16, 48, 0)')
        grad.addColorStop(0.7, 'rgba(8, 12, 40, 0.22)')
        grad.addColorStop(1, 'rgba(4, 6, 24, 0.55)')
        g.fillStyle = grad
        g.fillRect(0, 0, w, h)
        const moon = g.createRadialGradient(w * 0.86, -h * 0.1, 0, w * 0.86, -h * 0.1, h * 0.9)
        moon.addColorStop(0, 'rgba(200, 220, 255, 0.22)')
        moon.addColorStop(1, 'rgba(200, 220, 255, 0)')
        g.globalCompositeOperation = 'screen'
        g.fillStyle = moon
        g.fillRect(0, 0, w, h)
      } else {
        grad.addColorStop(0, 'rgba(255, 214, 150, 0)')
        grad.addColorStop(0.7, 'rgba(120, 60, 30, 0.12)')
        grad.addColorStop(1, 'rgba(60, 24, 20, 0.34)')
        g.fillStyle = grad
        g.fillRect(0, 0, w, h)
      }
      this.vignette = { w, h, c, light }
    }
    this.ctx.drawImage(this.vignette.c, 0, 0)
  }

  private screenOverlay(input: RenderInput) {
    const ctx = this.ctx
    const s = this.camera.scale
    const fontScale = this.dpr * Math.max(0.85, Math.min(1.6, this.cssH / 760))
    ctx.textAlign = 'center'
    ctx.textBaseline = 'middle'
    for (let i = 0; i < this.labelCount; i++) {
      const l = this.labels[i]
      const x = (l.x - this.ox) * s
      const y = (l.y - this.oy) * s
      const size = Math.round(l.size * fontScale)
      ctx.font = `800 ${size}px "Hiragino Maru Gothic ProN", "BIZ UDPGothic", "Yu Gothic UI", Meiryo, sans-serif`
      ctx.globalAlpha = Math.max(0, Math.min(1, l.alpha))
      if (l.bg) {
        const w = ctx.measureText(l.text).width + size * 0.9
        const h = size * 1.45
        ctx.fillStyle = l.bg
        roundRect(ctx, x - w / 2, y - h / 2, w, h, h / 2)
        ctx.fill()
      }
      ctx.lineWidth = Math.max(2, size * 0.18)
      ctx.strokeStyle = 'rgba(20, 12, 30, 0.9)'
      ctx.lineJoin = 'round'
      ctx.strokeText(l.text, x, y + size * 0.04)
      ctx.fillStyle = l.color
      ctx.fillText(l.text, x, y + size * 0.04)
    }
    ctx.globalAlpha = 1
    if (input.showCursor && input.cursor.inside) {
      const cur = findAnim('ui', 'cursor')
      if (cur) {
        const f = frameAt(cur, performance.now() / 1000)
        const c = canvasOf(cur.frames[f])
        const k = Math.max(2, Math.round(this.dpr * 2))
        ctx.imageSmoothingEnabled = false
        ctx.drawImage(
          c,
          Math.round(input.cursor.x * this.dpr - (c.width * k) / 2),
          Math.round(input.cursor.y * this.dpr - (c.height * k) / 2),
          c.width * k,
          c.height * k
        )
        ctx.imageSmoothingEnabled = true
      }
    }
  }

  /** World art px → CSS px on the canvas (for DOM elements anchored to the world). */
  toCss(x: number, y: number) {
    const k = this.camera.scale / this.dpr
    return { x: (x - this.ox) * k, y: (y - this.oy) * k }
  }
}

function roundRect(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number) {
  ctx.beginPath()
  ctx.moveTo(x + r, y)
  ctx.arcTo(x + w, y, x + w, y + h, r)
  ctx.arcTo(x + w, y + h, x, y + h, r)
  ctx.arcTo(x, y + h, x, y, r)
  ctx.arcTo(x, y, x + w, y, r)
  ctx.closePath()
}
