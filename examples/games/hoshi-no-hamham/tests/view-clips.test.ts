import { describe, expect, it } from 'vitest'
import {
  ENEMY_KINDS,
  ENEMY_LEGACY,
  ENEMY_NEXT,
  HERO_LEGACY,
  HERO_NEXT,
  HERO_SPEC,
  PRINCESS_SPEC,
  bossSpecLegacy,
  bossSpecNext,
  type AnimSpec,
  type BossArt
} from '../src/art/contract'
import { frameAt, type Anim } from '../src/art/sheet'
import type { BossState } from '../src/game/sim'
import type { BossKind } from '../src/game/types'
import {
  APEX_SPEED,
  BLINK_TIME,
  BOSS_APEX_SPEED,
  FINAL_VOLLEY_AT,
  JUMPER_APEX_SPEED,
  JUMPER_FAST_SPEED,
  SKID_TAIL,
  SPIT_INTERVAL,
  airFrame,
  bossClip,
  bossSheetSpec,
  clipLife,
  enemyClip,
  heroClip,
  hitTime,
  princessClip,
  specDuration,
  sustainCycle,
  type ClipChoice,
  type EnemySnapshot,
  type HeroSnapshot
} from '../src/view/clips'

const frameOf = (spec: AnimSpec, choice: ClipChoice) => {
  if (choice.frame !== undefined) return choice.frame
  const tick = Math.floor(choice.t * spec.fps)
  if (spec.loop) return tick % spec.frames
  if (spec.sustain && tick >= spec.frames) return spec.frames - spec.sustain + ((tick - spec.frames) % spec.sustain)
  return Math.min(spec.frames - 1, tick)
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
  turnAge: null,
  ...extra
})

const HERO_SPECS = [
  ['legacy', HERO_LEGACY],
  ['new', HERO_NEXT]
] as const

describe('hero clips', () => {
  // Vertical speeds here are far from the apex band, so both specs give the same clip.
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
  for (const [label, spec] of HERO_SPECS)
    for (const [name, state] of cases)
      it(`chooses ${name} (${label} spec)`, () => {
        const choice = heroClip(hero(state), spec)
        expect(choice.name).toBe(name)
        expect(spec[choice.name]).toBeDefined()
      })

  it('every clip a snapshot can pick exists in the spec it was given', () => {
    const states: Partial<HeroSnapshot>[] = []
    for (const onGround of [true, false])
      for (const vy of [-500, -100, 0, 100, 500])
        for (const vx of [0, 50, -180, 215])
          for (const extra of [
            {},
            { skidAge: 0.05 },
            { turnAge: 0.02 },
            { blinkAge: 0.05 },
            { idleTime: 5.2 },
            { landAge: 0.05, hardLanding: true },
            { inWater: true },
            { hurt: true },
            { biteAge: 0.02 },
            { cheering: true }
          ])
            states.push({ onGround, vy, vx, ...extra })
    for (const [label, spec] of HERO_SPECS)
      for (const state of states) {
        const choice = heroClip(hero(state), spec)
        expect(spec[choice.name], `${label} ${choice.name} ${JSON.stringify(state)}`).toBeDefined()
      }
  })

  it('a soft landing does not play land', () => {
    expect(heroClip(hero({ landAge: 0.05, hardLanding: false })).name).toBe('idle')
  })

  for (const [label, spec] of HERO_SPECS)
    it(`shows the bite hit frame the moment the simulation bites (${label} spec)`, () => {
      const choice = heroClip(hero({ biteAge: 0 }), spec)
      expect(frameOf(spec.bite, choice)).toBe(spec.bite.hit)
    })

  for (const [label, spec] of HERO_SPECS)
    it(`advances the run cycle with distance, not time (${label} spec)`, () => {
      const a = heroClip(hero({ vx: 215, distance: 0 }), spec)
      const b = heroClip(hero({ vx: 100, distance: 0 }), spec)
      expect(a.t).toBe(b.t)
      const far = heroClip(hero({ vx: 215, distance: 215 / 14 }), spec)
      expect(frameOf(spec.run, far)).toBe(1)
    })
})

describe('hero blink without a pop', () => {
  it('the new blink plays on the idle time base while it lasts, then idle returns on the same frame', () => {
    const idleTime = 1.3
    const during = heroClip(hero({ idleTime, blinkAge: BLINK_TIME - 0.01 }), HERO_NEXT)
    const after = heroClip(hero({ idleTime, blinkAge: BLINK_TIME }), HERO_NEXT)
    expect(during).toEqual({ name: 'blink', t: idleTime })
    expect(after).toEqual({ name: 'idle', t: idleTime })
    expect(HERO_NEXT.blink.frames).toBe(HERO_NEXT.idle.frames)
    expect(HERO_NEXT.blink.fps).toBe(HERO_NEXT.idle.fps)
    expect(frameOf(HERO_NEXT.blink, during)).toBe(frameOf(HERO_NEXT.idle, after))
  })

  it('the blink does not interrupt wait or run', () => {
    expect(heroClip(hero({ idleTime: 5.1, blinkAge: 0 }), HERO_NEXT).name).toBe('wait')
    expect(heroClip(hero({ vx: 200, blinkAge: 0 }), HERO_NEXT).name).toBe('run')
  })

  it('the legacy blink keeps its own time base and length', () => {
    const choice = heroClip(hero({ idleTime: 1.3, blinkAge: 0.05 }), HERO_LEGACY)
    expect(choice).toEqual({ name: 'blink', t: 0.05 })
    expect(heroClip(hero({ blinkAge: specDuration(HERO_LEGACY.blink) + 0.01 }), HERO_LEGACY).name).toBe('idle')
  })
})

describe('hero apex', () => {
  const air = (vy: number) => heroClip(hero({ onGround: false, vy, airTime: 0.3 }), HERO_NEXT)

  it('shows the top of the arc at low vertical speed, rising frame first', () => {
    expect(air(-APEX_SPEED)).toEqual({ name: 'apex', t: 0.3, frame: 0 })
    expect(air(-1)).toMatchObject({ name: 'apex', frame: 0 })
    expect(air(0)).toMatchObject({ name: 'apex', frame: 1 })
    expect(air(APEX_SPEED)).toMatchObject({ name: 'apex', frame: 1 })
  })

  it('jumps faster upward and falls faster downward, on the air time', () => {
    expect(air(-APEX_SPEED - 1)).toEqual({ name: 'jump', t: 0.3 })
    expect(air(APEX_SPEED + 1)).toEqual({ name: 'fall', t: 0.3 })
  })

  it('the legacy spec has no apex: jump while rising, fall otherwise', () => {
    const legacy = (vy: number) => heroClip(hero({ onGround: false, vy }), HERO_LEGACY).name
    expect(legacy(-10)).toBe('jump')
    expect(legacy(0)).toBe('fall')
    expect(legacy(10)).toBe('fall')
  })
})

describe('hero turn', () => {
  const turning = (extra: Partial<HeroSnapshot>, spec: Record<string, AnimSpec> = HERO_NEXT) =>
    heroClip(hero({ turnAge: 0, ...extra }), spec)

  it('plays from its first frame for its length, then yields', () => {
    expect(turning({})).toEqual({ name: 'turn', t: 0 })
    expect(turning({ turnAge: specDuration(HERO_NEXT.turn) - 0.001 }).name).toBe('turn')
    expect(turning({ turnAge: specDuration(HERO_NEXT.turn) }).name).toBe('idle')
  })

  it('beats run, wait, blink and idle', () => {
    expect(turning({ vx: 200 }).name).toBe('turn')
    expect(turning({ idleTime: 5.2 }).name).toBe('turn')
    expect(turning({ blinkAge: 0 }).name).toBe('turn')
  })

  it('yields to cheer, bite, hurt, swim, air, land and skid', () => {
    expect(turning({ cheering: true }).name).toBe('cheer')
    expect(turning({ biteAge: 0.01 }).name).toBe('bite')
    expect(turning({ hurt: true }).name).toBe('hurt')
    expect(turning({ inWater: true }).name).toBe('swim')
    expect(turning({ onGround: false, vy: 400 }).name).toBe('fall')
    expect(turning({ onGround: false, vy: 0 }).name).toBe('apex')
    expect(turning({ landAge: 0.02, hardLanding: true }).name).toBe('land')
    expect(turning({ skidAge: 0.02 }).name).toBe('skid')
  })

  it('the legacy spec has no turn', () => {
    expect(turning({}, HERO_LEGACY).name).toBe('idle')
  })
})

describe('hero skid', () => {
  it('a skid without sustain ends a short tail after one pass', () => {
    const end = specDuration(HERO_LEGACY.skid) + SKID_TAIL
    expect(heroClip(hero({ skidAge: end - 0.01 }), HERO_LEGACY).name).toBe('skid')
    expect(heroClip(hero({ skidAge: end + 0.01 }), HERO_LEGACY).name).toBe('idle')
  })

  it('a sustained skid keeps showing as long as the view reports one, with no frame override', () => {
    expect(HERO_NEXT.skid.sustain).toBeGreaterThan(1)
    const late = heroClip(hero({ skidAge: 1.5 }), HERO_NEXT)
    expect(late).toEqual({ name: 'skid', t: 1.5 })
    // 1.5 s is past the clip: the sheet's frame lookup cycles the last two frames.
    expect([1, 2]).toContain(frameOf(HERO_NEXT.skid, late))
  })
})

describe('air frames', () => {
  it('a 2-frame clip is rising then falling', () => {
    expect(airFrame(-1, 2, 120)).toBe(0)
    expect(airFrame(0, 2, 120)).toBe(1)
    expect(airFrame(500, 2, 120)).toBe(1)
  })

  it('a 3-frame clip is rising, the top, falling', () => {
    expect(airFrame(-121, 3, 120)).toBe(0)
    expect(airFrame(-120, 3, 120)).toBe(1)
    expect(airFrame(0, 3, 120)).toBe(1)
    expect(airFrame(120, 3, 120)).toBe(1)
    expect(airFrame(121, 3, 120)).toBe(2)
  })

  it('a 5-frame clip is the launch, rising, the top, falling, bracing for the ground', () => {
    expect(airFrame(-381, 5, 120, 380)).toBe(0)
    expect(airFrame(-380, 5, 120, 380)).toBe(1)
    expect(airFrame(-121, 5, 120, 380)).toBe(1)
    expect(airFrame(-120, 5, 120, 380)).toBe(2)
    expect(airFrame(120, 5, 120, 380)).toBe(2)
    expect(airFrame(121, 5, 120, 380)).toBe(3)
    expect(airFrame(380, 5, 120, 380)).toBe(3)
    expect(airFrame(381, 5, 120, 380)).toBe(4)
  })
})

describe('sustain', () => {
  const anim = (spec: AnimSpec): Anim =>
    ({
      frames: Array.from({ length: spec.frames }, () => ({})),
      fps: spec.fps,
      loop: spec.loop,
      sustain: spec.sustain
    }) as unknown as Anim

  it('sustainCycle and clipLife follow the spec', () => {
    expect(sustainCycle(HERO_NEXT.skid)).toBeCloseTo(2 / 14)
    expect(sustainCycle(HERO_SPEC.run)).toBe(0)
    expect(clipLife(HERO_SPEC.land)).toBeCloseTo(specDuration(HERO_SPEC.land))
    expect(clipLife(HERO_SPEC.land, 0.5)).toBeCloseTo(specDuration(HERO_SPEC.land) + 0.5)
    const defeat = bossSpecNext('bearBoss').defeat
    // A short tail is lengthened to one pass of the sustained frames; a long one is kept.
    expect(clipLife(defeat, 0.01)).toBeCloseTo(specDuration(defeat) + 2 / defeat.fps)
    expect(clipLife(defeat, 0.5)).toBeCloseTo(specDuration(defeat) + 0.5)
  })

  it('frameAt keeps cycling the sustained tail of a windup', () => {
    const windup = bossSpecNext('boarBoss').windup
    const a = anim(windup)
    const tail = Array.from({ length: 6 }, (_, k) => frameAt(a, specDuration(windup) + (k + 0.5) / windup.fps))
    expect(tail).toEqual([2, 3, 2, 3, 2, 3])
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
  for (const [label, specs] of [
    ['legacy', ENEMY_LEGACY],
    ['new', ENEMY_NEXT]
  ] as const)
    for (const [kind, state, name, frame] of cases) {
      // The 300 px/s rise and fall are frames 1 and 3 of the frog's 5-frame hop (0 and 1 of a 2-frame clip).
      const five = specs[kind].air?.frames === 5
      const want = five && frame === 0 ? 1 : five && frame === 1 ? 3 : frame
      it(`${kind} chooses ${name}${want !== undefined ? ` frame ${want}` : ''} (${label} spec)`, () => {
        const choice = enemyClip(enemy(kind, state), specs[kind])
        expect(choice.name).toBe(name)
        expect(specs[kind][choice.name]).toBeDefined()
        if (want !== undefined) expect(choice.frame).toBe(want)
      })
    }

  it('the jumper picks a five-frame hop by vertical speed (new) and a two-frame one (legacy)', () => {
    const air = (vy: number, specs = ENEMY_NEXT.jumper) =>
      enemyClip(enemy('jumper', { onGround: false, vy }), specs).frame
    expect(air(-520)).toBe(0)
    expect(air(-JUMPER_FAST_SPEED - 1)).toBe(0)
    expect(air(-JUMPER_FAST_SPEED)).toBe(1)
    expect(air(-JUMPER_APEX_SPEED - 1)).toBe(1)
    expect(air(-JUMPER_APEX_SPEED)).toBe(2)
    expect(air(0)).toBe(2)
    expect(air(JUMPER_APEX_SPEED)).toBe(2)
    expect(air(JUMPER_APEX_SPEED + 1)).toBe(3)
    expect(air(JUMPER_FAST_SPEED)).toBe(3)
    expect(air(JUMPER_FAST_SPEED + 1)).toBe(4)
    expect(air(-50, ENEMY_LEGACY.jumper)).toBe(0)
    expect(air(50, ENEMY_LEGACY.jumper)).toBe(1)
    expect(air(500, ENEMY_LEGACY.jumper)).toBe(1)
  })

  for (const [label, specs] of [
    ['legacy', ENEMY_LEGACY.spitter],
    ['new', ENEMY_NEXT.spitter]
  ] as const)
    it(`the spitter shows its hit frame when the acorn leaves and follows through (${label} spec)`, () => {
      const spec = specs.shoot
      const lead = hitTime(spec)
      const tail = specDuration(spec) - lead
      const pick = (shootTimer: number) => enemyClip(enemy('spitter', { shootTimer }), specs)
      // Just before the shot the clip is winding up; right after it the `hit` frame shows.
      expect(frameOf(spec, pick(lead - 0.001))).toBeLessThan(spec.hit!)
      expect(frameOf(spec, pick(SPIT_INTERVAL))).toBe(spec.hit)
      // The follow-through plays on to the last frame, then the spitter idles.
      expect(frameOf(spec, pick(SPIT_INTERVAL - tail + 0.001))).toBe(spec.frames - 1)
      expect(pick(SPIT_INTERVAL - tail - 0.001).name).toBe('idle')
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

/** The legacy or the new contract of a boss kind's sheet (the chaser has one spec in force only). */
const bossSpecOf = (label: 'legacy' | 'new', kind: BossKind) =>
  kind === 'chaser'
    ? bossSheetSpec(kind, ART[kind])
    : label === 'legacy'
      ? bossSpecLegacy(ART[kind] as BossArt)
      : bossSpecNext(ART[kind] as BossArt)

describe('boss clips', () => {
  for (const label of ['legacy', 'new'] as const)
    it(`every kind and state picks a clip its sheet has (${label} spec)`, () => {
      for (const kind of Object.keys(ART) as BossKind[])
        for (const state of STATES)
          for (const extra of [
            {},
            { vx: 120 },
            { vy: -300 },
            { vy: 0 },
            { vy: 300 },
            { prevState: 'slam' },
            { prevState: 'shoot' },
            { active: false },
            { rageAge: 0.1 }
          ]) {
            const spec = bossSpecOf(label, kind)
            const choice = bossClip(boss(kind, state, extra), ART[kind], spec)
            expect(spec[choice.name], `${kind}/${state}/${JSON.stringify(extra)}`).toBeDefined()
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
  for (const label of ['legacy', 'new'] as const)
    for (const [kind, state, extra, name, frame] of cases)
      it(`${kind} in ${state} ${JSON.stringify(extra)} plays ${name} (${label} spec)`, () => {
        const choice = bossClip(boss(kind, state, extra), ART[kind], bossSpecOf(label, kind))
        expect(choice.name).toBe(name)
        if (frame !== undefined) expect(choice.frame).toBe(frame)
      })

  it('a leaping boss falls with the last frame (legacy 2-frame: frame 1, new 3-frame: frame 2)', () => {
    const fall = (label: 'legacy' | 'new') =>
      bossClip(boss('tank', 'slam', { vy: 400 }), ART.tank, bossSpecOf(label, 'tank')).frame
    expect(fall('legacy')).toBe(1)
    expect(fall('new')).toBe(2)
  })

  it('three-frame boss air clips pick rising, the top, falling by vertical speed', () => {
    for (const kind of ['tank', 'final'] as const) {
      const spec = bossSpecNext(ART[kind] as BossArt)
      expect(spec.air.frames).toBe(3)
      const air = (vy: number) => bossClip(boss(kind, 'slam', { vy }), ART[kind], spec).frame
      expect(air(-BOSS_APEX_SPEED - 1)).toBe(0)
      expect(air(-BOSS_APEX_SPEED)).toBe(1)
      expect(air(BOSS_APEX_SPEED)).toBe(1)
      expect(air(BOSS_APEX_SPEED + 1)).toBe(2)
    }
  })

  for (const label of ['legacy', 'new'] as const)
    it(`the final boss shows its shoot hit frame when the volley leaves and follows through (${label} spec)`, () => {
      const spec = bossSpecOf(label, 'final')
      const shoot = spec.shoot
      const pick = (state: BossState, extra = {}) => bossClip(boss('final', state, extra), 'king', spec)
      expect(frameOf(shoot, pick('shoot', { stateTime: FINAL_VOLLEY_AT }))).toBe(shoot.hit)
      expect(frameOf(shoot, pick('shoot', { stateTime: FINAL_VOLLEY_AT - 0.01 }))).toBeLessThan(shoot.hit!)
      expect(frameOf(shoot, pick('shoot', { stateTime: 0 }))).toBe(0)
      // After the volley the follow-through plays on in `recover` until the clip has run out.
      const tail = specDuration(shoot) - hitTime(shoot)
      expect(pick('recover', { prevState: 'shoot', stateTime: 0.01 }).name).toBe('shoot')
      expect(frameOf(shoot, pick('recover', { prevState: 'shoot', stateTime: tail - 0.005 }))).toBe(shoot.frames - 1)
      expect(pick('recover', { prevState: 'shoot', stateTime: tail + 0.005 }).name).toBe('recover')
    })

  it('a sustained windup is shown for the whole state with no frame override', () => {
    for (const kind of ['brute', 'flyer', 'tank', 'swarm', 'final'] as const) {
      const spec = bossSpecOf('new', kind)
      expect(spec.windup.sustain).toBeGreaterThan(1)
      expect(bossClip(boss(kind, 'windup', { stateTime: 3 }), ART[kind], spec)).toEqual({ name: 'windup', t: 3 })
    }
  })

  it('the rage clip plays once', () => {
    for (const label of ['legacy', 'new'] as const) {
      const spec = bossSpecOf(label, 'final')
      const over = specDuration(spec.rage) + 0.01
      expect(bossClip(boss('final', 'idle', { rageAge: over }), 'king', spec).name).toBe('idle')
      expect(bossClip(boss('final', 'idle', { rageAge: over - 0.1 }), 'king', spec).name).toBe('rage')
    }
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
