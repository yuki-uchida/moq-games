/**
 * Lobby (DESIGN §17.5, §18): seats with animal, loadout and bot fill; PvP shows 3 teams × 4 with colours and
 * patterns. Online rooms add the room code (with a copy button), the connection state, ready states, spectators,
 * the host's controls (mission / difficulty, kick, team moves) and follow the host into the briefing or match.
 */
import type { AppContext, Screen } from '../../app/context'
import type { Lobby, LobbyState, OnlineMember } from '../../app/lobby'
import { MODE_LABELS, TEAMS, mapLabel, type MatchSelection, type Seat } from '../../app/match'
import { missionUnlocked } from '../../app/saves'
import { DIFFICULTIES, type Difficulty } from '../../data/enemies'
import { MISSION_ORDER, MISSIONS } from '../../data/missions'
import { SPECIES } from '../../data/species'
import type { TeamId } from '../../sim/types'
import { h } from '../dom'
import { focusInitial } from '../focus'
import { hintBar, itemIcon, screenHead, speciesBadge } from '../widgets'
import { pawLists } from '../../app/loadouts'
import { ITEMS } from '../../data/items'
import { localChoice } from './sortie'

let preferredTeam: TeamId = 0

interface SeatControls {
  member?: OnlineMember
  host: boolean
  onKick(member: OnlineMember): void
  onMove(member: OnlineMember, team: TeamId): void
}

function seatCard(seat: Seat, mode: MatchSelection['mode'], c?: SeatControls): HTMLElement {
  const team = TEAMS[seat.team]
  const def = SPECIES[seat.species]
  const member = c?.member
  const manage = c?.host && member && !member.host && !member.me
  return h(
    'div',
    {
      class: `seat ${seat.local ? 'is-me' : ''} ${seat.bot != null ? 'is-bot' : ''}`,
      style: mode === 'pvp' ? { '--team': team.color } : undefined,
      attrs: { 'data-seat': seat.id, 'data-member': member?.id }
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
        member?.host && !seat.local ? h('span', 'chip', 'ホスト') : null,
        seat.bot != null ? h('span', 'chip', `BOT ${botLabel(seat.bot)}`) : null,
        seat.ready ? h('span', 'chip seat-ready', '準備完了') : h('span', 'chip', '準備中')
      ),
      manage
        ? h(
            'span',
            { class: 'seat-tags seat-manage', attrs: { 'data-manage': member.id } },
            mode === 'pvp'
              ? TEAMS.filter((t) => t.id !== seat.team).map((t) =>
                  h(
                    'button',
                    {
                      class: 'chip',
                      style: { '--team': t.color, 'border-color': t.color, cursor: 'pointer' },
                      attrs: { type: 'button', 'data-move': String(t.id), title: `${t.name}へ移動` },
                      on: { click: () => c.onMove(member, t.id) }
                    },
                    `→${t.name}`
                  )
                )
              : null,
            h(
              'button',
              {
                class: 'chip chip-danger',
                style: { cursor: 'pointer' },
                attrs: { type: 'button', 'data-kick': member.id, title: `${member.name}をルームから外す` },
                on: { click: () => c.onKick(member) }
              },
              '退出させる'
            )
          )
        : null
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

const CONNECTION: Record<string, string> = {
  connecting: '接続中',
  online: 'オンライン',
  waiting: '応答待ち',
  closed: '切断'
}

export function createLobbyScreen(ctx: AppContext, args: { selection: MatchSelection; lobby: Lobby }): Screen {
  const { lobby } = args
  const online = lobby.online
  const mode = args.selection.mode
  let sel = lobby.state().selection
  let left = false
  const leaveRoom = () => {
    if (left) return
    left = true
    lobby.leave()
    ctx.open('room', { selection: sel.mode === 'pvp' ? { mode: 'pvp' } : sel })
  }
  const back = async () => {
    const st = lobby.state()
    if (lobby.kind === 'host' && st.online?.connection !== 'closed' && (st.online?.members.length ?? 0) > 1) {
      const r = await ctx.confirm({
        title: 'ルームを閉じますか？',
        text: 'ホストが抜けると、仲間全員がルームから外れます。',
        buttons: [
          { value: 'no', label: 'のこる' },
          { value: 'yes', label: '閉じる', primary: true }
        ]
      })
      if (r !== 'yes') return
    }
    leaveRoom()
  }
  const seatsHost = h('div', `seats seats-${mode}`)
  const status = h('p', { class: 'lobby-status', attrs: { 'aria-live': 'polite' } })
  const infoHost = h('div', 'lobby-info')
  const watchers = h('p', 'lobby-status lobby-watchers')
  const hostTools = h('div', 'lobby-host-tools')

  const controls = (st: LobbyState, seat: Seat): SeatControls | undefined =>
    st.online
      ? {
          member: st.online.members.find((m) => m.seat === seat.id),
          host: st.online.role === 'host',
          onKick: (m) => void kick(m),
          onMove: (m, t) => online?.moveTeam(m.id, t)
        }
      : undefined

  const kick = async (m: OnlineMember) => {
    const r = await ctx.confirm({
      title: `${m.name}を退出させますか？`,
      text: 'このルームには戻れなくなります。',
      buttons: [
        { value: 'no', label: 'やめる' },
        { value: 'yes', label: '退出させる', primary: true }
      ]
    })
    if (r === 'yes') online?.kick(m.id)
  }

  const copyCode = async (code: string) => {
    try {
      await navigator.clipboard.writeText(code)
      ctx.toast(`ルームコード「${code}」をコピーしました`, 'ok')
    } catch {
      ctx.toast(`ルームコード：${code}`, 'info')
    }
  }

  const paintInfo = (st: LobbyState) => {
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
    if (st.code) {
      const code = st.code
      info.push(
        h('span', { class: 'chip lobby-code', attrs: { 'data-code': code } }, `ルームコード ${code}`),
        h(
          'button',
          {
            class: 'btn btn-ghost lobby-copy',
            attrs: { type: 'button', 'data-copy': '', 'aria-label': 'ルームコードをコピー' },
            on: { click: () => void copyCode(code) }
          },
          'コピー'
        )
      )
    }
    if (st.online) {
      const c = st.online.connection
      info.push(
        h(
          'span',
          {
            class: `chip lobby-conn ${c === 'closed' ? 'chip-danger' : c === 'online' ? 'chip-anima' : ''}`,
            attrs: { 'data-connection': c }
          },
          CONNECTION[c]
        ),
        h('span', 'chip', `${st.online.members.length}人`)
      )
    }
    infoHost.replaceChildren(...(info.filter(Boolean) as Node[]))
  }

  const paintHostTools = (st: LobbyState) => {
    if (!online || st.online?.role !== 'host' || sel.mode !== 'pve' || st.online.phase !== 'lobby') {
      hostTools.replaceChildren()
      return
    }
    const missions = h(
      'select',
      {
        class: 'lobby-mission-select',
        attrs: { 'aria-label': '任務', 'data-host-mission': '' },
        style: {
          padding: '8px 10px',
          'border-radius': '10px',
          background: 'var(--panel)',
          border: '1px solid var(--line)'
        },
        on: {
          change: (e) => {
            const id = (e.target as HTMLSelectElement).value as NonNullable<MatchSelection['mission']>
            online.setSelection({ ...sel, mission: id })
          }
        }
      },
      MISSION_ORDER.filter((m) => missionUnlocked(ctx.progress, m.id)).map((m) =>
        h(
          'option',
          { attrs: { value: m.id, selected: m.id === sel.mission ? true : undefined } },
          `${String(m.index).padStart(2, '0')} ${m.name}`
        )
      )
    )
    const diffs = h(
      'div',
      { class: 'seg', attrs: { role: 'radiogroup', 'aria-label': '難易度' } },
      (Object.keys(DIFFICULTIES) as Difficulty[]).map((d) =>
        h(
          'button',
          {
            class: `seg-btn diff-${d}`,
            attrs: {
              type: 'button',
              role: 'radio',
              'aria-checked': String((sel.difficulty ?? 'normal') === d),
              'data-host-difficulty': d,
              'data-sfx': 'uiTab'
            },
            on: { click: () => online.setSelection({ ...sel, difficulty: d }) }
          },
          DIFFICULTIES[d].name
        )
      )
    )
    hostTools.replaceChildren(h('div', 'lobby-foot', missions, diffs))
  }

  // ---- closed room card
  const closedText = h('p')
  const closedCard = h(
    'div',
    { class: 'modal-veil lobby-closed', attrs: { role: 'alertdialog', 'aria-modal': 'true' } },
    h(
      'div',
      'panel modal',
      h('h2', null, 'ルームが閉じました'),
      closedText,
      h(
        'div',
        'row',
        h(
          'button',
          {
            class: 'btn btn-primary',
            attrs: { type: 'button', 'data-autofocus': true, 'data-closed-back': '' },
            on: { click: () => leaveRoom() }
          },
          'ルーム選択へ'
        )
      )
    )
  )
  ;(closedCard as HTMLElement & { __close?: () => void }).__close = () => leaveRoom()

  const render = (state: LobbyState) => {
    if (left) return
    sel = state.selection
    status.textContent = state.status
    paintInfo(state)
    paintHostTools(state)
    if (mode === 'pvp') {
      seatsHost.replaceChildren(
        ...TEAMS.map((t) =>
          h(
            'div',
            {
              class: `team-col ${state.seats.some((s) => s.local && s.team === t.id) ? 'is-mine' : ''}`,
              style: { '--team': t.color }
            },
            h('div', `team-head pat-${t.pattern}`, h('b', null, t.name)),
            state.seats.filter((s) => s.team === t.id).map((s) => seatCard(s, 'pvp', controls(state, s)))
          )
        )
      )
    } else {
      seatsHost.replaceChildren(...state.seats.map((s) => seatCard(s, sel.mode, controls(state, s))))
    }
    const spectators = state.online?.members.filter((m) => !m.seat) ?? []
    watchers.textContent = spectators.length ? `観戦：${spectators.map((m) => m.name).join('、')}` : ''
    paintTeams(state)
    paintGo(state)
    if (state.online?.connection === 'closed' && !closedCard.isConnected) {
      closedText.textContent = state.online.error ?? 'ルームとの接続が切れました。'
      el.append(closedCard)
      ctx.sfx('uiError')
      requestAnimationFrame(() => focusInitial(closedCard))
    }
    if (online && lobby.kind === 'guest') follow()
  }

  /** Guests follow the host into the briefing / running match (once per match). */
  const follow = () => {
    if (left || !el.isConnected) return
    const next = online?.takeMatch()
    if (!next) return
    const selection = lobby.state().selection
    if (next.phase === 'briefing') ctx.open('briefing', { selection, lobby, start: next.start })
    else ctx.open('game', { selection, start: next.start, lobby })
  }

  const teamPicker =
    mode === 'pvp'
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
                    paintTeams(lobby.state())
                  }
                }
              },
              h('i', `team-dot pat-${t.pattern}`),
              t.name
            )
          )
        )
      : null
  const paintTeams = (st: LobbyState) => {
    const mine = st.seats.find((s) => s.local)?.team ?? preferredTeam
    teamPicker?.querySelectorAll<HTMLElement>('[data-team]').forEach((b) => {
      b.setAttribute('aria-checked', String(Number(b.dataset.team) === mine))
    })
  }

  const goLabel = (st: LobbyState): string => {
    if (lobby.kind !== 'guest') return mode === 'pve' ? 'ブリーフィングへ' : '演習開始'
    if (st.online?.phase === 'briefing') return 'ブリーフィングへ'
    if (st.online?.phase === 'match') return st.online.spectating ? '観戦する' : '任務に合流'
    return st.online?.ready ? '準備を取り消す' : '準備完了'
  }
  const paintGo = (st: LobbyState) => {
    go.textContent = goLabel(st)
    go.dataset.state = lobby.kind === 'guest' ? (st.online?.ready ? 'ready' : 'waiting') : 'host'
    go.classList.toggle('is-disabled', lobby.kind === 'host' && !!st.online?.notReady.length)
  }
  const onGo = () => {
    const st = lobby.state()
    if (st.online?.connection === 'closed') return
    if (lobby.kind === 'guest' && st.online?.phase === 'lobby') {
      lobby.setReady(!st.online.ready)
      return
    }
    try {
      const start = lobby.start()
      if (lobby.kind === 'guest' && st.online?.phase === 'match') ctx.open('game', { selection: sel, start, lobby })
      else ctx.open('briefing', { selection: sel, lobby, start })
    } catch (err) {
      ctx.sfx('uiError')
      ctx.toast(err instanceof Error ? err.message : '出撃できません', 'error')
    }
  }
  const go = h(
    'button',
    {
      class: 'btn btn-primary lobby-go',
      attrs: { type: 'button', 'data-autofocus': true, 'data-sfx': 'uiReady' },
      on: { click: onGo }
    },
    mode === 'pve' ? 'ブリーフィングへ' : '演習開始'
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

  const unsubscribe = lobby.subscribe(render)
  const el = h(
    'div',
    'screen lobby',
    screenHead({ title: 'ロビー', en: 'LOBBY', onBack: () => void back() }),
    infoHost,
    hostTools,
    h('div', 'screen-scroll', seatsHost, watchers),
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
    back: () => void back(),
    enter() {
      const st = lobby.state()
      const team = mode === 'pvp' ? (st.seats.find((s) => s.local)?.team ?? preferredTeam) : 0
      lobby.setLocal({ ...localChoice(ctx), team })
      online?.backInLobby()
      render(lobby.state())
    },
    leave() {
      unsubscribe()
    }
  }
}
