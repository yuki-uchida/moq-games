import { describe, expect, it } from 'vitest'
import {
  BOSS_ARTS,
  BOSS_KIND,
  ENEMY_KINDS,
  ENEMY_SPEC,
  HERO_SPEC,
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
  STAND_AFTER,
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
    ['bite', { biteAge: 0.02, hurt: true, vx: 215 }],
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

  it('advances the run cycle with distance, not time', () => {
    const a = heroClip(hero({ vx: 215, distance: 0 }), HERO_SPEC)
    const b = heroClip(hero({ vx: 100, distance: 0 }), HERO_SPEC)
    expect(a.t).toBe(b.t)
    const far = heroClip(hero({ vx: 215, distance: 215 / 14 }), HERO_SPEC)
    expect(frameOf(HERO_SPEC.run, far)).toBe(1)
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
  stillTime: 0,
  time: 0.3,
  ...extra
})

describe('enemy clips', () => {
  const cases: [EnemySnapshot['kind'], Partial<EnemySnapshot>, string, number?][] = [
    ['walker', {}, 'move'],
    ['walker', { stillTime: STAND_AFTER }, 'idle'],
    ['walker', { vx: 74 }, 'move'],
    ['tough', {}, 'move'],
    ['tough', { stillTime: STAND_AFTER }, 'idle'],
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

  it('the rat and the mole stand only after standing still a while; a single still step keeps the stride', () => {
    expect(STAND_AFTER).toBe(0.15)
    for (const kind of ['walker', 'tough'] as const) {
      // Walking, then stopped by a wall for one step, then walking on: the stride's time base runs on.
      const steps = [74, 74, 0, -74, -74].map((vx, i) => ({ vx, still: vx === 0 ? 1 / 60 : 0, time: 0.3 + i / 60 }))
      const picks = steps.map((s) => enemyClip(enemy(kind, { vx: s.vx, stillTime: s.still, time: s.time })))
      expect(picks.map((c) => c.name)).toEqual(['move', 'move', 'move', 'move', 'move'])
      expect(picks.map((c) => c.t)).toEqual(steps.map((s) => s.time))
      expect(enemyClip(enemy(kind, { stillTime: STAND_AFTER - 0.01 })).name).toBe('move')
      expect(enemyClip(enemy(kind, { stillTime: STAND_AFTER })).name).toBe('idle')
    }
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

const boss = (kind: BossKind, state: BossState, extra = {}) => ({
  kind,
  state,
  prevState: null,
  stateTime: 0.1,
  active: true,
  vx: 0,
  vy: 0,
  rageAge: null,
  hurtAge: null,
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
          { vy: -300 },
          { vy: 0 },
          { vy: 300 },
          { prevState: 'slam' },
          { prevState: 'shoot' },
          { active: false },
          { rageAge: 0.1 }
        ]) {
          const spec = bossSpecOf(kind)
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

  describe('a hit makes the boss flinch outside a warning or an attack', () => {
    const arts: [BossKind, string][] = [
      ['chaser', 'mom'],
      ...BOSS_ARTS.map((art) => [BOSS_KIND[art], art] as [BossKind, string])
    ]
    /** The frames a hit at `stateTime` shows over the hurt clip's length, then the clip after it. */
    const sweep = (kind: BossKind, art: string, state: BossState, extra = {}) => {
      const spec = bossSheetSpec(kind, art)
      const hurt = spec.hurt
      const frames = new Set<number>()
      const names = new Set<string>()
      for (let t = 0; t < specDuration(hurt); t += 0.005) {
        const choice = bossClip(boss(kind, state, { hurtAge: t, ...extra }), art, spec)
        names.add(choice.name)
        if (choice.name === 'hurt') frames.add(frameOf(hurt, choice))
      }
      const after = bossClip(boss(kind, state, { hurtAge: specDuration(hurt), ...extra }), art, spec)
      const unhurt = bossClip(boss(kind, state, extra), art, spec)
      return { frames, names, after, unhurt, hurt }
    }

    for (const [kind, art] of arts) {
      const calm: BossState[] = kind === 'chaser' ? ['idle', 'stunned', 'tired'] : ['idle', 'recover', 'stunned']
      for (const state of calm)
        it(`${art} hit in ${state}: hurt with every frame, then the state's clip`, () => {
          const { frames, names, after, unhurt, hurt } = sweep(kind, art, state)
          expect([...names]).toEqual(['hurt'])
          expect([...frames].sort()).toEqual(Array.from({ length: hurt.frames }, (_, i) => i))
          expect(after).toEqual(unhurt)
        })
      if (kind === 'chaser') continue
      for (const state of ['windup', 'charge', 'dive', 'slam', 'shoot'] as BossState[])
        it(`${art} hit in ${state}: keeps the state's clip`, () => {
          const { names, unhurt } = sweep(kind, art, state, { vy: -300 })
          expect([...names]).toEqual([unhurt.name])
        })
    }

    it('a walking boss flinches too, and a new hit restarts the clip', () => {
      const spec = bossSheetSpec('tank', 'bearBoss')
      expect(bossClip(boss('tank', 'idle', { vx: 80, hurtAge: 0.01 }), 'bearBoss', spec).name).toBe('hurt')
      expect(bossClip(boss('tank', 'idle', { hurtAge: 0 }), 'bearBoss', spec)).toEqual({ name: 'hurt', t: 0 })
    })

    it('the landing of a slam and the follow-through of a volley are kept', () => {
      const spec = bossSheetSpec('final', 'king')
      const pick = (extra: Record<string, unknown>) =>
        bossClip(boss('final', 'recover', { hurtAge: 0.02, ...extra }), 'king', spec).name
      expect(pick({ prevState: 'slam', stateTime: 0.05 })).toBe('land')
      expect(pick({ prevState: 'shoot', stateTime: 0.02 })).toBe('shoot')
      expect(pick({ prevState: 'slam', stateTime: 0.6 })).toBe('hurt')
    })

    it('the transformation comes before the flinch', () => {
      const spec = bossSheetSpec('final', 'king')
      expect(bossClip(boss('final', 'idle', { rageAge: 0.1, hurtAge: 0.01 }), 'king', spec).name).toBe('rage')
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
