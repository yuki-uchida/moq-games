import type { Dialog, Locator, Page } from '@playwright/test'

export async function acceptDiscard(page: Page) {
  const button = page.getByRole('button', { name: '↻ 破棄して続ける' })
  if (await button.isVisible()) await button.click()
}

export async function enterBattle(page: Page, url = './', unlocked = false) {
  await page.addInitScript(() => localStorage.setItem('ember-grid:tutorial-complete:v1', '1'))
  if (unlocked) {
    await page.addInitScript(() => {
      if (!localStorage.getItem('ember-grid:save:v1'))
        localStorage.setItem(
          'ember-grid:save:v1',
          JSON.stringify({
            version: 1,
            difficulty: 'classic',
            formation: 'balanced',
            checkpoints: [],
            furthest: 5,
            cleared: [],
            bestTurns: {}
          })
        )
    })
  }
  await page.goto(url)
  if (unlocked) {
    await page.getByRole('button', { name: '⚑ 章を選ぶ' }).click()
    await page
      .getByRole('dialog')
      .getByRole('button', { name: /峡谷の燈/ })
      .click()
  } else {
    // A save left by an earlier start in the same test asks before it is overwritten; tests want a new expedition.
    const overwrite = (dialog: Dialog) => void dialog.accept()
    page.on('dialog', overwrite)
    await page.getByRole('button', { name: '✦ はじめから' }).click()
    await page.getByRole('button', { name: '⚔ クラシック' }).click()
    page.off('dialog', overwrite)
  }
}

/** Clicks a board tile; if the camera has it off screen or under its buttons, first shows the whole board (as a player would). */
export async function clickCell(page: Page, cell: Locator) {
  const reachable = await cell.evaluate((element) => {
    const field = document.querySelector('.field')!.getBoundingClientRect(),
      box = element.getBoundingClientRect(),
      x = box.left + box.width / 2,
      y = box.top + box.height / 2
    return (
      x > field.left &&
      x < field.right &&
      y > field.top &&
      y < field.bottom &&
      document.elementFromPoint(x, y) === element
    )
  })
  const whole = page.getByRole('button', { name: '全体を表示' })
  if (!reachable && (await whole.isEnabled())) await whole.click()
  await cell.click()
}

/** Waits until the camera has stopped moving the board. */
export async function cameraSettled(page: Page) {
  let last = ''
  for (let attempt = 0; attempt < 50; attempt++) {
    const box = JSON.stringify(await page.locator('#board').boundingBox())
    if (box === last) return
    last = box
    await page.waitForTimeout(150)
  }
}
