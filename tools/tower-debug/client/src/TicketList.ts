import { assetUrl, json } from './api'
import type { AssetRef, Ticket } from './contracts'
import { subjectLabel } from './DraftContext'
const statuses: Record<string, string> = {
  unprocessed: '○ 未処理',
  in_progress: '◷ 対応中',
  awaiting_review: '◉ 確認待ち',
  completed: '✓ 完了'
}
type List = { tickets: { ticketId: string; title: string; status: string; revision: number }[]; next: number | null }
export class TicketList {
  private next: number | null = null
  private generation = 0
  constructor(private readonly dialog: HTMLDialogElement) {
    this.field('ticket-list-refresh').onclick = () => void this.refresh()
    this.field<HTMLSelectElement>('ticket-list-filter').onchange = () => void this.refresh()
    this.field('ticket-list-more').onclick = () => void this.refresh(this.next ?? 0)
    dialog.addEventListener('close', () => {
      this.generation++
      this.clearMedia()
    })
  }
  private field<T extends HTMLElement>(id: string) {
    return this.dialog.querySelector<T>(`#${id}`)!
  }
  private clearMedia(): void {
    for (const media of this.dialog.querySelectorAll<HTMLMediaElement>('audio,video')) {
      media.pause()
      media.removeAttribute('src')
      media.load()
    }
    this.field('ticket-detail').replaceChildren()
  }
  open(): void {
    this.dialog.showModal()
    void this.refresh()
  }
  private async refresh(after = 0): Promise<void> {
    const generation = ++this.generation
    this.clearMedia()
    const status = this.field<HTMLSelectElement>('ticket-list-filter').value
    try {
      const result = await json<List>(`/api/v1/tickets?after=${after}&limit=50${status ? `&status=${status}` : ''}`)
      if (generation !== this.generation) return
      const list = this.field('ticket-list')
      list.replaceChildren()
      for (const ticket of result.tickets) {
        const button = document.createElement('button')
        button.className = 'ticket-row'
        button.textContent = `${statuses[ticket.status] ?? ticket.status} · ${ticket.title} · v${ticket.revision}`
        button.onclick = () => void this.detail(ticket.ticketId)
        list.append(button)
      }
      this.next = result.next
      this.field<HTMLButtonElement>('ticket-list-more').hidden = this.next === null
      this.field('ticket-list-status').textContent = result.tickets.length
        ? `${after + 1}–${after + result.tickets.length}件`
        : 'チケットはありません'
    } catch (error) {
      this.field('ticket-list-status').textContent = String(error)
    }
  }
  private media(reference: AssetRef): HTMLElement {
    const wrapper = document.createElement('div')
    const label = document.createElement('p')
    label.className = 'detail preserve'
    label.textContent = `${reference.mimeType} · ${reference.revision}\nSHA ${reference.sha256}`
    wrapper.append(label)
    if (!/^(image|audio|video)\//.test(reference.mimeType)) return wrapper
    const button = document.createElement('button')
    button.textContent = `▶ 素材を開く (${(reference.bytes / 1048576).toFixed(1)} MiB)`
    button.onclick = () => {
      const url = assetUrl(reference)
      if (reference.mimeType.startsWith('image/')) {
        const image = document.createElement('img')
        image.alt = `チケット添付 ${reference.revision}`
        image.src = url
        image.className = 'ticket-media'
        wrapper.append(image)
      } else {
        const media = document.createElement(reference.mimeType.startsWith('video/') ? 'video' : 'audio')
        media.controls = true
        media.preload = 'none'
        media.src = url
        media.className = 'ticket-media'
        wrapper.append(media)
      }
      button.remove()
    }
    wrapper.append(button)
    return wrapper
  }
  private async detail(id: string): Promise<void> {
    const generation = ++this.generation
    this.clearMedia()
    try {
      const ticket = await json<Ticket>(`/api/v1/tickets/${id}`)
      if (generation !== this.generation) return
      const root = this.field('ticket-detail')
      const heading = document.createElement('h3')
      heading.textContent = ticket.originalSubmission.title
      const meta = document.createElement('p')
      meta.className = 'detail preserve'
      meta.textContent = `${statuses[ticket.status] ?? ticket.status} · v${ticket.revision}\n${ticket.ticketId}\n${subjectLabel(ticket.originalSubmission.subject, ticket.originalSubmission.context)}\n提出SHA ${ticket.submissionSha256}`
      const original = document.createElement('p')
      original.className = 'preserve'
      original.textContent = ticket.originalSubmission.text
      root.append(heading, meta, original)
      for (const reference of ticket.originalSubmission.attachments) root.append(this.media(reference))
      for (const result of ticket.results ?? []) {
        const section = document.createElement('section')
        section.className = 'ticket-result'
        const text = document.createElement('p')
        text.className = 'preserve'
        text.textContent = `結果 v${result.revision} · ${result.at}\n${result.conclusion}\n判定: ${result.decision}\n担当参照: ${result.parentMessageRef}`
        section.append(text)
        for (const reference of result.media) section.append(this.media(reference))
        root.append(section)
      }
      const history = document.createElement('details'),
        summary = document.createElement('summary'),
        text = document.createElement('p')
      summary.textContent = '受領・状態・採否の履歴'
      text.className = 'detail preserve'
      text.textContent =
        ticket.parentReceipts
          .map((r) => `${r.recordedAt} · ${r.summary} · ${r.parentMessageRef}`)
          .concat(
            (ticket.history ?? []).map(
              (h) =>
                `${h.sequence}. ${h.at} · v${h.revision} · ${h.event.kind}${h.event.from ? ` ${h.event.from} → ${h.event.to}` : ''}${h.event.decision ? ` ${h.event.decision}` : ''}\n${h.event.reason ?? ''}`
            )
          )
          .join('\n') || '担当の受領記録はまだありません'
      history.append(summary, text)
      root.append(history)
    } catch (error) {
      this.field('ticket-list-status').textContent = String(error)
    }
  }
}
