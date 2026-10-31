import { plan } from './strategy'
import { test, expect } from '@playwright/test'
for (const viewport of [
  { width: 1280, height: 800 },
  { width: 390, height: 844 },
  { width: 844, height: 390 }
])
  test(`play ${viewport.width}x${viewport.height}`, async ({ page }) => {
    await page.setViewportSize(viewport)
    const errors: string[] = []
    page.on('pageerror', (e) => errors.push(e.message))
    await page.goto('./')
    await expect(page.getByRole('button', { name: /1,4 燈守/ })).toBeVisible()
    await page.getByRole('button', { name: '遊び方' }).click()
    await expect(page.getByRole('dialog')).toBeVisible()
    await page.getByRole('button', { name: '戻る', exact: true }).click()
    await page.getByRole('button', { name: /1,4 燈守/ }).tap()
    await page.getByRole('button', { name: /3,4 平地 移動可能/ }).click()
    await expect(page.getByRole('button', { name: /3,4 燈守/ })).toBeVisible()
    await page.getByRole('button', { name: '✓ 待機', exact: true }).click()
    await page.getByRole('button', { name: '▶ ターン終了' }).click()
    await expect(page.locator('#turn')).toContainText('味方 · 2')
    await page.screenshot({ path: `test-results/ember-${viewport.width}.png` })
    expect(
      await page.evaluate(
        () => document.documentElement.scrollHeight <= innerHeight && document.documentElement.scrollWidth <= innerWidth
      )
    ).toBe(true)
    for (let t = 0; t < 20; t++) {
      if (await page.locator('#result').isVisible()) break
      await page.getByRole('button', { name: '▶ ターン終了' }).click()
      await expect(page.getByRole('button', { name: '▶ ターン終了' }))
        .toBeEnabled({ timeout: 15000 })
        .catch(async () => {
          await expect(page.locator('#result')).toBeVisible()
        })
    }
    await expect(page.locator('#result')).toContainText('燈は消えた')
    await page.getByRole('button', { name: '再プレイ', exact: true }).click()
    await expect(page.locator('#turn')).toContainText('味方 · 1')
    await expect(page.locator('#count')).toHaveText('◆ 3 / ▼ 3')
    expect(errors).toEqual([])
  })

import {
  attack,
  beginAlly,
  beginEnemy,
  createGame,
  distance,
  enemyStep,
  move,
  reachable,
  recover,
  missions
} from '../src/game'
for (const stage of [0, 1, 2])
  for (const width of [1280, 390])
    test(`win mission ${stage + 1} and replay ${width}`, async ({ page }) => {
      await page.setViewportSize({ width, height: width === 390 ? 844 : 800 })
      await page.goto('./')
      if (stage > 0) {
        await page.getByRole('button', { name: '任務と編成' }).click()
        await page.locator(`[data-stage="${stage}"]`).click()
      }
      await page.getByRole('button', { name: '音を有効にする', exact: true }).click()
      await expect.poll(() => page.locator('audio').evaluate((a: HTMLAudioElement) => a.currentTime)).toBeGreaterThan(0)
      const soundRequests: string[] = []
      page.on('request', (r) => {
        if (r.url().includes('tower-defense-sfx/')) soundRequests.push(r.url())
      })
      const g = createGame(stage)
      const cell = (x: number, y: number) => page.locator('.cell').nth(y * 7 + x)
      for (let turn = 0; turn < 25 && g.phase !== 'won' && g.phase !== 'lost'; turn++) {
        for (const u of g.units
          .filter((u) => u.side === 'ally' && u.hp > 0)
          .sort(
            (a, b) => ['archer', 'mage', 'soldier'].indexOf(a.role) - ['archer', 'mage', 'soldier'].indexOf(b.role)
          )) {
          await cell(u.x, u.y).click()
          if (u.hp <= u.max - 7 && g.potions > 0) {
            await page.getByRole('button', { name: '回復薬', exact: true }).click()
            recover(g, u)
            continue
          }
          const { position: p, target } = plan(g, u)
          if (p.x !== u.x || p.y !== u.y) {
            await cell(p.x, p.y).click()
            move(g, u, p.x, p.y)
          }
          if (target) {
            await cell(target.x, target.y).click()
            attack(g, u, target)
          }
          if (g.phase === 'won') break
        }
        if (g.phase === 'ally') {
          await page.getByRole('button', { name: '▶ ターン終了' }).click()
          beginEnemy(g)
          g.units.filter((u) => u.side === 'enemy').forEach((u) => enemyStep(g, u))
          beginAlly(g)
          await expect(page.locator('#turn')).toContainText(`味方 · ${g.turn}`, { timeout: 15000 })
        }
      }
      expect(g.phase).toBe('won')
      await expect(page.locator('#result')).toContainText(stage === 2 ? '遠征達成' : '霧が晴れた')
      expect(await page.locator('audio').evaluate((a: HTMLAudioElement) => a.paused)).toBe(true)
      expect(soundRequests.length).toBeGreaterThan(0)
      await page.screenshot({ path: `test-results/ember-win-${stage + 1}-${width}.png` })
      await page.locator('#next').click()
      await expect(page.locator('#mission')).toContainText(missions[(stage + 1) % 3].name)
      await expect(page.locator('#count')).toHaveText(`◆ 3 / ▼ ${3 + ((stage + 1) % 3)}`)
      await page.getByRole('button', { name: '再プレイ', exact: true }).click()
      await expect(page.locator('#count')).toHaveText(`◆ 3 / ▼ ${3 + ((stage + 1) % 3)}`)
    })

test('restart cancels an in-flight enemy turn', async ({ page }) => {
  await page.goto('./')
  await page.getByRole('button', { name: '▶ ターン終了' }).click()
  await page.getByRole('button', { name: '再プレイ', exact: true }).click()
  await page.waitForTimeout(1600)
  await expect(page.locator('#turn')).toContainText('味方 · 1')
  await expect(page.getByRole('button', { name: /1,4 燈守リオ HP 16/ })).toBeVisible()
  expect(await page.locator('.selected').count()).toBe(0)
})

test('guard formation and mission selection are available without leaving the screen', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 })
  await page.goto('./')
  await page.getByRole('button', { name: '任務と編成' }).click()
  await page.getByRole('radio', { name: /守備隊/ }).check()
  await page.locator('[data-stage="1"]').click()
  await page.getByRole('button', { name: /1,4 燈守リオ HP 20/ }).tap()
  await expect(page.locator('#selection')).toContainText('◇ 2')
  await expect(page.locator('#count')).toHaveText('◆ 3 / ▼ 4')
  await page.screenshot({ path: 'test-results/ember-guard-390.png' })
})
