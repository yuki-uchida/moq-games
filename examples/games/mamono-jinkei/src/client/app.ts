/**
 * The client application: screens (title → lobby → play), the session (solo / host / guest), the main loop
 * (input → session → renderer + HUD + audio), saving and the dev hook.
 */
import { createAudio, type GameAudio, type SfxName, type ThemeName } from '../audio/index'
import { Controls } from '../input/controls'
import { PadNav, firstGamepad } from '../input/padnav'
import { ROOM_SEARCH, hostSilence } from '../net/liveness'
import { guestSession, hostSession, soloSession, type Session, type SessionStatus } from '../net/session'
import { Renderer } from '../render/renderer'
import type { Command } from '../sim/api'
import { STAGE_DATA } from '../stages'
import type { EventView, StageInfo, View } from '../sim/types'
import { el, show } from '../ui/dom'
import { controlled } from '../ui/hints'
import { Hud } from '../ui/hud'
import { LobbyScreen, defaultLobbyStage } from '../ui/lobby'
import { HostWait, PauseMenu, PhaseOverlays, RoomSearch } from '../ui/overlays'
import { modal } from '../ui/panels'
import { escapeModal, navigate } from '../ui/padmenu'
import { TitleScreen } from '../ui/title'
import { JOBS, STAGES, TILE, type Job, type StageId } from '../vocab'
import { Attract } from './attract'
import { HostClock } from './host-clock'
import { arenaRemaining, createMusicState, resetMusicState, selectMusicLayer } from './music-select'
import { loadSave, storeSave, type SaveData, type Settings } from './save'

type Screen = 'title' | 'session'

const STAGE_THEME: Record<StageId, ThemeName> = { meadow: 'meadow', sewer: 'sewer', tower: 'tower', forest: 'forest' }

export class App {
  readonly save: SaveData = loadSave()
  readonly audio: GameAudio = createAudio()
  readonly renderer: Renderer
  readonly controls: Controls
  private readonly app: HTMLElement
  private readonly canvas: HTMLCanvasElement
  private readonly title: TitleScreen
  private readonly lobby: LobbyScreen
  private readonly hud: Hud
  private readonly overlays: PhaseOverlays
  private readonly pause: PauseMenu
  private readonly hostWait: HostWait
  private readonly roomSearch: RoomSearch
  /** Seconds a joining guest has gone without hearing from any host (see ROOM_SEARCH). */
  private searching = 0
  /** Seconds before a joining guest is told the room was not found (tests may shorten it). */
  roomSearchAfter = ROOM_SEARCH
  /** The session whose connection error is (or was) on screen: one error dialog per session. */
  private errorShownFor?: Session
  private readonly layer: HTMLElement
  /** Steps a hosted world while the tab is hidden (no animation frames then). */
  private readonly hostClock = new HostClock((dt) => this.backgroundTick(dt))
  private readonly scratch: EventView[] = []
  screen: Screen = 'title'
  session?: Session
  room?: string
  private attract?: Attract
  job?: Job
  view?: View
  private lastPhase = ''
  private lastStage = ''
  private last = 0
  private readonly events: EventView[] = []
  private modalOpen = false
  private reduced = matchMedia('(prefers-reduced-motion: reduce)').matches
  private savedClear = ''
  frames: number[] = []
  private chargeLoop = false
  private readonly musicState = createMusicState()
  private waterLoop = false
  private windLoop = false
  private generation = 0
  /** The lobby's default stage was chosen for this visit. */
  private lobbyPreset = false
  private readonly padNav = new PadNav()

  constructor(root: HTMLElement) {
    this.app = root
    this.canvas = root.querySelector<HTMLCanvasElement>('#world')!
    this.canvas.tabIndex = 0
    this.renderer = new Renderer(this.canvas)
    this.controls = new Controls(this.canvas, { onMenu: () => this.onMenu(), onGesture: () => this.audio.unlock() })
    const sound = (name: 'menuMove' | 'menuSelect' | 'menuBack') => this.uiSound(name)
    const settings = {
      get: () => ({ ...this.save.settings, name: this.save.name }),
      change: (patch: Partial<Settings> & { name?: string }) => this.changeSettings(patch),
      preview: () => this.audio.sfx('gem')
    }
    this.title = new TitleScreen({
      solo: () => this.startSolo(),
      host: (room) => void this.startHost(room),
      join: (room) => void this.startJoin(room),
      sound,
      settings
    })
    this.lobby = new LobbyScreen({
      pickJob: (job) => (this.job = job),
      pickStage: (stage) => this.command({ type: 'stage', stage }),
      start: () => this.command({ type: 'start' }),
      back: () => void this.leave(false),
      sound
    })
    this.hud = new Hud({
      menu: () => this.onMenu(),
      mute: () => this.toggleMute(),
      blip: () => this.audio.sfx('dialogBlip', { volume: 0.35 })
    })
    this.overlays = new PhaseOverlays({
      next: () => this.command({ type: 'next' }),
      lobby: () => this.command({ type: 'lobby' }),
      title: () => void this.leave(true),
      sound
    })
    this.pause = new PauseMenu({
      ...settings,
      resume: () => this.closeMenu(),
      title: () => void this.leave(false),
      sound
    })
    this.hostWait = new HostWait(() => {
      this.uiSound('menuBack')
      this.toTitle()
    })
    this.layer = el(
      'div.ui-layer',
      {},
      this.title.root,
      this.lobby.root,
      this.hud.root,
      this.overlays.root,
      this.pause.root,
      this.hostWait.root
    )
    root.append(this.layer)
    this.roomSearch = new RoomSearch(this.layer, {
      retry: () => (this.searching = 0),
      leave: () => this.toTitle(),
      sound
    })
    this.applySettings()
    window.addEventListener('keydown', (e) => {
      const t = e.target as HTMLElement | null
      if (e.code === 'KeyM' && !(t && (t.tagName === 'INPUT' || t.tagName === 'TEXTAREA'))) this.toggleMute()
    })
    // Hidden tabs: a host keeps its room running; a guest lets go of its keys on the host at once.
    // (Controls registered its own blur/visibility listeners first, so its keys are already released here.)
    document.addEventListener('visibilitychange', () => this.visibilityChanged())
    window.addEventListener('blur', () => this.releaseRemote())
    // Clicking a button anywhere counts as a gesture for the audio context.
    root.addEventListener('pointerdown', () => this.audio.unlock(), { capture: true })
    this.attract = new Attract()
    this.setScreen('title')
    requestAnimationFrame((t) => this.frame(t))
    // Test hook (window.__mamono): only in dev builds; the import is removed from production bundles.
    if (import.meta.env.DEV) void import('./dev').then((m) => m.installDevHook(this))
  }

  /* ---------------------------------------------------------------------------------------------- flow */

  private setScreen(s: Screen) {
    this.screen = s
    this.app.dataset.screen = s
    show(this.title.root, s === 'title')
    if (s === 'title') {
      this.title.setBusy(undefined)
      this.title.open('main', false)
    }
  }

  private name() {
    return this.save.name
  }

  startSolo() {
    this.begin(soloSession(this.save.progress, this.name()))
  }

  /** Dev/test: solo straight into a stage (all stages unlocked for this session only). */
  devStart(stage: StageId) {
    this.begin(soloSession({ cleared: [...STAGES] }, this.name(), stage))
  }

  private async startHost(room: string) {
    const gen = ++this.generation
    this.title.setBusy('ルームを作成中…')
    try {
      const s = await hostSession(room, this.save.progress, this.name(), {
        onStatus: (st) => gen === this.generation && this.onStatus(st)
      })
      if (gen !== this.generation) return s.dispose()
      this.room = room
      this.begin(s)
    } catch (e) {
      if (gen !== this.generation) return
      this.title.setBusy(undefined)
      this.title.showError(e instanceof Error ? e.message : String(e))
      this.uiSound('menuBack')
    }
  }

  private async startJoin(room: string) {
    const gen = ++this.generation
    this.title.setBusy('ルームに接続中…')
    try {
      const s = await guestSession(room, { onStatus: (st) => gen === this.generation && this.onStatus(st) })
      if (gen !== this.generation) return s.dispose()
      this.room = room
      this.begin(s)
    } catch (e) {
      if (gen !== this.generation) return
      this.title.setBusy(undefined)
      this.title.showError(e instanceof Error ? e.message : String(e))
      this.uiSound('menuBack')
    }
  }

  private begin(s: Session) {
    this.session?.dispose()
    this.session = s
    this.job = s.role === 'guest' ? undefined : 'sword'
    this.view = undefined
    this.lastPhase = ''
    this.lastStage = ''
    this.savedClear = ''
    this.searching = 0
    this.roomSearch.hide()
    this.renderer.reset()
    this.setScreen('session')
    this.hud.setStatus(s.role === 'solo' ? '' : s.status.text, s.status.kind)
    this.visibilityChanged()
    requestAnimationFrame(() => this.lobby.focus())
  }

  /** Back to the title (asks first unless `force`). */
  private async leave(force: boolean) {
    if (!force && this.session) {
      const playing = this.view && this.view.phase !== 'lobby'
      const text =
        this.session.role === 'host'
          ? 'ルームを閉じてタイトルにもどります。なかまの接続も切れます。'
          : playing
            ? 'タイトルにもどりますか？ ここまでの進みぐあいは失われます。'
            : 'タイトルにもどりますか？'
      const choice = await this.ask('タイトルへ', text, ['もどる', 'キャンセル'])
      if (choice !== 0) return
    }
    this.toTitle()
  }

  toTitle() {
    ++this.generation
    this.hostClock.stop()
    this.hostWait.update('live')
    this.roomSearch.hide()
    this.searching = 0
    this.session?.dispose()
    this.session = undefined
    this.view = undefined
    this.room = undefined
    this.pause.hide()
    this.controls.releaseAll()
    this.audio.loop('charge', null)
    this.audio.loop('water', null)
    this.audio.loop('wind', null)
    this.audio.setDuck(0)
    this.renderer.reset()
    if (!this.attract) this.attract = new Attract()
    this.setScreen('title')
  }

  private async ask(title: string, text: string, buttons: string[]) {
    this.modalOpen = true
    this.controls.releaseAll()
    try {
      return await modal(this.layer, title, text, buttons, () => this.uiSound('menuSelect'))
    } finally {
      this.modalOpen = false
    }
  }

  /** Network status of the current session; a connection error opens one dialog per session, never a second. */
  private onStatus(st: SessionStatus) {
    const s = this.session
    if (!s || this.errorShownFor === s) return
    this.hud.setStatus(st.text, st.kind)
    if (st.kind === 'error') {
      this.errorShownFor = s
      this.roomSearch.hide()
      void this.ask('通信エラー', st.text, ['タイトルへ']).then(() => {
        if (this.session === s) this.toTitle()
      })
    }
  }

  private command(c: Command) {
    this.session?.command(c)
  }

  private onMenu() {
    if (this.modalOpen || this.roomSearch.open) return
    if (this.screen === 'title') {
      if (this.title.escape()) return
      return
    }
    const phase = this.view?.phase
    if (!phase || phase === 'lobby') {
      void this.leave(false)
      return
    }
    if (this.pause.open) {
      if (this.pause.escape()) this.closeMenu()
    } else {
      this.uiSound('menuSelect')
      this.controls.releaseAll()
      this.pause.show(this.session?.role === 'solo')
    }
  }

  /**
   * Gamepad in the menus (title, lobby, pause, settings, results, dialogs): d-pad / left stick move focus, A activates,
   * B goes back like Esc, Start closes the pause menu. During play the controls read the pad themselves.
   */
  private padMenu(dt: number) {
    const playing = this.controls.enabled
    const actions = this.padNav.update(firstGamepad(), dt)
    if (playing || !actions.length) return
    const skip = [this.hud.root]
    for (const a of actions) {
      if (a === 'back') {
        if (!escapeModal(this.layer)) this.onMenu()
      } else if (a === 'start') {
        if (!this.modalOpen && this.pause.open) this.closeMenu()
      } else {
        if (navigate(a, this.layer, skip) && a === 'ok') this.audio.unlock()
      }
    }
    // Whatever closed a menu must not also act in the game this frame.
    this.controls.swallowPad()
  }

  private closeMenu() {
    this.uiSound('menuBack')
    this.pause.hide()
    this.canvas.focus({ preventScroll: true })
  }

  /* ------------------------------------------------------------------------------------------ settings */

  private changeSettings(patch: Partial<Settings> & { name?: string }) {
    const { name, ...rest } = patch
    Object.assign(this.save.settings, rest)
    if (name !== undefined) this.save.name = name
    this.applySettings()
    storeSave(this.save)
  }

  private applySettings() {
    const s = this.save.settings
    this.audio.setVolume('music', s.music)
    this.audio.setVolume('sfx', s.sfx)
    this.audio.setMuted(s.muted)
    this.hud.setMuted(s.muted)
  }

  private toggleMute() {
    this.changeSettings({ muted: !this.save.settings.muted })
  }

  private uiSound(name: 'menuMove' | 'menuSelect' | 'menuBack') {
    this.audio.unlock()
    this.audio.sfx(name)
  }

  /* ------------------------------------------------------------------------------------- hidden tabs */

  /**
   * Visible: the rAF loop steps the session. Hidden host: the background clock steps it instead (never both, so
   * there is no double stepping). Solo and guests simply pause while hidden, as before.
   */
  private visibilityChanged() {
    if (document.hidden) {
      this.releaseRemote()
      if (this.session?.role === 'host') this.hostClock.start()
    } else {
      this.hostClock.stop()
      // The next frame measures from now: hidden time was already stepped (host) or is skipped (solo, guest).
      this.last = 0
      // A guest skips the effects and sounds that piled up while hidden (the host skips its own the same way).
      this.session?.resume?.()
    }
  }

  /** A guest tells the host at once that nothing is held any more (keys were released by Controls). */
  private releaseRemote() {
    const s = this.session
    if (s?.role !== 'guest') return
    this.controls.releaseAll()
    s.sendNeutral?.(this.controls.state, { paused: false, job: this.job, name: this.name(), menu: this.pause.open })
  }

  /** Hidden host: steps the world and broadcasts; nothing is drawn, and the effects of hidden time are skipped. */
  private backgroundTick(dt: number) {
    const s = this.session
    if (s?.role !== 'host' || !document.hidden) return this.hostClock.stop()
    try {
      this.controls.releaseAll()
      s.frame(dt, this.controls.state, {
        paused: false,
        job: this.job,
        name: this.name(),
        menu: this.pause.open,
        background: true
      })
      s.takeEvents(this.scratch)
    } catch (e) {
      console.error(e)
    }
  }

  /* -------------------------------------------------------------------------------------------- frame */

  private frame(now: number) {
    requestAnimationFrame((t) => this.frame(t))
    // A hidden host is stepped by the background clock (a stray frame must not step it twice).
    if (this.hostClock.running) return
    const dt = this.last ? Math.min(0.1, (now - this.last) / 1000) : 1 / 60
    this.last = now
    this.frames.push(dt * 1000)
    if (this.frames.length > 120) this.frames.shift()
    try {
      this.tick(dt, now / 1000)
    } catch (e) {
      console.error(e)
    }
  }

  private tick(dt: number, now: number) {
    this.padMenu(dt)
    const s = this.session
    let view: View | undefined
    let info: StageInfo | undefined
    let demo = false
    if (s) {
      const phase = s.latest()?.phase
      const me = s.latest()?.players.find((p) => p.id === s.myId)
      const playing = phase === 'play' && !this.pause.open && !this.modalOpen && !me?.spectator
      this.controls.enabled = playing
      const cam = this.renderer.camera
      const input = this.controls.update(cam.heroCss, cam.artPerCss)
      view = s.frame(dt, input, {
        paused: s.role === 'solo' && this.pause.open,
        job: this.job,
        name: this.name(),
        menu: this.pause.open
      })
      info = s.info
      this.view = view
    } else this.controls.enabled = false
    const phase = view?.phase
    const inLobby = !s || !view || phase === 'lobby'
    if (inLobby) {
      // The attract world plays behind the title and the lobby.
      this.attract ??= new Attract()
      const dv = this.attract.frame(dt)
      if (dv && this.attract.session.info) {
        this.renderer.render({
          view: dv,
          info: this.attract.session.info,
          myId: this.attract.session.myId,
          cursor: { x: 0, y: 0, inside: false },
          showCursor: false,
          shake: false,
          reducedMotion: this.reduced,
          demo: true,
          fade: this.attract.fade,
          shiftX: !s && innerWidth > 900 && innerWidth / innerHeight > 1.25 ? 0.2 : 0
        })
        this.attract.session.takeEvents(this.events)
      }
      demo = true
    } else {
      if (this.attract) {
        this.attract.dispose()
        this.attract = undefined
        this.renderer.reset()
      }
      if (view && info) {
        const c = this.controls
        this.renderer.render({
          view,
          info,
          myId: s!.myId,
          cursor: { x: c.cursorX, y: c.cursorY, inside: c.cursorIn },
          showCursor: phase === 'play' && !this.pause.open,
          shake: this.save.settings.shake,
          reducedMotion: this.reduced
        })
        for (const e of s!.takeEvents(this.events)) this.handleEvent(e, now)
      }
    }
    this.app.dataset.phase = phase ?? (s ? 'lobby' : 'title')
    // Screens.
    if (!s || !inLobby) this.lobbyPreset = false
    show(this.lobby.root, !!s && inLobby)
    if (s && inLobby) {
      if (!this.job && view && s.role === 'guest')
        this.job = JOBS.find((j) => !view!.players.some((p) => p.id !== s.myId && p.job === j))
      if (view?.lobby && (s.role === 'host' || s.role === 'solo')) {
        // Entering the lobby pre-selects the newest unlocked stage (once; the host can still pick another).
        if (!this.lobbyPreset) {
          this.lobbyPreset = true
          const next = defaultLobbyStage(view.lobby.unlocked)
          if (next !== view.lobby.stage) this.command({ type: 'stage', stage: next })
        }
      }
      this.lobby.update(view, { myId: s.myId, role: s.role, room: this.room, job: this.job, status: s.status.text })
    }
    const inGame = !!s && !inLobby && (phase === 'play' || phase === 'wipe')
    show(this.hud.root, inGame)
    if (view && !inLobby) this.hud.update(view, info, s!.myId, now, this.controls.inputDevice)
    this.overlays.update(inLobby ? undefined : view, s?.role === 'host' || s?.role === 'solo')
    this.hostWait.update(s?.hostSilence ? hostSilence(s.hostSilence()) : 'live')
    this.searchRoom(s, dt)
    if (phase && phase !== this.lastPhase) this.phaseChanged(phase)
    if (view && view.stage !== this.lastStage) this.lastStage = view.stage
    this.music(view, info, demo)
    this.chargeSound(view)
  }

  /** A joining guest that hears no host for a while is told the room was not found; a host turning up still joins. */
  private searchRoom(s: Session | undefined, dt: number) {
    if (s?.role !== 'guest' || s.latest() || s.status.kind === 'error') {
      this.searching = 0
      this.roomSearch.hide()
      return
    }
    if (this.roomSearch.open || this.modalOpen) return
    this.searching += dt
    if (this.searching >= this.roomSearchAfter) this.roomSearch.show(this.room ?? '')
  }

  private phaseChanged(phase: string) {
    const prev = this.lastPhase
    this.lastPhase = phase
    if (phase === 'play') this.canvas.focus({ preventScroll: true })
    if (phase !== 'play' && this.pause.open && phase !== 'wipe') this.pause.hide()
    if (phase === 'clear' && this.session && this.session.world && this.view?.results) {
      const key = `${this.view.stage}|${this.view.t}`
      if (key !== this.savedClear) {
        this.savedClear = key
        this.save.progress = this.session.world.progress()
        const r = this.view.results
        const best = (this.save.best ??= {})
        const prior = best[r.stage]
        const order = 'SABC'
        if (
          !prior ||
          order.indexOf(r.rank) < order.indexOf(prior.rank) ||
          (prior.rank === r.rank && r.time < prior.time)
        )
          best[r.stage] = { rank: r.rank, time: r.time }
        storeSave(this.save)
      }
    }
    void prev
  }

  private handleEvent(e: EventView, now: number) {
    this.renderer.event(e, now * 1000, this.save.settings.shake, this.reduced)
    this.hud.event(e)
    if (e.k === 'sfx' && e.s) {
      const cam = this.renderer.camera
      let pan = 0
      let volume = 1
      if (e.x || e.y) {
        const dx = e.x - cam.x
        const dy = e.y - cam.y
        pan = Math.max(-1, Math.min(1, dx / (cam.viewW * 0.6)))
        const d = Math.hypot(dx / (cam.viewW / 2), dy / (cam.viewH / 2))
        volume = d <= 1 ? 1 : Math.max(0, 1 - (d - 1) * 0.8)
      }
      if (volume > 0.02) this.audio.sfx(e.s as SfxName, { pan, volume })
    }
  }

  private music(view: View | undefined, info: StageInfo | undefined, demo: boolean) {
    let theme: ThemeName | null = null
    let layer = 0
    let duck = 0
    let playing = false
    if (!this.session) theme = 'title'
    else if (demo || !view) theme = 'lobby'
    else {
      switch (view.phase) {
        case 'intro':
        case 'play': {
          playing = true
          theme = STAGE_THEME[view.stage]
          const me = controlled(view, this.session.myId) ?? view.heroes[0]
          if (view.boss && me && info) {
            const b = view.boss
            const room = info.rooms.find(
              (r) =>
                r.zoom && b.x / TILE >= r.x && b.x / TILE < r.x + r.w && b.y / TILE >= r.y && b.y / TILE < r.y + r.h
            )
            // While the fight's barrier holds the boss room the theme stays, even if my hero is briefly outside.
            if (
              room &&
              (view.barrier?.includes(room.id) ||
                (me.x / TILE >= room.x &&
                  me.x / TILE < room.x + room.w &&
                  me.y / TILE >= room.y &&
                  me.y / TILE < room.y + room.h))
            )
              theme = view.stage === 'forest' ? 'finalBoss' : 'boss'
          }
          const bossFight = theme === 'boss' || theme === 'finalBoss'
          const alerted =
            !!me &&
            !bossFight &&
            view.enemies.some(
              (e) => e.state !== 'death' && e.alertAt !== undefined && Math.hypot(e.x - me.x, e.y - me.y) < 10 * TILE
            )
          const arenaId = view.objective.startsWith('敵をぜんぶ') ? (view.barrier?.[0] ?? '') : undefined
          layer = selectMusicLayer(this.musicState, {
            t: view.t,
            boss: bossFight ? view.boss : undefined,
            alerted,
            arena:
              arenaId !== undefined && !bossFight
                ? {
                    id: arenaId,
                    remaining: arenaRemaining(view.objective),
                    waves: STAGE_DATA[view.stage]?.rooms.find((r) => r.id === arenaId)?.waves?.length ?? 0
                  }
                : undefined,
            heroes: view.heroes.map((h) => ({ hp: h.hp, maxHp: h.maxHp, down: h.state === 'down' }))
          })
          break
        }
        case 'wipe':
          theme = 'gameover'
          break
        case 'clear':
          theme = 'clear'
          break
        case 'ending':
          theme = 'ending'
          break
        default:
          theme = 'lobby'
      }
      if (view.dialogs.length) duck = 0.3
    }
    if (this.pause.open) duck = 0.65
    if (!playing) resetMusicState(this.musicState)
    this.audio.setMusic(theme, layer)
    this.audio.setDuck(duck)
  }

  private chargeSound(view: View | undefined) {
    const me = view && this.session ? controlled(view, this.session.myId) : undefined
    const charging = !!me && me.charge > 0 && me.state === 'charge' && view?.phase === 'play' && !this.pause.open
    if (charging) {
      this.audio.loop('charge', 'charge', { progress: me!.charge })
      this.chargeLoop = true
    } else if (this.chargeLoop) {
      this.audio.loop('charge', null)
      this.chargeLoop = false
    }
    // Running water near the camera (sewer currents).
    const water = view?.phase === 'play' && !this.pause.open ? this.renderer.water : 0
    if (water > 0.05) {
      this.audio.loop('water', 'water', { volume: water * 0.6 })
      this.waterLoop = true
    } else if (this.waterLoop) {
      this.audio.loop('water', null)
      this.waterLoop = false
    }
    // Wind zones whistle (tower).
    const wind = view?.phase === 'play' && !this.pause.open ? this.renderer.wind : 0
    if (wind > 0.05) {
      this.audio.loop('wind', 'wind', { volume: wind * 0.55 })
      this.windLoop = true
    } else if (this.windLoop) {
      this.audio.loop('wind', null)
      this.windLoop = false
    }
  }
}
