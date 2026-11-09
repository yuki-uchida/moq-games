/**
 * End-to-end scripted run of stage 2 (rat) with one human and four heroes: mouse holes, currents, crates, the valve
 * split puzzle with せーの, the guard-room arena, the cheese, mousetraps, the big crate, the stampede through the
 * barricades and the cat witch, until the phase is 'clear'.
 */
import { expect, test } from 'vitest'
import { FX_SPEC, TECH_SPEC } from '../src/art/contract'
import { SFX } from '../src/audio/api'
import { createWorld } from '../src/sim/api'
import { escapeTelegraph } from '../src/sim/companion'
import type { WorldImpl } from '../src/sim/world'
import { TILE } from '../src/vocab'
import { T, Pad, part } from './sim-helpers'
import { Script } from './sim-script'

test('stage 2 end to end: every puzzle and the boss to the results screen', () => {
  const world = createWorld({
    seed: 11,
    progress: { cleared: ['meadow'] },
    stage: 'sewer',
    skipIntro: true
  }) as WorldImpl
  world.setPlayers([{ id: 'host', name: 'host' }])
  const W = world.W
  const pad = new Pad(world)
  const s = new Script(world, W, pad)
  expect(W.species).toBe('rat')
  expect(world.view().objective).toContain('ネズミ穴')

  /** Dash (Space) toward a hole tile from the tile next to it. */
  const dashInto = (holeX: number, holeY: number, from: [number, number]) => {
    s.go(T(from[0]), T(from[1]), { tol: 5 })
    const dx = Math.sign(holeX - from[0])
    const dy = Math.sign(holeY - from[1])
    s.wait(0.15, () => pad.move(dx, dy))
    pad.jump()
    s.wait(0.35, () => pad.move(dx, dy))
    pad.move(0, 0)
  }

  // A: the smith, then the mouse hole through the wall.
  s.go(T(7), T(56))
  pad.interact()
  s.wait(0.1)
  expect(world.view().dialogs[0]?.speaker).toBe('ネズミの鍛冶屋')
  dashInto(20, 57, [19, 57])
  if (Math.floor(s.me.body.x / TILE) < 23) s.fail('through the hole')
  s.until(
    () => W.heroes.every((h) => h.body.x > T(22)),
    12,
    'companions through the hole',
    () => pad.move(0, 0)
  )
  s.note('hole')

  // B: the crate into the sludge (chest nook), then across the current in formation.
  s.go(T(36), T(59))
  s.regroup(8)
  const crate = part(W, 'crateB')
  s.go(T(61) + 15, T(60), { tol: 4 })
  s.until(
    () => crate.gone,
    8,
    'crate sinks',
    () => pad.move(1, 0)
  )
  s.go(T(68), T(61), { time: 10 })
  pad.interact()
  s.until(() => part(W, 'chestB').state === 'open', 1, 'chest B')
  s.go(T(60), T(59))
  s.regroup(8)
  s.go(T(60), T(53))
  s.regroup(8)
  expect(W.heroes.every((h) => h.state !== 'fall')).toBe(true)
  s.note('current crossed')

  // C: two valves in two hole rooms within 1.5 s (Q, Tab, せーの).
  s.go(T(62), T(49))
  s.regroup(8)
  pad.mode() // stay
  dashInto(64, 46, [63, 46])
  s.go(T(68), T(46), { tol: 6 })
  pad.move(0, 0).aim(0)
  s.wait(0.2)
  pad.tab()
  s.wait(0.1)
  dashInto(64, 49, [63, 49])
  s.go(T(68), T(50), { tol: 6 })
  pad.move(0, 0).aim(0)
  s.wait(0.2)
  pad.signal()
  s.wait(0.05)
  const sig = W.signal!
  s.until(() => W.t >= sig.at + 3, 4, 'GO')
  pad.interact()
  s.until(() => W.flags.has('valves:C'), 2, 'valves')
  s.until(() => part(W, 'sluiceC').state === 'open', 2, 'sluice')
  expect(world.view().currentsOff).toContain('C')
  pad.mode() // follow
  dashInto(65, 49, [66, 49])
  s.go(T(60), T(48))
  s.until(
    () => W.heroes.every((h) => h.body.x < T(64)),
    15,
    'party back in the hall',
    () => pad.move(0, 0)
  )
  s.note('valves')

  // D: the guard room arena.
  s.go(T(50), T(41))
  s.regroup(10)
  s.go(T(44), T(44))
  expect(W.arenas.get('D')?.state).toBe('active')
  s.until(
    () => W.arenas.get('D')?.state === 'cleared',
    120,
    'arena D',
    () => {
      const foe = s.nearestFoe(4000, 'D')
      if (foe) s.fightTick(foe)
    }
  )
  expect(W.checkpoint).toBe('D')
  s.note('arena')

  // E: the cheese across the canal onto the scale.
  s.go(T(30), T(38))
  s.clearEnemies('E', 60)
  const cheese = part(W, 'cheese')
  const scale = part(W, 'scaleE')
  s.go(cheese.x + 60, cheese.y)
  s.regroup()
  pad.state.aim = Math.PI
  pad.move(0, 0).interact()
  s.until(
    () => cheese.state === 'lifted',
    6,
    'cheese lifted',
    () => pad.move(0, 0)
  )
  s.until(
    () => scale.on,
    30,
    'cheese on the scale',
    () => {
      if (cheese.state !== 'lifted' && !scale.on) {
        if (s.me.hold === undefined && W.seq % 30 === 0) {
          if (Math.hypot(cheese.x - s.me.body.x, cheese.y - s.me.body.y) < 90) pad.interact()
          else pad.move(Math.sign(cheese.x - s.me.body.x), Math.sign(cheese.y - s.me.body.y))
        }
        return
      }
      const dx = scale.x - cheese.x
      const dy = scale.y - cheese.y
      const d = Math.hypot(dx, dy) || 1
      pad.move(dx / d, dy / d)
    }
  )
  s.until(() => part(W, 'granary').state === 'open', 2, 'granary door')
  s.note('cheese')

  // F: throw a barrel onto a mousetrap, then push the big crate up with all four.
  s.go(T(38), T(32))
  s.regroup(12)
  s.go(T(41), T(32))
  s.clearEnemies('F', 60)
  const barrel = W.props.find((p) => p.kind === 'barrel' && p.state === 'idle' && Math.floor(p.y / TILE) === 37)!
  s.go(barrel.x, barrel.y - 56, { tol: 6 })
  pad.state.aim = Math.PI / 2
  pad.move(0, 0)
  s.wait(0.05)
  W.heroes.find((h) => h === s.me)!.body.facing = Math.PI / 2
  pad.interact()
  s.until(() => s.me.hold === barrel.id, 1, 'barrel lifted')
  const trap = W.props.find((p) => p.kind === 'mousetrap' && Math.floor(p.x / TILE) === 46)!
  s.go(trap.x, trap.y + 3 * 64 + 10, { tol: 6, fight: false })
  pad.aim(-Math.PI / 2).tap()
  s.until(() => trap.state === 'snap', 2, 'trap sprung by the barrel')
  const big = part(W, 'bigcrateF')
  s.go(big.x, T(31))
  s.regroup(12)
  s.go(big.x, 30 * TILE + 18, { tol: 4 })
  s.until(
    () => big.y <= (25 + 26 + 1) * 32 && big.state === 'idle',
    20,
    'big crate pushed',
    () => pad.move(0, -1)
  )
  s.note('granary')

  // G: stampede through the hidden nook's barricade (chest) and the main barricade.
  s.go(T(56), T(27))
  s.regroup(12)
  s.clearEnemies('G', 60)
  expect(W.checkpoint).toBe('G')
  const stampede = (x: number, y: number, tx: number, ty: number, what: string) => {
    s.go(x, y, { tol: 8 })
    s.regroup(12)
    s.press(tx, ty)
    s.note(what)
  }
  const nook = part(W, 'nookG')
  stampede(nook.x, T(25), nook.x, T(17), 'nook stampede')
  s.until(() => nook.gone, 2, 'nook barricade')
  s.go(T(69), T(19), { time: 10 })
  pad.interact()
  s.until(() => part(W, 'chestG').state === 'open', 1, 'chest G')
  const bar = part(W, 'barricadeG')
  stampede(bar.x, T(25), bar.x, T(16), 'barricade stampede')
  s.until(() => bar.gone, 2, 'main barricade')
  s.until(() => part(W, 'bossdoor').state === 'open', 2, 'boss door')

  // H: the cat witch. Stampede into the cat; hit the witch while she is down.
  s.go(T(42), T(16), { fight: false })
  s.regroup(15)
  s.go(T(41), T(13), { fight: false })
  const boss = W.boss!
  const cat = W.pet!
  expect(boss.active).toBe(true)
  const fightStart = W.t
  s.until(
    () => boss.dead,
    240,
    'boss defeated',
    () => {
      const m = s.me.body
      const inForm = s.me.form >= 0 && W.formations[s.me.form].slots.length >= 3
      const esc = escapeTelegraph(W, m.x, m.y)
      if (esc && !s.me.charging && !W.techs.length) {
        pad.move(esc[0], esc[1])
        return
      }
      if (s.me.charging) {
        const a = Math.atan2(cat.y - m.y, cat.x - m.x)
        pad.state.aim = a
        pad.state.aimDist = Math.hypot(cat.x - m.x, cat.y - m.y)
        pad.move(0, 0)
        if (s.me.chargeFull) pad.release()
        return
      }
      if (W.techs.length) return
      if (boss.broken > W.t) {
        const a = Math.atan2(boss.y - m.y, boss.x - m.x)
        const d = Math.hypot(boss.x - m.x, boss.y - m.y)
        pad.state.aim = a
        if (d > 60) pad.move(Math.cos(a), Math.sin(a))
        else pad.move(0, 0)
        if (W.seq % 10 === 0) pad.tap()
        return
      }
      // Keep 3–5 tiles from the cat and press when it can be stunned.
      const a = Math.atan2(cat.y - m.y, cat.x - m.x)
      const d = Math.hypot(cat.x - m.x, cat.y - m.y)
      pad.state.aim = a
      if (d < 200) pad.move(-Math.cos(a), -Math.sin(a))
      else if (d > 320) pad.move(Math.cos(a), Math.sin(a))
      else pad.move(0, 0)
      const foe = s.nearestFoe(150, undefined, true)
      if (foe && W.seq % 12 === 0) {
        pad.state.aim = Math.atan2(foe.y - m.y, foe.x - m.x)
        pad.tap()
        return
      }
      if (s.me.chargeLock <= W.t && inForm && cat.wary <= W.t + 1 && !pad.state.attackHeld) pad.attack()
    }
  )
  const fight = W.t - fightStart
  s.note(`boss defeated in ${fight.toFixed(1)} s, ${boss.breaks} breaks`)
  pad.state.attackHeld = false
  pad.send()
  if (fight < 60 || fight > 100 || boss.breaks < 2) s.fail(`boss fight ${fight.toFixed(1)} s, ${boss.breaks} breaks`)
  expect(boss.breaks).toBeGreaterThanOrEqual(2)

  // The orb.
  s.until(() => W.pickups.some((p) => p.kind === 'orb'), 3, 'orb appears')
  const orb = W.pickups.find((p) => p.kind === 'orb')!
  s.until(
    () => W.phase === 'clear',
    20,
    'clear',
    () => s.pathStep(orb.x, orb.y)
  )
  const v = world.view()
  expect(v.results?.stage).toBe('sewer')
  expect(world.progress().cleared).toEqual(['meadow', 'sewer'])
  console.log(s.log.join('\n'), `\nresults ${JSON.stringify(v.results)}`)
  // Every effect and sound exists in the art and audio contracts (technique effects live in tech:rat).
  for (const name of s.seen.get('fx') ?? []) expect(FX_SPEC[name] ?? TECH_SPEC.rat[name], `fx ${name}`).toBeDefined()

  for (const name of s.seen.get('sfx') ?? [])
    expect((SFX as readonly string[]).includes(name), `sfx ${name}`).toBe(true)
  // The solve banners name this stage's own items and places.
  expect(s.solves).toContain('チーズを天秤にのせた！')
  expect(s.solves).toContain('木箱が汚水に沈んで足場になった！')
  for (const msg of s.solves) expect(msg).not.toContain('どんぐり')
  for (const msg of s.solves) expect(msg).not.toContain('岩')
  expect(s.solves).toContain('番兵の詰所を制圧した！')
  for (const msg of s.solves) expect(msg).not.toContain('広場')
})
