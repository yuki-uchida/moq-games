import { describe, expect, it, vi } from 'vitest'
import { Game, coverAt, exposed, mapTerrain, retryState } from '../src/game'
import { HudFx, threatFor } from '../src/hud-fx'
import { RabbitersAudio, ThreatTracker } from '../src/audio'
import { GameFeel } from '../src/feel'
import { JuiceDetector } from '../src/juice'
import { RabbitersSfx } from '../src/sfx'
import { BUSHES, TREES, heightAt, lightAt } from '../src/map'
import { BEAM } from '../src/stages/waterway/map'
import { script as waterwayScript } from '../src/stages/waterway/script'
import { distance, sightZone, STEALTH } from '../src/stealth'

describe('local threat HUD', () => {
  it('does not retain a trunk-obscured town target because of distant streetlights', () => {
    const game = new Game(1, undefined, 1)
    game.addPlayer('local', 'Local')
    game.addPlayer('friend', 'Friend')
    const [local, friend] = game.state.players
    const fox = {
      ...game.state.predators[0],
      id: 'fox',
      kind: 'fox' as const,
      state: 'chase' as const,
      targetId: local.id
    }
    const tree = TREES.find((entry) => {
      Object.assign(fox, { x: entry.x - 9, y: heightAt(entry.x - 9, entry.z), z: entry.z, angle: Math.PI / 2 })
      Object.assign(local, { x: entry.x + 1, y: heightAt(entry.x + 1, entry.z), z: entry.z, hidden: false })
      return (
        lightAt(local.x, local.z) === 1 &&
        coverAt(local.x, local.y, local.z, false) === 'open' &&
        mapTerrain.sightLine(fox, local) === STEALTH.trunkCover
      )
    })
    expect(tree).toBeDefined()
    game.state.predators = [fox]
    const tracker = new ThreatTracker()
    tracker.update(game.state)
    fox.targetId = friend.id
    game.state.time = 1
    tracker.update(game.state)
    expect(threatFor(game.state, local.id, tracker).mode).toBe('chase')
    game.state.time = 1.51
    tracker.update(game.state)
    expect(threatFor(game.state, local.id, tracker).mode).toBe('clear')
  })

  it('retains a visible former target beyond the unlit sight range', () => {
    const game = new Game(1, undefined, 0)
    game.addPlayer('local', 'Local')
    game.addPlayer('friend', 'Friend')
    const [local, friend] = game.state.players
    const fox = {
      ...game.state.predators[0],
      id: 'fox',
      kind: 'fox' as const,
      state: 'chase' as const,
      targetId: local.id
    }
    const positions = [30, 20, 10, 0, -10].flatMap((candidateX) =>
      [28, 34, 42, 50].map((candidateZ) => ({ x: candidateX, z: candidateZ }))
    )
    const position = positions.find((candidate) => {
      Object.assign(local, { ...candidate, y: heightAt(candidate.x, candidate.z), hidden: false })
      Object.assign(fox, {
        x: candidate.x - 22,
        y: heightAt(candidate.x - 22, candidate.z),
        z: candidate.z,
        angle: Math.PI / 2
      })
      return (
        lightAt(candidate.x, candidate.z) > 1 &&
        coverAt(candidate.x, local.y, candidate.z, false) === 'open' &&
        mapTerrain.sightLine(fox, local) === 1
      )
    })
    expect(position).toBeDefined()
    expect(distance(fox, local)).toBeGreaterThan(STEALTH.sightRange.fox * STEALTH.farFraction)
    expect(sightZone(distance(fox, local), STEALTH.sightRange.fox * lightAt(local.x, local.z), 1, false)).toBe('far')
    game.state.predators = [fox]
    const tracker = new ThreatTracker()
    tracker.update(game.state)
    fox.targetId = friend.id
    game.state.time = 1
    tracker.update(game.state)
    expect(threatFor(game.state, local.id, tracker).mode).toBe('chase')
  })

  it.each(['lit', 'absent', 'distant', 'turned', 'departed'] as const)(
    'uses the snapshot worker for a trunk-obscured waterway target: %s',
    (beam) => {
      const game = new Game(1, undefined, 2)
      game.addPlayer('local', 'Local')
      game.addPlayer('friend', 'Friend')
      const [local, friend] = game.state.players
      const worker = game.state.predators.find((predator) => predator.id === 'worker')!
      const fox = { ...worker, id: 'fox', kind: 'fox' as const, state: 'chase' as const, targetId: local.id }
      const tree = TREES.find((tree) => {
        Object.assign(fox, { x: tree.x - 9, y: heightAt(tree.x - 9, tree.z), z: tree.z, angle: Math.PI / 2 })
        Object.assign(local, { x: tree.x + 1, y: heightAt(tree.x + 1, tree.z), z: tree.z, hidden: false })
        return mapTerrain.sightLine(fox, local) === STEALTH.trunkCover && lightAt(local.x, local.z) === 1
      })
      expect(tree).toBeDefined()
      const originalBeam = { ...BEAM }
      try {
        Object.assign(worker, { x: local.x - 5.5, y: local.y, z: local.z, angle: Math.PI / 2 })
        waterwayScript.tick(game, 0)
        expect(lightAt(local.x, local.z)).toBe(2.2)
        expect(mapTerrain.sightLine(fox, local)).toBe(STEALTH.trunkCover)
        if (beam !== 'departed') {
          Object.assign(BEAM, originalBeam)
          expect(lightAt(local.x, local.z)).toBe(1)
        }
        if (beam === 'distant') worker.x -= 100
        if (beam === 'turned') worker.angle = -Math.PI / 2
        game.state.predators = beam === 'absent' ? [fox] : [fox, worker]
        const tracker = new ThreatTracker()
        tracker.update(game.state)
        if (beam === 'departed') {
          game.state.predators = [fox]
          expect(lightAt(local.x, local.z)).toBe(2.2)
        }
        fox.targetId = friend.id
        for (const time of [1, 1.5, 2]) {
          game.state.time = time
          tracker.update(game.state)
          expect(threatFor(game.state, local.id, tracker).mode).toBe(beam === 'lit' || time < 1.5 ? 'chase' : 'clear')
        }
      } finally {
        Object.assign(BEAM, originalBeam)
      }
    }
  )

  it.each([6, 10])('bounds former-target visibility behind a real trunk at %sm', (range) => {
    const game = new Game(1)
    game.addPlayer('local', 'Local')
    game.addPlayer('friend', 'Friend')
    const [local, friend] = game.state.players
    const fox = game.state.predators.find((entry) => entry.kind === 'fox')!
    game.state.predators = [fox]
    game.state.nests.forEach((nest) => (nest.active = false))
    const tree = TREES.find((tree) => {
      const hunter = { ...fox, x: tree.x + 1 - range, y: heightAt(tree.x + 1 - range, tree.z), z: tree.z }
      const target = { ...local, x: tree.x + 1, y: heightAt(tree.x + 1, tree.z), z: tree.z }
      const sight = mapTerrain.sightLine(hunter, target)
      return sight > 0 && sight <= STEALTH.trunkCover && coverAt(target.x, target.y, target.z, false) === 'open'
    })!
    expect(tree).toBeDefined()
    const tracker = new ThreatTracker()
    const step = (blocked: boolean) => {
      Object.assign(fox, {
        x: tree.x + 1 - range,
        y: heightAt(tree.x + 1 - range, tree.z),
        z: tree.z,
        angle: Math.PI / 2
      })
      for (const [player, offset] of [
        [local, blocked ? range : 1],
        [friend, blocked ? 0.5 : -20]
      ] as const) {
        Object.assign(player, { x: fox.x + offset, y: heightAt(fox.x + offset, fox.z), z: fox.z, health: 100 })
      }
      game.step(0.016)
      tracker.update(game.state)
    }
    step(false)
    expect(fox.targetId).toBe(local.id)
    for (let frame = 0; frame < 40; frame++) {
      step(true)
      expect(fox).toMatchObject({ state: 'chase', targetId: friend.id })
      expect(local.hidden).toBe(false)
      expect(mapTerrain.sightLine(fox, local)).toBeGreaterThan(0)
      expect(mapTerrain.sightLine(fox, local)).toBeLessThanOrEqual(STEALTH.trunkCover)
      expect(exposed(fox, local, coverAt(local.x, local.y, local.z, local.hidden))).toBe(true)
      const facing = Math.cos(Math.atan2(local.x - fox.x, local.z - fox.z) - fox.angle)
      expect(facing).toBeGreaterThan(STEALTH.fieldOfView)
      expect(
        sightZone(distance(fox, local), STEALTH.sightRange.fox * mapTerrain.sightLine(fox, local), facing, false)
      ).toBe('none')
      if (frame < 31) expect(threatFor(game.state, local.id, tracker).mode).toBe('chase')
    }
    expect(threatFor(game.state, local.id, tracker).mode).toBe(range === 10 ? 'clear' : 'chase')
    step(false)
    expect(fox.targetId).toBe(local.id)
    expect(threatFor(game.state, local.id, tracker).mode).toBe('chase')
  })

  it.each([3, 1])(
    'releases a former target behind a real chasing fox at distance %s only outside touch range',
    (rearDistance) => {
      const element = (): HTMLElement =>
        ({
          ownerDocument: { createElement: element },
          className: '',
          dataset: {},
          getBoundingClientRect: () => ({ width: 800, height: 600, left: 0, top: 0 }),
          style: { setProperty: vi.fn() },
          classList: { add: vi.fn(), remove: vi.fn(), toggle: vi.fn() },
          setAttribute: vi.fn(),
          appendChild: vi.fn(),
          addEventListener: vi.fn(),
          removeEventListener: vi.fn(),
          remove: vi.fn()
        }) as unknown as HTMLElement
      const game = new Game(1)
      game.addPlayer('local', 'Local')
      game.addPlayer('friend', 'Friend')
      const [local, friend] = game.state.players
      const fox = game.state.predators.find((entry) => entry.kind === 'fox')!
      game.state.predators = [fox]
      game.state.nests.forEach((nest) => (nest.active = false))
      Object.assign(fox, { x: -88, y: heightAt(-88, -30), z: -30, angle: 0, state: 'patrol', targetId: null })
      const place = (rear: boolean) => {
        for (const [player, offset] of [
          [local, rear ? -rearDistance : 3],
          [friend, rear ? 0.5 : 20]
        ] as const) {
          const x = fox.x + Math.sin(fox.angle) * offset
          const z = fox.z + Math.cos(fox.angle) * offset
          Object.assign(player, { x, y: heightAt(x, z), z, health: 100 })
        }
      }
      const tracker = new ThreatTracker()
      const emit = vi.fn()
      const heartbeat = vi.spyOn(RabbitersSfx.prototype, 'setChase').mockImplementation(() => {})
      const hud = vi.spyOn(HudFx.prototype, 'setThreat')
      const audio = new RabbitersAudio()
      const alarm = vi.spyOn(audio as unknown as { alarm(): void }, 'alarm').mockImplementation(() => {})
      const feel = new GameFeel({ fx: { emit } as never, screenPoint: () => null }, element())
      const observe = () => {
        tracker.update(game.state)
        feel.update(game.state, local.id)
        audio.update(game.state, local.id)
      }
      const step = (rear: boolean) => {
        place(rear)
        game.step(0.016)
        observe()
      }
      const escapes = () => emit.mock.calls.filter(([event]) => event.type === 'escaped').length
      try {
        place(false)
        observe()
        step(false)
        expect(fox.targetId).toBe(local.id)
        for (let cycle = 0; cycle < 3; cycle++) {
          for (let frame = 0; frame < 25; frame++) step(true)
          expect(fox.targetId).toBe(friend.id)
          expect(feel.isChasing).toBe(true)
          step(false)
          expect(fox.targetId).toBe(local.id)
        }
        expect(alarm).toHaveBeenCalledTimes(1)
        expect(escapes()).toBe(0)
        for (let frame = 0; frame < 100; frame++) {
          step(true)
          expect(fox).toMatchObject({ state: 'chase', targetId: friend.id })
          expect(local.hidden).toBe(false)
          expect(coverAt(local.x, local.y, local.z, false)).toBe('open')
          expect(mapTerrain.sightLine(fox, local)).toBeGreaterThan(0)
          const facing = Math.cos(Math.atan2(local.x - fox.x, local.z - fox.z) - fox.angle)
          expect(facing).toBeLessThan(-0.9)
          expect(sightZone(distance(fox, local), STEALTH.sightRange.fox, facing, false)).toBe(
            rearDistance < STEALTH.touchRange ? 'close' : 'none'
          )
          if (frame <= 31) {
            expect(feel.isChasing).toBe(true)
            expect(escapes()).toBe(0)
          } else {
            expect(feel.isChasing).toBe(rearDistance < STEALTH.touchRange)
          }
        }
        const retained = rearDistance < 2
        expect.soft(threatFor(game.state, local.id, tracker).mode).toBe(retained ? 'chase' : 'clear')
        expect.soft(hud.mock.calls.at(-1)?.[0].mode).toBe(retained ? 'chase' : 'clear')
        expect.soft(feel.isChasing).toBe(retained)
        expect.soft(heartbeat).toHaveBeenLastCalledWith(retained)
        expect.soft(escapes()).toBe(retained ? 0 : 1)
        step(false)
        expect(fox.targetId).toBe(local.id)
        expect(feel.isChasing).toBe(true)
        expect(alarm).toHaveBeenCalledTimes(retained ? 1 : 2)
        const other = { ...fox, id: 'other-pursuer', targetId: local.id }
        game.state.predators.push(other)
        for (let frame = 0; frame < 40; frame++) {
          place(true)
          Object.assign(other, { x: local.x + 1.5, y: heightAt(local.x + 1.5, local.z), z: local.z })
          step(true)
          expect(other).toMatchObject({ state: 'chase', targetId: local.id })
          expect(feel.isChasing).toBe(true)
          expect(heartbeat).toHaveBeenLastCalledWith(true)
        }
        expect(tracker.targets.get(fox.id)?.has(local.id) ?? false).toBe(retained)
        expect(threatFor(game.state, local.id, tracker).count).toBe(retained ? 2 : 1)
        expect(escapes()).toBe(retained ? 0 : 1)
        expect(alarm).toHaveBeenCalledTimes(retained ? 1 : 2)
      } finally {
        feel.dispose()
        audio.stop()
        vi.restoreAllMocks()
      }
    }
  )

  it('can be discovered while hidden under furniture', () => {
    const game = new Game(1, undefined, 0)
    game.addPlayer('local', 'Local')
    const player = game.state.players[0]
    const predator = game.state.predators[0]
    Object.assign(player, { x: 7, y: heightAt(7, 9), z: 9, health: 100 })
    Object.assign(predator, {
      kind: 'cat',
      x: 10.5,
      y: heightAt(10.5, 9),
      z: 9,
      angle: -Math.PI / 2,
      state: 'patrol',
      targetId: null,
      suspicion: 0
    })
    game.state.predators = [predator]
    game.setInput(player.id, { moveX: 0, moveZ: 0, jump: false, sprint: false, crouch: true, interact: false })
    game.step(0.016)
    expect(player.hidden).toBe(true)
    expect(predator).toMatchObject({ state: 'chase', targetId: player.id })
    expect(threatFor(game.state, player.id).mode).toBe('chase')
  })

  it('enters cover immediately after a real predator discovery', () => {
    const game = new Game(1)
    game.addPlayer('local', 'Local')
    const player = game.state.players[0]
    const predator = game.state.predators.find((entry) => entry.kind === 'fox')!
    game.state.predators = [predator]
    game.state.nests.forEach((nest) => (nest.active = false))
    Object.assign(player, { x: -125, y: heightAt(-125, 8), z: 8, health: 100 })
    Object.assign(predator, {
      x: -125,
      y: heightAt(-125, 10.75),
      z: 10.75,
      angle: Math.PI,
      state: 'patrol',
      targetId: null,
      suspicion: 0
    })
    const tracker = new ThreatTracker()
    const detector = new JuiceDetector()
    tracker.update(game.state)
    detector.update(game.state, player.id)
    game.step(0.016)
    tracker.update(game.state)
    expect(predator.state).toBe('chase')
    expect(detector.update(game.state, player.id)).toContainEqual(
      expect.objectContaining({ type: 'spotted', you: true })
    )
    Object.assign(player, { x: -105, y: heightAt(-105, -12), z: -12 })
    game.step(0.016)
    tracker.update(game.state)
    expect(player.hidden).toBe(true)
    expect(predator.state).toBe('search')
    expect(threatFor(game.state, player.id, tracker).mode).toBe('search')
  })

  it.each(['hawk', 'fox'] as const)('releases a hidden target while a %s chases a teammate', (kind) => {
    const game = new Game(1)
    game.addPlayer('local', 'Local')
    game.addPlayer('friend', 'Friend')
    const [local, friend] = game.state.players
    const predator = game.state.predators.find((entry) => entry.kind === kind)!
    const bush = BUSHES.find((entry) => {
      const outside = entry.x + entry.r + 2
      return coverAt(outside, heightAt(outside, entry.z), entry.z, false) === 'open'
    })!
    const outside = bush.x + bush.r + 2
    game.state.predators = [predator]
    game.state.nests.forEach((nest) => (nest.active = false))
    Object.assign(local, { x: outside, y: heightAt(outside, bush.z), z: bush.z, health: 100 })
    Object.assign(friend, { x: outside + 20, y: heightAt(outside + 20, bush.z), z: bush.z, health: 100 })
    Object.assign(predator, {
      x: outside - 1.5,
      y: heightAt(outside - 1.5, bush.z) + (kind === 'hawk' ? 5 : 0),
      z: bush.z,
      angle: Math.PI / 2,
      state: 'chase',
      targetId: local.id
    })
    const tracker = new ThreatTracker()
    const detector = new JuiceDetector()
    const observe = () => {
      tracker.update(game.state)
      return detector.update(game.state, local.id)
    }
    observe()
    Object.assign(local, { x: bush.x, y: heightAt(bush.x, bush.z) })
    Object.assign(friend, { x: outside, y: heightAt(outside, bush.z) })
    game.step(0.016)
    expect(local.hidden).toBe(true)
    expect(coverAt(local.x, local.y, local.z, false)).toBe('bush')
    expect(exposed(predator, local, 'bush')).toBe(false)
    expect(mapTerrain.sightLine(predator, local)).toBeGreaterThan(0)
    expect(predator.targetId).toBe(friend.id)
    observe()
    const obscuredAt = game.state.time
    for (let frame = 0; frame < 31; frame++) {
      Object.assign(friend, {
        x: predator.x + 2.5,
        y: heightAt(predator.x + 2.5, predator.z),
        z: predator.z,
        health: 100
      })
      game.step(0.016)
      expect(predator.state).toBe('chase')
      expect(predator.targetId).toBe(friend.id)
      expect(observe().filter((event) => event.type === 'escaped')).toHaveLength(0)
      expect(threatFor(game.state, local.id, tracker).mode).toBe('chase')
    }
    expect(game.state.time - obscuredAt).toBeCloseTo(0.496)
    expect(Math.cos(Math.atan2(local.x - predator.x, local.z - predator.z) - predator.angle)).toBeLessThan(
      STEALTH.fieldOfView
    )
    game.step(0.016)
    expect(observe().filter((event) => event.type === 'escaped')).toHaveLength(1)
    expect(threatFor(game.state, local.id, tracker).mode).toBe('clear')
    for (let frame = 0; frame < 8; frame++) {
      Object.assign(friend, {
        x: predator.x + 2.5,
        y: heightAt(predator.x + 2.5, predator.z),
        z: predator.z,
        health: 100
      })
      game.step(0.016)
      expect(predator.state).toBe('chase')
      expect(predator.targetId).toBe(friend.id)
      expect(observe().filter((event) => event.type === 'escaped')).toHaveLength(0)
      expect(threatFor(game.state, local.id, tracker).mode).toBe('clear')
    }
    Object.assign(local, { x: predator.x + 1, y: heightAt(predator.x + 1, predator.z), z: predator.z, health: 100 })
    expect(coverAt(local.x, local.y, local.z, false)).toBe('open')
    game.step(0.016)
    expect(predator.targetId).toBe(local.id)
    expect(observe().filter((event) => event.type === 'spotted' && event.you)).toHaveLength(1)
    expect(threatFor(game.state, local.id, tracker).mode).toBe('chase')
  })

  it('releases a non-hidden former target behind a house wall after the cover grace', () => {
    const element = (): HTMLElement =>
      ({
        ownerDocument: { createElement: element },
        className: '',
        dataset: {},
        getBoundingClientRect: () => ({ width: 800, height: 600, left: 0, top: 0 }),
        style: { setProperty: vi.fn() },
        classList: { add: vi.fn(), remove: vi.fn(), toggle: vi.fn() },
        setAttribute: vi.fn(),
        appendChild: vi.fn(),
        addEventListener: vi.fn(),
        removeEventListener: vi.fn(),
        remove: vi.fn()
      }) as unknown as HTMLElement
    const game = new Game(1, undefined, 0)
    game.addPlayer('local', 'Local')
    game.addPlayer('friend', 'Friend')
    const [local, friend] = game.state.players
    const predator = game.state.predators[0]
    game.state.predators = [predator]
    Object.assign(local, { x: -6, y: heightAt(-6, 0), z: 0, hidden: false })
    Object.assign(friend, { x: -7, y: heightAt(-7, 0), z: 0 })
    Object.assign(predator, { kind: 'cat', x: -8, y: heightAt(-8, 0), z: 0, state: 'chase', targetId: local.id })
    const tracker = new ThreatTracker()
    const emit = vi.fn()
    const heartbeat = vi.spyOn(RabbitersSfx.prototype, 'setChase').mockImplementation(() => {})
    const hud = vi.spyOn(HudFx.prototype, 'setThreat')
    const feel = new GameFeel({ fx: { emit } as never, screenPoint: () => null }, element())
    const update = (time: number) => {
      game.state.time = time
      tracker.update(game.state)
      feel.update(game.state, local.id)
    }
    const escapes = () => emit.mock.calls.filter(([event]) => event.type === 'escaped').length
    try {
      expect(mapTerrain.sightLine(predator, local)).toBeGreaterThan(0)
      update(0)
      predator.targetId = friend.id
      update(1)
      update(2)
      expect(feel.isChasing).toBe(true)
      Object.assign(local, { x: -2, y: heightAt(-2, 0) })
      expect(local.hidden).toBe(false)
      expect(Math.hypot(predator.x - local.x, predator.z - local.z)).toBe(6)
      expect(mapTerrain.sightLine(predator, local)).toBe(0)
      update(3)
      update(3.49)
      expect(feel.isChasing).toBe(true)
      expect(hud.mock.calls.at(-1)?.[0].mode).toBe('chase')
      expect(heartbeat).toHaveBeenLastCalledWith(true)
      expect(escapes()).toBe(0)
      update(3.5)
      expect(threatFor(game.state, local.id, tracker).mode).toBe('clear')
      expect(hud.mock.calls.at(-1)?.[0].mode).toBe('clear')
      expect(feel.isChasing).toBe(false)
      expect(heartbeat).toHaveBeenLastCalledWith(false)
      expect(escapes()).toBe(1)
      update(30)
      expect(escapes()).toBe(1)
      expect(tracker.targets.get(predator.id)?.has(friend.id)).toBe(true)
      predator.targetId = local.id
      update(31)
      update(32)
      expect(feel.isChasing).toBe(true)
      expect(heartbeat).toHaveBeenLastCalledWith(true)
      expect(emit.mock.calls.filter(([event]) => event.type === 'spotted' && event.you)).toHaveLength(1)
    } finally {
      feel.dispose()
      vi.restoreAllMocks()
    }
  })

  it.each([true, false])('releases and rediscovers a hidden rabbit with discovery history %s', (withHistory) => {
    const game = new Game(1)
    game.addPlayer('local', 'Local')
    game.addPlayer('friend', 'Friend')
    const [local, friend] = game.state.players
    const fox = game.state.predators.find((predator) => predator.kind === 'fox')!
    game.state.predators = [fox]
    game.state.nests.forEach((nest) => (nest.active = false))
    Object.assign(local, { x: -125, y: heightAt(-125, 8), z: 8, hidden: false, health: 100 })
    Object.assign(friend, { x: -90, y: heightAt(-90, -7), z: -7, health: 100 })
    Object.assign(fox, { x: -125, y: heightAt(-125, 5), z: 5, angle: 0, state: 'patrol', targetId: null })

    const tracker = new ThreatTracker()
    const detector = new JuiceDetector()
    const audio = new RabbitersAudio()
    const alarm = vi.spyOn(audio as unknown as { alarm(): void }, 'alarm').mockImplementation(() => {})
    const observe = () => {
      const snapshot = structuredClone(game.state)
      if (!withHistory) delete snapshot.discoveries
      tracker.update(snapshot)
      audio.update(snapshot, local.id)
      return { threat: threatFor(snapshot, local.id, tracker), events: detector.update(snapshot, local.id) }
    }
    try {
      observe()
      game.step(0.016)
      expect(fox.targetId).toBe(local.id)
      expect(observe().events.filter((event) => event.type === 'spotted' && event.you)).toHaveLength(1)

      for (let frame = 0; frame < 5; frame++) {
        Object.assign(local, { x: -105, y: heightAt(-105, -12), z: -12 })
        Object.assign(friend, { x: fox.x, y: heightAt(fox.x, fox.z + 2.5), z: fox.z + 2.5 })
        game.step(0.016)
        expect(fox.targetId).toBe(friend.id)
        const brieflyHidden = observe()
        expect(brieflyHidden.threat.mode).toBe('chase')
        expect(brieflyHidden.events.filter((event) => event.type === 'escaped')).toHaveLength(0)

        Object.assign(local, { x: -125, y: heightAt(-125, 8), z: 8 })
        Object.assign(friend, { x: -90, y: heightAt(-90, -7), z: -7 })
        game.step(0.016)
        expect(fox.targetId).toBe(local.id)
        expect(observe().events.filter((event) => event.type === 'spotted' && event.you)).toHaveLength(0)
      }
      expect(alarm).toHaveBeenCalledTimes(1)

      Object.assign(local, { x: -105, y: heightAt(-105, -12), z: -12 })
      Object.assign(friend, { x: fox.x, y: heightAt(fox.x, fox.z + 2.5), z: fox.z + 2.5 })
      game.step(0.016)
      expect(local.hidden).toBe(true)
      expect(fox.state).toBe('chase')
      expect(fox.targetId).toBe(friend.id)
      observe()
      let escaped = 0
      let hidden = observe()
      for (let frame = 0; frame < 40; frame++) {
        Object.assign(friend, { x: fox.x + 2.5, y: heightAt(fox.x + 2.5, fox.z), z: fox.z, health: 100 })
        game.step(0.016)
        hidden = observe()
        escaped += hidden.events.filter((event) => event.type === 'escaped').length
      }
      expect(hidden.threat.mode).not.toBe('chase')
      expect(escaped).toBe(1)

      Object.assign(local, { x: -125, y: heightAt(-125, 8), z: 8 })
      Object.assign(friend, { x: fox.x, y: heightAt(fox.x, fox.z), z: fox.z, health: 100 })
      game.step(0.016)
      expect(local.hidden).toBe(false)
      expect(fox.targetId).toBe(friend.id)
      expect(observe().events.filter((event) => event.type === 'spotted' && event.you)).toHaveLength(0)
      Object.assign(friend, { x: -90, y: heightAt(-90, -7), z: -7 })
      Object.assign(fox, { x: -125, y: heightAt(-125, 5), z: 5, angle: 0 })
      game.step(0.016)
      expect(fox.targetId).toBe(local.id)
      const rediscovered = observe()
      expect(rediscovered.threat.mode).toBe('chase')
      expect(rediscovered.events.filter((event) => event.type === 'spotted' && event.you)).toHaveLength(1)
      expect(alarm).toHaveBeenCalledTimes(2)
    } finally {
      audio.stop()
    }
  })

  it.each([
    ['cat', 1, true],
    ['cat', 5, false],
    ['human', 1, false]
  ] as const)('retains a rabbit under furniture only when a %s can see it at %sm', (kind, distance, visible) => {
    const game = new Game(1, undefined, 0)
    game.addPlayer('local', 'Local')
    game.addPlayer('friend', 'Friend')
    const [local, friend] = game.state.players
    Object.assign(local, { x: 7, y: heightAt(7, 9), z: 9, hidden: true })
    Object.assign(friend, { x: 7 + distance, y: heightAt(7 + distance, 9), z: 9 })
    const predator = game.state.predators[0]
    Object.assign(predator, { kind, x: 7 + distance, z: 9, state: 'chase', targetId: local.id })
    game.state.predators = [predator]
    expect(coverAt(local.x, local.y, local.z, true)).toBe('under')
    const tracker = new ThreatTracker()
    tracker.update(game.state)
    predator.targetId = friend.id
    tracker.update(game.state)
    game.state.time += 0.5
    tracker.update(game.state)
    expect(tracker.targets.get(predator.id)?.has(local.id)).toBe(visible)
  })

  it.each([
    ['crocodile', true],
    ['fox', false]
  ] as const)('retains a rabbit in shallow water only when a %s can see it', (kind, visible) => {
    const game = new Game(1)
    game.addPlayer('local', 'Local')
    game.addPlayer('friend', 'Friend')
    const [local, friend] = game.state.players
    Object.assign(local, { x: -55, y: heightAt(-55, -36), z: -36, hidden: true })
    Object.assign(friend, { x: -54, y: heightAt(-54, -36), z: -36 })
    const predator = game.state.predators[0]
    Object.assign(predator, { kind, x: -54, z: -36, state: 'chase', targetId: local.id })
    game.state.predators = [predator]
    expect(coverAt(local.x, local.y, local.z, true)).toBe('water')
    const tracker = new ThreatTracker()
    tracker.update(game.state)
    predator.targetId = friend.id
    tracker.update(game.state)
    game.state.time += 0.5
    tracker.update(game.state)
    expect(tracker.targets.get(predator.id)?.has(local.id)).toBe(visible)
  })

  it('keeps one continuous cooperative chase from repeatedly firing alerts or escape effects', () => {
    const elements: { className: string; texts: string[]; adds: number; classList: DOMTokenList }[] = []
    const element = (): HTMLElement => {
      const classes = new Set<string>()
      const node = {
        ownerDocument: { createElement: element, addEventListener: vi.fn(), removeEventListener: vi.fn() },
        className: '',
        dataset: {},
        hidden: false,
        texts: [] as string[],
        adds: 0,
        style: { setProperty: vi.fn() },
        getBoundingClientRect: () => ({ width: 800, height: 600, left: 0, top: 0 }),
        classList: {
          add: (value: string) => {
            if (value === 'fx-on') node.adds++
            classes.add(value)
          },
          remove: (value: string) => classes.delete(value),
          contains: (value: string) => classes.has(value),
          toggle: (value: string, force?: boolean) =>
            (force ?? !classes.has(value)) ? classes.add(value) : classes.delete(value)
        },
        setAttribute: vi.fn(),
        appendChild: vi.fn(),
        addEventListener: vi.fn(),
        removeEventListener: vi.fn(),
        remove: vi.fn(),
        set textContent(value: string) {
          this.texts.push(value)
        }
      }
      elements.push(node as unknown as (typeof elements)[number])
      return node as unknown as HTMLElement
    }
    const emit = vi.fn()
    const announce = vi.fn()
    const audio = new RabbitersAudio()
    const alarm = vi.spyOn(audio as unknown as { alarm(): void }, 'alarm').mockImplementation(() => {})
    const sound = vi.spyOn(RabbitersSfx.prototype, 'play').mockImplementation(() => {})
    const feel = new GameFeel({ fx: { emit } as never, screenPoint: () => null }, element(), announce)
    const game = new Game(1)
    game.addPlayer('a', 'A')
    game.addPlayer('b', 'B')
    const fox = game.state.predators.find((predator) => predator.kind === 'fox')!
    for (const predator of [...game.state.predators]) if (predator !== fox) game.removePredator(predator.id)
    Object.assign(fox, { x: -88, z: -30, angle: 0, state: 'patrol', targetId: null, suspicion: 0 })
    const place = () => {
      const wiggle = 0.15 * Math.sin(game.state.time * 5)
      for (const [index, player] of game.state.players.entries()) {
        const distance = 3.2 + (index === 0 ? wiggle : -wiggle)
        const side = index === 0 ? -0.7 : 0.7
        Object.assign(player, {
          x: fox.x + Math.sin(fox.angle) * distance + Math.cos(fox.angle) * side,
          z: fox.z + Math.cos(fox.angle) * distance - Math.sin(fox.angle) * side,
          downed: false,
          health: 100
        })
      }
    }
    try {
      place()
      feel.update(game.state, 'a')
      audio.update(game.state, 'a')
      let switches = 0
      let previous = fox.targetId
      for (let frame = 0; frame < 600; frame++) {
        game.step(1 / 60)
        place()
        if (previous && fox.targetId && previous !== fox.targetId) switches++
        previous = fox.targetId
        feel.update(game.state, 'a')
        audio.update(game.state, 'a')
      }
      const detection = elements.find((node) => node.className === 'fx-detection')!
      const badge = elements.find((node) => node.className === 'fx-threat')!
      expect(switches).toBeGreaterThan(10)
      expect(alarm).toHaveBeenCalledTimes(1)
      expect(announce).toHaveBeenCalledTimes(1)
      expect(detection.adds).toBe(1)
      expect(badge.texts.filter((text) => text.includes('ひと息'))).toHaveLength(0)
      expect(emit.mock.calls.filter(([event]) => event.type === 'escaped')).toHaveLength(0)
    } finally {
      feel.dispose()
      audio.stop()
      sound.mockRestore()
    }
  })

  it.each(['won', 'lost'] as const)('preserves the %s flash across subsequent frames', (phase) => {
    const elements: { className: string; classList: DOMTokenList; style: { setProperty: ReturnType<typeof vi.fn> } }[] =
      []
    const element = (): HTMLElement => {
      const classes = new Set<string>()
      const node = {
        ownerDocument: { createElement: element, addEventListener: vi.fn(), removeEventListener: vi.fn() },
        className: '',
        dataset: {},
        style: { setProperty: vi.fn() },
        classList: {
          add: (value: string) => classes.add(value),
          remove: (value: string) => classes.delete(value),
          contains: (value: string) => classes.has(value),
          toggle: (value: string, force?: boolean) =>
            (force ?? !classes.has(value)) ? classes.add(value) : classes.delete(value)
        },
        setAttribute: vi.fn(),
        appendChild: vi.fn(),
        addEventListener: vi.fn(),
        removeEventListener: vi.fn(),
        remove: vi.fn()
      }
      elements.push(node as unknown as (typeof elements)[number])
      return node as unknown as HTMLElement
    }
    const announce = vi.fn()
    const feel = new GameFeel({ fx: { emit: vi.fn() } as never, screenPoint: () => null }, element(), announce)
    const game = new Game()
    game.addPlayer('local', 'Rabbit')
    try {
      feel.update(game.state, 'local')
      game.state.time += 0.1
      game.state.discoveries = [
        { predatorId: 'mom', targetId: 'local', count: 1, time: game.state.time, x: 0, y: 0, z: 0 }
      ]
      game.state.phase = phase
      feel.update(game.state, 'local')
      feel.update(game.state, 'local')
      const flash = elements.find(
        (node) => node.className === `fx-flash fx-flash-${phase === 'won' ? 'sweep' : 'lost'}`
      )!
      expect(flash.classList.contains('fx-on')).toBe(true)
      if (phase === 'lost') {
        expect(announce).toHaveBeenCalledTimes(1)
        expect(elements.find((node) => node.className === 'fx-detection')!.classList.contains('fx-on')).toBe(true)
        expect(elements.filter((node) => node.className === 'fx-layer')[1].style.setProperty).toHaveBeenLastCalledWith(
          'z-index',
          '6'
        )
        feel.reset()
        expect(elements.find((node) => node.className === 'fx-detection')!.classList.contains('fx-on')).toBe(false)
      }
      if (phase === 'won')
        expect(elements.find((node) => node.className === 'fx-burst')!.classList.contains('fx-on')).toBe(true)
    } finally {
      feel.dispose()
    }
  })

  it.each(['suspicious', 'history', 'cleared', 'chase', 'new hunter', 'rediscovered', 'downed', 'missing'] as const)(
    'restores only a current suspicion cue after retry: %s',
    (scenario) => {
      const element = (): HTMLElement =>
        ({
          ownerDocument: { createElement: element },
          className: '',
          dataset: {},
          style: { setProperty: vi.fn() },
          classList: { add: vi.fn(), remove: vi.fn(), toggle: vi.fn() },
          setAttribute: vi.fn(),
          appendChild: vi.fn(),
          addEventListener: vi.fn(),
          removeEventListener: vi.fn(),
          remove: vi.fn()
        }) as unknown as HTMLElement
      const emit = vi.fn()
      const sound = vi.spyOn(RabbitersSfx.prototype, 'play').mockImplementation(() => {})
      const hudEmit = vi.spyOn(HudFx.prototype, 'emit').mockImplementation(() => {})
      const feel = new GameFeel({ fx: { emit } as never, screenPoint: () => null }, element())
      const game = new Game()
      game.addPlayer('local', 'Rabbit')
      const predator = game.state.predators[0]
      game.state.predators = [predator]
      game.state.time = 10
      Object.assign(predator, { state: 'suspicious', targetId: 'local', suspicion: 0.5 })
      if (scenario === 'history' || scenario === 'rediscovered')
        game.state.discoveries = [{ predatorId: predator.id, targetId: 'local', count: 1, time: 9.5, x: 0, y: 0, z: 0 }]
      try {
        feel.reset(game.state, 'local')
        expect(emit).not.toHaveBeenCalled()
        if (scenario === 'cleared') Object.assign(predator, { state: 'patrol', targetId: null })
        if (scenario === 'chase') predator.state = 'chase'
        if (scenario === 'new hunter') game.state.predators.push({ ...predator, id: 'new-hunter' })
        if (scenario === 'rediscovered') game.state.discoveries![0].count++
        if (scenario === 'downed') game.state.players[0].downed = true
        if (scenario === 'missing') game.state.players = []
        feel.update(game.state, 'local')
        feel.update(game.state, 'local')
        const expected = ['suspicious', 'history', 'new hunter'].includes(scenario) ? 1 : 0
        expect(emit.mock.calls.filter(([event]) => event.type === 'suspicious')).toHaveLength(expected)
        expect(hudEmit.mock.calls.filter(([event]) => event.type === 'suspicious')).toHaveLength(expected)
        if (scenario !== 'chase' && scenario !== 'rediscovered')
          expect(emit.mock.calls.filter(([event]) => event.type === 'spotted')).toHaveLength(0)
      } finally {
        feel.dispose()
        sound.mockRestore()
        hudEmit.mockRestore()
      }
    }
  )

  it('baselines retry discoveries without suppressing new discoveries or current chase HUD', () => {
    const element = (): HTMLElement =>
      ({
        ownerDocument: { createElement: element },
        className: '',
        dataset: {},
        style: { setProperty: vi.fn() },
        classList: { add: vi.fn(), remove: vi.fn(), toggle: vi.fn() },
        setAttribute: vi.fn(),
        appendChild: vi.fn(),
        addEventListener: vi.fn(),
        removeEventListener: vi.fn(),
        remove: vi.fn()
      }) as unknown as HTMLElement
    const emit = vi.fn()
    const cutIn = vi.fn()
    const sound = vi.spyOn(RabbitersSfx.prototype, 'play').mockImplementation(() => {})
    const hudEmit = vi.spyOn(HudFx.prototype, 'emit').mockImplementation(() => {})
    const threat = vi.spyOn(HudFx.prototype, 'setThreat')
    const feel = new GameFeel({ fx: { emit } as never, screenPoint: () => null }, element(), cutIn)
    const game = new Game()
    game.addPlayer('local', 'Rabbit')
    const checkpoint = structuredClone(game.state)
    const spotted = () => emit.mock.calls.filter(([event]) => event.type === 'spotted')
    try {
      feel.update(game.state, 'local')
      game.state.time = 10
      game.state.discoveries = [
        { predatorId: game.state.predators[0].id, targetId: 'local', count: 1, time: 10, x: 0, y: 0, z: 0 }
      ]
      feel.update(game.state, 'local')
      expect(cutIn).toHaveBeenCalledTimes(1)
      game.state.phase = 'lost'
      feel.update(game.state, 'local')
      const resumed = retryState(checkpoint, game.state)
      feel.reset(resumed, 'local')
      feel.update(resumed, 'local')
      feel.update(resumed, 'local')
      expect(cutIn).toHaveBeenCalledTimes(1)
      expect(spotted()).toHaveLength(1)
      expect(hudEmit.mock.calls.filter(([event]) => event.type === 'spotted')).toHaveLength(1)
      resumed.discoveries![0].count++
      Object.assign(resumed.predators[0], { state: 'chase', targetId: 'local' })
      feel.update(resumed, 'local')
      feel.update(resumed, 'local')
      expect(cutIn).toHaveBeenCalledTimes(2)
      expect(spotted()).toHaveLength(2)
      expect(threat.mock.calls.at(-1)?.[0].mode).toBe('chase')
      resumed.phase = 'lost'
      feel.update(resumed, 'local')
      const retriedAgain = retryState(checkpoint, resumed)
      feel.reset(retriedAgain, 'local')
      retriedAgain.discoveries![0].count++
      feel.update(retriedAgain, 'local')
      feel.update(retriedAgain, 'local')
      expect(cutIn).toHaveBeenCalledTimes(3)
      expect(spotted()).toHaveLength(3)
      expect(hudEmit.mock.calls.filter(([event]) => event.type === 'spotted')).toHaveLength(3)
      feel.reset()
      feel.update(retriedAgain, 'local')
      expect(cutIn).toHaveBeenCalledTimes(4)
      expect(spotted()).toHaveLength(4)
    } finally {
      feel.dispose()
      sound.mockRestore()
      hudEmit.mockRestore()
      threat.mockRestore()
    }
  })

  it.each(['chase', 'downed', 'skipped retry'] as const)('keeps discovery visible on %s to defeat', (scenario) => {
    vi.useFakeTimers()
    const elements: HTMLElement[] = []
    const element = (): HTMLElement => {
      const classes = new Set<string>()
      const node = {
        ownerDocument: { createElement: element },
        className: '',
        dataset: {},
        style: { setProperty: vi.fn() },
        getBoundingClientRect: () => ({ width: 800, height: 600, left: 0, top: 0 }),
        classList: {
          add: (value: string) => classes.add(value),
          remove: (value: string) => classes.delete(value),
          contains: (value: string) => classes.has(value),
          toggle: vi.fn()
        },
        setAttribute: vi.fn(),
        appendChild: vi.fn(),
        addEventListener: vi.fn(),
        removeEventListener: vi.fn(),
        remove: vi.fn()
      } as unknown as HTMLElement
      elements.push(node)
      return node
    }
    const emit = vi.fn()
    const announce = vi.fn()
    const sound = vi.spyOn(RabbitersSfx.prototype, 'play').mockImplementation(() => {})
    const feel = new GameFeel({ fx: { emit } as never, screenPoint: () => null }, element(), announce)
    const game = new Game()
    game.addPlayer('local', 'Rabbit')
    const player = game.state.players[0]
    const predator = game.state.predators[0]
    const detection = elements.find((node) => node.className === 'fx-detection')!
    const detectionLayer = elements.filter((node) => node.className === 'fx-layer')[1]
    const animationEnd = vi
      .mocked(detection.addEventListener)
      .mock.calls.find(([type]) => type === 'animationend')![1] as EventListener
    const update = () => feel.update(game.state, 'local')
    try {
      update()
      game.state.time = 1
      if (scenario === 'skipped retry') {
        game.state.phase = 'lost'
        player.downed = true
        game.state.discoveries = [
          { predatorId: predator.id, targetId: 'local', count: 1, time: 0, x: predator.x, y: predator.y, z: predator.z }
        ]
        update()
        game.state.time = 2
        game.state.discoveries[0].count = 2
        game.state.discoveries[0].time = 2
      } else {
        Object.assign(predator, { state: 'chase', targetId: 'local' })
        update()
        if (scenario === 'downed') {
          player.downed = true
          Object.assign(predator, { state: 'patrol', targetId: null })
          update()
        }
        game.state.phase = 'lost'
      }
      update()
      vi.advanceTimersByTime(250)
      update()
      expect(detection.classList.contains('fx-on')).toBe(true)
      expect(detectionLayer.style.setProperty).toHaveBeenLastCalledWith('z-index', '6')
      expect(announce).toHaveBeenCalledTimes(1)
      expect(emit.mock.calls.filter(([event]) => event.type === 'spotted' && event.you)).toHaveLength(1)
      expect(sound.mock.calls.filter(([event]) => event.type === 'spotted' && event.you)).toHaveLength(1)
      expect(emit.mock.calls.filter(([event]) => event.type === 'lost')).toHaveLength(1)
      expect(elements.find((node) => node.className === 'fx-flash fx-flash-lost')!.classList.contains('fx-on')).toBe(
        true
      )
      animationEnd(new Event('animationend'))
      update()
      expect(detection.classList.contains('fx-on')).toBe(false)
      expect(detectionLayer.style.setProperty).toHaveBeenLastCalledWith('z-index', '4')
    } finally {
      feel.dispose()
      sound.mockRestore()
      vi.useRealTimers()
    }
  })

  it.each(['chase', 'same-step', 'legacy-same-step'] as const)(
    'preserves %s discovery while downed and handles revival and cleanup',
    (scenario) => {
      vi.useFakeTimers()
      const elements: HTMLElement[] = []
      const element = (): HTMLElement => {
        const classes = new Set<string>()
        const node = {
          ownerDocument: { createElement: element },
          className: '',
          dataset: {},
          style: { setProperty: vi.fn() },
          getBoundingClientRect: () => ({ width: 800, height: 600, left: 0, top: 0 }),
          classList: {
            add: (value: string) => classes.add(value),
            remove: (value: string) => classes.delete(value),
            contains: (value: string) => classes.has(value),
            toggle: vi.fn()
          },
          setAttribute: vi.fn(),
          appendChild: vi.fn(),
          addEventListener: vi.fn(),
          removeEventListener: vi.fn(),
          remove: vi.fn()
        } as unknown as HTMLElement
        elements.push(node)
        return node
      }
      const emit = vi.fn()
      const sound = vi.spyOn(RabbitersSfx.prototype, 'play').mockImplementation(() => {})
      const feel = new GameFeel({ fx: { emit } as never, screenPoint: () => null }, element())
      const game = new Game()
      game.addPlayer('local', 'Rabbit')
      game.addPlayer('other', 'Other')
      const player = game.state.players[0]
      const predator = game.state.predators[0]
      const detection = elements.find((node) => node.className === 'fx-detection')!
      const badge = elements.find((node) => node.className === 'fx-threat')!
      const animationEnd = vi
        .mocked(detection.addEventListener)
        .mock.calls.find(([type]) => type === 'animationend')![1] as EventListener
      const update = () => feel.update(game.state, 'local')
      const visible = () => detection.classList.contains('fx-on')
      try {
        if (scenario === 'legacy-same-step') delete game.state.discoveries
        update()
        game.state.time = 1
        if (scenario === 'chase') {
          Object.assign(predator, { state: 'chase', targetId: 'local' })
          update()
        } else if (scenario === 'same-step') {
          game.state.discoveries = [{ predatorId: predator.id, targetId: 'local', count: 1, time: 1, x: 0, y: 0, z: 0 }]
        }
        player.downed = true
        Object.assign(predator, {
          state: scenario === 'legacy-same-step' ? 'chase' : 'patrol',
          targetId: scenario === 'legacy-same-step' ? 'local' : null
        })
        update()
        expect(visible()).toBe(true)
        vi.advanceTimersByTime(250)
        update()
        expect(visible()).toBe(true)
        expect(badge.hidden).toBe(true)
        expect(emit.mock.calls.filter(([event]) => event.type === 'spotted' && event.you)).toHaveLength(1)
        expect(emit.mock.calls.filter(([event]) => event.type === 'escaped')).toHaveLength(0)
        expect(sound.mock.calls.filter(([event]) => event.type === 'spotted' && event.you)).toHaveLength(1)
        animationEnd(new Event('animationend'))
        Object.assign(predator, { state: 'patrol', targetId: null })
        update()
        expect(visible()).toBe(false)
        player.downed = false
        game.state.time = 2
        update()
        expect(visible()).toBe(false)
        expect(emit.mock.calls.filter(([event]) => event.type === 'escaped')).toHaveLength(0)
        Object.assign(predator, { state: 'chase', targetId: 'local' })
        game.state.time = 3
        update()
        expect(visible()).toBe(true)
        expect(emit.mock.calls.filter(([event]) => event.type === 'spotted' && event.you)).toHaveLength(2)
        for (const cleanup of ['lost', 'won', 'reset', 'missing', 'undefined', 'dispose'] as const) {
          if (!visible()) {
            feel.reset()
            game.state.phase = 'playing'
            game.state.players = [player]
            update()
            expect(visible()).toBe(true)
          }
          player.downed = true
          if (cleanup === 'lost' || cleanup === 'won') game.state.phase = cleanup
          if (cleanup === 'reset') feel.reset()
          if (cleanup === 'missing') game.state.players = []
          if (cleanup === 'undefined') feel.update(undefined, 'local')
          if (cleanup === 'dispose') feel.dispose()
          if (cleanup === 'lost' || cleanup === 'won' || cleanup === 'missing') update()
          if (cleanup === 'lost') {
            expect(visible()).toBe(true)
            animationEnd(new Event('animationend'))
          }
          expect(visible()).toBe(false)
          player.downed = false
        }
      } finally {
        feel.dispose()
        sound.mockRestore()
        vi.useRealTimers()
      }
    }
  )

  it.each(['fx-detection-impact', 'fx-detection-fade'])(
    'keeps short chases visible until %s ends, but clears on reset, game end and disposal',
    (animationName) => {
      vi.useFakeTimers()
      const elements: HTMLElement[] = []
      const makeElement = () => {
        const classes = new Set<string>()
        const element = {
          className: '',
          dataset: {},
          style: { setProperty: vi.fn() },
          classList: {
            add: (value: string) => classes.add(value),
            remove: (value: string) => classes.delete(value),
            contains: (value: string) => classes.has(value)
          },
          appendChild: vi.fn(),
          setAttribute: vi.fn(),
          addEventListener: vi.fn(),
          remove: vi.fn()
        } as unknown as HTMLElement
        elements.push(element)
        return element
      }
      const root = { ownerDocument: { createElement: makeElement }, appendChild: vi.fn() } as unknown as HTMLElement
      const hud = new HudFx(root)
      const detection = elements.find((element) => element.className === 'fx-detection')!
      const animationEnd = vi
        .mocked(detection.addEventListener)
        .mock.calls.find(([type]) => type === 'animationend')![1] as EventListener
      const chase = { mode: 'chase', count: 1, suspicion: 1 } as const
      try {
        for (const mode of ['search', 'clear'] as const) {
          hud.setThreat(chase)
          vi.advanceTimersByTime(100)
          hud.setThreat({ mode, count: 0, suspicion: 0 })
          vi.advanceTimersByTime(1099)
          expect(detection.classList.contains('fx-on')).toBe(true)
          animationEnd({ animationName } as unknown as Event)
          expect(detection.classList.contains('fx-on')).toBe(false)
        }
        hud.setThreat(chase)
        hud.reset()
        expect(detection.classList.contains('fx-on')).toBe(false)
        hud.setThreat(chase)
        hud.setThreat({ mode: 'clear', count: 0, suspicion: 0 }, false)
        expect(detection.classList.contains('fx-on')).toBe(true)
        hud.reset()
        expect(detection.classList.contains('fx-on')).toBe(false)
        hud.setThreat(chase)
        hud.dispose()
        expect(detection.classList.contains('fx-on')).toBe(false)
      } finally {
        hud.dispose()
        vi.useRealTimers()
      }
    }
  )

  it('remembers only related searchers across target loss, retargeting, removal and phase changes', () => {
    const game = new Game()
    game.addPlayer('local', 'Rabbit')
    game.addPlayer('other', 'Other')
    const tracker = new ThreatTracker()
    const [first, second] = game.state.predators
    Object.assign(first, { state: 'chase', targetId: 'local' })
    Object.assign(second, { state: 'search', targetId: null })
    tracker.update(game.state)
    Object.assign(first, { state: 'search', targetId: null })
    tracker.update(game.state)
    expect(threatFor(game.state, 'local', tracker).mode).toBe('search')
    expect(threatFor(game.state, 'other', tracker).mode).toBe('clear')
    Object.assign(first, { state: 'suspicious', targetId: 'other' })
    tracker.update(game.state)
    Object.assign(first, { state: 'search', targetId: null })
    tracker.update(game.state)
    expect(threatFor(game.state, 'local', tracker).mode).toBe('clear')
    expect(threatFor(game.state, 'other', tracker).mode).toBe('search')
    game.state.predators = game.state.predators.filter((entry) => entry.id !== first.id)
    tracker.update(game.state)
    expect(tracker.targets.size).toBe(0)
    Object.assign(second, { state: 'suspicious', targetId: 'local' })
    tracker.update(game.state)
    game.state.phase = 'lost'
    tracker.update(game.state)
    expect(tracker.targets.size).toBe(0)
    tracker.reset()
  })

  it('forgets departed targets while retaining current rabbits and kits', () => {
    const game = new Game()
    game.addPlayer('local', 'Rabbit')
    game.addPlayer('other', 'Other')
    const [predator] = game.state.predators
    for (const player of game.state.players) Object.assign(player, { x: predator.x, z: predator.z })
    game.state.kits = [{ id: 'kit', x: predator.x, y: 0, z: predator.z, angle: 0, hidden: false, status: 'follow' }]
    const tracker = new ThreatTracker()
    Object.assign(predator, { state: 'chase', targetId: 'other' })
    tracker.update(game.state)
    predator.targetId = 'kit'
    tracker.update(game.state)
    predator.targetId = 'local'
    tracker.update(game.state)
    game.removePlayer('other')
    tracker.update(game.state)
    expect(tracker.targets.get(predator.id)).toEqual(new Set(['kit', 'local']))
    game.addPlayer('other', 'Other')
    tracker.update(game.state)
    expect(threatFor(game.state, 'other', tracker).mode).toBe('clear')
    predator.targetId = 'other'
    tracker.update(game.state)
    expect(threatFor(game.state, 'other', tracker).mode).toBe('chase')
    game.state.kits = []
    tracker.update(game.state)
    expect(tracker.targets.get(predator.id)).toEqual(new Set(['local', 'other']))
  })

  it('ends a local chase when the same predator follows a teammate far away', () => {
    const game = new Game()
    game.addPlayer('local', 'Rabbit')
    game.addPlayer('other', 'Other')
    const [local, other] = game.state.players
    const [predator] = game.state.predators
    game.state.predators = [predator]
    Object.assign(local, { x: 0, z: 0, hidden: false })
    Object.assign(other, { x: 2, z: 0 })
    Object.assign(predator, { x: 0, z: 0, state: 'patrol', targetId: null })
    const tracker = new ThreatTracker()
    const detector = new JuiceDetector()
    const update = () => {
      game.state.time++
      tracker.update(game.state)
      return detector.update(game.state, 'local')
    }
    update()
    Object.assign(predator, { state: 'chase', targetId: 'local' })
    expect(update().filter((event) => event.type === 'spotted' && event.you)).toHaveLength(1)
    predator.targetId = 'other'
    expect(update().filter((event) => event.type === 'escaped')).toHaveLength(0)
    expect(threatFor(game.state, 'local', tracker).mode).toBe('chase')
    predator.x = other.x = 100
    expect(update().filter((event) => event.type === 'escaped')).toHaveLength(1)
    expect(threatFor(game.state, 'local', tracker).mode).toBe('clear')
    expect(threatFor(game.state, 'other', tracker).mode).toBe('chase')
    expect(update().filter((event) => event.type === 'escaped')).toHaveLength(0)
    Object.assign(predator, { x: 0, targetId: 'local' })
    expect(update().filter((event) => event.type === 'spotted' && event.you)).toHaveLength(1)
    expect(threatFor(game.state, 'local', tracker).mode).toBe('chase')
  })

  it('defers escape effects through multiple searches, ignores stale frames and resets local ownership', () => {
    const element = (): HTMLElement =>
      ({
        ownerDocument: { createElement: element },
        className: '',
        dataset: {},
        style: { setProperty: vi.fn() },
        classList: { add: vi.fn(), remove: vi.fn(), toggle: vi.fn() },
        setAttribute: vi.fn(),
        appendChild: vi.fn(),
        addEventListener: vi.fn(),
        removeEventListener: vi.fn(),
        remove: vi.fn()
      }) as unknown as HTMLElement
    const emit = vi.fn()
    const sound = vi.spyOn(RabbitersSfx.prototype, 'play').mockImplementation(() => {})
    const hudEmit = vi.spyOn(HudFx.prototype, 'emit').mockImplementation(() => {})
    const threat = vi.spyOn(HudFx.prototype, 'setThreat')
    const feel = new GameFeel({ fx: { emit } as never, screenPoint: () => null }, element())
    const game = new Game()
    game.addPlayer('local', 'Rabbit')
    game.addPlayer('other', 'Other')
    const [first, second] = game.state.predators
    const update = (time: number, id = 'local') => {
      game.state.time = time
      feel.update(game.state, id)
    }
    const escapes = () => emit.mock.calls.filter(([event]) => event.type === 'escaped').length
    try {
      update(0)
      Object.assign(first, { state: 'chase', targetId: 'local' })
      Object.assign(second, { state: 'chase', targetId: 'local' })
      update(1)
      Object.assign(first, { state: 'search', targetId: null })
      update(2)
      expect(escapes()).toBe(0)
      Object.assign(second, { state: 'search', targetId: null })
      update(3)
      expect(threat.mock.calls.at(-1)?.[0].mode).toBe('search')
      expect(escapes()).toBe(0)
      first.state = 'patrol'
      update(2.5)
      expect(threat.mock.calls.at(-1)?.[0].mode).toBe('search')
      update(4)
      expect(escapes()).toBe(0)
      second.state = 'patrol'
      update(7.5)
      expect(escapes()).toBe(1)
      expect(sound.mock.calls.filter(([event]) => event.type === 'escaped')).toHaveLength(1)
      Object.assign(first, { state: 'chase', targetId: 'local' })
      update(8)
      Object.assign(first, { state: 'search', targetId: null })
      update(9)
      Object.assign(first, { state: 'chase', targetId: 'local' })
      update(9.1)
      expect(escapes()).toBe(1)
      Object.assign(first, { state: 'search', targetId: null })
      update(9.2)
      update(10, 'other')
      expect(threat.mock.calls.at(-1)?.[0].mode).toBe('clear')
      first.state = 'patrol'
      update(11, 'other')
      expect(escapes()).toBe(1)
      feel.reset()
      update(0)
      expect(escapes()).toBe(1)
      Object.assign(first, { state: 'chase', targetId: 'local' })
      update(1)
      Object.assign(first, { state: 'search', targetId: null })
      update(2)
      game.state.phase = 'lost'
      update(3)
      game.state.phase = 'playing'
      first.state = 'patrol'
      update(4)
      expect(escapes()).toBe(1)
      Object.assign(first, { state: 'chase', targetId: 'local' })
      update(5)
      Object.assign(first, { state: 'search', targetId: null })
      update(6)
      feel.reset()
      first.state = 'patrol'
      update(0)
      expect(escapes()).toBe(1)
    } finally {
      feel.dispose()
      sound.mockRestore()
      hudEmit.mockRestore()
      threat.mockRestore()
    }
  })
  it('prioritizes local pursuers, keeps the last pursuer and ignores other players', () => {
    const game = new Game()
    game.addPlayer('local', 'Rabbit')
    const predator = game.state.predators[0]
    predator.targetId = 'local'
    predator.state = 'suspicious'
    predator.suspicion = 0.6
    expect(threatFor(game.state, 'local')).toEqual({ mode: 'suspicious', count: 1, suspicion: 0.6 })
    predator.state = 'chase'
    game.state.predators.push({ ...predator, id: 'second' })
    expect(threatFor(game.state, 'local').count).toBe(2)
    predator.targetId = 'other'
    expect(threatFor(game.state, 'local')).toEqual({ mode: 'chase', count: 1, suspicion: 1 })
    game.state.predators[game.state.predators.length - 1].state = 'search'
    expect(threatFor(game.state, 'local').mode).toBe('clear')
    expect(threatFor(game.state, 'missing').mode).toBe('clear')
    expect(threatFor(undefined, 'local').mode).toBe('clear')
    predator.targetId = 'local'
    game.state.players[0].downed = true
    expect(threatFor(game.state, 'local').mode).toBe('clear')
    game.state.players[0].downed = false
    game.state.phase = 'lost'
    expect(threatFor(game.state, 'local').mode).toBe('clear')
  })

  it('resets release timers and does not replay detection for additional pursuers', () => {
    vi.useFakeTimers()
    const elements: ReturnType<typeof makeElement>[] = []
    function makeElement() {
      const classes = new Set<string>()
      return {
        className: '',
        hidden: false,
        textContent: '',
        dataset: {} as Record<string, string>,
        offsetWidth: 100,
        style: { setProperty: vi.fn() },
        getBoundingClientRect: () => ({ width: 800, height: 600, left: 0, top: 0 }),
        classList: {
          add: vi.fn((value: string) => classes.add(value)),
          remove: vi.fn((value: string) => classes.delete(value))
        },
        setAttribute: vi.fn(),
        addEventListener: vi.fn(),
        appendChild: vi.fn(),
        remove: vi.fn()
      }
    }
    const root = {
      appendChild: vi.fn(),
      ownerDocument: {
        createElement: () => {
          const element = makeElement()
          elements.push(element)
          return element
        }
      }
    } as unknown as HTMLElement
    const hud = new HudFx(root)
    const detection = elements.find((element) => element.className === 'fx-detection')!
    const badge = elements.find((element) => element.className === 'fx-threat')!
    try {
      expect(elements.find((element) => element.className === 'fx-detection-message')?.textContent).toBe('見つかった！')
      expect(elements.find((element) => element.className === 'fx-detection-hint')?.textContent).toBe(
        'ぴんち！ 逃げよう！'
      )
      expect(detection.appendChild).toHaveBeenCalledTimes(3)
      hud.setThreat({ mode: 'chase', count: 1, suspicion: 1 })
      hud.setThreat({ mode: 'chase', count: 2, suspicion: 1 })
      hud.emit({ type: 'spotted', you: true, at: { x: 0, y: 0 } })
      hud.emit({ type: 'spotted', you: true, at: { x: 0, y: 0 } })
      expect(elements.filter((element) => element.className === 'fx-popup').every((element) => element.hidden)).toBe(
        true
      )
      expect(detection.classList.add).toHaveBeenCalledTimes(1)
      expect(badge.textContent).toContain('2体')
      const animationEnd = detection.addEventListener.mock.calls.find(([type]) => type === 'animationend')?.[1]
      animationEnd()
      expect(detection.classList.remove).toHaveBeenLastCalledWith('fx-on')
      hud.setThreat({ mode: 'chase', count: 3, suspicion: 1 })
      expect(detection.classList.add).toHaveBeenCalledTimes(1)
      hud.setThreat({ mode: 'search', count: 2, suspicion: 1 })
      expect(badge.textContent).toContain('捜索中')
      expect(badge.textContent).not.toContain('ひと息')
      hud.setThreat({ mode: 'chase', count: 2, suspicion: 1 })
      expect(detection.classList.add).toHaveBeenCalledTimes(2)
      hud.setThreat({ mode: 'search', count: 2, suspicion: 1 })
      hud.setThreat({ mode: 'clear', count: 0, suspicion: 0 })
      expect(badge.textContent).toContain('追跡が途切れた')
      hud.emit({ type: 'escaped', at: { x: 0, y: 0 } })
      hud.emit({ type: 'pickup', at: { x: 0, y: 0 } })
      const escapePopup = elements.find((element) => element.dataset.event === 'escaped')!
      const pickupPopup = elements.find((element) => element.dataset.event === 'pickup')!
      expect(escapePopup.hidden).toBe(false)
      hud.setThreat({ mode: 'chase', count: 1, suspicion: 1 })
      expect(escapePopup.hidden).toBe(true)
      expect(pickupPopup.hidden).toBe(false)
      hud.reset()
      expect(badge.hidden).toBe(true)
      expect(detection.classList.remove).toHaveBeenLastCalledWith('fx-on')
      hud.setThreat({ mode: 'suspicious', count: 1, suspicion: 0.5 })
      vi.advanceTimersByTime(2000)
      expect(badge.hidden).toBe(false)
      const hint = elements.find((element) => element.className === 'fx-detection-hint')!
      hud.emit({ type: 'spotted', you: true, at: { x: 0, y: 0 } })
      expect(hint.textContent).toBe('ぴんち！')
      hud.setThreat({ mode: 'chase', count: 1, suspicion: 1 })
      expect(hint.textContent).toBe('ぴんち！ 逃げよう！')
      hud.dispose()
      expect(vi.getTimerCount()).toBe(0)
    } finally {
      vi.useRealTimers()
    }
  })
})
