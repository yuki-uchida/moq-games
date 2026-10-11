import { json } from './api'
import { frozenDraftTarget, subjectLabel, type DraftTarget } from './DraftContext'
import type { AssetRef, FeedbackSubject, Submission, Ticket, ViewerContext } from './contracts'

export class TicketPanel {
  private context: ViewerContext | null = null
  private subject: FeedbackSubject | undefined
  private offered: DraftTarget | null = null
  private needsBinding = false
  private attachments: AssetRef[] = []
  private submissionId = crypto.randomUUID()
  private pending: Submission | null = null
  private lastTicketId: string | null = null
  constructor(
    private readonly dialog: HTMLDialogElement,
    private readonly csrf: string,
    private readonly draftKey = 'tower-debug-pilot:ticket-draft:v1'
  ) {
    this.field<HTMLButtonElement>('ticket-submit').onclick = () => void this.submit()
    this.field<HTMLButtonElement>('ticket-refresh').onclick = () => void this.refresh()
    this.field<HTMLButtonElement>('ticket-new').onclick = () => this.newDraft()
    this.field<HTMLButtonElement>('ticket-bind').onclick = () => {
      if (!this.offered) return
      this.setTarget(this.offered)
      this.needsBinding = false
      this.field<HTMLButtonElement>('ticket-bind').hidden = true
      this.field<HTMLButtonElement>('ticket-submit').disabled = false
      this.saveDraft()
      this.renderContext()
    }
    for (const id of ['ticket-title', 'ticket-text'])
      this.field<HTMLInputElement>(id).addEventListener('input', () => this.saveDraft())
    try {
      const draft = JSON.parse(localStorage.getItem(this.draftKey) ?? 'null')
      if (draft) {
        this.field<HTMLInputElement>('ticket-title').value = String(draft.title ?? '')
        this.field<HTMLTextAreaElement>('ticket-text').value = String(draft.text ?? '')
        this.submissionId = draft.submissionId ?? this.submissionId
        this.pending = draft.pending ?? null
        this.lastTicketId = draft.lastTicketId ?? null
        if (draft.context)
          this.setTarget({ context: draft.context, attachments: draft.attachments ?? [], subject: draft.subject })
        else if (draft.pending)
          this.setTarget({
            context: draft.pending.context,
            attachments: draft.pending.attachments,
            subject: draft.pending.subject
          })
        else if ((draft.title || draft.text) && !this.lastTicketId) this.needsBinding = true
      }
    } catch {
      this.status('下書きを復元できませんでした。原文を確認してください。')
    }
    this.lockFields(!!this.pending || !!this.lastTicketId)
    if (this.lastTicketId && !this.pending) {
      const button = this.field<HTMLButtonElement>('ticket-submit')
      button.disabled = true
      button.textContent = '保存済み'
    }
  }
  private field<T extends HTMLElement>(id: string): T {
    return this.dialog.querySelector(`#${id}`)! as T
  }
  private status(message: string): void {
    this.field('ticket-status').textContent = message
  }
  private setTarget(target: DraftTarget): void {
    const frozen = frozenDraftTarget(null, target)
    this.context = frozen.context
    this.attachments = frozen.attachments
    this.subject = frozen.subject
  }
  private renderContext(): void {
    const shown = this.pending?.context ?? this.context
    if (!shown) {
      this.field('ticket-context').textContent = '旧下書きには対象情報がありません。対象を確認して結び付けてください。'
      return
    }
    this.field('ticket-context').textContent =
      `${subjectLabel(this.pending?.subject ?? this.subject, shown)}\n${shown.motion ?? 'image'} / ${shown.direction ?? '—'} / ${Math.round(shown.timeMs ?? 0)} ms\n下書き作成時の対象を固定しています。別の対象は「新規下書き」から。`
  }
  open(context: ViewerContext, attachments: AssetRef[], subject?: FeedbackSubject): void {
    this.offered = structuredClone({ context, attachments, subject })
    if (!this.context && !this.needsBinding && !this.lastTicketId) this.setTarget(this.offered)
    this.field<HTMLButtonElement>('ticket-bind').hidden = !this.needsBinding
    if (this.needsBinding) this.field<HTMLButtonElement>('ticket-submit').disabled = true
    this.renderContext()
    this.saveDraft()
    this.dialog.showModal()
  }
  private saveDraft(): void {
    try {
      localStorage.setItem(
        this.draftKey,
        JSON.stringify({
          title: this.field<HTMLInputElement>('ticket-title').value,
          text: this.field<HTMLTextAreaElement>('ticket-text').value,
          submissionId: this.submissionId,
          pending: this.pending,
          lastTicketId: this.lastTicketId,
          context: this.context,
          attachments: this.attachments,
          subject: this.subject
        })
      )
    } catch {
      this.status('端末の下書き保存に失敗しました。本文をコピーして保管してください。')
    }
  }
  private lockFields(locked: boolean): void {
    this.field<HTMLInputElement>('ticket-title').disabled = locked
    this.field<HTMLTextAreaElement>('ticket-text').disabled = locked
  }
  private async submit(): Promise<void> {
    if (!this.context || this.needsBinding) return
    const button = this.field<HTMLButtonElement>('ticket-submit')
    if (button.disabled) return
    if (!this.pending) {
      const title = this.field<HTMLInputElement>('ticket-title').value.trim()
      const text = this.field<HTMLTextAreaElement>('ticket-text').value
      if (!title || !text.trim()) {
        this.status('件名と内容を入力してください')
        return
      }
      this.pending = {
        schemaVersion: 1,
        clientSubmissionId: this.submissionId,
        title,
        text,
        context: structuredClone(this.context),
        subject: this.subject ? structuredClone(this.subject) : undefined,
        attachments: structuredClone(this.attachments),
        intent: 'explicit-user-submit'
      }
    }
    this.saveDraft()
    this.lockFields(true)
    this.field<HTMLButtonElement>('ticket-new').disabled = true
    button.disabled = true
    this.status('ローカルに保存しています…')
    try {
      const ticket = await json<Ticket>('/api/v1/tickets', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-Debug-CSRF': this.csrf,
          'Idempotency-Key': this.pending.clientSubmissionId
        },
        body: JSON.stringify(this.pending)
      })
      this.lastTicketId = ticket.ticketId
      this.show(ticket)
      this.pending = null
      this.saveDraft()
      button.textContent = '保存済み'
    } catch (error) {
      this.status(`${String(error)}\n同じ内容・同じIDで再試行できます。保存済みでも重複作成しません。`)
      button.disabled = false
    } finally {
      this.field<HTMLButtonElement>('ticket-new').disabled = false
    }
  }
  private show(ticket: Ticket): void {
    const receipt = ticket.parentReceipts.at(-1)
    this.status(
      receipt
        ? `担当からの受領記録あり（実行担当が記録）\n${ticket.ticketId}\n${receipt.parentMessageRef}\n${receipt.summary}`
        : `ローカル保存済み・担当の受領は未確認\n${ticket.ticketId}\n${ticket.status}`
    )
    this.field('ticket-result').textContent = JSON.stringify(
      {
        ticketId: ticket.ticketId,
        revision: ticket.revision,
        submissionSha256: ticket.submissionSha256,
        submittedAt: ticket.submittedAt,
        parentReceiptCount: ticket.parentReceipts.length
      },
      null,
      2
    )
  }
  private async refresh(): Promise<void> {
    try {
      if (this.lastTicketId) this.show(await json<Ticket>(`/api/v1/tickets/${this.lastTicketId}`))
      else {
        const list = await json<{
          tickets: { title: string; ticketId: string; status: string }[]
        }>('/api/v1/tickets')
        this.field('ticket-result').textContent = list.tickets.length
          ? list.tickets.map((ticket) => `${ticket.title}\n${ticket.ticketId} / ${ticket.status}`).join('\n\n')
          : '保存済みチケットはありません'
      }
    } catch (error) {
      this.status(String(error))
    }
  }
  private newDraft(): void {
    if (this.offered) this.setTarget(this.offered)
    this.needsBinding = false
    this.field<HTMLButtonElement>('ticket-bind').hidden = true
    this.pending = null
    this.lastTicketId = null
    this.renderContext()
    this.submissionId = crypto.randomUUID()
    this.lockFields(false)
    this.field<HTMLInputElement>('ticket-title').value = ''
    this.field<HTMLTextAreaElement>('ticket-text').value = ''
    const button = this.field<HTMLButtonElement>('ticket-submit')
    button.disabled = false
    button.textContent = 'この内容を送信'
    this.field('ticket-result').textContent = ''
    this.status('新しい下書き。以前の保存済みチケットは保持されます。')
    this.saveDraft()
  }
}
