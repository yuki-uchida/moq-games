import { describe, expect, it } from 'vitest'
import { AFTER_A_FALL, PlaySession, STEP } from '../src/app/play'
import type { SimEvent } from '../src/game/events'
import type { Input } from '../src/game/input'
import { STAGES } from '../src/game/stages'
import type { Hud } from '../src/ui/hud'
import type { Director } from '../src/view/director'
import type { Renderer } from '../src/view/renderer'
import { SILENT_AUDIO } from '../src/view/sound-map'

/**
 * A session of a boss's stage whose view and director write down the frame in which each event reached them. The
 * bot stands still (the director locks the input), so that nothing but the test makes events.
 */
function bossSession(no = 2) {
  const answered: { frame: number; to: 'view' | 'director'; type: string }[] = []
  let frame = 0
  const director: Director = {
    start() {},
    handle: (event) => void answered.push({ frame, to: 'director', type: event.type }),
    update() {},
    timeScale: 1,
    inputLocked: true,
    outcome: null
  }
  const session = new PlaySession(
    STAGES[no - 1],
    {
      renderer: { k: 1 } as unknown as Renderer,
      hud: {} as unknown as Hud,
      audio: SILENT_AUDIO,
      input: {} as unknown as Input,
      reducedMotion: false
    },
    { demo: true, makeDirector: () => director }
  )
  const view = session.view
  const handle = view.handle.bind(view)
  view.handle = (event: SimEvent) => {
    answered.push({ frame, to: 'view', type: event.type })
    handle(event)
  }
  view.draw = () => {}
  const { world } = session
  return {
    session,
    world,
    answered,
    /** One display frame at 60 Hz. */
    frame() {
      frame += 1
      session.frame(STEP)
      return frame
    },
    /** The hero walks into the arena: the simulation wakes the boss and raises his gate. */
    wake() {
      const boss = world.boss!
      world.player.x = boss.x - 220
      world.player.y = boss.y + boss.h - world.player.h
      for (let i = 0; i < 600 && !(boss.active && world.bossGate); i++) {
        world.player.hp = world.player.maxHp
        session.frame(STEP)
      }
      if (!boss.active || !world.bossGate) throw new Error('the boss did not wake')
      answered.length = 0
    },
    /** The boss is felled inside the next step, as a bite fells him. */
    fell() {
      const step = world.step.bind(world)
      world.step = (dt, input) => {
        world.step = step
        world.player.hp = world.player.maxHp
        world.boss!.invuln = 0
        world.damageBoss(999)
        step(dt, input)
      }
    },
    of: (to: 'view' | 'director') => answered.filter((a) => a.to === to).map((a) => `${a.frame}:${a.type}`)
  }
}

describe('the frames of a boss fall', () => {
  it('answers the fall in its frame, and his gate and the goal in the two frames after it', () => {
    const s = bossSession()
    s.wake()
    // The hero is far from the goal: the stage goes on after the fall.
    s.world.player.x = Math.min(s.world.boss!.x - 60, s.world.goalX - 200)
    s.fell()
    const at = s.frame()
    const about = (a: { type: string }) => ['boss-hit', 'boss-down', 'gate-down', 'goal-open'].includes(a.type)
    // The frame of the fall: the hit and the fall, by the view first and then by the director, as ever.
    expect(s.answered.filter(about).map((a) => `${a.frame}:${a.to}:${a.type}`)).toEqual([
      `${at}:view:boss-hit`,
      `${at}:director:boss-hit`,
      `${at}:view:boss-down`,
      `${at}:director:boss-down`
    ])
    // The hit-stop of the fall is on: no step runs in the frames that answer the rest.
    expect(s.session.view.frozen).toBe(true)
    const time = s.world.time
    const fall = (to: 'view' | 'director') => s.of(to).filter((entry) => about({ type: entry.split(':')[1] }))
    s.frame()
    expect(fall('view')).toEqual([`${at}:boss-hit`, `${at}:boss-down`, `${at + 1}:gate-down`])
    s.frame()
    expect(fall('view')).toEqual([`${at}:boss-hit`, `${at}:boss-down`, `${at + 1}:gate-down`, `${at + 2}:goal-open`])
    expect(fall('director')).toEqual(fall('view'))
    expect(s.world.time).toBe(time)
    // Nothing is answered twice, and nothing is left over.
    for (let i = 0; i < 10; i++) s.frame()
    expect(s.answered.filter((a) => AFTER_A_FALL.has(a.type as SimEvent['type']))).toHaveLength(4)
    expect(s.world.goalOpen).toBe(true)
  })

  it('answers everything at once when the stage is cleared by the step of the fall', () => {
    const s = bossSession()
    s.wake()
    // On the goal: the fall opens it and the same step clears the stage.
    const goal = s.world.props.find((p) => p.kind === 'goal' || p.kind === 'nest')!
    s.world.player.x = goal.x + 8
    s.world.player.y = goal.y
    s.fell()
    const at = s.frame()
    expect(s.world.state).toBe('clear')
    const about = (entry: string) => /:(boss-hit|boss-down|gate-down|goal-open|clear)$/.test(entry)
    expect(s.of('view').filter(about)).toEqual([
      `${at}:boss-hit`,
      `${at}:boss-down`,
      `${at}:gate-down`,
      `${at}:goal-open`,
      `${at}:clear`
    ])
    expect(s.of('director')).toEqual(s.of('view'))
  })

  it('keeps the order when a step makes events while some still wait', () => {
    const s = bossSession()
    s.wake()
    s.world.player.x = Math.min(s.world.boss!.x - 60, s.world.goalX - 200)
    s.fell()
    const at = s.frame()
    // No hit-stop this time: the next frame steps the simulation, and that step makes an event of its own.
    s.session.view.freezeTime = 0
    const step = s.world.step.bind(s.world)
    s.world.step = (dt, input) => {
      s.world.step = step
      step(dt, input)
      s.world.events.push({ type: 'rock-crack', x: 0, y: 0 })
    }
    s.frame()
    const got = s.of('view').filter((entry) => /:(boss-hit|boss-down|gate-down|goal-open|rock-crack)$/.test(entry))
    expect(got).toEqual([
      `${at}:boss-hit`,
      `${at}:boss-down`,
      `${at + 1}:gate-down`,
      `${at + 1}:goal-open`,
      `${at + 1}:rock-crack`
    ])
  })

  it('answers a goal that opens without a fall in its own frame', () => {
    const collect = STAGES.find((stage) => stage.objective === 'collect')!
    const s = bossSession(collect.no)
    for (let i = 0; i < 10; i++) s.frame()
    const step = s.world.step.bind(s.world)
    s.world.step = (dt, input) => {
      s.world.step = step
      step(dt, input)
      s.world.events.push({ type: 'goal-open', x: 100, y: 100 })
    }
    const at = s.frame()
    expect(s.of('director')).toContain(`${at}:goal-open`)
  })
})
