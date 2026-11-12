import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { Session } from '../src/app/session'
import type { GuestMatch } from '../src/net/guest-match'
import { BTN, neutralPlayerInput, type PlayerInput, type View } from '../src/sim/types'
import { choice, FakeHub, provider, run, settle } from './net-helpers'

beforeEach(() => {
  vi.useFakeTimers()
})
afterEach(() => {
  vi.useRealTimers()
})

/**
 * Prediction error: the distance between the host's authoritative position and the guest's prediction for the
 * same guest tick, measured right before each correction (OwnBody stats), plus the drawn distance between the
 * guest's own body and the host's at the same moment (which includes the latency).
 */
async function measure(latency: number, jitter: number, script: (t: number) => PlayerInput) {
  const hub = new FakeHub()
  hub.latency = latency
  hub.jitter = jitter
  const host = await provider(hub).host({ mode: 'pvp' }, choice('ホスト'), 'pred-1234')
  const guest = await settle(provider(hub).join('pred-1234', choice('ゲスト', 'rabbit', 0)))
  guest.setReady(true)
  await run(4 * latency + 100)
  const hostSession = host.start().connect()
  await run(2 * latency + 100)
  const g = guest.online!.takeMatch()!.start.connect() as Session & GuestMatch
  let hv: View | null = null
  let gv: View | null = null
  const errors: number[] = []
  const moves = new Set<string>()
  let t = 0
  await run(5500, () => {
    hv = hostSession.update(1 / 60)
    gv = g.update(1 / 60)
  })
  const corrections = g.prediction!.corrections
  // The guest draws at 144 Hz, the host at 60 Hz.
  let hostAcc = 0
  await run(
    6000,
    () => {
      t += 1 / 144
      hostAcc += 1 / 144
      g.setInput(script(t))
      if (hostAcc >= 1 / 60) {
        hostAcc -= 1 / 60
        hv = hostSession.update(1 / 60)
      }
      gv = g.update(1 / 144)
      errors.push(g.prediction!.lastError)
      const own = (hv as View | null)?.players.find((p) => p.id === g.me)
      if (own) moves.add(own.move)
    },
    1000 / 144
  )
  const mine = gv!.players.find((p) => p.id === g.me)!.p
  const auth = hv!.players.find((p) => p.id === g.me)!.p
  host.leave()
  guest.leave()
  errors.sort((a, b) => a - b)
  return {
    median: errors[Math.floor(errors.length / 2)],
    p95: errors[Math.floor(errors.length * 0.95)],
    max: errors[errors.length - 1],
    corrections: g.prediction!.corrections - corrections,
    snaps: g.prediction!.snaps,
    moves: [...moves].sort().join(','),
    drawnGap: Math.hypot(mine[0] - auth[0], mine[2] - auth[2])
  }
}

const press = (t: number, period: number) => Math.floor(t / period)

describe('guest prediction', () => {
  it('walking in circles stays within centimetres of the host', async () => {
    const r = await measure(40, 25, (t) => ({ ...neutralPlayerInput(), mz: 1, mx: Math.sin(t), yaw: t * 0.8 }))
    console.log('walk', r)
    expect(r.p95).toBeLessThan(0.15)
    expect(r.max).toBeLessThan(0.6)
  }, 60_000)

  it('jumping and dashing while running stays small', async () => {
    const r = await measure(40, 25, (t) => {
      const jump = press(t, 0.9)
      const dash = press(t + 0.4, 1.7)
      return {
        ...neutralPlayerInput(),
        mz: 1,
        mx: t % 3 < 1.5 ? 0.6 : -0.6,
        yaw: t * 0.9,
        held: t % 0.9 < 0.3 ? BTN.JUMP : 0,
        presses: { r: 0, l: 0, jump, dash }
      }
    })
    console.log('jump+dash', r)
    expect(r.moves).toContain('air')
    expect(r.moves).toContain('dash')
    expect(r.p95).toBeLessThan(0.5)
    expect(r.max).toBeLessThan(2)
  }, 60_000)

  it('copes with a slow link (120 ms each way)', async () => {
    const r = await measure(120, 60, (t) => ({
      ...neutralPlayerInput(),
      mz: 1,
      yaw: t * 0.5,
      presses: { r: 0, l: 0, jump: press(t, 1.3), dash: press(t, 2.1) }
    }))
    console.log('slow link', r)
    expect(r.p95).toBeLessThan(0.6)
  }, 60_000)
})
