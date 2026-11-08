import { expect, test, type Page } from '@playwright/test'
import { RuleBasedAI } from '../examples/games/tower_diffence_with_jev/src/ai/AIController'
import { GameEngine } from '../examples/games/tower_diffence_with_jev/src/game/GameEngine'
import { getField } from '../examples/games/tower_diffence_with_jev/src/game/model'
import { freshSave } from '../examples/games/tower_diffence_with_jev/src/progression/UpgradeSystem'
import { towerPath } from './tower-defense-e2e-arrange'

const shot = (page: Page, name: string) => page.screenshot({ path: `/tmp/ck-evidence/wp-h/${name}.png` })

function quickDefeatEngine(clock: () => number) {
  const save = freshSave()
  save.economyVersion = 2
  save.gold = 200
  const engine = new GameEngine(new RuleBasedAI(), save, 'meadow', 42, clock, undefined, 2, 4)
  engine.startAtStage(5)
  const point = getField('meadow', 2, 4).slots.find((p) => engine.previewPlacement('soldier', p).valid)
  expect(engine.place('soldier', point!)).toBe(true)
  expect(engine.startAssault()).toBe(true)
  return engine
}

// The assault is simulated in Node up to shortly before the base falls so the browser plays only the final break-through.
let nearDefeat: Promise<string> | undefined
const settle = () => new Promise<void>((resolve) => setImmediate(resolve))
async function simulate(ticks: number, untilEnd: boolean) {
  let t = 0
  const engine = quickDefeatEngine(() => t)
  let done = 0
  while (done < ticks && (!untilEnd || engine.state.phase === 'assault')) {
    t += 1000 / 60
    engine.update(1 / 60)
    done++
    await settle()
  }
  return { engine, ticks: done }
}
function nearDefeatRaw() {
  nearDefeat ??= (async () => {
    const probe = await simulate(10 * 60 * 60, true)
    expect(probe.engine.state.phase).toBe('defeat')
    const { engine } = await simulate(Math.max(0, probe.ticks - 8 * 60), false)
    expect(engine.state.phase).toBe('assault')
    expect(engine.state.playerBaseHp).toBeGreaterThan(0)
    const checkpoint = engine.exportCheckpoint()!
    return JSON.stringify({
      version: 3,
      profile: checkpoint.profile,
      run: { version: 1, progress: checkpoint.progress, engine: checkpoint }
    })
  })()
  return nearDefeat
}

async function openStageSelect(page: Page, cleared: number) {
  await page.goto(towerPath)
  await page.evaluate(
    (cleared) =>
      localStorage.setItem(
        'tower-jev-stages-v1',
        JSON.stringify({ version: 1, coins: 0, cleared, recruited: [], formation: ['soldier', 'archer'], stars: [] })
      ),
    cleared
  )
  await page.reload()
  await page.locator('#title-new').click()
  await expect(page.locator('#launch')).toBeVisible()
}

for (const size of [
  { width: 1440, height: 900 },
  { width: 390, height: 844 },
  { width: 1280, height: 720 },
  { width: 844, height: 390 }
])
  test.describe(`${size.width}px`, () => {
    test.use({ viewport: size })
    test('stage select previews the enemies of the selected stage', async ({ page }) => {
      await openStageSelect(page, 0)
      const foes = page.locator('#stage-enemies .foe')
      await page.locator('[data-stage="1"]').click()
      await expect(foes.first()).toHaveAttribute('data-enemy', 'slime')
      await expect(page.locator('#stage-enemies [data-enemy="goblin"]')).toHaveAttribute('aria-label', /ゴブリン|./)
      await expect(page.locator('#stage-enemies [data-boss="true"]')).toHaveCount(0)
      await expect(page.locator('#stage-enemies small')).toHaveCount(0)
      await shot(page, `stage1-${page.viewportSize()!.width}`)
      await page.evaluate(() =>
        localStorage.setItem(
          'tower-jev-stages-v1',
          JSON.stringify({
            version: 1,
            coins: 0,
            cleared: 9,
            recruited: [],
            formation: ['soldier', 'archer'],
            stars: []
          })
        )
      )
      await page.reload()
      await page.locator('#title-new').click()
      await page.locator('[data-stage="10"]').click()
      await expect(foes.first()).toHaveAttribute('data-boss', 'true')
      await expect(foes.first()).toHaveAttribute('data-enemy', 'dragon')
      await expect(foes.first()).toHaveAttribute('aria-label', /^ボス /)
      await expect(page.locator('#stage-enemies small')).toHaveText('空の敵は射程のある仲間で')
      await shot(page, `stage10-${page.viewportSize()!.width}`)
    })

    test('a quick defeat lists the enemies that broke through and a targeted tip', async ({ page }) => {
      const raw = await nearDefeatRaw()
      await page.goto(towerPath)
      await page.evaluate((raw) => localStorage.setItem('tower-jev-v3', raw), raw)
      await page.reload()
      await page.locator('#title-continue').click()
      await expect(page.locator('#campaign-loading')).toBeHidden({ timeout: 180_000 })
      await expect(page.locator('#app')).toHaveAttribute('data-phase', 'assault')
      const speed = page.locator('.bhud-speed[aria-pressed="false"]')
      if (await speed.isVisible()) await speed.click({ timeout: 2_000 }).catch(() => undefined)
      await expect(page.locator('#result')).toBeVisible({ timeout: 300_000 })
      await expect(page.locator('#result')).toHaveAttribute('data-outcome', 'defeat')
      await expect(page.locator('#result-leaks')).toBeVisible()
      await expect(page.locator('#result-leaks .leak').first()).toBeVisible()
      await expect(page.locator('#reward')).toContainText('ヒント:')
      await page.waitForTimeout(3500)
      expect(await page.locator('#result').evaluate((el) => el.scrollHeight <= el.clientHeight)).toBe(true)
      expect(await page.locator('#result').evaluate((el) => el.scrollHeight <= el.clientHeight)).toBe(true)
      await shot(page, `defeat-${page.viewportSize()!.width}`)
    })
  })
