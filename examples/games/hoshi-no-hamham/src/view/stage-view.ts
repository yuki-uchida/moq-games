/**
 * StageView: everything the player sees of one stage. It owns the camera, terrain, backdrop, water, props,
 * actors, particles and overlay, answers every simulation event (`handle`), advances them (`update`) and draws
 * them in order (`draw`). Hit-stop is a `freeze` time: while it runs the app does not step the simulation.
 */
import { sharedArtSource, type ArtSource } from '../art/remote'
import type { SimEvent } from '../game/events'
import type { World } from '../game/sim'
import { TILE } from '../game/types'
import { ActorsView, SHOT_BIRTH_DX } from './actors'
import { BackdropView } from './backdrop'
import { Camera } from './camera'
import { FxPool } from './fx'
import { playFx, type FxApi } from './fx-map'
import { Overlay } from './overlay'
import { PropsView } from './props'
import type { Renderer } from './renderer'
import { Sight } from './sight'
import { TerrainView } from './terrain'
import { WaterView } from './water'

export interface StageViewOptions {
  reducedMotion?: boolean
  /** The run cycle's foot contact (for the footstep sound). */
  onFootstep?: () => void
  /** Where a dig's new terrain pictures come from (default: the app's art source, if the boot made one). */
  art?: ArtSource
}

/** Cells that hold a prop when the stage starts (no decoration grows into them). */
export function propCells(world: World): Set<number> {
  const cells = new Set<number>()
  const add = (tx: number, ty: number) => {
    if (tx >= 0 && ty >= 0 && tx < world.w && ty < world.h) cells.add(ty * world.w + tx)
  }
  for (const prop of world.props) {
    const tx = Math.floor(prop.x / TILE)
    const ty = Math.floor(prop.y / TILE)
    for (let i = 0; i < Math.max(1, Math.ceil(prop.w)); i++)
      for (let j = 0; j < Math.max(1, Math.ceil(prop.h)); j++) add(tx + i, ty + j)
    // Tall props reach into the cell above.
    if (prop.kind === 'tree' || prop.kind === 'pine' || prop.kind === 'goal' || prop.kind === 'princess')
      add(tx, ty - 1)
  }
  return cells
}

export class StageView {
  readonly camera: Camera
  readonly fx: FxPool
  readonly overlay: Overlay
  readonly terrain: TerrainView
  readonly backdrop: BackdropView
  readonly water: WaterView
  readonly props: PropsView
  readonly actors: ActorsView
  readonly reducedMotion: boolean
  /** The stretch of the stage a frame draws: props and enemies outside it are left out (`sight.ts`). */
  readonly sight = new Sight()
  /** Seconds of hit-stop left. */
  freezeTime = 0
  /**
   * False: no hit-stop is staged. The check on the device in hand (`?perf=nohold`) plays a stage without them, to
   * tell by feel a hold that is staged from a picture that came late.
   */
  holds = true
  /** Real seconds since the view was built. */
  time = 0
  /** Events answered so far (for tests). */
  handled = 0
  /** The view position of the last drawn frame. */
  lastView = { x: 0, y: 0 }
  private api: FxApi
  private birth = { x: 0, y: 0 }
  /** The boss's picture as the last frame drew it: its place (jolt included), his body's, and whether it was held. */
  private picture = { x: 0, body: 0, held: false }

  constructor(
    readonly world: World,
    private renderer: Renderer,
    options: StageViewOptions = {}
  ) {
    this.reducedMotion = Boolean(options.reducedMotion)
    this.camera = new Camera({ mapW: world.w, mapH: world.h, reducedMotion: this.reducedMotion })
    this.camera.snap(world.player)
    this.fx = new FxPool(world.stage.no * 7919 + 211)
    this.overlay = new Overlay(this.reducedMotion)
    this.terrain = new TerrainView(world, propCells(world), options.art ?? sharedArtSource())
    this.backdrop = new BackdropView(world.theme, this.camera.y, this.reducedMotion)
    this.water = new WaterView(world)
    this.props = new PropsView(world, this.fx)
    this.actors = new ActorsView(world, this.fx, options.onFootstep, this.reducedMotion)
    const fx = this.fx
    this.api = {
      spawn: (name, x, y, o) => fx.spawn(name, x, y, o),
      burst: (name, x, y, count, o) => fx.burst(name, x, y, count, o),
      trauma: (amount) => this.camera.addTrauma(amount),
      kick: (dx, dy) => this.camera.kick(dx, dy),
      freeze: (seconds) => this.freeze(seconds),
      popup: (text, x, y, color) => this.overlay.popup(text, x, y, color),
      flash: (color, alpha, seconds) => this.overlay.flash(color, alpha, seconds),
      hurtPulse: () => this.overlay.hurt(),
      rand: fx.rand,
      // Where the shot leaves from: where its light was on his drawn body. (The king's volley bursts out of his
      // chest: its smoke stays on his centre.)
      shotEdge: (x) => {
        const boss = this.world.boss
        if (!boss || boss.def.kind === 'final') return x
        return this.actors.shotBirth(boss, this.birth).x
      },
      shotY: (y) => {
        const boss = this.world.boss
        if (!boss || boss.def.kind === 'final') return y
        return this.actors.shotBirth(boss, this.birth).y
      },
      summonsLater: true,
      underWater: (x, y) => this.world.waterAt(Math.floor(x / TILE), Math.floor(y / TILE))
    }
    this.props.drawnFrame = (body, out) => this.actors.drawnFrame(body, out)
    this.props.sight = this.sight
    this.actors.sight = this.sight
  }

  get frozen() {
    return this.freezeTime > 0
  }

  /** Hit-stop for at least `seconds`. */
  freeze(seconds: number) {
    if (!this.holds) return
    // (The facing holds count the hit-stop: it is time on the screen. Decided with the step that starts it, the
    // same at every display rate; a hit-stop during another adds only what it lengthens it by.)
    this.actors.heldFor(Math.max(0, seconds - this.freezeTime))
    this.freezeTime = Math.max(this.freezeTime, seconds)
  }

  /** Answers one simulation event: state for terrain, props and actors, then the visual flourish. */
  handle(event: SimEvent) {
    // (What the event spawns is born on its step: first drawn as born, see `FxPool.stepBorn`.)
    this.fx.stepBorn = true
    try {
      this.answer(event)
    } finally {
      this.fx.stepBorn = false
    }
  }

  private answer(event: SimEvent) {
    this.handled += 1
    if (event.type === 'dig') this.terrain.invalidate(event.tx, event.ty)
    // His shots leave from where his light was drawn on his body (his picture may be held off it, or jolted).
    const boss = this.world.boss
    if (event.type === 'boss-shoot' && boss && !boss.dead && boss.def.kind !== 'final') {
      // From where he fired (the event's place, his body before that step's move), off it by what his picture was
      // off his body there and then: a held picture by its own place (the light sat there); a picture that follows its
      // body by its offset and the jolt, nothing of the body's travel since.
      const off = this.picture.held ? this.picture.x - event.x : this.picture.x - this.picture.body
      this.props.shotFromLight(off, 0)
    }
    this.props.handle(event)
    this.actors.handle(event)
    playFx(event, this.api)
  }

  /** A display frame begins (before its steps and its events). */
  beginFrame() {
    this.actors.beginFrame()
  }

  /** Updates actors and props from the simulation positions after each step's events have been handled. */
  simStep() {
    this.fx.stepBorn = true
    try {
      this.actors.simStep()
      this.props.simStep()
    } finally {
      this.fx.stepBorn = false
    }
  }

  /**
   * Advances the view. `dt` is real time (particles, overlay, camera shake); `animDt` is the time the actors and
   * props animate by (0 during hit-stop, scaled in slow motion).
   */
  update(dt: number, animDt = this.frozen ? 0 : dt) {
    // (A frame a moment holds the simulation on, outside a hit-stop: its time on the screen counts for the facing
    // holds, as a hit-stop's does.)
    if (dt > 0 && animDt <= 0 && this.freezeTime <= 0) this.actors.heldFor(dt, true)
    this.time += dt
    this.freezeTime = Math.max(0, this.freezeTime - dt)
    const p = this.world.player
    if (!p.dead) this.camera.update(dt, p)
    else this.camera.update(dt, { ...p, vx: 0 })
    this.backdrop.update(dt)
    this.water.update(dt)
    this.props.update(animDt)
    this.props.tickReal(dt)
    this.actors.update(animDt)
    this.actors.tickReal(dt)
    // (Where this frame draws the boss's picture (with the jolt) against his body, for the shots of the next steps.)
    const boss = this.world.boss
    if (boss && !boss.dead && boss.def.kind !== 'final') {
      this.picture.x = this.actors.shotBirth(boss, this.birth).x - SHOT_BIRTH_DX
      this.picture.body = boss.x + boss.w / 2
      this.picture.held = this.actors.bossPictureHeld(boss)
    }
    this.fx.update(dt)
    this.overlay.lowHealth = !p.dead && p.hp <= 2
    this.overlay.update(dt)
  }

  /** The drawn view position (snapped to 1/k). */
  viewPosition(out?: { x: number; y: number }) {
    return this.camera.view(this.renderer.k, out)
  }

  draw() {
    const r = this.renderer
    const ctx = r.ctx
    const v = this.viewPosition(this.lastView)
    const k = r.k
    this.sight.look(v.x)
    r.clear()
    r.screen()
    this.backdrop.drawBack(ctx, v.x, v.y)
    r.world(v.x, v.y)
    this.terrain.drawTiles(ctx, v.x, v.y)
    this.terrain.drawDecor(ctx, v.x, v.y)
    this.props.drawProps(ctx)
    this.props.drawPickups(ctx)
    // Squirrel acorns emerge from behind the actors; a boss's shot starts in front at its light.
    this.props.drawProjectiles(ctx, 'behind')
    this.actors.drawEnemies(ctx)
    this.actors.drawBoss(ctx)
    this.props.drawPrincess(ctx)
    this.actors.drawHero(ctx)
    // (A boss's gathering light is a warning: in front of him and of a hero who stands on him.)
    this.actors.drawShotCue(ctx)
    this.props.drawProjectiles(ctx, 'front')
    this.fx.draw(ctx, 'world')
    this.water.draw(ctx, v.x, v.y)
    this.fx.draw(ctx, 'front')
    r.screen()
    this.backdrop.drawFront(ctx, v.x, v.y)
    this.overlay.drawPopups(ctx, v.x, v.y, k)
    this.overlay.drawScreen(ctx)
  }

  /** World point → canvas backing-store pixel in the last drawn frame (for tests). */
  toCanvas(x: number, y: number) {
    const v = this.lastView
    const k = this.renderer.k
    return { x: Math.round((x - v.x) * k), y: Math.round((y - v.y) * k) }
  }
}
