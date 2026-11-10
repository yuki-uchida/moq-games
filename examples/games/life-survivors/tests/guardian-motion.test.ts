import { describe, expect, test } from 'vitest'
import { sheet } from '../src/art/index'
import { EVENTS, timeAtAge } from '../src/data'
import { FAMILY_SLOTS } from '../src/family-slots'
import {
  CREATURE_BODY,
  GUARDIAN_CHILD,
  GUARDIAN_SHIELD_ART,
  GUARDIAN_SPEED,
  Game,
  type Player,
  type Shot
} from '../src/game'
import {
  GUARDIAN_BODY,
  OVERHEAD,
  boxAbout,
  boxesOverlap,
  childDrawnBox,
  overheadBoxes,
  type OverheadBox
} from '../src/overhead'

const DT = 1 / 60
const S = Math.SQRT1_2
/** Nine ways to hold the stick: standing and the eight directions. */
const STICKS: Record<string, { x: number; y: number }> = {
  still: { x: 0, y: 0 },
  R: { x: 1, y: 0 },
  L: { x: -1, y: 0 },
  U: { x: 0, y: -1 },
  D: { x: 0, y: 1 },
  UR: { x: S, y: -S },
  UL: { x: -S, y: -S },
  DR: { x: S, y: S },
  DL: { x: -S, y: S }
}

type Copy = 'none' | 'guard' | 'observe'

/** A child of `age` with 過保護親 Lv`level`, the gamble's copies of `copy` out for good, and `extra` weapons. */
function setup(level: number, copy: Copy = 'none', extra: Player['weapons'] = [], age = 30) {
  const game = new Game(7)
  game.targetPopulation = () => 0
  const player = game.addPlayer('a', 'p_over')!
  player.birthPick = false
  player.pending = 0
  player.choices = []
  player.weapons = [
    { id: 'p_over', lv: level, cd: 0, held: 0, damage: 0 },
    ...extra,
    ...(copy === 'none'
      ? []
      : [
          {
            id: 'w_gamble',
            lv: 5,
            cd: 0,
            held: 0,
            damage: 0,
            gambleWeapon: copy === 'guard' ? 'p_over' : 'w_observe',
            gambleUntil: 1e9
          }
        ])
  ]
  game.state.time = timeAtAge(age) + 0.01
  game.state.eventIndex = EVENTS.length
  game.state.enemies = []
  return { game, player }
}

const guardsOf = (game: Game, player: Player) =>
  game.state.shots.filter((shot) => shot.owner === player.id && shot.weapon === 'p_over' && shot.delay <= 0)

/** Ticks one frame, keeping the child unhurt and the gamble's copies out. */
function frame(game: Game, player: Player) {
  game.tick(DT)
  player.hp = player.maxHp
  for (const shot of game.state.shots) if (shot.sourceWeapon === 'w_gamble') shot.life = Math.max(shot.life, 1)
}

const offset = (shot: Shot, player: Player) => ({ x: shot.x - player.x, y: shot.y - player.y })

describe('過保護親 glide round the child, never jumping, never through her nor on top of each other', () => {
  const configs = [
    { level: 1, copy: 'none' },
    { level: 4, copy: 'none' },
    { level: 8, copy: 'none' },
    { level: 1, copy: 'guard' },
    { level: 4, copy: 'guard' }
  ] as const
  for (const { level, copy } of configs)
    test(`Lv${level}${copy === 'guard' ? ' with the gamble’s copies' : ''}: every switch of the stick, facing up or right before`, () => {
      const faults: string[] = []
      let frames = 0
      for (const before of [STICKS.U, STICKS.R])
        for (const [fromName, from] of Object.entries(STICKS))
          for (const [toName, to] of Object.entries(STICKS)) {
            const { game, player } = setup(level, copy)
            const hold = (stick: { x: number; y: number }, count: number, check: boolean) => {
              game.setInput(player.id, stick)
              for (let f = 0; f < count; f++) {
                const was = new Map(guardsOf(game, player).map((guard) => [guard, offset(guard, player)]))
                frame(game, player)
                if (!check) continue
                frames++
                const guards = guardsOf(game, player)
                const label = `${before.x ? 'R' : 'U'} ${fromName}→${toName} frame ${f}`
                for (const guard of guards) {
                  const at = offset(guard, player)
                  const last = was.get(guard)
                  if (last && Math.hypot(at.x - last.x, at.y - last.y) > 12)
                    faults.push(
                      `${label}: #${guard.id} moved ${Math.hypot(at.x - last.x, at.y - last.y).toFixed(1)} px`
                    )
                  if (Math.abs(at.x) < GUARDIAN_CHILD.x && at.y > GUARDIAN_CHILD.top && at.y < GUARDIAN_CHILD.bottom)
                    faults.push(`${label}: #${guard.id} in the child at (${at.x.toFixed(1)}, ${at.y.toFixed(1)})`)
                }
                for (let i = 0; i < guards.length; i++)
                  for (let j = i + 1; j < guards.length; j++)
                    if (Math.abs(guards[i].x - guards[j].x) < 12 && Math.abs(guards[i].y - guards[j].y) < 18)
                      faults.push(`${label}: #${guards[i].id} and #${guards[j].id} on top of each other`)
              }
            }
            hold(STICKS.R, 30, false)
            hold(before, 60, false)
            hold(from, 90, true)
            hold(to, 90, true)
          }
      expect(frames).toBe(2 * 81 * 180)
      expect(faults.slice(0, 10)).toEqual([])
    }, 30_000)
})

/** A family member (FAMILY_SCALE 0.75 of a player's figure) on a family slot. */
const familyBox = (x: number, y: number): OverheadBox => ({ left: x - 11, top: y - 28, right: x + 11, bottom: y + 21 })
/** A child's body as drawn (food-layout.ts playerBox). */
const childBox: OverheadBox = { left: -14, top: OVERHEAD.feet - 58, right: 14, bottom: OVERHEAD.feet + 6 }

/** The share of 過保護親's figure at `at` (offset from her child) the child's body hides. */
function hiddenByChild(at: { x: number; y: number }) {
  const body = boxAbout(at.x, at.y, GUARDIAN_BODY)
  const hidden =
    Math.max(0, Math.min(body.right, childBox.right) - Math.max(body.left, childBox.left)) *
    Math.max(0, Math.min(body.bottom, childBox.bottom) - Math.max(body.top, childBox.top))
  return hidden / ((body.right - body.left) * (body.bottom - body.top))
}

describe('a standing child’s parents stand clear of 生き物観察’s creatures', () => {
  for (const level of [4, 5, 6, 7, 8])
    test(`Lv${level}, with and without the gamble’s copies of her or of the creature, child and adult, single and married`, () => {
      const faults: string[] = []
      let checked = 0
      for (const copy of ['none', 'guard', 'observe'] as const)
        for (const age of [9, 30])
          for (const facing of [1, -1])
            for (const married of age < 20 ? [false] : [false, true]) {
              const { game, player } = setup(level, copy, [{ id: 'w_observe', lv: 5, cd: 0, held: 0, damage: 0 }], age)
              player.married = married
              player.hasChild = married
              game.setInput(player.id, { x: facing, y: 0 })
              for (let f = 0; f < 40; f++) frame(game, player)
              game.setInput(player.id, STICKS.still)
              const appeared = new Map<Shot, number>()
              let seen = 0
              for (let f = 0; f < 480; f++) {
                frame(game, player)
                const creatures = game.state.shots.filter((shot) => shot.weapon === 'w_observe')
                for (const creature of creatures) if (!appeared.has(creature)) appeared.set(creature, game.state.time)
                const label = `${copy} age ${age} facing ${facing}${married ? ' married' : ''} frame ${f}`
                const guards = guardsOf(game, player)
                for (const creature of creatures) {
                  if (game.state.time - appeared.get(creature)! < 0.5) continue
                  seen++
                  for (const guard of guards) {
                    checked++
                    const body = boxAbout(guard.x, guard.y, GUARDIAN_BODY)
                    if (boxesOverlap(body, boxAbout(creature.x, creature.y, CREATURE_BODY)))
                      faults.push(
                        `${label}: #${guard.id} at (${(guard.x - player.x).toFixed(0)}, ${(guard.y - player.y).toFixed(0)}) on the creature at (${(creature.x - player.x).toFixed(0)}, ${(creature.y - player.y).toFixed(0)})`
                      )
                  }
                }
                if (f < 120) continue
                // Standing beside the child in view (as companion-overhead.test.ts asks), clear of the family.
                const back = player.fx < 0 ? 1 : -1
                const slots = married ? FAMILY_SLOTS.slice(0, 2) : []
                for (const guard of guards) {
                  const at = offset(guard, player)
                  if (hiddenByChild(at) >= 0.3) faults.push(`${label}: #${guard.id} hidden by the child`)
                  for (const slot of slots)
                    if (boxesOverlap(boxAbout(at.x, at.y, GUARDIAN_BODY), familyBox(back * slot.dx, slot.dy)))
                      faults.push(`${label}: #${guard.id} on the family`)
                }
              }
              if (!seen) faults.push(`${copy} age ${age} facing ${facing}${married ? ' married' : ''}: no creature`)
            }
      expect(checked).toBeGreaterThan(0)
      expect(faults.slice(0, 10)).toEqual([])
    }, 30_000)
})

test('the shield art is where GUARDIAN_SHIELD_ART says', () => {
  let left = Infinity
  let right = -Infinity
  let top = Infinity
  let bottom = -Infinity
  for (const art of sheet('weapon:p_over').guard.frames)
    for (let y = 0; y < art.h; y++)
      for (let x = 0; x < art.w; x++)
        if (art.get(x, y)) {
          left = Math.min(left, x - art.w / 2)
          right = Math.max(right, x + 1 - art.w / 2)
          top = Math.min(top, y - art.h / 2)
          bottom = Math.max(bottom, y + 1 - art.h / 2)
        }
  expect({ near: left, far: right, top, bottom }).toEqual(GUARDIAN_SHIELD_ART)
})

describe('standing, no parent stands inside another’s shield', () => {
  for (const level of [5, 6, 7, 8])
    for (const copy of ['none', 'guard'] as const)
      test(`Lv${level}${copy === 'guard' ? ' with the gamble’s copies' : ''}`, () => {
        const { game, player } = setup(level, copy)
        for (const facing of [0, 180, -90, 90, -45, 135]) {
          const radians = (facing * Math.PI) / 180
          game.setInput(player.id, { x: Math.cos(radians), y: Math.sin(radians) })
          for (let f = 0; f < 45; f++) frame(game, player)
          game.setInput(player.id, STICKS.still)
          for (let f = 0; f < 90; f++) frame(game, player)
          const guards = guardsOf(game, player)
          expect(guards.length).toBeGreaterThan(1)
          for (const guard of guards) {
            // The shield faces the way she does (the child's way while nothing is near), scaled by r/20.
            const scale = guard.r / 20
            const side = Math.cos(guard.angle) < 0 ? -1 : 1
            const xs = [side * GUARDIAN_SHIELD_ART.near * scale, side * GUARDIAN_SHIELD_ART.far * scale]
            const shield = {
              left: guard.x + Math.min(...xs),
              right: guard.x + Math.max(...xs),
              top: guard.y + GUARDIAN_SHIELD_ART.top * scale,
              bottom: guard.y + GUARDIAN_SHIELD_ART.bottom * scale
            }
            for (const other of guards)
              if (other !== guard)
                expect(
                  other.x > shield.left && other.x < shield.right && other.y > shield.top && other.y < shield.bottom,
                  `facing ${facing}°: #${other.id} at (${(other.x - player.x).toFixed(1)}, ${(other.y - player.y).toFixed(1)}) in #${guard.id}'s shield`
                ).toBe(false)
          }
        }
      })
})

/** Walking and standing in turn, turning and stopping short, as a player does (direction, seconds). */
const SCRIPT: [keyof typeof STICKS, number][] = [
  ['R', 1],
  ['still', 5],
  ['L', 0.6],
  ['still', 5],
  ['U', 0.8],
  ['still', 4],
  ['D', 0.5],
  ['still', 4],
  ['UL', 0.7],
  ['still', 3],
  ['R', 0.25],
  ['L', 0.25],
  ['R', 0.25],
  ['still', 0.3],
  ['DR', 0.4],
  ['still', 5],
  ['L', 0.15],
  ['still', 0.15],
  ['U', 0.15],
  ['still', 4]
]

describe('過保護親 never cross what is drawn over the child’s head nor her family, and stand near her', () => {
  for (const level of [1, 4, 8])
    for (const gamble of [0, 8])
      test(`Lv${level}${gamble ? ' with the gamble’s copies coming and going' : ''}: plain, watching a creature, married`, () => {
        const faults: string[] = []
        let frames = 0
        for (const mod of ['plain', 'observe', 'married'] as const) {
          const { game, player } = setup(level, 'none', [
            ...(gamble
              ? [{ id: 'w_gamble', lv: gamble, cd: 0, held: 0, damage: 0, gambleWeapon: 'p_over', gambleUntil: 1e9 }]
              : []),
            ...(mod === 'observe' ? [{ id: 'w_observe', lv: 3, cd: 0, held: 0, damage: 0 }] : [])
          ])
          player.married = player.hasChild = mod === 'married'
          const name = boxAbout(0, OVERHEAD.feet - OVERHEAD.nameLift, OVERHEAD.nameHalf)
          let stood = 0
          let t = 0
          for (const [way, seconds] of SCRIPT) {
            game.setInput(player.id, STICKS[way])
            for (let f = 0; f < Math.round(seconds * 60); f++) {
              game.tick(DT)
              player.hp = player.maxHp
              frames++
              t += DT
              stood = way === 'still' ? stood + DT : 0
              const label = `${mod} t${t.toFixed(2)} ${way}`
              const back = player.fx < 0 ? 1 : -1
              for (const guard of guardsOf(game, player)) {
                const at = offset(guard, player)
                const body = boxAbout(at.x, at.y, GUARDIAN_BODY)
                if (boxesOverlap(body, name))
                  faults.push(`${label}: #${guard.id} on the name tag at (${at.x.toFixed(0)}, ${at.y.toFixed(0)})`)
                if (stood < 1) continue
                if (player.married)
                  for (const slot of FAMILY_SLOTS)
                    if (boxesOverlap(body, familyBox(back * slot.dx, slot.dy)))
                      faults.push(`${label}: #${guard.id} on the family at (${at.x.toFixed(0)}, ${at.y.toFixed(0)})`)
                // Near the child: her own parents within about 60 px, every one in a phone's view (±150 px).
                const reach = guard.sourceWeapon === 'p_over' ? 62 : 150
                if (stood > 2 && Math.hypot(at.x, at.y) > reach)
                  faults.push(`${label}: #${guard.id} far off at (${at.x.toFixed(0)}, ${at.y.toFixed(0)})`)
              }
            }
          }
        }
        expect(frames).toBeGreaterThan(0)
        expect(faults.slice(0, 10)).toEqual([])
      }, 30_000)
})

/** 過保護親's figure and shield as the renderer draws them, facing `guardianFace` (offsets from her child). */
function drawn(guard: Shot, player: Player) {
  const { x, y } = offset(guard, player)
  const flip = Math.cos(guard.guardianFace ?? guard.angle) < 0
  const scale = guard.r / 20
  const body: OverheadBox = flip
    ? { left: x - 6, top: y - 16, right: x + 14, bottom: y + 15 }
    : { left: x - 14, top: y - 16, right: x + 6, bottom: y + 15 }
  const near = GUARDIAN_SHIELD_ART.near * scale
  const far = GUARDIAN_SHIELD_ART.far * scale
  const shield: OverheadBox = {
    left: flip ? x - far : x + near,
    top: y + GUARDIAN_SHIELD_ART.top * scale,
    right: flip ? x - near : x + far,
    bottom: y + GUARDIAN_SHIELD_ART.bottom * scale
  }
  return { body, shield }
}
/** Frames after a married child turns that a parent standing where her family comes may take to step off them. */
const FAMILY_TURN_GRACE = 20
/** Frames (at 60 fps) 過保護親 keeps to the side she faces before she turns to the other (GUARDIAN_FACE_HOLD). */
const FACE_HOLD = 15
/** How far (px) clear of them 過保護親 would hold her shield as she goes by (GUARDIAN_FACE_PAD). */
const FACE_PAD = 6
/** The family walking behind a married child, where the game keeps them (FAMILY_SLOTS, offsets from her). */
const familyBoxes = (player: Player) => {
  if (!player.married) return []
  const back = player.fx < 0 ? 1 : -1
  return FAMILY_SLOTS.slice(0, player.hasChild ? 2 : 1).map((slot) => familyBox(back * slot.dx, slot.dy))
}
const area = (a: OverheadBox, b: OverheadBox) =>
  Math.max(0, Math.min(a.right, b.right) - Math.max(a.left, b.left)) *
  Math.max(0, Math.min(a.bottom, b.bottom) - Math.max(a.top, b.top))

describe('standing, 過保護親 face out with their shields off the child and each other; moving, they walk the way they go', () => {
  const configs = [
    { level: 1 },
    { level: 4 },
    { level: 8 },
    { level: 4, gamble: 5 },
    { level: 8, gamble: 8 },
    { level: 8, gamble: 8, married: true },
    { level: 8, neighbour: 70 }
  ]
  for (const { level, gamble, married, neighbour } of configs)
    test(`Lv${level}${gamble ? ` with the gamble Lv${gamble}’s copies` : ''}${married ? ', married' : ''}${neighbour ? `, another player ${neighbour} px off` : ''}`, () => {
      const { game, player } = setup(
        level,
        'none',
        gamble
          ? [{ id: 'w_gamble', lv: gamble, cd: 0, held: 0, damage: 0, gambleWeapon: 'p_over', gambleUntil: 1e9 }]
          : []
      )
      player.married = player.hasChild = Boolean(married)
      if (neighbour) {
        const other = game.addPlayer('b', 'p_free')!
        other.pending = 0
        other.choices = []
        other.weapons = []
        other.x = player.x + neighbour
        other.y = player.y
      }
      const child: OverheadBox = { left: -11, top: -30, right: 11, bottom: 16 }
      const faults: string[] = []
      let standing = 0
      let walking = 0
      let last = new Map<Shot, { x: number; y: number }>()
      let turned = Infinity
      // Each parent's offsets and drawn side frame by frame, and the frames she walked against the way she faces.
      const tracks = new Map<Shot, { at: { x: number; y: number }; left: boolean }[]>()
      const backwards: { label: string; guard: Shot; frame: number; way: number; settling: boolean }[] = []
      let count = 0
      // Walk, stop, turn on the spot (a three-frame tap), walk up and down.
      const plan: [keyof typeof STICKS, number][] = [
        ['L', 60],
        ['still', 150],
        ['R', 3],
        ['still', 180],
        ['U', 90],
        ['D', 90],
        ['still', 180],
        ['DR', 50],
        ['still', 180]
      ]
      for (const [way, frames] of plan) {
        game.setInput(player.id, STICKS[way])
        for (let f = 0; f < frames; f++) {
          const before = { x: player.x, y: player.y }
          const facing = Math.sign(player.fx)
          frame(game, player)
          turned = Math.sign(player.fx) === facing ? turned + 1 : 0
          for (const other of game.state.players) if (other !== player) game.setInput(other.id, STICKS.still)
          const guards = guardsOf(game, player)
          const figures = new Map(guards.map((guard) => [guard, drawn(guard, player)]))
          for (const guard of guards) {
            const at = offset(guard, player)
            const track = tracks.get(guard) ?? []
            track[count] = { at, left: Math.cos(guard.guardianFace ?? guard.angle) < 0 }
            tracks.set(guard, track)
            const label = `${way} frame ${f} #${guard.id} (${at.x.toFixed(0)}, ${at.y.toFixed(0)})`
            const was = last.get(guard)
            if (was) {
              const step = Math.hypot(at.x - was.x, at.y - was.y)
              if (step > GUARDIAN_SPEED * DT + 1e-6 && step > 12) faults.push(`${label}: moved ${step.toFixed(1)} px`)
              const gx = at.x + player.x - (was.x + before.x)
              const gy = at.y + player.y - (was.y + before.y)
              const ground = Math.hypot(gx, gy) / DT
              if (ground > 60 && guard.aux <= 0) {
                walking++
                if (!guard.guardianWalking) faults.push(`${label}: moving ${ground.toFixed(0)} px/s, not walking`)
                const face = guard.guardianFace ?? guard.angle
                // (Standing by the child as she takes a step or two, she faces out: carried along, not walking.)
                if (
                  (guard.guardianStill ?? 0) < 0.5 &&
                  gx * Math.cos(face) + gy * Math.sin(face) < -0.3 * Math.hypot(gx, gy)
                )
                  backwards.push({
                    label,
                    guard,
                    frame: count,
                    way: Math.atan2(gy, gx),
                    settling: player.still > 0 && guard.guardianRest !== undefined && guard.guardianRest.x * at.x > 0
                  })
              }
            }
            // At all times, her figure and shield as drawn keep off the child, what is over her head and her family.
            {
              const { body, shield } = figures.get(guard)!
              // (As the child turns, her family comes round to her other side, where a parent may stand: she steps off
              // them, GUARDIAN_DODGE px a step, within FAMILY_TURN_GRACE frames.)
              const family = turned > FAMILY_TURN_GRACE ? familyBoxes(player) : []
              for (const box of [child, ...overheadBoxes(1, OVERHEAD.rows, Boolean(gamble)), ...family])
                for (const part of [body, shield])
                  if (
                    Math.min(part.right, box.right) - Math.max(part.left, box.left) >= 4 &&
                    Math.min(part.bottom, box.bottom) - Math.max(part.top, box.top) >= 4
                  )
                    faults.push(`${label}: ${part === body ? 'figure' : 'shield'} over the child, her head or family`)
            }
            if (player.still < 1 || guard.guardianStill !== 1 || guard.guardianWalking) continue
            standing++
            const { body, shield } = figures.get(guard)!
            if (area(shield, child) > 16) faults.push(`${label}: shield on the child`)
            let hidden = 0
            for (const [other, figure] of figures) if (other !== guard) hidden += area(body, figure.shield)
            if (hidden > 0.3 * area(body, body))
              faults.push(`${label}: ${((100 * hidden) / area(body, body)).toFixed(0)}% under shields`)
          }
          last = new Map(guards.map((guard) => [guard, offset(guard, player)]))
          count++
        }
      }
      // Walking against the way she faces only: as the child comes to stand, on her way to her place on the side she
      // is on (facing out to it); within GUARDIAN_FACE_HOLD of turning (she does not turn back and forth); or where her
      // shield, held the way she goes, would come within FACE_PAD of the child as drawn, what is over her head or her
      // family, now or on her way over the next GUARDIAN_FACE_HOLD (she holds it the other way as she goes by them).
      for (const { label, guard, frame, way, settling } of backwards) {
        const track = tracks.get(guard)!
        const turned = track
          .slice(Math.max(0, frame - FACE_HOLD), frame + 1)
          .some((t, i, all) => i && t && all[i - 1] && t.left !== all[i - 1].left)
        const over = track.slice(frame, frame + FACE_HOLD + 1).some((t) => {
          if (!t) return false
          const ahead = drawn(
            { ...guard, guardianFace: way, x: player.x + t.at.x, y: player.y + t.at.y } as Shot,
            player
          ).shield
          return [childDrawnBox(1), ...overheadBoxes(1, OVERHEAD.rows, true), ...familyBoxes(player)].some(
            (box, i) =>
              Math.min(ahead.right, box.right + FACE_PAD) - Math.max(ahead.left, box.left - FACE_PAD) >= (i ? 4 : 1) &&
              Math.min(ahead.bottom, box.bottom + FACE_PAD) - Math.max(ahead.top, box.top - FACE_PAD) >= (i ? 4 : 1)
          )
        })
        if (!settling && !turned && !over) faults.push(`${label}: walking backwards`)
      }
      expect(standing).toBeGreaterThan(0)
      expect(walking).toBeGreaterThan(0)
      expect(faults.slice(0, 10)).toEqual([])
    }, 30_000)
})
