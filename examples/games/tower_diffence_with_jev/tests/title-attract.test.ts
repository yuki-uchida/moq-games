import { afterEach, describe, expect, it } from 'vitest'
import {
  ATTRACT_END_HOLD_SECONDS,
  ATTRACT_MAX_STEP_SECONDS,
  attractSeed,
  attractStage,
  attractUnitTypes,
  createAttractBattle,
  warmUpAttractBattle
} from '../src/game/AttractBattle'
import { fieldFor } from '../src/game/model'
import { titleAttractAllowed } from '../src/ui/TitleAttract'

const settle = () => Promise.resolve().then(() => Promise.resolve())
const snapshot = (battle: ReturnType<typeof createAttractBattle>) =>
  battle.engine.state.units.map((unit) => [unit.owner, unit.type, Math.round(unit.x), Math.round(unit.y), unit.hp])

describe('title attract battle', () => {
  const descriptor = Object.getOwnPropertyDescriptor(globalThis, 'localStorage')
  afterEach(() => {
    if (descriptor) Object.defineProperty(globalThis, 'localStorage', descriptor)
    else delete (globalThis as { localStorage?: Storage }).localStorage
  })

  it('starts an assault with the starter formation on valid ground, without touching storage', () => {
    Object.defineProperty(globalThis, 'localStorage', {
      configurable: true,
      get() {
        throw new Error('the title demo must not read or write browser storage')
      }
    })
    const battle = createAttractBattle(0)
    const state = battle.engine.state
    expect(state.phase).toBe('assault')
    expect(state.stage).toBe(1)
    expect(state.layoutRevision).toBe(4)
    const defenders = state.units.filter((unit) => unit.owner === 'player')
    expect(defenders.map((unit) => unit.type).sort()).toEqual(['archer', 'runner', 'soldier', 'tank'])
    const field = fieldFor(state)
    for (const unit of defenders) expect(field.slots.some((slot) => slot.x === unit.homeX && slot.y === unit.homeY)).toBe(true)
    expect([...attractUnitTypes(state)].sort()).toEqual(['archer', 'goblin', 'runner', 'shaman', 'slime', 'soldier', 'tank'])
  })

  it('first loop is deterministic; later loops vary seed and stage', async () => {
    const a = createAttractBattle(0),
      b = createAttractBattle(0)
    for (let i = 0; i < 200; i++) {
      a.advance(0.05)
      b.advance(0.05)
      await settle()
    }
    expect(snapshot(a)).toEqual(snapshot(b))
    expect(a.engine.state.time).toBeGreaterThan(9)
    expect(attractSeed(1)).not.toBe(attractSeed(0))
    expect(attractStage(1)).toBe(2)
    expect(attractStage(2)).toBe(1)
  }, 60_000)

  it('warms a battle up off screen deterministically, and stops when aborted', async () => {
    const a = createAttractBattle(0),
      b = createAttractBattle(0)
    await warmUpAttractBattle(a, 6)
    await warmUpAttractBattle(b, 6)
    expect(a.elapsed).toBeCloseTo(6)
    expect(a.engine.state.phase).toBe('assault')
    expect(a.engine.state.units.some((unit) => unit.owner === 'ai')).toBe(true)
    expect(snapshot(a)).toEqual(snapshot(b))
    const aborted = new AbortController()
    aborted.abort()
    await expect(warmUpAttractBattle(createAttractBattle(0), 3, aborted.signal)).rejects.toBeDefined()
  }, 60_000)

  it('caps each step, so a long stall never fast-forwards the battle', () => {
    const battle = createAttractBattle(0)
    battle.advance(30)
    expect(battle.elapsed).toBeCloseTo(ATTRACT_MAX_STEP_SECONDS)
    battle.advance(Number.NaN)
    battle.advance(-1)
    expect(battle.elapsed).toBeCloseTo(ATTRACT_MAX_STEP_SECONDS)
  })

  it('plays the first loop competently to a win with specials, then holds before finishing', async () => {
    const battle = createAttractBattle(0)
    let endedAt: number | null = null
    while (!battle.finished) {
      battle.advance(0.05)
      await settle()
      if (endedAt === null && battle.engine.state.phase !== 'assault') endedAt = battle.elapsed
      expect(battle.elapsed).toBeLessThan(200)
    }
    const state = battle.engine.state
    expect(state.result).toBe('win')
    expect(state.playerBaseHp).toBeGreaterThan(50)
    expect(battle.specialsCast).toBeGreaterThan(0)
    expect(battle.elapsed - endedAt!).toBeGreaterThanOrEqual(ATTRACT_END_HOLD_SECONDS - 1e-6)
  }, 120_000)
})

describe('title attract environment', () => {
  it('keeps the still title for reduced motion or data saving', () => {
    expect(titleAttractAllowed({ reducedMotion: () => false, saveData: () => false })).toBe(true)
    expect(titleAttractAllowed({ reducedMotion: () => true, saveData: () => false })).toBe(false)
    expect(titleAttractAllowed({ reducedMotion: () => false, saveData: () => true })).toBe(false)
  })
})
