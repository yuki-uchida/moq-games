import { it, expect, vi, afterEach } from 'vitest'
import { TicketPanel } from './TicketPanel'
import type { ViewerContext, FeedbackSubject, AssetRef } from './contracts'
const ref: AssetRef = {
  assetId: 'a-' + '0'.repeat(64),
  revision: 'audio-v1',
  sha256: '0'.repeat(64),
  bytes: 4,
  mimeType: 'audio/wav'
}
const context = (role: string, audio = false): ViewerContext => ({
  role,
  roleRevision: `${role}-v1`,
  representation: 'source2DImage',
  motion: null,
  direction: null,
  timeMs: null,
  sourceFrameIndex: null,
  interpolationMode: 'source-clock',
  clipManifest: null,
  selectedAudio: audio
    ? { batchId: 'bgm', candidateId: 'desert-v1', assetRevision: ref.revision, format: 'wav', asset: ref }
    : null
})
const bgm: FeedbackSubject = {
  kind: 'audio',
  batchId: 'bgm',
  candidateId: 'desert-v1',
  eventId: 'bgm_desert',
  category: 'bgm',
  unit: null,
  field: 'desert',
  asset: ref
}
function setup(draft?: unknown, saved = new Map<string, string>()) {
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
  if (draft) saved.set('audit-draft', JSON.stringify(draft))
  vi.stubGlobal('localStorage', {
    getItem: (key: string) => saved.get(key) ?? null,
    setItem: (key: string, v: string) => saved.set(key, v)
  })
  const fetch = vi.fn().mockRejectedValue(new Error('synthetic uncertain network failure'))
  vi.stubGlobal('fetch', fetch)
  const panel = new TicketPanel(dialog, 'synthetic-csrf', 'audit-draft')
  return { panel, field, saved, fetch, stored: () => JSON.parse(saved.get('audit-draft')!) }
}
afterEach(() => vi.unstubAllGlobals())
it('unsent target remains frozen when a different role is offered', () => {
  const f = setup()
  f.panel.open(context('soldier'), [])
  f.field('ticket-title').value = '[SYNTHETIC] soldier'
  f.field('ticket-text').value = 'text'
  f.panel.open(context('healer'), [])
  expect(f.stored().context.role).toBe('soldier')
  expect(f.field('ticket-context').textContent).toContain('soldier / soldier-v1')
})
it('uncertain retries preserve exact body and ID despite later offered context', async () => {
  const f = setup()
  f.panel.open(context('soldier'), [])
  f.field('ticket-title').value = '[SYNTHETIC] soldier'
  f.field('ticket-text').value = 'text'
  await (f.panel as any).submit()
  const original = f.fetch.mock.calls[0][1]
  f.panel.open(context('healer'), [])
  await (f.panel as any).submit()
  expect(f.fetch.mock.calls[1][1].body).toBe(original.body)
  expect(f.fetch.mock.calls[1][1].headers['Idempotency-Key']).toBe(original.headers['Idempotency-Key'])
})
it('reload preserves audio subject independently of visible role and offered category', async () => {
  const f = setup()
  f.panel.open(context('soldier', true), [ref], bgm)
  f.field('ticket-title').value = '[SYNTHETIC] desert'
  f.field('ticket-text').value = 'text'
  await (f.panel as any).submit()
  const original = f.fetch.mock.calls[0][1].body
  const reloaded = setup(undefined, f.saved)
  reloaded.panel.open(context('healer', true), [ref], { ...bgm, eventId: 'ui_click', category: 'ui', field: null })
  expect(reloaded.field('ticket-context').textContent).toContain('bgm_desert')
  expect(reloaded.field('ticket-context').textContent).not.toContain('ui_click')
  await (reloaded.panel as any).submit()
  expect(reloaded.fetch.mock.calls[0][1].body).toBe(original)
})
it('legacy text without a target cannot submit until explicit binding', async () => {
  const f = setup({ title: '[SYNTHETIC] old draft', text: 'text', submissionId: crypto.randomUUID() })
  f.panel.open(context('healer'), [])
  expect(f.field('ticket-bind').hidden).toBe(false)
  expect(f.field('ticket-submit').disabled).toBe(true)
  await (f.panel as any).submit()
  expect(f.fetch).not.toHaveBeenCalled()
  f.field('ticket-bind').onclick()
  expect(f.stored().context.role).toBe('healer')
  await (f.panel as any).submit()
  expect(f.fetch).toHaveBeenCalledTimes(1)
})
it('legacy pending submission remains byte-equivalent and does not acquire offered subject', async () => {
  const id = crypto.randomUUID()
  const pending = {
    schemaVersion: 1,
    clientSubmissionId: id,
    title: '[SYNTHETIC] legacy',
    text: 'text',
    context: context('soldier'),
    attachments: [],
    intent: 'explicit-user-submit'
  }
  const f = setup({ title: pending.title, text: pending.text, submissionId: id, pending })
  f.panel.open(context('healer', true), [ref], bgm)
  await (f.panel as any).submit()
  expect(f.fetch.mock.calls[0][1].body).toBe(JSON.stringify(pending))
  expect(f.field('ticket-context').textContent).toContain('soldier / soldier-v1')
})
