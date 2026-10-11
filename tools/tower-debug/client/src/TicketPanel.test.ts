import { it, expect, vi } from 'vitest'
import { TicketPanel } from './TicketPanel'
import type { ViewerContext } from './contracts'

it('synthetic new draft after uncertain submission labels the same target it will submit', async () => {
  const fields = new Map<string, any>()
  const field = (id: string) => {
    if (!fields.has(id))
      fields.set(id, {
        value: '',
        textContent: '',
        disabled: false,
        hidden: false,
        onclick: null,
        addEventListener() {}
      })
    return fields.get(id)
  }
  const dialog = { querySelector: (id: string) => field(id.slice(1)), showModal() {} } as unknown as HTMLDialogElement
  const saved = new Map<string, string>()
  vi.stubGlobal('localStorage', {
    getItem: (key: string) => saved.get(key) ?? null,
    setItem: (key: string, value: string) => saved.set(key, value)
  })
  vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new Error('synthetic uncertain network failure')))
  const context = (role: string): ViewerContext => ({
    role,
    roleRevision: `${role}-v1`,
    representation: 'source2DImage',
    motion: null,
    direction: null,
    timeMs: null,
    sourceFrameIndex: null,
    interpolationMode: 'source-clock',
    clipManifest: null,
    selectedAudio: null
  })
  const panel = new TicketPanel(dialog, 'synthetic-csrf', 'audit-draft')
  panel.open(context('soldier'), [])
  field('ticket-title').value = '[SYNTHETIC] old soldier draft'
  field('ticket-text').value = '[SYNTHETIC] Original context'
  await (panel as any).submit()
  // Closing/reopening while looking at Healer keeps the original retry frozen, as expected.
  panel.open(context('healer'), [])
  field('ticket-new').onclick()
  const stored = JSON.parse(saved.get('audit-draft')!)
  expect(stored.pending).toBeNull()
  expect(stored.context.role).toBe('healer')
  // Displayed and persisted identities must match after the explicit new-draft action.
  expect(field('ticket-context').textContent).toContain('healer / healer-v1')
  vi.unstubAllGlobals()
})
