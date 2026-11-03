import { beforeEach, describe, expect, it } from 'vitest'
import { Game } from '../src/game'
import { JuiceDetector } from '../src/juice'
import type { JuiceEvent } from '../src/juice-events'
import { floorAt } from '../src/map'

let game: Game
let detector: JuiceDetector
let clock = 0

const player = () => game.state.players[0]
/** Sets the hold-E job; `Player.task` is optional on hosts that predate it. */
const setTask = (task: { label: string; progress: number } | undefined) => Object.assign(player() as object, { task })
const types = (events: JuiceEvent[]) => events.map((event) => event.type)
const tick = (dt = 0.1) => {
  clock += dt
  game.state.time = clock
  return detector.update(game.state, 'local')
}
/** Moves the local rabbit to (x, z) standing `height` above the floor. */
const put = (x: number, z: number, height = 0) => {
  const p = player()
  p.x = x
  p.z = z
  p.y = floorAt(x, p.y, z) + height
}

beforeEach(() => {
  game = new Game()
  game.addPlayer('local', 'Rabbit')
  detector = new JuiceDetector()
  clock = 0
  player().hidden = false
  put(player().x, player().z)
  tick() // first snapshot announces nothing
})

describe('JuiceDetector', () => {
  it('returns nothing on the first call, for stale snapshots and when the local id changes', () => {
    const fresh = new JuiceDetector()
    expect(fresh.update(game.state, 'local')).toEqual([])
    player().hidden = true
    game.state.time = clock + 1
    expect(types(fresh.update(game.state, 'local'))).toEqual(['hide'])
    player().hidden = false
    game.state.time = clock - 5
    expect(fresh.update(game.state, 'local')).toEqual([])
    game.addPlayer('other', 'Other')
    expect(fresh.update({ ...game.state, time: clock + 2 }, 'other')).toEqual([])
    fresh.reset()
    expect(fresh.update(game.state, 'local')).toEqual([])
  })

  it('reports a jump and a landing scaled by the height reached', () => {
    const { x, z } = player()
    put(x, z, 0.3)
    expect(types(tick())).toEqual(['jump'])
    put(x, z, 1.5)
    expect(tick()).toEqual([])
    put(x, z, 0)
    const [land] = tick()
    expect(land).toMatchObject({ type: 'land' })
    expect((land as Extract<JuiceEvent, { type: 'land' }>).impact).toBeCloseTo(1, 1)
    put(x, z, 0.15)
    tick()
    put(x, z, 0)
    const [hop] = tick()
    expect((hop as Extract<JuiceEvent, { type: 'land' }>).impact).toBeCloseTo(0.1, 1)
  })

  it('emits one step per stretch walked, longer strides when sprinting, and ignores teleports', () => {
    const { x, z } = player()
    const steps: Extract<JuiceEvent, { type: 'step' }>[] = []
    const walk = (to: number) => {
      put(to, z)
      steps.push(...(tick().filter((e) => e.type === 'step') as typeof steps))
    }
    for (let i = 1; i <= 20; i++) walk(x + i * 0.1) // 1 m/s: 2 m
    expect(steps).toHaveLength(3)
    expect(steps.every((step) => step.crouch && !step.sprint)).toBe(true)
    steps.length = 0
    for (let i = 1; i <= 10; i++) walk(x + 2 + i * 0.6) // 6 m/s: 6 m
    expect(steps).toHaveLength(7)
    expect(steps.every((step) => step.sprint)).toBe(true)
    steps.length = 0
    walk(x + 30)
    expect(steps).toHaveLength(0)
  })

  it('does not step while standing still or airborne', () => {
    const { x, z } = player()
    for (let i = 0; i < 5; i++) expect(tick()).toEqual([])
    put(x + 0.4, z, 0.8)
    expect(types(tick())).toEqual(['jump'])
    put(x + 0.8, z, 0.9)
    expect(tick()).toEqual([])
  })

  it('counts an eating streak within 4 s and restarts it afterwards, naming the food', () => {
    const food = game.state.foods.find((entry) => entry.active)!
    put(food.x, food.z)
    tick()
    food.active = false
    player().foodEaten++
    expect(tick()).toEqual([expect.objectContaining({ type: 'eat', kind: food.kind, streak: 1 })])
    player().foodEaten++
    expect(tick(1)).toEqual([expect.objectContaining({ type: 'eat', streak: 2 })])
    player().foodEaten++
    expect(tick(3)).toEqual([expect.objectContaining({ type: 'eat', streak: 3 })])
    player().foodEaten++
    expect(tick(4.5)).toEqual([expect.objectContaining({ type: 'eat', streak: 1 })])
  })

  it('reports hide/unhide, pickup/drop, hurt, downed/revived, grown and pregnant', () => {
    player().hidden = true
    expect(types(tick())).toEqual(['hide'])
    player().hidden = false
    expect(types(tick())).toEqual(['unhide'])
    player().carrying = 'straw-1'
    expect(types(tick())).toEqual(['pickup'])
    player().carrying = null
    expect(types(tick())).toEqual(['drop'])
    player().health -= 1
    expect(tick()).toEqual([expect.objectContaining({ type: 'hurt', amount: 1 })])
    player().downed = true
    expect(types(tick())).toEqual(['downed'])
    player().downed = false
    expect(types(tick())).toEqual(['revived'])
    player().growth = 1
    expect(types(tick())).toEqual(['grown'])
    player().pregnant = true
    expect(types(tick())).toEqual(['pregnant'])
  })

  it('ticks every 10% of a task and finishes it once', () => {
    setTask({ label: 'かじる', progress: 0.02 })
    expect(tick()).toEqual([])
    const seen: number[] = []
    for (const progress of [0.08, 0.12, 0.15, 0.25, 0.31, 0.55]) {
      setTask({ label: 'かじる', progress })
      seen.push(...tick().flatMap((e) => (e.type === 'taskTick' ? [e.progress] : [])))
    }
    expect(seen).toEqual([0.12, 0.25, 0.31, 0.55])
    setTask({ label: 'かじる', progress: 0.95 })
    expect(types(tick())).toEqual(['taskTick'])
    setTask(undefined)
    expect(tick()).toEqual([]) // let go at 95%: not done
    setTask({ label: '掘る', progress: 0.5 })
    tick()
    setTask(undefined)
    expect(tick()).toEqual([]) // abandoned early: no fanfare
    setTask({ label: '回す', progress: 0.99 })
    tick()
    setTask({ label: '回す', progress: 1 })
    expect(types(tick())).toEqual(['taskDone'])
    setTask(undefined)
    expect(tick()).toEqual([])
  })

  it('flags a predator spotting you, then escaping when it gives up', () => {
    const [first, second] = game.state.predators
    Object.assign(first, { state: 'suspicious', targetId: 'local' })
    expect(types(tick())).toContain('suspicious')
    Object.assign(first, { state: 'chase', targetId: 'local' })
    expect(tick()).toEqual([
      expect.objectContaining({ type: 'spotted', you: true, at: expect.objectContaining({ x: first.x }) })
    ])
    Object.assign(second, { state: 'chase', targetId: 'friend' })
    expect(tick()).toEqual([expect.objectContaining({ type: 'spotted', you: false })])
    first.state = 'search'
    expect(types(tick())).toEqual(['escaped'])
    expect(tick()).toEqual([])
  })

  it('shows a suspicion cue when a predator switches its attention to you', () => {
    game.addPlayer('friend', 'Friend')
    const predator = game.state.predators[0]
    Object.assign(predator, { state: 'suspicious', targetId: 'friend' })
    expect(tick()).toEqual([])
    predator.targetId = 'local'
    expect(tick()).toEqual([
      expect.objectContaining({ type: 'suspicious', at: expect.objectContaining({ x: predator.x }) })
    ])
    expect(tick()).toEqual([])
    predator.targetId = 'friend'
    expect(tick()).toEqual([])
    predator.targetId = 'local'
    expect(types(tick())).toEqual(['suspicious'])
  })

  it('emits one local discovery per chase, including a predator retargeting while already chasing', () => {
    const [first, second] = game.state.predators
    Object.assign(first, { state: 'chase', targetId: 'friend' })
    expect(tick()).toEqual([expect.objectContaining({ type: 'spotted', you: false })])

    first.targetId = 'local'
    expect(tick()).toEqual([
      expect.objectContaining({ type: 'spotted', you: true, at: { x: first.x, y: first.y, z: first.z } })
    ])
    Object.assign(second, { state: 'chase', targetId: 'local' })
    expect(tick()).toEqual([])

    first.state = 'search'
    second.state = 'search'
    expect(types(tick())).toEqual(['escaped'])
    first.state = 'chase'
    second.state = 'chase'
    expect(tick()).toEqual([expect.objectContaining({ type: 'spotted', you: true })])
  })

  it('reports a newly observed pursuer without announcing an already active first snapshot', () => {
    const predator = { ...game.state.predators[0], id: 'new', state: 'chase' as const, targetId: 'local' }
    game.state.predators.push(predator)
    expect(tick()).toEqual([expect.objectContaining({ type: 'spotted', you: true })])
    expect(new JuiceDetector().update(game.state, 'local')).toEqual([])
  })

  it('does not call a lost game an escape', () => {
    Object.assign(game.state.predators[0], { state: 'chase', targetId: 'local' })
    tick()
    game.state.predators[0].state = 'patrol'
    game.state.phase = 'lost'
    expect(types(tick())).toEqual(['lost'])
  })

  it('reports objectives, chapters, bedding, kits, nests, talk and the end of the game', () => {
    Object.assign(game.state, { stage: 0, step: 0 })
    tick()
    game.state.step = 1
    expect(types(tick())).toEqual(['objective'])
    game.state.stage = 1
    game.state.step = 0
    expect(types(tick())).toEqual(['chapter'])
    game.state.bedding++
    expect(types(tick())).toEqual(['bedding'])
    game.state.kits = [{ id: 'k', x: 0, y: 0, z: 0, angle: 0, hidden: false, status: 'follow' }]
    tick()
    game.state.kits[0].status = 'safe'
    expect(types(tick())).toEqual(['kitSafe'])
    game.state.kits[0].status = 'lost'
    expect(types(tick())).toEqual(['kitLost'])
    const nest = game.state.nests[0]
    nest.active = false
    expect(tick()).toEqual([expect.objectContaining({ type: 'nestBroken', at: { x: nest.x, y: nest.y, z: nest.z } })])
    game.state.talk = { id: 'hello', at: clock }
    expect(types(tick())).toEqual(['talk'])
    expect(tick()).toEqual([])
    game.state.phase = 'won'
    expect(types(tick())).toEqual(['won'])
    expect(tick()).toEqual([])
  })
})
