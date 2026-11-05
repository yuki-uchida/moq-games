import { campaign } from './campaign'
import { key, type Game, type Unit } from './game'
import { roleNames } from './hud'

const role = (unit: Unit) => roleNames[unit.role] ?? unit.role
const pct = (value: number, max: number) => Math.max(0, Math.min(100, (value / Math.max(1, max)) * 100))
const img = (src: string) => (src ? `<img class="portrait" alt="" src="${src}">` : '')

/** Short rule reminders for one unit. */
export function unitNotes(unit: Unit): string[] {
  const notes: string[] = []
  if (unit.boss) notes.push('♛ ボス')
  if (unit.side === 'ally') {
    if (unit.heal) notes.push(`杖：距離1〜2の味方を ${unit.heal} 回復`)
    else if (unit.role === 'archer') notes.push('狼に +3')
    else if (unit.role === 'soldier') notes.push('ゴブリンに +1')
    else if (unit.role === 'mage') notes.push('魔法は盾を無視')
  } else {
    if (unit.role === 'wolf') notes.push('弓に弱い（+3）')
    else if (unit.role === 'goblin') notes.push('剣に弱い（+1）')
    if (unit.armor) notes.push(`盾：物理ダメージ −${unit.armor}（魔法は無視）`)
    if (unit.ai === 'hold') notes.push('その場から動かない')
    else if (unit.ai === 'guard' && !unit.alerted) notes.push('近づくか攻撃されるまで待機')
  }
  return notes
}

/** Compact summary card for the console. */
export function unitCardHtml(unit: Unit, portraitSrc: string): string {
  const low = unit.hp <= unit.max / 3
  const note = unitNotes(unit).find((n) => n !== '♛ ボス')
  return `${img(portraitSrc)}<div class="uc-main"><p class="uc-head"><b class="uc-name">${unit.name}</b> <span class="uc-class">${role(unit)}</span> <span class="uc-lv">Lv${unit.level}</span>${unit.boss ? ' <span class="uc-boss">♛ ボス</span>' : ''}</p><p class="uc-hp${low ? ' low' : ''}"><span class="uc-label">HP</span> <i class="uc-bar"><em style="width:${pct(unit.hp, unit.max)}%"></em></i> <b>${unit.hp}/${unit.max}</b></p></div><dl class="uc-stats"><div><dt>攻撃</dt> <dd>${unit.power}</dd></div> <div><dt>防御</dt> <dd>${unit.def}</dd></div> <div><dt>射程</dt> <dd>${unit.range}</dd></div> <div><dt>移動</dt> <dd>${unit.move}</dd></div>${unit.armor ? ` <div><dt>盾</dt> <dd>${unit.armor}</dd></div>` : ''}${unit.side === 'ally' ? ` <div class="uc-exp"><dt>EXP</dt> <dd>${unit.exp}/100</dd></div>` : ''}</dl>${note ? `<p class="uc-note">${note}</p>` : ''}`
}

export type ForecastCard = {
  attacker: Unit
  target: Unit
  attackerSrc: string
  targetSrc: string
  healing: boolean
  after: number
  /** Attack damage as shown on the board and in the log (may exceed the HP actually lost). */
  damage?: number
  chips: string[]
}

/** Two-sided attack / heal forecast. */
export function forecastHtml({
  attacker,
  target,
  attackerSrc,
  targetSrc,
  healing,
  after,
  damage,
  chips
}: ForecastCard): string {
  const amount = healing ? after - target.hp : target.hp - after
  const keep = healing ? target.hp : after
  const unitBox = (u: Unit, src: string, cls: string, hp: string, bar = '') =>
    `<div class="fc-unit ${cls}">${img(src)}<div><b>${u.name}</b><small>${role(u)} Lv${u.level}</small><span class="fc-hp">${hp}</span>${bar}</div></div>`
  const bar = `<i class="fc-bar"><em class="fc-keep" style="width:${pct(keep, target.max)}%"></em><em class="fc-change" style="width:${pct(amount, target.max)}%"></em></i>`
  const mods = healing
    ? `<span class="modifier base">杖 +${attacker.heal ?? 0}</span>`
    : `<span class="modifier base">攻撃 ${attacker.power}</span>${chips.map((chip) => `<span class="modifier">${chip}</span>`).join('')}<span class="modifier note">反撃なし</span>`
  return `<p class="fc-title">${healing ? '回復予測' : '攻撃予測'}</p><div class="fc-grid">${unitBox(attacker, attackerSrc, 'ally', `HP ${attacker.hp}/${attacker.max}`)}<div class="fc-mid"><strong class="fc-amount">${healing ? '+' : '−'}${healing ? amount : (damage ?? amount)}</strong><small>${healing ? '回復' : 'ダメージ'}</small>${!healing && after === 0 ? '<mark class="fc-ko">撃破</mark>' : ''}</div>${unitBox(target, targetSrc, `target ${target.side}`, `HP ${target.hp} → ${after}`, bar)}</div><div class="fc-mods">${mods}</div><div class="fc-actions"><button id="confirm">${healing ? '回復' : '攻撃'}</button><button id="cancel-forecast">やめる</button></div>`
}

/** Full unit sheet for the detail dialog. */
export function detailHtml(unit: Unit, portraitSrc: string): string {
  const notes = unitNotes(unit)
  const stat = (name: string, value: number, hint: string) =>
    `<div><dt>${name}</dt><dd>${value}</dd><small>${hint}</small></div>`
  return `<header class="dt-head">${img(portraitSrc)}<div><h2 id="detail-title">${unit.name}</h2><p>${role(unit)} · Lv ${unit.level} · ${unit.side === 'ally' ? '味方' : '敵'}${unit.boss ? ' · ♛ ボス' : ''}</p></div></header><p class="dt-hp ${unit.side}"><span>HP</span> <i class="uc-bar"><em style="width:${pct(unit.hp, unit.max)}%"></em></i> <b>${unit.hp}/${unit.max}</b></p>${unit.side === 'ally' ? `<label class="dt-exp">EXP ${unit.exp}/100 <progress max="100" value="${unit.exp}"></progress></label>` : ''}<dl class="dt-stats">${stat('攻撃', unit.power, unit.heal ? '攻撃はしない（杖で回復）' : 'ダメージの基本値')}${stat('防御', unit.def, '受けるダメージを軽減')}${stat('射程', unit.range, unit.heal ? '回復が届くマス数' : '攻撃が届くマス数')}${stat('移動', unit.move, '1ターンに進めるマス数')}${stat('盾', unit.armor ?? 0, '物理ダメージを軽減')}</dl>${notes.length ? `<ul class="dt-notes">${notes.map((n) => `<li>${n}</li>`).join('')}</ul>` : ''}`
}

/** One-line description of the terrain under a cell. */
export function terrainText(game: Game, x: number, y: number): string {
  const k = key(x, y)
  const objective = campaign[game.stage].objective
  if (objective.type === 'seize' && objective.x === x && objective.y === y)
    return '✦ 祠 · 味方フェイズ終了時に味方がいれば制圧'
  if (game.rocks.has(k)) return game.stage === 2 ? '崩れた城壁 · 通れない' : '岩 · 通れない'
  if (game.groves.has(k)) return '♣ 木立 · 受けるダメージ −2'
  return '平地 · 効果なし'
}
