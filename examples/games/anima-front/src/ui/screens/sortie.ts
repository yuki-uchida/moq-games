/** 出撃: mode select, room choice (solo / host / join) and the training setup (DESIGN §17.3). */
import type { AppContext, Screen } from '../../app/context'
import type { LocalChoice } from '../../app/lobby'
import type { MatchSelection } from '../../app/match'
import { MODE_LABELS } from '../../app/match'
import { loadoutBlocker, resolveLoadout } from '../../app/saves'
import { SPECIES } from '../../data/species'
import { h } from '../dom'
import { hintBar, screenHead } from '../widgets'
import { cleanRoom, randomRoom, validRoom } from '../../app/online'

export function localChoice(ctx: AppContext): LocalChoice {
  const species = ctx.armory.species
  const { loadout, name } = resolveLoadout(ctx.armory, species)
  return { name: SPECIES[species].name, species, loadout, loadoutName: name }
}

/**
 * Refuses a sortie (and says why) while the loadout this animal would deploy with breaks the rules. A saved
 * loadout is never repaired behind the player's back, so a stored one with problems must be fixed first.
 */
export function refuseBlockedLoadout(ctx: AppContext): boolean {
  const message = loadoutBlocker(ctx.armory, ctx.armory.species)
  if (!message) return false
  ctx.sfx('uiError')
  ctx.toast(message, 'error')
  return true
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
    if (refuseBlockedLoadout(ctx)) return
    const lobby = ctx.lobbies.solo(sel, localChoice(ctx))
    ctx.open('lobby', { selection: sel, lobby })
  }
  const hostRoom = () => openRoomDialog(ctx, el, 'host', sel)
  const joinRoom = () => openRoomDialog(ctx, el, 'join', sel)
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
          hostRoom
        ),
        option('join', 'ルームに参加', '仲間から聞いたルームコードで参加します。', join, joinRoom)
      )
    ),
    hintBar([
      ['Enter', '決定'],
      ['Esc', 'もどる']
    ])
  )
  return { id: 'room', el, music: 'menu', back }
}

/**
 * The room-code dialog of ルームを作る / ルームに参加: a friendly random code (editable) or the code a friend
 * shared, validated as it is typed; connecting shows progress and Japanese errors (relay unreachable, room not
 * found). Closing it while connecting leaves the room once the connection settles.
 */
function openRoomDialog(ctx: AppContext, screen: HTMLElement, kind: 'host' | 'join', sel: MatchSelection) {
  let busy = false
  let closed = false
  const input = h('input', {
    class: 'room-code-input',
    attrs: {
      type: 'text',
      maxlength: 32,
      autocomplete: 'off',
      autocapitalize: 'off',
      spellcheck: 'false',
      inputmode: 'latin',
      'aria-label': 'ルームコード',
      'data-autofocus': true,
      placeholder: kind === 'host' ? 'sakura-1234' : 'ルームコード'
    },
    style: {
      width: '100%',
      'box-sizing': 'border-box',
      padding: '12px 14px',
      'border-radius': '12px',
      border: '1px solid var(--line)',
      background: 'rgba(8, 14, 32, 0.7)',
      'font-size': '20px',
      'letter-spacing': '0.08em',
      'margin-bottom': '10px'
    },
    on: {
      input: () => validate(false),
      keydown: (e) => {
        if (e.key === 'Enter') {
          e.preventDefault()
          void submit()
        }
      }
    }
  })
  if (kind === 'host') input.value = randomRoom()
  const note = h('p', { class: 'room-dialog-note', attrs: { role: 'alert', 'aria-live': 'polite' } })
  const go = h(
    'button',
    { class: 'btn btn-primary', attrs: { type: 'button', 'data-room-go': kind }, on: { click: () => void submit() } },
    kind === 'host' ? 'ルームを作る' : '参加する'
  )
  const cancel = h(
    'button',
    { class: 'btn', attrs: { type: 'button', 'data-sfx': 'uiBack' }, on: { click: () => close() } },
    'もどる'
  )
  const veil = h(
    'div',
    { class: 'modal-veil room-dialog', attrs: { role: 'dialog', 'aria-modal': 'true', 'aria-label': 'ルームコード' } },
    h(
      'div',
      'panel modal',
      h('h2', null, kind === 'host' ? 'ルームを作る' : 'ルームに参加'),
      h(
        'p',
        null,
        kind === 'host'
          ? 'このルームコードを仲間に伝えてください。好きなコードに書きかえても構いません。'
          : '仲間から聞いたルームコードを入力してください。'
      ),
      input,
      note,
      h('div', 'row', cancel, go)
    )
  )
  ;(veil as HTMLElement & { __close?: () => void }).__close = () => close()
  const setNote = (text: string, error = false) => {
    note.textContent = text
    note.style.setProperty('color', error ? 'var(--danger, #ff7a7a)' : 'var(--text-2)')
  }
  function validate(final: boolean): string | null {
    const code = cleanRoom(input.value)
    if (final && code !== input.value) input.value = code
    if (!code) {
      if (final) setNote('ルームコードを入力してください', true)
      return null
    }
    if (!validRoom(code)) {
      setNote('英小文字・数字・ハイフンで3〜32文字にしてください', true)
      return null
    }
    setNote(final ? '' : `ルームコード：${code}`)
    return code
  }
  function close() {
    closed = true
    veil.remove()
    screen.querySelector<HTMLElement>(`[data-room="${kind}"]`)?.focus()
  }
  async function submit() {
    if (busy) return
    if (refuseBlockedLoadout(ctx)) {
      setNote(loadoutBlocker(ctx.armory, ctx.armory.species) ?? '', true)
      return
    }
    const code = validate(true)
    if (!code) {
      ctx.sfx('uiError')
      return
    }
    busy = true
    go.setAttribute('disabled', '')
    input.setAttribute('disabled', '')
    setNote(kind === 'host' ? 'リレーに接続しています…' : 'ルームをさがしています…')
    try {
      const lobby =
        kind === 'host'
          ? await ctx.lobbies.host(sel, localChoice(ctx), code)
          : await ctx.lobbies.join(code, localChoice(ctx))
      if (closed) {
        lobby.leave()
        return
      }
      veil.remove()
      ctx.open('lobby', { selection: lobby.state().selection, lobby })
    } catch (err) {
      if (closed) return
      ctx.sfx('uiError')
      setNote(err instanceof Error ? err.message : 'ルームに接続できませんでした', true)
      busy = false
      go.removeAttribute('disabled')
      input.removeAttribute('disabled')
      input.focus()
    }
  }
  screen.append(veil)
  setNote(kind === 'host' ? '' : '例：sakura-1234')
  requestAnimationFrame(() => {
    input.focus()
    input.select()
  })
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
    if (refuseBlockedLoadout(ctx)) return
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
