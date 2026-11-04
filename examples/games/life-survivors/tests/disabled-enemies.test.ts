import { createHash } from 'node:crypto'
import { expect, test } from 'vitest'
import { DISABLED_ENEMIES, ENEMY_BY_ID } from '../src/data'
import { SHEETS } from '../src/art/index'
import { flash } from '../src/art/enemies'

test('retired enemies retain their original definitions and drawable sprites', () => {
  const originals = [
    { id: 'teacher', name: '教師', hp: 26, behavior: 'chase' },
    { id: 'lesson', name: '授業', hp: 22, behavior: 'chase' },
    { id: 'club', name: 'スポーツ', hp: 20, behavior: 'chase' },
    { id: 'girlfriend', name: '彼女', hp: 50, behavior: 'chase' },
    { id: 'boss', name: '上司', hp: 84, behavior: 'chase' },
    { id: 'kid', name: '子供', hp: 34, behavior: 'chase' },
    { id: 'vaccine', name: '注射', hp: 14, behavior: 'charger' },
    { id: 'senpai', name: '先輩', hp: 140, behavior: 'tank' },
    { id: 'job', name: '仕事', hp: 48, behavior: 'chase' },
    { id: 'dog', name: '野良犬', hp: 22, behavior: 'charger' },
    { id: 'pepper', name: 'ピーマン', hp: 18, behavior: 'shooter' },
    { id: 'worksheet', name: 'プリント', hp: 6, behavior: 'chase' },
    { id: 'dodgeball', name: 'ドッジボール', hp: 24, behavior: 'shooter' },
    { id: 'crush', name: '片思い', hp: 34, behavior: 'circler' },
    { id: 'drinking', name: '飲み会', hp: 46, behavior: 'shooter' },
    { id: 'scholarship', name: '奨学金', hp: 160, behavior: 'tank' },
    { id: 'meeting', name: '会議', hp: 220, behavior: 'tank' },
    { id: 'coin', name: '小銭', hp: 10, behavior: 'chase' },
    { id: 'b_vaccine', name: '予防接種の日', hp: 420, behavior: 'boss' }
  ]
  for (const original of originals)
    expect(DISABLED_ENEMIES.find((enemy) => enemy.id === original.id)).toMatchObject(original)

  for (const enemy of DISABLED_ENEMIES) {
    const make = SHEETS[`enemy:${enemy.id}`]
    expect([enemy.id, typeof make]).toEqual([enemy.id, 'function'])
    const { move, flash } = make()
    expect(move.frames.length).toBeGreaterThan(0)
    expect(flash.frames).toHaveLength(move.frames.length)
  }
})

test('replacement sprites distinguish the difficulty without changing the originals', () => {
  const replacements = {
    mischief: 'kid',
    overwork: 'job',
    biting_dog: 'dog',
    picky_eating: 'pepper',
    unfinished_worksheet: 'worksheet',
    ball_impact: 'dodgeball',
    unrequited_worry: 'crush',
    forced_drinking: 'drinking',
    scholarship_debt: 'scholarship',
    endless_meeting: 'meeting',
    tax_arrears: 'coin'
  }
  for (const [active, original] of Object.entries(replacements)) {
    expect(SHEETS[`enemy:${active}`]().move.frames[0].rgba()).not.toEqual(
      SHEETS[`enemy:${original}`]().move.frames[0].rgba()
    )
  }
})

test('mischief animates a separate mess with hit flashes while the retired kid pixels stay intact', () => {
  expect(ENEMY_BY_ID.get('mischief')?.icon).toBe('🖍️')
  const kid = SHEETS['enemy:kid']()
  const hash = createHash('sha256')
  for (const anim of Object.values(kid)) for (const frame of anim.frames) hash.update(frame.data)
  expect(hash.digest('hex')).toBe('153c32d4466d984e137a9b72c9a0697fdc3053b1f00889e2ec735ce1f39230c8')

  const mess = SHEETS['enemy:mischief']()
  expect(mess.move.loop).toBe(true)
  expect(mess.move.fps).toBeGreaterThan(0)
  expect(mess.move.frames).toHaveLength(6)
  expect(mess.flash.frames).toHaveLength(mess.move.frames.length)
  expect(mess.flash.fps).toBe(mess.move.fps)
  expect(mess.flash.loop).toBe(mess.move.loop)
  expect(new Set(mess.move.frames.map((frame) => createHash('sha256').update(frame.data).digest('hex'))).size).toBe(6)
  for (const [index, frame] of mess.move.frames.entries()) {
    expect([frame.w, frame.h]).toEqual([64, 64])
    expect(frame.data.some(Boolean)).toBe(true)
    for (const original of kid.move.frames) expect(frame.data).not.toEqual(original.data)
    expect(mess.flash.frames[index].data).toEqual(flash(frame).data)
    for (let position = 0; position < frame.data.length; position++) {
      const row = Math.floor(position / frame.w)
      const column = position % frame.w
      if (row > 58 || row === 0 || column === 0 || column === 63) expect(frame.data[position]).toBe(0)
    }
  }
})
