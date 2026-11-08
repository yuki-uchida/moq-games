/** Pure client helpers: scaling and camera math, snapshot interpolation, input mapping, validation and saves. */
import { describe, expect, test } from 'vitest'
import { parseSave } from '../src/client/save'
import { actionOf, aimFrom, edge, moveVector, stick } from '../src/input/map'
import { EventQueue, SnapshotBuffer, interpolateView, lerpAngle } from '../src/net/interp'
import { cleanName, cleanRoom, looksLikeView, randomRoom, validRoom, validateNetInput } from '../src/net/validate'
import { BASE_VIEW_H, clampCamera, cursorLead, scalingFor, smoothing, turnOf, viewOrigin } from '../src/render/camera'
import { createWorld } from '../src/sim/api'
import type { View } from '../src/sim/types'

describe('sharp-bilinear scaling', () => {
  test('1920×1080 shows 576 art px tall with a ×2 integer upscale', () => {
    const s = scalingFor(1920, 1080, BASE_VIEW_H)
    expect(s.scale).toBeCloseTo(1.875)
    expect(s.up).toBe(2)
    expect(s.artH).toBe(576)
    expect(s.artW).toBe(1024)
  })
  test('the boss zoom (720) and odd sizes cover the whole screen', () => {
    for (const [w, h, v] of [
      [1280, 720, 576],
      [1024, 600, 576],
      [2560, 1440, 720],
      [1366, 768, 650]
    ]) {
      const s = scalingFor(w, h, v)
      expect(s.artW * s.scale).toBeGreaterThanOrEqual(w - 1e-6)
      expect(s.artH * s.scale).toBeGreaterThanOrEqual(h - 1e-6)
      expect(s.up).toBe(Math.ceil(s.scale - 1e-6))
      expect(s.up).toBeGreaterThanOrEqual(1)
    }
    expect(scalingFor(2560, 1440, 576).up).toBe(3)
  })
})

describe('camera', () => {
  test('clamps to the map and centres small maps', () => {
    expect(clampCamera(10, 10, 1024, 576, 4608, 4096)).toEqual({ x: 512, y: 288 })
    expect(clampCamera(5000, 5000, 1024, 576, 4608, 4096)).toEqual({ x: 4608 - 512, y: 4096 - 288 })
    expect(clampCamera(2000, 2000, 1024, 576, 4608, 4096)).toEqual({ x: 2000, y: 2000 })
    expect(clampCamera(0, 0, 1024, 576, 640, 400)).toEqual({ x: 320, y: 200 })
  })
  test('lead toward the cursor is a capped fraction', () => {
    expect(cursorLead(100, 0).x).toBeCloseTo(18)
    const far = cursorLead(3000, 3000)
    expect(Math.hypot(far.x, far.y)).toBeCloseTo(56)
  })
  test('smoothing is frame-rate independent and origins are whole pixels', () => {
    const once = smoothing(6, 1 / 30)
    const twice = 1 - (1 - smoothing(6, 1 / 60)) ** 2
    expect(once).toBeCloseTo(twice, 10)
    const o = viewOrigin(100.4, 200.6, 101, 51)
    expect(Number.isInteger(o.x) && Number.isInteger(o.y)).toBe(true)
  })
  test('turns are 22.5° steps, 0 = right, clockwise on screen', () => {
    expect(turnOf(0)).toBe(0)
    expect(turnOf(Math.PI / 2)).toBe(4)
    expect(turnOf(Math.PI)).toBe(8)
    expect(turnOf(-Math.PI / 2)).toBe(12)
    expect(turnOf(-0.1)).toBe(0)
  })
})

describe('input mapping', () => {
  test('keys map by physical code', () => {
    expect(actionOf('KeyW')).toBe('up')
    expect(actionOf('ArrowLeft')).toBe('left')
    expect(actionOf('Space')).toBe('action')
    expect(actionOf('Tab')).toBe('switch')
    expect(actionOf('KeyZ')).toBeUndefined()
  })
  test('diagonals are normalised and opposites cancel', () => {
    const d = moveVector(true, false, false, true)
    expect(Math.hypot(d.mx, d.my)).toBeCloseTo(1)
    expect(d.mx).toBeGreaterThan(0)
    expect(d.my).toBeLessThan(0)
    expect(moveVector(true, true, true, true)).toEqual({ mx: 0, my: 0 })
  })
  test('aim angle and distance in art px', () => {
    const a = aimFrom(100, 100, 200, 100, 0.5, 1)
    expect(a.aim).toBeCloseTo(0)
    expect(a.aimDist).toBeCloseTo(50)
    expect(aimFrom(100, 100, 100, 101, 1, 1.5).aim).toBe(1.5)
  })
  test('stick dead zone and edges', () => {
    expect(stick(0.1, 0.1).m).toBe(0)
    const s = stick(1, 0)
    expect(s.x).toBeCloseTo(1)
    expect(Math.hypot(stick(1, 1).x, stick(1, 1).y)).toBeLessThanOrEqual(1 + 1e-9)
    expect(edge(true, false)).toBe(1)
    expect(edge(true, true)).toBe(0)
  })
})

function view(t: number, seq: number, x: number, extra: Partial<View> = {}): View {
  return {
    v: 1,
    t,
    seq,
    stage: 'meadow',
    species: 'slime',
    phase: 'play',
    heroes: [
      {
        slot: 0,
        job: 'sword',
        x,
        y: 100,
        z: 0,
        facing: 0,
        aim: 0,
        state: 'walk',
        st: 0,
        hp: 10,
        maxHp: 10,
        charge: 0,
        inv: 0,
        owner: 'a',
        ctrl: true,
        mode: 'follow'
      }
    ],
    enemies: [{ id: 5, kind: 'rookie', x: x * 2, y: 0, facing: 0, state: 'walk', st: 0, hp: 4, maxHp: 4 }],
    props: [],
    gone: [],
    shots: [{ id: 9, kind: 'arrow', x, y: 0, z: 0, vx: 100, vy: 0 }],
    pickups: [],
    techs: [],
    formations: [],
    events: [],
    players: [{ id: 'a', name: 'A', slots: [0], ctrl: 0 }],
    party: { gems: 0, keys: 0, techs: 0, kos: 0, time: 0, wipes: 0 },
    dialogs: [],
    objective: '',
    ...extra
  }
}

describe('snapshot interpolation', () => {
  test('angles take the short way round', () => {
    expect(lerpAngle(3, -3, 0.5)).toBeCloseTo(Math.PI, 1)
    expect(lerpAngle(0, 1, 0.25)).toBeCloseTo(0.25)
  })
  test('entities blend between the bracketing snapshots', () => {
    const v = interpolateView(view(1, 1, 0), view(1.05, 2, 10), 0.5, 1.025)
    expect(v.t).toBe(1.025)
    expect(v.heroes[0].x).toBeCloseTo(5)
    expect(v.enemies[0].x).toBeCloseTo(10)
    expect(v.shots[0].x).toBeCloseTo(5)
  })
  test('the buffer renders ~0.1 s behind the estimated host clock', () => {
    const b = new SnapshotBuffer()
    for (let i = 0; i <= 10; i++) b.push(view(10 + i * 0.05, i + 1, i * 10), 100 + i * 0.05)
    const host = b.hostTime(100.5)
    expect(host).toBeCloseTo(10.5, 2)
    const v = b.sample(host - 0.1)!
    expect(v.heroes[0].x).toBeCloseTo(80, 0)
    // Old and duplicate snapshots are ignored.
    expect(b.push(view(10.2, 3, 0), 100.6)).toBe(false)
    expect(b.size).toBeLessThanOrEqual(8)
  })
  test('phase or stage changes switch discretely', () => {
    const v = interpolateView(view(1, 1, 0), view(1.05, 2, 10, { phase: 'wipe' }), 0.7, 1.04)
    expect(v.phase).toBe('wipe')
  })
  test('events play once, in time, skipping a late joiner’s backlog', () => {
    const q = new EventQueue<{ id: number; t: number }>()
    q.add(
      [
        { id: 1, t: 1 },
        { id: 2, t: 9.5 },
        { id: 3, t: 10.2 }
      ],
      9
    )
    const out: { id: number; t: number }[] = []
    expect(q.take(10, out).map((e) => e.id)).toEqual([2])
    q.add([
      { id: 2, t: 9.5 },
      { id: 3, t: 10.2 },
      { id: 4, t: 10.3 }
    ])
    expect(q.take(11, out).map((e) => e.id)).toEqual([3, 4])
    expect(q.take(12, out)).toEqual([])
  })
})

describe('network validation', () => {
  test('rooms', () => {
    expect(validRoom('donguri-428')).toBe(true)
    expect(validRoom('')).toBe(false)
    expect(validRoom('a'.repeat(65))).toBe(false)
    expect(validRoom('へや')).toBe(false)
    expect(cleanRoom('  my room!! ')).toBe('my-room')
    for (let i = 0; i < 20; i++) expect(validRoom(randomRoom())).toBe(true)
  })
  test('guest inputs are rebuilt with clamped fields', () => {
    const v = validateNetInput({
      mx: 5,
      my: 5,
      aim: 'x',
      attackHeld: 1,
      attackPresses: 3,
      attackReleases: -1,
      aimDist: 1e9,
      job: 'king',
      name: '<b>とても長いなまえのプレイヤーです</b>',
      hero: { slot: 2, x: 10, y: 20, z: 0, vx: 0, vy: 0, facing: 0, forceSeq: 4, airborne: true },
      evil: true
    })!
    expect(Math.hypot(v.mx, v.my)).toBeCloseTo(1)
    expect(v.aim).toBeCloseTo(Math.PI / 2)
    expect(v.attackHeld).toBe(false)
    expect(v.attackPresses).toBe(3)
    expect(v.attackReleases).toBe(0)
    expect(v.aimDist).toBe(4000)
    expect(v.job).toBeUndefined()
    expect(v.name!.length).toBeLessThanOrEqual(12)
    expect(v.name).not.toContain('<')
    expect(v.hero?.slot).toBe(2)
    expect('evil' in v).toBe(false)
    expect(validateNetInput(null)).toBeUndefined()
    expect(validateNetInput([1])).toBeUndefined()
    expect(validateNetInput({ hero: { slot: 9, x: 1, y: 1 } })?.hero).toBeUndefined()
    expect(cleanName('  ねこ ')).toBe('ねこ')
  })
  test('a real world view passes the snapshot check; junk does not', () => {
    const world = createWorld({ seed: 1, progress: { cleared: [] }, stage: 'meadow', skipIntro: true })
    world.setPlayers([{ id: 'host', name: 'ホスト' }])
    world.step(1 / 60)
    const v = JSON.parse(JSON.stringify(world.view()))
    expect(looksLikeView(v)).toBe(true)
    expect(looksLikeView({ ...v, stage: 'moon' })).toBe(false)
    expect(looksLikeView({ v: 1 })).toBe(false)
    expect(JSON.stringify(v).length).toBeLessThan(64 * 1024)
  })
})

describe('save data', () => {
  test('malformed or partial saves fall back to defaults', () => {
    expect(parseSave(null).settings.music).toBeCloseTo(0.7)
    expect(parseSave('{oops').progress.cleared).toEqual([])
    const s = parseSave(
      JSON.stringify({
        progress: { cleared: ['meadow', 'moon', 'meadow'] },
        settings: { music: 3, shake: false },
        name: 'x'.repeat(30)
      })
    )
    expect(s.progress.cleared).toEqual(['meadow'])
    expect(s.settings.music).toBe(1)
    expect(s.settings.shake).toBe(false)
    expect(s.settings.sfx).toBeCloseTo(0.9)
    expect(s.name.length).toBe(12)
  })
})
