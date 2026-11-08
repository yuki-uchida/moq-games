import './style.css'
import { getPrimaryRelayUrl } from '../../../../utils/relayPresets'
import { CooperativeNetwork } from '../../rabbiters/src/network'
import { bindUiSounds, playSharedUiSound, warmUpAudio } from '../../shared/UiSound'
import {
  COOKING_EFFECTS,
  ENEMIES,
  ENEMY_BY_ID,
  EVENTS,
  MAX_WEAPON_LEVEL,
  PARENT_LEGACIES,
  PEOPLE_FEAR,
  PASSIVE_BY_ID,
  RUN_SECONDS,
  STAGES,
  TALENT_NAMES,
  TAG_NAMES,
  WEAPONS,
  WEAPON_BY_ID,
  ageAt,
  stageAt
} from './data'
import { resultCategories, talentRadarPoints } from './result'
import { Game, choiceText, type Input, type Player } from './game'
import { gambleForm, observationForm, outdoorForm, petForm, sportsForm, weaponAppearance } from './weapon-life'
import { LifeAudio } from './audio'
import { musicCue } from './music'
import { statusModel, type StatusItem } from './status'
import { FX } from './fx'
import {
  ANNOUNCE_RANK,
  Announcer,
  BANNER_MS,
  BannerQueue,
  FxTracker,
  STAGE_LINES,
  choiceRarity,
  choiceSynergies,
  consumeFx,
  findBoss,
  heartbeatLevel,
  phaseCue,
  type Banner,
  type FxEv,
  type Rarity
} from './hud'
import { deathKind } from './art/deaths'
import { parentFarewell } from './history'
import { choiceIcon, iconImg } from './art/icons'
import { sheet } from './art/index'
import { duration } from './art/sheet'
import { Renderer, bodyFor } from './render'
import type { Box } from './food-layout'
import { hidesBehind } from './hud-occlusion'
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
const statusDialog = element<HTMLElement>('#status')
const result = element<HTMLElement>('#result')
const startError = element<HTMLElement>('#start-error')
const connection = element<HTMLElement>('#connection')
// ?relayUrl= overrides it for local relays and tests.
const relayUrl = getPrimaryRelayUrl('https://relay.moqt.research.skyway.io')
const room = element<HTMLInputElement>('#room')
const feed = element<HTMLElement>('#feed')
const buttons = ['#solo', '#host', '#join'].map((selector) => element<HTMLButtonElement>(selector))
// Guests send input at ~15 Hz; the host's larger snapshots go at 10 Hz and guests ease between them.
const SEND_MS = 66
const SNAPSHOT_MS = 100
const APP = 'life-survivors-v20'
/** 大往生: the haloed soul rises and the reaper bows before the result (well inside the reaper's 8 s budget). */
const WON_DELAY_MS = 3000

/** A lost life lets the local player's death animation play out: the dialog follows ~1 s after its last frame. */
function deathDelayMs(player: ViewPlayer | undefined, time: number) {
  const body = bodyFor(stageAt(time))
  const tag = player?.killer ? ENEMY_BY_ID.get(player.killer)?.tag : undefined
  const deaths = sheet(`death:${body}`)
  const anim = deaths[deathKind(tag, ageAt(time), body)] ?? deaths.collapse
  return Math.min(5000, (duration(anim) + 1) * 1000)
}

const audio = new LifeAudio()
const tracker = new FxTracker()
const banners = new BannerQueue()
let prevPhase: string | undefined
let beatShown = 0
const reduced = window.matchMedia?.('(prefers-reduced-motion: reduce)').matches ?? false

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
let shownChoiceHand = ''
let resultShown = false
let lostAt = 0
let wonAt = 0
let pick: { index: number; seq: number } | undefined
const seenLog = new Set<string>()
const announcer = new Announcer()
/** Writes the assertive screen-reader line unless a higher-ranked line from the same moment holds it. */
const announce = (text: string, time: number, rank: number = ANNOUNCE_RANK.message) => {
  if (announcer.take(rank, time)) element('#announcements').textContent = text
}
const remoteInputAt = new Map<string, number>()
const keys = new Set<string>()
let drag: { id: number; x: number; y: number; dx: number; dy: number } | undefined
const STICK_RADIUS = 56
const STICK_DEAD = 6
const stick = element<HTMLElement>('#stick')
const stickKnob = element<HTMLElement>('#stick-knob')
/** Touch players see tap hints instead of number-key hints. */
let touchUi = matchMedia('(pointer: coarse)').matches
/** A card tap this soon after the hand opens is a stray tap meant for moving, not a choice. */
const CARD_TAP_GUARD_MS = 350
let cardsShownAt = 0
const moveHint = element<HTMLElement>('#move-hint')

const me = (): ViewPlayer | undefined => view?.players.find((player) => player.id === localId)

function movement() {
  let x = (keys.has('KeyD') || keys.has('ArrowRight') ? 1 : 0) - (keys.has('KeyA') || keys.has('ArrowLeft') ? 1 : 0)
  let y = (keys.has('KeyS') || keys.has('ArrowDown') ? 1 : 0) - (keys.has('KeyW') || keys.has('ArrowUp') ? 1 : 0)
  if (drag && Math.hypot(drag.dx, drag.dy) > STICK_DEAD) {
    x = drag.dx / STICK_RADIUS
    y = drag.dy / STICK_RADIUS
  }
  const length = Math.hypot(x, y)
  return length > 1 ? { x: x / length, y: y / length } : { x, y }
}

const PAUSE_STALE_MS = 1000
const pauseHolds = new Map<string, number>()

function holdPause(id: string, now: number) {
  pauseHolds.set(id, now)
}

function activePauses(now: number): string[] {
  if (!game) return []
  const ids: string[] = []
  for (const player of game.state.players) {
    const hold = pauseHolds.get(player.id)
    if (hold === undefined) continue
    if (now - hold > PAUSE_STALE_MS) pauseHolds.delete(player.id)
    else ids.push(player.id)
  }
  return ids
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

const bannerLayer = element<HTMLElement>('#banner')
let bannerEl: HTMLElement | undefined
let farewellEl: HTMLElement | undefined
let farewellUntil = 0

function unmountBanner() {
  bannerEl?.remove()
  bannerEl = undefined
}

function el<K extends keyof HTMLElementTagNameMap>(tag: K, className: string, content?: string) {
  const node = document.createElement(tag)
  node.className = className
  if (content !== undefined) node.textContent = content
  return node
}

function mountBanner(banner: Banner) {
  const node = el('div', `banner banner-${banner.kind}`)
  if (banner.kind === 'warning' && banner.sub === '人生イベント：親の介護') node.classList.add('banner-care')
  node.style.setProperty('--dur', `${banner.duration}ms`)
  if (banner.kind === 'warning') {
    node.append(el('i', 'stripes top'), el('b', 'banner-title', banner.title), el('i', 'stripes bottom'))
    if (banner.sub) node.append(el('p', 'banner-sub', banner.sub))
    pulse(element('#edge-pulse'), 'alert', banner.duration + 300)
  } else if (banner.kind === 'evolve' && banner.art) {
    const from = el('span', 'evo-icon from')
    from.append(iconImg(banner.art.id, banner.art.from))
    const to = el('span', 'evo-icon to')
    to.append(iconImg(banner.art.id, banner.art.to, true))
    const text = el('div', 'evo-text')
    text.append(el('b', 'banner-title', banner.title), el('p', 'banner-sub', banner.sub ?? ''))
    node.append(el('i', 'flash'), from, el('span', 'evo-arrow', '▶'), to, text)
  } else {
    if (banner.meta) node.append(el('small', 'banner-meta', banner.meta))
    node.append(el('b', 'banner-title', banner.title))
    if (banner.sub) node.append(el('p', 'banner-sub', `${banner.emoji ? `${banner.emoji} ` : ''}${banner.sub}`))
    if (banner.kind === 'chest' || banner.kind === 'bossKill') node.prepend(el('i', 'rays'))
  }
  if (banner.kind === 'farewell') {
    farewellEl?.remove()
    farewellEl = node
    element('#hud').append(node)
  } else {
    bannerEl = node
    bannerLayer.replaceChildren(node)
  }
  measureHudRects()
}

/** Translates an fx event into a cinematic banner. Log-backed lines (elite, evolve text) stay in the feed. */
function bannerFor(e: FxEv, localIndex: number, now: number, time: number) {
  const push = (banner: Omit<Banner, 'duration'>) => banners.push({ ...banner, duration: BANNER_MS[banner.kind] }, now)
  switch (e.type) {
    case FX.BOSS_SPAWN: {
      const def = ENEMIES[e.a]
      if (def) push({ kind: 'warning', title: 'WARNING', sub: `人生イベント：${def.name}` })
      break
    }
    case FX.BOSS_KILL: {
      const def = ENEMIES[e.a]
      if (def) push({ kind: 'bossKill', title: `${def.name}を乗り越えた！`, sub: '転機が訪れる' })
      break
    }
    case FX.STAGE: {
      const stage = STAGES[e.a]
      if (!stage) break
      push({ kind: 'stage', meta: `${stage.age}歳`, title: stage.name, sub: STAGE_LINES[e.a] ?? '', emoji: stage.icon })
      announce(`${stage.name}、${stage.age}歳`, time, ANNOUNCE_RANK.stage)
      break
    }
    case FX.SWARM: {
      const event = EVENTS[e.a]
      if (event)
        push({
          kind: 'swarm',
          title:
            event.swarm === 'nightcry' || event.swarm === 'mischief'
              ? `仲間の家族の試練：${event.text}`
              : event.swarm === 'endless_meeting'
                ? `仕事の試練：${event.text}`
                : event.text
        })
      break
    }
    case FX.CHEST:
      if (e.b === localIndex) {
        push({ kind: 'chest', title: e.a >= 3 ? '転機 ×3！' : '転機！' })
        announce(e.a >= 3 ? '転機が3回分' : '転機', time)
      }
      break
    case FX.EVOLVE: {
      const def = WEAPONS[e.a]
      if (e.b === localIndex && def?.evolve)
        push({
          kind: 'evolve',
          title: '進化！',
          sub: `${def.name} → ${def.evolve.name}`,
          art: { id: def.id, from: def.name, to: def.evolve.name }
        })
      break
    }
  }
}

function updateBossBar(current: View) {
  const boss = findBoss(current.enemies)
  const fill = element('#boss-fill')
  const trail = element('#boss-trail')
  if (boss) {
    window.clearTimeout(bossHideTimer)
    bossBar.classList.remove('defeated')
    if (bossBar.hidden || bossShown?.id !== boss.id) {
      bossShown = { id: boss.id, hp: boss.hp, at: 0 }
      element('#boss-name').textContent = boss.name
      bossBar.hidden = false
      trail.style.transition = 'none'
      fill.style.width = trail.style.width = `${boss.hp}%`
      void trail.offsetWidth
      trail.style.transition = ''
      pulse(bossBar, 'enter', 700)
    } else if (boss.hp !== bossShown.hp) {
      if (bossShown.hp - boss.hp >= 4) pulse(bossBar, 'shake', 320)
      bossShown.hp = boss.hp
      fill.style.width = `${boss.hp}%`
      trail.style.width = `${boss.hp}%`
    }
    element('#boss-extra').textContent = boss.count > 1 ? `ほか${boss.count - 1}体` : ''
  } else if (bossShown) {
    bossShown = undefined
    fill.style.width = trail.style.width = '0%'
    pulse(bossBar, 'defeated', 900)
    bossHideTimer = window.setTimeout(() => (bossBar.hidden = true), 900)
  }
}

/** Everything that remembers the previous game's HUD / audio state. */
function resetFeel() {
  farewellShown = ''
  farewellEl?.remove()
  farewellEl = undefined
  farewellUntil = 0
  tracker.reset()
  announcer.reset()
  banners.clear()
  unmountBanner()
  prevPhase = undefined
  beatShown = 0
  audio.setHeartbeat(0)
  prev.xp = -1
  prev.level = 0
  prev.kills = -1
  prev.hp = -1
  prev.hand.clear()
  handKey = ''
  bossShown = undefined
  bossBar.hidden = true
  pauseShown = ''
  pauseBanner.hidden = true
}

async function start(next: 'solo' | 'host' | 'guest') {
  audio.unlock()
  const attempt = ++generation
  startError.textContent = ''
  buttons.forEach((button) => (button.disabled = true))
  localId = crypto.randomUUID()
  role = next
  game = next === 'guest' ? undefined : new Game()
  game?.addPlayer(localId)
  view = game ? toView(game.state) : undefined
  remoteInputAt.clear()
  pauseHolds.clear()
  seenLog.clear()
  pick = undefined
  shownChoices = ''
  resultShown = false
  lostAt = 0
  wonAt = 0
  resetFeel()
  try {
    if (next !== 'solo') {
      if (!room.value.trim()) throw new Error('ルーム名を入力してください。')
      let failure = ''
      const current = new CooperativeNetwork({
        app: APP,
        relayUrl,
        room: room.value.trim(),
        role: next,
        playerId: localId,
        onInput: (id, value) => {
          if (attempt !== generation || !game) return
          const now = performance.now()
          remoteInputAt.set(id, now)
          if (id !== localId) {
            const wants = typeof value === 'object' && value !== null && (value as { pause?: unknown }).pause === true
            if (wants && game.state.players.some((player) => player.id === id)) holdPause(id, now)
            else pauseHolds.delete(id)
          }
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
            if (player.id !== localId && !ids.includes(player.id)) {
              game.removePlayer(player.id)
              pauseHolds.delete(player.id)
            }
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
    } else setStatus('')
    started = true
    startPanel.hidden = true
    hud.hidden = false
    result.hidden = true
    keys.clear()
    moveHint.hidden = !touchUi
    canvas.focus()
    audio.play('start')
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
  endDrag()
  moveHint.hidden = true
  const current = network
  network = undefined
  game = undefined
  view = undefined
  role = undefined
  hud.hidden = true
  levelup.hidden = true
  result.hidden = true
  help.hidden = true
  statusDialog.hidden = true
  pauseHolds.clear()
  resetFeel()
  audio.dispose()
  // Still inside the click: a fresh context lets the title theme start without another tap.
  audio.unlock()
  startPanel.hidden = false
  buttons.forEach((button) => (button.disabled = false))
  setStatus('')
  await current?.stop()
}

function choose(index: number) {
  const player = me()
  if (!player || index >= player.choices.length) return
  audio.play('cardPick')
  pick = { index, seq: player.choiceSeq }
  if (game) game.setInput(localId, input())
  levelup.hidden = true
  shownChoices = ''
}

function renderChoices(player: ViewPlayer | undefined) {
  const hand =
    view?.phase === 'playing' && player && player.choices.length && pick?.seq !== player.choiceSeq
      ? `${player.choiceSeq}:${player.choices.join()}`
      : ''
  const key =
    hand && player && view
      ? `${hand}:${sportsForm(ageAt(view.time)).key}:${outdoorForm(ageAt(view.time)).key}:${gambleForm(ageAt(view.time)).key}:${observationForm(ageAt(view.time)).name}:${petForm(player.petAge ?? 0).name}`
      : ''
  if (key === shownChoices) return
  const sameHand = Boolean(shownChoices && hand && hand === shownChoiceHand)
  const focusedIndex = sameHand ? Array.from(cards.children).indexOf(document.activeElement as Element) : -1
  shownChoices = key
  shownChoiceHand = hand
  levelup.hidden = !key
  if (!key || !player) return
  const owner = {
    ...player,
    weapons: player.weapons.map(([id, lv]) => ({ id, lv, acquiredAge: ageAt(view!.time) - (player.petAge ?? 0) })),
    passives: player.passives.map(([id, lv]) => ({ id, lv }))
  }
  const count = player.choices.length
  const birthPick = player.parent === 'p_gone' && !player.weapons.length
  const familyPick = player.choices[0] === 'f:yes'
  const datingPick = player.choices[0] === 'd:yes'
  element('#levelup-title').textContent = familyPick ? '家族の選択' : datingPick ? '交際の選択' : '人生の転機'
  const hint = touchUi ? 'タップで決定。' : `1〜${count}キーでも選べます。`
  element<HTMLElement>('#levelup-note').textContent = familyPick
    ? `子どもを迎えますか？${role === 'solo' ? '時間は止まっています。' : '時間は流れ続けています。'}${hint}`
    : datingPick
      ? `パートナーと交際しますか？${hint}`
      : player.choices[0]?.startsWith('s:')
        ? `交換する新しい武器を選ぼう。${hint}`
        : player.choices[0]?.startsWith('r:')
          ? `手放す武器を選ぼう。新しい武器はLv 1から始まります。${hint}`
          : birthPick
            ? `親はいない。自分の力で生きていく手札を1枚選ぼう。${hint}`
            : role === 'solo'
              ? `時間は止まっています。${hint}`
              : `時間は流れ続けています（選択中は足が遅くなる）。${hint}`
  cards.dataset.count = String(count)
  if (!sameHand) {
    cardsShownAt = performance.now()
    audio.play('cardOpen')
  }
  cards.replaceChildren(
    ...player.choices.map((choice, index) => {
      const info = choiceText(owner as unknown as Player, choice, ageAt(view!.time))
      const rarity = choiceRarity(player.weapons, player.passives, choice)
      const button = document.createElement('button')
      button.type = 'button'
      button.className = `card rarity-${rarity}`
      button.style.setProperty('--i', String(index))
      const icon = document.createElement('span')
      icon.className = 'icon'
      if (choice === 'x:skip' || choice.startsWith('f:') || choice.startsWith('d:')) icon.textContent = info.icon
      else {
        const id = choiceIcon(choice)
        icon.append(
          iconImg(
            WEAPON_BY_ID.has(id) ? weaponAppearance(id, ageAt(view!.time), player.petAge).art : id,
            info.name,
            rarity === 'evolve'
          )
        )
      }
      const synergies = choiceSynergies(player.weapons, player.passives, choice)
      if (synergies.length) {
        const badges = document.createElement('span')
        badges.className = 'synergy-icons'
        for (const id of synergies) {
          const def = WEAPON_BY_ID.get(id) ?? PASSIVE_BY_ID.get(id)!
          const appearance = WEAPON_BY_ID.has(id) ? weaponAppearance(id, ageAt(view!.time), player.petAge) : def
          badges.append(iconImg('art' in appearance ? appearance.art : id, `相性: ${appearance.name}`))
        }
        icon.append(badges)
      }
      const name = document.createElement('strong')
      name.textContent = info.name
      if (info.tag && rarity !== 'new') {
        const tag = document.createElement('em')
        tag.textContent = info.tag
        name.append(tag)
      }
      const [kind, id] = choice.split(':')
      const category =
        kind === 'p'
          ? PASSIVE_BY_ID.get(id)?.category
          : kind === 'w' || kind === 's' || kind === 'r'
            ? WEAPON_BY_ID.get(id)?.category
            : undefined
      if (category) {
        const label = document.createElement('span')
        label.className = 'card-category'
        label.textContent = `${TALENT_NAMES[category]}系`
        name.append(label)
      }
      const text = document.createElement('span')
      text.textContent = kind === 'p' ? `${info.text}（基準値）` : info.text
      if (kind === 'w' || kind === 's' || kind === 'r') {
        text.append(strongLabels(WEAPON_BY_ID.get(id)!.strong))
      }
      const hint = document.createElement('kbd')
      hint.textContent = String(index + 1)
      button.append(icon, name, text, hint)
      const ribbonText = RIBBONS[rarity]
      if (ribbonText) {
        const ribbon = document.createElement('i')
        ribbon.className = 'ribbon'
        ribbon.textContent = ribbonText
        button.append(ribbon)
      }
      button.addEventListener('click', (event) => {
        event.stopPropagation() // the card has its own cue; no generic tap on top
        // detail 0 = keyboard activation, which is always deliberate.
        if (event.detail > 0 && performance.now() - cardsShownAt < CARD_TAP_GUARD_MS) return
        choose(index)
      })
      button.addEventListener('pointerenter', (event) => {
        if (event.pointerType === 'mouse') audio.play('cardHover')
      })
      return button
    })
  )
  if (!sameHand || focusedIndex >= 0)
    (cards.children[sameHand ? focusedIndex : 0] as HTMLButtonElement | undefined)?.focus({ preventScroll: true })
}

const RIBBONS: Partial<Record<Rarity, string>> = { new: 'NEW', evolve: '進化！' }

function slot(icon: string, level: number, className: string, title: string) {
  const item = document.createElement('div')
  item.className = `slot ${className}`
  item.title = title
  item.append(iconImg(icon, title, className === 'evolved'))
  const badge = document.createElement('b')
  badge.textContent = level >= MAX_WEAPON_LEVEL && className !== 'passive' ? 'MAX' : String(level)
  item.append(badge)
  return item
}

let handKey = ''
const prev = { xp: -1, level: 0, kills: -1, hp: -1, hand: new Map<string, string>() }
const bossBar = element<HTMLElement>('#boss-bar')
let bossShown: { id: number; hp: number; at: number } | undefined
let bossHideTimer: number | undefined
const pulseTimers = new WeakMap<Element, Record<string, number>>()

/** Restarts a one-shot CSS animation class. */
function pulse(target: Element, name: string, ms: number) {
  const timers = pulseTimers.get(target) ?? {}
  pulseTimers.set(target, timers)
  window.clearTimeout(timers[name])
  target.classList.remove(name)
  void (target as HTMLElement).offsetWidth
  target.classList.add(name)
  timers[name] = window.setTimeout(() => target.classList.remove(name), ms)
}

function updateHud(current: View) {
  const player = current.players.find((p) => p.id === localId)
  const buffLines = (['food_damage', 'food_defense', 'food_speed'] as const).flatMap((kind) => {
    const buff = player?.cookingBuffs?.[kind]
    if (!buff) return []
    const effect = COOKING_EFFECTS[kind]
    const amount = Number((effect.amount * buff.power * (effect.unit === '%' ? 100 : 1)).toFixed(1))
    return [{ kind, color: effect.color, name: `${effect.label} +${amount}${effect.unit}`, time: buff.time }]
  })
  const buffDisplay = element('#cooking-buffs')
  // The rows are rebuilt only when the set of effects or an amount changes; each second just updates time and bar.
  const layout = buffLines.map((line) => `${line.kind}:${line.name}`).join('|')
  if (buffDisplay.dataset.layout !== layout) {
    buffDisplay.dataset.layout = layout
    buffDisplay.replaceChildren()
    if (buffLines.length) {
      const head = document.createElement('div')
      head.className = 'cooking-head'
      head.textContent = '🍙 料理効果'
      buffDisplay.append(head)
      for (const line of buffLines) {
        const row = document.createElement('div')
        row.className = 'cooking-row'
        row.style.setProperty('--buff', line.color)
        const name = document.createElement('span')
        name.className = 'cooking-name'
        name.textContent = line.name
        const left = document.createElement('b')
        left.className = 'cooking-left'
        const bar = document.createElement('i')
        bar.className = 'cooking-bar'
        bar.append(document.createElement('i'))
        row.append(name, left, bar)
        buffDisplay.append(row)
      }
    }
  }
  buffLines.forEach((line, index) => {
    const row = buffDisplay.children[index + 1] as HTMLElement
    const text = `残り${line.time}秒`
    const left = row.children[1]
    if (left.textContent !== text) {
      left.textContent = text
      ;(row.children[2].firstElementChild as HTMLElement).style.width =
        `${Math.max(0, Math.min(1, line.time / 60)) * 100}%`
    }
  })
  buffDisplay.hidden = !buffLines.length
  const time = Math.min(current.time, RUN_SECONDS)
  const stage = stageAt(time)
  element('#age').textContent = String(ageAt(time))
  element('#stage').textContent = stage.name
  element('#clock').textContent =
    `${String(Math.floor(time / 60)).padStart(2, '0')}:${String(Math.floor(time % 60)).padStart(2, '0')}`
  element('#life-progress').style.width = `${(time / RUN_SECONDS) * 100}%`
  element('#level').textContent = `Lv ${current.level}`
  element('#xp-fill').style.width = `${Math.min(100, (current.xp / current.xpNext) * 100)}%`
  const xpBar = element('.xp-bar')
  if (prev.level && current.level > prev.level) pulse(xpBar, 'levelflash', 700)
  else if (prev.xp >= 0 && current.xp > prev.xp) pulse(xpBar, 'gain', 500)
  prev.xp = current.xp
  prev.level = current.level
  element('#kills').textContent = String(current.kills)
  if (prev.kills >= 0 && current.kills > prev.kills) pulse(element('.kills'), 'bump', 160)
  prev.kills = current.kills
  if (player) {
    const hpPercent = `${Math.max(0, (player.hp / player.maxHp) * 100)}%`
    element('#hp-fill').style.width = hpPercent
    element('#hp-trail').style.width = hpPercent
    if (prev.hp >= 0 && player.hp < prev.hp - 0.5) pulse(element('.mind-card'), 'hurt', 360)
    prev.hp = player.hp
    element('#hp-value').textContent = player.downed ? '折' : String(Math.max(0, Math.ceil(player.hp)))
    element('.mind-card').classList.toggle('low', player.hp / player.maxHp < 0.3)
    const key = JSON.stringify([
      player.weapons.map((w) => w.slice(0, 2)),
      player.passives,
      weaponAppearance('w_sports', ageAt(time)).art,
      weaponAppearance('w_travel', ageAt(time)).art,
      observationForm(ageAt(time)).name,
      player.petAge
    ])
    if (key !== handKey) {
      handKey = key
      if (!statusDialog.hidden) renderStatus()
      const owner = { passives: player.passives.map(([id, lv]) => ({ id, lv })) }
      const before = new Map(prev.hand)
      prev.hand.clear()
      const mark = (item: HTMLElement, id: string, state: string) => {
        prev.hand.set(id, state)
        if (before.get(id) !== state) item.classList.add('pop')
        return item
      }
      element('#weapons').replaceChildren(
        ...player.weapons.map(([id, lv]) => {
          const def = WEAPON_BY_ID.get(id)!
          const appearance = weaponAppearance(id, ageAt(time), player.petAge)
          const evolved = Boolean(
            def.evolve && lv >= MAX_WEAPON_LEVEL && owner.passives.some((p) => p.id === def.evolve!.passive)
          )
          return mark(
            slot(
              appearance.art,
              lv,
              def.parent ? 'parent' : evolved ? 'evolved' : '',
              def.parent
                ? [def.name, def.desc, def.perk].filter(Boolean).join('：')
                : evolved
                  ? `${def.evolve!.name}${appearance.name === def.name ? '' : `／${appearance.name}`}`
                  : appearance.name
            ),
            id,
            `${lv}:${evolved}`
          )
        })
      )
      element('#passives').replaceChildren(
        ...player.passives.map(([id, lv]) => {
          const def = PASSIVE_BY_ID.get(id)!
          const inherited = player.parentDeath?.reward === 'passive' && PARENT_LEGACIES[player.parent] === id
          const flaw = id === PEOPLE_FEAR
          const note = inherited ? '（親の看取りで継承）' : flaw ? '（デメリット・20歳で消える）' : ''
          const item = slot(def.id, lv, 'passive', `${def.name}${note}`)
          item.classList.toggle('inherited', inherited)
          item.classList.toggle('flaw', flaw)
          return mark(item, id, String(lv))
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
    announce(entry.text, entry.t)
    setTimeout(() => line.remove(), 5000)
    while (feed.children.length > 4) feed.lastElementChild?.remove()
  }
  if (current.phase === 'lost' && !lostAt) lostAt = performance.now()
  if (current.phase === 'won' && !wonAt) wonAt = performance.now()
  const settled =
    (current.phase === 'won' && performance.now() - wonAt >= WON_DELAY_MS) ||
    (current.phase === 'lost' && performance.now() - lostAt >= deathDelayMs(player, current.time))
  if (settled && !resultShown) {
    const age = ageAt(current.time)
    const won = current.phase === 'won'
    const killer = player?.killer ? ENEMY_BY_ID.get(player.killer) : undefined
    const cause = killer ? `とどめ：${killer.name}（${TAG_NAMES[killer.tag]}）。` : ''
    showResult(
      won ? `大往生 — 享年${age}歳` : `心が折れた — 享年${age}歳`,
      won ? '死神が迎えに来た。15分の人生を生き抜いた。' : `${stageAt(current.time).name}で力尽きた。${cause}`,
      won ? '🌅' : '💔',
      player ? reflection(player) : [],
      player,
      { level: current.level, kills: current.kills }
    )
  }
}

/** The end screen finally reveals the hidden talents. */
function reflection(player: ViewPlayer) {
  const rows: HTMLElement[] = []
  const add = (left: string, right: string, className = '', icon?: string) => {
    const row = document.createElement('div')
    row.className = className
    const a = document.createElement('span')
    if (icon) a.append(iconImg(icon, left))
    a.append(left)
    const b = document.createElement('span')
    b.textContent = right
    row.append(a, b)
    rows.push(row)
  }
  const parent = WEAPON_BY_ID.get(player.parent)!
  add(
    `親${player.parentDeath ? '（他界）' : ''}：${parent.name}`,
    [
      parent.desc,
      parent.perk,
      player.parent === 'p_gone' ? '' : `与えた力 ${(player.parentDamage ?? 0).toLocaleString()}`
    ]
      .filter(Boolean)
      .join(' '),
    '',
    player.parent
  )
  for (const group of resultCategories(player)) {
    const heading = document.createElement('h4')
    heading.textContent = `${TALENT_NAMES[group.category]}：武器 ${group.weapons.length}・性格 ${group.passives.length}`
    rows.push(heading)
    if (!group.weapons.length && !group.passives.length) add('なし', '')
    for (const [id, lv, damage] of group.weapons) {
      const def = WEAPON_BY_ID.get(id)!
      const appearance = weaponAppearance(id, ageAt(view!.time), player.petAge)
      const evolved =
        def.evolve && lv >= MAX_WEAPON_LEVEL && player.passives.some(([passive]) => passive === def.evolve!.passive)
      add(
        `${evolved ? `${def.evolve!.name}${appearance.name === def.name ? '' : `／${appearance.name}`}` : appearance.name} Lv${lv}`,
        `武器・与えた力 ${damage.toLocaleString()}`,
        '',
        appearance.art
      )
    }
    for (const [id, lv] of group.passives) {
      const def = PASSIVE_BY_ID.get(id)!
      add(`${def.name} Lv${lv}`, '性格', '', id)
    }
  }
  return rows
}

function countUp(target: HTMLElement, to: number, delay: number, ms: number) {
  target.textContent = reduced ? String(to) : '0'
  if (reduced) return
  const begin = performance.now() + delay
  const step = (now: number) => {
    if (result.hidden) return
    const t = Math.min(1, Math.max(0, (now - begin) / ms))
    target.textContent = String(Math.round(to * (1 - (1 - t) ** 3)))
    if (t < 1) requestAnimationFrame(step)
  }
  requestAnimationFrame(step)
}

function showResult(
  title: string,
  text: string,
  symbol: string,
  rows: HTMLElement[],
  player?: ViewPlayer,
  stats?: { level: number; kills: number }
) {
  resultShown = true
  levelup.hidden = true
  statusDialog.hidden = true
  audio.setHeartbeat(0)
  element('#result-title').textContent = title
  element('#result-text').textContent = text
  element('#result-symbol').textContent = symbol
  rows.forEach((row, index) => row.style.setProperty('--i', String(index)))
  element('#result-build').replaceChildren(...rows)
  element('#result-build-title').hidden = !player
  element('#result-history').hidden = !player?.history
  element('#result-history-list').replaceChildren(
    ...(player?.history?.length
      ? player.history.map((decision) => {
          const row = document.createElement('li')
          row.textContent = `${Math.floor(ageAt(decision.at ?? EVENTS[decision.event].at))}歳：${decision.outcome}`
          return row
        })
      : [Object.assign(document.createElement('li'), { textContent: '経験した人生の分岐はありません。' })])
  )
  const talents = player?.talents
  element('#result-talents').hidden = !talents
  if (talents) {
    document.querySelector('#result-radar')!.setAttribute('points', talentRadarPoints(talents))
    element('#result-talent-values').replaceChildren(
      ...resultCategories(player!).map(({ category, weapons, passives }) => {
        const value = document.createElement('span')
        value.append(`${TALENT_NAMES[category]} ×${talents[category].toFixed(2)}`)
        const counts = document.createElement('small')
        counts.textContent = `武器${weapons.length}・性格${passives.length}`
        value.append(counts)
        return value
      })
    )
  }
  element('#result-stats').hidden = !stats
  if (stats) {
    countUp(element('#result-level'), stats.level, 300, 900)
    countUp(element('#result-kills'), stats.kills, 450, 1200)
  }
  result.hidden = false
  result.scrollTop = 0
  element<HTMLButtonElement>('#restart').focus({ preventScroll: true })
}

/** Sounds, banners, boss bar and heartbeat from one view — the same path for solo, host and guest. */
let farewellShown = ''

function feel(current: View, now: number) {
  const index = current.players.findIndex((p) => p.id === localId)
  const self = current.players[index]
  let farewellText: string | undefined
  if (self?.parentDeath && farewellShown !== `${self.id}:${self.parentDeath.at}`) {
    farewellShown = `${self.id}:${self.parentDeath.at}`
    const text = parentFarewell(self.parent, self.parentDeath.reward)
    const reward = self.parentDeath.reward
    const sub =
      reward === 'passive'
        ? `「${PASSIVE_BY_ID.get(PARENT_LEGACIES[self.parent])!.name}」を継承`
        : reward === 'choice'
          ? '成長の選択 +1'
          : '親の武器を手放した'
    mountBanner({ kind: 'farewell', title: '親とのお別れ', sub, duration: BANNER_MS.farewell })
    farewellUntil = now + BANNER_MS.farewell
    farewellText = text
  }
  if (farewellEl && now >= farewellUntil) {
    farewellEl.remove()
    farewellEl = undefined
  }
  if (!resultShown) {
    const events = consumeFx(
      current.fx,
      tracker,
      {
        localIndex: index,
        x: self?.x ?? 0,
        y: self?.y ?? 0,
        evolved: (id) => {
          const def = WEAPON_BY_ID.get(id)
          const owned = self?.weapons.find((w) => w[0] === id)
          return Boolean(
            def?.evolve &&
              owned &&
              owned[1] >= MAX_WEAPON_LEVEL &&
              self.passives.some((p) => p[0] === def.evolve!.passive)
          )
        }
      },
      audio
    )
    for (const e of events) bannerFor(e, index, now, current.time)
  }
  if (farewellText) announce(farewellText, current.time, ANNOUNCE_RANK.farewell)
  const cue = phaseCue(prevPhase, current.phase)
  prevPhase = current.phase
  if (cue) audio.play(cue)
  const beat =
    self && !resultShown
      ? heartbeatLevel(self.hp, self.maxHp, !self.downed, current.phase === 'playing' || current.phase === 'reaper')
      : 0
  const rounded = Math.round(beat * 50) / 50
  if (rounded !== beatShown) {
    beatShown = rounded
    audio.setHeartbeat(rounded)
  }
  const step = banners.update(now)
  if (step.hide || step.show) unmountBanner()
  if (step.show) mountBanner(step.show)
  updateBossBar(current)
  const stage = STAGES.indexOf(stageAt(current.time))
  audio.setMusic(musicCue({ started: true, phase: current.phase, stage, boss: bossShown !== undefined, resultShown }))
  // An open hand of cards and a breaking mind both pull the world away: the music goes muffled.
  audio.setMuffle(Math.max(levelup.hidden ? 0 : 0.55, beat * 0.5))
}

const pauseBanner = element<HTMLElement>('#pause-banner')
let pauseShown = ''
function renderPauseBanner(current: View) {
  const names = (current.paused ?? []).flatMap((id) => current.players.find((p) => p.id === id)?.name ?? [])
  const text = names.length && !resultShown ? `⏸ ${names.join('・')}がステータスを確認中 — 時間停止中` : ''
  if (text === pauseShown) return
  pauseShown = text
  pauseBanner.textContent = text
  pauseBanner.hidden = !text
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
    if (statusDialog.hidden) pauseHolds.delete(localId)
    else holdPause(localId, now)
    const paused = role === 'solo' ? [] : activePauses(now)
    if (role === 'solo' ? help.hidden && statusDialog.hidden : paused.length === 0) game.step(dt)
    view = toView(game.state, paused)
  }
  const player = me()
  if (pick && player && player.choiceSeq !== pick.seq) pick = undefined
  if (started && network && now - sentAt >= (role === 'host' ? SNAPSHOT_MS : SEND_MS)) {
    sentAt = now
    const link = network
    const operation =
      role === 'host' && view
        ? link.broadcastSnapshot(view)
        : link.sendInput({ ...current, pause: !statusDialog.hidden })
    void operation.catch((cause: unknown) =>
      disconnect(`通信エラー: ${cause instanceof Error ? cause.message : String(cause)}`, link)
    )
  }
  if (view) renderer.draw(view, localId, dt, role === 'guest')
  else renderer.draw(attract.view(now), 'attract', dt, false)
  if (started && view) feel(view, now)
  else audio.setMusic(musicCue({ started, stage: 0, boss: false, resultShown }))
  if (started && view) {
    renderChoices(resultShown ? undefined : player)
    if (now - hudAt > 100) {
      hudAt = now
      updateHud(view)
    }
    if (role === 'guest' && !player && view.players.length >= 8) setStatus('満員のため観戦中')
    renderPauseBanner(view)
  }
  // While a banner is on screen its boxes move every frame, so they are measured every frame.
  const bannerUp = (bannerEl?.isConnected ?? false) || (farewellEl?.isConnected ?? false)
  if (bannerUp || now - hudRectsAt >= 250 || hud.hidden !== hudRectsHidden) measureHudRects(now)
  requestAnimationFrame(frame)
}

let hudRectsAt = -Infinity
let hudRectsHidden = true
/** Where each part of a banner has been while it shows (CSS px from the canvas's top left). */
const bannerPaths = new WeakMap<Element, Box>()
/** The banner parts that have a path, so one that is skipped in a frame keeps its box while it stays on the page. */
const bannerParts = new Set<Element>()
const bannerMargin = (path: Box): Box => ({
  left: path.left - 8,
  top: path.top - 8,
  right: path.right + 8,
  bottom: path.bottom + 8
})

/**
 * Hands the renderer the screen boxes of the HUD parts drawn over the canvas, so food labels keep clear of them: every
 * visible part with its own background or border, or with no children. Large transparent containers (the full-screen
 * overlay, rows and lists) are looked into instead. A box is `opaque` when it hides what lies under it (hidesBehind);
 * foods under opaque boxes get no label. Parts of a banner (it animates all the while it shows) go to a separate list
 * of transient boxes instead: each one is the union of every place that part has been, so the labels it crosses are
 * hidden for as long as the banner shows, not moved.
 */
function measureHudRects(now = performance.now()) {
  hudRectsAt = now
  hudRectsHidden = hud.hidden
  const rects: (Box & { opaque: boolean })[] = []
  const transient: Box[] = []
  const frame = canvas.getBoundingClientRect()
  const emitted = new Set<Element>()
  const visit = (parent: Element, depth: number, inBanner: boolean) => {
    for (const child of Array.from(parent.children)) {
      if ((inBanner ? transient : rects).length >= 40) return
      // The halo is see-through: the labels under it can still be read.
      if (inBanner && child.classList.contains('rays')) continue
      const banner = inBanner || child.classList.contains('banner')
      const style = getComputedStyle(child)
      if (style.display === 'none') continue
      if (!banner && (style.visibility === 'hidden' || Number(style.opacity) === 0)) continue
      const r = child.getBoundingClientRect()
      if (r.width < 1 || r.height < 1) continue
      const screenSized = r.width * r.height >= frame.width * frame.height * 0.5
      const painted =
        style.backgroundColor !== 'rgba(0, 0, 0, 0)' ||
        style.backgroundImage !== 'none' ||
        ['Top', 'Right', 'Bottom', 'Left'].some(
          (side) => parseFloat(style.getPropertyValue(`border-${side}-width`)) > 0
        )
      if (!screenSized && (painted || child.children.length === 0)) {
        const box = {
          left: Math.max(0, r.left - frame.left),
          top: Math.max(0, r.top - frame.top),
          right: Math.min(frame.width, r.right - frame.left),
          bottom: Math.min(frame.height, r.bottom - frame.top)
        }
        if (box.right > box.left && box.bottom > box.top) {
          if (banner) {
            const seen = bannerPaths.get(child)
            const path = seen
              ? {
                  left: Math.min(seen.left, box.left),
                  top: Math.min(seen.top, box.top),
                  right: Math.max(seen.right, box.right),
                  bottom: Math.max(seen.bottom, box.bottom)
                }
              : box
            bannerPaths.set(child, path)
            bannerParts.add(child)
            emitted.add(child)
            // The labels are drawn with the boxes of the frame before: a margin covers the way a banner moves meanwhile.
            transient.push(bannerMargin(path))
          } else rects.push({ ...box, opaque: hidesBehind(style) })
        }
      } else if (depth < 6) visit(child, depth + 1, banner)
    }
  }
  if (!hud.hidden) visit(hud, 0, false)
  // A part not picked up this frame (screen sized, or under 1px for a moment) keeps its path while it is on the page.
  for (const part of Array.from(bannerParts)) {
    if (!part.isConnected) bannerParts.delete(part)
    else if (!emitted.has(part)) {
      const path = bannerPaths.get(part)
      if (path) transient.push(bannerMargin(path))
    }
  }
  renderer.setHudRects(rects, transient)
}

if (typeof ResizeObserver === 'function') {
  const observer = new ResizeObserver(() => measureHudRects())
  for (const part of Array.from(hud.children)) observer.observe(part)
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
const helpOpen = element<HTMLButtonElement>('#help-open')
const helpClose = element<HTMLButtonElement>('#help-close')
const helpDone = element<HTMLButtonElement>('#help-done')
const closeHelp = () => {
  help.hidden = true
  helpOpen.focus()
}
helpOpen.addEventListener('click', () => {
  help.hidden = false
  helpClose.focus()
})
for (const button of [helpClose, helpDone]) button.addEventListener('click', closeHelp)
help.addEventListener('keydown', (event) => {
  if (event.key !== 'Tab') return
  if (event.shiftKey && document.activeElement === helpClose) {
    event.preventDefault()
    helpDone.focus()
  } else if (!event.shiftKey && document.activeElement === helpDone) {
    event.preventDefault()
    helpClose.focus()
  }
})
function strongLabels(tags: (keyof typeof TAG_NAMES)[]) {
  const labels = el('span', 'weapon-strong-labels')
  for (const tag of tags) labels.append(el('span', 'weapon-strong-label', `特攻 ${TAG_NAMES[tag]}`))
  return labels
}

function renderStatusItems(list: HTMLElement, items: StatusItem[], empty: string) {
  list.replaceChildren(
    ...(items.length
      ? items.map((item) => {
          const row = el('li', `status-item status-${item.kind}`)
          const icon = el('span', 'status-icon')
          icon.append(iconImg(item.icon, item.name, item.kind === 'evolved'))
          const text = el('span', 'status-text')
          text.append(el('strong', '', item.name), el('small', '', item.detail))
          if (item.strong?.length) text.append(strongLabels(item.strong))
          const level = el('b', 'status-level', item.kind === 'parent' ? '親' : `Lv ${item.levelText}`)
          row.append(icon, text, level)
          return row
        })
      : [el('li', 'status-empty', empty)])
  )
}

function renderStatus() {
  const player = me()
  if (!player || !view) return
  const model = statusModel(player, ageAt(Math.min(view.time, RUN_SECONDS)))
  element('#status-note').textContent =
    role === 'solo'
      ? 'この画面を開いている間は時間が止まります。'
      : 'この画面を開いている間は、みんなの時間が止まります。全員が閉じると再開します。'
  renderStatusItems(element('#status-weapons'), model.weapons, 'まだ武器がありません')
  renderStatusItems(element('#status-passives'), model.passives, 'まだ性格がありません')
}

const statusOpen = element<HTMLButtonElement>('#status-open')
const statusClose = element<HTMLButtonElement>('#status-close')
const statusDone = element<HTMLButtonElement>('#status-done')
let statusReturnFocus: HTMLElement = statusOpen
function openStatus(origin: HTMLElement = statusOpen) {
  if (!started || resultShown || !statusDialog.hidden || !help.hidden || !me()) return
  keys.clear()
  endDrag()
  statusReturnFocus = origin
  renderStatus()
  statusDialog.hidden = false
  statusClose.focus()
}
function closeStatus() {
  if (statusDialog.hidden) return
  statusDialog.hidden = true
  statusReturnFocus.focus()
}
statusOpen.addEventListener('click', () => openStatus())
document.querySelectorAll<HTMLElement>('.hand-open').forEach((target) => {
  target.addEventListener('click', () => openStatus(target))
  target.addEventListener('keydown', (event: KeyboardEvent) => {
    if (event.key !== 'Enter' && event.key !== ' ') return
    event.preventDefault()
    openStatus(target)
  })
})
for (const button of [statusClose, statusDone]) button.addEventListener('click', closeStatus)
statusDialog.addEventListener('keydown', (event) => {
  if (event.key !== 'Tab') return
  if (event.shiftKey && document.activeElement === statusClose) {
    event.preventDefault()
    statusDone.focus()
  } else if (!event.shiftKey && document.activeElement === statusDone) {
    event.preventDefault()
    statusClose.focus()
  }
})
// Shared UI cues follow the game's mute / volume; level-up cards have their own cues.
bindUiSounds(document, (kind) => playSharedUiSound(kind, audio.muted ? 0 : audio.volume), 'button:not(.card)')
warmUpAudio()

const muteButtons = ['#mute', '#mute-title'].map((selector) => element<HTMLButtonElement>(selector))
const volume = element<HTMLInputElement>('#volume')
const musicVolume = element<HTMLInputElement>('#music-volume')
function syncSound() {
  for (const button of muteButtons) {
    button.textContent = audio.muted ? '🔇' : '🔊'
    button.setAttribute('aria-pressed', String(audio.muted))
    button.title = audio.muted ? 'サウンド：オフ（Mキー）' : 'サウンド：オン（Mキー）'
  }
  volume.value = String(Math.round(audio.volume * 100))
  musicVolume.value = String(Math.round(audio.musicVolume * 100))
}
function toggleMute() {
  audio.unlock()
  audio.setMuted(!audio.muted)
  if (audio.muted) audio.setHeartbeat(0)
  else beatShown = 0
  syncSound()
}
for (const button of muteButtons) button.addEventListener('click', toggleMute)
volume.addEventListener('input', () => {
  audio.setVolume(Number(volume.value) / 100)
  if (audio.muted && audio.volume > 0) audio.setMuted(false)
  syncSound()
})
volume.addEventListener('change', () => {
  audio.unlock()
  audio.play('gem')
})
musicVolume.addEventListener('input', () => {
  audio.unlock()
  audio.setMusicVolume(Number(musicVolume.value) / 100)
  if (audio.muted && audio.musicVolume > 0) audio.setMuted(false)
  syncSound()
})
syncSound()
// Browsers only start audio from an activation gesture. A touch/pen press is not one (its
// release is), so unlocking on pointerdown alone left phones silent.
const unlockOnGesture = (event: Event) => {
  if (!event.isTrusted) return
  const pointer = (event as PointerEvent).pointerType
  if (event.type === 'pointerdown' && pointer !== 'mouse') return
  if (event.type === 'pointerup' && pointer === 'mouse') return
  audio.unlock()
}
for (const type of ['pointerdown', 'pointerup', 'touchend', 'click', 'keydown'] as const)
  window.addEventListener(type, unlockOnGesture, { capture: true, passive: true })

const moveKeys = new Set(['KeyW', 'KeyA', 'KeyS', 'KeyD', 'ArrowUp', 'ArrowLeft', 'ArrowDown', 'ArrowRight'])
window.addEventListener('keydown', (event) => {
  if (event.code === 'Escape' && !statusDialog.hidden) {
    closeStatus()
    return
  }
  if (event.code === 'Escape' && !help.hidden) {
    closeHelp()
    return
  }
  if (event.code === 'KeyM' && started && !event.repeat && !(event.target instanceof HTMLInputElement)) {
    toggleMute()
    return
  }
  if (!started || !help.hidden || !statusDialog.hidden) return
  if (/^Digit[1-8]$/.test(event.code) && !levelup.hidden) {
    choose(Number(event.code.slice(5)) - 1)
    event.preventDefault()
  } else if (moveKeys.has(event.code)) {
    keys.add(event.code)
    event.preventDefault()
  }
})
window.addEventListener('keyup', (event) => keys.delete(event.code))
function endDrag() {
  drag = undefined
  stick.hidden = true
}
window.addEventListener('blur', () => {
  keys.clear()
  endDrag()
})
document.addEventListener('visibilitychange', () => {
  if (document.hidden) {
    keys.clear()
    endDrag()
  }
})
// A hidden tab's timers crawl, so the music pauses instead of stuttering.
document.addEventListener('visibilitychange', () => audio.setHidden(document.hidden))
window.addEventListener('resize', () => {
  renderer.resize()
  measureHudRects()
})
window.addEventListener('pagehide', (event) => {
  // A cached page is restored with this script's state, so keep the audio graph it will need again;
  // without cache the page is really gone and the context is closed.
  if (!event.persisted) audio.dispose()
  void network?.stop()
})
window.addEventListener('pageshow', (event) => {
  // Back from the back-forward cache: the browser stopped the context while the page was away.
  if (event.persisted) audio.setHidden(document.hidden)
})
function placeStick() {
  if (!drag) return
  stick.style.transform = `translate(${drag.x}px, ${drag.y}px)`
  stickKnob.style.transform = `translate(${drag.dx}px, ${drag.dy}px)`
}
window.addEventListener(
  'pointerdown',
  (event) => {
    touchUi = event.pointerType !== 'mouse'
    document.documentElement.classList.toggle('touch-ui', touchUi)
  },
  { capture: true, passive: true }
)
document.documentElement.classList.toggle('touch-ui', touchUi)
canvas.addEventListener('pointerdown', (event) => {
  if (!started || drag) return // one finger steers; a second one is ignored
  drag = { id: event.pointerId, x: event.clientX, y: event.clientY, dx: 0, dy: 0 }
  canvas.setPointerCapture(event.pointerId)
  moveHint.hidden = true
  if (event.pointerType !== 'mouse') {
    stick.hidden = false
    placeStick()
  }
})
canvas.addEventListener('pointermove', (event) => {
  if (drag?.id !== event.pointerId) return
  let dx = event.clientX - drag.x
  let dy = event.clientY - drag.y
  const length = Math.hypot(dx, dy)
  if (length > STICK_RADIUS) {
    if (event.pointerType !== 'mouse') {
      const follow = ((length - STICK_RADIUS) / length) * 0.1
      drag.x += dx * follow
      drag.y += dy * follow
    }
    dx *= STICK_RADIUS / length
    dy *= STICK_RADIUS / length
  }
  drag.dx = dx
  drag.dy = dy
  placeStick()
})
for (const type of ['pointerup', 'pointercancel', 'lostpointercapture'] as const)
  canvas.addEventListener(type, (event) => {
    if (drag?.id === event.pointerId) endDrag()
  })
// No long-press menu or callout on the field.
canvas.addEventListener('contextmenu', (event) => event.preventDefault())

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
      },
      get deathBuildMs() {
        return renderer.deathBuildMs
      },
      get music() {
        return audio.music
      }
    }
  })

requestAnimationFrame(frame)
