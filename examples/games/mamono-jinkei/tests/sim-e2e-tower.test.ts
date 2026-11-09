/**
 * End-to-end scripted run of stage 3 (crow) with one human and four heroes: flights over the sea of clouds,
 * vents and wind, the windmill and drawbridges (tornado), the lookout arena, the four bells with Q/Tab/せーの,
 * the gold bell on its hook, keys and lock doors, and the dragoon on the roof, until the phase is 'clear'.
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

test('stage 3 end to end: every puzzle and the boss to the results screen', () => {
  const world = createWorld({
    seed: 13,
    progress: { cleared: ['meadow', 'sewer'] },
    stage: 'tower',
    skipIntro: true
  }) as WorldImpl
  world.setPlayers([{ id: 'host', name: 'host' }])
  const W = world.W
  const pad = new Pad(world)
  const s = new Script(world, W, pad)
  expect(W.species).toBe('crow')

  /** Hold Space and fly straight to (x, y); land there. */
  const flyTo = (x: number, y: number, what: string) => {
    pad.state.actionHeld = true
    s.until(
      () => Math.hypot(s.me.body.x - x, s.me.body.y - y) < 14,
      6,
      what,
      () => {
        const m = s.me.body
        const d = Math.hypot(x - m.x, y - m.y) || 1
        pad.move((x - m.x) / d, (y - m.y) / d)
      }
    )
    pad.state.actionHeld = false
    pad.move(0, 0)
    s.until(() => s.me.body.z === 0, 1, `${what}: landing`)
    if (s.me.state === 'fall') s.fail(`${what}: fell`)
  }
  const waitParty = (cond: (x: number, y: number) => boolean, what: string, t = 12) =>
    s.until(
      () => W.heroes.every((h) => h.state !== 'fall' && h.body.z === 0 && cond(h.body.x, h.body.y)),
      t,
      what,
      () => pad.move(0, 0)
    )

  // A: the seer, then fly the first gaps.
  s.go(T(7), T(57))
  pad.interact()
  s.wait(0.1)
  expect(world.view().dialogs[0]?.speaker).toBe('カラスの占い師')
  s.go(T(24), T(57), { tol: 6 })
  flyTo(T(29), T(57), 'gap A→B1')
  waitParty((x) => x > 28 * TILE, 'party on B1')
  s.go(T(33), T(57), { tol: 6 })
  flyTo(T(38), T(57), 'gap B1→B2')
  waitParty((x) => x > 37 * TILE, 'party on B2')
  s.note('first gaps')

  // B: the vent chain through the wind.
  s.go(T(41), T(56), { tol: 6 })
  flyTo(T(51), T(56), 'vent chain')
  waitParty((x) => x > 50 * TILE, 'party on B3', 15)
  s.note('vents')
  s.clearEnemies('B', 30)

  // C: the tornado spins the windmill; the drawbridges come down.
  s.go(T(53), T(47))
  s.go(T(60) + 32, T(43))
  s.regroup(12)
  const mill = part(W, 'windmillC')
  s.press(mill.x, mill.y)
  expect(mill.state).toBe('spin')
  s.until(() => W.props.filter((p) => p.kind === 'drawbridge').every((p) => p.state === 'down'), 2, 'drawbridges down')
  s.clearEnemies('C', 40)
  s.note('windmill')

  // D: the lookout arena.
  s.go(T(44), T(43))
  s.regroup(10)
  s.go(T(34), T(43))
  expect(W.arenas.get('D')?.state).toBe('active')
  s.until(
    () => W.arenas.get('D')?.state === 'cleared',
    120,
    'arena D',
    () => {
      const esc = escapeTelegraph(W, s.me.body.x, s.me.body.y)
      if (esc) return void pad.move(esc[0], esc[1])
      const foe = s.nearestFoe(4000, 'D')
      if (foe) s.fightTick(foe)
    }
  )
  s.note('arena')

  // E: four bells on four islands, one hero each, せーの.
  s.go(T(25), T(35))
  s.clearEnemies('E', 60)
  s.go(T(27), T(31))
  s.regroup(10)
  pad.mode() // stay
  const islands: { from: [number, number]; to: [number, number]; aim: number }[] = [
    { from: [34, 31], to: [34, 27], aim: 0 },
    { from: [34, 31], to: [34, 35], aim: 0 },
    { from: [18, 28], to: [14, 27], aim: Math.PI },
    { from: [18, 35], to: [14, 35], aim: Math.PI }
  ]
  islands.forEach(({ from, to, aim }, i) => {
    if (i > 0) {
      pad.tab()
      s.wait(0.1)
    }
    s.go(T(from[0]), T(from[1]), { tol: 6, fight: false })
    flyTo(T(to[0]), T(to[1]), `bell island ${i}`)
    pad.aim(aim)
    s.wait(0.2)
  })
  pad.signal()
  s.wait(0.05)
  const sig = W.signal!
  s.until(() => W.t >= sig.at + 3, 4, 'GO')
  pad.tap()
  s.until(() => W.flags.has('bells:E'), 1, 'bells')
  s.until(() => part(W, 'gateF').state === 'open', 2, 'gate to F')
  pad.mode() // follow
  flyTo(T(18), T(35), 'back from the island')
  waitParty((x, y) => x > T(17) && x < T(31) && y > T(27), 'party back on E', 20)
  s.note('bells')

  // F: the gold bell across the drawbridge onto its hook.
  const gold = part(W, 'goldbell')
  const hook = part(W, 'hookF')
  s.go(gold.x - 60, gold.y)
  s.regroup(12)
  pad.state.aim = 0
  pad.move(0, 0).interact()
  s.until(
    () => gold.state === 'lifted',
    6,
    'gold bell lifted',
    () => pad.move(0, 0)
  )
  s.until(
    () => hook.on,
    30,
    'gold bell on the hook',
    () => {
      if (gold.state !== 'lifted' && !hook.on) {
        if (s.me.hold === undefined && W.seq % 30 === 0) {
          if (Math.hypot(gold.x - s.me.body.x, gold.y - s.me.body.y) < 90) pad.interact()
          else pad.move(Math.sign(gold.x - s.me.body.x), Math.sign(gold.y - s.me.body.y))
        }
        return
      }
      // Along the bridge row first, then up to the hook.
      const tx = gold.x < T(54) ? T(56) : hook.x
      const ty = gold.x < T(54) ? T(31) : hook.y
      const dx = tx - gold.x
      const dy = ty - gold.y
      const d = Math.hypot(dx, dy) || 1
      pad.move(dx / d, dy / d)
    }
  )
  s.until(() => part(W, 'towerdoor').state === 'open', 2, 'tower door')
  s.note('gold bell')

  // G: keys and lock doors up to the stairs.
  s.go(T(63), T(23))
  s.regroup(10)
  expect(W.checkpoint).toBe('G')
  s.go(T(64), T(17))
  s.until(
    () => W.party.keys >= 1,
    3,
    'first key',
    () => s.pathStep(T(64), T(17))
  )
  s.go(T(61), T(20), { tol: 6 })
  s.until(
    () => W.props.filter((p) => p.kind === 'lockdoor' && p.state === 'open').length >= 1,
    3,
    'lock 1',
    () => pad.move(-1, 0)
  )
  s.go(T(57), T(22))
  s.until(
    () => W.party.keys >= 1,
    3,
    'second key',
    () => s.pathStep(T(57), T(22))
  )
  s.go(T(55), T(18), { tol: 6 })
  s.until(
    () => W.props.filter((p) => p.kind === 'lockdoor' && p.state === 'open').length >= 2,
    3,
    'lock 2',
    () => pad.move(-1, 0)
  )
  s.clearEnemies('G', 60)
  s.go(T(49), T(15))
  s.until(() => part(W, 'bossdoor').state === 'open', 3, 'boss door')
  s.note('clocktower')

  // H: the dragoon. Tornado him down, hit him while he is down or landed.
  s.go(T(49), T(12), { fight: false })
  s.regroup(15)
  s.go(T(55), T(8), { fight: false })
  const boss = W.boss!
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
      if (esc && !s.me.charging && !W.techs.length) return void pad.move(esc[0], esc[1])
      const a = Math.atan2(boss.y - m.y, boss.x - m.x)
      const d = Math.hypot(boss.x - m.x, boss.y - m.y)
      pad.state.aim = a
      pad.state.aimDist = d
      if (s.me.charging) {
        pad.move(0, 0)
        if (s.me.chargeFull) pad.release()
        return
      }
      if (W.techs.length) return
      const grounded = boss.act === 'downed' || boss.act === 'ground'
      if (grounded) {
        if (d > 70) pad.move(Math.cos(a), Math.sin(a))
        else pad.move(0, 0)
        if (W.seq % 10 === 0) pad.tap()
        return
      }
      // Stay near the middle of the roof; shoot (companions' arrows and bolts reach him) and press when he is close.
      const cx = T(55)
      const cy = T(7)
      const dc = Math.hypot(cx - m.x, cy - m.y)
      if (dc > 60) pad.move((cx - m.x) / dc, (cy - m.y) / dc)
      else pad.move(0, 0)
      const foe = s.nearestFoe(150, undefined, true)
      if (foe && W.seq % 12 === 0 && !pad.state.attackHeld) {
        pad.state.aim = Math.atan2(foe.y - m.y, foe.x - m.x)
        pad.tap()
        return
      }
      if (W.seq % 15 === 0 && !pad.state.attackHeld && s.me.chargeLock > W.t + 0.5) pad.tap()
      if (s.me.chargeLock <= W.t && inForm && boss.steel <= W.t + 1 && d < 5 * TILE && !pad.state.attackHeld)
        pad.attack()
    }
  )
  const fight = W.t - fightStart
  s.note(`boss defeated in ${fight.toFixed(1)} s, ${boss.breaks} downs`)
  pad.state.attackHeld = false
  pad.send()
  if (fight < 60 || fight > 100 || boss.breaks < 2) s.fail(`boss fight ${fight.toFixed(1)} s, ${boss.breaks} downs`)
  expect(boss.breaks).toBeGreaterThanOrEqual(2)

  s.until(() => W.pickups.some((p) => p.kind === 'orb'), 3, 'orb appears')
  const orb = W.pickups.find((p) => p.kind === 'orb')!
  s.until(
    () => W.phase === 'clear',
    20,
    'clear',
    () => s.pathStep(orb.x, orb.y)
  )
  const v = world.view()
  expect(v.results?.stage).toBe('tower')
  expect(world.progress().cleared).toEqual(['meadow', 'sewer', 'tower'])
  console.log(s.log.join('\n'), `\nresults ${JSON.stringify(v.results)}`)
  for (const name of s.seen.get('fx') ?? []) expect(FX_SPEC[name] ?? TECH_SPEC.crow[name], `fx ${name}`).toBeDefined()

  for (const name of s.seen.get('sfx') ?? [])
    expect((SFX as readonly string[]).includes(name), `sfx ${name}`).toBe(true)
  // The solve banners name this stage's own items and places.
  expect(s.solves).toContain('金の鐘をかけ金にかけた！')
  for (const msg of s.solves) expect(msg).not.toContain('どんぐり')
  for (const msg of s.solves) expect(msg).not.toContain('岩')
})
