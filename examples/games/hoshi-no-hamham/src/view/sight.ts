/**
 * The stretch of the stage a frame draws. A stage holds several times more props and enemies than a view shows, and
 * each one drawn out of sight is still a call into the canvas (with a small object the browser has to collect for
 * it), a clip chosen and, for an enemy, the ground looked up for its shadow. What stands wholly outside the stretch
 * is left out of the frame.
 *
 * Only left and right are asked. A body above or below the view can still show in it: its shadow lies on the ground
 * under it, a hive's post reaches down to the ground, and a stage is a strip many views long and hardly two high.
 */
import { VIEW_W } from '../art/contract'

/**
 * How far beyond the view's left and right edges the frame still draws what stands there (px of the stage): more
 * than any picture of a prop or an enemy reaches from its body (a tree's frame half a tile to each side and, felled,
 * nearly two tiles to the side it comes down on; a log is asked about with its whole length), with the camera's
 * shake to spare.
 */
export const SIGHT_MARGIN = 256

export class Sight {
  /** `Infinity`: everything is drawn, as before there was a stretch (tools and tests that compare the pictures). */
  margin = SIGHT_MARGIN
  private x0 = -Infinity
  private x1 = Infinity

  /** The view's left edge is at `viewX` (px of the stage) in the frame about to be drawn. */
  look(viewX: number) {
    this.x0 = viewX - this.margin
    this.x1 = viewX + VIEW_W + this.margin
  }

  /** Whether something that spans `left` to `right` (px of the stage) reaches into the stretch. */
  sees(left: number, right: number): boolean {
    return right >= this.x0 && left <= this.x1
  }
}
