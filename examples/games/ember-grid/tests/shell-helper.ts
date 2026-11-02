import type { Dialog, Page } from '@playwright/test'

export async function enterBattle(page: Page, url = './', unlocked = false) {
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
