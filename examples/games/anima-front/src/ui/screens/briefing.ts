/** Briefing (DESIGN §17.7): ゲンブ and ルリ portraits, typewriter lines, map, objective, squad, 出撃. */
import type { AppContext, Screen } from '../../app/context'
import type { Lobby, MatchStart } from '../../app/lobby'
import { MODE_LABELS, mapLabel, type MatchSelection } from '../../app/match'
import { DIFFICULTIES } from '../../data/enemies'
import { MISSIONS, PVP_RADIO, type RadioLine } from '../../data/missions'
import { h, setText } from '../dom'
import { speakerInfo, typedLength } from '../hud/model'
import { hintBar, portrait, screenHead, speciesBadge } from '../widgets'
import { missionArtSvg } from './missions'

const PVP_BRIEFING: RadioLine[] = [
  { who: 'genbu', text: '三つ巴演習を始める。相手は仲間だが、手は抜くな。実戦で生き残るための訓練だ。' },
  PVP_RADIO.start,
  { who: 'ruri', text: '撃破で1点、最後の60秒は2点です。自分の隊の拠点にいればアニマがどんどん回復しますよ！' }
]

const TRAINING_BRIEFING: Record<'tutorial' | 'free', RadioLine[]> = {
  tutorial: [
    { who: 'ruri', text: 'ようこそ訓練場へ！ わたし、オペレーターのルリです。今日は基本の動きを一緒に覚えましょう。' },
    { who: 'genbu', text: 'アニマは命であり、弾でもある。使い方を覚えた者だけが、生きて帰ってくる。' },
    { who: 'ruri', text: '画面の指示に従って進んでください。焦らなくて大丈夫ですよ！' }
  ],
  free: [
    { who: 'ruri', text: '自由練習モードです。的と人形を相手に、編成を好きなだけ試してください！' },
    { who: 'genbu', text: '推定継戦時間は目安だ。実際にどれだけ持つか、その体で確かめろ。' }
  ]
}

/** Header art of the briefing: the mission's preview, or the drill city / training yard. */
export function briefArtSvg(sel: MatchSelection): string {
  if (sel.mode === 'pve') return missionArtSvg(MISSIONS[sel.mission ?? 'sakura'])
  if (sel.mode === 'pvp') {
    let grid = ''
    for (let x = 0; x <= 320; x += 20) grid += `<line x1="${x}" y1="96" x2="${160 + (x - 160) * 2.4}" y2="160"/>`
    for (let y = 100; y <= 160; y += 10) grid += `<line x1="0" y1="${y}" x2="320" y2="${y}"/>`
    const tower = (x: number, w: number, h: number) =>
      `<rect x="${x}" y="${96 - h}" width="${w}" height="${h}" fill="rgba(160,230,255,0.12)" stroke="#7fe3ff" stroke-width="1"/>`
    return `<svg viewBox="0 0 320 160" preserveAspectRatio="xMidYMid slice" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">
<defs><linearGradient id="br-pvp" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#0e2a4a"/><stop offset="1" stop-color="#3a7fb0"/></linearGradient></defs>
<rect width="320" height="160" fill="url(#br-pvp)"/>${tower(20, 30, 50)}${tower(60, 22, 70)}${tower(140, 40, 82)}${tower(230, 26, 60)}${tower(270, 34, 44)}
<g stroke="rgba(127,227,255,0.35)" stroke-width="1">${grid}</g>
<circle cx="70" cy="120" r="9" fill="#e5484d"/><circle cx="160" cy="132" r="9" fill="#3e8ed0"/><circle cx="250" cy="120" r="9" fill="#f2b33d"/></svg>`
  }
  return `<svg viewBox="0 0 320 160" preserveAspectRatio="xMidYMid slice" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">
<defs><linearGradient id="br-tr" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#6aa8e8"/><stop offset="1" stop-color="#cfe6f5"/></linearGradient></defs>
<rect width="320" height="160" fill="url(#br-tr)"/><rect y="108" width="320" height="52" fill="#b98a5a"/>
<g fill="#ff8a3c">${[50, 110, 200, 260].map((x) => `<path d="M${x - 8} 124 L${x} 100 L${x + 8} 124 Z"/>`).join('')}</g>
<g fill="#f5f7fa" stroke="#e5484d" stroke-width="3">${[80, 160, 230].map((x) => `<circle cx="${x}" cy="96" r="10"/>`).join('')}</g></svg>`
}

export function briefingLines(sel: MatchSelection): RadioLine[] {
  if (sel.mode === 'pve') return MISSIONS[sel.mission ?? 'sakura'].briefing
  if (sel.mode === 'pvp') return PVP_BRIEFING
  return TRAINING_BRIEFING[sel.training?.tutorial ? 'tutorial' : 'free']
}

export function createBriefingScreen(
  ctx: AppContext,
  args: { selection: MatchSelection; lobby: Lobby; start: MatchStart }
): Screen {
  const { selection: sel, lobby, start } = args
  const lines = briefingLines(sel)
  let index = 0
  let t = 0
  let blipAt = 0

  const genbu = portrait('genbu', 'portrait brief-portrait')
  const ruri = portrait('ruri', 'portrait brief-portrait')
  const speaker = h('div', 'brief-speaker')
  const text = h('p', { class: 'brief-text', attrs: { 'aria-live': 'polite' } })
  const caret = h('span', 'brief-caret')
  const counter = h('span', 'brief-counter')
  const log = h('div', 'brief-log')
  const nextBtn = h(
    'button',
    {
      class: 'btn btn-ghost brief-next',
      attrs: { type: 'button', 'data-sfx': 'none' },
      on: { click: () => advance() }
    },
    '次へ'
  )

  const paintLine = () => {
    const line = lines[index]
    const info = speakerInfo(line.who)
    speaker.replaceChildren(h('b', null, info.name), h('small', null, info.title))
    genbu.classList.toggle('is-speaking', line.who === 'genbu')
    ruri.classList.toggle('is-speaking', line.who === 'ruri')
    setText(counter, `${index + 1} / ${lines.length}`)
  }
  function advance() {
    const line = lines[index]
    if (typedLength(line.text, t) < line.text.length) {
      t = 999
      return
    }
    if (index < lines.length - 1) {
      log.append(h('p', null, h('b', null, `${speakerInfo(line.who).name}：`), line.text))
      log.scrollTop = log.scrollHeight
      index++
      t = 0
      paintLine()
      ctx.sfx('uiMove')
    } else {
      go.focus()
    }
  }

  const go = h(
    'button',
    {
      class: 'btn btn-primary brief-go',
      attrs: { type: 'button', 'data-autofocus': true, 'data-sfx': 'uiStart' },
      on: { click: () => ctx.open('game', { selection: sel, start, lobby }) }
    },
    '出撃'
  )

  const info: [string, string][] = [['戦域', mapLabel(sel)]]
  if (sel.mode === 'pve') {
    const m = MISSIONS[sel.mission ?? 'sakura']
    info.push(
      ['目標', m.objective.label],
      ['規模', `${m.waves.length}波`],
      ['難易度', DIFFICULTIES[sel.difficulty ?? 'normal'].name]
    )
    info.push(['転送枠', String(DIFFICULTIES[sel.difficulty ?? 'normal'].tickets)])
  } else if (sel.mode === 'pvp') {
    info.push(['目標', '最も多く撃破した隊の勝利'], ['時間', '6分'], ['得点', '撃破 +1・ラストスパート +2'])
  } else {
    info.push(['内容', sel.training?.tutorial ? 'チュートリアル' : '自由練習'])
    if (sel.training?.infiniteAnima) info.push(['設定', 'アニマ無限'])
  }
  const title =
    sel.mode === 'pve'
      ? MISSIONS[sel.mission ?? 'sakura'].name
      : sel.mode === 'pvp'
        ? MODE_LABELS.pvp
        : MODE_LABELS.training
  const squad = lobby
    .state()
    .seats.filter((s) => s.team === lobby.state().seats[0].team)
    .slice(0, 4)

  const back = () => {
    if (sel.mode === 'training') ctx.open('training')
    else ctx.open('lobby', { selection: sel, lobby })
  }
  const el = h(
    'div',
    'screen briefing',
    screenHead({ title: 'ブリーフィング', en: 'BRIEFING', onBack: back }),
    h(
      'div',
      'brief-body',
      h(
        'section',
        'panel brief-radio',
        h('div', { class: 'brief-art', html: briefArtSvg(sel) }, h('div', 'brief-portraits', genbu, ruri)),
        h(
          'div',
          {
            class: 'brief-line',
            attrs: { 'data-nav': '', tabindex: '0', role: 'button', 'aria-label': '次のせりふ' },
            on: { click: () => advance() }
          },
          log,
          h('div', 'brief-line-head', speaker, counter),
          h('div', 'brief-text-wrap', text, caret)
        ),
        nextBtn
      ),
      h(
        'aside',
        'panel brief-side',
        h('div', 'brief-title', h('small', null, 'OPERATION'), h('b', null, title)),
        h(
          'dl',
          'brief-info',
          info.map(([k, v]) => [h('dt', null, k), h('dd', null, v)])
        ),
        h('h3', 'panel-title', sel.mode === 'pvp' ? 'あなたの隊' : '小隊'),
        h(
          'div',
          'brief-squad',
          squad.map((s) =>
            h(
              'div',
              'brief-member',
              speciesBadge(s.species, 34),
              h('span', null, s.name, s.bot != null ? h('small', null, 'BOT') : null)
            )
          )
        ),
        go
      )
    ),
    hintBar([
      ['Space', '次のせりふ'],
      ['Enter', '出撃'],
      ['Esc', 'もどる']
    ])
  )
  const onKey = (e: KeyboardEvent) => {
    if (e.code === 'Space' && document.activeElement !== go) {
      e.preventDefault()
      advance()
    }
  }
  paintLine()
  return {
    id: 'briefing',
    el,
    music: 'briefing',
    back,
    enter() {
      window.addEventListener('keydown', onKey)
    },
    leave() {
      window.removeEventListener('keydown', onKey)
    },
    frame(dt) {
      const line = lines[index]
      const before = typedLength(line.text, t)
      t += dt
      const n = typedLength(line.text, t)
      if (n !== before) {
        setText(text, line.text.slice(0, n))
        blipAt += n - before
        if (blipAt >= 3) {
          blipAt = 0
          ctx.sfx('typeBlip')
        }
      }
      caret.classList.toggle('is-done', n >= line.text.length)
    }
  }
}
