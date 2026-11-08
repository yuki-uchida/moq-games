/**
 * The finale (phase 'ending'): a short illustrated epilogue — the four orb shards uniting, then each hero shown in
 * its four bodies in turn — followed by the staff roll with every guild member and boss marching by underneath.
 * Sprite frames are swapped by a small ticker only while the scene is visible.
 */
import { findAnim, iconUrl } from '../render/sprites'
import { ENEMIES, JOBS, JOB_COLORS, JOB_NAMES, SPECIES, SPECIES_NAMES, STAGES } from '../vocab'
import { el } from './dom'

interface Animated {
  img: HTMLImageElement
  urls: string[]
  i: number
  /** Ticks per frame. */
  hold: number
  n: number
}

/** Data URLs of every frame of an animation (cached by iconUrl). */
function frameUrls(sheet: string, ...names: string[]): string[] {
  for (const name of names) {
    const a = findAnim(sheet, name)
    if (a) return a.frames.map((_, i) => iconUrl(sheet, name, 1, i)).filter(Boolean)
  }
  return []
}

export class EndingScene {
  readonly root: HTMLElement
  private readonly animated: Animated[] = []
  private readonly forms: { img: HTMLImageElement; job: string; label: HTMLElement }[] = []
  private timer?: ReturnType<typeof setInterval>
  private tick = 0
  private built = false
  private readonly epilogue: HTMLElement
  private readonly formsBox: HTMLElement
  private readonly parade: HTMLElement
  private readonly roll: HTMLElement

  constructor(readonly actions: HTMLElement) {
    this.epilogue = el('section.epi.epi-orbs', { 'aria-label': 'エピローグ' })
    this.formsBox = el('section.epi.epi-forms')
    this.parade = el('div.parade', { 'aria-hidden': 'true' })
    this.roll = el(
      'div.roll',
      {},
      el('h2', { text: 'マモノ陣形' }),
      el('p.roll-lead', { text: '4匹のマモノは、陣形のちからで冒険者ギルドとわかりあえた。' }),
      ...[
        ['ゲームデザイン', 'マモノ陣形 制作チーム'],
        ['ドット絵', 'コードで描かれたピクセルたち'],
        ['音楽・効果音', 'Web Audio シンセサイザー楽団'],
        ['通信', 'MoQ リレー'],
        ['主演', 'スライム ・ ネズミ ・ カラス ・ ウルフ'],
        ['冒険者ギルド', '見習い剣士 ほか 16 職のみなさん'],
        ['ボス', 'ガルド ・ ミルダと大猫 ・ ヴァルク ・ レオン'],
        ['スペシャルサンクス', 'いっしょに陣形を組んだ、あなた']
      ].map(([k, v]) => el('div.credit', {}, el('span.credit-role', { text: k }), el('span.credit-name', { text: v }))),
      el('p.roll-end', { text: 'おしまい ― ありがとう！' })
    )
    this.root = el(
      'div.ending',
      { hidden: true },
      el('div.ending-sky', { 'aria-hidden': 'true' }, el('span.ending-moon')),
      this.epilogue,
      this.formsBox,
      el('div.roll-wrap', {}, this.roll),
      this.parade,
      el('div.ending-foot', {}, actions)
    )
  }

  private animate(img: HTMLImageElement, urls: string[], hold = 1) {
    if (!urls.length) return img
    img.src = urls[0]
    this.animated.push({ img, urls, i: 0, hold, n: 0 })
    return img
  }

  private build() {
    if (this.built) return
    this.built = true
    // 1. The four orb shards (one per stage) fly together and become one.
    const orb = frameUrls('items', 'orb')
    const shards = el(
      'div.orbs',
      {},
      ...STAGES.map((_, i) => this.animate(el('img.px-icon.orb', { alt: '', style: `--i:${i}` }), orb, 2)),
      el('span.orb-flash')
    )
    this.epilogue.append(
      shards,
      el('p.epi-text', { text: '四つの陣の宝珠のかけらが、ひとつにかさなった。' }),
      el('p.epi-text.late', { text: 'ギルドの人間たちも、マモノたちのきずなを見とどけた。' })
    )
    // 2. Each hero in its four bodies, in turn.
    const row = el('div.forms-row')
    JOBS.forEach((job) => {
      const img = el('img.px-icon.form-sprite', { alt: '' })
      const label = el('span.form-species')
      this.forms.push({ img, job, label })
      row.append(
        el(
          'div.form-card',
          { style: `--job:${JOB_COLORS[job]}` },
          el('span.form-plate', {}, img),
          el('span.form-job', { text: JOB_NAMES[job] }),
          label
        )
      )
    })
    this.formsBox.append(row, el('p.epi-text', { text: 'すがたは変わっても、陣形はひとつ。' }))
    // 3. The parade: every guild member and boss marching under the credits.
    const marchers: { sheet: string; names: string[]; big?: boolean }[] = []
    for (const stage of STAGES) {
      for (const kind of ENEMIES[stage]) marchers.push({ sheet: `enemy:${kind}`, names: ['walk_side', 'idle_side'] })
      const boss = { meadow: 'garud', sewer: 'milda', tower: 'valk', forest: 'leon' }[stage]
      marchers.push({ sheet: `boss:${boss}`, names: ['walk_side', 'fly_side', 'idle_side', 'idle_down'], big: true })
      if (stage === 'sewer') marchers.push({ sheet: 'boss:cat', names: ['walk_side', 'idle_side'], big: true })
      if (stage === 'tower') marchers.push({ sheet: 'minion:hawk', names: ['fly_side'] })
    }
    for (const m of marchers) {
      const urls = frameUrls(m.sheet, ...m.names)
      if (!urls.length) continue
      // The art faces right; the parade walks left.
      this.parade.append(this.animate(el(`img.px-icon.marcher${m.big ? '.big' : ''}`, { alt: '' }), urls, 2))
    }
  }

  private step = () => {
    this.tick++
    for (const a of this.animated) {
      if (++a.n < a.hold) continue
      a.n = 0
      a.i = (a.i + 1) % a.urls.length
      a.img.src = a.urls[a.i]
    }
    // Forms change every ~0.75 s, each card a little later than the previous one.
    this.forms.forEach((f, k) => {
      const s = SPECIES[Math.floor((this.tick + k * 2) / 6) % SPECIES.length]
      const url = iconUrl(`hero:${s}:${f.job}`, 'victory', 1, Math.floor(this.tick / 2) % 6)
      if (url && f.img.src !== url) f.img.src = url
      if (f.label.textContent !== SPECIES_NAMES[s]) f.label.textContent = SPECIES_NAMES[s]
    })
  }

  /** Shows the scene from the start. */
  start() {
    this.build()
    this.root.classList.remove('play')
    void this.root.offsetWidth
    this.root.classList.add('play')
    clearInterval(this.timer)
    this.timer = setInterval(this.step, 125)
  }

  stop() {
    clearInterval(this.timer)
    this.timer = undefined
    this.root.classList.remove('play')
  }
}
