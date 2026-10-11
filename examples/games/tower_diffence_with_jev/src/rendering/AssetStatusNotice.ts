export type AssetLoadStatus = 'ready' | 'loading' | 'error'

export const ASSET_NOTICE_TIMING = { delayMs: 250, minimumVisibleMs: 500 } as const

export class AssetStatusNotice {
  private loadingSince?: number
  private shownAt?: number

  constructor(private element: HTMLElement) {}

  update(status: AssetLoadStatus, nowMs: number, fighting: boolean): void {
    if (this.element.dataset.status !== status) this.element.dataset.status = status
    if (status === 'loading') this.loadingSince ??= nowMs
    else this.loadingSince = undefined
    const delayed = status === 'loading' && nowMs - this.loadingSince! >= ASSET_NOTICE_TIMING.delayMs
    const retaining = this.shownAt !== undefined && nowMs - this.shownAt < ASSET_NOTICE_TIMING.minimumVisibleMs
    const visible = status === 'error' || delayed || (this.shownAt !== undefined && status === 'loading') || retaining
    if (visible) this.shownAt ??= nowMs
    else this.shownAt = undefined
    this.element.hidden = !visible
    const text = !visible
      ? ''
      : status === 'error'
        ? 'キャラクター画像を読み込めません。戦闘を停止しました。ページを再読み込みしてください。'
        : status === 'ready'
          ? 'キャラクター画像の準備ができました'
          : fighting
            ? 'キャラクター画像を読み込み中… 戦闘は一時停止しています'
            : 'キャラクター画像を読み込み中…'
    if (this.element.textContent !== text) this.element.textContent = text
  }
}
