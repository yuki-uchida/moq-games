import { describe, expect, it } from 'vitest'
import {
  BOSS_ARTS,
  BOSS_KIND,
  ENEMY_KINDS,
  ENEMY_SPEC,
  HERO_SPEC,
  KING_RAGED_SPEC,
  MOM_SPEC,
  PRINCESS_SPEC,
  bossSpec,
  type AnimSpec,
  type BossArt
} from '../src/art/contract'
import { frameAt, type Anim } from '../src/art/sheet'
import { BITE_COOLDOWN, BITE_TIME, type BossState } from '../src/game/sim'
import type { BossKind } from '../src/game/types'
import {
  APEX_SPEED,
  BLINK_TIME,
  BOSS_APEX_SPEED,
  FINAL_VOLLEY_AT,
  JUMPER_APEX_SPEED,
  JUMPER_FAST_SPEED,
  SPIT_INTERVAL,
  SPIT_READY_DIP,
  SPIT_READY_HOLD,
  LUNGE_FRAMES,
  RUN_THRESHOLD,
  WAIT_AFTER,
  WAIT_EVERY,
  DIVE_LEVEL_SPEED,
  DIVE_PINNED_SPEED,
  FLINCH_MAX_SPEED,
  FLYER_IDLE_SECONDS,
  FLYER_RECOVER_SECONDS,
  BRUTE_IDLE_SECONDS,
  BRUTE_RECOVER_SECONDS,
  BRUTE_STUN_SECONDS,
  TANK_IDLE_SECONDS,
  TANK_RECOVER_SECONDS,
  SWARM_IDLE_SECONDS,
  SWARM_RECOVER_SECONDS,
  FINAL_IDLE_SECONDS,
  FINAL_RECOVER_SECONDS,
  DASH_FACTOR,
  DASH_REST_SPEED,
  canShow,
  castFit,
  castLeadTime,
  FIT_MIN,
  castRoom,
  flinchRoom,
  flinchFit,
  shotLead,
  summonFit,
  FLYER_SHOT_INTERVAL,
  STUN_SHOW_AFTER,
  SWARM_SHOT_INTERVAL,
  stunShown,
  ENEMY_HURT_SECONDS,
  spitFollowing,
  spitThrowing,
  spitterHurtShows,
  airFrame,
  bossClip,
  bossSheetSpec,
  clipLife,
  enemyClip,
  heroClip,
  hitTime,
  princessClip,
  strideTime,
  specDuration,
  sustainCycle,
  type BossSnapshot,
  type ClipChoice,
  type EnemySnapshot,
  type HeroSnapshot
} from '../src/view/clips'

/** A stand-in Anim with the timing of a contract clip (frames, fps, loop, hold, sustain) and no pixels. */
const standIn = (spec: AnimSpec): Anim =>
  ({
    frames: Array.from({ length: spec.frames }, () => ({})),
    fps: spec.fps,
    loop: spec.loop,
    sustain: spec.sustain,
    hold: spec.hold && [...spec.hold]
  }) as unknown as Anim

/** The frame the sheet shows for a choice. */
const frameOf = (spec: AnimSpec, choice: ClipChoice) => choice.frame ?? frameAt(standIn(spec), choice.t)

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

describe('hero clips', () => {
  // Vertical speeds here are far from the apex band.
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
    ['bite', { biteAge: 0.02, vx: 215 }],
    // A bite and a hurt that overlap: the one that began later (on the same step, the hurt).
    ['bite', { biteAge: 0.02, hurt: true, hurtAge: 0.1 }],
    ['hurt', { biteAge: 0.1, hurt: true, hurtAge: 0.02 }],
    ['hurt', { biteAge: 0.05, hurt: true, hurtAge: 0.05 }],
    ['cheer', { cheering: true, biteAge: 0.02 }]
  ]
  for (const [name, state] of cases)
    it(`chooses ${name}`, () => {
      const choice = heroClip(hero(state), HERO_SPEC)
      expect(choice.name).toBe(name)
      expect(HERO_SPEC[choice.name]).toBeDefined()
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
    for (const state of states) {
      const choice = heroClip(hero(state), HERO_SPEC)
      expect(HERO_SPEC[choice.name], `${choice.name} ${JSON.stringify(state)}`).toBeDefined()
    }
  })

  it('a soft landing does not play land', () => {
    expect(heroClip(hero({ landAge: 0.05, hardLanding: false })).name).toBe('idle')
  })

  it('shows the bite hit frame the moment the simulation bites, and that is the first frame', () => {
    const choice = heroClip(hero({ biteAge: 0 }), HERO_SPEC)
    expect(frameOf(HERO_SPEC.bite, choice)).toBe(HERO_SPEC.bite.hit)
    expect(HERO_SPEC.bite.hit).toBe(0)
    expect(specDuration(HERO_SPEC.bite)).toBeLessThanOrEqual(BITE_TIME)
  })

  describe('every bite plays from its first frame to its last', () => {
    /**
     * The bite frames drawn, one list per bite, for simulation steps of `STEP` with the bite pressed at the given
     * step numbers. The timers follow sim.ts: the timer runs down first, then a press sets it to BITE_TIME. A
     * hit-stop (`freezeAt`: step number → frames held) draws the same state again without stepping.
     */
    const bites = (presses: number[], steps: number, freezeAt: Record<number, number> = {}) => {
      const STEP = 1 / 60
      let biteTimer = 0
      let cooldown = 0
      const out: number[][] = []
      for (let i = 0; i < steps; i++) {
        biteTimer = biteTimer > STEP ? biteTimer - STEP : 0
        cooldown = Math.max(0, cooldown - STEP)
        if (presses.includes(i) && cooldown <= 0) {
          biteTimer = BITE_TIME
          cooldown = BITE_COOLDOWN
          out.push([])
        }
        for (let k = 0; k <= (freezeAt[i] ?? 0); k++) {
          const choice = heroClip(hero({ biteAge: biteTimer > 0 ? BITE_TIME - biteTimer : null }), HERO_SPEC)
          if (choice.name === 'bite') out.at(-1)!.push(frameOf(HERO_SPEC.bite, choice))
        }
      }
      return out
    }
    const whole = (frames: number[]) => {
      expect(frames[0]).toBe(0)
      for (let i = 1; i < frames.length; i++) expect(frames[i] - frames[i - 1]).toBeGreaterThanOrEqual(0)
      expect([...new Set(frames)]).toEqual(Array.from({ length: HERO_SPEC.bite.frames }, (_, i) => i))
    }

    it('a whiff', () => {
      const [frames] = bites([0], 40)
      whole(frames)
    })

    it('a hit (the hit-stop holds the lunge)', () => {
      const [frames] = bites([0], 40, { 0: 6 })
      whole(frames)
      expect(frames.slice(0, 7)).toEqual([0, 0, 0, 0, 0, 0, 0])
    })

    it('mashing: a new bite every BITE_COOLDOWN', () => {
      const presses = Array.from({ length: 120 }, (_, i) => i)
      const all = bites(presses, 120)
      expect(all.length).toBeGreaterThanOrEqual(5)
      for (const frames of all.slice(0, -1)) whole(frames)
    })
  })

  it('advances the run cycle with distance, one pass per stride, not with time', () => {
    const a = heroClip(hero({ vx: 215, distance: 0 }), HERO_SPEC)
    const b = heroClip(hero({ vx: 100, distance: 0 }), HERO_SPEC)
    expect(a.t).toBe(b.t)
    const stride = HERO_SPEC.run.stride!
    expect(stride).toBe(64)
    // stride/frames px a frame: a planted foot goes back exactly as far as the body goes on.
    for (let frame = 0; frame < HERO_SPEC.run.frames; frame++) {
      const distance = (frame + 0.5) * (stride / HERO_SPEC.run.frames)
      expect(frameOf(HERO_SPEC.run, heroClip(hero({ vx: 215, distance }), HERO_SPEC))).toBe(frame)
    }
    expect(strideTime(HERO_SPEC.run, stride)).toBeCloseTo(specDuration(HERO_SPEC.run))
  })

  it('the standing frames of a bite show only on the ground at rest; the lunge shows anywhere', () => {
    expect(LUNGE_FRAMES).toBe(2)
    const lunge = 0.01
    const standing = 0.15
    expect(frameOf(HERO_SPEC.bite, heroClip(hero({ biteAge: lunge })))).toBeLessThan(LUNGE_FRAMES)
    expect(frameOf(HERO_SPEC.bite, heroClip(hero({ biteAge: standing })))).toBeGreaterThanOrEqual(LUNGE_FRAMES)
    for (const extra of [{ vx: 215 }, { onGround: false, vy: 300 }, {}])
      expect(heroClip(hero({ biteAge: lunge, ...extra })).name).toBe('bite')
    expect(heroClip(hero({ biteAge: standing, vx: RUN_THRESHOLD })).name).toBe('bite')
    expect(heroClip(hero({ biteAge: standing, vx: 215, distance: 30 })).name).toBe('run')
    expect(heroClip(hero({ biteAge: standing, onGround: false, vy: 300 })).name).toBe('fall')
  })

  it('a hard landing shows only at rest: at a run he runs on (the squash carries it)', () => {
    expect(heroClip(hero({ landAge: 0.02, hardLanding: true })).name).toBe('land')
    expect(heroClip(hero({ landAge: 0.02, hardLanding: true, vx: RUN_THRESHOLD + 1 })).name).toBe('run')
  })

  it('a cut fidget does not come back', () => {
    expect(heroClip(hero({ idleTime: WAIT_AFTER + 0.5 })).name).toBe('wait')
    expect(heroClip(hero({ idleTime: WAIT_AFTER + 0.5, waitCut: true })).name).toBe('idle')
  })
})

describe('hero: a bite in the air, the fidget again', () => {
  it('a bite at the top of a jump plays the lunge and the chomp, then the air clip', () => {
    expect(LUNGE_FRAMES).toBe(2)
    const STEP = 1 / 60
    const shown: string[] = []
    // Bitten at the top of a jump: rising slowly, then falling (the simulation's gravity is 1600 px/s²).
    for (let i = 0; i * STEP < BITE_TIME; i++) {
      const vy = -60 + 1600 * i * STEP
      const choice = heroClip(hero({ onGround: false, vy, biteAge: i * STEP, airTime: 0.4 + i * STEP }))
      shown.push(choice.name === 'bite' ? `bite${frameOf(HERO_SPEC.bite, choice)}` : choice.name)
    }
    const seq = shown.filter((f, i) => i === 0 || f !== shown[i - 1])
    expect(seq.slice(0, 2)).toEqual(['bite0', 'bite1'])
    for (const name of seq.slice(2)) expect(['apex', 'fall']).toContain(name)
    // On the ground the whole bite plays.
    expect(frameOf(HERO_SPEC.bite, heroClip(hero({ biteAge: 0.19 })))).toBe(4)
  })

  it('the fidget plays 5 s into standing, and again every 8 s', () => {
    expect(WAIT_EVERY).toBe(8)
    const name = (idleTime: number) => heroClip(hero({ idleTime })).name
    expect(name(WAIT_AFTER - 0.01)).toBe('idle')
    expect(name(WAIT_AFTER + 0.1)).toBe('wait')
    expect(name(WAIT_AFTER + specDuration(HERO_SPEC.wait) + 0.01)).toBe('idle')
    expect(name(WAIT_AFTER + WAIT_EVERY - 0.01)).toBe('idle')
    expect(heroClip(hero({ idleTime: WAIT_AFTER + WAIT_EVERY }))).toEqual({ name: 'wait', t: 0 })
    expect(name(WAIT_AFTER + 2 * WAIT_EVERY + 1)).toBe('wait')
  })
})

describe('hero blink without a pop', () => {
  it('the blink plays on the idle time base while it lasts, then idle returns on the same frame', () => {
    const idleTime = 1.3
    const during = heroClip(hero({ idleTime, blinkAge: BLINK_TIME - 0.01 }), HERO_SPEC)
    const after = heroClip(hero({ idleTime, blinkAge: BLINK_TIME }), HERO_SPEC)
    expect(during).toEqual({ name: 'blink', t: idleTime })
    expect(after).toEqual({ name: 'idle', t: idleTime })
    expect(HERO_SPEC.blink.frames).toBe(HERO_SPEC.idle.frames)
    expect(HERO_SPEC.blink.fps).toBe(HERO_SPEC.idle.fps)
    expect(frameOf(HERO_SPEC.blink, during)).toBe(frameOf(HERO_SPEC.idle, after))
  })

  it('the blink does not interrupt wait or run', () => {
    expect(heroClip(hero({ idleTime: 5.1, blinkAge: 0 }), HERO_SPEC).name).toBe('wait')
    expect(heroClip(hero({ vx: 200, blinkAge: 0 }), HERO_SPEC).name).toBe('run')
  })
})

describe('hero apex', () => {
  const air = (vy: number) => heroClip(hero({ onGround: false, vy, airTime: 0.3 }), HERO_SPEC)

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
})

describe('hero turn', () => {
  const turning = (extra: Partial<HeroSnapshot>, spec: Record<string, AnimSpec> = HERO_SPEC) =>
    heroClip(hero({ turnAge: 0, ...extra }), spec)

  it('plays from its first frame for its length, then yields', () => {
    expect(turning({})).toEqual({ name: 'turn', t: 0 })
    expect(turning({ turnAge: specDuration(HERO_SPEC.turn) - 0.001 }).name).toBe('turn')
    expect(turning({ turnAge: specDuration(HERO_SPEC.turn) }).name).toBe('idle')
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
})

describe('hero skid', () => {
  it('a sustained skid keeps showing as long as the view reports one, with no frame override', () => {
    expect(HERO_SPEC.skid.sustain).toBeGreaterThan(1)
    const late = heroClip(hero({ skidAge: 1.5 }), HERO_SPEC)
    expect(late).toEqual({ name: 'skid', t: 1.5 })
    // 1.5 s is past the clip: the sheet's frame lookup cycles the last two frames.
    expect([1, 2]).toContain(frameOf(HERO_SPEC.skid, late))
  })
})

describe('air frames', () => {
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
      sustain: spec.sustain,
      hold: spec.hold && [...spec.hold]
    }) as unknown as Anim

  it('sustainCycle and clipLife follow the spec', () => {
    expect(sustainCycle(HERO_SPEC.skid)).toBeCloseTo(2 / 14)
    expect(sustainCycle(HERO_SPEC.run)).toBe(0)
    expect(clipLife(HERO_SPEC.land)).toBeCloseTo(specDuration(HERO_SPEC.land))
    expect(clipLife(HERO_SPEC.land, 0.5)).toBeCloseTo(specDuration(HERO_SPEC.land) + 0.5)
    const defeat = bossSpec('bearBoss').defeat
    // A short tail is lengthened to one pass of the sustained frames; a long one is kept.
    expect(clipLife(defeat, 0.01)).toBeCloseTo(specDuration(defeat) + 2 / defeat.fps)
    expect(clipLife(defeat, 0.5)).toBeCloseTo(specDuration(defeat) + 0.5)
  })

  it('specDuration, hitTime and sustainCycle count per-frame holds', () => {
    // hero wait: 16 ticks at 8 fps; ape land: 6 ticks at 14 fps; weasel defeat: tail of 2 + 2 ticks at 10 fps.
    expect(specDuration(HERO_SPEC.wait)).toBeCloseTo(2)
    expect(specDuration(bossSpec('apeBoss').land)).toBeCloseTo(6 / 14)
    expect(specDuration(bossSpec('apeBoss').intro)).toBeCloseTo(1.1)
    expect(sustainCycle(bossSpec('weaselBoss').defeat)).toBeCloseTo(0.4)
    expect(clipLife(bossSpec('weaselBoss').defeat)).toBeCloseTo(1.1 + 0.4)
    const held: AnimSpec = { w: 64, h: 64, frames: 4, fps: 10, loop: false, hit: 2, hold: [3, 2, 1, 1] }
    expect(hitTime(held)).toBeCloseTo(0.5)
    expect(frameAt(anim(held), hitTime(held))).toBe(2)
    expect(frameAt(anim(held), hitTime(held) - 0.01)).toBe(1)
    // Each boss art gets one cached spec object (the view asks every frame); holds differ per boss.
    expect(bossSpec('apeBoss')).toBe(bossSpec('apeBoss'))
    expect(bossSpec('bearBoss').land.hold).toBeUndefined()
  })

  it('frameAt keeps cycling the sustained tail of a windup', () => {
    const windup = bossSpec('boarBoss').windup
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
  gain: 0,
  standing: false,
  time: 0.3,
  ...extra
})

describe('enemy clips', () => {
  const cases: [EnemySnapshot['kind'], Partial<EnemySnapshot>, string, number?][] = [
    ['walker', {}, 'move'],
    ['walker', { standing: true }, 'idle'],
    ['walker', { vx: 74 }, 'move'],
    ['tough', {}, 'move'],
    ['tough', { standing: true }, 'idle'],
    ['tough', { vx: -62 }, 'move'],
    ['flyer', {}, 'move'],
    ['jumper', {}, 'idle'],
    ['jumper', { onGround: false, vy: -300 }, 'air', 1], // rising: frame 1 of the 5-frame hop
    ['jumper', { onGround: false, vy: 300 }, 'air', 3], // falling: frame 3
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
      const choice = enemyClip(enemy(kind, state), ENEMY_SPEC[kind])
      expect(choice.name).toBe(name)
      expect(ENEMY_SPEC[kind][choice.name]).toBeDefined()
      if (frame !== undefined) expect(choice.frame).toBe(frame)
    })

  it('the rat and the mole walk by the ground they gain, and stand when their tread says so', () => {
    for (const kind of ['walker', 'tough'] as const) {
      const spec = ENEMY_SPEC[kind].move
      expect(spec.stride).toBe(40)
      // Each stride/frames px of ground is one frame, whatever the time.
      for (let frame = 0; frame < spec.frames; frame++) {
        const gain = (frame + 0.5) * (spec.stride! / spec.frames)
        for (const time of [0.3, 7.1]) expect(frameOf(spec, enemyClip(enemy(kind, { gain, time, vx: 74 })))).toBe(frame)
      }
      // Marking time on the spot is not walking, whatever its speed.
      expect(enemyClip(enemy(kind, { standing: false, vx: 74 })).name).toBe('move')
      expect(enemyClip(enemy(kind, { standing: true, vx: 74 })).name).toBe('idle')
    }
  })

  it('a squirrel bitten during its throw shows the flash over the throw; a hurt only when it fits before it', () => {
    const shoot = ENEMY_SPEC.spitter.shoot
    const lead = hitTime(shoot)
    const tail = specDuration(shoot) - lead
    expect(ENEMY_HURT_SECONDS).toBe(0.16)
    // The throw: the wind-up (and waiting loaded), the release, the follow-through.
    for (const timer of [lead, lead / 2, 0, -1, SPIT_INTERVAL, SPIT_INTERVAL - tail + 0.01]) {
      expect(spitThrowing(timer), String(timer)).toBe(true)
      expect(spitterHurtShows(timer), String(timer)).toBe(false)
    }
    expect(spitFollowing(SPIT_INTERVAL)).toBe(true)
    expect(spitFollowing(lead / 2)).toBe(false)
    // Outside it: the hurt, unless the wind-up would begin before the hurt is over.
    expect(spitThrowing(1)).toBe(false)
    expect(spitterHurtShows(1)).toBe(true)
    expect(spitterHurtShows(lead + ENEMY_HURT_SECONDS + 0.001)).toBe(true)
    expect(spitterHurtShows(lead + ENEMY_HURT_SECONDS - 0.01)).toBe(false)
  })

  it('the jumper picks a five-frame hop by vertical speed', () => {
    const air = (vy: number, specs = ENEMY_SPEC.jumper) =>
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
  })

  it('the spitter shows its hit frame when the acorn leaves and follows through', () => {
    const specs = ENEMY_SPEC.spitter
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

  describe('the spitter waits loaded', () => {
    const specs = ENEMY_SPEC.spitter
    const spec = specs.shoot
    const STEP = 1 / 60
    /**
     * The shoot frames shown, step by step, for a timer that starts at `from` and runs down as in sim.ts. The
     * spitter fires (timer back to SPIT_INTERVAL) at the first step from `fireAt` on where it is loaded (the hero
     * is in range from then); with `fireAt` null it never fires. Repeats are collapsed; it stops at the first idle
     * after a shot.
     */
    const run = (from: number, fireAt: number | null, steps = 400) => {
      let timer = from
      let fired = false
      const shown: number[] = []
      for (let i = 0; i < steps; i++) {
        timer -= STEP
        if (timer <= 0 && fireAt !== null && i >= fireAt) {
          timer = SPIT_INTERVAL
          fired = true
        }
        const choice = enemyClip(enemy('spitter', { shootTimer: timer }), specs)
        if (choice.name !== 'shoot') {
          if (fired) break
          continue
        }
        const f = frameOf(spec, choice)
        if (shown.at(-1) !== f) shown.push(f)
      }
      return { shown, fired }
    }

    it('names its pulse constants', () => {
      expect(SPIT_READY_HOLD).toBe(0.6)
      expect(SPIT_READY_DIP).toBe(0.15)
    })

    it('a timer that runs out with nobody near shows frames 0, 1, 2, then stays on 2 and 1', () => {
      const { shown } = run(1, null, 300)
      expect(shown.slice(0, 3)).toEqual([0, 1, 2])
      for (const f of shown.slice(3)) expect([spec.hit! - 1, spec.hit! - 2]).toContain(f)
      // The pulse: it dips back to 1 and returns to 2.
      expect(shown.slice(3, 5)).toEqual([1, 2])
    })

    it('while loaded the frame before `hit` shows 0.6 s, then the one before it 0.15 s', () => {
      const at = (waited: number) => frameOf(spec, enemyClip(enemy('spitter', { shootTimer: -waited }), specs))
      expect(at(0)).toBe(spec.hit! - 1)
      expect(at(SPIT_READY_HOLD - 0.01)).toBe(spec.hit! - 1)
      expect(at(SPIT_READY_HOLD + 0.01)).toBe(spec.hit! - 2)
      expect(at(SPIT_READY_HOLD + SPIT_READY_DIP + 0.01)).toBe(spec.hit! - 1)
    })

    it('when the hero comes into range it fires: 3 (hit), 4, 5, then idle', () => {
      const { shown, fired } = run(1, 200)
      expect(fired).toBe(true)
      const after = shown.slice(shown.lastIndexOf(spec.hit! - 1) + 1)
      expect(after).toEqual([3, 4, 5])
    })

    it('a spitter that fires as its timer runs out shows 0 to 5 in order', () => {
      const { shown, fired } = run(1, 0)
      expect(fired).toBe(true)
      expect(shown).toEqual([0, 1, 2, 3, 4, 5])
    })
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

/** Whether a hit, a cast or a summon would be shown now (it is given some time). */
const flinchStarts = (s: BossSnapshot, spec: Record<string, AnimSpec>) => flinchFit(s, spec) > 0
const castStarts = (s: BossSnapshot, spec: Record<string, AnimSpec>) => castFit(s, spec) > 0
const summonStarts = (s: BossSnapshot, spec: Record<string, AnimSpec>) => summonFit(s, spec) > 0

/** A boss snapshot: standing (no ground gained for a while), nothing started by the view. */
const boss = (kind: BossKind, state: BossState, extra: Partial<BossSnapshot> = {}): BossSnapshot => ({
  kind,
  state,
  prevState: null,
  stateTime: 0.1,
  active: true,
  vx: 0,
  vy: 0,
  speed: 150,
  phase: 1,
  rageAge: null,
  hurtAge: null,
  onGround: false,
  shotTimer: 99,
  castAge: null,
  volleyCut: false,
  dashAge: null,
  dashGain: 0,
  gain: 0,
  standing: true,
  time: 0.4,
  ...extra
})

/** The contract of a boss kind's sheet (the chaser is drawn from the mom sheet). */
const bossSpecOf = (kind: BossKind) => bossSheetSpec(kind, ART[kind])

describe('boss clips', () => {
  it('every kind and state picks a clip its sheet has', () => {
    for (const kind of Object.keys(ART) as BossKind[])
      for (const state of STATES)
        for (const extra of [
          {},
          { vx: 120 },
          { vx: 500 },
          { vy: -300 },
          { vy: 0 },
          { vy: 300 },
          { prevState: 'slam' as BossState },
          { prevState: 'shoot' as BossState },
          { active: false },
          { rageAge: 0.1 },
          { standing: false },
          { hurtAge: 0.05 },
          { castAge: 0.05 }
        ]) {
          const spec = bossSpecOf(kind)
          const choice = bossClip(boss(kind, state, extra), ART[kind], spec)
          expect(spec[choice.name], `${kind}/${state}/${JSON.stringify(extra)}`).toBeDefined()
        }
  })

  const cases: [BossKind, BossState, Partial<BossSnapshot>, string, number?][] = [
    ['chaser', 'idle', { standing: false }, 'move'],
    // Standing over the hero (she gains no ground) she stands.
    ['chaser', 'idle', { standing: true }, 'idle'],
    ['chaser', 'tired', { standing: true, onGround: true }, 'tired'],
    ['chaser', 'stunned', { onGround: true }, 'stunned'],
    ['chaser', 'tired', { onGround: true }, 'tired'],
    // Worn out or stunned in the middle of a hop, she comes down first: her legs go on.
    ['chaser', 'tired', { onGround: false }, 'move'],
    ['chaser', 'stunned', { onGround: false }, 'move'],
    ['brute', 'idle', {}, 'idle'],
    ['brute', 'idle', { active: false }, 'idle'],
    ['brute', 'windup', {}, 'windup'],
    ['brute', 'charge', {}, 'attack'],
    ['brute', 'stunned', {}, 'stunned'],
    ['brute', 'recover', {}, 'recover'],
    ['flyer', 'idle', {}, 'idle'],
    ['flyer', 'windup', {}, 'windup'],
    ['flyer', 'dive', { vy: 260 }, 'attack'],
    ['flyer', 'dive', { vx: 500, vy: 0, onGround: true }, 'sweep'],
    ['flyer', 'dive', { vx: 0, vy: 0, onGround: true }, 'recover'],
    ['flyer', 'recover', {}, 'recover'],
    ['tank', 'idle', { vx: 80, standing: false }, 'move'],
    ['tank', 'idle', {}, 'idle'],
    ['tank', 'windup', {}, 'windup'],
    ['tank', 'slam', { vy: -400 }, 'air', 0],
    ['tank', 'recover', { prevState: 'slam', stateTime: 0.05 }, 'land'],
    ['tank', 'recover', { prevState: 'slam', stateTime: 0.6 }, 'recover'],
    ['swarm', 'idle', { vx: 80, standing: false }, 'move'],
    ['swarm', 'windup', {}, 'windup'],
    ['swarm', 'charge', {}, 'attack'],
    ['swarm', 'recover', {}, 'recover'],
    ['final', 'idle', { vx: 80, standing: false }, 'move'],
    ['final', 'windup', {}, 'windup'],
    ['final', 'charge', {}, 'attack'],
    ['final', 'slam', { vy: -400 }, 'air', 0],
    ['final', 'recover', { prevState: 'slam', stateTime: 0.05 }, 'land'],
    ['final', 'shoot', {}, 'shoot'],
    ['final', 'recover', { prevState: 'shoot', stateTime: 0.02 }, 'shoot'],
    ['final', 'recover', { prevState: 'shoot', stateTime: 0.02, volleyCut: true }, 'recover'],
    ['final', 'recover', { prevState: 'shoot', stateTime: 0.5 }, 'recover'],
    ['final', 'idle', { rageAge: 0.1 }, 'rage'],
    ['final', 'idle', { rageAge: 5 }, 'idle']
  ]
  for (const [kind, state, extra, name, frame] of cases)
    it(`${kind} in ${state} ${JSON.stringify(extra)} plays ${name}`, () => {
      const choice = bossClip(boss(kind, state, extra), ART[kind], bossSpecOf(kind))
      expect(choice.name).toBe(name)
      if (frame !== undefined) expect(choice.frame).toBe(frame)
    })

  it('a leaping boss falls with the last frame', () => {
    expect(bossClip(boss('tank', 'slam', { vy: 400 }), ART.tank, bossSpecOf('tank')).frame).toBe(2)
  })

  it('three-frame boss air clips pick rising, the top, falling by vertical speed', () => {
    for (const kind of ['tank', 'final'] as const) {
      const spec = bossSpec(ART[kind] as BossArt)
      expect(spec.air.frames).toBe(3)
      const air = (vy: number) => bossClip(boss(kind, 'slam', { vy }), ART[kind], spec).frame
      expect(air(-BOSS_APEX_SPEED - 1)).toBe(0)
      expect(air(-BOSS_APEX_SPEED)).toBe(1)
      expect(air(BOSS_APEX_SPEED)).toBe(1)
      expect(air(BOSS_APEX_SPEED + 1)).toBe(2)
    }
  })

  it('the final boss shows its shoot hit frame when the volley leaves and follows through', () => {
    const spec = bossSpecOf('final')
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
      const spec = bossSpecOf(kind)
      expect(spec.windup.sustain).toBeGreaterThan(1)
      expect(bossClip(boss(kind, 'windup', { stateTime: 3 }), ART[kind], spec)).toEqual({ name: 'windup', t: 3 })
    }
  })

  describe('what his body does', () => {
    it('a walking boss walks by the ground he gains, and stands over the hero once he gains none', () => {
      for (const [kind, art] of [
        ['tank', 'bearBoss'],
        ['tank', 'apeBoss'],
        ['swarm', 'foxBoss'],
        ['final', 'king']
      ] as const) {
        const spec = bossSheetSpec(kind, art)
        const stride = spec.move.stride!
        expect(stride).toBeGreaterThan(0)
        for (let frame = 0; frame < spec.move.frames; frame++) {
          const gain = (frame + 0.5) * (stride / spec.move.frames)
          for (const time of [0.4, 3.3]) {
            const choice = bossClip(boss(kind, 'idle', { vx: 120, standing: false, gain, time }), art, spec)
            expect(choice.name).toBe('move')
            expect(frameOf(spec.move, choice), `${art} ${gain}`).toBe(frame)
          }
        }
        expect(bossClip(boss(kind, 'idle', { vx: 120, standing: true }), art, spec).name).toBe('idle')
      }
      // The bee hovers: her `move` has no stride and plays on time.
      const bee = bossSheetSpec('swarm', 'beeBoss')
      expect(bee.move.stride).toBeUndefined()
      expect(bossClip(boss('swarm', 'idle', { vx: 120, standing: false, time: 1.3 }), 'beeBoss', bee)).toEqual({
        name: 'move',
        t: 1.3
      })
    })

    it('the brutes gallop by the ground gained since the charge began', () => {
      for (const art of ['weaselBoss', 'boarBoss', 'wolfBoss'] as const) {
        const spec = bossSpec(art)
        const stride = spec.attack.stride!
        const at = (dashGain: number) =>
          frameOf(spec.attack, bossClip(boss('brute', 'charge', { vx: 400, dashGain, stateTime: 0.7 }), art, spec))
        expect(at(0)).toBe(0)
        expect(at(stride / spec.attack.frames + 0.5)).toBe(1)
        expect(at(stride - 0.5)).toBe(spec.attack.frames - 1)
      }
    })

    it(`after a dash he keeps its clip, on the dash's own time base, until he is down to ${DASH_REST_SPEED} px/s`, () => {
      expect(DASH_REST_SPEED).toBe(40)
      const crow = { speed: 210 }
      const recover = (kind: BossKind, art: string, vx: number, extra = {}) =>
        bossClip(boss(kind, 'recover', { prevState: 'charge', vx, dashAge: 0.9, ...extra }), art)
      expect(recover('brute', 'boarBoss', 100).name).toBe('attack')
      expect(recover('swarm', 'foxBoss', 100)).toEqual({ name: 'attack', t: 0.9 })
      expect(recover('swarm', 'beeBoss', 100)).toEqual({ name: 'attack', t: 0.9 })
      expect(recover('final', 'king', 100)).toEqual({ name: 'attack', t: 0.9 })
      expect(recover('flyer', 'crowBoss', 504, crow)).toEqual({ name: 'sweep', t: 0.9 })
      for (const [kind, art] of [
        ['brute', 'boarBoss'],
        ['swarm', 'foxBoss'],
        ['swarm', 'beeBoss'],
        ['final', 'king'],
        ['flyer', 'crowBoss']
      ] as const)
        expect(recover(kind, art, DASH_REST_SPEED, crow).name).toBe('recover')
      // The first moments of a stun after a charge too.
      expect(
        bossClip(boss('brute', 'stunned', { prevState: 'charge', stateTime: 0.01, vx: 0, dashAge: 0.5 }), 'boarBoss')
          .name
      ).toBe('attack')
      // ハム代 runs on into her rest.
      expect(bossClip(boss('chaser', 'tired', { vx: 100 }), 'mom').name).toBe('move')
      expect(bossClip(boss('chaser', 'tired', { vx: DASH_REST_SPEED, onGround: true }), 'mom').name).toBe('tired')
    })

    it('a slam landing keeps showing while he slides', () => {
      for (const kind of ['tank', 'final'] as const) {
        const land = (stateTime: number, vx: number) =>
          bossClip(boss(kind, 'recover', { prevState: 'slam', stateTime, vx, onGround: true }), ART[kind]).name
        expect(land(1, 100)).toBe('land')
        expect(land(1, DASH_REST_SPEED)).toBe('recover')
        expect(land(0.05, 0)).toBe('land')
      }
    })

    it(`a flier's hover gives way to his dash clip above ${DASH_FACTOR} times his cruising speed, in any state`, () => {
      expect(DASH_FACTOR).toBe(1.5)
      const crow = (state: BossState, vx: number) => bossClip(boss('flyer', state, { vx, speed: 210 }), 'crowBoss').name
      for (const state of ['idle', 'windup', 'recover'] as const) {
        expect(crow(state, 210 * DASH_FACTOR + 1), state).toBe('sweep')
        expect(crow(state, 30), state).not.toBe('sweep')
      }
      expect(crow('idle', 210 * DASH_FACTOR)).toBe('idle')
      const bee = (vx: number) => bossClip(boss('swarm', 'idle', { vx, speed: 165, standing: false }), 'beeBoss').name
      expect(bee(165)).toBe('move')
      expect(bee(165 * DASH_FACTOR + 1)).toBe('attack')
      expect(canShow(boss('flyer', 'idle', { vx: 300, speed: 210 }), bossSpec('crowBoss'), 'shoot')).toBe(true)
      expect(canShow(boss('flyer', 'idle', { vx: 400, speed: 210 }), bossSpec('crowBoss'), 'shoot')).toBe(false)
      // The fox's cast is a leap: it shows at any speed; a planted pose only once he has nearly stopped.
      expect(canShow(boss('swarm', 'recover', { vx: 300 }), bossSpec('foxBoss'), 'shoot')).toBe(true)
      expect(canShow(boss('final', 'recover', { vx: 50 }), bossSpec('king'), 'recover')).toBe(false)
    })
  })

  describe('the state lengths the view starts its actions by (sim.ts)', () => {
    it('names them', () => {
      expect([BRUTE_IDLE_SECONDS, BRUTE_RECOVER_SECONDS, BRUTE_STUN_SECONDS]).toEqual([0.7, 0.6, 1.1])
      expect([TANK_IDLE_SECONDS, TANK_RECOVER_SECONDS]).toEqual([1.2, 1.0])
      expect([SWARM_IDLE_SECONDS, SWARM_RECOVER_SECONDS]).toEqual([0.9, 0.7])
      expect([FINAL_IDLE_SECONDS, FINAL_RECOVER_SECONDS]).toEqual([
        [0.9, 0.6],
        [0.8, 0.5]
      ])
      expect([FLYER_IDLE_SECONDS, FLYER_RECOVER_SECONDS]).toEqual([1.4, 0.9])
    })

    it('a flinch has until he next walks or winds up', () => {
      const room = (kind: BossKind, state: BossState, stateTime: number, phase = 1) =>
        flinchRoom(boss(kind, state, { stateTime, phase }))
      expect(room('brute', 'idle', 0.2)).toBeCloseTo(0.5)
      expect(room('brute', 'recover', 0.2)).toBeCloseTo(0.4 + 0.7)
      expect(room('brute', 'stunned', 0.1)).toBeCloseTo(1.0 + 0.6 + 0.7)
      expect(room('tank', 'recover', 0.3)).toBeCloseTo(0.7)
      expect(room('tank', 'idle', 0.3)).toBe(0)
      expect(room('swarm', 'recover', 0.3)).toBeCloseTo(0.4)
      expect(room('final', 'recover', 0.3)).toBeCloseTo(0.5)
      expect(room('final', 'recover', 0.3, 2)).toBeCloseTo(0.2)
      expect(room('flyer', 'recover', 0.5)).toBeCloseTo(0.4 + 1.4)
      expect(room('flyer', 'idle', 0.5)).toBeCloseTo(0.9)
      expect(room('chaser', 'tired', 3)).toBe(Infinity)
      expect(room('brute', 'windup', 0.1)).toBe(0)
    })

    it('a cast has until his next wind-up', () => {
      const room = (kind: BossKind, state: BossState, stateTime: number) => castRoom(boss(kind, state, { stateTime }))
      expect(room('swarm', 'idle', 0.3)).toBeCloseTo(0.6)
      expect(room('swarm', 'recover', 0.3)).toBeCloseTo(0.4 + 0.9)
      expect(room('flyer', 'idle', 0.3)).toBeCloseTo(1.1)
      expect(room('flyer', 'recover', 0.3)).toBeCloseTo(0.6 + 1.4)
      expect(room('swarm', 'windup', 0.1)).toBe(0)
    })
  })

  describe('a hit starts a flinch only where it plays out', () => {
    const arts: [BossKind, string][] = [
      ['chaser', 'mom'],
      ...BOSS_ARTS.map((art) => [BOSS_KIND[art], art] as [BossKind, string])
    ]
    /** A state of each kind in which a hit right now has room for the whole flinch. */
    const calm: Record<BossKind, [BossState, number][]> = {
      chaser: [
        ['tired', 0.5],
        ['stunned', 0.5]
      ],
      brute: [
        ['idle', 0.1],
        ['recover', 0.5],
        ['stunned', 0.9]
      ],
      flyer: [
        ['idle', 0.5],
        ['recover', 0.8]
      ],
      tank: [['recover', 0.5]],
      swarm: [['recover', 0.4]],
      final: [['recover', 0.5]]
    }

    for (const [kind, art] of arts) {
      const spec = bossSheetSpec(kind, art)
      for (const [state, stateTime] of calm[kind])
        it(`${art} hit in ${state}: the flinch starts and shows every frame, then the state's clip`, () => {
          expect(flinchStarts(boss(kind, state, { stateTime }), spec)).toBe(true)
          const frames = new Set<number>()
          for (let t = 0; t < specDuration(spec.hurt); t += 0.005) {
            const choice = bossClip(boss(kind, state, { stateTime, hurtAge: t }), art, spec)
            expect(choice.name).toBe('hurt')
            frames.add(frameOf(spec.hurt, choice))
          }
          expect([...frames].sort()).toEqual(Array.from({ length: spec.hurt.frames }, (_, i) => i))
          const after = bossClip(boss(kind, state, { stateTime, hurtAge: specDuration(spec.hurt) }), art, spec)
          expect(after).toEqual(bossClip(boss(kind, state, { stateTime }), art, spec))
        })
      if (kind === 'chaser') continue
      it(`${art}: no flinch in a warning or an attack, nor when it would be cut by his next move`, () => {
        for (const state of ['windup', 'charge', 'dive', 'slam', 'shoot'] as BossState[])
          expect(flinchStarts(boss(kind, state, { vy: -300 }), spec), state).toBe(false)
        // Just before he walks or winds up again (less than FIT_MIN).
        const late: Record<string, [BossState, number]> = {
          brute: ['idle', BRUTE_IDLE_SECONDS - 0.05],
          flyer: ['idle', FLYER_IDLE_SECONDS - 0.05],
          tank: ['recover', TANK_RECOVER_SECONDS - 0.05],
          swarm: ['recover', SWARM_RECOVER_SECONDS - 0.05],
          final: ['recover', FINAL_RECOVER_SECONDS[0] - 0.05]
        }
        const [state, stateTime] = late[kind]
        expect(flinchStarts(boss(kind, state, { stateTime }), spec)).toBe(false)
      })
    }

    it('a walking or running boss shows the hit as the flash and the jolt', () => {
      expect(FLINCH_MAX_SPEED).toBe(20)
      const spec = bossSheetSpec('brute', 'boarBoss')
      expect(flinchStarts(boss('brute', 'recover', { vx: FLINCH_MAX_SPEED + 1 }), spec)).toBe(false)
      expect(flinchStarts(boss('brute', 'recover', { vx: FLINCH_MAX_SPEED }), spec)).toBe(true)
      expect(flinchStarts(boss('chaser', 'idle', { vx: 261 }), MOM_SPEC)).toBe(false)
      expect(flinchStarts(boss('chaser', 'tired', { vx: 3 }), MOM_SPEC)).toBe(true)
      expect(flinchStarts(boss('brute', 'idle', { active: false }), spec)).toBe(false)
    })

    it('the landing of a slam and the follow-through of a volley are kept', () => {
      const spec = bossSheetSpec('final', 'king')
      const starts = (extra: Partial<BossSnapshot>) => flinchStarts(boss('final', 'recover', extra), spec)
      expect(starts({ prevState: 'slam', stateTime: 0.05 })).toBe(false)
      expect(starts({ prevState: 'slam', stateTime: 0.4, vx: 60, onGround: true })).toBe(false)
      expect(starts({ prevState: 'shoot', stateTime: 0.02 })).toBe(false)
      expect(starts({ prevState: 'slam', stateTime: 0.4 })).toBe(true)
    })

    it("the raged king flinches after his volley's follow-through, fitted to what is left of his recovery", () => {
      const spec = bossSheetSpec('final', 'king')
      let stateTime = 0
      for (let i = 0; i < 15; i++) stateTime += 1 / 60
      const fit = (t: number) =>
        flinchFit(boss('final', 'recover', { prevState: 'shoot', phase: 2, stateTime: t }), spec)
      expect(fit(stateTime - 1 / 60)).toBe(0)
      expect(fit(stateTime)).toBeCloseTo(0.25)
      expect(fit(0.35)).toBeCloseTo(0.15)
      expect(fit(FINAL_RECOVER_SECONDS[1] - FIT_MIN + 0.001)).toBe(0)
      expect(KING_RAGED_SPEC.hurt).toBeDefined()
    })

    it('the transformation comes before a flinch', () => {
      const spec = bossSheetSpec('final', 'king')
      expect(bossClip(boss('final', 'idle', { rageAge: 0.1, hurtAge: 0.01 }), 'king', spec).name).toBe('rage')
    })
  })

  describe('a stun shows only once it lasts', () => {
    it('a one-step stun keeps the clip before it; a lasting one shows after STUN_SHOW_AFTER', () => {
      expect(STUN_SHOW_AFTER).toBe(0.05)
      for (const kind of ['brute', 'swarm', 'final'] as const) {
        const art = ART[kind]
        const charge = bossClip(boss(kind, 'charge', { stateTime: 0.5 }), art).name
        const early = bossClip(boss(kind, 'stunned', { prevState: 'charge', stateTime: 1 / 60 }), art)
        expect(early.name).toBe(charge)
        expect(stunShown('stunned', 1 / 60)).toBe(false)
        const late = bossClip(boss(kind, 'stunned', { prevState: 'charge', stateTime: STUN_SHOW_AFTER }), art)
        expect(late.name).toBe(kind === 'brute' ? 'stunned' : 'recover')
        expect(stunShown('stunned', STUN_SHOW_AFTER)).toBe(true)
      }
      expect(bossClip(boss('chaser', 'stunned', { stateTime: 0.01 }), 'mom').name).toBe('move')
      expect(bossClip(boss('chaser', 'stunned', { stateTime: 0.06, onGround: true }), 'mom').name).toBe('stunned')
    })
  })

  describe("the crow's dive levels out", () => {
    it('attack while it comes down, sweep once it travels level (a dive recorded from the simulation)', () => {
      // Recorded from the simulation (stage 2, the hero on flat ground): vy 260 until the crow reaches the ground,
      // then vy 0 on the ground for the rest of the dive (up to 1.4 s).
      const steps = [
        ...Array.from({ length: 9 }, (_, i) => ({ t: i / 60, vy: 260, onGround: false })),
        ...Array.from({ length: 50 }, (_, i) => ({ t: (9 + i) / 60, vy: 0, onGround: true }))
      ]
      const names = steps.map(
        (st) =>
          bossClip(boss('flyer', 'dive', { stateTime: st.t, vx: 504, vy: st.vy, onGround: st.onGround }), 'crowBoss')
            .name
      )
      expect(names.slice(0, 9).every((n) => n === 'attack')).toBe(true)
      expect(names.slice(9).every((n) => n === 'sweep')).toBe(true)
      // Level in the air too (its fall has gone).
      expect(bossClip(boss('flyer', 'dive', { vx: 504, vy: DIVE_LEVEL_SPEED }), 'crowBoss').name).toBe('sweep')
      expect(bossClip(boss('flyer', 'dive', { vx: 504, vy: DIVE_LEVEL_SPEED + 1 }), 'crowBoss').name).toBe('attack')
      // Pinned against a wall the dive runs on with no speed at all: he flaps on the spot instead of skimming.
      expect(bossClip(boss('flyer', 'dive', { vx: 0, vy: 0, onGround: true }), 'crowBoss').name).toBe('recover')
      expect(
        bossClip(boss('flyer', 'dive', { vx: DIVE_PINNED_SPEED + 1, vy: 0, onGround: true }), 'crowBoss').name
      ).toBe('sweep')
    })
  })

  describe('throws and casts', () => {
    const STEP = 1 / 60
    /**
     * Runs a boss's shot timer through the simulation's order of a step (state first, then the timer: sim.ts
     * `updateFlyerBoss` / `updateSwarmBoss`) and the view's cast (as `ActorsView` keeps it: started on the step its
     * lead-in must begin if it fits, released on the shot, over when the clip has played), and returns the clip and
     * frame shown after each step, with the step of each `boss-shoot` marked.
     */
    const play = (
      kind: 'flyer' | 'swarm',
      art: string,
      plan: (time: number) => { state: BossState; prevState: BossState | null; stateTime: number },
      seconds: number,
      shotTimer = 0.6
    ) => {
      const spec = bossSheetSpec(kind, art)
      const interval = kind === 'flyer' ? FLYER_SHOT_INTERVAL : SWARM_SHOT_INTERVAL
      const lead = hitTime(spec.shoot)
      let timer = shotTimer
      let cast: 'none' | 'lead' | 'release' = 'none'
      let releaseAt = 0
      let refused = false
      let from = 0
      let tail = 0
      const out: { frame: string; shot: boolean }[] = []
      for (let i = 1; i * STEP <= seconds; i++) {
        const time = i * STEP
        const st = plan(time)
        timer -= STEP
        let shot = false
        if (timer <= 0 && (kind === 'swarm' || st.state === 'idle')) {
          timer = interval
          shot = true
        }
        const s = boss(kind, st.state, {
          prevState: st.prevState,
          stateTime: st.stateTime,
          // A dive travels (the crow's is 2.4 times his cruising speed).
          vx: st.state === 'dive' ? 504 : 0,
          speed: kind === 'flyer' ? 210 : 175,
          shotTimer: timer,
          time
        })
        if (shot) {
          if (cast === 'lead') {
            cast = 'release'
            releaseAt = time
          }
          refused = false
        }
        const until = shotLead(s)
        if (cast === 'none') {
          if (until === null || until > lead) refused = false
          else if (!refused) {
            tail = castFit(s, spec)
            if (tail > 0) {
              cast = 'lead'
              from = until
            }
          }
        } else if (cast === 'release' && time - releaseAt >= tail - 1e-9) cast = 'none'
        const natural = specDuration(spec.shoot) - lead
        s.castAge =
          cast === 'lead'
            ? castLeadTime(s, spec, from)
            : cast === 'release'
              ? lead + ((time - releaseAt) * natural) / tail
              : null
        const choice = bossClip(s, art, spec)
        out.push({ frame: choice.name === 'shoot' ? `shoot${frameOf(spec.shoot, choice)}` : choice.name, shot })
      }
      return out
    }
    const shots = (run: { frame: string; shot: boolean }[]) =>
      run.map((r) => r.frame).filter((f, i, all) => i === 0 || f !== all[i - 1])
    const idle = () => ({ state: 'idle' as BossState, prevState: null, stateTime: 0.2 })

    for (const [kind, art] of [
      ['flyer', 'crowBoss'],
      ['swarm', 'foxBoss'],
      ['swarm', 'beeBoss']
    ] as const)
      it(`${art}: frames 0, 1, 2 before the shot, 3 on the step of boss-shoot, then 4, 5`, () => {
        expect(bossSheetSpec(kind, art).shoot.hit).toBe(3)
        const run = play(kind, art, idle, 1.2)
        const onShot = run.find((r) => r.shot)!
        expect(onShot.frame).toBe('shoot3')
        expect(shots(run)).toEqual(['idle', 'shoot0', 'shoot1', 'shoot2', 'shoot3', 'shoot4', 'shoot5', 'idle'])
      })

    it('no throw or cast pose during windup, charge or dive (the shot leaves without a pose)', () => {
      for (const [kind, art, states] of [
        ['flyer', 'crowBoss', ['windup', 'dive']],
        ['swarm', 'foxBoss', ['windup', 'charge']]
      ] as const)
        for (const state of states) {
          const run = play(kind, art, () => ({ state, prevState: null, stateTime: 0.2 }), 2)
          expect(
            run.some((r) => r.frame.startsWith('shoot')),
            `${art} ${state}`
          ).toBe(false)
        }
    })

    it('a cast that would still run when he winds up is not started, and nothing of it shows', () => {
      // The fox walks 0.9 s before his wind-up: a shot due as he winds up has no room for its follow-through.
      const plan = (time: number) => ({ state: 'idle' as BossState, prevState: null, stateTime: 0.6 + time })
      const run = play('swarm', 'foxBoss', plan, 0.48, 0.3)
      expect(run.some((r) => r.shot)).toBe(true)
      expect(run.some((r) => r.frame.startsWith('shoot'))).toBe(false)
      expect(castStarts(boss('swarm', 'idle', { stateTime: 0.6, shotTimer: 0.24 }), bossSpec('foxBoss'))).toBe(false)
      expect(castStarts(boss('swarm', 'idle', { stateTime: 0.1, shotTimer: 0.24 }), bossSpec('foxBoss'))).toBe(true)
      // A lead-in that starts late (after a slide or a flinch) is played over the time left, if that is FIT_MIN.
      expect(castStarts(boss('swarm', 'recover', { stateTime: 0.1, shotTimer: 0.1 }), bossSpec('foxBoss'))).toBe(true)
      expect(castStarts(boss('swarm', 'recover', { stateTime: 0.1, shotTimer: 0.09 }), bossSpec('foxBoss'))).toBe(false)
      // A hover cast needs the hover's speed.
      const bee = bossSpec('beeBoss')
      expect(castStarts(boss('swarm', 'idle', { vx: 300, speed: 165, shotTimer: 0.24 }), bee)).toBe(false)
    })

    it("the crow's timer runs out during a dive: the wind-up ends the recover, the release lands on the shot", () => {
      // Dive until 0.5 s, then recover for 0.9 s (FLYER_RECOVER_SECONDS), then idle: the timer ran out at 0.6 s.
      const plan = (time: number) =>
        time < 0.5
          ? { state: 'dive' as BossState, prevState: 'windup' as BossState, stateTime: time }
          : time - 0.5 <= FLYER_RECOVER_SECONDS
            ? { state: 'recover' as BossState, prevState: 'dive' as BossState, stateTime: time - 0.5 }
            : {
                state: 'idle' as BossState,
                prevState: 'recover' as BossState,
                stateTime: time - 0.5 - FLYER_RECOVER_SECONDS
              }
      const run = play('flyer', 'crowBoss', plan, 2.2)
      const shotIndex = run.findIndex((r) => r.shot)
      expect(shotIndex).toBeGreaterThan(0)
      expect(run[shotIndex].frame).toBe('shoot3')
      // (The dive of this plan is level: `sweep`.)
      expect(shots(run)).toEqual([
        'sweep',
        'recover',
        'shoot0',
        'shoot1',
        'shoot2',
        'shoot3',
        'shoot4',
        'shoot5',
        'idle'
      ])
    })

    it('a summon plays the gesture from its release, where it fits', () => {
      const spec = bossSheetSpec('swarm', 'foxBoss')
      expect(summonStarts(boss('swarm', 'idle', { stateTime: 0.1 }), spec)).toBe(true)
      expect(summonStarts(boss('swarm', 'recover', { stateTime: 0.1 }), spec)).toBe(true)
      expect(summonStarts(boss('swarm', 'idle', { stateTime: SWARM_IDLE_SECONDS - 0.05 }), spec)).toBe(false)
      expect(summonStarts(boss('swarm', 'windup', { stateTime: 0 }), spec)).toBe(false)
      // Only the fox and the bee summon with a gesture.
      expect(summonStarts(boss('flyer', 'idle'), bossSpec('crowBoss'))).toBe(false)
      const release = hitTime(spec.shoot)
      expect(frameOf(spec.shoot, bossClip(boss('swarm', 'idle', { castAge: release }), 'foxBoss'))).toBe(3)
      expect(bossClip(boss('swarm', 'idle', { castAge: specDuration(spec.shoot) }), 'foxBoss').name).toBe('idle')
    })
  })

  it('the rage clip plays once', () => {
    const spec = bossSpecOf('final')
    const over = specDuration(spec.rage) + 0.01
    expect(bossClip(boss('final', 'idle', { rageAge: over }), 'king', spec).name).toBe('idle')
    expect(bossClip(boss('final', 'idle', { rageAge: over - 0.1 }), 'king', spec).name).toBe('rage')
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

describe('B: in the air a body is never drawn standing', () => {
  it('ハム代 off the ground (a hop in a pit) runs with her legs going on time; on the ground, by the ground she covers', () => {
    const spec = bossSpecOf('chaser')
    // Off the ground (where the tread never stands: view-tread.test.ts): `move`, on her own time, whatever the gain.
    for (const gain of [0, 40]) {
      const air = bossClip(boss('chaser', 'idle', { onGround: false, standing: false, gain, time: 1.3 }), 'mom', spec)
      expect(air).toMatchObject({ name: 'move', t: 1.3 })
    }
    // On the ground: by the ground she covers, or standing.
    const run = bossClip(boss('chaser', 'idle', { onGround: true, standing: false, gain: 40, time: 1.3 }), 'mom', spec)
    expect(run).toMatchObject({ name: 'move', t: strideTime(spec.move, 40) })
    expect(bossClip(boss('chaser', 'idle', { onGround: true, standing: true }), 'mom', spec).name).toBe('idle')
  })
})

describe('a leaping boss that falls is not drawn crouching or slumped in the air', () => {
  it.each(['tank', 'final'] as const)('%s: wind-up, recovery and walk give way to the fall of his leap', (kind) => {
    const spec = bossSpecOf(kind)
    for (const state of ['windup', 'recover', 'idle'] as const) {
      const falling = bossClip(
        boss(kind, state, { onGround: false, vy: 300, stateTime: 0.6 }),
        kind === 'tank' ? 'bearBoss' : 'king',
        spec
      )
      expect(falling.name, state).toBe('air')
      const standing = bossClip(
        boss(kind, state, { onGround: true, vy: 0, stateTime: 0.6 }),
        kind === 'tank' ? 'bearBoss' : 'king',
        spec
      )
      expect(standing.name, state).not.toBe('air')
    }
  })
})
