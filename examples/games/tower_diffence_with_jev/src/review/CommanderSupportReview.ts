import { CONFIG } from '../game/model'
import {
  createSupportReview,
  SUPPORT_REVIEW_CONTRACT,
  type SupportReviewOptions,
  type SupportReviewScene
} from './CommanderSupportScene'
import { GameRenderer } from '../rendering/GameRenderer'
import { authoredRosterClips } from '../rendering/AuthoredRoster'
import { authoredEffectClips } from '../rendering/AuthoredEffects'
import { authoredDeathClips } from '../rendering/DeathArt'

const host = document.getElementById('field')!,
  base = new URL('../../../tower-defense-art/', document.baseURI)
let renderer: GameRenderer | undefined,
  review: SupportReviewScene | undefined,
  presentationMs = 10000
Object.defineProperty(performance, 'now', { configurable: true, value: () => presentationMs })
function current() {
  if (!renderer || !review) throw new Error('Prepare an offline support case first')
  return { renderer, review }
}
function draw() {
  const { renderer, review } = current()
  renderer.setCommanderMode(review.jevMode)
  renderer.render(review.engine.state)
}
async function ready() {
  const deadline = Date.now() + 20000
  for (;;) {
    draw()
    const { renderer, review } = current(),
      errors = { ...renderer.assetErrors, ...renderer.presentationAssetErrors },
      diagnostics = renderer.diagnostics()
    if (Object.keys(errors).length) throw new Error(JSON.stringify(errors))
    if (renderer.assetsReady(review.engine.state) && (!review.jevMode || diagnostics.commander?.clipsReady)) {
      draw()
      return
    }
    if (Date.now() >= deadline) throw new Error('Support review body/commander assets did not become ready')
    await new Promise((resolve) => setTimeout(resolve, 16))
  }
}
function snapshot() {
  const { renderer, review } = current(),
    canvas = host.querySelector('canvas')!,
    gl = canvas.getContext('webgl2')
  const value = {
    ...review.snapshot(),
    render: renderer.diagnostics(),
    assetsReady: renderer.assetsReady(review.engine.state),
    assetErrors: { ...renderer.assetErrors, ...renderer.presentationAssetErrors },
    canvas: { width: canvas.width, height: canvas.height, webgl: !!gl && !gl.isContextLost() },
    labels: Array.from(
      host.querySelectorAll<HTMLElement>('.commander-name,.commander-order,.commander-support-badge')
    ).map((element) => ({
      text: element.textContent,
      visible: !element.hidden && element.style.display !== 'none',
      zIndex: element.style.zIndex
    }))
  }
  document.getElementById('status')!.textContent = JSON.stringify(value)
  document.getElementById('frame-label')!.textContent =
    `${value.mode} · ${value.time.toFixed(2)}s · ${value.state?.status ?? 'legacy'}`
  return value
}
async function prepare(options: SupportReviewOptions = {}) {
  renderer?.dispose()
  host.replaceChildren()
  review = createSupportReview(options)
  presentationMs = 10000
  renderer = new GameRenderer(host, {
    clips: authoredRosterClips(base),
    effectClips: authoredEffectClips(base),
    deathClips: authoredDeathClips(base),
    commanderBase: base
  })
  renderer.setField('meadow', 2)
  await ready()
  return snapshot()
}
async function sample(elapsedMs: number) {
  const { review } = current(),
    goal = 9.5 + elapsedMs / 1000
  if (!Number.isFinite(elapsedMs) || goal < review.engine.state.time - 1e-8 || elapsedMs > 12000)
    throw new Error('Review samples must be monotonic within twelve seconds')
  while (review.engine.state.time + CONFIG.step <= goal + 1e-9) {
    await ready()
    await review.advance(CONFIG.step * 1000)
    presentationMs = 10000 + (review.engine.state.time - 9.5) * 1000
    draw()
  }
  await ready()
  return snapshot()
}
const api = {
  prepare,
  sample,
  snapshot() {
    draw()
    return snapshot()
  },
  killTarget() {
    current().review.killTarget()
    draw()
    return snapshot()
  },
  async mode(mode: 'jev' | 'rule') {
    current().review.mode(mode)
    await ready()
    return snapshot()
  },
  async resume() {
    current().review.resume()
    await ready()
    return snapshot()
  },
  async releaseDeferred() {
    current().review.releaseDeferred()
    await Promise.resolve()
    await Promise.resolve()
    await Promise.resolve()
    draw()
    return snapshot()
  }
}
Object.assign(window, { commanderSupportReview: api })
document.getElementById('prepare')!.onclick = () =>
  void prepare({
    effect: (document.getElementById('effect') as HTMLSelectElement).value as SupportReviewOptions['effect']
  })
document.getElementById('step')!.onclick = () => void sample((current().review.engine.state.time - 9.5) * 1000 + 100)
document.getElementById('fixture')!.textContent = SUPPORT_REVIEW_CONTRACT
document.getElementById('status')!.textContent = 'ready'
