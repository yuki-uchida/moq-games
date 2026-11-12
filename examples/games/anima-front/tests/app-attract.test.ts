import { describe, expect, it } from 'vitest'
import { ATTRACT_SCENES, attractConfig, attractLevel, pickFollow, SlowWatch } from '../src/app/attract-plan'
import { createWorld } from '../src/sim/api'
import { demoView } from '../src/ui/hud/demo-view'

describe('title attract demo plan', () => {
  it('alternates a 防衛任務 wave on oldtown and an all-bot 三つ巴演習 on the arena', () => {
    const pve = attractConfig(0, 11)
    const pvp = attractConfig(1, 11)
    expect(pve).toMatchObject({ mode: 'pve', map: 'oldtown', mission: 'sakura' })
    expect(pvp).toMatchObject({ mode: 'pvp', map: 'arena' })
    expect(pve.players).toHaveLength(4)
    expect(pvp.players).toHaveLength(12)
    for (const c of [pve, pvp]) for (const p of c.players) expect(p.bot).toBeGreaterThan(0)
    expect(attractConfig(ATTRACT_SCENES.length, 11).mode).toBe('pve')
  })

  it('runs as a real world with nobody at the controls', () => {
    const world = createWorld(attractConfig(0, 3))
    const none = new Map()
    for (let i = 0; i < 60 * 14; i++) world.step(none)
    const v = world.view()
    expect(v.phase).toBe('play')
    expect(v.foes.length).toBeGreaterThan(0)
    expect(v.players.every((p) => p.bot)).toBe(true)
  }, 20_000)

  it('falls back to a still frame or the static plaza when it should', () => {
    expect(attractLevel({ cores: 8, memoryGb: 8, webgl2: true }, false)).toBe('live')
    expect(attractLevel({ cores: 8, webgl2: true }, true)).toBe('still')
    expect(attractLevel({ saveData: true }, false)).toBe('static')
    expect(attractLevel({ cores: 2 }, false)).toBe('static')
    expect(attractLevel({ memoryGb: 2 }, false)).toBe('static')
    expect(attractLevel({ lowQuality: true }, false)).toBe('static')
    expect(attractLevel({ webgl2: false }, false)).toBe('static')
    expect(attractLevel({ disabled: true }, false)).toBe('static')
  })

  it('gives up only after a sustained slow stretch', () => {
    const w = new SlowWatch(45, 10)
    for (let i = 0; i < 9; i++) expect(w.push(80)).toBe(false)
    expect(w.push(80)).toBe(true)
    w.reset()
    for (let i = 0; i < 30; i++) expect(w.push(i % 3 === 0 ? 120 : 25)).toBe(false)
  })

  it('follows the fighter in the thick of it and cuts to another', () => {
    const v = demoView('pve', 5)
    const first = pickFollow(v, null)
    expect(first).not.toBeNull()
    expect(v.players.find((p) => p.id === first)?.state).toBe('alive')
    const none = { ...v, players: v.players.map((p) => ({ ...p, state: 'away' as const })) }
    expect(pickFollow(none, first)).toBeNull()
  })
})
