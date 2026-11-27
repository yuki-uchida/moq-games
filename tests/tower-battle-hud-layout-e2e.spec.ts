import { expect, test, type Page } from '@playwright/test'
import { getField } from '../examples/games/tower_diffence_with_jev/src/game/model'
import { dragUnitToWorld, openOfflineCampaign } from './tower-defense-e2e-arrange'

/**
 * The battle HUD is measured in every state a stage can show. The real HUD is cloned and its worst-case
 * texts and visibility are forced, so the layout is checked without waiting for waves to come around.
 */
type Rect = { left: number; top: number; right: number; bottom: number }
type State = 'preparation' | 'wave' | 'break' | 'final-break' | 'boss'
const STATES: State[] = ['preparation', 'wave', 'break', 'final-break', 'boss']
const SELECTORS = {
  wave: '.bhud-wave',
  castle: '.bhud-castle',
  enemies: '.bhud-enemies',
  crown: '.bhud-crown',
  coins: '.bhud-coins',
  pause: '.bhud-pause',
  speed: '.bhud-speed',
  call: '.wave-call',
  boss: '.bhud-boss'
}
const intersects = (a: Rect, b: Rect) =>
  Math.min(a.right, b.right) - Math.max(a.left, b.left) > 1 && Math.min(a.bottom, b.bottom) - Math.max(a.top, b.top) > 1

async function measure(page: Page, state: State) {
  return page.evaluate(
    ({ state, selectors }) => {
      document.getElementById('hud-probe')?.remove()
      const hud = document.querySelector<HTMLElement>('.battle-hud:not(#hud-probe)')!
      hud.style.visibility = 'hidden'
      const probe = hud.cloneNode(true) as HTMLElement
      probe.id = 'hud-probe'
      probe.style.visibility = 'visible'
      probe.hidden = false
      hud.parentElement!.append(probe)
      const q = (selector: string) => probe.querySelector<HTMLElement>(selector)!
      const final = state === 'final-break' || state === 'boss'
      q(selectors.wave).hidden = state === 'preparation'
      q(`${selectors.wave} .bhud-num`).textContent = final ? '3/3' : '2/3'
      q(selectors.wave).dataset.final = String(final)
      q(`${selectors.castle} .bhud-num`).textContent = '100'
      q(`${selectors.enemies} .bhud-num`).textContent = '残り21'
      q(selectors.crown).hidden = !final
      q(selectors.crown).dataset.state = state === 'boss' ? 'alive' : 'idle'
      q(`${selectors.coins} .bhud-num`).textContent = '+9999'
      q(selectors.pause).hidden = state === 'preparation'
      q(selectors.speed).hidden = false
      q(selectors.call).hidden = state !== 'break' && state !== 'final-break'
      q(selectors.call).dataset.final = String(final)
      q('.wave-call-time').textContent = `WAVE ${final ? '3 (FINAL)' : 2}まで 12秒`
      q('.wave-call-bonus').textContent = '+120G'
      q(selectors.boss).hidden = state !== 'boss'
      q('.bhud-boss-name').textContent = 'ドラゴンロード'
      q('.bhud-boss .bhud-num').textContent = '12000 / 12000'
      q('.bhud-boss .bhud-fill').style.width = '100%'
      const rect = (element: Element) => {
        const b = element.getBoundingClientRect()
        return { left: b.left, top: b.top, right: b.right, bottom: b.bottom }
      }
      const shown = (element: Element) => !(element as HTMLElement).hidden && element.getClientRects().length > 0
      const controls: Record<string, Rect> = {}
      for (const [name, selector] of Object.entries(selectors)) {
        const element = q(selector)
        if (shown(element)) controls[name] = rect(element)
      }
      const overflow = [...probe.querySelectorAll<HTMLElement>('.bhud-main, .bhud-side, .bhud-num, .wave-call *, .bhud-boss *')]
        .filter((element) => element.scrollWidth > element.clientWidth + 1 && element.clientWidth > 0)
        .map((element) => `${element.className}:${element.scrollWidth}>${element.clientWidth}`)
      // Every visible descendant of the frame (text, icons, bars) must sit inside it.
      const inner = [...probe.querySelectorAll(':scope > .bhud-main *, :scope > .bhud-side *')]
        .filter(shown)
        .map((element) => ({ name: String((element as HTMLElement).className?.baseVal ?? element.className ?? element.tagName), rect: rect(element) }))
      const top = ['#back', '#gold', '#settings-open', '.map-heading', '.field-controls', '.stage-label']
        .map((selector) => [selector, document.querySelector(selector)] as const)
        .filter(([, element]) => element && element.getClientRects().length > 0)
        .map(([selector, element]) => ({ name: selector, rect: rect(element!) }))
      return {
        hud: rect(probe),
        controls,
        inner,
        overflow,
        top,
        viewport: { width: innerWidth, height: innerHeight },
        fontSizes: [...probe.querySelectorAll<HTMLElement>('.bhud-num, .wave-call, .bhud-boss-name')]
          .filter(shown)
          .map((element) => parseFloat(getComputedStyle(element).fontSize))
      }
    },
    { state, selectors: SELECTORS }
  )
}

for (const size of [
  { width: 320, height: 568 },
  { width: 390, height: 844 },
  { width: 1440, height: 900 }
])
  test(`battle HUD stays inside its frame without overlaps at ${size.width}x${size.height}`, async ({ page }, info) => {
    test.setTimeout(300_000)
    await page.setViewportSize(size)
    await openOfflineCampaign(page)
    const slots = getField('meadow', 2, 4).slots
    for (const [type, slot] of [
      ['soldier', 3],
      ['archer', 4]
    ] as const)
      await dragUnitToWorld(page, type, slots[slot])
    if (await page.locator('#unit-tray').isVisible()) await page.locator('#unit-tray-close').click()
    await page.locator('#assault').click()
    await expect(page.locator('#app')).toHaveAttribute('data-phase', 'assault')
    await expect(page.locator('.battle-hud').first()).toBeVisible()
    for (const state of STATES) {
      const m = await measure(page, state)
      const dir = process.env.TOWER_HUD_SHOTS
      await page.screenshot({
        path: dir ? `${dir}/hud-${size.width}-${state}.png` : info.outputPath(`hud-${state}.png`),
        clip: { x: 0, y: 0, width: size.width, height: Math.min(size.height, 260) }
      })
      const label = `${state} @${size.width}`
      // Frame: everything inside the HUD box.
      for (const child of m.inner) {
        expect(child.rect.left, `${label} ${child.name} left`).toBeGreaterThanOrEqual(m.hud.left - 1)
        expect(child.rect.right, `${label} ${child.name} right`).toBeLessThanOrEqual(m.hud.right + 1)
        expect(child.rect.top, `${label} ${child.name} top`).toBeGreaterThanOrEqual(m.hud.top - 1)
        expect(child.rect.bottom, `${label} ${child.name} bottom`).toBeLessThanOrEqual(m.hud.bottom + 1)
      }
      expect(m.overflow, `${label} clipped text`).toEqual([])
      const all: Record<string, Rect> = { hud: m.hud, ...m.controls }
      for (const [name, rect] of Object.entries(all)) {
        expect(rect.left, `${label} ${name} on screen`).toBeGreaterThanOrEqual(-1)
        expect(rect.top, `${label} ${name} on screen`).toBeGreaterThanOrEqual(-1)
        expect(rect.right, `${label} ${name} on screen`).toBeLessThanOrEqual(m.viewport.width + 1)
        expect(rect.bottom, `${label} ${name} on screen`).toBeLessThanOrEqual(m.viewport.height + 1)
      }
      // The frame's own controls never overlap one another (the crown lives inside the enemy row); the wave call and boss bar hang under the frame.
      const names = Object.keys(m.controls).filter((name) => name !== 'call' && name !== 'boss' && name !== 'crown')
      for (let i = 0; i < names.length; i++)
        for (let j = i + 1; j < names.length; j++)
          expect(intersects(m.controls[names[i]], m.controls[names[j]]), `${label} ${names[i]} vs ${names[j]}`).toBe(false)
      for (const hanging of ['call', 'boss'] as const)
        if (m.controls[hanging]) {
          expect(intersects(m.controls[hanging], m.hud), `${label} ${hanging} vs hud`).toBe(false)
          for (const name of names) expect(intersects(m.controls[hanging], m.controls[name]), `${label} ${hanging} vs ${name}`).toBe(false)
        }
      // The frame never runs under the top bar controls.
      for (const top of m.top) expect(intersects(top.rect, m.hud), `${label} hud vs ${top.name}`).toBe(false)
      for (const px of m.fontSizes) expect(px, `${label} font size`).toBeGreaterThanOrEqual(11)
    }
  })
