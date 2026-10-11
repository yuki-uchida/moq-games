import { describe, expect, it } from 'vitest'
import { titleSaveStatus, titleScreenMarkup } from '../src/ui/TitleScreen'
import { loadCampaignSave, saveCampaignCheckpoint } from '../src/progression/CampaignStorage'
import { validateCampaignCheckpoint } from '../src/game/CampaignCheckpoint'
import { GameEngine } from '../src/game/GameEngine'
import { RuleBasedAI } from '../src/ai/AIController'
import { freshProfile, freshRunFromProfile } from '../src/progression/UpgradeSystem'

describe('title screen', () => {
  it('has the exact menu and preserves project-relative routes', () => {
    const html = titleScreenMarkup(new URL('https://example.test/moq-games/tower-defense-art/'))
    expect(html).toContain('smart defence<br><span>with jev</span>')
    for (const text of ['New game', 'Continue', 'EXTRA']) expect(html).toContain(`>${text}</span>`)
    expect(html).toContain('href="./extra.html"')
    expect(html).toContain('href="../../../index.html"')
    expect(html).toContain('https://example.test/moq-games/tower-defense-art/soldier/portrait.png')
  })
  it('keeps the title action-first without decorative explanations', () => {
    const html = titleScreenMarkup(new URL('https://example.test/art/'))
    for (const removed of [
      'title-kicker',
      'title-description',
      'title-party-caption',
      'title-footer',
      'TACTICAL FANTASY'
    ]) {
      expect(html).not.toContain(removed)
    }
    expect(html).toContain('aria-labelledby="game-title"')
    expect(html).toContain('aria-describedby="title-save-status"')
    expect(html).toContain('id="title-save-status" class="title-save-status" role="status"')
    expect(titleSaveStatus(true, null, false)).toBe('保存した遠征を再開できます。')
  })
  it('explains missing, corrupt, unavailable and legacy saves honestly', () => {
    expect(titleSaveStatus(false, null, false)).toBe('保存した遠征はありません。')
    expect(titleSaveStatus(false, 'invalid-run', false)).toContain('元データは変更していません')
    expect(titleSaveStatus(false, 'storage-unavailable', false)).toContain('アクセスできません')
    expect(titleSaveStatus(false, null, true)).toBe('New game に以前の仲間を引き継ぎます。')
    expect(titleSaveStatus(true, null, false)).toContain('再開できます')
  })
  it('reading the title leaves a corrupt save intact', () => {
    const raw = '{corrupt'
    const storage = { getItem: (key: string) => (key === 'tower-jev-v3' ? raw : null) }
    const result = loadCampaignSave(validateCampaignCheckpoint, storage)
    expect(result.run).toBeNull()
    expect(result.issue).toBe('invalid-envelope')
    expect(storage.getItem('tower-jev-v3')).toBe(raw)
  })
  it('round-trips an actual campaign checkpoint rather than inventing progress', () => {
    const save = freshRunFromProfile(freshProfile(), 2, 1)
    const engine = new GameEngine(new RuleBasedAI(), save)
    let raw: string | null = null
    expect(
      saveCampaignCheckpoint(save, engine.exportCheckpoint(), validateCampaignCheckpoint, {
        setItem: (_, value) => {
          raw = value
        }
      })
    ).toBe(true)
    const stored = raw
    const result = loadCampaignSave(validateCampaignCheckpoint, {
      getItem: (key) => (key === 'tower-jev-v3' ? raw : null)
    })
    expect(result.run?.progress.gold).toBe(save.gold)
    expect(result.run?.engine.state.fieldId).toBe(engine.state.fieldId)
    expect(raw).toBe(stored)
  })
})
