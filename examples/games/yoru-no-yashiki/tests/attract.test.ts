import { describe, expect, it, vi } from 'vitest'
import {
  ATTRACT_EVENTS,
  ATTRACT_LOOP_SECONDS,
  ATTRACT_MAX_STEP,
  ATTRACT_START,
  advanceAttract,
  attractEffect,
  attractFrame,
  startAttract
} from '../src/attract'
import { RITUAL_STEPS } from '../src/ritual'
import { movePose } from '../src/world'

const EFFECT_SECONDS = 3.5
const samples = (step = 0.05) =>
  Array.from({ length: Math.floor(ATTRACT_LOOP_SECONDS / step) }, (_, index) => index * step)

describe('ロビーの無音デモ', () => {
  it('時間刻みを0.05秒以下に抑え、一周で巻き戻す', () => {
    expect(advanceAttract(1, 3)).toBeCloseTo(1 + ATTRACT_MAX_STEP)
    expect(advanceAttract(1, -1)).toBe(1)
    expect(advanceAttract(1, Number.NaN)).toBe(1)
    expect(advanceAttract(Number.NaN, 0.01)).toBeCloseTo(0.01)
    expect(advanceAttract(ATTRACT_LOOP_SECONDS - 0.01, 0.05)).toBeCloseTo(0.04)
    let time = ATTRACT_START
    for (let frame = 0; frame < 5000; frame++) time = advanceAttract(time, 1 / 60)
    expect(time).toBeGreaterThanOrEqual(0)
    expect(time).toBeLessThan(ATTRACT_LOOP_SECONDS)
  })

  it('同じ時刻には同じ人間視点の画面を返す', () => {
    for (const time of [0, 7, 21.3, 44, ATTRACT_LOOP_SECONDS - 0.1]) {
      expect(attractFrame(time)).toEqual(attractFrame(time))
      const looped = attractFrame(time + ATTRACT_LOOP_SECONDS)
      expect(looped.human.x).toBeCloseTo(attractFrame(time).human.x, 6)
      expect(looped.human.z).toBeCloseTo(attractFrame(time).human.z, 6)
      expect(looped.ritual).toEqual(attractFrame(time).ritual)
    }
    const frame = attractFrame(12)
    expect(frame.role).toBe('human')
    expect(frame.ritual?.elapsedMs).toBe(RITUAL_STEPS[RITUAL_STEPS.length - 1].availableMs)
  })

  it('壁を通らず、暗転中の巻き戻し以外では滑らかに歩く', () => {
    let previous = attractFrame(0)
    for (const time of samples()) {
      const frame = attractFrame(time)
      for (const value of [frame.human.x, frame.human.z, frame.human.yaw, frame.pitch ?? 0])
        expect(Number.isFinite(value)).toBe(true)
      const settled = movePose(frame.human, 0, 0, 0)
      expect([settled.x, settled.z]).toEqual([frame.human.x, frame.human.z])
      expect(Math.hypot(frame.human.x - previous.human.x, frame.human.z - previous.human.z)).toBeLessThan(0.2)
      expect(Math.abs(frame.human.yaw - previous.human.yaw)).toBeLessThan(0.2)
      previous = frame
    }
  })

  it('一周で4つの手掛かりを順に調べ、巻き戻しは暗転の最も暗い時点で行う', () => {
    const progress = samples().map((time) => attractFrame(time).ritual!.completed)
    expect(progress[0]).toBe(0)
    expect(Math.max(...progress)).toBe(RITUAL_STEPS.length)
    for (let index = 1; index < progress.length; index++)
      expect(progress[index]).toBeGreaterThanOrEqual(progress[index - 1])
    const seam = attractEffect(0)
    expect(seam?.kind).toBe('blackout')
    expect(0 - seam!.startedAt).toBeCloseTo(EFFECT_SECONDS / 2)
    const before = attractEffect(ATTRACT_LOOP_SECONDS - 0.001)
    expect(before?.kind).toBe('blackout')
    expect(ATTRACT_LOOP_SECONDS - 0.001 - before!.startedAt).toBeCloseTo(EFFECT_SECONDS / 2, 2)
    expect(attractEffect(ATTRACT_START)).toBeNull()
  })

  it('怪異の演出は見た目だけで重ならず、点滅しない間隔で起きる', () => {
    expect(ATTRACT_EVENTS.map((event) => event.kind).sort()).toEqual(['apparition', 'blackout', 'blackout'])
    const starts = ATTRACT_EVENTS.map((event) => event.at).sort((a, b) => a - b)
    for (let index = 1; index < starts.length; index++)
      expect(starts[index] - starts[index - 1]).toBeGreaterThan(EFFECT_SECONDS + 1)
    expect(ATTRACT_LOOP_SECONDS - starts[starts.length - 1] + starts[0]).toBeGreaterThan(EFFECT_SECONDS)
    const kinds = new Set(samples().map((time) => attractFrame(time).effect?.kind ?? null))
    expect(kinds).toEqual(new Set([null, 'blackout', 'apparition']))
  })

  it('動きを減らす設定では演出なしの静止画にする', () => {
    const still = attractFrame(0, true)
    expect(still.effect).toBeNull()
    for (const time of samples(1.3)) expect(attractFrame(time, true)).toEqual(still)
  })

  it('描画に必要なブラウザー機能がなければ何もしない', () => {
    const raf = vi.fn()
    const host = { prepend: vi.fn(), classList: { add: vi.fn() } }
    vi.stubGlobal('window', { requestAnimationFrame: raf })
    vi.stubGlobal('requestAnimationFrame', raf)
    try {
      const stop = startAttract({ host: host as unknown as HTMLElement, active: () => true, stopOn: [] })
      expect(() => stop()).not.toThrow()
      expect(raf).not.toHaveBeenCalled()
      expect(host.prepend).not.toHaveBeenCalled()
    } finally {
      vi.unstubAllGlobals()
    }
  })
})
