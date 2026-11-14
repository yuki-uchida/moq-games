import { expect, test, type Browser, type Page } from '@playwright/test'

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

  test('loadout: a loadout with problems cannot be saved or confirmed and nothing is stored', async ({ page }) => {
    await openTitle(page)
    await page.click('[data-menu="loadout"]')
    await expect(current(page, 'loadout')).toBeVisible()
    await page.click('[data-species="bear"]')
    await page.getByRole('button', { name: '全部外す' }).click()
    await page.click('[data-tab="enhance"]')
    // 16 passive slots and no weapon
    const plan: [string, number][] = [
      ['fang', 3],
      ['hawk', 3],
      ['rhino', 3],
      ['sloth', 3],
      ['koala', 3],
      ['cheetah', 1]
    ]
    let slot = 0
    for (const [item, n] of plan) {
      await page.click(`[data-item="${item}"]`)
      for (let k = 0; k < n; k++) await page.click(`[data-slot="${slot++}"]`)
    }
    await expect(page.locator('.lo-count')).toContainText('16 / 16')
    await expect(page.locator('.lo-problems')).toBeVisible()
    await expect(page.locator('.lo-problems')).toContainText('武器')
    await page.click('.lo-save')
    await expect(page.locator('.toast.is-error').last()).toContainText('保存できません')
    await expect(page.locator('.lo-save-modal')).toHaveCount(0)
    await page.click('.lo-done')
    await expect(page.locator('.toast.is-error').last()).toContainText('決定できません')
    await expect(current(page, 'loadout')).toBeVisible()
    // picking the animal is stored, but no custom loadout is
    const stored = await page.evaluate(() => localStorage.getItem('anima-front-v1:armory'))
    expect(JSON.parse(stored ?? '{"custom":{"bear":[null,null,null]}}').custom.bear).toEqual([null, null, null])
  })

  test('loadout: a stored loadout with problems loads unchanged and blocks the sortie', async ({ page }) => {
    await page.goto('/')
    const passives = [
      'fang',
      'fang',
      'fang',
      'hawk',
      'hawk',
      'hawk',
      'rhino',
      'rhino',
      'rhino',
      'sloth',
      'sloth',
      'sloth'
    ]
    const items = [...passives, 'koala', 'koala', 'koala', 'cheetah']
    const armory = {
      version: 2,
      species: 'bear',
      choice: { bear: { kind: 'custom', index: 0 } },
      custom: {
        bear: [{ name: '壊れた編成', loadout: { slots: items.map((item) => ({ item })) }, savedAt: 1 }, null, null]
      }
    }
    await page.evaluate((a) => localStorage.setItem('anima-front-v1:armory', JSON.stringify(a)), armory)
    const before = await page.evaluate(() => localStorage.getItem('anima-front-v1:armory'))
    await page.reload()
    await openTitle(page)
    // the editor shows it as it was saved, with its problems, and a koala (not a bee) stays in slot 16
    await page.click('[data-menu="loadout"]')
    await expect(page.locator('[data-slot="15"]')).toContainText('チーター')
    await expect(page.locator('[data-slot="14"]')).toContainText('コアラ')
    await expect(page.locator('.lo-problems')).toBeVisible()
    await expect(page.locator('.lo-count')).toContainText('16 / 16')
    await page.keyboard.press('Escape')
    await expect(current(page, 'title')).toBeVisible()
    // the sortie refuses it with a message instead of repairing it
    await page.click('[data-menu="sortie"]')
    await page.click('[data-mode="pve"]')
    await page.click('[data-go]')
    await page.click('[data-room="solo"]')
    await expect(page.locator('.toast.is-error').last()).toContainText('壊れた編成')
    await expect(current(page, 'room')).toBeVisible()
    expect(await page.evaluate(() => localStorage.getItem('anima-front-v1:armory'))).toBe(before)
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

// ---------------------------------------------------------------------------------------------------------------
// Gamepad pause menu, touch look, tutorial on touch, touch paw readouts, small landscape phones

const PAD = { A: 0, B: 1, DOWN: 13, UP: 12, MENU: 9 } as const
type PadWindow = { __padButtons: Record<number, boolean> }

/** An emulated standard gamepad: tests flip buttons through window.__padButtons. */
async function installPad(page: Page) {
  await page.addInitScript(() => {
    const buttons: Record<number, boolean> = {}
    ;(window as unknown as PadWindow).__padButtons = buttons
    const pad = () => ({
      id: 'test pad',
      index: 0,
      connected: true,
      mapping: 'standard',
      timestamp: performance.now(),
      axes: [0, 0, 0, 0],
      buttons: Array.from({ length: 17 }, (_, i) => ({
        pressed: !!buttons[i],
        touched: !!buttons[i],
        value: buttons[i] ? 1 : 0
      }))
    })
    navigator.getGamepads = () => [pad() as unknown as Gamepad, null, null, null]
  })
}

/** Presses a pad button for a few frames, then releases it for a few frames. */
async function padTap(page: Page, index: number) {
  const frames = () =>
    page.evaluate(
      () =>
        new Promise<void>((r) => {
          let n = 0
          const tick = () => (++n >= 4 ? r() : requestAnimationFrame(tick))
          requestAnimationFrame(tick)
        })
    )
  await page.evaluate((i) => void ((window as unknown as PadWindow).__padButtons[i] = true), index)
  await frames()
  await page.evaluate((i) => void ((window as unknown as PadWindow).__padButtons[i] = false), index)
  await frames()
}

const phaseOf = (page: Page) => probe(page, (a) => a.view()?.phase ?? '')

/** Solo PvE with the first-match card already seen; resolves once the match is in its play phase. */
async function startSoloPve(page: Page) {
  await page.goto('/')
  await page.evaluate(() => localStorage.setItem('anima-front-v1:guide', JSON.stringify({ seen: true })))
  await openTitle(page)
  await page.click('[data-menu="sortie"]')
  await page.click('[data-mode="pve"]')
  await page.click('[data-go]')
  await page.click('[data-room="solo"]')
  await page.click('.lobby-go')
  await page.click('.brief-go')
  await expect.poll(() => phaseOf(page), { timeout: 90_000 }).toBe('play')
}

async function startTutorial(page: Page) {
  await openTitle(page)
  await page.click('[data-menu="sortie"]')
  await page.click('[data-mode="training"]')
  await page.click('[data-training="tutorial"]')
  await page.click('.brief-go')
  await expect.poll(() => phaseOf(page), { timeout: 90_000 }).toBe('play')
}

const pauseFocus = (page: Page, which: string) => expect(page.locator(`[data-pause="${which}"]`)).toBeFocused()

test.describe('gamepad in the pause menu', () => {
  test('d-pad, A and B reach and activate every pause item', async ({ page }) => {
    await installPad(page)
    await startSoloPve(page)
    await padTap(page, PAD.MENU)
    await expect(page.locator('.game-pause.is-on')).toBeVisible()
    await pauseFocus(page, 'resume')
    // a visible focus ring
    expect(await page.evaluate(() => document.documentElement.classList.contains('nav-keys'))).toBe(true)
    expect(await page.evaluate(() => getComputedStyle(document.activeElement!).boxShadow)).not.toBe('none')
    for (const id of ['settings', 'help', 'abort']) {
      await padTap(page, PAD.DOWN)
      await pauseFocus(page, id)
    }
    await padTap(page, PAD.UP)
    await pauseFocus(page, 'help')
    await padTap(page, PAD.UP)
    await pauseFocus(page, 'settings')

    // 設定: A opens the panel, B goes back to the list
    await padTap(page, PAD.A)
    await expect(page.locator('.pause-scroll')).toBeVisible()
    await padTap(page, PAD.B)
    await expect(page.locator('.pause-scroll')).toHaveCount(0)
    await pauseFocus(page, 'resume')
    // 操作説明
    await padTap(page, PAD.DOWN)
    await padTap(page, PAD.DOWN)
    await pauseFocus(page, 'help')
    await padTap(page, PAD.A)
    await expect(page.locator('.pause-scroll')).toBeVisible()
    await padTap(page, PAD.B)
    await pauseFocus(page, 'resume')

    // 再開: A resumes, the world runs again and gameplay input is back
    await padTap(page, PAD.A)
    await expect(page.locator('.game-pause.is-on')).toHaveCount(0)
    const t0 = (await probe(page, (a) => a.view()?.time)) ?? 0
    await expect.poll(() => probe(page, (a) => a.view()?.time ?? 0)).toBeGreaterThan(t0 + 0.3)

    // 任務を中断: A opens the confirm modal, B cancels it, A on the default button leaves the match
    await padTap(page, PAD.MENU)
    await expect(page.locator('.game-pause.is-on')).toBeVisible()
    await padTap(page, PAD.DOWN)
    await padTap(page, PAD.DOWN)
    await padTap(page, PAD.DOWN)
    await pauseFocus(page, 'abort')
    await padTap(page, PAD.A)
    await expect(page.locator('.modal-veil')).toBeVisible()
    await padTap(page, PAD.B)
    await expect(page.locator('.modal-veil')).toHaveCount(0)
    await pauseFocus(page, 'abort')
    await padTap(page, PAD.A)
    await expect(page.locator('.modal-veil')).toBeVisible()
    await padTap(page, PAD.A)
    await expect(current(page, 'lobby')).toBeVisible()
  })

  test('B resumes from the pause list and the world stays frozen while paused', async ({ page }) => {
    await installPad(page)
    await startSoloPve(page)
    await padTap(page, PAD.MENU)
    await expect(page.locator('.game-pause.is-on')).toBeVisible()
    const t0 = (await probe(page, (a) => a.view()?.time)) ?? 0
    await page.waitForTimeout(600)
    expect((await probe(page, (a) => a.view()?.time)) ?? 0).toBe(t0)
    await padTap(page, PAD.B)
    await expect(page.locator('.game-pause.is-on')).toHaveCount(0)
  })
})

/** Raw multi-touch through the DevTools protocol (real touch events, several fingers at once). */
async function touches(page: Page) {
  const cdp = await page.context().newCDPSession(page)
  const pts = new Map<number, { x: number; y: number }>()
  const send = (type: string, ids: number[]) =>
    cdp.send('Input.dispatchTouchEvent', {
      type,
      touchPoints: ids.map((id) => ({ id, x: pts.get(id)!.x, y: pts.get(id)!.y }))
    })
  return {
    async down(id: number, x: number, y: number) {
      pts.set(id, { x, y })
      await send('touchStart', [...pts.keys()])
    },
    async move(id: number, x: number, y: number) {
      pts.set(id, { x, y })
      await send('touchMove', [...pts.keys()])
    },
    async up(id: number) {
      await send('touchEnd', [id])
      pts.delete(id)
    }
  }
}

const centre = async (page: Page, sel: string) => {
  const b = (await page.locator(sel).boundingBox())!
  return { x: b.x + b.width / 2, y: b.y + b.height / 2 }
}
const myYaw = async (page: Page) =>
  (await page.evaluate(() => {
    const a = (
      window as unknown as {
        __anima?: { view(): { players: { id: string; yaw: number }[] } | null; match: { me: string } | null }
      }
    ).__anima
    return a?.view()?.players.find((p) => p.id === a.match?.me)?.yaw ?? 0
  })) as number

const touchContext = (browser: Browser, width: number, height: number) =>
  browser.newContext({ viewport: { width, height }, hasTouch: true, isMobile: true })

test.describe('touch controls', () => {
  test('only the buttons capture touches: look drags work on every other point, even with the stick and fire held', async ({
    browser
  }) => {
    const context = await touchContext(browser, 844, 390)
    const page = await context.newPage()
    await startSoloPve(page)
    // every non-button point of the right half belongs to the look zone
    const stray = await page.evaluate(() => {
      const bad: string[] = []
      const w = window.innerWidth
      const h = window.innerHeight
      for (let x = Math.round(w * 0.45); x < w; x += 8)
        for (let y = 0; y < h; y += 8) {
          const el = document.elementFromPoint(x, y) as HTMLElement | null
          if (!el || !el.closest('.touch-controls')) continue
          if (el.closest('.tc-btn, .tc-menu, .tc-score')) continue
          if (!el.classList.contains('tc-look')) bad.push(`${x},${y}:${el.className}`)
        }
      return bad
    })
    expect(stray).toEqual([])

    // a drag on empty space inside the button cluster's box turns the camera (stick + right paw held)
    const t = await touches(page)
    const cluster = (await page.locator('.tc-cluster').boundingBox())!
    const spot = await page.evaluate((c) => {
      for (let x = c.x + 4; x < c.x + c.width; x += 6)
        for (let y = c.y + 4; y < c.y + c.height; y += 6) {
          const el = document.elementFromPoint(x, y) as HTMLElement | null
          if (el?.classList.contains('tc-look')) return { x, y }
        }
      return null
    }, cluster)
    expect(spot).not.toBeNull()
    const stick = { x: 110, y: 290 }
    await t.down(1, stick.x, stick.y)
    await t.move(1, stick.x, stick.y - 40)
    const fire = await centre(page, '.tc-r')
    await t.down(2, fire.x, fire.y)
    await expect(page.locator('.tc-r.is-down')).toHaveCount(1)
    const yaw0 = await myYaw(page)
    await t.down(3, spot!.x, spot!.y)
    for (let i = 1; i <= 10; i++) await t.move(3, spot!.x - i * 8, spot!.y)
    await t.up(3)
    // the stick and the fire button are still held after the look finger lifted
    await expect(page.locator('.tc-r.is-down')).toHaveCount(1)
    await expect
      .poll(async () => Math.abs((((await myYaw(page)) - yaw0 + Math.PI * 3) % (Math.PI * 2)) - Math.PI))
      .toBeGreaterThan(0.05)
    await t.up(2)
    await t.up(1)
    await context.close()
  })

  for (const [w, h] of [
    [568, 320],
    [667, 375],
    [844, 390]
  ]) {
    test(`small landscape ${w}×${h}: the dash button clears the gauge and the controls card fits`, async ({
      browser
    }) => {
      const context = await touchContext(browser, w, h)
      const page = await context.newPage()
      await page.goto(`/?hud-demo=pve&attract=0`)
      await expect(page.locator('.hud .ag-value:not(:empty)')).toBeVisible({ timeout: 90_000 })
      const rects = await page.evaluate(() => {
        const r = (s: string) => {
          const b = document.querySelector(s)!.getBoundingClientRect()
          return { l: b.left, t: b.top, r: b.right, b: b.bottom }
        }
        return { gauge: r('.hud-anima'), dash: r('.tc-dash'), jump: r('.tc-jump') }
      })
      const overlap = (a: { l: number; t: number; r: number; b: number }, b: typeof a) =>
        a.l < b.r && b.l < a.r && a.t < b.b && b.t < a.b
      expect(overlap(rects.gauge, rects.dash)).toBe(false)
      expect(overlap(rects.gauge, rects.jump)).toBe(false)
      await context.close()

      // the first-match card: 「わかった」 is fully inside the screen
      const fresh = await touchContext(browser, w, h)
      const p2 = await fresh.newPage()
      await p2.goto('/?attract=0')
      await p2.locator('.title-press').click({ timeout: 90_000 })
      await p2.click('[data-menu="sortie"]')
      await p2.click('[data-mode="pve"]')
      await p2.click('[data-go]')
      await p2.click('[data-room="solo"]')
      await p2.click('.lobby-go')
      await p2.click('.brief-go')
      await expect(p2.locator('.game-guide.is-on')).toBeVisible({ timeout: 90_000 })
      await p2.waitForTimeout(600)
      const ok = (await p2.locator('[data-guide-ok]').boundingBox())!
      expect(ok.y).toBeGreaterThanOrEqual(0)
      expect(ok.y + ok.height).toBeLessThanOrEqual(h)
      const overflow = await p2.evaluate(() => {
        const el = document.querySelector('.guide-panel') as HTMLElement
        return el.scrollHeight - el.clientHeight
      })
      expect(overflow).toBeLessThanOrEqual(1)
      await fresh.close()
    })
  }

  test('paw buttons show the anima cost, a cooldown sweep, charge and the unaffordable state', async ({ browser }) => {
    const context = await touchContext(browser, 667, 375)
    const page = await context.newPage()
    await startSoloPve(page)
    await expect(page.locator('.tc-r .tc-cost')).toContainText('◆')
    await expect(page.locator('.tc-l .tc-cost')).toContainText('◆')
    // the paw cards of the keyboard HUD are hidden on touch: the buttons carry the numbers
    await expect(page.locator('.hud .hud-paw').first()).toBeHidden()
    // cooling / charging / broke states paint from the same controller the game uses
    const painted = await page.evaluate(async () => {
      const mod = await import(/* @vite-ignore */ '/src/input/touch.ts')
      const noop = () => {}
      const state = new Proxy({}, { get: () => noop }) as never
      const tc = mod.createTouchControls({
        state,
        sensitivity: () => 1,
        invertY: () => false,
        assist: () => 0,
        onUi: noop
      })
      document.body.append(tc.el)
      const base = { item: 'hippo' as const, cost: '4', cooldown: 0, charge: 0, affordable: true }
      tc.setPaws({ ...base, cooldown: 0.5, charge: 0.25 }, { ...base, affordable: false })
      const r = tc.el.querySelector('.tc-r')!
      const l = tc.el.querySelector('.tc-l')!
      const out = {
        cooling: r.classList.contains('is-cooling'),
        cd: r.querySelector('.tc-ring-cd')!.getAttribute('stroke-dasharray'),
        ch: r.querySelector('.tc-ring-ch')!.getAttribute('stroke-dasharray'),
        cost: r.querySelector('.tc-cost')!.textContent,
        broke: l.classList.contains('is-broke'),
        label: l.querySelector('.tc-label')!.textContent,
        rBroke: r.classList.contains('is-broke')
      }
      tc.dispose()
      return out
    })
    expect(painted).toEqual({
      cooling: true,
      cd: '50.0 100',
      ch: '25.0 100',
      cost: '◆ 4',
      broke: true,
      label: '不足',
      rBroke: false
    })
    await context.close()
  })
})

test.describe('tutorial on touch', () => {
  test('touch hints, the 救助 button at the marker, completion is recorded and shows 修了', async ({ browser }) => {
    const context = await touchContext(browser, 844, 390)
    const page = await context.newPage()
    await startTutorial(page)
    const hint = page.locator('.top-training b')
    await expect(hint).toContainText('ドラッグして移動')
    expect(await hint.textContent()).not.toMatch(/WASD|クリック|マウス/)
    const t = await touches(page)
    const step = () =>
      page.evaluate(
        () =>
          (window as unknown as { __anima: { view(): { training?: { step: number } } | null } }).__anima.view()
            ?.training?.step ?? -2
      )
    /** Turns toward the nearest prop of a kind; returns the horizontal distance to it. */
    const aim = (kind: string) =>
      page.evaluate((k) => {
        const a = (window as unknown as { __anima: Probe }).__anima
        const v = a.view() as unknown as {
          props: { kind: string; p: number[] }[]
          players: { id: string; p: number[] }[]
        }
        const me = v.players.find((p) => p.id === a.match?.me)!
        let best: number[] | null = null
        let bd = Infinity
        for (const p of v.props)
          if (p.kind === k) {
            const d = Math.hypot(p.p[0] - me.p[0], p.p[2] - me.p[2])
            if (d < bd) {
              bd = d
              best = p.p
            }
          }
        if (best) a.match?.aimAt([best[0], best[1] + 1, best[2]])
        return bd
      }, kind)
    const stick = { x: 110, y: 290 }
    // 1 move
    await t.down(1, stick.x, stick.y)
    await t.move(1, stick.x, stick.y - 50)
    await expect.poll(step, { timeout: 30_000 }).toBeGreaterThanOrEqual(1)
    await t.up(1)
    // 2 look: drag on the right half
    await expect(hint).toContainText('右側をドラッグ')
    await t.down(2, 500, 200)
    for (let sweep = 0; sweep < 8; sweep++)
      for (let i = 1; i <= 20; i++) await t.move(2, 500 + (sweep % 2 ? 20 - i : i) * 15, 200)
    await expect.poll(step, { timeout: 15_000 }).toBeGreaterThanOrEqual(2)
    await t.up(2)
    // 3 jump, 4 dash (the on-screen buttons)
    await expect(hint).toContainText('「ジャンプ」')
    const jump = await centre(page, '.tc-jump')
    await t.down(3, jump.x, jump.y)
    await expect.poll(step, { timeout: 15_000 }).toBeGreaterThanOrEqual(3)
    await t.up(3)
    await expect(hint).toContainText('「ダッシュ」')
    const dash = await centre(page, '.tc-dash')
    await t.down(4, dash.x, dash.y)
    await expect.poll(step, { timeout: 15_000 }).toBeGreaterThanOrEqual(4)
    await t.up(4)
    // 5 right paw on a target
    await expect(hint).toContainText('「右」ボタン')
    const right = await centre(page, '.tc-r')
    // walk up to the nearest target (stick forward, camera on it) and tap the right paw (a held melee paw guards)
    await t.down(11, stick.x, stick.y)
    for (let i = 0; i < 150 && (await step()) === 4; i++) {
      const d = await aim('target')
      await t.move(11, stick.x, d > 2.2 ? stick.y - 50 : stick.y)
      if (d <= 3.5) {
        await t.down(5, right.x, right.y)
        await page.waitForTimeout(120)
        await t.up(5)
      }
      await page.waitForTimeout(100)
    }
    await t.up(11)
    expect(await step()).toBeGreaterThanOrEqual(5)
    // 6 switch (the ↻ above the right paw)
    await expect(hint).toContainText('↻')
    const cyc = await centre(page, '.tc-cycle-r')
    for (let i = 0; i < 6 && (await step()) === 5; i++) {
      await t.down(6, cyc.x, cyc.y)
      await t.up(6)
      await page.waitForTimeout(300)
    }
    // 7 left paw
    const left = await centre(page, '.tc-l')
    await t.down(7, left.x, left.y)
    await expect.poll(step, { timeout: 15_000 }).toBeGreaterThanOrEqual(7)
    await t.up(7)
    // 8 walk to the marker; the 救助 prompt and the touch button appear only near it
    await expect(hint).toContainText('救助')
    await expect(page.locator('.tc-interact.is-on')).toHaveCount(0)
    await t.down(8, stick.x, stick.y)
    for (let i = 0; i < 200; i++) {
      const d = await aim('tutorial')
      await t.move(8, stick.x, stick.y - 50)
      if (d < 2.2) break
      await page.waitForTimeout(100)
    }
    await t.up(8)
    await expect(page.locator('.tc-interact.is-on')).toHaveCount(1)
    await expect(page.locator('.hud-revive.is-on')).toBeVisible()
    const interact = await centre(page, '.tc-interact')
    await t.down(9, interact.x, interact.y)
    await expect(page.locator('.tc-interact.is-down')).toHaveCount(1)
    await expect.poll(step, { timeout: 15_000 }).toBe(-1)
    await t.up(9)
    // completion is recorded at once (before leaving the match)
    await expect(page.locator('.hud-banner.is-on')).toContainText('チュートリアル完了')
    expect(await page.evaluate(() => localStorage.getItem('anima-front-v1:progress'))).toContain('"trainingDone":true')
    // leave and reload: the training select shows 修了
    await page.reload()
    await expect(current(page, 'title')).toBeVisible({ timeout: 90_000 })
    await page.locator('.title-press').click()
    await page.click('[data-menu="sortie"]')
    await page.click('[data-mode="training"]')
    await expect(page.locator('[data-training="tutorial"]')).toContainText('修了')
    await context.close()
  })
})
