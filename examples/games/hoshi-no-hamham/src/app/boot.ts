/**
 * Boot: the page already shows the splash from index.html (night sky, the hero's portrait, a progress bar).
 * After that first paint this loads the code (importing an art module draws nothing), warms the title's art one
 * animation clip per slice (moving the bar between slices), builds the App, and fades the splash out once the title's first frame has been drawn.
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
    const { runSteps, stageWarmSteps, mark } = await import('./warm')
    const { stageByNo } = await import('../game/stages')
    const { App, DEMO_STAGES } = await import('./app')
    setProgress(LOAD_SHARE)
    await yieldToBrowser()
    // The demo behind the title plays DEMO_STAGES[0] first: that stage's art is what the title needs.
    await runSteps(stageWarmSteps(stageByNo(DEMO_STAGES[0])), (fraction) =>
      setProgress(LOAD_SHARE + fraction * (ART_SHARE - LOAD_SHARE))
    )
    mark('hamham:app-start')
    const app = new App(canvas)
    mark('hamham:app-built')
    setProgress(0.95)
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
