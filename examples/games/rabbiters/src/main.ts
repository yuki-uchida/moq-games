import './style.css'
import { Game, RULES, type GameState, type Input } from './game'
import { RabbitersAudio } from './audio'
import { GuestView, type InputAck } from './guest-view'
import { CooperativeNetwork, MAX_PLAYERS } from './network'
import { RabbitersScene } from './scene'

function element<T extends HTMLElement>(selector: string): T {
  const result = document.querySelector<T>(selector)
  if (!result) throw new Error(`Missing element: ${selector}`)
  return result
}

const world = element<HTMLDivElement>('#world')
const scene = new RabbitersScene(world)
const audio = new RabbitersAudio()
const hud = element<HTMLElement>('#hud')
const startPanel = element<HTMLElement>('#start-panel')
const help = element<HTMLElement>('#help')
const result = element<HTMLElement>('#result')
const error = element<HTMLElement>('#start-error')
const connection = element<HTMLElement>('#connection span')
const leave = element<HTMLButtonElement>('#leave')
const restart = element<HTMLButtonElement>('#restart')
const soundToggle = element<HTMLButtonElement>('#sound-toggle')
const relay = element<HTMLInputElement>('#relay')
const room = element<HTMLInputElement>('#room')
const buttons = ['#solo', '#host', '#join'].map((selector) => element<HTMLButtonElement>(selector))
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

const preview = new Game()
preview.addPlayer('preview', '旅するウサギ')

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
const position = (value: Record<string, unknown>) =>
  label(value.id) && numeric(value.x, -50, 50) && numeric(value.y, -1, 20) && numeric(value.z, -40, 40)

function validSnapshot(value: unknown): value is GameState {
  if (!record(value) || !numeric(value.time, 0, 1e8) || !['playing', 'won', 'lost'].includes(String(value.phase)))
    return false
  if (
    !Array.isArray(value.players) ||
    value.players.length > MAX_PLAYERS ||
    !Array.isArray(value.predators) ||
    value.predators.length > 12 ||
    !Array.isArray(value.foods) ||
    value.foods.length > 32 ||
    !Array.isArray(value.nests) ||
    value.nests.length > 16 ||
    !numeric(value.delivered, 0, 1e8) ||
    !numeric(value.goal, 0, 1e8)
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
        typeof player.hidden === 'boolean' &&
        typeof player.downed === 'boolean' &&
        typeof player.pregnant === 'boolean'
    ) &&
    value.predators.every(
      (predator: unknown) =>
        record(predator) &&
        position(predator) &&
        ['fox', 'wolf', 'hawk', 'snake', 'crocodile'].includes(String(predator.kind)) &&
        ['patrol', 'alert', 'chase'].includes(String(predator.state)) &&
        numeric(predator.angle, -1e8, 1e8) &&
        (predator.targetId === null || label(predator.targetId))
    ) &&
    value.foods.every((food: unknown) => record(food) && position(food) && typeof food.active === 'boolean') &&
    value.nests.every(
      (nest: unknown) =>
        record(nest) && position(nest) && typeof nest.active === 'boolean' && numeric(nest.health, 0, 100)
    )
  )
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
  void source.stop(false)
  clearInput()
  element<HTMLElement>('#result-title').textContent = '通信が切断されました'
  element<HTMLElement>('#result-text').textContent = `${message} タイトルに戻って接続し直してください。`
  element<HTMLElement>('#announcements').textContent = '通信が切断されました'
  restart.textContent = 'タイトルに戻る'
  result.hidden = false
  restart.focus()
}

async function start(nextRole: 'solo' | 'host' | 'guest') {
  audio.start()
  const attempt = ++generation
  error.textContent = ''
  buttons.forEach((button) => (button.disabled = true))
  localId = crypto.randomUUID()
  role = nextRole
  remoteInputAt.clear()
  remoteInputAcks.clear()
  inputInFlight = undefined
  game = nextRole === 'guest' ? undefined : new Game()
  guestView = nextRole === 'guest' ? new GuestView() : undefined
  game?.addPlayer(localId, 'あなた')
  snapshot = game?.state
  try {
    if (nextRole !== 'solo') {
      if (!relay.value.trim() || !room.value.trim()) throw new Error('Relay URLとルーム名を入力してください。')
      let connectionError = ''
      const current = new CooperativeNetwork({
        relayUrl: relay.value.trim(),
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
          if (attempt === generation && validSnapshot(state)) snapshot = state
        },
        onPresence: (ids) => {
          if (attempt !== generation || nextRole !== 'host' || !game) return
          for (const id of ids) {
            if (!game.state.players.some((player) => player.id === id)) game.addPlayer(id, `仲間 ${id.slice(0, 4)}`)
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
    startPanel.hidden = true
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
  started = false
  connectionLost = false
  audio.stop()
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
  result.hidden = true
  help.hidden = true
  leave.hidden = true
  startPanel.hidden = false
  buttons.forEach((button) => (button.disabled = false))
  error.textContent = ''
  sessionStatus('ひとりでプレイ')
  await current?.stop()
}

function updateHud(state: GameState) {
  if (state.phase !== 'playing' && result.hidden) {
    const won = state.phase === 'won'
    element<HTMLElement>('#result-title').textContent = won ? '新しい命が生まれました' : 'また、森で会おう'
    element<HTMLElement>('#result-text').textContent = won
      ? '小さな命を、みんなでつなぎました。'
      : 'ウサギたちは力尽きてしまいました。食べものと隠れ場所を探して、もう一度。'
    result.hidden = false
    restart.textContent = 'もう一度あそぶ'
    clearInput()
    element<HTMLElement>('#announcements').textContent = won ? 'ゲームクリア' : 'ゲームオーバー'
  }
  const player = state.players.find((entry) => entry.id === localId)
  if (!player) {
    element<HTMLElement>('#condition').textContent = 'ホストのゲームを待っています…'
    return
  }
  element<HTMLElement>('#player-name').textContent = player.name
  for (const [name, value] of [
    ['health', player.health],
    ['hunger', player.hunger]
  ] as const) {
    element<HTMLElement>(`#${name}-bar`).style.width = `${value}%`
    element<HTMLElement>(`#${name}-value`).textContent = String(Math.ceil(value))
  }
  const chased = state.predators.some((predator) => predator.targetId === player.id && predator.state === 'chase')
  element<HTMLElement>('#condition').textContent = player.downed
    ? '倒れています。仲間の助けを待とう'
    : chased
      ? '見つかった！ 草むらに逃げよう'
      : player.hidden
        ? '身を隠しています'
        : '足あとに気をつけて'
  const pregnant = state.players.find((entry) => entry.pregnant && !entry.downed)
  const progress = pregnant ? pregnant.pregnancy : player.growth
  element<HTMLElement>('#objective-title').textContent = pregnant ? '新しい命を守ろう' : '食べて、大きくなろう'
  element<HTMLElement>('#objective-text').textContent = pregnant
    ? pregnant.hunger <= 0
      ? `${pregnant.id === localId ? 'あなた' : pregnant.name}は空腹で出産が進みません。食べものを探そう。`
      : `${pregnant.id === localId ? 'あなた' : pregnant.name}は妊娠中。食べながら出産まで生きのびよう。`
    : `食事 ${Math.min(player.foodEaten, RULES.requiredFood)} / ${RULES.requiredFood} · 時間と食事で成長します`
  element<HTMLElement>('#growth-bar').style.width = `${progress * 100}%`
  element<HTMLElement>('#objective-progress').textContent =
    `${pregnant ? '出産まで' : '成長'} ${Math.round(progress * 100)}%`
  element<HTMLElement>('#nest-count').textContent = `残る巣 ${state.nests.filter((nest) => nest.active).length}`
  const nearNest = state.nests.find((nest) => nest.active && Math.hypot(nest.x - player.x, nest.z - player.z) < 2.5)
  const nearFriend = state.players.find(
    (friend) => friend.downed && friend.id !== localId && Math.hypot(friend.x - player.x, friend.z - player.z) < 2
  )
  element<HTMLElement>('#hint').textContent = nearFriend
    ? 'E を押して仲間を助ける'
    : nearNest
      ? 'E を長押しして卵を壊す'
      : ''
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
        ? current.broadcastSnapshot({ ...game.state, inputAcks: Object.fromEntries(remoteInputAcks) })
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
  const visual = started && !connectionLost && guestView ? guestView.render(current, localId, input, dt, now) : current
  scene.render(visual, started ? localId : 'preview', dt)
  if (started && !connectionLost && snapshot) audio.update(snapshot, localId)
  if (started && now - hudAt > 100) {
    hudAt = now
    updateHud(current)
  }
  requestAnimationFrame(frame)
}

buttons[0].addEventListener('click', () => void start('solo'))
buttons[1].addEventListener('click', () => void start('host'))
buttons[2].addEventListener('click', () => void start('guest'))
leave.addEventListener('click', () => void returnToTitle())
restart.addEventListener('click', () => void returnToTitle())
soundToggle.addEventListener('click', () => {
  soundEnabled = !soundEnabled
  audio.setMuted(!soundEnabled)
  soundToggle.setAttribute('aria-pressed', String(soundEnabled))
  soundToggle.title = soundEnabled ? 'サウンドをオフ' : 'サウンドをオン'
  soundToggle.textContent = soundEnabled ? '♪' : '×'
  if (soundEnabled && started && !connectionLost) audio.start()
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
window.addEventListener('resize', () => scene.resize())
window.addEventListener('pagehide', () => {
  void network?.stop()
  audio.stop()
  scene.dispose()
})

let drag: { id: number; x: number } | undefined
world.addEventListener('pointerdown', (event) => {
  if (!started || (event.pointerType === 'mouse' && event.button !== 0)) return
  drag = { id: event.pointerId, x: event.clientX }
  world.setPointerCapture(event.pointerId)
})
world.addEventListener('pointermove', (event) => {
  if (!drag || drag.id !== event.pointerId) return
  const delta = (event.clientX - drag.x) * -0.006
  yaw += delta
  scene.orbit(delta)
  drag.x = event.clientX
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
