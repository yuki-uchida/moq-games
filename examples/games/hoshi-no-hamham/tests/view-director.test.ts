import { describe, expect, it } from 'vitest'
import type { SimEvent } from '../src/game/events'
import type { Input } from '../src/game/input'
import { BITE_TIME, INVULN, emptyInput, type InputState, type Prop } from '../src/game/sim'
import { STAGES } from '../src/game/stages'
import type { Hud, HudApi } from '../src/ui/hud'
import { PlaySession, STEP } from '../src/app/play'
import { SOUND_CUES, type CueSink, type SoundCue } from '../src/view/cues'
import { StageDirector, type DirectorHost } from '../src/view/director'
import type { Renderer } from '../src/view/renderer'
import { Sequence, mergeClaims } from '../src/view/sequence'
import { EMOTE_SECONDS } from '../src/view/overlay'
import { SILENT_AUDIO } from '../src/view/sound-map'
import {
  BOSS_INTRO_SECONDS,
  BOSS_ROAR_SECONDS,
  CLEAR_SECONDS,
  DEATH_SECONDS,
  LAND_WAIT_SECONDS,
  BETWEEN_WAIT_SECONDS,
  RAGE_FRAME,
  RAGE_PAN_SECONDS,
  RAGE_POSE_MARGIN,
  RAGE_SPOT_RISE,
  STAGE_START_SECONDS
} from '../src/view/staging'
import { HERO_SPEC, VIEW_W, allSheetSpecs, bossSpec, type BossArt } from '../src/art/contract'
import { WINDUP_REST_SECONDS, groundBelow } from '../src/view/actors'
import { frameOf } from './play-audit'
import { frameAt, type Anim } from '../src/art/sheet'
import { RUN_THRESHOLD, clipLife, frameStart, specDuration } from '../src/view/clips'
import { TILE } from '../src/game/types'

// ------------------------------------------------------------------------------------------------- stubs

interface HudCall {
  name: keyof HudApi
  args: unknown[]
}

function stubHud() {
  const calls: HudCall[] = []
  let cinematic = false
  /** Whether the HUD takes speech lines itself (a portrait deck). */
  let deck = false
  const record =
    (name: keyof HudApi) =>
    (...args: unknown[]) => {
      calls.push({ name, args })
      if (name === 'cinematic') cinematic = Boolean(args[0])
    }
  const hud = {
    showBanner: record('showBanner'),
    showToast: record('showToast'),
    showCall: record('showCall'),
    showNameplate: record('showNameplate'),
    showBoss: record('showBoss'),
    hideBoss: record('hideBoss'),
    cinematic: record('cinematic'),
    speak: (...args: unknown[]) => {
      calls.push({ name: 'speak', args })
      return deck
    },
    lights: record('lights'),
    show() {},
    hide() {},
    setStage() {},
    settle() {},
    update() {}
  }
  return {
    hud,
    calls,
    get cinematic() {
      return cinematic
    },
    set deck(on: boolean) {
      deck = on
    },
    texts: (name: keyof HudApi) => calls.filter((c) => c.name === name).map((c) => String(c.args[0]))
  }
}

/** Input that presses jump on demand (for skipping). */
function stubInput() {
  let pending = false
  return {
    press() {
      pending = true
    },
    poll(): InputState {
      const state = emptyInput()
      state.jumpPressed = pending
      return state
    },
    consumePresses() {
      pending = false
    },
    get pending() {
      return pending
    }
  }
}

function setup(no: number, options: { reducedMotion?: boolean } = {}) {
  const hud = stubHud()
  const input = stubInput()
  const cues: SoundCue[] = []
  const sink: CueSink = { cue: (cue) => cues.push(cue) }
  let director!: StageDirector
  let host!: DirectorHost
  const session = new PlaySession(
    STAGES[no - 1],
    {
      renderer: { k: 1 } as unknown as Renderer,
      hud: hud.hud as unknown as Hud,
      audio: SILENT_AUDIO,
      input: input as unknown as Input,
      reducedMotion: Boolean(options.reducedMotion)
    },
    {
      makeDirector: (h) => {
        host = { ...h, sound: sink }
        director = new StageDirector(host, input)
        return director
      }
    }
  )
  const frame = (seconds = STEP) => session.frame(seconds)
  const run = (seconds: number, until?: () => boolean) => {
    for (let t = 0; t < seconds; t += STEP) {
      frame(STEP)
      if (until?.()) return t + STEP
    }
    return seconds
  }
  return { session, world: session.world, view: session.view, director, host, hud, input, cues, frame, run }
}

type Rig = ReturnType<typeof setup>

/** Nothing is held, locked, letterboxed or detached. */
function expectReleased(rig: Rig) {
  const { director, view, hud } = rig
  expect(director.timeScale).toBe(1)
  expect(director.inputLocked).toBe(false)
  expect(director.current).toBeNull()
  expect(hud.cinematic).toBe(false)
  expect(view.camera.panning).toBe(false)
  // Let the bars and the iris settle.
  rig.run(0.6)
  expect(view.overlay.barsAmount).toBe(0)
  expect(view.overlay.irisOpen).toBe(1)
  expect(view.overlay.spotlightAmount).toBe(0)
}

/** Feeds an event through the view and the director, as the session does. */
function emit(rig: Rig, event: SimEvent) {
  rig.view.handle(event)
  rig.director.handle(event)
}

/**
 * Plays on until the boss is between his actions (at rest on the ground, nothing of an attack showing): a phase
 * change then begins its moment on the step it comes (the transformation waits for him otherwise).
 */
function atRest(rig: Rig) {
  for (let n = 0; n < 60 * 10 && !rig.view.actors.bossBetweenActions(); n++) {
    rig.world.player.hp = rig.world.player.maxHp
    rig.world.player.invuln = 999
    rig.frame()
  }
  expect(rig.view.actors.bossBetweenActions()).toBe(true)
}

/** Starts a stage and lets its opening finish. */
function started(no: number, options: { reducedMotion?: boolean } = {}) {
  const rig = setup(no, options)
  rig.session.start()
  rig.run(2, () => rig.director.current === null)
  return rig
}

/**
 * Walks the hero across the arena line so the boss wakes, and runs until his entrance begins (level with a flier
 * the hero is in the air: the entrance waits for him to land).
 */
function wakeBoss(rig: Rig) {
  const { world } = rig
  const boss = world.boss!
  world.player.x = boss.arenaX + 4
  world.player.y = boss.y + boss.h - world.player.h
  world.player.vx = 0
  world.player.vy = 0
  world.player.invuln = 999
  rig.run(LAND_WAIT_SECONDS + 0.2, () => rig.director.current === 'boss-intro')
}

// ------------------------------------------------------------------------------------------------- tests

describe('sequence timeline', () => {
  it('runs beats in order, ends at its length and releases its claims', () => {
    const order: string[] = []
    const seq = new Sequence('t', 1, { claims: { scale: 0, lock: true } })
      .at(0.5, () => order.push('b'))
      .at(0, () => order.push('a'))
      .at(1, () => order.push('end-beat'))
      .onEnd(() => order.push('end'))
    seq.update(0)
    expect(seq.claims()).toEqual({ scale: 0, lock: true })
    seq.update(0.6)
    expect(order).toEqual(['a', 'b'])
    seq.update(0.6)
    expect(order).toEqual(['a', 'b', 'end-beat', 'end'])
    expect(seq.state).toBe('done')
    expect(seq.claims()).toEqual({})
  })

  it('skips to the end running only the kept beats, or to its skip point', () => {
    const order: string[] = []
    const seq = new Sequence('t', 2, { skippable: true })
      .at(0.5, () => order.push('drop'))
      .at(0.8, () => order.push('keep'), true)
      .onEnd(() => order.push('end'))
    seq.update(0.1)
    expect(seq.skip()).toBe(true)
    expect(order).toEqual(['keep', 'end'])
    const tail: string[] = []
    const ending = new Sequence('e', 2, { skippable: true, skipTo: 1.2 })
      .at(0.3, () => tail.push('x'))
      .at(1.2, () => tail.push('iris'), true)
      .at(2, () => tail.push('out'), true)
    ending.update(0.1)
    ending.skip()
    expect(tail).toEqual(['iris'])
    expect(ending.running).toBe(true)
    ending.update(1)
    expect(tail).toEqual(['iris', 'out'])
    expect(new Sequence('n', 3).skip()).toBe(false)
  })

  it('cancels without end handlers and merges claims', () => {
    let ended = false
    const seq = new Sequence('c', 1, { claims: { bars: true } }).onEnd(() => (ended = true))
    seq.cancel()
    expect(ended).toBe(false)
    expect(seq.claims()).toEqual({})
    expect(mergeClaims([{ scale: 0.3 }, { scale: 0, lock: true }, { bars: true }])).toMatchObject({
      scale: 0,
      lock: true,
      bars: true,
      camera: false
    })
  })
})

describe('stage start', () => {
  it('irises in, shows the title card and 「スタート！」 within 1.6 s, locks the input, then releases', () => {
    const rig = setup(4)
    rig.session.start()
    expect(rig.director.current).toBe('stage-start')
    expect(rig.director.inputLocked).toBe(true)
    expect(rig.view.overlay.irisOpen).toBe(0)
    expect(rig.hud.texts('showBanner')[0]).toContain(STAGES[3].name)
    const took = rig.run(3, () => rig.director.current === null)
    expect(took).toBeLessThanOrEqual(1.6)
    expect(rig.hud.texts('showCall')).toContain('スタート！')
    expect(rig.cues).toEqual(expect.arrayContaining(['iris-in', 'stage-start', 'ready']))
    // The title card is told to leave before 「スタート！」 comes (one thing in the upper-third slot).
    const banner = rig.hud.calls.find((c) => c.name === 'showBanner')!
    expect(Number(banner.args[2])).toBeLessThan(STAGE_START_SECONDS - 0.22)
    expect(rig.hud.texts('showToast')).toContain(STAGES[3].hints[0])
    expectReleased(rig)
  })

  it('can be skipped with jump', () => {
    const rig = setup(4)
    rig.session.start()
    rig.run(0.3)
    rig.input.press()
    rig.frame()
    expect(rig.director.current).toBeNull()
    expect(rig.input.pending).toBe(false)
    expect(rig.hud.texts('showCall')).toContain('スタート！')
    expectReleased(rig)
  })

  it('stage 1 with a deck: ハム代の line goes to the HUD with her face, the stage shows only a wordless balloon', () => {
    const rig = setup(1)
    rig.hud.deck = true
    rig.session.start()
    rig.run(0.5)
    const speak = rig.hud.calls.find((c) => c.name === 'speak')!
    expect(speak.args).toEqual(['こらーっ！まちなさーい！', 'ママ・ハム代', 'face_mom', 2, 'yell'])
    expect(rig.view.overlay.bubbleTexts).toContain('こらーっ！まちなさーい！')
    expect(rig.hud.calls.some((c) => c.name === 'lights' && c.args[0] === true)).toBe(true)
    // The wordless balloon only marks the speaker for a moment.
    rig.run(EMOTE_SECONDS)
    expect(rig.view.overlay.bubbleTexts).not.toContain('こらーっ！まちなさーい！')
  })

  it('stage 1 without a deck: ハム代の line stays a bubble on the stage for its whole length', () => {
    const rig = setup(1)
    rig.session.start()
    rig.run(1.2)
    expect(rig.hud.calls.some((c) => c.name === 'speak')).toBe(true)
    expect(rig.view.overlay.bubbleTexts).toContain('こらーっ！まちなさーい！')
  })

  it('stage 1: the yell is gone when the chase starts', () => {
    const rig = setup(1)
    rig.session.start()
    rig.run(2, () => rig.director.current === null)
    expect(rig.view.actors.posing('boss')).toBeNull()
    expect(rig.view.actors.posing('hero')).toBeNull()
  })

  for (const [name, start] of [
    ['the chase start', (rig: Rig) => rig.session.start()],
    ['the boss intro', (rig: Rig) => wakeBoss(rig)]
  ] as const)
    it(`skipping ${name} at 0.15 s leaves no pose once the simulation runs`, () => {
      const rig = name === 'the chase start' ? setup(1) : started(5)
      start(rig)
      expect(rig.director.current).not.toBeNull()
      rig.run(0.15)
      rig.input.press()
      rig.frame()
      expect(rig.director.current).toBeNull()
      expect(rig.view.actors.posing('boss')).toBeNull()
      expect(rig.view.actors.posing('hero')).toBeNull()
    })

  for (const reducedMotion of [false, true])
    it(`the freed princess's cheer never overlaps free input${reducedMotion ? ' (reduced motion: no cheer)' : ''}`, () => {
      const rig = started(4, { reducedMotion })
      const p = rig.world.player
      rig.run(0.5)
      expect(p.onGround).toBe(true)
      emit(rig, { type: 'princess-free', x: p.x + p.w / 2, y: p.y + p.h / 2 })
      let posed = false
      for (let i = 0; i < 90; i++) {
        if (rig.view.actors.posing('hero') === 'cheer') {
          posed = true
          expect(rig.director.inputLocked).toBe(true)
        }
        rig.frame()
      }
      expect(posed).toBe(!reducedMotion)
    })

  it('stage 1: ハム代 yells while the simulation is held, the hero jumps in fright, and he is unhurt', () => {
    const rig = setup(1)
    rig.session.start()
    expect(rig.director.current).toBe('chase-start')
    const momX = rig.world.boss!.x
    let posedHero = false
    let posedMom = false
    const took = rig.run(2, () => {
      posedHero ||= rig.view.actors.posing('hero') === 'hurt'
      posedMom ||= rig.view.actors.posing('boss') === 'yell'
      return rig.director.current === null
    })
    expect(took).toBeLessThanOrEqual(1.6)
    expect(rig.world.time).toBe(0)
    expect(rig.world.boss!.x).toBe(momX)
    expect(posedHero && posedMom).toBe(true)
    expect(rig.view.overlay.bubbleTexts).toContain('こらーっ！まちなさーい！')
    expect(rig.cues).toContain('mom-yell')
    expect(rig.hud.calls.some((c) => c.name === 'showBoss')).toBe(true)
    expect(rig.world.player.hp).toBe(rig.world.player.maxHp)
    expectReleased(rig)
    // Control returns: the simulation runs again.
    rig.run(0.2)
    expect(rig.world.time).toBeGreaterThan(0)
  })
})

describe('bosses', () => {
  it('a boss intro holds the simulation, letterboxes, pans, shows the nameplate and then releases everything', () => {
    const rig = started(5)
    wakeBoss(rig)
    expect(rig.director.current).toBe('boss-intro')
    const t0 = rig.world.time
    rig.run(1)
    expect(rig.world.time).toBe(t0)
    expect(rig.director.timeScale).toBe(0)
    expect(rig.view.overlay.barsAmount).toBeGreaterThan(0.9)
    expect(rig.hud.cinematic).toBe(true)
    expect(rig.view.camera.panning).toBe(true)
    expect(rig.view.actors.posing('boss')).toBe('intro')
    rig.run(BOSS_INTRO_SECONDS, () => rig.director.current === null)
    expect(rig.hud.texts('showNameplate')).toEqual([STAGES[4].boss.name])
    expect(rig.hud.calls.find((c) => c.name === 'showNameplate')!.args[2]).toBe('face_wolfBoss')
    expect(rig.hud.texts('showCall')).toContain('ファイト！')
    expect(rig.hud.texts('showBoss')).toContain(STAGES[4].boss.name)
    expect(rig.cues).toContain('boss-roar')
    expectReleased(rig)
    rig.run(0.2)
    expect(rig.world.time).toBeGreaterThan(t0)
  })

  it('a boss intro can be skipped and still introduces the boss', () => {
    const rig = started(5)
    wakeBoss(rig)
    rig.run(0.3)
    rig.input.press()
    rig.frame()
    expect(rig.director.current).toBeNull()
    expect(rig.hud.texts('showNameplate')).toHaveLength(1)
    expect(rig.hud.texts('showBoss')).toContain(STAGES[4].boss.name)
    expectReleased(rig)
  })

  for (const side of [1, -1] as const)
    it(`a boss's throw smokes where its light was, where the shot is born (the hero to the ${side > 0 ? 'right' : 'left'})`, () => {
      const rig = started(8)
      wakeBoss(rig)
      rig.director.skip()
      const boss = rig.world.boss!
      const p = rig.world.player
      p.x = boss.x + boss.w / 2 + side * 200
      const seen: { name: string; x: number; y: number }[] = []
      const spawn = rig.view.fx.spawn.bind(rig.view.fx)
      rig.view.fx.spawn = (name, x, y, o) => {
        seen.push({ name, x, y })
        spawn(name, x, y, o)
      }
      const cx = boss.x + boss.w / 2
      emit(rig, { type: 'boss-shoot', x: cx, y: boss.y + boss.h / 2, count: 3 })
      // His drawn centre, 7 px on (the shot's box has its left edge on his centre), at the shot's height.
      const at = { x: 0, y: 0 }
      rig.view.actors.shotBirth(boss, at)
      expect(at.x).toBeCloseTo(rig.view.actors.bossX(boss) + 7)
      expect(at.y).toBeCloseTo(boss.y + boss.h * 0.4 + 7)
      expect(seen.filter((f) => f.name === 'smoke')).toEqual([{ name: 'smoke', x: at.x, y: at.y }])
    })

  it('stage 4: landing on the floor of the pool stirs bubbles, landing on the bank raises dust', () => {
    const rig = started(4)
    const names: string[] = []
    const fx = rig.view.fx
    const spawn = fx.spawn.bind(fx)
    const burst = fx.burst.bind(fx)
    fx.spawn = (name, x, y, o) => {
      names.push(name)
      spawn(name, x, y, o)
    }
    fx.burst = (name, x, y, count, o) => {
      names.push(name)
      burst(name, x, y, count, o)
    }
    // The pool: columns 60–61, water in rows 15–16, its floor at row 17; the bank at row 15.
    expect(rig.world.waterAt(60, 16)).toBe(true)
    rig.view.handle({ type: 'land', x: 60.5 * TILE, y: 17 * TILE, speed: 260 })
    rig.view.handle({ type: 'jump', x: 60.5 * TILE, y: 17 * TILE })
    // (A burst spawns its particles one by one.)
    expect([...new Set(names)]).toEqual(['bubble'])
    names.length = 0
    rig.view.handle({ type: 'land', x: 57.5 * TILE, y: 15 * TILE, speed: 300 })
    expect([...new Set(names)]).toEqual(['dust'])
  })

  it("the king's volley smokes on his centre, where it bursts out of his chest", () => {
    const rig = started(10)
    wakeBoss(rig)
    rig.director.skip()
    const boss = rig.world.boss!
    rig.world.player.x = boss.x + boss.w / 2 + 200
    const seen: { name: string; x: number; y: number }[] = []
    const spawn = rig.view.fx.spawn.bind(rig.view.fx)
    rig.view.fx.spawn = (name, x, y, o) => {
      seen.push({ name, x, y })
      spawn(name, x, y, o)
    }
    const cx = boss.x + boss.w / 2
    emit(rig, { type: 'boss-shoot', x: cx, y: boss.y + boss.h / 2, count: 3 })
    expect(seen.filter((f) => f.name === 'smoke').map((f) => f.x)).toEqual([cx])
  })

  for (const no of [3, 5, 8, 10])
    for (const reducedMotion of [false, true])
      it(`stage ${no}: the roar is posed for the whole intro clip and its tail, until the moment ends${reducedMotion ? ' (reduced motion)' : ''}`, () => {
        const rig = started(no, { reducedMotion })
        const art = STAGES[no - 1].boss.art as BossArt
        wakeBoss(rig)
        rig.run(2, () => rig.view.actors.posing('boss') === 'intro')
        let posed = 0
        while (rig.view.actors.posing('boss') === 'intro' && posed < 4) {
          // Up on every frame of the moment (the camera's return included) ...
          expect(rig.director.current).toBe('boss-intro')
          rig.frame()
          posed += STEP
        }
        // ... and gone with it.
        expect(rig.director.current).not.toBe('boss-intro')
        const want = Math.max(BOSS_ROAR_SECONDS, clipLife(bossSpec(art).intro))
        expect(posed).toBeGreaterThanOrEqual(want - STEP * 1.5)
        // The weasel and the ape linger on key poses of their roar: their intro outlasts the minimum.
        if (art === 'weaselBoss' || art === 'apeBoss') expect(want).toBeGreaterThan(BOSS_ROAR_SECONDS)
      })

  for (const reducedMotion of [false, true])
    it(`phase 2 holds the fight while the whole rage clip plays${reducedMotion ? ' (reduced motion)' : ''}`, () => {
      const rig = started(10, { reducedMotion })
      wakeBoss(rig)
      rig.director.skip()
      const boss = rig.world.boss!
      const rage = bossSpec('king').rage
      const stand = {
        frames: Array.from({ length: rage.frames }, () => ({})),
        fps: rage.fps,
        loop: rage.loop,
        sustain: rage.sustain,
        hold: rage.hold && [...rage.hold]
      } as unknown as Anim
      atRest(rig)
      emit(rig, { type: 'boss-phase', phase: 2, x: boss.x, y: boss.y })
      rig.director.simStep()
      expect(rig.director.current).toBe('boss-phase')
      expect(rig.director.timeScale).toBe(0)
      expect(rig.view.actors.posing('boss')).toBe('rage')
      const t0 = rig.world.time
      // The frames the staged pose shows, by its age, until the pose ends; and when the fight resumed.
      const seen: number[] = [frameAt(stand, 0)]
      let age = 0
      let releasedAt: number | null = null
      while (rig.view.actors.posing('boss') === 'rage' && age < 3) {
        rig.frame()
        age += STEP
        if (releasedAt === null && rig.director.current === null) releasedAt = age
        else if (releasedAt === null) expect(rig.world.time).toBe(t0)
        if (rig.view.actors.posing('boss') === 'rage') seen.push(frameAt(stand, age))
      }
      // Every frame in order, then only the burning tail.
      let end = seen.indexOf(rage.frames - 1)
      while (end < seen.length && seen[end] === rage.frames - 1) end++
      const firstPass = seen.slice(0, end)
      expect([...new Set(firstPass)]).toEqual(Array.from({ length: rage.frames }, (_, i) => i))
      const tail = seen.slice(end)
      for (const f of tail) expect([rage.frames - 2, rage.frames - 1]).toContain(f)
      if (!reducedMotion) expect(new Set(tail)).toEqual(new Set([rage.frames - 2, rage.frames - 1]))
      // The pose ends with the moment (it is never drawn on a step the simulation runs), and on the next frame he is
      // drawn from his raged sheet, the transformation not played again.
      expect(releasedAt).toBe(age)
      expect(releasedAt!).toBeCloseTo(reducedMotion ? specDuration(rage) : clipLife(rage), 1)
      expect(rig.view.actors.bossSheet(boss)).toBe('king:raged')
      rig.frame()
      expect(rig.view.actors.selectBoss(boss).name).not.toBe('rage')
      expect(rig.view.actors.bossSheet(boss)).toBe('king:raged')
      expectReleased(rig)
    })

  for (const reducedMotion of [false, true])
    it(`phase 2 dims everything but the king while the fight is held${reducedMotion ? ' (reduced motion)' : ''}`, () => {
      const rig = started(10, { reducedMotion })
      wakeBoss(rig)
      rig.director.skip()
      const boss = rig.world.boss!
      const p = rig.world.player
      // The hero beside him (he has just bitten him), the camera settled on the two of them.
      for (let n = 0; n < 90 || !rig.view.actors.bossBetweenActions(); n++) {
        p.x = boss.x - 90
        p.vx = 0
        p.hp = p.maxHp
        p.invuln = 999
        rig.frame()
        if (n > 900) break
      }
      expect(rig.view.overlay.spotlightAmount).toBe(0)
      emit(rig, { type: 'boss-phase', phase: 2, x: boss.x, y: boss.y })
      rig.director.simStep()
      expect(rig.director.current).toBe('boss-phase')
      let spot = 0
      let last = 1
      for (let n = 0; n < 400; n++) {
        rig.frame()
        if (rig.director.current !== 'boss-phase') break
        // The light is on him (the middle of his pillar of flame), wherever the camera is: the world around him,
        // a hero caught in the air too, hangs in the dark.
        // (Under his drawn body, which may stand a few px from his box.)
        const { camera, overlay } = rig.view
        expect(overlay.spotX).toBe(Math.round(rig.view.actors.bossX(boss) - camera.x))
        expect(overlay.spotY).toBe(Math.round(boss.y + boss.h - RAGE_SPOT_RISE - camera.y))
        // (He is in the view already: the camera is left alone.)
        expect(camera.panning).toBe(false)
        // (The moment's first frame still shows the step that began it: nothing is dimmed on it.)
        if (n === 0) expect(overlay.spotlightAmount).toBe(0)
        spot = Math.max(spot, overlay.spotlightAmount)
        last = overlay.spotlightAmount
      }
      expect(spot).toBe(1)
      // The light is back up when the fight goes on: nothing is dimmed on a frame the simulation runs.
      expect(last).toBeLessThan(0.1)
      expectReleased(rig)
    })

  for (const reducedMotion of [false, true])
    it(`phase 2 brings a king who is out of the view into it, and the camera is home when the fight goes on${reducedMotion ? ' (reduced motion)' : ''}`, () => {
      const rig = started(10, { reducedMotion })
      wakeBoss(rig)
      rig.director.skip()
      const { world, view, director } = rig
      const boss = world.boss!
      const p = world.player
      atRest(rig)
      // The hero is far off (a charge carried the king away from him), the camera with him.
      const far = boss.x + boss.w / 2 - VIEW_W
      for (let n = 0; n < 120; n++) {
        p.x = far
        p.vx = 0
        p.hp = p.maxHp
        p.invuln = 999
        rig.frame()
        if (!view.actors.bossBetweenActions()) continue
        if (!view.camera.sees(boss.x + boss.w / 2, boss.y + boss.h / 2) && n > 30) break
      }
      expect(view.camera.sees(boss.x + boss.w / 2, boss.y + boss.h / 2)).toBe(false)
      atRest(rig)
      emit(rig, { type: 'boss-phase', phase: 2, x: boss.x, y: boss.y })
      director.simStep()
      expect(director.current).toBe('boss-phase')
      const lit = { x: view.actors.bossX(boss), y: boss.y + boss.h - RAGE_SPOT_RISE }
      let seen = 0
      let frames = 0
      for (let n = 0; n < 400; n++) {
        rig.frame()
        if (director.current !== 'boss-phase') break
        frames++
        // Once the pan is done his whole pillar of flame is in the view, to the moment's last frame (the burst that
        // covers his change is seen).
        const whole =
          view.camera.sees(lit.x - RAGE_FRAME.side, lit.y - RAGE_FRAME.above) &&
          view.camera.sees(lit.x + RAGE_FRAME.side, lit.y + RAGE_FRAME.below)
        if (whole) seen++
        else expect(frames * STEP).toBeLessThanOrEqual(RAGE_PAN_SECONDS + 2 * STEP)
        // The spotlight is on him wherever the camera is.
        expect(view.overlay.spotX).toBe(Math.round(lit.x - view.camera.x))
      }
      const length = frames * STEP
      expect(seen * STEP).toBeGreaterThan(length - RAGE_PAN_SECONDS - 3 * STEP)
      // The fight goes on and the follow camera eases back to the hero.
      expectReleased(rig)
      const home = view.camera.followCentre(p)
      expect(Math.abs(view.camera.x + VIEW_W / 2 - home.x)).toBeLessThan(8)
    })

  it('a press does not skip phase 2: the transformation is part of the fight', () => {
    const rig = started(10)
    wakeBoss(rig)
    rig.director.skip()
    const boss = rig.world.boss!
    atRest(rig)
    emit(rig, { type: 'boss-phase', phase: 2, x: boss.x, y: boss.y })
    rig.director.simStep()
    rig.run(0.3)
    rig.input.press()
    rig.frame()
    expect(rig.director.current).toBe('boss-phase')
    expect(rig.view.actors.posing('boss')).toBe('rage')
  })

  for (const no of [5, 10])
    it(`stage ${no}: a defeated boss gets hit-stop, slow motion and a chain of booms, then the goal opens`, () => {
      const rig = started(no)
      wakeBoss(rig)
      rig.director.skip()
      rig.run(0.1)
      const boss = rig.world.boss!
      boss.hp = 1
      rig.world.damageBoss(1)
      rig.run(STEP * 2)
      expect(rig.director.current).toBe('boss-defeat')
      expect(rig.view.frozen).toBe(true)
      let slow = false
      let flashes = rig.view.overlay.flashes
      const took = rig.run(5, () => {
        slow ||= rig.director.timeScale > 0 && rig.director.timeScale < 0.5
        return rig.director.current !== 'boss-defeat'
      })
      flashes = rig.view.overlay.flashes - flashes
      expect(slow).toBe(true)
      expect(flashes).toBeGreaterThan(0)
      expect(took).toBeLessThanOrEqual(no === 10 ? 3.5 : 2.6)
      expect(rig.cues.filter((c) => c === 'boss-boom').length).toBeGreaterThanOrEqual(no === 10 ? 10 : 6)
      expect(rig.world.goalOpen).toBe(true)
      rig.run(3, () => rig.director.current === null)
      expect(rig.director.log).toContain('goal-reveal')
      expect(rig.hud.texts('hideBoss').length).toBeGreaterThan(0)
      expectReleased(rig)
      // The arrow at the screen edge points to the open goal while it is off screen.
      expect(rig.view.overlay.pointer).not.toBeNull()
      expect(rig.view.overlay.pointer!.angle).toBeGreaterThan(-Math.PI / 2)
      expect(rig.view.overlay.pointer!.angle).toBeLessThan(Math.PI / 2)
    })
})

describe('endings', () => {
  it('the clear cheers, irises out and sets the outcome only at its end (within 4 s)', () => {
    const rig = started(4)
    const { world } = rig
    world.goalOpen = true
    world.player.x = world.goalX + 8
    world.player.y = world.goalY + 64 - world.player.h
    rig.run(0.2, () => world.state === 'clear')
    expect(rig.director.current).toBe('clear')
    rig.run(CLEAR_SECONDS - 0.4)
    expect(rig.director.outcome).toBeNull()
    expect(rig.view.actors.posing('hero')).toBe('cheer')
    expect(rig.hud.texts('showCall')).toContain('クリア！')
    const took = rig.run(4, () => rig.director.outcome !== null)
    expect(took).toBeLessThan(1)
    expect(rig.director.outcome).toBe('clear')
    expect(rig.view.overlay.irisOpen).toBeLessThan(0.05)
    expect(rig.cues).toEqual(expect.arrayContaining(['confetti', 'iris-out']))
    expect(rig.hud.calls.filter((c) => c.name === 'lights').map((c) => c.args[0])).toContain(false)
    expect(rig.director.inputLocked).toBe(false)
    expect(rig.hud.cinematic).toBe(false)
  })

  it('the death spotlights the hero, irises out on him and then sets the outcome', () => {
    const rig = started(4)
    const { world } = rig
    world.player.invuln = 0
    world.hurtPlayer(99, world.player.x + 100)
    let spot = 0
    let outcomeAt = 0
    for (let t = 0; t < 4 && !rig.director.outcome; t += STEP) {
      rig.frame()
      spot = Math.max(spot, rig.view.overlay.spotlightAmount)
      outcomeAt = t
    }
    expect(spot).toBeGreaterThan(0.9)
    expect(rig.director.outcome).toBe('dead')
    expect(outcomeAt).toBeGreaterThan(DEATH_SECONDS - 0.2)
    expect(outcomeAt).toBeLessThan(4)
    expect(rig.view.overlay.irisOpen).toBeLessThan(0.05)
    expect(rig.cues).toContain('iris-out')
    expect(rig.hud.calls.filter((c) => c.name === 'lights').at(-1)!.args[0]).toBe(false)
  })

  for (const reducedMotion of [false, true])
    it(`the death iris closes on where the body comes to lie${reducedMotion ? ' (reduced motion)' : ''}`, () => {
      const rig = started(4, { reducedMotion })
      const { world, view } = rig
      world.player.invuln = 0
      world.hurtPlayer(99, world.player.x + 100)
      rig.run(4, () => view.overlay.irisTarget === 0)
      expect(view.overlay.irisTarget).toBe(0)
      // He was standing: the body comes down where it was knocked up, whether or not it is still in the air.
      const rest = view.actors.deathRest()!
      expect(rest.y).toBeCloseTo(world.player.y + world.player.h / 2)
      expect(view.overlay.irisX).toBe(Math.round(rest.x - view.camera.x))
      expect(view.overlay.irisY).toBe(Math.round(rest.y - view.camera.y))
    })

  it('skipping the clear still plays the iris out before the outcome', () => {
    const rig = started(4)
    emit(rig, { type: 'clear', x: 100, y: 100 })
    rig.world.state = 'clear'
    rig.run(0.3)
    rig.input.press()
    rig.frame()
    expect(rig.director.outcome).toBeNull()
    expect(rig.view.overlay.irisTarget).toBe(0)
    const took = rig.run(2, () => rig.director.outcome !== null)
    expect(took).toBeLessThanOrEqual(0.85)
  })
})

describe('a boss knocked out in the air', () => {
  it('the explosions and the last burst follow the body down to where it lies', () => {
    // Stage 2: the crow cruises above the ground.
    const rig = started(2)
    const { world, view } = rig
    wakeBoss(rig)
    rig.director.skip()
    rig.run(0.1)
    const boss = world.boss!
    // Well above the ground he will fall to.
    boss.y -= 40
    const fell = { x: boss.x + boss.w / 2, y: boss.y + boss.h / 2 }
    const seen: { name: string; x: number; y: number; body: { x: number; y: number } | null }[] = []
    const spawn = view.fx.spawn.bind(view.fx)
    view.fx.spawn = (name, x, y, o) => {
      seen.push({ name, x, y, body: view.actors.bossBodyPoint() })
      spawn(name, x, y, o)
    }
    boss.hp = 1
    world.damageBoss(1)
    rig.run(5, () => rig.director.current !== 'boss-defeat' && rig.director.current !== null)
    // The ring of the last burst is centred on the body, which has come down by then.
    const rings = seen.filter((f) => f.name === 'ring' && f.body)
    const last = rings.at(-1)!
    expect(last.body!.y).toBeGreaterThan(fell.y + 20)
    expect(last.x).toBe(last.body!.x)
    expect(last.y).toBe(last.body!.y)
    // So are the two blasts that come with it (the last things spawned before the ring).
    const at = seen.indexOf(last)
    const blasts = seen.slice(at - 2, at)
    expect(blasts.map((f) => f.name)).toEqual(['boom', 'boom'])
    for (const blast of blasts) {
      expect(Math.abs(blast.x - last.body!.x)).toBeLessThanOrEqual(boss.w * 0.3 + 1)
      expect(Math.abs(blast.y - last.body!.y)).toBeLessThanOrEqual(boss.h * 0.3 + 1)
    }
  })
})

describe('interruptions', () => {
  it('death during a boss intro leaves nothing held and still ends the stage', () => {
    const rig = started(5)
    wakeBoss(rig)
    rig.run(0.6)
    expect(rig.director.timeScale).toBe(0)
    const { world } = rig
    world.player.invuln = 0
    world.hurtPlayer(99, world.player.x + 100)
    rig.run(STEP * 2)
    expect(rig.director.current).toBe('death')
    expect(rig.director.timeScale).toBe(1)
    expect(rig.director.claims.bars).toBe(false)
    expect(rig.director.claims.camera).toBe(false)
    expect(rig.view.camera.panning).toBe(false)
    rig.run(4, () => rig.director.outcome !== null)
    expect(rig.director.outcome).toBe('dead')
    expect(rig.view.overlay.barsAmount).toBe(0)
  })

  it('the boss falling during the goal pan or the intro releases the camera and the time', () => {
    const rig = started(5)
    wakeBoss(rig)
    rig.run(0.4)
    // Forced from outside (a test hook): the boss falls while his intro plays.
    const boss = rig.world.boss!
    boss.invuln = 0
    boss.hp = 1
    rig.world.damageBoss(1)
    // The simulation is held, so deliver its events now, as a step would.
    for (const event of rig.world.events.splice(0)) emit(rig, event)
    expect(rig.director.current).toBe('boss-defeat')
    rig.run(8, () => rig.director.current === null && rig.director.log.includes('goal-reveal'))
    expectReleased(rig)
  })

  it('a stage start cut short by a boss reopens the iris', () => {
    const rig = setup(5)
    rig.session.start()
    rig.run(0.1)
    expect(rig.view.overlay.irisOpen).toBeLessThan(1)
    const boss = rig.world.boss!
    // (Put down above his floor, he is still coming down: the intro begins once he lands.)
    emit(rig, { type: 'boss-awake', x: boss.x, y: boss.y })
    rig.run(1, () => rig.director.current === 'boss-intro')
    expect(rig.director.current).toBe('boss-intro')
    expect(boss.onGround).toBe(true)
    expect(rig.view.overlay.irisOpen).toBeLessThan(1)
    rig.director.skip()
    expectReleased(rig)
  })

  it('a world that ends without its event still plays the ending', () => {
    const rig = started(3)
    rig.world.state = 'clear'
    rig.run(4, () => rig.director.outcome !== null)
    expect(rig.director.outcome).toBe('clear')
    expect(rig.director.log).toContain('clear')
  })
})

describe('reduced motion', () => {
  it('never flashes, shakes or slows down, and keeps the card, the nameplate and the calls', () => {
    const rig = started(10, { reducedMotion: true })
    expect(rig.hud.texts('showBanner')).toHaveLength(1)
    expect(rig.hud.texts('showCall')).toContain('スタート！')
    wakeBoss(rig)
    let slow = false
    let shake = 0
    const watch = () => {
      const s = rig.director.timeScale
      slow ||= s > 0 && s < 1
      const o = rig.view.camera.offset()
      shake = Math.max(shake, Math.abs(o.x) + Math.abs(o.y), rig.view.camera.trauma)
      return false
    }
    rig.run(3, () => watch() || rig.director.current === null)
    expect(rig.hud.texts('showNameplate')).toHaveLength(1)
    const boss = rig.world.boss!
    emit(rig, { type: 'boss-phase', phase: 2, x: boss.x, y: boss.y })
    rig.run(1, watch)
    boss.hp = 1
    boss.invuln = 0
    rig.world.damageBoss(1)
    rig.run(5, () => watch() || (rig.director.current === null && rig.world.goalOpen))
    rig.world.player.invuln = 0
    rig.world.hurtPlayer(99, 0)
    rig.run(4, () => watch() || rig.director.outcome !== null)
    expect(rig.director.outcome).toBe('dead')
    expect(slow).toBe(false)
    expect(shake).toBe(0)
    expect(rig.view.overlay.flashes).toBe(0)
  })
})

describe('sound', () => {
  it('every cue staging uses is a known sound cue', () => {
    const used = new Set<SoundCue>()
    for (const no of [1, 5, 10]) {
      const rig = started(no)
      if (rig.world.boss && !rig.world.boss.active) {
        wakeBoss(rig)
        rig.run(3, () => rig.director.current === null)
        rig.world.boss.hp = 1
        rig.world.boss.invuln = 0
        rig.world.damageBoss(1)
        rig.run(6, () => rig.director.current === null)
      }
      rig.world.player.invuln = 0
      rig.world.hurtPlayer(99, 0)
      rig.run(4, () => rig.director.outcome !== null)
      for (const cue of rig.cues) used.add(cue)
    }
    for (const cue of used) expect(SOUND_CUES).toContain(cue)
    expect(used.size).toBeGreaterThan(6)
  })
})

describe("the boss's entrance waits for the hero to stand, and poses him standing", () => {
  /** Puts the hero just across the arena line, `above` px over the boss's floor, moving at `vx`. */
  const crossLine = (rig: Rig, above = 0, vx = 0) => {
    const boss = rig.world.boss!
    const p = rig.world.player
    p.x = boss.arenaX + 4
    p.y = boss.y + boss.h - p.h - above
    p.vx = vx
    p.vy = 0
    p.invuln = 999
  }
  const begun = (rig: Rig) => rig.run(0.5, () => rig.director.current === 'boss-intro')

  it('waits for a hero in the air and begins on the frame he lands', () => {
    const rig = started(5)
    const { world, view, director } = rig
    const p = world.player
    crossLine(rig, TILE)
    let frames = 0
    let landedAt = -1
    let begunAt = -1
    while (begunAt < 0 && frames < 120) {
      rig.frame()
      frames++
      if (landedAt < 0 && p.onGround) landedAt = frames
      if (director.current === 'boss-intro') begunAt = frames
      else {
        expect(world.boss!.active).toBe(true)
        expect(view.actors.posing('hero')).toBeNull()
      }
    }
    expect(world.boss!.onGround).toBe(true)
    // He was in the air for a while (the simulation ran meanwhile), and the moment began the frame he landed.
    expect(landedAt).toBeGreaterThan(5)
    expect(begunAt).toBe(landedAt)
    expect(view.actors.posing('hero')).toBe('idle')
  })

  it('the squash of his landing settles while the moment holds the simulation', () => {
    const rig = started(5)
    const { view, director } = rig
    crossLine(rig, TILE)
    for (let n = 0; director.current !== 'boss-intro' && n < 120; n++) rig.frame()
    expect(director.current).toBe('boss-intro')
    const squash = () => (view.actors as unknown as { squash: number }).squash
    // He has just landed: flattened. The pose is drawn with it, on real time, so it eases out although no step runs.
    expect(squash()).toBeLessThan(-0.05)
    rig.run(0.5)
    expect(director.current).toBe('boss-intro')
    expect(squash()).toBe(0)
  })

  it('begins after LAND_WAIT_SECONDS when he never lands, and leaves him as he is', () => {
    const rig = started(5)
    const { world, view, director } = rig
    const p = world.player
    crossLine(rig, 3 * TILE)
    const high = p.y
    const t0 = world.time
    for (let n = 0; director.current !== 'boss-intro' && n < 200; n++) {
      // The script keeps him up there.
      p.y = high
      p.vy = 0
      rig.frame()
    }
    expect(director.current).toBe('boss-intro')
    expect(p.onGround).toBe(false)
    expect(world.time - t0).toBeGreaterThan(LAND_WAIT_SECONDS - 2 * STEP)
    expect(world.time - t0).toBeLessThan(LAND_WAIT_SECONDS + 2 * STEP)
    expect(view.actors.posing('hero')).toBeNull()
  })

  it('poses a hero who crossed at a run standing, from the first frame of the moment to its last, and not after', () => {
    const rig = started(5)
    const { world, view, director } = rig
    crossLine(rig, 0, 215)
    begun(rig)
    expect(director.current).toBe('boss-intro')
    // He was still running when it began: without the pose he would hang in a frame of his run.
    expect(Math.abs(world.player.vx)).toBeGreaterThan(RUN_THRESHOLD)
    let frames = 0
    while (director.current === 'boss-intro' && frames < 400) {
      expect(view.actors.posing('hero')).toBe('idle')
      expect(view.actors.selectHero()!.name).toBe('idle')
      rig.frame()
      frames++
    }
    expect(frames * STEP).toBeGreaterThan(BOSS_INTRO_SECONDS - 0.1)
    expect(view.actors.posing('hero')).toBeNull()
  })

  it('a skip ends the pose with the moment', () => {
    const rig = started(5)
    crossLine(rig)
    begun(rig)
    expect(rig.view.actors.posing('hero')).toBe('idle')
    rig.run(0.3)
    rig.input.press()
    rig.frame()
    expect(rig.director.current).toBeNull()
    expect(rig.view.actors.posing('hero')).toBeNull()
  })

  it('the entrance waits for a hero being knocked back: his hurt shows whole, then he stands for it', () => {
    const rig = started(5)
    const { world, view, director } = rig
    const p = world.player
    crossLine(rig)
    p.invuln = INVULN - 0.02
    view.update(0)
    expect(view.actors.selectHero()!.name).toBe('hurt')
    let frames = 0
    while (director.current !== 'boss-intro' && frames < 120) {
      rig.frame()
      frames++
    }
    expect(director.current).toBe('boss-intro')
    // It began once his knock-back was over (the hurt shows for its first 0.3 s of invulnerability).
    expect(INVULN - p.invuln).toBeGreaterThan(0.3 - 2 * STEP)
    expect(view.actors.posing('hero')).toBe('idle')
  })

  for (const what of ['bite'] as const)
    it(`a ${what} the pose covers does not come back after the moment`, () => {
      const rig = started(5)
      const { world, view, director } = rig
      const p = world.player
      crossLine(rig)
      // Under way as he crosses the line (the moment holds it, unfinished, until it ends).
      if (what === 'bite') p.biteTimer = BITE_TIME
      else p.invuln = INVULN - 0.02
      begun(rig)
      // (A bite under way plays out first, then he stands.)
      expect(view.actors.selectHero()!.name).toBe(what === 'bite' ? 'bite' : 'idle')
      rig.run(BOSS_INTRO_SECONDS + 0.5, () => director.current === null)
      expect(director.current).toBeNull()
      // Still due by the simulation's clock when the fight resumes, and never drawn again.
      expect(what === 'bite' ? p.biteTimer : INVULN - p.invuln < 0.3).toBeTruthy()
      for (let n = 0; n < 30; n++) {
        rig.frame()
        expect(view.actors.selectHero()!.name).not.toBe(what)
      }
    })

  /** Stage 10, the king awake and fighting, on the ground; the hero next to him. */
  const kingAwake = () => {
    const rig = started(10)
    wakeBoss(rig)
    rig.director.skip()
    rig.run(3, () => rig.world.boss!.onGround && rig.world.boss!.state === 'idle')
    expect(rig.world.boss!.onGround).toBe(true)
    return rig
  }
  const phase = (rig: Rig) => {
    const boss = rig.world.boss!
    emit(rig, { type: 'boss-phase', phase: 2, x: boss.x, y: boss.y })
    // (The step it came on is answered whole before a waiting moment is decided.)
    rig.director.simStep()
  }
  /** As `kingAwake`, then on until he is between his actions. */
  const kingAtRest = () => {
    const rig = kingAwake()
    atRest(rig)
    return rig
  }

  it('phase 2 waits for a hero in the air too, and begins once both stand on the ground', () => {
    const rig = kingAtRest()
    const { world, view, director } = rig
    const boss = world.boss!
    const p = world.player
    p.y -= TILE
    p.vy = 0
    p.onGround = false
    phase(rig)
    expect(director.current).toBeNull()
    let frames = 0
    while (director.current !== 'boss-phase' && frames < 120) {
      expect(view.actors.posing('hero')).toBeNull()
      rig.frame()
      frames++
    }
    expect(frames).toBeGreaterThan(5)
    // It began on the frame the last of the two stood.
    expect(p.onGround && boss.onGround).toBe(true)
    expect(view.actors.posing('hero')).toBe('idle')
    expect(view.actors.posing('boss')).toBe('rage')
  })

  it('phase 2 waits for a hero in the air only while the king rests: it begins as he winds up for his next attack, and leaves the hero as he is', () => {
    const rig = kingAwake()
    const { world, view, director } = rig
    const boss = world.boss!
    const p = world.player
    p.y -= 3 * TILE
    p.onGround = false
    const high = p.y
    const t0 = world.time
    phase(rig)
    const waitedIn: string[] = []
    for (let n = 0; director.current !== 'boss-phase' && n < 400; n++) {
      p.y = high
      p.vy = 0
      rig.frame()
      if (director.current !== 'boss-phase') waitedIn.push(boss.state)
    }
    expect(director.current).toBe('boss-phase')
    // The hero never came down. The king rested (the moment waited for the hero meanwhile), and it began in the
    // first moments of his wind-up: he did not go through another attack first.
    expect(waitedIn.length).toBeGreaterThan(5)
    for (const state of waitedIn) expect(['idle', 'recover', 'windup']).toContain(state)
    expect(boss.state).toBe('windup')
    expect(boss.stateTime).toBeLessThan(WINDUP_REST_SECONDS + 2 * STEP)
    expect(world.time - t0).toBeLessThan(LAND_WAIT_SECONDS)
    // (Between his actions: it began on the step he was.)
    expect(view.actors.bossBetweenActions()).toBe(true)
    expect(view.actors.posing('hero')).toBeNull()
  })

  /**
   * A moment begun with a bite of the hero's under way: the frames shown during it, until the moment ends, and
   * whether the simulation stood still all along.
   */
  const heldBite = (rig: Rig, name: string) => {
    const { world, view, director } = rig
    const shown: { name: string; frame: number }[] = []
    const t0 = world.time
    while (director.current === name && shown.length < 400) {
      const choice = view.actors.selectHero()!
      shown.push({ name: choice.name, frame: frameOf(HERO_SPEC[choice.name], choice) })
      rig.frame()
    }
    return { shown, held: world.time === t0 }
  }
  /** A bite's frames from `from` to its last, each shown and in order, on its own time, then only `idle`. */
  const playsOutThenStands = (shown: { name: string; frame: number }[], from: number) => {
    const bite = shown.filter((s) => s.name === 'bite')
    const last = HERO_SPEC.bite.frames - 1
    expect([...new Set(bite.map((s) => s.frame))]).toEqual(Array.from({ length: last - from + 1 }, (_, i) => from + i))
    for (let i = 1; i < bite.length; i++) expect(bite[i].frame).toBeGreaterThanOrEqual(bite[i - 1].frame)
    // On real time at the clip's own speed (the hold does not stop it): about its remaining length.
    const remaining = specDuration(HERO_SPEC.bite) - frameStart(HERO_SPEC.bite, from)
    expect(bite.length * STEP).toBeGreaterThan(remaining - 3 * STEP)
    expect(bite.length * STEP).toBeLessThan(remaining + 3 * STEP)
    // The bite first, then he stands.
    expect(shown.slice(0, bite.length)).toEqual(bite)
    for (const s of shown.slice(bite.length)) expect(s.name).toBe('idle')
    expect(shown.length).toBeGreaterThan(bite.length + 10)
  }

  it('phase 2 begun in the middle of a bite: the bite plays out on real time during the hold, then he stands', () => {
    const rig = kingAtRest()
    const { world, view } = rig
    const p = world.player
    // The bite that hit him, a few frames in (sim.ts: its timer runs down from BITE_TIME).
    p.biteTimer = BITE_TIME - 0.05
    rig.view.update(0)
    const from = frameOf(HERO_SPEC.bite, view.actors.selectHero()!)
    expect(view.actors.selectHero()!.name).toBe('bite')
    phase(rig)
    const { shown, held } = heldBite(rig, 'boss-phase')
    expect(held).toBe(true)
    playsOutThenStands(shown, from)
    // Nothing of it after the moment, though the simulation's bite is still due.
    expect(p.biteTimer).toBeGreaterThan(0)
    for (let n = 0; n < 30; n++) {
      rig.frame()
      expect(view.actors.selectHero()!.name).not.toBe('bite')
    }
  })

  it('the entrance begun in the middle of a bite: the same', () => {
    const rig = started(5)
    const { world, view } = rig
    const boss = world.boss!
    const p = world.player
    p.x = boss.arenaX - p.w - 2
    p.y = boss.y + boss.h - p.h
    p.invuln = 999
    rig.run(0.3)
    // Crossing the line with a bite under way.
    p.x = boss.arenaX + 4
    p.biteTimer = BITE_TIME
    rig.frame()
    expect(rig.director.current).toBe('boss-intro')
    const from = frameOf(HERO_SPEC.bite, view.actors.selectHero()!)
    const { shown, held } = heldBite(rig, 'boss-intro')
    expect(held).toBe(true)
    playsOutThenStands(shown, from)
    for (let n = 0; n < 30; n++) {
      rig.frame()
      expect(view.actors.selectHero()!.name).not.toBe('bite')
    }
  })

  it('a hold taken on a step shows the bite where the step left it: a slow display passes over no frame of it', () => {
    const rig = started(5)
    const { world, view } = rig
    const boss = world.boss!
    const p = world.player
    // A display that shows two steps a frame (a frame of the bite lasts 42 ms, a display frame 33 ms).
    const SLOW = 1 / 30
    p.x = boss.arenaX - p.w - 2
    p.y = boss.y + boss.h - p.h
    p.invuln = 999
    for (let t = 0; t < 0.3; t += SLOW) rig.frame(SLOW)
    // Crossing the line with a bite just begun: the entrance's hold is taken on one of this frame's two steps.
    p.x = boss.arenaX + 4
    p.biteTimer = BITE_TIME
    rig.frame(SLOW)
    expect(rig.director.current).toBe('boss-intro')
    const frames: number[] = []
    while (rig.director.current === 'boss-intro' && frames.length < 200) {
      const choice = view.actors.selectHero()!
      if (choice.name !== 'bite') break
      frames.push(frameOf(HERO_SPEC.bite, choice))
      rig.frame(SLOW)
    }
    // The frame that first shows the pose shows the bite as the step left it (its first frame: no more than two steps
    // old), not a display frame further on; then every frame of it in turn, to its last.
    expect(frames[0]).toBe(0)
    for (let i = 1; i < frames.length; i++) expect(frames[i] - frames[i - 1]).toBeLessThanOrEqual(1)
    expect(frames.at(-1)).toBe(HERO_SPEC.bite.frames - 1)
  })
})

describe('a boss is posed only on the ground, and only while the fight is held', () => {
  /** Runs `seconds`, checking every frame that a staged boss pose up before and after it held the simulation. */
  const watch = (rig: Rig, seconds: number, each?: () => void) => {
    for (let t = 0; t < seconds; t += STEP) {
      const before = rig.view.actors.posing('boss')
      const time = rig.world.time
      rig.frame()
      if (before && rig.view.actors.posing('boss')) expect(rig.world.time, `${before} at ${t.toFixed(2)} s`).toBe(time)
      each?.()
    }
  }

  it("stage 6: the bear, put down above the nest's floor, roars only once he has landed", () => {
    const rig = started(6)
    const { world } = rig
    for (const prop of [...world.props])
      if ((prop.kind === 'twig' || prop.kind === 'berry') && prop.state === 'idle') world.collect(prop)
    for (const event of world.events.splice(0)) emit(rig, event)
    const boss = world.boss!
    expect(boss.onGround).toBe(false)
    const clips = new Set<string>()
    watch(rig, 5, () => {
      if (rig.view.actors.posing('boss')) expect(boss.onGround).toBe(true)
      else if (!boss.onGround) clips.add(rig.view.actors.selectBoss(boss).name)
    })
    expect(rig.director.log).toContain('boss-intro')
    // Falling, he shows his leap's fall (never a planted pose).
    expect([...clips]).toEqual(['air'])
  })

  it('stage 10: half health in his leap: the transformation is staged once he has landed, whole, on his plain sheet till then', () => {
    const rig = started(10)
    wakeBoss(rig)
    rig.director.skip()
    const { world } = rig
    const boss = world.boss!
    rig.run(15, () => boss.state === 'slam' && !boss.onGround && boss.vy < 0)
    expect(boss.state).toBe('slam')
    emit(rig, { type: 'boss-phase', phase: 2, x: boss.x, y: boss.y })
    let waited = 0
    const lands: number[] = []
    while (rig.director.current !== 'boss-phase' && waited < 2) {
      expect(rig.view.actors.posing('boss')).toBeNull()
      expect(rig.view.actors.bossSheet(boss)).toBe('king')
      const choice = rig.view.actors.selectBoss(boss)
      expect(choice.name).not.toBe('rage')
      if (choice.name === 'land') lands.push(frameOf(bossSpec('king').land, choice))
      rig.frame()
      waited += STEP
    }
    // He lands with his whole landing (its frames in order, to the last), and then roars.
    expect(waited).toBeGreaterThan(0.1)
    expect(waited).toBeLessThan(LAND_WAIT_SECONDS)
    expect(lands.length).toBeGreaterThan(0)
    for (let i = 1; i < lands.length; i++) expect(lands[i]).toBeGreaterThanOrEqual(lands[i - 1])
    expect(lands.at(-1)).toBe(bossSpec('king').land.frames - 1)
    expect(rig.view.actors.posing('boss')).toBe('rage')
    watch(rig, 2.5)
    expect(rig.view.actors.bossSheet(boss)).toBe('king:raged')
  })

  for (const no of [2, 5, 8, 10])
    it(`stage ${no}: no staged boss pose is drawn on a step the simulation runs (the intro, phase 2)`, () => {
      const rig = started(no)
      const boss = rig.world.boss!
      rig.world.player.x = boss.arenaX + 4
      rig.world.player.y = boss.y + boss.h - rig.world.player.h
      rig.world.player.invuln = 999
      watch(rig, 4)
      expect(rig.director.log).toContain('boss-intro')
      if (no === 10) {
        emit(rig, { type: 'boss-phase', phase: 2, x: boss.x, y: boss.y })
        watch(rig, 3)
        expect(rig.director.log).toContain('boss-phase')
      }
    })
})

describe('ハム姫 waits standing for her moment, and cheers with it', () => {
  const SPECS = allSheetSpecs()
  /** A stage's caged ハム姫 with the hero standing two tiles to her left (the stage's enemies gone). */
  const nextToCage = (no: number) => {
    const rig = started(no)
    const { world } = rig
    for (const enemy of world.enemies) enemy.dead = true
    const cage = world.props.find((p) => p.kind === 'princess' && p.data === 1)!
    const p = world.player
    p.x = cage.x - 2 * TILE
    p.y = groundBelow(world, p.x + p.w / 2, cage.y, world.h)! - p.h
    p.vx = 0
    p.vy = 0
    p.facing = 1
    p.invuln = 999
    // His crossing wakes the boss: let the entrance play.
    rig.run(LAND_WAIT_SECONDS + 0.5, () => rig.director.current === 'boss-intro')
    rig.run(BOSS_INTRO_SECONDS + 0.5, () => rig.director.current === null)
    rig.run(0.3)
    return { rig, cage }
  }
  const her = (rig: Rig, cage: Prop) => {
    const choice = rig.view.props.selectPrincess(cage)
    return { name: choice.name, frame: frameOf(SPECS.princess[choice.name], choice) }
  }

  for (const no of [3, 10])
    it(`stage ${no}: freed by the boss's fall, she stands until her moment, then cheers from frame 0 on real time`, () => {
      const { rig, cage } = nextToCage(no)
      const { world, director, view } = rig
      const boss = world.boss!
      boss.hp = 1
      boss.invuln = 0
      world.damageBoss(1)
      let begun = -1
      const during: number[] = []
      const hero: number[] = []
      for (let n = 0; n < 600 && !(begun >= 0 && director.current !== 'princess-free'); n++) {
        rig.frame()
        const now = her(rig, cage)
        if (director.current === 'princess-free') {
          if (begun < 0) {
            begun = n
            // The first frame of her moment is the first frame of her cheer.
            expect(now).toEqual({ name: 'cheer', frame: 0 })
          }
          expect(now.name).toBe('cheer')
          during.push(now.frame)
          const pose = view.actors.selectHero()!
          if (pose.name === 'cheer') hero.push(frameOf(HERO_SPEC.cheer, pose))
        } else if (begun < 0) expect(now.name, `${director.current} at frame ${n}`).not.toBe('cheer')
      }
      expect(begun).toBeGreaterThan(0)
      expect(director.log).toEqual(expect.arrayContaining(['boss-defeat', 'goal-reveal', 'princess-free']))
      // Her cheer runs on while the moment slows the play down (its frames advance in order) ...
      expect(new Set(during).size).toBeGreaterThan(4)
      for (let i = 1; i < during.length; i++) expect(during[i]).toBeGreaterThanOrEqual(during[i - 1])
      // ... and the hero's cheer plays whole, its last frame included.
      expect(hero[0]).toBe(0)
      expect(hero).toContain(HERO_SPEC.cheer.frames - 1)
      // After it, she goes on cheering for the rest of her two seconds, then waves at the open exit.
      rig.run(2.5)
      expect(her(rig, cage).name).toBe('wave')
    })

  it('stage 3: the goal reveal skipped, her moment still plays (she is in the view the camera settles to)', () => {
    const { rig, cage } = nextToCage(3)
    const { world, director, input } = rig
    const boss = world.boss!
    boss.hp = 1
    boss.invuln = 0
    world.damageBoss(1)
    rig.run(6, () => director.current === 'goal-reveal')
    expect(director.current).toBe('goal-reveal')
    rig.run(0.2)
    input.press()
    rig.frame()
    rig.run(1, () => director.current === 'princess-free')
    expect(director.log).toContain('princess-free')
    expect(her(rig, cage).name).toBe('cheer')
  })

  it('stage 3: the hero cheers turned to her, whichever way he faced', () => {
    const { rig, cage } = nextToCage(3)
    const { world, director, view } = rig
    // He stands left of her cage, facing away from it.
    world.player.facing = -1
    rig.run(0.1)
    world.biteProp(cage, -1)
    rig.frame()
    expect(director.current).toBe('princess-free')
    let posed = 0
    while (director.current === 'princess-free' && posed < 200) {
      if (view.actors.posing('hero') === 'cheer') {
        posed++
        expect(view.actors.heroFlip()).toBe(false)
      }
      rig.frame()
    }
    expect(posed).toBeGreaterThan(10)
  })

  it('freed out of view: no moment, and she does not wait for one', () => {
    const rig = started(10)
    const { world, director } = rig
    const cage = world.props.find((p) => p.kind === 'princess' && p.data === 1)!
    world.goalOpen = true
    cage.data = 0
    emit(rig, { type: 'princess-free', x: cage.x + TILE / 2, y: cage.y + TILE / 2 })
    rig.frame()
    expect(director.log).not.toContain('princess-free')
    // What she shows after a cheer: the open exit, so she waves.
    expect(her(rig, cage).name).toBe('wave')
  })

  for (const no of [4, 8])
    it(`stage ${no}: freed by a bite at her cage, her moment begins at once`, () => {
      const { rig, cage } = nextToCage(no)
      expect(rig.director.current).toBeNull()
      rig.world.biteProp(cage, 1)
      rig.frame()
      expect(rig.director.current).toBe('princess-free')
      expect(her(rig, cage)).toEqual({ name: 'cheer', frame: 0 })
    })

  it('without a director she cheers at the event, on real time', () => {
    const rig = started(10)
    const cage = rig.world.props.find((p) => p.kind === 'princess' && p.data === 1)!
    cage.data = 0
    // The props view alone (the director never hears of it).
    rig.view.props.handle({ type: 'princess-free', x: cage.x + TILE / 2, y: cage.y + TILE / 2 })
    expect(her(rig, cage)).toEqual({ name: 'cheer', frame: 0 })
    // Real time moves it on even while the play is held.
    rig.view.update(0.3, 0)
    expect(her(rig, cage).name).toBe('cheer')
    expect(her(rig, cage).frame).toBeGreaterThan(0)
  })
})

describe("the king's phase change cuts nothing, and his transformation waits for him to be between actions", () => {
  const SPECS = allSheetSpecs()
  const TIMED = ['windup', 'recover', 'stunned', 'land', 'tired']
  type King = NonNullable<Rig['world']['boss']>
  /** The states the king can be in when the phase event comes (and his state before, where it matters). */
  const CASES: [string, (b: King, prev: string | null) => boolean][] = [
    ['idle', (b) => b.state === 'idle' && b.stateTime > 0.2],
    ['his wind-up', (b) => b.state === 'windup' && b.stateTime > 0.15],
    ['his charge', (b) => b.state === 'charge' && b.stateTime > 0.2],
    ['his cast, gathering', (b) => b.state === 'shoot' && b.stateTime > 0.25],
    ['his leap, in the air', (b) => b.state === 'slam' && !b.onGround && b.stateTime > 0.2],
    ['his recovery after a charge', (b, prev) => b.state === 'recover' && prev === 'charge' && b.stateTime > 0.1],
    ['his landing', (b, prev) => b.state === 'recover' && prev === 'slam' && b.stateTime > 0.05 && b.stateTime < 0.15],
    ['his recovery after a landing', (b, prev) => b.state === 'recover' && prev === 'slam' && b.stateTime > 0.4],
    ['the follow-through of his volley', (b, prev) => b.state === 'recover' && prev === 'shoot' && b.stateTime < 0.12],
    ['his recovery after his volley', (b, prev) => b.state === 'recover' && prev === 'shoot' && b.stateTime > 0.4]
  ]

  for (const [what, when] of CASES)
    for (const wait of [false, true])
      it(`the phase comes in ${what}${wait ? ', the hero in the air (the moment waits for him)' : ''}`, () => {
        const rig = started(10)
        wakeBoss(rig)
        rig.director.skip()
        const { world, view, director } = rig
        const boss = world.boss!
        const p = world.player
        let prev: string | null = null
        let last = boss.state as string
        let reached = false
        for (let n = 0; n < 60 * 60 && !reached; n++) {
          p.hp = p.maxHp
          p.invuln = 999
          rig.frame()
          if (boss.state !== last) {
            prev = last
            last = boss.state
          }
          reached = when(boss, prev)
        }
        expect(reached, `the king came to ${what}`).toBe(true)
        // The events the view answers from here on.
        const events: string[] = []
        const handle = view.handle.bind(view)
        view.handle = (event) => {
          events.push(event.type)
          handle(event)
        }
        boss.hp = Math.floor(boss.maxHp / 2)
        if (wait) {
          p.y -= 2 * TILE
          p.vy = 0
          p.onGround = false
        }
        const rows: {
          clip: string
          frame: number
          posed: boolean
          shot: boolean
          touched: boolean
          state: string
          ground: boolean
          sheet: string
        }[] = []
        let touched = false
        let grounded = boss.onGround
        let shots = 0
        let began = false
        let after = 0
        for (let n = 0; n < 60 * 8 && after < 40; n++) {
          p.hp = p.maxHp
          p.invuln = 999
          rig.frame()
          if (boss.dead) break
          if (boss.onGround && !grounded && events.includes('boss-phase')) touched = true
          grounded = boss.onGround
          shots = events.filter((e) => e === 'boss-shoot').length
          const posed = view.actors.posing('boss') === 'rage'
          began ||= posed
          if (began && !posed) after++
          const choice = view.actors.selectBoss(boss)
          const spec = SPECS[view.actors.bossSheet(boss)][choice.name]
          rows.push({
            clip: choice.name,
            frame: frameOf(spec, choice),
            posed,
            shot: shots > 0,
            touched,
            state: boss.state,
            ground: boss.onGround,
            sheet: view.actors.bossSheet(boss)
          })
        }
        expect(director.log).toContain('boss-phase')
        const hit = SPECS.king.shoot.hit!
        // (The first frame recorded is the one the phase event came on.)
        const unposed = rows.slice(
          0,
          rows.findIndex((row) => row.posed)
        )
        // A landing or a follow-through showing when the phase came plays on through it, its frames in order: the
        // step is invisible. One that begins later comes from a touchdown or a volley.
        const carried = (i: number) => {
          let k = i
          while (k > 0 && unposed[k - 1].clip === unposed[i].clip) k--
          return k === 0
        }
        unposed.forEach((row, i) => {
          if (i > 0 && unposed[i - 1].clip === row.clip && (row.clip === 'land' || row.clip === 'shoot'))
            expect(row.frame, `${row.clip} at ${i}`).toBeGreaterThanOrEqual(unposed[i - 1].frame)
          if (row.clip === 'land') expect(row.touched || carried(i), `land at ${i}`).toBe(true)
          if (row.clip === 'shoot' && row.frame >= hit) expect(row.shot || carried(i), `release at ${i}`).toBe(true)
        })
        // The transformation begins between his actions: not in a leap, a landing, a gathering, a follow-through or
        // a flinch.
        const before = unposed.at(-1)
        if (before) {
          // (Shown last on the frame before: an action shows its last frame.)
          if (['land', 'shoot', 'hurt'].includes(before.clip))
            expect(before.frame, before.clip).toBe(SPECS[before.sheet][before.clip].frames - 1)
          expect(before.clip).not.toBe('air')
          expect(['slam', 'shoot']).not.toContain(before.state)
          expect(before.ground).toBe(true)
        }
        // After the moment: what shows begins (a state-timed clip or a gathering on its first frame).
        const end = rows.findIndex((row, i) => i > 0 && rows[i - 1].posed && !row.posed)
        expect(end).toBeGreaterThan(0)
        const first = rows[end]
        if (TIMED.includes(first.clip) || first.clip === 'shoot')
          expect(first.frame, `${first.clip} after the moment`).toBe(0)
      })
})

describe('round 6f: a waiting moment is decided on the step, once all of it has been answered', () => {
  it('the phase event alone does not begin the transformation; the step it came on does, after its other events', () => {
    const rig = started(10)
    wakeBoss(rig)
    rig.director.skip()
    atRest(rig)
    const boss = rig.world.boss!
    emit(rig, { type: 'boss-phase', phase: 2, x: boss.x, y: boss.y })
    // (In the middle of the step's events: a contact hurt of the hero's may still follow.)
    expect(rig.director.current).toBeNull()
    rig.director.simStep()
    expect(rig.director.current).toBe('boss-phase')
  })

  it("the hero's cap runs from the phase step: after it the moment begins on the first step the king is ready, the hero hanging", () => {
    const rig = started(10)
    wakeBoss(rig)
    rig.director.skip()
    const { world, view, director } = rig
    const boss = world.boss!
    const p = world.player
    const hang = (high: number) => {
      p.y = high
      p.vy = 0
      p.hp = p.maxHp
      p.invuln = 999
    }
    // The phase comes in the middle of a wind-up (past its first moments): he goes through that whole attack, which
    // outlasts the hero's cap.
    const ground = p.y
    rig.run(15, () => {
      hang(ground)
      return boss.state === 'windup' && boss.stateTime > WINDUP_REST_SECONDS + 3 * STEP
    })
    expect(boss.state).toBe('windup')
    p.y -= 3 * TILE
    p.onGround = false
    const high = p.y
    emit(rig, { type: 'boss-phase', phase: 2, x: boss.x, y: boss.y })
    let all = 0
    const waitedIn = new Set<string>()
    for (let n = 0; director.current !== 'boss-phase' && n < 400; n++) {
      hang(high)
      rig.frame()
      if (director.current === 'boss-phase') break
      waitedIn.add(boss.state)
      all += STEP
    }
    expect(director.current).toBe('boss-phase')
    // (He attacked: his side of the wait is not negotiable.)
    expect([...waitedIn].some((state) => ['charge', 'slam', 'shoot'].includes(state))).toBe(true)
    expect(all).toBeLessThanOrEqual(BETWEEN_WAIT_SECONDS + 3 * STEP)
    // After the hero's cap the first step the king is between his actions is enough (before it, in the air, only a
    // new wind-up of his is).
    // (Here his attack ends before the cap does: he rests, the hero still in the air, and the cap ends the wait.)
    expect(all).toBeGreaterThanOrEqual(LAND_WAIT_SECONDS - 3 * STEP)
    expect(boss.state).toBe('recover')
    expect(view.actors.bossBetweenActions()).toBe(true)
    // (He hangs: no standing pose in the air.)
    expect(view.actors.posing('hero')).toBeNull()
  })
})

describe('round 6g: every moment that holds the simulation stands the hero on the ground', () => {
  it('a hurt under way plays out on real time, then he stands, while a moment holds the simulation', () => {
    const rig = started(5)
    wakeBoss(rig)
    rig.director.skip()
    const { world, view, director } = rig
    const p = world.player
    p.invuln = INVULN - 0.02
    rig.frame()
    expect(view.actors.selectHero()!.name).toBe('hurt')
    emit(rig, { type: 'goal-open', x: p.x + 200, y: p.y } as never)
    rig.frame()
    if (director.timeScale !== 0) return
    const shown: string[] = []
    for (let n = 0; n < 60 && director.timeScale === 0; n++) {
      shown.push(view.actors.selectHero()!.name)
      rig.frame()
    }
    // The hurt first, then he stands; the simulation's clock never moved.
    expect(shown[0]).toBe('hurt')
    expect(shown.at(-1)).toBe('idle')
    expect(shown.indexOf('idle')).toBeGreaterThan(0)
    expect(shown.slice(shown.indexOf('idle')).every((x) => x === 'idle')).toBe(true)
  })
})

describe("round 6p: the hold's pose for the hero is taken once the step's events are all answered", () => {
  it('a bite on the step a hold begins (its event after the one that begins the hold) plays out under it, facing the side it bit', () => {
    const rig = started(5)
    wakeBoss(rig)
    rig.director.skip()
    const { world, view, director } = rig
    const p = world.player
    p.invuln = 0
    p.facing = 1
    for (let i = 0; i < 30; i++) rig.frame()
    expect(view.actors.heroFlip()).toBe(false)
    // One step: the bite to the left opens the goal; \`doBite\` sends \`goal-open\` before its own \`bite\`.
    p.facing = -1
    p.biteTimer = BITE_TIME
    emit(rig, { type: 'goal-open', x: p.x + 200, y: p.y } as never)
    emit(rig, { type: 'bite', x: p.x, y: p.y, dir: -1, hit: true } as never)
    view.simStep()
    director.simStep()
    expect(director.timeScale).toBe(0)
    expect(view.actors.posing('hero')).toBe('bite')
    expect(view.actors.heroFlip()).toBe(true)
  })
})
