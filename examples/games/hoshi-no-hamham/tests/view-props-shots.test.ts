import { beforeEach, describe, expect, it, vi } from 'vitest'

/** Every blit the props view makes, in order. */
const blits: { anim: string; x: number; y: number }[] = []

vi.mock('../src/view/bake', () => ({
  clip: (sheet: string, name: string) => ({ id: `${sheet}#${name}` }),
  brush: () => ({}),
  blit: (_ctx: unknown, anim: { id: string }, _t: number, x: number, y: number) => blits.push({ anim: anim.id, x, y })
}))

import { T } from '../src/game/sim'
import { FLIGHT_ANGLE_STEP, PropsView, SHOCK_GROUND_PX, flightAngle } from '../src/view/props'

beforeEach(() => {
  blits.length = 0
})

const ctx = {} as CanvasRenderingContext2D

/** A squirrel's box (sim.ts: 46 × 42) and a boss's. */
const squirrel = () => ({ id: 1, kind: 'spitter', x: 100, y: 200, w: 46, h: 42, vx: 0, vy: 0, dead: false })
const bossBody = () => ({ x: 400, y: 150, w: 92, h: 92, vx: 0, vy: 0, dead: false, def: { kind: 'swarm' } })

/** A shot as sim.ts spawns it: its left at the centre column of its shooter, 0.4 of the way down. */
const shotFrom = (body: { x: number; y: number; w: number; h: number }, vx = 260, kind = 'seed') => ({
  kind,
  x: body.x + body.w / 2,
  y: body.y + body.h * 0.4,
  w: 14,
  h: 14,
  vx,
  vy: -40,
  hostile: true,
  life: 4,
  dead: false,
  skin: 'seed'
})

type Shot = ReturnType<typeof shotFrom>

function setup(shots: Shot[], enemies = [squirrel()], boss: ReturnType<typeof bossBody> | null = bossBody()) {
  // (No ground anywhere unless a test lays some.)
  const world = {
    props: [],
    shots,
    bees: [],
    enemies,
    boss,
    theme: 'forest',
    goalOpen: false,
    h: 20,
    tileAt: () => 0,
    solidAt: (_tx: number, _ty: number) => false
  }
  const view = new PropsView(world as never, { rand: () => 0.5, spawn: () => {} } as never)
  /** The shots each pass of one frame draws (by the x of their centre), behind first. */
  const passes = () => {
    blits.length = 0
    view.drawProjectiles(ctx, 'behind')
    const behind = blits.map((b) => b.x)
    blits.length = 0
    view.drawProjectiles(ctx, 'front')
    const front = blits.filter((b) => !b.anim.startsWith('prop:bee')).map((b) => b.x)
    return { behind, front }
  }
  return { world, view, passes }
}

const centre = (shot: Shot) => shot.x + shot.w / 2

/**
 * A shooter's drawn frame as `ActorsView.drawnFrame` hands it over: a 64 px cell anchored on its feet ([32, 60]),
 * its paint in columns 10–59 (reaching further forward than back) and rows 6–60.
 */
const PAINT = { x: 10, y: 6, w: 50, h: 55 }
const frameRaster = { bounds: () => ({ ...PAINT }), get: () => 1 }
function drawnAs(view: PropsView, flip: () => boolean) {
  view.drawnFrame = (body, out) => {
    out.raster = frameRaster as never
    out.anchor = [32, 60]
    out.x = body.x + body.w / 2
    out.y = body.y + body.h
    out.flip = flip()
    return true
  }
}

describe("a squirrel's acorn comes out from behind its drawing; a boss's shot is in front from its first frame", () => {
  it('past the edge of his box it stays behind while it overlaps the frame he shows, facing right', () => {
    const enemy = squirrel()
    const shot = shotFrom(enemy)
    const { view, passes } = setup([shot], [enemy])
    drawnAs(view, () => false)
    // The squirrel is drawn from x 101 to 151 (its centre 123 - 22, + 28); its box ends at 146.
    expect(passes()).toEqual({ behind: [centre(shot)], front: [] })
    shot.x = 140
    expect(centre(shot)).toBeGreaterThan(enemy.x + enemy.w)
    expect(passes()).toEqual({ behind: [centre(shot)], front: [] })
    // Its box clear of the drawing: in front.
    shot.x = 151
    expect(passes()).toEqual({ behind: [], front: [centre(shot)] })
    // Back over the drawing (a shot that falls back, a squirrel that hops after it): it stays in front.
    shot.x = enemy.x + 4
    expect(passes()).toEqual({ behind: [], front: [centre(shot)] })
  })

  it('flipped, the drawing is mirrored about the anchor: the same on the left side', () => {
    const enemy = squirrel()
    const shot = shotFrom(enemy, -260)
    const { view, passes } = setup([shot], [enemy])
    drawnAs(view, () => true)
    expect(passes().behind).toEqual([centre(shot)])
    // Flipped it is drawn from x 95 to 145; its box starts at 100.
    shot.x = 86
    expect(shot.x + shot.w).toBeLessThan(enemy.x + 1)
    expect(passes()).toEqual({ behind: [centre(shot)], front: [] })
    shot.x = 81
    expect(passes()).toEqual({ behind: [], front: [centre(shot)] })
  })

  it('on the side he does not reach towards it comes out sooner, and follows the frame he shows now', () => {
    let flip = false
    const enemy = squirrel()
    const back = shotFrom(enemy, -260)
    const { view, passes } = setup([back], [enemy])
    drawnAs(view, () => flip)
    expect(passes().behind).toEqual([centre(back)])
    // Facing right he is drawn from 101: a shot at 87–101 is clear of him; flipped he reaches to 95: still behind.
    back.x = 87
    flip = true
    expect(passes().behind).toEqual([centre(back)])
    flip = false
    expect(passes()).toEqual({ behind: [], front: [centre(back)] })
  })

  it("the king's volley is in front from the step it is born (it bursts out of his chest)", () => {
    const king = { ...bossBody(), def: { kind: 'final' } }
    const orbs = [shotFrom(king, 200), shotFrom(king, -200)]
    orbs[1].x -= 3
    const { view, passes } = setup(orbs, [], king as never)
    drawnAs(view, () => false)
    const { behind, front } = passes()
    expect(behind).toEqual([])
    expect(front.sort()).toEqual(orbs.map(centre).sort())
  })

  it("a boss's thrown or cast shot is in front from its first frame (it is born from his light), drawn or not", () => {
    const boss = bossBody()
    const right = shotFrom(boss, 300)
    const left = shotFrom(boss, -300)
    left.y += 20
    const { view, passes } = setup([right, left], [], boss)
    expect(passes()).toEqual({ behind: [], front: [centre(right), centre(left)] })
    drawnAs(view, () => false)
    expect(passes().behind).toEqual([])
  })

  it("a squirrel minion's acorn thrown from inside the boss's drawing stays behind until it is clear of both", () => {
    const enemy = squirrel()
    // The boss stands just right of the squirrel (his box starts at 140; he is drawn from 164 to 214).
    const boss = { ...bossBody(), x: 140, y: 160 }
    const shot = shotFrom(enemy)
    const { view, passes } = setup([shot], [enemy], boss)
    drawnAs(view, () => false)
    expect(passes().behind).toEqual([centre(shot)])
    // Clear of the squirrel (drawn up to 151), still on the boss.
    shot.x = 152
    expect(passes().behind).toEqual([centre(shot)])
    shot.x = 214
    expect(passes()).toEqual({ behind: [], front: [centre(shot)] })
  })

  it('a shot that appears outside any shooter is in front, and so is a shockwave inside one', () => {
    const boss = bossBody()
    const stray = shotFrom(boss)
    stray.x = 20
    stray.y = 20
    const shock = shotFrom(boss, 200, 'shock')
    const { passes } = setup([stray, shock], [squirrel()], boss)
    const { behind, front } = passes()
    expect(behind).toEqual([])
    expect(front).toHaveLength(2)
  })

  it('a shot inside a knocked-out shooter, or a friendly one, is in front', () => {
    const enemy = squirrel()
    const shot = shotFrom(enemy)
    const friendly = { ...shotFrom(bossBody()), hostile: false }
    const { passes } = setup([shot, friendly], [enemy])
    expect(passes().behind).toEqual([centre(shot)])
    enemy.dead = true
    expect(passes()).toEqual({ behind: [], front: [centre(shot), centre(friendly)] })
    enemy.dead = false
    expect(passes().behind).toEqual([])
  })

  it('each live shot is drawn exactly once a frame, along its whole flight; a dead one not at all', () => {
    const enemy = squirrel()
    const boss = bossBody()
    const shots = [shotFrom(enemy, 260), shotFrom(enemy, -260), shotFrom(boss, 300), shotFrom(boss, -200, 'shock')]
    // (Told apart by where they are drawn.)
    shots[1].x -= 3
    shots[3].x += 5
    const gone = { ...shotFrom(enemy), dead: true }
    const { passes } = setup([...shots, gone], [enemy], boss)
    const seenBehind = new Set<number>()
    for (let frame = 0; frame < 40; frame++) {
      const { behind, front } = passes()
      expect(behind.length + front.length).toBe(shots.length)
      for (const shot of shots) {
        const drawn = [...behind, ...front].filter((x) => x === centre(shot)).length
        expect(drawn).toBe(1)
        if (behind.includes(centre(shot))) seenBehind.add(shots.indexOf(shot))
      }
      for (const shot of shots) shot.x += shot.vx / 60
    }
    // Both acorns started behind; the boss's shot and the shockwave never were.
    expect([...seenBehind].sort()).toEqual([0, 1])
  })
})

describe('a stinger is drawn along its flight', () => {
  it('level when it flies level, turned down as it falls, at a few fixed angles, mirrored to the left', () => {
    expect(flightAngle(240, 0)).toBe(0)
    expect(flightAngle(240, 240)).toBeCloseTo(Math.PI / 4)
    expect(flightAngle(-240, 240)).toBeCloseTo(-Math.PI / 4)
    // Between two of its angles it takes the nearer.
    expect(flightAngle(240, 30)).toBe(0)
    expect(flightAngle(240, 70)).toBeCloseTo(FLIGHT_ANGLE_STEP)
    for (const vy of [-300, -100, 0, 50, 120, 400]) {
      const a = flightAngle(200, vy)
      expect(Math.abs(a / FLIGHT_ANGLE_STEP - Math.round(a / FLIGHT_ANGLE_STEP))).toBeLessThan(1e-9)
    }
  })

  it('is drawn turned about its centre (the canvas put back after), an orb is not', () => {
    const boss = bossBody()
    const dart = { ...shotFrom(boss, 200), vy: 200, skin: 'stinger' }
    const orb = { ...shotFrom(boss, 200), vy: 200, skin: 'orb' }
    orb.x += 30
    const { view } = setup([dart, orb], [], boss)
    const calls: string[] = []
    const turning = {
      translate: (x: number, y: number) => calls.push(`translate ${x} ${y}`),
      rotate: (a: number) => calls.push(`rotate ${a.toFixed(3)}`)
    } as unknown as CanvasRenderingContext2D
    blits.length = 0
    view.drawProjectiles(turning, 'front')
    const a = flightAngle(200, 200).toFixed(3)
    const cx = centre(dart)
    const cy = dart.y + dart.h / 2
    expect(calls).toEqual([
      `translate ${cx} ${cy}`,
      `rotate ${a}`,
      `rotate ${(-Number(a)).toFixed(3)}`,
      `translate ${-cx} ${-cy}`
    ])
    expect(blits.map((b) => [b.anim, b.x, b.y])).toEqual([
      ['prop:stinger#fly', 0, 0],
      ['prop:orb#pulse', centre(orb), orb.y + orb.h / 2]
    ])
  })
})

describe('a shot that ends on a body with nothing to show for it ends with a small burst', () => {
  const run = (end: (shot: Shot, view: PropsView) => void) => {
    const boss = bossBody()
    const shot = shotFrom(boss)
    const spawned: { name: string; x: number; y: number }[] = []
    const world = {
      props: [],
      shots: [shot],
      bees: [],
      enemies: [],
      boss,
      theme: 'forest',
      h: 20,
      state: 'play',
      tileAt: () => 0,
      solidAt: () => false
    }
    const view = new PropsView(
      world as never,
      {
        rand: () => 0.5,
        spawn: (name: string, x: number, y: number) => spawned.push({ name, x, y })
      } as never
    )
    view.simStep()
    shot.x += 4
    end(shot, view)
    view.simStep()
    return { spawned, shot }
  }

  it('gone on a hero who could not be hurt (no event): a spark where it was', () => {
    const { spawned, shot } = run((shot) => {
      shot.dead = true
    })
    expect(spawned).toEqual([{ name: 'spark', x: centre(shot), y: shot.y + shot.h / 2 }])
  })

  it('a shot that hit a wall (its own burst) or ran out of time ends without one', () => {
    const hit = run((shot, view) => {
      shot.dead = true
      view.handle({ type: 'shot-hit', kind: 'seed', x: shot.x, y: shot.y } as never)
    })
    expect(hit.spawned).toEqual([])
    const old = run((shot) => {
      shot.dead = true
      shot.life = 0
    })
    expect(old.spawned).toEqual([])
  })
})
describe('a shockwave rolls on ground and flies where the ground has gone from under it', () => {
  /** A wave as sim.ts spawns it (30 × 22, its bottom on the ground row of `feet`) with its left at `x`. */
  const wave = (x: number, feet = 5 * 64, vx = 260) => ({
    ...shotFrom(bossBody(), vx, 'shock'),
    x,
    y: feet - 22,
    w: 30,
    h: 22
  })

  it('rolls with ground under its middle, flies over a gap, and rolls again past it (a platform is ground)', () => {
    const shock = wave(0)
    const { world, view } = setup([shock], [], null)
    // Ground on row 5 everywhere but column 3; a one-way platform in column 6.
    world.solidAt = (tx, ty) => ty === 5 && tx !== 3 && tx !== 6
    world.tileAt = ((tx: number, ty: number) => (tx === 6 && ty === 5 ? T.PLATFORM : 0)) as never
    const along: string[] = []
    for (let x = 100; x <= 440; x += 20) {
      shock.x = x
      along.push(view.shockClip(shock as never))
    }
    // Middles at 115…455: over column 3 (192–255) it flies; elsewhere (the platform included) it rolls.
    const middle = (i: number) => 100 + i * 20 + 15
    along.forEach((clip, i) => {
      const tx = Math.floor(middle(i) / 64)
      expect(clip, `middle ${middle(i)}`).toBe(tx === 3 ? 'fly' : 'roll')
    })
    // A wave a few px above its ground still rolls; one level over a step down flies.
    expect(view.shockClip(wave(0, 5 * 64 - SHOCK_GROUND_PX) as never)).toBe('roll')
    expect(view.shockClip(wave(0, 5 * 64 - SHOCK_GROUND_PX - 1) as never)).toBe('fly')
  })

  it('is drawn with the clip chosen, at its place and facing, in the front pass', () => {
    const shock = wave(200)
    const { world, passes } = setup([shock], [], null)
    world.solidAt = (_tx, ty) => ty === 5
    blits.length = 0
    expect(passes().front).toEqual([215])
    world.solidAt = () => false
    const drawn: string[] = []
    blits.length = 0
    passes()
    drawn.push(...blits.map((b) => b.anim))
    expect(drawn).toEqual(['prop:shock#fly'])
  })
})

describe('round 6f: a shockwave that dies on the step it is born bursts', () => {
  const run = (shocks: number, wall = false) => {
    const spawned: string[] = []
    const shots: {
      kind: string
      x: number
      y: number
      w: number
      h: number
      vx: number
      vy: number
      dead: boolean
      hostile: boolean
      life: number
    }[] = []
    for (let i = 0; i < shocks; i++)
      shots.push({
        kind: 'shock',
        x: 300 + (i ? 4 : -4),
        y: 258,
        w: 24,
        h: 22,
        vx: i ? 220 : -220,
        vy: 0,
        dead: false,
        hostile: true,
        life: 2
      })
    const world = {
      props: [],
      shots,
      bees: [],
      enemies: [],
      boss: null,
      theme: 'forest',
      h: 20,
      state: 'play',
      tileAt: () => 0,
      solidAt: () => false
    }
    const view = new PropsView(
      world as never,
      { rand: () => 0.5, spawn: (name: string) => spawned.push(name) } as never
    )
    view.handle({ type: 'boss-slam', x: 300, y: 280 } as never)
    if (wall) view.handle({ type: 'shot-hit', kind: 'shock', x: 296, y: 258 } as never)
    view.simStep()
    return spawned
  }
  it('both rolled out: nothing; none (the hero could not be hurt): a burst for each; one stopped by a wall: its own burst', () => {
    expect(run(2)).toEqual([])
    expect(run(0)).toEqual(['spark', 'spark'])
    expect(run(0, true)).toEqual([])
  })
})

describe("round 8: an acorn is its squirrel's, whatever box it is born in", () => {
  it('keeps the old shot, the new acorn and the boss volley separate between two draws', () => {
    const enemy = squirrel()
    const boss = { ...bossBody(), x: 80, y: 170 }
    const old = shotFrom(enemy)
    const { world, view } = setup([old], [enemy], boss)
    Object.assign(world, { state: 'play' })
    view.simStep()
    const orb = { ...shotFrom(enemy), skin: 'orb' }
    const acorn = shotFrom(enemy)
    acorn.x += acorn.vx / 60
    world.shots.push(orb, acorn)
    view.handle({ type: 'spit', id: enemy.id, x: old.x, y: old.y, dir: 1 })
    view.shotFromLight(5, 0)
    view.simStep()
    expect(view.shooterOf(acorn as never)).toBe(enemy)
    for (const [shot, offset] of [
      [old, 0],
      [acorn, 0],
      [orb, 5]
    ] as const) {
      expect(view.shotJoin(shot as never, { x: 0, y: 0 }).x).toBe(offset)
    }
  })

  it('spat inside a charging boss, it is the squirrel’s (the step’s spit) and comes out from behind her', () => {
    // The squirrel stands inside the boss's box (a boar charging through her).
    const boss = { ...bossBody(), x: 80, y: 170, w: 92, h: 92, def: { kind: 'brute' } }
    const enemy = squirrel()
    const acorn = shotFrom(enemy)
    const { world, view } = setup([], [enemy], boss)
    view.handle({ type: 'spit', id: enemy.id, x: enemy.x + enemy.w / 2, y: enemy.y + enemy.h * 0.4, dir: 1 } as never)
    // (On its step it has flown one step.)
    acorn.x += 260 / 60
    world.shots.push(acorn)
    ;(world as unknown as { state: string }).state = 'play'
    view.simStep()
    expect(view.shooterOf(acorn as never)).toBe(enemy)
    expect(view.shotBehind(acorn as never)).toBe(true)
  })
})
