/** HUD overlays: kill feed, radio subtitles, banners, countdown, scoreboard. */
import type { Speaker } from '../../data/missions'
import { SPECIES } from '../../data/species'
import type { View } from '../../sim/types'
import { portraitSvg } from '../art'
import { h, setClass, setText, svg } from '../dom'
import { speciesBadge } from '../widgets'
import { radioDuration, speakerInfo, TEAM_COLORS, TEAM_NAMES, typedLength, type FeedEntry } from './model'

const sideColor = (team: number | 'foe' | null, mode: View['mode']) =>
  team === 'foe' ? '#c58cff' : team == null ? '#c3cce6' : mode === 'pvp' ? TEAM_COLORS[team] : '#7cc8ff'

export interface KillFeed {
  readonly el: HTMLElement
  push(e: FeedEntry, mode: View['mode']): void
  update(dt: number): void
}

export function createKillFeed(): KillFeed {
  const el = h('div', { class: 'hud-feed', attrs: { 'aria-live': 'polite' } })
  const items: { el: HTMLElement; age: number }[] = []
  return {
    el,
    push(e, mode) {
      const row = h(
        'div',
        `feed-row ${e.mine ? 'is-mine' : ''}`,
        e.killer ? h('b', { style: { color: sideColor(e.killerTeam, mode) } }, e.killer) : null,
        h('span', 'feed-weapon', e.weapon || '撃破'),
        h('b', { style: { color: sideColor(e.victimTeam, mode) } }, e.victim),
        e.points && e.points > 1 ? h('span', 'feed-pts', `+${e.points}`) : null
      )
      el.prepend(row)
      items.unshift({ el: row, age: 0 })
      while (items.length > 5) items.pop()?.el.remove()
    },
    update(dt) {
      for (let i = items.length - 1; i >= 0; i--) {
        const it = items[i]
        it.age += dt
        if (it.age > 5.5) {
          it.el.remove()
          items.splice(i, 1)
        } else if (it.age > 4.8) setClass(it.el, 'is-fading', true)
      }
    }
  }
}

export interface Radio {
  readonly el: HTMLElement
  push(who: Speaker, text: string): void
  update(dt: number): void
}

export function createRadio(onBlip?: () => void): Radio {
  const face = h('span', 'radio-face')
  const name = h('b', 'radio-name')
  const title = h('small', 'radio-title')
  const text = h('p', 'radio-text')
  const el = h(
    'div',
    { class: 'hud-radio', attrs: { 'aria-live': 'polite' } },
    face,
    h('div', 'radio-body', h('div', 'radio-head', name, title), text)
  )
  const queue: { who: Speaker; text: string }[] = []
  let current: { who: Speaker; text: string; t: number; dur: number } | null = null
  let shown = 0
  return {
    el,
    push(who, line) {
      if (queue.length < 4) queue.push({ who, text: line })
    },
    update(dt) {
      if (!current && queue.length) {
        const next = queue.shift()!
        current = { ...next, t: 0, dur: radioDuration(next.text) }
        face.replaceChildren(svg(portraitSvg(next.who)))
        const info = speakerInfo(next.who)
        setText(name, info.name)
        setText(title, info.title)
        setText(text, '')
        shown = 0
        el.dataset.who = next.who
        setClass(el, 'is-on', true)
        onBlip?.()
      }
      if (!current) return
      current.t += dt
      const n = typedLength(current.text, current.t, 36)
      if (n !== shown) {
        shown = n
        setText(text, current.text.slice(0, n))
      }
      if (current.t > current.dur) {
        current = null
        setClass(el, 'is-on', false)
      }
    }
  }
}

export interface Banner {
  readonly el: HTMLElement
  show(title: string, sub?: string, tone?: 'info' | 'warn' | 'good'): void
  update(dt: number): void
}

export function createBanner(): Banner {
  const t = h('b')
  const s = h('small')
  const el = h('div', 'hud-banner', h('div', 'banner-inner', s, t))
  let left = 0
  return {
    el,
    show(title, sub = '', tone = 'info') {
      setText(t, title)
      setText(s, sub)
      el.dataset.tone = tone
      left = 2.6
      setClass(el, 'is-on', false)
      void el.offsetWidth
      setClass(el, 'is-on', true)
    },
    update(dt) {
      if (left <= 0) return
      left -= dt
      if (left <= 0) setClass(el, 'is-on', false)
    }
  }
}

export interface Countdown {
  readonly el: HTMLElement
  set(n: number | null, label?: string): void
}

export function createCountdown(): Countdown {
  const num = h('b')
  const el = h('div', 'hud-count', num)
  let last: string | null = null
  return {
    el,
    set(n, label) {
      const v = n == null ? (label ?? null) : String(n)
      if (v === last) return
      last = v
      setClass(el, 'is-on', v != null)
      setClass(el, 'is-word', n == null && v != null)
      if (v != null) {
        setText(num, v)
        num.animate?.(
          [
            { transform: 'scale(1.6)', opacity: 0 },
            { transform: 'scale(1)', opacity: 1 }
          ],
          { duration: 260, easing: 'ease-out' }
        )
      }
    }
  }
}

export interface Scoreboard {
  readonly el: HTMLElement
  setOpen(on: boolean): void
  readonly open: boolean
  update(view: View, me: string): void
}

export function createScoreboard(): Scoreboard {
  const body = h('tbody')
  const head = h('div', 'sb-head')
  const el = h(
    'div',
    'hud-scoreboard panel',
    head,
    h(
      'table',
      'sb-table',
      h(
        'thead',
        null,
        h(
          'tr',
          null,
          h('th', null, '隊員'),
          h('th', null, '撃破'),
          h('th', null, '支援'),
          h('th', null, 'ダウン'),
          h('th', null, '救助'),
          h('th', null, 'ダメージ')
        )
      ),
      body
    )
  )
  let open = false
  let acc = 0
  let built = ''
  const rows = new Map<string, HTMLTableCellElement[]>()
  return {
    el,
    get open() {
      return open
    },
    setOpen(on) {
      if (on === open) return
      open = on
      setClass(el, 'is-on', on)
      acc = 9 // the next update paints
    },
    update(view, me) {
      if (!open) return
      acc += 1
      if (acc < 10) return
      acc = 0
      const order = [...view.players].sort((a, b) => a.team - b.team || b.stats.kos - a.stats.kos)
      const key = order.map((p) => [p.id, p.name, p.species, p.team, p.bot ? 1 : 0].join(':')).join(',')
      if (key !== built) {
        built = key
        rows.clear()
        body.replaceChildren(
          ...order.map((p) => {
            const cells = Array.from({ length: 5 }, () => h('td'))
            rows.set(p.id, cells)
            return h(
              'tr',
              {
                class: p.id === me ? 'is-me' : '',
                style: view.mode === 'pvp' ? { '--team': TEAM_COLORS[p.team] } : undefined
              },
              h(
                'th',
                null,
                h('span', 'sb-name', speciesBadge(p.species, 24), p.name, h('small', null, SPECIES[p.species].kind)),
                p.bot ? h('em', null, 'BOT') : null
              ),
              cells
            )
          })
        )
      }
      for (const p of order) {
        const c = rows.get(p.id)
        if (!c) continue
        setText(c[0], String(p.stats.kos))
        setText(c[1], String(p.stats.assists))
        setText(c[2], String(p.stats.downs))
        setText(c[3], String(p.stats.revives))
        setText(c[4], String(Math.round(p.stats.damage)))
      }
      if (view.mode === 'pvp' && view.pvp) {
        head.replaceChildren(
          ...view.pvp.scores.map((sc, i) =>
            h(
              'span',
              { class: 'sb-team', style: { '--team': TEAM_COLORS[i] } },
              TEAM_NAMES[i],
              h('b', null, String(sc))
            )
          )
        )
      } else head.replaceChildren(h('span', 'sb-title', view.mode === 'pve' ? '小隊の戦績' : '訓練の記録'))
    }
  }
}
