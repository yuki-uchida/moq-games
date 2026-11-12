import { expect, test, type Page } from '@playwright/test'

/** Collects console errors and page errors (dev-server dependency re-optimisation noise excluded). */
function watchErrors(page: Page): string[] {
  const errors: string[] = []
  page.on('console', (m) => {
    if (m.type() !== 'error') return
    const text = m.text()
    if (/Outdated Optimize Dep|Failed to fetch dynamically imported module/.test(text)) return
    errors.push(text)
  })
  page.on('pageerror', (e) => errors.push(e.message))
  return errors
}

async function openTitle(page: Page) {
  await page.goto('/')
  await expect(page.locator('.screen.title:not(.is-leaving)')).toBeVisible({ timeout: 90_000 })
  await page.locator('.title-press').click()
  await expect(page.locator('.screen.title.is-ready')).toBeVisible()
}

// Model generation on boot and world creation can take a while on a busy machine, and the shared dev server
// reloads the page whenever a source file changes while other workstreams edit: allow retries.
test.describe.configure({ timeout: 240_000, retries: 2 })

const current = (page: Page, cls: string) => page.locator(`.screen.${cls}:not(.is-leaving)`)

test.describe('アニマフロント front-end', () => {
  test('boot → title → menu with no console errors', async ({ page }) => {
    const errors = watchErrors(page)
    await openTitle(page)
    await expect(page.locator('.logo-ja')).toHaveText('アニマフロント')
    await expect(page.locator('[data-menu]')).toHaveCount(5)
    for (const id of ['codex', 'settings', 'credits']) {
      await page.click(`[data-menu="${id}"]`)
      await expect(current(page, id)).toBeVisible()
      await page.keyboard.press('Escape')
      await expect(current(page, 'title')).toBeVisible()
    }
    expect(errors).toEqual([])
  })

  test('keyboard navigation reaches every main menu item', async ({ page }) => {
    await openTitle(page)
    await page.keyboard.press('ArrowDown')
    await expect(page.locator('[data-menu="loadout"]')).toBeFocused()
    await page.keyboard.press('Enter')
    await expect(current(page, 'loadout')).toBeVisible()
    await page.keyboard.press('Escape')
    await expect(current(page, 'title')).toBeVisible()
  })

  test('PvE: missions → solo lobby → briefing → game screen', async ({ page }) => {
    const errors = watchErrors(page)
    await openTitle(page)
    await page.click('[data-menu="sortie"]')
    await page.click('[data-mode="pve"]')
    await expect(current(page, 'missions')).toBeVisible()
    await expect(page.locator('[data-mission="harbor"]')).toHaveAttribute('aria-disabled', 'true')
    await page.click('[data-diff="hard"]')
    await page.click('[data-go]')
    // online rooms belong to the net workstream: only check the room choice is offered
    await expect(page.locator('[data-room="host"]')).toBeVisible()
    await page.click('[data-room="solo"]')
    await expect(current(page, 'lobby')).toBeVisible()
    await expect(page.locator('.seat')).toHaveCount(4)
    await expect(page.locator('.lobby-info')).toContainText('決死')
    await page.click('.lobby-go')
    await expect(current(page, 'briefing')).toBeVisible()
    await expect(page.locator('.brief-speaker')).toContainText('ゲンブ')
    await page.click('.brief-go')
    await expect(current(page, 'game')).toBeVisible()
    // Either the match runs (HUD) or the screen shows its Japanese error card; never a blank page.
    await expect(page.locator('.hud .ag-value:not(:empty), .game-error.is-on').first()).toBeVisible({ timeout: 60_000 })
    expect(errors).toEqual([])
  })

  test('PvP: 3 teams × 4 seats and the game screen', async ({ page }) => {
    await openTitle(page)
    await page.click('[data-menu="sortie"]')
    await page.click('[data-mode="pvp"]')
    await page.click('[data-room="solo"]')
    await expect(page.locator('.team-col')).toHaveCount(3)
    await expect(page.locator('.seat')).toHaveCount(12)
    await page.click('[data-team="1"]')
    await expect(page.locator('.team-col.is-mine .team-head')).toContainText('アオイ隊')
    await page.click('.lobby-go')
    await page.click('.brief-go')
    await expect(current(page, 'game')).toBeVisible()
    await expect(page.locator('.hud .pvp-clock:not(:empty), .game-error.is-on').first()).toBeVisible({
      timeout: 60_000
    })
  })

  test('training: tutorial reaches the game screen', async ({ page }) => {
    await openTitle(page)
    await page.click('[data-menu="sortie"]')
    await page.click('[data-mode="training"]')
    await page.click('[data-training="tutorial"]')
    await expect(current(page, 'briefing')).toBeVisible()
    await page.click('.brief-go')
    await expect(current(page, 'game')).toBeVisible()
    await expect(page.locator('.hud .ag-value:not(:empty), .game-error.is-on').first()).toBeVisible({ timeout: 60_000 })
  })

  test('loadout: edit, save to a custom slot and reload', async ({ page }) => {
    await openTitle(page)
    await page.click('[data-menu="loadout"]')
    await expect(current(page, 'loadout')).toBeVisible()
    await page.click('[data-species="bear"]')
    await expect(page.locator('.lo-sp-name')).toHaveText('ゴウ')
    await page.getByRole('button', { name: '全部外す' }).click()
    await expect(page.locator('.lo-slot.is-empty')).toHaveCount(16)
    await page.click('[data-tab="ranged"]')
    await page.click('[data-item="bee"]')
    await page.click('[data-slot="0"]')
    await expect(page.locator('[data-slot="0"]')).toContainText('ミツバチ')
    // the antique stays selected: choose the left paw and place it again
    await page.click('[data-hand="L"]')
    await page.click('[data-slot="1"]')
    await expect(page.locator('[data-slot="1"] .lo-hand')).toHaveText('左')
    // placement rules: the same antique twice in the same paw is refused
    await page.click('[data-slot="2"]')
    await expect(page.locator('.toast.is-error')).toContainText('同じ手')
    await page.click('.lo-save')
    const nameInput = page.locator('.lo-save-modal input')
    await nameInput.fill('はちみつ部隊')
    await page.click('[data-save-slot="1"]')
    await expect(page.locator('[data-custom="1"]')).toHaveClass(/is-on/)
    await page.reload()
    await openTitle(page)
    await expect(page.locator('.title-member')).toContainText('ゴウ')
    await expect(page.locator('.title-member')).toContainText('はちみつ部隊')
    await page.click('[data-menu="loadout"]')
    await expect(page.locator('[data-slot="0"]')).toContainText('ミツバチ')
    await expect(page.locator('[data-custom="1"]')).toContainText('はちみつ部隊')
  })

  test('settings persist across reload', async ({ page }) => {
    await openTitle(page)
    await page.click('[data-menu="settings"]')
    await page.click('[data-setting="invertY"]')
    await page.click('[data-setting="quality"][data-value="high"]')
    await page.locator('[data-setting="volumeMusic"]').fill('0.3')
    await page.reload()
    await openTitle(page)
    await page.click('[data-menu="settings"]')
    await expect(page.locator('[data-setting="invertY"]')).toHaveAttribute('aria-checked', 'true')
    await expect(page.locator('[data-setting="quality"][data-value="high"]')).toHaveAttribute('aria-checked', 'true')
    await expect(page.locator('[data-setting="volumeMusic"]')).toHaveValue('0.3')
    const stored = await page.evaluate(() => localStorage.getItem('anima-front-v1:settings'))
    expect(JSON.parse(stored ?? '{}')).toMatchObject({ invertY: true, quality: 'high', volumeMusic: 0.3 })
  })

  test('HUD demo renders every block, pauses and reaches the results', async ({ page }) => {
    const errors = watchErrors(page)
    await page.goto('/?hud-demo=pve&end=8')
    // the HUD only paints once the match runs (after the loading card)
    await expect(page.locator('.hud .ag-value')).toHaveText(/\d/, { timeout: 150_000 })
    await expect(page.locator('.hud-radar canvas')).toBeVisible()
    await expect(page.locator('.paw-R .paw-name')).not.toHaveText('')
    await expect(page.locator('.top-pve.is-on .top-label')).toHaveText('灯台を守れ')
    await expect(page.locator('.sq-row')).toHaveCount(3)
    await page.keyboard.press('Escape')
    await expect(page.locator('.game-pause.is-on')).toBeVisible()
    await page.click('[data-pause="help"]')
    await expect(page.locator('.controls-table')).toBeVisible()
    await page.keyboard.press('Escape')
    await page.click('[data-pause="resume"]')
    await expect(page.locator('.game-pause.is-on')).toHaveCount(0)
    // Demo time advances with real frames (each capped at 0.1 s), so slow software GL needs longer.
    await expect(current(page, 'results')).toBeVisible({ timeout: 120_000 })
    await expect(page.locator('.res-banner h1')).toHaveText('任務成功')
    await expect(page.locator('.res-table tbody tr')).toHaveCount(4)
    await expect(page.locator('[data-again]')).toBeVisible()
    expect(errors).toEqual([])
  })

  test('PvP HUD demo shows three team scores', async ({ page }) => {
    await page.goto('/?hud-demo=pvp')
    await expect(page.locator('.top-pvp.is-on .pvp-score')).toHaveCount(3, { timeout: 150_000 })
    await page.keyboard.down('Tab')
    await expect(page.locator('.hud-scoreboard.is-on')).toBeVisible()
    await page.keyboard.up('Tab')
    await expect(page.locator('.hud-scoreboard.is-on')).toHaveCount(0)
  })
})

/** Reads window.__anima (dev server / ?debug only). */
type Probe = {
  screen: string
  view(): {
    time: number
    phase: string
    players: { id: string; p: number[]; state: string; stats: { damage: number; hits: number; shots: number } }[]
    foes: { id: number; p: number[]; hp: number; maxHp: number; state: string }[]
  } | null
  stats(): { drawCalls: number; fps: number } | null
  backdrop(): { kind: string; attract: { running: boolean; time: number; frames: number; foes: number } | null } | null
  match: { me: string; aimAt(p: number[]): void; hold(b: string, on: boolean): void } | null
}
const probe = <T>(page: Page, fn: (a: Probe) => T) =>
  page.evaluate((src) => {
    const a = (window as unknown as { __anima?: Probe }).__anima
    if (!a) return null
    return new Function('a', `return (${src})(a)`)(a)
  }, fn.toString()) as Promise<T | null>

test.describe('a real match runs (window.__anima)', () => {
  test('title: the live attract demo plays behind the menu and pauses when leaving', async ({ page }) => {
    test.skip(!!process.env.CI || !!process.env.ANIMA_E2E_SOFTWARE_GL, 'the live demo needs a GPU')
    await page.goto('/')
    await expect(current(page, 'title')).toBeVisible({ timeout: 90_000 })
    await expect.poll(() => probe(page, (a) => a.backdrop()?.kind), { timeout: 90_000 }).toBe('attract')
    // the demo's frame counter keeps rising (its sim time restarts when it cuts to the next scene)
    const f1 = (await probe(page, (a) => a.backdrop()?.attract?.frames)) ?? 0
    await expect.poll(() => probe(page, (a) => a.backdrop()?.attract?.frames ?? 0)).toBeGreaterThan(f1 + 10)
    await page.locator('.title-press').click()
    await page.click('[data-menu="settings"]')
    await expect(current(page, 'settings')).toBeVisible()
    await expect.poll(() => probe(page, (a) => a.backdrop()?.attract?.running ?? false)).toBe(false)
    expect(await probe(page, (a) => a.backdrop()?.kind)).toBe('plaza')
  })

  test('?attract=0 keeps the light plaza backdrop', async ({ page }) => {
    await page.goto('/?attract=0')
    await expect(current(page, 'title')).toBeVisible({ timeout: 90_000 })
    await page.waitForTimeout(1500)
    expect(await probe(page, (a) => a.backdrop())).toMatchObject({ kind: 'plaza', attract: null })
  })

  test('PvE: first-match controls card, time advances, W moves, shooting hurts a foe', async ({ page }) => {
    const errors = watchErrors(page)
    await openTitle(page)
    await page.click('[data-menu="sortie"]')
    await page.click('[data-mode="pve"]')
    await page.click('[data-go]')
    await page.click('[data-room="solo"]')
    await page.click('.lobby-go')
    await page.click('.brief-go')
    // the controls card waits for the player on the first match only
    await expect(page.locator('.game-guide.is-on')).toBeVisible({ timeout: 90_000 })
    await expect(page.locator('.guide-rows dt').first()).toHaveText('移動')
    const pausedAt = (await probe(page, (a) => a.view()?.time)) ?? 0
    await page.waitForTimeout(800)
    expect((await probe(page, (a) => a.view()?.time)) ?? 0).toBe(pausedAt)
    await page.click('[data-guide-ok]')
    await expect(page.locator('.game-guide.is-on')).toHaveCount(0)
    expect(await page.evaluate(() => localStorage.getItem('anima-front-v1:guide'))).toContain('true')

    // the sim runs
    expect(await probe(page, (a) => a.screen)).toBe('game')
    const t0 = (await probe(page, (a) => a.view()?.time)) ?? 0
    await expect.poll(() => probe(page, (a) => a.view()?.time ?? 0)).toBeGreaterThan(t0 + 0.5)
    const stats = await probe(page, (a) => a.stats())
    expect(stats?.drawCalls ?? 0).toBeGreaterThan(0)

    // holding W moves the player (once the countdown is over)
    await expect.poll(() => probe(page, (a) => a.view()?.phase ?? ''), { timeout: 30_000 }).toBe('play')
    const pos = () =>
      probe(page, (a) => {
        const v = a.view()
        return v?.players.find((p) => p.id === a.match?.me)?.p ?? null
      })
    const before = await pos()
    await page.keyboard.down('KeyW')
    await page.waitForTimeout(1200)
    await page.keyboard.up('KeyW')
    const after = await pos()
    expect(Math.hypot(after![0] - before![0], after![2] - before![2])).toBeGreaterThan(1)

    // foes arrive; aim at the nearest one and fire both paws until a shot lands
    await expect.poll(() => probe(page, (a) => a.view()?.foes.length ?? 0), { timeout: 60_000 }).toBeGreaterThan(0)
    // foes start far from the squad: walk toward the nearest one while firing
    await page.keyboard.down('KeyW')
    const hurt = await page.evaluate(async () => {
      const a = (window as unknown as { __anima: Probe }).__anima
      const hp = new Map<number, number>()
      for (let i = 0; i < 700; i++) {
        const v = a.view()
        const me = v?.players.find((p) => p.id === a.match?.me)
        if (v && me) {
          let best: (typeof v.foes)[number] | undefined
          let bestD = Infinity
          for (const f of v.foes) {
            if (!hp.has(f.id)) hp.set(f.id, f.hp)
            const d = Math.hypot(f.p[0] - me.p[0], f.p[2] - me.p[2])
            if (f.state !== 'dying' && d < bestD) {
              best = f
              bestD = d
            }
          }
          if (best) a.match?.aimAt([best.p[0], best.p[1] + 0.5, best.p[2]])
          a.match?.hold('R', true)
          a.match?.hold('L', true)
          const mine = me.stats
          const lowered = v.foes.some((f) => (hp.get(f.id) ?? f.hp) > f.hp)
          if (mine.damage > 0 && lowered) {
            a.match?.hold('R', false)
            a.match?.hold('L', false)
            return { damage: mine.damage, hits: mine.hits, lowered }
          }
        }
        await new Promise((r) => setTimeout(r, 100))
      }
      a.match?.hold('R', false)
      a.match?.hold('L', false)
      return null
    })
    await page.keyboard.up('KeyW')
    expect(hurt).not.toBeNull()
    expect(hurt!.damage).toBeGreaterThan(0)
    expect(errors).toEqual([])
  })

  test('the controls card is not shown again once dismissed', async ({ page }) => {
    await page.goto('/')
    await page.evaluate(() => localStorage.setItem('anima-front-v1:guide', JSON.stringify({ seen: true })))
    await openTitle(page)
    await page.click('[data-menu="sortie"]')
    await page.click('[data-mode="pvp"]')
    await page.click('[data-room="solo"]')
    // PvP squads: individual names, never numbered duplicates
    const names = await page.locator('.seat .seat-text b').allTextContents()
    expect(new Set(names).size).toBe(names.length)
    for (const n of names) expect(n).not.toMatch(/Ⅱ|Ⅲ| II/)
    await page.click('.lobby-go')
    await page.click('.brief-go')
    await expect.poll(() => probe(page, (a) => a.view()?.phase ?? ''), { timeout: 90_000 }).not.toBe('')
    await expect(page.locator('.game-guide.is-on')).toHaveCount(0)
  })
})

test.describe('portrait phones', () => {
  for (const size of [
    { width: 390, height: 844 },
    { width: 320, height: 568 }
  ]) {
    test(`menus fit ${size.width}×${size.height} without horizontal overflow`, async ({ browser }) => {
      const context = await browser.newContext({ viewport: size, hasTouch: true, isMobile: true })
      const page = await context.newPage()
      await openTitle(page)
      const overflow = () =>
        page.evaluate(() => {
          const s = document.querySelector('.screen:not(.is-leaving)') as HTMLElement
          return document.documentElement.scrollWidth > window.innerWidth || s.scrollWidth > s.clientWidth + 1
        })
      expect(await overflow()).toBe(false)
      for (const id of ['loadout', 'settings', 'codex']) {
        await page.click(`[data-menu="${id}"]`)
        await expect(current(page, id)).toBeVisible()
        expect(await overflow()).toBe(false)
        await page.locator('.screen-head .btn-back').first().click()
        await expect(current(page, 'title')).toBeVisible()
      }
      await context.close()
    })
  }

  test('the game asks to rotate in portrait', async ({ browser }) => {
    const context = await browser.newContext({ viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: true })
    const page = await context.newPage()
    await page.goto('/?hud-demo=pve')
    await expect(page.locator('.game-rotate.is-on')).toBeVisible({ timeout: 90_000 })
    await page.setViewportSize({ width: 844, height: 390 })
    await expect(page.locator('.game-rotate.is-on')).toHaveCount(0)
    await expect(page.locator('.touch-controls .tc-r')).toBeVisible({ timeout: 90_000 })
    await context.close()
  })
})
