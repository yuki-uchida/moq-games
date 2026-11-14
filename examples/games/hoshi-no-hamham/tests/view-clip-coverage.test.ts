/**
 * Every clip the characters are drawn with is shown in play, and every clip that plays over a window of time shows
 * all of its frames. The clip selectors are asked about a list of snapshots; staged poses are recorded from real
 * staging (a PlaySession with its director), and ghosts are read from an ActorsView after the events that make them.
 */
import { beforeAll, describe, expect, it } from 'vitest'
import {
  BOSS_ARTS,
  BOSS_KIND,
  ENEMY_KINDS,
  HERO_SPEC,
  MOM_SPEC,
  PRINCESS_SPEC,
  allSheetSpecs,
  bossSpec,
  type AnimSpec,
  KING_RAGED,
  type BossArt,
  type EnemyArt
} from '../src/art/contract'
import { frameAt, type Anim } from '../src/art/sheet'
import { PlaySession, STEP } from '../src/app/play'
import type { SimEvent } from '../src/game/events'
import type { Input } from '../src/game/input'
import { BITE_TIME, TILE, World, emptyInput, type BossState, type InputState } from '../src/game/sim'
import { botInput, type BotMemory } from './bot'
import { STAGES } from '../src/game/stages'
import type { BossKind } from '../src/game/types'
import type { Hud } from '../src/ui/hud'
import { ActorsView, BOSS_DEFEAT_TAIL } from '../src/view/actors'
import {
  FLINCH_MAX_SPEED,
  WAIT_AFTER,
  bossClip,
  bossSheetSpec,
  clipLife,
  enemyClip,
  heroClip,
  princessClip,
  specDuration,
  type BossSnapshot,
  type ClipChoice,
  type EnemySnapshot,
  type HeroSnapshot
} from '../src/view/clips'
import type { PoseTarget } from '../src/view/actors'
import type { Renderer } from '../src/view/renderer'
import { SILENT_AUDIO } from '../src/view/sound-map'

const SPECS = allSheetSpecs()
const SHEETS = ['hero', 'princess', 'mom', ...ENEMY_KINDS, ...BOSS_ARTS, KING_RAGED]
/** Boss sheets with the kind that fights with them (the chasing parent is drawn from `mom`). */
const BOSSES: [BossKind, string][] = [
  ['chaser', 'mom'],
  ...BOSS_ARTS.map((a) => [BOSS_KIND[a], a] as [BossKind, string])
]

/** A stand-in Anim with a contract clip's timing (frames, fps, loop, hold, sustain) and no pixels. */
const standIn = (spec: AnimSpec): Anim =>
  ({
    frames: Array.from({ length: spec.frames }, () => ({})),
    fps: spec.fps,
    loop: spec.loop,
    sustain: spec.sustain,
    hold: spec.hold && [...spec.hold]
  }) as unknown as Anim

const frameOf = (spec: AnimSpec, choice: ClipChoice) => choice.frame ?? frameAt(standIn(spec), choice.t)

/** Sample times over [from, to) (fine enough for 24 fps clips). */
function* times(from: number, to: number, step = 0.004) {
  for (let t = from; t < to; t += step) yield t
}

/**
 * Checks a sweep of frames: every frame index appears, and a clip with `sustain` comes back to each of its last
 * `sustain` frames after the first pass has reached its last frame.
 */
function expectWhole(label: string, spec: AnimSpec, frames: number[]) {
  const all = Array.from({ length: spec.frames }, (_, i) => i)
  expect(
    [...new Set(frames)].sort((a, b) => a - b),
    `${label}: every frame`
  ).toEqual(all)
  if (!spec.sustain) return
  // The tail begins when the first pass leaves its last frame.
  const last = spec.frames - 1
  let end = frames.indexOf(last)
  while (end < frames.length && frames[end] === last) end++
  const tail = frames.slice(end)
  for (let f = spec.frames - spec.sustain; f < spec.frames; f++)
    expect(tail, `${label}: the sustained frame ${f} comes back`).toContain(f)
}

/** Frames of a clip shown for every time in [0, seconds) (a staged pose or a ghost plays on its age). */
const framesOver = (spec: AnimSpec, seconds: number) => [...times(0, seconds)].map((t) => frameAt(standIn(spec), t))

// ------------------------------------------------------------------------------------------------- snapshots

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

const HERO_STATES: Partial<HeroSnapshot>[] = [
  {},
  { blinkAge: 0.05 },
  { idleTime: WAIT_AFTER + 0.1 },
  { vx: 215, distance: 100 },
  { turnAge: 0.01 },
  { vx: -180, skidAge: 0.05 },
  { landAge: 0.02, hardLanding: true },
  { onGround: false, vy: -500 },
  { onGround: false, vy: -50 },
  { onGround: false, vy: 50 },
  { onGround: false, vy: 500 },
  { inWater: true, onGround: false },
  { hurt: true },
  { biteAge: 0 },
  { cheering: true }
]

const enemy = (kind: EnemyArt, extra: Partial<EnemySnapshot> = {}): EnemySnapshot => ({
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

const ENEMY_STATES: Partial<EnemySnapshot>[] = [
  {},
  { vx: 70 },
  { onGround: false, vy: -300 },
  { landAge: 0.02 },
  { shootTimer: 0.1 },
  { shootTimer: -0.2 },
  { stillTime: 1 },
  { hitFlash: 0.1 }
]

const boss = (kind: BossKind, state: BossState, extra: Partial<BossSnapshot> = {}): BossSnapshot => ({
  kind,
  state,
  prevState: null,
  stateTime: 0.1,
  active: true,
  vx: 0,
  vy: 0,
  rageAge: null,
  hurtAge: null,
  onGround: false,
  shotTimer: 99,
  shotAge: null,
  summonAge: null,
  time: 0.4,
  ...extra
})

const BOSS_STATES: BossState[] = ['idle', 'windup', 'charge', 'recover', 'stunned', 'tired', 'shoot', 'dive', 'slam']
const BOSS_EXTRAS: Partial<BossSnapshot>[] = [
  {},
  { vx: 120 },
  { vy: -300 },
  { prevState: 'slam', stateTime: 0.02 },
  { prevState: 'shoot', stateTime: 0.02 },
  { hurtAge: 0.01 },
  { rageAge: 0.1 },
  { active: false },
  { shotTimer: 0.1 },
  { shotAge: 0.05 },
  { summonAge: 0.05 },
  { onGround: true }
]

// ------------------------------------------------------------------------------------------------- staging

function stubHud() {
  const noop = () => {}
  return new Proxy({ speak: () => false } as Record<string, unknown>, {
    get: (target, key) => (key in target ? target[key as string] : noop)
  })
}

/** A stage played by its director with the actors' poses recorded (clip and length, by sheet). */
function rig(no: number) {
  const input = {
    poll: () => emptyInput(),
    consumePresses() {}
  }
  const session = new PlaySession(STAGES[no - 1], {
    renderer: { k: 1 } as unknown as Renderer,
    hud: stubHud() as unknown as Hud,
    audio: SILENT_AUDIO,
    input: input as unknown as Input,
    reducedMotion: false
  })
  const poses: { sheet: string; clip: string; seconds: number }[] = []
  const actors = session.view.actors
  const pose = actors.pose.bind(actors)
  actors.pose = (who: PoseTarget, clip: string, seconds: number, options = {}) => {
    poses.push({ sheet: who === 'hero' ? 'hero' : STAGES[no - 1].boss.art, clip, seconds })
    pose(who, clip, seconds, options)
  }
  const run = (seconds: number, until?: () => boolean) => {
    for (let t = 0; t < seconds; t += STEP) {
      session.frame(STEP)
      if (until?.()) return
    }
  }
  const emit = (event: SimEvent) => {
    session.view.handle(event)
    session.director.handle(event)
  }
  session.start()
  run(2, () => session.director.current === null)
  return { session, world: session.world, poses, run, emit }
}

type Rig = ReturnType<typeof rig>

/** Walks the hero across the arena line, lets the boss intro play out. */
function wakeBoss(r: Rig) {
  // The nest stage summons its boss once the nest is complete.
  if (!r.world.boss) (r.world as unknown as { spawnBoss(): void }).spawnBoss()
  const boss = r.world.boss!
  r.world.player.x = boss.arenaX + 4
  r.world.player.y = boss.y + boss.h - r.world.player.h
  r.world.player.invuln = 999
  r.run(0.3, () => r.session.director.current === 'boss-intro')
  r.run(4, () => r.session.director.current === null)
}

/** Every staged pose of a stage: its opening (or chase), the boss intro, phase 2, ハム姫 freed and the clear. */
function stagedPoses() {
  const all: { sheet: string; clip: string; seconds: number }[] = []
  for (const stage of STAGES) {
    const r = rig(stage.no)
    if (stage.boss.kind !== 'chaser') wakeBoss(r)
    if (stage.boss.kind === 'final') {
      const boss = r.world.boss!
      r.emit({ type: 'boss-phase', phase: 2, x: boss.x, y: boss.y })
      r.run(3, () => r.session.director.current === null)
    }
    const p = r.world.player
    r.emit({ type: 'princess-free', x: p.x + p.w / 2, y: p.y + p.h / 2 })
    r.run(2, () => r.session.director.current === null)
    r.world.state = 'clear'
    r.emit({ type: 'clear', x: p.x, y: p.y })
    r.run(0.2)
    all.push(...r.poses)
  }
  return all
}

/** The ghosts an ActorsView makes: every enemy's and every boss's knock-out. */
function ghostClips() {
  const out: { sheet: string; clip: string; life: number }[] = []
  const body = { x: 100, y: 100, w: 60, h: 60, facing: 1, dead: false }
  const world = {
    player: { ...body, vx: 0, vy: 0, onGround: true, inWater: false, biteTimer: 0, invuln: 0 },
    enemies: [] as unknown[],
    boss: null as unknown,
    state: 'play',
    h: 20,
    solidAt: () => false,
    tileAt: () => 0
  }
  const fx = { rand: () => 0.5, spawn: () => {}, burst: () => {} }
  const view = new ActorsView(world as never, fx as never)
  const inside = view as unknown as { ghosts: typeof out }
  for (const kind of ENEMY_KINDS) {
    world.enemies = [{ ...body, id: 1, kind }]
    view.handle({ type: 'enemy-down', id: 1, kind, x: 0, y: 0, dir: 1 } as never)
  }
  for (const art of BOSS_ARTS) {
    world.boss = { ...body, def: { kind: BOSS_KIND[art], art } }
    view.handle({ type: 'boss-down', x: 0, y: 0 } as never)
  }
  out.push(...inside.ghosts)
  return out
}

/** The clip an ActorsView shows for the hero once he is knocked out. */
function heroKnockedOut() {
  const world = {
    player: { x: 100, y: 100, w: 42, h: 46, facing: 1, dead: true, vx: 0, vy: 0, onGround: true, invuln: 0 },
    enemies: [],
    boss: null,
    state: 'dead',
    h: 20,
    solidAt: () => false,
    tileAt: () => 0
  }
  const view = new ActorsView(world as never, { rand: () => 0.5, spawn: () => {}, burst: () => {} } as never)
  view.handle({ type: 'dead', x: 0, y: 0 } as never)
  return view.selectHero()!
}

// ------------------------------------------------------------------------------------------------- tests

describe('every clip of every character is shown somewhere', () => {
  const shown = new Map<string, Set<string>>(SHEETS.map((id) => [id, new Set<string>()]))
  const add = (sheet: string, clip: string) => shown.get(sheet)?.add(clip)
  const staged = stagedPoses()
  const ghosts = ghostClips()

  for (const state of HERO_STATES) add('hero', heroClip(hero(state)).name)
  for (const kind of ENEMY_KINDS) for (const state of ENEMY_STATES) add(kind, enemyClip(enemy(kind, state)).name)
  for (const [kind, art] of BOSSES)
    for (const state of BOSS_STATES)
      for (const extra of BOSS_EXTRAS) add(art, bossClip(boss(kind, state, extra), art).name)
  // After his transformation the king is drawn from his raged sheet (ActorsView.bossSheet): every clip the fight
  // selects then.
  for (const state of BOSS_STATES)
    for (const extra of BOSS_EXTRAS)
      add(KING_RAGED, bossClip(boss('final', state, { ...extra, rageAge: 9 }), 'king').name)
  for (const [caged, freed, open] of [
    [true, null, false],
    [false, 0.5, false],
    [false, null, true],
    [false, null, false]
  ] as const)
    add('princess', princessClip(caged, freed, open, 0).name)
  for (const p of staged) add(p.sheet, p.clip)
  for (const g of ghosts) add(g.sheet, g.clip)
  add('hero', heroKnockedOut().name)

  for (const id of SHEETS)
    it(id, () => {
      const missing = Object.keys(SPECS[id]).filter((name) => !shown.get(id)!.has(name))
      expect(missing, `${id}: clips never shown`).toEqual([])
      for (const name of shown.get(id)!) expect(SPECS[id][name], `${id}#${name} is not in the contract`).toBeDefined()
    })

  it('staging poses the boss roar, the yell, phase 2, the hero cheer and the fright', () => {
    const names = new Set(staged.map((p) => `${p.sheet}#${p.clip}`))
    for (const want of ['mom#yell', 'mom#idle', 'hero#hurt', 'hero#cheer', 'hero#idle', 'king#rage'])
      expect(names).toContain(want)
    for (const art of BOSS_ARTS) expect(names).toContain(`${art}#intro`)
  })

  describe('a staged pose shows every frame of its clip (and the sustained tail again)', () => {
    for (const p of staged) {
      const spec = SPECS[p.sheet][p.clip]
      if (!spec || spec.loop) continue
      it(`${p.sheet}#${p.clip} for ${p.seconds.toFixed(2)} s`, () => {
        expect(p.seconds, 'the pose lasts the clip and its tail').toBeGreaterThanOrEqual(clipLife(spec) - 1e-9)
        expectWhole(`${p.sheet}#${p.clip}`, spec, framesOver(spec, p.seconds))
      })
    }
  })

  describe('a knock-out ghost plays its whole clip (and the sustained tail again)', () => {
    for (const g of ghosts)
      it(`${g.sheet}#${g.clip}`, () => {
        const spec = SPECS[g.sheet][g.clip]
        const tail = ENEMY_KINDS.includes(g.sheet as EnemyArt) ? 0 : BOSS_DEFEAT_TAIL
        expect(g.life).toBeGreaterThanOrEqual(clipLife(spec, tail) - 1e-9)
        expectWhole(`${g.sheet}#${g.clip}`, spec, framesOver(spec, g.life))
      })
  })
})

describe('every clip that plays over a window of time shows all of its frames', () => {
  /** The frames of `name` that `pick` shows over the times given. */
  const sweep = (spec: AnimSpec, name: string, ts: Iterable<number>, pick: (t: number) => ClipChoice) => {
    const frames: number[] = []
    for (const t of ts) {
      const choice = pick(t)
      if (choice.name === name) frames.push(frameOf(spec, choice))
    }
    return frames
  }

  it('hero: wait, land, turn, hurt and bite', () => {
    const cases: [string, number, (t: number) => Partial<HeroSnapshot>][] = [
      ['wait', 4, (t) => ({ idleTime: WAIT_AFTER + t })],
      ['land', 1, (t) => ({ landAge: t, hardLanding: true })],
      ['turn', 1, (t) => ({ turnAge: t })],
      // The view shows the hurt reaction for the first 0.3 s of invulnerability (actors.ts).
      ['hurt', 0.3, (t) => ({ hurt: true, hurtAge: t })],
      ['bite', BITE_TIME, (t) => ({ biteAge: t })]
    ]
    for (const [name, window, state] of cases) {
      const spec = HERO_SPEC[name]
      expectWhole(
        `hero#${name}`,
        spec,
        sweep(spec, name, times(0, window), (t) => heroClip(hero(state(t))))
      )
    }
  })

  it('enemies: hurt, the jumper landing and the squirrel shot', () => {
    for (const kind of ENEMY_KINDS) {
      const spec = allSheetSpecs()[kind].hurt
      // The simulation flashes a hit enemy for 0.16 s.
      expectWhole(
        `${kind}#hurt`,
        spec,
        sweep(spec, 'hurt', times(0, 0.16), (t) => enemyClip(enemy(kind, { hitFlash: 0.16 - t })))
      )
    }
    const land = allSheetSpecs().jumper.land
    expectWhole(
      'jumper#land',
      land,
      sweep(land, 'land', times(0, 1), (t) => enemyClip(enemy('jumper', { landAge: t })))
    )
    // The squirrel: the timer runs out, it fires, the timer starts over.
    const shoot = allSheetSpecs().spitter.shoot
    expectWhole(
      'spitter#shoot',
      shoot,
      sweep(shoot, 'shoot', times(0, 2.5), (t) =>
        enemyClip(enemy('spitter', { shootTimer: t < 1 ? 1 - t : 2.4 - (t - 1) }))
      )
    )
  })

  it('bosses: hurt, land and the sim-time rage', () => {
    for (const [kind, art] of BOSSES) {
      const spec = bossSheetSpec(kind, art)
      const state: BossState = kind === 'chaser' ? 'tired' : 'idle'
      expectWhole(
        `${art}#hurt`,
        spec.hurt,
        sweep(spec.hurt, 'hurt', times(0, 1), (t) => bossClip(boss(kind, state, { hurtAge: t }), art))
      )
      if (spec.land)
        expectWhole(
          `${art}#land`,
          spec.land,
          sweep(spec.land, 'land', times(0, 1), (t) =>
            bossClip(boss(kind, 'recover', { prevState: 'slam', stateTime: t }), art)
          )
        )
    }
    // The throws and casts: the timer runs out (wind-up), the shot leaves (release and follow-through).
    for (const [kind, art] of [
      ['flyer', 'crowBoss'],
      ['swarm', 'foxBoss'],
      ['swarm', 'beeBoss']
    ] as const) {
      const spec = bossSheetSpec(kind, art)
      expectWhole(
        `${art}#shoot`,
        spec.shoot,
        sweep(spec.shoot, 'shoot', times(0, 1), (t) =>
          bossClip(boss(kind, 'idle', t < 0.3 ? { shotTimer: 0.3 - t } : { shotTimer: 1.5, shotAge: t - 0.3 }), art)
        )
      )
    }
    // Without staging (the fallback) the transformation plays once on sim time; its burning tail is staged only.
    const rage = bossSpec('king').rage
    expectWhole(
      'king#rage',
      { ...rage, sustain: undefined },
      sweep(rage, 'rage', times(0, 3), (t) => bossClip(boss('final', 'idle', { rageAge: t }), 'king'))
    )
  })

  it('the sheets that hold frames are timed by their holds', () => {
    for (const [id, name] of [
      ['hero', 'wait'],
      ['apeBoss', 'intro'],
      ['apeBoss', 'land'],
      ['weaselBoss', 'intro'],
      ['weaselBoss', 'defeat']
    ] as const) {
      const spec = id === 'hero' ? HERO_SPEC[name] : bossSpec(id as BossArt)[name]
      expect(spec.hold, `${id}#${name}`).toBeDefined()
      expect(specDuration(spec)).toBeCloseTo(spec.hold!.reduce((a, b) => a + b, 0) / spec.fps)
    }
    expect(MOM_SPEC.yell.hold).toBeUndefined()
    expect(PRINCESS_SPEC.idle.hold).toBeUndefined()
  })
})

// ------------------------------------------------------------------------------------------------- real play

/**
 * Coverage measured in real play: the simulation of every stage runs with the shared bot (and a few scripted
 * inputs a player makes and the bot does not), an ActorsView is fed its events and asked every step which clip it
 * would draw for the hero, each enemy and the boss. Ghosts count as shown. There is no director here, so the
 * staged poses are covered by the first part of this file.
 */
const PLAY_STEP = 1 / 60

class PlayRecorder {
  readonly shown = new Map<string, Set<string>>()
  /** The jumper's clip and frame, step by step, per enemy (to check that a hop reads as one). */
  readonly hops = new Map<number, string[]>()
  readonly view: ActorsView
  private memory: BotMemory

  constructor(readonly world: World) {
    this.view = new ActorsView(world, { rand: () => 0.5, spawn: () => {}, burst: () => {} } as never)
    this.memory = { x: world.player.x, stuck: 0, reverse: 0 }
  }

  private add(sheet: string, clip: string) {
    let set = this.shown.get(sheet)
    if (!set) this.shown.set(sheet, (set = new Set()))
    set.add(clip)
  }

  /** One simulation step with `input` (the bot's when omitted), then what the view would draw. */
  step(input: InputState = botInput(this.world, this.memory)) {
    const { world, view } = this
    world.step(PLAY_STEP, input)
    for (const event of world.events.splice(0)) view.handle(event)
    view.update(PLAY_STEP)
    view.tickReal(PLAY_STEP)
    const hero = view.selectHero()
    if (hero) this.add('hero', hero.name)
    // Once the stage is over the simulation stops and the enemies freeze where they are: only the hero's clips
    // (the cheer, the knock-out) count from then on.
    for (const g of (view as unknown as { ghosts: { sheet: string; clip: string }[] }).ghosts) this.add(g.sheet, g.clip)
    if (world.state !== 'play') return
    for (const enemy of world.enemies) {
      if (enemy.dead) continue
      const choice = view.selectEnemy(enemy)
      this.add(enemy.kind, choice.name)
      if (enemy.kind === 'jumper') {
        let list = this.hops.get(enemy.id)
        if (!list) this.hops.set(enemy.id, (list = []))
        list.push(choice.name === 'air' ? `air${choice.frame}` : choice.name)
      }
    }
    const boss = world.boss
    if (boss && !boss.dead) this.add(view.bossSheet(boss), view.selectBoss(boss).name)
  }

  /** Steps while `go` holds, at most `seconds`, keeping the hero alive. */
  run(seconds: number, go: () => boolean, input?: () => InputState) {
    for (let n = Math.round(seconds / PLAY_STEP); n > 0 && go() && this.world.state === 'play'; n--) {
      this.world.player.hp = this.world.player.maxHp
      this.step(input?.())
    }
  }
}

/** Chases the boss on foot and bites whenever it is close enough (as tests/bosses.test.ts). */
function fightInput(world: World): InputState {
  const p = world.player
  const boss = world.boss!
  const input = emptyInput()
  const dx = boss.x + boss.w / 2 - (p.x + p.w / 2)
  const bossMid = boss.y + boss.h / 2
  const playerMid = p.y + p.h / 2
  if (Math.abs(dx) > 26) input[dx > 0 ? 'right' : 'left'] = true
  const ahead = Math.floor((p.x + p.w / 2 + Math.sign(dx) * (p.w / 2 + 10)) / TILE)
  const foot = Math.floor((p.y + p.h - 4) / TILE)
  const wall = world.solidAt(ahead, foot) || world.solidAt(ahead, foot - 1)
  // A boss below is reached by stepping off the ledge, not by jumping the gap.
  const below = boss.y + boss.h > p.y + p.h + 40
  const pit = !below && !world.solidAt(ahead, Math.floor((p.y + p.h + 12) / TILE))
  if ((bossMid < playerMid - 60 || wall || pit) && p.onGround) {
    input.jump = true
    input.jumpPressed = true
  }
  if (Math.abs(dx) < 84 && Math.abs(bossMid - playerMid) < 120) {
    input.bite = true
    input.bitePressed = true
  }
  // A player jumps a charge, and the boss runs on into the wall (a brute is stunned by it).
  if (boss.state === 'charge' && Math.abs(dx) < 160 && p.onGround) {
    input.jump = true
    input.jumpPressed = true
  }
  return input
}

const hold = (keys: Partial<InputState>) => () => ({ ...emptyInput(), ...keys })

/** The same input without the bite. */
const holdBite = (input: InputState) => {
  input.bite = false
  input.bitePressed = false
  return input
}

/** The moves a player makes and the bot does not: standing still, a turn on the spot, a skid, a long drop. */
function heroMoves(r: PlayRecorder) {
  const p = r.world.player
  r.run(6.6, () => true, hold({})) // stand still past WAIT_AFTER and through the whole `wait`
  r.run(1 / 60, () => true, hold({ left: true })) // a turn on the spot
  r.run(0.4, () => true, hold({}))
  r.run(1, () => true, hold({ right: true })) // up to speed, then reverse: a skid
  r.run(0.3, () => true, hold({ left: true }))
  r.run(0.5, () => true, hold({}))
  // A long drop: lifted high above where he stands, he falls and lands hard.
  p.y -= 6 * TILE
  p.vy = 0
  r.run(2, () => !p.onGround || p.vy !== 0, hold({}))
  r.run(0.5, () => true, hold({}))
}

/**
 * A brute is stunned when his charge ends in a wall: the hero backs up to the arena's gate and jumps the charge,
 * as a player does.
 */
function wallDodge(r: PlayRecorder) {
  const { world } = r
  const boss = world.boss!
  const p = world.player
  const gate = world.bossGate
  if (!gate) return
  r.run(4, () => p.x > (gate.x + 1) * TILE + 8, hold({ left: true }))
  r.run(
    12,
    () => boss.state !== 'stunned',
    () => {
      const near = Math.abs(boss.x + boss.w / 2 - (p.x + p.w / 2)) < 150
      return boss.state === 'charge' && near && p.onGround ? hold({ jump: true, jumpPressed: true })() : emptyInput()
    }
  )
}

/** Floods a burst pipe and walks the hero into its water (stage 4). */
function swim(r: PlayRecorder) {
  const { world } = r
  const pipe = world.props.find((prop) => prop.kind === 'pipe')
  if (!pipe) return
  world.biteProp(pipe, 1)
  r.run(3, () => true, hold({}))
  for (let ty = 0; ty < world.h; ty++)
    for (let tx = 0; tx < world.w; tx++)
      if (world.waterAt(tx, ty)) {
        world.player.x = tx * TILE + 10
        world.player.y = ty * TILE + 4
        r.run(1, () => true, hold({ right: true }))
        return
      }
}

function playStage(no: number) {
  const stage = STAGES[no - 1]
  const world = new World(stage, { seed: 5 })
  world.player.maxHp = 999
  world.player.hp = 999
  // Doors and switches have their own coverage; open them so the run reaches the boss in time.
  for (const prop of world.props) if (prop.kind === 'switch') world.biteProp(prop, 1)
  const r = new PlayRecorder(world)
  if (no === 2) heroMoves(r)
  if (no === 4) swim(r)
  const chase = stage.boss.kind === 'chaser'
  // The nest stage summons its boss once the materials are in: gather them at once, so the fight has time.
  if (!world.boss)
    for (const prop of [...world.props]) if (prop.kind === 'twig' || prop.kind === 'berry') world.collect(prop)
  // The bot through the stage until the boss wakes (the chasing parent is awake from the start).
  r.run(chase ? 20 : 100, () => chase || !world.boss?.active)
  const boss = world.boss
  if (boss?.active && stage.boss.kind === 'brute') wallDodge(r)
  if (boss) {
    const fight = () => fightInput(world)
    const going = () => !boss.dead && !(chase && boss.state === 'tired' && boss.stateTime > 1)
    if (stage.boss.kind === 'final') {
      // A player who waits sees the king's attacks (charge, leap, cast) in each phase before biting on.
      r.run(
        8,
        () => true,
        () => holdBite(fight())
      )
      r.run(90, () => going() && boss.phase === 1, fight)
      // Transformed: the hero steps out of the corner where the fight has pinned them both (he cannot be hurt
      // here) to the near side of the arena, and lets the king come and attack.
      const gate = world.bossGate
      if (gate) {
        world.player.x = (gate.x + 2) * TILE
        world.player.y = boss.y + boss.h - world.player.h
      }
      r.run(
        12,
        () => true,
        () => holdBite(fight())
      )
    }
    if (stage.boss.kind === 'swarm') {
      // The fox and the bee keep walking at the hero; a player bites them when they stand (after a dash). The bot
      // can end up on a ledge out of their reach, which a player would leave: a hero off the boss's level for a
      // second is put back on the arena floor.
      let off = 0
      const floor = (input: InputState) => {
        const gate = world.bossGate
        off = Math.abs(boss.y + boss.h - (world.player.y + world.player.h)) > 40 ? off + PLAY_STEP : 0
        if (off > 1 && gate) {
          world.player.x = (gate.x + 2) * TILE
          world.player.y = boss.y + boss.h - world.player.h
          off = 0
        }
        return input
      }
      r.run(
        60,
        () => going() && !r.shown.get(stage.boss.art)?.has('hurt'),
        () => floor(Math.abs(boss.vx) <= FLINCH_MAX_SPEED ? fight() : holdBite(fight()))
      )
      r.run(150, going, () => floor(fight()))
    }
    r.run(150, going, fight)
    r.run(chase ? 3 : 2.5, () => true, fight) // the defeat ghost plays out, or she catches her breath
  }
  // On to the goal: the clear makes the hero cheer.
  r.run(40, () => true)
  if (world.state === 'clear') r.run(1, () => true)
  for (let i = 0; i < 60 && world.state === 'clear'; i++) r.step(emptyInput())
  return r
}

/**
 * Clips no run of the real game selects, with the reason. Everything else of a sheet that appears in play must
 * be selected at least once.
 */
const NOT_IN_PLAY: Record<string, Record<string, string>> = {
  mom: {
    idle: 'the chasing parent is awake from the first frame; she stands only in staging and in the story pictures',
    yell: 'staged at the chase start (covered above: there is no director here)'
  },
  jumper: { idle: 'the frog hops again the moment it lands; its sitting pose is for the story pictures' },
  bearBoss: {
    intro: 'staged when the boss wakes (covered above)',
    idle: 'the nest summons him awake and walking; he stands only in the staged intro (covered above)'
  }
}
for (const art of BOSS_ARTS) NOT_IN_PLAY[art] ??= { intro: 'staged when the boss wakes (covered above)' }
// The phase-2 transformation is staged; without a director it plays on sim time, on the plain sheet.
NOT_IN_PLAY[KING_RAGED] = {}

/** A short run that ends with the hero knocked out by an enemy (the knock-out is shown in play). */
function knockOut() {
  const world = new World(STAGES[1], { seed: 5 })
  const r = new PlayRecorder(world)
  r.run(1, () => true)
  world.player.hp = 1
  world.player.invuln = 0
  world.hurtPlayer(1, world.player.x + 100)
  for (let i = 0; i < 120; i++) r.step(emptyInput())
  return r
}

describe('every clip is selected in real play', () => {
  const runs: PlayRecorder[] = []
  const shown = new Map<string, Set<string>>()
  // About 3 s here; the generous limit is for a slow CI machine.
  beforeAll(() => {
    runs.push(...STAGES.map((stage) => playStage(stage.no)), knockOut())
    for (const r of runs)
      for (const [sheet, clips] of r.shown) {
        let set = shown.get(sheet)
        if (!set) shown.set(sheet, (set = new Set()))
        for (const clip of clips) set.add(clip)
      }
  }, 120_000)

  for (const id of SHEETS.filter((sheet) => sheet !== 'princess'))
    it(id, () => {
      expect(shown.has(id), `${id} never appears in the runs`).toBe(true)
      const excused = NOT_IN_PLAY[id] ?? {}
      const missing = Object.keys(SPECS[id]).filter((name) => !shown.get(id)!.has(name) && !(name in excused))
      expect(missing, `${id}: clips never selected in play`).toEqual([])
      // An excuse that no longer holds is dropped from the list.
      for (const name of Object.keys(excused))
        expect(shown.get(id)!.has(name), `${id}#${name} is selected in play: drop it from NOT_IN_PLAY`).toBe(false)
    })

  it('a frog hop at 60 Hz reads as one: launch, rising, top, falling, (brace), squash, launch', () => {
    const full = ['air0', 'air1', 'air2', 'air3', 'air4', 'land']
    let hops = 0
    let whole = 0
    for (const steps of runs.flatMap((r) => [...r.hops.values()])) {
      const seq = steps.filter((s, i) => i === 0 || s !== steps[i - 1])
      // Each hop from one landing to the next.
      for (let i = 0; i < seq.length; i++) {
        if (seq[i] !== 'land' || seq[i + 1] !== 'air0') continue
        const end = seq.indexOf('land', i + 1)
        if (end < 0) break
        const hop = seq.slice(i + 1, end + 1)
        if (hop.includes('hurt')) continue
        // The frames only move forward. A hop can skip one: the brace when the frog lands on higher ground
        // (slower than JUMPER_FAST_SPEED), the rise when a ceiling stops it. The squash is one step, then the
        // launch again.
        const order = hop.map((name) => full.indexOf(name))
        expect(order[0], hop.join(' ')).toBe(0)
        for (let k = 1; k < order.length; k++) expect(order[k], hop.join(' ')).toBeGreaterThan(order[k - 1])
        expect(hop.at(-1)).toBe('land')
        hops++
        if (hop.join() === full.join()) whole++
      }
    }
    expect(hops).toBeGreaterThan(10)
    expect(whole / hops).toBeGreaterThan(0.5)
  })
})
