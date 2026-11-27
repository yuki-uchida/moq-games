import { expect, test, type Page, type TestInfo } from '@playwright/test'
import { getField } from '../examples/games/tower_diffence_with_jev/src/game/model'
import { dragUnitToWorld, openOfflineCampaign } from './tower-defense-e2e-arrange'

/** Screenshots go to the test output, or to TOWER_TUTORIAL_SHOTS when set (manual review). */
async function shot(page: Page, info: TestInfo, name: string) {
  const dir = process.env.TOWER_TUTORIAL_SHOTS
  await page.screenshot({ path: dir ? `${dir}/${name}.png` : info.outputPath(`${name}.png`) })
}

const bubble = (page: Page, step: string) => page.locator(`.tut:not([hidden]) .tut-bubble[data-step="${step}"]`)
const flags = (page: Page) => page.evaluate(() => localStorage.getItem('tower-jev-tutorial-v1') ?? '')

/** The visible callout must stay on screen and clear of the HUD controls it does not point at. */
const measureInPage = ([targetSel, stepName]: readonly [string, string | undefined]) => {
  const bubble = document.querySelector('.tut:not([hidden]) .tut-bubble') as HTMLElement | null
  if (!bubble || (stepName && bubble.dataset.step !== stepName)) return null
  const box = bubble.getBoundingClientRect()
  const target = document.querySelector(targetSel)
  const hits: string[] = []
  for (const el of Array.from(
    document.querySelectorAll(
      '.bhud-main, .bhud-side button, .bhud-coins, .wave-call, #skill-bar .skill-btn, #skill-auto, .gold-purse, #settings-toggle, #deck-toggle, #assault'
    )
  )) {
    if (target && (el === target || el.contains(target) || target.contains(el))) continue
    const r = el.getBoundingClientRect()
    if (!r.width || !r.height || !(el as HTMLElement).checkVisibility()) continue
    const overlap =
      Math.min(box.right, r.right) - Math.max(box.left, r.left) > 2 &&
      Math.min(box.bottom, r.bottom) - Math.max(box.top, r.top) > 2
    if (overlap) hits.push(el.className || el.id)
  }
  return {
    text: bubble.textContent ?? '',
    hits,
    inside: box.left >= 0 && box.right <= innerWidth && box.top >= 0 && box.bottom <= innerHeight
  }
}
const measureCallout = (page: Page, targetSelector: string, step?: string) =>
  page.evaluate(measureInPage, [targetSelector, step] as const)

const STEP_TARGETS = {
  wave: '.wave-call',
  skill: '#skill-bar .skill-btn[data-state="ready"]'
} as const
/**
 * The wave break and the ready special can arrive while the test is still busy with the earlier steps (how soon the first
 * upgrade is affordable depends on the economy). Record the first on-screen measurement of each in the page itself, every
 * frame, so no callout is missed whatever order things happen in.
 */
async function recordCallouts(page: Page) {
  await page.addInitScript(
    ({ source, targets }) => {
      const measure = new Function('arg', `return (${source})(arg)`) as (arg: readonly [string, string]) => unknown
      const fits: Record<string, unknown> = {}
      ;(window as unknown as { __tutFits: unknown }).__tutFits = fits
      const tick = () => {
        const step = (document.querySelector('.tut:not([hidden]) .tut-bubble') as HTMLElement | null)?.dataset.step
        if (step && step in targets && !fits[step]) fits[step] = measure([targets[step as keyof typeof targets], step])
        requestAnimationFrame(tick)
      }
      requestAnimationFrame(tick)
    },
    { source: measureInPage.toString(), targets: STEP_TARGETS }
  )
}
const recordedFit = (page: Page, step: string) =>
  page.evaluate(
    (name) => (window as unknown as { __tutFits: Record<string, unknown> }).__tutFits?.[name] ?? null,
    step
  ) as Promise<Measure | null>

type Measure = { text: string; hits: string[]; inside: boolean }
function expectClear(step: string, result: Measure) {
  expect(result.inside, `${step} callout inside viewport`).toBe(true)
  expect(result.hits, `${step} callout overlaps HUD`).toEqual([])
}
async function expectClearOfHud(page: Page, step: string, targetSelector: string) {
  expectClear(step, (await measureCallout(page, targetSelector, step))!)
}

test.use({ video: 'off', trace: 'off' })

for (const size of [
  { width: 1440, height: 900 },
  { width: 390, height: 844 },
  { width: 320, height: 568 }
])
  test.describe(`${size.width}x${size.height}`, () => {
    test.use({ viewport: size })
    test('stage 1 guided tour: gold, upgrade, wave call and special callouts appear once, in play, and never return', async ({
      page
    }, info) => {
      test.setTimeout(600_000)
      await recordCallouts(page)
      await page.addInitScript(() => {
        if (!sessionStorage.getItem('tut-init')) {
          sessionStorage.setItem('tut-init', '1')
          localStorage.setItem('tower-jev-speed-v1', '2')
        }
      })
      await openOfflineCampaign(page)
      const slots = getField('meadow', 2, 4).slots
      for (const [type, slot] of [
        ['soldier', 3],
        ['archer', 4]
      ] as const)
        await dragUnitToWorld(page, type, slots[slot])
      await expect(page.locator('.unit-health.player')).toHaveCount(2)
      // Nothing from the tour before the battle.
      await expect(page.locator('.tut:not([hidden])')).toHaveCount(0)
      if (await page.locator('#unit-tray').isVisible()) await page.locator('#unit-tray-close').click()
      await page.locator('#assault').click()
      await expect(page.locator('#app')).toHaveAttribute('data-phase', 'assault')

      // 1. First kill gold: a callout at the G counter that goes away on its own.
      await expect(bubble(page, 'gold')).toBeVisible({ timeout: 120_000 })
      // Read everything in one quick pass: this callout only lives a few seconds.
      const goldFit = (await measureCallout(page, '.gold-purse', 'gold'))!
      await shot(page, info, `tutorial-1-gold-${size.width}`)
      expectClear('gold', goldFit)
      expect(goldFit.text).toContain('敵を倒すとGが手に入る')
      await expect(bubble(page, 'gold')).toBeHidden({ timeout: 15_000 })

      // 2. An affordable badge: the callout stays until the first purchase, and the game keeps running.
      const badge = page.locator('.unit-upgrade-badge:not([hidden])').first()
      await expect(bubble(page, 'upgrade')).toBeVisible({ timeout: 120_000 })
      await expect(bubble(page, 'upgrade')).toHaveText(/↑をタップで強化！ 戦闘中でもOK/)
      await expect(badge).toBeVisible()
      await expectClearOfHud(page, 'upgrade', '.unit-upgrade-badge:not([hidden])')
      await shot(page, info, `tutorial-2-upgrade-${size.width}`)
      await page.waitForTimeout(1500)
      await expect(bubble(page, 'upgrade')).toBeVisible()
      await expect(page.locator('#app')).toHaveAttribute('data-phase', 'assault')
      // The callout never blocks the badge: a real tap still buys the level.
      const unitId = await badge.locator('xpath=..').getAttribute('data-unit-id')
      const level = page.locator(`.unit-health.player[data-unit-id="${unitId}"] .unit-level`)
      await badge.click({ force: true })
      await expect(level).toHaveText('Lv2')
      await expect(bubble(page, 'after')).toBeVisible()
      await expect(bubble(page, 'after')).toHaveText(/攻撃・体力アップ！/)
      await shot(page, info, `tutorial-2b-after-${size.width}`)
      await expect(bubble(page, 'after')).toBeHidden({ timeout: 10_000 })
      await expect(bubble(page, 'upgrade')).toBeHidden()
      expect(await flags(page)).toContain('upgrade')

      // 3 and 4 arrive in either order, and either may already have come and gone during steps 1 and 2: wave break button, ready special.
      const seen = new Set<string>()
      const start = Date.now()
      while (!(seen.has('wave') && seen.has('skill')) && Date.now() - start < 420_000) {
        for (const step of ['wave', 'skill'] as const) {
          if (seen.has(step)) continue
          // Read text and layout in one quick pass: these callouts only live a few seconds.
          const live = await measureCallout(page, STEP_TARGETS[step], step)
          const fit = live ?? (await recordedFit(page, step))
          if (!fit) continue
          seen.add(step)
          if (live) await shot(page, info, `tutorial-${step === 'wave' ? 3 : 4}-${step}-${size.width}`)
          expectClear(step, fit)
          expect(fit.text).toContain(step === 'wave' ? '早く呼ぶほどボーナスG' : '✦で必殺技／AUTOで自動発動')
          if (step === 'wave' && live) {
            // Pressing the button (or the break ending first) dismisses the callout.
            await page
              .locator('.wave-call')
              .click({ timeout: 1500 })
              .catch(() => undefined)
            await expect(bubble(page, 'wave')).toBeHidden()
          }
        }
        await page.waitForTimeout(150)
      }
      expect([...seen].sort()).toEqual(['skill', 'wave'])
      // Each step is finished (the special's hint times out on its own), then the whole tour is spent.
      await expect.poll(() => flags(page), { timeout: 30_000 }).toMatch(/(?=.*gold)(?=.*upgrade)(?=.*wave)(?=.*skill)/)

      // Reload and start a new game: the tour does not come back.
      await page.reload()
      await page.locator('#title-new').click()
      await page.locator('#start').click()
      await page.locator('#save-confirm-accept').click()
      await expect(page.locator('#launch')).toBeHidden({ timeout: 180_000 })
      await expect(page.locator('#field canvas').first()).toBeVisible()
      for (const [type, slot] of [
        ['soldier', 3],
        ['archer', 4]
      ] as const)
        await dragUnitToWorld(page, type, slots[slot])
      if (await page.locator('#unit-tray').isVisible()) await page.locator('#unit-tray-close').click()
      await page.locator('#assault').click()
      await expect(page.locator('#app')).toHaveAttribute('data-phase', 'assault')
      // Kills, an affordable badge and ready specials all happen again, but with no callouts.
      await expect(page.locator('.unit-upgrade-badge:not([hidden])').first()).toBeVisible({ timeout: 120_000 })
      await page.waitForTimeout(6000)
      await expect(page.locator('.tut-bubble:visible')).toHaveCount(0)
      expect(await flags(page)).toContain('skill')
    })
  })
