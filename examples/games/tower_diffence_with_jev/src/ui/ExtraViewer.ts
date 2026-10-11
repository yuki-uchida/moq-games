import './extra-viewer.css'
import { SheetView } from '../../../../../tools/tower-debug/client/src/SheetView'
import { Transport } from '../../../../../tools/tower-debug/client/src/Transport'
import type { AssetRef, Clip } from '../../../../../tools/tower-debug/client/src/contracts'

const element = <T extends HTMLElement>(id: string) => document.getElementById(id)! as T
const select = (id: string) => element<HTMLSelectElement>(`viewer-${id}`)
const base = new URL('../../../', document.baseURI)
const status = element('viewer-status')
const canvas = element<HTMLCanvasElement>('viewer-canvas')
const transport = new Transport()
let controller: AbortController | undefined
let generation = 0
let frameRequest = 0
let disposed = false
interface ViewerClip extends Clip {
  role: string
}
let clips: ViewerClip[] = []

async function staticBytes(reference: AssetRef, signal?: AbortSignal): Promise<ArrayBuffer> {
  const url = new URL(reference.assetId, base)
  if (url.origin !== base.origin || !url.pathname.startsWith(new URL('tower-defense-viewer/sheets/', base).pathname))
    throw new Error('Invalid asset path')
  const response = await fetch(url, { signal, credentials: 'same-origin', redirect: 'error' })
  if (!response.ok) throw new Error(`Asset load failed (${response.status})`)
  const bytes = await response.arrayBuffer()
  if (bytes.byteLength !== reference.bytes) throw new Error('Asset size mismatch')
  const digest = [...new Uint8Array(await crypto.subtle.digest('SHA-256', bytes))]
    .map((value) => value.toString(16).padStart(2, '0'))
    .join('')
  if (digest !== reference.sha256) throw new Error('Asset digest mismatch')
  return bytes
}
const sheet = new SheetView(canvas, staticBytes)
function controls(ready: boolean) {
  for (const id of ['play', 'previous', 'next', 'timeline'])
    element<HTMLButtonElement>(`viewer-${id}`).disabled = !ready
}
function options(id: string, values: string[], preferred?: string) {
  const node = select(id),
    previous = preferred ?? node.value
  node.replaceChildren(...values.map((value) => new Option(value, value)))
  node.value = values.includes(previous) ? previous : (values[0] ?? '')
  node.disabled = values.length === 0
}
function updatePlayback() {
  element('viewer-play').textContent = transport.paused ? 'Play' : 'Pause'
  element<HTMLInputElement>('viewer-timeline').value = String(transport.timeMs)
  element('viewer-time').textContent = `${Math.round(transport.timeMs)} ms · ${transport.frameIndex() + 1}`
}
async function loadSelection() {
  const request = ++generation
  controller?.abort()
  controller = new AbortController()
  transport.configure(null)
  controls(false)
  canvas.hidden = true
  status.hidden = false
  const clip = clips.find(
    (clip) =>
      clip.role === select('role').value &&
      clip.motion === select('motion').value &&
      clip.direction === select('direction').value
  )
  if (!clip?.texture) {
    status.textContent = 'この組み合わせのスプライトシートはありません。'
    return
  }
  status.textContent = 'フレームを検証して読み込み中…'
  try {
    await sheet.load(clip.texture, clip, controller.signal)
    if (request !== generation || disposed) return
    transport.configure(clip)
    sheet.setZoom(Number(select('zoom').value))
    sheet.render(0)
    element<HTMLInputElement>('viewer-timeline').max = String(clip.durationMs)
    canvas.hidden = false
    status.hidden = true
    controls(true)
    updatePlayback()
  } catch (error) {
    if (request !== generation || disposed) return
    status.textContent = `スプライトシートを読み込めませんでした。${error instanceof Error ? error.message : ''}`
  }
}
function chooseMotion() {
  options(
    'direction',
    [
      ...new Set(
        clips
          .filter((clip) => clip.role === select('role').value && clip.motion === select('motion').value)
          .map((clip) => clip.direction)
      )
    ],
    's'
  )
  void loadSelection()
}
function chooseRole() {
  options(
    'motion',
    [...new Set(clips.filter((clip) => clip.role === select('role').value).map((clip) => clip.motion))],
    'walk'
  )
  chooseMotion()
}
select('role').onchange = chooseRole
select('motion').onchange = chooseMotion
select('direction').onchange = () => {
  void loadSelection()
}
select('zoom').onchange = () => sheet.setZoom(Number(select('zoom').value))
select('speed').onchange = () => transport.setSpeed(Number(select('speed').value))
element<HTMLInputElement>('viewer-sheet').onchange = (event) =>
  sheet.setFullSheet((event.target as HTMLInputElement).checked)
element('viewer-play').onclick = () => {
  if (transport.paused) transport.play(performance.now())
  else transport.pause()
  updatePlayback()
}
element('viewer-previous').onclick = () => {
  transport.step(-1)
  updatePlayback()
}
element('viewer-next').onclick = () => {
  transport.step(1)
  updatePlayback()
}
element<HTMLInputElement>('viewer-timeline').oninput = (event) => {
  transport.seek(Number((event.target as HTMLInputElement).value))
  updatePlayback()
}
function frame(now: number) {
  if (disposed) return
  transport.advance(now)
  if (transport.clock) {
    sheet.render(transport.timeMs)
    updatePlayback()
  }
  frameRequest = requestAnimationFrame(frame)
}
document.addEventListener('visibilitychange', () => {
  if (document.hidden) {
    transport.pause()
    updatePlayback()
  }
})
window.addEventListener('pagehide', () => {
  disposed = true
  controller?.abort()
  transport.pause()
  cancelAnimationFrame(frameRequest)
  sheet.dispose()
})
window.addEventListener('pageshow', (event) => {
  if (event.persisted) location.reload()
})
async function initialize() {
  try {
    const response = await fetch(new URL('tower-defense-viewer/catalog.json', base), {
      credentials: 'same-origin',
      redirect: 'error'
    })
    if (!response.ok) throw new Error(`Catalog load failed (${response.status})`)
    const catalog = (await response.json()) as { version: number; clips: ViewerClip[] }
    if (catalog.version !== 1 || !Array.isArray(catalog.clips)) throw new Error('Invalid catalog')
    clips = catalog.clips
    if (!clips.length) {
      status.textContent =
        'この配布版には3Dスプライトシートがまだ含まれていません。対象アセットが追加されると、この画面でキャラクター・動作・方向を選んで確認できます。'
      return
    }
    options('role', [...new Set(clips.map((clip) => clip.role))])
    chooseRole()
  } catch (error) {
    status.textContent = `ビューアーの一覧を読み込めませんでした。${error instanceof Error ? error.message : ''}`
  }
}
void initialize()
frameRequest = requestAnimationFrame(frame)
