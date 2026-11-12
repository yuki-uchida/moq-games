/** Determinism, view JSON shape and size, and step performance (DESIGN §2, §19). */
import { describe, expect, it } from 'vitest'
import type { FoeKind } from '../src/data/enemies'
import { spawnFoe } from '../src/sim/foes/index'
import { spawnShot } from '../src/sim/projectiles'
import { BTN, neutralPlayerInput, type PlayerInput, type View } from '../src/sim/types'
import { createWorldOnMap, simOf } from '../src/sim/world'
import { botSquad, cfg, playerCfg, pvpTeams, sakuraMap } from './sim-maps'

function run(seed: number, ticks: number, every = 60) {
  const players = [...botSquad(3, 0.7), playerCfg('h', { preset: 'gunner' })]
  const w = createWorldOnMap(
    cfg({ mode: 'pve', map: 'oldtown', mission: 'sakura', difficulty: 'normal', seed, players }),
    sakuraMap()
  )
  const inp: PlayerInput = neutralPlayerInput()
  const inputs = new Map([['h', inp]])
  const out: string[] = []
  for (let t = 1; t <= ticks; t++) {
    // A scripted human: strafes, turns and fires in bursts.
    inp.mx = Math.sin(t / 50)
    inp.mz = 0.5
    inp.yaw = Math.PI * 0.1 * Math.sin(t / 90)
    if (t % 40 === 0) inp.presses.r++
    inp.held = t % 120 < 60 ? BTN.R : 0
    if (t % 300 === 0) inp.presses.jump++
    w.step(inputs)
    if (t % every === 0) out.push(JSON.stringify(w.view()))
  }
  return out
}

function noUndefined(x: unknown, path = 'view'): string[] {
  if (x === undefined) return [path]
  if (Array.isArray(x)) return x.flatMap((v, i) => noUndefined(v, `${path}[${i}]`))
  if (x && typeof x === 'object') return Object.entries(x).flatMap(([k, v]) => noUndefined(v, `${path}.${k}`))
  return []
}

describe('determinism and views', () => {
  it('the same seed and inputs give identical views', { timeout: 60_000 }, () => {
    const a = run(11, 60 * 45)
    const b = run(11, 60 * 45)
    expect(a.length).toBe(45)
    for (let i = 0; i < a.length; i++) expect(a[i]).toBe(b[i])
    const c = run(12, 60 * 45)
    expect(c.join('')).not.toBe(a.join(''))
  })

  it('views are plain JSON: round-trip equal, no undefined fields, increasing event ids', () => {
    const w = createWorldOnMap(
      cfg({ mode: 'pve', map: 'oldtown', mission: 'nightraid', difficulty: 'easy', seed: 4, players: botSquad(4) }),
      sakuraMap()
    )
    let last = 0
    for (let t = 0; t < 60 * 40; t++) {
      w.step(new Map())
      if (t % 30 !== 0) continue
      const v = w.view()
      expect(JSON.parse(JSON.stringify(v))).toEqual(v)
      expect(noUndefined(v)).toEqual([])
      for (const e of v.events) {
        expect(e.id).toBeGreaterThan(last)
        last = e.id
      }
    }
    const v = w.view()
    expect(v.foes.some((f) => f.animal)).toBe(true)
    expect(v.props.some((p) => p.kind === 'cart')).toBe(true)
  })

  it('a 12-player, 120-foe view stays under 60 KB', () => {
    const w = createWorldOnMap(
      cfg({ mode: 'pvp', map: 'arena', seed: 2, countdown: 0, players: pvpTeams() }),
      sakuraMap()
    )
    const sim = simOf(w)
    const kinds: FoeKind[] = [
      'tsubute',
      'harigane',
      'oagos',
      'kagerou',
      'mitsume',
      'ashinaga',
      'korogashi',
      'tategami',
      'kurozume'
    ]
    for (let i = 0; i < 120; i++)
      spawnFoe(sim, kinds[i % kinds.length], [(i % 12) * 6 - 33, 0, Math.floor(i / 12) * 5 - 20])
    for (let i = 0; i < 60; i++) w.step(new Map())
    w.view()
    w.step(new Map())
    const v: View = w.view()
    expect(v.players.length).toBe(12)
    expect(v.foes.length).toBeGreaterThanOrEqual(110)
    const size = JSON.stringify(v).length
    console.log(
      `view: ${(size / 1024).toFixed(1)} KB (${v.foes.length} foes, ${v.shots.length} shots, ${v.events.length} events)`
    )
    expect(size).toBeLessThan(60 * 1024)
  })

  it('steps 12 bots + 120 foes + 300 projectiles within budget', { timeout: 60_000 }, () => {
    const w = createWorldOnMap(
      cfg({
        mode: 'pve',
        map: 'oldtown',
        mission: 'sakura',
        difficulty: 'hard',
        seed: 9,
        countdown: 0,
        players: botSquad(12, 0.7)
      }),
      sakuraMap()
    )
    const sim = simOf(w)
    const kinds: FoeKind[] = ['tsubute', 'tsubute', 'tsubute', 'harigane', 'kagerou', 'mitsume', 'korogashi', 'oagos']
    for (let i = 0; i < 120; i++)
      spawnFoe(sim, kinds[i % kinds.length], [(i % 15) * 7 - 49, 0, 20 + Math.floor(i / 15) * 4])
    for (let i = 0; i < 60; i++) w.step(new Map())
    let total = 0
    let n = 0
    for (let k = 0; k < 300; k++) {
      // Keep ~300 projectiles in flight.
      while (sim.shots.length < 300) {
        const a = sim.shots.length * 0.37
        spawnShot(sim, {
          kind: 'bee',
          side: 0,
          p: [Math.sin(a) * 30, 1 + (a % 3), Math.cos(a) * 30],
          v: [Math.cos(a) * 140, 0, -Math.sin(a) * 140],
          dmg: 1,
          range: 200,
          life: 2
        })
      }
      const t0 = performance.now()
      w.step(new Map())
      total += performance.now() - t0
      n++
      if (k % 60 === 0) w.view()
    }
    const live = sim.foes.filter((f) => !f.dead).length
    const ms = total / n
    console.log(`step: ${ms.toFixed(3)} ms (12 players, ${live} live foes, ~300 shots)`)
    expect(ms).toBeLessThan(10)
  })
})
