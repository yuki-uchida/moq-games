const swatch = (kind: string, glyph = '') => `<i class="sw sw-${kind}" aria-hidden="true">${glyph}</i>`
const row = (mark: string, text: string) => `<li>${mark}<span>${text}</span></li>`
const guide = `<h3>タイル</h3><ul class="legend-list">${[
  row(swatch('move'), '青 = 移動できるマス'),
  row(swatch('reach'), '赤 = 攻撃が届く範囲'),
  row(swatch('target'), '赤く光る枠 = 攻撃できる敵'),
  row(swatch('heal'), '緑 = 回復できる味方'),
  row(swatch('enemy-move'), '青紫 = 敵の移動範囲（敵にカーソル / タップ）'),
  row(swatch('danger'), '黄色の斜線 = 敵の攻撃範囲（☷ 危険範囲）'),
  row(swatch('seize', '✦'), '✦ = 制圧目標')
].join('')}</ul><h3>頭上の表示</h3><ul class="legend-list">${[
  row('<b class="mk ally">◆</b>', '青 = 味方のHP'),
  row('<b class="mk foe">▼</b>', '赤 = 敵のHP'),
  row('<b class="mk">✓</b>', '= 行動済み'),
  row('<b class="mk">⬡</b>', '= 盾（物理ダメージ −2）'),
  row('<b class="mk">♛</b>', '= ボス'),
  row('<b class="mk foe">−N</b>', '= 攻撃したときのダメージ予測')
].join(
  ''
)}</ul><h3>画面上部</h3><p>ターンとフェイズ、勝利条件、味方と敵の残り数を表示します。下部の案内行が、次にすべき操作を示します。</p><h3>能力</h3><ul class="legend-list">${[
  row('<b class="mk">攻撃</b>', 'ダメージの基本値'),
  row('<b class="mk">防御</b>', '受けるダメージを軽減'),
  row('<b class="mk">射程</b>', '攻撃が届くマス数'),
  row('<b class="mk">移動</b>', '1ターンに進めるマス数'),
  row('<b class="mk">盾</b>', '物理ダメージを軽減（魔法は無視）')
].join('')}</ul>`
const sections: string[][] = [
  [
    '☝ 操作',
    '味方を選び、青いマスへ移動。敵を選び、予測を確認して攻撃します。↶ 戻すで移動を取り消せます。青いマス以外を選ぶと選択を解除、攻撃できない敵を選ぶとその敵の行動範囲を表示します。✓ 待機、▶ ターン終了。敵フェイズは⏩で早送り。',
    'Tab で盤面へ、矢印でマス移動、Enter / Space で選択、Escape で取消。+ / − / 0 で拡大・縮小・全体表示。',
    '盤面右下のボタン、ホイール、ピンチで拡大縮小し、ドラッグで見回せます。味方を選ぶと、その移動範囲に寄ります。',
    'つづきからは、最後に記録された味方ターン開始時から再開します。',
    'タッチでは長押しでユニット詳細。マスが小さいときは ⊞ をオンにすると、タップしたマスと周囲を大きなボタンから選べます。'
  ],
  ['▦ 画面の見かた', guide],
  [
    '⚔ ルール',
    '各味方は移動と攻撃を各１回行えます。攻撃・回復・薬の使用後は行動終了。敵の攻撃範囲は ☷ 危険範囲 で表示します。',
    '木立は被ダメージ −2、岩は通行不可。攻撃は岩越しにも届き、反撃はありません。'
  ],
  [
    '♜ 兵種と相性',
    '剣はゴブリンに +1、弓は狼に +3。盾は物理 −2、魔法は盾を無視。',
    '第４章から癒し手が参加。杖は距離１〜２の負傷した味方を回復します。'
  ],
  [
    '⚑ 勝利条件',
    '６章を踏破しましょう。敵全滅のほか、第４章は制圧（✦の祠に味方を置いたまま味方フェイズを終えると制圧）、第５章は６ターン防衛、第６章はボス撃破でも勝利。',
    '味方全滅で敗北。⚑ から到達済みの章に再挑戦できます。'
  ],
  [
    '✦ 成長とロスト',
    '攻撃・撃破・回復で EXP を獲得し、100 でレベルアップ。回復薬は各章２個、使用者を８回復します。',
    'カジュアルでは倒れた仲間は次章に復帰。クラシックでは勝利後に永久離脱します。敗北や再挑戦では章開始時に戻ります。'
  ]
]

export function setupHelp(dialog: HTMLDialogElement) {
  document.body.append(dialog)
  dialog.innerHTML = `<h2 id="help-title">遊び方</h2><div role="tablist" aria-label="遊び方の項目">${sections.map(([label], index) => `<button role="tab" id="help-tab-${index}" aria-controls="help-panel-${index}" aria-selected="${index === 0}" tabindex="${index === 0 ? 0 : -1}">${label}</button>`).join('')}</div>${sections.map(([, ...paragraphs], index) => `<section role="tabpanel" id="help-panel-${index}" aria-labelledby="help-tab-${index}" ${index ? 'hidden' : ''}>${paragraphs.map((text) => (text.startsWith('<h3>') ? text : `<p>${text}</p>`)).join('')}</section>`).join('')}<button id="help-close">戻る</button>`
  const tabs = Array.from(dialog.querySelectorAll<HTMLButtonElement>('[role=tab]'))
  const panels = Array.from(dialog.querySelectorAll<HTMLElement>('[role=tabpanel]'))
  function select(index: number) {
    tabs.forEach((tab, current) => {
      tab.setAttribute('aria-selected', String(current === index))
      tab.tabIndex = current === index ? 0 : -1
      panels[current].hidden = current !== index
    })
    tabs[index].focus()
  }
  tabs.forEach((tab, index) => {
    tab.onclick = () => select(index)
    tab.onkeydown = (event) => {
      if (!['ArrowLeft', 'ArrowRight', 'Home', 'End'].includes(event.key)) return
      event.preventDefault()
      select(
        event.key === 'Home'
          ? 0
          : event.key === 'End'
            ? tabs.length - 1
            : (index + (event.key === 'ArrowRight' ? 1 : tabs.length - 1)) % tabs.length
      )
    }
  })
  dialog.querySelector<HTMLButtonElement>('#help-close')!.onclick = () => dialog.close()
  let opener: HTMLElement | null = null
  dialog.onclose = () => opener?.focus()
  return () => {
    opener = document.activeElement as HTMLElement | null
    dialog.showModal()
    select(0)
  }
}
