/**
 * The spectator bar (DESIGN §18): a member without a seat watches. In PvP it shows the team it watches and
 * switches between the three teams (buttons / taps, keys 1–3, gamepad LB / RB); the switch holds 「切り替え中…」
 * until the host hands over that team's key. A button (or a click on the field) steps through the watched
 * team's animals. While a seat of the running match is free (a player left and a bot took over), 「空いた席で参加」
 * (button / tap, Enter or J, gamepad Y) asks the host for it; 「参加しています…」 until the seat arrives.
 */
import { TEAMS } from '../app/match'
import type { TeamId, View } from '../sim/types'
import { h, setClass } from './dom'

export interface SpectatorState {
  /** PvP: the team asked for and the team whose view arrives now (undefined: none yet). */
  want?: TeamId
  have?: TeamId
  /** Name of the animal the camera follows. */
  watching?: string
  /** Seats of the running match nobody plays, and this spectator's request for one. */
  free?: number
  request?: SeatRequest
}

export type SeatRequest = 'idle' | 'joining' | 'failed'

/** The 「空いた席で参加」 button: shown while a seat is free or a request is on its way; a note after a miss. */
export function seatButton(
  free: number,
  request: SeatRequest
): { show: boolean; enabled: boolean; label: string; note: string } {
  const note = request === 'failed' ? '席が埋まりました。観戦を続けます' : ''
  if (request === 'joining') return { show: true, enabled: false, label: '参加しています…', note: '' }
  if (free > 0) return { show: true, enabled: true, label: `空いた席で参加（${free}）`, note }
  return { show: false, enabled: false, label: '', note }
}

export interface SpectatorBar {
  readonly el: HTMLElement
  update(s: SpectatorState): void
  /** Gamepad LB / RB (edge-triggered): previous / next team; Y: take a free seat. */
  pollPad(): void
  /** Enter / J: asks for a free seat when the button is on offer. */
  join(): void
}

/** The player a spectator watches: the `index`-th living animal of `team` (any of them when none is living). */
export function watchedPlayer(view: View, team: TeamId, index: number): string | undefined {
  const all = view.players.filter((p) => p.team === team)
  const alive = all.filter((p) => p.state === 'alive')
  const list = alive.length ? alive : all
  if (!list.length) return undefined
  return list[((index % list.length) + list.length) % list.length].id
}

/** The team `dir` steps away from `team` (wrapping). */
export const stepTeam = (team: TeamId, dir: 1 | -1): TeamId => ((team + dir + 3) % 3) as TeamId

export function createSpectatorBar(opts: {
  pvp: boolean
  onTeam(team: TeamId): void
  onNext(): void
  onJoin(): void
}): SpectatorBar {
  const label = h('b', 'spectate-team')
  const pending = h('small', { class: 'spectate-pending', attrs: { 'aria-live': 'polite' } })
  const buttons = opts.pvp
    ? TEAMS.map((t) =>
        h(
          'button',
          {
            class: 'spectate-btn',
            style: { '--team': t.color },
            attrs: {
              type: 'button',
              'data-watch': String(t.id),
              'aria-pressed': 'false',
              title: `${t.name}を観戦（${t.id + 1}キー）`
            },
            on: {
              click: (e) => {
                e.stopPropagation()
                opts.onTeam(t.id)
              }
            }
          },
          h('i', `team-dot pat-${t.pattern}`),
          h('span', null, t.name),
          h('kbd', null, String(t.id + 1))
        )
      )
    : []
  const next = h(
    'button',
    {
      class: 'spectate-btn spectate-next',
      attrs: { type: 'button', 'data-watch-next': '', title: '同じ隊のほかの隊員を見る' },
      on: {
        click: (e) => {
          e.stopPropagation()
          opts.onNext()
        }
      }
    },
    '視点を切替'
  )
  let canJoin = false
  const join = () => {
    if (canJoin) opts.onJoin()
  }
  const seat = h('button', {
    class: 'spectate-btn spectate-join',
    attrs: { type: 'button', 'data-take-seat': '', title: '空いた席に入って一緒に戦う（Enter / J）' },
    on: {
      click: (e) => {
        e.stopPropagation()
        join()
      }
    }
  })
  const seatNote = h('small', { class: 'spectate-note', attrs: { 'aria-live': 'polite' } })
  const el = h(
    'div',
    { class: 'spectate-bar', attrs: { 'data-spectator': '' } },
    h('div', 'spectate-head', h('span', 'chip', '観戦中'), label, pending),
    h('div', 'spectate-row', buttons, next, seat),
    seatNote
  )
  let want: TeamId | undefined
  let lastText = ''
  let lastSeat = ''
  let padPrev = [false, false, false]
  return {
    el,
    update(s) {
      want = s.want
      const switching = opts.pvp && s.want !== undefined && s.have !== s.want
      const team = s.have !== undefined ? TEAMS[s.have] : undefined
      const text = opts.pvp ? (team ? `${team.name}${s.watching ? `・${s.watching}` : ''}` : '') : (s.watching ?? '')
      if (text !== lastText) {
        lastText = text
        label.textContent = text
      }
      if (team) el.style.setProperty('--team', team.color)
      pending.textContent = switching ? '切り替え中…' : ''
      setClass(el, 'is-switching', switching)
      for (const b of buttons) {
        const id = Number(b.dataset.watch)
        b.setAttribute('aria-pressed', String(id === s.want))
        setClass(b, 'is-live', id === s.have)
      }
      const sb = seatButton(s.free ?? 0, s.request ?? 'idle')
      canJoin = sb.enabled
      const key = `${sb.show}|${sb.enabled}|${sb.label}|${sb.note}`
      if (key !== lastSeat) {
        lastSeat = key
        seat.hidden = !sb.show
        seat.disabled = !sb.enabled
        seat.textContent = sb.label
        seatNote.textContent = sb.note
        seatNote.hidden = !sb.note
      }
    },
    join,
    pollPad() {
      const pads = typeof navigator !== 'undefined' ? (navigator.getGamepads?.() ?? []) : []
      const pad = [...pads].find((p) => p?.connected)
      const now = [!!pad?.buttons[4]?.pressed, !!pad?.buttons[5]?.pressed, !!pad?.buttons[3]?.pressed]
      if (opts.pvp && want !== undefined) {
        if (now[0] && !padPrev[0]) opts.onTeam(stepTeam(want, -1))
        else if (now[1] && !padPrev[1]) opts.onTeam(stepTeam(want, 1))
      }
      if (now[2] && !padPrev[2]) join()
      padPrev = now
    }
  }
}
