/** Lobby (DESIGN §17.5): seats with animal, loadout and bot fill; PvP shows 3 teams × 4 with colours and patterns. */
import type { AppContext, Screen } from '../../app/context'
import type { Lobby, LobbyState } from '../../app/lobby'
import { MODE_LABELS, TEAMS, mapLabel, type MatchSelection, type Seat } from '../../app/match'
import { DIFFICULTIES } from '../../data/enemies'
import { MISSIONS } from '../../data/missions'
import { SPECIES } from '../../data/species'
import type { TeamId } from '../../sim/types'
import { h } from '../dom'
import { hintBar, itemIcon, screenHead, speciesBadge } from '../widgets'
import { pawLists } from '../../app/loadouts'
import { ITEMS } from '../../data/items'
import { localChoice } from './sortie'

let preferredTeam: TeamId = 0

function seatCard(seat: Seat, mode: MatchSelection['mode']): HTMLElement {
  const team = TEAMS[seat.team]
  const def = SPECIES[seat.species]
  return h(
    'div',
    {
      class: `seat ${seat.local ? 'is-me' : ''} ${seat.bot != null ? 'is-bot' : ''}`,
      style: mode === 'pvp' ? { '--team': team.color } : undefined,
      attrs: { 'data-seat': seat.id }
    },
    mode === 'pvp' ? h('span', `seat-stripe pat-${team.pattern}`) : null,
    speciesBadge(seat.species, 52),
    h(
      'span',
      'seat-text',
      h('b', null, seat.name),
      h('small', null, `${def.kind}・${seat.loadoutName}`),
      pawRow(seat),
      h(
        'span',
        'seat-tags',
        seat.local ? h('span', 'chip chip-anima', 'あなた') : null,
        seat.bot != null ? h('span', 'chip', `BOT ${botLabel(seat.bot)}`) : null,
        seat.ready ? h('span', 'chip seat-ready', '準備完了') : h('span', 'chip', '準備中')
      )
    )
  )
}

function pawRow(seat: Seat): HTMLElement {
  const lists = pawLists(seat.loadout)
  const paw = (side: string, id: (typeof lists.R)[number] | undefined) =>
    id ? h('span', 'seat-paw', h('em', null, side), itemIcon(id, 20), ITEMS[id].name) : null
  return h('span', 'seat-paws', paw('右', lists.R[0]), paw('左', lists.L[0]))
}

const botLabel = (skill: number) => (skill >= 0.8 ? '熟練' : skill >= 0.55 ? '標準' : '新兵')

export function createLobbyScreen(ctx: AppContext, args: { selection: MatchSelection; lobby: Lobby }): Screen {
  const { selection: sel, lobby } = args
  const back = () => {
    lobby.leave()
    if (sel.mode === 'pve') ctx.open('room', { selection: sel })
    else ctx.open('room', { selection: sel })
  }
  const seatsHost = h('div', `seats seats-${sel.mode}`)
  const status = h('p', 'lobby-status')
  const render = (state: LobbyState) => {
    status.textContent = state.status
    if (sel.mode === 'pvp') {
      seatsHost.replaceChildren(
        ...TEAMS.map((t) =>
          h(
            'div',
            {
              class: `team-col ${state.seats.some((s) => s.local && s.team === t.id) ? 'is-mine' : ''}`,
              style: { '--team': t.color }
            },
            h('div', `team-head pat-${t.pattern}`, h('b', null, t.name)),
            state.seats.filter((s) => s.team === t.id).map((s) => seatCard(s, 'pvp'))
          )
        )
      )
    } else {
      seatsHost.replaceChildren(...state.seats.map((s) => seatCard(s, sel.mode)))
    }
  }
  const unsubscribe = lobby.subscribe(render)

  const info: (Node | null)[] = []
  if (sel.mode === 'pve' && sel.mission) {
    const m = MISSIONS[sel.mission]
    info.push(
      h('span', 'chip chip-anima', `任務 ${String(m.index).padStart(2, '0')}`),
      h('b', 'lobby-mission', m.name),
      h('span', 'chip', DIFFICULTIES[sel.difficulty ?? 'normal'].name)
    )
  } else info.push(h('b', 'lobby-mission', MODE_LABELS[sel.mode]))
  info.push(h('span', 'chip', mapLabel(sel)))
  const code = lobby.state().code
  if (code) info.push(h('span', 'chip lobby-code', `ルームコード ${code}`))

  const teamPicker =
    sel.mode === 'pvp'
      ? h(
          'div',
          { class: 'seg team-picker', attrs: { role: 'radiogroup', 'aria-label': '所属チーム' } },
          TEAMS.map((t) =>
            h(
              'button',
              {
                class: 'seg-btn',
                style: { '--team': t.color },
                attrs: { type: 'button', role: 'radio', 'data-team': String(t.id), 'data-sfx': 'uiTab' },
                on: {
                  click: () => {
                    preferredTeam = t.id
                    lobby.setLocal({ ...localChoice(ctx), team: t.id })
                    paintTeams()
                  }
                }
              },
              h('i', `team-dot pat-${t.pattern}`),
              t.name
            )
          )
        )
      : null
  const paintTeams = () => {
    teamPicker?.querySelectorAll<HTMLElement>('[data-team]').forEach((b) => {
      b.setAttribute('aria-checked', String(Number(b.dataset.team) === preferredTeam))
    })
  }

  const go = h(
    'button',
    {
      class: 'btn btn-primary lobby-go',
      attrs: { type: 'button', 'data-autofocus': true, 'data-sfx': 'uiReady' },
      on: {
        click: () => {
          try {
            const start = lobby.start()
            ctx.open('briefing', { selection: sel, lobby, start })
          } catch (err) {
            ctx.sfx('uiError')
            ctx.toast(err instanceof Error ? err.message : '出撃できません', 'error')
          }
        }
      }
    },
    sel.mode === 'pve' ? 'ブリーフィングへ' : '演習開始'
  )
  const edit = h(
    'button',
    {
      class: 'btn',
      attrs: { type: 'button', 'data-edit': '' },
      on: { click: () => ctx.open('loadout', { back: { name: 'lobby', args } }) }
    },
    '部隊編成を変える'
  )

  const el = h(
    'div',
    'screen lobby',
    screenHead({ title: 'ロビー', en: 'LOBBY', onBack: back }),
    h('div', 'lobby-info', info),
    h('div', 'screen-scroll', seatsHost),
    h('div', 'lobby-foot', status, teamPicker, h('div', 'grow'), edit, go),
    hintBar([
      ['Enter', '決定'],
      ['Esc', 'もどる']
    ])
  )
  return {
    id: 'lobby',
    el,
    music: 'menu',
    back,
    enter() {
      lobby.setLocal({ ...localChoice(ctx), team: sel.mode === 'pvp' ? preferredTeam : 0 })
      paintTeams()
      render(lobby.state())
    },
    leave() {
      unsubscribe()
    }
  }
}
