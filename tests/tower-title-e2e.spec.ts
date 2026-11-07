import { expect, test } from '@playwright/test'
import { FIELDS } from '../examples/games/tower_diffence_with_jev/src/game/model'
import { towerPath } from './tower-defense-e2e-arrange'

const rawSave = (page: import('@playwright/test').Page) => page.evaluate(() => localStorage.getItem('tower-jev-v3'))

test('title has exact menu, no-save explanation, New game and back', async ({ page }) => {
  await page.goto(towerPath)
  await expect(page.locator('#title-screen')).toBeVisible()
  await expect(page.locator('#game-title')).toHaveText(/キャッスル\s*ナイツ/)
  await expect(page.locator('.title-menu')).toContainText('New game')
  await expect(page.locator('#title-continue')).toBeDisabled()
  await expect(page.locator('#title-save-status')).toContainText('保存した遠征はありません')
  await expect(page.locator('.title-description, .title-kicker, .title-party-caption, .title-footer')).toHaveCount(0)
  await expect(page.locator('#title-new')).toBeFocused()
  await expect(page.locator('#title-continue')).toHaveAttribute('aria-describedby', 'title-save-status')
  expect(await rawSave(page)).toBeNull()
  await page.locator('#title-new').click()
  await expect(page.locator('#launch')).toBeVisible()
  await expect(page.locator('[data-field], .field-choice')).toHaveCount(0)
  await page.goBack()
  await expect(page.locator('#title-screen')).toBeVisible()
  expect(await rawSave(page)).toBeNull()
})

test('reload and Continue restore actual saved campaign; opening and cancelling New game preserves it', async ({
  page
}) => {
  await page.goto(towerPath)
  await page.locator('#title-new').click()
  await page.locator('#start').click()
  await expect(page.locator('#launch')).toBeHidden({ timeout: 180_000 })
  const saved = await rawSave(page)
  expect(saved).not.toBeNull()
  await page.reload()
  await expect(page.locator('#title-continue')).toBeEnabled()
  expect(await rawSave(page)).toBe(saved)
  await page.locator('#title-new').click()
  expect(await rawSave(page)).toBe(saved)
  await page.locator('#start').click()
  await expect(page.locator('#save-confirm')).toBeVisible()
  await page.locator('#save-confirm-cancel').click()
  expect(await rawSave(page)).toBe(saved)
  await page.locator('#launch-title-return').click()
  await page.locator('#title-continue').click()
  await expect(page.locator('#campaign-loading')).toBeHidden({ timeout: 180_000 })
  await expect(page.locator('#title-screen')).toBeHidden()
  await expect(page.locator('#field-name')).toHaveText(FIELDS.meadow.name)
  await page.goBack()
  await expect(page.locator('#title-screen')).toBeVisible()
  await expect(page.locator('#title-continue')).toBeEnabled()
})

test('corrupt save is explained and preserved until confirmed replacement', async ({ page }) => {
  await page.goto(towerPath)
  await page.evaluate(() => localStorage.setItem('tower-jev-v3', '{corrupt'))
  await page.reload()
  await expect(page.locator('#title-continue')).toBeDisabled()
  await expect(page.locator('#title-save-status')).toContainText('元データは変更していません')
  await page.locator('#title-new').click()
  await page.locator('#start').click()
  await expect(page.locator('#save-confirm')).toBeVisible()
  expect(await rawSave(page)).toBe('{corrupt')
  await page.locator('#save-confirm-accept').click()
  await expect(page.locator('#launch')).toBeHidden({ timeout: 180_000 })
  expect(await rawSave(page)).not.toBe('{corrupt')
})

test('explicit Save and Title restore this tab after another tab replaces an unchanged checkpoint', async ({
  page,
  context
}) => {
  await page.goto(towerPath)
  await page.locator('#title-new').click()
  await page.locator('#start').click()
  await expect(page.locator('#launch')).toBeHidden({ timeout: 180_000 })
  const savedA = await rawSave(page)
  expect(savedA).not.toBeNull()

  const other = await context.newPage()
  try {
    await other.goto(towerPath)
    await other.locator('#title-new').click()
    await other.locator('#start').click()
    await expect(other.locator('#save-confirm')).toBeVisible()
    await other.locator('#save-confirm-accept').click()
    await expect(other.locator('#launch')).toBeHidden({ timeout: 180_000 })
    const savedB = await other.evaluate(() => {
      const save = JSON.parse(localStorage.getItem('tower-jev-v3')!)
      save.testMarker = true
      const raw = JSON.stringify(save)
      localStorage.setItem('tower-jev-v3', raw)
      return raw
    })
    expect(savedB).not.toBeNull()
    expect(savedB).not.toBe(savedA)
    expect(await rawSave(page)).toBe(savedB)

    await page.locator('#settings-toggle').click()
    await page.locator('[data-settings-tab=save]').click()
    await page.locator('#save-now').click()
    await expect(page.locator('#save-state')).toContainText('保存しました')
    expect(await rawSave(page)).toBe(savedA)

    // Restore B once more while A is unchanged, so Title must also bypass the cache.
    await other.evaluate((raw) => localStorage.setItem('tower-jev-v3', raw!), savedB)
    expect(await rawSave(page)).toBe(savedB)
    await page.locator('#settings-close').click()
    await page.goBack()
    await expect(page.locator('#title-screen')).toBeVisible()
    expect(await rawSave(page)).toBe(savedA)
    await page.locator('#title-continue').click()
    await expect(page.locator('#campaign-loading')).toBeHidden({ timeout: 180_000 })
    await expect(page.locator('#title-screen')).toBeHidden()
    await expect(page.locator('#field-name')).toHaveText(FIELDS.meadow.name)
    expect(await rawSave(page)).toBe(savedA)
  } finally {
    await other.close()
  }
})

test('viewer opens from catalog and returns without changing a saved campaign', async ({ page }) => {
  await page.goto('/moq-games/')
  await page.evaluate(() => localStorage.setItem('tower-jev-v3', '{preserved'))
  await page.getByRole('link', { name: '3Dモデルビューワー', exact: true }).click()
  await expect(page).toHaveURL(/extra\.html$/)
  await expect(page).toHaveTitle('3Dモデルビューワー · MoQ Games')
  await expectModel(page, 'soldier', 'idle')
  expect(await rawSave(page)).toBe('{preserved')
  await page.reload()
  await expectModel(page, 'soldier', 'idle')
  await page.getByRole('link', { name: '← ゲーム一覧' }).click()
  await expect(page).toHaveTitle('MoQ Games')
  await page.getByRole('link', { name: '3Dモデルビューワー', exact: true }).click()
  await page.goBack()
  await expect(page).toHaveTitle('MoQ Games')
  expect(await rawSave(page)).toBe('{preserved')
  await page.goto(towerPath)
  await expect(page.locator('#title-screen')).toBeVisible()
  await expect(page.locator('a[href*="extra.html"], #title-extra')).toHaveCount(0)
})

const extraPath = towerPath.replace('index.html', 'extra.html')
const diagnostics = (page: import('@playwright/test').Page) =>
  page.evaluate(() => (window as unknown as { __extraViewerDiagnostics: () => any }).__extraViewerDiagnostics())
const expectModel = async (page: import('@playwright/test').Page, role: string, motion: string) => {
  await expect
    .poll(async () => {
      // Module scripts can finish after a navigation on a busy software-WebGL runner.
      // Poll registration and readiness together within the existing timeout.
      const value = await page.evaluate(() => {
        const read = (window as unknown as { __extraViewerDiagnostics?: () => any }).__extraViewerDiagnostics
        return typeof read === 'function' ? read() : undefined
      })
      return [value?.state, value?.role, value?.motion, value?.actor?.renderer, value?.actor?.visible]
    })
    .toEqual(['ready', role, motion, 'gltf-mesh', true])
  const value = await diagnostics(page)
  expect(value.actor.meshes).toBeGreaterThan(0)
  expect(value.renderer.triangles).toBeGreaterThan(0)
  // Normalized actors should fill the inspection camera, even with custom skinning.
  expect(value.camera.distance).toBeLessThan(1000)
}

test('EXTRA exposes every runtime role/action and never requests sheets, audio or game services', async ({ page }) => {
  const forbidden: string[] = []
  page.on('request', (request) => {
    if (/tower-defense-viewer|\.(?:mp3|wav|ogg)(?:\?|$)|\/api\/|\/ws(?:\?|$)/.test(request.url()))
      forbidden.push(request.url())
  })
  await page.goto(extraPath)
  const roles = await page
    .locator('#viewer-role option')
    .evaluateAll((options) => options.map((option) => (option as HTMLOptionElement).value))
  expect(roles).toHaveLength(23)
  expect(roles).toEqual(
    expect.arrayContaining([
      'soldier',
      'slime',
      'dragon',
      'runner',
      'healer',
      'crystalSentinel',
      'koboldLancer',
      'clockworkPatchling'
    ])
  )
  for (const role of roles) {
    await page.locator('#viewer-role').selectOption(role)
    const actions = await page
      .locator('#viewer-motion option')
      .evaluateAll((options) => options.map((option) => (option as HTMLOptionElement).value))
    if (role === 'healer') expect(actions).toEqual(['idle', 'walk', 'heal', 'death'])
    if (role === 'dragon') expect(actions).toContain('breath')
    if (role === 'slime') expect(actions).toContain('death')
    if (role === 'soldier') expect(actions).toContain('death')
    for (const action of actions) {
      await page.locator('#viewer-motion').selectOption(action)
      await expectModel(page, role, action)
      await page.locator('#viewer-timeline').evaluate((node) => {
        const range = node as HTMLInputElement
        range.value = String(Number(range.max) * 0.5)
        range.dispatchEvent(new Event('input', { bubbles: true }))
      })
      expect((await diagnostics(page)).seconds).toBeGreaterThan(0)
    }
  }
  expect(forbidden).toEqual([])
  await expect(page.locator('#viewer-sheet, #viewer-direction')).toHaveCount(0)
  expect(await rawSave(page)).toBeNull()
})

test('EXTRA orbits, zooms, resets, pauses and uses non-looping authored death', async ({ page }) => {
  await page.goto(extraPath)
  await expectModel(page, 'soldier', 'idle')
  const canvas = page.locator('#viewer-canvas')
  await canvas.scrollIntoViewIfNeeded()
  const initial = await diagnostics(page)
  const bounds = (await canvas.boundingBox())!
  await page.mouse.move(bounds.x + bounds.width / 2, bounds.y + bounds.height / 2)
  await page.mouse.down()
  await page.mouse.move(bounds.x + bounds.width * 0.7, bounds.y + bounds.height * 0.6, { steps: 8 })
  await page.mouse.up()
  expect((await diagnostics(page)).camera.position).not.toEqual(initial.camera.position)
  const beforeZoom = (await diagnostics(page)).camera.distance
  await page.mouse.wheel(0, -180)
  await expect.poll(async () => (await diagnostics(page)).camera.distance).toBeLessThan(beforeZoom)
  await page.locator('#viewer-reset').click()
  for (const [index, value] of (await diagnostics(page)).camera.position.entries())
    expect(value).toBeCloseTo(initial.camera.position[index], 10)
  await canvas.focus()
  await page.keyboard.press('ArrowLeft')
  expect((await diagnostics(page)).camera.position).not.toEqual(initial.camera.position)
  await page.keyboard.press('+')
  expect((await diagnostics(page)).camera.distance).toBeLessThan(initial.camera.distance)
  await expect(page.locator('#viewer-play')).toHaveText('Pause')
  await page.locator('#viewer-play').click()
  await page.locator('#viewer-restart').click()
  await page.locator('#viewer-play').click()
  await expect(page.locator('#viewer-play')).toHaveText('Pause')
  await expect.poll(async () => (await diagnostics(page)).seconds).toBeGreaterThan(0.05)
  await page.locator('#viewer-play').click()
  const paused = (await diagnostics(page)).seconds
  await page.waitForTimeout(150)
  expect((await diagnostics(page)).seconds).toBe(paused)
  await page.locator('#viewer-role').selectOption('slime')
  await page.locator('#viewer-motion').selectOption('death')
  await expectModel(page, 'slime', 'death')
  await page.locator('#viewer-speed').selectOption('2')
  await expect(page.locator('#viewer-play')).toHaveText('Play', {
    timeout: 5000
  })
  const ended = await diagnostics(page)
  expect(ended.seconds).toBeCloseTo(ended.duration)
  await page.locator('#viewer-restart').click()
  expect((await diagnostics(page)).seconds).toBe(0)
})

test('EXTRA plays after model and motion switches and repeated playback', async ({ page }) => {
  await page.setViewportSize({ width: 600, height: 500 })
  await page.goto(extraPath)
  await page.addStyleTag({ content: '#viewer-canvas { width: 300px !important; height: 200px !important }' })
  for (const [role, action] of [
    ['soldier', 'walk'],
    ['slime', 'idle'],
    ['slime', 'walk'],
    ['soldier', 'idle']
  ]) {
    await page.locator('#viewer-role').selectOption(role)
    await page.locator('#viewer-motion').selectOption(action)
    await expectModel(page, role, action)
    await expect(page.locator('#viewer-play')).toHaveText('Pause')
    await page.locator('#viewer-play').click()
    await page.locator('#viewer-restart').click()
    const resetFrame = (await diagnostics(page)).renderCount
    await expect.poll(async () => (await diagnostics(page)).renderCount).toBeGreaterThan(resetFrame)
    const before = await page.locator('#viewer-canvas').screenshot()
    await page.locator('#viewer-play').click()
    await expect
      .poll(async () => (await diagnostics(page)).seconds, { intervals: [100, 200, 300] })
      .toBeGreaterThan(0.35)
    // A delayed pause can wrap a looping clip back to its identical first pose.
    // Observe actual rendered motion while playback is running, not a wall-clock deadline.
    await expect
      .poll(async () => (await page.locator('#viewer-canvas').screenshot()).equals(before), {
        intervals: [100, 200, 300]
      })
      .toBe(false)
    await page.locator('#viewer-play').click()
    await page.locator('#viewer-play').click()
    const resumed = (await diagnostics(page)).seconds
    await expect.poll(async () => (await diagnostics(page)).seconds, { intervals: [100, 200, 300] }).not.toBe(resumed)
  }
})

test('EXTRA loop boundary repeats the start pose while the interior visibly moves', async ({ page }) => {
  await page.goto(extraPath)
  await page.addStyleTag({ content: '#viewer-canvas { width: 300px !important; height: 200px !important }' })
  await page.locator('#viewer-role').selectOption('slime')
  await page.locator('#viewer-motion').selectOption('walk')
  await expectModel(page, 'slime', 'walk')
  const frameAt = async (phase: number) => {
    const count = await page.locator('#viewer-timeline').evaluate((node, fraction) => {
      const timeline = node as HTMLInputElement
      timeline.value = String(Number(timeline.max) * fraction)
      timeline.dispatchEvent(new Event('input', { bubbles: true }))
      return (window as any).__extraViewerDiagnostics().renderCount
    }, phase)
    await expect.poll(async () => (await diagnostics(page)).renderCount).toBeGreaterThan(count)
    const frame = await page.locator('#viewer-canvas').screenshot()
    await test.info().attach(`loop-boundary-phase-${phase}`, { body: frame, contentType: 'image/png' })
    return frame
  }
  const start = await frameAt(0)
  expect((await frameAt(1)).equals(start)).toBe(true)
  expect((await frameAt(0.4)).equals(start)).toBe(false)
})

test('EXTRA survives rapid switches and repeated pagehide/pageshow without leaking the old clock', async ({ page }) => {
  const initializationErrors: string[] = []
  page.on('pageerror', (error) => initializationErrors.push(error.message))
  await page.goto('/moq-games/')
  await page.evaluate(() => localStorage.setItem('tower-jev-v3', '{preserve-me'))
  for (let i = 0; i < 3; i++) {
    await page.getByRole('link', { name: '3Dモデルビューワー', exact: true }).click()
    await expectModel(page, 'soldier', 'idle')
    expect(initializationErrors).toEqual([])
    await page.locator('#viewer-role').selectOption('dragon')
    await page.locator('#viewer-role').selectOption('ranger')
    await page.locator('#viewer-role').selectOption('slime')
    await expectModel(page, 'slime', 'idle')
    const ownership = await diagnostics(page)
    expect(ownership.cache.entries.reduce((sum: number, entry: any) => sum + entry.references, 0)).toBe(1)
    await page.evaluate(() => window.dispatchEvent(new PageTransitionEvent('pagehide', { persisted: true })))
    const stopped = await diagnostics(page)
    expect(stopped.disposed).toBe(true)
    expect(stopped.state).toBe('disposed')
    await page.waitForTimeout(100)
    expect((await diagnostics(page)).renderCount).toBe(stopped.renderCount)
    await page.evaluate(() => window.dispatchEvent(new PageTransitionEvent('pageshow', { persisted: true })))
    await expectModel(page, 'soldier', 'idle')
    expect(await rawSave(page)).toBe('{preserve-me')
    if (i % 2) await page.goBack()
    else await page.getByRole('link', { name: '← ゲーム一覧' }).click()
    await expect(page).toHaveTitle('MoQ Games')
    expect(await rawSave(page)).toBe('{preserve-me')
    expect(initializationErrors).toEqual([])
  }
})

test('EXTRA reports a failed model and Retry loads the same action without sprite fallback', async ({ page }) => {
  await page.route('**/models/soldier/*.glb*', (route) => route.abort())
  await page.goto(extraPath)
  await expect(page.locator('#viewer-status')).toContainText('読み込めません')
  await expect(page.locator('#viewer-retry')).toBeVisible()
  await expect(page.locator('#viewer-play')).toBeDisabled()
  await page.unroute('**/models/soldier/*.glb*')
  await page.locator('#viewer-retry').click()
  await expectModel(page, 'soldier', 'idle')
  await expect(page.locator('#viewer-play')).toBeEnabled()
  await expect(page.locator('#viewer-retry')).toBeHidden()
})

test.describe('mobile EXTRA', () => {
  test.use({ viewport: { width: 390, height: 844 }, hasTouch: true })
  test('touch orbit and pinch zoom stay inside the responsive canvas', async ({ page }) => {
    await page.goto(extraPath)
    await expectModel(page, 'soldier', 'idle')
    expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(390)
    const canvas = page.locator('#viewer-canvas')
    const bounds = (await canvas.boundingBox())!
    const x = bounds.x + bounds.width / 2,
      y = bounds.y + bounds.height / 2
    const stage = (await page.locator('.extra-stage').boundingBox())!
    expect(bounds.height).toBeLessThanOrEqual(stage.height)
    expect(bounds.width).toBeLessThanOrEqual(stage.width)
    const initial = await diagnostics(page)
    const cdp = await page.context().newCDPSession(page)
    const touch = (type: string, points: { x: number; y: number; id: number }[]) =>
      cdp.send('Input.dispatchTouchEvent', { type, touchPoints: points })
    await touch('touchStart', [{ x, y, id: 1 }])
    await touch('touchMove', [{ x: x + 60, y: y + 20, id: 1 }])
    await touch('touchEnd', [])
    expect((await diagnostics(page)).camera.position).not.toEqual(initial.camera.position)
    const before = (await diagnostics(page)).camera.distance
    await touch('touchStart', [
      { x: x - 25, y, id: 1 },
      { x: x + 25, y, id: 2 }
    ])
    await touch('touchMove', [
      { x: x - 65, y, id: 1 },
      { x: x + 65, y, id: 2 }
    ])
    await touch('touchEnd', [])
    await expect.poll(async () => (await diagnostics(page)).camera.distance).toBeLessThan(before)
    await page.locator('#viewer-reset').click()
    for (const [index, value] of (await diagnostics(page)).camera.position.entries())
      expect(value).toBeCloseTo(initial.camera.position[index], 10)
    await cdp.detach()
  })
})

test('EXTRA ignores a late failed load after selecting a different model', async ({ page }) => {
  let release!: () => void
  const hold = new Promise<void>((resolve) => {
    release = resolve
  })
  await page.route('**/models/soldier/*.glb*', async (route) => {
    await hold
    await route.abort()
  })
  await page.goto(extraPath)
  await expect(page.locator('#viewer-status')).toContainText('読み込み中')
  await page.locator('#viewer-role').selectOption('slime')
  await expectModel(page, 'slime', 'idle')
  release()
  await page.waitForTimeout(200)
  await expectModel(page, 'slime', 'idle')
  await expect(page.locator('#viewer-retry')).toBeHidden()
})

test('viewer loops attack and shows the same held ally death as gameplay', async ({ page }) => {
  await page.goto(extraPath)
  await page.locator('#viewer-motion').selectOption('attack')
  await expectModel(page, 'soldier', 'attack')
  await page.locator('#viewer-speed').selectOption('2')
  const duration = (await diagnostics(page)).duration
  await page.waitForTimeout(duration * 1500 + 500)
  expect((await diagnostics(page)).paused).toBe(false)
  await expect(page.locator('#viewer-play')).toHaveText('Pause')
  await page.locator('#viewer-motion').selectOption('death')
  await expectModel(page, 'soldier', 'death')
  await expect(page.locator('#viewer-play')).toHaveText('Play')
  const death = await diagnostics(page)
  expect(death.seconds).toBe(0.82)
  expect(death.actor.visible).toBe(true)
  await page.screenshot({ path: 'test-results/viewer-ally-death.png' })
})

test('campaign models are not fetched on the title but start downloading on the launch screen', async ({ page }) => {
  const modelRequests: string[] = []
  page.on('request', (request) => {
    if (/\.(glb|gltf)(\?|$)/.test(request.url())) modelRequests.push(request.url())
  })
  await page.goto(towerPath)
  await expect(page.locator('#title-screen')).toBeVisible()
  await page.waitForTimeout(1500)
  expect(modelRequests).toEqual([])
  await page.locator('#title-new').click()
  await expect(page.locator('#launch')).toBeVisible()
  await expect.poll(() => modelRequests.length, { timeout: 15_000 }).toBeGreaterThan(0)
})
