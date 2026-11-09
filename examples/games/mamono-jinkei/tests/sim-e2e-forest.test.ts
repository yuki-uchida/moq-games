/**
 * End-to-end scripted run of stage 4 (wolf) — the final stage — with one human and four heroes: howls and
 * moonstones, the ice-block puzzle on the frozen lake, the four dark clearings with Q/Tab/せーの, the hunters' camp,
 * the battering log, the pack technique on the ice wall, the big moonstone's resonance and the hero Leon, then
 * 'next' → the ending.
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

test('stage 4 end to end: every puzzle, the hero Leon, the results and the ending', () => {
  const world = createWorld({
    seed: 17,
    progress: { cleared: ['meadow', 'sewer', 'tower'] },
    stage: 'forest',
    skipIntro: true
  }) as WorldImpl
  world.setPlayers([{ id: 'host', name: 'host' }])
  const W = world.W
  const pad = new Pad(world)
  const s = new Script(world, W, pad)
  expect(W.species).toBe('wolf')
  expect(world.view().objective).toContain('遠吠え')
  const howl = () => {
    s.wait(Math.max(0, s.me.body.howlCd) + 0.05, () => pad.move(0, 0))
    pad.jump()
    s.wait(0.1)
  }

  // A: the bard, then howl at the moonstone to open the gate.
  s.go(T(7), T(57))
  pad.interact()
  s.wait(0.1)
  expect(world.view().dialogs[0]?.speaker).toBe('老狼の吟遊詩人')
  s.go(T(25), T(57))
  howl()
  s.until(() => part(W, 'gateA').state === 'open', 2, 'gate A')
  s.note('moonstone gate')

  // B: along the lit path through the hunters' camp.
  s.go(T(40), T(58))
  s.go(T(66), T(52), { time: 60 })
  s.note('snowy path')

  // C: slide the ice block north, then east into the moat; the lever on the island opens the way west.
  const block = part(W, 'iceC')
  s.go(T(52), T(49))
  s.regroup(10)
  s.go(T(52), 48 * TILE + 17, { tol: 6 })
  s.until(
    () => block.y === T(43) && block.state === 'idle',
    12,
    'block north',
    () => {
      const dx = Math.max(-0.6, Math.min(0.6, (block.x - s.me.body.x) / 30))
      if (block.state === 'idle' && s.me.body.y < block.y + 40) s.pathStep(block.x, block.y + 60)
      else pad.move(dx, -1)
    }
  )
  pad.move(0, 0)
  s.go(T(50), T(43), { tol: 10 })
  s.regroup(10)
  s.go(52 * TILE - 17, T(43), { tol: 6 })
  s.until(
    () => block.gone,
    12,
    'block sinks',
    () => {
      // On ice: keep lined up with the block while pushing.
      const dy = Math.max(-0.6, Math.min(0.6, (block.y - s.me.body.y) / 30))
      if (block.state === 'idle' && s.me.body.x > block.x - 40) s.pathStep(block.x - 60, block.y)
      else pad.move(1, dy)
    }
  )
  s.go(T(59), T(43), { tol: 10 })
  pad.state.aim = 0
  pad.move(0, 0)
  s.wait(0.3)
  s.me.body.facing = 0
  pad.interact()
  s.until(() => part(W, 'leverC').state === 'on', 2, 'lever')
  s.until(() => part(W, 'gateC').state === 'open', 2, 'gate C')
  s.note('frozen lake')

  // D: four moonstones in four clearings, lit together with せーの.
  s.go(T(30), T(45))
  s.regroup(12)
  pad.mode() // stay
  const spots: [number, number][] = [
    [34, 48],
    [26, 42],
    [16, 48],
    [6, 43]
  ]
  spots.forEach(([x, y], i) => {
    if (i > 0) {
      pad.tab()
      s.wait(0.1)
    }
    s.go(T(x), T(y), { tol: 8, fight: false })
    pad.move(0, 0)
    s.wait(0.2)
  })
  pad.signal()
  s.wait(0.05)
  const sig = W.signal!
  s.until(() => W.t >= sig.at + 3, 4, 'GO')
  howl()
  s.until(() => W.flags.has('moons:D'), 2, 'moonstones')
  s.until(() => part(W, 'gateD').state === 'open', 2, 'gate D')
  pad.mode() // follow
  s.go(T(20), T(44))
  s.regroup(20)
  s.note('four moonstones')

  // E: the hunters' camp arena.
  s.go(T(20), T(37))
  expect(W.arenas.get('E')?.state).toBe('active')
  s.until(
    () => W.arenas.get('E')?.state === 'cleared',
    120,
    'arena E',
    () => {
      const esc = escapeTelegraph(W, s.me.body.x, s.me.body.y)
      if (esc) return void pad.move(esc[0], esc[1])
      const foe = s.nearestFoe(4000, 'E')
      if (foe) s.fightTick(foe)
    }
  )
  s.note('arena')

  // F: the battering log to the ram slot.
  s.go(T(38), T(33))
  s.clearEnemies('F', 60)
  const log = part(W, 'log')
  const slot = part(W, 'ramslotF')
  s.go(log.x - 60, log.y)
  s.regroup(12)
  pad.state.aim = 0
  pad.move(0, 0).interact()
  s.until(
    () => log.state === 'lifted',
    6,
    'log lifted',
    () => pad.move(0, 0)
  )
  s.until(
    () => slot.on,
    30,
    'log in the ram slot',
    () => {
      if (log.state !== 'lifted' && !slot.on) {
        if (s.me.hold === undefined && W.seq % 30 === 0) {
          if (Math.hypot(log.x - s.me.body.x, log.y - s.me.body.y) < 90) pad.interact()
          else pad.move(Math.sign(log.x - s.me.body.x), Math.sign(log.y - s.me.body.y))
        }
        return
      }
      const tx = slot.x
      const ty = log.x < slot.x - 96 ? T(32) : slot.y
      const dx = tx - log.x
      const dy = ty - log.y
      const d = Math.hypot(dx, dy) || 1
      pad.move(dx / d, dy / d)
    }
  )
  s.until(() => part(W, 'fortgate').state === 'open', 2, 'fortress gate')
  s.note('log')

  // G: the pack technique on the ice wall, then resonance at the big moonstone.
  s.go(T(57), T(25))
  s.regroup(12)
  expect(W.checkpoint).toBe('G')
  // The courtyard's south half first (the north half is behind the ice wall).
  const south = () => W.enemies.filter((e) => e.room === 'G' && !e.dead && e.y > 21 * TILE)
  s.until(
    () => !south().length,
    60,
    'courtyard enemies',
    () => {
      const esc = escapeTelegraph(W, s.me.body.x, s.me.body.y)
      if (esc) return void pad.move(esc[0], esc[1])
      const e = south().sort(
        (a, b) => Math.hypot(a.x - s.me.body.x, a.y - s.me.body.y) - Math.hypot(b.x - s.me.body.x, b.y - s.me.body.y)
      )[0]
      if (e) s.fightTick({ x: e.x, y: e.y, d: Math.hypot(e.x - s.me.body.x, e.y - s.me.body.y) })
    }
  )
  const wall = part(W, 'icewallG')
  s.go(wall.x, T(23), { tol: 10 })
  s.regroup(12)
  s.press(wall.x, wall.y)
  s.until(() => wall.gone, 2, 'ice wall')
  s.clearEnemies('G', 40)
  s.go(T(33), T(18))
  s.regroup(12)
  howl()
  s.until(() => part(W, 'bigmoonG').on, 2, 'resonance')
  s.until(() => part(W, 'bossdoor').state === 'open', 2, 'boss door')
  s.note('fortress')

  // H: 勇者レオン.
  s.go(T(36), T(15), { fight: false })
  s.regroup(15)
  s.go(T(36), T(11), { fight: false })
  const boss = W.boss!
  expect(boss.active).toBe(true)
  const fightStart = W.t
  s.until(
    () => boss.dead,
    300,
    'boss defeated',
    () => {
      const m = s.me.body
      // After a wipe: back up to the keep.
      if (m.y > 15 * TILE) return void s.pathStep(T(36), T(11))
      const inForm = s.me.form >= 0 && W.formations[s.me.form].slots.length >= 3
      const esc = escapeTelegraph(W, m.x, m.y)
      if (esc && !s.me.charging && !W.techs.length) return void pad.move(esc[0], esc[1])
      const a = Math.atan2(boss.y - m.y, boss.x - m.x)
      const d = Math.hypot(boss.x - m.x, boss.y - m.y)
      pad.state.aim = a
      pad.state.aimDist = d
      if (s.me.charging) {
        pad.move(d > 150 ? Math.cos(a) : 0, d > 150 ? Math.sin(a) : 0)
        if (s.me.chargeFull && d < 4 * TILE) pad.release()
        return
      }
      if (W.techs.length) return
      const foe = s.nearestFoe(140, undefined, true)
      if (foe && W.seq % 12 === 0 && !pad.state.attackHeld) {
        pad.state.aim = Math.atan2(foe.y - m.y, foe.x - m.x)
        pad.tap()
        return
      }
      if (boss.act === 'parry' || boss.act === 'awaken') {
        if (d < 160) pad.move(-Math.cos(a), -Math.sin(a))
        else pad.move(0, 0)
        return
      }
      if (
        inForm &&
        s.me.chargeLock <= W.t &&
        !pad.state.attackHeld &&
        (boss.act === 'shield' || boss.phase === 1 || W.seq % 3 === 0)
      ) {
        pad.attack()
        return
      }
      if (d > 80) pad.move(Math.cos(a), Math.sin(a))
      else pad.move(0, 0)
      if (W.seq % 10 === 0 && !pad.state.attackHeld && boss.act !== 'shield') pad.tap()
    }
  )
  const fight = W.t - fightStart
  s.note(`boss defeated in ${fight.toFixed(1)} s, ${boss.breaks} shield breaks`)
  pad.state.attackHeld = false
  pad.send()
  if (fight < 80 || fight > 120) s.fail(`boss fight ${fight.toFixed(1)} s`)
  expect(boss.breaks).toBeGreaterThanOrEqual(1)

  s.until(() => W.pickups.some((p) => p.kind === 'orb'), 3, 'orb appears')
  const orb = W.pickups.find((p) => p.kind === 'orb')!
  s.until(
    () => W.phase === 'clear',
    20,
    'clear',
    () => s.pathStep(orb.x, orb.y)
  )
  const v = world.view()
  expect(v.results?.stage).toBe('forest')
  expect(world.progress().cleared).toEqual(['meadow', 'sewer', 'tower', 'forest'])
  console.log(s.log.join('\n'), `\nresults ${JSON.stringify(v.results)}`)
  for (const name of s.seen.get('fx') ?? []) expect(FX_SPEC[name] ?? TECH_SPEC.wolf[name], `fx ${name}`).toBeDefined()

  for (const name of s.seen.get('sfx') ?? [])
    expect((SFX as readonly string[]).includes(name), `sfx ${name}`).toBe(true)
  // The solve banners name this stage's own items and places.
  expect(s.solves).toContain('丸太を破城槌の台にのせた！')
  expect(s.solves).toContain('氷のブロックが湖に沈んで道ができた！')
  for (const msg of s.solves) expect(msg).not.toContain('どんぐり')
  for (const msg of s.solves) expect(msg).not.toContain('岩')
  // The last stage: next → the ending.
  world.command('host', { type: 'next' })
  expect(world.view().phase).toBe('ending')
})
