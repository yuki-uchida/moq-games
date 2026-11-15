/**
 * The view starts a boss's flinch or cast only when it plays out before he next walks or winds up, from state
 * lengths it mirrors from the simulation (view/clips.ts). Here they are measured in the real simulation: each boss
 * kind is left to run its cycle untouched, and every state it goes through in full is timed. A change of the
 * simulation's timing breaks this test instead of the picture.
 */
import { describe, expect, it } from 'vitest'
import {
  BRUTE_IDLE_SECONDS,
  BRUTE_RECOVER_SECONDS,
  BRUTE_STUN_SECONDS,
  FINAL_IDLE_SECONDS,
  FINAL_RECOVER_SECONDS,
  FLYER_IDLE_SECONDS,
  FLYER_RECOVER_SECONDS,
  SWARM_IDLE_SECONDS,
  SWARM_RECOVER_SECONDS,
  TANK_IDLE_SECONDS,
  TANK_RECOVER_SECONDS,
  SHOT_CUE_SECONDS,
  shotDue,
  type BossSnapshot
} from '../src/view/clips'
import { World, emptyInput } from '../src/game/sim'
import { STAGES } from '../src/game/stages'
import { STEP, hitSweep } from './play-audit'

/** The lengths (s) of every state the boss of stage `no` went through in full, by state. */
function stateLengths(no: number, options: { phase2?: boolean } = {}) {
  // No hits: the sweep's hit interval is longer than the run.
  const r = hitSweep(no, 5, { seconds: 30, every: 1e9, ...options })
  const rows = r.tracks.get('boss')!.rows.filter((row) => row.state !== null)
  const lengths = new Map<string, number[]>()
  let from = 0
  for (let i = 1; i <= rows.length; i++) {
    if (i < rows.length && rows[i].state === rows[from].state && rows[i].step === rows[i - 1].step + 1) continue
    // The first and the last stretch may be cut by the run.
    if (from > 0 && i < rows.length) {
      const state = rows[from].state!
      let list = lengths.get(state)
      if (!list) lengths.set(state, (list = []))
      // Simulated time: the display frames of a hit-stop hold the simulation.
      let seconds = 0
      for (let k = from; k < i; k++) if (!rows[k].held) seconds += rows[k].dt
      list.push(seconds)
    }
    from = i
  }
  return lengths
}

/**
 * Every measured length is the constant, give or take the step on which the simulation notices it is over (and the
 * step a hit-stop begins on, shown standing still).
 */
function expectLength(lengths: Map<string, number[]>, state: string, seconds: number) {
  const list = lengths.get(state)
  expect(list?.length, `${state} was gone through`).toBeGreaterThan(0)
  for (const length of list!) {
    expect(length, state).toBeGreaterThanOrEqual(seconds - STEP - 1e-9)
    expect(length, state).toBeLessThanOrEqual(seconds + 2 * STEP + 1e-9)
  }
}

describe('the boss state lengths the view mirrors are those of the simulation', () => {
  it('the brutes: idle, recover (and a stun, when a charge ends in a wall)', () => {
    for (const no of [3, 4, 5]) {
      const lengths = stateLengths(no)
      expectLength(lengths, 'idle', BRUTE_IDLE_SECONDS)
      expectLength(lengths, 'recover', BRUTE_RECOVER_SECONDS)
      if (lengths.has('stunned')) expectLength(lengths, 'stunned', BRUTE_STUN_SECONDS)
    }
    expect(BRUTE_STUN_SECONDS).toBe(1.1)
  })

  it('the crow: hover, recover', () => {
    const lengths = stateLengths(2)
    expectLength(lengths, 'idle', FLYER_IDLE_SECONDS)
    expectLength(lengths, 'recover', FLYER_RECOVER_SECONDS)
  })

  it('the bear and the ape: walk, recover', () => {
    for (const no of [6, 8]) {
      const lengths = stateLengths(no)
      expectLength(lengths, 'idle', TANK_IDLE_SECONDS)
      expectLength(lengths, 'recover', TANK_RECOVER_SECONDS)
    }
  })

  it('the fox and the bee: walk, recover', () => {
    for (const no of [7, 9]) {
      const lengths = stateLengths(no)
      expectLength(lengths, 'idle', SWARM_IDLE_SECONDS)
      expectLength(lengths, 'recover', SWARM_RECOVER_SECONDS)
    }
  })

  it('the king, in each phase: walk, recover', () => {
    const one = stateLengths(10)
    expectLength(one, 'idle', FINAL_IDLE_SECONDS[0])
    expectLength(one, 'recover', FINAL_RECOVER_SECONDS[0])
    const two = stateLengths(10, { phase2: true })
    expectLength(two, 'idle', FINAL_IDLE_SECONDS[1])
    expectLength(two, 'recover', FINAL_RECOVER_SECONDS[1])
  })
})

describe('shotDue: the seconds until the next shot of the crow, the fox and the bee, step for step', () => {
  /**
   * The boss of stage `no` fought for `seconds`: the hero, out of harm, walks to and fro under him (so his dives and
   * dashes cross him) and hits him every `every` s. Before every step, the seconds `shotDue` predicts; after it,
   * whether a shot left.
   */
  function fight(no: number, seed: number, seconds = 40, every = 0.9) {
    const world = new World(STAGES[no - 1], { seed })
    const boss = world.boss!
    const p = world.player
    p.maxHp = 999
    p.x = boss.arenaX + 4
    p.y = boss.y + boss.h - p.h
    const steps: { due: number | null; shot: boolean }[] = []
    let next = every
    for (let t = 0; t < seconds; t += STEP) {
      p.hp = p.maxHp
      p.invuln = 99999
      if (t >= next && boss.active) {
        next += every
        boss.hp = Math.max(boss.hp, Math.ceil(boss.maxHp / 2) + 2)
        boss.invuln = 0
        world.damageBoss(1)
      }
      const due = shotDue({
        kind: boss.def.kind,
        state: boss.state,
        stateTime: boss.stateTime,
        active: boss.active,
        shotTimer: boss.shotTimer,
        projectiles: boss.def.projectiles
      } as BossSnapshot)
      const input = emptyInput()
      const dx = boss.x + boss.w / 2 - (p.x + p.w / 2)
      // Walking at him and through him, and back.
      input[Math.floor(t / 1.3) % 2 ? (dx > 0 ? 'left' : 'right') : dx > 0 ? 'right' : 'left'] = true
      world.step(STEP, input)
      const events = world.events.splice(0)
      steps.push({ due, shot: events.some((e) => e.type === 'boss-shoot') })
    }
    return steps
  }

  for (const [no, seed] of [
    [2, 5],
    [2, 11],
    [7, 5],
    [7, 42],
    [9, 5],
    [9, 9]
  ] as const)
    it(`stage ${no}, seed ${seed}: it names the step of every shot, and never a step without one`, () => {
      const steps = fight(no, seed)
      const shots = steps.flatMap((s, k) => (s.shot ? [k] : []))
      expect(shots.length).toBeGreaterThan(8)
      for (let k = 0; k < steps.length; k++) {
        const due = steps[k].due
        const next = shots.find((s) => s >= k)
        if (due !== null) {
          // The shot leaves on the step it names (when the run gets there).
          const at = k + Math.round(due / STEP) - 1
          if (at < steps.length) expect(next, `step ${k}: due ${due}`).toBe(at)
        } else if (next !== undefined) {
          // Not predicted (the crow's dive, or before it): further away than any light.
          expect((next - k + 1) * STEP, `step ${k}`).toBeGreaterThan(SHOT_CUE_SECONDS)
        }
      }
      // Every shot was announced for the whole of the light's time.
      const need = Math.round(SHOT_CUE_SECONDS / STEP)
      for (const s of shots)
        if (s >= need) for (let k = s - need + 1; k <= s; k++) expect(steps[k].due, `${k}`).not.toBeNull()
    })
})
