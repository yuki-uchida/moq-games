import { describe, expect, it } from 'vitest'
import { runSteps, stageArt, stageWarmSteps, TILES_PER_STEP, type WarmStep } from '../src/app/warm'
import { sheet, tileKey } from '../src/art'
import { KING_RAGED, THEMES, allSheetSpecs, themedProp, type ThemeId } from '../src/art/contract'
import type { ArtReply, ArtRequest, ArtSource } from '../src/art/remote'
import { TILE, World } from '../src/game/sim'
import { STAGES } from '../src/game/stages'
import { stageTileQueries, tileQuery } from '../src/view/terrain'

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
        // The king fights on in his raged sheet after phase 2: it is painted before play, flash included.
        expect(art.sheets.includes(KING_RAGED)).toBe(stage.boss.kind === 'final')
        expect(art.flash.includes(KING_RAGED)).toBe(stage.boss.kind === 'final')
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

      it('lists what the stage can spawn while it runs', () => {
        // A broken rock may drop a fruit; on the nest stage digging and felled trees drop twigs and berries.
        if (world.props.some((prop) => prop.kind === 'rock')) expect(art.sheets).toContain('prop:fruit')
        if (stage.objective === 'collect')
          expect(art.sheets).toEqual(expect.arrayContaining(['prop:twig', 'prop:berry']))
        // Spitters shoot seeds.
        if (world.enemies.some((enemy) => enemy.kind === 'spitter') || stage.boss.minions.includes('spitter'))
          expect(art.sheets).toContain('prop:seed')
      })

      it('turns into one slice per clip of each sheet, the backdrop, the decorations and the terrain tiles', () => {
        const steps = stageWarmSteps(stage)
        const clips = art.sheets.flatMap((id) => Object.keys(sheet(id)).map((name) => `${id}.${name}`))
        const queries = stageTileQueries(world, Math.floor(world.player.x / TILE))
        const batches = Array.from(
          { length: Math.ceil(queries.length / TILES_PER_STEP) },
          (_, i) => `tiles:${stage.theme}:${i}`
        )
        expect(steps.map((step) => step.label)).toEqual([
          ...clips,
          `backdrop:${art.backdrop}`,
          `decor:${art.backdrop}`,
          'text',
          ...batches
        ])
        // The tile slices ask for the picture of every non-empty cell of the map.
        const asked = new Set(
          steps.flatMap((step) => (step.request?.kind === 'tiles' ? step.request.queries.map(tileKey) : []))
        )
        for (let ty = 0; ty < world.h; ty++)
          for (let tx = 0; tx < world.w; tx++) {
            const q = tileQuery(world, tx, ty)
            if (q) expect(asked.has(tileKey(q))).toBe(true)
          }
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

describe('runSteps through an art source', () => {
  /** A source that answers when the test says so; replies are local (nothing to adopt). */
  function fakeSource() {
    const asked: { request: ArtRequest; resolve: (reply: ArtReply) => void; reject: (error: unknown) => void }[] = []
    const source: ArtSource = {
      remote: true,
      request: (request) => new Promise((resolve, reject) => asked.push({ request, resolve, reject }))
    }
    return { source, asked }
  }
  const request = (name: string): ArtRequest => ({ kind: 'clip', sheet: 'fx', clip: name, flash: false })

  it('sends every request at once, then bakes each answer in order as it arrives', async () => {
    const { source, asked } = fakeSource()
    const log: string[] = []
    const steps: WarmStep[] = ['a', 'b', 'c'].map((name) => ({
      label: name,
      weight: 1,
      request: request(name),
      run: () => void log.push(`run ${name}`)
    }))
    const running = runSteps(
      steps,
      undefined,
      async () => void log.push('yield'),
      1000,
      () => 0,
      source
    )
    expect(asked.map((a) => (a.request.kind === 'clip' ? a.request.clip : ''))).toEqual(['a', 'b', 'c'])
    expect(log).toEqual([])
    // Answers may arrive out of order; baking keeps the order of the steps.
    asked[1].resolve({ kind: 'local' })
    await new Promise((resolve) => setTimeout(resolve, 0))
    expect(log).toEqual([])
    asked[0].resolve({ kind: 'local' })
    asked[2].resolve({ kind: 'local' })
    await running
    expect(log).toEqual(['run a', 'run b', 'run c', 'yield'])
  })

  it('asks nothing for art that is already here, and paints here what the source failed to paint', async () => {
    const { source, asked } = fakeSource()
    const log: string[] = []
    const steps: WarmStep[] = [
      { label: 'here', weight: 1, request: request('here'), ready: () => true, run: () => void log.push('here') },
      { label: 'lost', weight: 1, request: request('lost'), run: () => void log.push('lost') },
      { label: 'plain', weight: 1, run: () => void log.push('plain') }
    ]
    const running = runSteps(
      steps,
      undefined,
      async () => {},
      1000,
      () => 0,
      source
    )
    expect(asked).toHaveLength(1)
    asked[0].reject(new Error('worker gone'))
    await running
    expect(log).toEqual(['here', 'lost', 'plain'])
  })

  it('starts a new slice after waiting for an answer, so waiting never counts as work', async () => {
    const { source, asked } = fakeSource()
    let clock = 0
    const log: string[] = []
    const steps: WarmStep[] = ['a', 'b'].map((name) => ({
      label: name,
      weight: 1,
      request: request(name),
      run: () => {
        clock += 5
        log.push(name)
      }
    }))
    const running = runSteps(
      steps,
      undefined,
      async () => void log.push('yield'),
      8,
      () => clock,
      source
    )
    // The workers take 100 ms for the first answer: that time is not the page's.
    await new Promise((resolve) => setTimeout(resolve, 0))
    clock += 100
    asked[0].resolve({ kind: 'local' })
    asked[1].resolve({ kind: 'local' })
    await running
    // 5 + 5 ms of baking stays in one slice until the budget of 8 is used up.
    expect(log).toEqual(['a', 'b', 'yield'])
  })

  it('asks with the hurry it was given (a background warm-up waits behind everything else)', async () => {
    const hurries: unknown[] = []
    const source: ArtSource = {
      remote: true,
      request: (_request, hurry) => {
        hurries.push(hurry)
        return Promise.resolve({ kind: 'local' })
      }
    }
    const steps: WarmStep[] = ['a', 'b'].map((name) => ({ label: name, weight: 1, request: request(name), run() {} }))
    const hurry = { background: true, group: 'stage:5' }
    await runSteps(
      steps,
      undefined,
      async () => {},
      8,
      () => 0,
      source,
      hurry
    )
    expect(hurries).toEqual([hurry, hurry])
  })
})
