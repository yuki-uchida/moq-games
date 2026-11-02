import {
  allyTurnOver,
  attack,
  attackRange,
  beginAlly,
  beginEnemy,
  carry,
  createGame,
  damage,
  distance,
  enemyStep,
  finished,
  lost,
  missions,
  recover,
  key,
  move,
  reachable,
  seeded,
  size,
  type Roster,
  type Unit
} from './game'
import { chapterReport, clearProgress, presentFarewell, presentProgress } from './progress'
import './style.css'
import { ExpeditionAudio } from './audio'
import { BattleAnimation, depth, pause, snapshot } from './animation'
import { Stage } from './stage'
import { dangerZone, forecast } from './tactics'
import { bindUiSounds, playSharedUiSound, warmUpAudio } from '../../shared/UiSound'
let busy = false
let ready = false
// ?seed=N makes level-up rolls reproducible (tests); otherwise growth is random.
const seed = new URLSearchParams(location.search).get('seed')
const rng = () => (seed === null ? Math.random : seeded(Number(seed)))
/** Roster each mission starts from: index 0 is the fresh party, later ones are saved on victory. */
let checkpoints: (Roster | undefined)[] = []
/** Deployed allies (and those lost earlier) for a mission start or the mission list. */
const sortie = (stage: number) => {
  const away = lost(checkpoints[stage]).map((u) => u.name)
  const names = createGame(stage, 'balanced', checkpoints[stage])
    .units.filter((u) => u.side === 'ally')
    .map((u) => `${u.name} Lv${u.level}`)
  return `出撃 ${names.join('・')}${away.length ? `<span class="lost"> · 離脱 ${away.join('・')}</span>` : ''}`
}
const newGame = (stage: number, formation: 'balanced' | 'guard') => {
  const g = createGame(stage, formation, checkpoints[stage], rng())
  g.log = `${sortie(stage).replace(/<[^>]+>/g, '')} · ${g.log}`
  return g
}
let game = newGame(0, 'balanced'),
  selected: string | undefined,
  inspected: string | undefined,
  hovered: string | undefined,
  generation = 0
let danger = false
let pending: string | undefined
let undo: { id: string; x: number; y: number } | undefined
let focusCell = 0
let fast = false
let forecastTrigger: HTMLElement | null = null
let bannerVersion = 0
const app = document.querySelector<HTMLDivElement>('#app')!
app.innerHTML = `<main><header><div><small>DEATH GAIA · TACTICAL RPG</small><h1>デスガイヤ</h1></div><button id="sound" aria-label="音を無効にする" aria-pressed="true">♫</button><button id="help" aria-label="遊び方">?</button><button id="restart" aria-label="再プレイ">↻</button></header><section class="status"><button id="mission" aria-label="任務と編成">⚑ 01</button><strong id="turn"></strong><span id="count"></span></section><div class="field"><div id="board" aria-label="戦術盤"></div><div id="marks" aria-hidden="true"></div><div id="result" hidden><p id="outcome"></p><div id="report"></div><button id="next">次の任務 ▶</button></div></div><section class="console"><div id="selection"></div><div id="log" role="status" aria-live="polite"></div><nav><button id="recover" aria-label="回復薬">✚ 2</button><button id="wait">✓ 待機</button><button id="end">▶ ターン終了</button></nav></section><dialog><h2>霧から燈を守ろう</h2><p>3 つの任務で灰の群れを倒し、燈をつなごう。各任務は敵全滅で勝利、味方全滅で敗北。⚑ から任務と編成を選べます。</p><p>味方を選び、青く光るマスへ移動。赤い敵を選ぶと攻撃予測。同じ敵か攻撃ボタンで確定、やめるで取消。移動直後は ↶ 戻すでやり直せます。各自 1 回移動・1 回攻撃できます。攻撃すると行動終了。赤いマスは移動後に攻撃が届く範囲。敵に触れるとその敵の移動範囲（くすんだ青）と攻撃範囲（赤）を表示。味方同士はすり抜けられます（止まれるのは空きマスのみ）。</p><p>木立（針葉樹のマス）：受けるダメージ −2。岩：通行不可。攻撃は距離のみで判定し、岩越しにも届きます。反撃なし。弓は狼に +3、剣はゴブリンに +1。盾持ちは物理 −2、魔法は盾を無視します。</p><p>✚ 回復薬：全員共有で任務ごとに 2 個。自分を 8 回復して行動終了。守備隊は HP +4・移動 2、標準隊は移動 3。任務間では全回復し、レベルと能力は次の任務へ持ち越します。<b>ロスト</b>：任務に勝利すると、その任務中に倒れた味方は遠征から離脱し、以後の任務に出撃できません。敗北・↻ 再挑戦・⚑ 任務選択ではその任務の開始時から始まるので、その挑戦中に倒れた仲間は戻ります。生存 1 人でも次の任務に挑めます。厳しければ ⚑ で以前の任務（到達時のメンバー）からやり直すか、遠征達成後の「最初から遠征」で全員が復帰します。攻撃・撃破・回復で EXP を得て、100 でレベルアップ（兵種ごとの成長率で HP・攻撃・防御が上昇）。防御はその分だけ被ダメージを減らします。✓ は選択した味方の待機。▶ で敵のターン（全員が行動を終えると自動で移ります）。敵は接近し、届く相手のうち残 HP の少ない相手を狙います。</p><p>キーボード：Tab で盤面へ、矢印でマス移動、Enter / Space で選択。Escape で取消。↻ でいつでも再挑戦。</p><button id="close">戻る</button></dialog><dialog id="expedition"><h2>燈をつなぐ遠征</h2><div id="missions"></div><fieldset><legend>編成</legend><label><input type="radio" name="formation" value="balanced" checked> 標準隊 · 移動 3</label><label><input type="radio" name="formation" value="guard"> 守備隊 · HP +4 / 移動 2</label></fieldset><p>任務を選ぶと新しい戦闘を開始します。その任務に最後に到達した時点のメンバーとレベルで始まり、未到達なら全員 Lv 1 です。倒れて離脱した仲間は、離脱前の任務を選び直すと戻ります。</p><button id="cancel-mission">戻る</button></dialog></main>`
const audio = new ExpeditionAudio((message) => {
  game.log = message
  document.querySelector('#log')!.textContent = message
})
const board = document.querySelector<HTMLDivElement>('#board')!
const field = document.querySelector<HTMLDivElement>('.field')!
field.insertAdjacentHTML('beforeend', '<div id="phase-banner" hidden aria-live="polite"></div>')
document
  .querySelector('.status')!
  .insertAdjacentHTML(
    'beforeend',
    '<button id="fast" aria-label="敵フェイズを早送り" aria-pressed="false" hidden>⏩ 早送り</button>'
  )
document
  .querySelector('#selection')!
  .insertAdjacentHTML('afterend', '<button id="detail-button" aria-label="ユニット詳細" disabled>ⓘ</button>')
app.insertAdjacentHTML(
  'beforeend',
  '<dialog id="detail" aria-labelledby="detail-title"><div id="detail-content"></div><button id="detail-close">閉じる</button></dialog>'
)
field.style.setProperty('--grid-size', String(size))
const stage = new Stage(field, board)
const animation = new BattleAnimation(stage, field, (role) => audio.cue(role))
const cells: HTMLButtonElement[] = []
const navigation = document.querySelector('nav')!
navigation.insertAdjacentHTML(
  'afterbegin',
  '<button id="danger" aria-label="敵の攻撃範囲" aria-pressed="false">☷ 危険</button><button id="undo">↶ 戻す</button>'
)
document
  .querySelector('#log')!
  .insertAdjacentHTML('afterend', '<section id="forecast" hidden aria-label="攻撃予測"></section>')
// Status tags float above the 3D layer on a second projected grid, nearer cells on top.
const marks: HTMLSpanElement[] = []
let longPress: ReturnType<typeof setTimeout> | undefined
let suppressClick = false
let touchStart: { x: number; y: number } | undefined
for (let y = 0; y < size; y++)
  for (let x = 0; x < size; x++) {
    const cell = document.createElement('button')
    cell.className = 'cell'
    cell.tabIndex = x === 0 && y === 0 ? 0 : -1
    cell.style.cssText = `--x:${x};--y:${y}`
    cell.onclick = () => {
      if (suppressClick) {
        suppressClick = false
        return
      }
      void choose(x, y)
    }
    cell.oncontextmenu = (event) => {
      const target = game.units.find((unit) => unit.hp > 0 && unit.x === x && unit.y === y)
      if (target) {
        event.preventDefault()
        openDetail(target, cell)
      }
    }
    cell.onpointerdown = (event) => {
      if (event.pointerType !== 'touch') return
      suppressClick = false
      touchStart = { x: event.clientX, y: event.clientY }
      const target = game.units.find((unit) => unit.hp > 0 && unit.x === x && unit.y === y)
      if (target)
        longPress = setTimeout(() => {
          suppressClick = true
          openDetail(target, cell)
        }, 500)
    }
    cell.onpointermove = (event) => {
      if (touchStart && Math.hypot(event.clientX - touchStart.x, event.clientY - touchStart.y) > 10)
        clearTimeout(longPress)
    }
    cell.onpointerup = cell.onpointercancel = cell.onpointerleave = () => clearTimeout(longPress)
    cell.onpointerenter = () => hover(x, y)
    cell.onfocus = () => {
      cells[focusCell].tabIndex = -1
      focusCell = y * size + x
      cell.tabIndex = 0
      hover(x, y)
    }
    cell.addEventListener('keydown', (event) => {
      const delta =
        event.key === 'ArrowRight'
          ? [1, 0]
          : event.key === 'ArrowLeft'
            ? [-1, 0]
            : event.key === 'ArrowDown'
              ? [0, 1]
              : event.key === 'ArrowUp'
                ? [0, -1]
                : undefined
      if (!delta) return
      event.preventDefault()
      const nextX = Math.max(0, Math.min(size - 1, x + delta[0]))
      const nextY = Math.max(0, Math.min(size - 1, y + delta[1]))
      cells[focusCell].tabIndex = -1
      focusCell = nextY * size + nextX
      cells[focusCell].tabIndex = 0
      cells[focusCell].focus()
    })
    board.append(cell)
    cells.push(cell)
    const mark = document.createElement('span')
    mark.style.zIndex = String(depth({ x, y }) + 1)
    document.querySelector('#marks')!.append(mark)
    marks.push(mark)
  }
function lockPresentation() {
  busy = true
  cells.forEach((cell) => (cell.disabled = true))
  document.querySelectorAll<HTMLButtonElement>('nav button').forEach((button) => (button.disabled = true))
}
/** Chapter-report portrait: an idle pose rendered from the unit's own 3D model. */
const portrait = (u: Unit) => `<img class="portrait" alt="" src="${ready ? stage.portrait(u.role) : ''}">`
const detail = document.querySelector<HTMLDialogElement>('#detail')!
let detailTrigger: HTMLElement | null = null
function openDetail(unit: Unit, trigger: HTMLElement) {
  if (busy || !ready || detail.open) return
  detailTrigger = trigger
  const roles: Record<string, string> = {
    soldier: '剣士',
    archer: '弓兵',
    mage: '魔法使い',
    goblin: 'ゴブリン',
    wolf: '狼'
  }
  const note =
    unit.role === 'archer'
      ? '狼に +3'
      : unit.role === 'soldier'
        ? 'ゴブリンに +1'
        : unit.role === 'mage'
          ? '魔法は盾を無視'
          : '弓は狼に +3 · 剣はゴブリンに +1'
  document.querySelector('#detail-content')!.innerHTML =
    `${portrait(unit)}<h2 id="detail-title">${unit.name}</h2><p>${roles[unit.role] ?? unit.role} · Lv ${unit.level}</p>${unit.side === 'ally' ? `<label>EXP ${unit.exp}/100 <progress max="100" value="${unit.exp}"></progress></label>` : ''}<p>♥ HP ${unit.hp}/${unit.max} · ⚔ 攻撃 ${unit.power} · ⛨ 防御 ${unit.def}</p><p>◎ 射程 ${unit.range} · ◇ 移動 ${unit.move} · ⬡ 盾 ${unit.armor ?? 0}</p><p>${note}</p>`
  detail.showModal()
  document.querySelector<HTMLButtonElement>('#detail-close')!.focus()
}
document.querySelector('#detail-close')!.addEventListener('click', () => detail.close())
detail.addEventListener('close', () => detailTrigger?.focus())
document.querySelector('#detail-button')!.addEventListener('click', (event) => {
  const unit = game.units.find((candidate) => candidate.id === (selected ?? inspected) && candidate.hp > 0)
  if (unit) openDetail(unit, event.currentTarget as HTMLElement)
})
function enableFast() {
  if (game.phase !== 'enemy') return
  fast = true
  document.querySelector('#fast')!.setAttribute('aria-pressed', 'true')
}
document.querySelector('#fast')!.addEventListener('click', enableFast)
field.addEventListener('pointerdown', enableFast, true)
async function phaseBanner(phase: 'ally' | 'enemy', token: number) {
  const banner = document.querySelector<HTMLElement>('#phase-banner')!
  const version = ++bannerVersion
  banner.textContent = `${phase === 'ally' ? '◆ 味方フェイズ' : '▼ 敵フェイズ'} · ターン ${game.turn}`
  banner.hidden = false
  banner.dataset.phase = phase
  await pause(matchMedia('(prefers-reduced-motion: reduce)').matches ? 80 : 550)
  if (generation === token && version === bannerVersion) banner.hidden = true
}
board.onpointerleave = () => hover(-1, -1)
function cancelForecast(restore = true) {
  pending = undefined
  document.querySelector<HTMLElement>('#forecast')!.hidden = true
  if (restore) forecastTrigger?.focus()
}
document.querySelector('#danger')!.addEventListener('click', () => {
  danger = !danger
  render()
})
document.querySelector('#undo')!.addEventListener('click', () => {
  const unit = game.units.find((candidate) => candidate.id === selected)
  if (!unit || !undo || undo.id !== unit.id || busy) return
  unit.x = undo.x
  unit.y = undo.y
  unit.moved = false
  undo = undefined
  cancelForecast(false)
  render()
})
document.addEventListener('keydown', (event) => {
  if (event.key !== 'Escape' || document.querySelector('dialog[open]')) return
  if (pending) cancelForecast()
  else {
    selected = inspected = undefined
    undo = undefined
    afterAction()
  }
})
/** Preview an enemy's move and strike range while it is hovered or focused. */
function hover(x: number, y: number) {
  const id = game.units.find((u) => u.side === 'enemy' && u.hp > 0 && u.x === x && u.y === y)?.id
  if (id === hovered) return
  hovered = id
  if (!busy) render()
}
function render() {
  field.dataset.mission = String(game.stage)
  const unit = game.units.find((u) => u.id === selected && u.hp > 0),
    legal = unit && !unit.moved && !unit.done ? reachable(game, unit) : new Map(),
    foe =
      !unit && game.phase === 'ally'
        ? game.units.find((u) => u.side === 'enemy' && u.hp > 0 && u.id === (hovered ?? inspected))
        : undefined,
    foeMove = foe ? reachable(game, foe) : new Map(),
    reach = unit ? attackRange(game, unit) : foe ? attackRange(game, foe) : new Set<string>(),
    threatened = danger ? dangerZone(game) : new Set<string>()
  cells.forEach((cell, i) => {
    cell.disabled = busy || !ready
    const x = i % size,
      y = Math.floor(i / size),
      k = key(x, y),
      u = game.units.find((u) => u.x === x && u.y === y && u.hp > 0),
      canAttack = unit && u && u.side !== unit.side && !unit.done && distance(unit, u) <= unit.range
    cell.className = `cell ${(x + y) % 2 ? 'odd' : ''} ${game.rocks.has(k) ? 'rock' : ''} ${game.groves.has(k) ? 'grove' : ''} ${legal.has(k) && !u ? 'legal' : ''} ${foeMove.has(k) && !u ? 'enemy-move' : ''} ${reach.has(k) ? 'reach' : ''} ${u?.side ?? ''} ${u && finished(game, u) ? 'done' : ''} ${u && u.id === selected ? 'selected' : ''} ${canAttack ? 'target' : ''}`
    cell.classList.toggle('danger', threatened.has(k))
    // Billboard layer: undoes the floor projection so the status row stands upright above the model.
    marks[i].innerHTML = u
      ? `<span class="stand ${u.side}"><span class="tag">${u.armor ? '<span class="armor">⬡</span>' : ''}<span class="badge">${u.side === 'ally' ? '◆' : '▼'} ${u.hp}<span class="hpbar"><span style="width:${(u.hp / u.max) * 100}%"></span></span></span>${finished(game, u) ? '<span class="check">✓</span>' : ''}${canAttack ? `<span class="hit">−${damage(unit!, u, game)}</span>` : ''}</span></span>`
      : ''
    cell.setAttribute(
      'aria-label',
      `${x + 1},${y + 1} ${u ? `${u.name} HP ${u.hp} ${u.done ? '行動済' : ''}${canAttack ? ` 攻撃 ${damage(unit!, u, game)} ダメージ` : ''}` : game.rocks.has(k) ? (game.stage === 2 ? '崩れた城壁（岩）' : '岩') : game.groves.has(k) ? '木立' : '平地'}${legal.has(k) && !u ? ' 移動可能' : ''}${foeMove.has(k) && !u ? ' 敵の移動範囲' : ''}${reach.has(k) ? ' 攻撃範囲' : ''}${threatened.has(k) ? ' 敵の攻撃範囲' : ''}`
    )
  })
  stage.sync(game, unit?.id)
  document.querySelector('#turn')!.textContent =
    `${game.phase === 'enemy' ? '▼ 敵' : game.phase === 'won' ? '✦ 勝利' : game.phase === 'lost' ? '◇ 敗北' : '◆ 味方'} · ${game.turn}`
  document.querySelector('#count')!.textContent =
    `◆ ${game.units.filter((u) => u.side === 'ally' && u.hp > 0).length} / ▼ ${game.units.filter((u) => u.side === 'enemy' && u.hp > 0).length}`
  document.querySelector('#selection')!.textContent = unit
    ? `${unit.name} Lv${unit.level} EXP ${unit.exp}　♥ ${unit.hp}/${unit.max}　⚔ ${unit.power}　⛨ ${unit.def}　◎ ${unit.range}　◇ ${unit.move}${unit.armor ? `　⬡ ${unit.armor}` : ''}`
    : '燈守を選択'
  document.querySelector('#log')!.textContent = game.log
  ;(document.querySelector('#detail-button') as HTMLButtonElement).disabled = busy || !ready || !(selected ?? inspected)
  document.querySelector<HTMLElement>('#fast')!.hidden = game.phase !== 'enemy'
  document.querySelector('#wait')!.classList.toggle('recommended', Boolean(undo && allyTurnOver(game)))
  ;(document.querySelector('#undo') as HTMLButtonElement).disabled = busy || !undo || undo.id !== selected
  ;(document.querySelector('#danger') as HTMLButtonElement).disabled = busy || !ready
  document.querySelector('#danger')!.setAttribute('aria-pressed', String(danger))
  ;(document.querySelector('#wait') as HTMLButtonElement).disabled =
    busy || !ready || !unit || unit.done || game.phase !== 'ally'
  ;(document.querySelector('#end') as HTMLButtonElement).disabled = busy || !ready || game.phase !== 'ally'
  const potion = document.querySelector<HTMLButtonElement>('#recover')!
  potion.textContent = `✚ ${game.potions}`
  potion.disabled =
    busy || !ready || !unit || unit.done || unit.hp >= unit.max || game.potions === 0 || game.phase !== 'ally'
  document.querySelector('#mission')!.textContent = `⚑ ${missions[game.stage].name}`
  const result = document.querySelector<HTMLDivElement>('#result')!
  // Wait for the final EXP presentation before revealing the chapter report.
  result.hidden = busy || (game.phase !== 'won' && game.phase !== 'lost')
  result.classList.toggle('chapter', game.phase === 'won')
  document.querySelector('#report')!.innerHTML = game.phase === 'won' ? chapterReport(game, portrait) : ''
  document.querySelector('#outcome')!.textContent =
    game.phase === 'won'
      ? game.stage === 2
        ? '✦ 遠征達成！ 三つの燈がともった'
        : '✦ 霧が晴れた！'
      : '燈は消えた… ↻ で再挑戦（倒れた仲間も戻ります）'
  const next = document.querySelector<HTMLButtonElement>('#next')!
  next.hidden = game.phase !== 'won'
  next.textContent = game.stage === 2 ? '最初から遠征 ↻' : '次の任務 ▶'
  audio.setBattle(game.phase === 'ally' || game.phase === 'enemy')
}
async function choose(x: number, y: number) {
  if (busy || !ready) return
  if (game.phase !== 'ally') return
  const target = game.units.find((u) => u.hp > 0 && u.x === x && u.y === y),
    unit = game.units.find((u) => u.id === selected)
  if (target?.side === 'ally') {
    if (selected !== target.id) undo = undefined
    cancelForecast(false)
    selected = target.id
    game.log =
      target.role === 'archer'
        ? '弓：狼に +3 · 射程 3'
        : target.role === 'mage'
          ? '魔法：装甲を無視 · 射程 2'
          : '剣：ゴブリンに +1 · 射程 1'
  } else if (unit) {
    const before = snapshot(game)
    let changed = false
    if (target) {
      if (!unit.done && distance(unit, target) <= unit.range && pending !== target.id) {
        pending = target.id
        forecastTrigger = cells[y * size + x]
        const preview = forecast(game, unit, target)
        const card = document.querySelector<HTMLElement>('#forecast')!
        card.hidden = false
        card.innerHTML = `<div>${portrait(unit)} ${unit.name} → ${portrait(target)} ${target.name}　♥ ${target.hp} → ${preview.after}　−${preview.amount} ${preview.after === 0 ? '撃破' : ''}</div><div>${preview.chips.map((chip) => `<span class="modifier">${chip}</span>`).join('')}</div><button id="confirm">攻撃</button><button id="cancel-forecast">やめる</button>`
        card.querySelector('#confirm')!.addEventListener('click', () => void choose(target.x, target.y))
        card.querySelector('#cancel-forecast')!.addEventListener('click', () => cancelForecast())
        card.onkeydown = (event) => {
          if (event.key !== 'Tab') return
          event.preventDefault()
          const next = document.activeElement?.id === 'confirm' ? '#cancel-forecast' : '#confirm'
          card.querySelector<HTMLButtonElement>(next)!.focus()
        }
        ;(card.querySelector('#confirm') as HTMLButtonElement).focus()
        return
      }
      cancelForecast(false)
      if (attack(game, unit, target)) changed = true
      else
        game.log = `${target.name} Lv${target.level} ⚔ ${target.power} ◎ ${target.range}${target.armor ? ' ⬡ 2' : ''} · 射程外です`
    } else if (move(game, unit, x, y)) {
      cancelForecast(false)
      undo = {
        id: unit.id,
        x: before.find((old) => old.id === unit.id)!.x,
        y: before.find((old) => old.id === unit.id)!.y
      }
      changed = true
    } else {
      cancelForecast(false)
      game.log = 'そのマスには移動できません'
    }
    if (changed) {
      const token = generation
      lockPresentation()
      await animation.present(game, before, unit)
      if (token !== generation) return
      if (!(await showProgress(token))) return
      if (unit.done) undo = undefined
      busy = false
    }
  } else if (target) {
    inspected = target.id
    game.log = `${target.name} Lv${target.level} ♥ ${target.hp}/${target.max} ⚔ ${target.power} ◎ ${target.range}${target.armor ? ' ⬡ 2' : ''}`
  } else inspected = undefined
  afterAction()
}
/** Hand over to the enemy once every living ally is spent (after the last presentation). */
function afterAction() {
  render()
  if (!allyTurnOver(game) || undo) return
  game.log = '全員行動終了 · 敵のターンへ'
  void end()
}
/** Presents the acting ally's EXP gain; false if a restart superseded it. */
async function showProgress(token: number) {
  const progress = game.progress
  game.progress = undefined
  if (!progress) return true
  render()
  await presentProgress(field, game.units.find((u) => u.id === progress.id)!, progress, audio.enabled)
  if (game.phase === 'won' || game.phase === 'lost') {
    await pause(730)
    if (token === generation) clearProgress(field)
  }
  return token === generation
}
async function end() {
  if (busy || !ready || !beginEnemy(game)) return
  fast = false
  document.querySelector('#fast')!.setAttribute('aria-pressed', 'false')
  undo = undefined
  cancelForecast(false)
  selected = inspected = undefined
  const token = generation
  render()
  await phaseBanner('enemy', token)
  if (token !== generation) return
  for (const u of game.units.filter((u) => u.side === 'enemy' && u.hp > 0)) {
    if (!fast) await pause(280)
    if (token !== generation) return
    const before = snapshot(game),
      standing = game.units.filter((a) => a.side === 'ally' && a.hp > 0)
    enemyStep(game, u)
    lockPresentation()
    await animation.present(game, before, u, fast ? 3 : 1)
    if (token !== generation) return
    const fallen = standing.find((a) => a.hp <= 0)
    if (fallen) {
      render()
      await presentFarewell(field, fallen, portrait(fallen))
      if (token !== generation) return
    }
    busy = false
    render()
    if (game.phase !== 'enemy') return
  }
  beginAlly(game)
  render()
  void phaseBanner('ally', token)
  playSharedUiSound('turn', uiVolume())
}
document.querySelector('#end')!.addEventListener('click', () => void end())
document.querySelector('#wait')!.addEventListener('click', () => {
  const u = game.units.find((u) => u.id === selected)
  if (!busy && u && game.phase === 'ally') {
    u.done = true
    undo = undefined
    game.log = `${u.name} 待機`
    selected = undefined
    afterAction()
  }
})
document.querySelector('#restart')!.addEventListener('click', () => {
  generation++
  animation.cancel()
  clearProgress(field)
  busy = false
  game = newGame(game.stage, game.formation)
  void phaseBanner('ally', generation)
  audio.start()
  selected = inspected = undefined
  undo = undefined
  cancelForecast(false)
  render()
})
document.querySelector('#recover')!.addEventListener('click', async () => {
  const u = game.units.find((u) => u.id === selected)
  if (!busy && u && recover(game, u)) {
    undo = undefined
    audio.cue('healer')
    lockPresentation()
    if (!(await showProgress(generation))) return
    busy = false
    afterAction()
  }
})
function showSound(enabled: boolean) {
  const button = document.querySelector('#sound')!
  button.textContent = enabled ? '♫' : '♫×'
  button.setAttribute('aria-pressed', String(enabled))
  button.setAttribute('aria-label', enabled ? '音を無効にする' : '音を有効にする')
}
showSound(audio.enabled)
document.querySelector('#sound')!.addEventListener('click', () => showSound(audio.toggle()))
function startMission(stage: number) {
  generation++
  animation.cancel()
  clearProgress(field)
  busy = false
  selected = inspected = undefined
  undo = undefined
  cancelForecast(false)
  const formation = document.querySelector<HTMLInputElement>('input[name="formation"]:checked')!.value as
    | 'balanced'
    | 'guard'
  game = newGame(stage, formation)
  void phaseBanner('ally', generation)
  render()
  audio.start()
}
const expedition = document.querySelector<HTMLDialogElement>('#expedition')!
function listMissions() {
  document.querySelector('#missions')!.innerHTML = missions
    .map((m, i) => {
      const saved = checkpoints[i]
      const levels = saved ? Object.values(saved).map((u) => u.level) : [1, 1, 1]
      return `<button data-stage="${i}"><strong>${m.name}</strong><small>${m.hint}</small><small class="roster">開始 Lv ${levels.join(' / ')}${saved ? ' · 到達時の記録' : ''}</small><small class="roster">${sortie(i)}</small></button>`
    })
    .join('')
  document.querySelectorAll<HTMLButtonElement>('[data-stage]').forEach(
    (button) =>
      (button.onclick = () => {
        startMission(Number(button.dataset.stage))
        expedition.close()
      })
  )
}
document.querySelector('#mission')!.addEventListener('click', () => {
  listMissions()
  expedition.showModal()
})
document.querySelector('#cancel-mission')!.addEventListener('click', () => expedition.close())
document.querySelector('#next')!.addEventListener('click', () => {
  // Victory saves the grown party for the next mission; finishing the expedition starts a fresh one.
  if (game.stage === 2) checkpoints = []
  else checkpoints[game.stage + 1] = carry(game)
  startMission((game.stage + 1) % 3)
})
const dialog = document.querySelector('dialog')!
document.querySelector('#help')!.addEventListener('click', () => dialog.showModal())
document.querySelector('#close')!.addEventListener('click', () => dialog.close())
render()

// Light synthesized UI feedback that follows the ♫ toggle.
const uiVolume = () => (audio.enabled && !document.hidden ? 1 : 0)
cells.forEach((cell) => (cell.dataset.sfx = 'select'))
bindUiSounds(app, (kind) => playSharedUiSound(kind, uiVolume()), 'button:not(.cell)')
warmUpAudio()

// Keep the complete field visible; only battle actions wait for decoded 3D models.
const preparation = document.createElement('div')
preparation.className = 'preparation'
preparation.innerHTML = '<span role="status" aria-live="polite"></span><button hidden>再試行</button>'
document.querySelector('.field')!.append(preparation)
const retry = preparation.querySelector('button')!
retry.onclick = () => void prepareBattle()
async function prepareBattle() {
  retry.hidden = true
  const status = preparation.querySelector('span')!
  status.textContent = '3D モデルを準備中…'
  try {
    const results = await Promise.allSettled([
      animation.prepare((done, total) => {
        status.textContent = `3D モデルを準備中 ${Math.round((done / total) * 100)}%`
      }),
      audio.prepare()
    ])
    if (results.some((result) => result.status === 'rejected')) throw new Error('Preparation failed')
    ready = true
    preparation.remove()
    render()
    void phaseBanner('ally', generation)
  } catch {
    status.textContent = '素材を読み込めませんでした。接続を確認して再試行してください'
    retry.hidden = false
  }
}
void prepareBattle()
