import { expect, type Page, type TestInfo } from '@playwright/test'
import {
  FIELDS,
  type AllyType,
  type FieldId,
  type Point
} from '../examples/games/tower_diffence_with_jev/src/game/model'

export const towerPath = '/moq-games/examples/games/tower_diffence_with_jev/index.html'

export async function openOfflineCampaign(page: Page, field: FieldId = 'meadow') {
  await page.goto(towerPath)
  await page.locator('#title-new').click()
  await expect(page.locator('#launch')).toBeVisible()
  await page.locator(`[data-field="${field}"]`).click()
  await page.locator('#offline-start').click()
  await expect(page.locator('#launch')).toBeHidden()
  await expect(page.locator('#ai-mode')).toHaveText('RULE · OFFLINE')
  await expect(page.locator('#field-name')).toHaveText(FIELDS[field].name)
  await expect(page.locator('#field')).toHaveAttribute('data-layout-revision', '4')
  await expect(page.locator('#field canvas').first()).toBeVisible()
}

export async function pointOnVisibleMap(page: Page, point: Point) {
  await page.locator('#map-scroll').evaluate((element, p) => {
    const field = document.getElementById('field')!
    const scale = field.getBoundingClientRect().width / Number(field.dataset.worldWidth ?? 1280)
    element.scrollTo({
      left: p.x * scale - element.clientWidth / 2,
      top: p.y * scale - element.clientHeight / 2,
      behavior: 'instant'
    })
  }, point)
  await page
    .locator('#field canvas')
    .first()
    .evaluate(async () => {
      await new Promise<void>((resolve) => requestAnimationFrame(() => resolve()))
    })
  const bounds = await page.locator('#field canvas').first().boundingBox()
  if (!bounds) throw new Error('The battle canvas is not visible')
  const dimensions = await page.locator('#field').evaluate((element) => ({
    width: Number((element as HTMLElement).dataset.worldWidth ?? 1280),
    height: Number((element as HTMLElement).dataset.worldHeight ?? 960)
  }))
  return {
    x: bounds.x + (point.x / dimensions.width) * bounds.width,
    y: bounds.y + (point.y / dimensions.height) * bounds.height
  }
}

export async function clickWorld(page: Page, point: Point) {
  const screen = await pointOnVisibleMap(page, point)
  await page.mouse.click(screen.x, screen.y)
}

export async function openUnitTray(page: Page) {
  if (!(await page.locator('#unit-tray').isVisible())) await page.locator('#deck-toggle').click()
  await expect(page.locator('#unit-tray')).toBeVisible()
}

export async function openItemTray(page: Page) {
  if (!(await page.locator('#item-tray').isVisible())) await page.locator('#items-toggle').click()
  await expect(page.locator('#item-tray')).toBeVisible()
}

export async function beginUnitDragToWorld(page: Page, type: AllyType, point: Point) {
  const target = await pointOnVisibleMap(page, point)
  await openUnitTray(page)
  const card = page.locator(`#unit-${type}`)
  await expect(card).toBeVisible()
  await expect(card).toBeEnabled()
  await card.scrollIntoViewIfNeeded()
  const bounds = await card.boundingBox()
  if (!bounds) throw new Error(`${type} summon icon is not visible`)
  await page.mouse.move(bounds.x + bounds.width / 2, bounds.y + bounds.height / 2)
  await page.mouse.down()
  await page.mouse.move(target.x, target.y, { steps: 12 })
  await expect(page.locator('#app')).toHaveClass(/unit-dragging/)
}

export async function dragUnitToWorld(page: Page, type: AllyType, point: Point) {
  await beginUnitDragToWorld(page, type, point)
  await page.mouse.up()
}

export async function dragTouchUnitToWorld(page: Page, type: AllyType, point: Point) {
  const target = await pointOnVisibleMap(page, point)
  await openUnitTray(page)
  const card = page.locator(`#unit-${type}`)
  await expect(card).toBeVisible()
  await expect(card).toBeEnabled()
  await card.scrollIntoViewIfNeeded()
  const bounds = await card.boundingBox()
  if (!bounds) throw new Error(`${type} summon icon is not visible`)
  const start = { x: bounds.x + bounds.width / 2, y: bounds.y + bounds.height / 2 }
  const cdp = await page.context().newCDPSession(page)
  const scrollBeforeTouch = await page
    .locator('#map-scroll')
    .evaluate((element) => [element.scrollLeft, element.scrollTop])
  try {
    await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ ...start, id: 1 }] })
    for (let step = 1; step <= 12; step++) {
      await cdp.send('Input.dispatchTouchEvent', {
        type: 'touchMove',
        touchPoints: [
          {
            x: start.x + ((target.x - start.x) * step) / 12,
            y: start.y + ((target.y - start.y) * step) / 12,
            id: 1
          }
        ]
      })
      await page.evaluate(() => new Promise<void>((resolve) => requestAnimationFrame(() => resolve())))
    }
    await expect(page.locator('#app')).toHaveClass(/unit-dragging/)
    await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] })
  } finally {
    await cdp.detach()
  }
  return scrollBeforeTouch
}

async function fieldUnit(page: Page, identity: AllyType | number) {
  const label = page.locator(
    typeof identity === 'number'
      ? `.unit-health.player[data-unit-id="${identity}"]`
      : `.unit-health.player[data-unit-type="${identity}"]`
  )
  await expect(label).toHaveCount(1)
  const data = await label.evaluate((element) => ({
    id: Number((element as HTMLElement).dataset.unitId),
    x: Number((element as HTMLElement).dataset.homeX),
    y: Number((element as HTMLElement).dataset.homeY)
  }))
  return { ...data, handle: page.locator(`.defender-handle[data-unit-id="${data.id}"]`) }
}

export async function selectFieldUnit(page: Page, identity: AllyType | number) {
  const unit = await fieldUnit(page, identity)
  if (await page.locator('#selection-context').isVisible()) await page.locator('#selection-close').click()
  if (await page.locator('#unit-tray').isVisible()) await page.locator('#unit-tray-close').click()
  if (await page.locator('#item-tray').isVisible()) await page.locator('#item-tray-close').click()
  await pointOnVisibleMap(page, { x: unit.x, y: unit.y })
  await unit.handle.click()
  await expect(page.locator('#selection-context')).toBeVisible()
}

export async function beginFieldUnitDragToWorld(page: Page, identity: AllyType | number, point: Point) {
  const unit = await fieldUnit(page, identity)
  if (await page.locator('#selection-context').isVisible()) await page.locator('#selection-close').click()
  const target = await pointOnVisibleMap(page, point)
  const bounds = await unit.handle.boundingBox()
  if (!bounds) throw new Error(`${identity} field handle is not visible`)
  await page.mouse.move(bounds.x + bounds.width / 2, bounds.y + bounds.height / 2)
  await page.mouse.down()
  await page.mouse.move(target.x, target.y, { steps: 12 })
}

export async function expectRosterCount(page: Page, deployed: number, reserve: number) {
  await expect(page.locator('#count')).toHaveText(`${deployed} / 10`)
  await expect(page.locator('#reserve-count')).toHaveText(String(reserve))
}

export async function expectSandbagInventory(page: Page, stock: number, placed: number) {
  await expect(page.locator('#sandbag-stock')).toHaveText(`土のう ${stock}`)
  await expect(page.locator('.sandbag-health')).toHaveCount(placed)
}

export async function saveTowerScreenshot(page: Page, info: TestInfo, name: string) {
  await page.screenshot({ path: info.outputPath(`${name}.png`), fullPage: true })
}
