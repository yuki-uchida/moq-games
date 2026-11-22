import type { CampaignLoadIssue } from '../progression/CampaignStorage'
import { archer, mage, soldier } from '../rendering/stack/designs'
import { stackPortrait } from '../rendering/stack/StackPortrait'

export function titleSaveStatus(hasRun: boolean, issue: CampaignLoadIssue, legacy: boolean): string {
  if (hasRun) return '保存した遠征を再開できます。'
  if (issue === 'storage-unavailable') return 'ブラウザーの保存領域にアクセスできません。Continue は利用できません。'
  if (issue) return '保存データを読み込めません。元データは変更していません。Continue は利用できません。'
  if (legacy) return 'New game に以前の仲間を引き継ぎます。'
  return '保存した遠征はありません。'
}

export function titleScreenMarkup(_artBase?: URL): string {
  // The three heroes are painted from their own sprite stacks, turned toward the menu.
  const figures = { soldier: stackPortrait(soldier, 384, { yaw: -0.5 }), archer: stackPortrait(archer, 384, { yaw: -0.8 }), mage: stackPortrait(mage, 384, { yaw: -0.3 }) }
  const portrait = (type: keyof typeof figures) => figures[type]
  return `<dialog id="title-screen" class="title-screen" aria-labelledby="game-title">
    <div class="title-atmosphere" aria-hidden="true"></div>
    <header class="title-topline"><a href="../../../index.html" aria-label="MoQ Games ホームへ戻る" title="MoQ Games ホームへ戻る">← <span class="sr-only">MoQ Games</span></a></header>
    <h1 id="game-title">キャッスル<br><span>ナイツ</span></h1>
    <div class="title-content">
      <nav class="title-menu" aria-label="Main menu">
        <button id="title-new" class="title-menu-primary" data-sfx="confirm"><span>New game</span><span aria-hidden="true">▶</span></button>
        <button id="title-continue" aria-describedby="title-save-status"><span>Continue</span><span aria-hidden="true">→</span></button>
      </nav><p id="title-save-status" class="title-save-status" role="status"></p>
    </div>
    <div class="title-party" aria-hidden="true">
      <div class="title-landscape"><canvas id="title-landscape" width="900" height="700"></canvas></div>
      <div class="title-ground"></div>
      <img class="title-character title-archer" src="${portrait('archer')}" alt="">
      <img class="title-character title-mage" src="${portrait('mage')}" alt="">
      <img class="title-character title-soldier" src="${portrait('soldier')}" alt="">
    </div>
  </dialog>`
}
