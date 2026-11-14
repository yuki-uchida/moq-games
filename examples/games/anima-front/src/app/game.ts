/**
 * The game screen: owns the loop input → PlayerInput → session (world at 60 Hz) → view → renderer.frame →
 * HUD. Pointer lock on click, Esc pause menu, results when the session is over, and a Japanese error card when
 * the match cannot start. The session is an interface (local now; host/guest later), so this file does not
 * care where views come from.
 */
import type { ThemeName } from '../audio/api'
import { createGameRenderer } from '../render'
import type { GameRenderer } from '../render/api'
import { BTN, type PlayerView, type TeamId, type View } from '../sim/types'
import { ControlState, PlayerInputBuilder, type UiAction } from '../input/controls'
import { GamePad } from '../input/gamepad'
import { attachKeyboardMouse, type KeyboardMouse } from '../input/keyboard-mouse'
import { createTouchControls, type TouchControls, type TouchPaw } from '../input/touch'
import { h, nodes, setClass } from '../ui/dom'
import { focusInitial } from '../ui/focus'
import { createGuideCard, guideSeen, markGuideSeen, type GuideDevice } from '../ui/hud/guide'
import { createHud, type Hud } from '../ui/hud/hud'
import { CooldownRing, pawCard } from '../ui/hud/model'
import { controlsHelp, createSettingsPanel } from '../ui/screens/settings'
import { createSpectatorBar, watchedPlayer } from '../ui/spectator'
import { SPECIES, eyeHeight } from '../data/species'
import type { AppContext, RouteArgs, Screen } from './context'
import { setMatchProbe } from './debug'
import type { OnlineMember } from './lobby'
import { TEAMS, musicFor, prepareRequestFor } from './match'
import { recordMatch } from './records'
import type { Session } from './session'
import { AIM_ASSIST_STRENGTH, rendererOptionsFrom, type Settings } from './settings'

export function createGameScreen(ctx: AppContext, args: RouteArgs['game']): Screen {
  const { selection, start } = args
  const canvas = h('canvas', { class: 'game-canvas', attrs: { 'aria-label': 'ゲーム画面' } })
  const hud: Hud = createHud()
  const state = new ControlState()
  // touch devices start in touch mode so the first HUD frame already shows touch wording
  if (ctx.touch) state.lastDevice = 'touch'
  const builder = new PlayerInputBuilder()
  const pad = new GamePad()
  let session: Session | null = null
  let renderer: GameRenderer | null = null
  let km: KeyboardMouse | null = null
  let touch: TouchControls | null = null
  const touchRings = [new CooldownRing(), new CooldownRing()] as const
  let view: View | null = null
  let mode: 'loading' | 'guide' | 'play' | 'paused' | 'error' | 'done' = 'loading'
  const isDone = () => mode === 'done'
  let appliedSettings: Settings | null = null
  let scoreboardOpen = false
  let music: { theme: ThemeName; layer: number } | null = null
  let spectateIndex = 0
  let pausedByRotate = false
  let lookSeeded = false
  /** No seat in this online match: the screen watches (DESIGN §18) and records nothing. */
  const spectator = !!start.spectator
  const online = args.lobby?.online
  /** The animal the screen follows: the local player, or for a spectator one of the watched team. */
  let viewer = start.me
  const startTeam: TeamId = start.config.players.find((p) => p.id === start.me)?.team ?? 0
  const pickTeam = (team: TeamId) => {
    if (!spectator || !online?.followTeam) return
    spectateIndex = 0
    online.followTeam(team)
    ctx.sfx('uiTab')
  }
  const spectate = spectator
    ? createSpectatorBar({
        pvp: start.config.mode === 'pvp' && !!online?.followTeam,
        onTeam: pickTeam,
        onNext: () => spectateIndex++
      })
    : null
  const onSpectateKey = (e: KeyboardEvent) => {
    if (!spectate || mode !== 'play' || !/^Digit[1-3]$/.test(e.code)) return
    pickTeam((Number(e.code.slice(5)) - 1) as TeamId)
  }

  // ---- overlays
  const loadFill = h('i')
  const loadTitle = h('b', null, '出撃準備中…')
  /** Guests keep the loading card until the host's first snapshot arrives. */
  let awaitingFirstView = false
  const loading = h(
    'div',
    'game-card game-loading is-on',
    h('div', 'panel game-card-inner', h('small', null, 'DEPLOYING'), loadTitle, h('div', 'boot-bar', loadFill))
  )
  const errorText = h('p', 'game-error-text')
  const errorTitle = h('b', { attrs: { id: 'game-error-title' } }, '任務を開始できませんでした')
  const errorCard = h(
    'div',
    'game-card game-error',
    h(
      'div',
      { class: 'panel game-card-inner', attrs: { role: 'alertdialog', 'aria-labelledby': 'game-error-title' } },
      h('small', null, 'SIGNAL LOST'),
      errorTitle,
      errorText,
      h(
        'div',
        'row',
        h(
          'button',
          { class: 'btn', attrs: { type: 'button', 'data-autofocus': true }, on: { click: () => exitTo('back') } },
          'もどる'
        ),
        h(
          'button',
          { class: 'btn btn-ghost', attrs: { type: 'button' }, on: { click: () => exitTo('title') } },
          'タイトルへ'
        )
      )
    )
  )
  const pauseBody = h('div', 'pause-body')
  const pausePanel = h('div', 'panel pause-panel', pauseBody)
  const pause = h('div', 'game-card game-pause', pausePanel)
  const rotate = h(
    'div',
    'game-rotate',
    h('div', 'rotate-icon'),
    h('b', null, '端末を横向きにしてください'),
    h('small', null, 'アニマフロントは横画面で遊べます')
  )
  const clickToPlay = h('div', 'game-click', h('b', null, 'クリックで操作開始'), h('small', null, 'Esc でメニュー'))

  const guide = createGuideCard(() => closeGuide())

  const el = h(
    'div',
    'screen game',
    canvas,
    hud.el,
    spectate?.el,
    clickToPlay,
    loading,
    guide.el,
    errorCard,
    pause,
    rotate
  )

  // ---- input wiring
  const onUi = (a: UiAction) => {
    if (a === 'pause') {
      if (mode === 'play') openPause()
      else if (mode === 'paused') resume()
    } else if (a === 'scoreboardOn') setScoreboard(true)
    else if (a === 'scoreboardOff') setScoreboard(false)
  }
  const setScoreboard = (on: boolean) => {
    scoreboardOpen = on
    hud.setScoreboard(on && mode === 'play')
  }

  // ---- pause menu
  function paintPauseMenu() {
    stopMembers()
    pausePanel.classList.remove('is-wide')
    const btn = (label: string, fn: () => void, extra: Record<string, string> = {}) =>
      h('button', { class: 'btn pause-btn', attrs: { type: 'button', ...extra }, on: { click: fn } }, label)
    pauseBody.replaceChildren(
      ...nodes(
        h(
          'div',
          'pause-title',
          h('small', null, session?.canPause ? 'PAUSED' : 'MENU'),
          h('b', null, session?.canPause ? '一時停止中' : 'メニュー')
        ),
        session && !session.canPause ? h('p', 'pause-note', 'オンラインでは戦闘は止まりません') : null,
        h(
          'div',
          'pause-list',
          btn('再開', () => resume(), { 'data-autofocus': '', 'data-pause': 'resume' }),
          btn('設定', () => showPanel('settings'), { 'data-pause': 'settings' }),
          btn('操作説明', () => showPanel('help'), { 'data-pause': 'help' }),
          args.lobby?.kind === 'host' && online
            ? btn('参加者', () => showMembers(), { 'data-pause': 'members' })
            : null,
          btn('任務を中断', () => void abort(), { 'data-pause': 'abort' })
        )
      )
    )
    focusInitial(pauseBody)
  }
  // ---- online host: who is in the room (seat / team or spectating), with removal
  let unsubMembers: (() => void) | null = null
  function stopMembers() {
    unsubMembers?.()
    unsubMembers = null
  }
  function memberPlace(m: OnlineMember, pvp: boolean): string {
    if (!m.seat) return pvp ? `観戦・${TEAMS[m.team]?.name ?? ''}` : '観戦'
    return pvp ? (TEAMS[m.team]?.name ?? '') : '隊員'
  }
  function showMembers() {
    const lobby = args.lobby
    if (!lobby) return
    stopMembers()
    pausePanel.classList.add('is-wide')
    const pvp = start.config.mode === 'pvp'
    const list = h('ul', { class: 'pause-members', attrs: { 'aria-label': '参加者' } })
    const paint = () => {
      const members = lobby.state().online?.members ?? []
      list.replaceChildren(
        ...members.map((m) =>
          h(
            'li',
            {
              class: `pause-member ${m.seat ? '' : 'is-watcher'}`,
              style: pvp && TEAMS[m.team] ? { '--team': TEAMS[m.team].color } : undefined,
              attrs: { 'data-member': m.id }
            },
            h('b', null, m.name),
            h('span', 'chip', memberPlace(m, pvp)),
            m.host ? h('span', 'chip', 'ホスト') : null,
            h('span', 'grow'),
            m.host || m.me
              ? null
              : h(
                  'button',
                  {
                    class: 'chip chip-danger',
                    attrs: { type: 'button', 'data-kick': m.id, title: `${m.name}をルームから外す` },
                    on: { click: () => void removeMember(m) }
                  },
                  '退出させる'
                )
          )
        )
      )
    }
    paint()
    unsubMembers = lobby.subscribe(() => {
      if (list.isConnected) paint()
    })
    pauseBody.replaceChildren(
      h('div', 'pause-title', h('small', null, 'MEMBERS'), h('b', null, '参加者')),
      h('p', 'pause-note', '退出させたメンバーはこのルームに戻れません。'),
      h('div', 'pause-scroll', list),
      h(
        'button',
        {
          class: 'btn btn-back',
          attrs: { type: 'button', 'data-autofocus': '', 'data-sfx': 'uiBack' },
          on: { click: () => paintPauseMenu() }
        },
        'もどる'
      )
    )
    focusInitial(pauseBody)
  }
  async function removeMember(m: OnlineMember) {
    const r = await ctx.confirm({
      title: `${m.name}を退出させますか？`,
      text: m.seat ? 'このルームには戻れなくなります。席はボットが引き継ぎます。' : 'このルームには戻れなくなります。',
      buttons: [
        { value: 'no', label: 'やめる' },
        { value: 'yes', label: '退出させる', primary: true }
      ]
    })
    if (r === 'yes') online?.kick(m.id)
  }
  function showPanel(which: 'settings' | 'help') {
    pausePanel.classList.add('is-wide')
    pauseBody.replaceChildren(
      h(
        'div',
        'pause-title',
        h('small', null, which === 'settings' ? 'SETTINGS' : 'CONTROLS'),
        h('b', null, which === 'settings' ? '設定' : '操作説明')
      ),
      h('div', 'pause-scroll', which === 'settings' ? createSettingsPanel(ctx) : controlsHelp()),
      h(
        'button',
        {
          class: 'btn btn-back',
          attrs: { type: 'button', 'data-autofocus': '', 'data-sfx': 'uiBack' },
          on: { click: () => paintPauseMenu() }
        },
        'もどる'
      )
    )
    focusInitial(pauseBody)
  }
  function openPause() {
    if (mode !== 'play') return
    mode = 'paused'
    km?.releaseLock()
    state.releaseAll()
    setScoreboard(false)
    session?.setPaused(true)
    ctx.audio.setDuck(0.7)
    ctx.sfx('uiBack')
    // pad users get the focus ring right away (it is the only cue where the pad cursor is)
    if (state.lastDevice === 'gamepad') document.documentElement.classList.add('nav-keys')
    // visible first: focus only lands on rendered buttons
    setClass(pause, 'is-on', true)
    paintPauseMenu()
    touch?.setVisible(false)
  }
  function resume() {
    if (mode !== 'paused') return
    stopMembers()
    mode = 'play'
    pad.rearm()
    session?.setPaused(false)
    ctx.audio.setDuck(0)
    setClass(pause, 'is-on', false)
    touch?.setVisible(!spectator)
    if (!ctx.touch && !spectator) km?.requestLock()
    ;(document.activeElement as HTMLElement | null)?.blur?.()
  }
  async function abort() {
    const r = await ctx.confirm({
      title:
        selection.mode === 'pvp'
          ? '演習を中断しますか？'
          : selection.mode === 'training'
            ? '訓練を終了しますか？'
            : '任務を中断しますか？',
      text: selection.mode === 'pve' ? '中断すると、この任務の結果は記録されません。' : '途中の結果は記録されません。',
      buttons: [
        { value: 'no', label: 'つづける' },
        { value: 'yes', label: '中断する', primary: true }
      ]
    })
    if (r === 'yes') exitTo('back')
  }

  function exitTo(where: 'back' | 'title') {
    mode = 'done'
    if (where === 'title') return ctx.open('title')
    if (selection.mode === 'training') return ctx.open('training')
    if (args.lobby) return ctx.open('lobby', { selection, lobby: args.lobby })
    return ctx.open('sortie')
  }

  function fail(err: unknown) {
    console.warn('[anima-front] match failed', err)
    const started = view !== null
    const message = err instanceof Error ? err.message : ''
    // Online sessions give their reason in Japanese (e.g. the host closed the room): show it as it is.
    const japanese = /[぀-ヿ一-鿿]/.test(message)
    mode = 'error'
    errorTitle.textContent = started ? '通信が途切れました' : '任務を開始できませんでした'
    errorText.textContent = japanese
      ? message
      : (started
          ? 'ホストとの通信が途切れました。ロビーからもう一度お試しください。'
          : 'アニマ通信が確立できませんでした。時間をおいてもう一度お試しください。') +
        (message ? `\n（詳細：${message}）` : '')
    setClass(loading, 'is-on', false)
    setClass(errorCard, 'is-on', true)
    touch?.setVisible(false)
    requestAnimationFrame(() => focusInitial(errorCard))
  }

  // ---- first match: the controls card (solo matches wait for it)
  function guideDevice(): GuideDevice {
    if (ctx.touch) return 'touch'
    const pads = navigator.getGamepads?.() ?? []
    return [...pads].some((p) => p?.connected) ? 'pad' : 'kbm'
  }
  function openGuide() {
    mode = 'guide'
    // one view first, so the HUD and the scene are drawn behind the card while the world waits
    try {
      view = session?.update(0) ?? view
    } catch (err) {
      console.warn('[anima-front] first view failed', err)
    }
    session?.setPaused(true)
    touch?.setVisible(false)
    guide.show(guideDevice())
  }
  function closeGuide() {
    if (mode !== 'guide') return
    markGuideSeen(ctx.store)
    guide.hide()
    mode = 'play'
    pad.rearm()
    session?.setPaused(false)
    touch?.setVisible(!spectator)
    if (!ctx.touch && !spectator) {
      setClass(clickToPlay, 'is-on', true)
      km?.requestLock()
    }
    ;(document.activeElement as HTMLElement | null)?.blur?.()
  }

  // ---- results
  function finish(v: View) {
    if (isDone()) return
    mode = 'done'
    km?.releaseLock()
    // A spectator watched someone else's match: nothing goes to its progress.
    const rec = recordMatch(ctx.progress, v, {
      me: start.me,
      spectator,
      tutorial: !!selection.training?.tutorial
    })
    if (rec.recorded) ctx.setProgress(rec.progress)
    const { newBest, unlocked } = rec
    ctx.open('results', {
      selection,
      view: v,
      me: spectator ? viewer : start.me,
      lobby: args.lobby,
      newBest,
      unlocked,
      spectator
    })
  }

  /** The tutorial counts as completed the moment the sim reports it done (not when the match ends). */
  let tutorialRecorded = false
  function recordTutorial(v: View) {
    if (tutorialRecorded || !selection.training?.tutorial || !v.training) return
    const done =
      v.training.step < 0 || v.events.some((e) => e.type === 'tutorial' && e.step >= (v.training?.steps ?? 8))
    if (!done) return
    tutorialRecorded = true
    if (ctx.progress.trainingDone) return
    ctx.setProgress({ ...ctx.progress, trainingDone: true })
    ctx.toast('チュートリアルを修了しました！', 'ok')
  }

  // ---- music
  function updateMusic(v: View) {
    let theme: ThemeName = musicFor(selection)
    let layer = 0
    if (v.pve?.boss) {
      if (v.pve.mission === 'maw') {
        theme = 'finalBoss'
        layer = v.pve.boss.phase >= 2 ? 1 : 0
      } else theme = 'boss'
    }
    if (v.pvp && (v.pvp.lastSpurt || v.pvp.suddenDeath)) layer = 1
    if (!music || music.theme !== theme || music.layer !== layer) {
      music = { theme, layer }
      try {
        ctx.audio.setMusic(theme, layer)
      } catch {
        // decoration
      }
    }
  }

  // ---- aim assist: slow the look over a foe close to the crosshair (gamepad / touch only)
  function assistFor(v: View | null): number {
    const strength = AIM_ASSIST_STRENGTH[ctx.settings.aimAssist]
    if (!v || strength === 0 || state.lastDevice === 'mouse') return 0
    const me = v.players.find((p) => p.id === start.me)
    if (!me || me.state !== 'alive') return 0
    const yaw = builder.yaw
    const pitch = builder.pitch
    const dir = [Math.sin(yaw) * Math.cos(pitch), Math.sin(pitch), Math.cos(yaw) * Math.cos(pitch)]
    const eye = [me.p[0], me.p[1] + 1, me.p[2]]
    let best = 0
    const check = (p: number[], hgt: number) => {
      const d = [p[0] - eye[0], p[1] + hgt - eye[1], p[2] - eye[2]]
      const len = Math.hypot(d[0], d[1], d[2])
      if (len < 1 || len > 60) return
      const cos = (d[0] * dir[0] + d[1] * dir[1] + d[2] * dir[2]) / len
      const ang = Math.acos(Math.min(1, cos))
      const limit = Math.max(0.035, 1.2 / len)
      if (ang < limit) best = Math.max(best, 1 - ang / limit)
    }
    for (const f of v.foes) if (f.state !== 'dying') check(f.p, 0.6)
    for (const p of v.players) if (p.team !== me.team && p.state === 'alive') check(p.p, 0.7)
    return best * strength
  }

  // ---- start-up
  async function boot() {
    const t0 = performance.now()
    try {
      await ctx.kit.prepare(prepareRequestFor(start.config), (f) =>
        loadFill.style.setProperty('transform', `scaleX(${Math.max(0, Math.min(1, f))})`)
      )
    } catch (err) {
      console.warn('[anima-front] prepare failed', err)
    }
    if (isDone()) return
    try {
      session = args.session ?? start.connect()
    } catch (err) {
      fail(err)
      return
    }
    try {
      renderer = createGameRenderer(canvas, ctx.kit, ctx.audio, rendererOptionsFrom(ctx.settings))
      appliedSettings = ctx.settings
      resize()
      await renderer.setMap(session.map, session.config.variant)
    } catch (err) {
      fail(err)
      return
    }
    if (isDone()) return
    const spawn = session.map.spawns.find(
      (s) => s.team === 'squad' || s.team === session!.config.players.find((p) => p.id === start.me)?.team
    )
    builder.reset(spawn?.yaw ?? 0, 0)
    // a short beat so the loading card never flashes
    await new Promise((r) => setTimeout(r, Math.max(0, 450 - (performance.now() - t0))))
    if (isDone()) return
    awaitingFirstView = session.kind === 'guest'
    if (awaitingFirstView) loadTitle.textContent = 'ホストの出撃を待っています…'
    else setClass(loading, 'is-on', false)
    setMatchProbe(probe)
    // The first-match controls card is for players (a spectator controls nothing).
    if (session.kind !== 'demo' && !spectator && !selection.training?.tutorial && !guideSeen(ctx.store)) {
      openGuide()
      return
    }
    mode = 'play'
    // A spectator has nothing to control: no controls, no pointer lock, no "click to play".
    touch?.setVisible(!spectator)
    if (!ctx.touch && !spectator) setClass(clickToPlay, 'is-on', true)
  }

  // ---- debug hook (window.__anima, Vite dev server only): lets E2E drive and observe the real match
  const probe = {
    me: start.me,
    spectator,
    watching: () => viewer,
    view: () => view,
    stats: () => renderer?.stats() ?? null,
    aimAt(p: readonly number[]) {
      const me = view?.players.find((q) => q.id === start.me)
      if (!me) return
      const dx = p[0] - me.p[0]
      const dy = p[1] - (me.p[1] + eyeHeight(SPECIES[me.species]))
      const dz = p[2] - me.p[2]
      builder.reset(Math.atan2(dx, dz), Math.atan2(dy, Math.hypot(dx, dz)))
    },
    hold(button: 'R' | 'L' | 'jump' | 'dash' | 'interact', on: boolean) {
      if (on) state.press(button, 'debug')
      else state.release(button, 'debug')
    }
  }

  const onLockChange = () => {
    if (document.pointerLockElement) setClass(clickToPlay, 'is-on', false)
  }

  const resize = () => {
    renderer?.resize(window.innerWidth, window.innerHeight, Math.min(2, window.devicePixelRatio || 1))
  }

  function followTarget(v: View, me: PlayerView | undefined): string | undefined {
    if (!me || me.state !== 'away') return undefined
    const mates = v.players.filter((p) => p.team === me.team && p.id !== me.id && p.state !== 'away')
    if (!mates.length) return undefined
    return mates[spectateIndex % mates.length].id
  }

  return {
    id: 'game',
    el,
    music: null,
    backdrop: 'off',
    get ownsInput() {
      return mode === 'play' || mode === 'loading'
    },
    enter() {
      km = attachKeyboardMouse({
        target: canvas.parentElement ?? el,
        state,
        sensitivity: () => ctx.settings.mouseSensitivity,
        invertY: () => ctx.settings.invertY,
        onUi,
        onLockLost: () => {
          if (mode === 'play') openPause()
        },
        active: () => mode === 'play',
        pointerLock: () => !spectator
      })
      el.addEventListener('mousedown', () => {
        if (mode === 'play') setClass(clickToPlay, 'is-on', false)
      })
      document.addEventListener('pointerlockchange', onLockChange)
      if (ctx.touch) {
        touch = createTouchControls({
          state,
          sensitivity: () => ctx.settings.mouseSensitivity,
          invertY: () => ctx.settings.invertY,
          assist: () => assistFor(view),
          onUi
        })
        touch.setVisible(false)
        el.append(touch.el)
      }
      el.addEventListener('click', (e) => {
        // watching (a spectator, or a player waiting to respawn): a click steps to the next animal
        if (mode !== 'play' || e.target !== canvas) return
        if (spectator || view?.players.find((p) => p.id === start.me)?.state === 'away') spectateIndex++
      })
      if (spectate) window.addEventListener('keydown', onSpectateKey)
      window.addEventListener('resize', resize)
      void boot()
    },
    leave() {
      mode = 'done'
      setMatchProbe(null)
      window.removeEventListener('resize', resize)
      window.removeEventListener('keydown', onSpectateKey)
      stopMembers()
      document.removeEventListener('pointerlockchange', onLockChange)
      km?.dispose()
      touch?.dispose()
      session?.dispose()
      renderer?.dispose()
      ctx.audio.setDuck(0)
    },
    back() {
      if (mode === 'guide') closeGuide()
      else if (mode === 'paused') {
        const inPanel = !pauseBody.querySelector('[data-pause="resume"]')
        if (inPanel) paintPauseMenu()
        else resume()
      } else if (mode === 'error') exitTo('back')
    },
    frame(dt) {
      // portrait phones: rotate card and hold the match
      const portrait = ctx.touch && window.innerHeight > window.innerWidth
      setClass(rotate, 'is-on', portrait)
      if (portrait && mode === 'play') {
        openPause()
        pausedByRotate = true
      } else if (!portrait && pausedByRotate && mode === 'paused') {
        pausedByRotate = false
        resume()
      }
      if (!session || !renderer || mode === 'loading' || mode === 'error') return
      if (appliedSettings !== ctx.settings) {
        appliedSettings = ctx.settings
        renderer.setOptions(rendererOptionsFrom(ctx.settings))
      }
      if (mode === 'play') {
        for (const a of pad.poll(state, dt, ctx.settings.gamepadSensitivity, ctx.settings.invertY, assistFor(view)))
          onUi(a)
        if (pad.connected) setClass(clickToPlay, 'is-on', false)
      }
      const meView = view?.players.find((p) => p.id === start.me)
      if (meView && !lookSeeded) {
        // start looking where the sim spawned us
        lookSeeded = true
        builder.reset(meView.yaw, meView.pitch)
      }
      const input = builder.build(
        state,
        meView
          ? {
              countR: meView.hands[0].items.length,
              countL: meView.hands[1].items.length,
              selR: meView.hands[0].sel,
              selL: meView.hands[1].sel
            }
          : null
      )
      if (mode === 'play') session.setInput(input)
      let next: View | null = null
      try {
        next = session.update(mode === 'play' ? dt : 0)
      } catch (err) {
        fail(err)
        return
      }
      if (!next) return
      if (awaitingFirstView) {
        awaitingFirstView = false
        setClass(loading, 'is-on', false)
      }
      view = next
      recordTutorial(next)
      if (spectate) {
        // PvP: the team whose view arrives now (its key); PvE: the squad.
        const w = online?.watching?.()
        const team = start.config.mode === 'pvp' ? (w?.have ?? startTeam) : 0
        viewer = watchedPlayer(next, team, spectateIndex) ?? start.me
        if (mode === 'play') spectate.pollPad()
        spectate.update({
          want: w?.want,
          have: start.config.mode === 'pvp' ? w?.have : undefined,
          watching: next.players.find((p) => p.id === viewer)?.name
        })
      }
      const me = next.players.find((p) => p.id === viewer)
      const follow = followTarget(next, me)
      const active = me?.hands.find((hnd) => hnd.sel >= 0 && hnd.items[hnd.sel] === 'owl' && hnd.act === 'charge')
      try {
        renderer.frame({
          view: next,
          dt,
          me: viewer,
          follow,
          camera: {
            yaw: builder.yaw,
            pitch: builder.pitch,
            shoulder: builder.shoulder,
            zoom: active ? active.charge : 0
          }
        })
      } catch (err) {
        console.warn('[anima-front] renderer frame failed', err)
      }
      hud.update({
        view: next,
        me: viewer,
        dt,
        yaw: builder.yaw,
        fov: ctx.settings.fov,
        device: state.lastDevice,
        hints: ctx.settings.controlHints && !spectator,
        spectator,
        interactHeld: (input.held & BTN.INTERACT) !== 0,
        follow,
        project: (p) => renderer!.project(p)
      })
      if (touch && me) {
        const paw = (hand: PlayerView['hands'][number], ring: CooldownRing): TouchPaw => {
          const c = pawCard(hand, { passives: me.passives, online: me.passivesOnline, anima: me.anima, ring })
          return {
            item: c.item,
            cost: c.cost,
            cooldown: c.cooldown,
            charge: c.charge,
            affordable: c.affordable
          }
        }
        touch.setPaws(paw(me.hands[0], touchRings[0]), paw(me.hands[1], touchRings[1]))
      }
      touch?.setInteract(hud.interactLabel)
      hud.setScoreboard(scoreboardOpen && mode === 'play')
      updateMusic(next)
      if (session.over && (mode as string) !== 'error') finish(next)
    }
  }
}
