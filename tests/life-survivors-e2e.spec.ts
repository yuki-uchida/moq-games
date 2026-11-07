import { expect, test, type Page } from '@playwright/test'
import type { Game } from '../examples/games/life-survivors/src/game'
import type { View } from '../examples/games/life-survivors/src/view'

type Life = {
  game: {
    state: { time: number; xpNext: number; players: { id: string; choices: string[]; x: number }[] }
    gainXp(n: number): void
  }
  view: { time: number; phase: string; players: { id: string; x: number; choices: string[] }[] }
  localId: string
}
type GambleResult = { at: number; font: string; x: number; width: number; alpha: number }
const life = async (page: Page) => {
  await page.waitForFunction(() => Boolean((window as unknown as { __life?: Life }).__life))
  return page.evaluateHandle(() => (window as unknown as { __life: Life }).__life)
}

test('gambling draws the right animation and status for each life stage', async ({ page }, testInfo) => {
  const errors: string[] = []
  page.on('pageerror', (error) => errors.push(error.message))
  await page.addInitScript(() => {
    const labels: string[] = []
    const results: GambleResult[] = []
    Object.assign(window, { gambleLabels: labels, gambleResults: results })
    const fillText = CanvasRenderingContext2D.prototype.fillText
    CanvasRenderingContext2D.prototype.fillText = function (text, x, y, maxWidth) {
      if (['ガチャ！', 'ポーカー！', '大当たり！', '競馬的中！', '🍳 料理'].includes(text)) labels.push(text)
      if (text === '🍳 料理') {
        results.push({ at: performance.now(), font: this.font, x, width: maxWidth ?? 0, alpha: this.globalAlpha })
      }
      if (maxWidth === undefined) fillText.call(this, text, x, y)
      else fillText.call(this, text, x, y, maxWidth)
    }
  })
  await page.goto('/')
  await page.getByRole('button', { name: 'ひとりで生まれる' }).click()
  const handle = await life(page)
  for (const [age, name, label] of [
    [12, '課金', 'ガチャ！'],
    [18, 'ポーカー', 'ポーカー！'],
    [23, 'パチンコ', '大当たり！'],
    [50, '競馬', '競馬的中！']
  ] as const) {
    if (age === 23) await page.setViewportSize({ width: 390, height: 844 })
    await page.evaluate(() => {
      const traces = window as unknown as { gambleLabels: string[]; gambleResults: GambleResult[] }
      traces.gambleLabels.length = 0
      traces.gambleResults.length = 0
    })
    const copied = await handle.evaluate(async (hook, nextAge) => {
      const path = '/src/data.ts'
      const { EVENTS, timeAtAge } = await import(path)
      const game = hook.game as unknown as Game
      const player = game.state.players[0]
      game.targetPopulation = () => 0
      game.state.time = timeAtAge(nextAge) + 0.01
      game.state.eventIndex = EVENTS.length
      game.state.enemies = []
      game.state.shots = []
      game.state.fx = []
      player.choices = []
      player.pending = 0
      player.birthPick = false
      player.weapons = [{ id: 'w_gamble', lv: 1, cd: 0, held: 0, damage: 0 }]
      Object.defineProperty(game, 'rng', { value: () => 0.9999, configurable: true })
      game['fireWeapons'](0)
      return game.state.shots.some((shot) => shot.sourceWeapon === 'w_gamble' && shot.weapon === 'w_cooking')
    }, age)
    expect(copied).toBe(true)
    await expect
      .poll(() =>
        page.evaluate((text) => (window as unknown as { gambleLabels: string[] }).gambleLabels.includes(text), label)
      )
      .toBe(true)
    await expect
      .poll(() =>
        page.evaluate(() => (window as unknown as { gambleLabels: string[] }).gambleLabels.includes('🍳 料理'))
      )
      .toBe(true)
    await expect
      .poll(() =>
        page.evaluate(() => {
          const results = (window as unknown as { gambleResults: GambleResult[] }).gambleResults
          return results.length > 1 && results.at(-1)!.at - results[0].at > 1500
        })
      )
      .toBe(true)
    const result = await page.evaluate(
      () => (window as unknown as { gambleResults: GambleResult[] }).gambleResults.at(-1)!
    )
    expect(result.font).toBe('bold 20px sans-serif')
    expect(result.alpha).toBe(1)
    expect(result.x - result.width / 2).toBeGreaterThanOrEqual(8)
    expect(result.x + result.width / 2).toBeLessThanOrEqual(page.viewportSize()!.width - 8)
    await page.screenshot({ path: testInfo.outputPath(`gamble-${age}.png`) })
    await page.locator('#status-open').click()
    await expect(page.locator('#status-weapons')).toContainText(`ギャンブル（${name}）`)
    await page.locator('#status-done').click()
  }
  expect(errors).toEqual([])
})

test('SNS chains scale with duration instead of bonus projectile count', async ({ page }) => {
  await page.goto('/')
  await page.getByRole('button', { name: 'ひとりで生まれる' }).click()
  const handle = await life(page)
  const result = await handle.evaluate((hook) => {
    const game = hook.game as unknown as Game
    const player = game.state.players[0]
    game.targetPopulation = () => 0
    player.talents = { friend: 1, love: 1, sports: 1, hobby: 1, study: 1, invest: 1 }
    return [
      [],
      [
        { id: 'p_clever', lv: 4 },
        { id: 'p_grand', lv: 5 }
      ],
      [{ id: 'p_curious', lv: 5 }],
      [
        { id: 'p_curious', lv: 5 },
        { id: 'p_grand', lv: 5 }
      ]
    ].map((passives) => {
      game.state.enemies = []
      game.state.shots = []
      player.passives = passives
      player.weapons = [{ id: 'w_sns', lv: 1, cd: 0, held: 0, damage: 0 }]
      const enemies = Array.from({ length: 8 }, (_, index) => {
        const enemy = game.spawnEnemy('germ', player.x + 100 + index * 30, player.y)!
        enemy.hp = enemy.maxHp = 1000
        return enemy
      })
      game.tick(1 / 60)
      return {
        links: game.state.shots.filter((shot) => shot.weapon === 'w_sns').length,
        hits: enemies.filter((enemy) => enemy.hp < enemy.maxHp).length
      }
    })
  })
  expect(result).toEqual([
    { links: 3, hits: 3 },
    { links: 3, hits: 3 },
    { links: 5, hits: 5 },
    { links: 5, hits: 5 }
  ])
})

test('free-parent balloons rise and their burst damages and pushes enemies', async ({ page }) => {
  await page.goto('/')
  await page.getByRole('button', { name: 'ひとりで生まれる' }).click()
  const handle = await life(page)
  const result = await handle.evaluate((hook) => {
    const game = hook.game as unknown as Game
    const player = game.state.players[0]
    game.targetPopulation = () => 0
    game.state.enemies = []
    game.state.shots = []
    player.birthPick = false
    player.pending = 0
    player.choices = []
    player.parent = 'p_free'
    player.weapons = [{ id: 'p_free', lv: 1, cd: 0, held: 0, damage: 0 }]
    game.tick(1 / 60)
    const shots = game.state.shots
    const rising = shots.length >= 2 && shots.every((shot) => shot.vx === 0 && shot.vy < 0 && shot.y < player.y)
    const shot = shots[0]
    game.state.shots = [shot]
    player.weapons[0].cd = 100
    Object.assign(shot, { x: player.x + 140, y: player.y - 140, vx: 0, vy: 0, pierce: 1 })
    const target = game.spawnEnemy('germ', shot.x, shot.y)!
    const neighbor = game.spawnEnemy('germ', shot.x - 50, shot.y)!
    target.hp = target.maxHp = neighbor.hp = neighbor.maxHp = 1000
    game.tick(1 / 60)
    return {
      rising,
      targetDamage: target.maxHp - target.hp,
      neighborDamage: neighbor.maxHp - neighbor.hp,
      neighborKnockback: neighbor.kx,
      recordedDamage: player.weapons[0].damage,
      remainingShots: game.state.shots.length
    }
  })
  expect(result.rising).toBe(true)
  expect(result.targetDamage).toBeGreaterThan(0)
  expect(result.neighborDamage).toBeGreaterThan(0)
  expect(result.neighborKnockback).toBeLessThan(0)
  expect(result.recordedDamage).toBeCloseTo(result.targetDamage + result.neighborDamage)
  expect(result.remainingShots).toBe(0)
})

test('relationship choice uses the game UI and unlocks the personal rival', async ({ page }) => {
  await page.goto('/')
  await page.getByRole('button', { name: 'ひとりで生まれる' }).click()
  const handle = await life(page)
  await handle.evaluate(async (hook) => {
    const path = '/src/data.ts'
    const { EVENTS } = await import(path)
    const game = hook.game as unknown as Game
    const player = game.state.players[0]
    player.choices = []
    player.pending = 0
    const event = EVENTS.findIndex((entry: { swarm?: string }) => entry.swarm === 'car')
    game.state.eventIndex = event
    game.state.time = EVENTS[event].at - 0.01
    game.tick(0.02)
  })
  await expect(page.locator('#levelup-title')).toHaveText('交際の選択')
  await expect(page.locator('#cards')).toContainText('交際する')
  await expect(page.locator('#cards')).toContainText('浮気相手や束縛するパートナーが現れる')
  await page.keyboard.press('Digit1')
  await expect.poll(() => handle.evaluate((hook) => (hook.game as unknown as Game).state.players[0].dating)).toBe(true)
  expect(await handle.evaluate((hook) => (hook.game as unknown as Game).spawnEnemy('temptation')?.targetPlayer)).toBe(
    await handle.evaluate((hook) => hook.localId)
  )
})

test('the controlling partner is personal in co-op and retires when its owner leaves', async ({ page }) => {
  await page.goto('/')
  await page.getByRole('button', { name: 'ひとりで生まれる' }).click()
  const handle = await life(page)
  const result = await handle.evaluate(async (hook) => {
    const path = '/src/art/index.ts'
    const { SHEETS } = await import(path)
    const dataPath = '/src/data.ts'
    const { EVENTS, timeAtAge } = await import(dataPath)
    const game = hook.game as unknown as Game
    game.state.time = timeAtAge(30)
    game.state.eventIndex = EVENTS.length
    const owner = game.state.players[0]
    owner.choices = []
    owner.pending = 0
    owner.weapons = []
    owner.dating = true
    owner.x = 600
    const other = game.addPlayer('other', 'p_free')!
    other.choices = []
    other.pending = 0
    other.x = 0
    other.weapons = []
    const enemy = game.spawnEnemy('controlling_partner', other.x, other.y)!
    const health = other.hp
    game.tick(0.01)
    const tracked = enemy.x > 0
    const protectedOther = other.hp === health
    const personal = enemy.targetPlayer === owner.id
    const former = SHEETS['enemy:unrequited_worry']().move.frames[0].data
    const distinct = SHEETS['enemy:controlling_partner']().move.frames[0].data.some(
      (pixel: number, index: number) => pixel !== former[index]
    )
    game.removePlayer(owner.id)
    game.tick(0.01)
    return { tracked, protectedOther, personal, distinct, retired: !game.state.enemies.includes(enemy) }
  })
  expect(result).toEqual({ tracked: true, protectedOther: true, personal: true, distinct: true, retired: true })
  await expect(page.locator('canvas')).toBeVisible()
})

test('childhood mischief announces a family challenge', async ({ page }) => {
  await page.goto('/')
  await page.getByRole('button', { name: 'ひとりで生まれる' }).click()
  const handle = await life(page)
  await handle.evaluate(async (hook) => {
    const path = '/src/data.ts'
    const { EVENTS } = await import(path)
    const game = hook.game as unknown as Game
    const player = game.state.players[0]
    player.choices = []
    player.pending = 0
    player.married = true
    player.hasChild = true
    const event = EVENTS.findIndex((entry: { swarm?: string }) => entry.swarm === 'mischief')
    game.state.eventIndex = event
    game.state.time = EVENTS[event].at - 0.01
    game.tick(0.02)
  })
  await expect(page.locator('#banner .banner-title')).toHaveText('仲間の家族の試練：子育てのいたずらに振り回される！', {
    timeout: 8000
  })
})

test('co-op cards retain focus across birthdays and appearance changes', async ({ page }) => {
  await page.goto('/')
  await page.getByRole('button', { name: 'ひとりで生まれる' }).click()
  const handle = await life(page)
  await handle.evaluate(async (hook) => {
    const path = '/src/data.ts'
    const { EVENTS, timeAtAge } = await import(path)
    const game = hook.game as unknown as Game
    game.addPlayer('other', 'p_over')
    game.state.eventIndex = EVENTS.length
    game.state.time = timeAtAge(10) + 0.01
    game.state.enemies = []
    const player = game.state.players[0]
    player.birthPick = false
    player.weapons = [{ id: 'w_sports', lv: 1, cd: 100, held: 0, damage: 0 }]
    player.choices = ['w:w_sports', 'x:skip']
    player.choiceSeq++
  })
  const second = page.locator('#cards .card').nth(1)
  await expect(second).toBeVisible()
  await second.focus()
  const original = await second.elementHandle()
  await handle.evaluate(async (hook) => {
    const path = '/src/data.ts'
    const { timeAtAge } = await import(path)
    ;(hook.game as unknown as Game).state.time = timeAtAge(11) + 0.01
  })
  await expect
    .poll(() =>
      handle.evaluate(async (hook) => {
        const path = '/src/data.ts'
        const { ageAt } = await import(path)
        return ageAt(hook.view.time)
      })
    )
    .toBe(11)
  await expect(second).toBeFocused()
  expect(await original!.evaluate((element) => element.isConnected)).toBe(true)
  await handle.evaluate(async (hook) => {
    const path = '/src/data.ts'
    const { timeAtAge } = await import(path)
    ;(hook.game as unknown as Game).state.time = timeAtAge(12) + 0.01
  })
  await expect(page.locator('#cards')).toContainText('野球')
  await expect(second).toBeFocused()
})

test('age-dependent sports and pet life stay consistent in cards, HUD and results', async ({ page }) => {
  const errors: string[] = []
  page.on('pageerror', (error) => errors.push(error.message))
  await page.goto('/')
  await page.getByRole('button', { name: 'ひとりで生まれる' }).click()
  const handle = await life(page)
  await handle.evaluate(async (hook) => {
    const path = '/src/data.ts'
    const { EVENTS, timeAtAge } = await import(path)
    const game = hook.game as unknown as Game
    const player = game.state.players[0]
    player.birthPick = false
    player.pending = player.swapPending = player.careerPending = 0
    player.choices = []
    player.weapons = [
      { id: 'w_sports', lv: 8, cd: 0, held: 0, damage: 100 },
      { id: 'w_pet', lv: 1, cd: 0, held: 0, damage: 0, acquiredAge: 5 }
    ]
    player.passives = [{ id: 'p_hot', lv: 1 }]
    game.state.eventIndex = EVENTS.length
    game.state.time = timeAtAge(5) + 0.01
    game.state.enemies = []
  })
  await expect(page.locator('#weapons')).toContainText('MAX')
  await expect(page.locator('#weapons .slot[title*="サッカー"]')).toHaveCount(1)
  await expect(page.locator('#weapons .slot[title*="子犬"]')).toHaveCount(1)
  const sportIcon = page.locator('#weapons .slot[title*="サッカー"] img')
  const soccerUrl = await sportIcon.getAttribute('src')
  for (const [age, name] of [
    [6, 'サッカー'],
    [12, '野球'],
    [15, 'バスケ'],
    [18, 'テニス'],
    [23, 'ゴルフ'],
    [50, 'ゲートボール']
  ] as const) {
    await handle.evaluate(async (hook, age) => {
      const path = '/src/data.ts'
      const { timeAtAge } = await import(path)
      const game = hook.game as unknown as Game
      game.state.time = timeAtAge(age) + 0.01
      game.state.enemies = []
    }, age)
    const slot = page.locator(`#weapons .slot[title*="${name}"]`)
    await expect(slot).toHaveCount(1)
    await expect(slot).toHaveAttribute('title', new RegExp(`全国制覇.*${name}`))
    if (name === 'サッカー') expect(await slot.locator('img').getAttribute('src')).toBe(soccerUrl)
    else expect(await slot.locator('img').getAttribute('src')).not.toBe(soccerUrl)
    if (age === 12) await expect(page.locator('#weapons .slot[title*="成犬"]')).toHaveCount(1)
    if (age === 18) await expect(page.locator('#weapons .slot[title*="老犬"]')).toHaveCount(1)
  }
  await expect(page.locator('#weapons .slot[title*="ペット"]')).toHaveCount(0)
  await expect(page.locator('#passives .slot[title*="愛犬との思い出"]')).toHaveCount(1)
  await handle.evaluate((hook) => {
    const player = (hook.game as unknown as Game).state.players[0]
    player.choices = ['w:w_sports', 'w:w_pet']
    player.choiceSeq++
  })
  await expect(page.locator('#cards')).toContainText('ゲートボール')
  await expect(page.locator('#cards')).toContainText('子犬')
  await handle.evaluate((hook) => {
    const game = hook.game as unknown as Game
    game.state.players[0].choices = []
    game.state.phase = 'lost'
  })
  await expect(page.locator('#result-build')).toContainText('ゲートボール')
  await expect(page.locator('#result-build')).toContainText('愛犬との思い出 Lv1')
  await expect(page.locator('#result-build')).not.toContainText('ペット Lv')
  expect(errors).toEqual([])
})

for (const [parent, description] of [
  ['p_weak', '経験値 +25%、防御 +1'],
  ['p_over', '盾で迎撃・吹き飛ばす'],
  ['p_over', '1枚1回防御＋無敵0.5秒'],
  ['p_over', '詳しくは「?」へ'],
  ['p_toxic', '全武器の威力 +5%'],
  ['p_toxic', '自然回復なし（性格・仲間・家庭）'],
  ['p_toxic', '18歳未満は親を含めて手札3枠']
]) {
  test(`parent ability is explained in the HUD and result: ${parent}: ${description}`, async ({ page }) => {
    await page.goto('/')
    await page.getByRole('button', { name: 'ひとりで生まれる' }).click()
    const handle = await life(page)
    await handle.evaluate((hook, parent) => {
      const game = hook.game as unknown as Game
      const player = game.state.players[0]
      player.parent = parent
      player.weapons = [{ id: parent, lv: 1, cd: 100, held: 0, damage: 0 }]
      player.birthPick = false
      player.pending = 0
      player.choices = []
    }, parent)
    await expect.poll(() => page.locator('#weapons .parent').getAttribute('title')).toContain(description)
    await handle.evaluate((hook) => {
      const game = hook.game as unknown as Game
      game.state.phase = 'lost'
    })
    await expect(page.locator('#result')).toBeVisible({ timeout: 8000 })
    await expect(page.locator('#result-build')).toContainText(description)
  })
}

for (const viewport of [
  { width: 320, height: 568 },
  { width: 390, height: 844 },
  { width: 844, height: 390 }
]) {
  test(`mobile HUD fits ${viewport.width}x${viewport.height}`, async ({ page }) => {
    await page.setViewportSize(viewport)
    await page.goto('/')
    expect(await page.locator('body').evaluate((body) => getComputedStyle(body).touchAction)).toBe('manipulation')
    await page.getByRole('button', { name: 'ひとりで生まれる' }).click()
    const xp = page.locator('.xp-bar')
    const xpFill = page.locator('#xp-fill')
    const hp = page.locator('.xp-bar .meter')
    await expect(hp).toBeVisible()
    await xpFill.evaluate((element) => (element.style.width = '100%'))
    const xpBox = (await xp.boundingBox())!
    const xpFillBox = (await xpFill.boundingBox())!
    const hpBox = (await hp.boundingBox())!
    expect(xpFillBox.y).toBeGreaterThanOrEqual(hpBox.y + hpBox.height)
    expect(hpBox.height).toBeGreaterThan(xpFillBox.height)
    expect(await xpFill.evaluate((element) => getComputedStyle(element).backgroundImage)).toContain('139, 92, 246')
    expect(hpBox.x).toBeGreaterThanOrEqual(xpBox.x)
    expect(hpBox.x + hpBox.width).toBeLessThanOrEqual(xpBox.x + xpBox.width)
    expect(hpBox.y).toBeGreaterThanOrEqual(xpBox.y)
    expect(hpBox.y + hpBox.height).toBeLessThanOrEqual(xpBox.y + xpBox.height)
    for (const selector of ['.life-card', '#status-open', '#mute', '#help-open', '#leave']) {
      const box = (await page.locator(selector).boundingBox())!
      expect(box.x).toBeGreaterThanOrEqual(0)
      expect(box.x + box.width).toBeLessThanOrEqual(viewport.width)
    }
  })
}

for (const width of [1280, 390]) {
  test(`employment history announces a personal meeting at ${width}px`, async ({ browser }, testInfo) => {
    const context = await browser.newContext({ viewport: { width, height: 844 }, hasTouch: width === 390 })
    const page = await context.newPage()
    await page.goto('/')
    await page.getByRole('button', { name: 'ひとりで生まれる' }).click()
    const handle = await life(page)
    await handle.evaluate(async (hook) => {
      const path = '/src/data.ts'
      const { EVENTS } = await import(path)
      const game = hook.game as unknown as Game
      const player = game.state.players[0]
      player.birthPick = false
      player.pending = 0
      player.choices = []
      player.weapons = [{ id: 'w_work', lv: 2, cd: 100, held: 0, damage: 0 }]
      const career = EVENTS.findIndex((event: { boss?: string }) => event.boss === 'b_shukatsu')
      game.state.eventIndex = career
      game.state.time = EVENTS[career].at - 0.01
      game.tick(0.02)
      player.careerPending = 0
      player.choices = []
      game.state.enemies = []
      game.state.fx = []
      const meeting = EVENTS.findIndex((event: { swarm?: string }) => event.swarm === 'endless_meeting')
      game.state.eventIndex = meeting
      game.state.time = EVENTS[meeting].at - 0.01
      game.tick(0.02)
    })
    await expect(page.locator('#feed')).toContainText('P1の仕事の試練：会議、会議、また会議')
    await expect(page.locator('#banner .banner-title')).toHaveText('仕事の試練：会議、会議、また会議…', {
      timeout: 8000
    })
    const titleBounds = await page.locator('#banner .banner-swarm').evaluate((banner) => {
      const animation = banner.getAnimations()[0]
      animation.pause()
      const duration = Number(animation.effect!.getComputedTiming().duration)
      const bounds = [0.2, 0.5, 0.8].map((progress) => {
        animation.currentTime = duration * progress
        const title = banner.querySelector('.banner-title')!.getBoundingClientRect()
        return { progress, left: title.left, right: title.right }
      })
      animation.currentTime = duration / 2
      return bounds
    })
    for (const { progress, left, right } of titleBounds) {
      expect(left, `banner at ${progress}`).toBeGreaterThanOrEqual(0)
      expect(right, `banner at ${progress}`).toBeLessThanOrEqual(width)
    }
    await page.screenshot({ path: testInfo.outputPath(`meeting-${width}.png`) })
    await context.close()
  })

  test(`weapon exchange explains each candidate at ${width}px`, async ({ browser }, testInfo) => {
    const context = await browser.newContext({ viewport: { width, height: 844 }, hasTouch: width === 390 })
    const page = await context.newPage()
    await page.goto('/')
    await page.getByRole('button', { name: 'ひとりで生まれる' }).click()
    const handle = await life(page)
    await handle.evaluate((hook) => {
      const player = (hook.game as unknown as Game).state.players[0]
      player.birthPick = false
      player.choices = ['s:w_invest', 's:w_savings', 's:w_gamble', 'x:skip']
      player.choiceSeq++
    })
    const cards = page.locator('#cards .card')
    await expect(cards).toHaveCount(4)
    await expect(cards.nth(0)).toContainText('稲妻で敵を攻撃')
    await expect(cards.nth(1)).toContainText('貯金箱')
    await expect(cards.nth(2)).toContainText('12秒ごとに武器を抽選')
    await expect(cards.nth(3)).toContainText('交換しない')
    expect(await page.locator('#levelup').evaluate((panel) => panel.scrollWidth <= panel.clientWidth)).toBe(true)
    await page.screenshot({ path: testInfo.outputPath(`exchange-descriptions-${width}.png`), animations: 'disabled' })
    await context.close()
  })

  test(`family choices preserve solo cards with keyboard and touch at ${width}px`, async ({ browser }, testInfo) => {
    const context = await browser.newContext({ viewport: { width, height: 844 }, hasTouch: width === 390 })
    const page = await context.newPage()
    await page.goto('/')
    await page.getByRole('button', { name: 'ひとりで生まれる' }).click()
    const handle = await life(page)
    await handle.evaluate(async (hook) => {
      const path = '/src/data.ts'
      const { EVENTS } = await import(path)
      const game = hook.game as unknown as Game
      const player = game.state.players[0]
      player.choices = []
      player.pending = 0
      player.birthPick = false
      player.weapons = [{ id: 'w_love', lv: 2, cd: 100, held: 0, damage: 0 }]
      const wedding = EVENTS.findIndex((event: { boss?: string }) => event.boss === 'b_wedding')
      game.state.eventIndex = wedding
      game.state.time = EVENTS[wedding].at - 0.01
      game.tick(0.01)
      game.state.enemies = []
      const birth = EVENTS.findIndex((event: { swarm?: string }) => event.swarm === 'nightcry')
      game.state.eventIndex = birth
      game.state.time = EVENTS[birth].at - 0.01
      player.pending = 1
      game.tick(0.01)
    })
    await expect(page.locator('#levelup-title')).toHaveText('家族の選択')
    await expect(page.locator('#levelup-note')).toContainText('時間は止まっています')
    const time = await handle.evaluate((hook) => hook.game.state.time)
    await page.waitForTimeout(400)
    expect(await handle.evaluate((hook) => hook.game.state.time)).toBe(time)
    expect(await page.locator('#levelup').evaluate((panel) => panel.scrollWidth <= panel.clientWidth)).toBe(true)
    await page.screenshot({ path: testInfo.outputPath(`solo-family-${width}.png`) })
    if (width === 390) await page.getByRole('button', { name: /迎えない.*本人の回復/ }).tap()
    else await page.keyboard.press('Digit2')
    await expect(page.locator('#levelup-title')).toHaveText('人生の転機')
    await expect(page.locator('#cards .card')).toHaveCount(3)
    await page.waitForTimeout(400)
    if (width === 390) await page.locator('#cards .card').first().tap()
    else await page.keyboard.press('Digit1')
    await expect(page.locator('#levelup')).toBeHidden()
    await expect.poll(() => handle.evaluate((hook) => hook.game.state.time)).toBeGreaterThan(time)
    expect(await handle.evaluate((hook) => (hook.game as unknown as Game).state.players[0].hasChild)).toBe(false)
    await context.close()
  })

  test(`host and guest independently restore exchange cards at ${width}px`, async ({ browser }, testInfo) => {
    const context = await browser.newContext({ viewport: { width, height: 844 }, hasTouch: width === 390 })
    await context.route('**/rabbiters/src/network.ts*', (route) =>
      route.fulfill({ contentType: 'text/javascript', body: fakeNetwork })
    )
    const host = await context.newPage()
    const guest = await context.newPage()
    for (const page of [host, guest]) {
      await page.goto('/')
      await page.locator('#room').fill(`choices-${width}`)
    }
    await host.getByRole('button', { name: 'ルームを作る' }).click()
    await guest.getByRole('button', { name: 'ルームに参加' }).click()
    const handle = await life(host)
    await expect.poll(() => handle.evaluate((hook) => hook.game.state.players.length)).toBe(2)
    await handle.evaluate(async (hook) => {
      const path = '/src/data.ts'
      const { EVENTS } = await import(path)
      const game = hook.game as unknown as Game
      for (const player of game.state.players) {
        player.choices = []
        player.pending = player.swapPending = player.careerPending = 0
        player.birthPick = false
        player.weapons = [{ id: 'w_love', lv: 2, cd: 100, held: 0, damage: 0 }]
      }
      const wedding = EVENTS.findIndex((event: { boss?: string }) => event.boss === 'b_wedding')
      game.state.eventIndex = wedding
      game.state.time = EVENTS[wedding].at - 0.01
      game.tick(0.01)
      game.state.enemies = []
      const birth = EVENTS.findIndex((event: { swarm?: string }) => event.swarm === 'nightcry')
      game.state.eventIndex = birth
      game.state.time = EVENTS[birth].at - 0.02
      for (const player of game.state.players) {
        player.choices = ['s:w_work', 'x:skip']
        game.choose(player, 0)
        player.pending = 2
        player.swapPending = 3
      }
      game.tick(0.021)
    })
    for (const page of [host, guest]) {
      await expect(page.locator('#levelup-title')).toHaveText('家族の選択')
      await expect(page.locator('#levelup-note')).toContainText('時間は流れ続けています')
    }
    const time = await handle.evaluate((hook) => hook.game.state.time)
    await guest.bringToFront()
    await guest.waitForTimeout(400)
    await guest.screenshot({ path: testInfo.outputPath(`coop-family-${width}.png`) })
    if (width === 390) await guest.getByRole('button', { name: /迎える.*本人の回復/ }).tap()
    else await guest.keyboard.press('Digit1')
    await expect(guest.locator('#levelup-note')).toContainText('手放す武器')
    await expect(host.locator('#levelup-title')).toHaveText('家族の選択')
    await expect.poll(() => handle.evaluate((hook) => hook.game.state.time)).toBeGreaterThan(time)
    await host.bringToFront()
    await host.keyboard.press('Digit2')
    await expect(host.locator('#levelup-note')).toContainText('手放す武器')
    const states = await handle.evaluate((hook) =>
      (hook.game as unknown as Game).state.players.map((player) => ({
        hasChild: player.hasChild,
        choices: player.choices,
        pending: player.pending,
        swapPending: player.swapPending
      }))
    )
    expect(states.map((player) => player.hasChild)).toEqual([false, true])
    for (const player of states) {
      expect(player.choices).toEqual(['r:w_love:w_work', 'x:skip'])
      expect([player.pending, player.swapPending]).toEqual([2, 3])
    }
    await guest.screenshot({ path: testInfo.outputPath(`restored-exchange-${width}.png`) })
    await context.close()
  })
}

for (const width of [1280, 390]) {
  for (const [age, name, subtitle] of [
    [23, '成人期', '自分の歩幅で進んで'],
    [35, '壮年期', '日々を重ねて']
  ] as const) {
    for (const [weapon, outcome] of [
      ['', '就職を急がず、自分の道を探す。'],
      ['w_work', '実務を磨き、現場で就職。転機を1回獲得。'],
      ['w_hobby', '好きなことを磨き、創作の道へ。転機を1回獲得。'],
      ['w_sports', '運動を磨き、スポーツの道へ。転機を1回獲得。'],
      ['w_invest', '資産を育て、資産を活かす道へ。転機を1回獲得。']
    ] as const) {
      test(`adult stage stays path-neutral at age ${age}, ${weapon || 'no work'}, ${width}px`, async ({
        page
      }, testInfo) => {
        await page.setViewportSize({ width, height: 844 })
        await page.goto('/')
        await page.getByRole('button', { name: 'ひとりで生まれる' }).click()
        const handle = await life(page)
        const history = await handle.evaluate(
          async (hook, setup) => {
            const dataPath = '/src/data.ts'
            const { EVENTS, timeAtAge } = await import(dataPath)
            const game = hook.game as unknown as Game
            const player = game.state.players[0]
            game.targetPopulation = () => 0
            player.birthPick = false
            player.choices = []
            player.pending = 0
            player.weapons = setup.weapon ? [{ id: setup.weapon, lv: 4, cd: 100, held: 0, damage: 0 }] : []
            if (setup.age === 35) {
              const index = EVENTS.findIndex((event: { boss?: string }) => event.boss === 'b_shukatsu')
              game.state.eventIndex = index
              game.state.time = EVENTS[index].at - 0.01
              game.tick(0.02)
              player.careerPending = 0
              player.choices = []
              game.state.fx = []
            }
            game.state.eventIndex = EVENTS.length
            game.state.enemies = []
            game.state.log = []
            game.state.time = timeAtAge(setup.age) + 0.01
            return player.history.at(-1)?.outcome
          },
          { age, weapon }
        )
        if (age === 35) expect(history).toBe(outcome)
        await expect(page.locator('#stage')).toHaveText(name)
        await expect(page.locator('#announcements')).toHaveText(`${name}、${age}歳`)
        await expect(page.locator('#announcements')).toHaveAttribute('aria-live', 'assertive')
        await expect(page.locator('#banner .banner-title')).toHaveText(name, { timeout: 6000 })
        await expect(page.locator('#banner .banner-meta')).toHaveText(`${age}歳`)
        await expect(page.locator('#banner .banner-sub')).toHaveText(`🧑 ${subtitle}`)
        expect(await page.locator('.hud-top').evaluate((hud) => hud.scrollWidth <= hud.clientWidth)).toBe(true)
        const bannerBounds = await page.locator('#banner .banner-stage').evaluate((banner) => {
          const animation = banner.getAnimations()[0]
          const currentTime = animation.currentTime
          const duration = Number(animation.effect!.getComputedTiming().duration)
          animation.pause()
          const bounds = [0.1, 0.5, 0.9].flatMap((progress) => {
            animation.currentTime = duration * progress
            return Array.from(banner.querySelectorAll('.banner-meta, .banner-title, .banner-sub'), (element) => {
              const rect = element.getBoundingClientRect()
              return { progress, text: element.textContent, left: rect.left, right: rect.right }
            })
          })
          animation.currentTime = currentTime
          animation.play()
          return bounds
        })
        for (const { progress, text, left, right } of bannerBounds) {
          expect(left, `${text} at ${progress}`).toBeGreaterThanOrEqual(0)
          expect(right, `${text} at ${progress}`).toBeLessThanOrEqual(width)
        }
        if (!weapon) await page.screenshot({ path: testInfo.outputPath(`stage-${age}-${width}.png`) })
        await handle.evaluate((hook) => {
          const game = hook.game as unknown as Game
          game.state.players[0].hp = 0
          game.state.phase = 'lost'
        })
        await expect(page.locator('#result-text')).toHaveText(`${name}で力尽きた。`, { timeout: 8000 })
        await expect(page.locator('#result')).toBeVisible()
      })
    }
  }

  test(`youth stage does not assume an education path at ${width}px`, async ({ page }, testInfo) => {
    await page.setViewportSize({ width, height: 844 })
    await page.goto('/')
    await page.getByRole('button', { name: 'ひとりで生まれる' }).click()
    const handle = await life(page)
    await handle.evaluate(async (life) => {
      const dataPath = '/src/data.ts'
      const { EVENTS, timeAtAge } = await import(dataPath)
      const game = life.game as unknown as Game
      const player = game.state.players[0]
      game.targetPopulation = () => 0
      player.birthPick = false
      player.choices = []
      player.pending = 0
      game.state.eventIndex = EVENTS.length
      game.state.enemies = []
      game.state.log = []
      game.state.time = timeAtAge(18) + 0.01
    })
    await expect(page.locator('#stage')).toHaveText('青年期')
    await expect(page.locator('#announcements')).toHaveText('青年期、18歳')
    await expect(page.locator('#banner .banner-title')).toHaveText('青年期', { timeout: 6000 })
    await expect(page.locator('#banner .banner-sub')).toContainText('これからの道を探して')
    await page.screenshot({ path: testInfo.outputPath(`youth-stage-${width}.png`) })
  })
}

for (const width of [1280, 390]) {
  test(`life path help is readable, scrollable and keyboard accessible at ${width}px`, async ({ page }, testInfo) => {
    await page.setViewportSize({ width, height: 844 })
    await page.goto('/')
    await expect(page.locator('#start-panel')).toContainText('A 15-MINUTE LIFE')
    await expect(page.locator('#start-panel')).not.toContainText('30-MINUTE')
    await page.getByRole('button', { name: 'ひとりで生まれる' }).click()
    const handle = await life(page)
    await handle.evaluate((life) => {
      const player = (life.game as unknown as Game).state.players[0]
      player.birthPick = false
      player.choices = []
      player.pending = 0
    })
    const trigger = page.getByRole('button', { name: '遊び方を表示' })
    const dialog = page.getByRole('dialog', { name: '遊び方', exact: true })
    const close = dialog.getByRole('button', { name: '閉じる' })
    const done = dialog.getByRole('button', { name: 'わかった' })
    await trigger.click()
    await expect(dialog).toHaveAttribute('aria-modal', 'true')
    await expect(close).toBeFocused()
    await expect(dialog).toContainText('ソロ：この画面で停止 · 協力：時間は進行')
    await expect(dialog.locator('.help-basics > li')).toHaveCount(3)
    await expect(dialog.locator('.help-basics')).toContainText('WASD')
    await expect(dialog.locator('.help-basics')).toContainText('画面のどこでもスライド')
    await expect(dialog.locator('.help-basics')).toContainText('1〜4')
    await expect(dialog.locator('details[open]')).toHaveCount(0)
    await page.keyboard.press('Tab')
    const talentToggle = dialog.locator('summary').filter({ hasText: '才能と攻撃' })
    await expect(talentToggle).toBeFocused()
    await page.keyboard.press('Enter')
    await expect(dialog.getByRole('img', { name: '秘密の才能の六角形' })).toBeVisible()
    await expect(dialog).toContainText('接触も防ぐ。防御は本人ごとに最短1.5秒間隔で短縮不可。薄い盾は攻撃のみ。')
    await page.keyboard.press('Enter')
    await expect(dialog.getByRole('img', { name: '秘密の才能の六角形' })).toBeHidden()
    const pausedAt = await handle.evaluate((life) => life.game.state.time)
    await page.waitForTimeout(250)
    expect(await handle.evaluate((life) => life.game.state.time)).toBe(pausedAt)
    await page.screenshot({ path: testInfo.outputPath(`help-${width}-top.png`) })
    const conditionToggle = dialog.locator('summary').filter({ hasText: '人生の分岐条件' })
    await conditionToggle.focus()
    await page.keyboard.press('Space')
    const conditions = dialog.locator('details').filter({ hasText: '人生の分岐条件' })
    await expect(conditions).toHaveAttribute('open', '')
    await expect(conditions.getByRole('table')).toHaveCount(2)
    await expect(conditions).toContainText('大学受験')
    await expect(conditions).toContainText('勉強Lv3以上')
    await expect(conditions).toContainText('仕事Lv2以上')
    await expect(conditions).toContainText('いずれかLv4以上')
    await expect(conditions).toContainText('スポーツ / 筋トレ')
    await expect(conditions).toContainText('投資 / 貯金')
    await expect(conditions).toContainText('趣味 / カラオケ / 旅行 / 料理')
    await expect(conditions).toContainText('友人 / SNS / ペット')
    await expect(conditions).toContainText('64歳')
    await expect(conditions).toContainText('仕事・下表の武器Lv4以上で再判定')
    await expect(conditions).toContainText('育成度・進化で決定')
    await expect(conditions).toContainText('結婚イベント時に恋愛Lv2以上')
    await expect(conditions).toContainText('本人の精神力')
    await expect(conditions).toContainText('各１回判定')
    await expect(conditions).toContainText('未選択 ≠ 拒否')
    await expect(conditions).toContainText('ダウン中・毒親の場合は回復なし')
    await expect(conditions).not.toContainText('手応え')
    await expect(conditions).not.toContainText('0.55')
    await expect(conditions).not.toContainText('1.7')
    expect(await page.locator('#help').evaluate((help) => help.scrollWidth <= help.clientWidth)).toBe(true)
    await page.screenshot({ path: testInfo.outputPath(`help-${width}-conditions.png`) })
    await close.focus()
    await page.keyboard.press('Shift+Tab')
    await expect(done).toBeFocused()
    expect(await page.locator('#help').evaluate((help) => help.scrollTop)).toBeGreaterThan(0)
    await page.screenshot({ path: testInfo.outputPath(`help-${width}-bottom.png`) })
    await page.keyboard.press('Tab')
    await expect(close).toBeFocused()
    await close.click()
    await expect(dialog).toBeHidden()
    await expect(trigger).toBeFocused()
    await expect.poll(() => handle.evaluate((life) => life.game.state.time)).toBeGreaterThan(pausedAt)
    await page.keyboard.press('Enter')
    await expect(dialog).toBeVisible()
    await done.click()
    await expect(dialog).toBeHidden()
    await expect(trigger).toBeFocused()
    await page.keyboard.press('Enter')
    await page.keyboard.press('Escape')
    await expect(dialog).toBeHidden()
    await expect(trigger).toBeFocused()
  })
}

for (const viewport of [
  { width: 320, height: 740 },
  { width: 390, height: 844 },
  { width: 844, height: 390 }
]) {
  test(`title gives a compact visual guide at ${viewport.width}x${viewport.height}`, async ({ page }, testInfo) => {
    await page.setViewportSize(viewport)
    await page.goto('/')
    const title = page.locator('#start-panel')
    await expect(title.locator('.intro')).toHaveText('15分、生き抜け。')
    await expect(title.getByRole('list', { name: '人生の流れ' }).getByRole('listitem')).toHaveCount(3)
    await expect(title.getByRole('list', { name: '基本操作' }).getByRole('listitem')).toHaveCount(3)
    await expect(title).toContainText('死や自死を暗示する表現があります')
    await expect(title).toContainText('ルーム名は認証ではありません')
    const start = title.getByRole('button', { name: 'ひとりで生まれる' })
    await start.scrollIntoViewIfNeeded()
    await expect(start).toBeInViewport()
    await expect(title.locator('.content-note')).toBeInViewport()
    expect(await title.evaluate((panel) => panel.scrollWidth <= panel.clientWidth)).toBe(true)
    await page.screenshot({ path: testInfo.outputPath('title-guide.png') })
  })
}

test('reading effects render behind local and co-op players', async ({ page }) => {
  await page.goto('/')
  await page.getByRole('button', { name: 'ひとりで生まれる' }).click()
  await expect.poll(() => page.evaluate(() => Boolean((window as unknown as { __life: Life }).__life.view))).toBe(true)
  const orders = await page.evaluate(async () => {
    const renderPath = '/src/render.ts'
    const dataPath = '/src/data.ts'
    const { Renderer } = await import(renderPath)
    const { WEAPONS } = await import(dataPath)
    const life = (window as unknown as { __life: Life }).__life
    const view = structuredClone(life.view) as unknown as View
    const player = view.players[0]
    view.players.push({ ...structuredClone(player), id: 'guest', x: player.x + 10 })
    view.enemies = []
    view.shots = [
      WEAPONS.findIndex((weapon: { id: string }) => weapon.id === 'w_reading'),
      player.x,
      player.y,
      100,
      0,
      50,
      0,
      0
    ]
    return [false, true].map((evolved) => {
      player.weapons = [['w_reading', evolved ? 8 : 1, 0]]
      player.passives = evolved ? [['p_curious', 1]] : []
      const renderer = new Renderer(document.createElement('canvas'))
      const events: string[] = []
      let layer = ''
      for (const method of ['groundShot', 'topShot']) {
        const original = renderer[method].bind(renderer)
        renderer[method] = (...args: unknown[]) => {
          layer = method
          original(...args)
          layer = ''
        }
      }
      for (const method of ['art', 'centred']) {
        const original = renderer[method].bind(renderer)
        renderer[method] = (...args: unknown[]) => {
          if (layer) events.push(`${layer}:${method}`)
          original(...args)
        }
      }
      const originalPlayer = renderer.player.bind(renderer)
      renderer.player = (...args: unknown[]) => {
        events.push('player')
        originalPlayer(...args)
      }
      renderer.draw(view, life.localId, 0.016, false)
      return events
    })
  })
  for (const events of orders) {
    expect(events).toEqual(['groundShot:art', 'groundShot:centred', 'groundShot:art', 'player', 'player'])
  }
})

test('overprotective parents face their target and only their unavailable shields fade for local and co-op views', async ({
  page
}) => {
  await page.goto('/')
  await page.getByRole('button', { name: 'ひとりで生まれる' }).click()
  await expect.poll(() => page.evaluate(() => Boolean((window as unknown as { __life: Life }).__life.view))).toBe(true)
  const draws = await page.evaluate(async () => {
    const renderPath = '/src/render.ts'
    const dataPath = '/src/data.ts'
    const { Renderer } = await import(renderPath)
    const { WEAPONS } = await import(dataPath)
    const life = (window as unknown as { __life: Life }).__life
    const view = structuredClone(life.view) as unknown as View
    const player = view.players[0]
    view.players.push({ ...structuredClone(player), id: 'guest', x: player.x + 100 })
    view.enemies = []
    const guardian = WEAPONS.findIndex((weapon: { id: string }) => weapon.id === 'p_over')
    view.shots = [
      guardian,
      player.x + 60,
      player.y + 20,
      20,
      314,
      100,
      0,
      0,
      guardian,
      player.x + 40,
      player.y - 20,
      20,
      0,
      100,
      1,
      1
    ]
    const renderer = new Renderer(document.createElement('canvas'))
    const events: { x: number; y: number; alpha: number; flip: boolean }[] = []
    let drawingShot = false
    const topShot = renderer.topShot.bind(renderer)
    renderer.topShot = (...args: unknown[]) => {
      drawingShot = true
      topShot(...args)
      drawingShot = false
    }
    const centred = renderer.centred.bind(renderer)
    renderer.centred = (...args: [unknown, number, number, boolean, number, number, boolean]) => {
      if (drawingShot) events.push({ x: args[1] - player.x, y: args[2] - player.y, alpha: args[4], flip: args[6] })
      centred(...args)
    }
    renderer.draw(view, life.localId, 0.016, false)
    return events
  })
  expect(draws).toEqual([
    { x: 60, y: 20, alpha: 1, flip: true },
    { x: 60, y: 20, alpha: 1, flip: true },
    { x: 40, y: -20, alpha: 1, flip: false },
    { x: 40, y: -20, alpha: 0.45, flip: false }
  ])
})

test('karaoke draws a forward soundwave for local and co-op views', async ({ page }) => {
  await page.goto('/')
  await page.getByRole('button', { name: 'ひとりで生まれる' }).click()
  await expect.poll(() => page.evaluate(() => Boolean((window as unknown as { __life: Life }).__life.view))).toBe(true)
  const arcs = await page.evaluate(async () => {
    const renderPath = '/src/render.ts'
    const dataPath = '/src/data.ts'
    const { Renderer } = await import(renderPath)
    const { WEAPONS } = await import(dataPath)
    const life = (window as unknown as { __life: Life }).__life
    const view = structuredClone(life.view) as unknown as View
    const player = view.players[0]
    view.players.push({ ...structuredClone(player), id: 'guest', x: player.x + 10 })
    view.enemies = []
    const karaoke = WEAPONS.findIndex((weapon: { id: string }) => weapon.id === 'w_karaoke')
    view.shots = [karaoke, player.x, player.y, 100, 100, 50, 0, 0, karaoke, player.x + 10, player.y, 100, 100, 50, 1, 0]
    const canvas = document.createElement('canvas')
    const context = canvas.getContext('2d')!
    const original = context.arc.bind(context)
    const angles: number[][] = []
    context.arc = (x, y, radius, start, end, anticlockwise) => {
      if (radius === 100 || radius === 94) angles.push([start, end])
      original(x, y, radius, start, end, anticlockwise)
    }
    new Renderer(canvas).draw(view, life.localId, 0.016, false)
    return angles
  })
  expect(arcs).toHaveLength(4)
  for (const [start, end] of arcs) {
    expect(start).toBeCloseTo(1 - Math.PI / 3)
    expect(end).toBeCloseTo(1 + Math.PI / 3)
  }
})

test('status dialog lists hand and personalities without synergies and stops solo time', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 })
  await page.goto('/')
  await page.getByRole('button', { name: 'ひとりで生まれる' }).click()
  await expect(page.locator('#connection')).toBeHidden()
  await expect(page.locator('#hud')).not.toContainText('ひとりで')
  const handle = await life(page)
  await handle.evaluate((life) => {
    const player = (life.game as unknown as Game).state.players[0]
    player.birthPick = false
    player.choices = []
    player.pending = 0
    player.weapons = ['w_reading', 'w_invest'].map((id) => ({ id, lv: 1, cd: 100, held: 0, damage: 0 }))
    player.passives = [
      { id: 'p_diligent', lv: 2 },
      { id: 'p_curious', lv: 2 }
    ]
  })
  await expect(page.locator('#weapons .slot')).toHaveCount(2)
  await page.locator('#weapons').click()
  const dialog = page.locator('#status')
  await expect(dialog).toBeVisible()
  await expect(dialog.locator('#status-weapons li')).toHaveCount(2)
  await expect(dialog.locator('#status-passives')).toContainText('勤勉')
  await expect(
    dialog.locator('#status-personality-synergies, #status-synergies, #status-personality-title, #status-synergy-title')
  ).toHaveCount(0)
  await expect(dialog.locator('#status-weapons')).not.toContainText('発動中：')
  const frozen = await handle.evaluate((life) => (life.game as unknown as Game).state.time)
  await page.waitForTimeout(700)
  expect(await handle.evaluate((life) => (life.game as unknown as Game).state.time)).toBe(frozen)
  await page.keyboard.press('Escape')
  await expect(dialog).toBeHidden()
  await expect.poll(() => handle.evaluate((life) => (life.game as unknown as Game).state.time)).toBeGreaterThan(frozen)
  await page.locator('#status-open').click()
  await expect(dialog).toBeVisible()
  await page.locator('#status-done').click()
  await expect(dialog).toBeHidden()
})

test('synergy panels are absent on desktop and mobile', async ({ page }) => {
  await page.goto('/')
  await page.getByRole('button', { name: 'ひとりで生まれる' }).click()
  const handle = await life(page)
  await handle.evaluate((hook) => {
    const player = (hook.game as unknown as Game).state.players[0]
    player.birthPick = false
    player.pending = 0
    player.choices = []
    player.weapons = ['w_reading', 'w_invest'].map((id) => ({ id, lv: 1, cd: 100, held: 0, damage: 0 }))
    player.passives = [{ id: 'p_curious', lv: 1 }]
  })
  for (const width of [1280, 390]) {
    await page.setViewportSize({ width, height: 844 })
    await expect(page.locator('#synergies, #synergy-count, #synergy-list')).toHaveCount(0)
    await expect(page.locator('#weapons')).toBeVisible()
    await expect(page.locator('#passives')).toBeVisible()
  }
})

for (const width of [1280, 390]) {
  test(`downed players retain their own outfits at ${width}px`, async ({ page }, testInfo) => {
    const errors: string[] = []
    page.on('pageerror', (error) => errors.push(error.message))
    await page.setViewportSize({ width, height: 844 })
    await page.goto('/')
    await page.getByRole('button', { name: 'ひとりで生まれる' }).click()
    const handle = await life(page)
    await handle.evaluate(async (hook) => {
      const renderPath = '/src/render.ts'
      const dataPath = '/src/data.ts'
      const { Renderer } = await import(renderPath)
      const { EVENTS, timeAtAge } = await import(dataPath)
      const observed = window as unknown as { deathAppearances: Record<string, string> }
      observed.deathAppearances = {}
      const original = Renderer.prototype.player
      Renderer.prototype.player = function (
        player: { id: string; weapons: [string, number, number][] },
        ...args: unknown[]
      ) {
        original.call(this, player, ...args)
        const death = this.deaths.get(player.id)
        observed.deathAppearances[player.id] = `${death?.body ?? 'alive'}|${player.weapons[0]?.[0] ?? ''}`
      }
      const game = hook.game as unknown as Game
      game.targetPopulation = () => 0
      for (let index = 0; index < 6; index++) game.addPlayer(`outfit-${index}`, 'p_gone')
      game.state.time = timeAtAge(30)
      game.state.eventIndex = EVENTS.length
      game.state.enemies = []
      const locations = [
        [-90, -90],
        [0, -130],
        [90, -90],
        [-90, 90],
        [0, 130],
        [90, 90]
      ]
      const weapons = ['w_sports', 'w_study', 'w_invest', 'w_friend', 'w_love', 'w_hobby']
      game.state.players.forEach((player, index) => {
        player.birthPick = false
        player.pending = 0
        player.choices = []
        player.x = 1000 + (index ? locations[index - 1][0] : 0)
        player.y = 1000 + (index ? locations[index - 1][1] : 0)
        if (!index) return
        player.weapons = [{ id: weapons[index - 1], lv: 4, cd: 100, held: 0, damage: 0 }]
        player.downed = true
        player.hp = 0
        player.killer = 'germ'
      })
    })
    const appearances = () =>
      page.evaluate(() => (window as unknown as { deathAppearances: Record<string, string> }).deathAppearances)
    await expect.poll(appearances).toMatchObject({
      'outfit-0': 'adult:soccer|w_sports',
      'outfit-1': 'adult:bureaucrat|w_study',
      'outfit-2': 'adult:entrepreneur|w_invest',
      'outfit-3': 'adult:social|w_friend',
      'outfit-4': 'adult:romantic|w_love',
      'outfit-5': 'adult:creative|w_hobby'
    })
    await expect(page.locator('#banner')).toBeHidden({ timeout: 6000 })
    await page.screenshot({ path: testInfo.outputPath(`downed-outfits-${width}.png`) })
    await handle.evaluate((hook) => {
      const player = (hook.game as unknown as Game).state.players[1]
      player.weapons = [{ id: 'w_invest', lv: 4, cd: 100, held: 0, damage: 0 }]
    })
    await expect.poll(async () => (await appearances())['outfit-0']).toBe('adult:soccer|w_invest')
    await handle.evaluate((hook) => {
      const player = (hook.game as unknown as Game).state.players[1]
      player.downed = false
      player.hp = 100
    })
    await expect.poll(async () => (await appearances())['outfit-0']).toBe('alive|w_invest')
    await handle.evaluate((hook) => {
      const player = (hook.game as unknown as Game).state.players[1]
      player.downed = true
      player.hp = 0
    })
    await expect.poll(async () => (await appearances())['outfit-0']).toBe('adult:entrepreneur|w_invest')
    expect(errors).toEqual([])
  })

  test(`social romantic and creative styles render independently during play at ${width}px`, async ({
    page
  }, testInfo) => {
    const errors: string[] = []
    page.on('pageerror', (error) => errors.push(error.message))
    await page.setViewportSize({ width, height: 844 })
    await page.goto('/')
    await page.getByRole('button', { name: 'ひとりで生まれる' }).click()
    const handle = await life(page)
    await handle.evaluate((life) => {
      const game = life.game as unknown as Game
      game.targetPopulation = () => 0
      game.addPlayer('style-romantic', 'p_gone')
      game.addPlayer('style-creative', 'p_gone')
      game.state.time = 350
      game.state.eventIndex = 99
      game.state.enemies = []
      game.state.players.forEach((player, index) => {
        player.birthPick = false
        player.pending = 0
        player.choices = []
        player.x = 1000 + index * 55
        player.y = 1000
        player.weapons = [{ id: ['w_friend', 'w_love', 'w_hobby'][index], lv: 4, cd: 100, held: 0, damage: 0 }]
      })
    })
    const styles = () =>
      handle.evaluate(async (life) => {
        const path = '/src/art/careers.ts'
        const { careerFor } = await import(path)
        return (life.view as unknown as View).players.map(careerFor)
      })
    await expect.poll(styles).toEqual(['social', 'romantic', 'creative'])
    await expect(page.locator('#banner')).toBeHidden({ timeout: 6000 })
    await page.keyboard.down('ArrowDown')
    await expect
      .poll(() => handle.evaluate((life) => (life.view as unknown as View).players[0].y))
      .toBeGreaterThan(1020)
    await page.keyboard.up('ArrowDown')
    await page.screenshot({ path: testInfo.outputPath(`new-styles-${width}.png`) })
    await handle.evaluate((life) => {
      const player = (life.game as unknown as Game).state.players[0]
      player.weapons = [{ id: 'w_cooking', lv: 1, cd: 100, held: 0, damage: 0 }]
    })
    await expect.poll(styles).toEqual([undefined, 'romantic', 'creative'])
    await handle.evaluate((life) => {
      ;(life.game as unknown as Game).state.players[0].weapons[0].lv = 4
    })
    await expect.poll(styles).toEqual(['creative', 'romantic', 'creative'])
    expect(errors).toEqual([])
  })
}

test('trained careers render together for local and co-op participants', async ({ page }, testInfo) => {
  await page.goto('/')
  await page.getByRole('button', { name: 'ひとりで生まれる' }).click()
  const handle = await life(page)
  await handle.evaluate((life) => {
    const game = life.game as unknown as {
      state: {
        time: number
        players: {
          x: number
          y: number
          birthPick: boolean
          pending: number
          choices: string[]
          weapons: { id: string; lv: number; cd: number; held: number; damage: number }[]
        }[]
      }
      addPlayer(id: string, parent: string): unknown
    }
    game.addPlayer('career-bureaucrat', 'p_gone')
    game.addPlayer('career-investor', 'p_gone')
    game.state.time = 350
    game.state.players.forEach((player, index) => {
      player.birthPick = false
      player.pending = 0
      player.choices = []
      player.x = 1000 + index * 45
      player.y = 1000
      player.weapons = [{ id: ['w_sports', 'w_study', 'w_invest'][index], lv: 5, cd: 100, held: 0, damage: 0 }]
    })
  })
  await expect.poll(() => handle.evaluate((life) => life.view.players.length)).toBe(3)
  await expect.poll(() => handle.evaluate((life) => life.view.time)).toBeGreaterThan(350)
  await page.screenshot({ path: testInfo.outputPath('careers-desktop.png') })
  await page.setViewportSize({ width: 390, height: 844 })
  await page.screenshot({ path: testInfo.outputPath('careers-mobile.png') })
})

test('turning point cards overlay owned evolution partners', async ({ page }) => {
  await page.goto('/')
  await page.getByRole('button', { name: 'ひとりで生まれる' }).click()
  const handle = await life(page)
  await handle.evaluate((hook) => {
    const player = (hook.game as unknown as Game).state.players[0]
    player.birthPick = false
    player.weapons = [
      { id: 'w_friend', lv: 1, cd: 100, held: 0, damage: 0 },
      { id: 'w_ring', lv: 1, cd: 100, held: 0, damage: 0 }
    ]
    player.passives = [{ id: 'p_kind', lv: 1 }]
    player.choices = ['w:w_friend', 'p:p_kind', 'w:w_sports']
    player.choiceSeq++
  })
  const cards = page.locator('#cards .card')
  await expect(cards.nth(0).locator('.synergy-icons img')).toHaveCount(1)
  await expect(cards.nth(0).locator('.synergy-icons img')).toHaveAttribute('alt', '相性: 友人思い')
  await expect(cards.nth(1).locator('.synergy-icons img')).toHaveCount(2)
  await expect(cards.nth(2).locator('.synergy-icons img')).toHaveCount(0)
  await expect(page.locator('#cards')).not.toContainText('連携条件')
  await expect(cards.nth(0).locator('.synergy-icons img')).toHaveCSS('width', '20px')
})

test('turning point cards show their talent category without revealing talent values', async ({ page }, testInfo) => {
  await page.goto('/')
  await page.getByRole('button', { name: 'ひとりで生まれる' }).click()
  const handle = await life(page)
  await handle.evaluate((l) => {
    const player = l.game.state.players[0] as (typeof l.game.state.players)[number] & {
      choiceSeq: number
      birthPick: boolean
      pending: number
    }
    player.birthPick = false
    player.pending = 0
    player.choices = ['w:w_study', 'p:p_savvy']
    player.choiceSeq++
  })
  await expect(page.locator('#cards .card').nth(0)).toContainText('知性系')
  await expect(page.locator('#cards .card').nth(1)).toContainText('対人系')
  await expect(page.locator('#cards .card').nth(1)).toContainText('基準値')
  expect(await handle.evaluate((l) => l.view.players[0])).not.toHaveProperty('talents')
  await page
    .locator('#cards .card')
    .evaluateAll((cards) =>
      Promise.all(cards.flatMap((card) => card.getAnimations().map((animation) => animation.finished)))
    )
  await page.screenshot({ path: testInfo.outputPath('talent-cards-desktop.png') })
  await page.setViewportSize({ width: 390, height: 844 })
  await page.screenshot({ path: testInfo.outputPath('talent-cards-mobile.png') })
  await page.locator('#cards .card').first().click()
  await page.getByRole('button', { name: '遊び方を表示' }).click()
  await expect(page.locator('#help-close')).toBeFocused()
  await page.locator('#help summary').filter({ hasText: '才能と攻撃' }).click()
  await expect(page.getByRole('img', { name: '秘密の才能の六角形' })).toBeVisible()
  await page.screenshot({ path: testInfo.outputPath('talent-guide-mobile.png') })
})

test('a full weapon hand offers growth before its optional fifth-level swap', async ({ page }) => {
  await page.goto('/')
  await page.getByRole('button', { name: 'ひとりで生まれる' }).click()
  const handle = await life(page)
  await handle.evaluate(async (session) => {
    const dataPath = '/src/data.ts'
    const { EVENTS } = await import(dataPath)
    const game = session.game as unknown as Game
    const player = game.state.players[0]
    game.state.time = 350
    game.state.eventIndex = EVENTS.findIndex((event: { at: number }) => event.at > game.state.time)
    game.state.level = 4
    player.parent = 'p_edu'
    player.birthPick = false
    player.pending = 0
    player.swapPending = 0
    player.careerPending = 0
    player.choices = []
    player.weapons = ['w_friend', 'w_sports', 'w_hobby', 'w_reading', 'w_study', 'w_pet'].map((id) => ({
      id,
      lv: 1,
      cd: 100,
      held: 0,
      damage: 0
    }))
    game.gainXp(game.state.xpNext)
  })
  await expect.poll(() => handle.evaluate((session) => session.view.players[0].choices[0])).toMatch(/^[wp]:/)
  await page.locator('#cards .card').first().click()
  await expect.poll(() => handle.evaluate((session) => session.view.players[0].choices[0])).toMatch(/^s:/)
  await expect(page.locator('#levelup-note')).toContainText('新しい武器')
  await page.getByRole('button', { name: /交換しない/ }).click()
  await expect(page.locator('#levelup')).toBeHidden()
})

test('a full build skips ordinary level-ups and offers an optional weapon swap', async ({ page }) => {
  await page.goto('/')
  await page.getByRole('button', { name: 'ひとりで生まれる' }).click()
  const handle = await life(page)
  await handle.evaluate(async (l) => {
    const dataPath = '/src/data.ts'
    const { EVENTS } = await import(dataPath)
    const game = l.game as unknown as {
      state: {
        time: number
        eventIndex: number
        level: number
        xpNext: number
        players: { choices: string[]; pending: number; birthPick: boolean }[]
      }
      options(player: unknown): string[]
      choose(player: unknown, index: number): void
      gainXp(amount: number): void
    }
    game.state.time = 600
    game.state.eventIndex = EVENTS.findIndex((event: { at: number }) => event.at > game.state.time)
    const player = game.state.players[0]
    player.birthPick = false
    player.pending = 0
    for (let i = 0; i < 200; i++) {
      const option = game.options(player)[0]
      if (!option) break
      player.choices = [option]
      game.choose(player, 0)
    }
    game.state.level = 3
    game.gainXp(game.state.xpNext)
  })
  await expect(page.locator('#levelup')).toBeHidden()
  await handle.evaluate((l) => l.game.gainXp((l.game.state as unknown as { xpNext: number }).xpNext))
  await expect(page.locator('#levelup')).toBeVisible()
  await expect(page.locator('#levelup-note')).toContainText('新しい武器')
  await page.locator('#cards .card').first().click()
  await expect.poll(() => handle.evaluate((l) => l.view.players[0].choices[0])).toMatch(/^r:/)
  await expect(page.locator('#levelup')).toBeVisible()
  await expect(page.locator('#levelup-note')).toContainText('手放す武器')
  await page.getByRole('button', { name: /交換しない/ }).click()
  await expect(page.locator('#levelup')).toBeHidden()
  await expect.poll(() => handle.evaluate((l) => l.game.state.players[0].choices)).toEqual([])
  await expect.poll(() => handle.evaluate((l) => l.view.players[0].choices)).toEqual([])
  await handle.evaluate((l) => {
    const state = l.game.state as unknown as { level: number; xpNext: number }
    state.level = 9
    l.game.gainXp(state.xpNext)
  })
  await expect.poll(() => handle.evaluate((l) => l.view.players[0].choices[0])).toMatch(/^s:/)
  await expect(page.locator('#levelup')).toBeVisible()
  await expect(page.locator('#levelup-note')).toContainText('新しい武器')
  const newWeapon = await handle.evaluate((l) => l.view.players[0].choices[0].split(':')[1])
  await page.locator('#cards .card').first().click()
  await expect.poll(() => handle.evaluate((l) => l.view.players[0].choices[0])).toMatch(/^r:/)
  await expect(page.locator('#levelup')).toBeVisible()
  await expect(page.locator('#levelup-note')).toContainText('手放す武器')
  const oldWeapon = await handle.evaluate((l) => l.view.players[0].choices[0].split(':')[1])
  await page.locator('#cards .card').first().click()
  await expect(page.locator('#levelup')).toBeHidden()
  await expect
    .poll(() => handle.evaluate((l) => (l.view.players[0] as unknown as { weapons: [string, number][] }).weapons))
    .toEqual(expect.arrayContaining([[newWeapon, 1, expect.any(Number)]]))
  expect(
    await handle.evaluate(
      (l, oldId) =>
        (l.view.players[0] as unknown as { weapons: [string, number][] }).weapons.some(([id]) => id === oldId),
      oldWeapon
    )
  ).toBe(false)
})

test('a solo life: birth, a turning point, and the reaper at 15:00', async ({ page }, testInfo) => {
  const errors: string[] = []
  page.on('pageerror', (error) => errors.push(error.message))
  await page.goto('/')
  await expect(page.getByRole('heading', { name: /ジンセイガ・ツライデース/ })).toBeVisible()
  await page.getByRole('button', { name: 'ひとりで生まれる' }).click()
  await expect(page.locator('#hud')).toBeVisible()
  await expect(page.locator('#feed')).toContainText('が生まれた。親は')
  await expect(page.locator('#stage')).toHaveText('乳児期')

  const handle = await life(page)
  // A 蒸発済み parent opens with a birth pick, which stops time; this life starts empty-handed instead.
  await handle.evaluate((l) => {
    for (const p of l.game.state.players) p.choices = []
  })
  await page.keyboard.down('KeyD')
  await expect.poll(() => handle.evaluate((l) => l.view.players[0].x)).toBeGreaterThan(40)
  await page.keyboard.up('KeyD')

  await handle.evaluate((l) => l.game.gainXp(l.game.state.xpNext))
  await expect(page.locator('#levelup')).toBeVisible()
  await expect(page.locator('#cards .card')).toHaveCount(3)
  await page.screenshot({ path: testInfo.outputPath('levelup.png') })
  const paused = await handle.evaluate((l) => l.view.time)
  await page.waitForTimeout(300)
  expect(await handle.evaluate((l) => l.view.time)).toBe(paused)
  await page.keyboard.press('Digit1')
  await expect(page.locator('#levelup')).toBeHidden()
  await expect.poll(() => handle.evaluate((l) => l.view.time)).toBeGreaterThan(paused)

  await handle.evaluate((l) => (l.game.state.time = 60 * 8))
  await page.waitForTimeout(1500)
  await page.screenshot({ path: testInfo.outputPath('midlife.png') })
  await handle.evaluate((l) => {
    l.game.state.time = 15 * 60 - 0.5
    for (const p of l.game.state.players) p.choices = []
    const player = (l.game as unknown as Game).state.players[0]
    player.weapons = [{ id: 'w_invest', lv: 8, cd: 100, held: 0, damage: 123 }]
    player.passives = [{ id: 'p_greedy', lv: 1 }]
    player.talents.friend = 1.7
    const game = l.game as unknown as Game
    game.tick(0.01)
    for (const participant of game.state.players) {
      participant.choices = []
      participant.pending = 0
      participant.careerPending = 0
      participant.swapPending = 0
    }
  })
  await expect(page.locator('#feed')).toContainText('死神', { timeout: 5000 })
  await page.screenshot({ path: testInfo.outputPath('reaper.png') })
  await expect(page.getByRole('heading', { name: /大往生 — 享年80歳/ })).toBeVisible({ timeout: 8000 })
  await expect(page.locator('#result-talent-values')).toContainText('対人 ×1.70')
  await expect(page.locator('#result-radar')).toHaveAttribute('points', /^150\.0,30\.0 /)
  await expect(page.locator('#result-build')).toContainText('複利の魔法 Lv8')
  await expect(page.locator('#result-build')).toContainText('がめつい Lv1')
  await expect(page.locator('#result-talent-values')).toContainText('資産 ×')
  await expect(page.locator('#result-talent-values')).toContainText('武器1・性格1')
  const assetHeading = page.locator('#result-build h4', { hasText: '資産：武器 1・性格 1' })
  await expect(assetHeading).toBeVisible()
  await expect(assetHeading.locator('xpath=following-sibling::div[1]')).toContainText('複利の魔法 Lv8')
  await expect(assetHeading.locator('xpath=following-sibling::div[2]')).toContainText('がめつい Lv1')
  await expect(page.locator('#result-build h4', { hasText: '恋愛：武器 0・性格 0' })).toBeVisible()
  await page.screenshot({ path: testInfo.outputPath('result.png') })
  await page.setViewportSize({ width: 390, height: 844 })
  await page.locator('#result').evaluate((result) => (result.scrollTop = 0))
  await expect(page.locator('#result')).toHaveJSProperty('scrollLeft', 0)
  await page.screenshot({ path: testInfo.outputPath('result-mobile.png') })
  await page.getByRole('button', { name: 'もう一度生まれる' }).click()
  await expect(page.getByRole('button', { name: 'ひとりで生まれる' })).toBeVisible()
  expect(errors).toEqual([])
})

test('蒸発済み starts with a free early talent pick and then plays on', async ({ page }) => {
  const errors: string[] = []
  page.on('pageerror', (error) => errors.push(error.message))
  await page.addInitScript(() => {
    Date.now = () => 39
  })
  await page.goto('/')
  await page.getByRole('button', { name: 'ひとりで生まれる' }).click()
  await expect(page.locator('#hud')).toBeVisible()
  const handle = await life(page)
  expect(await handle.evaluate((l) => (l.game as unknown as Game).state.players[0].parent)).toBe('p_gone')
  await expect(page.locator('#weapons > *')).toHaveCount(0)
  await expect(page.locator('#levelup')).toBeVisible()
  await expect(page.locator('#cards .card')).toHaveCount(3)
  await expect(page.locator('#levelup-note')).toContainText('自分の力で生きていく')
  await page.keyboard.press('Digit1')
  await expect(page.locator('#levelup')).toBeHidden()
  await expect
    .poll(() => handle.evaluate((l) => (l.view as unknown as { kills: number }).kills), { timeout: 20000 })
    .toBeGreaterThan(0)
  await expect(page.locator('#weapons > *')).not.toHaveCount(0)
  expect(errors).toEqual([])
})

test('ヤンキー親 storms out, flying-kicks the nearest enemy and swaggers home', async ({ page }, testInfo) => {
  const errors: string[] = []
  page.on('pageerror', (error) => errors.push(error.message))
  await page.goto('/')
  await page.getByRole('button', { name: 'ひとりで生まれる' }).click()
  await expect(page.locator('#hud')).toBeVisible()
  const handle = await life(page)
  await handle.evaluate((l) => {
    const game = l.game as unknown as Game
    game.removePlayer(l.localId)
    const player = game.addPlayer(l.localId, 'p_yankee')!
    // Time stands still: the test steps the raid itself while the page keeps drawing it.
    game.step = () => {}
    game.state.enemies.length = 0
    const bully = game.spawnEnemy('bully', player.x + 120, player.y)!
    bully.hp = bully.maxHp = 1e9
  })
  /** Steps until the raid has lived `share` of its life, holding the bully still; how far out it is then. */
  const raidAt = (share: number) =>
    handle.evaluate((l, share) => {
      const game = l.game as unknown as Game
      const player = game.state.players[0]
      const bully = game.state.enemies[0]
      for (let i = 0; i < 600; i++) {
        const raid = game.state.shots.find((shot) => shot.weapon === 'p_yankee')
        if (raid && 1 - raid.life / raid.maxLife >= share) return Math.hypot(raid.x - player.x, raid.y - player.y)
        bully.x = player.x + 120
        bully.y = player.y
        bully.kx = bully.ky = 0
        player.hp = player.maxHp
        game.tick(1 / 60)
      }
      return -1
    }, share)
  expect(await raidAt(0.15)).toBeGreaterThan(10)
  await page.screenshot({ path: testInfo.outputPath('yankee-run.png') })
  const kick = await raidAt(0.4)
  expect(kick).toBeGreaterThan(90)
  await page.screenshot({ path: testInfo.outputPath('yankee-kick.png') })
  expect(await handle.evaluate((l) => (l.game as unknown as Game).state.enemies[0].hp)).toBeLessThan(1e9)
  const home = await raidAt(0.8)
  expect(home).toBeGreaterThan(0)
  expect(home).toBeLessThan(kick)
  await page.screenshot({ path: testInfo.outputPath('yankee-home.png') })
  expect(errors).toEqual([])
})

test('a broken heart: the death plays out before the result, which names the final blow', async ({ page }) => {
  const errors: string[] = []
  page.on('pageerror', (error) => errors.push(error.message))
  await page.goto('/')
  await expect(page.getByText('死や自死を暗示する表現があります')).toBeVisible()
  await page.getByRole('button', { name: 'ひとりで生まれる' }).click()
  await expect(page.locator('#hud')).toBeVisible()
  const handle = await life(page)
  await handle.evaluate((l) => {
    const game = l.game as unknown as {
      state: { time: number; players: { x: number; y: number; hp: number; weapons: unknown[] }[] }
      spawnEnemy(kind: string, x: number, y: number): void
    }
    const p = game.state.players[0]
    ;(p as unknown as { choices: string[] }).choices = [] // no 蒸発済み birth pick holding time
    game.state.time = 900 * (25 / 80) ** (1 / 1.4)
    p.weapons = []
    p.hp = 0.01
    game.spawnEnemy('intimidating_boss', p.x, p.y)
  })
  await expect.poll(() => handle.evaluate((l) => l.view.phase)).toBe('lost')
  await page.waitForTimeout(1000)
  await expect(page.locator('#result')).toBeHidden()
  await expect(page.getByRole('heading', { name: /心が折れた — 享年25歳/ })).toBeVisible({ timeout: 6000 })
  await expect(page.locator('#result-text')).toContainText('とどめ：威圧的な上司（人間関係）')
  expect(errors).toEqual([])
})

// Replaces the relay with a BroadcastChannel so two real pages play a host/guest session.
const fakeNetwork = `
export const MAX_PAYLOAD_BYTES = 65536;
export class CooperativeNetwork {
  constructor(options) { this.options = options; this.playerId = options.playerId; }
  async start() {
    const o = this.options;
    this.channel = new BroadcastChannel(JSON.stringify(['anon', o.app ?? 'rabbiters-v1', o.room]));
    this.channel.onmessage = ({ data }) => {
      if (o.role === 'host' && data.type === 'hello') { this.players.add(data.id); o.onPresence([...this.players]); }
      if (o.role === 'host' && data.type === 'input') o.onInput(data.id, data.input);
      if (o.role === 'guest' && data.type === 'snapshot') o.onSnapshot(data.state);
    };
    this.players = new Set([this.playerId]);
    if (o.role === 'guest') this.channel.postMessage({ type: 'hello', id: this.playerId });
    o.onStatus('ready', 'ok');
  }
  async sendInput(input) { this.channel.postMessage({ type: 'input', id: this.playerId, input }); }
  async broadcastSnapshot(state) { this.channel.postMessage({ type: 'snapshot', state }); }
  async stop() { this.channel?.close(); }
}`

test('a guest sees the host gambling animation and copied attack', async ({ context }) => {
  await context.route('**/rabbiters/src/network.ts*', (route) =>
    route.fulfill({ contentType: 'text/javascript', body: fakeNetwork })
  )
  await context.addInitScript(() => {
    const labels: string[] = []
    Object.assign(window, { gambleLabels: labels })
    const fillText = CanvasRenderingContext2D.prototype.fillText
    CanvasRenderingContext2D.prototype.fillText = function (text, x, y, maxWidth) {
      if (text === '大当たり！' || (text === '🍳 料理' && this.font === 'bold 20px sans-serif')) labels.push(text)
      if (maxWidth === undefined) fillText.call(this, text, x, y)
      else fillText.call(this, text, x, y, maxWidth)
    }
  })
  const host = await context.newPage()
  const guest = await context.newPage()
  for (const page of [host, guest]) {
    await page.goto('/')
    await page.locator('#room').fill('gamble-animation')
  }
  await host.getByRole('button', { name: 'ルームを作る' }).click()
  await guest.getByRole('button', { name: 'ルームに参加' }).click()
  const hostLife = await life(host)
  const guestLife = await life(guest)
  await expect.poll(() => guestLife.evaluate((hook) => hook.view?.players.length ?? 0)).toBe(2)
  await hostLife.evaluate(async (hook) => {
    const path = '/src/data.ts'
    const { EVENTS, timeAtAge } = await import(path)
    const game = hook.game as unknown as Game
    game.targetPopulation = () => 0
    game.state.time = timeAtAge(23) + 0.01
    game.state.eventIndex = EVENTS.length
    game.state.enemies = []
    game.state.shots = []
    game.state.fx = []
    for (const player of game.state.players) {
      player.choices = []
      player.pending = 0
      player.birthPick = false
      player.weapons = []
    }
    game.state.players[0].weapons = [{ id: 'w_gamble', lv: 1, cd: 0, held: 0, damage: 0 }]
    Object.defineProperty(game, 'rng', { value: () => 0.9999, configurable: true })
    game['fireWeapons'](0)
  })
  await expect
    .poll(() =>
      guestLife.evaluate((hook) =>
        (hook.view as unknown as View).shots.some((value, index) => index % 8 === 7 && value >= 64)
      )
    )
    .toBe(true)
  await expect
    .poll(() =>
      guest.evaluate(() => (window as unknown as { gambleLabels: string[] }).gambleLabels.includes('大当たり！'))
    )
    .toBe(true)
  await expect
    .poll(() =>
      guest.evaluate(() => (window as unknown as { gambleLabels: string[] }).gambleLabels.includes('🍳 料理'))
    )
    .toBe(true)
})

test('current and legacy rooms remain separated while current guests receive snapshots', async ({ context }) => {
  await context.addInitScript(() => {
    const Channel = window.BroadcastChannel
    const channels: string[] = []
    ;(window as unknown as { lifeChannels: string[] }).lifeChannels = channels
    window.BroadcastChannel = class extends Channel {
      constructor(name: string) {
        super(name)
        channels.push(name)
      }
    }
  })
  await context.route('**/rabbiters/src/network.ts*', (route) =>
    route.fulfill({ contentType: 'text/javascript', body: fakeNetwork })
  )
  const host = await context.newPage()
  const guest = await context.newPage()
  const legacy = await context.newPage()
  for (const page of [host, guest, legacy]) await page.goto('/')
  for (const page of [host, guest]) await page.locator('#room').fill('version-isolation')
  await host.getByRole('button', { name: 'ルームを作る' }).click()
  await expect(host.locator('#hud')).toBeVisible()
  await legacy.evaluate(async (source) => {
    const url = URL.createObjectURL(new Blob([source], { type: 'text/javascript' }))
    const { CooperativeNetwork } = await import(url)
    const network = new CooperativeNetwork({
      app: 'life-survivors-v14',
      room: 'version-isolation',
      role: 'guest',
      playerId: 'legacy-player',
      onSnapshot() {},
      onStatus() {}
    })
    await network.start()
    ;(window as unknown as { legacyNetwork: unknown }).legacyNetwork = network
    URL.revokeObjectURL(url)
  }, fakeNetwork)
  await guest.getByRole('button', { name: 'ルームに参加' }).click()
  const hostLife = await life(host)
  const guestLife = await life(guest)
  await expect.poll(() => guestLife.evaluate((hook) => hook.view?.players.length ?? 0)).toBe(2)
  expect(await hostLife.evaluate((hook) => hook.game.state.players.map((player) => player.id))).not.toContain(
    'legacy-player'
  )
  const channels = (page: Page) => page.evaluate(() => (window as unknown as { lifeChannels: string[] }).lifeChannels)
  expect(await channels(host)).toEqual([JSON.stringify(['anon', 'life-survivors-v15', 'version-isolation'])])
  expect(await channels(guest)).toEqual([JSON.stringify(['anon', 'life-survivors-v15', 'version-isolation'])])
  expect(await channels(legacy)).toEqual([JSON.stringify(['anon', 'life-survivors-v14', 'version-isolation'])])
})

test('co-op status screens stop the host clock for everyone and release it', async ({ context }) => {
  await context.route('**/rabbiters/src/network.ts*', (route) =>
    route.fulfill({ contentType: 'text/javascript', body: fakeNetwork })
  )
  const host = await context.newPage()
  const guest = await context.newPage()
  const spectator = await context.newPage()
  const errors: string[] = []
  for (const page of [host, guest]) page.on('pageerror', (error) => errors.push(error.message))
  for (const page of [host, guest, spectator]) {
    await page.goto('/')
    await page.locator('#room').fill('pause-room')
  }
  await host.getByRole('button', { name: 'ルームを作る' }).click()
  await expect(host.locator('#hud')).toBeVisible()
  await guest.getByRole('button', { name: 'ルームに参加' }).click()
  await expect(guest.locator('#hud')).toBeVisible()
  const hostLife = await life(host)
  const guestLife = await life(guest)
  await expect.poll(() => hostLife.evaluate((l) => l.game.state.players.length)).toBe(2)
  await hostLife.evaluate((l) => {
    for (const p of l.game.state.players as unknown as { choices: string[]; birthPick: boolean; pending: number }[]) {
      p.choices = []
      p.birthPick = false
      p.pending = 0
    }
  })
  await expect.poll(() => guestLife.evaluate((hook) => hook.view?.players.length ?? 0)).toBe(2)
  const guestId = await guestLife.evaluate((l) => l.localId)
  const time = () => hostLife.evaluate((l) => l.game.state.time)
  const frozen = async (page: Page) => {
    await page.bringToFront()
    const before = await time()
    await page.waitForTimeout(800)
    return (await time()) === before
  }

  await guest.bringToFront()
  await guest.locator('#status-open').click()
  await expect(guest.locator('#status')).toBeVisible()
  await expect(guest.locator('#status-note')).toContainText('みんなの時間が止まります')
  await expect(host.locator('#pause-banner')).toBeVisible()
  await expect(host.locator('#pause-banner')).toContainText('時間停止中')
  await expect.poll(() => frozen(guest)).toBe(true)
  expect(await hostLife.evaluate((l) => l.view?.paused)).toEqual([guestId])

  await spectator.evaluate(() => {
    const channel = new BroadcastChannel(JSON.stringify(['anon', 'life-survivors-v15', 'pause-room']))
    channel.postMessage({ type: 'input', id: 'ghost', input: { x: 0, y: 0, pick: -1, pickSeq: -1, pause: true } })
  })
  expect(await hostLife.evaluate((l) => l.view?.paused)).toEqual([guestId])

  await host.locator('#status-open').click()
  await expect.poll(() => hostLife.evaluate((l) => l.view?.paused?.length)).toBe(2)
  await guest.locator('#status-done').click()
  await expect(guest.locator('#status')).toBeHidden()
  await expect.poll(() => hostLife.evaluate((l) => l.view?.paused?.length)).toBe(1)
  await expect.poll(() => frozen(host)).toBe(true)
  await host.keyboard.press('Escape')
  await expect(host.locator('#pause-banner')).toBeHidden()
  const resumed = await time()
  await expect.poll(time).toBeGreaterThan(resumed)

  await host.bringToFront()
  await host.locator('#status-open').click()
  await expect(guest.locator('#pause-banner')).toBeVisible()
  await expect.poll(() => frozen(host)).toBe(true)
  await host.keyboard.press('Escape')
  await expect(guest.locator('#pause-banner')).toBeHidden()
  const again = await time()
  await expect.poll(time).toBeGreaterThan(again)

  await guest.bringToFront()
  await guest.locator('#status-open').click()
  await expect(host.locator('#pause-banner')).toBeVisible()
  await guest.close()
  const stuck = await time()
  await expect.poll(time, { timeout: 5000 }).toBeGreaterThan(stuck)
  await expect(host.locator('#pause-banner')).toBeHidden()
  expect(errors).toEqual([])
})

test('two players share one life-world: the guest moves and gets their own hand', async ({ context }, testInfo) => {
  await context.route('**/rabbiters/src/network.ts*', (route) =>
    route.fulfill({ contentType: 'text/javascript', body: fakeNetwork })
  )
  const host = await context.newPage()
  const guest = await context.newPage()
  const errors: string[] = []
  for (const page of [host, guest]) page.on('pageerror', (error) => errors.push(error.message))
  for (const page of [host, guest]) {
    await page.goto('/')
    await page.locator('#room').fill('e2e-room')
  }
  await host.getByRole('button', { name: 'ルームを作る' }).click()
  await expect(host.locator('#hud')).toBeVisible()
  await guest.getByRole('button', { name: 'ルームに参加' }).click()
  await expect(guest.locator('#hud')).toBeVisible()
  const hostLife = await life(host)
  await expect.poll(() => hostLife.evaluate((l) => l.game.state.players.length)).toBe(2)
  // No 蒸発済み birth pick in the way: its note would replace the co-op one.
  await hostLife.evaluate((l) => {
    for (const p of l.game.state.players as unknown as { parent: string; choices: string[] }[]) {
      if (p.parent === 'p_gone') p.parent = 'p_free'
      p.choices = []
    }
  })
  const guestLife = await life(guest)
  const guestId = await guestLife.evaluate((l) => l.localId)
  await expect.poll(() => guestLife.evaluate((l) => l.view?.players.length ?? 0)).toBe(2)
  await expect(guest.locator('#team li')).toHaveCount(2)

  await host.bringToFront()
  await host.getByRole('button', { name: '遊び方を表示' }).click()
  const helpTime = await hostLife.evaluate((l) => l.game.state.time)
  await expect.poll(() => hostLife.evaluate((l) => l.game.state.time)).toBeGreaterThan(helpTime)
  await host.getByRole('dialog', { name: '遊び方', exact: true }).getByRole('button', { name: '閉じる' }).click()

  const start = await hostLife.evaluate((l, id) => l.game.state.players.find((p) => p.id === id)!.x, guestId)
  await guest.bringToFront()
  await guest.keyboard.down('KeyD')
  await expect
    .poll(() => hostLife.evaluate((l, id) => l.game.state.players.find((p) => p.id === id)!.x, guestId))
    .toBeGreaterThan(start + 30)
  await guest.keyboard.up('KeyD')

  await hostLife.evaluate((l) => l.game.gainXp(l.game.state.xpNext))
  await expect(guest.locator('#cards .card')).toHaveCount(3)
  await expect(guest.locator('#levelup-note')).toContainText('時間は流れ続けています')
  await guest.screenshot({ path: testInfo.outputPath('guest.png') })
  await guest.locator('#cards .card').first().click()
  await expect
    .poll(() => hostLife.evaluate((l, id) => l.game.state.players.find((p) => p.id === id)!.choices.length, guestId))
    .toBe(0)
  await expect(guest.locator('#levelup')).toBeHidden()
  await hostLife.evaluate((hook, id) => {
    const game = hook.game as unknown as Game
    for (const player of game.state.players) {
      const ids = player.id === id ? ['w_invest', 'w_friend'] : ['w_hobby']
      player.weapons = ids.map((weapon) => ({ id: weapon, lv: 1, cd: 100, held: 0, damage: 0 }))
    }
  }, guestId)
  expect(
    await guestLife.evaluate((hook, id) => hook.view.players.find((player) => player.id === id), guestId)
  ).not.toHaveProperty('talents')
  await hostLife.evaluate((hook, id) => {
    const game = hook.game as unknown as Game
    const player = game.state.players.find((player) => player.id === id)!
    player.choices = ['r:w_invest:w_sports']
    game.choose(player, 0)
  }, guestId)
  expect(errors).toEqual([])
})

test('parent farewell synchronizes death, inheritance, HUD and animation for host and guest', async ({
  context
}, testInfo) => {
  await context.route('**/rabbiters/src/network.ts*', (route) =>
    route.fulfill({ contentType: 'text/javascript', body: fakeNetwork })
  )
  const host = await context.newPage()
  const guest = await context.newPage()
  const errors: string[] = []
  for (const page of [host, guest]) {
    page.on('pageerror', (error) => errors.push(error.message))
    await page.goto('/')
    await page.locator('#room').fill('parent-farewell')
  }
  await host.getByRole('button', { name: 'ルームを作る' }).click()
  await guest.getByRole('button', { name: 'ルームに参加' }).click()
  const hostLife = await life(host)
  const guestLife = await life(guest)
  await expect.poll(() => guestLife.evaluate((hook) => hook.view?.players.length ?? 0)).toBe(2)
  for (const page of [host, guest])
    await page.evaluate(() => {
      const messages: string[] = []
      ;(window as unknown as { farewellAnnouncements: string[] }).farewellAnnouncements = messages
      new MutationObserver((records) => {
        for (const record of records) {
          for (const node of record.addedNodes) messages.push(node.textContent ?? '')
          if (record.type === 'characterData') messages.push(record.oldValue ?? '', record.target.textContent ?? '')
        }
      }).observe(document.querySelector('#announcements')!, {
        childList: true,
        subtree: true,
        characterData: true,
        characterDataOldValue: true
      })
    })
  await hostLife.evaluate(async (hook) => {
    const path = '/src/data.ts'
    const { EVENTS, MAX_WEAPON_LEVEL } = await import(path)
    const game = hook.game as unknown as Game
    game.targetPopulation = () => 0
    game.state.players.forEach((player, index) => {
      player.parent = index ? 'p_toxic' : 'p_over'
      player.weapons = [{ id: player.parent, lv: MAX_WEAPON_LEVEL, cd: 100, held: 0, damage: 0 }]
      player.passives = []
      player.birthPick = false
      player.pending = player.swapPending = player.careerPending = 0
      player.choices = []
    })
    game.state.enemies = []
    const care = EVENTS.findIndex((event: { boss?: string }) => event.boss === 'b_care')
    game.state.eventIndex = care
    game.state.time = EVENTS[care].at - 0.01
    game.tick(0.02)
  })
  await expect(host.locator('#weapons .parent')).toHaveCount(0)
  await expect(guest.locator('#weapons .parent')).toHaveCount(0)
  await expect(host.locator('#passives .inherited')).toHaveAttribute('title', '愛情（親の看取りで継承）')
  await expect(guest.locator('#passives .inherited')).toHaveAttribute('title', '包容力（親の看取りで継承）')
  for (const page of [host, guest]) {
    await expect(page.locator('.banner-farewell')).toContainText('親とのお別れ')
    await expect
      .poll(() =>
        page.evaluate(() =>
          (window as unknown as { farewellAnnouncements: string[] }).farewellAnnouncements.some(
            (message) => message.includes('看取り') && message.includes('継承')
          )
        )
      )
      .toBe(true)
  }
  const current = await guestLife.evaluate((hook) => hook.view as unknown as View)
  expect(current.players.every((player) => player.parentDeath?.reward === 'passive')).toBe(true)
  expect(current.players.every((player) => !player.weapons.some(([id]) => id === player.parent))).toBe(true)
  expect(current.time - current.players[0].parentDeath!.at).toBeLessThan(6)
  await testInfo.attach('parent-farewell-host', { body: await host.screenshot(), contentType: 'image/png' })
  await testInfo.attach('parent-farewell-guest', { body: await guest.screenshot(), contentType: 'image/png' })
  expect(errors).toEqual([])
})

for (const reward of ['none', 'choice'] as const) {
  test(`parent farewell survives missing FX with reward ${reward}`, async ({ page }) => {
    await page.goto('/')
    await page.getByRole('button', { name: 'ひとりで生まれる' }).click()
    const handle = await life(page)
    await handle.evaluate(async (hook, reward) => {
      const path = '/src/data.ts'
      const { EVENTS, MAX_WEAPON_LEVEL, PARENT_LEGACIES } = await import(path)
      const game = hook.game as unknown as Game
      game.targetPopulation = () => 0
      const player = game.state.players[0]
      player.parent = 'p_over'
      player.weapons = [
        { id: player.parent, lv: reward === 'none' ? 1 : MAX_WEAPON_LEVEL, cd: 100, held: 0, damage: 0 }
      ]
      player.passives = reward === 'choice' ? [{ id: PARENT_LEGACIES[player.parent], lv: 5 }] : []
      player.birthPick = false
      player.pending = player.swapPending = player.careerPending = 0
      player.choices = []
      game.state.enemies = []
      const care = EVENTS.findIndex((event: { boss?: string }) => event.boss === 'b_care')
      game.state.eventIndex = care
      game.state.time = EVENTS[care].at - 0.01
      game.tick(0.02)
      game.state.fx = []
    }, reward)
    await expect(page.locator('.banner-farewell .banner-sub')).toHaveText(
      reward === 'choice' ? '成長の選択 +1' : '親の武器を手放した'
    )
    await expect(page.locator('#announcements')).toContainText('を看取り、親の武器を手放した。')
    await expect(page.locator('#announcements')).toContainText(
      reward === 'choice' ? '成長の選択を1回獲得' : '性格の継承はなかった'
    )
  })
}

for (const viewport of [
  { width: 320, height: 568 },
  { width: 390, height: 844 },
  { width: 320, height: 500 },
  { width: 320, height: 501 },
  { width: 390, height: 501 },
  { width: 640, height: 501 },
  { width: 320, height: 320 },
  { width: 400, height: 320 },
  { width: 480, height: 320 },
  { width: 540, height: 320 },
  { width: 568, height: 320 },
  { width: 640, height: 568 },
  { width: 641, height: 568 },
  { width: 844, height: 390 },
  { width: 1280, height: 720 }
]) {
  test(`parent farewell stays visible throughout its animation at ${viewport.width}x${viewport.height}`, async ({
    page
  }, testInfo) => {
    await page.setViewportSize(viewport)
    await page.addInitScript(() => {
      const frames: number[] = []
      ;(window as unknown as { farewellAlphas: number[] }).farewellAlphas = frames
      const labels = new WeakSet<HTMLCanvasElement>()
      const original = CanvasRenderingContext2D.prototype.fillText
      CanvasRenderingContext2D.prototype.fillText = function (text, x, y, maxWidth) {
        if (text.includes('継承！')) labels.add(this.canvas)
        original.call(this, text, x, y, maxWidth)
      }
      const drawImage = CanvasRenderingContext2D.prototype.drawImage
      CanvasRenderingContext2D.prototype.drawImage = function (...args: unknown[]) {
        if (labels.has(args[0] as HTMLCanvasElement)) frames.push(this.globalAlpha)
        Reflect.apply(drawImage, this, args)
      }
    })
    const errors: string[] = []
    page.on('pageerror', (error) => errors.push(error.message))
    await page.goto('/')
    await page.getByRole('button', { name: 'ひとりで生まれる' }).click()
    const handle = await life(page)
    await expect(page.locator('.banner-stage')).toBeVisible()
    await expect(page.locator('.banner-stage')).toHaveCSS('animation-name', 'stage-slide')
    await expect(page.locator('.banner-stage')).toHaveCSS('display', 'grid')
    await expect(page.locator('.banner-stage')).toBeHidden()
    await handle.evaluate(async (hook) => {
      const path = '/src/data.ts'
      const { EVENTS, MAX_WEAPON_LEVEL } = await import(path)
      const game = hook.game as unknown as Game
      game.targetPopulation = () => 0
      const player = game.state.players[0]
      player.parent = 'p_over'
      player.weapons = [player.parent, 'w_friend', 'w_sports', 'w_study', 'w_love', 'w_beauty', 'w_hobby'].map(
        (id) => ({ id, lv: MAX_WEAPON_LEVEL, cd: 100, held: 0, damage: 0 })
      )
      player.passives = ['p_diligent', 'p_stubborn', 'p_hot', 'p_kind', 'p_bold', 'p_healthy'].map((id) => ({
        id,
        lv: 1
      }))
      player.birthPick = false
      player.pending = player.swapPending = player.careerPending = 0
      player.choices = []
      game.state.enemies = []
      const care = EVENTS.findIndex((event: { boss?: string }) => event.boss === 'b_care')
      game.state.eventIndex = care
      game.state.time = EVENTS[care].at - 0.01
      game.tick(0.02)
    })
    const banner = page.locator('.banner-farewell')
    await expect(banner).toContainText('愛情')
    await expect(banner.locator('.banner-sub')).toHaveText('「愛情」を継承')
    const warning = page.locator('.banner-care')
    await expect(warning).toContainText('WARNING', { timeout: 500 })
    await expect(warning).toContainText('親の介護')
    await warning.locator('.banner-sub').evaluate((subtitle) => {
      subtitle.style.maxWidth = '100px'
    })
    await expect(page.locator('#weapons .slot')).toHaveCount(6)
    await expect(page.locator('#passives .slot')).toHaveCount(7)
    await expect(page.locator('#boss-bar')).toBeVisible()
    const inspect = async (selector: string, duration: number) =>
      page.evaluate(
        async ({ selector, duration }) => {
          const active = document.querySelector<HTMLElement>(selector)!
          const farewell = document.querySelector<HTMLElement>('.banner-farewell')!
          const activeAnimation = active.getAnimations()[0]
          const farewellAnimation = farewell.getAnimations()[0]
          if (!activeAnimation || !farewellAnimation) throw new Error('バナーのアニメーションがありません')
          activeAnimation.pause()
          farewellAnimation.pause()
          const positions = []
          for (const fraction of [0, 0.08, 0.12, 0.2, 0.5, 0.82, 0.88, 0.98]) {
            activeAnimation.currentTime = duration * fraction
            farewellAnimation.currentTime = 4500 * fraction
            await new Promise(requestAnimationFrame)
            const rect = (element: Element) => {
              const bounds = element.getBoundingClientRect()
              return { left: bounds.left, right: bounds.right, top: bounds.top, bottom: bounds.bottom }
            }
            positions.push({
              active: rect(active),
              farewell: rect(farewell),
              weapons: rect(document.querySelector('#weapons')!),
              passives: rect(document.querySelector('#passives')!)
            })
          }
          farewellAnimation.currentTime = 2000
          activeAnimation.currentTime = duration / 2
          await new Promise(requestAnimationFrame)
          return positions
        },
        { selector, duration }
      )
    const separated = (left: { left: number; right: number; top: number; bottom: number }, right: typeof left) =>
      left.right <= right.left || right.right <= left.left || left.bottom <= right.top || right.bottom <= left.top
    const checkBounds = (positions: Awaited<ReturnType<typeof inspect>>) => {
      for (const position of positions) {
        for (const rect of [position.active, position.farewell]) {
          expect(rect.left).toBeGreaterThanOrEqual(-0.5)
          expect(rect.right).toBeLessThanOrEqual(viewport.width + 0.5)
          expect(rect.top).toBeGreaterThanOrEqual(-0.5)
          expect(rect.bottom).toBeLessThanOrEqual(viewport.height + 0.5)
          expect(separated(rect, position.weapons), JSON.stringify(position)).toBe(true)
          expect(separated(rect, position.passives), JSON.stringify(position)).toBe(true)
        }
        for (const other of positions)
          expect(separated(position.active, other.farewell), JSON.stringify({ position, other })).toBe(true)
      }
    }
    checkBounds(await inspect('.banner-care', 2200))
    await page.screenshot({ path: testInfo.outputPath(`farewell-layout-${viewport.width}.png`) })
    await expect(page.locator('#announcements')).toContainText('を看取り、親の武器を手放した。')
    await expect(page.locator('#feed')).toContainText('を継承（未所持ならLv1・所持済みならLv+1）')
    await expect(page.locator('#feed')).toHaveCSS('opacity', '0')
    await expect(page.locator('#feed')).not.toHaveCSS('visibility', 'hidden')
    await expect(page.locator('#feed')).toHaveAttribute('aria-live', 'polite')
    await page.screenshot({ path: testInfo.outputPath(`farewell-warning-${viewport.width}.png`) })
    await expect(warning).toBeHidden({ timeout: 3000 })
    await expect(banner).toBeVisible()
    const stage = page.locator('.banner-stage')
    await expect(stage).toBeVisible()
    await expect(stage).toContainText('中年')
    checkBounds(await inspect('.banner-stage', 1800))
    await expect
      .poll(() =>
        page.evaluate(() => {
          const frames = (window as unknown as { farewellAlphas: number[] }).farewellAlphas
          return frames.some((alpha) => alpha > 0 && alpha < 1)
        })
      )
      .toBe(true)
    await page.screenshot({ path: testInfo.outputPath(`farewell-${viewport.width}.png`) })
    expect(errors).toEqual([])
  })
}

test('career events give only the qualified guest a turning point', async ({ context }) => {
  await context.route('**/rabbiters/src/network.ts*', (route) =>
    route.fulfill({ contentType: 'text/javascript', body: fakeNetwork })
  )
  const host = await context.newPage()
  const guest = await context.newPage()
  const errors: string[] = []
  for (const page of [host, guest]) {
    page.on('pageerror', (error) => errors.push(error.message))
    await page.goto('/')
    await page.locator('#room').fill('career-event')
  }
  await host.getByRole('button', { name: 'ルームを作る' }).click()
  await guest.getByRole('button', { name: 'ルームに参加' }).click()
  const hostLife = await life(host)
  const guestLife = await life(guest)
  await expect.poll(() => hostLife.evaluate((hook) => hook.game.state.players.length)).toBe(2)
  await expect.poll(() => guestLife.evaluate((hook) => hook.view?.players.length ?? 0)).toBe(2)
  const guestId = await guestLife.evaluate((hook) => hook.localId)
  await hostLife.evaluate(async (hook, id) => {
    const dataPath = '/src/data.ts'
    const { EVENTS } = await import(dataPath)
    const game = hook.game as unknown as Game
    for (const player of game.state.players) {
      player.birthPick = false
      player.choices = []
      player.pending = 0
      player.weapons = [{ id: 'w_work', lv: player.id === id ? 2 : 1, cd: 100, held: 0, damage: 0 }]
    }
    const index = EVENTS.findIndex((event: { boss: string }) => event.boss === 'b_shukatsu')
    game.state.eventIndex = index
    game.state.time = EVENTS[index].at - 0.01
    game.tick(0.01)
  }, guestId)
  await expect(guest.locator('#feed')).toContainText('実務を磨き')
  await expect(host.locator('#feed')).toContainText('就職を急がず')
  await expect(host.locator('#feed')).not.toContainText('実務を磨き')
  await expect(guest.locator('#levelup')).toBeVisible()
  await expect(host.locator('#levelup')).toBeHidden()
  await guest.locator('#cards .card').first().press('Enter')
  await expect
    .poll(() =>
      hostLife.evaluate((hook, id) => hook.game.state.players.find((player) => player.id === id)!.choices, guestId)
    )
    .toEqual([])
  await expect(guest.locator('#levelup')).toBeHidden()
  expect(errors).toEqual([])
})

test('a guest without parents can join another player’s care trial', async ({ context }) => {
  await context.route('**/rabbiters/src/network.ts*', (route) =>
    route.fulfill({ contentType: 'text/javascript', body: fakeNetwork })
  )
  const host = await context.newPage()
  const guest = await context.newPage()
  const errors: string[] = []
  for (const page of [host, guest]) {
    page.on('pageerror', (error) => errors.push(error.message))
    await page.goto('/')
    await page.locator('#room').fill('care-event')
  }
  await host.getByRole('button', { name: 'ルームを作る' }).click()
  await guest.getByRole('button', { name: 'ルームに参加' }).click()
  const hostLife = await life(host)
  const guestLife = await life(guest)
  await expect.poll(() => hostLife.evaluate((hook) => hook.game.state.players.length)).toBe(2)
  await expect.poll(() => guestLife.evaluate((hook) => hook.view?.players.length ?? 0)).toBe(2)
  const guestId = await guestLife.evaluate((hook) => hook.localId)
  const parentName = await hostLife.evaluate(async (hook, id) => {
    const dataPath = '/src/data.ts'
    const { EVENTS } = await import(dataPath)
    const game = hook.game as unknown as Game
    game.targetPopulation = () => 0
    for (const player of game.state.players) {
      player.parent = player.id === id ? 'p_gone' : 'p_free'
      player.birthPick = false
      player.choices = []
      player.pending = 0
    }
    const index = EVENTS.findIndex((event: { boss: string }) => event.boss === 'b_care')
    game.state.enemies = []
    game.state.eventIndex = index
    game.state.time = EVENTS[index].at - 0.01
    game.tick(0.01)
    return game.state.players.find((player) => player.id !== id)!.name
  }, guestId)
  await expect(guest.locator('#feed')).toContainText(`${parentName}の家族の試練：親の介護と、最期のお別れ…`)
  await expect
    .poll(() =>
      guestLife.evaluate(async (hook) => {
        const dataPath = '/src/data.ts'
        const { ENEMY_INDEX } = await import(dataPath)
        const enemies = (hook.view as unknown as View).enemies
        return enemies.some((value, index) => index % 7 === 1 && value === ENEMY_INDEX.get('b_care'))
      })
    )
    .toBe(true)
  const start = await hostLife.evaluate(
    (hook, id) => hook.game.state.players.find((player) => player.id === id)!.x,
    guestId
  )
  await expect(guest.locator('.banner-care')).toContainText('WARNING', { timeout: 500 })
  await expect(guest.locator('.banner-care')).toContainText('親の介護')
  await expect(guest.locator('.banner-farewell')).toHaveCount(0)
  await guest.bringToFront()
  await guest.keyboard.down('KeyD')
  await expect
    .poll(() => hostLife.evaluate((hook, id) => hook.game.state.players.find((player) => player.id === id)!.x, guestId))
    .toBeGreaterThan(start + 30)
  await guest.keyboard.up('KeyD')
  expect(errors).toEqual([])
})

for (const path of ['assets', 'creative', 'later-creative'] as const) {
  test(`sports and ${path} paths reach only their own terminal history over snapshots`, async ({ context }) => {
    await context.route('**/rabbiters/src/network.ts*', (route) =>
      route.fulfill({ contentType: 'text/javascript', body: fakeNetwork })
    )
    const host = await context.newPage()
    const guest = await context.newPage()
    const errors: string[] = []
    for (const page of [host, guest]) {
      page.on('pageerror', (error) => errors.push(error.message))
      await page.goto('/')
      await page.locator('#room').fill('alternative-careers')
    }
    await host.getByRole('button', { name: 'ルームを作る' }).click()
    await guest.getByRole('button', { name: 'ルームに参加' }).click()
    const hostLife = await life(host)
    const guestLife = await life(guest)
    await expect.poll(() => hostLife.evaluate((hook) => hook.game.state.players.length)).toBe(2)
    await expect.poll(() => guestLife.evaluate((hook) => hook.view?.players.length ?? 0)).toBe(2)
    const guestId = await guestLife.evaluate((hook) => hook.localId)
    await hostLife.evaluate(
      async (hook, { id, creative, later }) => {
        const dataPath = '/src/data.ts'
        const { EVENTS } = await import(dataPath)
        const game = hook.game as unknown as Game
        for (const player of game.state.players) {
          player.birthPick = false
          player.pending = 0
          player.choices = []
          player.weapons = [
            { id: 'w_work', lv: 2, cd: 100, held: 0, damage: 0 },
            {
              id: player.id === id ? (creative ? 'w_hobby' : 'w_savings') : 'w_muscle',
              lv: 4,
              cd: 100,
              held: 0,
              damage: 0
            }
          ]
        }
        for (const boss of ['b_shukatsu', 'b_layoff']) {
          if (later) {
            const player = game.state.players.find((entry) => entry.id === id)!
            player.weapons = [{ id: boss === 'b_shukatsu' ? 'w_work' : 'w_hobby', lv: 4, cd: 100, held: 0, damage: 0 }]
          }
          const index = EVENTS.findIndex((event: { boss: string }) => event.boss === boss)
          game.state.enemies = []
          game.state.eventIndex = index
          game.state.time = EVENTS[index].at - 0.01
          game.tick(0.01)
        }
      },
      { id: guestId, creative: path !== 'assets', later: path === 'later-creative' }
    )
    await expect
      .poll(() =>
        guestLife.evaluate(async (hook, id) => {
          const careerPath = '/src/art/careers.ts'
          const { careerFor } = await import(careerPath)
          const players = (hook.view as unknown as View).players
          const hostPlayer = players.find((player) => player.id !== id)
          const guestPlayer = players.find((player) => player.id === id)
          return hostPlayer && guestPlayer ? [careerFor(hostPlayer), careerFor(guestPlayer)] : []
        }, guestId)
      )
      .toEqual(['soccer', path !== 'assets' ? 'creative' : 'entrepreneur'])
    await expect(guest.locator('#feed')).toContainText(
      path === 'later-creative'
        ? '新たに創作の道に挑戦'
        : path === 'creative'
          ? '創作の道を広げる'
          : '資産を活かす道を広げる'
    )
    await expect(host.locator('#feed')).toContainText('スポーツの道を広げる')
    expect(
      await guestLife.evaluate((hook) =>
        hook.view!.players.every((player) => player.history === undefined && player.talents === undefined)
      )
    ).toBe(true)
    await expect(guest.locator('#result-history')).toBeHidden()
    await hostLife.evaluate((hook, id) => {
      const game = hook.game as unknown as Game
      for (const player of game.state.players) {
        player.weapons = [{ id: player.id === id ? 'w_love' : 'w_friend', lv: 8, cd: 100, held: 0, damage: 0 }]
      }
    }, guestId)
    for (const peer of [hostLife, guestLife]) {
      await expect
        .poll(() =>
          peer.evaluate(async (hook, id) => {
            const path = '/src/art/careers.ts'
            const { careerFor } = await import(path)
            const players = (hook.view as unknown as View).players
            return [
              careerFor(players.find((player) => player.id !== id)!),
              careerFor(players.find((player) => player.id === id)!)
            ]
          }, guestId)
        )
        .toEqual(['social', 'romantic'])
    }
    await hostLife.evaluate((hook) => {
      ;(hook.game as unknown as Game).state.phase = 'lost'
    })
    await expect(guest.locator('#result-history-list')).toContainText(
      path === 'later-creative'
        ? '実務を磨き、現場で就職'
        : path === 'creative'
          ? '好きなことを磨き、創作の道へ'
          : '資産を育て、資産を活かす道へ'
    )
    await expect(guest.locator('#result-history-list')).toContainText('転機を2回獲得')
    await expect(guest.locator('#result-history-list')).not.toContainText('スポーツ')
    await expect(host.locator('#result-history-list')).toContainText('運動を磨き、スポーツの道へ')
    await expect(host.locator('#result-history-list')).not.toContainText('資産')
    await expect(host.locator('#result-history-list')).not.toContainText('創作')
    expect(errors).toEqual([])
  })
}

for (const width of [1280, 390]) {
  test(`family support reaches a moving guest and renders at ${width}px`, async ({ context }, testInfo) => {
    await context.route('**/rabbiters/src/network.ts*', (route) =>
      route.fulfill({ contentType: 'text/javascript', body: fakeNetwork })
    )
    const host = await context.newPage()
    const guest = await context.newPage()
    await guest.setViewportSize({ width, height: 844 })
    const errors: string[] = []
    for (const page of [host, guest]) {
      page.on('pageerror', (error) => errors.push(error.message))
      await page.goto('/')
      await page.locator('#room').fill(`family-${width}`)
    }
    await host.getByRole('button', { name: 'ルームを作る' }).click()
    await guest.getByRole('button', { name: 'ルームに参加' }).click()
    const hostLife = await life(host)
    const guestLife = await life(guest)
    await expect.poll(() => hostLife.evaluate((hook) => hook.game.state.players.length)).toBe(2)
    await expect.poll(() => guestLife.evaluate((hook) => hook.view?.players.length ?? 0)).toBe(2)
    const guestId = await guestLife.evaluate((hook) => hook.localId)
    await hostLife.evaluate(async (hook, id) => {
      const dataPath = '/src/data.ts'
      const { EVENTS } = await import(dataPath)
      const game = hook.game as unknown as Game
      for (const player of game.state.players) {
        player.parent = 'p_free'
        player.choices = []
        player.pending = 0
        player.birthPick = false
        player.weapons = [{ id: 'w_love', lv: player.id === id ? 2 : 1, cd: 100, held: 0, damage: 0 }]
      }
      for (const index of [
        EVENTS.findIndex((event: { boss: string }) => event.boss === 'b_wedding'),
        EVENTS.findIndex((event: { swarm: string }) => event.swarm === 'nightcry')
      ]) {
        game.state.eventIndex = index
        game.state.time = EVENTS[index].at - 0.01
        game.tick(0.01)
      }
      game.state.enemies = []
      game.state.players.find((player) => player.id === id)!.hp = 20
    }, guestId)
    const personal = () =>
      guestLife.evaluate(
        (hook, id) => (hook.view as unknown as View | undefined)?.players.find((player) => player.id === id),
        guestId
      )
    await expect.poll(personal).toMatchObject({ married: true, hasChild: false, choices: ['f:yes', 'f:no'] })
    await expect(guest.locator('#levelup-title')).toHaveText('家族の選択')
    await guest.screenshot({ path: testInfo.outputPath(`family-choice-${width}.png`) })
    expect(await guest.locator('#levelup').evaluate((panel) => panel.scrollWidth <= panel.clientWidth)).toBe(true)
    if (width === 390) {
      await guest.waitForTimeout(400)
      await guest.getByRole('button', { name: /迎える.*本人の回復/ }).click()
    } else await guest.keyboard.press('Digit1')
    await expect.poll(personal).toMatchObject({ married: true, hasChild: true })
    expect(
      (await guestLife.evaluate((hook) => (hook.view as unknown as View).players)).find(
        (player) => player.id !== guestId
      )
    ).toMatchObject({ married: false, hasChild: false })
    await expect.poll(async () => (await personal())!.hp).toBeGreaterThan(20)
    const start = (await personal())!.x
    await guest.bringToFront()
    await guest.keyboard.down('KeyD')
    await expect.poll(async () => (await personal())!.x).toBeGreaterThan(start + 30)
    await guest.keyboard.up('KeyD')
    await guest.screenshot({ path: testInfo.outputPath(`family-${width}.png`) })
    expect((await personal())!.history).toBeUndefined()
    await expect(guest.locator('#result-history')).toBeHidden()
    await hostLife.evaluate((hook) => {
      ;(hook.game as unknown as Game).state.phase = 'lost'
    })
    await expect(guest.locator('#result-history')).toBeVisible()
    await expect(guest.locator('#result-history-list')).toContainText('結婚した！')
    await expect(guest.locator('#result-history-list')).toContainText('子どもを迎えた！')
    await expect(guest.locator('#result-history-list')).not.toContainText('独身')
    await expect(host.locator('#result-history-list')).toContainText('独身')
    await expect(host.locator('#result-history-list')).not.toContainText('結婚した！')
    expect(await guest.locator('#result').evaluate((result) => result.scrollWidth <= result.clientWidth)).toBe(true)
    await guest.locator('#result-history').scrollIntoViewIfNeeded()
    await guest.screenshot({ path: testInfo.outputPath(`history-${width}.png`) })
    expect(errors).toEqual([])
    await host.close()
    await guest.close()
  })
}

type Hook = {
  game: {
    state: {
      time: number
      eventIndex: number
      players: { x: number; y: number; choices: string[]; choiceSeq: number }[]
    }
    spawnEnemy(kind: string, x: number, y: number): void
  }
}

test('a boss announces itself: WARNING banner, then a boss bar under the xp bar', async ({ page }) => {
  const errors: string[] = []
  page.on('pageerror', (error) => errors.push(error.message))
  await page.goto('/')
  await page.getByRole('button', { name: 'ひとりで生まれる' }).click()
  await expect(page.locator('#hud')).toBeVisible()
  await expect(page.locator('#boss-bar')).toBeHidden()
  const handle = await life(page)
  await handle.evaluate((l) => {
    const game = (l as unknown as Hook).game
    game.state.eventIndex = 99
    const p = game.state.players[0]
    game.spawnEnemy('b_hs', p.x + 260, p.y)
  })
  await expect(page.locator('#banner .banner-warning')).toBeVisible()
  await expect(page.locator('#banner .banner-warning')).toContainText('WARNING')
  await expect(page.locator('#banner .banner-warning')).toContainText('人生イベント：高校受験')
  await expect(page.locator('#boss-bar')).toBeVisible()
  await expect(page.locator('#boss-name')).toHaveText('高校受験')
  // banners never stack: the warning leaves before the next one shows
  await expect(page.locator('#banner .banner')).toHaveCount(1)
  await expect(page.locator('#banner .banner-warning')).toBeHidden({ timeout: 5000 })
  expect(errors).toEqual([])
})

test('the sound toggle is a pressed button, flips with M, and survives a reload', async ({ page }) => {
  const errors: string[] = []
  page.on('pageerror', (error) => errors.push(error.message))
  await page.goto('/')
  const title = page.locator('#mute-title')
  await expect(title).toHaveAttribute('aria-pressed', 'false')
  await title.click()
  await expect(title).toHaveAttribute('aria-pressed', 'true')
  await page.reload()
  await expect(page.locator('#mute-title')).toHaveAttribute('aria-pressed', 'true')
  await page.getByRole('button', { name: 'ひとりで生まれる' }).click()
  await expect(page.locator('#hud')).toBeVisible()
  const mute = page.locator('#mute')
  await expect(mute).toHaveAttribute('aria-pressed', 'true')
  await page.keyboard.press('KeyM')
  await expect(mute).toHaveAttribute('aria-pressed', 'false')
  await page.getByRole('button', { name: '遊び方を表示' }).click()
  await expect(page.locator('#volume')).toBeVisible()
  await page.keyboard.press('Escape')
  await page.reload()
  await expect(page.locator('#mute-title')).toHaveAttribute('aria-pressed', 'false')
  expect(errors).toEqual([])
})

test('a lucky four-card hand shows rarity frames and key 4 picks the last card', async ({ page }) => {
  const errors: string[] = []
  page.on('pageerror', (error) => errors.push(error.message))
  await page.goto('/')
  await page.getByRole('button', { name: 'ひとりで生まれる' }).click()
  await expect(page.locator('#hud')).toBeVisible()
  const handle = await life(page)
  await handle.evaluate((l) => {
    const p = (l as unknown as Hook).game.state.players[0]
    p.choices = ['w:w_sns', 'w:w_pet', 'p:p_hot', 'x:meal']
    p.choiceSeq++
  })
  await expect(page.locator('#cards .card')).toHaveCount(4)
  await expect(page.locator('#levelup-note')).toContainText('1〜4キー')
  await expect(page.locator('#cards .card.rarity-new')).toHaveCount(2)
  await expect(page.locator('#cards .card.rarity-passive')).toHaveCount(1)
  await expect(page.locator('#cards .card .ribbon').first()).toHaveText('NEW')
  await page.keyboard.press('Digit4')
  await expect(page.locator('#levelup')).toBeHidden()
  await expect.poll(() => handle.evaluate((l) => (l as unknown as Hook).game.state.players[0].choices.length)).toBe(0)
  expect(errors).toEqual([])
})

test('on a phone, a slide anywhere shows a stick and steers; a stray tap on a fresh hand is ignored', async ({
  browser
}) => {
  const context = await browser.newContext({ viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: true })
  const page = await context.newPage()
  const errors: string[] = []
  page.on('pageerror', (error) => errors.push(error.message))
  await page.goto('/')
  await page.getByRole('button', { name: 'ひとりで生まれる' }).tap()
  await expect(page.locator('#hud')).toBeVisible()
  await expect(page.locator('#move-hint')).toBeVisible()
  const handle = await life(page)
  // A life without parents deals its first hand on the first tick: clear it and anything still to deal.
  await handle.evaluate((l) => {
    for (const p of (l.game as unknown as Game).state.players) {
      p.choices = []
      p.pending = 0
      p.birthPick = false
    }
  })
  await expect(page.locator('#levelup')).toBeHidden()

  const cdp = await context.newCDPSession(page)
  await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x: 200, y: 600 }] })
  const baseTransform = await page.locator('#stick').evaluate((element) => element.style.transform)
  for (let i = 1; i <= 8; i++)
    await cdp.send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: [{ x: 200 + i * 20, y: 600 }] })
  await expect(page.locator('#stick')).toHaveJSProperty('hidden', false)
  expect(baseTransform).toBe('translate(200px, 600px)')
  const baseX = await page
    .locator('#stick')
    .evaluate((element) => new DOMMatrix(getComputedStyle(element).transform).m41)
  expect(baseX).toBeGreaterThan(200)
  expect(baseX).toBeLessThan(240)
  await expect(page.locator('#stick-knob')).toHaveCSS('transform', 'matrix(1, 0, 0, 1, 56, 0)')
  await expect(page.locator('#move-hint')).toBeHidden()
  const x0 = await handle.evaluate((l) => l.view.players[0].x)
  await expect.poll(() => handle.evaluate((l) => l.view.players[0].x)).toBeGreaterThan(x0 + 20)
  await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] })
  await expect(page.locator('#stick')).toHaveJSProperty('hidden', true)

  await handle.evaluate((l) => {
    const p = l.game.state.players[0] as unknown as { choices: string[]; choiceSeq: number }
    p.choices = ['w:w_sns', 'w:w_pet', 'p:p_hot']
    p.choiceSeq++
  })
  const card = page.locator('#cards .card').first()
  await expect(card).toBeAttached()
  // A finger still lifting from steering lands on the hand the moment it opens.
  await card.dispatchEvent('click', { detail: 1 })
  await expect(page.locator('#levelup')).toBeVisible()
  await expect(page.locator('#levelup-note')).toContainText('タップで決定')
  await page.waitForTimeout(400)
  await card.tap()
  await expect(page.locator('#levelup')).toBeHidden()
  expect(errors).toEqual([])
  await context.close()
})

test('the music follows a life: title, stages, a boss, the reaper, the ending and the BGM slider', async ({ page }) => {
  const errors: string[] = []
  page.on('pageerror', (error) => errors.push(error.message))
  type Music = { theme: string | null; layer: number; live: number; enabled: boolean }
  const music = () => page.evaluate(() => (window as unknown as { __life: { music: Music } }).__life.music)
  const theme = async () => (await music()).theme
  await page.goto('/')
  // Any press unlocks audio and the title theme starts.
  await page.locator('#start-title').click()
  await expect.poll(theme).toBe('title')
  await expect.poll(async () => (await music()).live).toBeGreaterThan(0)

  await page.getByRole('button', { name: 'ひとりで生まれる' }).click()
  await expect(page.locator('#hud')).toBeVisible()
  await expect.poll(music).toMatchObject({ theme: 'cradle', layer: 0, enabled: true })
  const handle = await life(page)
  // This life only listens: no birth pick, no scheduled life events, and nothing can break the mind.
  await handle.evaluate((l) => {
    const game = (l as unknown as Hook).game
    game.state.eventIndex = 99
    Object.assign(game, { spawn: () => {} })
    game.state.enemies = []
    for (const p of game.state.players) Object.assign(p, { choices: [], invuln: 1e9, hp: 1e9, maxHp: 1e9 })
  })
  await expect.poll(async () => (await music()).live).toBeGreaterThan(0)

  await handle.evaluate((l) => (l.game.state.time = 60 * 8 + 40)) // age 37: 働き盛り
  await expect.poll(music).toMatchObject({ theme: 'office', layer: 1 })

  await handle.evaluate((l) => {
    const game = (l as unknown as Hook).game
    game.state.eventIndex = 99
    const p = game.state.players[0]
    game.spawnEnemy('b_hs', p.x + 400, p.y)
  })
  await expect.poll(theme).toBe('boss')
  await expect.poll(async () => (await music()).live, { timeout: 5000 }).toBeGreaterThan(0)
  await handle.evaluate((l) => ((l as unknown as { game: { state: { enemies: unknown[] } } }).game.state.enemies = []))
  await expect.poll(theme).toBe('office')

  await page.getByRole('button', { name: '遊び方を表示' }).click()
  await page.locator('#music-volume').fill('0')
  await expect.poll(music).toMatchObject({ enabled: false })
  await page.locator('#music-volume').fill('40')
  await expect.poll(music).toMatchObject({ enabled: true })
  await page.keyboard.press('Escape')

  await handle.evaluate((l) => {
    l.game.state.time = 15 * 60 - 0.5
    for (const p of l.game.state.players) p.choices = []
  })
  await expect.poll(theme).toBe('reaper')
  // The reaper's 4 s and the 3 s farewell run on game time, which slows down with the frame rate.
  await expect(page.getByRole('heading', { name: /大往生/ })).toBeVisible({ timeout: 15000 })
  await expect.poll(theme).toBe('won')
  await page.getByRole('button', { name: 'もう一度生まれる' }).click()
  await expect.poll(theme).toBe('title')
  await expect.poll(async () => (await music()).live).toBeGreaterThan(0)

  await page.reload()
  await expect(page.locator('#music-volume')).toHaveValue('40')
  expect(errors).toEqual([])
})

test('a phone tab that comes back resumes its music by itself, and a cached page keeps the same audio', async ({
  page
}) => {
  const errors: string[] = []
  page.on('pageerror', (error) => errors.push(error.message))
  type Music = { theme: string | null; layer: number; live: number; enabled: boolean }
  type Tracked = { __contexts: AudioContext[] }
  const music = () => page.evaluate(() => (window as unknown as { __life: { music: Music } }).__life.music)
  const contexts = () => page.evaluate(() => (window as unknown as Tracked).__contexts.length)
  const running = () =>
    page.evaluate(() => (window as unknown as Tracked).__contexts.some((context) => context.state === 'running'))
  const visibility = (hidden: boolean) =>
    page.evaluate((hidden) => {
      Object.defineProperty(document, 'hidden', { configurable: true, get: () => hidden })
      document.dispatchEvent(new Event('visibilitychange'))
    }, hidden)
  /** Background tabs lose their audio: the phone suspends every context it finds. */
  const suspendAll = () =>
    page.evaluate(async () => {
      for (const context of (window as unknown as Tracked).__contexts)
        if (context.state === 'running') await context.suspend()
    })

  await page.addInitScript(() => {
    const Native = window.AudioContext
    const tracked: AudioContext[] = []
    ;(window as unknown as Tracked).__contexts = tracked
    const Patched = function (...args: []): AudioContext {
      const context = new Native(...args)
      tracked.push(context)
      return context
    }
    Patched.prototype = Native.prototype
    window.AudioContext = Patched as unknown as typeof AudioContext
  })

  await page.goto('/')
  await page.getByRole('button', { name: 'ひとりで生まれる' }).click()
  await expect.poll(async () => (await music()).live).toBeGreaterThan(0)

  // Leaving the tab and coming back: the music must restart without another tap.
  await visibility(true)
  await suspendAll()
  await visibility(false)
  await expect.poll(running).toBe(true)
  await expect.poll(music).toMatchObject({ enabled: true })
  expect(await page.locator('#mute').getAttribute('aria-pressed')).toBe('false')

  // iPhones cache the page on a tab switch: it comes back with the same audio graph.
  await visibility(true)
  await page.evaluate(() => window.dispatchEvent(new PageTransitionEvent('pagehide', { persisted: true })))
  await suspendAll()
  const kept = await contexts()
  await page.evaluate(() => window.dispatchEvent(new PageTransitionEvent('pageshow', { persisted: true })))
  await visibility(false)
  await expect.poll(running).toBe(true)
  expect(await contexts()).toBe(kept)
  await expect.poll(music).toMatchObject({ theme: 'cradle', enabled: true })
  expect(errors).toEqual([])
})
