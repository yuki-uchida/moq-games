import { describe, expect, it } from 'vitest'
import type { SimEvent } from '../src/game/events'
import type { Input } from '../src/game/input'
import { emptyInput, type InputState } from '../src/game/sim'
import { STAGES } from '../src/game/stages'
import type { Hud, HudApi } from '../src/ui/hud'
import { PlaySession, STEP } from '../src/app/play'
import { SOUND_CUES, type CueSink, type SoundCue } from '../src/view/cues'
import { StageDirector, type DirectorHost } from '../src/view/director'
import type { Renderer } from '../src/view/renderer'
import { Sequence, mergeClaims } from '../src/view/sequence'
import { SILENT_AUDIO } from '../src/view/sound-map'
import { BOSS_INTRO_SECONDS, CLEAR_SECONDS, DEATH_SECONDS } from '../src/view/staging'

// ------------------------------------------------------------------------------------------------- stubs

interface HudCall {
  name: keyof HudApi
  args: unknown[]
}

function stubHud() {
  const calls: HudCall[] = []
  let cinematic = false
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
    show() {},
    hide() {},
    setStage() {},
    update() {}
  }
  return {
    hud,
    calls,
    get cinematic() {
      return cinematic
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

/** Starts a stage and lets its opening finish. */
function started(no: number, options: { reducedMotion?: boolean } = {}) {
  const rig = setup(no, options)
  rig.session.start()
  rig.run(2, () => rig.director.current === null)
  return rig
}

/** Walks the hero across the arena line so the boss wakes. */
function wakeBoss(rig: Rig) {
  const { world } = rig
  const boss = world.boss!
  world.player.x = boss.arenaX + 4
  world.player.y = boss.y + boss.h - world.player.h
  world.player.vx = 0
  world.player.vy = 0
  world.player.invuln = 999
  rig.run(0.2, () => rig.director.current === 'boss-intro')
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

  it('phase 2 holds briefly with the rage clip', () => {
    const rig = started(10)
    wakeBoss(rig)
    rig.director.skip()
    const boss = rig.world.boss!
    emit(rig, { type: 'boss-phase', phase: 2, x: boss.x, y: boss.y })
    expect(rig.director.current).toBe('boss-phase')
    expect(rig.director.timeScale).toBe(0)
    expect(rig.view.actors.posing('boss')).toBe('rage')
    const took = rig.run(2, () => rig.director.current === null)
    expect(took).toBeLessThanOrEqual(0.7)
    expectReleased(rig)
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
    emit(rig, { type: 'boss-awake', x: boss.x, y: boss.y })
    expect(rig.director.current).toBe('boss-intro')
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
