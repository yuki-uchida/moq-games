/**
 * The app shell: boot, persistent services (settings, saves, audio, model kit, lobbies), the menu backdrop,
 * the screen router with transitions, menu navigation (keyboard / gamepad) and UI sounds.
 */
import { createAudio } from '../audio'
import type { GameAudio, SfxName } from '../audio/api'
import { createModelKit } from '../models'
import type { ModelKit } from '../models/api'
import { ITEM_IDS, type ItemId } from '../data/items'
import { presetById } from '../data/loadout'
import { SPECIES, SPECIES_IDS } from '../data/species'
import { pawLists } from './loadouts'
import { h } from '../ui/dom'
import { focusInitial, moveFocus, navRoot, type NavDir } from '../ui/focus'
import { MenuPad, type MenuAction } from '../input/gamepad'
import { createBootScreen } from '../ui/screens/boot'
import { renderItemThumbs } from '../ui/thumbs'
import { createTitleScreen } from '../ui/screens/title'
import { createSortieScreen, createRoomScreen, createTrainingScreen } from '../ui/screens/sortie'
import { createMissionsScreen } from '../ui/screens/missions'
import { createLobbyScreen } from '../ui/screens/lobby'
import { createBriefingScreen } from '../ui/screens/briefing'
import { createLoadoutScreen } from '../ui/screens/loadout'
import { createCodexScreen } from '../ui/screens/codex'
import { createSettingsScreen } from '../ui/screens/settings'
import { createCreditsScreen } from '../ui/screens/credits'
import { createResultsScreen } from '../ui/screens/results'
import { createGameScreen } from './game'
import { attractLevel } from './attract-plan'
import { installDebugHook } from './debug'
import { createScenery } from './scenery'
import type { AppContext, Backdrop, RouteArgs, RouteName, Screen } from './context'
import { createDefaultLobbyProvider, type LobbyProvider } from './lobby'
import { loadArmory, loadProgress, saveArmory, saveProgress, type Armory, type Progress } from './saves'
import { loadSettings, saveSettings, withSetting, type SettingKey, type Settings } from './settings'
import { browserStore, type KeyValueStore } from './storage'

/** Antiques shown in the title backdrop (each animal's default preset, first antique per paw). */
const BOOT_ITEMS = [
  ...new Set(
    SPECIES_IDS.flatMap((s) => {
      const lists = pawLists(presetById(SPECIES[s].preset).loadout)
      return [lists.R[0], lists.L[0]].filter((x): x is ItemId => !!x)
    })
  )
]

type Factory<K extends RouteName> = (ctx: AppContext, args: RouteArgs[K]) => Screen

const ROUTES: { [K in RouteName]: Factory<K> } = {
  title: (ctx) => createTitleScreen(ctx),
  sortie: (ctx) => createSortieScreen(ctx),
  missions: (ctx) => createMissionsScreen(ctx),
  room: (ctx, a) => createRoomScreen(ctx, a),
  training: (ctx) => createTrainingScreen(ctx),
  lobby: (ctx, a) => createLobbyScreen(ctx, a),
  briefing: (ctx, a) => createBriefingScreen(ctx, a),
  game: (ctx, a) => createGameScreen(ctx, a),
  results: (ctx, a) => createResultsScreen(ctx, a),
  loadout: (ctx, a) => createLoadoutScreen(ctx, a),
  codex: (ctx) => createCodexScreen(ctx),
  settings: (ctx, a) => createSettingsScreen(ctx, a),
  credits: (ctx) => createCreditsScreen(ctx)
}

export interface AppOptions {
  store?: KeyValueStore | null
  audio?: GameAudio
  kit?: ModelKit
  lobbies?: LobbyProvider
  /** Skip the title and open this route right after boot (dev pages). */
  initial?: { name: RouteName; args?: unknown }
  /** Installs window.__anima (dev server / ?debug). */
  debug?: boolean
  /** false: never run the title's live demo (?attract=0). */
  attract?: boolean
}

export function startApp(root: HTMLElement, options: AppOptions = {}): AppContext {
  const prefersReduced = matchMedia?.('(prefers-reduced-motion: reduce)').matches ?? false
  const touch = matchMedia?.('(pointer: coarse)').matches ?? false
  const store = options.store === undefined ? browserStore() : options.store
  let settings: Settings = loadSettings(store, prefersReduced)
  let progress: Progress = loadProgress(store)
  let armory: Armory = loadArmory(store)
  const audio = options.audio ?? safeAudio()
  const kit =
    options.kit ??
    createModelKit({ quality: settings.quality === 'low' ? 'low' : settings.quality === 'high' ? 'high' : 'medium' })
  const lobbies = options.lobbies ?? createDefaultLobbyProvider()

  root.classList.toggle('touch', touch)
  const backdropHost = h('div', 'af-layer af-backdrop-host')
  const veil = h('div', 'af-veil')
  const layer = h('div', 'af-layer af-screens')
  const toasts = h('div', 'toast-host')
  root.append(backdropHost, veil, layer, toasts)

  let backdrop: Backdrop | null = null
  let current: Screen | null = null
  let navigating = 0

  const applySettings = () => {
    document.documentElement.classList.toggle('reduced-motion', settings.reducedMotion)
    audio.setVolume('master', settings.volumeMaster)
    audio.setVolume('music', settings.volumeMusic)
    audio.setVolume('sfx', settings.volumeSfx)
  }
  applySettings()

  const ctx: AppContext = {
    root,
    store,
    audio,
    kit,
    lobbies,
    touch,
    get settings() {
      return settings
    },
    updateSetting(key: SettingKey, value: unknown) {
      settings = withSetting(settings, key, value)
      saveSettings(store, settings)
      applySettings()
      if (key === 'quality' || key === 'reducedMotion') backdrop?.refresh()
    },
    get progress() {
      return progress
    },
    setProgress(p) {
      progress = p
      saveProgress(store, p)
    },
    get armory() {
      return armory
    },
    setArmory(a) {
      armory = a
      if (!saveArmory(store, a)) ctx.toast('保存できませんでした（ストレージが使えません）', 'error')
    },
    get backdrop() {
      return backdrop
    },
    open(name, ...rest) {
      const factory = ROUTES[name] as Factory<typeof name>
      let screen: Screen
      try {
        screen = factory(ctx, rest[0] as RouteArgs[typeof name])
      } catch (err) {
        console.warn('[anima-front] screen failed', name, err)
        ctx.toast('画面を開けませんでした', 'error')
        return
      }
      show(screen)
    },
    sfx(name: SfxName) {
      try {
        audio.sfx(name)
      } catch {
        // audio is decoration
      }
    },
    toast(message, kind = 'info') {
      const el = h('div', `toast is-${kind}`, message)
      toasts.append(el)
      setTimeout(() => el.remove(), 2600)
      while (toasts.children.length > 3) toasts.firstElementChild?.remove()
    },
    confirm(o) {
      return new Promise((resolve) => {
        const prevFocus = document.activeElement as HTMLElement | null
        const close = (value: (typeof o.buttons)[number]['value'] | null) => {
          veilEl.remove()
          prevFocus?.focus?.({ preventScroll: true })
          resolve(value)
        }
        const buttons = o.buttons.map((b, i) =>
          h(
            'button',
            {
              class: `btn ${b.primary ? 'btn-primary' : ''}`,
              attrs: { type: 'button', 'data-autofocus': i === o.buttons.length - 1 ? true : undefined },
              on: { click: () => close(b.value) }
            },
            b.label
          )
        )
        const veilEl = h(
          'div',
          { class: 'modal-veil', attrs: { role: 'dialog', 'aria-modal': 'true' } },
          h('div', 'panel modal', h('h2', null, o.title), h('p', null, o.text), h('div', 'row', buttons))
        )
        ;(veilEl as HTMLElement & { __close?: () => void }).__close = () => close(null)
        layer.append(veilEl)
        focusInitial(veilEl)
      })
    }
  }

  function show(next: Screen) {
    const prev = current
    current = next
    next.el.classList.add('screen', 'is-entering')
    layer.append(next.el)
    if (next.music !== undefined) setMusic(next.music)
    backdrop?.setMode(next.backdrop ?? 'menu')
    veil.style.opacity = next.backdrop === 'off' ? '0' : '1'
    requestAnimationFrame(() => {
      next.el.classList.remove('is-entering')
      if (!next.ownsInput) focusInitial(next.el)
    })
    try {
      next.enter?.()
    } catch (err) {
      console.warn('[anima-front] enter failed', err)
    }
    if (prev) {
      try {
        prev.leave?.()
      } catch (err) {
        console.warn('[anima-front] leave failed', err)
      }
      prev.el.classList.add('is-leaving')
      prev.el.setAttribute('inert', '')
      const remove = () => prev.el.remove()
      setTimeout(remove, settings.reducedMotion ? 120 : 360)
    }
    navigating = performance.now()
  }

  let musicTheme: Parameters<GameAudio['setMusic']>[0] = null
  function setMusic(theme: typeof musicTheme) {
    musicTheme = theme
    try {
      audio.setMusic(theme)
    } catch {
      // ignore
    }
  }

  // ---- audio unlock on the first gesture ----
  let unlocked = false
  const unlock = () => {
    if (unlocked) return
    unlocked = true
    try {
      audio.unlock()
      audio.setMusic(musicTheme)
    } catch {
      // ignore
    }
    root.classList.add('audio-on')
  }
  window.addEventListener('pointerdown', unlock, { capture: true })
  window.addEventListener('keydown', unlock, { capture: true })

  // ---- UI sounds for every button ----
  layer.addEventListener('click', (e) => {
    const b = (e.target as HTMLElement).closest('button, [data-nav]') as HTMLElement | null
    if (!b || b.hasAttribute('disabled')) return
    const s = b.dataset.sfx
    if (s === 'none') return
    ctx.sfx((s as SfxName) || 'uiSelect')
  })

  // ---- menu navigation ----
  const nav = (dir: NavDir) => {
    if (!current || current.ownsInput) return
    const moved = moveFocus(navRoot(current.el), dir)
    if (moved) ctx.sfx('uiMove')
  }
  const goBack = () => {
    const modal = layer.querySelector<HTMLElement & { __close?: () => void }>('.modal-veil')
    if (modal?.__close) {
      ctx.sfx('uiBack')
      modal.__close()
      return
    }
    if (current?.back) {
      ctx.sfx('uiBack')
      current.back()
    }
  }
  window.addEventListener('keydown', (e) => {
    if (!current || current.ownsInput) return
    document.documentElement.classList.add('nav-keys')
    const tag = (e.target as HTMLElement)?.tagName
    const typing = tag === 'INPUT' && (e.target as HTMLInputElement).type === 'text'
    const range = tag === 'INPUT' && (e.target as HTMLInputElement).type === 'range'
    switch (e.key) {
      case 'ArrowUp':
        e.preventDefault()
        nav('up')
        break
      case 'ArrowDown':
        e.preventDefault()
        nav('down')
        break
      case 'ArrowLeft':
        if (typing || range) return
        e.preventDefault()
        nav('left')
        break
      case 'ArrowRight':
        if (typing || range) return
        e.preventDefault()
        nav('right')
        break
      case 'Escape':
        e.preventDefault()
        goBack()
        break
      case 'Backspace':
        if (typing) return
        e.preventDefault()
        goBack()
        break
      case 'q':
      case 'Q':
      case 'PageUp':
        if (typing || !current.tab) return
        current.tab(-1)
        break
      case 'e':
      case 'E':
      case 'PageDown':
        if (typing || !current.tab) return
        current.tab(1)
        break
    }
  })
  window.addEventListener('pointerdown', () => document.documentElement.classList.remove('nav-keys'), { capture: true })

  const pad = new MenuPad()
  const onPad = (a: MenuAction) => {
    document.documentElement.classList.add('nav-keys')
    unlock()
    if (!current || current.ownsInput) return
    const active = document.activeElement as HTMLElement | null
    if (a === 'up' || a === 'down') nav(a)
    else if (a === 'left' || a === 'right') {
      if (active instanceof HTMLInputElement && active.type === 'range') {
        if (a === 'left') active.stepDown()
        else active.stepUp()
        active.dispatchEvent(new Event('input', { bubbles: true }))
        ctx.sfx('uiMove')
      } else nav(a)
    } else if (a === 'confirm' || a === 'start') {
      if (active && (current.el.contains(active) || active.closest('.modal-veil'))) active.click()
      else nav('down')
    } else if (a === 'back') goBack()
    else if (a === 'tabPrev') current.tab?.(-1)
    else if (a === 'tabNext') current.tab?.(1)
  }

  // ---- frame loop ----
  let last = performance.now()
  const frame = (now: number) => {
    const dt = Math.min(0.1, Math.max(0, (now - last) / 1000))
    last = now
    if (current && !current.ownsInput && now - navigating > 250) for (const a of pad.poll(now)) onPad(a)
    try {
      current?.frame?.(dt, now)
    } catch (err) {
      console.warn('[anima-front] frame failed', err)
    }
    requestAnimationFrame(frame)
  }
  requestAnimationFrame(frame)

  if (options.debug) installDebugHook({ screen: () => current?.id ?? '', backdrop: () => backdrop })

  // ---- boot ----
  const boot = createBootScreen()
  show(boot)
  void (async () => {
    const t0 = performance.now()
    try {
      // Boot only waits for the animals and the antiques they hold on the title; the rest of the catalogue
      // is generated in the background once the title is up.
      await kit.prepare({ species: SPECIES_IDS, items: BOOT_ITEMS }, (f) => boot.setProgress(f))
    } catch (err) {
      console.warn('[anima-front] model kit prepare failed', err)
    }
    boot.setProgress(1)
    try {
      backdrop = createScenery(kit, {
        level: () => attractLevel(deviceHints(options.attract === false, settings.quality), settings.reducedMotion),
        quality: () => (settings.quality === 'high' ? 'medium' : settings.quality === 'low' ? 'low' : 'medium')
      })
      backdropHost.append(backdrop.el)
      const squad = [armory.species, ...SPECIES_IDS.filter((s) => s !== armory.species)].slice(0, 4)
      backdrop.setSquad(squad)
    } catch (err) {
      console.warn('[anima-front] backdrop unavailable', err)
      backdrop = null
    }
    // keep the logo up for a beat so the boot never flashes
    const wait = Math.max(0, 700 - (performance.now() - t0))
    setTimeout(() => {
      if (options.initial) ctx.open(options.initial.name, options.initial.args as never)
      else ctx.open('title')
      setTimeout(() => {
        kit
          .prepare({ items: ITEM_IDS })
          .then(() => renderItemThumbs(kit, ITEM_IDS))
          .catch((err) => console.warn('[anima-front] background prepare failed', err))
      }, 1200)
    }, wait)
  })()

  return ctx
}

/** What the browser tells us about the device (for the title's live demo). */
function deviceHints(disabled: boolean, quality: string) {
  const nav = navigator as Navigator & { connection?: { saveData?: boolean }; deviceMemory?: number }
  return {
    disabled,
    saveData: nav.connection?.saveData === true,
    cores: nav.hardwareConcurrency || undefined,
    memoryGb: nav.deviceMemory,
    lowQuality: quality === 'low',
    webgl2: typeof WebGL2RenderingContext !== 'undefined'
  }
}

function safeAudio(): GameAudio {
  try {
    return createAudio()
  } catch {
    let muted = false
    return {
      unlock() {},
      setMusic() {},
      sfx() {},
      loop() {},
      setVolume() {},
      setMuted: (m) => void (muted = m),
      get muted() {
        return muted
      },
      setDuck() {},
      dispose() {}
    }
  }
}
