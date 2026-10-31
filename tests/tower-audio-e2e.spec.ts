import { expect, test, type Page } from '@playwright/test'
import { writeFile } from 'node:fs/promises'
import { ALLY_TYPES, ENEMY_TYPES, getField } from '../examples/games/tower_diffence_with_jev/src/game/model'
import { authoredRole } from '../examples/games/tower_diffence_with_jev/src/rendering/AuthoredRoster'
import { openOfflineCampaign, towerPath, dragUnitToWorld } from './tower-defense-e2e-arrange'

const reviewPath = '/moq-games/examples/games/tower_diffence_with_jev/audio-review.html'
const snapshot = (page: Page) => page.evaluate(() => (window as any).soundReview.snapshot())
const invoke = (page: Page, method: string, ...args: unknown[]) =>
  page.evaluate(({ method, args }) => (window as any).soundReview[method](...args), { method, args })
async function openAudio(page: Page) {
  await page.goto(reviewPath)
  await page.waitForFunction(() => !!(window as any).soundReview)
}
async function catalogAssetCount(page: Page) {
  return page.evaluate(async () => {
    const { soundCatalog } = await import('/moq-games/examples/games/tower_diffence_with_jev/src/audio/SoundCatalog.ts')
    const catalog = soundCatalog(new URL('/moq-games/tower-defense-sfx/', location.href))
    return new Set(catalog.map((entry: { url: string; sha256: string }) => `${entry.url}\n${entry.sha256}`)).size
  })
}
async function unlock(page: Page) {
  const count = await catalogAssetCount(page)
  expect(count).toBe(22)
  await page.locator('#audio-unlock').click()
  await expect.poll(async () => (await snapshot(page)).audio.ready).toBe(count)
  expect((await snapshot(page)).audio.state).toBe('ready')
}

test('loads all verified PCM clips only after interaction and reuses the decoded cache', async ({ page }, info) => {
  // Arrange
  const requests: string[] = [],
    errors: string[] = []
  page.on('request', (request) => {
    if (request.url().endsWith('.wav')) requests.push(request.url())
  })
  page.on('pageerror', (error) => errors.push(error.message))
  await openAudio(page)
  // Assert
  expect((await snapshot(page)).audio.state).toBe('locked')
  expect(requests).toEqual([])
  // Act
  await unlock(page)
  await page.locator('#audio-unlock').click()
  // Assert
  const count = await catalogAssetCount(page)
  expect(requests).toHaveLength(count)
  expect(new Set(requests).size).toBe(count)
  expect((await snapshot(page)).audio.played).toBe(0)
  expect(errors).toEqual([])
  await writeFile(info.outputPath('decoded-candidates.json'), JSON.stringify(await snapshot(page), null, 2))
})

test('plays each sprite-review role at the actual simulation cue, with separate breath and real frost application', async ({
  page
}, info) => {
  // Arrange
  await openAudio(page)
  await unlock(page)
  const records = []
  // Act / Assert
  for (const role of [...ALLY_TYPES, ...ENEMY_TYPES].filter((role) => authoredRole(role))) {
    const before = await invoke(page, 'prepare', role)
    const after = await invoke(page, 'advance', 1)
    const cues = after.events.filter((event: any) => event.unitType === role)
    expect(
      cues.filter(
        (event: any) =>
          event.kind === (role === 'healer' ? 'heal_apply' : 'hit') || (role !== 'healer' && event.kind === 'release')
      )
    ).toHaveLength(1)
    expect(cues.filter((event: any) => event.kind === 'slow_apply')).toHaveLength(role === 'frost' ? 1 : 0)
    expect(after.audio.played - before.audio.played).toBe(role === 'frost' ? 2 : 1)
    if (role === 'healer') expect(after.targetHp).toBeGreaterThan(before.targetHp)
    else expect(after.targetHp).toBeLessThan(before.targetHp)
    const repeated = await invoke(page, 'replay')
    expect(repeated.audio.played).toBe(after.audio.played)
    expect(repeated.audio.activeVoices).toBeLessThanOrEqual(8)
    records.push({ role, before, after })
  }
  const before = await invoke(page, 'prepare', 'dragon', true)
  const after = await invoke(page, 'advance', 1)
  expect(after.events.filter((event: any) => event.kind === 'breath_start')).toHaveLength(1)
  expect(after.audio.played - before.audio.played).toBe(1)
  expect(after.targetHp).toBeLessThan(before.targetHp)
  records.push({ role: 'dragon-breath', before, after })
  await writeFile(info.outputPath('authoritative-sound-cues.json'), JSON.stringify(records, null, 2))
})

test('mutes immediately without replaying skipped cues when enabled again', async ({ page }, info) => {
  // Arrange
  await openAudio(page)
  await unlock(page)
  await page.locator('#audio-mute').click()
  const before = await invoke(page, 'prepare', 'soldier')
  // Act
  const muted = await invoke(page, 'advance', 0.5)
  await page.locator('#audio-mute').click()
  const resumed = await invoke(page, 'replay')
  // Assert
  expect(muted.targetHp).toBeLessThan(before.targetHp)
  expect(muted.audio.played).toBe(before.audio.played)
  expect(muted.audio.activeVoices).toBe(0)
  expect(resumed.audio.played).toBe(before.audio.played)
  // Act
  await invoke(page, 'prepare', 'soldier')
  const fresh = await invoke(page, 'advance', 0.5)
  // Assert
  expect(fresh.audio.played).toBe(before.audio.played + 1)
  await writeFile(info.outputPath('mute-no-replay.json'), JSON.stringify({ before, muted, resumed, fresh }, null, 2))
})

test('does not stall combat or replay a cue after delayed audio becomes available', async ({ page }, info) => {
  // Arrange
  let release!: () => void
  const hold = new Promise<void>((resolve) => {
    release = resolve
  })
  await page.route('**/tower-defense-sfx/soldier_attack.wav', async (route) => {
    await hold
    await route.continue()
  })
  await openAudio(page)
  const count = await catalogAssetCount(page)
  await page.locator('#audio-unlock').click()
  await expect.poll(async () => (await snapshot(page)).audio.ready).toBe(count - 1)
  const before = await invoke(page, 'prepare', 'soldier')
  // Act
  const missed = await invoke(page, 'advance', 0.5)
  release()
  await expect.poll(async () => (await snapshot(page)).audio.ready).toBe(count)
  const loaded = await snapshot(page)
  // Assert
  expect(missed.targetHp).toBeLessThan(before.targetHp)
  expect(missed.audio.played).toBe(0)
  expect(loaded.audio.played).toBe(0)
  expect(loaded.audio.dropped).toBeGreaterThan(0)
  // Act
  await invoke(page, 'prepare', 'soldier')
  const next = await invoke(page, 'advance', 0.5)
  // Assert
  expect(next.audio.played).toBe(1)
  await writeFile(
    info.outputPath('late-audio-no-catchup.json'),
    JSON.stringify({ before, missed, loaded, next }, null, 2)
  )
})

test('isolates an audio load failure and recovers through an explicit bounded retry', async ({ page }, info) => {
  // Arrange
  let requests = 0
  await page.route('**/tower-defense-sfx/soldier_attack.wav', async (route) => {
    requests++
    if (requests === 1) await route.fulfill({ status: 503, body: 'test unavailable' })
    else await route.continue()
  })
  await openAudio(page)
  const count = await catalogAssetCount(page)
  await page.locator('#audio-unlock').click()
  await expect.poll(async () => (await snapshot(page)).audio.failed).toBe(1)
  await expect.poll(async () => (await snapshot(page)).audio.ready).toBe(count - 1)
  // Act
  await invoke(page, 'prepare', 'soldier')
  const failed = await invoke(page, 'advance', 0.5)
  await page.locator('#audio-retry').click()
  await expect.poll(async () => (await snapshot(page)).audio.ready).toBe(count)
  // Assert
  expect(failed.events).toHaveLength(1)
  expect(failed.audio.played).toBe(0)
  expect(requests).toBe(2)
  expect((await snapshot(page)).audio.played).toBe(0)
  await page.screenshot({ path: info.outputPath('audio-retry-ready.png') })
})

test('runs optional sounds in the ordinary game and persists only reversible sound preferences', async ({
  page
}, info) => {
  // Arrange
  const errors: string[] = []
  page.on('pageerror', (error) => errors.push(error.message))
  await openOfflineCampaign(page)
  const count = await catalogAssetCount(page)
  await expect.poll(() => page.evaluate(() => (window as any).towerDefenseAudioDiagnostics().ready)).toBe(count)
  await dragUnitToWorld(page, 'soldier', getField('meadow', 2, 4).slots[0])
  await page.locator('#assault').click()
  // Act / Assert
  await expect
    .poll(() => page.evaluate(() => (window as any).towerDefenseAudioDiagnostics().played), { timeout: 30000 })
    .toBeGreaterThan(0)
  await page.locator('#settings-toggle').click()
  await page.locator('[data-settings-tab=sound]').click()
  await page.locator('#sound-enabled').uncheck()
  await page.locator('#sound-volume').focus()
  await page.keyboard.press('Home')
  for (let i = 0; i < 7; i++) await page.keyboard.press('ArrowRight')
  const muted = await page.evaluate(() => (window as any).towerDefenseAudioDiagnostics())
  expect(muted.activeVoices).toBe(0)
  await expect(page.locator('#sound-status')).toContainText('ミュート中')
  await page.screenshot({ path: info.outputPath('sound-settings-muted.png') })
  await page.goto(towerPath)
  await page.locator('#title-new').click()
  await page.locator('#launch-settings').evaluate((button: HTMLButtonElement) => button.click())
  await page.locator('[data-settings-tab=sound]').click()
  await expect(page.locator('#sound-enabled')).not.toBeChecked()
  await expect(page.locator('#sound-volume')).toHaveValue('35')
  expect(await page.evaluate(() => (window as any).towerDefenseAudioDiagnostics().played)).toBe(0)
  expect(errors).toEqual([])
  await writeFile(info.outputPath('ordinary-game-sounds.json'), JSON.stringify(muted, null, 2))
})

test('plays real support and mud applications once from selected effect files', async ({ page }, info) => {
  // Arrange
  await openAudio(page)
  await unlock(page)
  // Act
  const result = await page.evaluate(async () => {
    const base = '/moq-games/examples/games/tower_diffence_with_jev/src/'
    const { createSupportReview } = await import(base + 'review/CommanderSupportScene.ts')
    const { createFortificationMudReview, advanceFortificationScene } = await import(
      base + 'review/FortificationScene.ts'
    )
    const { soundCatalog } = await import(base + 'audio/SoundCatalog.ts')
    const { soundEventKey } = await import(base + 'game/CombatSoundEvents.ts')
    const { SoundPlayer } = await import(base + 'audio/SoundPlayer.ts')
    const catalog = soundCatalog(new URL('/moq-games/tower-defense-sfx/', location.href))
    const player = new SoundPlayer(catalog)
    await player.unlock()
    const deadline = Date.now() + 10000
    while (player.status.state === 'loading' && Date.now() < deadline)
      await new Promise((resolve) => setTimeout(resolve, 20))
    const loaded = player.diagnostics
    const records = []
    for (const effect of ['heal', 'speed', 'armor', 'attack']) {
      const review = createSupportReview({ effect })
      await review.advance(500)
      const before = review.engine.takeCombatSounds()
      await review.advance(700)
      const applied = review.engine.takeCombatSounds()
      player.setBattle(review.engine.state.battleId, review.engine.state.stage)
      const playedBefore = player.diagnostics.played
      player.consume(applied, review.engine.state.time)
      player.consume(applied, review.engine.state.time)
      const playedDelta = player.diagnostics.played - playedBefore
      review.resume()
      await review.advance(100)
      const resumed = review.engine.takeCombatSounds()
      player.setBattle(review.engine.state.battleId, review.engine.state.stage)
      player.consume(resumed, review.engine.state.time)
      records.push({ effect, before, applied, resumed, playedDelta, history: review.snapshot().state.history })
    }
    const mud = createFortificationMudReview()
    advanceFortificationScene(mud, 0.1)
    const first = mud.sounds.slice()
    player.setBattle(mud.engine.state.battleId, mud.engine.state.stage)
    const mudBefore = player.diagnostics.played
    player.consume(first, mud.engine.state.time)
    advanceFortificationScene(mud, 0.1)
    player.consume(mud.sounds, mud.engine.state.time)
    const mudPlayed = player.diagnostics.played - mudBefore
    const audio = player.diagnostics
    player.destroy()
    return {
      records,
      mud: { first, all: mud.sounds, playedDelta: mudPlayed, slowUntil: mud.actors.entrant1.mudSlowUntil },
      selected: catalog.map(soundEventKey),
      loaded,
      audio,
      destroyed: player.diagnostics
    }
  })
  // Assert
  for (const record of result.records) {
    expect(record.before).toEqual([])
    expect(record.applied).toHaveLength(1)
    expect(record.applied[0].kind).toBe(`support_${record.effect}_apply`)
    expect(record.history.at(-1).outcome).toBe('applied')
    expect(record.resumed).toEqual([])
    expect(result.selected).toContain(`support_${record.effect}`)
  }
  expect(result.mud.first.map((event: any) => event.kind)).toEqual(['mud_slow_apply'])
  expect(result.mud.all).toEqual(result.mud.first)
  expect(result.mud.slowUntil).toBeGreaterThan(0.2)
  expect(result.selected).toContain('mud_slow_apply')
  expect(result.selected).toContain('terrain_slow_enter')
  const count = await catalogAssetCount(page)
  expect(result.loaded).toMatchObject({ state: 'ready', ready: count })
  expect(result.audio.ready).toBe(count)
  expect(result.records.map((record) => [record.effect, record.playedDelta])).toEqual([
    ['heal', 1],
    ['speed', 1],
    ['armor', 1],
    ['attack', 1]
  ])
  expect(result.mud.playedDelta).toBe(1)
  expect(result.destroyed).toMatchObject({ state: 'destroyed', ready: 0, activeVoices: 0, recentEventCount: 0 })
  await writeFile(info.outputPath('selected-effect-hooks.json'), JSON.stringify(result, null, 2))
})

test('resolves and plays the three new melee enemies without replaying duplicates', async ({ page }) => {
  await openAudio(page)
  await unlock(page)
  const result = await page.evaluate(async () => {
    const base = '/moq-games/examples/games/tower_diffence_with_jev/src/'
    const { soundCatalog } = await import(base + 'audio/SoundCatalog.ts')
    const { soundEventKey } = await import(base + 'game/CombatSoundEvents.ts')
    const { SoundPlayer } = await import(base + 'audio/SoundPlayer.ts')
    const catalog = soundCatalog(new URL('/moq-games/tower-defense-sfx/', location.href))
    const player = new SoundPlayer(catalog)
    await player.unlock()
    const deadline = Date.now() + 10000
    while (player.status.state === 'loading' && Date.now() < deadline)
      await new Promise((resolve) => setTimeout(resolve, 20))
    player.setBattle(71, 4)
    const roles = ['crystalSentinel', 'koboldLancer', 'clockworkPatchling']
    const results = roles.map((unitType, index) => {
      const event = {
        id: `enemy:${index}`,
        attackId: `attack:${index}`,
        attackerId: index + 1,
        unitType,
        kind: 'hit',
        at: 1,
        battleId: 71,
        stage: 4
      }
      const key = soundEventKey(event)
      const entry = catalog.find((candidate: any) => soundEventKey(candidate) === key)
      const before = player.diagnostics.played
      player.consume([event, event], 1)
      return { unitType, key, url: entry?.url, played: player.diagnostics.played - before }
    })
    player.setEnabled(false)
    player.consume(
      [
        {
          id: 'muted',
          attackId: 'muted',
          attackerId: 1,
          unitType: roles[0],
          kind: 'hit',
          at: 1,
          battleId: 71,
          stage: 4
        }
      ],
      1
    )
    const mutedPlayed = player.diagnostics.played
    player.destroy()
    return { results, mutedPlayed }
  })
  expect(result.results.map(({ unitType, key, played }) => ({ unitType, key, played }))).toEqual([
    { unitType: 'crystalSentinel', key: 'crystalSentinel_attack', played: 1 },
    { unitType: 'koboldLancer', key: 'koboldLancer_attack', played: 1 },
    { unitType: 'clockworkPatchling', key: 'clockworkPatchling_attack', played: 1 }
  ])
  expect(result.results.every(({ url }) => typeof url === 'string' && url.endsWith('.wav'))).toBe(true)
  expect(result.mutedPlayed).toBe(3)
})
