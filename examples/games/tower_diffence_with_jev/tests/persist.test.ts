import { readFileSync } from 'node:fs'
import { createContext, runInContext } from 'node:vm'
import { describe, expect, it } from 'vitest'
import { GameEngine } from '../src/game/GameEngine'
import { validateCampaignCheckpoint } from '../src/game/CampaignCheckpoint'
import { RuleBasedAI } from '../src/ai/AIController'
import { freshProfile, freshRunFromProfile } from '../src/progression/UpgradeSystem'
import { loadCampaignSave, saveCampaignCheckpoint } from '../src/progression/CampaignStorage'

const source = readFileSync(new URL('../src/main.ts', import.meta.url), 'utf8')
// Exercise the actual UI persistence function without initializing WebGL or the page.
const start = source.indexOf('function persist(')
const persistSource = source.slice(start, source.indexOf('\nfunction autosave()', start)).replace('): boolean {', ') {')

function arrange() {
  const save = freshRunFromProfile(freshProfile(), 2, 1)
  const engine = new GameEngine(new RuleBasedAI(), save)
  let raw: string | null = null
  let writes = 0
  let failWrites = false
  const storage = {
    getItem: () => raw,
    setItem: (_key: string, value: string) => {
      if (failWrites) throw new Error('storage unavailable')
      writes++
      raw = value
    }
  }
  const context = createContext({
    started: true,
    engine,
    save,
    lastSavedCheckpoint: '',
    lastCheckpointAt: 0,
    performance: { now: () => 100 },
    validateCampaignCheckpoint,
    saveCampaignCheckpoint: (data: typeof save, snapshot: unknown) =>
      saveCampaignCheckpoint(data, snapshot, validateCampaignCheckpoint, storage),
    feedback: false,
    setSaveFeedback: (saved: boolean) => {
      context.feedback = saved
    }
  })
  runInContext(persistSource, context)
  return {
    context,
    storage,
    persist: (force = false) => runInContext(`persist(${force})`, context),
    raw: () => raw,
    writes: () => writes,
    replace: (value: string | null) => {
      raw = value
    },
    failWrites: () => {
      failWrites = true
    }
  }
}

describe('UI checkpoint persistence', () => {
  it('keeps unchanged autosaves quiet but explicit saving restores this tab after a foreign save or deletion', () => {
    const state = arrange()
    expect(state.persist()).toBe(true)
    const savedA = state.raw()
    state.replace('{foreign tab save}')
    expect(state.persist()).toBe(true)
    expect(state.raw()).toBe('{foreign tab save}')
    expect(state.writes()).toBe(1)
    expect(state.persist(true)).toBe(true)
    expect(state.context.feedback).toBe(true)
    expect(state.raw()).toBe(savedA)
    expect(state.writes()).toBe(2)
    expect(loadCampaignSave(validateCampaignCheckpoint, state.storage).run?.engine.state.fieldId).toBe('meadow')
    state.replace(null)
    expect(state.persist(true)).toBe(true)
    expect(state.raw()).toBe(savedA)
    expect(state.writes()).toBe(3)
  })

  it('reports a failed explicit write even when the snapshot is cached', () => {
    const state = arrange()
    expect(state.persist()).toBe(true)
    state.replace('{foreign tab save}')
    state.failWrites()
    expect(state.persist(true)).toBe(false)
    expect(state.context.feedback).toBe(false)
    expect(state.raw()).toBe('{foreign tab save}')
    expect(state.writes()).toBe(1)
    expect(state.persist()).toBe(true)
    expect(state.context.feedback).toBe(false)
    expect(state.raw()).toBe('{foreign tab save}')
    expect(state.writes()).toBe(1)
  })

  it('forces both Save now and Title, and keeps the game open when Title cannot save', () => {
    expect(source).toContain("$('save-now').onclick = () => persist(true)")
    const state = arrange()
    expect(state.persist()).toBe(true)
    state.replace('{foreign tab save}')
    state.failWrites()
    let navigated = false
    let settingsOpened = false
    Object.assign(state.context, {
      campaignPreparation: undefined,
      campaignAction: undefined,
      campaignLoading: { close() {} },
      settings: () => {
        settingsOpened = true
      },
      $: () => ({}),
      location: {
        replace: () => {
          navigated = true
        }
      }
    })
    const titleStart = source.indexOf('function returnToTitle()')
    runInContext(source.slice(titleStart, source.indexOf('\ntitleDialog.addEventListener', titleStart)), state.context)
    runInContext('returnToTitle()', state.context)
    expect(settingsOpened).toBe(true)
    expect(navigated).toBe(false)
    expect(state.context.feedback).toBe(false)
  })
})
