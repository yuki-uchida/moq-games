import { json, LocalRequestError } from './api'
import type { AudioCandidate, AudioReviews, Catalog, ReviewStatus } from './contracts'
import { DebugAudio } from './DebugAudio'
import { randomSelected, reviewKey, reviewStatus } from './AudioReview'

const labels: Record<ReviewStatus, string> = {
  pending: '○ 未判定',
  held: 'Ⅱ 保留',
  selected: '✓ 選択',
  excluded: '⊘ 除外'
}
const e = <T extends HTMLElement>(id: string) => document.getElementById(id)! as T
export class AudioPanel {
  private reviews: AudioReviews = { generation: 0, decisions: {}, regeneration: [] }
  private current: AudioCandidate | null = null
  private pending: { path: string; body: unknown } | null = null
  private busy = false
  private pendingKey: string
  constructor(
    private readonly catalog: Catalog,
    private readonly csrf: string,
    private readonly se: DebugAudio,
    private readonly bgm: DebugAudio,
    private readonly onSelection: (candidate: AudioCandidate | null, format: 'wav' | 'raw_wav') => void,
    private readonly pause: () => void
  ) {
    this.pendingKey = catalog.syntheticTestStore
      ? 'tower-debug-synthetic:audio-review-pending:v1'
      : 'tower-debug:audio-review-pending:v1'
    for (const category of ['combat', 'ui', 'bgm']) {
      const option = e<HTMLSelectElement>('audio-category').querySelector<HTMLOptionElement>(`[value=${category}]`)!
      const count = catalog.audio.filter((c) => (c.category ?? 'combat') === category).length
      option.textContent = `${category === 'combat' ? '戦闘' : category === 'ui' ? 'UI・進行' : 'フィールドBGM'} ${count}`
    }
    this.current = catalog.audio.find((c) => c.eventId === 'wolf_attack') ?? catalog.audio[0] ?? null
    for (const id of ['audio-category', 'audio-event', 'audio-review-filter']) {
      e<HTMLSelectElement>(id).onchange = () => {
        this.stop()
        this.current = null
        this.onSelection(null, 'wav')
        if (id === 'audio-category') this.events()
        this.render()
      }
    }
    e('audio-random').onclick = () => {
      const selected = randomSelected(this.catalog.audio, this.reviews, e<HTMLSelectElement>('audio-event').value)
      if (!selected) return this.status('このイベントに選択済み候補がありません')
      this.audition(selected, 'wav')
    }
    e('audio-review-refresh').onclick = () => void this.refresh()
    e('audio-review-retry').onclick = () => void this.retry()
    e('regeneration-submit').onclick = () => void this.regenerate()
    e('audio-stop').onclick = () => this.stop()
    e<HTMLInputElement>('bgm-volume').oninput = () => {
      bgm.setVolume(Number(e<HTMLInputElement>('bgm-volume').value))
      this.savePreferences()
    }
    e<HTMLInputElement>('bgm-mute').onchange = () => {
      bgm.setMuted(e<HTMLInputElement>('bgm-mute').checked)
      this.savePreferences()
    }
    e<HTMLDialogElement>('audio-dialog').addEventListener('close', () => {
      this.stop()
    })
    try {
      const saved = JSON.parse(localStorage.getItem(this.pendingKey) ?? 'null')
      if (saved && ['/api/v1/audio-reviews', '/api/v1/regeneration'].includes(saved.path)) this.pending = saved
      const preferences = JSON.parse(localStorage.getItem('tower-debug:bgm:v1') ?? 'null')
      if (preferences) {
        bgm.setVolume(preferences.volume)
        bgm.setMuted(!!preferences.muted)
        e<HTMLInputElement>('bgm-volume').value = String(bgm.volume)
        e<HTMLInputElement>('bgm-mute').checked = bgm.muted
      }
    } catch {
      this.status('保存済みの設定を復元できませんでした')
    }
    this.events()
    if (this.current) e<HTMLSelectElement>('audio-event').value = this.current.eventId
    this.render()
  }
  private savePreferences(): void {
    try {
      localStorage.setItem('tower-debug:bgm:v1', JSON.stringify({ volume: this.bgm.volume, muted: this.bgm.muted }))
    } catch {}
  }
  private status(text: string): void {
    e('audio-review-status').textContent = text
  }
  private events(): void {
    const select = e<HTMLSelectElement>('audio-event')
    const category = e<HTMLSelectElement>('audio-category').value
    const events = [
      ...new Set(this.catalog.audio.filter((c) => (c.category ?? 'combat') === category).map((c) => c.eventId))
    ]
    select.replaceChildren(...events.map((event) => new Option(event.replaceAll('_', ' '), event)))
  }
  open(): void {
    e<HTMLDialogElement>('audio-dialog').showModal()
    void this.refresh()
  }
  stop(): void {
    this.se.stop()
    this.bgm.stop()
  }
  private audition(candidate: AudioCandidate, format: 'wav' | 'raw_wav'): void {
    this.pause()
    this.stop()
    this.current = candidate
    this.onSelection(candidate, format)
    const player = candidate.category === 'bgm' ? this.bgm : this.se
    const loop = candidate.category === 'bgm' && format === 'wav' && e<HTMLInputElement>('bgm-loop').checked
    void player.auditionFromGesture(candidate.files[format], loop).catch((error) => this.status(String(error)))
    this.render()
  }
  private render(): void {
    const category = e<HTMLSelectElement>('audio-category').value
    const eventId = e<HTMLSelectElement>('audio-event').value
    const filter = e<HTMLSelectElement>('audio-review-filter').value
    const candidates = this.catalog.audio.filter((c) => (c.category ?? 'combat') === category && c.eventId === eventId)
    const container = e('audio-candidates')
    container.replaceChildren()
    e('audio-count').textContent = `${this.catalog.audio.length}候補 · ${candidates.length}件 / event`
    e('bgm-controls').hidden = category !== 'bgm'
    for (const candidate of candidates.filter((c) => filter === 'all' || reviewStatus(c, this.reviews) === filter)) {
      const row = document.createElement('article')
      row.className = 'candidate'
      row.dataset.candidate = candidate.candidateId
      row.dataset.state = reviewStatus(candidate, this.reviews)
      const label = document.createElement('label')
      const radio = document.createElement('input')
      radio.type = 'radio'
      radio.name = 'candidate'
      radio.checked = this.current === candidate
      radio.setAttribute('aria-label', `候補${candidate.variant}を比較対象にする`)
      radio.onclick = () => {
        this.stop()
        this.current = candidate
        this.onSelection(candidate, 'wav')
      }
      const text = document.createElement('span')
      text.textContent = `候補${candidate.variant} · ${(candidate.durationMs / 1000).toFixed(3)} s`
      const state = document.createElement('small')
      state.textContent = `${labels[reviewStatus(candidate, this.reviews)]} · ゲーム未採用`
      text.append(state)
      if (candidate.reviewFlags.length) {
        const warning = document.createElement('small')
        warning.className = 'warning'
        warning.textContent = `⚠ ${candidate.reviewFlags.join(' / ')}`
        text.append(warning)
      }
      label.append(radio, text)
      row.append(label)
      for (const [format, title] of [
        ['wav', '▶ 加工'],
        ['raw_wav', '▶ Raw']
      ] as const) {
        const button = document.createElement('button')
        button.textContent = title
        button.setAttribute(
          'aria-label',
          `候補${candidate.variant}の${format === 'wav' ? '加工済み' : '未加工'}音声を試聴`
        )
        button.onclick = () => this.audition(candidate, format)
        row.append(button)
      }
      const choiceLabel = document.createElement('label')
      choiceLabel.className = 'review-choice'
      choiceLabel.append('判定')
      const choice = document.createElement('select')
      for (const [value, label] of Object.entries(labels)) choice.add(new Option(label, value))
      choice.value = reviewStatus(candidate, this.reviews)
      choice.disabled = this.busy || !!this.pending
      choice.setAttribute('aria-label', `候補${candidate.variant}の判定`)
      choice.onchange = () => void this.decide(candidate, choice.value as ReviewStatus)
      choiceLabel.append(choice)
      row.append(choiceLabel)
      const info = document.createElement('details')
      const summary = document.createElement('summary')
      summary.textContent = '履歴・生成情報'
      const body = document.createElement('p')
      body.className = 'detail preserve'
      const history = this.reviews.decisions[reviewKey(candidate)]?.history ?? []
      body.textContent = `${candidate.candidateId}\n${candidate.batchId}\nSHA ${candidate.files.wav.sha256}\nSeed ${candidate.seed} · Model ${candidate.modelRevision}\n${candidate.prompt}\n${candidate.reviewFlags.join(' / ')}\n${history.map((h) => `${h.at} · ${labels[h.from]} → ${labels[h.status]} · v${h.revision}`).join('\n') || '判定履歴なし'}\n試聴品質・BGMの音楽的つながりは人の確認が必要です。`
      info.append(summary, body)
      row.append(info)
      container.append(row)
    }
    if (!container.childElementCount) container.textContent = 'この条件に候補はありません'
    e<HTMLButtonElement>('audio-random').disabled = !candidates.some(
      (c) => reviewStatus(c, this.reviews) === 'selected'
    )
    e<HTMLButtonElement>('audio-review-retry').hidden = !this.pending
    e<HTMLButtonElement>('audio-review-retry').disabled = this.busy
    e<HTMLButtonElement>('regeneration-submit').disabled = this.busy || !!this.pending
    const queue = e('regeneration-list')
    queue.replaceChildren()
    for (const request of this.reviews.regeneration
      .filter((r) => r.eventId === eventId)
      .slice(-20)
      .reverse()) {
      const p = document.createElement('p')
      p.className = 'detail preserve'
      p.textContent = `○ キュー保存済み・生成未実行\n${request.submittedAt}\n${request.prompt}`
      queue.append(p)
    }
  }
  private async refresh(): Promise<void> {
    try {
      this.reviews = await json<AudioReviews>('/api/v1/audio-reviews')
      this.render()
    } catch (error) {
      this.status(String(error))
    }
  }
  private async decide(candidate: AudioCandidate, status: ReviewStatus): Promise<void> {
    if (this.busy || this.pending) return
    this.pending = {
      path: '/api/v1/audio-reviews',
      body: {
        schemaVersion: 1,
        actionId: crypto.randomUUID(),
        batchId: candidate.batchId,
        candidateId: candidate.candidateId,
        asset: candidate.files.wav,
        expectedRevision: this.reviews.decisions[reviewKey(candidate)]?.revision ?? 0,
        status,
        intent: 'explicit-user-review'
      }
    }
    await this.retry()
  }
  private async regenerate(): Promise<void> {
    if (this.busy || this.pending) return
    const prompt = e<HTMLTextAreaElement>('regeneration-prompt').value.trim()
    if (!prompt) return this.status('生成したい音の説明を入力してください')
    const eventId = e<HTMLSelectElement>('audio-event').value
    this.pending = {
      path: '/api/v1/regeneration',
      body: {
        schemaVersion: 1,
        actionId: crypto.randomUUID(),
        eventId,
        prompt,
        candidates: this.catalog.audio
          .filter((c) => c.eventId === eventId)
          .map((c) => ({ batchId: c.batchId, candidateId: c.candidateId, asset: c.files.wav })),
        intent: 'explicit-user-regeneration-request'
      }
    }
    await this.retry()
  }
  private async retry(): Promise<void> {
    if (!this.pending || this.busy) return
    this.busy = true
    try {
      localStorage.setItem(this.pendingKey, JSON.stringify(this.pending))
    } catch {}
    this.render()
    try {
      this.reviews = await json<AudioReviews>(this.pending.path, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'X-Debug-CSRF': this.csrf },
        body: JSON.stringify(this.pending.body)
      })
      const queued = this.pending.path.endsWith('/regeneration')
      this.pending = null
      try {
        localStorage.removeItem(this.pendingKey)
      } catch {}
      this.status(
        queued
          ? 'キューに保存しました。生成はまだ実行されていません。'
          : '判定をローカル保存しました。判定メニューで戻せます。'
      )
      if (queued) e<HTMLTextAreaElement>('regeneration-prompt').value = ''
    } catch (error) {
      if (error instanceof LocalRequestError && error.status === 409 && error.code === 'revision-conflict') {
        this.pending = null
        try {
          localStorage.removeItem(this.pendingKey)
        } catch {}
        await this.refresh()
        this.status('別の画面で判定が変わりました。最新の判定を確認してから選び直してください。')
      } else this.status(`${String(error)}。同じIDで保存状況を再確認できます。`)
    } finally {
      this.busy = false
      this.render()
    }
  }
}
