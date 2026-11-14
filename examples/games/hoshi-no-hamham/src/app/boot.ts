/**
 * Boot: the page already shows the splash from index.html (night sky, the hero's portrait, a progress bar).
 * After that first paint this loads the code (importing an art module draws nothing), starts the art workers, warms
 * the title's art through them (adopting and baking one piece per slice, moving the bar between slices), builds the
 * App, and fades the splash out once the title's first frame has been drawn.
 */
import type { App } from './app'

/** Shares of the bar: loading the code, warming the title's clips, then building the app. */
const LOAD_SHARE = 0.1
const ART_SHARE = 0.85
const FADE_MS = 400

const reducedMotion = () => typeof matchMedia === 'function' && matchMedia('(prefers-reduced-motion: reduce)').matches

/** The splash's bar: a compositor-only `scaleX` plus the progressbar value for assistive technology. */
export function splashBar(root: ParentNode = document) {
  const bar = root.querySelector<HTMLElement>('#splash-bar')
  const fill = root.querySelector<HTMLElement>('#splash-fill')
  return (fraction: number) => {
    const value = Math.max(0, Math.min(1, fraction))
    if (fill) fill.style.transform = `scaleX(${value})`
    bar?.setAttribute('aria-valuenow', String(Math.round(value * 100)))
  }
}

/** Fades the splash out (instantly under reduced motion) and removes it. */
export function leaveSplash(splash: HTMLElement | null, reduced = reducedMotion()): Promise<void> {
  if (!splash) return Promise.resolve()
  if (reduced) {
    splash.remove()
    return Promise.resolve()
  }
  return new Promise((resolve) => {
    const finish = () => {
      splash.remove()
      resolve()
    }
    splash.classList.add('is-leaving')
    splash.addEventListener('transitionend', finish, { once: true })
    setTimeout(finish, FADE_MS + 200)
  })
}

const nextFrame = () => new Promise<void>((resolve) => requestAnimationFrame(() => resolve()))

const yieldToBrowser = () => new Promise<void>((resolve) => setTimeout(resolve, 0))

export async function boot(canvas: HTMLCanvasElement): Promise<App> {
  const splash = document.getElementById('splash')
  const setProgress = splashBar()
  try {
    // Let the browser paint the splash before any real work starts.
    performance.mark?.('hamham:boot-start')
    await nextFrame()
    await yieldToBrowser()
    const {
      APP_SHEETS,
      clipSteps,
      mark,
      overlayTextSteps,
      runSteps,
      warmStage,
      yieldToBrowser: slice,
      SLICE_BUDGET_MS
    } = await import('./warm')
    const { artSource } = await import('../art/remote')
    const { stageByNo } = await import('../game/stages')
    const { App, appUrlSteps, DEMO_STAGES } = await import('./app')
    setProgress(LOAD_SHARE)
    await yieldToBrowser()
    // The workers paint from here on; the page adopts and bakes.
    const source = artSource()
    // The demo behind the title plays DEMO_STAGES[0] first: that stage's art is what the title needs. Meanwhile, one
    // size per slice, the overlay's fonts: the stage's own text slice then only finds them.
    const fonts = runSteps(overlayTextSteps(), undefined, slice, SLICE_BUDGET_MS)
    await warmStage(stageByNo(DEMO_STAGES[0]), (fraction) =>
      setProgress(LOAD_SHARE + fraction * (ART_SHARE - LOAD_SHARE))
    )
    await fonts
    // And what the App draws as soon as it is built, beyond the stage; then, one piece per slice, the images the App
    // shows (each a PNG encoded on the page), so that building it only looks them up.
    await runSteps(clipSteps(APP_SHEETS), undefined, slice, SLICE_BUDGET_MS, () => performance.now(), source)
    await runSteps(appUrlSteps(), undefined, slice, SLICE_BUDGET_MS)
    mark('hamham:app-start')
    const app = new App(canvas)
    mark('hamham:app-built')
    setProgress(0.95)
    // The title and its demo start in a task of their own.
    await yieldToBrowser()
    app.start()
    await app.firstFrame
    mark('hamham:first-frame')
    setProgress(1)
    // One more frame so the title is on screen before the splash starts to fade.
    await nextFrame()
    void leaveSplash(splash)
    return app
  } catch (error) {
    const text = splash?.querySelector('.splash-text')
    if (text) text.textContent = 'うまくよみこめなかったよ。ページをもういちど ひらいてね'
    throw error
  }
}
