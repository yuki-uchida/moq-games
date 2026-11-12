/** Mission select (DESIGN §17.4): cards with preview, lock state, best rank; difficulty; then the room choice. */
import type { AppContext, Screen } from '../../app/context'
import { mapLabel } from '../../app/match'
import { missionUnlocked } from '../../app/saves'
import { DIFFICULTIES, type Difficulty } from '../../data/enemies'
import { MISSION_ORDER, type MissionDef, type MissionId } from '../../data/missions'
import { h, setText } from '../dom'
import { hintBar, screenHead } from '../widgets'

let lastMission: MissionId | null = null
let lastDifficulty: Difficulty = 'normal'

const THEME: Record<string, [string, string, string]> = {
  sakura: ['#3b5fa8', '#f4b9a6', '#ffd6e0'],
  harbor: ['#3a2f6b', '#ff9a5a', '#ffd08a'],
  nightraid: ['#070b1e', '#1c2a5a', '#ffcf6e'],
  blight: ['#1e0f3a', '#6b3fa0', '#c58cff'],
  maw: ['#12061f', '#4a1a5e', '#ff6ad5']
}

/** Stylized preview art per mission: sky by theme, a ruined skyline and the objective. */
export function missionArtSvg(m: MissionDef): string {
  const [top, mid, accent] = THEME[m.id] ?? THEME.sakura
  let seed = m.index * 97
  const rnd = () => (seed = (seed * 16807) % 2147483647) / 2147483647
  let skyline = ''
  for (let x = -10; x < 330; ) {
    const w = 18 + rnd() * 34
    const hgt = 30 + rnd() * 60
    const broken = rnd() > 0.6
    skyline += broken
      ? `<path d="M${x} 150 L${x} ${150 - hgt} L${x + w * 0.6} ${150 - hgt + 12} L${x + w} ${150 - hgt * 0.7} L${x + w} 150 Z"/>`
      : `<rect x="${x}" y="${150 - hgt}" width="${w}" height="${hgt}"/>`
    x += w + 2 + rnd() * 10
  }
  const obj: Record<string, string> = {
    defend: `<rect x="150" y="48" width="20" height="70" rx="4" fill="#e8ecf8"/><circle cx="160" cy="44" r="12" fill="${accent}"/><circle cx="160" cy="44" r="30" fill="${accent}" opacity="0.2"/>`,
    capture: `<circle cx="80" cy="128" r="16" fill="none" stroke="${accent}" stroke-width="4"/><circle cx="160" cy="122" r="16" fill="none" stroke="${accent}" stroke-width="4"/><circle cx="240" cy="128" r="16" fill="none" stroke="${accent}" stroke-width="4"/><text x="80" y="134" font-size="16" text-anchor="middle" fill="${accent}" font-weight="800">A</text><text x="160" y="128" font-size="16" text-anchor="middle" fill="${accent}" font-weight="800">B</text><text x="240" y="134" font-size="16" text-anchor="middle" fill="${accent}" font-weight="800">C</text>`,
    escort: `<rect x="132" y="104" width="56" height="26" rx="8" fill="#c79a5a"/><circle cx="144" cy="134" r="8" fill="#3a2a20"/><circle cx="176" cy="134" r="8" fill="#3a2a20"/><rect x="148" y="94" width="24" height="14" rx="4" fill="${accent}"/>`,
    destroy: `<ellipse cx="90" cy="120" rx="18" ry="24" fill="${accent}" opacity="0.85"/><ellipse cx="170" cy="110" rx="20" ry="28" fill="${accent}" opacity="0.85"/><ellipse cx="248" cy="122" rx="16" ry="22" fill="${accent}" opacity="0.85"/>`,
    boss: `<path d="M110 150 Q120 60 160 40 Q200 60 210 150 Z" fill="#2a0f3a"/><circle cx="160" cy="80" r="16" fill="${accent}"/><circle cx="160" cy="80" r="34" fill="${accent}" opacity="0.18"/>`
  }
  return `<svg viewBox="0 0 320 160" preserveAspectRatio="xMidYMid slice" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">
<defs><linearGradient id="ms-${m.id}" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="${top}"/><stop offset="1" stop-color="${mid}"/></linearGradient></defs>
<rect width="320" height="160" fill="url(#ms-${m.id})"/>
${m.variant === 'night' ? '<circle cx="262" cy="36" r="14" fill="#fff6d8"/>' : ''}
<g fill="rgba(10,14,34,0.78)">${skyline}</g>
${obj[m.objective.kind] ?? ''}
<rect y="148" width="320" height="12" fill="rgba(10,14,34,0.9)"/>
</svg>`
}

export function createMissionsScreen(ctx: AppContext): Screen {
  const unlocked = (m: MissionDef) => missionUnlocked(ctx.progress, m.id)
  let selected: MissionDef =
    MISSION_ORDER.find((m) => m.id === lastMission && unlocked(m)) ??
    [...MISSION_ORDER].reverse().find((m) => unlocked(m) && !ctx.progress.cleared.includes(m.id)) ??
    MISSION_ORDER[0]
  let difficulty: Difficulty = lastDifficulty

  const cards = MISSION_ORDER.map((m) => {
    const open = unlocked(m)
    const best = ctx.progress.best[m.id]
    const card = h(
      'button',
      {
        class: `mission-card ${open ? '' : 'is-locked'}`,
        attrs: {
          type: 'button',
          'data-mission': m.id,
          'aria-disabled': open ? undefined : 'true',
          'data-sfx': open ? 'uiTab' : 'uiError'
        },
        on: {
          click: () => {
            if (!open) {
              ctx.toast('前の任務をクリアすると解放されます', 'info')
              return
            }
            select(m)
          },
          focus: () => open && select(m)
        }
      },
      h('span', { class: 'mission-art', html: missionArtSvg(m) }),
      h('span', 'mission-no', `任務 ${String(m.index).padStart(2, '0')}`),
      h('span', 'mission-name', m.name),
      h('span', 'mission-sum', open ? m.summary : '前の任務をクリアすると解放'),
      open ? null : h('span', 'mission-lock', ''),
      best ? h('span', `rank-badge rank-${best.rank}`, best.rank) : null,
      ctx.progress.cleared.includes(m.id) ? h('span', 'chip chip-anima mission-clear', 'CLEAR') : null
    )
    return card
  })

  const dName = h('h2', 'md-name')
  const dMap = h('span', 'chip')
  const dObj = h('span', 'chip chip-anima')
  const dSum = h('p', 'md-sum')
  const dBest = h('div', 'md-best')
  const dArt = h('div', 'md-art')
  const diffButtons = (Object.keys(DIFFICULTIES) as Difficulty[]).map((d) =>
    h(
      'button',
      {
        class: `seg-btn diff-${d}`,
        attrs: { type: 'button', role: 'radio', 'data-diff': d, 'data-sfx': 'uiTab' },
        on: {
          click: () => {
            difficulty = d
            lastDifficulty = d
            paintDiff()
          }
        }
      },
      h('b', null, DIFFICULTIES[d].name),
      h('small', null, `転送枠 ${DIFFICULTIES[d].tickets}`)
    )
  )
  const diffNote = h('p', 'md-diffnote')
  const paintDiff = () => {
    for (const b of diffButtons) b.setAttribute('aria-checked', String(b.dataset.diff === difficulty))
    const d = DIFFICULTIES[difficulty]
    setText(
      diffNote,
      difficulty === 'easy'
        ? `敵の体力・攻撃力 ×${d.hp}。はじめての方や、編成を試したい時に。`
        : difficulty === 'hard'
          ? `敵の体力 ×${d.hp}、攻撃力 ×${d.damage}。転送枠は3つだけ。`
          : '標準の任務。ランクを狙うならここから。'
    )
  }
  const go = h(
    'button',
    {
      class: 'btn btn-primary md-go',
      attrs: { type: 'button', 'data-go': '' },
      on: {
        click: () => {
          lastMission = selected.id
          ctx.open('room', { selection: { mode: 'pve', mission: selected.id, difficulty } })
        }
      }
    },
    'この任務に出撃'
  )
  const detail = h(
    'aside',
    'panel mission-detail',
    dArt,
    h('div', 'md-body', h('div', 'md-tags', dMap, dObj), dName, dSum, dBest),
    h(
      'div',
      'md-diff',
      h('h3', 'panel-title', '難易度'),
      h('div', { class: 'seg', attrs: { role: 'radiogroup' } }, diffButtons),
      diffNote
    ),
    go
  )

  function select(m: MissionDef) {
    selected = m
    for (const c of cards) c.classList.toggle('is-selected', c.dataset.mission === m.id)
    dArt.innerHTML = missionArtSvg(m)
    setText(dName, m.name)
    setText(dMap, mapLabel({ mode: 'pve', mission: m.id }))
    setText(dObj, m.objective.label)
    setText(dSum, m.summary)
    const best = ctx.progress.best[m.id]
    dBest.replaceChildren(
      best
        ? h(
            'span',
            null,
            '最高ランク ',
            h('b', `rank-text rank-${best.rank}`, best.rank),
            `（${DIFFICULTIES[best.difficulty].name}・${best.score}点）`
          )
        : h('span', null, ctx.progress.cleared.includes(m.id) ? 'クリア済み' : '未クリア')
    )
  }
  select(selected)
  paintDiff()
  const selCard = cards.find((c) => c.dataset.mission === selected.id)
  selCard?.setAttribute('data-autofocus', '')

  const el = h(
    'div',
    'screen missions',
    screenHead({ title: '防衛任務', en: 'MISSIONS', onBack: () => ctx.open('sortie') }),
    h('div', 'missions-body', h('div', 'mission-list screen-scroll', cards), detail),
    hintBar([
      ['↑↓', '任務'],
      ['Enter', '決定'],
      ['Esc', 'もどる']
    ])
  )
  return { id: 'missions', el, music: 'menu', back: () => ctx.open('sortie') }
}
