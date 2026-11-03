import { describe, expect, it, vi } from 'vitest'
import { Game } from '../src/game'
import { HudFx, threatFor } from '../src/hud-fx'
import { ThreatTracker } from '../src/audio'
import { GameFeel } from '../src/feel'
import { RabbitersSfx } from '../src/sfx'

describe('local threat HUD', () => {
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
      hud.dispose()
      expect(vi.getTimerCount()).toBe(0)
    } finally {
      vi.useRealTimers()
    }
  })
})
