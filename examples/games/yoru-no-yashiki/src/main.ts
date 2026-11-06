import './style.css'
import { HorrorMatch, ScreamMeter, type MatchSnapshot, type PlayerId } from './match'
import { HorrorPeer, createRoomCode, type PeerStatus } from './peer'
import { YashikiSound } from './sound'
import { HumanFootsteps } from './footsteps'
import { cameraHeading } from './heading'
import { VoiceGate, analyzeVoiceFrame, isCurrentVoice, isFreshVoiceHealth, parseVoiceHealth } from './voice'
import { previewStatus } from './preview'
import { HorrorWorld, HUMAN_START, HAUNTER_START, clampPitch, movePose, type Pose, type WorldFrame } from './world'
import {
  RITUAL_RADIUS,
  RITUAL_STEPS,
  RITUAL_WARD_MS,
  RITUAL_WARD_DELAY_MS,
  ritualWard,
  type RitualState
} from './ritual'
import { acceptSpirit, requestSpirit, spiritForMatch, spiritStatus, type EffectKind, type SpiritState } from './spirit'
import {
  acceptRitual,
  freshSnapshot,
  receiveEffect,
  requestRitual,
  ritualForMatch,
  validEffect,
  type EffectEvent,
  type EffectPlayback
} from './sync'

const app = document.querySelector<HTMLDivElement>('#app')!
app.innerHTML =
  '<header><span class="crest">夜</span><div><p class="eyebrow">A TWO PLAYER HORROR EXPERIENCE</p><h1>夜の屋敷</h1></div><span class="subtitle">声をひそめて、生き残れ。</span></header><main><section class="intro panel"><p class="eyebrow">遊び方 / HOW TO PLAY</p><h2>静寂を守るのは、あなた。</h2><p>二人で人間と怪異を交互に担当。各15分、生存者の声に近い音を減点し、減点の少ない人が勝ちます。</p><p class="note">ヘッドフォンを推奨します。生の音声データは録音・送信しません。参加者が人間の夜は通信の揺れで得点が変わることがあります。</p></section><section class="panel"><p class="eyebrow">01 / CONNECTION</p><h2>MoQで二人をつなぐ</h2><p>同じMoQリレーを指定し、主催が作った部屋コードを参加者へ渡します。</p><label for="relay-url">MoQリレーURL（HTTPS）</label><input id="relay-url" type="url" maxlength="512" autocomplete="off" spellcheck="false" value="https://127.0.0.1:4433" /><label for="room-code">部屋コード</label><input id="room-code" type="text" maxlength="32" autocomplete="off" spellcheck="false" placeholder="主催が作成、参加者が入力" /><div class="row"><button id="host">部屋をつくる</button><button id="guest" class="secondary">部屋に入る</button><button id="copy" class="secondary" disabled>部屋コードをコピー</button></div><p id="connection" role="status">役割を選んでください</p></section><section class="panel"><p class="eyebrow">02 / MICROPHONE</p><h2>声の大きさを確かめる</h2><p>双方のマイクが必要です。環境音より高く、声より低い閾値に調整してください。</p><button id="microphone">マイクを許可する</button><p id="mic-status" role="status">マイク未接続</p><label for="level">現在の音量</label><meter id="level" min="0" max="1" value="0"></meter><label for="threshold">判定閾値 <output id="threshold-value">0.10</output></label><input id="threshold" type="range" min="0.02" max="0.5" step="0.01" value="0.1" /><label for="volume">演出音量 <output id="volume-value">20%</output></label><input id="volume" type="range" min="0" max="0.5" step="0.01" value="0.2" /><label class="check"><input id="mute" type="checkbox" /> 演出音をミュート</label></section><section class="panel play"><p class="eyebrow">03 / THE HOUSE</p><div class="play-head"><h2 id="phase">準備を整えてください</h2><span id="timer">15:00</span></div><p id="role">接続とマイクを確認し、双方が準備完了を押すと始まります。</p><p id="scores">主催 0.00 / 参加者 0.00</p><div id="world" tabindex="0" aria-label="屋敷の画面"></div><p class="note">画面をクリックして視点操作。WASDで移動、マウスまたは左右矢印で視点移動。怪異は 1・2・3 で異なる演出を仕掛けます。</p><div class="row"><button id="ready" disabled>準備完了</button><button id="reset" class="secondary">終了・最初から</button></div><p id="notice" role="status"></p></section></main><footer>夜の屋敷 — 信頼できる二人のための小さな恐怖体験</footer>'
const el = <T extends HTMLElement>(id: string) => document.getElementById(id) as T
const text = (id: string, value: string) => {
  const element = el(id)
  if (element.textContent !== value) element.textContent = value
}
const button = (id: string) => el<HTMLButtonElement>(id)
const input = (id: string) => el<HTMLInputElement>(id)
el('mic-status').insertAdjacentHTML(
  'afterend',
  '<p id=mic-processing role=status class=note>入力補正（接続時のブラウザー報告）：不明（接続情報なし）</p>'
)
function setMicProcessing(value = '不明（接続情報なし）') {
  try {
    text('mic-processing', '入力補正（接続時のブラウザー報告）：' + value)
  } catch {}
}
function showMicProcessing(track: MediaStreamTrack, current: () => boolean) {
  if (!current()) return
  let settings: MediaTrackSettings | undefined
  try {
    settings = track.getSettings()
  } catch {}
  const reports: string[] = []
  for (const [key, label] of [
    ['autoGainControl', '自動音量調整'],
    ['noiseSuppression', 'ノイズ抑制'],
    ['echoCancellation', 'エコー除去']
  ] as const) {
    if (!current()) return
    let value: unknown
    try {
      value = settings?.[key]
    } catch {}
    reports.push(label + '：' + (value === true ? 'オン' : value === false ? 'オフ' : '不明'))
  }
  if (!current()) return
  let live = false
  try {
    live = track.readyState === 'live' && !track.muted && track.enabled
  } catch {}
  if (current() && live) setMicProcessing(reports.join(' / '))
}
const container = el<HTMLDivElement>('world')
const play = document.querySelector<HTMLElement>('.play')!
el('ready').insertAdjacentHTML(
  'beforebegin',
  '<button id=pause class=secondary type=button aria-keyshortcuts=P aria-describedby=pause-note disabled>休止する（P）</button>'
)
el('ready').parentElement!.insertAdjacentHTML(
  'beforebegin',
  '<p id=pause-note class=note>Pキーで任意に休止できます。</p>'
)
el('phase').insertAdjacentHTML(
  'beforebegin',
  '<div><button id=fullscreen class=secondary type=button aria-pressed=false>全画面表示</button><p id=fullscreen-status role=status></p></div>'
)
el('ready').parentElement!.insertAdjacentHTML(
  'beforebegin',
  '<div class=play-sound><label for=play-volume>演出音量 <output id=play-volume-value>20%</output></label><input id=play-volume type=range min=0 max=0.5 step=0.01 value=0.2 /><label class=check><input id=play-mute type=checkbox /> 演出音をミュート</label></div>'
)
input('mute').parentElement!.insertAdjacentHTML(
  'afterend',
  '<button id=sound-preview class=secondary type=button aria-describedby=sound-preview-note disabled>手掛かりの鈴を一度だけ試聴</button><p id=sound-preview-note class=note>準備完了前に試聴できます。低音量・ヘッドフォン推奨。</p><p id=sound-preview-status role=status></p>'
)
container.insertAdjacentHTML(
  'afterend',
  '<section id=ritual aria-label=屋敷の手掛かり><p id=heading class=note>現在の向き：不明</p><p id=ritual-hint></p><p id=ritual-ward class=note></p><ol id=ritual-story></ol></section>'
)
el('ritual').insertAdjacentHTML(
  'beforebegin',
  '<section id="spirit" hidden aria-label="怪異の霊力"><strong id="spirit-energy"></strong><p id="spirit-cooldown"></p><p id="spirit-actions"></p></section>'
)
document.querySelector('.play #world ~ .note')!.textContent =
  '画面クリックで視点操作。WASD：移動 / 矢印・マウス：視点 / E：調査 / 1・2・3：怪異演出'
input('threshold').insertAdjacentHTML('afterend', '<p class=note>閾値は最初の準備完了時に固定されます。</p>')
el('level').insertAdjacentHTML(
  'afterend',
  '<section class="voice-preview" aria-label="マイク判定プレビュー"><strong>ローカル判定プレビュー</strong><p id="preview-status">マイクを接続してください</p><p class="note">閾値以上の声候補が0.3秒続くと減点候補になります。重複する判定の積算で短い音でも減点されることがあります。</p></section>'
)
const match = new HorrorMatch()
let snapshot = match.getSnapshot()
let world: HorrorWorld | undefined
let worldInitialized = false
let peer: HorrorPeer | undefined
let player: PlayerId | undefined
let connected = false
let peerStatus: PeerStatus = 'closed'
let peerTerminated = false
let stream: MediaStream | undefined
let mediaTracks = new Set<MediaStreamTrack>()
let audio: AudioContext | undefined
let sound: YashikiSound | undefined
const footsteps = new HumanFootsteps()
let soundAllowed = false
let soundFailed = false
let audioShutdownFailed = false
let microphoneShutdownFailed = false
let frameFailed = false
let frameSchedulingFailed = false
let releasingMedia = false
let stoppingTracks = false
let handlingSoundFailure = false
let analyser: AnalyserNode | undefined
let samples: Float32Array<ArrayBuffer> | undefined
let meter = new ScreamMeter(0.1)
const voiceGate = new VoiceGate()
const previewGate = new VoiceGate()
let previewMeter = new ScreamMeter(0.1)
let previewThreshold = 0.1
function resetPreview() {
  previewGate.reset()
  previewMeter.reset()
}
let localReady = false
let remoteReady = false
let readinessEpoch = 0
let stopSequence = 0
let pendingStop: { requestId: number; epoch: number; voluntaryPause?: boolean } | undefined
let voluntaryPaused = false
let applyingPause = false
let stoppedRequest = 0
let interrupted = false
let drawingInterrupted = false
let visibilityInterrupted = false
let interruptionReason = ''
let remoteMic = false
let remoteRms = 0
let remoteSeen = 0
let localRms = 0
let localVoiced = false
let remoteVoiced = false
let remoteThresholdLocked = false
let remoteReadyThreshold: number | undefined
let remoteHealthEpoch: number | undefined
let challenge = 0
let lastHostChallenge = 0
let minimumVoiceChallenge = 1
const challenges = new Map<number, number>()
let human: Pose = { ...HUMAN_START }
let haunter: Pose = { ...HAUNTER_START }
let effect: EffectEvent | null = null
let playback: EffectPlayback = { seen: 0, effect: null }
let effectId = 0
let sequence = 0
let receivedSequence = 0
let ritual: RitualState | null = null
let renderedRitualCompleted = -1
let spirit: SpiritState | null = null
let effectRequestSequence = 0
let receivedEffectRequest = 0
let remoteInput = { forward: 0, strafe: 0, turn: 0 }
let remoteInputSent: number | undefined
let turnTotal = 0
let remoteTurnTotal = 0
let inputSequence = 0
let receivedInputSequence = 0
const keys = new Set<string>()
let turn = 0
let pitch = 0
let previous = performance.now()
let startedAt = previous
let lastSend = 0
let lastUi = 0
let finished = false
let animation = 0
let micGeneration = 0
let interrupting = false
let handlingTerminalPeer = false
const listeners = new AbortController()
const fullscreenListeners = new AbortController()
const worldResizeObserver = new ResizeObserver(() => world?.resize())
worldResizeObserver.observe(container)
document.addEventListener(
  'fullscreenchange',
  () => {
    const active = document.fullscreenElement === play
    button('fullscreen').textContent = active ? '全画面を終了' : '全画面表示'
    button('fullscreen').setAttribute('aria-pressed', String(active))
    keys.clear()
    world?.resize()
  },
  { signal: fullscreenListeners.signal }
)
button('fullscreen').onclick = async () => {
  if (document.pointerLockElement === container) document.exitPointerLock()
  try {
    if (document.fullscreenElement === play) await document.exitFullscreen()
    else if (!document.fullscreenElement && document.fullscreenEnabled && play.requestFullscreen)
      await play.requestFullscreen()
    else throw new Error('fullscreen unavailable')
    text('fullscreen-status', '')
  } catch {
    text(
      'fullscreen-status',
      document.fullscreenElement === play
        ? '全画面を終了できません。Escなどブラウザーの操作をお試しください。'
        : '全画面表示を変更できません。通常表示で続けられます。'
    )
  }
}
window.addEventListener(
  'pagehide',
  () => {
    fullscreenListeners.abort()
    worldResizeObserver.disconnect()
  },
  { once: true }
)

function checkVisibility() {
  if (finished) return false
  if (!document.hidden) {
    visibilityInterrupted = false
    return true
  }
  if (!visibilityInterrupted) {
    visibilityInterrupted = true
    keys.clear()
    interrupt('画面が非表示のため中断しました。表示後に両者で再準備してください。', true, true)
  }
  return false
}
document.addEventListener('visibilitychange', () => checkDrawing(), { signal: listeners.signal })
function interruptDrawing() {
  if (drawingInterrupted) return
  drawingInterrupted = true
  keys.clear()
  interrupt('画面の描画を確認できないため中断しました。復旧後に両者で再準備してください。', true, true)
}
function isWorldHealthy() {
  if (finished) return false
  try {
    return !!world?.isHealthy
  } catch {
    interruptDrawing()
    return false
  }
}
function checkDrawing(rendered = false) {
  if (!checkVisibility()) return false
  if (!world || finished) return false
  if (!isWorldHealthy()) {
    interruptDrawing()
    return false
  }
  if (drawingInterrupted) {
    if (!rendered || pendingStop) return false
    drawingInterrupted = false
    interrupt('画面が復旧しました。両者で新たに再準備してください。', true, true)
  }
  return true
}
function micHealthy() {
  if (
    audioShutdownFailed ||
    microphoneShutdownFailed ||
    frameFailed ||
    frameSchedulingFailed ||
    releasingMedia ||
    stoppingTracks ||
    handlingTerminalPeer
  )
    return false
  try {
    const track = stream?.getAudioTracks()[0]
    return !!track && track.readyState === 'live' && !track.muted && track.enabled && audio?.state === 'running'
  } catch {
    return false
  }
}
function checkLocalMic() {
  if (micHealthy()) return true
  const state = player === 'host' ? match.getSnapshot() : snapshot
  if (
    connected &&
    !finished &&
    !pendingStop &&
    (localReady ||
      remoteReadyThreshold !== undefined ||
      (!state.paused && (state.phase === 'round1' || state.phase === 'round2')))
  ) {
    interrupt('マイクが利用できません。両者で再準備してください。')
    sendHealth(false)
  }
  return false
}
function canReady(state: MatchSnapshot) {
  return (
    state.phase === 'lobby' ||
    state.phase === 'intermission' ||
    ((state.phase === 'round1' || state.phase === 'round2') && state.paused)
  )
}
function checkRemoteHealth() {
  if (finished) return false
  if (!remoteMic || performance.now() - remoteSeen <= 500) return remoteMic
  remoteMic = false
  if (pendingStop || (interrupted && snapshot.paused && !localReady && remoteReadyThreshold === undefined)) return false
  interrupt(
    interruptionReason && (snapshot.paused || pendingStop) ? interruptionReason : '相手の応答がありません。',
    true,
    true
  )
  return false
}
function canPreviewSound() {
  return (
    !document.hidden &&
    isWorldHealthy() &&
    !drawingInterrupted &&
    !!sound &&
    (!peer || connected) &&
    !finished &&
    !pendingStop &&
    !snapshot.paused &&
    !localReady &&
    !remoteReady &&
    remoteReadyThreshold === undefined &&
    (snapshot.phase === 'lobby' || snapshot.phase === 'intermission') &&
    micHealthy() &&
    !input('mute').checked &&
    Number(input('volume').value) > 0
  )
}
function updateReady(observeMic = true) {
  button('microphone').disabled =
    finished ||
    peerTerminated ||
    audioShutdownFailed ||
    microphoneShutdownFailed ||
    frameFailed ||
    frameSchedulingFailed ||
    releasingMedia ||
    stoppingTracks
  if (observeMic) {
    checkDrawing()
    checkLocalMic()
    checkRemoteHealth()
  }
  const previewAllowed = canPreviewSound()
  if (!previewAllowed) useSound((output) => output.stopPreview())
  button('sound-preview').disabled = !previewAllowed || !!sound?.isPreviewing
  button('ready').disabled =
    !!document.hidden ||
    !isWorldHealthy() ||
    drawingInterrupted ||
    !connected ||
    !micHealthy() ||
    !remoteMic ||
    finished ||
    !!pendingStop ||
    localReady ||
    !canReady(snapshot)
  button('pause').disabled =
    !worldInitialized ||
    !connected ||
    finished ||
    !!pendingStop ||
    snapshot.paused ||
    (snapshot.phase !== 'round1' && snapshot.phase !== 'round2')
  text('pause', pendingStop ? '中断確認待ち' : snapshot.paused ? '中断中' : '休止する（P）')
}
function send(value: unknown) {
  return peer?.send(value) ?? false
}
function resetReadiness() {
  if (voluntaryPaused) keys.clear()
  footsteps.reset()
  turn = 0
  remoteTurnTotal = 0
  remoteInput = { forward: 0, strafe: 0, turn: 0 }
  remoteInputSent = undefined
  localReady = false
  remoteReady = false
  remoteReadyThreshold = undefined
  remoteHealthEpoch = undefined
  meter.reset()
  voiceGate.reset()
  resetPreview()
  localVoiced = false
  remoteVoiced = false
  if (player === 'host') {
    minimumVoiceChallenge = challenge + 1
    readinessEpoch++
  }
}
function interrupt(reason: string, notifyHost = true, stopUnprepared = false) {
  if (interrupting) return
  const previousStop = pendingStop
  if (
    document.hidden &&
    visibilityInterrupted &&
    interrupted &&
    !stopUnprepared &&
    !localReady &&
    remoteReadyThreshold === undefined
  )
    return
  if (
    player === 'guest' &&
    notifyHost &&
    connected &&
    !finished &&
    !pendingStop &&
    (stopUnprepared || snapshot.phase !== 'lobby' || localReady || remoteReadyThreshold !== undefined)
  ) {
    pendingStop = {
      requestId: ++stopSequence,
      epoch: readinessEpoch,
      ...(voluntaryPaused ? { voluntaryPause: true } : {})
    }
  }
  interrupting = true
  try {
    if (player === 'host') match.pause()
    soundAllowed = false
    if (player === 'host') effect = null
    playback = { ...playback, effect: null }
    if (player !== 'host' || notifyHost || !interrupted || localReady || remoteReadyThreshold !== undefined)
      resetReadiness()
    interrupted = true
    interruptionReason = reason
    cleanupMedia([
      () => useSound((output) => output.stop()),
      () => {
        if (pendingStop && pendingStop !== previousStop) send({ type: 'stop', ...pendingStop })
      },
      () => {
        if (player === 'host') broadcast()
      },
      () => text('notice', interruptionReason),
      () => updateReady(false)
    ])
  } finally {
    interrupting = false
  }
}
function requestPause() {
  const state = player === 'host' ? match.getSnapshot() : snapshot
  if (
    !worldInitialized ||
    finished ||
    !connected ||
    interrupting ||
    pendingStop ||
    state.paused ||
    (state.phase !== 'round1' && state.phase !== 'round2')
  )
    return false
  voluntaryPaused = true
  pauseActions([
    () => interrupt('任意に中断しました。相手への反映は通信後です。停止確認後、双方で新たに準備してください。'),
    () => {
      if (document.pointerLockElement === container) document.exitPointerLock()
    },
    () => updateUI()
  ])
  return true
}
function soundFailure() {
  if (handlingSoundFailure) return
  handlingSoundFailure = true
  try {
    cleanupMedia([releaseMedia, reportSoundFailure])
  } finally {
    handlingSoundFailure = false
  }
}
function reportSoundFailure() {
  const firstFailure = !soundFailed
  soundFailed = true
  keys.clear()
  if (interrupting && player === 'guest' && connected && !finished && !pendingStop)
    pendingStop = { requestId: ++stopSequence, epoch: readinessEpoch }
  interruptionReason = microphoneShutdownFailed
    ? '旧マイクの停止を保証できません。このページでは試合と新規マイク取得を禁止しました。ブラウザーのマイク権限を取り消し、このタブを閉じて録音表示を確認してください。表示が残る場合はブラウザーを終了するか入力機器を無効化してください。再読み込みだけでは停止を保証できません。'
    : audioShutdownFailed
      ? '音声を停止できません。終了してページを再読み込みしてください。'
      : frameSchedulingFailed
        ? '画面の更新を予約できないため試合を中断しました。このページを再読み込みしてください。'
        : frameFailed
          ? '画面の更新に失敗したため試合を中断しました。復旧後にマイクを再接続し、両者で再準備してください。'
          : peerTerminated
            ? '接続が切れた後に音声エラーが発生しました。双方で終了してやり直し、ブラウザーの録音表示を確認してください。'
            : '音声エラーのため試合を中断しました。マイクを再接続し、両者で新たに再準備してください。'
  cleanupMedia([
    () => {
      if (!firstFailure) return
      if (!finished) interrupt(interruptionReason, true, true)
      else resetReadiness()
    },
    () => text('notice', interruptionReason),
    () => text('mic-status', interruptionReason),
    () => {
      if (firstFailure) sendHealth(false)
    },
    () => updateReady(false)
  ])
}
function useSound(action: (output: YashikiSound) => unknown) {
  try {
    if (sound) action(sound)
    return true
  } catch {
    soundFailure()
    return false
  }
}
function sendHealth(healthy = micHealthy()) {
  if (player === 'host') {
    challenge++
    const now = performance.now()
    challenges.set(challenge, now)
    for (const [id, sent] of challenges) if (now - sent > 1000) challenges.delete(id)
  }
  return send({
    type: 'health',
    mic: healthy,
    rms: localRms,
    voiced: healthy && localVoiced,
    threshold: Number(input('threshold').value),
    epoch: readinessEpoch,
    challenge: player === 'host' ? challenge : lastHostChallenge,
    phase: snapshot.phase,
    playing: !pendingStop && !snapshot.paused && (snapshot.phase === 'round1' || snapshot.phase === 'round2')
  })
}
function axis(value: unknown): value is number {
  return typeof value === 'number' && Number.isFinite(value) && Math.abs(value) <= 1
}
function validPose(value: unknown): value is Pose {
  if (!value || typeof value !== 'object') return false
  const pose = value as Record<string, unknown>
  return ['x', 'z', 'yaw'].every(
    (key) => typeof pose[key] === 'number' && Number.isFinite(pose[key]) && Math.abs(pose[key] as number) < 10000
  )
}
function validState(message: Record<string, unknown>) {
  const state = message.snapshot as MatchSnapshot | undefined
  return (
    !!state &&
    ['lobby', 'round1', 'intermission', 'round2', 'finished'].includes(state.phase) &&
    (state.survivor === 'host' || state.survivor === 'guest') &&
    typeof state.paused === 'boolean' &&
    Number.isFinite(state.elapsedMs) &&
    state.elapsedMs >= 0 &&
    state.elapsedMs <= 900000 &&
    !!state.scores &&
    [state.scores.host, state.scores.guest].every(
      (score) => typeof score === 'number' && Number.isFinite(score) && score <= 0 && score >= -1000000
    ) &&
    validPose(message.human) &&
    validPose(message.haunter) &&
    (state.phase !== 'round1' || state.survivor === 'host') &&
    (state.phase !== 'round2' || state.survivor === 'guest') &&
    acceptRitual(ritual, message.ritual, state) &&
    acceptSpirit(spirit, message.spirit, state) &&
    validEffect(message.effect, state) &&
    typeof message.readinessEpoch === 'number' &&
    (message.voluntaryPause === undefined || typeof message.voluntaryPause === 'boolean') &&
    (message.voluntaryPause !== true || state.paused) &&
    (!voluntaryPaused ||
      !!pendingStop ||
      state.paused ||
      (state.phase !== 'round1' && state.phase !== 'round2') ||
      (localReady && message.readinessEpoch > readinessEpoch)) &&
    Number.isSafeInteger(message.readinessEpoch) &&
    message.readinessEpoch >= readinessEpoch &&
    (message.stoppedRequest === undefined ||
      (Number.isSafeInteger(message.stoppedRequest) && (message.stoppedRequest as number) >= 0)) &&
    freshSnapshot(snapshot, state, receivedSequence, message.sequence)
  )
}
let remoteThreshold = 0.1
function acceptRemoteReady() {
  if (
    !checkDrawing() ||
    remoteReadyThreshold === undefined ||
    remoteReadyThreshold !== remoteThreshold ||
    remoteHealthEpoch !== readinessEpoch ||
    !remoteMic ||
    performance.now() - remoteSeen > 500 ||
    !canReady(player === 'host' ? match.getSnapshot() : snapshot)
  )
    return
  remoteThresholdLocked = true
  remoteReady = true
  maybeStart()
}
function handleMessage(value: unknown) {
  if (finished || !value || typeof value !== 'object') return
  const message = value as Record<string, unknown>
  if (message.type !== 'stop') {
    const drawingHealthy = checkDrawing()
    if (!drawingHealthy && message.type !== 'health' && message.type !== 'state') return
    checkLocalMic()
    checkRemoteHealth()
  }
  if (message.type === 'stop') {
    if (
      player !== 'host' ||
      !connected ||
      finished ||
      !Number.isSafeInteger(message.requestId) ||
      message.requestId !== stoppedRequest + 1 ||
      !Number.isSafeInteger(message.epoch) ||
      (message.voluntaryPause !== undefined && typeof message.voluntaryPause !== 'boolean') ||
      (message.epoch as number) < 0 ||
      (message.epoch as number) > readinessEpoch
    )
      return
    stoppedRequest = message.requestId as number
    const newVoluntaryPause = message.voluntaryPause === true && !voluntaryPaused
    if (message.voluntaryPause === true) voluntaryPaused = true
    if (document.hidden) {
      visibilityInterrupted = true
      keys.clear()
    }
    interrupted = false
    pauseActions([
      () => interrupt('相手が中断しました。両者で再準備してください。', false),
      () => {
        if (newVoluntaryPause && document.pointerLockElement === container) document.exitPointerLock()
      }
    ])
  } else if (message.type === 'health') {
    const health = parseVoiceHealth(message)
    const now = performance.now()
    const sent = health && challenges.get(health.challenge)
    if (!health || !player || !Number.isSafeInteger(message.epoch) || (message.epoch as number) < 0) {
      remoteMic = false
      if (snapshot.phase === 'round1' || snapshot.phase === 'round2')
        interrupt('相手の音声情報が不正なため中断しました。')
      return
    }
    if (
      (message.epoch as number) < readinessEpoch ||
      !isFreshVoiceHealth(health, player, lastHostChallenge, sent, now, undefined)
    )
      return
    if (remoteThresholdLocked && health.threshold !== remoteThreshold) {
      remoteMic = false
      if (snapshot.phase === 'round1' || snapshot.phase === 'round2')
        interrupt('相手の音声情報が不正なため中断しました。')
      updateReady()
      return
    }
    if (player === 'guest') lastHostChallenge = health.challenge
    remoteMic = health.mic
    remoteRms = health.rms
    remoteVoiced = isCurrentVoice(health, snapshot.phase, player === 'host' ? minimumVoiceChallenge : 0)
    remoteSeen = now
    remoteThreshold = health.threshold
    remoteHealthEpoch = message.epoch as number
    if (!remoteMic && !finished) interrupt('相手のマイクが利用できません。再確認してください。', false)
    updateReady()
    acceptRemoteReady()
  } else if (
    message.type === 'ready' &&
    message.value === true &&
    message.epoch === readinessEpoch &&
    typeof message.threshold === 'number' &&
    Number.isFinite(message.threshold) &&
    message.threshold >= 0.02 &&
    message.threshold <= 0.5
  ) {
    if (!micHealthy() || !remoteMic || !canReady(player === 'host' ? match.getSnapshot() : snapshot)) return
    if (remoteThresholdLocked && message.threshold !== remoteThreshold) return
    remoteReadyThreshold = message.threshold
    updateReady()
    acceptRemoteReady()
  } else if (
    player === 'host' &&
    message.type === 'input' &&
    axis(message.forward) &&
    axis(message.strafe) &&
    typeof message.turnTotal === 'number' &&
    Number.isFinite(message.turnTotal) &&
    Math.abs(message.turnTotal) <= Number.MAX_SAFE_INTEGER &&
    Number.isSafeInteger(message.sequence) &&
    (message.sequence as number) > receivedInputSequence &&
    message.epoch === readinessEpoch
  ) {
    const state = match.getSnapshot()
    if (state.paused || (state.phase !== 'round1' && state.phase !== 'round2') || message.round !== state.phase) return
    const sent = challenges.get(message.challenge as number)
    const now = performance.now()
    if (!Number.isSafeInteger(message.challenge) || sent === undefined || now < sent || now - sent > 500) return
    const pendingTurn = remoteInput.turn + message.turnTotal - remoteTurnTotal
    const pose = state.survivor === 'host' ? haunter : human
    if (!validPose({ ...pose, yaw: pose.yaw + pendingTurn })) return
    remoteInput = {
      forward: message.forward,
      strafe: message.strafe,
      turn: pendingTurn
    }
    remoteTurnTotal = message.turnTotal
    remoteInputSent = sent
    receivedInputSequence = message.sequence as number
  } else if (
    player === 'host' &&
    message.type === 'effect' &&
    message.epoch === readinessEpoch &&
    Number.isSafeInteger(message.requestId) &&
    (message.requestId as number) > receivedEffectRequest
  ) {
    const state = match.getSnapshot()
    if (state.paused || (state.phase !== 'round1' && state.phase !== 'round2') || message.round !== state.phase) return
    receivedEffectRequest = message.requestId as number
    triggerEffect(message.kind, 'guest', message.round)
  } else if (player === 'host' && message.type === 'ritual' && message.epoch === readinessEpoch) {
    const next = requestRitual(ritual, match.getSnapshot(), 'guest', human, message.round, message.step)
    if (next) {
      ritual = next
      broadcast()
    }
  } else if (player === 'guest' && message.type === 'state') {
    if (!validState(message)) {
      footsteps.reset()
      return
    }
    const previousSnapshot = snapshot,
      previousRitual = ritual,
      oldPhase = snapshot.phase,
      wasPaused = snapshot.paused,
      oldEpoch = readinessEpoch
    snapshot = message.snapshot as MatchSnapshot
    readinessEpoch = message.readinessEpoch as number
    const newVoluntaryPause = snapshot.paused && message.voluntaryPause === true && !voluntaryPaused
    if (snapshot.paused && message.voluntaryPause === true) {
      voluntaryPaused = true
      keys.clear()
      turn = 0
    }
    if (!snapshot.paused && !pendingStop && localReady && readinessEpoch > oldEpoch) voluntaryPaused = false
    if (
      pendingStop &&
      message.stoppedRequest === pendingStop.requestId &&
      readinessEpoch > pendingStop.epoch &&
      canReady(snapshot)
    ) {
      pendingStop = undefined
      resetReadiness()
    }
    receivedSequence = message.sequence as number
    ritual = message.ritual as RitualState | null
    spirit = message.spirit as SpiritState | null
    human = message.human as Pose
    haunter = message.haunter as Pose
    const drawingHealthy = checkDrawing()
    checkLocalMic()
    const playing = !snapshot.paused && (snapshot.phase === 'round1' || snapshot.phase === 'round2')
    if (playing && !remoteMic && !pendingStop) interrupt('相手のマイク応答を確認してください。')
    if (playing && drawingHealthy && !pendingStop && !voluntaryPaused && (oldPhase !== snapshot.phase || wasPaused)) {
      startedAt = performance.now()
      soundAllowed = true
      interruptionReason = ''
      text('notice', '')
    }
    if (!playing) soundAllowed = false
    if (snapshot.paused) {
      interruptionReason ||= '相手が中断しました。両者で再準備してください。'
      text('notice', interruptionReason)
    }
    pauseActions([
      syncSound,
      () => {
        if (newVoluntaryPause && document.pointerLockElement === container) document.exitPointerLock()
      }
    ])
    playRitualBell(previousRitual, previousSnapshot, oldEpoch)
    const incoming = message.effect as EffectEvent | null
    const result = receiveEffect(playback, incoming, snapshot, performance.now())
    playback = soundAllowed && !pendingStop && remoteMic ? result.playback : { ...result.playback, effect: null }
    if (incoming && result.playSound && playing && soundAllowed)
      useSound((output) => output.trigger(incoming.kind, (snapshot.elapsedMs - incoming.elapsedMs) / 1000))
    if (oldEpoch !== readinessEpoch || oldPhase !== snapshot.phase || (!wasPaused && snapshot.paused)) {
      turnTotal = 0
      resetReadiness()
    }
    playFootstep(snapshot, performance.now())
    if (snapshot.phase === 'finished') finish()
    updateUI()
    if (
      oldEpoch !== readinessEpoch &&
      connected &&
      !finished &&
      !pendingStop &&
      isWorldHealthy() &&
      !drawingInterrupted &&
      performance.now() - previous <= 500 &&
      micHealthy() &&
      remoteMic
    ) {
      if (!sendHealth()) interrupt('MoQ接続を確認してください。両者で再準備してください。', true, true)
    }
  }
}
function maybeStart() {
  if (
    !checkDrawing() ||
    player !== 'host' ||
    !connected ||
    !micHealthy() ||
    !remoteMic ||
    remoteHealthEpoch !== readinessEpoch ||
    performance.now() - remoteSeen > 500 ||
    !localReady ||
    !remoteReady
  )
    return
  const state = match.getSnapshot()
  if (!canReady(state)) return
  if (!useSound((output) => output.stopPreview())) return
  if (state.phase === 'lobby') match.start()
  else if (state.phase === 'intermission') {
    match.startSecondRound()
    human = { ...HUMAN_START }
    haunter = { ...HAUNTER_START }
    effect = null
  } else if (state.paused) match.resume()
  startedAt = performance.now()
  interrupted = false
  if (voluntaryPaused) keys.clear()
  voluntaryPaused = false
  ritual = ritualForMatch(ritual, match.getSnapshot())
  spirit = spiritForMatch(spirit, match.getSnapshot())
  resetReadiness()
  meter = new ScreamMeter(match.getSnapshot().survivor === 'guest' ? remoteThreshold : Number(input('threshold').value))
  soundAllowed = true
  interruptionReason = ''
  text('notice', '')
  broadcast()
}
function broadcast() {
  snapshot = match.getSnapshot()
  ritual = ritualForMatch(ritual, snapshot)
  spirit = spiritForMatch(spirit, snapshot)
  if (snapshot.paused || (snapshot.phase !== 'round1' && snapshot.phase !== 'round2')) effect = null
  syncSound()
  send({
    type: 'state',
    sequence: ++sequence,
    readinessEpoch,
    voluntaryPause: voluntaryPaused && snapshot.paused,
    stoppedRequest,
    snapshot,
    human,
    haunter,
    effect,
    ritual,
    spirit
  })
}
function syncSound() {
  if (
    !document.hidden &&
    isWorldHealthy() &&
    !drawingInterrupted &&
    soundAllowed &&
    !pendingStop &&
    !voluntaryPaused &&
    !finished &&
    connected &&
    micHealthy() &&
    remoteMic &&
    !snapshot.paused &&
    (snapshot.phase === 'round1' || snapshot.phase === 'round2')
  )
    useSound((output) => output.start())
  else {
    footsteps.reset()
    if (!sound?.isPreviewing || !canPreviewSound()) useSound((output) => output.stop())
  }
}
function playFootstep(state: MatchSnapshot, now: number) {
  if (
    document.hidden ||
    !isWorldHealthy() ||
    drawingInterrupted ||
    !sound ||
    !soundAllowed ||
    pendingStop ||
    finished ||
    !connected ||
    !micHealthy() ||
    !remoteMic ||
    input('mute').checked ||
    Number(input('volume').value) === 0
  ) {
    footsteps.reset()
    return
  }
  const surface = footsteps.sample(human, state, player, now)
  if (surface) useSound((output) => output.footstep(surface))
}
function playRitualBell(previousRitual: RitualState | null, previousSnapshot: MatchSnapshot, previousEpoch: number) {
  const bellCompleted = RITUAL_STEPS.findIndex((step) => step.id === 'bell') + 1
  if (
    document.hidden ||
    !isWorldHealthy() ||
    drawingInterrupted ||
    !sound ||
    !soundAllowed ||
    pendingStop ||
    finished ||
    !connected ||
    !micHealthy() ||
    !remoteMic ||
    remoteHealthEpoch !== readinessEpoch ||
    performance.now() - remoteSeen > 500 ||
    input('mute').checked ||
    Number(input('volume').value) === 0 ||
    previousEpoch !== readinessEpoch ||
    previousSnapshot.paused ||
    snapshot.paused ||
    (snapshot.phase !== 'round1' && snapshot.phase !== 'round2') ||
    previousSnapshot.phase !== snapshot.phase ||
    previousSnapshot.survivor !== player ||
    snapshot.survivor !== player ||
    !previousRitual ||
    !ritual ||
    previousRitual.round !== snapshot.phase ||
    ritual.round !== snapshot.phase ||
    bellCompleted === 0 ||
    previousRitual.completed >= bellCompleted ||
    ritual.completed < bellCompleted
  )
    return
  useSound((output) => output.ritualBell())
}
function triggerEffect(kind: unknown, source: PlayerId, round: unknown) {
  const state = match.getSnapshot(),
    now = performance.now()
  const next = requestSpirit(spirit, state, source, round, kind, human, haunter, ritual)
  if (!next || (state.phase !== 'round1' && state.phase !== 'round2')) return
  spirit = next
  effect = { id: ++effectId, round: state.phase, kind: kind as EffectKind, elapsedMs: state.elapsedMs }
  playback = receiveEffect(playback, effect, state, now).playback
  useSound((output) => output.trigger(kind as EffectKind))
  broadcast()
}
function updateUI() {
  const phase = snapshot.phase
  const showSpirit = !!player && snapshot.survivor !== player && !!spirit && (phase === 'round1' || phase === 'round2')
  el('spirit').hidden = !showSpirit
  if (showSpirit && spirit) {
    const kinds: EffectKind[] = ['apparition', 'blackout', 'rattle']
    const statuses = kinds.map((kind) => spiritStatus(spirit!, snapshot, kind, human, haunter, ritual))
    text('spirit-energy', `霊力 ${Math.floor(statuses[0].energy)} / 100`)
    text('spirit-cooldown', `共通クールダウン ${Math.ceil(statuses[0].cooldown / 1000)}秒`)
    text(
      'spirit-actions',
      kinds
        .map(
          (kind, index) =>
            `${['1 出現 (45)', '2 暗転 (35)', '3 物音 (20)'][index]}：${statuses[index].reason || '使用可能'}`
        )
        .join(' / ')
    )
  }
  const labels = {
    lobby: '準備を整えてください',
    round1: '第一夜',
    intermission: '役割を交代',
    round2: '第二夜',
    finished: '夜が明けました'
  }
  text(
    'phase',
    pendingStop && voluntaryPaused && (phase === 'round1' || phase === 'round2')
      ? '中断要求中（主催の確認待ち）'
      : snapshot.paused
        ? '中断中'
        : labels[phase]
  )
  const remaining = Math.max(0, Math.ceil((900000 - snapshot.elapsedMs) / 1000))
  text('timer', String(Math.floor(remaining / 60)).padStart(2, '0') + ':' + String(remaining % 60).padStart(2, '0'))
  const hostScore = snapshot.scores.host.toFixed(2)
  const guestScore = snapshot.scores.guest.toFixed(2)
  const preciseScores =
    phase === 'finished' && snapshot.scores.host !== snapshot.scores.guest && Number(hostScore) === Number(guestScore)
  text(
    'scores',
    preciseScores
      ? `主催 ${snapshot.scores.host} / 参加者 ${snapshot.scores.guest}（僅差のため丸めずに表示）`
      : `主催 ${hostScore} / 参加者 ${guestScore}`
  )
  const hints = ['南西の文机を調べる', '北西の鈴を探す', '北東の鏡を探す', '南東の封印を探す']
  const step = ritual && RITUAL_STEPS[ritual.completed]
  const hint = !ritual
    ? '手掛かりは夜が始まると現れます。'
    : snapshot.paused
      ? '中断中：手掛かりの進行は保持されます。'
      : !step
        ? 'すべての手掛かりを見つけました。'
        : snapshot.elapsedMs < step.availableMs
          ? `次の手掛かり：${hints[ritual.completed]}（${Math.ceil((step.availableMs - snapshot.elapsedMs) / 60000)}分ほど待つ）`
          : `次の手掛かり：${hints[ritual.completed]}。人間は近くで E。`
  text('ritual-hint', hint)
  const ward = ritualWard(ritual, snapshot)
  const wardIndex = RITUAL_STEPS.findIndex(
    (item) => snapshot.elapsedMs < item.availableMs + RITUAL_WARD_DELAY_MS + RITUAL_WARD_MS
  )
  const wardStep = RITUAL_STEPS[wardIndex]
  const wardPlace = ['南西の文机', '北西の鈴', '北東の鏡', '南東の封印'][wardIndex]
  const wardStart = wardStep ? wardStep.availableMs + RITUAL_WARD_DELAY_MS : 0
  const wardSeconds = Math.ceil(
    ((snapshot.elapsedMs < wardStart ? wardStart : wardStart + RITUAL_WARD_MS) - snapshot.elapsedMs) / 1000
  )
  text(
    'ritual-ward',
    !ritual
      ? '調査済みの地点は、解禁60秒後から30秒だけ周囲の出現を防ぎます。'
      : snapshot.paused
        ? '中断中：出現止めの時計も止まり、調査は保持されます。'
        : wardStep
          ? `${wardPlace}の結界：${snapshot.elapsedMs < wardStart ? '発動' : '終了'}まで${wardSeconds}秒（${
              ward ? `調査済み・半径${RITUAL_RADIUS}m以内で出現阻止` : '未発動'
            }）`
          : '今夜の結界はすべて終了しました。'
  )
  const completed = ritual?.completed ?? 0
  if (completed !== renderedRitualCompleted) {
    el('ritual-story').replaceChildren(
      ...RITUAL_STEPS.slice(0, completed).map((item) => {
        const line = document.createElement('li')
        line.textContent = item.text
        return line
      })
    )
    renderedRitualCompleted = completed
  }
  if (phase === 'finished')
    text(
      'role',
      (snapshot.scores.host === snapshot.scores.guest
        ? '引き分け'
        : snapshot.scores.host > snapshot.scores.guest
          ? '主催の勝ち'
          : '参加者の勝ち') + '。0に近いスコアが勝ちです。'
    )
  else if (phase === 'intermission') text('role', '役割を交代します。双方が準備完了を押してください。')
  else if (phase === 'round1' || phase === 'round2')
    text(
      'role',
      snapshot.survivor === player
        ? 'あなたは人間。静かに屋敷を探索してください。'
        : 'あなたは怪異。1・2・3 で恐怖を仕掛けてください。'
    )
  button('ready').textContent = localReady ? '相手を待っています' : snapshot.paused ? '再開の準備完了' : '準備完了'
  updateReady()
}
function pauseActions(actions: Array<() => void>) {
  const previousApplying = applyingPause
  applyingPause = true
  try {
    cleanupMedia(actions)
  } finally {
    applyingPause = previousApplying
  }
}
function cleanupMedia(actions: Array<() => void>) {
  let failure: { error: unknown } | undefined
  for (const action of actions) {
    try {
      action()
    } catch (error) {
      failure ??= { error }
    }
  }
  if (failure) throw failure.error
}
function stopMediaTracks(media: MediaStream, knownTracks: Iterable<MediaStreamTrack> = []) {
  const previousStopping = stoppingTracks
  stoppingTracks = true
  const tracks = new Set(knownTracks)
  try {
    cleanupMedia([
      () => {
        try {
          for (const track of media.getTracks()) tracks.add(track)
        } catch (error) {
          microphoneShutdownFailed = true
          try {
            for (const track of media.getAudioTracks()) tracks.add(track)
          } catch {}
          throw error
        }
      },
      () =>
        cleanupMedia(
          [...tracks].flatMap((track) => [
            () => {
              track.onended = null
            },
            () => {
              track.onmute = null
            },
            () => {
              track.onunmute = null
            },
            () => {
              let ended = false
              try {
                ended = track.readyState === 'ended'
              } catch {}
              if (!ended) {
                try {
                  track.stop()
                } catch {}
              }
              try {
                if (track.readyState !== 'ended') microphoneShutdownFailed = true
              } catch (error) {
                microphoneShutdownFailed = true
                throw error
              }
            }
          ])
        )
    ])
  } finally {
    stoppingTracks = previousStopping
  }
}
function releaseMedia() {
  if (releasingMedia) return
  releasingMedia = true
  const oldSound = sound
  const oldStream = stream
  const oldTracks = mediaTracks
  const oldAudio = audio
  micGeneration++
  sound = undefined
  stream = undefined
  mediaTracks = new Set()
  audio = undefined
  analyser = undefined
  samples = undefined
  soundAllowed = false
  let closeFailure = false
  try {
    cleanupMedia([
      () => setMicProcessing(),
      () => footsteps.reset(),
      () => {
        if (oldAudio) oldAudio.onstatechange = null
      },
      () => {
        try {
          oldSound?.dispose()
        } catch {
          try {
            oldSound?.stop()
          } catch {}
        }
      },
      () => {
        if (oldStream) stopMediaTracks(oldStream, oldTracks)
      },
      () => {
        if (!oldAudio) return
        const closeFailed = () => {
          closeFailure = true
          const suspendFailed = () => {
            audioShutdownFailed = true
            if (!finished && !releasingMedia) soundFailure()
          }
          try {
            void oldAudio
              .suspend()
              .catch(suspendFailed)
              .catch(() => {})
          } catch {
            audioShutdownFailed = true
          }
          if (!finished && !releasingMedia) soundFailure()
        }
        try {
          void oldAudio
            .close()
            .catch(closeFailed)
            .catch(() => {})
        } catch {
          closeFailed()
        }
      },
      () => {
        button('sound-preview').disabled = true
        voiceGate.reset()
        resetPreview()
        text('preview-status', 'マイクを接続してください')
        meter.reset()
        localRms = 0
        localVoiced = false
      },
      () => {
        if ((microphoneShutdownFailed || (closeFailure && !finished)) && !handlingSoundFailure) soundFailure()
      }
    ])
  } finally {
    releasingMedia = false
  }
}
function finish() {
  if (finished) return
  finished = true
  cleanupMedia([
    releaseMedia,
    () => {
      updateUI()
      listeners.abort()
      world?.dispose()
      world = undefined
      if (document.pointerLockElement) document.exitPointerLock()
      setTimeout(() => {
        peer?.close()
        peer = undefined
      }, 6000)
    }
  ])
}
function cleanup() {
  cleanupMedia([
    () => {
      if (!finished) interrupt('終了しました。', true, true)
    },
    () => {
      finished = true
      connected = false
      cancelAnimationFrame(animation)
    },
    () => listeners.abort(),
    releaseMedia,
    () => {
      peer?.close()
      peer = undefined
    },
    () => {
      const oldWorld = world
      world = undefined
      oldWorld?.dispose()
    },
    () => {
      if (document.pointerLockElement) document.exitPointerLock()
    }
  ])
}
async function connectPeer(role: PlayerId) {
  if (!worldInitialized || finished || peer) return
  if (!useSound((output) => output.stopPreview())) return
  try {
    const room = role === 'host' ? createRoomCode() : input('room-code').value.trim().toLowerCase()
    const nextPeer = new HorrorPeer({
      role,
      relayUrl: input('relay-url').value.trim(),
      room,
      onMessage: handleMessage,
      onStatus: (status) => {
        if (handlingTerminalPeer) return
        peerStatus = status
        connected = status === 'connected'
        if (!connected && status !== 'connecting' && !finished) {
          peerTerminated = true
          handlingTerminalPeer = true
          if (
            interrupting &&
            !soundFailed &&
            !microphoneShutdownFailed &&
            !audioShutdownFailed &&
            !frameFailed &&
            !frameSchedulingFailed
          )
            interruptionReason = 'MoQ接続が切れました。双方で終了してやり直してください。'
          remoteMic = false
          cleanupMedia([
            () => {
              try {
                cleanupMedia([
                  () => interrupt('MoQ接続が切れました。双方で終了してやり直してください。'),
                  () => useSound((output) => output.stopPreview()),
                  releaseMedia,
                  () => {
                    if (!microphoneShutdownFailed && !audioShutdownFailed)
                      text('mic-status', 'マイクの解放を試みました。ブラウザーの録音表示を確認してください。')
                  },
                  () => text('connection', 'MoQ接続が切れています。終了してやり直してください。')
                ])
              } finally {
                handlingTerminalPeer = false
              }
            },
            () => updateReady(false)
          ])
          return
        }
        useSound((output) => output.stopPreview())
        if (connected) {
          text('connection', 'MoQで相手と接続しました')
          sendHealth()
        }
        updateReady()
      }
    })
    peer = nextPeer
    player = role
    input('room-code').value = room
    input('room-code').readOnly = true
    input('relay-url').disabled = true
    button('host').disabled = true
    button('guest').disabled = true
    button('copy').disabled = false
    text('connection', 'MoQリレーに接続しています…')
    await nextPeer.connect()
    if (peerStatus === 'connecting') text('connection', 'リレー接続済み。相手との疎通を待っています。')
  } catch {
    text(
      'connection',
      peer
        ? 'MoQリレーに接続できません。設定を確認し、終了してやり直してください。'
        : 'HTTPSのリレーURLと32文字の部屋コードを確認してください。'
    )
  }
}
button('host').onclick = () => void connectPeer('host')
button('guest').onclick = () => void connectPeer('guest')
button('copy').onclick = async () => {
  try {
    await navigator.clipboard.writeText(input('room-code').value)
    text(
      peerStatus === 'connecting' ? 'connection' : 'notice',
      '部屋コードをコピーしました。信頼できる相手へ送ってください。'
    )
  } catch {
    input('room-code').select()
    text(peerStatus === 'connecting' ? 'connection' : 'notice', '選択された部屋コードをコピーしてください。')
  }
}
button('microphone').onclick = async () => {
  if (
    !worldInitialized ||
    finished ||
    peerTerminated ||
    audioShutdownFailed ||
    microphoneShutdownFailed ||
    frameFailed ||
    frameSchedulingFailed ||
    handlingSoundFailure ||
    releasingMedia ||
    stoppingTracks ||
    handlingTerminalPeer
  )
    return
  const wasPeerTerminated = peerTerminated
  interrupt('マイクを再接続しています。')
  if (peerTerminated !== wasPeerTerminated) return
  releaseMedia()
  if (peerTerminated !== wasPeerTerminated || finished || audioShutdownFailed || microphoneShutdownFailed) return
  const generation = micGeneration
  sendHealth(false)
  text('mic-status', 'マイクの許可を待っています')
  if (
    generation !== micGeneration ||
    finished ||
    audioShutdownFailed ||
    microphoneShutdownFailed ||
    frameFailed ||
    frameSchedulingFailed
  )
    return
  try {
    const nextStream = await navigator.mediaDevices.getUserMedia({
      audio: { echoCancellation: true, noiseSuppression: false, autoGainControl: false },
      video: false
    })
    if (
      generation !== micGeneration ||
      finished ||
      audioShutdownFailed ||
      microphoneShutdownFailed ||
      frameFailed ||
      frameSchedulingFailed
    ) {
      try {
        stopMediaTracks(nextStream)
      } finally {
        if (microphoneShutdownFailed) soundFailure()
      }
      return
    }
    stream = nextStream
    try {
      const nextTracks = nextStream.getTracks()
      if (generation !== micGeneration || finished) return
      mediaTracks = new Set(nextTracks)
    } catch (error) {
      microphoneShutdownFailed = true
      throw error
    }
    const nextAudio = new AudioContext()
    audio = nextAudio
    await nextAudio.resume()
    if (
      generation !== micGeneration ||
      finished ||
      audioShutdownFailed ||
      microphoneShutdownFailed ||
      frameFailed ||
      frameSchedulingFailed
    )
      return
    sound = new YashikiSound(nextAudio, () => {
      if (audio === nextAudio) soundFailure()
    })
    sound.setVolume(Number(input('volume').value))
    sound.setMuted(input('mute').checked)
    analyser = audio.createAnalyser()
    analyser.fftSize = 8192
    audio.createMediaStreamSource(stream).connect(analyser)
    samples = new Float32Array(analyser.fftSize)
    const track = stream.getAudioTracks()[0]
    if (generation !== micGeneration || finished) return
    if (!track) throw new Error('missing track')
    mediaTracks.add(track)
    const current = () => generation === micGeneration && audio === nextAudio && stream === nextStream && !finished
    let processingInvalidated = false
    track.onended = track.onmute = () => {
      if (!current()) return
      processingInvalidated = true
      setMicProcessing()
      if (!current()) return
      interrupt('マイクが停止しました。もう一度許可してください。')
      if (!current()) return
      sendHealth()
      if (!current()) return
      text('mic-status', 'マイクを確認してください')
    }
    track.onunmute = () => {
      if (!current()) return
      sendHealth()
      if (!current()) return
      text('mic-status', 'マイク接続中')
      updateReady()
    }
    audio.onstatechange = () => {
      if (!current()) return
      if (!micHealthy() && !finished) {
        interrupt('マイク音声を解析できません。もう一度許可してください。')
        if (!current()) return
        sendHealth()
      }
      if (!current()) return
      updateReady()
    }
    showMicProcessing(track, () => current() && !processingInvalidated)
    if (!current() || processingInvalidated) return
    const healthy = micHealthy()
    if (!current() || processingInvalidated) return
    if (!healthy) setMicProcessing()
    if (!current() || processingInvalidated) return
    soundFailed = false
    text('mic-status', healthy ? 'マイク接続中' : 'マイクを確認してください')
    if (!current() || processingInvalidated) return
    sendHealth()
    if (!current() || processingInvalidated) return
    updateReady()
  } catch {
    if (generation !== micGeneration || finished) return
    releaseMedia()
    if (microphoneShutdownFailed || audioShutdownFailed) return
    interrupt('マイクを利用できません。ブラウザの許可を確認してください。')
    sendHealth()
    text('mic-status', 'マイクを利用できません')
  }
}
input('threshold').oninput = () => {
  checkLocalMic()
  text('threshold-value', Number(input('threshold').value).toFixed(2))
  previewThreshold = Number(input('threshold').value)
  previewGate.reset()
  previewMeter = new ScreamMeter(previewThreshold)
  sendHealth()
}
button('sound-preview').onclick = () => {
  if (!worldInitialized || finished) return
  checkDrawing()
  checkLocalMic()
  if (!canPreviewSound() || sound?.isPreviewing) return
  let previewed = false
  if (
    !useSound((output) => {
      previewed = output.previewBell()
    })
  )
    return
  text(
    'sound-preview-status',
    previewed
      ? '鈴を一度だけ鳴らします。自動では繰り返しません。'
      : '鈴を鳴らせません。マイクと音声の状態を確認してください。'
  )
  updateReady()
}
for (const id of ['volume', 'play-volume']) {
  input(id).oninput = () => {
    const value = input(id).value
    for (const target of ['volume', 'play-volume']) {
      input(target).value = value
      text(target + '-value', String(Math.round(Number(value) * 100)) + '%')
    }
    if (!useSound((output) => output.setVolume(Number(value)))) return
    if (Number(value) === 0) footsteps.reset()
    updateReady()
  }
}
for (const id of ['mute', 'play-mute']) {
  input(id).onchange = () => {
    const muted = input(id).checked
    input('mute').checked = muted
    input('play-mute').checked = muted
    if (!useSound((output) => output.setMuted(muted))) return
    footsteps.reset()
    updateReady()
  }
}
button('pause').onclick = requestPause
button('ready').onclick = () => {
  if (!worldInitialized || finished || (voluntaryPaused && (interrupting || applyingPause))) return
  updateReady()
  if (button('ready').disabled || pendingStop || releasingMedia || stoppingTracks) return
  localReady = true
  if (!useSound((output) => output.stopPreview())) return
  input('threshold').disabled = true
  sendHealth()
  send({ type: 'ready', value: true, epoch: readinessEpoch, threshold: Number(input('threshold').value) })
  maybeStart()
  updateUI()
}
button('reset').onclick = () => {
  if (worldInitialized || !finished) cleanup()
  if (!microphoneShutdownFailed && !audioShutdownFailed) location.reload()
}
window.addEventListener('pagehide', cleanup, { once: true, signal: listeners.signal })
window.addEventListener('resize', () => world?.resize(), { signal: listeners.signal })
window.addEventListener(
  'keydown',
  (event) => {
    if (
      event.code === 'KeyP' &&
      !event.repeat &&
      !event.ctrlKey &&
      !event.altKey &&
      !event.metaKey &&
      !event.shiftKey &&
      !event.isComposing
    ) {
      if (requestPause()) event.preventDefault()
      return
    }
    if (
      event.target instanceof HTMLInputElement ||
      event.target instanceof HTMLTextAreaElement ||
      event.target instanceof HTMLButtonElement ||
      event.target instanceof HTMLSelectElement ||
      (event.target instanceof HTMLElement && event.target.isContentEditable)
    )
      return
    if (!checkDrawing()) return
    if (finished || interrupting || voluntaryPaused) return
    const localHealthy = checkLocalMic(),
      remoteHealthy = checkRemoteHealth()
    if ((!localHealthy || !remoteHealthy) && !['ArrowUp', 'ArrowDown'].includes(event.code)) return
    keys.add(event.code)
    if (['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight'].includes(event.code)) event.preventDefault()
    if (
      event.code === 'KeyE' &&
      !event.repeat &&
      player &&
      !pendingStop &&
      ritual &&
      snapshot.survivor === player &&
      !snapshot.paused
    ) {
      const step = RITUAL_STEPS[ritual.completed]
      if (step) {
        if (player === 'host') {
          const previousRitual = ritual,
            previousSnapshot = match.getSnapshot(),
            previousEpoch = readinessEpoch
          const next = requestRitual(ritual, previousSnapshot, player, human, ritual.round, step.id)
          if (next) {
            ritual = next
            broadcast()
            playRitualBell(previousRitual, previousSnapshot, previousEpoch)
          }
        } else send({ type: 'ritual', round: ritual.round, step: step.id, epoch: readinessEpoch })
      }
    }
    if (
      !event.repeat &&
      ['Digit1', 'Digit2', 'Digit3'].includes(event.code) &&
      player &&
      !pendingStop &&
      !snapshot.paused &&
      (snapshot.phase === 'round1' || snapshot.phase === 'round2') &&
      snapshot.survivor !== player
    ) {
      const kind = event.code === 'Digit1' ? 'apparition' : event.code === 'Digit2' ? 'blackout' : 'rattle'
      if (player === 'host') triggerEffect(kind, player, snapshot.phase)
      else
        send({ type: 'effect', kind, round: snapshot.phase, requestId: ++effectRequestSequence, epoch: readinessEpoch })
    }
  },
  { signal: listeners.signal }
)
window.addEventListener('keyup', (event) => keys.delete(event.code), { signal: listeners.signal })
window.addEventListener('blur', () => keys.clear(), { signal: listeners.signal })
window.addEventListener('focusin', () => keys.clear(), { signal: listeners.signal })
container.onclick = () => {
  if (!checkDrawing() || finished || interrupting || voluntaryPaused) return
  void container.requestPointerLock?.()
}
document.addEventListener(
  'mousemove',
  (event) => {
    if (!checkDrawing()) return
    if (soundFailed || finished || interrupting || voluntaryPaused) return
    if (document.pointerLockElement === container) {
      if (Number.isFinite(event.movementX)) turn += event.movementX * 0.002
      if (Number.isFinite(event.movementY)) {
        const role = snapshot.survivor === player ? 'human' : 'haunter'
        pitch = clampPitch(pitch - event.movementY * 0.002, role)
      }
    }
  },
  { signal: listeners.signal }
)
try {
  const nextWorld = new HorrorWorld(container, () => {
    checkDrawing()
  })
  if (finished) nextWorld.dispose()
  else {
    world = nextWorld
    worldInitialized = true
  }
} catch (error) {
  finished = true
  try {
    cleanupMedia([
      cleanup,
      () => fullscreenListeners.abort(),
      () => worldResizeObserver.disconnect(),
      ...['host', 'guest', 'microphone', 'ready', 'sound-preview'].map((id) => () => {
        button(id).disabled = true
      }),
      () => text('notice', '描画の初期化に失敗しました。終了して再読み込みしてください。')
    ])
  } catch {}
  throw error
}
function scheduleFrame() {
  if (!worldInitialized || finished) return
  try {
    animation = requestAnimationFrame(frame)
  } catch (error) {
    frameSchedulingFailed = true
    try {
      soundFailure()
    } catch {}
    throw error
  }
}
function frame() {
  if (finished) return
  let failure: { error: unknown } | undefined
  try {
    const frameResult = updateFrame()
    if (frameResult && typeof frameResult === 'object') failure = frameResult
    if (frameResult === true && frameFailed && !finished && !frameSchedulingFailed) {
      frameFailed = false
      updateReady(false)
    }
  } catch (error) {
    frameFailed = true
    failure = { error }
    if (!finished) {
      try {
        soundFailure()
      } catch {}
    }
  }
  if (!finished) {
    try {
      scheduleFrame()
    } catch (error) {
      failure ??= { error }
    }
  }
  if (failure) throw failure.error
}
function updateFrame() {
  const drawingHealthy = checkDrawing()
  checkLocalMic()
  const now = performance.now()
  const frameStart = Math.max(previous, startedAt)
  const elapsed = (now - frameStart) / 1000
  const delta = Math.min(elapsed, 3)
  previous = now
  const role = snapshot.survivor === player ? 'human' : 'haunter'
  if (drawingHealthy && !soundFailed && !finished && !interrupting && !voluntaryPaused)
    pitch = clampPitch(
      pitch + (Number(keys.has('ArrowUp')) - Number(keys.has('ArrowDown'))) * Math.min(delta, 0.1) * 2,
      role
    )
  if (elapsed > 0.5 && (snapshot.phase === 'round1' || snapshot.phase === 'round2') && !snapshot.paused) {
    interrupt('画面が停止したため中断しました。両者で再開してください。')
    sendHealth(false)
  }
  checkRemoteHealth()
  if (analyser && samples && micHealthy()) {
    try {
      analyser.getFloatTimeDomainData(samples)
      const active = (snapshot.phase === 'round1' || snapshot.phase === 'round2') && !snapshot.paused && elapsed <= 0.5
      if (!active) voiceGate.reset()
      const analysis = analyzeVoiceFrame(samples, audio!.sampleRate, Math.min(delta, 0.5))
      if (!analysis) throw new Error('Microphone analysis unavailable')
      const assessment = voiceGate.applyAnalysis(analysis)
      localRms = assessment.rms
      localVoiced = active && assessment.voiced
      if (!active && elapsed <= 0.5 && !finished) {
        const preview = previewGate.applyAnalysis(analysis)
        const penalty = previewMeter.sample(preview.voiced ? preview.rms : 0, Math.min(delta, 0.5))
        text('preview-status', previewStatus(preview, previewThreshold, penalty))
      } else {
        resetPreview()
        text('preview-status', '試合中はプレビューを停止しています')
      }
    } catch {
      try {
        soundFailure()
      } catch (error) {
        return { error }
      }
    }
  } else {
    voiceGate.reset()
    resetPreview()
    text('preview-status', 'マイクを接続してください')
    localRms = 0
    localVoiced = false
  }
  el<HTMLMeterElement>('level').value = localRms
  const guestPlaying =
    drawingHealthy &&
    player === 'guest' &&
    connected &&
    micHealthy() &&
    remoteMic &&
    !pendingStop &&
    !snapshot.paused &&
    (snapshot.phase === 'round1' || snapshot.phase === 'round2')
  if (player === 'guest') {
    if (guestPlaying)
      turn += (Number(keys.has('ArrowRight')) - Number(keys.has('ArrowLeft'))) * Math.min(delta, 0.1) * 2
    else turn = 0
  }
  if (connected && now - lastSend >= 100) {
    if (pendingStop) send({ type: 'stop', ...pendingStop })
    sendHealth()
    if (drawingHealthy && localReady && !pendingStop && micHealthy() && remoteMic)
      send({ type: 'ready', value: true, epoch: readinessEpoch, threshold: Number(input('threshold').value) })
    if (guestPlaying) {
      turnTotal += Math.max(-1, Math.min(1, turn))
      turn = 0
      send({
        type: 'input',
        sequence: ++inputSequence,
        epoch: readinessEpoch,
        round: snapshot.phase,
        challenge: lastHostChallenge,
        forward: Number(keys.has('KeyW')) - Number(keys.has('KeyS')),
        strafe: Number(keys.has('KeyD')) - Number(keys.has('KeyA')),
        turnTotal
      })
    }
    lastSend = now
  }
  if (player === 'host') {
    if (
      (!drawingHealthy || !micHealthy() || !remoteMic || !connected) &&
      !match.getSnapshot().paused &&
      (match.getSnapshot().phase === 'round1' || match.getSnapshot().phase === 'round2')
    )
      interrupt('接続と両者のマイクを確認してください。')
    const before = match.getSnapshot()
    if ((before.phase === 'round1' || before.phase === 'round2') && !before.paused) {
      const activeDelta = Math.max(0, Math.min(delta, (now - startedAt) / 1000))
      if (remoteInputSent === undefined || now < remoteInputSent || now - remoteInputSent > 500) {
        remoteTurnTotal -= remoteInput.turn
        remoteInput = { forward: 0, strafe: 0, turn: 0 }
      }
      const hostInput = {
        forward: Number(keys.has('KeyW')) - Number(keys.has('KeyS')),
        strafe: Number(keys.has('KeyD')) - Number(keys.has('KeyA')),
        turn: (Number(keys.has('ArrowRight')) - Number(keys.has('ArrowLeft'))) * activeDelta * 2 + turn
      }
      turn = 0
      const humanInput = before.survivor === 'host' ? hostInput : remoteInput,
        haunterInput = before.survivor === 'host' ? remoteInput : hostInput
      human = movePose(
        { ...human, yaw: human.yaw + humanInput.turn },
        humanInput.forward,
        humanInput.strafe,
        Math.min(activeDelta, 0.1)
      )
      haunter = movePose(
        { ...haunter, yaw: haunter.yaw + haunterInput.turn },
        haunterInput.forward,
        haunterInput.strafe,
        Math.min(activeDelta, 0.1)
      )
      remoteInput.turn = 0
      const voiced = before.survivor === 'host' ? localVoiced : remoteVoiced
      const rms = before.survivor === 'host' ? localRms : remoteRms
      match.observe(meter, voiced ? rms : 0, Math.max(frameStart, startedAt), now)
      if (match.getSnapshot().phase !== before.phase) {
        effect = null
        playback = { ...playback, effect: null }
        resetReadiness()
        if (match.getSnapshot().phase === 'finished') {
          broadcast()
          finish()
        }
      }
    }
    playFootstep(match.getSnapshot(), now)
    if (now - lastUi >= 100) broadcast()
  }
  if (now - lastUi >= 100) {
    updateUI()
    lastUi = now
  }
  if (finished) return
  const worldFrame: WorldFrame = {
    role,
    pitch,
    human,
    haunter,
    effect: playback.effect,
    ritual: ritual ? { completed: ritual.completed, elapsedMs: snapshot.elapsedMs } : null,
    time: now / 1000
  }
  try {
    renderWorld(worldFrame)
  } catch {
    interruptDrawing()
    return
  }
  return checkDrawing(true)
}
function renderWorld(worldFrame: WorldFrame) {
  const heading = cameraHeading(worldFrame)
  if (el('heading').textContent !== heading) text('heading', heading)
  world?.render(worldFrame)
}
scheduleFrame()
