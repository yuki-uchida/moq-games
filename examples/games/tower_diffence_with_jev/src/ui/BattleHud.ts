import { CONFIG, stageRules, type GameState } from '../game/model'

const SPEED_KEY = 'tower-jev-speed-v1'
export type BattleSpeed = 1 | 2

const ICONS = {
  castle:
    '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 21.5C4 15.6 1.8 11.6 2.4 8.1 3 4.7 6.9 3.3 9.4 5.4c1 .8 1.8 1.9 2.6 3.1.8-1.200 1.600-2.300 2.600-3.100 2.500-2.100 6.400-.7 7 2.700.6 3.500-1.600 7.500-9.600 13.400Z" fill="#e8574a" stroke="#fff3d6" stroke-width="1.8" stroke-linejoin="round"/></svg>',
  enemy:
    '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M3 3.500 8 7.500h8l5-4-1.200 7.300c0 5.400-3.600 9.200-7.800 9.200s-7.800-3.800-7.800-9.200Z" fill="#8f4fc4" stroke="#fff3d6" stroke-width="1.8" stroke-linejoin="round"/><path d="m7.500 11.500 3 1.500M16.500 11.500l-3 1.500" stroke="#fff3d6" stroke-width="2" stroke-linecap="round"/><circle cx="9.200" cy="14.500" r="1.200" fill="#fff3d6"/><circle cx="14.800" cy="14.500" r="1.200" fill="#fff3d6"/></svg>',
  crown:
    '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M3 18.500 1.800 7.500l5.700 4.500L12 4l4.500 8 5.700-4.500L21 18.500Z" fill="currentColor" stroke="#2c3f33" stroke-width="1.600" stroke-linejoin="round"/><path d="M3.500 21.500h17" stroke="#2c3f33" stroke-width="2" stroke-linecap="round"/></svg>',
  coin: '<svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="12" r="10" fill="#f4c542" stroke="#fff3d6" stroke-width="1.800"/><circle cx="12" cy="12" r="5.800" fill="none" stroke="#b98017" stroke-width="2"/></svg>',
  speed:
    '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M3 5.500v13l8.500-6.500Zm9.500 0v13L21 12Z" fill="currentColor"/></svg>'
}

function readSpeed(): BattleSpeed {
  try {
    return localStorage.getItem(SPEED_KEY) === '2' ? 2 : 1
  } catch {
    return 1
  }
}

/** Compact icon-led battle HUD: castle hp, enemy progress, battle coins and the x1/x2 speed toggle. */
export class BattleHud {
  readonly root: HTMLElement
  private readonly castle: HTMLElement
  private readonly castleBar: HTMLElement
  private readonly castleFill: HTMLElement
  private readonly castleTrail: HTMLElement
  private readonly castleNum: HTMLElement
  private readonly enemyBar: HTMLElement
  private readonly enemyFill: HTMLElement
  private readonly enemyNum: HTMLElement
  private readonly crown: HTMLElement
  private readonly coinBox: HTMLElement
  private readonly coinNum: HTMLElement
  private readonly speedButton: HTMLButtonElement
  private currentSpeed: BattleSpeed = readSpeed()
  private shown = false
  private speedShown = true
  private lastBaseHp = -1
  private lastCoins = -1
  private cache = { castle: '', level: '', enemies: '', crown: '', coins: '' }

  constructor(parent: HTMLElement, private readonly onSpeed?: (speed: BattleSpeed) => void) {
    this.root = document.createElement('div')
    this.root.className = 'battle-hud'
    this.root.hidden = true
    this.root.innerHTML = `<div class="bhud-main"><div class="bhud-castle" role="group" aria-label="拠点の体力">${ICONS.castle}<span class="bhud-bar"><i class="bhud-trail"></i><b class="bhud-fill"></b></span><output class="bhud-num"></output></div><div class="bhud-enemies" role="group" aria-label="敵の進行">${ICONS.enemy}<span class="bhud-bar"><b class="bhud-fill"></b></span><output class="bhud-num"></output><span class="bhud-crown" data-state="idle" title="ボス">${ICONS.crown}</span></div></div><div class="bhud-side"><div class="bhud-coins" role="group" aria-label="戦闘で得たコイン">${ICONS.coin}<output class="bhud-num">+0</output></div><button class="bhud-speed" type="button" aria-pressed="false" aria-label="速度 2倍" title="速度 2倍">${ICONS.speed}<span></span></button></div>`
    parent.append(this.root)
    const q = <T extends HTMLElement>(selector: string) => this.root.querySelector<T>(selector)!
    this.castle = q('.bhud-castle')
    this.castleBar = q('.bhud-castle .bhud-bar')
    this.castleFill = q('.bhud-castle .bhud-fill')
    this.castleTrail = q('.bhud-trail')
    this.castleNum = q('.bhud-castle .bhud-num')
    this.enemyBar = q('.bhud-enemies .bhud-bar')
    this.enemyFill = q('.bhud-enemies .bhud-fill')
    this.enemyNum = q('.bhud-enemies .bhud-num')
    this.crown = q('.bhud-crown')
    this.coinBox = q('.bhud-coins')
    this.coinNum = q('.bhud-coins .bhud-num')
    this.speedButton = q<HTMLButtonElement>('.bhud-speed')
    this.speedButton.addEventListener('click', () => {
      this.setSpeed(this.currentSpeed === 1 ? 2 : 1)
    })
    this.paintSpeed()
  }

  get speed(): BattleSpeed {
    return this.currentSpeed
  }

  /** Flying coins aim at this element. */
  get coinElement(): HTMLElement {
    return this.coinBox
  }

  setSpeed(speed: BattleSpeed): void {
    this.currentSpeed = speed
    try {
      localStorage.setItem(SPEED_KEY, String(speed))
    } catch {
      /* Preference is optional. */
    }
    this.paintSpeed()
    this.onSpeed?.(speed)
  }

  private paintSpeed(): void {
    this.speedButton.setAttribute('aria-pressed', String(this.currentSpeed === 2))
    this.speedButton.dataset.speed = String(this.currentSpeed)
    this.speedButton.lastElementChild!.textContent = `×${this.currentSpeed}`
  }

  hide(): void {
    if (!this.shown) return
    this.shown = false
    this.root.hidden = true
  }

  /** Call every rendered frame while a stage is started; writes only what changed. */
  update(state: Readonly<GameState>, battleCoins: number): void {
    if (!this.shown) {
      this.shown = true
      this.root.hidden = false
      this.lastBaseHp = -1
      this.lastCoins = -1
    }
    const speedShown = state.phase === 'preparation' || state.phase === 'assault'
    if (speedShown !== this.speedShown) {
      this.speedShown = speedShown
      this.speedButton.hidden = !speedShown
    }

    const hp = Math.max(0, Math.ceil(state.playerBaseHp)),
      ratio = Math.max(0, Math.min(1, state.playerBaseHp / CONFIG.baseHp))
    if (hp !== this.lastBaseHp) {
      if (this.lastBaseHp >= 0 && hp < this.lastBaseHp)
        this.castleBar.animate([{ filter: 'brightness(2.2)' }, { filter: 'brightness(1)' }], { duration: 320 })
      this.lastBaseHp = hp
      this.castleFill.style.width = `${ratio * 100}%`
      this.castleTrail.style.width = `${ratio * 100}%`
      this.castleNum.textContent = String(hp)
      this.castle.setAttribute('aria-label', `拠点の体力 ${hp} / ${CONFIG.baseHp}`)
    }
    const level = ratio < 0.3 ? 'low' : ratio < 0.6 ? 'mid' : 'ok'
    if (level !== this.cache.level) {
      this.cache.level = level
      this.castle.dataset.level = level
    }

    const rules = stageRules(state.stage, state.waveBossPolicy),
      resolved = Math.min(state.enemiesResolved, rules.enemyCount),
      kills = Math.min(resolved, state.corpses.filter((corpse) => corpse.owner === 'ai').length),
      passed = resolved - kills,
      remaining = rules.enemyCount - resolved,
      enemies = `${remaining}:${kills}:${passed}`
    if (enemies !== this.cache.enemies) {
      this.cache.enemies = enemies
      // Remaining enemies, not "defeated": enemies that reach the castle also leave the count.
      this.enemyNum.textContent = `残り${remaining}`
      this.enemyFill.style.width = `${(resolved / rules.enemyCount) * 100}%`
      this.enemyBar.parentElement!.setAttribute(
        'aria-label',
        `敵 全${rules.enemyCount}体 · 残り${remaining} · 撃破${kills}${passed ? ` · 通過${passed}` : ''}`
      )
    }
    let crown = 'idle'
    if (!rules.bossType) crown = 'none'
    else if (state.corpses.some((corpse) => corpse.owner === 'ai' && corpse.boss)) crown = 'down'
    else if (state.units.some((unit) => unit.owner === 'ai' && unit.boss)) crown = 'alive'
    if (crown !== this.cache.crown) {
      this.cache.crown = crown
      this.crown.dataset.state = crown
      this.crown.hidden = crown === 'none'
    }

    if (battleCoins !== this.lastCoins) {
      if (this.lastCoins >= 0 && battleCoins > this.lastCoins)
        this.coinBox.animate([{ transform: 'scale(1)' }, { transform: 'scale(1.3)', offset: 0.35 }, { transform: 'scale(1)' }], {
          duration: 280
        })
      this.lastCoins = battleCoins
      this.coinNum.textContent = `+${battleCoins}`
    }
  }
}
