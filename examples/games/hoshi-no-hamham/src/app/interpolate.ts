/**
 * Drawing between two simulation steps. Before each step the positions of everything that moves are remembered;
 * after the steps of a frame they can be set to `previous + (current − previous) × alpha` for the length of the
 * frame (the view's update, the camera, the HUD, the draw) and put back to the true values afterwards, so that
 * between frames the world always holds the simulation's own state.
 */

/** Anything with a position. */
export interface Mover {
  x: number
  y: number
}

/** The part of `World` that moves. */
export interface MoverSource {
  player: Mover
  enemies: readonly Mover[]
  boss: Mover | null
  shots: readonly Mover[]
  bees: readonly Mover[]
  props: readonly Mover[]
}

/** Something that moved this far in one step was teleported (a respawn, a swap), not carried: it is not smeared. */
export const JUMP_PX = 96

export class Interpolator {
  private objects: Mover[] = []
  private prevX: number[] = []
  private prevY: number[] = []
  private curX: number[] = []
  private curY: number[] = []
  private moved: boolean[] = []
  private shownX: number[] = []
  private shownY: number[] = []
  private count = 0
  private shown = false

  /** Remembers where everything is, just before a step. Things created later are not interpolated. */
  remember(world: MoverSource) {
    this.count = 0
    this.add(world.player)
    for (const e of world.enemies) this.add(e)
    if (world.boss) this.add(world.boss)
    for (const s of world.shots) this.add(s)
    for (const b of world.bees) this.add(b)
    for (const p of world.props) this.add(p)
  }

  /** Records where everything ended up after the steps of a frame. */
  settle() {
    for (let i = 0; i < this.count; i++) {
      this.curX[i] = this.objects[i].x
      this.curY[i] = this.objects[i].y
    }
  }

  /** Moves everything that moved in the last step to `alpha` of the way from its old place to its new one. */
  apply(alpha: number) {
    this.restore()
    this.shown = true
    for (let i = 0; i < this.count; i++) {
      const o = this.objects[i]
      this.moved[i] = false
      // Something that was moved by hand since the step (a test, a tool) keeps the value it was given.
      if (o.x !== this.curX[i] || o.y !== this.curY[i]) continue
      const dx = this.curX[i] - this.prevX[i]
      const dy = this.curY[i] - this.prevY[i]
      if ((dx === 0 && dy === 0) || Math.abs(dx) > JUMP_PX || Math.abs(dy) > JUMP_PX) continue
      o.x = this.shownX[i] = this.prevX[i] + dx * alpha
      o.y = this.shownY[i] = this.prevY[i] + dy * alpha
      this.moved[i] = true
    }
  }

  /** Puts the true values back (safe to call at any time and more than once). */
  restore() {
    if (!this.shown) return
    this.shown = false
    for (let i = 0; i < this.count; i++) {
      if (!this.moved[i]) continue
      this.moved[i] = false
      // A position the frame's own code changed (the director walking the hero) is kept as it was set.
      const o = this.objects[i]
      if (o.x === this.shownX[i]) o.x = this.curX[i]
      if (o.y === this.shownY[i]) o.y = this.curY[i]
    }
  }

  private add(o: Mover) {
    const i = this.count++
    this.objects[i] = o
    this.prevX[i] = o.x
    this.prevY[i] = o.y
    this.curX[i] = o.x
    this.curY[i] = o.y
    this.moved[i] = false
  }
}
