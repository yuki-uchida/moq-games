import { expect, test } from '@playwright/test'

for (const reducedMotion of ['no-preference', 'reduce'] as const) {
  for (const viewport of [
    { width: 1280, height: 720 },
    { width: 320, height: 568 },
    { width: 844, height: 390 }
  ]) {
    test(`chapter titles yield to real AI threats at ${viewport.width}x${viewport.height}, ${reducedMotion}`, async ({
      page
    }) => {
      await page.setViewportSize(viewport)
      await page.emulateMedia({ reducedMotion })
      await page.route('**/src/main.ts*', async (route) => {
        const response = await route.fetch()
        await route.fulfill({
          response,
          body: `${await response.text()}
import { heightAt as visibilityHeight } from '/src/map.ts';
window.chapterVisibility = {
  states: [],
  stage(distance = 7, health = 100) {
    const player = game.state.players.find((entry) => entry.id === localId);
    Object.assign(player, { x: -88, y: visibilityHeight(-88, -29.1), z: -29.1, health });
    game.state.predators = [{ id: 'chapter-fox', kind: 'fox', x: -88,
      y: visibilityHeight(-88, -29.1 - distance), z: -29.1 - distance,
      angle: 0, state: 'patrol', targetId: null, suspicion: 0 }];
    this.states = ['patrol'];
    const step = game.step.bind(game);
    game.step = (dt) => {
      step(dt);
      const state = game.state.predators[0]?.state;
      if (this.states.at(-1) !== state) this.states.push(state);
    };
    replay(titleCard);
  },
  clear() { game.state.predators = []; },
  flee() {
    const player = game.state.players.find((entry) => entry.id === localId);
    Object.assign(player, { x: -60, y: visibilityHeight(-60, -29.1) });
  },
  nextChapter() { game.state.stage = 2; },
  replay() { replay(titleCard); replay(element('#chapter-banner')); }
};`
        })
      })
      await page.goto('/?chapter=4')
      await page.locator('#solo').click()
      const title = page.locator('#title-card')
      await expect(title).toBeVisible()
      await expect(title).toHaveCSS('visibility', 'visible')
      await expect(title).toHaveCSS('opacity', '1')
      await page.evaluate('window.chapterVisibility.stage()')
      await expect(page.locator('.fx-threat')).toHaveAttribute('data-mode', 'suspicious')
      await expect(title).toHaveCSS('visibility', 'hidden')
      await expect(page.locator('#subtitle')).toBeVisible()
      await expect(page.locator('.fx-threat')).toHaveAttribute('data-mode', 'chase')
      expect(await page.evaluate('window.chapterVisibility.states')).toEqual(['patrol', 'suspicious', 'chase'])
      await expect(title).toHaveCSS('visibility', 'hidden')
      await page.evaluate('window.chapterVisibility.replay()')
      await expect(title).toHaveCSS('visibility', 'hidden')
      await expect(page.locator('#chapter-banner')).toHaveCSS('visibility', 'hidden')
      await page.evaluate('window.chapterVisibility.flee()')
      await expect(page.locator('.fx-threat')).toHaveAttribute('data-mode', 'search')
      await expect(title).toHaveCSS('visibility', 'hidden')
      await page.evaluate('window.chapterVisibility.clear()')
      await expect(page.locator('.fx-threat')).toBeHidden()
      await expect(title).toHaveCSS('visibility', 'visible')
      await page.evaluate('window.chapterVisibility.nextChapter()')
      await expect(page.locator('#title-card-chapter')).toHaveText('第3章')
      await expect(title).toBeVisible()
      await expect(title).toHaveCSS('opacity', '1')
      await page.evaluate('window.chapterVisibility.stage(0.9, 0.01)')
      await expect(page.locator('#result')).toBeVisible()
      await expect(page.locator('.fx-threat')).toBeHidden()
      await expect(page.locator('.fx-detection')).toHaveClass(/fx-on/)
      await expect(title).toHaveCSS('visibility', 'hidden')
      await expect(page.locator('#chapter-banner')).toHaveCSS('visibility', 'hidden')
    })
  }
}

test.describe('portrait subtitles', () => {
  test.use({ hasTouch: true, isMobile: true })

  for (const reducedMotion of ['no-preference', 'reduce'] as const) {
    for (const viewport of [
      { width: 320, height: 568 },
      { width: 360, height: 640 },
      { width: 390, height: 700 },
      { width: 390, height: 844 },
      { width: 430, height: 932 },
      { width: 760, height: 1024 }
    ]) {
      test(`stay clear of the rabbit at ${viewport.width}x${viewport.height}, ${reducedMotion}`, async ({
        page
      }, testInfo) => {
        await page.setViewportSize(viewport)
        await page.emulateMedia({ reducedMotion })
        await page.route('**/src/main.ts*', async (route) => {
          const response = await route.fetch()
          await route.fulfill({
            response,
            body: `${await response.text()}
window.subtitleVisibility = {
  stage() {
    const player = game.state.players.find((entry) => entry.id === localId);
    Object.assign(player, { x: -125, y: 0, z: 8 });
    game.state.foods = [];
    game.state.nests.forEach((nest) => { nest.active = false; });
    game.state.predators = [{ id: 'subtitle-fox', kind: 'fox', x: -125, y: 0, z: -2,
      angle: 0.6, state: 'patrol', targetId: null, suspicion: 0 }];
    const step = game.step.bind(game);
    game.step = (dt) => {
      step(dt);
      if (game.state.predators[0]?.state === 'chase') game.step = () => {};
    };
  },
  points() {
    const actor = scene.actors.get('player:' + localId);
    if (!actor) return null;
    return [[0, 1.08, 0.42], [0, 0.66, 0.24], [0, 0.4, 0.18]].map(([x, y, z]) => {
      const point = actor.root.position.clone().set(x, y, z);
      actor.body.localToWorld(point);
      return scene.screenPoint({ x: point.x, y: point.y - 0.6, z: point.z });
    });
  }
};`
          })
        })
        await page.goto('/?chapter=4')
        await page.locator('#solo').click()
        await page.evaluate(() => (window as any).subtitleVisibility.stage())
        await expect(page.locator('.fx-threat')).toHaveAttribute('data-mode', 'chase')
        const subtitle = page.locator('#subtitle')
        await expect(subtitle).toBeVisible()
        await expect(page.locator('#subtitle-text')).toHaveText(
          '公園の裏山をこえると、どこまでも続く森が広がっていた。'
        )
        await expect.poll(() => page.evaluate(() => (window as any).subtitleVisibility.points())).not.toBeNull()
        const points = await page.evaluate(() => (window as any).subtitleVisibility.points())
        const bounds = (await subtitle.boundingBox())!
        for (const point of points) {
          expect(
            point.x < bounds.x ||
              point.x > bounds.x + bounds.width ||
              point.y < bounds.y ||
              point.y > bounds.y + bounds.height
          ).toBe(true)
        }
        for (const overlay of ['.fx-threat', '.fx-detection', '.objective-card', '.joystick', '.touch-buttons']) {
          const locator = page.locator(overlay)
          if (!(await locator.isVisible())) continue
          const other = (await locator.boundingBox())!
          expect(
            bounds.x >= other.x + other.width ||
              bounds.x + bounds.width <= other.x ||
              bounds.y >= other.y + other.height ||
              bounds.y + bounds.height <= other.y,
            `subtitle overlaps ${overlay}: ${JSON.stringify({ bounds, other })}`
          ).toBe(true)
        }
        expect(bounds.x).toBeGreaterThanOrEqual(0)
        expect(bounds.y + bounds.height).toBeLessThanOrEqual(viewport.height)
        expect(await subtitle.evaluate((element) => element.scrollWidth <= element.clientWidth)).toBe(true)
        await page.screenshot({
          path: testInfo.outputPath(`subtitle-${viewport.width}x${viewport.height}-${reducedMotion}.png`)
        })
      })
    }
  }
})

test('detection overlays leave the predator and its marker visible across screen sizes', async ({ page }, testInfo) => {
  test.setTimeout(120_000)
  const errors: string[] = []
  page.on('pageerror', (error) => errors.push(error.message))
  await page.route('**/src/main.ts*', async (route) => {
    const response = await route.fetch()
    await route.fulfill({
      response,
      body: `${await response.text()}
window.rabbitVisibility = {
  prepare(distance, offset = 1.5) {
    game.step = () => {};
    const player = game.state.players.find((entry) => entry.id === localId);
    const template = game.state.predators.find((entry) => entry.kind === 'fox');
    game.state.predators = [{ ...template, id: 'visibility-fox', x: player.x + offset, y: player.y,
      z: player.z - distance, angle: Math.PI, state: 'patrol', targetId: null, suspicion: 0 }];
    game.state.time += 0.1;
  },
  chase() {
    Object.assign(game.state.predators[0], { state: 'chase', targetId: localId, suspicion: 1 });
    game.state.time += 0.1;
  },
  positions() {
    const actor = scene.actors.get('predator:visibility-fox');
    if (!actor?.marker?.symbol.visible) return null;
    const symbol = actor.marker.symbol;
    const center = symbol.getWorldPosition(actor.root.position.clone());
    const project = (point) => scene.screenPoint({ x: point.x, y: point.y - 0.6, z: point.z });
    const marker = project(center);
    const top = project({ ...center, x: center.x, y: center.y + symbol.scale.y / 2, z: center.z });
    const bottom = project({ ...center, x: center.x, y: center.y - symbol.scale.y / 2, z: center.z });
    const body = project({ x: actor.root.position.x, y: actor.root.position.y + 0.6, z: actor.root.position.z });
    if (!marker || !top || !bottom || !body) return null;
    return { marker, body, radius: Math.abs(top.y - bottom.y) / 2 };
  }
};`
    })
  })
  await page.goto('/?chapter=4')
  await page.locator('#solo').click()
  await expect(page.locator('#hud')).toBeVisible()
  for (const viewport of [
    { width: 1280, height: 720 },
    { width: 320, height: 568 },
    { width: 844, height: 390 },
    { width: 568, height: 320 },
    { width: 480, height: 320 },
    { width: 400, height: 300 }
  ]) {
    await page.setViewportSize(viewport)
    await page.emulateMedia({ reducedMotion: viewport.width === 400 ? 'reduce' : 'no-preference' })
    const sideOffset = viewport.width < 400 ? 3 : viewport.width <= 480 ? 5 : 9
    for (const [distance, offset] of [
      [5, 1.5],
      [9, 1.5],
      [9, -sideOffset],
      [9, sideOffset]
    ]) {
      await page.evaluate(
        ([range, lateral]) => (window as any).rabbitVisibility.prepare(range, lateral),
        [distance, offset]
      )
      await page.waitForTimeout(350)
      await page.evaluate(() => (window as any).rabbitVisibility.chase())
      await expect(page.locator('.fx-detection')).toHaveClass(/fx-on/)
      await page.locator('.fx-detection').evaluate((element) => {
        for (const animation of element.getAnimations()) {
          animation.pause()
          animation.currentTime = 144
        }
      })
      const read = () =>
        page.evaluate<{
          marker: { x: number; y: number }
          body: { x: number; y: number }
          radius: number
        } | null>(() => (window as any).rabbitVisibility.positions())
      await expect.poll(read).not.toBeNull()
      const positions = (await read())!
      const badge = page.locator('.fx-threat')
      const narrowLandscape = viewport.width <= 560 && viewport.width > viewport.height
      if (narrowLandscape) {
        await expect(badge).toBeHidden()
        const detection = (await page.locator('.fx-detection').boundingBox())!
        const actions = (await page.locator('.top-actions').boundingBox())!
        expect(detection.x + detection.width).toBeLessThanOrEqual(actions.x)
      }
      for (const overlay of [page.locator('.fx-detection'), page.locator('.fx-threat'), page.locator('.subtitle')]) {
        if (!(await overlay.isVisible())) continue
        const bounds = (await overlay.boundingBox())!
        for (const [point, radius] of [
          [positions.marker, positions.radius],
          [positions.body, 0]
        ] as const) {
          expect(
            point.x + radius <= bounds.x ||
              point.x - radius >= bounds.x + bounds.width ||
              point.y + radius <= bounds.y ||
              point.y - radius >= bounds.y + bounds.height,
            `${viewport.width}x${viewport.height}, distance ${distance}, offset ${offset}`
          ).toBe(true)
        }
      }
      await page.screenshot({
        path: testInfo.outputPath(`${viewport.width}x${viewport.height}-${distance}m-${offset}.png`)
      })
      if (narrowLandscape) {
        await page.locator('.fx-detection').evaluate((element) => {
          for (const animation of element.getAnimations()) animation.play()
        })
        await expect(page.locator('.fx-detection')).not.toHaveClass(/fx-on/)
        await expect(badge).toBeVisible()
        const bounds = (await badge.boundingBox())!
        expect(bounds.x).toBeGreaterThanOrEqual(0)
        expect(bounds.x + bounds.width).toBeLessThanOrEqual(viewport.width)
        expect(await badge.evaluate((element) => element.scrollWidth <= element.clientWidth)).toBe(true)
        for (const selector of ['.top-actions', '.hud-card', '.objective-card', '.area-card']) {
          for (const overlay of await page.locator(selector).all()) {
            if (!(await overlay.isVisible())) continue
            const other = (await overlay.boundingBox())!
            expect(
              bounds.x + bounds.width <= other.x ||
                bounds.x >= other.x + other.width ||
                bounds.y + bounds.height <= other.y ||
                bounds.y >= other.y + other.height,
              `badge / ${selector}, ${viewport.width}x${viewport.height}`
            ).toBe(true)
          }
        }
        await expect.poll(read).not.toBeNull()
        const badgePositions = (await read())!
        for (const [point, radius] of [
          [badgePositions.marker, badgePositions.radius],
          [badgePositions.body, 0]
        ] as const) {
          expect(
            point.x + radius <= bounds.x ||
              point.x - radius >= bounds.x + bounds.width ||
              point.y + radius <= bounds.y ||
              point.y - radius >= bounds.y + bounds.height,
            `badge / predator, ${viewport.width}x${viewport.height}, distance ${distance}, offset ${offset}`
          ).toBe(true)
        }
        await page.screenshot({
          path: testInfo.outputPath(`${viewport.width}x${viewport.height}-${distance}m-${offset}-badge.png`)
        })
      }
    }
  }
  expect(errors).toEqual([])
})

test.describe('subtitle field separation', () => {
  test.use({ hasTouch: true, isMobile: true })

  for (const reducedMotion of ['no-preference', 'reduce'] as const) {
    test(`keeps full narration outside the field with multiple threats, ${reducedMotion}`, async ({ page }) => {
      await page.emulateMedia({ reducedMotion })
      await page.route('**/src/main.ts*', async (route) => {
        const response = await route.fetch()
        await route.fulfill({
          response,
          body: `${await response.text()}
window.subtitleField = {
  stage(distance) {
    game.step = () => {};
    const player = game.state.players.find((entry) => entry.id === localId);
    game.state.predators = [-1.5, 1.5].map((offset, index) => ({
      id: 'subtitle-side-' + index, kind: 'fox', x: player.x + offset, y: player.y,
      z: player.z - distance, angle: Math.PI, state: 'chase', targetId: localId, suspicion: 1
    }));
    game.state.time += 0.1;
  },
  markers() {
    return game.state.predators.map((predator) => {
      const actor = scene.actors.get('predator:' + predator.id);
      if (!actor?.marker?.symbol.visible) return null;
      const symbol = actor.marker.symbol;
      const center = symbol.getWorldPosition(actor.root.position.clone());
      return [-0.5, 0.5].map((edge) => scene.screenPoint({
        x: center.x, y: center.y - 0.6 + symbol.scale.y * edge, z: center.z
      }));
    });
  },
  hide() {
    hudAt = Infinity;
    subtitle.hidden = true;
  }
};`
        })
      })
      await page.goto('/?chapter=4')
      await page.locator('#solo').click()
      for (const viewport of [
        { width: 320, height: 568 },
        { width: 390, height: 844 },
        { width: 760, height: 1024 },
        { width: 844, height: 390 },
        { width: 568, height: 320 },
        { width: 480, height: 320 }
      ]) {
        await page.setViewportSize(viewport)
        for (const distance of [5, 9]) {
          await page.evaluate((range) => (window as any).subtitleField.stage(range), distance)
          const subtitle = page.locator('#subtitle')
          await expect(subtitle).toBeVisible()
          await expect(page.locator('#subtitle-text')).toHaveText(
            '公園の裏山をこえると、どこまでも続く森が広がっていた。'
          )
          await expect
            .poll(async () => {
              const band = (await subtitle.boundingBox())!
              const field = (await page.locator('#world canvas').boundingBox())!
              return Math.abs(field.y + field.height - band.y)
            })
            .toBeLessThan(1)
          await expect(page.locator('.fx-threat')).toHaveAttribute('data-mode', 'chase')
          if (viewport.width <= 560 && viewport.width > viewport.height) {
            await expect(page.locator('.fx-detection')).not.toHaveClass(/fx-on/)
            await expect(page.locator('.fx-threat')).toBeVisible()
          }
          const band = (await subtitle.boundingBox())!
          const badge = (await page.locator('.fx-threat').boundingBox())!
          expect(badge.x).toBeGreaterThanOrEqual(0)
          expect(badge.x + badge.width).toBeLessThanOrEqual(viewport.width)
          expect(
            await page.locator('.fx-threat').evaluate((element) => element.scrollWidth <= element.clientWidth)
          ).toBe(true)
          expect(band.y + band.height).toBeLessThanOrEqual(viewport.height)
          expect(await subtitle.evaluate((element) => element.scrollWidth <= element.clientWidth)).toBe(true)
          for (const selector of [
            '.hud-card',
            '.objective-card',
            '.area-card',
            '.joystick',
            '.touch-buttons',
            '.top-actions',
            '.fx-detection'
          ]) {
            for (const overlay of await page.locator(selector).all()) {
              if (!(await overlay.isVisible())) continue
              if (
                selector === '.fx-detection' &&
                !(await overlay.evaluate((element) => element.classList.contains('fx-on')))
              )
                continue
              const bounds = (await overlay.boundingBox())!
              expect(
                badge.x + badge.width <= bounds.x ||
                  badge.x >= bounds.x + bounds.width ||
                  badge.y + badge.height <= bounds.y ||
                  badge.y >= bounds.y + bounds.height,
                `badge / ${selector}, ${viewport.width}x${viewport.height}`
              ).toBe(true)
              expect(bounds.y + bounds.height, `${selector}, ${viewport.width}x${viewport.height}`).toBeLessThanOrEqual(
                band.y
              )
            }
          }
          await expect
            .poll(() => page.evaluate(() => (window as any).subtitleField.markers().flat().filter(Boolean).length))
            .toBe(4)
          const markers = await page.evaluate(() => (window as any).subtitleField.markers())
          for (const edges of markers) {
            for (const point of edges) {
              expect(point).not.toBeNull()
              expect(point.y).toBeLessThan(band.y)
              expect(
                point.x < badge.x ||
                  point.x > badge.x + badge.width ||
                  point.y < badge.y ||
                  point.y > badge.y + badge.height
              ).toBe(true)
            }
          }
        }
      }
      await page.evaluate(() => (window as any).subtitleField.hide())
      await expect
        .poll(() => page.locator('#world canvas').evaluate((element) => element.getBoundingClientRect().height))
        .toBe(320)
    })
  }
})
