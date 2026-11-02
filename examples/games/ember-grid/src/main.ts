import {
  allyTurnOver,
  attack,
  attackRange,
  beginAlly,
  beginEnemy,
  createGame,
  damage,
  distance,
  enemyStep,
  enemyActionPositions,
  finished,
  lost,
  missions,
  recover,
  key,
  move,
  healRange,
  healForecast,
  objectiveLabel,
  reachable,
  seeded,
  size,
  staffHeal,
  type Roster,
  type Unit
} from './game'
import { chapterReport, clearProgress, presentFarewell, presentProgress } from './progress'
import './style.css'
import './shell.css'
import { ExpeditionAudio } from './audio'
import { BattleAnimation, depth, pause, snapshot } from './animation'
import { Stage, chapterRoles } from './stage'
import { dangerZone, enemyThreat, forecast } from './tactics'
import { campaign } from './campaign'
import { bindUiSounds, playSharedUiSound, warmUpAudio } from '../../shared/UiSound'
import { StoryFlow, setStoryEnabled } from './dialogue'
import {
  carryForDifficulty,
  freshSave,
  readSave,
  restoreGame,
  snapshotGame,
  unlocked,
  writeSave,
  type Difficulty
} from './save'
import {
  attackConfirmation,
  dangerZoneDefault,
  openSettings,
  reducedMotion,
  sfxVolume,
  storyEnabled,
  tutorialEnabled
} from './settings'
import { showTitle } from './title'
import { setupHelp } from './help'
import { createTutorial } from './tutorial'
let busy = false
let ready = false
// ?seed=N makes level-up rolls reproducible (tests); otherwise growth is random.
const seed = new URLSearchParams(location.search).get('seed')
const rng = () => seeded(seed === null ? Math.floor(Math.random() * 0x100000000) : Number(seed))
const notice = () => {
  document.querySelector('#storage-notice')!.textContent = '保存できないか、保存データを読み込めませんでした'
}
let storageNotice = false
let unloading = false
window.addEventListener('beforeunload', () => {
  unloading = true
})
window.addEventListener('pageshow', () => {
  unloading = false
})
const saved = readSave(() => {
  storageNotice = true
})
let save = saved ?? freshSave('classic')
let playing = false
/** Roster each mission starts from: index 0 is the fresh party, later ones are saved on victory. */
let checkpoints: (Roster | undefined)[] = save.checkpoints
/** Deployed allies (and those lost earlier) for a mission start or the mission list. */
const sortie = (stage: number) => {
  const away = lost(checkpoints[stage], stage).map((u) => u.name)
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
let danger = dangerZoneDefault()
let pending: string | undefined
let undo: { id: string; x: number; y: number } | undefined
let focusCell = 0
let fast = false
let forecastTrigger: HTMLElement | null = null
let bannerVersion = 0
const app = document.querySelector<HTMLDivElement>('#app')!
app.innerHTML = `<main><header><div><small>DEATH GAIA · TACTICAL RPG</small><h1>デスガイヤ</h1></div><button id="sound" aria-label="音を無効にする" aria-pressed="true">♫</button><button id="help" aria-label="遊び方">?</button><button id="restart" aria-label="再プレイ">↻</button></header><section class="status"><button id="mission" aria-label="任務と編成">⚑ 01</button><strong id="turn"></strong><span id="count"></span></section><div class="field"><div id="board" aria-label="戦術盤"></div><div id="marks" aria-hidden="true"></div><div id="result" hidden><p id="outcome"></p><div id="report"></div><button id="next">次の任務 ▶</button></div></div><section class="console"><div id="selection"></div><div id="log" role="status" aria-live="polite"></div><nav><button id="recover" aria-label="回復薬">✚ 2</button><button id="wait">✓ 待機</button><button id="end">▶ ターン終了</button></nav></section><dialog id="help-dialog" aria-labelledby="help-title"></dialog><dialog id="expedition"><h2>燈をつなぐ遠征</h2><div id="missions"></div><fieldset><legend>編成</legend><label><input type="radio" name="formation" value="balanced" checked> 標準隊 · 移動 3</label><label><input type="radio" name="formation" value="guard"> 守備隊 · HP +4 / 移動 2</label></fieldset><p>任務を選ぶと新しい戦闘を開始します。その任務に最後に到達した時点のメンバーとレベルで始まり、未到達なら全員 Lv 1 です。倒れて離脱した仲間は、離脱前の任務を選び直すと戻ります。</p><button id="cancel-mission">戻る</button></dialog></main>`
const audio = new ExpeditionAudio((message) => {
  game.log = message
  document.querySelector('#log')!.textContent = message
})
audio.applySettings()
const storageStatus = document.createElement('p')
storageStatus.id = 'storage-notice'
storageStatus.setAttribute('role', 'status')
document.body.append(storageStatus)
if (storageNotice) notice()
const settingsButton = document.createElement('button')
settingsButton.textContent = '⚙'
settingsButton.setAttribute('aria-label', '設定')
document.querySelector('header')!.append(settingsButton)
let previousDanger = dangerZoneDefault()
let render = () => {}
const tutorial = createTutorial(document.querySelector('.console')!, notice, () => ({ game, selected, pending }))
setStoryEnabled(storyEnabled())
const settings = () =>
  openSettings(() => {
    audio.applySettings()
    setStoryEnabled(storyEnabled())
    tutorial.setEnabled(tutorialEnabled())
    if (previousDanger !== dangerZoneDefault()) {
      previousDanger = dangerZoneDefault()
      danger = previousDanger
      render()
    }
  }, notice)
settingsButton.onclick = settings
const objectiveStatus = document.createElement('span')
objectiveStatus.id = 'objective'
document.querySelector('.status')!.append(objectiveStatus)
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
let stage: Stage
let animation: BattleAnimation
let stageAvailable = false
function createStage() {
  try {
    stage = new Stage(field, board)
    animation = new BattleAnimation(stage, field, (role) => audio.cue(role))
    stageAvailable = true
  } catch {
    stageAvailable = false
  }
  return stageAvailable
}
createStage()
let contextAvailable = true
const contextNotice = document.createElement('div')
contextNotice.className = 'context-notice'
contextNotice.setAttribute('role', 'status')
contextNotice.textContent = '画面を復旧しています…'
contextNotice.hidden = true
document.body.append(contextNotice)
field.addEventListener('stage-context', (event) => {
  const restored = (event as CustomEvent<boolean>).detail
  contextAvailable = restored
  contextNotice.hidden = restored
  document.querySelector<HTMLElement>('#app main')!.inert = !restored || !playing
  if (restored) render()
})
function transition() {
  if (reducedMotion() || document.hidden) return
  const overlay = document.createElement('div')
  overlay.className = 'screen-transition'
  document.body.append(overlay)
  void pause(350).then(() => overlay.remove())
}
const story = new StoryFlow(
  field,
  (role) => stage.portrait(role),
  () => game,
  () => generation,
  lockPresentation,
  () => {
    busy = false
    render()
  },
  () => save.difficulty
)
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
function positionTags() {
  const tags = Array.from(document.querySelectorAll<HTMLElement>('#marks .tag'))
  tags.forEach((tag) => (tag.style.translate = ''))
  if (!matchMedia('(max-width: 500px)').matches) return
  const placed: DOMRect[] = []
  for (const tag of tags.sort((a, b) => b.getBoundingClientRect().top - a.getBoundingClientRect().top)) {
    let rect = tag.getBoundingClientRect(),
      offset = 0
    for (
      let attempts = 0;
      attempts < tags.length * 100 &&
      placed.some(
        (other) =>
          rect.left < other.right && rect.right > other.left && rect.top < other.bottom && rect.bottom > other.top
      );
      attempts++
    ) {
      offset -= 2
      tag.style.translate = `0 ${offset}px`
      rect = tag.getBoundingClientRect()
    }
    placed.push(rect)
  }
}
new ResizeObserver(() => requestAnimationFrame(positionTags)).observe(field)
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
    healer: '癒し手',
    goblin: 'ゴブリン',
    wolf: '狼',
    slime: 'スライム',
    bat: 'コウモリ',
    beetle: '甲虫',
    shaman: '呪術師',
    wraith: '亡霊',
    ogre: 'オーガ',
    dragon: '竜'
  }
  const notes = [
    unit.boss ? '♛ ボス' : '',
    unit.ai === 'hold'
      ? 'その場から動かない'
      : unit.ai === 'guard' && !unit.alerted
        ? '近づくか攻撃されるまで待機'
        : '',
    unit.heal
      ? `杖で味方を ${unit.heal} 回復 · 射程 1–2`
      : unit.side === 'ally'
        ? unit.role === 'archer'
          ? '狼に +3'
          : unit.role === 'soldier'
            ? 'ゴブリンに +1'
            : '魔法は盾を無視'
        : unit.role === 'wolf'
          ? '弓に弱い（+3）'
          : unit.role === 'goblin'
            ? '剣に弱い（+1）'
            : ''
  ].filter(Boolean)
  const note = notes.join(' · ')
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
  tutorial.update()
}
function showForecast(unit: Unit, target: Unit, healing: boolean) {
  pending = target.id
  forecastTrigger = cells[target.y * size + target.x]
  const preview = healing ? healForecast(unit, target) : forecast(game, unit, target)
  const amount = healing ? preview.after - target.hp : target.hp - preview.after
  const chips = healing ? [] : forecast(game, unit, target).chips
  const card = document.querySelector<HTMLElement>('#forecast')!
  card.hidden = false
  card.setAttribute('aria-label', healing ? '回復予測' : '攻撃予測')
  card.innerHTML = `<div>${portrait(unit)} ${unit.name} → ${portrait(target)} ${target.name}　♥ ${target.hp} → ${preview.after}　${healing ? '+' : '−'}${amount} ${!healing && preview.after === 0 ? '撃破' : ''}</div><div>${chips.map((chip) => `<span class="modifier">${chip}</span>`).join('')}</div><button id="confirm">${healing ? '回復' : '攻撃'}</button><button id="cancel-forecast">やめる</button>`
  card.querySelector('#confirm')!.addEventListener('click', () => void choose(target.x, target.y))
  card.querySelector('#cancel-forecast')!.addEventListener('click', () => cancelForecast())
  card.onkeydown = (event) => {
    if (event.key !== 'Tab') return
    event.preventDefault()
    const next = document.activeElement?.id === 'confirm' ? '#cancel-forecast' : '#confirm'
    card.querySelector<HTMLButtonElement>(next)!.focus()
  }
  card.querySelector<HTMLButtonElement>('#confirm')!.focus()
  tutorial.update()
}
document.querySelector('#danger')!.addEventListener('click', () => {
  danger = !danger
  tutorial.advance('danger')
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
render = () => {
  document.querySelector<HTMLElement>('#app main')!.inert = !playing || !contextAvailable
  if (playing) {
    save.checkpoints = checkpoints
    save.formation = game.formation
    if (!busy && (game.phase === 'won' || game.phase === 'lost')) {
      delete save.suspend
      if (game.phase === 'won') {
        if (!save.cleared.includes(game.stage)) save.cleared.push(game.stage)
        save.bestTurns[game.stage] = Math.min(save.bestTurns[game.stage] ?? Infinity, game.turn)
        if (game.stage === missions.length - 1) {
          save.completedAt ??= new Date().toISOString()
          save.finale = snapshotGame(game)
        }
        if (game.stage + 1 < missions.length) {
          checkpoints[game.stage + 1] = carryForDifficulty(game, save.difficulty)
          save.furthest = Math.max(save.furthest, game.stage + 1)
        }
      }
    }
    if (!unloading) writeSave(save, notice)
  }
  field.dataset.mission = String(game.stage)
  const objective = campaign[game.stage].objective
  const unit = game.units.find((u) => u.id === selected && u.hp > 0),
    legal = unit && !unit.moved && !unit.done ? reachable(game, unit) : new Map(),
    foe =
      !unit && game.phase === 'ally'
        ? game.units.find((u) => u.side === 'enemy' && u.hp > 0 && u.id === (hovered ?? inspected))
        : undefined,
    foeMove = foe ? enemyActionPositions(game, foe) : new Map(),
    reach = unit
      ? attackRange(game, unit)
      : foe
        ? new Set([...enemyThreat(game, foe)].filter((cell) => !foeMove.has(cell) || cell === key(foe.x, foe.y)))
        : new Set<string>(),
    threatened = danger ? dangerZone(game) : new Set<string>()
  cells.forEach((cell, i) => {
    cell.disabled = busy || !ready
    const x = i % size,
      y = Math.floor(i / size),
      k = key(x, y),
      u = game.units.find((u) => u.x === x && u.y === y && u.hp > 0),
      canAttack = unit && !unit.heal && u && u.side !== unit.side && !unit.done && distance(unit, u) <= unit.range,
      canHeal = unit && u && unit.heal && healRange(game, unit).has(k) && distance(unit, u) <= 2,
      seize = objective.type === 'seize' && objective.x === x && objective.y === y
    cell.className = `cell ${(x + y) % 2 ? 'odd' : ''} ${game.rocks.has(k) ? 'rock' : ''} ${game.groves.has(k) ? 'grove' : ''} ${legal.has(k) && !u ? 'legal' : ''} ${foeMove.has(k) && !u ? 'enemy-move' : ''} ${reach.has(k) ? 'reach' : ''} ${u?.side ?? ''} ${u && finished(game, u) ? 'done' : ''} ${u && u.id === selected ? 'selected' : ''} ${canAttack ? 'target' : ''} ${canHeal ? 'healable' : ''} ${seize ? 'seize' : ''}`
    cell.classList.toggle('danger', threatened.has(k))
    // Billboard layer: undoes the floor projection so the status row stands upright above the model.
    marks[i].innerHTML = u
      ? `<span class="stand ${u.side} ${u.boss ? 'boss' : ''}"><span class="tag">${u.boss ? '<span class="crown">♛</span>' : ''}${u.armor ? '<span class="armor">⬡</span>' : ''}<span class="badge">${u.side === 'ally' ? '◆' : '▼'} ${u.hp}<span class="hpbar"><span style="width:${(u.hp / u.max) * 100}%"></span></span></span>${finished(game, u) ? '<span class="check">✓</span>' : ''}${canAttack ? `<span class="hit">−${damage(unit!, u, game)}</span>` : ''}${canHeal ? `<span class="healing-preview">✚ +${healForecast(unit!, u).after - u.hp}</span>` : ''}</span></span>`
      : ''
    cell.setAttribute(
      'aria-label',
      `${x + 1},${y + 1} ${u ? `${u.boss ? 'ボス ' : ''}${u.name} HP ${u.hp} ${u.done ? '行動済' : ''}${canAttack ? ` 攻撃 ${damage(unit!, u, game)} ダメージ` : ''}` : game.rocks.has(k) ? (game.stage === 2 ? '崩れた城壁（岩）' : '岩') : game.groves.has(k) ? '木立' : '平地'}${seize ? ' 制圧目標' : ''}${canHeal ? ' 回復可能' : ''}${legal.has(k) && !u ? ' 移動可能' : ''}${foeMove.has(k) && !u ? ' 敵の移動範囲' : ''}${reach.has(k) ? ' 攻撃範囲' : ''}${threatened.has(k) ? ' 敵の攻撃範囲' : ''}`
    )
  })
  tutorial.update()
  requestAnimationFrame(positionTags)
  if (stageAvailable && playing) stage.sync(game, unit?.id)
  document.querySelector('#turn')!.textContent =
    `${game.phase === 'enemy' ? '▼ 敵' : game.phase === 'won' ? '✦ 勝利' : game.phase === 'lost' ? '◇ 敗北' : '◆ 味方'} · ${game.turn}`
  document.querySelector('#count')!.textContent =
    `◆ ${game.units.filter((u) => u.side === 'ally' && u.hp > 0).length} / ▼ ${game.units.filter((u) => u.side === 'enemy' && u.hp > 0).length}`
  objectiveStatus.textContent = `${objective.type === 'seize' ? '✦ ' : ''}${objectiveLabel(game)}`
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
  document.querySelector('#mission')!.textContent =
    `⚑ ${missions[game.stage].name} · ${save.difficulty === 'casual' ? 'カジュアル' : 'クラシック'}`
  const result = document.querySelector<HTMLDivElement>('#result')!
  // Wait for the final EXP presentation before revealing the chapter report.
  const wasHidden = result.hidden
  result.hidden = busy || (game.phase !== 'won' && game.phase !== 'lost')
  result.classList.toggle('chapter', game.phase === 'won')
  document.querySelector('#report')!.innerHTML =
    game.phase === 'won' ? chapterReport(game, portrait, save.difficulty === 'casual') : ''
  document.querySelector('#outcome')!.textContent =
    game.phase === 'won'
      ? game.stage === missions.length - 1
        ? '✦ 遠征達成！ 六つの燈がともった'
        : '✦ 霧が晴れた！'
      : '燈は消えた… ↻ で再挑戦（倒れた仲間も戻ります）'
  const next = document.querySelector<HTMLButtonElement>('#next')!
  next.hidden = game.phase !== 'won'
  next.textContent = game.stage === missions.length - 1 ? '最初から遠征 ↻' : '次の任務 ▶'
  audio.setBattle(game.phase === 'ally' || game.phase === 'enemy')
  if (playing && wasHidden && !result.hidden)
    audio.jingle(game.phase === 'lost' ? 'defeat' : game.stage === missions.length - 1 ? 'final' : 'victory')
}
async function choose(x: number, y: number) {
  if (busy || !ready) return
  if (game.phase !== 'ally') return
  const target = game.units.find((u) => u.hp > 0 && u.x === x && u.y === y),
    unit = game.units.find((u) => u.id === selected)
  const beforeHeal = snapshot(game)
  const canHeal =
    target?.side === 'ally' &&
    unit &&
    unit.heal &&
    !unit.done &&
    target.hp < target.max &&
    distance(unit, target) >= 1 &&
    distance(unit, target) <= 2
  if (canHeal && target && unit && attackConfirmation() && pending !== target.id) {
    showForecast(unit, target, true)
    return
  }
  if (canHeal && target && unit && staffHeal(game, unit, target)) {
    cancelForecast(false)
    undo = undefined
    const token = generation
    lockPresentation()
    await animation.present(game, beforeHeal, unit, { kind: 'heal', target })
    if (token !== generation) return
    if (!(await showProgress(token))) return
    busy = false
  } else if (target?.side === 'ally') {
    if (selected !== target.id) undo = undefined
    cancelForecast(false)
    selected = target.id
    tutorial.advance('select')
    game.log = target.heal
      ? '杖：負傷した味方を回復 · 射程 1–2'
      : target.role === 'archer'
        ? '弓：狼に +3 · 射程 3'
        : target.role === 'mage'
          ? '魔法：装甲を無視 · 射程 2'
          : '剣：ゴブリンに +1 · 射程 1'
  } else if (unit) {
    const before = snapshot(game)
    let changed = false
    if (target) {
      if (
        !unit.heal &&
        !unit.done &&
        distance(unit, target) <= unit.range &&
        attackConfirmation() &&
        pending !== target.id
      ) {
        tutorial.advance('target')
        showForecast(unit, target, false)
        return
      }
      cancelForecast(false)
      if (attack(game, unit, target)) {
        tutorial.advance('target')
        tutorial.advance('attack')
        changed = true
      } else
        game.log = `${target.name} Lv${target.level} ⚔ ${target.power} ◎ ${target.range}${target.armor ? ' ⬡ 2' : ''} · 射程外です`
    } else if (move(game, unit, x, y)) {
      tutorial.advance('move')
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
      await animation.present(game, before, unit, target ? { kind: 'attack', target } : undefined)
      if (token !== generation) return
      if (!(await showProgress(token))) return
      if (unit.done) undo = undefined
      await story.victory(token)
      if (token !== generation) return
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
  await presentProgress(field, game.units.find((u) => u.id === progress.id)!, progress, audio.enabled ? sfxVolume() : 0)
  if (game.phase === 'won' || game.phase === 'lost') {
    await pause(730)
    if (token === generation) clearProgress(field)
  }
  return token === generation
}
async function end() {
  if (busy || !ready) return
  undo = undefined
  cancelForecast(false)
  if (!beginEnemy(game)) {
    // A seize objective can be won as the ally phase ends; its outro still plays before the report.
    if (game.phase === 'won' && !(await victoryScene(generation))) return
    render()
    return
  }
  fast = false
  document.querySelector('#fast')!.setAttribute('aria-pressed', 'false')
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
    const target = enemyStep(game, u)
    lockPresentation()
    await animation.present(game, before, u, target ? { kind: 'attack', target } : undefined, fast ? 3 : 1)
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
  // A survive objective is won once the last required enemy phase ends.
  if (game.phase === 'won') {
    if (await victoryScene(token)) render()
    return
  }
  save.suspend = snapshotGame(game)
  if (!unloading) writeSave(save, notice)
  render()
  void phaseBanner('ally', token)
  playSharedUiSound('turn', uiVolume())
}
/** A chapter opening requested before the models were ready (true: a new expedition, prologue first). */
let pendingOpening: boolean | undefined
/** Chapter title card and intro scenes, then the first ally-phase banner. */
async function openChapter(fresh: boolean) {
  const token = generation
  await story.start(fresh)
  if (token === generation) {
    if (game.stage === 0) tutorial.start(tutorialEnabled())
    void phaseBanner('ally', token)
  }
}
/** Plays the chapter outro (and the finale) before the report; false if a restart superseded it. */
async function victoryScene(token: number) {
  lockPresentation()
  await story.victory(token)
  if (token !== generation) return false
  busy = false
  return true
}
document.querySelector('#end')!.addEventListener('click', () => {
  tutorial.advance('turn')
  void end()
})
document.querySelector('#wait')!.addEventListener('click', () => {
  const u = game.units.find((u) => u.id === selected)
  if (!busy && u && game.phase === 'ally') {
    tutorial.advance('turn')
    u.done = true
    undo = undefined
    game.log = `${u.name} 待機`
    selected = undefined
    afterAction()
  }
})
document.querySelector('#restart')!.addEventListener('click', () => {
  generation++
  story.cancel()
  animation.cancel()
  clearProgress(field)
  busy = false
  game = newGame(game.stage, game.formation)
  save.suspend = snapshotGame(game)
  audio.start()
  selected = inspected = undefined
  undo = undefined
  cancelForecast(false)
  render()
  if (game.stage === 0) tutorial.start(tutorialEnabled())
  // A retry replays the (skippable) chapter opening, then the phase banner.
  if (ready) void openChapter(false)
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
  if (!unlocked(save, stage)) return
  transition()
  generation++
  tutorial.hide()
  story.cancel()
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
  save.suspend = snapshotGame(game)
  danger = dangerZoneDefault()
  ready = false
  render()
  audio.setMusic(campaign[stage].music)
  audio.start()
  document.querySelector<HTMLButtonElement>('#mission')!.focus()
  // The chapter's models load first (cached ones resolve at once); its opening follows.
  pendingOpening = stage === 0 && checkpoints.length === 0
  void prepareBattle()
}
const expedition = document.querySelector<HTMLDialogElement>('#expedition')!
function listMissions() {
  expedition.querySelector('p')!.textContent =
    save.difficulty === 'casual'
      ? '任務を選ぶと、その任務に到達した時点のメンバーとレベルで始まります。倒れた仲間は勝利後に復帰します。'
      : '任務を選ぶと、その任務に到達した時点のメンバーとレベルで始まります。離脱した仲間は離脱前の任務を選び直すと戻ります。'
  document.querySelector('#missions')!.innerHTML = missions
    .map((m, i) => {
      if (!unlocked(save, i)) return '<button disabled>🔒 ？？？</button>'
      const saved = checkpoints[i]
      const levels = createGame(i, 'balanced', saved)
        .units.filter((u) => u.side === 'ally')
        .map((u) => u.level)
      return `<button data-stage="${i}"><strong>${m.name} · ${save.difficulty === 'casual' ? 'カジュアル' : 'クラシック'}</strong><small>${m.hint} · ${objectiveLabel(createGame(i, 'balanced', saved))}</small><small class="roster">開始 Lv ${levels.join(' / ')}${saved ? ' · 到達時の記録' : ''}</small><small class="roster">${sortie(i)}</small></button>`
    })
    .join('')
  document.querySelectorAll<HTMLButtonElement>('[data-stage]').forEach(
    (button) =>
      (button.onclick = () => {
        expedition.close()
        startMission(Number(button.dataset.stage))
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
  if (game.stage === missions.length - 1) {
    save = freshSave(save.difficulty)
    checkpoints = save.checkpoints
  }
  startMission((game.stage + 1) % missions.length)
})
const openHelp = setupHelp(document.querySelector<HTMLDialogElement>('#help-dialog')!)
document.querySelector('#help')!.addEventListener('click', openHelp)
render()

// Light synthesized UI feedback that follows the ♫ toggle.
const uiVolume = () => (audio.enabled && !document.hidden ? sfxVolume() : 0)
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
const soundNotice = document.createElement('div')
soundNotice.className = 'sound-notice'
soundNotice.setAttribute('role', 'status')
soundNotice.hidden = true
document.body.append(soundNotice)
async function prepareSound(roles: string[], token: number) {
  try {
    await audio.prepare(roles)
    if (token === generation) soundNotice.hidden = true
  } catch {
    if (token !== generation) return
    soundNotice.textContent = '効果音を読み込めませんでした。バックグラウンドで再試行します。'
    soundNotice.hidden = false
    setTimeout(() => {
      if (token === generation) void prepareSound(roles, token)
    }, 5000)
  }
}
async function prepareBattle() {
  const token = generation
  const roles = chapterRoles(game)
  field.append(preparation)
  retry.hidden = true
  const status = preparation.querySelector('span')!
  status.textContent = '3D モデルを準備中…'
  titleProgress(status.textContent)
  void prepareSound(roles, token)
  try {
    await animation.prepare(roles, (done, total) => {
      status.textContent = `3D モデルを準備中 ${Math.round((done / total) * 100)}%`
      titleProgress(status.textContent)
    })
    if (token !== generation) return
    ready = true
    preparation.remove()
    titleProgress('準備完了')
    render()
    if (pendingOpening !== undefined) {
      const fresh = pendingOpening
      pendingOpening = undefined
      void openChapter(fresh)
    }
    if (game.stage + 1 < campaign.length)
      void stage.load(chapterRoles(createGame(game.stage + 1, 'balanced')), () => {}).catch(() => {})
  } catch {
    if (token !== generation) return
    status.textContent = '素材を読み込めませんでした。接続を確認して再試行してください'
    titleProgress(status.textContent)
    retry.hidden = false
  }
}
const titleProgress = showTitle(saved, {
  start: (difficulty) => {
    save = freshSave(difficulty)
    checkpoints = save.checkpoints
    playing = true
    audio.setTitle(false)
    startMission(0)
  },
  continue: (stage) => {
    playing = true
    audio.setTitle(false)
    document.querySelector<HTMLInputElement>(`input[name=formation][value=${save.formation}]`)!.checked = true
    if (stage === undefined && save.suspend) {
      transition()
      pendingOpening = undefined
      generation++
      game = restoreGame(save.suspend)
      document.querySelector<HTMLInputElement>(`input[name=formation][value=${game.formation}]`)!.checked = true
      ready = false
      render()
      audio.setMusic(campaign[game.stage].music)
      audio.start()
      document.querySelector<HTMLButtonElement>('#mission')!.focus()
      void prepareBattle()
    } else {
      document.querySelector<HTMLInputElement>(`input[name=formation][value=${save.formation}]`)!.checked = true
      startMission(stage ?? save.furthest)
    }
  },
  ending: () => {
    generation++
    game = save.finale ? restoreGame(save.finale) : newGame(missions.length - 1, save.formation)
    game.phase = 'won'
    void story.victory(generation).then(() => location.reload())
  },
  settings,
  help: openHelp
})
if (!stageAvailable) {
  const title = document.querySelector<HTMLElement>('.title-screen')!
  const buttons = title.querySelectorAll<HTMLButtonElement>(
    '[data-action=new], [data-action=continue], [data-action=chapters]'
  )
  buttons.forEach((button) => (button.disabled = true))
  titleProgress('WebGLを利用できません。ブラウザの設定やハードウェアアクセラレーションを確認してください。')
  const retryRenderer = document.createElement('button')
  retryRenderer.textContent = '画面を再試行'
  title.querySelector('.title-loading')!.after(retryRenderer)
  retryRenderer.onclick = () => {
    if (!createStage()) return
    buttons.forEach((button) => (button.disabled = button.dataset.action !== 'new' && !saved))
    titleProgress('章を選ぶと準備を開始します')
    retryRenderer.remove()
    render()
  }
} else titleProgress('章を選ぶと準備を開始します')
