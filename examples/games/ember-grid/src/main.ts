import { confirmReplacement } from './confirm'
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
import { BoardCamera } from './camera'
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
import { detailHtml, forecastHtml, terrainText, unitCardHtml } from './cards'
import { chapterObjective } from './menus'
import { guideText, legendItems, objectiveDetail, objectiveText, phaseLabel, roleNames } from './hud'
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
let replayingEnding = false
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
let restoreBoardFocus = false
let focusParking: HTMLElement | null = null
let fast = false
let forecastTrigger: HTMLElement | null = null
let bannerVersion = 0
let pendingHeal: boolean | undefined
let actingId: string | undefined
const app = document.querySelector<HTMLDivElement>('#app')!
app.innerHTML = `<main><header><div><small>DEATH GAIA · TACTICAL RPG</small><h1>デスガイヤ</h1></div><button id="sound" aria-label="音を無効にする" aria-pressed="true" title="音のオン/オフ">♫</button><button id="help" aria-label="遊び方" title="遊び方">?</button><button id="restart" aria-label="再プレイ" title="この章を最初からやり直す">↻</button></header><section class="status"><button id="mission" aria-label="任務と編成" title="任務の選択と編成">⚑ 01</button><strong id="turn"></strong><span id="count"></span></section><div class="field"><div id="board" aria-label="戦術盤"></div><div id="marks" aria-hidden="true"></div><div id="toast" hidden aria-hidden="true"></div><div id="result" hidden><p id="outcome"></p><p id="defeat-note" hidden>再挑戦すると章の開始時の編成に戻り、倒れた仲間も戻ります。</p><div id="report"></div><button id="next">次の任務 ▶</button><button id="retry" hidden>↻ この章に再挑戦</button><button id="retry-missions" class="secondary" hidden>⚑ 任務を選ぶ</button></div></div><section class="console"><p id="guide"></p><div id="selection"></div><div id="log" role="status" aria-live="polite"></div><nav><button id="recover" aria-label="回復薬 残り2">✚ <span class="nav-long">回復</span>薬 2</button><button id="wait">✓ 待機</button><button id="end">▶ ターン終了</button></nav></section><dialog id="help-dialog" aria-labelledby="help-title"></dialog><dialog id="expedition"><h2>燈をつなぐ遠征</h2><div id="missions"></div><fieldset><legend>編成</legend><label><input type="radio" name="formation" value="balanced" checked> 標準隊 · 移動 3</label><label><input type="radio" name="formation" value="guard"> 守備隊 · HP +4 / 移動 2</label></fieldset><p>任務を選ぶと新しい戦闘を開始します。その任務に最後に到達した時点のメンバーとレベルで始まり、未到達なら全員 Lv 1 です。倒れて離脱した仲間は、離脱前の任務を選び直すと戻ります。</p><button id="cancel-mission">戻る</button></dialog></main>`
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
settingsButton.title = '設定'
document.querySelector('header')!.append(settingsButton)
let previousDanger = dangerZoneDefault()
let render = () => {}
const tutorial = createTutorial(document.querySelector('.console')!, notice, () => ({
  game,
  selected,
  pending,
  undo: Boolean(undo && undo.id === selected),
  wait: game.phase === 'ally' && game.units.some((u) => u.id === selected && u.hp > 0 && !u.done),
  busy,
  danger
}))
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
// A tap (or Enter) shows the complete condition, which a narrow status may shorten; the dotted underline
// (style.css) marks it as pressable and render() gives it an accessible name with the current objective.
objectiveStatus.tabIndex = 0
objectiveStatus.setAttribute('role', 'button')
const showObjective = () => flash(`勝利条件：${objectiveDetail(game)}`)
objectiveStatus.addEventListener('click', showObjective)
objectiveStatus.addEventListener('keydown', (event) => {
  if (event.key === 'Enter' || event.key === ' ') {
    event.preventDefault()
    showObjective()
  }
})
document.querySelector('.status')!.append(objectiveStatus)
const board = document.querySelector<HTMLDivElement>('#board')!
const field = document.querySelector<HTMLDivElement>('.field')!
field.insertAdjacentHTML(
  'beforeend',
  '<div id="phase-banner" hidden aria-live="polite"></div><div id="legend" aria-hidden="true"></div><div id="actor" hidden aria-hidden="true"></div><div id="terrain" hidden aria-hidden="true"></div>'
)
document
  .querySelector('.status')!
  .insertAdjacentHTML(
    'beforeend',
    '<button id="fast" aria-label="敵フェイズを早送り" aria-pressed="false" hidden>⏩ 早送り</button>'
  )
document
  .querySelector('#selection')!
  .insertAdjacentHTML(
    'afterend',
    '<div class="console-side"><button id="detail-button" aria-label="ユニット詳細" title="ユニット詳細" disabled><span aria-hidden="true">ⓘ</span><small aria-hidden="true">詳細</small></button></div>'
  )
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
let tagsTimer: ReturnType<typeof setTimeout> | undefined
const camera = new BoardCamera(
  field,
  board,
  () => {
    if (stageAvailable) stage.resize()
    // Tag de-overlap reads every tag's box, so it waits until the view settles.
    clearTimeout(tagsTimer)
    tagsTimer = setTimeout(() => requestAnimationFrame(positionTags), 120)
  },
  () => clearTimeout(longPress)
)
// Reachable from the page for browser verification, like `canvas.stage`.
Object.assign(field, { camera })
let contextAvailable = true
// Only the title screen holds the battle inert; the ending replay plays in the field without a battle.
const titleOpen = () => document.querySelector('.title-screen') !== null
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
  document.querySelector<HTMLElement>('#app main')!.inert = !restored || titleOpen()
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
document
  .querySelector('.console-side')!
  .insertAdjacentHTML(
    'beforeend',
    '<button id="touch-assist" aria-label="タッチ選択補助" aria-pressed="false" title="タッチ選択補助"><span aria-hidden="true">⊞</span><small aria-hidden="true">選択補助</small></button>'
  )
app.insertAdjacentHTML(
  'beforeend',
  '<dialog id="touch-choices" aria-label="マスを選択"><div></div><button type="button" id="touch-cancel">閉じる</button></dialog>'
)
const touchAssist = document.querySelector<HTMLButtonElement>('#touch-assist')!
const touchChoices = document.querySelector<HTMLDialogElement>('#touch-choices')!
const consolePanel = document.querySelector<HTMLElement>('.console')!
/** Board squares the chooser offers: the tapped one and its neighbours (outlined while the dialog is open). */
let touchOrigin: number | undefined
let touchNear = new Set<number>()
function touchMark(index: number) {
  return index === touchOrigin ? 'touch-origin' : touchNear.has(index) ? 'touch-near' : ''
}
function markTouchCells() {
  cells.forEach((cell, index) => {
    cell.classList.toggle('touch-origin', index === touchOrigin)
    cell.classList.toggle('touch-near', touchNear.has(index))
  })
}
function clearTouchCells() {
  touchOrigin = undefined
  touchNear = new Set()
  markTouchCells()
}
/** Over the console when it is fully on screen; otherwise a panel fixed to the viewport bottom. */
function positionTouchChoices() {
  const bounds = consolePanel.getBoundingClientRect()
  if (matchMedia('(max-height: 500px) and (min-width: 560px)').matches) {
    // Side column: cover everything from the status bar down to the console bottom.
    const status = document.querySelector<HTMLElement>('.status')!.getBoundingClientRect()
    const fits = bounds.bottom <= window.innerHeight && bounds.right <= window.innerWidth && status.top >= 0
    if (fits) {
      touchChoices.classList.remove('touch-panel')
      Object.assign(touchChoices.style, {
        left: `${bounds.left}px`,
        top: `${status.top}px`,
        bottom: 'auto',
        width: `${bounds.width}px`,
        height: `${bounds.bottom - status.top}px`
      })
      return false
    }
  }
  const onScreen =
    bounds.top >= 0 && bounds.left >= 0 && bounds.bottom <= window.innerHeight && bounds.right <= window.innerWidth
  touchChoices.classList.toggle('touch-panel', !onScreen)
  Object.assign(
    touchChoices.style,
    onScreen
      ? {
          left: `${bounds.left}px`,
          top: `${bounds.top}px`,
          bottom: 'auto',
          width: `${bounds.width}px`,
          height: `${bounds.height}px`
        }
      : {
          left: '8px',
          top: 'auto',
          bottom: '8px',
          width: `${window.innerWidth - 16}px`,
          height: `${Math.min(260, window.innerHeight * 0.55)}px`
        }
  )
  return !onScreen
}
new ResizeObserver(positionTouchChoices).observe(consolePanel)
window.addEventListener('resize', positionTouchChoices)
touchAssist.onclick = () =>
  touchAssist.setAttribute('aria-pressed', String(touchAssist.getAttribute('aria-pressed') !== 'true'))
document.querySelector<HTMLButtonElement>('#touch-cancel')!.onclick = () => touchChoices.close()
touchChoices.addEventListener('close', clearTouchCells)
/** On-screen direction arrows for the 3×3 chooser, in reading order. */
const directionArrows = ['↖', '↑', '↗', '←', '・', '→', '↙', '↓', '↘']
function chooseNearby(x: number, y: number) {
  const choices = touchChoices.querySelector('div')!
  choices.replaceChildren()
  // The floor is drawn rotated, so lay the neighbours out where they appear on screen, not in board order.
  const centre = (cell: HTMLElement) => {
    const box = cell.getBoundingClientRect()
    return { x: box.left + box.width / 2, y: box.top + box.height / 2, w: box.width, h: box.height }
  }
  const origin = centre(cells[y * size + x])
  const slots: (HTMLElement | undefined)[] = Array(9).fill(undefined)
  for (let row = Math.max(0, y - 1); row <= Math.min(size - 1, y + 1); row++)
    for (let column = Math.max(0, x - 1); column <= Math.min(size - 1, x + 1); column++) {
      const original = cells[row * size + column]
      const point = centre(original)
      const side = (offset: number, extent: number) => (Math.abs(offset) < extent * 0.25 ? 0 : Math.sign(offset))
      const slot = (side(point.y - origin.y, origin.h) + 1) * 3 + side(point.x - origin.x, origin.w) + 1
      const label = original.getAttribute('aria-label') ?? ''
      const button = document.createElement('button')
      button.type = 'button'
      // The accessible name keeps the coordinates; the face shows the direction and what is there.
      button.setAttribute('aria-label', label)
      button.innerHTML = `<span class="touch-dir" aria-hidden="true">${directionArrows[slot]}</span>${label.replace(/^\d+,\d+ /, '')}`
      if (column === x && row === y) button.classList.add('touch-origin')
      button.onclick = () => {
        touchChoices.close()
        clearTouchCells()
        void choose(column, row)
      }
      slots[slot] = button
    }
  for (const button of slots) {
    if (button) choices.append(button)
    else {
      const empty = document.createElement('span')
      empty.className = 'touch-empty'
      empty.setAttribute('aria-hidden', 'true')
      choices.append(empty)
    }
  }
  touchOrigin = y * size + x
  touchNear = new Set()
  for (let row = Math.max(0, y - 1); row <= Math.min(size - 1, y + 1); row++)
    for (let column = Math.max(0, x - 1); column <= Math.min(size - 1, x + 1); column++)
      if (row * size + column !== touchOrigin) touchNear.add(row * size + column)
  const panel = positionTouchChoices()
  touchChoices.showModal()
  markTouchCells()
  // In the bottom panel the board scrolls so the tapped square (and its figure) stays above it.
  if (panel) revealAbove(touchChoices.getBoundingClientRect().top - 4, [cells[touchOrigin].getBoundingClientRect()])
}
const navigation = document.querySelector('nav')!
navigation.insertAdjacentHTML(
  'afterbegin',
  '<button id="danger" aria-label="敵の攻撃範囲" aria-pressed="false">☷ 危険<span class="nav-long">範囲</span></button><button id="undo">↶ 戻す</button>'
)
document
  .querySelector('#log')!
  .insertAdjacentHTML('afterend', '<section id="forecast" hidden aria-label="攻撃予測"></section>')
// Status tags float above the 3D layer on a second projected grid, nearer cells on top.
const marks: HTMLSpanElement[] = []
let longPress: ReturnType<typeof setTimeout> | undefined
let suppressClick = false,
  touchTap = false
let touchStart: { x: number; y: number } | undefined
for (let y = 0; y < size; y++)
  for (let x = 0; x < size; x++) {
    const cell = document.createElement('button')
    cell.className = 'cell'
    cell.tabIndex = x === 0 && y === 0 ? 0 : -1
    cell.style.cssText = `--x:${x};--y:${y}`
    cell.onclick = (event) => {
      if (suppressClick && event.detail > 0) {
        suppressClick = false
        return
      }
      suppressClick = false
      // pointerdown carries the input type everywhere; keyboard activation (detail 0) bypasses the chooser.
      if (touchTap && event.detail > 0 && touchAssist.getAttribute('aria-pressed') === 'true') chooseNearby(x, y)
      else void choose(x, y)
    }
    cell.oncontextmenu = (event) => {
      const target = game.units.find((unit) => unit.hp > 0 && unit.x === x && unit.y === y)
      if (target) {
        event.preventDefault()
        openDetail(target, cell)
      }
    }
    cell.onpointerdown = (event) => {
      clearTimeout(longPress)
      touchTap = event.pointerType === 'touch'
      suppressClick = false
      if (event.pointerType !== 'touch' || !event.isPrimary) return
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
      // Keyboard focus may land on a cell the camera has panned away from.
      if (cell.matches(':focus-visible')) camera.reveal([{ x, y }])
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
      cells[focusCell].focus({ preventScroll: true })
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
  restoreBoardFocus ||= Boolean(
    document.activeElement?.closest('#board, nav, #forecast') || document.activeElement === document.body
  )
  busy = true
  // Guidance must not point at controls a presentation has just disabled.
  tutorial.update()
  cells.forEach((cell) => (cell.disabled = true))
  document.querySelectorAll<HTMLButtonElement>('nav button').forEach((button) => (button.disabled = true))
  if (restoreBoardFocus && document.activeElement === document.body && !document.querySelector('dialog[open]')) {
    focusParking = document.querySelector<HTMLButtonElement>('#restart')!
    // Parking focus must not scroll a scrolling layout away from the board.
    focusParking.focus({ preventScroll: true })
  }
}
/** Chapter-report portrait: an idle pose rendered from the unit's own 3D model. */
const portrait = (u: Unit) => `<img class="portrait" alt="" src="${ready ? stage.portrait(u.role) : ''}">`
const detail = document.querySelector<HTMLDialogElement>('#detail')!
let detailTrigger: HTMLElement | null = null
function openDetail(unit: Unit, trigger: HTMLElement) {
  if (busy || !ready || detail.open) return
  detailTrigger = trigger
  document.querySelector('#detail-content')!.innerHTML = detailHtml(unit, ready ? stage.portrait(unit.role) : '')
  detail.showModal()
  // Open at the top so the unit's name shows first; the close button stays pinned at the bottom.
  document.querySelector<HTMLButtonElement>('#detail-close')!.focus({ preventScroll: true })
  detail.scrollTop = 0
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
  banner.innerHTML = `<b>${phaseLabel(phase)}</b><span>ターン ${game.turn}</span>`
  banner.hidden = false
  banner.dataset.phase = phase
  await pause(reducedMotion() ? 80 : 800)
  if (generation === token && version === bannerVersion) banner.hidden = true
}
board.onpointerleave = () => hover(-1, -1)
function updateGuide() {
  document.querySelector('#guide')!.textContent = guideText({
    game,
    selected: game.units.find((u) => u.id === selected),
    inspected: game.units.find((u) => u.id === (hovered ?? inspected)),
    pendingHeal: pending ? pendingHeal : undefined,
    canUndo: Boolean(undo && undo.id === selected),
    busy,
    ready
  })
}
// Floating elements on the scrolling layout sit below the pinned status bar, whatever its height.
const statusBar = document.querySelector<HTMLElement>('.status')!
new ResizeObserver(() =>
  document.documentElement.style.setProperty('--status-h', `${Math.ceil(statusBar.getBoundingClientRect().height)}px`)
).observe(statusBar)
// The tutorial's height (0 when hidden) positions the toast and labels that sit below it.
const tutorialEl = document.querySelector<HTMLElement>('#tutorial')!
new ResizeObserver(() =>
  document.documentElement.style.setProperty(
    '--tutorial-h',
    `${tutorialEl.hidden ? 0 : Math.ceil(tutorialEl.getBoundingClientRect().height)}px`
  )
).observe(tutorialEl)
// Side column: the tutorial takes the row beside the header; elsewhere it leads the console.
const sideColumn = matchMedia('(max-height: 500px) and (min-width: 560px)')
function placeTutorial() {
  if (sideColumn.matches) document.querySelector('main')!.prepend(tutorialEl)
  else consolePanel.prepend(tutorialEl)
}
placeTutorial()
sideColumn.addEventListener('change', placeTutorial)
let toastTimer: ReturnType<typeof setTimeout> | undefined
/** Failure feedback visible at every size; the log keeps the screen-reader announcement. */
function flash(message: string) {
  game.log = message
  const toast = document.querySelector<HTMLElement>('#toast')!
  toast.textContent = message
  toast.hidden = false
  document.querySelector('#log')!.textContent = message
  clearTimeout(toastTimer)
  toastTimer = setTimeout(
    () => {
      toast.hidden = true
    },
    Math.min(10000, Math.max(2400, message.length * 120))
  )
}
// A toast is information only; the next press anywhere but the objective puts it away.
document.addEventListener(
  'pointerdown',
  (event) => {
    if (event.target instanceof Element && event.target.closest('#objective')) return
    clearTimeout(toastTimer)
    document.querySelector<HTMLElement>('#toast')!.hidden = true
  },
  true
)
// Keyboard use puts a toast away too (modifier presses alone and the objective that opens it do not).
document.addEventListener(
  'keydown',
  (event) => {
    if (['Shift', 'Control', 'Alt', 'Meta'].includes(event.key)) return
    if (event.target instanceof Element && event.target.closest('#objective')) return
    clearTimeout(toastTimer)
    document.querySelector<HTMLElement>('#toast')!.hidden = true
  },
  true
)
function cancelForecast(restore = true) {
  if (!restore && document.activeElement?.closest('#forecast')) restoreBoardFocus = true
  pending = undefined
  pendingHeal = undefined
  document.querySelector<HTMLElement>('#forecast')!.hidden = true
  if (restore) forecastTrigger?.focus()
  tutorial.update()
  updateGuide()
}
/** Floating forecast (small landscape): scroll so the target sits between the viewport top and the card. */
function revealAboveCard(unit: Unit, target: Unit, card: HTMLElement) {
  const limit = card.getBoundingClientRect().top - 4
  const rect = (u: Unit) => cells[u.y * size + u.x].getBoundingClientRect()
  revealAbove(limit, [rect(unit), rect(target)], [rect(target)])
}
/** Top of the usable area: below the status bar where it stays pinned (small landscape scroll layout). */
function visibleTop() {
  const status = document.querySelector<HTMLElement>('.status')!
  return getComputedStyle(status).position === 'sticky' ? Math.max(0, status.getBoundingClientRect().bottom) : 0
}
/** Scroll so the squares (with ~44px of headroom for their figures) sit between the usable top and `limit`. */
function revealAbove(limit: number, rects: DOMRect[], fallback = rects) {
  const top = visibleTop()
  const span = (list: DOMRect[]) => ({
    top: Math.min(...list.map((r) => r.top)) - 44,
    bottom: Math.max(...list.map((r) => r.bottom))
  })
  let box = span(rects)
  if (box.bottom - box.top > limit - top) box = span(fallback)
  const delta = box.bottom > limit ? box.bottom - limit : box.top < top ? box.top - top : 0
  if (delta) window.scrollBy(0, delta)
}
/** Damage as the forecast stated it: the attacker's power before any level-up the strike earned. */
function dealt(before: Unit[], attacker: Unit, target: Unit) {
  return damage(before.find((old) => old.id === attacker.id) ?? attacker, target, game)
}
function showForecast(unit: Unit, target: Unit, healing: boolean) {
  pending = target.id
  pendingHeal = healing
  forecastTrigger = cells[target.y * size + target.x]
  const attackPreview = healing ? undefined : forecast(game, unit, target)
  const preview = attackPreview ?? healForecast(unit, target)
  const chips = attackPreview?.chips ?? []
  const card = document.querySelector<HTMLElement>('#forecast')!
  card.hidden = false
  card.setAttribute('aria-label', healing ? '回復予測' : '攻撃予測')
  card.innerHTML = forecastHtml({
    attacker: unit,
    target,
    attackerSrc: ready ? stage.portrait(unit.role) : '',
    targetSrc: ready ? stage.portrait(target.role) : '',
    healing,
    after: preview.after,
    damage: attackPreview?.amount,
    chips
  })
  card.querySelector('#confirm')!.addEventListener('click', () => void choose(target.x, target.y))
  card.querySelector('#cancel-forecast')!.addEventListener('click', () => cancelForecast())
  card.onkeydown = (event) => {
    if (event.key !== 'Tab') return
    event.preventDefault()
    const next = document.activeElement?.id === 'confirm' ? '#cancel-forecast' : '#confirm'
    card.querySelector<HTMLButtonElement>(next)!.focus()
  }
  const confirm = card.querySelector<HTMLButtonElement>('#confirm')!
  if (getComputedStyle(card).position === 'fixed') {
    confirm.focus({ preventScroll: true })
    revealAboveCard(unit, target, card)
  } else confirm.focus()
  tutorial.update()
  updateGuide()
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
const cellAt = (cell: string) => {
  const [x, y] = cell.split(',').map(Number)
  return { x, y }
}
let framed = -1,
  focused = ''
/**
 * Each battle opens on everyone; selecting an ally reveals its moves (after moving, its reach).
 */
function followCamera(unit: Unit | undefined, legal: Map<string, number>, reach: Set<string>) {
  if (framed !== generation) {
    framed = generation
    focused = ''
    camera.frameAll(game.units.filter((u) => u.hp > 0))
  }
  const focus = unit && game.phase === 'ally' ? `${unit.id}:${unit.x},${unit.y}:${unit.moved}:${unit.done}` : ''
  if (focus === focused) return
  focused = focus
  if (unit && focus && !unit.done) camera.focus([unit, ...[...legal.keys(), ...(unit.moved ? reach : [])].map(cellAt)])
}
let hoverCell = { x: -1, y: -1 }
let selectionHtml = ''
const terrainEl = document.querySelector<HTMLElement>('#terrain')!
/** Describe the terrain under the last hovered or focused cell (ally phase only). */
function updateTerrain() {
  const show =
    ready && hoverCell.x >= 0 && game.phase === 'ally' && document.querySelector<HTMLElement>('#result')!.hidden
  terrainEl.hidden = !show
  terrainEl.textContent = show ? terrainText(game, hoverCell.x, hoverCell.y) : ''
}
/** Preview an enemy's move and strike range while it is hovered or focused. */
function hover(x: number, y: number) {
  const id = game.units.find((u) => u.side === 'enemy' && u.hp > 0 && u.x === x && u.y === y)?.id
  const cellChanged = x !== hoverCell.x || y !== hoverCell.y
  hoverCell = { x, y }
  if (id === hovered) {
    if (cellChanged) updateTerrain()
    return
  }
  hovered = id
  if (!busy) render()
  else updateTerrain()
}
render = () => {
  document.querySelector<HTMLElement>('#app main')!.inert = titleOpen() || !contextAvailable
  // Guidance ends with the battle: a won or lost chapter has nothing left to point at.
  if (game.phase === 'won' || game.phase === 'lost') tutorial.hide()
  const focusedControl = document.activeElement as HTMLElement | null
  if (playing) {
    save.checkpoints = checkpoints
    save.formation = game.formation
    if (!busy && game.phase === 'lost') {
      delete save.suspend
    }
    if (!unloading) writeSave(save, notice)
  }
  field.dataset.mission = String(game.stage)
  document.querySelector<HTMLButtonElement>('#restart')!.disabled = replayingEnding
  document.querySelector<HTMLButtonElement>('#mission')!.disabled = replayingEnding
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
  const acting = game.phase === 'enemy' ? game.units.find((u) => u.id === actingId && u.hp > 0) : undefined
  if (!acting) actingId = undefined
  const settled = (u: Unit) => finished(game, u) && !(undo && undo.id === u.id)
  cells.forEach((cell, i) => {
    cell.disabled = busy || !ready
    const x = i % size,
      y = Math.floor(i / size),
      k = key(x, y),
      u = game.units.find((u) => u.x === x && u.y === y && u.hp > 0),
      canAttack = unit && !unit.heal && u && u.side !== unit.side && !unit.done && distance(unit, u) <= unit.range,
      canHeal = unit && u && unit.heal && healRange(game, unit).has(k) && distance(unit, u) <= 2,
      seize = objective.type === 'seize' && objective.x === x && objective.y === y
    const done = u ? settled(u) : false
    const terrain = game.groves.has(k) ? '木立（受けるダメージ −2）' : '平地'
    cell.className = `cell ${(x + y) % 2 ? 'odd' : ''} ${game.rocks.has(k) ? 'rock' : ''} ${game.groves.has(k) ? 'grove' : ''} ${legal.has(k) && !u ? 'legal' : ''} ${foeMove.has(k) && !u ? 'enemy-move' : ''} ${reach.has(k) ? 'reach' : ''} ${u?.side ?? ''} ${done ? 'done' : ''} ${u && u.id === selected ? 'selected' : ''} ${canAttack ? 'target' : ''} ${canHeal ? 'healable' : ''} ${seize ? 'seize' : ''} ${touchMark(y * size + x)} ${u && u === acting ? 'acting' : ''}`
    cell.classList.toggle('danger', threatened.has(k))
    // Billboard layer: undoes the floor projection so the status row stands upright above the model.
    marks[i].innerHTML = u
      ? `<span class="stand ${u.side} ${u.boss ? 'boss' : ''}"><span class="tag">${u.boss ? '<span class="crown">♛</span>' : ''}${u.armor ? '<span class="armor">⬡</span>' : ''}<span class="badge">${u.side === 'ally' ? '◆' : '▼'} ${u.hp}<span class="hpbar"><span style="width:${(u.hp / u.max) * 100}%"></span></span></span>${done ? '<span class="check">✓</span>' : ''}${canAttack ? `<span class="hit">−${damage(unit!, u, game)}</span>` : ''}${canHeal ? `<span class="healing-preview">✚ +${healForecast(unit!, u).after - u.hp}</span>` : ''}</span></span>`
      : ''
    cell.setAttribute(
      'aria-label',
      `${x + 1},${y + 1} ${u ? `${u.boss ? 'ボス ' : ''}${u.name} HP ${u.hp} ${done ? '行動済' : u.side === 'ally' && u.moved && !u.done ? '移動済' : ''}${canAttack ? ` 攻撃 ${damage(unit!, u, game)} ダメージ` : ''} ${terrain}` : game.rocks.has(k) ? (game.stage === 2 ? '崩れた城壁（岩）' : '岩') : game.groves.has(k) ? terrain : '平地'}${seize ? ' 制圧目標' : ''}${canHeal ? ' 回復可能' : ''}${legal.has(k) && !u ? ' 移動可能' : ''}${foeMove.has(k) && !u ? ' 敵の移動範囲' : ''}${reach.has(k) ? ' 攻撃範囲' : ''}${threatened.has(k) ? ' 敵の攻撃範囲' : ''}`
    )
  })
  tutorial.update()
  requestAnimationFrame(positionTags)
  if (stageAvailable && playing) stage.sync(game, unit?.id, undo?.id)
  followCamera(unit, legal, reach)
  const turnEl = document.querySelector<HTMLElement>('#turn')!
  turnEl.dataset.phase = game.phase
  turnEl.innerHTML = `<span class="turn-no">ターン <b>${game.turn}</b></span><span class="sep" aria-hidden="true"> · </span><span class="phase">${phaseLabel(game.phase)}</span>`
  document.querySelector('#count')!.innerHTML =
    `<span class="ally">味方 <b>${game.units.filter((u) => u.side === 'ally' && u.hp > 0).length}</b></span><span class="sep" aria-hidden="true"> · </span><span class="enemy">敵 <b>${game.units.filter((u) => u.side === 'enemy' && u.hp > 0).length}</b></span>`
  objectiveStatus.innerHTML = `<span class="hud-label">勝利条件</span> <span class="objective-text">${objectiveText(game)}</span>`
  objectiveStatus.title = objectiveDetail(game)
  objectiveStatus.setAttribute('aria-label', `勝利条件：${objectiveText(game)}（押すと条件の全文を表示）`)
  document.querySelector('#legend')!.innerHTML = legendItems({ game, selected: unit, foe, danger })
    .map(({ kind, label }) => `<span data-kind="${kind}"><i>${kind === 'seize' ? '✦' : ''}</i>${label}</span>`)
    .join('')
  const actor = document.querySelector<HTMLElement>('#actor')!
  actor.hidden = !acting
  if (acting) actor.textContent = `▼ ${acting.name}（${roleNames[acting.role] ?? acting.role}）の行動`
  const cardUnit = unit ?? game.units.find((u) => u.side === 'enemy' && u.hp > 0 && u.id === (hovered ?? inspected))
  const selectionEl = document.querySelector<HTMLElement>('#selection')!
  const cardHtml = cardUnit
    ? unitCardHtml(
        cardUnit,
        ready ? stage.portrait(cardUnit.role) : '',
        game.groves.has(key(cardUnit.x, cardUnit.y))
          ? '♣ 木立 −2'
          : objective.type === 'seize' && objective.x === cardUnit.x && objective.y === cardUnit.y
            ? '✦ 祠'
            : undefined
      )
    : '<p class="unit-empty">ユニットを選ぶと能力を表示</p>'
  // Portraits are data URLs: only replace the card when it changes, and keep the markup out of the DOM.
  if (cardHtml !== selectionHtml) {
    selectionHtml = cardHtml
    selectionEl.innerHTML = cardHtml
  }
  selectionEl.className = cardUnit ? 'unit-card' : ''
  if (cardUnit) selectionEl.dataset.side = cardUnit.side
  else delete selectionEl.dataset.side
  document.querySelector('#log')!.textContent = game.log
  updateTerrain()
  updateGuide()
  ;(document.querySelector('#detail-button') as HTMLButtonElement).disabled = busy || !ready || !(selected ?? inspected)
  document.querySelector<HTMLElement>('#fast')!.hidden = game.phase !== 'enemy'
  document.querySelector('#wait')!.classList.toggle('recommended', Boolean(undo && allyTurnOver(game)))
  ;(document.querySelector('#undo') as HTMLButtonElement).disabled = busy || !undo || undo.id !== selected
  ;(document.querySelector('#danger') as HTMLButtonElement).disabled = busy || !ready
  document.querySelector('#danger')!.setAttribute('aria-pressed', String(danger))
  ;(document.querySelector('#wait') as HTMLButtonElement).disabled =
    busy || !ready || !unit || unit.done || game.phase !== 'ally'
  const endButton = document.querySelector<HTMLButtonElement>('#end')!
  endButton.disabled = busy || !ready || game.phase !== 'ally'
  const left = game.phase === 'ally' ? game.units.filter((u) => u.side === 'ally' && u.hp > 0 && !settled(u)).length : 0
  endButton.innerHTML = `▶ ターン終了${left ? ` <span class="end-left">残り${left}</span>` : ''}`
  const potion = document.querySelector<HTMLButtonElement>('#recover')!
  potion.innerHTML = `✚ <span class="nav-long">回復</span>薬 ${game.potions}`
  potion.setAttribute('aria-label', `回復薬 残り${game.potions}`)
  potion.disabled =
    busy || !ready || !unit || unit.done || unit.hp >= unit.max || game.potions === 0 || game.phase !== 'ally'
  document.querySelector('#mission')!.innerHTML =
    `⚑ ${missions[game.stage].name}<span class="mission-difficulty"> · ${save.difficulty === 'casual' ? 'カジュアル' : 'クラシック'}</span>`
  const result = document.querySelector<HTMLDivElement>('#result')!
  // Wait for the final EXP presentation before revealing the chapter report.
  const wasHidden = result.hidden
  result.hidden = busy || (game.phase !== 'won' && game.phase !== 'lost')
  result.classList.toggle('chapter', game.phase === 'won')
  field.classList.toggle('reporting', !result.hidden)
  // The result needs the whole battlefield: bring it into view on the scrolling small layout.
  if (wasHidden && !result.hidden) showBattlefield()
  document.querySelector('#report')!.innerHTML =
    game.phase === 'won' ? chapterReport(game, portrait, save.difficulty === 'casual') : ''
  document.querySelector('#outcome')!.textContent =
    game.phase === 'won'
      ? game.stage === missions.length - 1
        ? '✦ 遠征達成！ 六つの燈がともった'
        : '✦ 霧が晴れた！'
      : '燈は消えた… 味方が全滅しました'
  const lost = !result.hidden && game.phase === 'lost'
  result.classList.toggle('defeat', game.phase === 'lost')
  for (const id of ['#retry', '#retry-missions', '#defeat-note'])
    document.querySelector<HTMLElement>(id)!.hidden = !lost
  if (!result.hidden) document.querySelectorAll<HTMLButtonElement>('nav button').forEach((b) => (b.disabled = true))
  const next = document.querySelector<HTMLButtonElement>('#next')!
  next.hidden = game.phase !== 'won'
  next.textContent = game.stage === missions.length - 1 ? '最初から遠征 ↻' : '次の任務 ▶'
  if (focusedControl !== document.body && document.activeElement === document.body) restoreBoardFocus = true
  if (
    restoreBoardFocus &&
    !busy &&
    ready &&
    !document.querySelector('dialog[open]') &&
    (document.activeElement === document.body || document.activeElement === focusParking)
  ) {
    const ally = game.units.find((candidate) => candidate.id === selected && candidate.hp > 0)
    if (ally && game.phase === 'ally') {
      cells[focusCell].tabIndex = -1
      focusCell = ally.y * size + ally.x
    }
    const target =
      game.phase === 'ally'
        ? cells[focusCell]
        : game.phase === 'won'
          ? next
          : document.querySelector<HTMLButtonElement>(game.phase === 'enemy' ? '#fast' : '#restart')!
    restoreBoardFocus = false
    focusParking = null
    // Only a board square may scroll into view; restoring focus to a button must not move the page.
    target.focus(target === cells[focusCell] ? undefined : { preventScroll: true })
  }
  audio.setBattle(game.phase === 'ally' || game.phase === 'enemy')
  if (playing && wasHidden && !result.hidden)
    audio.jingle(game.phase === 'lost' ? 'defeat' : game.stage === missions.length - 1 ? 'final' : 'victory')
}
function persistVictory() {
  if (!playing || game.phase !== 'won') return
  delete save.suspend
  if (!save.cleared.includes(game.stage)) save.cleared.push(game.stage)
  save.bestTurns[game.stage] = Math.min(save.bestTurns[game.stage] ?? Infinity, game.turn)
  if (game.stage === missions.length - 1) {
    save.completedAt ??= new Date().toISOString()
    save.finale = snapshotGame(game)
  } else {
    checkpoints[game.stage + 1] = carryForDifficulty(game, save.difficulty)
    save.furthest = Math.max(save.furthest, game.stage + 1)
  }
  save.checkpoints = checkpoints
  save.formation = game.formation
  if (!unloading) writeSave(save, notice)
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
    if (undo && undo.id !== target.id) undo = undefined
    cancelForecast(false)
    selected = target.id
    tutorial.advance('select')
    // The unit card shows the stats and matchups; the log just confirms the choice.
    game.log = `${target.name}（${roleNames[target.role] ?? target.role}）を選択`
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
        persistVictory()
        tutorial.advance('target')
        tutorial.advance('attack')
        changed = true
      } else {
        flash(
          unit.done
            ? `${unit.name}は行動済みです`
            : unit.heal
              ? `${unit.name}は攻撃できません（杖で回復）`
              : `${target.name}は射程外です（${unit.name}の射程 ${unit.range}）`
        )
        selected = undefined
        inspected = target.id
      }
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
      selected = undefined
      flash('選択を解除しました（移動は青いマスへ）')
    }
    if (changed) {
      const token = generation
      lockPresentation()
      await animation.present(
        game,
        before,
        unit,
        target ? { kind: 'attack', target, amount: dealt(before, unit, target) } : undefined
      )
      if (token !== generation) return
      if (!(await showProgress(token))) return
      if (unit.done) undo = undefined
      render()
      await story.victory(token)
      if (token !== generation) return
      busy = false
    }
  } else if (target) {
    inspected = target.id
    game.log = `${target.name}（${roleNames[target.role] ?? target.role} Lv${target.level}）HP ${target.hp}/${target.max} · 攻撃 ${target.power} · 射程 ${target.range}${target.armor ? ` · 盾 ${target.armor}` : ''}`
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
    persistVictory()
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
  showBattlefield()
  await phaseBanner('enemy', token)
  if (token !== generation) return
  for (const u of game.units.filter((u) => u.side === 'enemy' && u.hp > 0)) {
    actingId = u.id
    render()
    if (!fast) await pause(280)
    if (token !== generation) return
    const before = snapshot(game),
      standing = game.units.filter((a) => a.side === 'ally' && a.hp > 0)
    const target = enemyStep(game, u)
    // Follow the enemy when its move or strike would happen off screen.
    camera.reveal([before.find((old) => old.id === u.id)!, u, ...(target ? [target] : [])], fast ? 90 : 280)
    lockPresentation()
    await animation.present(
      game,
      before,
      u,
      target ? { kind: 'attack', target, amount: dealt(before, u, target) } : undefined,
      fast ? 3 : 1
    )
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
  actingId = undefined
  beginAlly(game)
  persistVictory()
  // A survive objective is won once the last required enemy phase ends.
  if (game.phase === 'won') {
    if (await victoryScene(token)) render()
    return
  }
  save.suspend = snapshotGame(game)
  if (!unloading) writeSave(save, notice)
  render()
  camera.reveal(game.units.filter((u) => u.side === 'ally' && u.hp > 0))
  void phaseBanner('ally', token)
  playSharedUiSound('turn', uiVolume())
}
/** A chapter opening requested before the models were ready (true: a new expedition, prologue first). */
let pendingOpening: boolean | undefined
/** Chapter title card and intro scenes, then the first ally-phase banner. */
/** Small landscape screens scroll the page: bring the whole battlefield into view. */
function showBattlefield() {
  if (matchMedia('(max-height: 500px) and (max-width: 559px)').matches) field.scrollIntoView({ block: 'end' })
}
async function openChapter(fresh: boolean) {
  const token = generation
  await story.start(fresh)
  if (token === generation) {
    if (game.stage === 0) tutorial.start(tutorialEnabled())
    showBattlefield()
    void phaseBanner('ally', token)
  }
}
/** Plays the chapter outro (and the finale) before the report; false if a restart superseded it. */
async function victoryScene(token: number) {
  lockPresentation()
  render()
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
function hasProgress() {
  const initial = createGame(game.stage, game.formation, checkpoints[game.stage])
  return (
    game.turn !== 1 ||
    game.phase !== 'ally' ||
    game.potions !== initial.potions ||
    JSON.stringify(game.units) !== JSON.stringify(initial.units)
  )
}
function confirmDiscard(action: () => void) {
  // A defeat already cleared the suspend record and a victory is already saved.
  if (game.phase === 'lost' || game.phase === 'won') return action()
  if (!hasProgress()) return action()
  confirmReplacement('現在の戦闘と中断記録が失われます。', action)
}
function restartChapter() {
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
  else {
    pendingOpening = false
    void prepareBattle()
  }
}
document.querySelector('#restart')!.addEventListener('click', () => confirmDiscard(restartChapter))
// A lost battle has nothing left to discard.
document.querySelector('#retry')!.addEventListener('click', restartChapter)
document
  .querySelector('#retry-missions')!
  .addEventListener('click', () => document.querySelector<HTMLButtonElement>('#mission')!.click())
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
      const current = i === game.stage
      const badges = `${current ? ' <em class="badge-current">現在の任務</em>' : ''}${save.cleared.includes(i) ? ' <em class="badge-clear">✓ クリア</em>' : ''}`
      return `<button data-stage="${i}"${current ? ' aria-current="true"' : ''}><strong>${m.name} · ${save.difficulty === 'casual' ? 'カジュアル' : 'クラシック'}${badges}</strong><small>${m.hint}</small><small class="objective">勝利条件：${chapterObjective(i)} · 味方全滅で敗北</small><small class="roster">開始 Lv ${levels.join(' / ')}${saved ? ' · 到達時の記録' : ''}</small><small class="roster">${sortie(i)}</small></button>`
    })
    .join('')
  document.querySelectorAll<HTMLButtonElement>('[data-stage]').forEach(
    (button) =>
      (button.onclick = () => {
        confirmDiscard(() => {
          expedition.close()
          startMission(Number(button.dataset.stage))
        })
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
    confirmReplacement(
      '達成した遠征の記録、解放した章とチェックポイントが新しい遠征に置き換わります。',
      () => {
        save = freshSave(save.difficulty)
        checkpoints = save.checkpoints
        startMission(0)
      },
      '⚠ 新しい遠征を始めますか？'
    )
    return
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
preparation.innerHTML =
  '<span role="status" aria-live="polite"></span><i class="prep-bar"><em></em></i><button hidden>再試行</button>'
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
  const bar = preparation.querySelector<HTMLElement>('.prep-bar')!
  const fill = bar.querySelector('em')!
  bar.hidden = false
  fill.style.width = '0%'
  status.textContent = '3D モデルを準備中…'
  titleProgress(status.textContent)
  void prepareSound(roles, token)
  try {
    await animation.prepare(roles, (done, total) => {
      if (token !== generation) return
      fill.style.width = `${Math.round((done / total) * 100)}%`
      status.textContent = `3D モデルを準備中 ${Math.round((done / total) * 100)}%`
      titleProgress(status.textContent)
    })
    if (token !== generation) return
    ready = true
    preparation.remove()
    titleProgress('準備完了')
    render()
    if (replayingEnding) {
      stage.sync(game)
      void story.victory(token).then(() => {
        if (token === generation) location.reload()
      })
      return
    }
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
    bar.hidden = true
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
    replayingEnding = true
    game = save.finale ? restoreGame(save.finale) : newGame(missions.length - 1, save.formation)
    game.phase = 'won'
    lockPresentation()
    render()
    void prepareBattle()
  },
  settings,
  help: openHelp
})
if (!stageAvailable) {
  const title = document.querySelector<HTMLElement>('.title-screen')!
  const buttons = title.querySelectorAll<HTMLButtonElement>(
    '[data-action=new], [data-action=continue], [data-action=chapters], [data-action=ending]'
  )
  buttons.forEach((button) => (button.disabled = true))
  titleProgress('WebGLを利用できません。ブラウザの設定やハードウェアアクセラレーションを確認してください。')
  const retryRenderer = document.createElement('button')
  retryRenderer.textContent = '↻ 画面を再試行'
  title.querySelector('nav')!.prepend(retryRenderer)
  retryRenderer.focus()
  retryRenderer.onclick = () => {
    if (!createStage()) return
    buttons.forEach((button) => (button.disabled = button.dataset.action !== 'new' && !saved))
    titleProgress('')
    retryRenderer.remove()
    title.querySelector<HTMLButtonElement>('nav button:not(:disabled)')!.focus()
    render()
  }
}
