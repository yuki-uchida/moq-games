import { describe, expect, it } from 'vitest'
import { runSteps, stageArt, stageWarmSteps, type WarmStep } from '../src/app/warm'
import { sheet } from '../src/art'
import { THEMES, allSheetSpecs, themedProp, type ThemeId } from '../src/art/contract'
import { World } from '../src/game/sim'
import { STAGES } from '../src/game/stages'

/** The sheet a prop kind is drawn from, written out independently of warm.ts. */
function propSheets(kind: string, data: number, theme: ThemeId): string[] {
  switch (kind) {
    case 'tree':
    case 'pine':
      // Each world has its own tree, pine and log.
      return [themedProp(`prop:${kind}`, theme), themedProp('prop:log', theme)]
    case 'switch':
      return [`prop:switch${data === 2 ? 2 : 1}`]
    case 'door':
      return [`prop:door${data === 2 ? 2 : 1}`]
    case 'princess':
      return ['princess', 'prop:cage']
    case 'hive':
      return ['prop:hive', 'prop:bee']
    default:
      return [`prop:${kind}`]
  }
}

describe('what a stage draws', () => {
  const contract = new Set(Object.keys(allSheetSpecs()))

  for (const stage of STAGES) {
    describe(`stage ${stage.no}`, () => {
      const art = stageArt(stage)
      const world = new World(stage, { seed: 1 })

      it('lists the hero, the effects and the interface', () => {
        expect(art.sheets).toEqual(expect.arrayContaining(['hero', 'fx', 'ui']))
      })

      it('lists every enemy kind of the map and of the boss minions, with their flash sheets', () => {
        const kinds = new Set<string>([...world.enemies.map((enemy) => enemy.kind), ...stage.boss.minions])
        for (const kind of kinds) {
          expect(art.sheets).toContain(kind)
          expect(art.flash).toContain(kind)
        }
      })

      it('lists every prop kind of the map', () => {
        for (const prop of world.props)
          for (const id of propSheets(prop.kind, prop.data, stage.theme)) expect(art.sheets).toContain(id)
      })

      it('lists the boss and the shots it throws', () => {
        expect(art.sheets).toContain(stage.boss.art)
        expect(art.flash).toContain(stage.boss.art)
        if (stage.boss.shockwave) expect(art.sheets).toContain('prop:shock')
        if (stage.boss.projectiles > 0)
          expect(art.sheets.some((id) => ['prop:seed', 'prop:feather', 'prop:stinger', 'prop:orb'].includes(id))).toBe(
            true
          )
      })

      it('names its world backdrop and only ids that exist in the contract', () => {
        expect(art.backdrop).toBe(stage.theme)
        expect(THEMES).toContain(art.backdrop)
        for (const id of art.sheets) expect(contract.has(id), id).toBe(true)
        for (const id of art.flash) expect(art.sheets).toContain(id)
        expect(new Set(art.sheets).size).toBe(art.sheets.length)
      })

      it('turns into one slice per clip of each sheet plus the backdrop', () => {
        const steps = stageWarmSteps(stage)
        const clips = art.sheets.flatMap((id) => Object.keys(sheet(id)).map((name) => `${id}.${name}`))
        expect(steps.map((step) => step.label)).toEqual([...clips, `backdrop:${art.backdrop}`])
      })
    })
  }
})

describe('runSteps', () => {
  const step = (weight: number, log: string[], name: string): WarmStep => ({
    label: name,
    weight,
    run: () => void log.push(name)
  })

  it('runs the slices in order, yields between them and reports growing progress ending at 1', async () => {
    const log: string[] = []
    const progress: number[] = []
    await runSteps(
      [step(1, log, 'a'), step(2, log, 'b'), step(1, log, 'c')],
      (fraction) => {
        progress.push(fraction)
        log.push(`p${fraction}`)
      },
      async () => void log.push('yield'),
      0
    )
    expect(log).toEqual(['p0', 'a', 'p0.25', 'yield', 'b', 'p0.75', 'yield', 'c', 'p1', 'yield', 'p1'])
    expect([...progress].sort((x, y) => x - y)).toEqual(progress)
  })

  it('lets a macrotask run between two slices (a microtask yield would not)', async () => {
    let timerFired = false
    setTimeout(() => (timerFired = true), 0)
    const seen: boolean[] = []
    const steps: WarmStep[] = [
      { label: 'a', weight: 1, run: () => seen.push(timerFired) },
      { label: 'b', weight: 1, run: () => seen.push(timerFired) }
    ]
    await runSteps(steps, undefined, () => new Promise((resolve) => setTimeout(resolve, 0)), 0)
    expect(seen).toEqual([false, true])
  })

  it('lets cheap slices share one turn and yields once the budget is used up', async () => {
    let clock = 0
    const log: string[] = []
    const costs = [2, 2, 2, 9, 1, 1]
    const steps: WarmStep[] = costs.map((cost, i) => ({
      label: String(i),
      weight: 1,
      run: () => {
        clock += cost
        log.push(`run${i}`)
      }
    }))
    await runSteps(
      steps,
      undefined,
      async () => void log.push('yield'),
      8,
      () => clock
    )
    // 2+2+2 stays under 8 ms, the 9 ms slice uses it up, the last slice always yields.
    expect(log).toEqual(['run0', 'run1', 'run2', 'run3', 'yield', 'run4', 'run5', 'yield'])
  })

  it('handles an empty list', async () => {
    const progress: number[] = []
    await runSteps(
      [],
      (fraction) => progress.push(fraction),
      async () => {}
    )
    expect(progress.at(-1)).toBe(1)
  })
})
