import './style.css'
import { getPrimaryRelayUrl } from '../../../../utils/relayPresets'
import {
  Game,
  RULES,
  coverAt,
  mapTerrain,
  packSnapshot,
  playerColor,
  progress,
  retryState,
  unpackSnapshot,
  type Cover,
  type GameState,
  type Task,
  type Input
} from './game'
import { PREDATOR_KINDS, STEALTH } from './stealth'
import { bindAudioResume, RabbitersAudio } from './audio'
import { GameFeel } from './feel'
import { GuestView, type InputAck } from './guest-view'
import { bindUiSounds, playSharedUiSound, warmUpAudio } from '../../shared/UiSound'
import { CooperativeNetwork, MAX_PLAYERS } from './network'
import { RabbitersScene } from './scene'
import { isFoodKind } from './food'
import {
  FOODS,
  FOREST,
  MAX_PREDATORS,
  STAGE_COUNT,
  WORLD,
  activeStage,
  inBush,
  isUnderground,
  npcNear,
  regionName,
  setStage,
  treesNear,
  tunnelExitNear
} from './map'
import { SAND_PATCHES } from './stages/forest/map'
import { CHAPTERS, createStraws, nightAmount } from './campaign'
import { STAGES, speakerName, spokenLine } from './stages'

function element<T extends HTMLElement>(selector: string): T {
  const result = document.querySelector<T>(selector)
  if (!result) throw new Error(`Missing element: ${selector}`)
  return result
}

const world = element<HTMLDivElement>('#world')
const scene = new RabbitersScene(world)
const audio = new RabbitersAudio()
function announceSpotted() {
  spottedUntil = performance.now() + 650
  alertOverlay.classList.add('spotted')
  element<HTMLElement>('#discovery-announcements').textContent = '見つかった！'
}
const feel = new GameFeel(scene, element<HTMLElement>('#app'), announceSpotted)
const hud = element<HTMLElement>('#hud')
const startPanel = element<HTMLElement>('#start-panel')
const help = element<HTMLElement>('#help')
const result = element<HTMLElement>('#result')
const error = element<HTMLElement>('#start-error')
const alertOverlay = element<HTMLElement>('#alert-overlay')
const phoneLayout = matchMedia(
  '(max-width: 760px), (pointer: coarse) and (max-height: 550px) and (orientation: landscape)'
)
const touchInput = matchMedia('(pointer: coarse)')
const KEY_ICONS: Record<string, [string, string]> = {
  WASD: ['i-move', 'スティック'],
  SPACE: ['i-jump', 'ジャンプ'],
  C: ['i-crouch', 'しゃがむ'],
  E: ['i-act', 'アクション']
}
let shownHint = ''
const connection = element<HTMLElement>('#connection span')
const leave = element<HTMLButtonElement>('#leave')
const restart = element<HTMLButtonElement>('#restart')
const retry = element<HTMLButtonElement>('#retry-season')
const soundToggle = element<HTMLButtonElement>('#sound-toggle')
// ?relayUrl= overrides it for local relays and tests.
const relayUrl = getPrimaryRelayUrl('https://relay.moqt.research.skyway.io')
const room = element<HTMLInputElement>('#room')
const buttons = ['#solo', '#host', '#join'].map((selector) => element<HTMLButtonElement>(selector))
const chapterPick = element<HTMLElement>('#chapter-pick')
const chapterSelect = element<HTMLSelectElement>('#chapter-select')
const subtitle = element<HTMLElement>('#subtitle')
const titleCard = element<HTMLElement>('#title-card')
// Once faded, the card stops delaying season banners (see style.css).
titleCard.addEventListener('animationend', () => titleCard.classList.remove('show'))
const keys = new Set<string>()
const remoteInputAt = new Map<string, number>()
const remoteInputAcks = new Map<string, InputAck>()
const touch = { x: 0, z: 0, jump: false, sprint: false, crouch: false, interact: false }
const idle: Input = { moveX: 0, moveZ: 0, jump: false, sprint: false, crouch: false, interact: false }

let localId = ''
let game: Game | undefined
let network: CooperativeNetwork | undefined
let role: 'solo' | 'host' | 'guest' | undefined
let snapshot: GameState | undefined
let guestView: GuestView | undefined
let yaw = 0
let lastTime = performance.now()
let sentAt = 0
let sentInput: Input = idle
let inputInFlight: CooperativeNetwork | undefined
let hudAt = 0
let started = false
let connectionLost = false
let generation = 0
let soundEnabled = true
let wasChased = false
let spottedUntil = 0
let shownChapter = -1
let shownStage = -1
/** Snapshot taken whenever the stage, season or objective advances, so a lost run resumes there. */
let checkpoint: GameState | undefined

const preview = new Game()
preview.addPlayer('preview', '旅するウサギ')

// "Continue": the furthest chapter reached on this browser. `?chapter=N` (1–4) preselects one for testing.
const REACHED_KEY = 'rabbiters.reached'
function readReached() {
  try {
    const value = Number(localStorage.getItem(REACHED_KEY))
    return Number.isInteger(value) && value > 0 ? Math.min(value, STAGE_COUNT - 1) : 0
  } catch {
    return 0
  }
}
function markReached(stage: number) {
  try {
    if (stage > readReached()) localStorage.setItem(REACHED_KEY, String(stage))
  } catch {
    /* storage unavailable: no continue option */
  }
}
function fillChapters() {
  const asked = Number(new URLSearchParams(location.search).get('chapter')) - 1
  const reached = Math.max(readReached(), Number.isInteger(asked) && asked >= 0 && asked < STAGE_COUNT ? asked : 0)
  chapterSelect.replaceChildren(
    ...STAGES.slice(0, reached + 1).map((stage, index) => {
      const option = document.createElement('option')
      option.value = String(index)
      option.textContent = index ? `続きから：第${index + 1}章　${stage.title}` : `はじめから：第1章　${stage.title}`
      return option
    })
  )
  chapterSelect.value = String(asked >= 0 && asked <= reached ? asked : reached)
  chapterPick.hidden = reached === 0
}
fillChapters()

function clearInput() {
  keys.clear()
  Object.assign(touch, { x: 0, z: 0, jump: false, sprint: false, crouch: false, interact: false })
  element<HTMLElement>('#joystick-knob').style.transform = 'translate(-50%, -50%)'
}

function controls(): Input {
  if (!started || !help.hidden || !result.hidden) return idle
  const x =
    Number(keys.has('KeyD') || keys.has('ArrowRight')) - Number(keys.has('KeyA') || keys.has('ArrowLeft')) + touch.x
  const z =
    Number(keys.has('KeyS') || keys.has('ArrowDown')) - Number(keys.has('KeyW') || keys.has('ArrowUp')) + touch.z
  return {
    moveX: x * Math.cos(yaw) + z * Math.sin(yaw),
    moveZ: z * Math.cos(yaw) - x * Math.sin(yaw),
    jump: keys.has('Space') || touch.jump,
    sprint: keys.has('ShiftLeft') || keys.has('ShiftRight') || touch.sprint,
    crouch: keys.has('KeyC') || touch.crouch,
    interact: keys.has('KeyE') || touch.interact
  }
}

const numeric = (value: unknown, min: number, max: number): value is number =>
  typeof value === 'number' && Number.isFinite(value) && value >= min && value <= max
const record = (value: unknown): value is Record<string, unknown> =>
  !!value && typeof value === 'object' && !Array.isArray(value)
const label = (value: unknown) => typeof value === 'string' && value.length > 0 && value.length <= 128
const integer = (value: unknown, max: number) => Number.isInteger(value) && numeric(value, 0, max)
const position = (value: Record<string, unknown>) =>
  label(value.id) &&
  numeric(value.x, WORLD.minX - 2, WORLD.maxX + 2) &&
  numeric(value.y, -20, 80) &&
  numeric(value.z, WORLD.minZ - 2, WORLD.maxZ + 2)

function validSnapshot(value: unknown): value is GameState {
  if (record(value) && value.discoveries !== undefined) {
    if (!Array.isArray(value.discoveries) || value.discoveries.length > 4096) return false
    const pairs = new Set<string>()
    for (const entry of value.discoveries) {
      if (
        !record(entry) ||
        !label(entry.predatorId) ||
        !label(entry.targetId) ||
        !Number.isSafeInteger(entry.count) ||
        !numeric(entry.count, 1, Number.MAX_SAFE_INTEGER) ||
        (entry.stage !== undefined &&
          (!Number.isInteger(entry.stage) || !numeric(entry.stage, 0, STAGES.length - 1))) ||
        (entry.time !== undefined && !numeric(entry.time, 0, Number(value.time))) ||
        !numeric(entry.x, -1000, 1000) ||
        !numeric(entry.y, -1000, 1000) ||
        !numeric(entry.z, -1000, 1000)
      )
        return false
      const pair = JSON.stringify([entry.time === undefined ? entry.predatorId : null, entry.targetId])
      if (pairs.has(pair)) return false
      pairs.add(pair)
    }
  }
  if (!record(value) || !numeric(value.time, 0, 1e8) || !['playing', 'won', 'lost'].includes(String(value.phase)))
    return false
  if (
    !Array.isArray(value.players) ||
    value.players.length > MAX_PLAYERS ||
    !Array.isArray(value.predators) ||
    value.predators.length > MAX_PREDATORS ||
    !Array.isArray(value.foods) ||
    value.foods.length > 128 ||
    !Array.isArray(value.nests) ||
    value.nests.length > 16 ||
    !Array.isArray(value.droppings) ||
    value.droppings.length > STEALTH.maxDroppings ||
    !numeric(value.delivered, 0, 1e8) ||
    !numeric(value.goal, 0, 1e8) ||
    !Number.isInteger(value.chapter) ||
    !numeric(value.chapter, 0, CHAPTERS.length - 1) ||
    !numeric(value.bedding, 0, 100) ||
    !Array.isArray(value.straws) ||
    value.straws.length > 16 ||
    !Array.isArray(value.kits) ||
    value.kits.length > 8 ||
    !integer(value.stage, STAGE_COUNT - 1) ||
    !integer(value.step, 1000) ||
    !integer(value.flags, 2 ** 31 - 1) ||
    !integer(value.open, 2 ** 31 - 1) ||
    !Array.isArray(value.items) ||
    value.items.length > 32 ||
    !(
      value.talk === null ||
      (record(value.talk) &&
        label(value.talk.id) &&
        numeric(value.talk.at, 0, 1e8) &&
        (value.talk.by === undefined || label(value.talk.by)))
    )
  )
    return false
  return (
    value.players.every(
      (player: unknown) =>
        record(player) &&
        position(player) &&
        label(player.name) &&
        numeric(player.angle, -1e8, 1e8) &&
        numeric(player.health, 0, 100) &&
        numeric(player.hunger, 0, 100) &&
        numeric(player.age, 0, 1e8) &&
        numeric(player.foodEaten, 0, 1e8) &&
        numeric(player.score, 0, 1e8) &&
        numeric(player.growth, 0, 1) &&
        numeric(player.pregnancy, 0, 1) &&
        numeric(player.bath, 0, 1) &&
        (player.color === undefined || (Number.isInteger(player.color) && numeric(player.color, 0, 63))) &&
        typeof player.hidden === 'boolean' &&
        typeof player.downed === 'boolean' &&
        typeof player.pregnant === 'boolean' &&
        (player.carrying === null || label(player.carrying)) &&
        (player.task === undefined ||
          (record(player.task) && label(player.task.label) && numeric(player.task.progress, 0, 1)))
    ) &&
    value.straws.every((straw: unknown) => record(straw) && position(straw) && typeof straw.active === 'boolean') &&
    value.items.every(
      (item: unknown) => record(item) && position(item) && label(item.kind) && typeof item.active === 'boolean'
    ) &&
    value.kits.every(
      (kit: unknown) =>
        record(kit) &&
        position(kit) &&
        numeric(kit.angle, -1e8, 1e8) &&
        typeof kit.hidden === 'boolean' &&
        ['follow', 'wait', 'safe', 'lost'].includes(String(kit.status))
    ) &&
    value.predators.every(
      (predator: unknown) =>
        record(predator) &&
        position(predator) &&
        (PREDATOR_KINDS as string[]).includes(String(predator.kind)) &&
        ['patrol', 'search', 'suspicious', 'chase'].includes(String(predator.state)) &&
        numeric(predator.angle, -1e8, 1e8) &&
        numeric(predator.suspicion, 0, 1) &&
        (predator.targetId === null || label(predator.targetId))
    ) &&
    value.foods.every(
      (food: unknown) => record(food) && position(food) && isFoodKind(food.kind) && typeof food.active === 'boolean'
    ) &&
    value.droppings.every(
      (dropping: unknown) => record(dropping) && position(dropping) && numeric(dropping.t, 0, 1e8)
    ) &&
    value.nests.every(
      (nest: unknown) =>
        record(nest) && position(nest) && typeof nest.active === 'boolean' && numeric(nest.health, 0, 100)
    )
  )
}

function readSnapshot(packed: unknown): GameState | undefined {
  // Unpacking switches to the snapshot's stage map; a rejected snapshot must not leave it switched.
  const stage = activeStage()
  const state = parseSnapshot(packed)
  if (!state) setStage(stage)
  return state
}

function parseSnapshot(packed: unknown): GameState | undefined {
  // Current hosts pack food and nests against the stage map; full lists are only accepted for the same map.
  if (record(packed) && typeof packed.foods !== 'string') {
    // Full lists (very old hosts) carry no stage: the forest.
    const stage = packed.stage === undefined ? FOREST : packed.stage
    if (!integer(stage, STAGE_COUNT - 1)) return undefined
    setStage(stage as number)
  }
  const value = record(packed) && typeof packed.foods === 'string' ? unpackSnapshot(packed) : packed
  if (
    !record(value) ||
    !Array.isArray(value.players) ||
    value.players.length > MAX_PLAYERS ||
    !Array.isArray(value.predators) ||
    value.predators.length > MAX_PREDATORS ||
    !Array.isArray(value.foods) ||
    value.foods.length !== FOODS.length
  )
    return undefined
  const state = {
    ...value,
    players: value.players.map((player: unknown) =>
      record(player)
        ? {
            ...player,
            bath: player.bath === undefined ? 0 : player.bath,
            carrying: player.carrying === undefined ? null : player.carrying
          }
        : player
    ),
    predators: value.predators.map((predator: unknown) => {
      if (!record(predator)) return predator
      const behavior =
        predator.stealthState === undefined
          ? predator.state === 'alert'
            ? 'search'
            : predator.state
          : predator.state === 'patrol' &&
              (predator.stealthState === 'search' || predator.stealthState === 'suspicious')
            ? predator.stealthState
            : undefined
      return { ...predator, state: behavior, suspicion: predator.suspicion === undefined ? 0 : predator.suspicion }
    }),
    foods: value.foods.map((food: unknown) =>
      record(food) && food.kind === undefined ? { ...food, kind: 'carrot' } : food
    ),
    droppings: value.droppings === undefined ? [] : value.droppings,
    // Hosts from before the seasons campaign play an endless spring.
    chapter: value.chapter === undefined ? 0 : value.chapter,
    bedding: value.bedding === undefined ? 0 : value.bedding,
    straws: value.straws === undefined ? createStraws() : value.straws,
    kits: value.kits === undefined ? [] : value.kits,
    // Hosts before story mode play the forest with no story state.
    stage: value.stage === undefined ? FOREST : value.stage,
    step: value.step === undefined ? 0 : value.step,
    flags: value.flags === undefined ? 0 : value.flags,
    open: value.open === undefined ? 0 : value.open,
    items: value.items === undefined ? [] : value.items,
    talk: value.talk === undefined ? null : value.talk
  }
  return validSnapshot(state) ? state : undefined
}

function showError(message: string) {
  error.textContent = message
  if (started) connection.textContent = message
}

function sessionStatus(status: string) {
  connection.textContent = status
}

function disconnect(message: string, source: CooperativeNetwork) {
  if (network !== source) return
  showError(message)
  if (!started) return
  network = undefined
  connectionLost = true
  audio.stop()
  feel.stop()
  void source.stop(false)
  clearInput()
  element<HTMLElement>('#result-title').textContent = '通信が切断されました'
  element<HTMLElement>('#result-text').textContent = `${message} タイトルに戻って接続し直してください。`
  element<HTMLElement>('#announcements').textContent = '通信が切断されました'
  restart.textContent = 'タイトルに戻る'
  retry.hidden = true
  restart.className = 'button button-primary'
  result.hidden = false
  restart.focus()
}

async function start(nextRole: 'solo' | 'host' | 'guest') {
  audio.start()
  feel.start()
  const attempt = ++generation
  error.textContent = ''
  buttons.forEach((button) => (button.disabled = true))
  localId = crypto.randomUUID()
  role = nextRole
  remoteInputAt.clear()
  remoteInputAcks.clear()
  inputInFlight = undefined
  checkpoint = undefined
  game = nextRole === 'guest' ? undefined : new Game(1, mapTerrain, Number(chapterSelect.value) || 0)
  guestView = nextRole === 'guest' ? new GuestView() : undefined
  game?.addPlayer(localId)
  snapshot = game?.state
  try {
    if (nextRole !== 'solo') {
      if (!room.value.trim()) throw new Error('ルーム名を入力してください。')
      let connectionError = ''
      const current = new CooperativeNetwork({
        relayUrl,
        room: room.value.trim(),
        role: nextRole,
        playerId: localId,
        onInput: (id, input) => {
          if (attempt !== generation) return
          remoteInputAt.set(id, performance.now())
          if (game && record(input) && numeric(input.sentAt, 0, Number.MAX_SAFE_INTEGER))
            remoteInputAcks.set(id, { sentAt: input.sentAt, gameTime: game.state.time })
          else remoteInputAcks.delete(id)
          game?.setInput(id, input as Input)
        },
        onSnapshot: (state) => {
          const stage = activeStage()
          const received = attempt === generation ? readSnapshot(state) : undefined
          if (received && (!snapshot || received.time >= snapshot.time)) {
            snapshot = received
            audio.update(received, localId)
            feel.update(received, localId)
          } else if (received) setStage(stage)
        },
        onPresence: (ids) => {
          if (attempt !== generation || nextRole !== 'host' || !game) return
          for (const id of ids) {
            if (!game.state.players.some((player) => player.id === id)) game.addPlayer(id)
          }
          for (const player of [...game.state.players]) {
            if (player.id !== localId && !ids.includes(player.id)) {
              game.removePlayer(player.id)
              remoteInputAt.delete(player.id)
              remoteInputAcks.delete(player.id)
            }
          }
        },
        onStatus: (status, message) => {
          if (attempt !== generation || network !== current) return
          if (status === 'error') {
            connectionError = `通信エラー: ${message}`
            disconnect(connectionError, current)
          } else if (status === 'ready')
            sessionStatus(nextRole === 'host' ? `ホスト · ${room.value.trim()}` : '協力プレイ')
          else if (status === 'waiting-for-host') sessionStatus('ホストを待っています')
          else if (status === 'connecting') sessionStatus('Relayに接続中')
        }
      })
      network = current
      let timeout: number | undefined
      try {
        await Promise.race([
          current.start(),
          new Promise<never>((_, reject) => {
            timeout = window.setTimeout(() => reject(new Error('Relayへの接続がタイムアウトしました。')), 15000)
          })
        ])
      } finally {
        window.clearTimeout(timeout)
      }
      if (attempt !== generation) return
      if (connectionError) throw new Error(connectionError)
    } else sessionStatus('ひとりでプレイ')
    clearInput()
    connectionLost = false
    started = true
    updateLookHint()
    startPanel.hidden = true
    shownChapter = -1
    shownStage = -1
    if (game) {
      checkpoint = structuredClone(game.state)
      markReached(game.state.stage)
    }
    hud.hidden = false
    leave.hidden = false
    result.hidden = true
    sentAt = 0
    sentInput = idle
  } catch (cause) {
    if (attempt !== generation) return
    const failed = network
    network = undefined
    void failed?.stop()
    audio.stop()
    feel.stop()
    game = undefined
    role = undefined
    showError(cause instanceof Error ? cause.message : '接続できませんでした。')
    sessionStatus('未接続')
  } finally {
    if (attempt === generation) buttons.forEach((button) => (button.disabled = false))
  }
}

async function returnToTitle() {
  ++generation
  checkpoint = undefined
  retry.hidden = true
  started = false
  updateLookHint()
  connectionLost = false
  audio.stop()
  feel.stop()
  clearInput()
  remoteInputAt.clear()
  remoteInputAcks.clear()
  const current = network
  network = undefined
  role = undefined
  game = undefined
  snapshot = undefined
  guestView = undefined
  inputInFlight = undefined
  hud.hidden = true
  element<HTMLElement>('#chapter-banner').hidden = true
  titleCard.hidden = true
  subtitle.hidden = true
  fillChapters()
  result.hidden = true
  help.hidden = true
  leave.hidden = true
  startPanel.hidden = false
  buttons.forEach((button) => (button.disabled = false))
  error.textContent = ''
  sessionStatus('ひとりでプレイ')
  wasChased = false
  spottedUntil = 0
  alertOverlay.className = 'alert-overlay'
  await current?.stop()
}

const COVER_NAMES: Record<Cover, string> = {
  tunnel: 'モグラのトンネル',
  shelter: '巣穴・木のうろの中',
  cave: '洞窟の暗がり',
  log: '倒木の下',
  bush: '茂みの奥',
  canopy: '茂みの中',
  grass: '背の高い草むら',
  water: '浅瀬の葦',
  under: '物の下',
  open: '物かげ'
}

/** Restarts a CSS entrance animation on an overlay. */
function replay(overlay: HTMLElement) {
  overlay.hidden = false
  overlay.classList.remove('show')
  void overlay.offsetWidth
  overlay.classList.add('show')
}

function updateHud(state: GameState) {
  const forest = state.stage === FOREST
  if (state.phase !== 'playing' && result.hidden) {
    const won = state.phase === 'won'
    const safe = state.kits.filter((kit) => kit.status === 'safe').length
    const minutes = Math.floor(state.time / 60)
    const where = forest ? `${CHAPTERS[state.chapter].season}まで` : `第${state.stage + 1}章`
    const record = `${where} · ${minutes}分${String(Math.floor(state.time % 60)).padStart(2, '0')}秒`
    // The journey's epilogue closes the winning run.
    const epilogue = (STAGES[FOREST].conversations.epilogue ?? []).map((line) => line.text).join('')
    element<HTMLElement>('#result-title').textContent = won ? '新しい命が生まれました' : 'また、森で会おう'
    element<HTMLElement>('#result-text').textContent = won
      ? `${safe}羽の子ウサギが新しい野原にたどり着きました。小さな命を、みんなでつなぎました。${epilogue}（${record}）`
      : forest &&
          state.chapter === 3 &&
          !state.kits.some((kit) => kit.status === 'safe' || kit.status === 'follow' || kit.status === 'wait')
        ? `子ウサギたちを守りきれませんでした。草むらでしゃがみ、ゆっくり導いてあげよう。（${record}）`
        : `ウサギたちは力尽きてしまいました。食べものと隠れ場所を探して、もう一度。（${record}）`
    result.hidden = false
    restart.textContent = 'もう一度あそぶ'
    retry.hidden = won || !game || !checkpoint
    if (checkpoint)
      retry.textContent =
        checkpoint.stage === FOREST
          ? `${CHAPTERS[checkpoint.chapter].season}からやり直す`
          : `第${checkpoint.stage + 1}章のチェックポイントからやり直す`
    restart.className = `button ${retry.hidden ? 'button-primary' : 'button-outline'}`
    clearInput()
    element<HTMLElement>('#announcements').textContent = won ? 'ゲームクリア' : 'ゲームオーバー'
  }
  const player = state.players.find((entry) => entry.id === localId)
  updateTaskGauge(player?.task)
  if (!player) {
    element<HTMLElement>('#condition').textContent = 'ホストのゲームを待っています…'
    return
  }
  element<HTMLElement>('#player-name').textContent = player.name
  const collar = element<HTMLElement>('#player-color')
  collar.style.background = playerColor(player)
  collar.style.boxShadow = `0 0 10px ${playerColor(player)}`
  for (const [name, value] of [
    ['health', player.health],
    ['hunger', player.hunger]
  ] as const) {
    element<HTMLElement>(`#${name}-bar`).style.width = `${value}%`
    element<HTMLElement>(`#${name}-value`).textContent = String(Math.ceil(value))
  }
  const hunting = feel.isChasing
  const suspected = state.predators.some(
    (predator) => predator.targetId === player.id && predator.state === 'suspicious'
  )
  if (hunting && !wasChased && performance.now() >= spottedUntil) announceSpotted()
  else if (!hunting && performance.now() >= spottedUntil) alertOverlay.classList.remove('spotted')
  alertOverlay.classList.toggle('suspected', suspected && !hunting)
  wasChased = hunting
  const underground = isUnderground(player.x, player.y, player.z)
  const coverName = (cover: Cover) => STAGES[state.stage].coverNames?.[cover] ?? COVER_NAMES[cover]
  const nearTrunk = !underground && treesNear(player.x, player.z, 1.5).length > 0
  // Cover reads as a green vignette and a lit hide button; phones show the line only when it is urgent.
  alertOverlay.classList.toggle('covered', player.hidden && !suspected && !hunting)
  element<HTMLElement>('#touch-crouch').classList.toggle('active', player.hidden)
  element<HTMLElement>('#condition').classList.toggle('urgent', player.downed)
  element<HTMLElement>('#condition').textContent = player.downed
    ? '倒れています。仲間の助けを待とう'
    : hunting
      ? nearTrunk
        ? '見つかった！ 木のあいだを抜ければ追っ手が遅れる'
        : '見つかった！ 逃げよう！'
      : suspected
        ? '怪しまれている… 今のうちに隠れよう'
        : player.hidden
          ? `身を隠しています（${coverName(coverAt(player.x, player.y, player.z, true))}）`
          : inBush(player.x, player.z)
            ? '茂みの中：空からは見えない'
            : nearTrunk
              ? '木の陰：幹を敵とのあいだにはさもう'
              : '足あとに気をつけて'
  element<HTMLElement>('#area-name').textContent =
    underground && STAGES[state.stage].coverNames?.tunnel
      ? coverName('tunnel')
      : regionName(player.x, player.y, player.z)
  const objective = STAGES[state.stage].script.objective(state, player)
  // Phones drop the chapter prefix; the title card already names the chapter.
  element<HTMLElement>('#objective-title').textContent = phoneLayout.matches
    ? objective.title.replace(/^第\d+章｜/, '')
    : objective.title
  element<HTMLElement>('#food-progress').hidden = !forest || state.chapter !== 0
  element<HTMLElement>('#food-count').textContent =
    `${Math.min(player.foodEaten, RULES.requiredFood)} / ${RULES.requiredFood}`
  element<HTMLElement>('#growth-bar').style.width = `${Math.max(0, Math.min(1, objective.progress)) * 100}%`
  element<HTMLElement>('#objective-progress').textContent = objective.label
  if (forest && state.chapter !== shownChapter) {
    const first = shownChapter < 0
    shownChapter = state.chapter
    const chapter = CHAPTERS[state.chapter]
    element<HTMLElement>('#chapter-season').textContent = chapter.season
    element<HTMLElement>('#chapter-title').textContent = `CHAPTER ${state.chapter + 1} · ${chapter.title}`
    element<HTMLElement>('#chapter-goal').textContent = chapter.goal
    replay(element<HTMLElement>('#chapter-banner'))
    if (!first)
      element<HTMLElement>('#announcements').textContent = `${chapter.season}「${chapter.title}」${chapter.goal}`
  }
  element<HTMLElement>('#nest-count').hidden = !forest && phoneLayout.matches
  element<HTMLElement>('#nest-count').textContent = forest
    ? `${nightAmount(state.time) > 0.5 ? '☾ 夜' : '☀ 昼'} · 残る巣 ${state.nests.filter((nest) => nest.active).length}`
    : `第${state.stage + 1}章　${STAGES[state.stage].title}`
  const nearNest = state.nests.find((nest) => nest.active && Math.hypot(nest.x - player.x, nest.z - player.z) < 2.5)
  const nearFriend = state.players.find(
    (friend) => friend.downed && friend.id !== localId && Math.hypot(friend.x - player.x, friend.z - player.z) < 2
  )
  const sandPit = forest && SAND_PATCHES.some(([x, z]) => Math.hypot(x - player.x, z - player.z) < 2.4)
  const hole = !player.downed && tunnelExitNear(player.x, player.z, underground ? 1.3 : 1.6)
  const friend = !player.downed && !underground && npcNear(player.x, player.z, 2.5)
  showHint(
    nearFriend
      ? 'E を押して仲間を助ける'
      : nearNest
        ? 'E を長押しして卵を壊す'
        : hole
          ? underground
            ? 'SPACE で地上に出る'
            : 'C で穴にもぐる'
          : friend && !state.talk
            ? `E で話す（${speakerName(state.stage, friend.id)}）`
            : (objective.hint ??
              (player.bath >= 1
                ? '砂浴びでにおいを消した'
                : player.bath > 0
                  ? `砂浴び中… ${Math.round(player.bath * 100)}%`
                  : sandPit
                    ? 'C を長押しして砂浴び（においを消す）'
                    : ''))
  )
}

/** On touch screens key names in a hint become the matching on-screen button icon. */
function showHint(text: string) {
  if (text === shownHint) return
  shownHint = text
  const hint = element<HTMLElement>('#hint')
  if (!touchInput.matches) {
    hint.textContent = text
    return
  }
  hint.replaceChildren(
    ...text
      .replace('マウスで見まわす', '画面をなぞって見まわす')
      .split(/\b(WASD|SPACE|C|E)\b ?/)
      .map((part, index) => {
        if (index % 2 === 0) return document.createTextNode(part)
        const [icon, label] = KEY_ICONS[part]
        const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg')
        svg.setAttribute('class', 'key-icon')
        svg.setAttribute('role', 'img')
        svg.setAttribute('aria-label', label)
        const use = document.createElementNS('http://www.w3.org/2000/svg', 'use')
        use.setAttribute('href', `#${icon}`)
        svg.append(use)
        return svg
      })
  )
}

/** The big hold-E gauge under the rabbit: what it is doing and how far along; 完了！ once it is done. */
function updateTaskGauge(task: Task | undefined) {
  const gauge = element<HTMLElement>('#task-gauge')
  gauge.hidden = !task
  if (!task) return
  const percent = Math.round(task.progress * 100)
  const done = percent >= 100
  gauge.classList.toggle('done', done)
  gauge.setAttribute('aria-valuenow', String(percent))
  element<HTMLElement>('#task-label').textContent = done ? `${task.label}　完了！` : `${task.label}…`
  element<HTMLElement>('#task-percent').textContent = `${percent}%`
  element<HTMLElement>('#task-bar').style.width = `${percent}%`
}

/** Chapter title card and the conversation subtitle; shown to everyone, with or without a rabbit. */
function updateStory(state: GameState) {
  if (state.stage !== shownStage) {
    shownStage = state.stage
    element<HTMLElement>('#title-card-chapter').textContent = `第${state.stage + 1}章`
    element<HTMLElement>('#title-card-title').textContent = STAGES[state.stage].title
    replay(titleCard)
    element<HTMLElement>('#announcements').textContent = `第${state.stage + 1}章　${STAGES[state.stage].title}`
    if (role !== 'guest') markReached(state.stage)
  }
  const line = spokenLine(state.stage, state)
  // A speaker on stage says the line in a bubble; the subtitle only carries narration and off-stage voices.
  subtitle.hidden = !line || scene.voiced
  if (line) {
    const { name } = line
    element<HTMLElement>('#subtitle-name').textContent = name
    element<HTMLElement>('#subtitle-name').hidden = !name
    element<HTMLElement>('#subtitle-text').textContent = line.text
  }
}

function retrySeason() {
  if (!game || !checkpoint) return
  game = Game.resume(retryState(checkpoint, game.state))
  feel.reset(game.state, localId)
  wasChased = false
  spottedUntil = 0
  snapshot = game.state
  shownChapter = -1
  result.hidden = true
  retry.hidden = true
  clearInput()
}

function frame(now: number) {
  const dt = Math.min(Math.max((now - lastTime) / 1000, 0), 0.1)
  lastTime = now
  const input = controls()
  if (started && game && !connectionLost) {
    game.setInput(localId, input)
    if (role === 'host') {
      for (const player of game.state.players) {
        if (player.id !== localId && now - (remoteInputAt.get(player.id) ?? 0) > 500) game.setInput(player.id, idle)
      }
    }
    game.step(dt)
    if (game.state.phase === 'playing' && (!checkpoint || progress(game.state) > progress(checkpoint)))
      checkpoint = structuredClone(game.state)
    snapshot = game.state
  }
  const inputChanged =
    Math.abs(input.moveX - sentInput.moveX) > 0.1 ||
    Math.abs(input.moveZ - sentInput.moveZ) > 0.1 ||
    input.jump !== sentInput.jump ||
    input.sprint !== sentInput.sprint ||
    input.crouch !== sentInput.crouch ||
    input.interact !== sentInput.interact
  if (
    started &&
    network &&
    (role !== 'guest' || inputInFlight !== network) &&
    (now - sentAt >= 100 || (role === 'guest' && inputChanged && now - sentAt >= 25))
  ) {
    sentAt = now
    sentInput = input
    const current = network
    const operation =
      role === 'host' && game
        ? current.broadcastSnapshot(
            packSnapshot({
              ...game.state,
              // Routes and chains are host-only; guests just see where everyone is.
              predators: game.state.predators.map(({ route: _route, leash: _leash, ...predator }) =>
                predator.state === 'search' || predator.state === 'suspicious'
                  ? { ...predator, state: 'patrol', stealthState: predator.state }
                  : predator
              ),
              inputAcks: Object.fromEntries(remoteInputAcks)
            })
          )
        : current.sendInput({ ...input, sentAt: now })
    if (role === 'guest') inputInFlight = current
    void operation
      .catch((cause: unknown) =>
        disconnect(`通信エラー: ${cause instanceof Error ? cause.message : String(cause)}`, current)
      )
      .finally(() => {
        if (inputInFlight === current) inputInFlight = undefined
      })
  }
  const current = snapshot ?? preview.state
  if (!started) preview.state.time = now / 1000
  const visual =
    started && !connectionLost && guestView && snapshot ? guestView.render(snapshot, localId, input, dt, now) : current
  scene.render(visual, started ? localId : 'preview', dt)
  if (started && !connectionLost && snapshot) audio.update(snapshot, localId)
  feel.update(started && !connectionLost ? snapshot : undefined, localId)
  if (started && now - hudAt > 100) {
    hudAt = now
    updateStory(current)
    updateHud(current)
  }
  requestAnimationFrame(frame)
}

buttons[0].addEventListener('click', () => void start('solo'))
const together = element<HTMLButtonElement>('#together')
const multiplayerFields = element<HTMLElement>('#multiplayer-fields')
together.addEventListener('click', () => {
  multiplayerFields.hidden = !multiplayerFields.hidden
  together.setAttribute('aria-expanded', String(!multiplayerFields.hidden))
  if (multiplayerFields.hidden) return
  room.focus({ preventScroll: true })
  multiplayerFields.scrollIntoView({ block: 'nearest' })
})
buttons[1].addEventListener('click', () => void start('host'))
buttons[2].addEventListener('click', () => void start('guest'))
leave.addEventListener('click', () => void returnToTitle())
restart.addEventListener('click', () => void returnToTitle())
retry.addEventListener('click', retrySeason)
soundToggle.addEventListener('click', () => {
  soundEnabled = !soundEnabled
  audio.setMuted(!soundEnabled)
  feel.setMuted(!soundEnabled)
  soundToggle.setAttribute('aria-pressed', String(soundEnabled))
  soundToggle.title = soundEnabled ? 'サウンドをオフ' : 'サウンドをオン'
  soundToggle.textContent = soundEnabled ? '♪' : '×'
  if (soundEnabled && started && !connectionLost) {
    audio.start()
    feel.start()
  }
})
element<HTMLButtonElement>('#help-open').addEventListener('click', () => {
  help.hidden = false
  clearInput()
  element<HTMLButtonElement>('#help-close').focus()
})
for (const selector of ['#help-close', '#help-done'])
  element<HTMLButtonElement>(selector).addEventListener('click', () => {
    help.hidden = true
    element<HTMLButtonElement>('#help-open').focus()
  })
// Menu feedback only; held touch controls stay silent. Follows the ♪ toggle.
document.querySelectorAll<HTMLElement>('.touch-buttons button').forEach((button) => (button.dataset.sfx = 'none'))
bindUiSounds(document, (kind) => playSharedUiSound(kind, soundEnabled ? 1 : 0), 'button:not(.touch-buttons *)')
warmUpAudio()

const allowedKeys = new Set([
  'KeyW',
  'KeyA',
  'KeyS',
  'KeyD',
  'ArrowUp',
  'ArrowLeft',
  'ArrowDown',
  'ArrowRight',
  'Space',
  'ShiftLeft',
  'ShiftRight',
  'KeyC',
  'KeyE'
])
const detachAudioResume = bindAudioResume(document, () => {
  if (!started || connectionLost || !soundEnabled) return
  audio.start()
  feel.start()
})
window.addEventListener('keydown', (event) => {
  if (event.code === 'Escape' && !help.hidden) {
    help.hidden = true
    return
  }
  if (!started || !help.hidden || !result.hidden || !allowedKeys.has(event.code)) return
  event.preventDefault()
  keys.add(event.code)
})
window.addEventListener('keyup', (event) => keys.delete(event.code))
window.addEventListener('blur', clearInput)
document.addEventListener('visibilitychange', () => {
  if (document.hidden) clearInput()
})
const subtitleLayout = new ResizeObserver(() => {
  document.documentElement.style.setProperty('--subtitle-height', `${subtitle.getBoundingClientRect().height}px`)
})
subtitleLayout.observe(subtitle)
const fieldLayout = new ResizeObserver(() => scene.resize())
fieldLayout.observe(world)
window.addEventListener('pagehide', () => {
  detachAudioResume()
  subtitleLayout.disconnect()
  fieldLayout.disconnect()
  void network?.stop()
  audio.stop()
  feel.stop()
  scene.dispose()
})

let drag: { id: number; x: number; y: number } | undefined
const lookHint = element<HTMLElement>('#look-hint')
const canLock = matchMedia('(pointer: fine)').matches && typeof world.requestPointerLock === 'function'
const locked = () => document.pointerLockElement === world
const rotate = (dx: number, dy: number) => {
  const delta = dx * -0.006
  yaw += delta
  scene.orbit(delta)
  scene.tilt(dy * 0.004) // drag down to look from higher up
}
function updateLookHint() {
  lookHint.hidden = !canLock || !started
  lookHint.textContent = locked() ? 'マウスで視点操作中 / Escで解除' : 'クリックで視点操作 / Escで解除'
}
document.addEventListener('pointerlockchange', updateLookHint)
document.addEventListener('pointerlockerror', updateLookHint)
world.addEventListener('pointerdown', (event) => {
  if (!started || (event.pointerType === 'mouse' && event.button !== 0)) return
  drag = { id: event.pointerId, x: event.clientX, y: event.clientY }
  world.setPointerCapture(event.pointerId)
  // Pointer lock for mouse only; on refusal the drag above keeps working.
  if (canLock && event.pointerType === 'mouse' && !locked()) {
    try {
      void Promise.resolve(world.requestPointerLock()).catch(() => undefined)
    } catch {
      /* drag fallback */
    }
  }
  updateLookHint()
})
world.addEventListener('pointermove', (event) => {
  if (locked()) {
    if (event.pointerType === 'mouse') rotate(event.movementX, event.movementY)
    return
  }
  if (!drag || drag.id !== event.pointerId) return
  rotate(event.clientX - drag.x, event.clientY - drag.y)
  drag.x = event.clientX
  drag.y = event.clientY
})
for (const type of ['pointerup', 'pointercancel'] as const)
  world.addEventListener(type, () => {
    drag = undefined
  })

const joystick = element<HTMLElement>('#joystick')
const knob = element<HTMLElement>('#joystick-knob')
function moveJoystick(event: PointerEvent) {
  const bounds = joystick.getBoundingClientRect()
  const x = (event.clientX - bounds.left - bounds.width / 2) / (bounds.width / 2)
  const z = (event.clientY - bounds.top - bounds.height / 2) / (bounds.height / 2)
  const length = Math.max(1, Math.hypot(x, z))
  touch.x = x / length
  touch.z = z / length
  knob.style.transform = `translate(calc(-50% + ${touch.x * 30}px), calc(-50% + ${touch.z * 30}px))`
}
joystick.addEventListener('pointerdown', (event) => {
  joystick.setPointerCapture(event.pointerId)
  moveJoystick(event)
})
joystick.addEventListener('pointermove', (event) => {
  if (joystick.hasPointerCapture(event.pointerId)) moveJoystick(event)
})
for (const type of ['pointerup', 'pointercancel', 'lostpointercapture'] as const)
  joystick.addEventListener(type, () => {
    touch.x = 0
    touch.z = 0
    knob.style.transform = 'translate(-50%, -50%)'
  })
for (const action of ['jump', 'sprint', 'crouch', 'interact'] as const) {
  const button = element<HTMLButtonElement>(`#touch-${action}`)
  button.addEventListener('pointerdown', (event) => {
    event.preventDefault()
    button.setPointerCapture(event.pointerId)
    touch[action] = true
  })
  for (const type of ['pointerup', 'pointercancel', 'lostpointercapture'] as const)
    button.addEventListener(type, () => {
      touch[action] = false
    })
}
requestAnimationFrame(frame)
