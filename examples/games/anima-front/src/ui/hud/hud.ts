/**
 * The in-match HUD (DESIGN §17.8), updated from the View every frame. Nodes are created once and cached; text
 * changes only when the value changes and bars move with transforms, so a frame never thrashes layout.
 */
import { ITEMS, type ItemId } from '../../data/items'
import { SPECIES } from '../../data/species'
import { TEAMS } from '../../app/match'
import type { PlayerView, SimEvent, V3, View } from '../../sim/types'
import { ANIMA_GLYPH } from '../art'
import { itemIconNode } from '../thumbs'
import { h, setClass, setStyle, setText, svg } from '../dom'
import { speciesBadge } from '../widgets'
import {
  animaGauge,
  damageSources,
  directionAngle,
  feedEntry,
  formatClock,
  hitMarkerFor,
  pawCard,
  type PawCard
} from './model'
import { createBanner, createCountdown, createKillFeed, createRadio, createScoreboard } from './overlays'
import { createCrosshair, createDamageArcs, createHitMarkers, createRadar } from './widgets'

export interface HudFrame {
  view: View
  me: string
  dt: number
  /** Camera yaw (local look) for the radar and damage arcs. */
  yaw: number
  fov: number
  device: 'mouse' | 'gamepad' | 'touch'
  hints: boolean
  /** Player the camera follows while spectating. */
  follow?: string
  project?: (p: V3) => { x: number; y: number; onScreen: boolean }
}

export interface Hud {
  readonly el: HTMLElement
  update(f: HudFrame): void
  setScoreboard(open: boolean): void
  /** Text for the touch interact button, or null (revive available). */
  readonly interactLabel: string | null
  /** Sound hooks for UI-only beats the renderer does not know (radio blip). */
  onSfx?: (name: 'radio' | 'uiError') => void
}

function pawEl(side: 'R' | 'L') {
  const icon = h('span', 'paw-icon')
  const name = h('b', 'paw-name')
  const cost = h('span', 'paw-cost')
  const ring = svg(
    `<svg viewBox="0 0 64 64" class="paw-ring"><circle cx="32" cy="32" r="29" class="paw-ring-bg"/><circle cx="32" cy="32" r="29" class="paw-ring-cd" pathLength="100" transform="rotate(-90 32 32)"/><circle cx="32" cy="32" r="29" class="paw-ring-ch" pathLength="100" transform="rotate(-90 32 32)"/></svg>`
  )
  const list = h('div', 'paw-list')
  const key = h('span', 'paw-key')
  const el = h(
    'div',
    `hud-paw paw-${side}`,
    h(
      'div',
      'paw-main',
      h('div', 'paw-icon-wrap', ring, icon),
      h('div', 'paw-text', h('span', 'paw-side', side === 'R' ? '右手' : '左手', key), name, cost)
    ),
    list
  )
  return { el, icon, name, cost, ring, list, key, item: undefined as ItemId | null | undefined, listKey: '' }
}

type PawEls = ReturnType<typeof pawEl>

function paintPaw(p: PawEls, card: PawCard, keyLabel: string) {
  if (card.item !== p.item) {
    if (p.item !== undefined)
      p.el.animate?.(
        [
          { transform: 'translateY(6px) scale(0.96)', opacity: 0.4 },
          { transform: 'none', opacity: 1 }
        ],
        { duration: 250, easing: 'ease-out' }
      )
    p.item = card.item
    p.icon.replaceChildren(card.item ? itemIconNode(card.item) : '')
    setText(p.name, card.name)
    setText(p.cost, card.cost ? `◆ ${card.cost}` : '')
  }
  setText(p.key, keyLabel)
  const cd = p.ring.querySelector('.paw-ring-cd') as SVGElement
  const ch = p.ring.querySelector('.paw-ring-ch') as SVGElement
  cd.setAttribute('stroke-dasharray', `${(card.cooldown * 100).toFixed(1)} 100`)
  ch.setAttribute('stroke-dasharray', `${(card.charge * 100).toFixed(1)} 100`)
  setClass(p.el, 'is-swapping', card.swapping)
  setClass(p.el, 'is-cooling', card.cooldown > 0)
  setClass(p.el, 'is-empty', !card.item)
  const listKey = card.list.map((x) => `${x.item}${x.active ? '*' : ''}`).join(',')
  if (listKey !== p.listKey) {
    p.listKey = listKey
    p.list.replaceChildren(
      ...card.list.map((x) =>
        h(
          'span',
          { class: `paw-li ${x.active ? 'is-on' : ''}`, attrs: { title: ITEMS[x.item].name } },
          itemIconNode(x.item)
        )
      )
    )
  }
}

interface SquadRow {
  el: HTMLElement
  bar: HTMLElement
  state: HTMLElement
}

export function createHud(): Hud {
  // ---- anima gauge
  const gFill = h('div', 'ag-fill')
  const gGhost = h('div', 'ag-ghost')
  const gValue = h('b', 'ag-value')
  const gMax = h('span', 'ag-max')
  const gWarn = h('div', 'ag-warn', 'アーマー維持限界')
  const gPassives = h('div', 'ag-passives')
  const gauge = h(
    'div',
    'hud-anima',
    gWarn,
    h(
      'div',
      'ag-row',
      h('span', 'ag-glyph', svg(ANIMA_GLYPH)),
      h('span', 'ag-label', 'ANIMA'),
      gValue,
      gMax,
      h('div', 'grow'),
      gPassives
    ),
    h('div', 'ag-bar', gGhost, gFill, h('i', 'ag-crit'))
  )
  let passiveKey = ''

  const pawR = pawEl('R')
  const pawL = pawEl('L')

  // ---- top centre
  const topWave = h('span', 'top-wave')
  const topLabel = h('span', 'top-label')
  const topBar = h('div', 'top-bar', h('i'))
  const topSub = h('div', 'top-sub')
  const pve = h('div', 'top-pve', h('div', 'top-line', topWave, topLabel), topBar, topSub)
  const bossName = h('b', 'boss-name')
  const bossFill = h('i')
  const boss = h(
    'div',
    'top-boss',
    h('div', 'boss-head', h('small', null, '大型個体'), bossName),
    h('div', 'boss-bar', bossFill)
  )
  const scoreEls = TEAMS.map((t) => {
    const n = h('b')
    return {
      el: h('div', { class: `pvp-score pat-${t.pattern}`, style: { '--team': t.color } }, h('small', null, t.name), n),
      n
    }
  })
  const pvpClock = h('div', 'pvp-clock')
  const pvpTag = h('div', 'pvp-tag')
  const pvp = h('div', 'top-pvp', scoreEls[0].el, h('div', 'pvp-mid', pvpClock, pvpTag), scoreEls[1].el, scoreEls[2].el)
  const trainStep = h('small')
  const trainHint = h('b')
  const training = h('div', 'top-training', trainStep, trainHint)
  const top = h('div', 'hud-top', pve, boss, pvp, training)

  // ---- left: radar + squad
  const radar = createRadar()
  const squad = h('div', 'hud-squad')
  const squadRows = new Map<string, SquadRow>()
  let squadKey = ''

  // ---- centre
  const crosshair = createCrosshair()
  const hits = createHitMarkers()
  const arcs = createDamageArcs()
  const revive = h('div', 'hud-revive', h('span', 'rv-key'), h('b', 'rv-text'), h('div', 'rv-bar', h('i')))
  const countdown = createCountdown()
  const banner = createBanner()
  const radio = createRadio(() => hud.onSfx?.('radio'))
  const feed = createKillFeed()
  const scoreboard = createScoreboard()
  const downTitle = h('b')
  const downTimer = h('div', 'down-timer')
  const downSub = h('p')
  const down = h('div', 'hud-down', h('div', 'down-card', downTitle, downTimer, downSub))
  const spectate = h('div', 'hud-spectate')
  const hints = h('div', 'hud-hints')
  let hintKey = ''

  const el = h(
    'div',
    { class: 'hud', attrs: { 'aria-label': 'HUD' } },
    crosshair.scope,
    down,
    h('div', 'hud-left', radar.el, squad),
    top,
    feed.el,
    h('div', 'hud-center', arcs.el, crosshair.el, hits.el),
    revive,
    countdown.el,
    banner.el,
    radio.el,
    h('div', 'hud-bottom', pawL.el, gauge, pawR.el),
    hints,
    spectate,
    scoreboard.el
  )

  let interactLabel: string | null = null
  let lastPhase: View['phase'] | null = null
  let critical = false

  const hud: Hud = {
    el,
    get interactLabel() {
      return interactLabel
    },
    setScoreboard(open) {
      scoreboard.setOpen(open)
    },
    update(f) {
      const { view, dt } = f
      const me = view.players.find((p) => p.id === f.me)
      el.dataset.mode = view.mode
      el.dataset.device = f.device
      if (!me) return
      const focus = (f.follow && view.players.find((p) => p.id === f.follow)) || me
      handleEvents(view, f, me)

      // anima
      const g = animaGauge(me)
      setStyle(gFill, 'transform', `scaleX(${g.fraction.toFixed(4)})`)
      setStyle(gGhost, 'transform', `scaleX(${g.ghost.toFixed(4)})`)
      setText(gValue, g.label)
      setText(gMax, `/ ${g.max}`)
      setClass(gauge, 'is-critical', g.critical && me.state === 'alive')
      setClass(gauge, 'is-offline', !me.passivesOnline)
      const pk = `${me.passives.join(',')}|${me.passivesOnline}`
      if (pk !== passiveKey) {
        passiveKey = pk
        const uniq = [...new Set(me.passives)]
        gPassives.replaceChildren(
          ...uniq.map((id) =>
            h(
              'span',
              {
                class: `ag-passive ${me.passivesOnline ? '' : 'is-off'}`,
                attrs: { title: `${ITEMS[id].name}${me.passivesOnline ? '' : '（停止中）'}` }
              },
              itemIconNode(id),
              me.passives.filter((x) => x === id).length > 1
                ? h('small', null, `×${me.passives.filter((x) => x === id).length}`)
                : null
            )
          )
        )
      }
      if (g.critical && !critical && me.state === 'alive')
        gWarn.animate?.([{ transform: 'scale(1.2)' }, { transform: 'scale(1)' }], { duration: 300 })
      critical = g.critical

      // paws
      const keys =
        f.device === 'gamepad' ? ['RT', 'LT'] : f.device === 'touch' ? ['', ''] : ['左クリック', '右クリック']
      paintPaw(pawR, pawCard(me.hands[0]), keys[0])
      paintPaw(pawL, pawCard(me.hands[1]), keys[1])

      // crosshair
      const active = me.hands[0].act !== 'idle' || me.hands[1].act === 'idle' ? me.hands[0] : me.hands[1]
      crosshair.update({
        hand: active,
        other: active === me.hands[0] ? me.hands[1] : me.hands[0],
        fov: f.fov * 0.62,
        height: window.innerHeight,
        project: f.project,
        findActor: (ref) =>
          typeof ref === 'string' ? view.players.find((p) => p.id === ref)?.p : view.foes.find((x) => x.id === ref)?.p,
        canvasRect: { left: 0, top: 0 },
        disabled: me.state !== 'alive'
      })

      // radar + squad
      radar.draw(view, focus, f.yaw)
      paintSquad(view, me)

      // top centre
      paintTop(view)

      // revive prompt
      paintRevive(view, me, f.device)

      // down / away overlay and spectating
      el.dataset.state = me.state
      if (me.state === 'down') {
        setText(downTitle, 'アーマー崩壊')
        setText(downTimer, String(Math.max(0, Math.ceil(me.timer))))
        setText(downSub, me.revive > 0 ? '救助されています…' : '仲間の救助を待て。時間切れで帰巣します')
      } else if (me.state === 'away') {
        setText(downTitle, '帰巣中')
        setText(downTimer, me.timer >= 0 ? String(Math.max(0, Math.ceil(me.timer))) : '—')
        setText(downSub, me.timer >= 0 ? '基地で再出撃の準備をしています' : '転送枠がありません。仲間の戦いを見守ろう')
      }
      const following = focus !== me ? focus : null
      setClass(spectate, 'is-on', !!following)
      if (following) setText(spectate, `観戦中：${following.name}`)

      // hints
      const hk = `${f.hints}|${f.device}|${view.mode}`
      if (hk !== hintKey) {
        hintKey = hk
        setClass(hints, 'is-on', f.hints && f.device !== 'touch')
        hints.replaceChildren(
          ...(f.device === 'gamepad'
            ? [
                ['RB/LB', '持ち替え'],
                ['A', 'ジャンプ'],
                ['B', 'ダッシュ'],
                ['X', '救助'],
                ['R3', '肩'],
                ['ビュー', 'スコア']
              ]
            : [
                ['Q/E', '持ち替え'],
                ['Space', 'ジャンプ'],
                ['Shift', 'ダッシュ'],
                ['F', '救助'],
                ['V', '肩'],
                ['Tab', 'スコア']
              ]
          ).map(([k, l]) => h('span', null, h('b', null, k), l))
        )
      }

      // overlays
      countdown.set(view.phase === 'countdown' && view.clock > 0 ? Math.ceil(view.clock) : null)
      if (lastPhase === 'countdown' && view.phase === 'play') {
        countdown.set(null, view.mode === 'pvp' ? '演習開始' : view.mode === 'training' ? '訓練開始' : '作戦開始')
        setTimeout(() => countdown.set(null), 900)
      }
      lastPhase = view.phase
      banner.update(dt)
      radio.update(dt)
      feed.update(dt)
      scoreboard.update(view, f.me)
    }
  }

  function handleEvents(view: View, f: HudFrame, me: PlayerView) {
    const marker = hitMarkerFor(view.events, f.me)
    if (marker) hits.show(marker)
    for (const src of damageSources(view, f.me)) arcs.add(directionAngle(me.p, f.yaw, src.at), src.amount)
    for (const e of view.events) handleEvent(view, e, f)
  }

  function handleEvent(view: View, e: SimEvent, f: HudFrame) {
    switch (e.type) {
      case 'ko': {
        const entry = feedEntry(view, e, f.me)
        if (entry) feed.push(entry, view.mode)
        break
      }
      case 'radio':
        radio.push(e.who, e.text)
        break
      case 'wave':
        banner.show(
          e.boss ? '大型個体、接近' : `第${e.wave}波`,
          `WAVE ${e.wave} / ${e.waves}`,
          e.boss ? 'warn' : 'info'
        )
        break
      case 'waveClear':
        banner.show('波を退けた', `WAVE ${e.wave} CLEAR`, 'good')
        break
      case 'lastSpurt':
        banner.show('ラストスパート', '撃破ポイント ×2', 'warn')
        break
      case 'suddenDeath':
        banner.show('サドンデス', '次の撃破で決着', 'warn')
        break
      case 'objective':
        if (e.what === 'captured') banner.show(`${e.label ?? 'ポイント'} 制圧`, 'CAPTURED', 'good')
        else if (e.what === 'destroyed') banner.show(`${e.label ?? '目標'} 破壊`, 'DESTROYED', 'good')
        else if (e.what === 'lost') banner.show('目標を失った', 'OBJECTIVE LOST', 'warn')
        else if (e.what === 'complete') banner.show('目標達成', 'COMPLETE', 'good')
        break
      case 'empty':
        if (e.who === f.me) {
          const p = e.hand === 'R' ? pawR : pawL
          p.el.animate?.([{ transform: 'translateX(-4px)' }, { transform: 'translateX(4px)' }, { transform: 'none' }], {
            duration: 180
          })
          gauge.animate?.([{ filter: 'brightness(1.8)' }, { filter: 'none' }], { duration: 260 })
        }
        break
      case 'tutorial':
        banner.show(e.hint, `STEP ${e.step + 1}`, 'info')
        break
      default:
        break
    }
  }

  function paintSquad(view: View, me: PlayerView) {
    const mates = view.players.filter((p) => p.team === me.team && p.id !== me.id)
    const key = mates.map((p) => p.id).join(',')
    if (key !== squadKey) {
      squadKey = key
      squadRows.clear()
      squad.replaceChildren(
        ...mates.map((p) => {
          const bar = h('i')
          const state = h('span', 'sq-state')
          const row = h(
            'div',
            'sq-row',
            speciesBadge(p.species, 30),
            h('div', 'sq-text', h('b', null, p.name), h('div', 'sq-bar', bar)),
            state
          )
          squadRows.set(p.id, { el: row, bar, state })
          return row
        })
      )
    }
    for (const p of mates) {
      const r = squadRows.get(p.id)
      if (!r) continue
      setStyle(r.bar, 'transform', `scaleX(${Math.max(0, Math.min(1, p.anima / Math.max(1, p.maxAnima))).toFixed(3)})`)
      r.el.dataset.state = p.state
      setText(
        r.state,
        p.state === 'down'
          ? `ダウン ${Math.ceil(p.timer)}`
          : p.state === 'away'
            ? p.timer >= 0
              ? `帰巣 ${Math.ceil(p.timer)}`
              : '離脱'
            : ''
      )
      setClass(r.el, 'is-low', p.state === 'alive' && p.anima / Math.max(1, p.maxAnima) <= 0.15)
    }
  }

  function paintTop(view: View) {
    setClass(pve, 'is-on', view.mode === 'pve')
    setClass(pvp, 'is-on', view.mode === 'pvp')
    setClass(training, 'is-on', view.mode === 'training' && !!view.training?.hint)
    if (view.pve) {
      const v = view.pve
      setText(topWave, v.waves > 1 ? `WAVE ${v.wave}/${v.waves}` : '')
      setText(topLabel, v.objective.label)
      const frac =
        v.objective.hp != null && v.objective.maxHp
          ? v.objective.hp / v.objective.maxHp
          : v.objective.progress != null
            ? v.objective.progress
            : v.objective.step != null && v.objective.steps
              ? v.objective.step / v.objective.steps
              : null
      setClass(topBar, 'is-on', frac != null)
      setClass(topBar, 'is-hp', v.objective.hp != null)
      if (frac != null)
        setStyle(
          topBar.firstElementChild as HTMLElement,
          'transform',
          `scaleX(${Math.max(0, Math.min(1, frac)).toFixed(3)})`
        )
      const sub = [
        v.next > 0 ? `次の波まで ${Math.ceil(v.next)}` : `残り ${v.foesLeft}体`,
        `転送枠 ${v.tickets}`,
        formatClock(view.clock)
      ]
      setText(topSub, sub.join('　'))
      setClass(boss, 'is-on', !!v.boss)
      if (v.boss) {
        setText(bossName, v.boss.name)
        setStyle(bossFill, 'transform', `scaleX(${Math.max(0, v.boss.hp / Math.max(1, v.boss.maxHp)).toFixed(4)})`)
      }
    } else setClass(boss, 'is-on', false)
    if (view.pvp) {
      view.pvp.scores.forEach((sc, i) => setText(scoreEls[i].n, String(sc)))
      setText(pvpClock, view.phase === 'countdown' ? '6:00' : formatClock(view.clock, true))
      setText(pvpTag, view.pvp.suddenDeath ? 'サドンデス' : view.pvp.lastSpurt ? 'ラストスパート ×2' : '三つ巴演習')
      setClass(pvp, 'is-spurt', view.pvp.lastSpurt || view.pvp.suddenDeath)
    }
    if (view.training?.hint) {
      setText(
        trainStep,
        view.training.step >= 0 ? `STEP ${view.training.step + 1} / ${view.training.steps}` : '自由練習'
      )
      setText(trainHint, view.training.hint)
    }
  }

  function paintRevive(view: View, me: PlayerView, device: HudFrame['device']) {
    let target: PlayerView | undefined
    if (me.state === 'alive') {
      if (me.reviving) target = view.players.find((p) => p.id === me.reviving)
      else {
        let best = 2.6
        for (const p of view.players) {
          if (p.state !== 'down' || p.team !== me.team || p.id === me.id) continue
          const d = Math.hypot(p.p[0] - me.p[0], p.p[1] - me.p[1], p.p[2] - me.p[2])
          if (d < best) {
            best = d
            target = p
          }
        }
      }
    }
    interactLabel = target ? '救助' : null
    setClass(revive, 'is-on', !!target)
    if (target) {
      const key = device === 'gamepad' ? 'X' : device === 'touch' ? '' : 'F'
      setText(revive.querySelector('.rv-key')!, key)
      setText(
        revive.querySelector('.rv-text')!,
        me.reviving ? `${target.name}を救助中…` : `${key ? `${key} 長押しで` : ''}救助：${target.name}`
      )
      setStyle(revive.querySelector('.rv-bar i') as HTMLElement, 'transform', `scaleX(${target.revive.toFixed(3)})`)
    }
  }

  return hud
}

export const speciesLabel = (p: PlayerView) => `${p.name}（${SPECIES[p.species].kind}）`
