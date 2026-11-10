/**
 * The in-game HUD (DOM over the canvas): party cards with hearts, gems/keys, objective, formation indicator,
 * contextual key hints, the せーの countdown, banners, notices, the dialog box with a typewriter, the boss bar,
 * the connection chip and the menu/mute buttons. Updates touch the DOM only when something changed.
 */
import type { EventView, HeroView, View } from '../sim/types'
import { BOSS_NAMES, JOBS, JOB_COLORS, JOB_NAMES, TILE, type BossKind } from '../vocab'
import { clearChildren, el, icon, setText, show } from './dom'
import { hintsFor, type Hint } from './hints'
import { bellProgress, groupProgress, type MoonProgress } from './moons'
import type { StageInfo } from '../sim/types'

export interface HudActions {
  menu(): void
  mute(): void
  blip(): void
}

const TECH_TITLES = new Set(['ジャンボ・プレス', 'チューチュー大行進', '黒羽の大旋風', '月下群狼陣'])
const GROUP_CHIPS = [
  {
    kind: 'moonstone',
    label: '月石',
    sheet: 'props:forest',
    on: 'moonstone_on',
    off: 'moonstone_off',
    done: 'ぜんぶ灯った！'
  },
  { kind: 'crystal', label: '水晶', sheet: 'props:meadow', on: 'crystal_on', off: 'crystal_off', done: 'そろった！' },
  { kind: 'valve', label: 'バルブ', sheet: 'props:sewer', on: 'valve_on', off: 'valve_off', done: 'そろった！' }
] as const
/** What the boss bar says while the boss is open to attack. */
const BROKEN_TEXT: Partial<Record<BossKind, string>> = {
  garud: 'ガードブレイク！',
  milda: '魔女が落ちた！ 大ダメージのチャンス',
  valk: '墜落！ 大ダメージのチャンス',
  leon: '聖なる盾がくだけた！ 大ダメージのチャンス'
}
const FORMATION_NAMES: Record<number, string> = { 2: 'ペア陣', 3: '三角陣', 4: '四方陣' }

class HeroCard {
  readonly root: HTMLElement
  private readonly hearts: HTMLElement
  private readonly name: HTMLElement
  private readonly badge: HTMLElement
  private heartKey = ''

  constructor(readonly slot: number) {
    const job = JOBS[slot]
    this.hearts = el('span.hearts', { 'aria-label': 'HP' })
    this.name = el('span.hc-name', { text: JOB_NAMES[job] })
    this.badge = el('span.hc-badge', { text: '' })
    this.root = el(
      'div.hero-card',
      { style: `--job:${JOB_COLORS[job]}` },
      el('span.hc-icon', {}, icon('ui', `job_${job}`, 24)),
      el('span.hc-main', {}, el('span.hc-top', {}, this.name, this.badge), this.hearts)
    )
  }

  update(h: HeroView | undefined, view: View, myId: string) {
    if (!h) return show(this.root, false)
    show(this.root, true)
    const owner = view.players.find((p) => p.id === h.owner)
    const mine = h.owner === myId
    const multi = view.players.length > 1
    const name = h.ctrl
      ? mine
        ? multi
          ? owner?.name || 'あなた'
          : JOB_NAMES[h.job]
        : owner?.name || 'なかま'
      : JOB_NAMES[h.job]
    setText(this.name, name)
    let badge = ''
    if (h.state === 'down') badge = 'ダウン'
    else if (h.ctrl && mine) badge = '操作中'
    else if (!h.ctrl && mine) badge = h.mode === 'stay' ? '待機' : '追従'
    else if (!h.ctrl) badge = '仲間'
    setText(this.badge, badge)
    this.root.classList.toggle('me', h.ctrl && mine)
    this.root.classList.toggle('down', h.state === 'down')
    this.root.classList.toggle('stay', !h.ctrl && mine && h.mode === 'stay')
    this.root.classList.toggle('charged', h.charge >= 1)
    const key = `${h.hp}/${h.maxHp}`
    if (key !== this.heartKey) {
      const hurt = this.heartKey && Number(this.heartKey.split('/')[0]) > h.hp
      this.heartKey = key
      clearChildren(this.hearts)
      const n = Math.ceil(h.maxHp / 2)
      for (let i = 0; i < n; i++) {
        const v = h.hp - i * 2
        this.hearts.append(
          icon('ui', v >= 2 ? 'heart_full' : v === 1 ? 'heart_half' : 'heart_empty', 16, 'px-icon heart')
        )
      }
      if (hurt) {
        this.root.classList.remove('hurt')
        void this.root.offsetWidth
        this.root.classList.add('hurt')
      }
    }
  }
}

export class Hud {
  readonly root: HTMLElement
  private readonly cards: HeroCard[]
  private readonly gems: HTMLElement
  private readonly keys: HTMLElement
  private readonly keysBox: HTMLElement
  private readonly objective: HTMLElement
  private readonly formation: HTMLElement
  private readonly hints: HTMLElement
  private readonly countdown: HTMLElement
  private readonly banner: HTMLElement
  private readonly notices: HTMLElement
  private readonly dialog: HTMLElement
  private readonly dialogSpeaker: HTMLElement
  private readonly dialogText: HTMLElement
  private readonly boss: HTMLElement
  private readonly bossName: HTMLElement
  private readonly bossFill: HTMLElement
  private readonly bossLag: HTMLElement
  private readonly bossState: HTMLElement
  private readonly bossPet: HTMLElement
  private readonly bells: HTMLElement
  private readonly moons: HTMLElement
  private moonKey = ''
  private bellRang = new Map<number, number>()
  private bellState = new Map<number, string>()
  private bellKey = ''
  private readonly status: HTMLElement
  private readonly spectator: HTMLElement
  private readonly muteBtn: HTMLButtonElement
  private hintKey = ''
  private formKey = ''
  private countKey = ''
  private bannerQueue: { text: string; kind: string }[] = []
  private bannerUntil = 0
  private dialogKey = ''
  private dialogClosed = ''
  private dialogShown = 0
  private dialogAt = 0
  private bossLagV = 1

  constructor(private readonly a: HudActions) {
    this.cards = JOBS.map((_, i) => new HeroCard(i))
    this.gems = el('span.count', { text: '0' })
    this.keys = el('span.count', { text: '0' })
    this.keysBox = el('span.res', { title: 'カギ' }, icon('ui', 'key', 16, 'px-icon res-icon'), this.keys)
    this.objective = el('div.objective', { role: 'status' })
    this.formation = el('div.formation-chip', { hidden: true })
    this.hints = el('div.hints', { 'aria-live': 'polite' })
    this.countdown = el('div.countdown', { 'aria-live': 'assertive' })
    this.banner = el('div.banner', { 'aria-live': 'polite' })
    this.notices = el('ul.notices')
    this.dialogSpeaker = el('span.dialog-speaker')
    this.dialogText = el('p.dialog-text')
    this.dialog = el(
      'div.dialog.parchment',
      { hidden: true, role: 'dialog', 'aria-live': 'polite' },
      this.dialogSpeaker,
      this.dialogText,
      el('span.dialog-next', {}, el('kbd', { text: 'E' }), ' つぎへ')
    )
    this.bossName = el('span.boss-name')
    this.bossFill = el('span.boss-fill')
    this.bossLag = el('span.boss-lag')
    this.bossState = el('span.boss-state')
    this.bossPet = el('span.boss-pet', { hidden: true })
    this.bells = el('div.bell-chip', { hidden: true, 'aria-label': '鐘' })
    this.moons = el('div.bell-chip.moon-chip', { hidden: true, 'aria-label': '月石' })
    this.boss = el(
      'div.boss-bar',
      { hidden: true },
      el('div.boss-top', {}, this.bossName, this.bossState),
      el('div.boss-track', {}, this.bossLag, this.bossFill),
      this.bossPet
    )
    this.status = el('span.net-status', { hidden: true })
    this.spectator = el('div.spectator-note', { hidden: true, text: '満員のため観戦中' })
    this.muteBtn = el(
      'button.hud-btn',
      { type: 'button', 'aria-label': 'サウンド切り替え', title: 'サウンド（M）', onclick: () => a.mute() },
      '♪'
    )
    this.root = el(
      'div.hud',
      { 'aria-label': 'ゲーム情報' },
      el('div.party', {}, ...this.cards.map((c) => c.root)),
      el(
        'div.top-right',
        {},
        el(
          'div.resources.wood',
          {},
          el('span.res', { title: 'ジェム' }, icon('ui', 'gem', 16, 'px-icon res-icon'), this.gems),
          this.keysBox
        ),
        this.status,
        this.muteBtn,
        el(
          'button.hud-btn',
          { type: 'button', 'aria-label': 'メニュー', title: 'メニュー（Esc）', onclick: () => a.menu() },
          '☰'
        )
      ),
      el('div.top-center', {}, this.objective, this.boss, this.formation, this.bells, this.moons),
      this.hints,
      this.countdown,
      this.banner,
      this.notices,
      this.dialog,
      this.spectator
    )
  }

  setMuted(muted: boolean) {
    this.muteBtn.classList.toggle('off', muted)
    setText(this.muteBtn, muted ? '×' : '♪')
  }

  setStatus(text: string, kind: string) {
    show(this.status, !!text)
    setText(this.status, text)
    this.status.dataset.kind = kind
  }

  /** Events that become HUD texts. */
  event(e: EventView) {
    // Technique names shout with an exclamation mark.
    // The wipe overlay already shows 全滅…, so the banner is not repeated.
    if (e.k === 'banner' && e.s === '全滅…') return
    if (e.k === 'banner' && e.s) this.queueBanner(TECH_TITLES.has(e.s) ? `${e.s}！` : e.s, 'big')
    else if (e.k === 'solve' && e.s) this.queueBanner(e.s, 'solve')
    else if (e.k === 'notice' && e.s) this.notice(e.s)
  }

  private queueBanner(text: string, kind: string) {
    if (this.bannerQueue.some((b) => b.text === text)) return
    // A technique name cuts a formation banner short and goes first, so it shows the moment it is released.
    if (kind === 'big' && TECH_TITLES.has(text.replace(/！$/, ''))) {
      this.bannerQueue.unshift({ text, kind })
      if (this.bannerQueue.length > 3) this.bannerQueue.pop()
      this.bannerUntil = 0
      return
    }
    this.bannerQueue.push({ text, kind })
    if (this.bannerQueue.length > 3) this.bannerQueue.shift()
  }

  notice(text: string) {
    const li = el('li.notice', { text })
    this.notices.append(li)
    while (this.notices.children.length > 4) this.notices.firstElementChild?.remove()
    setTimeout(() => li.classList.add('out'), 3800)
    setTimeout(() => li.remove(), 4400)
  }

  update(view: View, info: StageInfo | undefined, myId: string, now: number) {
    const me = view.players.find((p) => p.id === myId)
    for (const c of this.cards)
      c.update(
        view.heroes.find((h) => h.slot === c.slot),
        view,
        myId
      )
    setText(this.gems, String(view.party.gems))
    setText(this.keys, String(view.party.keys))
    show(this.keysBox, view.party.keys > 0)
    setText(this.objective, view.objective)
    show(this.objective, !!view.objective && view.phase === 'play')
    show(this.spectator, !!me?.spectator)

    // Formation chip.
    const mine = me && me.ctrl >= 0 ? view.heroes.find((h) => h.slot === me.ctrl) : undefined
    const f = mine?.form !== undefined ? view.formations[mine.form] : undefined
    const fKey = f ? `${f.slots.join()}|${f.ready}` : ''
    if (fKey !== this.formKey) {
      this.formKey = fKey
      show(this.formation, !!f)
      clearChildren(this.formation)
      if (f) {
        this.formation.append(
          el('span.fc-name', { text: FORMATION_NAMES[f.slots.length] ?? '陣形' }),
          el('span.fc-icons', {}, ...f.slots.map((s) => icon('ui', `job_${JOBS[s]}`, 24))),
          el('span.fc-bonus', {
            text: f.ready ? '協力技 OK！ はなして発動' : `こうげき ×${(1 + 0.3 * (f.slots.length - 1)).toFixed(1)}`
          })
        )
        this.formation.classList.toggle('ready', f.ready)
      }
    }

    // Key hints.
    const hints: Hint[] = view.phase === 'play' && !me?.spectator ? hintsFor(view, info, myId) : []
    const hKey = hints.map((h) => h.key + h.text + (h.hot ? '!' : '')).join('|')
    if (hKey !== this.hintKey) {
      this.hintKey = hKey
      clearChildren(this.hints)
      for (const h of hints)
        this.hints.append(
          el('span.hint' + (h.hot ? '.hot' : ''), {}, el('kbd', { text: h.key }), el('span', { text: h.text }))
        )
    }

    // せーの countdown.
    let count = ''
    if (view.signal) {
      const d = view.t - view.signal.at
      if (d >= 0 && d < 3) count = String(3 - Math.floor(d))
      else if (d >= 3 && d < 3.7) count = 'GO!'
    }
    if (count !== this.countKey) {
      this.countKey = count
      this.countdown.textContent = count
      // Drop the class and force a reflow so the same animation restarts for every step (3, 2, 1).
      this.countdown.className = 'countdown'
      void this.countdown.offsetWidth
      this.countdown.className = 'countdown' + (count ? ' on' : '') + (count === 'GO!' ? ' go' : '')
      if (count && count !== 'GO!' && view.signal) {
        const slot = view.signal.slot
        this.countdown.style.setProperty('--job', JOB_COLORS[JOBS[slot]] ?? '#fff')
        this.countdown.dataset.label = 'せーの！'
      }
    }

    // Banners (one at a time). They wait while the せーの countdown / GO! is on screen so the two never overlap.
    if (now > this.bannerUntil && this.bannerQueue.length && !count) {
      const b = this.bannerQueue.shift()!
      this.banner.textContent = b.text
      this.banner.className = `banner on ${b.kind}`
      this.bannerUntil = now + (b.kind === 'big' ? 2.0 : 2.4)
    } else if (now > this.bannerUntil && this.banner.classList.contains('on')) this.banner.className = 'banner'

    this.updateBells(view)
    this.updateMoons(view, info, mine)
    this.updateDialog(view, now, mine ?? view.heroes[0])
    this.updateBoss(view, info, mine)
  }

  /** Bell puzzle progress: each bell lights while it is within the 1.2 s window after ringing. */
  private updateBells(view: View) {
    const bells = view.props.filter((p) => p.kind === 'bell')
    for (const b of bells) {
      if (b.state === 'ring' && this.bellState.get(b.id) !== 'ring') this.bellRang.set(b.id, view.t)
      this.bellState.set(b.id, b.state)
    }
    const recent = bells.some((b) => view.t - (this.bellRang.get(b.id) ?? -99) < 3)
    const { lit, n, complete } = bellProgress(
      bells,
      bells.map((b) => view.t - (this.bellRang.get(b.id) ?? -99) < 1.2)
    )
    const key = recent ? lit.map((x) => (x ? 1 : 0)).join('') : ''
    if (key === this.bellKey) return
    this.bellKey = key
    show(this.bells, recent)
    clearChildren(this.bells)
    if (!recent) return
    this.bells.append(
      el('span.bc-label', { text: '鐘' }),
      ...lit.map((on) =>
        el(
          'span.bc-bell' + (on ? '.on' : ''),
          {},
          icon('props:tower', on ? 'bell_ring' : 'bell', 32, 'px-icon bc-icon', on ? 2 : 0)
        )
      ),
      el('span.bc-count', { text: complete ? 'そろった！' : `${n}/${bells.length}` })
    )
  }

  /** Grouped puzzle progress (moonstones, crystals, valves): every member of the group, lit ones glowing. */
  private updateMoons(view: View, info: StageInfo | undefined, me: HeroView | undefined) {
    const ref = me ?? view.heroes[0]
    let prog: MoonProgress | undefined
    let kind: (typeof GROUP_CHIPS)[number] | undefined
    if (view.phase === 'play')
      for (const k of GROUP_CHIPS) {
        prog = groupProgress(k.kind, view.props, info?.rooms, ref)
        if (prog) {
          kind = k
          break
        }
      }
    const key = prog && kind ? `${kind.kind}:${prog.group}:${prog.lit.map((x) => (x ? 1 : 0)).join('')}` : ''
    if (key === this.moonKey) return
    this.moonKey = key
    show(this.moons, !!prog)
    clearChildren(this.moons)
    if (!prog || !kind) return
    this.moons.append(
      el('span.bc-label', { text: kind.label }),
      ...prog.lit.map((on) =>
        el('span.bc-bell' + (on ? '.on' : ''), {}, icon(kind.sheet, on ? kind.on : kind.off, 32, 'px-icon bc-icon'))
      ),
      el('span.bc-count', { text: prog.complete ? kind.done : `${prog.n}/${prog.total}` })
    )
  }

  private updateDialog(view: View, now: number, ref: HeroView | undefined) {
    // Dialogs only live during play: a wipe, the intro, the results and the ending close them.
    let d: View['dialogs'][number] | undefined = view.phase === 'play' ? view.dialogs[0] : undefined
    // Walking away from the speaker closes the dialog page (a new page re-checks the distance).
    const id = d ? `${d.speaker}@${d.x},${d.y}|${d.text}` : ''
    if (!d) this.dialogClosed = ''
    else if (ref && Math.hypot(ref.x - d.x, ref.y - (d.y + 64)) > TILE * 2.2) this.dialogClosed = id
    if (d && this.dialogClosed === id) d = undefined
    this.root.classList.toggle('talking', !!d)
    const key = d ? `${d.speaker}|${d.text}` : ''
    if (key !== this.dialogKey) {
      this.dialogKey = key
      this.dialogShown = 0
      this.dialogAt = now
      show(this.dialog, !!d)
      if (d) setText(this.dialogSpeaker, d.speaker)
    }
    if (!d) return
    const chars = [...d.text]
    const n = Math.min(chars.length, Math.floor((now - this.dialogAt) * 42))
    if (n !== this.dialogShown) {
      if (Math.floor(n / 3) !== Math.floor(this.dialogShown / 3) && n < chars.length) this.a.blip()
      this.dialogShown = n
      this.dialogText.textContent = chars.slice(0, n).join('')
      this.dialog.classList.toggle('done', n >= chars.length)
    }
  }

  private updateBoss(view: View, info: StageInfo | undefined, mine: HeroView | undefined) {
    const b = view.boss
    let visible = !!b && view.phase === 'play'
    if (b && info && visible) {
      // Only inside the boss's room.
      const room = info.rooms.find(
        (r) => r.zoom && b.x / TILE >= r.x && b.x / TILE < r.x + r.w && b.y / TILE >= r.y && b.y / TILE < r.y + r.h
      )
      const ref = mine ?? view.heroes[0]
      if (room && ref)
        visible =
          ref.x / TILE >= room.x &&
          ref.x / TILE < room.x + room.w &&
          ref.y / TILE >= room.y &&
          ref.y / TILE < room.y + room.h
    }
    show(this.boss, visible)
    if (!b || !visible) return
    setText(this.bossName, BOSS_NAMES[b.kind as BossKind] ?? b.kind)
    const v = Math.max(0, b.hp / b.maxHp)
    this.bossLagV = Math.max(v, this.bossLagV - 0.004)
    if (this.bossLagV < v) this.bossLagV = v
    this.bossFill.style.width = `${(v * 100).toFixed(2)}%`
    this.bossLag.style.width = `${(this.bossLagV * 100).toFixed(2)}%`
    const broken = (b.broken ?? 0) > view.t
    // Milda's giant cat guards her: the witch is untouchable while it is awake.
    const pet = view.bossPet
    const petDizzy = !!pet && (pet.broken ?? 0) > view.t
    // The dragoon flies out of reach until the tornado pulls him down.
    const flyingBoss = b.kind === 'valk' && ['fly', 'dive', 'breath'].includes(b.anim)
    const guarded = pet ? !petDizzy && !broken : b.guard
    setText(
      this.bossState,
      broken
        ? `${BROKEN_TEXT[b.kind as BossKind] ?? 'ガードブレイク！'} ${Math.ceil((b.broken ?? 0) - view.t)}`
        : b.kind === 'leon'
          ? b.anim === 'shield'
            ? '無敵'
            : (b.parry ?? 0) > view.t
              ? '受け流しの構え'
              : ''
          : b.kind === 'valk'
            ? b.anim === 'downed'
              ? '大ダメージのチャンス'
              : ''
            : guarded
              ? pet
                ? '大猫が守っている'
                : 'ガード中 ― 協力技でくずせ！'
              : ''
    )
    this.bossState.classList.toggle('guard', !broken && guarded && b.kind !== 'leon' && b.kind !== 'valk')
    show(this.bossPet, !!pet || b.kind === 'valk' || b.kind === 'leon')
    if (b.kind === 'leon') {
      const shield = b.anim === 'shield'
      const awaken = b.anim === 'awaken'
      setText(
        this.bossPet,
        shield
          ? '聖なる盾 ― 月下群狼陣でくだけ！'
          : awaken
            ? '覚醒中…'
            : b.phase >= 2
              ? '覚醒 ― 光の柱に注意！'
              : '剣の構え ― 受け流しに注意'
      )
      this.bossPet.classList.toggle('dizzy', broken)
      this.bossPet.dataset.kind = 'leon'
    } else if (b.kind === 'valk') {
      const downed = b.anim === 'downed'
      setText(this.bossPet, downed ? '墜落！ いまだ！' : flyingBoss ? '空中 ― 大旋風で引きずり下ろせ！' : '着地中')
      this.bossPet.classList.toggle('dizzy', downed)
      this.bossPet.dataset.kind = 'valk'
    } else if (pet) {
      setText(this.bossPet, petDizzy ? '大猫：目を回している！ いまだ！' : '大猫：見張り中 ― 大行進でぶつかれ！')
      this.bossPet.classList.toggle('dizzy', petDizzy)
    }
    this.boss.classList.toggle('broken', broken)
    this.boss.classList.toggle('guard', guarded && !broken)
  }
}
