import { describe, expect, it, vi } from 'vitest'
import { Game, packSnapshot, retryState, unpackSnapshot } from '../src/game'
import { JuiceDetector } from '../src/juice'
import { RabbitersAudio } from '../src/audio'
import { DiscoveryTracker, LEGACY_DISCOVERY_LIMIT } from '../src/discoveries'
import { BURROW } from '../src/campaign'
import { heightAt, underWheels, vehiclesAt } from '../src/map'

describe('short-lived discoveries', () => {
  it.each(['initial', 'playing', 'lost'] as const)(
    'announces a visible legacy discovery and capture once on %s',
    (scenario) => {
      const game = new Game()
      game.addPlayer('local')
      delete game.state.discoveries
      const predator = game.state.predators[0]
      game.state.predators = [predator]
      Object.assign(predator, { state: 'patrol', targetId: null })
      const audio = new RabbitersAudio()
      const alarm = vi.spyOn(audio as unknown as { alarm(): void }, 'alarm').mockImplementation(() => {})
      const detector = new JuiceDetector()
      const receive = () => unpackSnapshot(packSnapshot(game.state))!
      if (scenario !== 'initial') {
        const snapshot = receive()
        detector.update(snapshot, 'local')
        audio.update(snapshot, 'local')
      }
      game.state.time = 1
      game.state.players[0].downed = true
      Object.assign(predator, { state: 'chase', targetId: 'local' })
      if (scenario === 'lost') game.state.phase = 'lost'
      const snapshot = receive()
      expect(snapshot.discoveries).toBeUndefined()
      expect(detector.update(snapshot, 'local').filter((event) => event.type === 'spotted' && event.you)).toHaveLength(
        1
      )
      audio.update(snapshot, 'local')
      expect(alarm).toHaveBeenCalledTimes(1)
      for (let step = 0; step < 3; step++) {
        game.state.time += 0.1
        const next = receive()
        expect(detector.update(next, 'local').filter((event) => event.type === 'spotted')).toHaveLength(0)
        audio.update(next, 'local')
      }
      expect(alarm).toHaveBeenCalledTimes(1)
      audio.stop()
    }
  )

  it.each(['already chased', 'already downed', 'new-format without discovery'] as const)(
    'does not invent a legacy capture alert for %s',
    (scenario) => {
      const game = new Game()
      game.addPlayer('local')
      if (scenario !== 'new-format without discovery') delete game.state.discoveries
      const predator = game.state.predators[0]
      game.state.predators = [predator]
      Object.assign(predator, { state: scenario === 'already chased' ? 'chase' : 'patrol', targetId: 'local' })
      game.state.players[0].downed = scenario === 'already downed'
      const audio = new RabbitersAudio()
      const alarm = vi.spyOn(audio as unknown as { alarm(): void }, 'alarm').mockImplementation(() => {})
      const detector = new JuiceDetector()
      detector.update(game.state, 'local')
      audio.update(game.state, 'local')
      alarm.mockClear()
      game.state.time = 1
      game.state.players[0].downed = true
      Object.assign(predator, { state: 'chase', targetId: 'local' })
      expect(detector.update(game.state, 'local').filter((event) => event.type === 'spotted')).toHaveLength(0)
      audio.update(game.state, 'local')
      expect(alarm).not.toHaveBeenCalled()
      audio.stop()
    }
  )

  it('announces only fresh local discoveries on the playing-to-lost transition', () => {
    const game = new Game()
    game.addPlayer('local', 'Rabbit')
    game.addPlayer('friend', 'Friend')
    const detector = new JuiceDetector()
    game.state.time = 10
    detector.update(game.state, 'local')
    game.state.time = 10.1
    game.state.phase = 'lost'
    game.state.players[0].downed = true
    game.state.discoveries = ['local', 'friend'].map((targetId) => ({
      predatorId: 'mom',
      targetId,
      count: 1,
      time: 10.05,
      x: 0,
      y: 0,
      z: 0
    }))
    expect(detector.update(game.state, 'local').map((event) => event.type)).toEqual(['spotted', 'lost'])
    expect(detector.update(game.state, 'local')).toEqual([])
    expect(detector.update({ ...game.state, time: 9 }, 'local')).toEqual([])
    detector.reset()
    expect(detector.update(game.state, 'local')).toEqual([])
    detector.reset()
    detector.update({ ...game.state, phase: 'playing', discoveries: [] }, 'local')
    game.state.discoveries[0].time = 1
    expect(detector.update(game.state, 'local').map((event) => event.type)).toEqual(['lost'])
  })

  it('does not record a sighting when the hunter gives up at the safe burrow in the same step', () => {
    const game = new Game()
    game.addPlayer('local', 'Rabbit')
    Object.assign(game.state.players[0], { x: BURROW.x, y: 0, z: BURROW.z + 3.2 })
    const fox = game.state.predators.find((predator) => predator.kind === 'fox')!
    Object.assign(fox, { x: BURROW.x, y: 0, z: BURROW.z, angle: 0, state: 'patrol', targetId: null })
    game.state.predators = [fox]
    for (let frame = 0; frame < 20; frame++) {
      Object.assign(fox, { x: BURROW.x, z: BURROW.z, angle: 0 })
      game.step(1 / 60)
      expect(fox.state).toBe('patrol')
    }
    expect(game.state.discoveries).toEqual([])
  })

  it('records a natural same-step discovery and capture without changing capture', () => {
    const game = new Game(3, undefined, 0)
    game.addPlayer('local', 'Rabbit')
    Object.assign(game.state.players[0], { x: 0, y: 0, z: 0 })
    game.state.predators = game.state.predators.filter((predator) => predator.id === 'mom')
    Object.assign(game.state.predators[0], { x: 0, y: 0, z: -0.9, angle: 0, state: 'patrol' })
    const detector = new JuiceDetector()
    const audio = new RabbitersAudio()
    const alarm = vi.spyOn(audio as unknown as { alarm(): void }, 'alarm').mockImplementation(() => {})
    detector.update(game.state, 'local')
    audio.update(game.state, 'local')
    game.step(1 / 60)
    expect(game.state.predators[0]).toMatchObject({ state: 'patrol', targetId: null })
    expect(game.state.players[0].z).not.toBe(0)
    expect(game.state.discoveries).toMatchObject([{ predatorId: 'mom', targetId: 'local', count: 1 }])
    const received = unpackSnapshot(JSON.parse(JSON.stringify(packSnapshot(game.state))))!
    expect(detector.update(received, 'local').filter((event) => event.type === 'spotted')).toHaveLength(1)
    audio.update(received, 'local')
    expect(alarm).toHaveBeenCalledTimes(1)
    expect(detector.update(received, 'local')).toEqual([])
    audio.update(received, 'local')
    expect(alarm).toHaveBeenCalledTimes(1)
    expect(new JuiceDetector().update(received, 'local').filter((event) => event.type === 'spotted')).toHaveLength(1)
  })

  it.each(['local', 'wire'] as const)(
    'announces a real immediate capture on the first %s update after retry',
    (transport) => {
      const game = new Game(3, undefined, 0)
      game.addPlayer('local', 'Rabbit')
      Object.assign(game.state.players[0], { x: 0, y: 0, z: 0 })
      game.state.predators = game.state.predators.filter((predator) => predator.id === 'mom')
      Object.assign(game.state.predators[0], { x: 0, y: 0, z: -0.9, angle: 0, state: 'patrol' })
      const checkpoint = structuredClone(game.state)
      const audio = new RabbitersAudio()
      const alarm = vi.spyOn(audio as unknown as { alarm(): void }, 'alarm').mockImplementation(() => {})
      audio.update(game.state, 'local')
      game.state.time = 10
      game.state.phase = 'lost'
      game.state.discoveries = [{ predatorId: 'mom', targetId: 'local', count: 1, time: 0, x: 0, y: 0, z: 0 }]
      audio.update(game.state, 'local')
      expect(alarm).not.toHaveBeenCalled()

      const resumed = Game.resume(retryState(checkpoint, game.state))
      const detector = new JuiceDetector()
      expect(detector.update(resumed.state, 'local').filter((event) => event.type === 'spotted')).toHaveLength(0)
      resumed.step(1 / 60)
      expect(resumed.state.players[0].z).not.toBe(0)
      expect(resumed.state.predators[0]).toMatchObject({ state: 'patrol', targetId: null })
      expect(resumed.state.discoveries).toMatchObject([{ predatorId: 'mom', targetId: 'local', count: 2 }])
      const snapshot =
        transport === 'wire' ? unpackSnapshot(JSON.parse(JSON.stringify(packSnapshot(resumed.state))))! : resumed.state
      for (let repeat = 0; repeat < 3; repeat++) {
        const spotted = detector.update(snapshot, 'local').filter((event) => event.type === 'spotted' && event.you)
        expect(spotted).toHaveLength(repeat === 0 ? 1 : 0)
        audio.update(snapshot, 'local')
        expect(alarm).toHaveBeenCalledTimes(1)
      }
      audio.stop()
    }
  )

  it('announces a real discovery followed by defeat before the first retry frame', () => {
    const game = new Game(3, undefined, 1)
    game.addPlayer('local', 'Rabbit')
    const before = vehiclesAt(10 + 1 / 60)[0]
    const ahead = before.length / 2 + 0.4
    const x = before.x + Math.sin(before.angle) * ahead
    const z = before.z + Math.cos(before.angle) * ahead
    expect(vehiclesAt(10 + 1 / 60).some((vehicle) => underWheels(vehicle, x, z, 0.3))).toBe(false)
    expect(vehiclesAt(10 + 2 / 60).some((vehicle) => underWheels(vehicle, x, z, 0.3))).toBe(true)
    Object.assign(game.state.players[0], { x, y: heightAt(x, z), z })
    game.state.predators = []
    game.spawnPredator('cat', x + 1, z, { id: 'cat' }).angle = -Math.PI / 2
    const checkpoint = structuredClone(game.state)
    const audio = new RabbitersAudio()
    const alarm = vi.spyOn(audio as unknown as { alarm(): void }, 'alarm').mockImplementation(() => {})
    audio.update(game.state, 'local')
    game.state.time = 10
    game.state.phase = 'lost'
    game.state.players[0].downed = true
    game.state.discoveries = [{ predatorId: 'cat', targetId: 'local', count: 1, time: 0, x, y: 0, z }]
    audio.update(game.state, 'local')
    const guestDetector = new JuiceDetector()
    expect(guestDetector.update(game.state, 'local')).toEqual([])
    expect(alarm).not.toHaveBeenCalled()

    const resumed = Game.resume(retryState(checkpoint, game.state))
    const detector = new JuiceDetector()
    detector.update(resumed.state, 'local')
    resumed.step(2 / 60)
    expect(resumed.state.phase).toBe('lost')
    expect(resumed.state.discoveries).toMatchObject([{ predatorId: 'cat', targetId: 'local', count: 2 }])
    const snapshot = unpackSnapshot(JSON.parse(JSON.stringify(packSnapshot(resumed.state))))!
    expect(detector.update(snapshot, 'local').map((event) => event.type)).toContain('spotted')
    expect(guestDetector.update(snapshot, 'local').map((event) => event.type)).toEqual(['spotted'])
    audio.update(snapshot, 'local')
    expect(alarm).toHaveBeenCalledTimes(1)
    expect(guestDetector.update(snapshot, 'local')).toEqual([])
    audio.update(snapshot, 'local')
    expect(alarm).toHaveBeenCalledTimes(1)
    audio.stop()
  })

  it('retains discovery across skipped transmissions, ignores stale history and resets', () => {
    const game = new Game(3, undefined, 0)
    game.addPlayer('local')
    game.addPlayer('friend')
    const detector = new JuiceDetector()
    detector.update(game.state, 'local')
    game.state.discoveries = [
      { predatorId: 'mom', targetId: 'local', count: 1, x: 0, y: 0, z: 0 },
      { predatorId: 'gon', targetId: 'friend', count: 1, x: 1, y: 0, z: 0 }
    ]
    game.state.time = 5
    const spotted = detector.update(game.state, 'local').filter((event) => event.type === 'spotted')
    expect(spotted.map((event) => event.you)).toEqual([true, false])
    expect(detector.update({ ...game.state, time: 1, discoveries: [] }, 'local')).toEqual([])
    expect(detector.update({ ...game.state, discoveries: [] }, 'local')).toEqual([])
    expect(detector.update(game.state, 'local')).toEqual([])
    expect(retryState({ ...game.state, discoveries: [] }, game.state).discoveries).toEqual(game.state.discoveries)
    detector.reset()
    expect(detector.update(game.state, 'local')).toEqual([])
    game.state.phase = 'lost'
    game.state.discoveries[0].count++
    expect(detector.update(game.state, 'local').filter((event) => event.type === 'spotted')).toEqual([])
  })

  it('does not announce another pursuer joining an existing chase', () => {
    const game = new Game(3, undefined, 0)
    game.addPlayer('local')
    Object.assign(game.state.players[0], { x: 0, y: 0, z: 0 })
    const mom = game.state.predators.find((predator) => predator.id === 'mom')!
    Object.assign(mom, { x: 0, y: 0, z: -2, angle: 0, state: 'patrol' })
    game.state.predators = [{ ...mom, id: 'existing', state: 'chase', targetId: 'local', suspicion: 1 }, mom]
    game.step(1 / 60)
    expect(mom.state).toBe('chase')
    expect(game.state.discoveries).toEqual([])
    const legacy = structuredClone(game.state)
    delete legacy.discoveries
    expect(Game.resume(legacy).state.discoveries).toEqual([])
  })

  it('announces only recent first captures and never doubles the initial chase alarm', () => {
    for (const age of [0, 3]) {
      const game = new Game(3, undefined, 0)
      game.addPlayer('local')
      game.state.time = 10
      game.state.discoveries = [{ predatorId: 'mom', targetId: 'local', count: 1, time: 10 - age, x: 0, y: 0, z: 0 }]
      const audio = new RabbitersAudio()
      const alarm = vi.spyOn(audio as unknown as { alarm(): void }, 'alarm').mockImplementation(() => {})
      const detector = new JuiceDetector()
      expect(detector.update(game.state, 'local').filter((event) => event.type === 'spotted')).toHaveLength(
        age === 0 ? 1 : 0
      )
      audio.update(game.state, 'local')
      audio.update(game.state, 'local')
      expect(alarm).toHaveBeenCalledTimes(age === 0 ? 1 : 0)
      audio.stop()
      Object.assign(game.state.predators[0], { state: 'chase', targetId: 'local' })
      audio.update(game.state, 'local')
      audio.update(game.state, 'local')
      expect(alarm).toHaveBeenCalledTimes(age === 0 ? 2 : 1)
    }
  })

  it('bounds legacy reception and preserves target counters through omissions and stale snapshots', () => {
    const game = new Game(3, undefined, 0)
    game.addPlayer('local')
    game.addPlayer('friend')
    const tracker = new DiscoveryTracker()
    tracker.update(game.state)
    for (let index = 1; index <= 1000; index++) {
      game.state.time = index
      game.state.discoveries = [{ predatorId: String(index), targetId: 'local', count: 1, x: 0, y: 0, z: 0 }]
      expect(tracker.update(game.state)).toHaveLength(1)
    }
    expect((tracker as unknown as { previous: Map<string, number> }).previous.size).toBe(LEGACY_DISCOVERY_LIMIT)
    game.state.discoveries = [{ predatorId: 'new', targetId: 'friend', count: 1, time: 1000, x: 0, y: 0, z: 0 }]
    expect(tracker.update(game.state)).toHaveLength(1)
    expect(tracker.update({ ...game.state, discoveries: [] })).toEqual([])
    expect(tracker.update({ ...game.state, time: 999 })).toEqual([])
    expect(tracker.update(game.state)).toEqual([])
    tracker.update({ ...game.state, players: [] })
    expect(tracker.update(game.state)).toHaveLength(1)
    tracker.reset()
    expect(tracker.update({ ...game.state, time: 1003 })).toEqual([])
  })

  it('compacts resumed legacy history without losing cumulative discoveries', () => {
    const game = new Game(3, undefined, 0)
    game.addPlayer('local')
    game.state.discoveries = Array.from({ length: 1000 }, (_, index) => ({
      predatorId: String(index),
      targetId: 'local',
      count: 1,
      x: 0,
      y: 0,
      z: 0
    }))
    const resumed = Game.resume(game.state)
    expect(resumed.state.discoveries).toHaveLength(1)
    expect(resumed.state.discoveries?.[0].count).toBe(1000)
  })
})
