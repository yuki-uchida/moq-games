/** 訓練場 (DESIGN §12): targets, dummies and the tutorial completed by doing each action. */
import { describe, expect, it } from 'vitest'
import { makeLoadout } from '../src/data/loadout'
import { TUTORIAL_DONE, TUTORIAL_HINTS } from '../src/sim/modes/training'
import { BTN } from '../src/sim/types'
import { aimAt, rig } from './sim-helpers'
import { rangeMap } from './sim-maps'

describe('training', () => {
  it('places static and moving targets and a dummy squad that respawn', () => {
    const r = rig({ r: ['bee'], map: rangeMap() })
    r.step(2)
    const targets = r.sim.props.filter((p) => p.kind === 'target')
    expect(targets.length).toBe(10)
    expect(targets.filter((t) => t.state === 1).length).toBe(2)
    const mover = targets.find((t) => t.state === 1)!
    const x0 = mover.p[0]
    r.step(60)
    expect(Math.abs(mover.p[0] - x0)).toBeGreaterThan(2)
    expect(r.sim.foes.filter((f) => f.kind === 'kurozume' && f.passive).length).toBe(3)
    const t = targets.find((x) => x.state === 0)!
    t.p = [r.player().p[0], 0, r.player().p[2] + 8]
    t.hp = 1
    aimAt(r, [t.p[0], 1, t.p[2]])
    r.press('R')
    r.step(30)
    expect(r.of('propBreak').length).toBe(1)
    r.step(3 * 60 + 2)
    expect(r.sim.props.filter((p) => p.kind === 'target').length).toBe(10)
  })

  it('walks through the 8 tutorial steps only by doing them', () => {
    const r = rig({
      loadout: makeLoadout(['bee', 'wood'], ['frog'], []),
      map: rangeMap(),
      config: { training: { tutorial: true } }
    })
    const view = () => r.world.view().training!
    const inp = r.input()
    r.step(1)
    expect(view().step).toBe(0)
    expect(view().hint).toBe(TUTORIAL_HINTS[0])
    // Doing the wrong thing does not advance.
    inp.presses.jump++
    r.step(60)
    expect(view().step).toBe(0)
    // 1 move
    inp.mz = 1
    r.step(90)
    inp.mz = 0
    expect(view().step).toBe(1)
    // 2 look
    for (let i = 0; i < 40; i++) {
      inp.yaw += 0.1
      r.step(1)
    }
    expect(view().step).toBe(2)
    // 3 jump
    inp.presses.jump++
    r.step(60)
    expect(view().step).toBe(3)
    // 4 dash
    inp.presses.dash++
    r.step(30)
    expect(view().step).toBe(4)
    // 5 hit a target with the right paw
    const t = r.sim.props.find((p) => p.kind === 'target' && p.state === 0)!
    aimAt(r, [t.p[0], 1, t.p[2]])
    r.press('R')
    r.step(30)
    expect(view().step).toBe(5)
    // 6 cycle
    inp.selR = 1
    r.step(20)
    expect(view().step).toBe(6)
    // 7 left paw
    r.press('L')
    r.step(2)
    expect(view().step).toBe(7)
    // 8 revive the downed marker
    const marker = r.sim.props.find((p) => p.kind === 'tutorial')!
    expect(marker.state).toBe(7)
    r.player().p = [marker.p[0] + 1, 0, marker.p[2]]
    inp.held = BTN.INTERACT
    r.step(130)
    const tut = r.of('tutorial')
    expect(tut.at(-1)!.hint).toBe(TUTORIAL_DONE)
    expect(view().step).toBe(-1)
    expect(tut.map((e) => e.step)).toEqual([0, 1, 2, 3, 4, 5, 6, 7, 8])
  })
})
