/**
 * Results (DESIGN §17.10): the squad celebrating (or slumping) on the plaza behind the panels with the MVP in a
 * spotlight, the banner, the PvE score count-up and rank stamp, PvP placings in team colours and patterns,
 * per-player stats and the next steps.
 */
import type { AppContext, ResultsArgs, Screen } from '../../app/context'
import { TEAMS } from '../../app/match'
import { DIFFICULTIES } from '../../data/enemies'
import { MISSIONS } from '../../data/missions'
import { SPECIES } from '../../data/species'
import { h, setText } from '../dom'
import { countUp, fallbackRank, formatClock, pickMvp, placings, statRows, type StatRow } from '../hud/model'
import { hintBar, speciesBadge } from '../widgets'
import { outcomeOf, RANK_STAMP_AT, resultsCast, SCORE_COUNT, type Outcome } from './results-model'

export { outcomeOf, type Outcome }

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

const PLACE_LABEL = ['', '1位', '2位', '3位']

const SPECTATED: [string, string] = ['観戦終了', 'SPECTATED']

export function createResultsScreen(ctx: AppContext, args: ResultsArgs): Screen {
  const { view, selection, lobby } = args
  const spectator = !!args.spectator
  // A spectator's results name nobody as「あなた」 (it followed one of them).
  const me = spectator ? '' : args.me
  // PvE: the squad's result; PvP: a spectator has no side to win or lose.
  const neutral = spectator && view.mode === 'pvp'
  const outcome = neutral ? 'draw' : outcomeOf({ view, me: args.me })
  const [ja, en] = neutral ? SPECTATED : BANNER[view.mode][outcome]
  const rows = statRows(view)
  const mvp = pickMvp(view)
  const mine = rows.find((r) => r.id === me)
  const myTeam = view.players.find((p) => p.id === (spectator ? args.me : me))?.team ?? 0

  const banner = h('div', `res-banner is-${outcome}`, h('small', null, en), h('h1', null, ja))
  const top: (Node | null)[] = []
  let scoreEl: HTMLElement | null = null
  let rankEl: HTMLElement | null = null
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
    scoreTarget = Math.round(r?.score ?? 0)
    scoreEl = h('b', 'res-score-num', '0')
    rankEl = h('div', { class: `res-rank-letter rank-${rank}`, attrs: { 'aria-label': `ランク ${rank}` } }, rank)
    top.push(
      h(
        'div',
        'panel res-rank',
        h('div', 'res-rank-slot', h('small', null, 'RANK'), rankEl),
        h(
          'div',
          'res-rank-info',
          h('small', null, `${m.name}・${DIFFICULTIES[view.pve?.difficulty ?? selection.difficulty ?? 'normal'].name}`),
          h('div', 'res-score', h('span', null, 'スコア'), scoreEl),
          h('div', 'res-time', `クリアタイム ${formatClock(r?.time ?? view.clock)}`),
          h(
            'div',
            'res-chips',
            spectator
              ? h('span', { class: 'chip', attrs: { 'data-spectated': '' } }, '観戦のため記録されません')
              : null,
            args.newBest && !spectator ? h('span', 'chip chip-anima', '自己ベスト更新') : null,
            args.unlocked && !spectator
              ? h(
                  'span',
                  'chip res-unlock',
                  `新しい任務「${MISSIONS[args.unlocked as keyof typeof MISSIONS]?.name ?? ''}」が解放されました`
                )
              : null
          )
        )
      )
    )
  } else if (view.mode === 'pvp') {
    const places = placings(view.pvp?.scores ?? [0, 0, 0])
    const best = Math.max(1, ...places.map((p) => p.score))
    top.push(
      h(
        'div',
        'panel res-places',
        places.map((p, i) => {
          const t = TEAMS[p.team]
          return h(
            'div',
            {
              class: `res-place place-${p.place} ${p.team === myTeam ? 'is-mine' : ''}`,
              style: { '--team': t.color, '--i': String(i), '--fill': `${Math.round((p.score / best) * 100)}%` }
            },
            h('span', 'res-place-n', PLACE_LABEL[p.place] ?? `${p.place}位`),
            h('span', `res-place-flag pat-${t.pattern}`),
            h(
              'span',
              'res-place-name',
              h('b', null, t.name),
              p.team === myTeam ? h('small', null, spectator ? '観戦した隊' : 'あなたの隊') : null,
              h('i', 'res-place-meter', h('i', null))
            ),
            h('span', 'res-place-score', `${p.score}`, h('small', null, '点'))
          )
        })
      )
    )
  }

  const mvpRow = rows.find((r) => r.id === mvp)
  // the MVP's name plate sits under the spotlight on the plaza (and in a card on narrow screens)
  const mvpPlate = mvpRow
    ? h(
        'div',
        { class: `res-mvp ${mvpRow.team === myTeam || view.mode !== 'pvp' ? 'is-squad' : ''}` },
        h('small', null, 'MVP'),
        h('span', 'res-mvp-badge', speciesBadge(mvpRow.species, 44)),
        h(
          'span',
          'res-mvp-text',
          h('b', null, mvpRow.name, mvpRow.id === me ? h('em', null, 'あなた') : null),
          h('span', null, `${SPECIES[mvpRow.species].kind}・撃破 ${mvpRow.kos}・救助 ${mvpRow.revives}`)
        )
      )
    : null

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
        h('th', 'res-fav', 'よく使ったアンティーク')
      )
    ),
    h(
      'tbody',
      null,
      ordered.map((r, i) =>
        h(
          'tr',
          {
            class: `${r.id === me ? 'is-me' : ''} ${r.id === mvp ? 'is-mvp' : ''}`,
            style: { '--i': String(i), ...(view.mode === 'pvp' ? { '--team': TEAMS[r.team].color } : {}) }
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
    `screen results is-${outcome} mode-${view.mode}`,
    banner,
    h(
      'div',
      'screen-scroll res-body',
      h('div', 'res-main', h('div', 'res-top', top), h('div', 'panel res-table-wrap', table)),
      h('div', 'res-stage', mvpPlate)
    ),
    h(
      'div',
      'res-actions',
      mine
        ? h('span', 'res-me', h('b', null, 'あなた'), `撃破 ${mine.kos}・救助 ${mine.revives}・ダメージ ${mine.damage}`)
        : spectator
          ? h(
              'span',
              { class: 'res-me', attrs: { 'data-spectated': '' } },
              h('b', null, '観戦'),
              '戦績・進行には記録されません'
            )
          : null,
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
  let stamped = !rankEl
  return {
    id: 'results',
    el,
    music: outcome === 'victory' ? 'win' : outcome === 'defeat' ? 'lose' : 'menu',
    backdrop: 'results',
    back: () => ctx.open('title'),
    enter() {
      ctx.sfx(outcome === 'victory' ? 'victory' : outcome === 'defeat' ? 'defeat' : 'uiSelect')
      ctx.backdrop?.setCast(resultsCast(view, spectator ? args.me : me, outcome))
    },
    frame(dt) {
      t += dt
      if (scoreEl)
        setText(scoreEl, String(countUp(scoreTarget, Math.max(0, t - SCORE_COUNT.delay), SCORE_COUNT.duration)))
      if (!stamped && t >= RANK_STAMP_AT && rankEl) {
        stamped = true
        rankEl.classList.add('is-in')
        ctx.sfx('scoreUp')
      }
    }
  }
}
