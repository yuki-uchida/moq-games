/**
 * The backdrop director (implements `Backdrop`): the plaza behind every menu, and on the title the live
 * attract demo drawn over it when this device can afford one. The demo pauses on other screens, is released
 * when a match starts or after a while away from the title, and is rebuilt on the next visit.
 */
import type { ModelKit, Quality } from '../models/api'
import { createAttractDemo, type AttractDemo } from './attract'
import type { AttractLevel } from './attract-plan'
import { createPlaza } from './backdrop'
import type { Backdrop, BackdropMode } from './context'

/** Seconds away from the title before the demo's GPU memory is released. */
const RELEASE_AFTER = 45

export interface SceneryOptions {
  /** Decided once at boot (attractLevel). */
  level: () => AttractLevel
  quality: () => Quality
}

export function createScenery(kit: ModelKit, o: SceneryOptions): Backdrop {
  const el = document.createElement('div')
  el.className = 'af-scenery'
  const plaza = createPlaza(kit)
  el.append(plaza.canvas)
  let demo: AttractDemo | null = null
  let gaveUp = false
  let mode: BackdropMode = 'title'
  let releaseTimer = 0

  const plazaMode = () => {
    // while the demo is on screen the plaza stops drawing (hidden under it)
    plaza.setMode(mode === 'title' && demo?.live ? 'off' : mode)
  }

  const ensureDemo = () => {
    const level = o.level()
    if (demo || gaveUp || level === 'static') return
    try {
      demo = createAttractDemo(kit, {
        still: level === 'still',
        quality: o.quality(),
        onLive: () => {
          el.classList.add('has-attract')
          // the plaza stops drawing once the demo has faded in over it
          setTimeout(plazaMode, 900)
        },
        onGiveUp: (reason) => {
          console.info('[anima-front] attract demo off:', reason)
          gaveUp = true
          releaseDemo()
        }
      })
      el.append(demo.el)
      demo.setActive(mode === 'title')
    } catch (err) {
      console.warn('[anima-front] attract demo unavailable', err)
      gaveUp = true
      demo = null
    }
  }

  function releaseDemo() {
    clearTimeout(releaseTimer)
    if (!demo) return
    demo.dispose()
    demo = null
    el.classList.remove('has-attract')
    plazaMode()
  }

  return {
    el,
    setMode(next) {
      mode = next
      el.dataset.mode = next
      clearTimeout(releaseTimer)
      if (next === 'title') ensureDemo()
      demo?.setActive(next === 'title')
      // a match needs the GPU: release at once; menus keep the demo warm for a while
      if (next === 'off' && demo) releaseDemo()
      else if (next !== 'title' && demo) releaseTimer = window.setTimeout(releaseDemo, RELEASE_AFTER * 1000)
      plazaMode()
    },
    setSquad(list) {
      plaza.setSquad(list)
    },
    setCast(cast) {
      plaza.setCast(cast)
    },
    refresh() {
      gaveUp = false
      if (mode !== 'title') releaseDemo()
    },
    status() {
      return { kind: demo?.live && mode === 'title' ? 'attract' : 'plaza', attract: demo?.status() ?? null }
    },
    dispose() {
      releaseDemo()
      plaza.dispose()
      el.remove()
    }
  }
}
