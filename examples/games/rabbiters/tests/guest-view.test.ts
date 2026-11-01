import { describe, expect, it } from 'vitest'
import { Game, type GameState, type Input } from '../src/game'
import { GuestView, type InputAck } from '../src/guest-view'
import { SPAWN } from '../src/map'

const idle: Input = { moveX: 0, moveZ: 0, jump: false, sprint: false, crouch: false, interact: false }
const copy = (state: GameState) => structuredClone(state)

function gameWithGuest() {
  const game = new Game()
  game.addPlayer('guest', 'Guest')
  game.state.predators = []
  game.state.foods = []
  return game
}

describe('guest rendering', () => {
  it('predicts movement immediately without changing the host snapshot', () => {
    const game = gameWithGuest()
    const state = copy(game.state)
    const view = new GuestView()
    view.render(state, 'guest', idle, 0, 0)
    const rendered = view.render(state, 'guest', { ...idle, moveX: 1 }, 1 / 60, 1000 / 60)
    expect(rendered.players[0].x).toBeGreaterThan(state.players[0].x)
    expect(state.players[0].x).toBe(SPAWN.x)
    expect(game.state.players[0].x).toBe(SPAWN.x)
  })

  it('uses the same movement and jump rules as the host', () => {
    const game = gameWithGuest()
    Object.assign(game.state.players[0], { x: SPAWN.x + 8, z: 10, pregnant: true })
    const state = copy(game.state)
    const view = new GuestView()
    const input = { ...idle, moveX: 1, sprint: true, jump: true }
    view.render(state, 'guest', idle, 0, 0)
    game.setInput('guest', input)
    let result = state
    for (let frame = 1; frame <= 30; frame++) {
      game.step(1 / 60)
      result = view.render(state, 'guest', input, 1 / 60, (frame * 1000) / 60)
    }
    expect(result.players[0].x).toBeCloseTo(game.state.players[0].x)
    expect(result.players[0].y).toBeCloseTo(game.state.players[0].y)
    expect(result.players[0].y).toBeGreaterThan(1)
  })

  it('reconciles delayed input and snapshots without stepping backwards', () => {
    const game = gameWithGuest()
    const view = new GuestView()
    let snapshot = copy(game.state)
    let ack: InputAck | undefined
    const inputs: { at: number; sentAt: number; input: Input }[] = []
    const snapshots: { at: number; state: GameState }[] = []
    const positions: number[] = []
    view.render(snapshot, 'guest', idle, 0, 0)
    for (let frame = 1; frame <= 240; frame++) {
      const now = (frame * 1000) / 60
      const input =
        frame >= 12 && frame < 120 ? { ...idle, moveX: 1 } : frame >= 120 && frame < 180 ? { ...idle, moveX: -1 } : idle
      if (frame % 6 === 0) inputs.push({ at: now + 200, sentAt: now, input })
      while (inputs.length && inputs[0].at <= now) {
        const received = inputs.shift()!
        game.setInput('guest', received.input)
        ack = { sentAt: received.sentAt, gameTime: game.state.time }
      }
      game.step(1 / 60)
      if (frame % 6 === 0) {
        const sent = { ...copy(game.state), inputAcks: ack ? { guest: ack } : {} }
        snapshots.push({ at: now + 200 + ((frame / 6) % 3) * 15, state: sent })
      }
      while (snapshots.length && snapshots[0].at <= now) snapshot = snapshots.shift()!.state
      positions.push(view.render(snapshot, 'guest', input, 1 / 60, now).players[0].x)
    }
    expect(positions[15]).toBeGreaterThan(SPAWN.x)
    for (let frame = 30; frame < 115; frame++) {
      expect(positions[frame] - positions[frame - 1]).toBeGreaterThan(0)
      expect(positions[frame] - positions[frame - 1]).toBeLessThan(0.2)
    }
    expect(positions[119]).toBeLessThan(positions[118])
    for (let frame = 120; frame < 175; frame++) {
      expect(positions[frame] - positions[frame - 1]).toBeLessThan(0)
      expect(positions[frame] - positions[frame - 1]).toBeGreaterThan(-0.2)
    }
    expect(positions.at(-1)).toBeCloseTo(game.state.players[0].x, 1)
  })

  it('starts prediction when the local player appears in a later snapshot', () => {
    const game = gameWithGuest()
    const view = new GuestView()
    const waiting = copy(game.state)
    waiting.players = []
    view.render(waiting, 'guest', idle, 0, 0)
    const arrived = copy(game.state)
    const result = view.render(arrived, 'guest', { ...idle, moveX: 1 }, 1 / 60, 100)
    expect(result.players[0].x).toBeGreaterThan(arrived.players[0].x)
  })

  it('smooths other actors and stops predicting after a disconnect or defeat', () => {
    const game = gameWithGuest()
    game.addPlayer('friend', 'Friend')
    const view = new GuestView()
    const first = copy(game.state)
    view.render(first, 'guest', idle, 0, 0)
    const second = copy(first)
    second.players[1].x += 1
    second.players[1].angle = Math.PI
    const smoothed = view.render(second, 'guest', idle, 1 / 60, 100)
    expect(smoothed.players[1].x).toBeGreaterThan(first.players[1].x)
    expect(smoothed.players[1].x).toBeLessThan(second.players[1].x)
    expect(second.players[1].x).toBe(first.players[1].x + 1)

    const moving = { ...idle, moveX: 1 }
    const beforeStall = view.render(second, 'guest', moving, 0.1, 1000).players[0].x
    const stalled = view.render(second, 'guest', moving, 0.1, 1200).players[0].x
    expect(stalled).toBe(beforeStall)

    const downed = copy(second)
    downed.players[0].downed = true
    const result = view.render(downed, 'guest', moving, 0.1, 1300)
    expect(result.players[0].x).toBe(downed.players[0].x)
    expect(result.players[0].downed).toBe(true)
  })
})
