import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { buildSeats } from '../src/app/match'
import type { FoeKind } from '../src/data/enemies'
import { createWorld } from '../src/sim/api'
import { spawnFoe } from '../src/sim/foes/index'
import { simOf } from '../src/sim/world'
import type { MatchConfig } from '../src/sim/types'
import { choice, FakeHub, provider, run } from './net-helpers'

beforeEach(() => {
  vi.useFakeTimers()
})
afterEach(() => {
  vi.useRealTimers()
})

const KINDS: FoeKind[] = ['tsubute', 'harigane', 'ashinaga', 'oagos']

/** Worst case for one snapshot: 12 fighting players and 120 foes, events of every step since the last one. */
function crowdedWorld(c: MatchConfig) {
  const extra = buildSeats({ mode: 'pvp' }, { id: 'x', ...choice('x') })
    .filter((s) => s.bot != null)
    .slice(0, 12 - c.players.length)
    .map((s, i) => ({
      id: `extra${i}`,
      name: s.name,
      species: s.species,
      loadout: s.loadout,
      team: 0 as const,
      bot: 0.8
    }))
  const world = createWorld({ ...c, players: [...c.players, ...extra] })
  const sim = simOf(world)
  for (let i = 0; i < 120; i++) {
    const a = (i / 120) * Math.PI * 2
    const r = 12 + (i % 5) * 4
    const kind = KINDS[i % KINDS.length]
    const base = sim.map.anchors.lighthouse ?? [0, 0, 0]
    spawnFoe(sim, kind, [base[0] + Math.sin(a) * r, 0, base[2] + Math.cos(a) * r])
  }
  return world
}

describe('snapshot size', () => {
  it('12 players + 120 foes stay far below the 64 KiB compressed limit', async () => {
    const hub = new FakeHub()
    const host = await provider(hub, { makeWorld: crowdedWorld }).host(
      { mode: 'pve', mission: 'sakura', difficulty: 'hard' },
      choice('ホスト'),
      'size-1234'
    )
    const join = provider(hub).join('size-1234', choice('ゲスト', 'cat'))
    await run(300)
    const guest = await join
    guest.setReady(true)
    await run(300)
    const hs = host.start().connect()
    await run(100)
    const gs = guest.online!.takeMatch()!.start.connect()
    let foes = 0
    let players = 0
    await run(10_000, () => {
      const v = hs.update(1 / 60)
      foes = Math.max(foes, v?.foes.length ?? 0)
      players = v?.players.length ?? 0
      gs.update(1 / 60)
    })
    console.log('snapshot', {
      players,
      foes,
      snapshots: hub.stats.snapshots,
      maxCompressedBytes: hub.stats.maxSnapshotBytes,
      maxJsonBytes: hub.stats.maxSnapshotJson
    })
    expect(players).toBe(12)
    expect(foes).toBeGreaterThanOrEqual(100)
    expect(hub.stats.snapshots).toBeGreaterThan(150)
    expect(hub.stats.maxSnapshotBytes).toBeLessThan(32 * 1024)
    host.leave()
    guest.leave()
  }, 120_000)
})
