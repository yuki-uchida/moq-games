/** Results (DESIGN §17.10): banner, rank count-up (PvE), team placings (PvP), per-player stats, MVP, next steps. */
import type { AppContext, ResultsArgs, Screen } from '../../app/context'
import { TEAMS } from '../../app/match'
import { DIFFICULTIES } from '../../data/enemies'
import { MISSIONS } from '../../data/missions'
import { SPECIES } from '../../data/species'
import { h, setText } from '../dom'
import { countUp, fallbackRank, formatClock, pickMvp, placings, statRows, type StatRow } from '../hud/model'
import { hintBar, speciesBadge } from '../widgets'

export type Outcome = 'victory' | 'defeat' | 'draw'

export function outcomeOf(args: Pick<ResultsArgs, 'view' | 'me'>): Outcome {
  const { view, me } = args
  if (view.mode === 'pvp') {
    const myTeam = view.players.find((p) => p.id === me)?.team ?? 0
    const w = view.pvp?.winner
    if (w === undefined || w === -1) {
      if (view.phase === 'draw' || w === -1) return 'draw'
      const places = placings(view.pvp?.scores ?? [0, 0, 0])
      const mine = places.find((p) => p.team === myTeam)
      if (!mine || mine.place > 1) return 'defeat'
      return places.filter((p) => p.place === 1).length > 1 ? 'draw' : 'victory'
    }
    return w === myTeam ? 'victory' : 'defeat'
  }
  if (view.phase === 'victory') return 'victory'
  if (view.phase === 'draw') return 'draw'
  return view.mode === 'training' ? 'victory' : 'defeat'
}

const BANNER: Record<string, Record<Outcome, [string, string]>> = {
  pve: {
    victory: ['任務成功', 'MISSION COMPLETE'],
    defeat: ['任務失敗', 'MISSION FAILED'],
    draw: ['任務終了', 'MISSION END']
  },
  pvp: { victory: ['勝利', 'VICTORY'], defeat: ['敗北', 'DEFEAT'], draw: ['引き分け', 'DRAW'] },
  training: {
    victory: ['訓練終了', 'TRAINING COMPLETE'],
    defeat: ['訓練終了', 'TRAINING END'],
    draw: ['訓練終了', 'TRAINING END']
  }
}

export function createResultsScreen(ctx: AppContext, args: ResultsArgs): Screen {
  const { view, me, selection, lobby } = args
  const outcome = outcomeOf(args)
  const [ja, en] = BANNER[view.mode][outcome]
  const rows = statRows(view)
  const mvp = pickMvp(view)
  const mine = rows.find((r) => r.id === me)

  const banner = h('div', `res-banner is-${outcome}`, h('small', null, en), h('h1', null, ja))
  const top: (Node | null)[] = []
  let scoreEl: HTMLElement | null = null
  let scoreTarget = 0
  if (view.mode === 'pve') {
    const m = MISSIONS[view.pve?.mission ?? selection.mission ?? 'sakura']
    const r = view.pve?.result
    const rank =
      r?.rank ??
      fallbackRank(
        outcome === 'victory',
        rows.reduce((a, b) => a + b.downs, 0)
      )
    scoreTarget = r?.score ?? 0
    scoreEl = h('b', 'res-score-num', '0')
    top.push(
      h(
        'div',
        'panel res-rank',
        h('div', `res-rank-letter rank-${rank}`, rank),
        h(
          'div',
          'res-rank-info',
          h('small', null, `${m.name}・${DIFFICULTIES[view.pve?.difficulty ?? selection.difficulty ?? 'normal'].name}`),
          h('div', 'res-score', h('span', null, 'スコア'), scoreEl),
          h('div', 'res-time', `クリアタイム ${formatClock(r?.time ?? view.clock)}`),
          args.newBest ? h('span', 'chip chip-anima', '自己ベスト更新') : null,
          args.unlocked
            ? h(
                'span',
                'chip res-unlock',
                `新しい任務「${MISSIONS[args.unlocked as keyof typeof MISSIONS]?.name ?? ''}」が解放されました`
              )
            : null
        )
      )
    )
  } else if (view.mode === 'pvp') {
    const myTeam = view.players.find((p) => p.id === me)?.team ?? 0
    top.push(
      h(
        'div',
        'panel res-places',
        placings(view.pvp?.scores ?? [0, 0, 0]).map((p) => {
          const t = TEAMS[p.team]
          return h(
            'div',
            { class: `res-place ${p.team === myTeam ? 'is-mine' : ''}`, style: { '--team': t.color } },
            h('span', 'res-place-n', `${p.place}位`),
            h('span', `res-place-bar pat-${t.pattern}`),
            h('b', null, t.name),
            h('span', 'res-place-score', `${p.score}`)
          )
        })
      )
    )
  }
  const mvpRow = rows.find((r) => r.id === mvp)
  if (mvpRow) {
    top.push(
      h(
        'div',
        'panel res-mvp',
        h('small', null, 'MVP'),
        speciesBadge(mvpRow.species, 64),
        h('b', null, mvpRow.name),
        h('span', null, `${SPECIES[mvpRow.species].kind}・撃破 ${mvpRow.kos}・救助 ${mvpRow.revives}`)
      )
    )
  }

  const cols: [keyof StatRow, string][] = [
    ['kos', '撃破'],
    ['assists', '支援'],
    ['downs', 'ダウン'],
    ['revives', '救助'],
    ['damage', 'ダメージ'],
    ['spent', '消費'],
    ['gathered', '回収']
  ]
  const ordered = view.mode === 'pvp' ? [...rows].sort((a, b) => a.team - b.team || b.kos - a.kos) : rows
  const table = h(
    'table',
    'res-table',
    h(
      'thead',
      null,
      h(
        'tr',
        null,
        h('th', null, '隊員'),
        cols.map(([, l]) => h('th', null, l)),
        h('th', null, 'よく使ったアンティーク')
      )
    ),
    h(
      'tbody',
      null,
      ordered.map((r) =>
        h(
          'tr',
          {
            class: `${r.id === me ? 'is-me' : ''} ${r.id === mvp ? 'is-mvp' : ''}`,
            style: view.mode === 'pvp' ? { '--team': TEAMS[r.team].color } : undefined
          },
          h(
            'th',
            null,
            h('span', 'res-name', speciesBadge(r.species, 28), r.name, r.bot ? h('small', null, 'BOT') : null)
          ),
          cols.map(([k]) => h('td', null, String(r[k]))),
          h('td', 'res-fav', r.favorite)
        )
      )
    )
  )

  const again = h(
    'button',
    {
      class: 'btn btn-primary',
      attrs: { type: 'button', 'data-autofocus': true, 'data-again': '', 'data-sfx': 'uiStart' },
      on: {
        click: () => {
          if (!lobby) return ctx.open('sortie')
          try {
            ctx.open('game', { selection, start: lobby.start(), lobby })
          } catch (err) {
            ctx.toast(err instanceof Error ? err.message : '開始できませんでした', 'error')
          }
        }
      }
    },
    'もう一度'
  )
  const toLobby = h(
    'button',
    {
      class: 'btn',
      attrs: { type: 'button', 'data-lobby': '' },
      on: {
        click: () => {
          if (lobby && selection.mode !== 'training') ctx.open('lobby', { selection, lobby })
          else if (selection.mode === 'training') ctx.open('training')
          else ctx.open('sortie')
        }
      }
    },
    selection.mode === 'training' ? '訓練場へ' : 'ロビーへ'
  )
  const toTitle = h(
    'button',
    { class: 'btn btn-ghost', attrs: { type: 'button', 'data-title': '' }, on: { click: () => ctx.open('title') } },
    'タイトルへ'
  )

  const el = h(
    'div',
    `screen results is-${outcome}`,
    banner,
    h('div', 'screen-scroll res-body', h('div', 'res-top', top), h('div', 'panel res-table-wrap', table)),
    h(
      'div',
      'res-actions',
      mine ? h('span', 'res-me', `あなた：撃破 ${mine.kos}・ダメージ ${mine.damage}`) : null,
      h('div', 'grow'),
      toTitle,
      toLobby,
      again
    ),
    hintBar([
      ['Enter', '決定'],
      ['Esc', 'タイトルへ']
    ])
  )
  let t = 0
  return {
    id: 'results',
    el,
    music: outcome === 'victory' ? 'win' : outcome === 'defeat' ? 'lose' : 'menu',
    backdrop: 'menu',
    back: () => ctx.open('title'),
    enter() {
      ctx.sfx(outcome === 'victory' ? 'victory' : outcome === 'defeat' ? 'defeat' : 'uiSelect')
    },
    frame(dt) {
      if (!scoreEl) return
      t += dt
      setText(scoreEl, String(countUp(scoreTarget, Math.max(0, t - 0.5), 1.4)))
    }
  }
}
