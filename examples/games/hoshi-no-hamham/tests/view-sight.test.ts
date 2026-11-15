import { beforeEach, describe, expect, it, vi } from 'vitest'

/** Every blit the props and the actors views make, in order. */
const blits: { anim: string; x: number }[] = []

vi.mock('../src/view/bake', () => ({
  clip: (sheet: string, name: string) => ({ id: `${sheet}#${name}` }),
  flashClip: () => undefined,
  frameIndex: () => 0,
  brush: () => ({}),
  blit: (_ctx: unknown, anim: { id: string }, _t: number, x: number) => blits.push({ anim: anim.id, x })
}))

import { VIEW_W } from '../src/art/contract'
import { TILE } from '../src/game/types'
import { ActorsView } from '../src/view/actors'
import { PropsView } from '../src/view/props'
import { SIGHT_MARGIN, Sight } from '../src/view/sight'

beforeEach(() => {
  blits.length = 0
})

describe('the stretch of the stage a frame draws', () => {
  it('reaches a margin beyond the view on both sides, and asks only about left and right', () => {
    const sight = new Sight()
    // Before the first look everything is in it.
    expect(sight.sees(-1e9, -1e9)).toBe(true)
    sight.look(2000)
    const left = 2000 - SIGHT_MARGIN
    const right = 2000 + VIEW_W + SIGHT_MARGIN
    expect(sight.sees(left - 50, left - 1)).toBe(false)
    expect(sight.sees(left - 50, left)).toBe(true)
    expect(sight.sees(2100, 2140)).toBe(true)
    expect(sight.sees(right, right + 50)).toBe(true)
    expect(sight.sees(right + 1, right + 50)).toBe(false)
    // Something that spans the whole stretch is in it.
    expect(sight.sees(0, 9000)).toBe(true)
  })

  it('is wider than the widest picture of a prop reaches from its cell', () => {
    // A tree's frame is two tiles wide on the middle of its cell, and a felled one comes down to one side by nearly
    // the frame's height; a fallen log is four tiles long and is asked about with its whole length.
    expect(SIGHT_MARGIN).toBeGreaterThanOrEqual(2 * TILE + 64)
    expect(SIGHT_MARGIN).toBeGreaterThanOrEqual(4 * TILE)
  })

  it('holds everything when its margin is taken off', () => {
    const sight = new Sight()
    sight.margin = Infinity
    sight.look(2000)
    expect(sight.sees(-1e9, -1e9)).toBe(true)
    expect(sight.sees(1e9, 1e9)).toBe(true)
  })
})

/** A context that counts the rectangles filled on it (an enemy's shadow is three). */
function countingContext() {
  const counts = { fillRect: 0 }
  const ctx = {
    globalAlpha: 1,
    fillStyle: '',
    fillRect: () => void (counts.fillRect += 1),
    save() {},
    restore() {},
    beginPath() {},
    rect() {},
    clip() {}
  } as unknown as CanvasRenderingContext2D
  return { ctx, counts }
}

describe('the props a frame draws', () => {
  const VIEW_X = 40 * TILE
  const prop = (id: number, kind: string, tx: number, extra = {}) => ({
    id,
    kind,
    state: 'idle',
    x: tx * TILE,
    y: 4 * TILE,
    w: 1,
    h: 1,
    dir: 1,
    hp: 2,
    timer: 0,
    data: 0,
    ...extra
  })
  /** Props far to the left, just inside the stretch on either side, in the view, and far to the right. */
  function stage() {
    const inLeft = Math.ceil((VIEW_X - SIGHT_MARGIN) / TILE)
    const inRight = Math.floor((VIEW_X + VIEW_W + SIGHT_MARGIN) / TILE)
    const places = { farLeft: 2, inLeft, mid: 44, inRight, farRight: inRight + 6 }
    const props = [
      ...Object.values(places).map((tx, i) => prop(10 + i, 'tree', tx)),
      ...Object.values(places).map((tx, i) => prop(20 + i, 'fruit', tx)),
      ...Object.values(places).map((tx, i) => prop(30 + i, 'rock', tx)),
      prop(40, 'princess', places.farLeft, { data: 1 }),
      prop(41, 'princess', places.mid, { data: 1 })
    ]
    const world = {
      props,
      theme: 'forest',
      goalOpen: false,
      player: { x: 44 * TILE, w: 30 },
      tileAt: () => 0,
      h: 20,
      solidAt: (_: number, ty: number) => ty === 5
    }
    const view = new PropsView(world as never, { rand: () => 0.5, spawn: () => {} } as never)
    return { view, places, props }
  }
  const at = (tx: number) => blits.filter((b) => Math.abs(b.x - (tx * TILE + TILE / 2)) <= TILE / 2 + 1).length
  const drawAll = (view: PropsView) => {
    const { ctx } = countingContext()
    blits.length = 0
    view.drawProps(ctx)
    view.drawPickups(ctx)
    view.drawPrincess(ctx)
  }

  it('are all drawn where no stretch is given', () => {
    const { view, places } = stage()
    drawAll(view)
    for (const tx of Object.values(places)) expect(at(tx)).toBeGreaterThanOrEqual(3)
    expect(blits.filter((b) => b.anim.startsWith('prop:cage#')).length).toBe(4)
  })

  it('are those that reach into the stretch: the far ones are left out, whatever their kind', () => {
    const { view, places } = stage()
    const sight = new Sight()
    view.sight = sight
    sight.look(VIEW_X)
    drawAll(view)
    expect(at(places.farLeft)).toBe(0)
    expect(at(places.farRight)).toBe(0)
    // The ones just inside the margin and the one in the view: the tree, the fruit and the rock of each.
    expect(at(places.inLeft)).toBe(3)
    expect(at(places.inRight)).toBe(3)
    // In the view: the three, and ハム姫 between the back and the front of her cage (the far ハム姫 is left out).
    expect(at(places.mid)).toBe(6)
    expect(blits.filter((b) => b.anim.startsWith('prop:cage#')).length).toBe(2)
    // The camera moves: what was far is drawn, what is far now is not.
    sight.look(0)
    drawAll(view)
    expect(at(places.farLeft)).toBe(6)
    expect(at(places.mid)).toBe(0)
    expect(blits.filter((b) => b.anim.startsWith('prop:cage#')).length).toBe(2)
  })

  it('include a fallen log that only reaches into the stretch with its end', () => {
    const { view } = stage()
    const sight = new Sight()
    view.sight = sight
    // A log four tiles long whose last tile is the first of the stretch, and one that ends a tile before it.
    const first = Math.ceil((VIEW_X - SIGHT_MARGIN) / TILE)
    view.handle({ type: 'tree-land', kind: 'tree', tx: first - 3, ty: 4, length: 4, dir: 1 } as never)
    view.handle({ type: 'tree-land', kind: 'tree', tx: first - 6, ty: 4, length: 4, dir: 1 } as never)
    sight.look(VIEW_X)
    drawAll(view)
    const logs = blits.filter((b) => b.anim === 'prop:log#tree')
    expect(logs.map((b) => b.x)).toEqual([(first - 3) * TILE])
  })
})

describe('the enemies a frame draws', () => {
  function stage() {
    const enemy = (id: number, x: number) => ({
      id,
      kind: 'walker',
      x,
      y: 4 * TILE - 38,
      w: 44,
      h: 38,
      vx: 0,
      vy: 0,
      facing: 1,
      onGround: true,
      hitFlash: 0,
      shootTimer: 0,
      dead: false
    })
    const enemies = [enemy(1, 100), enemy(2, 2600), enemy(3, 2900), enemy(4, 6000)]
    const world = {
      player: {
        x: 2700,
        y: 0,
        w: 30,
        h: 40,
        vx: 0,
        vy: 0,
        facing: 1,
        onGround: true,
        inWater: false,
        biteTimer: 0,
        invuln: 0,
        dead: false
      },
      enemies,
      boss: null,
      state: 'play',
      h: 20,
      // Ground under everyone (row 4).
      solidAt: (_tx: number, ty: number) => ty >= 4,
      tileAt: () => 0
    }
    const view = new ActorsView(
      world as never,
      { rand: () => 0.5, spawn: () => {}, burst: () => {} } as never,
      () => {}
    )
    view.update(1 / 60)
    return { view, enemies }
  }
  const drawn = (view: ActorsView) => {
    const { ctx, counts } = countingContext()
    blits.length = 0
    view.drawEnemies(ctx)
    return {
      bodies: blits.filter((b) => b.anim.startsWith('walker#')).map((b) => Math.round(b.x)),
      shadows: counts.fillRect
    }
  }

  it('are all of the living where no stretch is given, each with its shadow', () => {
    const { view } = stage()
    const all = drawn(view)
    expect(all.bodies).toEqual([122, 2622, 2922, 6022])
    expect(all.shadows).toBe(12)
  })

  it('are those within the stretch: an enemy far away is left out, shadow and all', () => {
    const { view, enemies } = stage()
    const sight = new Sight()
    view.sight = sight
    sight.look(2400)
    const near = drawn(view)
    expect(near.bodies).toEqual([2622, 2922])
    expect(near.shadows).toBe(6)
    // Right at the edges of the stretch: the body's own span decides.
    const body = enemies[1]
    sight.look(body.x + body.w + SIGHT_MARGIN)
    expect(drawn(view).bodies).toContain(2622)
    sight.look(body.x + body.w + SIGHT_MARGIN + 1)
    expect(drawn(view).bodies).not.toContain(2622)
    sight.look(body.x - VIEW_W - SIGHT_MARGIN)
    expect(drawn(view).bodies).toContain(2622)
    sight.look(body.x - VIEW_W - SIGHT_MARGIN - 1)
    expect(drawn(view).bodies).not.toContain(2622)
    // A dead one is not drawn wherever it is, as ever.
    enemies[2].dead = true
    sight.look(2400)
    expect(drawn(view).bodies).toEqual([2622])
  })
})
