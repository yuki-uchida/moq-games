import { expect, test, type Page, type TestInfo } from '@playwright/test'
import { getField } from '../examples/games/tower_diffence_with_jev/src/game/model'
import { dragUnitToWorld, openOfflineCampaign, pointOnVisibleMap } from './tower-defense-e2e-arrange'

/** Screenshots go to the test output, or to TOWER_FEEL_SHOTS when set (manual review). */
async function shot(page: Page, info: TestInfo, name: string) {
  const dir = process.env.TOWER_FEEL_SHOTS
  await page.screenshot({ path: dir ? `${dir}/${name}.png` : info.outputPath(`${name}.png`) })
}

const gold = async (page: Page) => Number((await page.locator('#gold').textContent())!.replace(/\D/g, ''))

for (const size of [
  { width: 1440, height: 900 },
  { width: 390, height: 844 }
])
  test.describe(`${size.width}x${size.height}`, () => {
    test.use({ viewport: size })
    test('stage 1: an affordable upgrade badge sits on the ally; one tap or Enter levels it up during the wave', async ({
      page
    }, info) => {
      test.setTimeout(420_000)
      await page.addInitScript(() => localStorage.setItem('tower-jev-speed-v1', '2'))
      await openOfflineCampaign(page)
      const slots = getField('meadow', 2, 4).slots
      for (const [type, slot] of [
        ['soldier', 3],
        ['archer', 4]
      ] as const)
        await dragUnitToWorld(page, type, slots[slot])
      await expect(page.locator('.unit-health.player')).toHaveCount(2)
      // While allies still wait to deploy, the field shows levels but no upgrade nudges.
      await expect(page.locator('.unit-health.player .unit-level').first()).toHaveText('Lv1')
      await expect(page.locator('.unit-upgrade-badge:visible')).toHaveCount(0)
      if (await page.locator('#unit-tray').isVisible()) await page.locator('#unit-tray-close').click()
      await page.locator('#assault').click()
      await expect(page.locator('#app')).toHaveAttribute('data-phase', 'assault')

      // The wave is on and 80 G sit unspent: a badge offers the next level.
      // The archer (out of melee, so it stays standing) gets a badge offering the next level.
      const unit = page.locator('.unit-health.player[data-unit-type="archer"]')
      const badge = unit.locator('.unit-upgrade-badge')
      await expect(badge).toBeVisible({ timeout: 30_000 })
      await expect(badge).toHaveText(/60G/)
      await expect(badge).toHaveAttribute('aria-label', /レベル2へ強化 · 60 G/)
      await expect(page.locator('.skill-btn[data-upgrade="true"]').first()).toBeVisible()
      await expect(unit.locator('.unit-level')).toHaveText('Lv1')
      await pointOnVisibleMap(page, {
        x: Number(await unit.getAttribute('data-world-x')),
        y: Number(await unit.getAttribute('data-world-y'))
      })
      await shot(page, info, `upgrade-badge-${size.width}`)
      // Record the burst nodes and every gold readout as they change (they only live for about a second here).
      await page.evaluate(() => {
        const w = window as unknown as { __levelUpFx: string[]; __gold: number[] }
        w.__levelUpFx = []
        w.__gold = [Number(document.getElementById('gold')!.textContent!.replace(/\D/g, ''))]
        new MutationObserver((records) => {
          for (const record of records)
            for (const node of Array.from(record.addedNodes))
              if (node instanceof HTMLElement && /fx-levelup|levelup/.test(node.className))
                w.__levelUpFx.push(`${node.className}:${node.textContent}`)
        }).observe(document.getElementById('field')!, { childList: true })
        new MutationObserver(() =>
          w.__gold.push(Number(document.getElementById('gold')!.textContent!.replace(/\D/g, '')))
        ).observe(document.getElementById('gold')!, { childList: true, characterData: true, subtree: true })
      })
      expect(await gold(page)).toBeGreaterThanOrEqual(60)
      // A real pointer tap on the pulsing badge (not the drag/select handle under it); force skips the wait for
      // the endlessly bobbing badge to stand still.
      await badge.click({ force: true })
      await expect(unit.locator('.unit-level')).toHaveText('Lv2')
      await shot(page, info, `level-up-burst-${size.width}`)
      const { fx, golds } = await page.evaluate(() => {
        const w = window as unknown as { __levelUpFx: string[]; __gold: number[] }
        return { fx: w.__levelUpFx, golds: w.__gold }
      })
      expect(fx).toContain('fx-levelup:')
      expect(fx).toContain('fx-num levelup:LEVEL UP!Lv2')
      // Gold only falls when something is bought: the readout dropped by the 60 G (less any kill paid that frame).
      const drops = golds.slice(1).map((value, index) => golds[index] - value)
      expect(Math.max(...drops)).toBeGreaterThanOrEqual(40)
      expect(Math.max(...drops)).toBeLessThanOrEqual(60)
      await expect(page.locator('#app')).toHaveAttribute('data-phase', 'assault')
      await expect(page.locator('#selection-context')).toBeHidden()

      // A later badge (once kills pay for it) is bought with the keyboard: focus it and press Enter.
      let bought = false
      for (let attempt = 0; attempt < 4 && !bought; attempt++) {
        const next = page.locator('.unit-upgrade-badge:visible').first()
        await expect(next).toBeVisible({ timeout: 240_000 })
        const owner = page.locator(
          `.unit-health.player[data-unit-id="${await next.locator('xpath=..').getAttribute('data-unit-id')}"]`
        )
        const level = await owner.locator('.unit-level').textContent()
        const target = owner.locator('.unit-upgrade-badge')
        await target.focus()
        await page.keyboard.press('Enter')
        bought = await expect(owner.locator('.unit-level'))
          .not.toHaveText(level!, { timeout: 3_000 })
          .then(() => true)
          .catch(() => false)
      }
      expect(bought).toBe(true)

      // The deck tray explains why it is empty mid-wave instead of showing a blank panel.
      if (await page.locator('#selection-context').isVisible()) await page.locator('#selection-close').click()
      await page.locator('#deck-toggle').click()
      await expect(page.locator('#unit-tray')).toBeVisible()
      // Read cards and message in one snapshot: a wave break can open between two separate reads and turn
      // the empty message into deployable cards.
      await expect
        .poll(() =>
          page.evaluate(() => {
            const cards = Array.from(document.querySelectorAll('#unit-tray .unit')).filter((card) =>
              card.checkVisibility()
            ).length
            const empty = document.getElementById('unit-tray-empty')!.checkVisibility()
            return cards > 0 !== empty ? 'ok' : `cards=${cards} empty=${empty}`
          })
        )
        .toBe('ok')
      await shot(page, info, `tray-${size.width}`)
    })
  })
