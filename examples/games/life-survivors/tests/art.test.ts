import { createHash } from 'node:crypto'
import { describe, expect, test } from 'vitest'
import { BULLET_KINDS, ENEMIES, ENEMY_BY_ID, PASSIVES, STAGES, TAG_NAMES, WEAPONS } from '../src/data'
import { ITEM_KINDS } from '../src/view'
import { deathKind } from '../src/art/deaths'
import { SHEETS } from '../src/art/index'
import { PALETTE } from '../src/art/palette'
import type { Sheet } from '../src/art/sheet'
import { GROUNDS, PROP_NAMES, groundTile } from '../src/art/world'
import { bodyFor } from '../src/render'

const built = Object.fromEntries(Object.entries(SHEETS).map(([id, make]) => [id, make()])) as Record<string, Sheet>
const lowest = (frame: Sheet[string]['frames'][number]) => {
  let y = -1
  frame.map((c, _x, row) => ((y = Math.max(y, row)), c))
  return y
}
const BODIES = ['baby', 'toddler', 'kid', 'junior', 'high', 'college', 'adult', 'prime', 'middle', 'elder', 'bed']
const big = (id: string) => id.startsWith('enemy:b_') || id === 'reaper'

describe('pixel art', () => {
  test('every life stage, enemy and boss has its sprite with the right size and frame count', () => {
    for (const body of BODIES) {
      const s = built[`player:${body}`]
      expect([body, Object.keys(s).sort()]).toEqual([body, ['hurt', 'idle', 'walk']])
      expect(s.idle.frames).toHaveLength(4)
      expect(s.walk.frames).toHaveLength(6)
      expect(s.hurt.frames.length).toBeGreaterThanOrEqual(1)
      expect(s.hurt.frames.length).toBeLessThanOrEqual(2)
      expect(built[`death:${body}`].collapse).toBeDefined()
    }
    // No emoji fallbacks remain: every enemy in the game data has a sheet with a white flash twin.
    for (const def of ENEMIES) {
      const s = built[`enemy:${def.id}`]
      expect([def.id, Boolean(s)]).toEqual([def.id, true])
      expect(s.move.frames.length).toBeGreaterThanOrEqual(4)
      expect(s.move.frames.length).toBeLessThanOrEqual(6)
      expect(s.flash.frames).toHaveLength(s.move.frames.length)
    }
    for (const [id, sheet] of Object.entries(built)) {
      if (
        id.startsWith('tiles:') ||
        id.startsWith('props:') ||
        id.startsWith('weapon:') ||
        ['fx', 'items', 'icons', 'bullets'].includes(id)
      )
        continue
      // Souls are 16px; the 大往生 soul (halo) is 24px.
      const size = (name: string) => (big(id) ? 128 : id === 'soul' ? (name === 'halo' ? 24 : 16) : 64)
      for (const [name, anim] of Object.entries(sheet)) {
        if (id.startsWith('death:')) {
          expect(anim.frames.length).toBeGreaterThanOrEqual(12)
          expect(anim.frames.length).toBeLessThanOrEqual(24)
          expect(anim.loop).toBe(false)
          // Fades are renderer alpha per frame, never dithered pixels.
          if (anim.alpha) expect(anim.alpha).toHaveLength(anim.frames.length)
        }
        for (const frame of anim.frames) expect([id, frame.w, frame.h]).toEqual([id, size(name), size(name)])
      }
    }
  }, 30_000)

  test('every weapon, passive and pickup has a world sprite and a HUD icon', () => {
    const fx = built.fx
    const need: Record<string, string[]> = {
      aura: ['wisp', 'skull'],
      zone: ['controller', 'pixels'],
      whip: ['star'],
      flail: ['hand', 'sweat'],
      strike: ['bolt', 'burst'],
      rain: ['bills', 'coins'],
      chain: ['like'],
      slam: ['dust', 'crack'],
      nova: ['note'],
      trail: ['perfume']
    }
    for (const def of WEAPONS) {
      expect([def.id, built.icons[def.id]?.frames[0].w]).toEqual([def.id, 32])
      if (def.behavior === 'none') continue
      if (need[def.behavior])
        for (const k of need[def.behavior]) expect([def.id, Boolean(fx[k])]).toEqual([def.id, true])
      else {
        const fly = built[`weapon:${def.id}`].fly
        for (const f of fly.frames) expect([def.id, f.w, f.h]).toEqual([def.id, 32, 32])
      }
    }
    expect(built['weapon:w_study'].fly.frames).toHaveLength(16)
    for (const p of PASSIVES) expect([p.id, built.icons[p.id]?.frames[0].w]).toEqual([p.id, 32])
    for (const id of ['meal', 'coin']) expect(built.icons[id].frames[0].w).toBe(32)
    // Effects every hit, death and blast is drawn with.
    for (const k of ['spark', 'crit', 'poof', 'boom', 'shine', 'heal']) expect([k, Boolean(fx[k])]).toEqual([k, true])
    // Enemy bullets: one 16×16 anim per kind the game can fire.
    for (const kind of BULLET_KINDS)
      for (const f of built.bullets[kind]?.frames ?? [undefined]) expect([kind, f?.w, f?.h]).toEqual([kind, 16, 16])
    for (const kind of [...ITEM_KINDS, 'gem1', 'gem2', 'gem3'])
      expect([kind, built.items[kind].frames[0].w]).toEqual([kind, 16])
  })

  test('ヤンキー親 runs in, flying-kicks and swaggers home in its own frames, not the monster parent’s', () => {
    const own = built['weapon:p_yankee']
    expect([own.fly.frames.length, own.kick.frames.length, own.walk.frames.length]).toEqual([4, 2, 4])
    const key = (frame: Sheet[string]['frames'][number]) => Buffer.from(frame.data).toString('hex')
    const monster = new Set(built['weapon:p_monster'].fly.frames.map(key))
    const frames = [own.fly, own.kick, own.walk].flatMap((anim) => anim.frames)
    for (const frame of frames) {
      expect([frame.w, frame.h]).toEqual([32, 32])
      expect(monster.has(key(frame))).toBe(false)
    }
    expect(new Set(frames.map(key)).size).toBe(frames.length)
    expect(key(built.icons.p_yankee.frames[0])).not.toBe(key(built.icons.p_monster.frames[0]))
    expect(built.fx.impact.frames).toHaveLength(2)
  })

  test('過保護親 has an animated body and a separate shield for its guard state', () => {
    const guardian = built['weapon:p_over']
    expect(guardian.fly.frames).toHaveLength(4)
    expect(guardian.guard.frames).toHaveLength(4)
    const key = (frame: Sheet[string]['frames'][number]) => Buffer.from(frame.data).toString('hex')
    expect(new Set(guardian.fly.frames.map(key)).size).toBeGreaterThan(1)
    for (let index = 0; index < 4; index++) {
      const body = guardian.fly.frames[index]
      const shield = guardian.guard.frames[index]
      expect([body.w, body.h, shield.w, shield.h]).toEqual([32, 32, 32, 32])
      expect(body.data.some((pixel) => pixel > 0)).toBe(true)
      expect(shield.data.some((pixel) => pixel > 0)).toBe(true)
      expect(key(body)).not.toBe(key(shield))
    }
  })

  test('every stage has a seamless ground (≥3 variants) and four props', () => {
    for (const stage of STAGES) {
      const ground = GROUNDS[stage.name]
      expect([stage.name, Boolean(ground)]).toEqual([stage.name, true])
      expect(built[`tiles:${ground}`].tiles.frames.length).toBeGreaterThanOrEqual(3)
      for (const frame of built[`tiles:${ground}`].tiles.frames) {
        expect([frame.w, frame.h]).toEqual([64, 64])
        expect(frame.data.every((c) => c > 0)).toBe(true)
      }
      expect(PROP_NAMES[ground].length).toBeGreaterThanOrEqual(4)
      expect(Object.keys(built[`props:${ground}`]).sort()).toEqual([...PROP_NAMES[ground]].sort())
      for (const prop of Object.values(built[`props:${ground}`])) {
        expect([64, 128]).toContain(prop.frames[0].w)
        expect([64, 128]).toContain(prop.frames[0].h)
        expect(prop.frames[0].w * prop.frames[0].h).toBeLessThanOrEqual(128 * 64)
      }
      expect(groundTile(ground, 3, -7)).toBe(groundTile(ground, 3, -7))
    }
  })

  test('only master-palette colours, ≤ 96 of them, and alpha is 0 or 255', () => {
    expect(PALETTE.length - 1).toBeLessThanOrEqual(96)
    for (const [id, sheet] of Object.entries(built))
      for (const anim of Object.values(sheet))
        for (const frame of anim.frames) {
          for (const c of frame.data) if (c >= PALETTE.length) throw new Error(`${id}: index ${c} outside the palette`)
          const rgba = frame.rgba()
          for (let i = 3; i < rgba.length; i += 4)
            if (rgba[i] !== 0 && rgba[i] !== 255) throw new Error(`${id}: alpha ${rgba[i]}`)
        }
  }, 30_000)

  test('feet sit on the shared baseline (row 58 of 64, 120 of 128) so flipping and animating never jitter', () => {
    for (const id of [...BODIES.map((b) => `player:${b}`), 'enemy:bully'])
      for (const anim of Object.values(built[id]))
        for (const frame of anim.frames) expect([id, lowest(frame)]).toEqual([id, 58])
    for (const frame of built['enemy:b_hs'].move.frames) expect(lowest(frame)).toBe(120)
    for (const [id, sheet] of Object.entries(built)) {
      if (id.startsWith('death:'))
        for (const anim of Object.values(sheet))
          for (const frame of anim.frames) expect(lowest(frame)).toBeLessThanOrEqual(58)
      if (big(id)) for (const frame of sheet.move.frames) expect([id, lowest(frame) <= 120]).toEqual([id, true])
    }
  })

  test('generation is deterministic and fast', () => {
    const digest = () => {
      const hash = createHash('sha256')
      const start = performance.now()
      for (const make of Object.values(SHEETS))
        for (const anim of Object.values(make())) for (const frame of anim.frames) hash.update(frame.data)
      return { hash: hash.digest('hex'), ms: performance.now() - start }
    }
    const a = digest()
    const b = digest()
    expect(b.hash).toBe(a.hash)
    // Everything (all stages, the full roster, maps) takes ~0.4 s on a laptop; the browser builds only
    // what is on screen, lazily. 4 s leaves ~10× headroom for slow CI while still catching a blow-up.
    expect(Math.min(a.ms, b.ms)).toBeLessThan(4000)
  }, 30_000)
})

describe('bodies and deaths', () => {
  test('every life stage has its own body', () => {
    expect(STAGES.map(bodyFor)).toEqual(BODIES)
  })

  test('every Tag × life stage resolves to a real death animation; minors never get 首吊り', () => {
    const tags = [undefined, ...Object.keys(TAG_NAMES)]
    for (const stage of STAGES) {
      const body = bodyFor(stage)
      // Every age the stage covers (up to the next stage).
      const next = STAGES[STAGES.indexOf(stage) + 1]?.age ?? 81
      for (let age = stage.age; age < next; age++)
        for (const tag of tags) {
          const kind = deathKind(tag, age, body)
          expect([stage.name, age, tag, Boolean(built[`death:${body}`][kind])]).toEqual([stage.name, age, tag, true])
          if (age < 18) expect(kind).not.toBe('hang')
        }
    }
    expect(deathKind(ENEMY_BY_ID.get('intimidating_boss')!.tag, 25, 'adult')).toBe('hang')
    expect(deathKind(ENEMY_BY_ID.get('bully')!.tag, 17, 'high')).toBe('alone')
    expect(deathKind(ENEMY_BY_ID.get('bully')!.tag, 9, 'kid')).toBe('alone')
    expect(deathKind(ENEMY_BY_ID.get('expense')!.tag, 30, 'adult')).toBe('starve')
    expect(deathKind(ENEMY_BY_ID.get('car')!.tag, 40, 'prime')).toBe('runover')
    expect(deathKind(ENEMY_BY_ID.get('germ')!.tag, 1, 'baby')).toBe('illness')
    expect(deathKind(ENEMY_BY_ID.get('mischief')!.tag, 1, 'baby')).toBe('collapse')
    expect(deathKind(ENEMY_BY_ID.get('intimidating_boss')!.tag, 78, 'bed')).toBe('lonely')
    expect(deathKind(undefined, 30, 'adult')).toBe('collapse')
    // The 大往生 ending and the ghost/halo souls exist.
    expect(built['death:bed'].won.soul).toBe('halo')
    expect(built['death:adult'].illness.soul).toBe('ghost')
    expect(built.soul.ghost.frames).toHaveLength(4)
    expect(built.reaper.bow.frames.length).toBeGreaterThan(3)
  })
})
