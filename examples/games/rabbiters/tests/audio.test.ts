import { afterEach, describe, expect, it, vi } from 'vitest'
import { Game, packSnapshot, unpackSnapshot } from '../src/game'
import { bindAudioResume, RabbitersAudio, ThreatTracker } from '../src/audio'
import { threatFor } from '../src/hud-fx'
import { JuiceDetector } from '../src/juice'
import { heightAt, ZONES } from '../src/map'
import { newMind, updatePredator } from '../src/stealth'
import { STEP } from '../src/stages/town/script'
import { STEP as WATERWAY_STEP } from '../src/stages/waterway/script'

const parameter = () => ({
  value: 0,
  setValueAtTime: vi.fn(),
  linearRampToValueAtTime: vi.fn(),
  exponentialRampToValueAtTime: vi.fn()
})
class Context {
  state = 'running'
  onstatechange: (() => void) | null = null
  currentTime = 0
  destination = {}
  gains: {
    gain: ReturnType<typeof parameter>
    connect: ReturnType<typeof vi.fn>
    disconnect: ReturnType<typeof vi.fn>
  }[] = []
  voices: ReturnType<Context['createOscillator']>[] = []
  resume = vi.fn(() => Promise.resolve())
  close = vi.fn(() => Promise.resolve())
  createGain() {
    const gain = { gain: parameter(), connect: vi.fn(), disconnect: vi.fn() }
    this.gains.push(gain)
    return gain
  }
  createOscillator() {
    const voice = {
      type: 'sine',
      frequency: parameter(),
      connect: vi.fn(),
      disconnect: vi.fn(),
      start: vi.fn(),
      stop: vi.fn(),
      onended: null
    }
    this.voices.push(voice)
    return voice
  }
}

afterEach(() => {
  vi.unstubAllGlobals()
  vi.useRealTimers()
})

const setup = (initialize?: (game: Game, audio: RabbitersAudio) => void) => {
  vi.useFakeTimers()
  const context = new Context()
  vi.stubGlobal(
    'AudioContext',
    vi.fn(function () {
      return context
    })
  )
  const audio = new RabbitersAudio()
  const game = new Game()
  game.addPlayer('local', 'Rabbit')
  for (const predator of game.state.predators) predator.targetId = 'local'
  audio.start()
  initialize?.(game, audio)
  audio.update(game.state, 'local')
  return { audio, game, context }
}

describe('Rabbiters audio', () => {
  it.each(
    (['suspended', 'interrupted', 'closed'] as const).flatMap((state) =>
      (['chase', 'suspicious'] as const).map((kind) => ({ state, kind }))
    )
  )('preserves a fresh $kind across $state context replacement once', async ({ state, kind }) => {
    const { audio, game, context } = setup()
    await Promise.resolve()
    let finishOldResume = () => {}
    context.resume.mockImplementation(() => new Promise<void>((resolve) => (finishOldResume = resolve)))
    audio.start()
    const oldCallback = context.onstatechange
    context.state = state
    game.state.time = 1
    game.state.predators[0].state = kind
    audio.update(game.state, 'local')
    expect(context.voices).toHaveLength(0)
    context.state = 'closed'
    const replacement = new Context()
    replacement.state = 'suspended'
    vi.stubGlobal(
      'AudioContext',
      vi.fn(function () {
        return replacement
      })
    )
    audio.start()
    await Promise.resolve()
    expect(replacement.voices).toHaveLength(0)
    context.state = 'running'
    oldCallback?.()
    finishOldResume()
    await Promise.resolve()
    expect(replacement.voices).toHaveLength(0)
    replacement.state = 'running'
    replacement.onstatechange?.()
    replacement.onstatechange?.()
    audio.start()
    audio.update(game.state, 'local')
    await Promise.resolve()
    expect(replacement.voices).toHaveLength(kind === 'chase' ? 4 : 2)
    expect(context.voices).toHaveLength(0)
    audio.stop()
  })

  it.each(
    (['chase', 'suspicious'] as const).flatMap((kind) =>
      [
        'wall expiry',
        'game expiry',
        'mute',
        'stop',
        'won',
        'stage',
        'chapter',
        ...(kind === 'suspicious' ? ['patrol', 'target', 'downed', 'discovery'] : [])
      ].flatMap((reason) => ['suspended', 'interrupted', 'closed'].map((state) => ({ kind, reason, state })))
    )
  )('invalidates $kind from $state before closed replacement after $reason', async ({ kind, reason, state }) => {
    const { audio, game, context } = setup()
    await Promise.resolve()
    context.state = state
    game.state.time = 1
    const predator = game.state.predators[0]
    predator.state = kind
    audio.update(game.state, 'local')
    if (reason === 'wall expiry') vi.setSystemTime(Date.now() + 551)
    if (reason === 'game expiry') game.state.time = 1.551
    if (reason === 'mute') {
      audio.setMuted(true)
      audio.setMuted(false)
    }
    if (reason === 'stop') audio.stop()
    if (reason === 'won') game.state.phase = 'won'
    if (reason === 'stage') {
      game.state.stage = 4
      game.state.predators = []
    }
    if (reason === 'chapter') game.state.chapter += 1
    if (reason === 'patrol') predator.state = 'patrol'
    if (reason === 'target') predator.targetId = null
    if (reason === 'downed') game.state.players[0].downed = true
    if (reason === 'discovery') predator.state = 'chase'
    if (reason !== 'stop') audio.update(game.state, 'local')
    context.state = 'closed'
    const replacement = new Context()
    vi.stubGlobal(
      'AudioContext',
      vi.fn(function () {
        return replacement
      })
    )
    audio.start()
    await Promise.resolve()
    replacement.onstatechange?.()
    expect(replacement.voices).toHaveLength(reason === 'discovery' ? 4 : 0)
    audio.stop()
  })

  it.each(['chase', 'suspicious'] as const)(
    'warns about a reused predator becoming suspicious after a missed chapter transition from %s',
    (previousState) => {
      const { audio, context } = setup()
      const game = new Game(3, undefined, 1)
      game.addPlayer('local')
      const local = game.state.players[0]
      const receive = () => unpackSnapshot(JSON.parse(JSON.stringify(packSnapshot(game.state))))!
      const detector = new JuiceDetector()
      const query = vi.spyOn(audio as unknown as { query(time: number): void }, 'query')
      audio.stop()
      audio.start()
      audio.update(receive(), local.id)
      detector.update(receive(), local.id)
      game.state.step = STEP.bank
      game.state.open = 1
      Object.assign(local, { x: 140, y: heightAt(140, -64), z: -64, hidden: false })
      const townCrow = game.state.predators.find((predator) => predator.id === 'crow-1')!
      game.state.predators = [townCrow]
      Object.assign(townCrow, {
        x: 140,
        y: local.y + 2,
        z: previousState === 'chase' ? -66 : -74,
        angle: 0,
        state: 'patrol',
        targetId: null,
        suspicion: 0
      })
      game.step(1 / 60)
      expect(townCrow).toMatchObject({ state: previousState, targetId: local.id })
      const oldSnapshot = receive()
      audio.update(oldSnapshot, local.id)
      detector.update(oldSnapshot, local.id)
      query.mockClear()
      Object.assign(local, { x: 146, y: heightAt(146, -64), z: -64 })
      game.step(1 / 60)
      expect(game.state.stage).toBe(2)
      game.state.step = WATERWAY_STEP.outfall
      game.state.open = 1
      const outfall = ZONES.find((zone) => zone.id === 'outfall')!
      const exitX = (outfall.minX + outfall.maxX) / 2
      const exitZ = (outfall.minZ + outfall.maxZ) / 2
      Object.assign(local, { x: exitX, y: heightAt(exitX, exitZ), z: exitZ })
      game.step(1 / 60)
      expect(game.state.step).toBe(WATERWAY_STEP.stones)
      const waterwayCrow = game.state.predators.find((predator) => predator.id === townCrow.id)!
      expect(waterwayCrow).not.toBe(townCrow)
      game.state.predators = [waterwayCrow]
      Object.assign(waterwayCrow, { x: 0, y: heightAt(0, -2) + 2, z: -2, angle: 0 })
      Object.assign(local, { x: 0, y: heightAt(0, 8), z: 8, hidden: false })
      game.step(1 / 60)
      expect(waterwayCrow).toMatchObject({ state: 'suspicious', targetId: local.id })
      const snapshot = receive()
      expect(threatFor(snapshot, local.id).mode).toBe('suspicious')
      const beforeVoices = context.voices.length
      audio.update(snapshot, local.id)
      expect.soft(query).toHaveBeenCalledTimes(1)
      expect.soft(detector.update(snapshot, local.id).filter((event) => event.type === 'suspicious')).toHaveLength(1)
      expect
        .soft(
          context.voices.slice(beforeVoices).some((voice) => voice.frequency.setValueAtTime.mock.calls[0][0] === 494)
        )
        .toBe(true)
      audio.update(oldSnapshot, local.id)
      audio.update(snapshot, local.id)
      expect(query).toHaveBeenCalledTimes(1)
      expect(detector.update(snapshot, local.id).filter((event) => event.type === 'suspicious')).toHaveLength(0)
      audio.stop()
    }
  )

  it.each([true, false])(
    'forgets the previous chapter chase when its exit snapshot is dropped (records: %s)',
    (records) => {
      const { audio, context } = setup()
      const game = new Game(3, undefined, 1)
      game.addPlayer('local')
      game.addPlayer('friend')
      const [local, friend] = game.state.players
      const receive = () => {
        const snapshot = unpackSnapshot(JSON.parse(JSON.stringify(packSnapshot(game.state))))!
        if (!records) delete snapshot.discoveries
        return snapshot
      }
      const alarm = vi.spyOn(audio as unknown as { alarm(): void }, 'alarm')
      const detector = new JuiceDetector()
      audio.stop()
      audio.start()
      audio.update(receive(), local.id)
      detector.update(receive(), local.id)
      game.state.step = STEP.bank
      game.state.open = 1
      Object.assign(local, { x: 140, y: heightAt(140, -64), z: -64, hidden: false })
      const townCrow = game.state.predators.find((predator) => predator.id === 'crow-1')!
      game.state.predators = [townCrow]
      Object.assign(townCrow, { x: 140, y: local.y + 2, z: -66, angle: 0, state: 'chase', targetId: local.id })
      game.step(1 / 60)
      expect(townCrow).toMatchObject({ state: 'chase', targetId: local.id })
      const oldSnapshot = receive()
      audio.update(oldSnapshot, local.id)
      detector.update(oldSnapshot, local.id)
      expect(alarm).toHaveBeenCalledTimes(1)
      Object.assign(local, { x: 146, y: heightAt(146, -64), z: -64 })
      game.step(1 / 60)
      expect(game.state.stage).toBe(2)
      game.state.step = WATERWAY_STEP.outfall
      game.state.open = 1
      const outfall = ZONES.find((zone) => zone.id === 'outfall')!
      const exitX = (outfall.minX + outfall.maxX) / 2
      const exitZ = (outfall.minZ + outfall.maxZ) / 2
      Object.assign(local, { x: exitX, y: heightAt(exitX, exitZ), z: exitZ })
      game.step(1 / 60)
      expect(game.state.step).toBe(WATERWAY_STEP.stones)
      const waterwayCrow = game.state.predators.find((predator) => predator.id === townCrow.id)!
      expect(waterwayCrow).not.toBe(townCrow)
      game.state.predators = [waterwayCrow]
      Object.assign(waterwayCrow, { x: 0, y: heightAt(0, -2) + 2, z: -2, angle: 0 })
      Object.assign(local, { x: 0, y: heightAt(0, 5), z: 5, hidden: false })
      Object.assign(friend, { x: 0, y: heightAt(0, 1), z: 1, hidden: false })
      game.step(1 / 60)
      expect(waterwayCrow).toMatchObject({ state: 'chase', targetId: friend.id })
      audio.update(receive(), local.id)
      detector.update(receive(), local.id)
      audio.update(oldSnapshot, local.id)
      const beforeRetarget = alarm.mock.calls.length
      const beforeVoices = context.voices.length
      game.state.time += 0.6
      context.currentTime += 0.6
      Object.assign(local, { x: 0, y: heightAt(0, 0), z: 0 })
      Object.assign(friend, { x: 0, y: heightAt(0, 5), z: 5 })
      game.step(1 / 60)
      expect(waterwayCrow).toMatchObject({ state: 'chase', targetId: local.id })
      expect(game.state.discoveries).toEqual(
        expect.arrayContaining([expect.objectContaining({ targetId: local.id, stage: 2 })])
      )
      audio.update(receive(), local.id)
      expect(
        detector.update(receive(), local.id).filter((event) => event.type === 'spotted' && event.you)
      ).toHaveLength(1)
      expect(alarm).toHaveBeenCalledTimes(beforeRetarget + 1)
      expect(context.voices).toHaveLength(beforeVoices + 4)
      expect(context.voices[beforeVoices].frequency.setValueAtTime).toHaveBeenCalledWith(160, 0.6)
      audio.update(receive(), local.id)
      expect(alarm).toHaveBeenCalledTimes(beforeRetarget + 1)
      expect(context.voices).toHaveLength(beforeVoices + 4)
      audio.stop()
    }
  )

  it.each(
    (['suspended', 'interrupted'] as const).flatMap((state) =>
      ([false, true] as const).flatMap((wasPlaying) =>
        (['none', 'discovery', 'instant defeat'] as const).map((fresh) => ({ state, wasPlaying, fresh }))
      )
    )
  )('clears old-stage alarm: $state, $wasPlaying, $fresh', async ({ state, wasPlaying, fresh }) => {
    const { audio, context } = setup()
    await Promise.resolve()
    const game = new Game(3, undefined, 1)
    game.addPlayer('local')
    const receive = () => unpackSnapshot(JSON.parse(JSON.stringify(packSnapshot(game.state))))!
    audio.stop()
    audio.start()
    audio.update(receive(), 'local')
    if (!wasPlaying) context.state = state
    game.state.step = STEP.bank
    game.state.open = 1
    const player = game.state.players[0]
    Object.assign(player, { x: 140, y: heightAt(140, -64), z: -64, hidden: false })
    game.state.predators = []
    const predator = game.spawnPredator('human', 140, -66)
    predator.angle = 0
    game.step(1 / 60)
    expect(game.state.discoveries).toMatchObject([{ targetId: 'local', count: 1, stage: 1 }])
    audio.update(receive(), 'local')
    expect(context.voices).toHaveLength(wasPlaying ? 4 : 0)
    context.state = state
    context.onstatechange?.()
    vi.advanceTimersByTime(100)
    Object.assign(player, { x: 146, y: heightAt(146, -64), z: -64 })
    game.step(1 / 60)
    expect(game.state.stage).toBe(2)
    if (fresh !== 'none') {
      game.state.predators = []
      Object.assign(player, { x: 0, y: heightAt(0, 0), z: 0, hidden: false })
      if (fresh === 'instant defeat') player.health = 0.1
      const nextPredator = game.spawnPredator(fresh === 'instant defeat' ? 'fox' : 'human', 0, -0.9)
      nextPredator.angle = 0
      game.step(1 / 60)
      expect(game.state.discoveries).toMatchObject([{ count: 2, stage: 2 }])
      expect(game.state.phase).toBe(fresh === 'instant defeat' ? 'lost' : 'playing')
    }
    audio.update(receive(), 'local')
    const previousVoices = wasPlaying ? 4 : 0
    for (const voice of context.voices.slice(0, previousVoices)) expect(voice.stop).toHaveBeenCalledTimes(2)
    context.state = 'running'
    context.onstatechange?.()
    context.onstatechange?.()
    expect(context.voices).toHaveLength(previousVoices + (fresh === 'none' ? 0 : 4))
    if (fresh !== 'none') expect(context.voices[previousVoices].frequency.setValueAtTime).toHaveBeenCalledWith(160, 0)
    audio.stop()
  })

  it('stops the old alarm before the next stage chime while audio is running', () => {
    const { audio, context } = setup()
    const game = new Game(3, undefined, 1)
    game.addPlayer('local')
    audio.stop()
    audio.start()
    audio.update(game.state, 'local')
    Object.assign(game.state.predators[0], { state: 'chase', targetId: 'local' })
    game.state.time = 1
    audio.update(game.state, 'local')
    const alarm = [...context.voices]
    expect(alarm).toHaveLength(4)
    game.nextStage()
    audio.update(game.state, 'local')
    expect(alarm.every((voice) => voice.stop.mock.calls.length === 2)).toBe(true)
    expect(context.voices.slice(4).some((voice) => voice.frequency.setValueAtTime.mock.calls[0][0] === 392)).toBe(true)
    audio.stop()
  })

  it.each(
    (['suspended', 'interrupted'] as const).flatMap((state) =>
      ([false, true] as const).map((fresh) => ({ state, fresh }))
    )
  )('discards an old query after a stage change while $state (fresh: $fresh)', async ({ state, fresh }) => {
    const { audio, game, context } = setup()
    await Promise.resolve()
    context.state = state
    game.state.time = 1
    const predator = game.state.predators[0]
    Object.assign(predator, { state: 'suspicious', targetId: 'local' })
    audio.update(game.state, 'local')
    const pending = audio as unknown as { pendingQuery: { time: number } | null }
    const oldQuery = pending.pendingQuery
    expect(oldQuery?.time).toBe(1)
    const oldSnapshot = unpackSnapshot(JSON.parse(JSON.stringify(packSnapshot(game.state))))!
    vi.setSystemTime(Date.now() + 600)
    game.enterStage(1)
    game.state.predators = [{ ...predator, ...(fresh ? {} : { state: 'patrol', targetId: null }) }]
    game.state.time = 1.1
    audio.update(unpackSnapshot(JSON.parse(JSON.stringify(packSnapshot(game.state))))!, 'local')
    expect(pending.pendingQuery).not.toBe(oldQuery)
    expect(pending.pendingQuery?.time ?? null).toBe(fresh ? 1.1 : null)
    audio.update(oldSnapshot, 'local')
    context.state = 'running'
    context.onstatechange?.()
    expect(context.voices).toHaveLength(fresh ? 2 : 0)
    context.onstatechange?.()
    expect(context.voices).toHaveLength(fresh ? 2 : 0)
    audio.stop()
  })

  it.each(['pending', 'playing'])('keeps the %s discovery ahead of a local query', async (alarm) => {
    const { audio, game, context } = setup()
    await Promise.resolve()
    game.addPlayer('friend', 'Friend')
    if (alarm === 'pending') context.state = 'suspended'
    game.state.time = 1
    Object.assign(game.state.predators[0], { state: 'chase', targetId: 'friend' })
    audio.update(game.state, 'local')
    Object.assign(game.state.predators[1], { state: 'suspicious', targetId: 'local' })
    game.state.time = 1.1
    audio.update(game.state, 'local')
    context.state = 'running'
    context.onstatechange?.()
    audio.start()
    await Promise.resolve()
    expect(context.voices).toHaveLength(4)
    expect(context.voices.some((voice) => voice.type === 'square')).toBe(true)
    audio.stop()
  })

  it.each(['suspended', 'interrupted'] as const)('resumes a fresh local query once after %s', async (state) => {
    const { audio, game, context } = setup()
    await Promise.resolve()
    context.state = state
    game.state.time = 1
    game.state.predators[0].state = 'suspicious'
    audio.update(game.state, 'local')
    expect(context.voices).toHaveLength(0)
    game.state.time = 1.1
    audio.update(game.state, 'local')
    context.state = 'running'
    context.onstatechange?.()
    audio.start()
    await Promise.resolve()
    context.onstatechange?.()
    expect(context.voices).toHaveLength(2)
    expect(context.voices[0].frequency.setValueAtTime).toHaveBeenCalledWith(494, 0)
    game.state.predators[0].state = 'patrol'
    audio.update(game.state, 'local')
    game.state.predators[0].state = 'suspicious'
    game.state.time = 2.9
    audio.update(game.state, 'local')
    expect(context.voices).toHaveLength(2)
    game.state.predators[0].state = 'patrol'
    audio.update(game.state, 'local')
    game.state.predators[0].state = 'suspicious'
    game.state.time = 3.1
    audio.update(game.state, 'local')
    expect(context.voices).toHaveLength(4)
    audio.stop()
  })

  it.each(['suspended', 'interrupted'] as const)(
    'resumes a fresh local query after an expired frozen alarm during %s',
    async (state) => {
      const { audio, game, context } = setup()
      await Promise.resolve()
      game.addPlayer('friend', 'Friend')
      game.state.time = 1
      Object.assign(game.state.predators[0], { state: 'chase', targetId: 'friend' })
      audio.update(game.state, 'local')
      context.state = state
      vi.setSystemTime(Date.now() + 600)
      game.state.time = 1.6
      Object.assign(game.state.predators[1], { state: 'suspicious', targetId: 'local' })
      audio.update(game.state, 'local')
      context.state = 'running'
      context.onstatechange?.()
      context.onstatechange?.()
      expect(context.voices).toHaveLength(6)
      expect(context.voices[4].frequency.setValueAtTime).toHaveBeenCalledWith(494, 0)
      audio.stop()
    }
  )

  it('keeps a pending local query when another chase ends', async () => {
    const { audio, game, context } = setup()
    await Promise.resolve()
    game.addPlayer('friend', 'Friend')
    game.state.time = 1
    Object.assign(game.state.predators[0], { state: 'chase', targetId: 'friend' })
    audio.update(game.state, 'local')
    context.currentTime = 1
    context.state = 'suspended'
    game.state.time = 2
    Object.assign(game.state.predators[1], { state: 'suspicious', targetId: 'local' })
    audio.update(game.state, 'local')
    game.state.time = 2.1
    game.state.predators[0].state = 'patrol'
    audio.update(game.state, 'local')
    context.state = 'running'
    context.onstatechange?.()
    context.onstatechange?.()
    expect(context.voices).toHaveLength(6)
    expect(context.voices[4].frequency.setValueAtTime).toHaveBeenCalledWith(494, 1)
    audio.stop()
  })

  it.each(['mute', 'stop', 'end', 'patrol', 'target', 'downed', 'wall expiry', 'game expiry', 'discovery'])(
    'discards a pending query after %s',
    async (reason) => {
      const { audio, game, context } = setup()
      await Promise.resolve()
      context.state = 'interrupted'
      game.state.time = 1
      const predator = game.state.predators[0]
      predator.state = 'suspicious'
      audio.update(game.state, 'local')
      const resume = context.onstatechange
      if (reason === 'mute') {
        audio.setMuted(true)
        audio.setMuted(false)
      }
      if (reason === 'stop') audio.stop()
      if (reason === 'end') game.state.phase = 'won'
      if (reason === 'patrol') predator.state = 'patrol'
      if (reason === 'target') predator.targetId = 'friend'
      if (reason === 'downed') game.state.players[0].downed = true
      if (reason === 'wall expiry') vi.setSystemTime(Date.now() + 551)
      if (reason === 'game expiry') game.state.time = 1.551
      if (reason === 'discovery') predator.state = 'chase'
      if (reason !== 'stop') audio.update(game.state, 'local')
      context.state = 'running'
      resume?.()
      resume?.()
      expect(context.voices).toHaveLength(reason === 'discovery' ? 4 : 0)
      expect(
        context.voices.every(
          (voice) => !voice.frequency.setValueAtTime.mock.calls.some(([frequency]) => frequency === 494)
        )
      ).toBe(true)
      audio.stop()
    }
  )

  it.each(['visibilitychange', 'pointerdown', 'keydown'] as const)(
    'resumes a fresh interrupted discovery after %s',
    (type) => {
      const { audio, game, context } = setup()
      const target = Object.assign(new EventTarget(), { hidden: false })
      const wakeEffects = vi.fn()
      const wake = vi.fn(() => {
        audio.start()
        wakeEffects()
      })
      const detach = bindAudioResume(target as unknown as Document, wake)
      try {
        context.state = 'interrupted'
        game.state.predators[0].state = 'chase'
        game.state.time = 1
        audio.update(game.state, 'local')
        expect(context.voices).toHaveLength(0)
        context.resume.mockClear()
        context.resume.mockImplementation(() => {
          context.state = 'running'
          context.onstatechange?.()
          return Promise.resolve()
        })
        target.dispatchEvent(new Event(type))
        expect(context.resume).toHaveBeenCalledOnce()
        expect(context.voices).toHaveLength(4)
        expect(wakeEffects).toHaveBeenCalledOnce()
        target.dispatchEvent(new Event(type))
        expect(context.voices).toHaveLength(4)
        detach()
        target.dispatchEvent(new Event(type))
        expect(wake).toHaveBeenCalledTimes(2)
      } finally {
        detach()
        audio.stop()
      }
    }
  )

  it('does not wake audio while hidden or for repeated keydown events', () => {
    const target = Object.assign(new EventTarget(), { hidden: true })
    const wake = vi.fn()
    const detach = bindAudioResume(target as unknown as Document, wake)
    try {
      for (const type of ['visibilitychange', 'pointerdown', 'keydown']) target.dispatchEvent(new Event(type))
      target.hidden = false
      const repeat = new Event('keydown')
      Object.defineProperty(repeat, 'repeat', { value: true })
      target.dispatchEvent(repeat)
      expect(wake).not.toHaveBeenCalled()
      target.dispatchEvent(new Event('keydown'))
      expect(wake).toHaveBeenCalledOnce()
    } finally {
      detach()
    }
  })

  it('warns once when the first snapshot already has a suspicious hunter watching you', () => {
    const { audio, game, context } = setup((game) => {
      const predator = game.state.predators[0]
      game.state.predators = [predator]
      Object.assign(predator, { state: 'suspicious', targetId: 'local' })
    })
    const detector = new JuiceDetector()
    expect(context.voices).toHaveLength(2)
    expect(detector.update(game.state, 'local')).toEqual([expect.objectContaining({ type: 'suspicious' })])
    for (let index = 0; index < 3; index++) {
      audio.update(game.state, 'local')
      expect(detector.update(game.state, 'local')).toEqual([])
    }
    expect(context.voices).toHaveLength(2)
    audio.stop()
  })

  it('warns when a newly observed hunter has become suspicious through the real AI', () => {
    const { audio, game, context } = setup()
    const predator = game.state.predators[0]
    game.state.predators = []
    const detector = new JuiceDetector()
    detector.update(game.state, 'local')
    audio.update(game.state, 'local')
    Object.assign(predator, { kind: 'fox', x: 0, y: 0, z: 0, angle: 0, state: 'patrol', targetId: null, suspicion: 0 })
    updatePredator(predator, newMind(), [{ id: 'local', x: 0, y: 0, z: 10, visibility: 1 }], {
      dt: 1 / 60,
      time: 1,
      droppings: [],
      scents: new Map(),
      terrain: { heightAt: () => 0, sightLine: () => 1 },
      random: () => 0.5
    })
    expect(predator).toMatchObject({ state: 'suspicious', targetId: 'local' })
    game.state.predators = [predator]
    game.state.time = context.currentTime = 1
    expect(threatFor(game.state, 'local').mode).toBe('suspicious')
    audio.update(game.state, 'local')
    expect(context.voices).toHaveLength(2)
    expect(detector.update(game.state, 'local')).toEqual([expect.objectContaining({ type: 'suspicious' })])
    audio.update(game.state, 'local')
    expect(detector.update(game.state, 'local')).toEqual([])
    expect(context.voices).toHaveLength(2)
    audio.stop()
  })

  it.each(['friend', 'missing', 'downed', 'muted', 'chasing', 'won', 'lost'] as const)(
    'does not play an initial suspicion cue for %s',
    (scenario) => {
      const { audio, game, context } = setup((game, audio) => {
        const predator = game.state.predators[0]
        game.state.predators = [predator]
        Object.assign(predator, { state: 'suspicious', targetId: scenario === 'friend' ? 'friend' : 'local' })
        if (scenario === 'friend') game.addPlayer('friend')
        if (scenario === 'missing') game.state.players = []
        if (scenario === 'downed') game.state.players[0].downed = true
        if (scenario === 'muted') audio.setMuted(true)
        if (scenario === 'won' || scenario === 'lost') game.state.phase = scenario
        if (scenario === 'chasing')
          game.state.predators.push({ ...predator, id: 'chaser', state: 'chase', targetId: 'local' })
      })
      const queryVoices = context.voices.filter((voice) =>
        [494, 587].includes(voice.frequency.setValueAtTime.mock.calls[0]?.[0])
      )
      expect(queryVoices).toHaveLength(0)
      if (scenario !== 'muted') {
        expect(new JuiceDetector().update(game.state, 'local').filter((event) => event.type === 'suspicious')).toEqual(
          []
        )
      }
      audio.setMuted(false)
      audio.update(game.state, 'local')
      expect(
        context.voices.filter((voice) => [494, 587].includes(voice.frequency.setValueAtTime.mock.calls[0]?.[0]))
      ).toHaveLength(0)
      audio.stop()
    }
  )

  it('prioritizes an active local chase over a newly observed suspicious hunter', () => {
    const { audio, game, context } = setup((game) => {
      game.state.predators[0].state = 'chase'
      game.state.predators = [game.state.predators[0]]
    })
    const detector = new JuiceDetector()
    detector.update(game.state, 'local')
    game.state.time = context.currentTime = 1
    game.state.predators.push({ ...game.state.predators[0], id: 'new-hunter', state: 'suspicious' })
    audio.update(game.state, 'local')
    expect(context.voices).toHaveLength(4)
    expect(detector.update(game.state, 'local').filter((event) => event.type === 'suspicious')).toEqual([])
    audio.stop()
  })

  it('warns again when retry restores an already suspicious local hunter', () => {
    const { audio, game, context } = setup((game) => {
      game.state.predators[0].state = 'suspicious'
      game.state.predators = [game.state.predators[0]]
    })
    expect(context.voices).toHaveLength(2)
    game.state.phase = 'lost'
    game.state.time = context.currentTime = 0.1
    audio.update(game.state, 'local')
    game.state.phase = 'playing'
    game.state.time = context.currentTime = 0.2
    audio.update(game.state, 'local')
    expect(
      context.voices.filter((voice) => [494, 587].includes(voice.frequency.setValueAtTime.mock.calls[0]?.[0]))
    ).toHaveLength(4)
    audio.update(game.state, 'local')
    expect(
      context.voices.filter((voice) => [494, 587].includes(voice.frequency.setValueAtTime.mock.calls[0]?.[0]))
    ).toHaveLength(4)
    audio.stop()
  })

  it('warns again when a revived rabbit is newly targeted during a teammate chase', () => {
    const { audio, game, context } = setup()
    game.addPlayer('friend', 'Friend')
    const [local, friend] = game.state.players
    const predator = game.state.predators.find((entry) => entry.kind === 'fox')!
    game.state.predators = [predator]
    Object.assign(local, { x: -122, y: heightAt(-122, -16), z: -16, hidden: false })
    Object.assign(friend, { x: -120, y: heightAt(-120, -16), z: -16, hidden: false })
    Object.assign(predator, { x: -124, y: heightAt(-124, -16), z: -16, state: 'patrol', targetId: null })
    const tracker = new ThreatTracker()
    const detector = new JuiceDetector()
    const alarm = vi.spyOn(audio as unknown as { alarm(): void }, 'alarm')
    const update = (time: number) => {
      game.state.time = context.currentTime = time
      tracker.update(game.state)
      audio.update(game.state, local.id)
      return detector.update(game.state, local.id)
    }
    try {
      update(0)
      Object.assign(predator, { state: 'chase', targetId: local.id })
      expect(update(1).filter((event) => event.type === 'spotted' && event.you)).toHaveLength(1)
      expect(alarm).toHaveBeenCalledTimes(1)
      local.downed = true
      expect(update(2).filter((event) => event.type === 'escaped')).toHaveLength(0)
      expect(update(2.1).filter((event) => event.type === 'escaped')).toHaveLength(0)
      expect(alarm).toHaveBeenCalledTimes(1)
      predator.targetId = friend.id
      update(3)
      local.downed = false
      expect(update(4).filter((event) => event.type === 'spotted' && event.you)).toHaveLength(0)
      expect(threatFor(game.state, local.id, tracker).mode).toBe('clear')
      predator.targetId = local.id
      expect(update(5).filter((event) => event.type === 'spotted' && event.you)).toHaveLength(1)
      expect(alarm).toHaveBeenCalledTimes(2)
      expect(update(6).filter((event) => event.type === 'spotted' && event.you)).toHaveLength(0)
      expect(alarm).toHaveBeenCalledTimes(2)
    } finally {
      audio.stop()
      alarm.mockRestore()
    }
  })

  it.each([0.02, 0.6])('shares an active team alarm but warns on a later local retarget (%s seconds)', (gap) => {
    const { audio, game, context } = setup()
    game.addPlayer('friend', 'Friend')
    const predator = game.state.predators[0]
    game.state.predators = [predator]
    Object.assign(predator, { state: 'chase', targetId: 'friend' })
    game.state.time = context.currentTime = 1
    audio.update(game.state, 'local')
    const firstAlarm = [...context.voices]
    expect(firstAlarm).toHaveLength(4)
    predator.targetId = 'local'
    game.state.time = context.currentTime = 1 + gap
    audio.update(game.state, 'local')
    expect(context.voices).toHaveLength(gap < 0.55 ? 4 : 8)
    expect(firstAlarm.every((voice) => voice.stop.mock.calls.length === (gap < 0.55 ? 1 : 2))).toBe(true)
    context.currentTime = 2
    audio.update(game.state, 'local')
    expect(context.voices).toHaveLength(gap < 0.55 ? 4 : 8)
    audio.stop()
  })

  it('does not truncate an alarm when defeat arrives in the next snapshot', () => {
    const { audio, game, context } = setup()
    game.state.time += 0.1
    game.state.discoveries = [
      { predatorId: 'mom', targetId: 'local', count: 1, time: game.state.time, x: 0, y: 0, z: 0 }
    ]
    audio.update(game.state, 'local')
    const alarm = context.voices.find((voice) => voice.frequency.setValueAtTime.mock.calls[0]?.[0] === 830)!
    game.state.phase = 'lost'
    audio.update(game.state, 'local')
    expect(alarm.stop).toHaveBeenCalledTimes(1)
    audio.stop()
  })

  it.each([false, true])('keeps instant-capture alarms through defeat (suspended=%s)', (suspended) => {
    const { audio, game, context } = setup()
    const alarm = vi.spyOn(audio as unknown as { alarm(): void }, 'alarm')
    if (suspended) context.state = 'suspended'
    game.state.time += 0.1
    game.state.phase = 'lost'
    game.state.players[0].downed = true
    game.state.discoveries = [
      { predatorId: 'mom', targetId: 'local', count: 1, time: game.state.time, x: 0, y: 0, z: 0 }
    ]
    audio.update(game.state, 'local')
    expect(alarm).toHaveBeenCalledTimes(1)
    audio.update(game.state, 'local')
    if (suspended) {
      context.state = 'running'
      context.onstatechange?.()
    }
    const alarms = context.voices.filter((voice) => voice.frequency.setValueAtTime.mock.calls[0]?.[0] === 830)
    expect(alarms).toHaveLength(1)
    audio.update(game.state, 'local')
    expect(alarms[0].stop).toHaveBeenCalledTimes(1)
    audio.setMuted(true)
    expect(alarms[0].stop).toHaveBeenCalledTimes(2)
    audio.stop()
  })

  it.each(['local', 'other', 'calm', 'muted'] as const)(
    'initializes retry alerts once for %s without replaying discoveries',
    (scenario) => {
      const { audio, game, context } = setup((game) => {
        game.state.predators[0].state = 'chase'
      })
      game.addPlayer('other', 'Other')
      game.state.time = 10
      game.state.phase = 'lost'
      game.state.discoveries = [{ predatorId: game.state.predators[0].id, targetId: 'local', count: 1, time: 10 }]
      audio.update(game.state, 'local')
      const beforeRetry = context.voices.length
      if (scenario === 'muted') audio.setMuted(true)
      game.state.phase = 'playing'
      if (scenario === 'other') game.state.predators[0].targetId = 'other'
      if (scenario === 'calm') game.state.predators[0].state = 'patrol'
      audio.update(game.state, 'local')
      expect(context.voices).toHaveLength(beforeRetry + (scenario === 'local' ? 4 : 0))
      audio.update(game.state, 'local')
      audio.setMuted(false)
      game.state.time += 0.1
      audio.update(game.state, 'local')
      expect(context.voices).toHaveLength(beforeRetry + (scenario === 'local' ? 4 : 0))
      audio.stop()
    }
  )

  it.each(['fresh', 'old', 'old increment', 'other', 'muted'] as const)(
    'only sounds a %s discovery received on the first frame after retry',
    (kind) => {
      const { audio, game, context } = setup()
      if (kind === 'other') game.addPlayer('other', 'Other')
      game.state.time = context.currentTime = 10
      game.state.phase = 'lost'
      game.state.discoveries = [{ predatorId: 'fox', targetId: 'local', count: 1, time: 0, x: 0, y: 0, z: 0 }]
      audio.update(game.state, 'local')
      const beforeRetry = context.voices.length
      if (kind === 'muted') audio.setMuted(true)
      game.state.phase = 'playing'
      game.state.time = context.currentTime = 10.1
      if (kind === 'fresh' || kind === 'muted' || kind === 'old increment') {
        game.state.discoveries[0].count++
        if (kind !== 'old increment') game.state.discoveries[0].time = game.state.time
      }
      if (kind === 'other')
        game.state.discoveries.push({ predatorId: 'fox', targetId: 'other', count: 1, time: 10.1, x: 0, y: 0, z: 0 })
      audio.update(game.state, 'local')
      audio.update(game.state, 'local')
      expect(context.voices).toHaveLength(beforeRetry + (kind === 'fresh' ? 4 : 0))
      audio.stop()
    }
  )

  it.each([
    'fresh',
    'stale',
    'future',
    'unchanged',
    'other',
    'missing',
    'muted',
    'suspended',
    'expired',
    'won',
    'no time'
  ] as const)('handles %s discovery when retry and defeat occur between snapshots', (kind) => {
    const { audio, game, context } = setup()
    game.addPlayer('other', 'Other')
    game.state.time = context.currentTime = 10
    game.state.phase = kind === 'won' ? 'won' : 'lost'
    game.state.players[0].downed = true
    game.state.discoveries = [{ predatorId: 'fox', targetId: 'local', count: 1, time: 0, x: 0, y: 0, z: 0 }]
    audio.update(game.state, 'local')
    const detector = new JuiceDetector()
    expect(detector.update(game.state, 'local')).toEqual([])
    const before = context.voices.length
    if (kind === 'muted') audio.setMuted(true)
    if (kind === 'suspended' || kind === 'expired') context.state = 'suspended'
    game.state.phase = 'lost'
    game.state.time = context.currentTime = 10.1
    if (kind === 'other') {
      game.state.discoveries.push({ predatorId: 'fox', targetId: 'other', count: 1, time: 10.05, x: 0, y: 0, z: 0 })
    } else {
      const entry = game.state.discoveries[0]
      if (kind !== 'unchanged') entry.count++
      entry.time = kind === 'stale' ? 10 : kind === 'future' ? 11 : kind === 'no time' ? undefined : 10.05
    }
    if (kind === 'missing') game.state.players = game.state.players.filter((player) => player.id !== 'local')
    const spotted = detector.update(game.state, 'local').filter((event) => event.type === 'spotted')
    expect(spotted).toHaveLength(['fresh', 'muted', 'suspended', 'expired'].includes(kind) ? 1 : 0)
    audio.update(game.state, 'local')
    audio.update(game.state, 'local')
    if (kind === 'suspended' || kind === 'expired') {
      if (kind === 'expired') vi.advanceTimersByTime(551)
      context.state = 'running'
      context.onstatechange?.()
    }
    expect(context.voices).toHaveLength(before + (kind === 'fresh' || kind === 'suspended' ? 4 : 0))
    expect(detector.update(game.state, 'local')).toEqual([])
    audio.stop()
  })

  it.each(['suspended', 'interrupted'] as const)(
    'replaces an expired frozen alarm with a fresh discovery after %s',
    (state) => {
      const { audio, game, context } = setup()
      game.state.predators[0].state = 'chase'
      game.state.time = 1
      audio.update(game.state, 'local')
      const oldAlarm = [...context.voices]
      context.state = state
      context.onstatechange?.()
      vi.advanceTimersByTime(600)
      game.state.predators[0].state = 'patrol'
      game.state.time = 1.6
      audio.update(game.state, 'local')
      game.state.predators[0].state = 'chase'
      game.state.time = 1.7
      audio.update(game.state, 'local')
      context.state = 'running'
      context.onstatechange?.()
      expect(context.voices).toHaveLength(8)
      expect(oldAlarm.every((voice) => voice.disconnect.mock.calls.length === 1)).toBe(true)
      expect(context.voices[4].frequency.setValueAtTime).toHaveBeenCalledWith(160, 0)
      context.onstatechange?.()
      audio.update(game.state, 'local')
      expect(context.voices).toHaveLength(8)
      audio.stop()
    }
  )

  it.each([
    ['suspended', 100, 4],
    ['suspended', 200, 8],
    ['interrupted', 100, 4],
    ['interrupted', 200, 8]
  ] as const)('keeps a fresh discovery through %s when resuming %sms later', (state, delay, voices) => {
    const { audio, game, context } = setup()
    game.state.predators[0].state = 'chase'
    game.state.time = 1
    audio.update(game.state, 'local')
    const oldAlarm = [...context.voices]
    context.state = state
    context.onstatechange?.()
    vi.advanceTimersByTime(400)
    game.state.predators[0].state = 'patrol'
    game.state.time = 1.4
    audio.update(game.state, 'local')
    game.state.predators[0].state = 'chase'
    game.state.time = 1.41
    audio.update(game.state, 'local')
    vi.advanceTimersByTime(delay)
    context.state = 'running'
    context.onstatechange?.()
    expect(context.voices).toHaveLength(voices)
    expect(oldAlarm.every((voice) => voice.disconnect.mock.calls.length === (voices === 8 ? 1 : 0))).toBe(true)
    context.onstatechange?.()
    audio.update(game.state, 'local')
    expect(context.voices).toHaveLength(voices)
    audio.stop()
  })

  it.each([100, 600])('retains only a fresh in-progress alarm after a %sms interruption', (elapsed) => {
    const { audio, game, context } = setup()
    game.state.predators[0].state = 'chase'
    game.state.time = 1
    audio.update(game.state, 'local')
    const alarm = [...context.voices]
    context.state = 'interrupted'
    context.onstatechange?.()
    vi.advanceTimersByTime(elapsed)
    context.state = 'running'
    context.onstatechange?.()
    expect(context.voices).toHaveLength(4)
    expect(alarm.every((voice) => voice.disconnect.mock.calls.length === (elapsed > 550 ? 1 : 0))).toBe(true)
    audio.stop()
  })

  it.each(['short', 'expired', 'mute', 'stop', 'won', 'lost'] as const)(
    'handles a frozen alarm and another discovery through %s',
    (action) => {
      const { audio, game, context } = setup()
      game.state.predators[0].state = 'chase'
      game.state.time = 1
      audio.update(game.state, 'local')
      context.state = 'interrupted'
      context.onstatechange?.()
      vi.advanceTimersByTime(action === 'short' ? 100 : 600)
      game.state.predators[0].state = 'patrol'
      game.state.time = 1.1
      audio.update(game.state, 'local')
      game.state.predators[0].state = 'chase'
      game.state.time = 1.2
      audio.update(game.state, 'local')
      if (action === 'expired') vi.advanceTimersByTime(551)
      else if (action === 'mute') {
        audio.setMuted(true)
        audio.setMuted(false)
      } else if (action === 'stop') audio.stop()
      else if (action === 'won' || action === 'lost') {
        game.state.phase = action
        audio.update(game.state, 'local')
      }
      const beforeResume = context.voices.length
      context.state = 'running'
      context.onstatechange?.()
      expect(context.voices).toHaveLength(beforeResume + (action === 'lost' ? 4 : 0))
      context.onstatechange?.()
      expect(context.voices).toHaveLength(beforeResume + (action === 'lost' ? 4 : 0))
      audio.stop()
    }
  )

  it.each(['suspended', 'interrupted'] as const)(
    'plays a fresh discovery when %s audio resumes without another start',
    (state) => {
      const { audio, game, context } = setup()
      context.state = state
      game.state.time = 1
      game.state.predators[0].state = 'chase'
      audio.update(game.state, 'local')
      expect(context.voices).toHaveLength(0)
      context.state = 'running'
      context.onstatechange?.()
      context.onstatechange?.()
      expect(context.voices).toHaveLength(4)
      audio.stop()
      context.onstatechange?.()
      expect(context.voices).toHaveLength(4)
    }
  )

  it.each(['elapsed', 'mute', 'end', 'stop'] as const)(
    'does not replay a pending discovery on automatic resume after %s',
    (reason) => {
      const { audio, game, context } = setup()
      context.state = 'interrupted'
      game.state.time = 1
      game.state.predators[0].state = 'chase'
      audio.update(game.state, 'local')
      const statechange = context.onstatechange
      if (reason === 'elapsed') vi.advanceTimersByTime(551)
      if (reason === 'mute') {
        audio.setMuted(true)
        audio.setMuted(false)
      }
      if (reason === 'end') {
        game.state.phase = 'won'
        audio.update(game.state, 'local')
      }
      if (reason === 'stop') audio.stop()
      context.state = 'running'
      statechange?.()
      expect(context.voices).toHaveLength(0)
      audio.stop()
    }
  )

  it('plays a fresh discovery after an in-progress audio resume', async () => {
    const { audio, game, context } = setup()
    context.state = 'suspended'
    let resume = () => {}
    context.resume.mockImplementation(
      () =>
        new Promise<void>((resolve) => {
          resume = () => {
            context.state = 'running'
            context.onstatechange?.()
            resolve()
          }
        })
    )
    audio.start()
    game.state.time = 1
    game.state.predators[0].state = 'chase'
    audio.update(game.state, 'local')
    expect(context.voices).toHaveLength(0)
    resume()
    await Promise.resolve()
    await Promise.resolve()
    expect(context.voices).toHaveLength(4)
    audio.stop()
  })

  it.each(['elapsed', 'simulation', 'mute', 'end', 'stop', 'replace'] as const)(
    'discards a pending discovery after %s',
    async (reason) => {
      const { audio, game, context } = setup()
      context.state = 'suspended'
      let resume = () => {}
      context.resume.mockImplementation(
        () =>
          new Promise<void>((resolve) => {
            resume = () => {
              context.state = 'running'
              resolve()
            }
          })
      )
      audio.start()
      game.state.time = 1
      game.state.predators[0].state = 'chase'
      audio.update(game.state, 'local')
      if (reason === 'elapsed') vi.advanceTimersByTime(551)
      if (reason === 'simulation') {
        game.state.time = 2
        audio.update(game.state, 'local')
      }
      if (reason === 'mute') {
        audio.setMuted(true)
        audio.setMuted(false)
      }
      if (reason === 'end') {
        game.state.phase = 'won'
        audio.update(game.state, 'local')
      }
      if (reason === 'stop' || reason === 'replace') {
        audio.stop()
        if (reason === 'replace') {
          const replacement = new Context()
          vi.stubGlobal(
            'AudioContext',
            vi.fn(function () {
              return replacement
            })
          )
        }
        audio.start()
      }
      resume()
      await Promise.resolve()
      await Promise.resolve()
      expect(context.voices).toHaveLength(0)
      audio.stop()
    }
  )

  it('preserves a short discovery through resume without duplicates or early music', async () => {
    const { audio, game, context } = setup()
    context.state = 'suspended'
    let resume = () => {}
    context.resume.mockImplementation(
      () =>
        new Promise<void>((resolve) => {
          resume = resolve
        })
    )
    audio.start()
    game.state.time = 1
    game.state.predators[0].state = 'chase'
    audio.update(game.state, 'local')
    game.state.time = 1.1
    game.state.predators[0].state = 'search'
    audio.update(game.state, 'local')
    vi.advanceTimersByTime(100)
    context.state = 'running'
    context.currentTime = 3
    resume()
    await Promise.resolve()
    await Promise.resolve()
    expect(context.voices).toHaveLength(4)
    audio.update(game.state, 'local')
    context.currentTime = 3.54
    vi.advanceTimersByTime(250)
    expect(context.voices).toHaveLength(4)
    context.currentTime = 3.56
    vi.advanceTimersByTime(250)
    expect(context.voices.length).toBeGreaterThan(4)
    audio.stop()
  })

  it.each(['search', 'patrol'] as const)('preserves discovery audio and music delay through chase to %s', (state) => {
    const { audio, game, context } = setup()
    const predator = game.state.predators[0]
    context.currentTime = 1
    game.state.time = 1
    predator.state = 'chase'
    audio.update(game.state, 'local')
    const alarm = [...context.voices]
    expect(alarm).toHaveLength(4)
    context.currentTime = 1.1
    game.state.time = 1.1
    Object.assign(predator, { state, targetId: null })
    audio.update(game.state, 'local')
    expect.soft(alarm.every((voice) => voice.stop.mock.calls.length === 1)).toBe(true)
    context.currentTime = 1.54
    vi.advanceTimersByTime(500)
    expect(context.voices).toHaveLength(4)
    context.currentTime = 1.55
    vi.advanceTimersByTime(250)
    expect(context.voices.length).toBeGreaterThan(4)
    audio.stop()
  })

  it.each(['won', 'mute', 'stop'] as const)('still interrupts discovery audio immediately on %s', (action) => {
    const { audio, game, context } = setup()
    game.addPlayer('friend', 'Friend')
    const predator = game.state.predators[0]
    context.currentTime = 1
    game.state.time = 1
    predator.state = 'chase'
    audio.update(game.state, 'local')
    const alarm = [...context.voices]
    expect(alarm).toHaveLength(4)
    context.currentTime = 1.1
    game.state.time = 1.1
    if (action === 'mute') audio.setMuted(true)
    else if (action === 'stop') audio.stop()
    else {
      game.state.phase = action
      audio.update(game.state, 'local')
    }
    expect(alarm.every((voice) => voice.stop.mock.calls.length === 2)).toBe(true)
    audio.stop()
  })

  it('sounds initial local discovery once without replaying history and delays chase music', () => {
    const { audio, game, context } = setup((game) => {
      game.state.time = 20
      game.state.predators[0].state = 'chase'
      game.state.players[0].pregnant = true
      game.state.bedding = 6
      game.state.chapter = 2
      game.state.kits = [{ id: 'old-loss', x: 0, y: 0, z: 0, angle: 0, hidden: false, status: 'lost' }]
    })
    expect(context.voices).toHaveLength(4)
    expect(context.voices[0].frequency.setValueAtTime).toHaveBeenCalledWith(160, 0)
    audio.update(game.state, 'local')
    game.state.time += 0.1
    game.state.predators[1].state = 'chase'
    audio.update(game.state, 'local')
    expect(context.voices).toHaveLength(4)
    context.currentTime = 0.54
    vi.advanceTimersByTime(250)
    expect(context.voices).toHaveLength(4)
    context.currentTime = 0.55
    vi.advanceTimersByTime(250)
    expect(context.voices).toHaveLength(7)
    expect(context.voices[4].frequency.setValueAtTime).toHaveBeenCalledWith(98, 0.55)
    audio.stop()
  })

  it.each(['other player', 'missing local', 'won', 'lost', 'muted'])(
    'does not sound initial discovery for %s',
    (scenario) => {
      const { audio, game, context } = setup((game, audio) => {
        game.state.predators[0].state = 'chase'
        if (scenario === 'other player') {
          game.addPlayer('other', 'Other')
          game.state.predators[0].targetId = 'other'
        }
        if (scenario === 'missing local') game.state.players = []
        if (scenario === 'won' || scenario === 'lost') game.state.phase = scenario
        if (scenario === 'muted') audio.setMuted(true)
      })
      expect(context.voices).toHaveLength(0)
      audio.setMuted(false)
      audio.update(game.state, 'local')
      expect(context.voices).toHaveLength(0)
      audio.stop()
    }
  )

  it('gives discovery a sustained impact and chase a syncopated bass without raising master gain', () => {
    const { audio, game, context } = setup()
    game.state.predators[0].state = 'chase'
    game.state.time = 1
    context.currentTime = 1
    audio.update(game.state, 'local')
    expect(context.gains[0].gain.value).toBe(0.12)
    expect(context.gains[1].gain.linearRampToValueAtTime).toHaveBeenCalledWith(0.36, 1.01)
    expect(context.gains[1].gain.setValueAtTime).toHaveBeenCalledWith(0.36, 1 + 0.28 * 0.15)
    expect(context.voices[0].frequency.exponentialRampToValueAtTime).toHaveBeenCalledWith(45, 1.28)
    context.currentTime = 1.6
    vi.advanceTimersByTime(250)
    expect(context.voices).toHaveLength(7)
    expect(context.voices[4].frequency.setValueAtTime).toHaveBeenCalledWith(98, 1.6)
    expect(context.voices[5].start).toHaveBeenCalledWith(1.725)
    expect(context.gains[5].gain.setValueAtTime).toHaveBeenCalledWith(0.28, 1.6 + 0.22 * 0.6)
    audio.stop()
  })

  it('bounds scheduled polyphony and signal peaks, then frees voices on mute and end', () => {
    const { audio, game, context } = setup()
    game.state.predators[0].state = 'chase'
    game.state.time = 1
    audio.update(game.state, 'local')
    context.currentTime = 1
    vi.advanceTimersByTime(4000)
    expect(context.voices).toHaveLength(16)
    const peaks = context.gains.slice(1).map((gain) => gain.gain.linearRampToValueAtTime.mock.calls[0][0] as number)
    expect(Math.max(...peaks)).toBeLessThanOrEqual(0.36)
    expect(peaks.reduce((sum, peak) => sum + peak, 0) * context.gains[0].gain.value).toBeLessThan(1)
    const ended = context.voices[0]
    ;(ended.onended as (() => void) | null)?.()
    vi.advanceTimersByTime(250)
    expect(context.voices).toHaveLength(17)
    audio.setMuted(true)
    vi.advanceTimersByTime(1000)
    expect(context.voices).toHaveLength(17)
    audio.setMuted(false)
    vi.advanceTimersByTime(250)
    expect(context.voices.length).toBeGreaterThan(17)
    audio.stop()
    expect(context.voices.every((voice) => voice.disconnect.mock.calls.length > 0)).toBe(true)
  })

  it('replaces cheerful music with suspicion and chase pulses, then restores it on escape', () => {
    const { audio, game, context } = setup()
    const predator = game.state.predators[0]
    const update = (time: number) => {
      game.state.time = time
      context.currentTime = time
      audio.update(game.state, 'local')
    }
    predator.state = 'suspicious'
    update(1)
    vi.advanceTimersByTime(250)
    expect(context.voices.at(-1)?.frequency.setValueAtTime).toHaveBeenCalledWith(392, 1)
    const warning = context.voices.at(-1)!
    predator.state = 'chase'
    update(2)
    expect(warning.stop).toHaveBeenCalledTimes(2)
    const stingCount = context.voices.length
    vi.advanceTimersByTime(250)
    expect(context.voices).toHaveLength(stingCount)
    context.currentTime = 2.6
    vi.advanceTimersByTime(250)
    expect(context.voices[stingCount].frequency.setValueAtTime).toHaveBeenCalledWith(98, 2.6)
    const pulse = context.voices[stingCount]
    predator.state = 'patrol'
    update(3)
    expect(pulse.stop).toHaveBeenCalledTimes(2)
    vi.advanceTimersByTime(250)
    expect(context.voices.at(-2)?.frequency.setValueAtTime).toHaveBeenCalledWith(440 * 2 ** ((72 - 69) / 12), 3)
    predator.state = 'chase'
    update(4)
    expect(context.voices.at(-1)?.type).toBe('sine')
    audio.stop()
  })

  it('does not stack discovery stings as more predators join an ongoing team chase', () => {
    const { audio, game, context } = setup()
    game.state.predators[0].state = 'chase'
    game.state.time = 1
    audio.update(game.state, 'local')
    expect(context.voices).toHaveLength(4)
    game.state.predators[1].state = 'chase'
    game.state.time = 4
    audio.update(game.state, 'local')
    audio.update({ ...game.state, time: 2 }, 'local')
    expect(context.voices).toHaveLength(4)
    audio.stop()
  })

  it('interrupts chase music when a different rabbit is discovered', () => {
    const { audio, game, context } = setup()
    game.addPlayer('friend', 'Friend')
    const [first, second] = game.state.predators
    Object.assign(first, { state: 'chase', targetId: 'friend' })
    game.state.time = context.currentTime = 1
    audio.update(game.state, 'local')
    for (const voice of context.voices) (voice.onended as (() => void) | null)?.()
    context.currentTime = 1.6
    vi.advanceTimersByTime(250)
    const music = context.voices.slice(4)
    expect(music).toHaveLength(3)
    Object.assign(second, { state: 'chase', targetId: 'local' })
    game.state.time = context.currentTime = 1.61
    audio.update(game.state, 'local')
    expect(music.every((voice) => voice.stop.mock.calls.length === 2)).toBe(true)
    expect(context.voices.slice(-4).map((voice) => voice.frequency.setValueAtTime.mock.calls[0][0])).toEqual([
      160, 830, 1245, 466
    ])
    const count = context.voices.length
    vi.advanceTimersByTime(250)
    expect(context.voices).toHaveLength(count)
    context.currentTime = 2.2
    vi.advanceTimersByTime(250)
    expect(context.voices.length).toBeGreaterThan(count)
    audio.stop()
  })

  it('keeps a new discovery audible when several rabbits are spotted in quick succession', () => {
    const { audio, game, context } = setup()
    const template = game.state.predators[0]
    game.state.predators = Array.from({ length: 5 }, (_, index) => ({
      ...template,
      id: `predator-${index}`,
      state: 'patrol',
      targetId: null
    }))
    for (let index = 0; index < 5; index++) {
      const targetId = index === 4 ? 'local' : `friend-${index}`
      if (index < 4) game.addPlayer(targetId, targetId)
      Object.assign(game.state.predators[index], { state: 'chase', targetId })
      game.state.time = context.currentTime = 1 + index * 0.01
      audio.update(game.state, 'local')
    }
    expect(context.voices).toHaveLength(4)
    expect(context.voices.every((voice) => voice.stop.mock.calls.length === 1)).toBe(true)
    expect(context.voices.slice(-4).map((voice) => voice.frequency.setValueAtTime.mock.calls[0][0])).toEqual([
      160, 830, 1245, 466
    ])
    audio.stop()
  })

  it.each(['music', 'alarm'] as const)('restores %s after replacing a closed audio context', (kind) => {
    const { audio, game, context } = setup()
    const predator = game.state.predators[0]
    context.currentTime = 60
    game.state.time = 1
    Object.assign(predator, { state: 'chase', targetId: 'local' })
    audio.update(game.state, 'local')
    expect(context.voices).toHaveLength(4)

    context.state = 'closed'
    const replacement = new Context()
    vi.stubGlobal(
      'AudioContext',
      vi.fn(function () {
        return replacement
      })
    )
    audio.start()
    expect(vi.getTimerCount()).toBe(1)
    expect(context.voices.every((voice) => voice.disconnect.mock.calls.length === 1)).toBe(true)
    expect(context.onstatechange).toBeNull()
    audio.update(game.state, 'local')
    expect(replacement.voices).toHaveLength(0)
    if (kind === 'music') {
      vi.advanceTimersByTime(250)
      expect(replacement.voices.length).toBeGreaterThan(0)
    } else {
      Object.assign(predator, { state: 'patrol', targetId: null })
      game.state.time = 2
      audio.update(game.state, 'local')
      Object.assign(predator, { state: 'chase', targetId: 'local' })
      game.state.time = 3
      audio.update(game.state, 'local')
      expect(replacement.voices).toHaveLength(4)
      audio.update(game.state, 'local')
      expect(replacement.voices).toHaveLength(4)
    }
    audio.stop()
  })

  it('initializes and resumes synchronously, with one music timer', () => {
    const { audio, context } = setup()
    expect(context.resume).toHaveBeenCalledOnce()
    audio.start()
    expect(vi.getTimerCount()).toBe(1)
    vi.advanceTimersByTime(1000)
    expect(context.voices.length).toBeGreaterThan(0)
    audio.stop()
    expect(vi.getTimerCount()).toBe(0)
    expect(context.voices.every((voice) => voice.stop.mock.calls.length >= 2)).toBe(true)
  })

  it('detects all effects without replaying mutable frames or duplicate/stale snapshots', () => {
    const { audio, game, context } = setup()
    const player = game.state.players[0]
    player.y = 0.2
    player.foodEaten++
    player.health--
    player.pregnant = true
    game.state.nests[0].active = false
    game.state.time = 1
    audio.update(game.state, 'local')
    expect(context.voices).toHaveLength(6)
    audio.update(game.state, 'local')
    audio.update(JSON.parse(JSON.stringify(game.state)), 'local')
    audio.update({ ...game.state, time: 0 }, 'local')
    expect(context.voices).toHaveLength(6)
    game.state.phase = 'won'
    audio.update(game.state, 'local')
    audio.update(game.state, 'local')
    expect(context.voices).toHaveLength(10)
    audio.stop()
  })

  it('leaves local action sounds to sfx and consumes muted events without replay', () => {
    const { audio, game, context } = setup()
    audio.setMuted(true)
    game.state.players[0].foodEaten++
    audio.update(game.state, 'local')
    audio.setMuted(false)
    audio.update(game.state, 'local')
    expect(context.voices).toHaveLength(0)
    for (const time of [1, 1.1, 1.7]) {
      game.state.time = time
      game.state.players[0].health--
      audio.update(game.state, 'local')
    }
    expect(context.voices).toHaveLength(0)
    audio.stop()
    game.state.time = 0
    audio.start()
    audio.update(game.state, 'local')
    expect(context.voices).toHaveLength(0)
    game.state.phase = 'lost'
    audio.update(game.state, 'local')
    expect(context.voices).toHaveLength(4)
    audio.stop()
  })

  it('plays a team-wide sting when any rabbit is spotted and a soft "?" only for local suspicion', () => {
    const { audio, game, context } = setup()
    game.addPlayer('friend', 'Friend')
    const [first, second] = game.state.predators
    const at = (time: number) => {
      game.state.time = context.currentTime = time
      audio.update(JSON.parse(JSON.stringify(game.state)), 'local')
    }
    Object.assign(first, { state: 'suspicious', targetId: 'friend' })
    at(1)
    expect(context.voices).toHaveLength(0)
    Object.assign(first, { state: 'suspicious', targetId: 'local' })
    first.state = 'patrol'
    at(1.1)
    first.state = 'suspicious'
    at(1.2)
    expect(context.voices).toHaveLength(2)
    Object.assign(second, { state: 'chase', targetId: 'friend' })
    at(1.3)
    expect(context.voices).toHaveLength(6)
    expect(context.voices.some((voice) => voice.type === 'square')).toBe(true)
    first.state = 'chase'
    at(1.9)
    expect(context.voices).toHaveLength(10)
    audio.setMuted(true)
    Object.assign(first, { state: 'patrol' })
    at(5)
    first.state = 'chase'
    at(5.1)
    expect(context.voices).toHaveLength(10)
    audio.stop()
  })

  it('warns when a suspicious predator switches from a teammate to the local rabbit', () => {
    const { audio, game, context } = setup()
    game.addPlayer('friend', 'Friend')
    const predator = game.state.predators[0]
    const update = (time: number) => {
      game.state.time = time
      audio.update(game.state, 'local')
    }
    Object.assign(predator, { state: 'suspicious', targetId: 'friend' })
    update(1)
    expect(context.voices).toHaveLength(0)
    predator.targetId = 'local'
    update(1.1)
    expect(context.voices).toHaveLength(2)
    update(1.2)
    expect(context.voices).toHaveLength(2)
    predator.targetId = 'friend'
    update(1.3)
    predator.targetId = 'local'
    update(1.4)
    expect(context.voices).toHaveLength(2)
    predator.targetId = 'friend'
    update(4)
    predator.targetId = 'local'
    update(4.1)
    expect(context.voices).toHaveLength(4)
    audio.stop()
  })

  it.each([
    [false, 1 / 60],
    [true, 1 / 60],
    [false, 0.6],
    [true, 0.6]
  ] as const)('aligns both viewpoints during natural chase retargeting (records: %s, gap: %s)', (records, gap) => {
    const { audio, game, context } = setup()
    game.addPlayer('friend', 'Friend')
    const friendAudio = new RabbitersAudio()
    friendAudio.start()
    const localJuice = new JuiceDetector()
    const friendJuice = new JuiceDetector()
    const predator = game.state.predators[0]
    game.state.predators = [predator]
    Object.assign(predator, { kind: 'fox', x: 0, y: 0, z: 0, angle: 0, state: 'patrol', targetId: null })
    const mind = newMind()
    const targets = [
      { id: 'friend', x: 0, y: 0, z: 1, visibility: 1 },
      { id: 'local', x: 0, y: 0, z: 2, visibility: 1 }
    ]
    for (const player of game.state.players)
      Object.assign(
        player,
        targets.find((target) => target.id === player.id)
      )
    friendAudio.update(game.state, 'friend')
    localJuice.update(game.state, 'local')
    friendJuice.update(game.state, 'friend')
    const tick = (targetId: string) => {
      game.state.time += 1 / 60
      context.currentTime = game.state.time
      predator.x = predator.y = predator.z = predator.angle = 0
      for (const target of targets) target.z = target.id === targetId ? 1 : 2
      updatePredator(predator, mind, targets, {
        dt: 1 / 60,
        time: game.state.time,
        droppings: [],
        scents: new Map(),
        terrain: { heightAt: () => 0, sightLine: () => 1 },
        random: () => 0.5
      })
      expect(predator).toMatchObject({ state: 'chase', targetId })
      if (records) {
        const entry = game.state.discoveries?.find((entry) => entry.targetId === targetId)
        game.state.discoveries = [
          ...(game.state.discoveries ?? []).filter((entry) => entry.targetId !== targetId),
          { predatorId: predator.id, targetId, count: (entry?.count ?? 0) + 1, time: game.state.time, x: 0, y: 0, z: 1 }
        ]
      }
      const before = context.voices.length
      audio.update(game.state, 'local')
      const localVoices = context.voices.length - before
      friendAudio.update(game.state, 'friend')
      const friendVoices = context.voices.length - before - localVoices
      return {
        localVoices,
        friendVoices,
        localSpotted: localJuice.update(game.state, 'local').filter((event) => event.type === 'spotted' && event.you)
          .length,
        friendSpotted: friendJuice.update(game.state, 'friend').filter((event) => event.type === 'spotted' && event.you)
          .length
      }
    }
    expect(tick('friend')).toEqual({ localVoices: 4, friendVoices: 4, localSpotted: 0, friendSpotted: 1 })
    const firstAlarm = [...context.voices]
    game.state.time += gap - 1 / 60
    expect(tick('local')).toEqual({
      localVoices: gap < 0.55 ? 0 : 4,
      friendVoices: 0,
      localSpotted: 1,
      friendSpotted: 0
    })
    if (gap < 0.55) expect(firstAlarm.every((voice) => voice.stop.mock.calls.length === 1)).toBe(true)
    for (let index = 0; index < 12; index++) {
      expect(tick(index % 2 ? 'local' : 'friend')).toEqual({
        localVoices: 0,
        friendVoices: 0,
        localSpotted: 0,
        friendSpotted: 0
      })
    }
    audio.stop()
    friendAudio.stop()
  })

  it.each(['friend', 'local', 'other-chaser'] as const)(
    'handles an unobserved real-AI search after chasing %s',
    (scenario) => {
      const { audio, game, context } = setup()
      game.addPlayer('friend', 'Friend')
      const [predator, other] = game.state.predators
      Object.assign(predator, {
        kind: 'fox',
        x: 0,
        y: 0,
        z: 0,
        angle: 0,
        state: 'patrol',
        targetId: null,
        suspicion: 0
      })
      game.state.predators = [predator]
      const mind = newMind()
      const targets = [
        { id: 'friend', x: 0, y: 0, z: 1, visibility: scenario === 'local' ? 0 : 1 },
        { id: 'local', x: 0, y: 0, z: scenario === 'local' ? 1 : 10, visibility: scenario === 'local' ? 1 : 0 }
      ]
      const tick = () => {
        game.state.time += 1 / 60
        updatePredator(predator, mind, targets, {
          dt: 1 / 60,
          time: game.state.time,
          droppings: [],
          scents: new Map(),
          terrain: { heightAt: () => 0, sightLine: () => 1 },
          random: () => 0.5
        })
      }
      tick()
      expect(predator).toMatchObject({ state: 'chase', targetId: scenario === 'local' ? 'local' : 'friend' })
      if (scenario === 'other-chaser') {
        Object.assign(other, { state: 'chase', targetId: 'local' })
        game.state.predators.push(other)
      }
      audio.update(game.state, 'local')
      const detector = new JuiceDetector()
      detector.update(game.state, 'local')
      targets[0].visibility = 0
      targets[1].visibility = 0
      targets[1].z = 10
      for (let frame = 0; frame < 2; frame++) {
        tick()
        expect(predator).toMatchObject({ state: 'search', targetId: null })
      }
      targets[1].visibility = 1
      tick()
      expect(predator).toMatchObject({ state: 'suspicious', targetId: 'local' })
      const query = vi.spyOn(audio as unknown as { query(time: number): void }, 'query')
      audio.update(game.state, 'local')
      expect
        .soft(detector.update(game.state, 'local').filter((event) => event.type === 'suspicious'))
        .toHaveLength(scenario === 'friend' ? 1 : 0)
      expect.soft(query).toHaveBeenCalledTimes(scenario === 'friend' ? 1 : 0)
      expect(context.voices.filter((voice) => voice.type === 'square')).toHaveLength(1)
      audio.stop()
    }
  )

  it('warns when the real predator AI retargets during suspicion', () => {
    const { audio, game, context } = setup()
    game.addPlayer('friend', 'Friend')
    const predator = game.state.predators[0]
    Object.assign(predator, { kind: 'fox', x: 0, y: 0, z: 0, angle: 0, state: 'patrol', targetId: null, suspicion: 0 })
    game.state.predators = [predator]
    audio.update(game.state, 'local')
    const detector = new JuiceDetector()
    detector.update(game.state, 'local')
    const mind = newMind()
    const targets = [
      { id: 'friend', x: 0, y: 0, z: 9, visibility: 1 },
      { id: 'local', x: 0, y: 0, z: 10, visibility: 1 }
    ]
    const tick = () => {
      game.state.time += 1 / 60
      updatePredator(predator, mind, targets, {
        dt: 1 / 60,
        time: game.state.time,
        droppings: [],
        scents: new Map(),
        terrain: { heightAt: () => 0, sightLine: () => 1 },
        random: () => 0.5
      })
      audio.update(game.state, 'local')
      return detector.update(game.state, 'local')
    }
    expect(tick()).toEqual([])
    expect(predator).toMatchObject({ state: 'suspicious', targetId: 'friend' })
    expect(context.voices).toHaveLength(0)
    targets[0].z = 20
    expect(tick()).toEqual([expect.objectContaining({ type: 'suspicious' })])
    expect(predator).toMatchObject({ state: 'suspicious', targetId: 'local' })
    expect(context.voices).toHaveLength(2)
    audio.stop()
  })

  it('keeps search music until the last related enemy stops, without adopting unrelated searches', () => {
    const { audio, game, context } = setup()
    const [first, second] = game.state.predators
    const update = (time: number) => {
      game.state.time = time
      context.currentTime = time
      audio.update(game.state, 'local')
    }
    first.state = 'chase'
    update(1)
    Object.assign(first, { state: 'search', targetId: null })
    Object.assign(second, { state: 'search', targetId: null })
    update(2)
    vi.advanceTimersByTime(250)
    expect(context.voices.at(-1)?.frequency.setValueAtTime).toHaveBeenCalledWith(392, 2)
    update(6)
    first.state = 'patrol'
    update(6.5)
    vi.advanceTimersByTime(250)
    expect(context.voices.at(-2)?.frequency.setValueAtTime).toHaveBeenCalledWith(440 * 2 ** ((72 - 69) / 12), 6.5)
    audio.stop()
  })

  it('consumes muted discoveries, supports rediscovery and clears search history on stop and phase end', () => {
    const { audio, game, context } = setup()
    const predator = game.state.predators[0]
    predator.state = 'chase'
    game.state.time = 1
    audio.setMuted(true)
    audio.update(game.state, 'local')
    audio.setMuted(false)
    audio.update(game.state, 'local')
    expect(context.voices).toHaveLength(0)
    Object.assign(predator, { state: 'search', targetId: null })
    game.state.time = 2
    audio.update(game.state, 'local')
    Object.assign(predator, { state: 'chase', targetId: 'local' })
    game.state.time = 2.1
    audio.update(game.state, 'local')
    expect(context.voices).toHaveLength(4)
    game.state.phase = 'lost'
    audio.update(game.state, 'local')
    game.state.phase = 'playing'
    Object.assign(predator, { state: 'search', targetId: null })
    game.state.time = 3
    context.currentTime = 3
    audio.update(game.state, 'local')
    vi.advanceTimersByTime(250)
    expect(context.voices.at(-2)?.frequency.setValueAtTime).toHaveBeenCalledWith(440 * 2 ** ((72 - 69) / 12), 3)
    audio.stop()
    audio.start()
    game.state.time = 0
    context.currentTime = 0
    audio.update(game.state, 'local')
    vi.advanceTimersByTime(250)
    expect(context.voices.at(-2)?.frequency.setValueAtTime).toHaveBeenCalledWith(440 * 2 ** ((72 - 69) / 12), 0)
    audio.stop()
  })

  it('marks bedding deliveries, new seasons and lost kits once each', () => {
    const { audio, game, context } = setup()
    game.state.bedding = 1
    game.state.time = 1
    audio.update(game.state, 'local')
    expect(context.voices).toHaveLength(2)
    Object.assign(game.state, { time: 2, bedding: 6, chapter: 2 })
    audio.update(game.state, 'local')
    expect(context.voices).toHaveLength(7)
    game.state.kits = [{ id: 'kit-0', x: 0, y: 0, z: 0, angle: 0, hidden: false, status: 'lost' }]
    game.state.time = 3
    audio.update(game.state, 'local')
    audio.update(game.state, 'local')
    expect(context.voices).toHaveLength(10)
    audio.stop()
  })

  it('tolerates missing, throwing and rejected audio support', async () => {
    vi.stubGlobal('AudioContext', undefined)
    const audio = new RabbitersAudio()
    expect(() => audio.start()).not.toThrow()
    vi.stubGlobal(
      'AudioContext',
      vi.fn(function () {
        throw new Error('denied')
      })
    )
    expect(() => audio.start()).not.toThrow()
    const { audio: rejected, context } = setup()
    context.resume.mockImplementation(() => Promise.reject(new Error('denied')))
    rejected.start()
    await Promise.resolve()
    rejected.stop()
    rejected.stop()
  })
})
