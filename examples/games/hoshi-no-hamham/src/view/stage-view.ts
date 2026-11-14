/**
 * StageView: everything the player sees of one stage. It owns the camera, terrain, backdrop, water, props,
 * actors, particles and overlay, answers every simulation event (`handle`), advances them (`update`) and draws
 * them in order (`draw`). Hit-stop is a `freeze` time: while it runs the app does not step the simulation.
 */
import { sharedArtSource, type ArtSource } from '../art/remote'
import type { SimEvent } from '../game/events'
import type { World } from '../game/sim'
import { TILE } from '../game/types'
import { ActorsView } from './actors'
import { BackdropView } from './backdrop'
import { Camera } from './camera'
import { FxPool } from './fx'
import { playFx, type FxApi } from './fx-map'
import { Overlay } from './overlay'
import { PropsView } from './props'
import type { Renderer } from './renderer'
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
  /** Seconds of hit-stop left. */
  freezeTime = 0
  /** Real seconds since the view was built. */
  time = 0
  /** Events answered so far (for tests). */
  handled = 0
  /** The view position of the last drawn frame. */
  lastView = { x: 0, y: 0 }
  private api: FxApi

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
      rand: fx.rand
    }
  }

  get frozen() {
    return this.freezeTime > 0
  }

  /** Hit-stop for at least `seconds`. */
  freeze(seconds: number) {
    this.freezeTime = Math.max(this.freezeTime, seconds)
  }

  /** Answers one simulation event: state for terrain, props and actors, then the visual flourish. */
  handle(event: SimEvent) {
    this.handled += 1
    if (event.type === 'dig') this.terrain.invalidate(event.tx, event.ty)
    this.props.handle(event)
    this.actors.handle(event)
    playFx(event, this.api)
  }

  /**
   * Advances the view. `dt` is real time (particles, overlay, camera shake); `animDt` is the time the actors and
   * props animate by (0 during hit-stop, scaled in slow motion).
   */
  update(dt: number, animDt = this.frozen ? 0 : dt) {
    this.time += dt
    this.freezeTime = Math.max(0, this.freezeTime - dt)
    const p = this.world.player
    if (!p.dead) this.camera.update(dt, p)
    else this.camera.update(dt, { ...p, vx: 0 })
    this.backdrop.update(dt)
    this.water.update(dt)
    this.props.update(animDt)
    this.actors.update(animDt)
    this.actors.tickReal(dt)
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
    r.clear()
    r.screen()
    this.backdrop.drawBack(ctx, v.x, v.y)
    r.world(v.x, v.y)
    this.terrain.drawTiles(ctx, v.x, v.y)
    this.terrain.drawDecor(ctx, v.x, v.y)
    this.props.drawProps(ctx)
    this.props.drawPickups(ctx)
    this.actors.drawEnemies(ctx)
    this.actors.drawBoss(ctx)
    this.props.drawPrincess(ctx)
    this.actors.drawHero(ctx)
    this.props.drawProjectiles(ctx)
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
