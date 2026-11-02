import type { FeelSound } from '../audio/FeelSounds'
import { STAR_GOALS } from '../progression/StageProgress'

/** Everything the end-of-stage card needs; main.ts gathers it, this module only presents it. */
export interface ResultView {
  won: boolean
  finished: boolean
  stars: number
  improved: boolean
  /** Stage clear reward (0 on defeat). */
  reward: number
  bounty: number
  /** Number of enemies defeated, or null when unknown (resumed checkpoint). */
  kills: number | null
  /** Special moves cast this battle (0 shows "必殺技 0回"). */
  specials: number
  hp: number
  maxHp: number
  seconds: number
  /** Stage number unlocked for the first time by this clear. */
  unlocked: number | null
  /** Show the final numbers at once (reduced motion, resumed checkpoints). */
  instant: boolean
}

export const REVEAL_DELAY_MS = 1600
const STAR_FIRST_MS = 450
const STAR_GAP_MS = 260
const COUNT_MS = 800

const STAR =
  '<svg viewBox="0 0 48 48" aria-hidden="true"><path d="m24 3 6.2 13.4 14.6 1.7-10.8 10 2.9 14.5L24 35.4 11.1 42.6l2.9-14.5-10.8-10 14.6-1.7Z" fill="currentColor" stroke="currentColor" stroke-width="3" stroke-linejoin="round"/></svg>'
const COIN =
  '<svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="12" r="10" fill="#e9c46a" stroke="#a9792b" stroke-width="2"/><circle cx="12" cy="12" r="5.5" fill="none" stroke="#a9792b" stroke-width="1.6"/></svg>'
const SWORD =
  '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="m5 19 11-11M14 4h6v6M5 19l-1.5 1.5M8 16l-3 3" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"/></svg>'
const HEART =
  '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 21C5 15.5 3 12 3 8.8A4.8 4.8 0 0 1 12 6.6 4.8 4.8 0 0 1 21 8.8C21 12 19 15.5 12 21Z" fill="currentColor"/></svg>'
const SPARK =
  '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 1.5 14.6 9.4 22.5 12l-7.900 2.600L12 22.500 9.400 14.600 1.500 12l7.900-2.600Z" fill="currentColor"/></svg>'
const CLOCK =
  '<svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="12" r="9" fill="none" stroke="currentColor" stroke-width="2.4"/><path d="M12 7v5l3.5 2" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round"/></svg>'

/** The whole #result dialog; ids are relied on by main.ts and the e2e specs. */
export const resultMarkup = (icon: string): string =>
  `<dialog id="result" class="result" aria-labelledby="result-title" aria-describedby="reward"><div id="result-confetti" class="result-confetti" aria-hidden="true"></div><div class="result-main"><div id="result-icon" class="result-icon" aria-hidden="true">${icon}</div><span id="result-eyebrow" class="eyebrow">MOSSVALE EXPEDITION</span><h2 id="result-title"></h2><div id="result-stars" class="result-stars" role="img" aria-label="">${STAR.repeat(3).replaceAll('<svg', '<svg class="rs"')}</div><p id="result-hint" class="result-hint"></p><div class="result-tags"><span id="result-new" class="result-tag new" hidden></span><span id="result-best" class="result-tag best" hidden>ベスト更新!</span></div></div><div class="result-side"><ul class="result-lines"><li id="result-line-clear" data-line>${COIN}<span>クリア報酬</span><b id="result-clear-gold"></b></li><li id="result-line-bounty" data-line>${SWORD}<span>撃破ボーナス</span><b id="result-bounty"></b></li></ul><div class="result-summary" data-line><span id="result-stage"></span><b id="result-gold"></b></div><ul class="result-chips" data-line><li id="chip-kills">${SWORD}<span></span></li><li id="chip-specials">${SPARK}<span></span></li><li id="chip-hp">${HEART}<span></span></li><li id="chip-time">${CLOCK}<span></span></li></ul><p id="reward" data-line></p><div class="result-actions"><button id="next" class="primary">次のステージへ →</button><button id="retry-stage">もう一度</button><button id="retry" class="text-button">ステージ選択へ</button></div></div><button id="result-title-return" class="text-button unused-navigation" tabindex="-1">保存してタイトルに戻る</button><details class="ui-help result-note"><summary>次のステージへの引き継ぎ</summary><small>コイン・招集した仲間・編成は引き継ぎます。配置・レベル・装備・道のアイテム・門の強化はステージごとにリセット。</small></details></dialog>`

const TIPS = [
  '盾の騎士を道の上に置くと敵を足止めできる',
  '必殺技は敵が固まった時に',
  '射程の長い仲間は道の曲がり角の内側へ',
  '×2速で待ち時間を短縮'
]
/** Deterministic so a retried stage keeps its hint instead of flickering between loads. */
export const defeatTip = (stage: number): string => TIPS[(stage - 1) % TIPS.length]

export const formatClock = (seconds: number): string =>
  `${String(Math.floor(seconds / 60)).padStart(2, '0')}:${String(Math.floor(seconds % 60)).padStart(2, '0')}`

export const prefersReducedMotion = (): boolean =>
  typeof matchMedia === 'function' && matchMedia('(prefers-reduced-motion: reduce)').matches

const HINTS = ['', `${STAR_GOALS[1]}で★2`, `${STAR_GOALS[2]}で★3`, `パーフェクト！${STAR_GOALS[2]}`]
const CONFETTI_COLORS = ['#f0bd3a', '#e2574c', '#5fa86a', '#4a9bd0', '#f08a3c', '#b36bd0']

function confetti(host: HTMLElement, count: number): void {
  host.replaceChildren()
  for (let i = 0; i < count; i++) {
    const piece = document.createElement('i'),
      // Spread by index so the burst has the same shape every time.
      angle = (i / count) * Math.PI * 2 + Math.sin(i * 12.9898) * 0.25,
      reach = 170 + ((i * 53) % 150)
    piece.style.cssText = `--dx:${Math.round(Math.cos(angle) * reach * 1.5)}px;--dy:${Math.round(Math.sin(angle) * reach * 0.8 - 90)}px;--fall:${300 + ((i * 37) % 160)}px;--rot:${((i * 97) % 720) - 360}deg;--d:${(i % 6) * 40}ms;background:${CONFETTI_COLORS[i % CONFETTI_COLORS.length]}`
    piece.addEventListener('animationend', () => piece.remove(), { once: true })
    host.append(piece)
  }
}

export interface ResultCard {
  /** Fill the card and start the reveal. */
  show(view: ResultView): void
  /** Stop timers and effects (new battle, title, reset). */
  cancel(): void
}

export function createResultCard(dialog: HTMLElement, play: (kind: FeelSound, param?: number) => void): ResultCard {
  const $ = <T extends HTMLElement>(id: string) => dialog.querySelector<T>(`#${id}`)!
  const timers: number[] = []
  let raf = 0
  const cancel = () => {
    for (const id of timers) clearTimeout(id)
    timers.length = 0
    cancelAnimationFrame(raf)
    $('result-confetti').replaceChildren()
  }
  const at = (ms: number, fn: () => void) => void timers.push(window.setTimeout(fn, ms))
  const reveal = (el: Element | null) => el?.setAttribute('data-shown', '')
  const coins = (n: number) => `+${n} コイン`

  function show(v: ResultView): void {
    cancel()
    const total = v.reward + v.bounty,
      lines = Array.from(dialog.querySelectorAll('[data-line]'))
    for (const el of lines) el.removeAttribute('data-shown')
    dialog.dataset.stars = String(v.stars)
    const starBox = $('result-stars')
    starBox.hidden = !v.won
    starBox.setAttribute('aria-label', `★${v.stars} / 3`)
    starBox.querySelectorAll('.rs').forEach((el) => el.removeAttribute('data-on'))
    $('result-hint').hidden = !v.won
    $('result-hint').textContent = HINTS[v.stars] ?? ''
    $('result-new').hidden = v.unlocked === null
    $('result-new').textContent = v.unlocked === null ? '' : `NEW! STAGE ${String(v.unlocked).padStart(2, '0')} 解放`
    $('result-best').hidden = !v.improved
    $('result-line-clear').hidden = !v.won
    $('result-line-bounty').hidden = v.bounty === 0
    $('result-clear-gold').textContent = coins(v.reward)
    $('result-bounty').textContent = coins(v.bounty)
    $('chip-kills').hidden = v.kills === null
    $('chip-kills').querySelector('span')!.textContent = `撃破 ${v.kills ?? 0}体`
    $('chip-specials').querySelector('span')!.textContent = `必殺技 ${v.specials}回`
    $('chip-hp').querySelector('span')!.textContent = `拠点 HP ${Math.ceil(v.hp)}/${v.maxHp}`
    $('chip-time').querySelector('span')!.textContent = `タイム ${formatClock(v.seconds)}`
    $('result-gold').textContent = coins(v.instant ? total : 0)
    const lit = (i: number) => starBox.querySelectorAll('.rs')[i]?.setAttribute('data-on', '')
    if (v.instant) {
      for (let i = 0; i < v.stars; i++) lit(i)
      for (const el of lines) reveal(el)
      reveal($('result-new'))
      reveal($('result-best'))
      return
    }
    // Stars stamp in one by one, then the coin lines, then the total counts up.
    let t = STAR_FIRST_MS
    for (let i = 0; i < (v.won ? v.stars : 0); i++, t += STAR_GAP_MS)
      at(t, () => {
        lit(i)
        play('star', i)
      })
    if (v.won) confetti($('result-confetti'), 14 + v.stars * 8)
    at(t, () => reveal($('result-line-clear')))
    at(t + 180, () => reveal($('result-line-bounty')))
    at(t + 360, () => {
      reveal(dialog.querySelector('.result-summary'))
      const start = performance.now()
      let lastTick = 0
      const step = (now: number) => {
        const k = Math.min(1, (now - start) / COUNT_MS),
          value = Math.round(total * (1 - (1 - k) ** 3))
        $('result-gold').textContent = coins(value)
        if (value > 0 && now - lastTick > 70 && k < 1) {
          lastTick = now
          play('coin')
        }
        if (k < 1) raf = requestAnimationFrame(step)
      }
      raf = requestAnimationFrame(step)
    })
    at(t + 360 + COUNT_MS, () => {
      reveal(dialog.querySelector('.result-chips'))
      reveal($('reward'))
      if (v.unlocked !== null) {
        reveal($('result-new'))
        play('levelup')
      }
      reveal($('result-best'))
    })
  }
  return { show, cancel }
}
