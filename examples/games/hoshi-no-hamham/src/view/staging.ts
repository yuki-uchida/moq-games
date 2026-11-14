/**
 * The staged moments of a stage (DESIGN.md §7), each built as a `Sequence`: stage start, the chase start of
 * stage 1, a boss waking, his phase 2 and his fall, the goal opening, ハム姫 freed, the clear and the death.
 * Timings are tuned to stay snappy; every moment longer than a second can be skipped, except the king's phase-2
 * transformation, which is part of the fight. Under reduced motion the
 * moments keep their information (title card, nameplate, call) and drop pans, slow motion, shake and flashes.
 */
import { VIEW_H, VIEW_W } from '../art/contract'
import type { SimEvent } from '../game/events'
import { ZONES } from '../ui/hud-model'
import type { DirectorHost, Outcome } from './director'
import { bossSheetSpec, clipLife, specDuration } from './clips'
import type { Anchor, BubbleTone } from './overlay'
import { Sequence } from './sequence'

/** Who interrupts whom: a higher priority cancels the moment playing, a lower one waits for it. */
export const PRIORITY = {
  princess: 10,
  goal: 15,
  phase: 20,
  start: 30,
  intro: 40,
  defeat: 50,
  end: 100
} as const

type At<K extends SimEvent['type']> = Extract<SimEvent, { type: K }>

export const STAGE_START_SECONDS = 1.45
export const CHASE_START_SECONDS = 0.9
/** 「スタート！」 comes this long before the moment ends; the title card is gone just before it (one thing in the slot). */
const GO_LEAD = 0.22
const CARD_GAP = 0.08
export const BOSS_INTRO_SECONDS = 2.5
export const CLEAR_SECONDS = 2.2
export const DEATH_SECONDS = 1.8
/** The boss's roar is posed at least this long (s), and longer when his `intro` clip needs it. */
export const BOSS_ROAR_SECONDS = 1.25
/**
 * Phase 2 holds the fight while the king transforms: the pose and the hold differ by this much (s), so the pose is
 * still up when the simulation resumes.
 */
export const RAGE_POSE_MARGIN = 0.05
const PRINCESS = { who: 'ハム姫', face: 'face_princess' }

export class Staging {
  private readonly reduced: boolean

  constructor(
    private host: DirectorHost,
    private end: (outcome: Outcome) => void
  ) {
    this.reduced = host.reducedMotion
  }

  // ------------------------------------------------------------------------------------------- helpers

  private get fx() {
    return this.host.view.fx
  }

  private rand() {
    return this.host.view.fx.rand()
  }

  /** The hero's centre in world pixels. */
  private heroCentre() {
    const p = this.host.world.player
    return { x: p.x + p.w / 2, y: p.y + p.h / 2 }
  }

  /** A world point in screen pixels of the current (unshaken) view. */
  private toScreen(at: { x: number; y: number }) {
    const { camera } = this.host
    return { x: Math.round(at.x - camera.x), y: Math.round(at.y - camera.y) }
  }

  /** Pans back to where the follow camera will settle on the hero. */
  private panHome(seconds: number) {
    const { camera, world } = this.host
    const home = camera.followCentre(world.player)
    camera.panTo(home.x, home.y, this.reduced ? 0 : seconds)
  }

  private trauma(amount: number) {
    this.host.camera.addTrauma(amount)
  }

  /**
   * A character's line: on the deck under a portrait stage (with their face) and a wordless balloon over them, or
   * a speech bubble on the stage when there is no deck.
   */
  private say(
    text: string,
    anchor: Anchor,
    seconds: number,
    speaker: { who: string; face: string },
    tone?: BubbleTone
  ) {
    const onDeck = this.host.hud.speak(text, speaker.who, speaker.face, seconds, tone)
    this.host.overlay.bubble(text, anchor, seconds, tone, onDeck)
  }

  /** The boss as a speaker (name and portrait). */
  private bossSpeaker() {
    const boss = this.host.world.boss
    return { who: boss?.def.name ?? '', face: boss ? `face_${boss.def.art}` : '' }
  }

  /** Confetti falling from the top of the view. */
  private confettiRain(count: number) {
    const { camera } = this.host
    const names = ['confettiA', 'confettiB', 'confettiC'] as const
    for (let i = 0; i < count; i++)
      this.fx.spawn(names[i % 3], camera.x + 20 + this.rand() * 600, camera.y - 12 - this.rand() * 40, {
        vx: (this.rand() - 0.5) * 60,
        vy: 60 + this.rand() * 90,
        gravity: 40,
        drag: 0.4,
        life: 1.8 + this.rand() * 0.8,
        layer: 'front',
        delay: this.rand() * 0.4
      })
  }

  // ------------------------------------------------------------------------------------------- stage start

  /** Iris in on the hero, the title card, a short ready beat with the input locked, then 「スタート！」. */
  stageStart(): Sequence {
    const { hud, overlay, sound, stage } = this.host
    const length = this.reduced ? 0.8 : STAGE_START_SECONDS
    const seq = new Sequence('stage-start', length, {
      priority: PRIORITY.start,
      skippable: true,
      claims: (t) => ({ lock: true, iris: t < 0.6 })
    })
    seq.at(
      0,
      () => {
        if (!this.reduced) {
          const h = this.toScreen(this.heroCentre())
          overlay.irisSnap(0, h.x, h.y)
          overlay.irisTo(1, 0.6, h.x, h.y)
          sound.cue('iris-in')
        }
        sound.cue('stage-start')
        hud.lights(true)
        hud.showBanner(`${stage.no}. ${stage.name}`, stage.subtitle, length - GO_LEAD - CARD_GAP)
      },
      true
    )
    seq.at(length - GO_LEAD, () => this.go(), true)
    seq.onEnd(() => this.hint())
    return seq
  }

  /**
   * Stage 1: ママ・ハム代 yells behind the hero, he jumps in fright, then the chase begins. The simulation is held
   * the whole time (she would catch him), and the moment stays short so the player gets going at once.
   */
  chaseStart(showBossBar: () => void): Sequence {
    const { hud, overlay, sound, stage, view, world } = this.host
    const length = this.reduced ? 0.7 : CHASE_START_SECONDS
    const seq = new Sequence('chase-start', length, {
      priority: PRIORITY.start,
      skippable: true,
      claims: (t) => ({ scale: 0, lock: true, iris: t < 0.5 })
    })
    const momHead = () => {
      const boss = world.boss
      return boss && !boss.dead ? { x: boss.x + boss.w / 2, y: boss.y - 18 } : null
    }
    seq.at(
      0,
      () => {
        const hero = this.heroCentre()
        const mom = momHead()
        if (!this.reduced) {
          // Open on both of them: the iris centres between the hero and the parent behind him.
          const c = this.toScreen(mom ? { x: (hero.x + mom.x) / 2, y: hero.y - 10 } : hero)
          overlay.irisSnap(0, c.x, c.y)
          overlay.irisTo(1, 0.45, c.x, c.y)
          sound.cue('iris-in')
        }
        sound.cue('stage-start')
        hud.lights(true)
        hud.showBanner(`${stage.no}. ${stage.name}`, stage.subtitle, length - 0.14 - CARD_GAP)
        view.actors.pose('hero', 'idle', 0.4)
        view.actors.pose('boss', 'idle', 0.2)
      },
      true
    )
    seq.at(
      this.reduced ? 0 : 0.16,
      () => {
        const boss = world.boss
        view.actors.pose('boss', 'yell', 1)
        this.say('こらーっ！まちなさーい！', momHead, 2, this.bossSpeaker(), 'yell')
        sound.cue('mom-yell')
        this.trauma(0.28)
        if (boss) {
          this.fx.burst('dust', boss.x + boss.w / 2, boss.y + boss.h - 6, 4, {
            speed: [40, 90],
            angle: [-Math.PI, 0],
            life: [0.3, 0.45]
          })
          this.fx.spawn('anger', boss.x + boss.w * 0.8, boss.y - 4, { vy: -14, life: 0.9, layer: 'front' })
        }
        showBossBar()
      },
      true
    )
    seq.at(this.reduced ? 0.1 : 0.4, () => {
      const p = world.player
      view.actors.pose('hero', 'hurt', 0.45, { hop: 24, hopSeconds: 0.36 })
      this.fx.spawn('alert', p.x + p.w / 2 + 6, p.y - 26, { vy: -20, life: 0.6, layer: 'front' })
      this.fx.spawn('sweat', p.x + p.w / 2 - 18, p.y - 6, { vy: -10, life: 0.5, layer: 'front' })
    })
    seq.at(length - 0.14, () => this.go(), true)
    seq.onEnd(() => this.hint())
    return seq
  }

  private go() {
    this.host.hud.showCall('スタート！', 'gold')
    this.host.sound.cue('ready')
  }

  private hint() {
    const hint = this.host.stage.hints[0]
    if (hint) this.host.hud.showToast(hint)
  }

  // ------------------------------------------------------------------------------------------- bosses

  /** The boss wakes: hold, letterbox, pan to him, his roar, the nameplate, back to the hero, 「ファイト！」. */
  bossIntro(showBossBar: () => void): Sequence | null {
    const { camera, hud, sound, view, world } = this.host
    const boss = world.boss
    if (!boss || boss.dead) return null
    const length = this.reduced ? 1.5 : BOSS_INTRO_SECONDS
    const pan = this.reduced ? 0.12 : 0.55
    const seq = new Sequence('boss-intro', length, {
      priority: PRIORITY.intro,
      skippable: true,
      claims: (t) => ({ scale: 0, lock: true, bars: t < length - 0.3, cinematic: t < length - 0.2, camera: true })
    })
    const centre = () => ({ x: boss.x + boss.w / 2, y: boss.y + boss.h / 2 })
    seq.at(0, () => {
      const c = centre()
      // Frame him with his feet above the nameplate zone (the lower third), whatever his size.
      const lowest = boss.y + boss.h - (ZONES.bossFeet - 0.5) * VIEW_H
      camera.panTo(c.x, Math.max(c.y - 24, lowest), this.reduced ? 0 : pan)
      view.actors.pose('boss', 'idle', pan + 0.05)
    })
    // The roar is posed for the whole `intro` clip and one pass of its sustained tail (holds included).
    const intro = bossSheetSpec(boss.def.kind, boss.def.art).intro
    const roar = Math.max(BOSS_ROAR_SECONDS, intro ? clipLife(intro) : 0)
    seq.at(pan, () => {
      const c = centre()
      view.actors.pose('boss', 'intro', roar)
      sound.cue('boss-roar')
      this.trauma(0.55)
      this.fx.spawn('ring', c.x, c.y, { layer: 'front' })
      this.fx.burst('dust', c.x, boss.y + boss.h - 6, 8, {
        speed: [60, 160],
        angle: [-Math.PI, 0],
        life: [0.35, 0.6],
        spread: boss.w / 3
      })
      this.fx.spawn('anger', c.x + boss.w * 0.35, boss.y - 6, { vy: -14, life: 1, layer: 'front' })
    })
    seq.at(
      pan + 0.3,
      () => {
        const face = `face_${boss.def.art}`
        hud.showNameplate(boss.def.name, boss.def.title, face, this.reduced ? 1.4 : 1.6)
      },
      true
    )
    seq.at(length - 0.75, () => this.panHome(0.5))
    seq.at(
      length - 0.25,
      () => {
        hud.showCall('ファイト！', 'red')
        showBossBar()
      },
      true
    )
    return seq
  }

  /**
   * Phase 2: the fight holds while he transforms (the flash and rings come with the event). The `rage` clip plays
   * whole: the pose lasts the clip and one pass of its burning tail, the hold a hair less; under reduced motion the
   * hold is the clip itself and the pose a hair longer. It is part of the fight, so it cannot be skipped: a player
   * mashing bite would otherwise never see it.
   */
  bossPhase(): Sequence | null {
    const { sound, view, world } = this.host
    const boss = world.boss
    if (!boss || boss.dead) return null
    const rage = bossSheetSpec(boss.def.kind, boss.def.art).rage
    const clip = rage ? specDuration(rage) : 0
    const pose = this.reduced ? clip + RAGE_POSE_MARGIN : rage ? clipLife(rage) : 0
    const length = Math.max(0.3, this.reduced ? clip : pose - RAGE_POSE_MARGIN)
    const seq = new Sequence('boss-phase', length, {
      priority: PRIORITY.phase,
      claims: { scale: 0, lock: true }
    })
    seq.at(0, () => {
      view.actors.pose('boss', 'rage', pose)
      sound.cue('boss-roar')
      this.trauma(0.3)
      const x = boss.x + boss.w / 2
      const y = boss.y + boss.h / 2
      this.fx.spawn('ring', x, y, { layer: 'front', delay: 0.3 })
      this.fx.burst('spark', x, y, 5, { speed: [80, 160], life: [0.25, 0.4], layer: 'front' })
    })
    return seq
  }

  /**
   * The boss falls: hit-stop, slow motion, a chain of explosions over his body (a sound for each), a white
   * flash on the last, then the camera eases back to the hero. The final boss gets a longer chain, a full-screen
   * flash and a rain of stars.
   */
  bossDefeat(event: At<'boss-down'>): Sequence {
    const { camera, overlay, sound, view, world } = this.host
    const final = world.boss?.def.kind === 'final'
    const w = world.boss ? world.boss.w : 80
    const h = world.boss ? world.boss.h : 80
    const reduced = this.reduced
    const length = reduced ? 1.3 : final ? 3.3 : 2.4
    const last = reduced ? 0.9 : final ? 2.3 : 1.65
    const seq = new Sequence('boss-defeat', length, {
      priority: PRIORITY.defeat,
      skippable: true,
      claims: (t) => ({
        lock: true,
        camera: true,
        bars: final && t < length - 0.3,
        cinematic: t < length - 0.2,
        scale: reduced ? (t < 0.45 ? 0 : 1) : t < last ? 0.3 : t < last + 0.35 ? 0.3 + (0.7 * (t - last)) / 0.35 : 1
      })
    })
    // The explosions follow the body: a boss knocked out in the air falls to the ground while they go off.
    const body = () => view.actors.bossBodyPoint() ?? { x: event.x, y: event.y }
    seq.at(0, () => {
      view.freeze(0.45)
      camera.panTo(event.x, event.y - 16, reduced ? 0 : 0.3)
      sound.cue('boss-boom')
    })
    // The event's own explosions (fx-map) land in the first 0.8 s; give each its sound, then keep the chain going.
    const chain = reduced
      ? [0.3, 0.6]
      : final
        ? [0.12, 0.28, 0.44, 0.6, 0.76, 0.95, 1.15, 1.35, 1.55, 1.75, 1.95, 2.12]
        : [0.12, 0.28, 0.44, 0.6, 0.76, 0.98, 1.2, 1.42]
    chain.forEach((t, i) =>
      seq.at(t, () => {
        sound.cue('boss-boom')
        if (t > 0.8 || reduced) {
          const { x, y } = body()
          this.fx.spawn('boom', x + (this.rand() - 0.5) * w * 1.1, y + (this.rand() - 0.5) * h, { layer: 'front' })
          // The boom clip already ends in smoke; a separate puff only every third blast keeps the explosions the star.
          if (i % 3 === 0) this.fx.burst('smoke', x, y, 1, { speed: [10, 40], life: [0.5, 0.8] })
        }
        this.trauma(0.2 + (i % 2) * 0.08)
        camera.kick((this.rand() - 0.5) * 6, (this.rand() - 0.5) * 4)
      })
    )
    seq.at(last, () => {
      const { x, y } = body()
      sound.cue('boss-boom')
      for (let i = 0; i < (final ? 4 : 2); i++)
        this.fx.spawn('boom', x + (this.rand() - 0.5) * w * 0.6, y + (this.rand() - 0.5) * h * 0.6, {
          layer: 'front',
          delay: i * 0.05
        })
      this.fx.spawn('ring', x, y, { layer: 'front' })
      this.fx.burst('star', x, y, final ? 18 : 12, {
        speed: [160, 320],
        gravity: 340,
        life: [0.7, 1.2],
        layer: 'front'
      })
      if (final) {
        overlay.flash('#ffffff', 1, 0.8)
        this.starRain()
      } else overlay.flash('#ffffff', 0.75, 0.35)
      this.trauma(final ? 1 : 0.65)
    })
    seq.at(length - 0.65, () => this.panHome(0.6))
    seq.onEnd(() => {
      if (world.goalOpen) this.host.hud.showToast('ボスを倒した！ゴールが開くよ')
    })
    return seq
  }

  /** Stars falling across the whole view (the final boss). */
  private starRain() {
    const { camera } = this.host
    for (let i = 0; i < 46; i++)
      this.fx.spawn(i % 3 ? 'star' : 'sparkle', camera.x + this.rand() * 640, camera.y - 10 - this.rand() * 60, {
        vx: (this.rand() - 0.5) * 50,
        vy: 90 + this.rand() * 140,
        gravity: 120,
        life: 1.6 + this.rand() * 0.9,
        layer: 'front',
        delay: this.rand() * 0.9
      })
  }

  // ------------------------------------------------------------------------------------------- goal and princess

  /** The goal opened: if it is off screen, a quick look at it and back (the edge arrow points there afterwards). */
  goalReveal(event: At<'goal-open'>): Sequence | null {
    const { camera, overlay, sound } = this.host
    if (camera.sees(event.x, event.y, 40)) {
      overlay.popup('ゴール！', event.x, event.y - 118, '#ffd45e')
      return null
    }
    const length = this.reduced ? 0.7 : 0.95
    const seq = new Sequence('goal-reveal', length, {
      priority: PRIORITY.goal,
      skippable: true,
      claims: { scale: 0, lock: true, camera: true }
    })
    seq.at(0, () => camera.panTo(event.x, event.y - 40, this.reduced ? 0 : 0.35))
    seq.at(this.reduced ? 0.1 : 0.35, () => {
      sound.cue('unlock')
      this.fx.spawn('ring', event.x, event.y, { layer: 'front' })
      this.fx.burst('sparkle', event.x, event.y - 20, 10, { speed: [60, 150], life: [0.4, 0.7], layer: 'front' })
      overlay.popup('ゴール！', event.x, event.y - 118, '#ffd45e')
    })
    seq.at(length - 0.32, () => this.panHome(0.3))
    return seq
  }

  /** ハム姫 is freed: hearts, she cheers and thanks him, the hero cheers; play slows for a moment, never stops. */
  princessFree(event: At<'princess-free'>): Sequence | null {
    const { camera, overlay, view, world } = this.host
    if (!camera.sees(event.x, event.y, 0) || world.state !== 'play') return null
    const seq = new Sequence('princess-free', 0.55, {
      priority: PRIORITY.princess,
      claims: this.reduced ? {} : { scale: 0.35, lock: true }
    })
    seq.at(0, () => {
      this.say('ありがとう！', { x: event.x, y: event.y - 40 }, 1.5, PRINCESS)
      this.fx.burst('heart', event.x, event.y - 30, 4, {
        speed: [30, 70],
        angle: [-Math.PI * 0.8, -Math.PI * 0.2],
        drag: 1,
        life: [0.9, 1.3],
        layer: 'front'
      })
      if (world.player.onGround && !world.player.dead) view.actors.pose('hero', 'cheer', 0.9)
    })
    return seq
  }

  /** ハム代 runs out of breath (stage 1). */
  momTired() {
    const { sound, world } = this.host
    const boss = world.boss
    if (!boss) return
    sound.cue('mom-tired')
    this.say('ぜぇ…ぜぇ…', () => ({ x: boss.x + boss.w / 2, y: boss.y - 14 }), 1.6, this.bossSpeaker())
  }

  // ------------------------------------------------------------------------------------------- endings

  /** The clear: the hero cheers, confetti, 「クリア！」, then an iris out on him and the result screen. */
  clear(event: At<'clear'>): Sequence {
    const { hud, overlay, sound, view, world } = this.host
    const length = this.reduced ? 1.6 : CLEAR_SECONDS
    const irisAt = length - 0.8
    const seq = new Sequence('clear', length, {
      priority: PRIORITY.end,
      skippable: true,
      skipTo: irisAt,
      claims: { lock: true, cinematic: true, iris: true }
    })
    seq.at(
      0,
      () => {
        sound.cue('confetti')
        // One thing at a time: the goal label is done, the call takes the upper third.
        overlay.clearPopups('ゴール！')
        hud.showCall('クリア！', 'gold')
        view.actors.pose('hero', 'cheer', length + 0.5)
        const princess = world.props.find((p) => p.kind === 'princess' && p.data !== 1)
        if (princess && this.host.camera.sees(princess.x + 32, princess.y + 32))
          this.say('やったね！', { x: princess.x + 32, y: princess.y + 24 }, 1.4, PRINCESS)
      },
      true
    )
    seq.at(0.12, () => {
      const c = this.heroCentre()
      this.fx.burst('star', c.x, c.y - 10, 8, { speed: [140, 260], gravity: 320, life: [0.6, 1], layer: 'front' })
      this.fx.burst('sparkle', event.x, event.y - 20, 8, { speed: [60, 140], life: [0.4, 0.7], layer: 'front' })
    })
    if (!this.reduced) {
      seq.at(0.3, () => this.confettiRain(26))
      seq.at(0.75, () => this.confettiRain(18))
    }
    seq.at(
      irisAt,
      () => {
        const h = this.toScreen(this.heroCentre())
        overlay.irisTo(0, 0.7, h.x, h.y)
        sound.cue('iris-out')
        hud.lights(false)
      },
      true
    )
    seq.at(length, () => this.end('clear'), true)
    return seq
  }

  /** The death: hit-stop, a spotlight on the hero while his `die` clip plays out, an iris out on him. */
  death(event: At<'dead'>): Sequence {
    const { hud, overlay, sound, view } = this.host
    const length = this.reduced ? 1.3 : DEATH_SECONDS
    const irisAt = length - 0.8
    const seq = new Sequence('death', length, {
      priority: PRIORITY.end,
      skippable: true,
      skipTo: irisAt,
      claims: { lock: true, cinematic: true, iris: true, spotlight: true }
    })
    // The spotlight follows the body (it is knocked up and falls to the ground) and the iris closes on where it
    // comes to lie; a body that fell out of the view through a pit is followed to the edge of the view.
    const onScreen = (at: { x: number; y: number }) => {
      const s = this.toScreen(at)
      return { x: Math.max(0, Math.min(VIEW_W, s.x)), y: Math.max(0, Math.min(VIEW_H, s.y)) }
    }
    const body = () => onScreen(view.actors.deathPoint() ?? { x: event.x, y: event.y })
    const spot = () => {
      const s = body()
      overlay.spotX = s.x
      overlay.spotY = s.y
    }
    seq.at(0, () => {
      view.freeze(0.3)
      spot()
    })
    seq.during(0, irisAt, spot)
    seq.at(
      irisAt,
      () => {
        const rest = view.actors.deathRest()
        const s = rest ? onScreen(rest) : body()
        overlay.irisTo(0, 0.7, s.x, s.y)
        sound.cue('iris-out')
        hud.lights(false)
      },
      true
    )
    seq.at(length, () => this.end('dead'), true)
    return seq
  }
}
