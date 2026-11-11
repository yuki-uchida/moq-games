import { describe, expect, it } from 'vitest'
import { ENEMY_KINDS, ENEMY_SPEC, HERO_SPEC, PRINCESS_SPEC, type AnimSpec } from '../src/art/contract'
import type { BossState } from '../src/game/sim'
import type { BossKind } from '../src/game/types'
import {
  FINAL_VOLLEY_AT,
  SPIT_INTERVAL,
  bossClip,
  bossSheetSpec,
  enemyClip,
  heroClip,
  hitTime,
  princessClip,
  specDuration,
  type ClipChoice,
  type EnemySnapshot,
  type HeroSnapshot
} from '../src/view/clips'

const frameOf = (spec: AnimSpec, choice: ClipChoice) => {
  if (choice.frame !== undefined) return choice.frame
  const tick = Math.floor(choice.t * spec.fps)
  return spec.loop ? tick % spec.frames : Math.min(spec.frames - 1, tick)
}

const hero = (extra: Partial<HeroSnapshot> = {}): HeroSnapshot => ({
  cheering: false,
  cheerAge: 0,
  biteAge: null,
  hurt: false,
  hurtAge: 0,
  inWater: false,
  waterTime: 0,
  onGround: true,
  vx: 0,
  vy: 0,
  facing: 1,
  airTime: 0,
  landAge: 99,
  hardLanding: false,
  distance: 0,
  idleTime: 0,
  blinkAge: 99,
  skidAge: null,
  ...extra
})

describe('hero clips', () => {
  const cases: [string, Partial<HeroSnapshot>][] = [
    ['idle', {}],
    ['blink', { blinkAge: 0.05 }],
    ['wait', { idleTime: 5.2 }],
    ['run', { vx: 215, distance: 300 }],
    ['skid', { vx: -180, facing: 1, skidAge: 0.05 }],
    ['land', { landAge: 0.05, hardLanding: true }],
    ['jump', { onGround: false, vy: -500 }],
    ['fall', { onGround: false, vy: 300 }],
    ['swim', { inWater: true, onGround: false }],
    ['hurt', { hurt: true, onGround: false, vy: -200 }],
    ['bite', { biteAge: 0.02, hurt: true, vx: 215 }],
    ['cheer', { cheering: true, biteAge: 0.02 }]
  ]
  for (const [name, state] of cases)
    it(`chooses ${name}`, () => {
      const choice = heroClip(hero(state))
      expect(choice.name).toBe(name)
      expect(HERO_SPEC[choice.name]).toBeDefined()
    })

  it('a soft landing does not play land', () => {
    expect(heroClip(hero({ landAge: 0.05, hardLanding: false })).name).toBe('idle')
  })

  it('shows the bite hit frame the moment the simulation bites', () => {
    const choice = heroClip(hero({ biteAge: 0 }))
    expect(frameOf(HERO_SPEC.bite, choice)).toBe(HERO_SPEC.bite.hit)
  })

  it('advances the run cycle with distance, not time', () => {
    const a = heroClip(hero({ vx: 215, distance: 0 }))
    const b = heroClip(hero({ vx: 100, distance: 0 }))
    expect(a.t).toBe(b.t)
    const far = heroClip(hero({ vx: 215, distance: 215 / 14 }))
    expect(frameOf(HERO_SPEC.run, far)).toBe(1)
  })
})

const enemy = (kind: EnemySnapshot['kind'], extra: Partial<EnemySnapshot> = {}): EnemySnapshot => ({
  kind,
  vx: 0,
  vy: 0,
  onGround: true,
  hitFlash: 0,
  shootTimer: 1.5,
  landAge: 99,
  time: 0.3,
  ...extra
})

describe('enemy clips', () => {
  const cases: [EnemySnapshot['kind'], Partial<EnemySnapshot>, string, number?][] = [
    ['walker', {}, 'idle'],
    ['walker', { vx: 74 }, 'move'],
    ['tough', {}, 'idle'],
    ['tough', { vx: -62 }, 'move'],
    ['flyer', {}, 'move'],
    ['jumper', {}, 'idle'],
    ['jumper', { onGround: false, vy: -300 }, 'air', 0],
    ['jumper', { onGround: false, vy: 300 }, 'air', 1],
    ['jumper', { landAge: 0.05 }, 'land'],
    ['spitter', {}, 'idle'],
    ['spitter', { shootTimer: 0.1 }, 'shoot'],
    ['spitter', { shootTimer: SPIT_INTERVAL - 0.05 }, 'shoot'],
    ...ENEMY_KINDS.map(
      (kind) => [kind, { hitFlash: 0.1 }, 'hurt'] as [EnemySnapshot['kind'], Partial<EnemySnapshot>, string]
    )
  ]
  for (const [kind, state, name, frame] of cases)
    it(`${kind} chooses ${name}${frame !== undefined ? ` frame ${frame}` : ''}`, () => {
      const choice = enemyClip(enemy(kind, state))
      expect(choice.name).toBe(name)
      expect(ENEMY_SPEC[kind][choice.name]).toBeDefined()
      if (frame !== undefined) expect(choice.frame).toBe(frame)
    })

  it('the spitter shows its hit frame when the acorn leaves', () => {
    const spec = ENEMY_SPEC.spitter.shoot
    const lead = hitTime(spec)
    // Just before the shot the clip is winding up; right after it the `hit` frame shows.
    expect(frameOf(spec, enemyClip(enemy('spitter', { shootTimer: lead - 0.001 })))).toBeLessThan(spec.hit!)
    expect(frameOf(spec, enemyClip(enemy('spitter', { shootTimer: SPIT_INTERVAL })))).toBe(spec.hit)
  })
})

const ART: Record<BossKind, string> = {
  chaser: 'mom',
  brute: 'boarBoss',
  flyer: 'crowBoss',
  tank: 'bearBoss',
  swarm: 'foxBoss',
  final: 'king'
}
const STATES: BossState[] = ['idle', 'windup', 'charge', 'recover', 'stunned', 'tired', 'shoot', 'dive', 'slam']

const boss = (kind: BossKind, state: BossState, extra = {}) => ({
  kind,
  state,
  prevState: null,
  stateTime: 0.1,
  active: true,
  vx: 0,
  vy: 0,
  rageAge: null,
  time: 0.4,
  ...extra
})

describe('boss clips', () => {
  it('every kind and state picks a clip its sheet has', () => {
    for (const kind of Object.keys(ART) as BossKind[])
      for (const state of STATES)
        for (const extra of [
          {},
          { vx: 120 },
          { vy: -300 },
          { vy: 300 },
          { prevState: 'slam' },
          { prevState: 'shoot' },
          { active: false },
          { rageAge: 0.1 }
        ]) {
          const choice = bossClip(boss(kind, state, extra), ART[kind])
          expect(bossSheetSpec(kind, ART[kind])[choice.name], `${kind}/${state}/${JSON.stringify(extra)}`).toBeDefined()
        }
  })

  const cases: [BossKind, BossState, Record<string, unknown>, string, number?][] = [
    ['chaser', 'idle', {}, 'move'],
    ['chaser', 'stunned', {}, 'stunned'],
    ['chaser', 'tired', {}, 'tired'],
    ['brute', 'idle', {}, 'idle'],
    ['brute', 'idle', { active: false }, 'idle'],
    ['brute', 'windup', {}, 'windup'],
    ['brute', 'charge', {}, 'attack'],
    ['brute', 'stunned', {}, 'stunned'],
    ['brute', 'recover', {}, 'recover'],
    ['flyer', 'idle', {}, 'idle'],
    ['flyer', 'windup', {}, 'windup'],
    ['flyer', 'dive', {}, 'attack'],
    ['flyer', 'recover', {}, 'recover'],
    ['tank', 'idle', { vx: 80 }, 'move'],
    ['tank', 'idle', {}, 'idle'],
    ['tank', 'windup', {}, 'windup'],
    ['tank', 'slam', { vy: -400 }, 'air', 0],
    ['tank', 'slam', { vy: 400 }, 'air', 1],
    ['tank', 'recover', { prevState: 'slam', stateTime: 0.05 }, 'land'],
    ['tank', 'recover', { prevState: 'slam', stateTime: 0.6 }, 'recover'],
    ['swarm', 'idle', { vx: 80 }, 'move'],
    ['swarm', 'windup', {}, 'windup'],
    ['swarm', 'charge', {}, 'attack'],
    ['swarm', 'recover', {}, 'recover'],
    ['final', 'idle', { vx: 80 }, 'move'],
    ['final', 'windup', {}, 'windup'],
    ['final', 'charge', {}, 'attack'],
    ['final', 'slam', { vy: -400 }, 'air', 0],
    ['final', 'recover', { prevState: 'slam', stateTime: 0.05 }, 'land'],
    ['final', 'shoot', {}, 'shoot'],
    ['final', 'recover', { prevState: 'shoot', stateTime: 0.02 }, 'shoot'],
    ['final', 'recover', { prevState: 'shoot', stateTime: 0.5 }, 'recover'],
    ['final', 'idle', { rageAge: 0.1 }, 'rage'],
    ['final', 'idle', { rageAge: 5 }, 'idle']
  ]
  for (const [kind, state, extra, name, frame] of cases)
    it(`${kind} in ${state} ${JSON.stringify(extra)} plays ${name}`, () => {
      const choice = bossClip(boss(kind, state, extra), ART[kind])
      expect(choice.name).toBe(name)
      if (frame !== undefined) expect(choice.frame).toBe(frame)
    })

  it('the final boss shows its shoot hit frame when the volley leaves', () => {
    const spec = bossSheetSpec('final', 'king').shoot
    expect(frameOf(spec, bossClip(boss('final', 'shoot', { stateTime: FINAL_VOLLEY_AT }), 'king'))).toBe(spec.hit)
    expect(frameOf(spec, bossClip(boss('final', 'shoot', { stateTime: 0.1 }), 'king'))).toBe(0)
  })

  it('the rage clip plays once', () => {
    const rage = bossSheetSpec('final', 'king').rage
    expect(bossClip(boss('final', 'idle', { rageAge: specDuration(rage) + 0.01 }), 'king').name).toBe('idle')
  })
})

describe('princess clips', () => {
  it('is sad while caged, cheers when freed, waves at the open exit', () => {
    const cases: [ClipChoice, string][] = [
      [princessClip(true, null, false, 0), 'sad'],
      [princessClip(false, 0.5, false, 0), 'cheer'],
      [princessClip(false, 2.5, false, 0), 'idle'],
      [princessClip(false, 2.5, true, 0), 'wave'],
      [princessClip(false, null, false, 0), 'idle']
    ]
    for (const [choice, name] of cases) {
      expect(choice.name).toBe(name)
      expect(PRINCESS_SPEC[choice.name]).toBeDefined()
    }
  })
})
