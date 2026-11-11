/**
 * Which music plays when. `musicFor` is a pure function of a small state so it can be unit-tested; `SessionMusic`
 * reads that state from a live world and drives `GameAudio.setMusic` / `setDuck` during a stage.
 */
import type { GameAudio, ThemeName } from '../audio/api'
import type { SimEvent } from '../game/events'
import type { World } from '../game/sim'

/** The boss fight as the music sees it; null when no boss fight is on (the chasing parent is not one). */
export interface BossMusic {
  /** 黒ハム王. */
  final: boolean
  /** Health ratio 0..1. */
  ratio: number
  phase: number
}

export type MusicState =
  | { screen: 'title' | 'select' | 'story' | 'ending' | 'result' | 'dead' }
  | {
      screen: 'play'
      /** The stage's world theme (`stage.theme`). */
      theme: ThemeName
      hp: number
      outcome: 'play' | 'clear' | 'dead'
      boss: BossMusic | null
      /** True for a moment after a boss falls: the music is cut. */
      silent: boolean
    }

export interface MusicChoice {
  theme: ThemeName | null
  layer: number
}

/** The hero has this many hearts or fewer: the music tightens (layer 1). */
export const LOW_HP = 2
/** Below this health ratio a boss theme raises its intensity. */
export const BOSS_LOW_RATIO = 0.3
/** Seconds of silence after a boss falls, before the world theme returns. */
export const BOSS_DOWN_SILENCE = 1.5

export function musicFor(state: MusicState): MusicChoice {
  switch (state.screen) {
    case 'title':
    case 'select':
    case 'story':
    case 'ending':
      return { theme: state.screen, layer: 0 }
    // The jingle was started during play; asking again is a no-op, and a finished jingle stays silent.
    case 'result':
      return { theme: 'clear', layer: 0 }
    case 'dead':
      return { theme: 'gameover', layer: 0 }
    case 'play': {
      if (state.outcome === 'clear') return { theme: 'clear', layer: 0 }
      if (state.outcome === 'dead') return { theme: 'gameover', layer: 0 }
      if (state.silent) return { theme: null, layer: 0 }
      const boss = state.boss
      if (boss) {
        if (boss.final) return { theme: 'finalBoss', layer: boss.phase >= 2 ? 2 : boss.ratio < BOSS_LOW_RATIO ? 1 : 0 }
        return { theme: 'boss', layer: boss.ratio < BOSS_LOW_RATIO ? 1 : 0 }
      }
      return { theme: state.theme, layer: state.hp > 0 && state.hp <= LOW_HP ? 1 : 0 }
    }
  }
}

/** 0 normal, 1 strongest: pause ducks hard, being under water muffles. */
export const duckFor = (paused: boolean, inWater: boolean) => (paused ? 1 : inWater ? 0.6 : 0)

/** The music state of a live world. */
export function musicStateOf(world: World, silent: boolean): MusicState {
  const boss = world.boss
  const fight = boss && boss.active && !boss.dead && !boss.def.stamina
  return {
    screen: 'play',
    theme: world.theme,
    hp: world.player.hp,
    outcome: world.state,
    boss: fight
      ? { final: boss.def.kind === 'final', ratio: boss.hp / Math.max(1, boss.maxHp), phase: boss.phase }
      : null,
    silent
  }
}

/** Drives the music and its duck for one stage. */
export class SessionMusic {
  private silence = 0
  private paused = false
  private inWater = false
  private key = ''
  private duck = -1

  constructor(private audio: GameAudio) {}

  handle(event: SimEvent) {
    if (event.type === 'boss-down') this.silence = BOSS_DOWN_SILENCE
  }

  update(world: World, dt: number) {
    this.silence = Math.max(0, this.silence - dt)
    this.inWater = world.player.inWater
    const choice = musicFor(musicStateOf(world, this.silence > 0))
    const key = `${choice.theme}:${choice.layer}`
    if (key !== this.key) {
      this.key = key
      this.audio.setMusic(choice.theme, choice.layer)
    }
    this.applyDuck()
  }

  setPaused(paused: boolean) {
    this.paused = paused
    this.applyDuck()
  }

  stop() {
    this.paused = false
    this.inWater = false
    this.applyDuck()
  }

  private applyDuck() {
    const duck = duckFor(this.paused, this.inWater)
    if (duck === this.duck) return
    this.duck = duck
    this.audio.setDuck(duck)
  }
}
