import type { CampaignLoadIssue } from '../progression/CampaignStorage'

export function titleSaveStatus(hasRun: boolean, issue: CampaignLoadIssue, legacy: boolean): string {
  if (hasRun) return '保存した遠征を再開できます。'
  if (issue === 'storage-unavailable') return 'ブラウザーの保存領域にアクセスできません。Continue は利用できません。'
  if (issue) return '保存データを読み込めません。元データは変更していません。Continue は利用できません。'
  if (legacy) return 'New game に以前の仲間を引き継ぎます。'
  return '保存した遠征はありません。'
}

export function titleScreenMarkup(artBase: URL): string {
  const portrait = (type: string) => new URL(`${type}/portrait.png`, artBase).href
  return `<dialog id="title-screen" class="title-screen" aria-labelledby="game-title">
    <div class="title-atmosphere" aria-hidden="true"><span class="title-orbit"></span><span class="title-hill title-hill-back"></span><span class="title-hill title-hill-front"></span></div>
    <header class="title-topline"><a href="../../../index.html">← MoQ Games</a></header>
    <div class="title-content">
      <h1 id="game-title">smart defence<br><span>with jev</span></h1>
      <nav class="title-menu" aria-label="Main menu">
        <button id="title-new" class="title-menu-primary"><span>New game</span><span aria-hidden="true">↗</span></button>
        <button id="title-continue" aria-describedby="title-save-status"><span>Continue</span><span aria-hidden="true">→</span></button>
        <a id="title-extra" href="./extra.html"><span>EXTRA</span><span aria-hidden="true">＋</span></a>
      </nav><p id="title-save-status" class="title-save-status" role="status"></p>
    </div>
    <div class="title-party" aria-hidden="true"><div class="title-party-halo"></div><img class="title-character title-archer" src="${portrait('archer')}" alt=""><img class="title-character title-soldier" src="${portrait('soldier')}" alt=""><img class="title-character title-mage" src="${portrait('mage')}" alt=""></div>
  </dialog>`
}
