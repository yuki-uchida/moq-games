import { environmentPackAvailable } from './BuildAssets'
import { FORTIFICATIONS, type RoadItemPlacement } from './game/Fortifications'
import type { Equipment, RoadItem, RoadItemKind, UnitType } from './game/model'

const paths = {
  company: '<circle cx="12" cy="10" r="5"/><path d="M3 28v-5a9 9 0 0 1 18 0v5M23 7a5 5 0 0 1 0 10m1 4a7 7 0 0 1 5 7"/>',
  scout: '<circle cx="13" cy="13" r="8"/><path d="m19 19 10 10M9 13h8m-4-4v8"/>',
  sandbag: '<path d="M5 18h22v8H5zM8 9h17v9H8zM13 9V5h7v4M10 18v8m11-8v8"/>',
  spike: '<path d="M3 25h26M5 23l4-15 4 15m1 0 4-19 4 19m0 0 4-13 3 13"/>',
  mud: '<path d="M3 23c5-7 8 5 13-1s8 6 13-1M5 16c4-5 6 3 10-2s8 4 12-1M10 6v4m10-7v5"/>',
  weapon: '<path d="m9 24 15-15 3-6-6 3L6 21m1-5 9 9M4 28l6-6"/>',
  armor: '<path d="m16 3 11 4v9c0 6-7 11-11 13C12 27 5 22 5 16V7zM16 8v15M10 12h12"/>',
  gate: '<path d="M4 28V9h6V4h4v5h4V4h4v5h6v19M12 28V18a4 4 0 0 1 8 0v10M2 28h28"/>',
  cannon:
    '<path d="m5 12 20-7 3 9-21 4zM12 19l-3 7h14l-5-8"/><circle cx="9" cy="26" r="3"/><circle cx="23" cy="26" r="3"/>'
}

export function fortificationIcon(kind: keyof typeof paths): string {
  const fallback = `<svg class="fortification-icon" viewBox="0 0 32 32" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${paths[kind]}</svg>`
  if (!environmentPackAvailable || (kind !== 'sandbag' && kind !== 'spike' && kind !== 'mud')) return fallback
  const asset = kind === 'mud' ? 'mud' : `${kind}-intact-0`
  const src = `../../../tower-defense-art/environment-3d-trial/${asset}.png`
  return `<span class="item-model" aria-hidden="true">${fallback}<img data-item-art="${kind}" src="${src}" alt="" draggable="false" width="${kind === 'mud' ? 64 : 96}" height="${kind === 'mud' ? 48 : 96}"></span>`
}

export function initializeFortificationIcons(): void {
  for (const image of Array.from(document.querySelectorAll<HTMLImageElement>('img[data-item-art]'))) {
    const reveal = () => image.parentElement?.classList.add('art-ready')
    image.addEventListener('load', reveal, { once: true })
    if (image.complete && image.naturalWidth > 0) reveal()
  }
}

export const roadItemNames: Record<RoadItemKind, string> = { spike: 'まきびし', mud: 'ぬかるみ' }
export const equipmentNames: Record<Equipment, string> = { weapon: '武器', armor: '防具' }
export const equipmentEffects: Record<Equipment, string> = { weapon: '攻撃力 +20%', armor: '最大HP +30%' }
export function equipmentEffect(kind: Equipment, unitType?: UnitType): string {
  return kind === 'weapon' && unitType === 'healer' ? '回復量 +20%（18 → 21.6）' : equipmentEffects[kind]
}

export function roadItemStatus(item: RoadItem): string {
  return item.kind === 'spike'
    ? `HP ${Math.ceil(item.hp)} / ${item.maxHp} · 接触反撃 ${FORTIFICATIONS.spike.retaliation}`
    : `残り ${item.charges} / ${FORTIFICATIONS.mud.charges} 回 · 速度${Math.round(FORTIFICATIONS.mud.speedFactor * 100)}%・${FORTIFICATIONS.mud.duration}秒`
}

export function roadItemPlacementLabel(result: RoadItemPlacement, kind: RoadItemKind, fundsReason: string): string {
  const reasons = {
    phase: '道のアイテムは準備中だけ配置できます。',
    'invalid-point': '道の上を選んでください。',
    'off-road': '道のアイテムは道の上に配置してください。',
    'entry-clearance': '敵の入口からもう少し離してください。',
    'core-clearance': '王国の門からもう少し離してください。',
    'defender-overlap': '仲間の配置場所から離してください。',
    'barrier-overlap': '土のうやほかのアイテムから少し離してください。',
    'missing-barrier': '選択したアイテムはもうありません。もう一度選んでください。',
    unavailable: `道のアイテムは合計${FORTIFICATIONS.maxItems}個までです。`,
    outside: '戦場の道の上を選んでください。',
    obstacle: '障害物から離してください。',
    funds: fundsReason,
    'invalid-kind': 'この遠征では購入できません。'
  }
  return result.reason ? reasons[result.reason] : `ここに${roadItemNames[kind]}を配置`
}

export function equipmentReplacementDetail(current: Equipment, next: Equipment, unitType?: UnitType): string {
  return `${equipmentNames[current]}（${equipmentEffect(current, unitType)}） → ${equipmentNames[next]}（${equipmentEffect(next, unitType)}）。${FORTIFICATIONS.equipmentCost} Gを使います。元の装備は失われ、返金されません。残りHPの割合を保ち、回復はしません。`
}

export function gateUpgradePresentation(kind: 'cannon' | 'armor', level: number) {
  const name = kind === 'cannon' ? '門の大砲' : '門の装甲',
    cost = FORTIFICATIONS[kind].costs[level],
    nextLevel = Math.min(3, level + 1),
    effect =
      kind === 'cannon'
        ? `威力 ${level ? FORTIFICATIONS.cannon.damage[level - 1] : 0} → ${FORTIFICATIONS.cannon.damage[nextLevel - 1]} · 射程${FORTIFICATIONS.cannon.range} · ${FORTIFICATIONS.cannon.interval}秒ごと`
        : `被ダメージ軽減 ${level * 10}% → ${nextLevel * 10}% · HPは回復しません`
  return { name, cost, effect, label: cost === undefined ? '最大レベル' : `Lv.${nextLevel}へ · ${cost} G` }
}

export const equipmentControls = `<section id="equipment-actions" class="equipment-actions" aria-label="個別装備" hidden><p id="equipment-current" class="sr-only"></p><div class="context-actions">${(['weapon', 'armor'] as const).map((kind) => `<button id="equipment-${kind}" aria-describedby="equipment-hint">${fortificationIcon(kind)}<small id="equipment-${kind}-state">◈${FORTIFICATIONS.equipmentCost}</small></button>`).join('')}</div><p id="equipment-hint" class="sr-only" role="status"></p></section>`

export const roadItemControls = `${(['spike', 'mud'] as const).map((kind) => `<button id="item-${kind}" class="item-tool" aria-pressed="false" aria-label="${roadItemNames[kind]} · ${FORTIFICATIONS[kind].cost} G" title="${roadItemNames[kind]} · ${FORTIFICATIONS[kind].cost} G" hidden>${fortificationIcon(kind)}<small id="item-${kind}-count">◈${FORTIFICATIONS[kind].cost}</small></button>`).join('')}<button id="gate-toggle" class="item-tool" aria-controls="gate-panel" aria-expanded="false" aria-label="門の強化" title="門の強化" hidden>${fortificationIcon('gate')}<small id="gate-levels">0 / 0</small></button>`

export const fortificationDialogs = `<dialog id="fortification-confirm" class="panel settings" aria-labelledby="fortification-confirm-title"><h2 id="fortification-confirm-title"></h2><p id="fortification-confirm-detail"></p><div class="road-actions"><button id="fortification-confirm-cancel">戻る</button><button id="fortification-confirm-accept">確認して続ける</button></div></dialog><dialog id="gate-panel" class="panel settings gate-panel" aria-labelledby="gate-title"><div class="dialog-heading"><div><span class="eyebrow">KINGDOM GATE</span><h2 id="gate-title">門の強化</h2></div><button id="gate-close" class="close-button" aria-label="門の強化を閉じる">×</button></div><p class="dialog-intro">準備中に購入できます。強化は次のステージへ引き継ぎ、HPは回復しません。</p>${(['cannon', 'armor'] as const).map((kind) => `<section class="gate-upgrade"><div>${fortificationIcon(kind)}<b id="gate-${kind}-level"></b></div><p id="gate-${kind}-effect"></p><button id="gate-${kind}-upgrade" aria-describedby="gate-${kind}-reason"></button><p id="gate-${kind}-reason" class="hint" role="status"></p></section>`).join('')}</dialog>`
