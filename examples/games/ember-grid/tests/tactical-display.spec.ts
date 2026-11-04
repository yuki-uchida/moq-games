import { expect, test } from '@playwright/test'
import { createGame, damage, seeded, size } from '../src/game'
import type { Game } from '../src/game'

function saved(game: Game) {
  const { rng, rocks, groves, ...rest } = game
  return {
    version: 1,
    difficulty: 'classic',
    formation: 'balanced',
    checkpoints: [],
    furthest: game.stage,
    cleared: [],
    bestTurns: {},
    suspend: { ...rest, rocks: [...rocks], groves: [...groves], rngState: (rng as { state: number }).state }
  }
}

for (const width of [1280, 390]) {
  for (const kind of ['attack', 'kill', 'heal'] as const) {
    test(`level-up ${kind} targets the right unit ${width}`, async ({ page }) => {
      await page.setViewportSize({ width, height: width === 390 ? 844 : 800 })
      const game = createGame(kind === 'heal' ? 3 : 0, 'balanced', undefined, seeded(7))
      const actor = game.units.find((unit) => unit.role === (kind === 'heal' ? 'healer' : 'soldier'))!
      const target = game.units.find((unit) => (kind === 'heal' ? unit.id === 'b' : unit.side === 'enemy'))!
      for (const unit of game.units) if (unit !== actor && unit !== target) unit.hp = 0
      Object.assign(actor, { x: 2, y: 4, exp: 99 })
      Object.assign(target, { x: 3, y: 4, hp: kind === 'heal' ? target.max - 4 : kind === 'kill' ? 1 : target.max })
      game.rocks.delete('2,4')
      game.rocks.delete('3,4')
      const amount = kind === 'heal' ? 4 : damage(actor, target, game)
      const save = saved(game)
      await page.addInitScript((value) => {
        localStorage.setItem('ember-grid:save:v1', JSON.stringify(value))
        localStorage.setItem('ember-grid:tutorial-complete:v1', '1')
      }, save)
      await page.goto('./?seed=7')
      await page.getByRole('button', { name: /つづきから/ }).click()
      await expect(page.locator('#end')).toBeEnabled({ timeout: 90000 })
      await page
        .locator('.cell')
        .nth(4 * size + 2)
        .click()
      await page
        .locator('.cell')
        .nth(4 * size + 3)
        .click()
      await page.evaluate(() => {
        const samples: { id: string; track: string; number: string | null }[] = []
        ;(window as unknown as { samples: typeof samples }).samples = samples
        const start = performance.now()
        const sample = () => {
          const canvas = document.querySelector('.stage') as HTMLCanvasElement & { stage: import('../src/stage').Stage }
          for (const unit of canvas.stage.diagnostics())
            samples.push({
              id: unit.id,
              track: unit.track,
              number: document.querySelector('.damage-number, .healing-effect')?.textContent ?? null
            })
          if (performance.now() - start < 3000) requestAnimationFrame(sample)
        }
        requestAnimationFrame(sample)
      })
      await page.getByRole('button', { name: kind === 'heal' ? '回復' : '攻撃', exact: true }).click()
      await expect
        .poll(() =>
          page.evaluate(() =>
            (window as unknown as { samples: { number: string | null }[] }).samples.some(
              (sample) => sample.number !== null
            )
          )
        )
        .toBe(true)
      if (kind === 'attack') await page.screenshot({ path: `test-results/ember-level-up-${width}.png` })
      const samples = await page.evaluate(
        () => (window as unknown as { samples: { id: string; track: string; number: string | null }[] }).samples
      )
      expect(samples.some((sample) => sample.id === actor.id && ['hit', 'death'].includes(sample.track))).toBe(false)
      if (kind !== 'heal')
        expect(
          samples.some((sample) => sample.id === target.id && sample.track === (kind === 'kill' ? 'death' : 'hit'))
        ).toBe(true)
      expect(samples.some((sample) => sample.number?.includes(kind === 'heal' ? `+${amount}` : `−${amount}`))).toBe(
        true
      )
    })
  }
  test(`holding dragon range ${width}`, async ({ page }) => {
    await page.setViewportSize({ width, height: width === 390 ? 844 : 800 })
    const game = createGame(5, 'balanced', undefined, seeded(7))
    const dragon = game.units.find((unit) => unit.ai === 'hold')!
    const save = saved(game)
    await page.addInitScript((value) => {
      localStorage.setItem('ember-grid:save:v1', JSON.stringify(value))
      localStorage.setItem('ember-grid:tutorial-complete:v1', '1')
    }, save)
    await page.goto('./')
    await page.getByRole('button', { name: /つづきから/ }).click()
    await expect(page.locator('#end')).toBeEnabled({ timeout: 90000 })
    const boss = page.locator('.cell').nth(dragon.y * size + dragon.x)
    if (width === 1280) await boss.hover()
    else await boss.click()
    await expect(page.locator('.enemy-move')).toHaveCount(0)
    const indexes = await page
      .locator('.cell.reach')
      .evaluateAll((cells) => cells.map((cell) => [...cell.parentElement!.children].indexOf(cell)))
    expect(indexes.length).toBeGreaterThan(0)
    for (const index of indexes)
      expect(Math.abs((index % size) - dragon.x) + Math.abs(Math.floor(index / size) - dragon.y)).toBeLessThanOrEqual(
        dragon.range
      )
    await page.screenshot({ path: `test-results/ember-dragon-hover-${width}.png` })
  })
}
