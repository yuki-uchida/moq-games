import { readFileSync } from 'node:fs'
import { runInNewContext } from 'node:vm'
import ts from 'typescript'
import { expect, it, vi } from 'vitest'
import { Game, packSnapshot, unpackSnapshot } from '../src/game'
import { RabbitersAudio } from '../src/audio'
import { JuiceDetector } from '../src/juice'
import { heightAt } from '../src/map'
import { STEP } from '../src/stages/town/script'
import { STAGES } from '../src/stages'
import { GameFeel } from '../src/feel'
import { RabbitersSfx } from '../src/sfx'

it.each([
  ['chase', true],
  ['chase', false],
  ['captured', true],
  ['lost', true]
] as const)(
  'shows a fresh chapter cut-in after dropping the town-exit snapshot (%s, records: %s)',
  (outcome, records) => {
    const elements: { className: string; textContent: string; classList: { add: ReturnType<typeof vi.fn> } }[] = []
    const element = (): HTMLElement => {
      const node = {
        ownerDocument: { createElement: element },
        className: '',
        textContent: '',
        dataset: {},
        style: { setProperty: vi.fn() },
        classList: { add: vi.fn(), remove: vi.fn(), toggle: vi.fn() },
        setAttribute: vi.fn(),
        appendChild: vi.fn(),
        addEventListener: vi.fn(),
        removeEventListener: vi.fn(),
        remove: vi.fn()
      }
      elements.push(node)
      return node as unknown as HTMLElement
    }
    const emit = vi.fn()
    const spotted = vi.fn()
    const sound = vi.spyOn(RabbitersSfx.prototype, 'play').mockImplementation(() => {})
    const feel = new GameFeel({ fx: { emit } as never, screenPoint: () => null }, element(), spotted)
    const audio = new RabbitersAudio()
    const alarm = vi.spyOn(audio as unknown as { alarm(): void }, 'alarm')
    const game = new Game(3, undefined, 1)
    game.addPlayer('local')
    const receive = () => {
      const snapshot = unpackSnapshot(JSON.parse(JSON.stringify(packSnapshot(game.state))))!
      if (!records) delete snapshot.discoveries
      return snapshot
    }
    try {
      feel.update(receive(), 'local')
      audio.update(receive(), 'local')
      game.state.step = STEP.bank
      game.state.open = 1
      const player = game.state.players[0]
      Object.assign(player, { x: 140, y: heightAt(140, -64), z: -64, hidden: false })
      game.state.predators = []
      const hunter = game.spawnPredator('human', 140, -66)
      hunter.angle = 0
      game.step(1 / 60)
      expect(hunter.state).toBe('chase')
      const old = receive()
      feel.update(old, 'local')
      audio.update(old, 'local')
      const detection = elements.find((node) => node.className === 'fx-detection')!
      expect(detection.classList.add).toHaveBeenCalledTimes(1)
      expect(alarm).toHaveBeenCalledTimes(1)
      Object.assign(player, { x: 146, y: heightAt(146, -64), z: -64 })
      game.step(1 / 60)
      expect(game.state.stage).toBe(2)
      game.state.predators = []
      Object.assign(player, { x: 0, y: heightAt(0, 0), z: 0, hidden: false })
      if (outcome === 'lost') player.health = 0.1
      const nextHunter = game.spawnPredator(outcome === 'lost' ? 'fox' : 'human', 0, outcome === 'chase' ? -2 : -0.9)
      nextHunter.angle = 0
      game.step(1 / 60)
      expect(game.state.discoveries).toMatchObject([{ count: 2, stage: 2 }])
      if (outcome === 'chase') {
        expect(nextHunter.state).toBe('chase')
        expect(nextHunter.targetId).toBe('local')
      } else if (outcome === 'lost') expect(game.state.phase).toBe('lost')
      else expect(Math.hypot(player.x, player.z)).toBeGreaterThan(3)
      const next = receive()
      feel.update(next, 'local')
      audio.update(next, 'local')
      expect.soft(spotted).toHaveBeenCalledTimes(2)
      expect.soft(detection.classList.add).toHaveBeenCalledTimes(2)
      expect.soft(alarm).toHaveBeenCalledTimes(2)
      feel.update(old, 'local')
      feel.update(next, 'local')
      audio.update(old, 'local')
      audio.update(next, 'local')
      expect(detection.classList.add).toHaveBeenCalledTimes(2)
      expect(spotted).toHaveBeenCalledTimes(2)
      expect(alarm).toHaveBeenCalledTimes(2)
      expect(emit.mock.calls.filter(([event]) => event.type === 'escaped')).toEqual([])
      expect(elements.some((node) => node.textContent.includes('追跡が途切れた'))).toBe(false)
    } finally {
      feel.dispose()
      audio.stop()
      sound.mockRestore()
    }
  }
)

it('validates optional discovery chapter metadata at the wire boundary', () => {
  const source = readFileSync(new URL('../src/main.ts', import.meta.url), 'utf8')
  const helpers = source.slice(source.indexOf('const numeric ='), source.indexOf('const integer ='))
  const guard = source.slice(
    source.indexOf('function validSnapshot('),
    source.indexOf('  if (!record(value) || !numeric(value.time')
  )
  const code = ts.transpileModule(`${helpers}\n${guard}\nreturn true\n}\nvalidSnapshot(value)`, {
    compilerOptions: { target: ts.ScriptTarget.ES2022 }
  }).outputText
  for (const stage of [undefined, 0, STAGES.length - 1, -1, STAGES.length, 0.5, '1', null]) {
    const value = {
      time: 1,
      discoveries: [{ predatorId: 'hunter', targetId: 'local', count: 1, time: 1, x: 0, y: 0, z: 0, stage }]
    }
    expect(runInNewContext(code, { value, STAGES })).toBe(
      stage === undefined || stage === 0 || stage === STAGES.length - 1
    )
  }
})

it.each([
  'initial',
  'continuing',
  'missed discovery',
  'missed chapter',
  'legacy history',
  'missed chapter lost'
] as const)('does not replay a real town discovery after passing the town exit (%s)', (guest) => {
  const game = new Game(3, undefined, 1)
  game.addPlayer('local')
  const audio = new RabbitersAudio()
  const alarm = vi.spyOn(audio as unknown as { alarm(): void }, 'alarm').mockImplementation(() => {})
  const detector = new JuiceDetector()
  const receive = () => unpackSnapshot(JSON.parse(JSON.stringify(packSnapshot(game.state))))!
  if (guest === 'missed discovery') {
    audio.update(receive(), 'local')
    detector.update(receive(), 'local')
  }
  game.state.step = STEP.bank
  game.state.open = 1
  const player = game.state.players[0]
  Object.assign(player, { x: 140, y: heightAt(140, -64), z: -64, hidden: false })
  game.state.predators = []
  const predator = game.spawnPredator('human', 140, -66)
  predator.angle = 0
  game.step(1 / 60)
  expect(game.state.discoveries).toMatchObject([{ targetId: 'local', count: 1 }])
  expect(player.downed).toBe(false)
  if (guest === 'legacy history') delete game.state.discoveries![0].stage
  if (guest === 'continuing' || guest.startsWith('missed chapter')) {
    audio.update(receive(), 'local')
    detector.update(receive(), 'local')
    alarm.mockClear()
  }
  Object.assign(player, { x: 146, y: heightAt(146, -64), z: -64 })
  game.step(1 / 60)
  expect(game.state.stage).toBe(2)
  const received = receive()
  if (!guest.startsWith('missed chapter')) {
    audio.update(received, 'local')
    expect.soft(alarm).not.toHaveBeenCalled()
    expect(detector.update(received, 'local').filter((event) => event.type === 'spotted')).toEqual([])
  }
  expect(received.discoveries?.[0].count).toBe(1)
  game.state.predators = []
  Object.assign(player, { x: 0, y: heightAt(0, 0), z: 0, hidden: false })
  if (guest === 'missed chapter lost') player.health = 0.1
  const nextPredator = game.spawnPredator(guest === 'missed chapter lost' ? 'fox' : 'human', 0, -0.9)
  nextPredator.angle = 0
  game.step(1 / 60)
  expect(game.state.discoveries).toMatchObject([{ count: 2, stage: 2 }])
  if (guest === 'missed chapter lost') expect(game.state.phase).toBe('lost')
  else expect(Math.hypot(player.x, player.z)).toBeGreaterThan(3)
  const captured = receive()
  const initialAudio = new RabbitersAudio()
  const initialAlarm = vi.spyOn(initialAudio as unknown as { alarm(): void }, 'alarm').mockImplementation(() => {})
  initialAudio.update(captured, 'local')
  expect(initialAlarm).toHaveBeenCalledTimes(guest === 'missed chapter lost' ? 0 : 1)
  expect(
    new JuiceDetector().update(captured, 'local').filter((event) => event.type === 'spotted' && event.you)
  ).toHaveLength(guest === 'missed chapter lost' ? 0 : 1)
  initialAudio.stop()
  audio.update(captured, 'local')
  expect(alarm).toHaveBeenCalledTimes(1)
  expect(detector.update(captured, 'local').filter((event) => event.type === 'spotted' && event.you)).toHaveLength(1)
  audio.update(captured, 'local')
  expect(alarm).toHaveBeenCalledTimes(1)
  expect(detector.update(captured, 'local')).toEqual([])
  audio.stop()
})
