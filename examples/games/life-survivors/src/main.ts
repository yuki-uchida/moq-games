import './style.css'
import { CooperativeNetwork } from '../../rabbiters/src/network'
import { bindUiSounds, playSharedUiSound, warmUpAudio } from '../../shared/UiSound'
import {
  ENEMY_BY_ID,
  MAX_WEAPON_LEVEL,
  PASSIVE_BY_ID,
  RUN_SECONDS,
  TALENT_CATEGORIES,
  TAG_NAMES,
  TALENT_WEAPONS,
  WEAPON_BY_ID,
  ageAt,
  stageAt,
  type TalentCategory
} from './data'
import { GIFTED, Game, POOR, choiceText, type Input, type Player } from './game'
import { Renderer } from './render'
import { readView, toView, type View, type ViewPlayer } from './view'

function element<T extends HTMLElement>(selector: string): T {
  const found = document.querySelector<T>(selector)
  if (!found) throw new Error(`Missing element: ${selector}`)
  return found
}

const canvas = element<HTMLCanvasElement>('#world')
const renderer = new Renderer(canvas)
const hud = element<HTMLElement>('#hud')
const startPanel = element<HTMLElement>('#start-panel')
const levelup = element<HTMLElement>('#levelup')
const cards = element<HTMLElement>('#cards')
const help = element<HTMLElement>('#help')
const result = element<HTMLElement>('#result')
const startError = element<HTMLElement>('#start-error')
const connection = element<HTMLElement>('#connection')
const relay = element<HTMLInputElement>('#relay')
const room = element<HTMLInputElement>('#room')
const feed = element<HTMLElement>('#feed')
const buttons = ['#solo', '#host', '#join'].map((selector) => element<HTMLButtonElement>(selector))
// Guests send input at ~15 Hz; the host's larger snapshots go at 10 Hz and guests ease between them.
const SEND_MS = 66
const SNAPSHOT_MS = 100
const APP = 'life-survivors-v1'
/** A lost life lets the last death animation (and the rising soul) play before the result dialog. */
const DEATH_DELAY_MS = 4200

let role: 'solo' | 'host' | 'guest' | undefined
let game: Game | undefined
let network: CooperativeNetwork | undefined
let view: View | undefined
let localId = ''
let started = false
let generation = 0
let lastTime = performance.now()
let sentAt = 0
let hudAt = 0
let shownChoices = ''
let resultShown = false
let lostAt = 0
let pick: { index: number; seq: number } | undefined
const seenLog = new Set<string>()
const remoteInputAt = new Map<string, number>()
const keys = new Set<string>()
let drag: { id: number; x: number; y: number; dx: number; dy: number } | undefined

const me = (): ViewPlayer | undefined => view?.players.find((player) => player.id === localId)

function movement() {
  let x = (keys.has('KeyD') || keys.has('ArrowRight') ? 1 : 0) - (keys.has('KeyA') || keys.has('ArrowLeft') ? 1 : 0)
  let y = (keys.has('KeyS') || keys.has('ArrowDown') ? 1 : 0) - (keys.has('KeyW') || keys.has('ArrowUp') ? 1 : 0)
  if (drag && Math.hypot(drag.dx, drag.dy) > 8) {
    x = drag.dx / 50
    y = drag.dy / 50
  }
  const length = Math.hypot(x, y)
  return length > 1 ? { x: x / length, y: y / length } : { x, y }
}

function input(): Input {
  const move = movement()
  return { ...move, pick: pick?.index ?? -1, pickSeq: pick?.seq ?? -1 }
}

function setStatus(text: string) {
  connection.textContent = text
}

function showStartError(message: string) {
  startError.textContent = message
}

async function start(next: 'solo' | 'host' | 'guest') {
  const attempt = ++generation
  startError.textContent = ''
  buttons.forEach((button) => (button.disabled = true))
  localId = crypto.randomUUID()
  role = next
  game = next === 'guest' ? undefined : new Game()
  game?.addPlayer(localId)
  view = game ? toView(game.state) : undefined
  remoteInputAt.clear()
  seenLog.clear()
  pick = undefined
  shownChoices = ''
  resultShown = false
  lostAt = 0
  try {
    if (next !== 'solo') {
      if (!relay.value.trim() || !room.value.trim()) throw new Error('Relay URLとルーム名を入力してください。')
      let failure = ''
      const current = new CooperativeNetwork({
        app: APP,
        relayUrl: relay.value.trim(),
        room: room.value.trim(),
        role: next,
        playerId: localId,
        onInput: (id, value) => {
          if (attempt !== generation || !game) return
          remoteInputAt.set(id, performance.now())
          game.setInput(id, value)
        },
        onSnapshot: (value) => {
          if (attempt !== generation) return
          const received = readView(value)
          if (received) view = received
        },
        onPresence: (ids) => {
          if (attempt !== generation || next !== 'host' || !game) return
          for (const id of ids) game.addPlayer(id)
          for (const player of [...game.state.players])
            if (player.id !== localId && !ids.includes(player.id)) game.removePlayer(player.id)
        },
        onStatus: (status, message) => {
          if (attempt !== generation || network !== current) return
          if (status === 'error') {
            failure = `通信エラー: ${message}`
            disconnect(failure, current)
          } else if (status === 'ready') setStatus(next === 'host' ? `ホスト · ${room.value.trim()}` : 'みんなで')
          else if (status === 'waiting-for-host') setStatus('ホストを待っています')
          else if (status === 'connecting') setStatus('Relayに接続中')
        }
      })
      network = current
      let timer: number | undefined
      try {
        await Promise.race([
          current.start(),
          new Promise<never>((_, reject) => {
            timer = window.setTimeout(() => reject(new Error('Relayへの接続がタイムアウトしました。')), 15000)
          })
        ])
      } finally {
        window.clearTimeout(timer)
      }
      if (attempt !== generation) return
      if (failure) throw new Error(failure)
    } else setStatus('ひとりで')
    started = true
    startPanel.hidden = true
    hud.hidden = false
    result.hidden = true
    keys.clear()
    canvas.focus()
  } catch (cause) {
    if (attempt !== generation) return
    const failed = network
    network = undefined
    void failed?.stop()
    game = undefined
    view = undefined
    role = undefined
    showStartError(cause instanceof Error ? cause.message : '接続できませんでした。')
  } finally {
    if (attempt === generation) buttons.forEach((button) => (button.disabled = false))
  }
}

function disconnect(message: string, source: CooperativeNetwork) {
  if (network !== source) return
  showStartError(message)
  network = undefined
  void source.stop(false)
  if (!started) return
  showResult('通信が切断されました', `${message} タイトルに戻ってやり直してください。`, '📡', [])
}

async function returnToTitle() {
  ++generation
  started = false
  const current = network
  network = undefined
  game = undefined
  view = undefined
  role = undefined
  hud.hidden = true
  levelup.hidden = true
  result.hidden = true
  help.hidden = true
  startPanel.hidden = false
  buttons.forEach((button) => (button.disabled = false))
  setStatus('ひとりで')
  await current?.stop()
}

function choose(index: number) {
  const player = me()
  if (!player || index >= player.choices.length) return
  pick = { index, seq: player.choiceSeq }
  if (game) game.setInput(localId, input())
  levelup.hidden = true
  shownChoices = ''
}

function renderChoices(player: ViewPlayer | undefined) {
  const key =
    player && player.choices.length && pick?.seq !== player.choiceSeq
      ? `${player.choiceSeq}:${player.choices.join()}`
      : ''
  if (key === shownChoices) return
  shownChoices = key
  levelup.hidden = !key
  if (!key || !player) return
  const owner = {
    ...player,
    weapons: player.weapons.map(([id, lv]) => ({ id, lv })),
    passives: player.passives.map(([id, lv]) => ({ id, lv }))
  }
  element<HTMLElement>('#levelup-note').textContent =
    role === 'solo'
      ? '時間は止まっています。1〜3キーでも選べます。'
      : '時間は流れ続けています（選択中は足が遅くなる）。1〜3キーでも選べます。'
  cards.replaceChildren(
    ...player.choices.map((choice, index) => {
      const info = choiceText(owner as unknown as Player, choice)
      const button = document.createElement('button')
      button.type = 'button'
      button.className = 'card'
      const icon = document.createElement('span')
      icon.className = 'icon'
      icon.textContent = info.icon
      const name = document.createElement('strong')
      name.textContent = info.name
      if (info.tag) {
        const tag = document.createElement('em')
        tag.textContent = info.tag
        name.append(tag)
      }
      const text = document.createElement('span')
      text.textContent = info.text
      const hint = document.createElement('kbd')
      hint.textContent = String(index + 1)
      button.append(icon, name, text, hint)
      button.addEventListener('click', () => choose(index))
      return button
    })
  )
  ;(cards.firstElementChild as HTMLButtonElement | null)?.focus({ preventScroll: true })
}

function slot(icon: string, level: number, className: string, title: string) {
  const item = document.createElement('div')
  item.className = `slot ${className}`
  item.title = title
  item.textContent = icon
  const badge = document.createElement('b')
  badge.textContent = level >= MAX_WEAPON_LEVEL && className !== 'passive' ? 'MAX' : String(level)
  item.append(badge)
  return item
}

let handKey = ''
function updateHud(current: View) {
  const player = current.players.find((p) => p.id === localId)
  const time = Math.min(current.time, RUN_SECONDS)
  const stage = stageAt(time)
  element('#age').textContent = String(ageAt(time))
  element('#stage').textContent = stage.name
  element('#clock').textContent =
    `${String(Math.floor(time / 60)).padStart(2, '0')}:${String(Math.floor(time % 60)).padStart(2, '0')}`
  element('#life-progress').style.width = `${(time / RUN_SECONDS) * 100}%`
  element('#level').textContent = `Lv ${current.level}`
  element('#xp-fill').style.width = `${Math.min(100, (current.xp / current.xpNext) * 100)}%`
  element('#kills').textContent = String(current.kills)
  if (player) {
    element('#hp-fill').style.width = `${Math.max(0, (player.hp / player.maxHp) * 100)}%`
    element('#hp-value').textContent = player.downed ? '折' : String(Math.max(0, Math.ceil(player.hp)))
    element('.mind-card').classList.toggle('low', player.hp / player.maxHp < 0.3)
    const key = JSON.stringify([player.weapons.map((w) => w.slice(0, 2)), player.passives])
    if (key !== handKey) {
      handKey = key
      const owner = { passives: player.passives.map(([id, lv]) => ({ id, lv })) }
      element('#weapons').replaceChildren(
        ...player.weapons.map(([id, lv]) => {
          const def = WEAPON_BY_ID.get(id)!
          const evolved = Boolean(
            def.evolve && lv >= MAX_WEAPON_LEVEL && owner.passives.some((p) => p.id === def.evolve!.passive)
          )
          return slot(
            def.icon,
            lv,
            def.parent ? 'parent' : evolved ? 'evolved' : '',
            evolved ? def.evolve!.name : def.name
          )
        })
      )
      element('#passives').replaceChildren(
        ...player.passives.map(([id, lv]) => {
          const def = PASSIVE_BY_ID.get(id)!
          return slot(def.icon, lv, 'passive', def.name)
        })
      )
    }
  }
  const team = element('#team')
  team.hidden = current.players.length < 2
  team.replaceChildren(
    ...current.players.map((p) => {
      const li = document.createElement('li')
      const dot = document.createElement('i')
      dot.style.background = p.color
      li.append(
        dot,
        `${p.name}${p.id === localId ? '（あなた）' : ''} ${p.downed ? '💔' : `${Math.ceil(p.hp)}/${p.maxHp}`}`
      )
      return li
    })
  )
  for (const entry of current.log) {
    if (entry.to && entry.to !== localId) continue
    const key = `${entry.t}:${entry.text}`
    if (seenLog.has(key)) continue
    seenLog.add(key)
    const line = document.createElement('p')
    line.textContent = entry.text
    if (entry.to) line.className = 'private'
    feed.prepend(line)
    element('#announcements').textContent = entry.text
    setTimeout(() => line.remove(), 5000)
    while (feed.children.length > 4) feed.lastElementChild?.remove()
  }
  if (current.phase === 'lost' && !lostAt) lostAt = performance.now()
  const settled = current.phase === 'won' || (current.phase === 'lost' && performance.now() - lostAt >= DEATH_DELAY_MS)
  if (settled && !resultShown) {
    const age = ageAt(current.time)
    const won = current.phase === 'won'
    const killer = player?.killer ? ENEMY_BY_ID.get(player.killer) : undefined
    const cause = killer ? `とどめ：${killer.name}（${TAG_NAMES[killer.tag]}）。` : ''
    showResult(
      won ? `大往生 — 享年${age}歳` : `心が折れた — 享年${age}歳`,
      won
        ? `死神が迎えに来た。30分の人生を生き抜いた。Lv ${current.level}・乗り越えた困難 ${current.kills}`
        : `${stageAt(current.time).name}で力尽きた。${cause}Lv ${current.level}・乗り越えた困難 ${current.kills}`,
      won ? '🌅' : '💔',
      player ? reflection(player) : []
    )
  }
}

/** The end screen finally reveals the hidden talents. */
function reflection(player: ViewPlayer) {
  const rows: HTMLElement[] = []
  const add = (left: string, right: string, className = '') => {
    const row = document.createElement('div')
    row.className = className
    const a = document.createElement('span')
    a.textContent = left
    const b = document.createElement('span')
    b.textContent = right
    row.append(a, b)
    rows.push(row)
  }
  add(
    `親：${WEAPON_BY_ID.get(player.parent)!.icon} ${WEAPON_BY_ID.get(player.parent)!.name}`,
    WEAPON_BY_ID.get(player.parent)!.perk ?? ''
  )
  for (const [id, lv, damage] of player.weapons) {
    const def = WEAPON_BY_ID.get(id)!
    add(`${def.icon} ${def.name} Lv${lv}`, `与えた力 ${damage.toLocaleString()}`)
  }
  if (player.talents) {
    const names = Object.fromEntries(TALENT_WEAPONS.map((def) => [def.category, `${def.icon} ${def.name}`]))
    for (const category of TALENT_CATEGORIES as TalentCategory[]) {
      const value = player.talents[category]
      if (value === GIFTED) add(`才能：${names[category]}`, '🌟 天賦の才', 'gifted')
      else if (value === POOR) add(`才能：${names[category]}`, '✖ 不向き', 'poor')
    }
  }
  return rows
}

function showResult(title: string, text: string, symbol: string, rows: HTMLElement[]) {
  resultShown = true
  levelup.hidden = true
  element('#result-title').textContent = title
  element('#result-text').textContent = text
  element('#result-symbol').textContent = symbol
  element('#result-build').replaceChildren(...rows)
  result.hidden = false
  element<HTMLButtonElement>('#restart').focus()
}

function frame(now: number) {
  const dt = Math.min(Math.max((now - lastTime) / 1000, 0), 0.1)
  lastTime = now
  const current = input()
  if (started && game && !resultShown) {
    game.setInput(localId, current)
    if (role === 'host')
      for (const player of game.state.players)
        if (player.id !== localId && now - (remoteInputAt.get(player.id) ?? 0) > 500)
          game.setInput(player.id, { x: 0, y: 0, pick: -1, pickSeq: -1 })
    game.step(dt)
    view = toView(game.state)
  }
  const player = me()
  if (pick && player && player.choiceSeq !== pick.seq) pick = undefined
  if (started && network && now - sentAt >= (role === 'host' ? SNAPSHOT_MS : SEND_MS)) {
    sentAt = now
    const link = network
    const operation = role === 'host' && view ? link.broadcastSnapshot(view) : link.sendInput(current)
    void operation.catch((cause: unknown) =>
      disconnect(`通信エラー: ${cause instanceof Error ? cause.message : String(cause)}`, link)
    )
  }
  if (view) renderer.draw(view, localId, dt, role === 'guest')
  else renderer.draw(attract.view(now), 'attract', dt, false)
  if (started && view) {
    renderChoices(resultShown ? undefined : player)
    if (now - hudAt > 100) {
      hudAt = now
      updateHud(view)
    }
    if (role === 'guest' && !player && view.players.length >= 8) setStatus('満員のため観戦中')
  }
  requestAnimationFrame(frame)
}

/** Behind the title: a self-playing baby so the page is alive before you start. */
const attract = (() => {
  const demo = new Game(7)
  demo.addPlayer('attract', 'p_monster')
  let last = performance.now()
  return {
    view(now: number) {
      const step = Math.min(0.05, (now - last) / 1000)
      last = now
      const p = demo.state.players[0]
      demo.setInput('attract', { x: Math.cos(now / 2400), y: Math.sin(now / 3100), pick: 0, pickSeq: p.choiceSeq })
      if (p.downed || demo.state.time > 200) {
        demo.state = new Game(now).state
        demo.addPlayer('attract', 'p_monster')
      }
      demo.step(step)
      return toView(demo.state)
    }
  }
})()

buttons[0].addEventListener('click', () => void start('solo'))
buttons[1].addEventListener('click', () => void start('host'))
buttons[2].addEventListener('click', () => void start('guest'))
element('#leave').addEventListener('click', () => void returnToTitle())
element('#restart').addEventListener('click', () => void returnToTitle())
element('#help-open').addEventListener('click', () => {
  help.hidden = false
  element<HTMLButtonElement>('#help-close').focus()
})
for (const selector of ['#help-close', '#help-done'])
  element(selector).addEventListener('click', () => {
    help.hidden = true
  })
bindUiSounds(document, (kind) => playSharedUiSound(kind, 1), 'button')
warmUpAudio()

const moveKeys = new Set(['KeyW', 'KeyA', 'KeyS', 'KeyD', 'ArrowUp', 'ArrowLeft', 'ArrowDown', 'ArrowRight'])
window.addEventListener('keydown', (event) => {
  if (event.code === 'Escape') help.hidden = true
  if (!started || !help.hidden) return
  if (/^Digit[1-4]$/.test(event.code) && !levelup.hidden) {
    choose(Number(event.code.slice(5)) - 1)
    event.preventDefault()
  } else if (moveKeys.has(event.code)) {
    keys.add(event.code)
    event.preventDefault()
  }
})
window.addEventListener('keyup', (event) => keys.delete(event.code))
window.addEventListener('blur', () => keys.clear())
window.addEventListener('resize', () => renderer.resize())
window.addEventListener('pagehide', () => void network?.stop())
canvas.addEventListener('pointerdown', (event) => {
  if (!started) return
  drag = { id: event.pointerId, x: event.clientX, y: event.clientY, dx: 0, dy: 0 }
  canvas.setPointerCapture(event.pointerId)
})
canvas.addEventListener('pointermove', (event) => {
  if (drag?.id !== event.pointerId) return
  drag.dx = event.clientX - drag.x
  drag.dy = event.clientY - drag.y
})
for (const type of ['pointerup', 'pointercancel'] as const)
  canvas.addEventListener(type, (event) => {
    if (drag?.id === event.pointerId) drag = undefined
  })

if (import.meta.env.DEV)
  Object.assign(window, {
    __life: {
      get game() {
        return game
      },
      get view() {
        return view
      },
      get localId() {
        return localId
      }
    }
  })

requestAnimationFrame(frame)
