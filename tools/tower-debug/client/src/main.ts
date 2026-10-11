import './styles.css'
import type {
  AssetRef,
  Catalog,
  Clip,
  Direction,
  Motion,
  RepresentationKind,
  Revision,
  ViewerContext
} from './contracts'
import { json } from './api'
import { Transport } from './Transport'
import { SheetView } from './SheetView'
import { DebugAudio } from './DebugAudio'
import { TicketPanel } from './TicketPanel'
import { AudioPanel } from './AudioPanel'
import { TicketList } from './TicketList'
import type { Actual3DView } from './Actual3DView'

const element = <T extends HTMLElement>(id: string) => document.getElementById(id)! as T
const select = (id: string) => element<HTMLSelectElement>(id)
const status = (message: string) => {
  element('load-status').textContent = message
}
const transport = new Transport()
const audio = new DebugAudio((message) => {
  element('audio-status').textContent = message
})
const bgm = new DebugAudio((message) => {
  element('audio-status').textContent = message
})
let audioPanel: AudioPanel | null = null
let catalog: Catalog,
  revision: Revision,
  kind: RepresentationKind = 'baked3DSheet'
let clip: Clip | null = null,
  sheet: SheetView | null = null,
  model: Actual3DView | null = null
let selectedAudioFormat: 'wav' | 'raw_wav' = 'wav'
let audioSelectionTouched = false
let revisionGeneration = 0
let syncGeneration = 0
let controller: AbortController | null = null,
  generation = 0,
  selectedAudio = 0,
  synced = false,
  frameRequest = 0,
  disposed = false
const motion = () => select('motion').value as Motion
const direction = () => select('direction').value as Direction
const interpolation = () => select('interpolation').value as 'continuous' | 'source-clock'
const pause = () => {
  transport.pause()
  audio.stop()
  bgm.stop()
  updateTransport()
}
const formatMs = (value: number) => Number(value.toFixed(3)).toString()
function updateTransport(): void {
  const ready = !!clip
  for (const id of ['play', 'previous', 'next', 'timeline', 'speed'])
    (element(id) as HTMLButtonElement).disabled = !ready
  element('play').textContent = transport.paused ? '▶' : 'Ⅱ'
  element('play').setAttribute('aria-label', transport.paused ? '再生' : '一時停止')
  element<HTMLInputElement>('timeline').value = String(transport.timeMs)
  element('clock').textContent = clip
    ? `${formatMs(transport.timeMs)} / ${clip.durationMs} ms · ${transport.timeMs === clip.durationMs ? 'End' : `${transport.frameIndex() + 1}/${clip.frameStartTimesMs.length}`}`
    : '再生素材なし'
}
async function loadRepresentation(loadActual = false): Promise<void> {
  const token = ++generation
  pause()
  audio.cancelSelection()
  synced = false
  syncGeneration++
  element<HTMLInputElement>('sync-audio').checked = false
  controller?.abort()
  controller = new AbortController()
  const signal = controller.signal
  sheet?.dispose()
  model?.dispose()
  sheet = null
  model = null
  clip = null
  transport.configure(null)
  updateTransport()
  const stage = element('stage')
  stage.replaceChildren()
  for (const button of document.querySelectorAll<HTMLButtonElement>('[data-kind]')) {
    const active = button.dataset.kind === kind
    button.setAttribute('aria-selected', String(active))
    button.tabIndex = active ? 0 : -1
  }
  const attackOption = select('motion').querySelector<HTMLOptionElement>('[value=attack]')!
  attackOption.textContent = revision.role === 'healer' ? '詠唱・回復素材 (元attack)' : 'Attack'
  element('role-note').textContent =
    revision.role === 'healer'
      ? 'Healer: 固定素材のattackキーは詠唱です。後続ゲームv12の回復専用profileとは別に表示しています。専用heal・実3D・3Ddeathは未登録。'
      : revision.role === 'paladin'
        ? 'Paladin: Attackは剣攻撃です。専用heal・実3D・3Ddeathは未登録。'
        : '固定素材revisionの時計を表示します。最新ゲームのprofileや見た目の受入状況とは独立しています。未登録の動作は作成・代用しません。'
  element('representation-label').textContent = `${kind} · ${revision.revision}`
  element('zoom-label').hidden = kind === 'actual3D'
  element('sheet-label').hidden = kind === 'actual3D' || kind === 'source2DImage'
  select('motion').disabled = kind === 'source2DImage'
  select('direction').disabled = kind === 'source2DImage'
  element('clock-detail').textContent = ''
  status('')
  const representation = revision.representations.find((item) => item.kind === kind)
  if (!representation || representation.state !== 'ready') {
    const message = document.createElement('p')
    message.textContent = `○ ${representation?.state ?? 'not-mapped'}\n${representation?.reason ?? 'このrevisionには対応素材がありません'}`
    message.className = 'preserve'
    stage.append(message)
    updateTransport()
    return
  }
  try {
    const selected =
      representation.clips?.find((item) => item.motion === motion() && item.direction === direction()) ?? null
    if (kind !== 'source2DImage' && !selected) throw new Error('この方向・動作の対応付けがありません')
    if (kind === 'actual3D' && representation.model && !loadActual) {
      const button = document.createElement('button')
      button.textContent = `実3D bundleを読み込む (${(representation.model.file.bytes / 1048576).toFixed(1)} MiB)`
      button.onclick = () => void loadRepresentation(true)
      stage.append(button)
      status('別revisionの実メッシュです。必須blink material adapterを含めて読み込みます。')
      updateTransport()
      return
    }
    const canvas = document.createElement('canvas')
    stage.append(canvas)
    if (kind === 'actual3D') {
      if (!representation.model) throw new Error('実3Dの正式bundle manifestがありません')
      canvas.className = 'actual3d'
      status(`実3Dを読み込み中 (${(representation.model.file.bytes / 1048576).toFixed(1)} MiB)…`)
      const { Actual3DView } = await import('./Actual3DView')
      if (signal.aborted) return
      const view = new Actual3DView(canvas)
      try {
        await view.load(representation.model, signal)
      } catch (error) {
        view.dispose()
        throw error
      }
      if (signal.aborted) {
        view.dispose()
        return
      }
      model = view
      model.setMotion(motion())
      model.setDirection(direction())
    } else {
      const reference = representation.image ?? selected?.texture
      if (!reference) throw new Error('画像の固定参照がありません')
      status(`画像を読み込み中 (${(reference.bytes / 1024).toFixed(0)} KiB)…`)
      const view = new SheetView(canvas)
      try {
        await view.load(reference, selected, signal)
      } catch (error) {
        view.dispose()
        throw error
      }
      if (signal.aborted) {
        view.dispose()
        return
      }
      sheet = view
      sheet.setZoom(Number(select('zoom').value))
      sheet.setFullSheet(element<HTMLInputElement>('whole-sheet').checked)
    }
    if (token !== generation) return
    clip = selected
    transport.configure(clip)
    if (clip) {
      element<HTMLInputElement>('timeline').max = String(clip.durationMs)
      element('clock-detail').textContent =
        clip.motion === 'walk'
          ? `素材時計: ${clip.durationMs} ms / cycle。実ゲーム: ${clip.gameCycleTravel ?? '未評価'} world units / cycle (${clip.gameClockRule})。描画用stride ${clip.authoredStride?.toFixed(3) ?? 'なし'}。時間比をゲーム速度比として扱いません。`
          : `素材時計: ${clip.durationMs} ms。${clip.events.map((event) => `${event.type} ${event.atMs} ms`).join(' / ') || 'イベントなし'}。ゲームのcooldownは変更しません。`
    }
    status(
      kind === 'actual3D'
        ? '実メッシュ表示・material adapter必須。視覚受入は別途確認。'
        : '元データの時計で表示しています'
    )
    updateTransport()
  } catch (error) {
    if (token === generation && !signal.aborted) {
      status(`読み込みエラー: ${String(error)}`)
      const button = document.createElement('button')
      button.textContent = 'この素材を再読み込み'
      button.onclick = () => void loadRepresentation()
      stage.replaceChildren(button)
    }
  }
}
function context(): ViewerContext {
  return {
    role: revision.role,
    roleRevision: revision.revision,
    representation: kind,
    motion: kind === 'source2DImage' ? null : motion(),
    direction: kind === 'source2DImage' ? null : direction(),
    timeMs: clip ? transport.timeMs : null,
    sourceFrameIndex: clip ? transport.frameIndex() : null,
    interpolationMode: interpolation(),
    clipManifest: clip?.manifest ?? null,
    selectedAudio:
      audioSelectionTouched && catalog.audio[selectedAudio]
        ? {
            batchId: catalog.audio[selectedAudio].batchId,
            candidateId: catalog.audio[selectedAudio].candidateId,
            assetRevision: catalog.audio[selectedAudio].files[selectedAudioFormat].revision,
            format: selectedAudioFormat,
            asset: catalog.audio[selectedAudio].files[selectedAudioFormat]
          }
        : null
  }
}
function attachments(): AssetRef[] {
  const representation = revision.representations.find((item) => item.kind === kind)
  const refs = clip
    ? [clip.manifest, ...(clip.texture ? [clip.texture] : [])]
    : representation?.image
      ? [representation.image]
      : []
  if (kind === 'actual3D' && representation?.model) refs.push(representation.model.file, representation.model.adapter)
  if (audioSelectionTouched && catalog.audio[selectedAudio])
    refs.push(catalog.audio[selectedAudio].files[selectedAudioFormat])
  return refs
}
async function start(): Promise<void> {
  const session = await json<{ csrf: string }>('/api/v1/session')
  catalog = await json<Catalog>('/api/v1/catalog')
  if (catalog.syntheticTestStore) element('store-mode').textContent = 'SYNTHETIC TEST / 実依頼ではありません'
  const roles = catalog.roles ?? [
    {
      role: 'wolf',
      displayName: catalog.displayName,
      revisions: catalog.revisions,
      actual3DState: catalog.actual3DState
    }
  ]
  for (const role of roles) select('role').add(new Option(role.displayName, role.role))
  select('role').value = roles.some((role) => role.role === 'wolf') ? 'wolf' : roles[0].role
  const revisions = () => {
    const role = roles.find((role) => role.role === select('role').value)!
    select('revision').replaceChildren(...role.revisions.map((item) => new Option(item.label, item.revision)))
    element('role-title').textContent = role.displayName
  }
  revisions()
  revision = await json<Revision>(`/api/v1/roles/${select('role').value}/revisions/${select('revision').value}`)
  selectedAudio = Math.max(
    0,
    catalog.audio.findIndex((candidate) => candidate.eventId === 'wolf_attack')
  )
  audioPanel = new AudioPanel(
    catalog,
    session.csrf,
    audio,
    bgm,
    (candidate, format) => {
      element<HTMLButtonElement>('audio-ticket-open').disabled = !candidate
      if (!candidate) {
        selectedAudio = -1
        audioSelectionTouched = false
        synced = false
        syncGeneration++
        element<HTMLInputElement>('sync-audio').checked = false
        return
      }
      selectedAudio = catalog.audio.indexOf(candidate)
      selectedAudioFormat = format
      audioSelectionTouched = true
      synced = false
      syncGeneration++
      element<HTMLInputElement>('sync-audio').checked = false
    },
    pause
  )
  const tickets = new TicketPanel(
    element<HTMLDialogElement>('ticket-dialog'),
    session.csrf,
    catalog.syntheticTestStore ? 'tower-debug-synthetic:ticket-draft:v1' : undefined
  )
  element('ticket-open').onclick = () => {
    pause()
    const target = context()
    tickets.open(target, attachments(), {
      kind: 'unit',
      role: target.role,
      roleRevision: target.roleRevision,
      representation: target.representation
    })
  }
  const ticketList = new TicketList(element<HTMLDialogElement>('ticket-list-dialog'))
  element('tickets-open').onclick = () => {
    pause()
    ticketList.open()
  }
  element('audio-ticket-open').onclick = () => {
    if (!audioSelectionTouched || !catalog.audio[selectedAudio]) {
      element('audio-review-status').textContent = '音声の比較対象を選んでください'
      return
    }
    pause()
    const candidate = catalog.audio[selectedAudio]
    element<HTMLDialogElement>('audio-dialog').close()
    tickets.open(context(), [candidate.files[selectedAudioFormat]], {
      kind: 'audio',
      batchId: candidate.batchId,
      candidateId: candidate.candidateId,
      eventId: candidate.eventId,
      category: candidate.category ?? 'combat',
      unit: candidate.unit ?? null,
      field: candidate.field ?? null,
      asset: candidate.files[selectedAudioFormat]
    })
  }
  element('audio-open').onclick = () => {
    pause()
    audioPanel?.open()
  }
  for (const button of document.querySelectorAll<HTMLButtonElement>('[data-close]'))
    button.onclick = () => element<HTMLDialogElement>(button.dataset.close!).close()
  element<HTMLDialogElement>('audio-dialog').addEventListener('close', () => audio.stop())
  for (const button of document.querySelectorAll<HTMLButtonElement>('[data-kind]'))
    button.onclick = () => {
      kind = button.dataset.kind as RepresentationKind
      void loadRepresentation()
    }
  element('representations').addEventListener('keydown', (event) => {
    if (!['ArrowLeft', 'ArrowRight'].includes(event.key)) return
    const buttons = [...document.querySelectorAll<HTMLButtonElement>('[data-kind]')],
      index = buttons.indexOf(document.activeElement as HTMLButtonElement)
    const next = buttons[(index + (event.key === 'ArrowRight' ? 1 : -1) + buttons.length) % buttons.length]
    next.focus()
    next.click()
    event.preventDefault()
  })
  const switchRevision = async () => {
    const token = ++revisionGeneration
    element<HTMLButtonElement>('ticket-open').disabled = true
    generation++
    pause()
    audioPanel?.stop()
    controller?.abort()
    model?.dispose()
    model = null
    sheet?.dispose()
    sheet = null
    clip = null
    transport.configure(null)
    updateTransport()
    element('stage').textContent = '固定revisionを読み込んでいます…'
    try {
      const next = await json<Revision>(`/api/v1/roles/${select('role').value}/revisions/${select('revision').value}`)
      if (token !== revisionGeneration) return
      revision = next
      await loadRepresentation()
    } catch (error) {
      if (token === revisionGeneration) status(String(error))
    } finally {
      if (token === revisionGeneration) element<HTMLButtonElement>('ticket-open').disabled = false
    }
  }
  select('role').onchange = () => {
    revisions()
    void switchRevision()
  }
  select('revision').onchange = () => void switchRevision()
  for (const id of ['motion', 'direction'])
    select(id).onchange = () => {
      pause()
      audio.cancelSelection()
      synced = false
      syncGeneration++
      element<HTMLInputElement>('sync-audio').checked = false
      if (kind === 'actual3D' && model) {
        const selected = revision.representations
          .find((item) => item.kind === kind)
          ?.clips?.find((item) => item.motion === motion() && item.direction === direction())
        if (!selected) {
          void loadRepresentation()
          return
        }
        clip = selected
        if (id === 'motion') {
          transport.configure(clip)
          model.setMotion(motion())
          element<HTMLInputElement>('timeline').max = String(clip.durationMs)
        }
        model.setDirection(direction())
        element('clock-detail').textContent =
          `実3D: ${clip.durationMs} ms · game cycleTravel ${clip.gameCycleTravel ?? '未評価'} · game travel非bake`
        updateTransport()
      } else void loadRepresentation()
    }
  select('interpolation').onchange = () => {
    pause()
    transport.seek(transport.timeMs)
  }
  select('zoom').onchange = () => sheet?.setZoom(Number(select('zoom').value))
  element<HTMLInputElement>('whole-sheet').onchange = () =>
    sheet?.setFullSheet(element<HTMLInputElement>('whole-sheet').checked)
  element('play').onclick = async () => {
    if (!transport.paused) {
      pause()
      return
    }
    if (synced) await audio.unlockFromGesture()
    transport.play(performance.now())
    updateTransport()
  }
  element('previous').onclick = () => {
    audio.stop()
    bgm.stop()
    transport.step(-1)
    updateTransport()
  }
  element('next').onclick = () => {
    audio.stop()
    bgm.stop()
    transport.step(1)
    updateTransport()
  }
  element<HTMLInputElement>('timeline').oninput = () => {
    audio.stop()
    bgm.stop()
    transport.seek(Number(element<HTMLInputElement>('timeline').value))
    updateTransport()
  }
  element('timeline').addEventListener('keydown', (event) => {
    if (event.key === 'ArrowLeft' || event.key === 'ArrowRight') {
      event.preventDefault()
      audio.stop()
      bgm.stop()
      transport.step(event.key === 'ArrowLeft' ? -1 : 1)
      updateTransport()
    }
  })
  select('speed').onchange = () => {
    audio.stop()
    transport.setSpeed(Number(select('speed').value))
  }
  element('audio-stop').onclick = () => {
    synced = false
    syncGeneration++
    element<HTMLInputElement>('sync-audio').checked = false
    audioPanel?.stop()
  }
  element<HTMLInputElement>('sync-audio').onchange = async () => {
    synced = false
    syncGeneration++
    audio.stop()
    const syncToken = syncGeneration
    if (!element<HTMLInputElement>('sync-audio').checked) return
    if (
      !clip?.events.length ||
      catalog.audio[selectedAudio]?.eventId !== `${revision.role}_attack` ||
      catalog.audio[selectedAudio]?.category === 'bgm'
    ) {
      element('audio-status').textContent = '現在のユニットの攻撃候補と、イベントのある動作を選んでください'
      element<HTMLInputElement>('sync-audio').checked = false
      return
    }
    try {
      selectedAudioFormat = 'wav'
      audioSelectionTouched = true
      element<HTMLButtonElement>('audio-ticket-open').disabled = false
      await audio.unlockFromGesture()
      if (syncToken !== syncGeneration || !element<HTMLInputElement>('sync-audio').checked) return
      const ready = await audio.prepare(catalog.audio[selectedAudio].files.wav)
      if (syncToken !== syncGeneration) return
      synced = ready && element<HTMLInputElement>('sync-audio').checked
      element<HTMLInputElement>('sync-audio').checked = synced
    } catch (error) {
      element('audio-status').textContent = String(error)
      element<HTMLInputElement>('sync-audio').checked = false
    }
  }
  element<HTMLInputElement>('volume').oninput = () => {
    audio.setVolume(Number(element<HTMLInputElement>('volume').value))
    try {
      localStorage.setItem('tower-debug-pilot:audio:v1', JSON.stringify({ volume: audio.volume, muted: audio.muted }))
    } catch {}
  }
  element<HTMLInputElement>('mute').onchange = () => audio.setMuted(element<HTMLInputElement>('mute').checked)
  try {
    const preferences = JSON.parse(localStorage.getItem('tower-debug-pilot:audio:v1') ?? 'null')
    if (preferences) {
      audio.setVolume(preferences.volume)
      audio.setMuted(!!preferences.muted)
      element<HTMLInputElement>('volume').value = String(audio.volume)
      element<HTMLInputElement>('mute').checked = audio.muted
    }
  } catch {}
  document.addEventListener('visibilitychange', () => {
    if (document.hidden) {
      pause()
      audio.cancelSelection()
      bgm.cancelSelection()
    }
  })
  document.addEventListener('keydown', (event) => {
    if (
      event.code === 'Space' &&
      !['INPUT', 'TEXTAREA', 'SELECT', 'BUTTON'].includes((event.target as HTMLElement).tagName) &&
      !document.querySelector('dialog[open]')
    ) {
      event.preventDefault()
      element<HTMLButtonElement>('play').click()
    }
  })
  const initialLoad = document.createElement('button')
  initialLoad.textContent = '3D焼き込みシートを表示'
  initialLoad.onclick = () => void loadRepresentation()
  element('stage').replaceChildren(initialLoad)
  status('素材は表示形式の選択後に読み込みます')
  updateTransport()
  const tick = (now: number) => {
    if (disposed) return
    const events = transport.advance(now)
    if (synced && events.some((event) => event.type === 'hit' || event.type === 'release'))
      audio.playReady(catalog.audio[selectedAudio].files.wav)
    sheet?.render(transport.timeMs)
    model?.render(transport.sampleTime(interpolation()))
    updateTransport()
    frameRequest = requestAnimationFrame(tick)
  }
  for (const id of ['audio-open', 'ticket-open', 'tickets-open']) element<HTMLButtonElement>(id).disabled = false
  frameRequest = requestAnimationFrame(tick)
}
window.addEventListener('pagehide', () => {
  disposed = true
  cancelAnimationFrame(frameRequest)
  controller?.abort()
  sheet?.dispose()
  model?.dispose()
  void audio.dispose()
  void bgm.dispose()
})
window.addEventListener('pageshow', (event) => {
  if (event.persisted) location.reload()
})
void start().catch((error) => status(`起動できません: ${String(error)}`))
