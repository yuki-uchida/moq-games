import { describe, expect, test } from 'vitest'
import { EVENTS, WEAPONS, timeAtAge } from '../src/data'
import { FX, readGuardBits } from '../src/fx'
import { GUARDIAN_SHIELD_ART, Game, type Player, type Shot } from '../src/game'
import { childDrawnBox } from '../src/overhead'
import { GUARD_BACK, GUARD_STEP, GUARD_STEPS, SHOT_GAMBLE, STRIDE, readView, toView } from '../src/view'

const DT = 1 / 60
const S = Math.SQRT1_2

/** A child of `age` with 過保護親 Lv`level` (and the gamble's copies of her at Lv`gamble`), married or not. */
function setup(level: number, gamble = 0, married = false) {
  const game = new Game(5)
  game.targetPopulation = () => 0
  const player = game.addPlayer('a', 'p_over')!
  player.choices = []
  player.pending = 0
  player.birthPick = false
  game.state.time = timeAtAge(married ? 36 : 30) + 1
  game.state.eventIndex = EVENTS.length
  player.weapons[0].lv = level
  if (gamble)
    player.weapons.push({
      id: 'w_gamble',
      lv: gamble,
      cd: 0,
      held: 0,
      damage: 0,
      gambleWeapon: 'p_over',
      gambleUntil: 1e9
    })
  if (married) Object.assign(player, { married: true, hasChild: true })
  return { game, player }
}

const guardsOf = (game: Game, player: Player) =>
  game.state.shots.filter((shot) => shot.weapon === 'p_over' && shot.owner === player.id && shot.delay <= 0)

/** 過保護親's shield as drawn, facing the way she is drawn (offsets from her child). */
function shield(guard: Shot, player: Player) {
  const x = guard.x - player.x
  const y = guard.y - player.y
  const left = Math.cos(guard.guardianFace ?? guard.angle) < 0
  const scale = guard.r / 20
  const near = GUARDIAN_SHIELD_ART.near * scale
  const far = GUARDIAN_SHIELD_ART.far * scale
  return {
    left: left ? x - far : x + near,
    right: left ? x - near : x + far,
    top: y + GUARDIAN_SHIELD_ART.top * scale,
    bottom: y + GUARDIAN_SHIELD_ART.bottom * scale
  }
}

describe('the ring round a standing child lights up towards the enemy her 過保護親 bashed', () => {
  test('FX.GUARD carries the bashed enemy, the child and the shield; none for an enemy off the all-round reach', () => {
    const { game, player } = setup(1)
    for (let f = 0; f < 60; f++) game.tick(DT)
    const enemy = game.spawnEnemy('expense', player.x - 40, player.y + 6)!
    const guard = guardsOf(game, player)[0]
    let found: { x: number; y: number; a: number; b: number } | undefined
    let at = { x: 0, y: 0 }
    for (let f = 0; f < 120 && !found; f++) {
      const seen = game.state.fx.length ? game.state.fx[game.state.fx.length - 1].seq : 0
      at = { x: enemy.x, y: enemy.y }
      game.tick(DT)
      player.hp = player.maxHp
      found = game.state.fx.find((event) => event.seq > seen && event.type === FX.GUARD)
    }
    expect(found).toBeDefined()
    expect(Math.abs(found!.x - at.x)).toBeLessThanOrEqual(1)
    expect(Math.abs(found!.y - at.y)).toBeLessThanOrEqual(1)
    expect(found!.a).toBe(0)
    const bits = readGuardBits(found!.b)
    expect(bits.radius).toBe(Math.round(guard.r))
    expect(bits.seconds).toBeCloseTo(guard.tick, 2)
    // (The enemy is on the child's side of her: her shield does not strike it, the ring does.)
    expect(bits.shield).toBe(false)

    // An enemy touching a friend standing by her (bashed all the same) but off her all-round reach of the child.
    const far = setup(1)
    const friend = far.game.addPlayer('b', 'p_free')!
    Object.assign(friend, { choices: [], pending: 0, birthPick: false, weapons: [] })
    for (let f = 0; f < 60; f++) far.game.tick(DT)
    friend.x = far.player.x + 50
    friend.y = far.player.y
    const touching = far.game.spawnEnemy('expense', friend.x + 24, friend.y)!
    const hp = touching.hp
    let guards = 0
    for (let f = 0; f < 120; f++) {
      friend.x = far.player.x + 50
      friend.y = far.player.y
      touching.x = friend.x + 24
      touching.y = friend.y
      far.game.tick(DT)
      far.player.hp = far.player.maxHp
      friend.hp = friend.maxHp
      guards += far.game.state.fx.filter((event) => event.type === FX.GUARD && event.t === far.game.state.time).length
    }
    expect(touching.hp).toBeLessThan(hp)
    expect(guards).toBe(0)
  }, 30_000)
})

/** Stops, starts and turns straight from one way to another (as r25's review counted them). */
const DIRS: Record<string, [number, number]> = {
  D: [1, 0],
  A: [-1, 0],
  W: [0, -1],
  S: [0, 1],
  SD: [S, S],
  WA: [-S, -S],
  none: [0, 0]
}
const ways = ['D', 'A', 'W', 'S', 'SD', 'WA', 'A', 'D', 'S', 'W']
const plan: [string, number][] = [
  ...ways.flatMap((way): [string, number][] => [
    [way, 45],
    ['none', 70]
  ]),
  ...ways.slice(0, -1).map((way): [string, number] => [way, 40]),
  ['none', 90]
]

describe('過保護親 never turn round and back within ten frames as the child stops, starts and turns', () => {
  const builds: [string, number, number, boolean][] = [
    ['Lv1', 1, 0, false],
    ['Lv4', 4, 0, false],
    ['Lv8', 8, 0, false],
    ['Lv4 with the gamble’s copies', 4, 5, false],
    ['Lv8 with the gamble’s copies', 8, 8, false],
    ['Lv8 with the gamble’s copies, married', 8, 8, true]
  ]
  for (const [name, level, gamble, married] of builds)
    test(
      name,
      () => {
        const { game, player } = setup(level, gamble, married)
        for (let f = 0; f < 30; f++) game.tick(DT)
        const faults: string[] = []
        for (const [way, frames] of plan) {
          const sides = new Map<number, boolean[]>()
          for (let f = 0; f < frames; f++) {
            game.setInput(player.id, { x: DIRS[way][0], y: DIRS[way][1] })
            game.tick(DT)
            player.hp = player.maxHp
            for (const guard of guardsOf(game, player)) {
              const list = sides.get(guard.id) ?? []
              list.push(Math.cos(guard.guardianFace ?? guard.angle) < 0)
              sides.set(guard.id, list)
            }
          }
          for (const [id, list] of sides)
            for (let i = 1; i < list.length; i++)
              if (list[i] !== list[i - 1])
                for (let j = i + 1; j <= Math.min(list.length - 1, i + 10); j++)
                  if (list[j] !== list[i]) {
                    faults.push(`${way} frame ${i}: #${id} turned and back after ${j - i} frame(s)`)
                    break
                  }
        }
        expect(faults).toEqual([])
      },
      30_000
    )
})

describe('過保護親 hold their shields off the child as drawn, standing and going by her', () => {
  for (const [name, level, gamble] of [
    ['Lv1', 1, 0],
    ['Lv4', 4, 0],
    ['Lv8 with the gamble’s copies', 8, 8]
  ] as const)
    test(
      name,
      () => {
        const { game, player } = setup(level, gamble)
        for (let f = 0; f < 30; f++) game.tick(DT)
        const child = childDrawnBox(1)
        const faults: string[] = []
        let standing = 0
        let near = 0
        for (const [way, frames] of plan) {
          for (let f = 0; f < frames; f++) {
            game.setInput(player.id, { x: DIRS[way][0], y: DIRS[way][1] })
            game.tick(DT)
            player.hp = player.maxHp
            for (const guard of guardsOf(game, player)) {
              const x = guard.x - player.x
              const y = guard.y - player.y
              const box = shield(guard, player)
              const over =
                Math.min(box.right, child.right) - Math.max(box.left, child.left) >= 1 &&
                Math.min(box.bottom, child.bottom) - Math.max(box.top, child.top) >= 1
              const still = player.still > 0 && guard.guardianStill === 1 && !guard.guardianWalking
              // Going by her side or behind her (not across in front of her feet, where some shield is in the way).
              const by = !still && Math.abs(x) <= 60 && y < 20
              if (still) standing++
              if (by) near++
              if (over && (still || by))
                faults.push(`${way} frame ${f} #${guard.id} (${x.toFixed(0)}, ${y.toFixed(0)})`)
            }
          }
        }
        expect(standing).toBeGreaterThan(0)
        expect(near).toBeGreaterThan(0)
        expect(faults.slice(0, 10)).toEqual([])
      },
      30_000
    )
})

describe('過保護親 step back slowly, playing her walk backwards', () => {
  test('beside a standing child she steps back no faster than 90 px/s, and the view says so', () => {
    const { game, player } = setup(1)
    for (let f = 0; f < 30; f++) game.tick(DT)
    let back = 0
    let fastest = 0
    let shown = 0
    for (const [way, frames] of plan) {
      for (let f = 0; f < frames; f++) {
        game.setInput(player.id, { x: DIRS[way][0], y: DIRS[way][1] })
        const before = new Map(guardsOf(game, player).map((g) => [g, { x: g.x - player.x, y: g.y - player.y }]))
        game.tick(DT)
        player.hp = player.maxHp
        const view = toView(game.state)
        expect(readView(JSON.parse(JSON.stringify(view)))).toBeTruthy()
        for (const guard of guardsOf(game, player)) {
          const was = before.get(guard)
          if (guard.guardianPace !== 'back' || !was) continue
          const i = game.state.shots.filter((shot) => shot.delay <= 0).indexOf(guard)
          if ((view.shots[i * STRIDE.shots + 7] & GUARD_BACK) === GUARD_BACK) shown++
          if (player.still <= 0) continue
          back++
          const step = Math.hypot(guard.x - player.x - was.x, guard.y - player.y - was.y) / DT
          fastest = Math.max(fastest, step)
        }
      }
    }
    expect(back).toBeGreaterThan(0)
    expect(shown).toBeGreaterThan(0)
    expect(fastest).toBeLessThanOrEqual(90 + 1e-6)
  }, 30_000)

  test('a parent stepping back and copied by the gamble fits her field (up to 255); other weapons stay under 128', () => {
    const { game, player } = setup(4, 5)
    for (let f = 0; f < 30; f++) game.tick(DT)
    const copy = guardsOf(game, player).find((shot) => shot.sourceWeapon === 'w_gamble')!
    copy.guardianWalking = true
    copy.guardianPace = 'back'
    const view = JSON.parse(JSON.stringify(toView(game.state)))
    const i = game.state.shots.filter((shot) => shot.delay <= 0).indexOf(copy)
    expect(view.shots[i * STRIDE.shots + 7] & (GUARD_BACK + SHOT_GAMBLE)).toBe(GUARD_BACK + SHOT_GAMBLE)
    expect(readView(view)).toBeTruthy()
    const other = WEAPONS.findIndex((weapon) => weapon.id !== 'p_over')
    view.shots[i * STRIDE.shots] = other
    expect(readView(view)).toBeUndefined()
  })
})

describe('過保護親 walk a frame every 14 px over the ground, and step off the family no faster than 360 px/s', () => {
  test('her walk goes on (back, stepping back) as far as she goes, and the view carries its frame with her angle', () => {
    const { game, player } = setup(8, 8)
    for (let f = 0; f < 30; f++) game.tick(DT)
    let checked = 0
    for (const [way, frames] of plan) {
      for (let f = 0; f < frames; f++) {
        game.setInput(player.id, { x: DIRS[way][0], y: DIRS[way][1] })
        const before = new Map(
          guardsOf(game, player).map((g) => [g, { x: g.x, y: g.y, stride: g.guardianStride ?? 0 }])
        )
        game.tick(DT)
        player.hp = player.maxHp
        const live = game.state.shots.filter((shot) => shot.delay <= 0)
        const view = toView(game.state)
        for (const guard of guardsOf(game, player)) {
          const was = before.get(guard)
          if (!was || !guard.guardianWalking) continue
          // (On as she goes, back as she steps back.)
          const went = (Math.hypot(guard.x - was.x, guard.y - was.y) / 14) % 60
          const moved = (guard.guardianStride ?? 0) - was.stride
          expect(((guard.guardianPace === 'back' ? -moved : moved) + 60) % 60).toBeCloseTo(went, 6)
          const field = view.shots[live.indexOf(guard) * STRIDE.shots + 4]
          const step = Math.round(field / GUARD_STEP) + 0
          expect(step).toBe(Math.floor(guard.guardianStride ?? 0) % GUARD_STEPS)
          const angle = (field - step * GUARD_STEP) / 100
          const face = guard.guardianFace ?? guard.angle
          expect(Math.abs(Math.atan2(Math.sin(angle - face), Math.cos(angle - face)))).toBeLessThan(0.01)
          checked++
        }
      }
    }
    expect(checked).toBeGreaterThan(100)
  }, 30_000)

  test('married, a parent standing where the family comes steps off them no faster than 360 px/s', () => {
    const { game, player } = setup(4, 0, true)
    for (let f = 0; f < 30; f++) game.tick(DT)
    let fastest = 0
    for (const [way, frames] of plan) {
      for (let f = 0; f < frames; f++) {
        game.setInput(player.id, { x: DIRS[way][0], y: DIRS[way][1] })
        const before = new Map(guardsOf(game, player).map((g) => [g, { x: g.x - player.x, y: g.y - player.y }]))
        game.tick(DT)
        player.hp = player.maxHp
        for (const guard of guardsOf(game, player)) {
          const was = before.get(guard)
          if (was) fastest = Math.max(fastest, Math.hypot(guard.x - player.x - was.x, guard.y - player.y - was.y) / DT)
        }
      }
    }
    expect(fastest).toBeLessThanOrEqual(360 + 1e-6)
  }, 30_000)
})

describe('過保護親 in one line walking up the screen and across, and her walk stepping back and on again', () => {
  /** Pairs of parents in one line facing each other (within 50 px across, 14 px up or down). */
  const faceToFace = (game: Game, player: Player) => {
    const guards = guardsOf(game, player).map((guard) => ({
      x: guard.x - player.x,
      y: guard.y - player.y,
      left: Math.cos(guard.guardianFace ?? guard.angle) < 0
    }))
    let pairs = 0
    for (const a of guards)
      for (const b of guards)
        if (!a.left && b.left && b.x > a.x && b.x - a.x <= 50 && Math.abs(b.y - a.y) <= 14) pairs++
    return pairs
  }

  for (const [name, level, gamble, married] of [
    ['Lv4 and the gamble Lv5', 4, 5, false],
    ['Lv8 and the gamble Lv8', 8, 8, false],
    ['married, Lv8 and the gamble Lv8', 8, 8, true]
  ] as const)
    test(`${name}: walking up and right or left on, no two in a line face each other`, () => {
      for (const way of [
        [S, -S],
        [-S, -S]
      ])
        for (const from of [
          [0, 0],
          [1, 0],
          [-1, 0]
        ]) {
          const { game, player } = setup(level, gamble, married)
          const run = (input: number[], frames: number, check = 0) => {
            for (let f = 0; f < frames; f++) {
              game.setInput(player.id, { x: input[0], y: input[1] })
              game.tick(DT)
              player.hp = player.maxHp
              // (Once they have come round to their places in the line: going there, two may pass each other.)
              if (f >= check) expect(faceToFace(game, player)).toBe(0)
            }
          }
          run([0, 0], 60, Infinity)
          run(from, 60, Infinity)
          run(way, 180, 60)
        }
    }, 30_000)

  test('her walk as drawn goes on or back a frame at most each step, stepping back and on again', () => {
    const { game, player } = setup(8, 8)
    for (let f = 0; f < 30; f++) game.tick(DT)
    const last = new Map<Shot, { step: number; back: boolean }>()
    let checked = 0
    let switches = 0
    let seed = 99
    const random = () => (seed = (seed * 1103515245 + 12345) & 0x7fffffff) / 0x7fffffff
    const all = Object.values(DIRS)
    const steps: [number, number][] = [
      ...plan.map(([way, frames]): [number, number] => [all.indexOf(DIRS[way]), frames])
    ]
    for (let k = 0; k < 40; k++) steps.push([Math.floor(random() * all.length), 10 + Math.floor(random() * 60)])
    for (const [way, frames] of steps) {
      for (let f = 0; f < frames; f++) {
        game.setInput(player.id, { x: all[way][0], y: all[way][1] })
        game.tick(DT)
        player.hp = player.maxHp
        const live = game.state.shots.filter((shot) => shot.delay <= 0)
        const view = toView(game.state)
        for (const guard of guardsOf(game, player)) {
          const field = view.shots[live.indexOf(guard) * STRIDE.shots + 4]
          const step = Math.round(field / GUARD_STEP)
          const back = (view.shots[live.indexOf(guard) * STRIDE.shots + 7] & GUARD_BACK) === GUARD_BACK
          const was = last.get(guard)
          if (!guard.guardianWalking) {
            last.delete(guard)
            continue
          }
          if (was) {
            // (Drawn on the frame it carries at every pace: back a frame stepping back, on one otherwise.)
            expect([0, back ? GUARD_STEPS - 1 : 1]).toContain((step - was.step + GUARD_STEPS) % GUARD_STEPS)
            if (back !== was.back) switches++
            checked++
          }
          last.set(guard, { step, back })
        }
      }
    }
    expect(checked).toBeGreaterThan(1000)
    expect(switches).toBeGreaterThan(10)
  }, 30_000)
})
