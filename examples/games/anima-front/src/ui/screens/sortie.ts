/** 出撃: mode select, room choice (solo / host / join) and the training setup (DESIGN §17.3). */
import type { AppContext, Screen } from '../../app/context'
import type { LocalChoice } from '../../app/lobby'
import type { MatchSelection } from '../../app/match'
import { MODE_LABELS } from '../../app/match'
import { resolveLoadout } from '../../app/saves'
import { SPECIES } from '../../data/species'
import { h } from '../dom'
import { hintBar, screenHead } from '../widgets'

export function localChoice(ctx: AppContext): LocalChoice {
  const species = ctx.armory.species
  const { loadout, name } = resolveLoadout(ctx.armory, species)
  return { name: SPECIES[species].name, species, loadout, loadoutName: name }
}

const MODES = [
  {
    id: 'pve' as const,
    en: 'DEFENSE',
    title: '防衛任務',
    text: '4人の小隊で〈蝕〉の群れからヒナタ市を守る。空いた席はボットが埋める。',
    tag: '協力 1〜4人'
  },
  {
    id: 'pvp' as const,
    en: 'TRI-SQUAD DRILL',
    title: '三つ巴演習',
    text: 'ユメクジラ演習場で、4人×3チームの撃破戦。6分間で最も多く撃破した隊の勝ち。',
    tag: '対戦 3チーム×4人'
  },
  {
    id: 'training' as const,
    en: 'TRAINING',
    title: '訓練場',
    text: '操作を一から覚えるチュートリアルと、編成を試せる自由練習。',
    tag: 'ひとりで'
  }
]

export function createSortieScreen(ctx: AppContext): Screen {
  const cards = MODES.map((m, i) =>
    h(
      'button',
      {
        class: `mode-card mode-${m.id}`,
        attrs: { type: 'button', 'data-autofocus': i === 0 ? true : undefined, 'data-mode': m.id },
        style: { '--i': String(i) },
        on: {
          click: () => {
            if (m.id === 'pve') ctx.open('missions')
            else if (m.id === 'pvp') ctx.open('room', { selection: { mode: 'pvp' } })
            else ctx.open('training')
          }
        }
      },
      h('span', 'mode-art', h('i'), h('i'), h('i')),
      h('span', 'mode-en', m.en),
      h('span', 'mode-title', m.title),
      h('span', 'mode-text', m.text),
      h('span', 'chip', m.tag)
    )
  )
  const el = h(
    'div',
    'screen sortie',
    screenHead({ title: '出撃', en: 'SORTIE', onBack: () => ctx.open('title') }),
    h('div', 'screen-scroll', h('div', 'mode-grid', cards)),
    hintBar([
      ['↑↓←→', '選択'],
      ['Enter', '決定'],
      ['Esc', 'もどる']
    ])
  )
  return { id: 'sortie', el, music: 'menu', back: () => ctx.open('title') }
}

export function createRoomScreen(ctx: AppContext, args: { selection: MatchSelection }): Screen {
  const sel = args.selection
  const back = () => (sel.mode === 'pve' ? ctx.open('missions') : ctx.open('sortie'))
  const host = ctx.lobbies.canHost(sel)
  const join = ctx.lobbies.canJoin()
  const option = (
    id: string,
    title: string,
    text: string,
    avail: { ok: true } | { ok: false; reason: string },
    action: () => void,
    autofocus = false
  ) =>
    h(
      'button',
      {
        class: `room-card ${avail.ok ? '' : 'is-locked'}`,
        attrs: {
          type: 'button',
          'data-room': id,
          'data-autofocus': autofocus ? true : undefined,
          'aria-disabled': avail.ok ? undefined : 'true',
          'data-sfx': avail.ok ? undefined : 'uiError'
        },
        on: {
          click: () => {
            if (!avail.ok) {
              ctx.toast(`オンラインは${avail.reason}です。ひとりで出撃できます`, 'info')
              return
            }
            action()
          }
        }
      },
      h('span', `room-icon room-icon-${id}`),
      h('span', 'room-title', title),
      h('span', 'room-text', text),
      avail.ok ? null : h('span', 'chip room-soon', avail.reason)
    )
  const solo = () => {
    const lobby = ctx.lobbies.solo(sel, localChoice(ctx))
    ctx.open('lobby', { selection: sel, lobby })
  }
  const hostRoom = async () => {
    try {
      const lobby = await ctx.lobbies.host(sel, localChoice(ctx))
      ctx.open('lobby', { selection: sel, lobby })
    } catch (err) {
      ctx.toast(err instanceof Error ? err.message : 'ルームを作れませんでした', 'error')
    }
  }
  const joinRoom = async () => {
    const code = window.prompt?.('ルームコードを入力してください') ?? ''
    if (!code.trim()) return
    try {
      const lobby = await ctx.lobbies.join(code.trim(), localChoice(ctx))
      ctx.open('lobby', { selection: lobby.state().selection, lobby })
    } catch (err) {
      ctx.toast(err instanceof Error ? err.message : 'ルームに参加できませんでした', 'error')
    }
  }
  const label = sel.mode === 'pve' ? MODE_LABELS.pve : MODE_LABELS.pvp
  const el = h(
    'div',
    'screen room',
    screenHead({ title: label, en: 'ROOM', onBack: back }),
    h(
      'div',
      'screen-scroll',
      h(
        'div',
        'room-grid',
        option('solo', 'ひとりで', '空いた席はすべてボットが埋めます。すぐに出撃できます。', { ok: true }, solo, true),
        option(
          'host',
          'ルームを作る',
          sel.mode === 'pve' ? '最大4人の小隊を集めます。ルームコードを仲間に共有。' : '最大12人で演習します。',
          host,
          () => void hostRoom()
        ),
        option('join', 'ルームに参加', '仲間から聞いたルームコードで参加します。', join, () => void joinRoom())
      )
    ),
    hintBar([
      ['Enter', '決定'],
      ['Esc', 'もどる']
    ])
  )
  return { id: 'room', el, music: 'menu', back }
}

export function createTrainingScreen(ctx: AppContext): Screen {
  let infinite = false
  const toggle = h(
    'button',
    {
      class: 'toggle-row',
      attrs: { type: 'button', role: 'switch', 'aria-checked': 'false', 'data-sfx': 'uiTab' },
      on: {
        click: () => {
          infinite = !infinite
          toggle.setAttribute('aria-checked', String(infinite))
        }
      }
    },
    h('span', null, h('b', null, 'アニマ無限'), h('small', null, '自由練習で、アニマが減らなくなります')),
    h('span', 'switch', h('i'))
  )
  const start = (tutorial: boolean) => {
    const selection: MatchSelection = { mode: 'training', training: { tutorial, infiniteAnima: !tutorial && infinite } }
    const lobby = ctx.lobbies.solo(selection, localChoice(ctx))
    ctx.open('briefing', { selection, lobby, start: lobby.start() })
  }
  const el = h(
    'div',
    'screen training-setup',
    screenHead({ title: '訓練場', en: 'TRAINING', onBack: () => ctx.open('sortie') }),
    h(
      'div',
      'screen-scroll',
      h(
        'div',
        'room-grid',
        h(
          'button',
          {
            class: 'room-card',
            attrs: { type: 'button', 'data-autofocus': true, 'data-training': 'tutorial' },
            on: { click: () => start(true) }
          },
          h('span', 'room-icon room-icon-tutorial'),
          h('span', 'room-title', 'チュートリアル'),
          h('span', 'room-text', '移動、視点、ジャンプ、ダッシュ、両手のアンティーク、アニマと救助を順番に覚えます。'),
          ctx.progress.trainingDone ? h('span', 'chip chip-anima', '修了') : h('span', 'chip', 'はじめての方に')
        ),
        h(
          'div',
          'room-card is-static',
          h('span', 'room-icon room-icon-free'),
          h('span', 'room-title', '自由練習'),
          h('span', 'room-text', '的と仲間の人形がいる訓練場で、今の編成を試します。'),
          toggle,
          h(
            'button',
            {
              class: 'btn btn-primary',
              attrs: { type: 'button', 'data-training': 'free' },
              on: { click: () => start(false) }
            },
            '自由練習をはじめる'
          )
        )
      )
    ),
    hintBar([
      ['Enter', '決定'],
      ['Esc', 'もどる']
    ])
  )
  return { id: 'training', el, music: 'menu', back: () => ctx.open('sortie') }
}
