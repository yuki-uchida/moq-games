/** DOM HUD: hearts, boss bar, bite meter, banners and toasts. */
import { BITE_COOLDOWN, type World } from '../game/sim'
import type { StageDef } from '../game/types'

/** What staging (the director) may show on the HUD. */
export interface HudApi {
  /** The stage title card. */
  showBanner(title: string, sub?: string): void
  /** A short hint or notice at the bottom. */
  showToast(text: string): void
  /** One big word in the middle of the screen (「スタート！」「クリア！」). */
  showCall(text: string, tone?: 'gold' | 'pink' | 'red'): void
  /** A boss's introduction: portrait (a `face_*` name of the `ui` sheet), name and title, for `seconds`. */
  showNameplate(name: string, title: string, face: string, seconds?: number): void
  showBoss(name: string, title: string): void
  hideBoss(): void
  /** Cut-scene mode: the bars, buttons and meters step aside while it is on. */
  cinematic(on: boolean): void
}

export class Hud implements HudApi {
  private hearts = document.querySelector<HTMLElement>('#hearts')!
  private stageNo = document.querySelector<HTMLElement>('#hud-stage-no')!
  private stageName = document.querySelector<HTMLElement>('#hud-stage-name')!
  private bossBar = document.querySelector<HTMLElement>('#boss-bar')!
  private bossName = document.querySelector<HTMLElement>('#boss-name')!
  private bossTitle = document.querySelector<HTMLElement>('#boss-title')!
  private bossFill = document.querySelector<HTMLElement>('#boss-fill')!
  private bossTrail = document.querySelector<HTMLElement>('#boss-trail')!
  private biteFill = document.querySelector<HTMLElement>('#bite-fill')!
  private banner = document.querySelector<HTMLElement>('#banner')!
  private toast = document.querySelector<HTMLElement>('#toast')!
  private bannerTimer = 0
  private toastTimer = 0
  private lastHp = -1
  private lastMaxHp = -1

  show() {
    document.querySelector<HTMLElement>('#hud')!.hidden = false
  }

  hide() {
    document.querySelector<HTMLElement>('#hud')!.hidden = true
  }

  setStage(stage: StageDef) {
    this.stageNo.textContent = String(stage.no)
    this.stageName.textContent = stage.name
    this.lastHp = -1
    this.lastMaxHp = -1
  }

  showBoss(name: string, title: string) {
    this.bossName.textContent = name
    this.bossTitle.textContent = title
    this.bossBar.hidden = false
    this.bossBar.classList.remove('is-visible')
    requestAnimationFrame(() => this.bossBar.classList.add('is-visible'))
  }

  hideBoss() {
    this.bossBar.hidden = true
  }

  update(world: World, dt: number) {
    const p = world.player
    if (p.hp !== this.lastHp || p.maxHp !== this.lastMaxHp) {
      this.lastHp = p.hp
      this.lastMaxHp = p.maxHp
      this.hearts.replaceChildren()
      for (let i = 0; i < p.maxHp; i++) {
        const heart = document.createElement('i')
        heart.className = i < p.hp ? 'heart is-full' : 'heart'
        heart.setAttribute('aria-hidden', 'true')
        this.hearts.appendChild(heart)
      }
      this.hearts.setAttribute('aria-label', `たいりょく ${p.hp}/${p.maxHp}`)
    }
    const bite = 1 - p.biteCooldown / BITE_COOLDOWN
    this.biteFill.style.setProperty('--fill', String(Math.max(0, Math.min(1, bite))))
    this.biteFill.classList.toggle('is-ready', bite >= 1)
    if (world.boss && !world.boss.dead) {
      const boss = world.boss
      const ratio = boss.def.stamina ? boss.stamina / boss.maxStamina : Math.max(0, boss.hp / boss.maxHp)
      this.bossFill.style.transform = `scaleX(${ratio})`
      this.bossTrail.style.transform = `scaleX(${ratio})`
      this.bossBar.classList.toggle('is-stamina', Boolean(boss.def.stamina))
    }
    if (this.bannerTimer > 0) {
      this.bannerTimer -= dt
      if (this.bannerTimer <= 0) this.banner.classList.remove('is-visible')
    }
    if (this.toastTimer > 0) {
      this.toastTimer -= dt
      if (this.toastTimer <= 0) this.toast.classList.remove('is-visible')
    }
  }

  showBanner(title: string, sub = '') {
    this.banner.innerHTML = ''
    const h = document.createElement('b')
    h.textContent = title
    this.banner.appendChild(h)
    if (sub) {
      const s = document.createElement('span')
      s.textContent = sub
      this.banner.appendChild(s)
    }
    this.banner.classList.add('is-visible')
    this.bannerTimer = 2.6
  }

  showToast(text: string) {
    this.toast.textContent = text
    this.toast.classList.add('is-visible')
    this.toastTimer = 2.2
  }

  // First versions: a call is a banner without a subtitle, a nameplate a banner with one.
  showCall(text: string) {
    this.showBanner(text)
  }

  showNameplate(name: string, title: string) {
    this.showBanner(name, title)
  }

  cinematic(on: boolean) {
    document.querySelector<HTMLElement>('#hud')!.classList.toggle('is-cinematic', on)
  }
}
