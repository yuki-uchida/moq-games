import { describe, expect, it } from 'vitest'
import { campaign } from '../src/campaign'
import { detailHtml, forecastHtml, terrainText, unitCardHtml, unitNotes } from '../src/cards'
import { createGame } from '../src/game'

const game = createGame(0)
const allies = game.units.filter((u) => u.side === 'ally')
const enemies = game.units.filter((u) => u.side === 'enemy')
/** Whitespace-normalised textContent equivalent. */
const t = (html: string) => html.replace(/<[^>]+>/g, '').replace(/\s+/g, ' ')

describe('unitNotes', () => {
  it('describes allies', () => {
    const base = allies[0]
    expect(unitNotes({ ...base, role: 'archer', heal: undefined })).toContain('狼に +3')
    expect(unitNotes({ ...base, role: 'soldier', heal: undefined })).toContain('ゴブリンに +1')
    expect(unitNotes({ ...base, role: 'mage', heal: undefined })).toContain('魔法は盾を無視')
    expect(unitNotes({ ...base, role: 'healer', heal: 5 })).toContain('杖：距離1〜2の味方を 5 回復')
  })
  it('describes enemies', () => {
    const base = { ...enemies[0], boss: false, armor: 0, ai: 'charge' as const }
    expect(unitNotes({ ...base, role: 'wolf' })).toEqual(['弓に弱い（+3）'])
    expect(unitNotes({ ...base, role: 'goblin' })).toEqual(['剣に弱い（+1）'])
    expect(unitNotes({ ...base, role: 'beetle', armor: 2, ai: 'hold' })).toEqual([
      '盾：物理ダメージ −2（魔法は無視）',
      'その場から動かない'
    ])
    expect(unitNotes({ ...base, role: 'ogre', boss: true, ai: 'guard', alerted: false })).toEqual([
      '♛ ボス',
      '近づくか攻撃されるまで待機'
    ])
    expect(unitNotes({ ...base, role: 'ogre', ai: 'guard', alerted: true })).toEqual([])
  })
})

describe('unitCardHtml', () => {
  it('summarises an ally', () => {
    const a = { ...allies[0], role: 'archer', name: '風読みネリ', level: 1, hp: 11, max: 11, move: 3, exp: 0 }
    const html = unitCardHtml(a, 'p.png')
    const s = t(html)
    expect(s).toContain('風読みネリ 弓兵 Lv1')
    expect(s).toContain('HP 11/11')
    expect(s).toContain('移動 3')
    expect(s).toContain('EXP 0/100')
    expect(html).toContain('<img class="portrait"')
    expect(html).not.toContain('uc-hp low')
  })
  it('omits portrait and EXP; shows shield, boss and low HP', () => {
    const e = { ...enemies[0], armor: 2, boss: true, hp: 3, max: 12, role: 'beetle' }
    const html = unitCardHtml(e, '')
    expect(html).not.toContain('<img')
    expect(html).not.toContain('EXP')
    expect(html).toContain('<dt>盾</dt>')
    expect(html).toContain('uc-boss')
    expect(html).toContain('uc-hp low')
    expect(html).toContain('uc-note')
  })
})

describe('forecastHtml', () => {
  const attacker = allies[0]
  const target = enemies[0]
  it('attack', () => {
    const html = forecastHtml({
      attacker,
      target: { ...target, hp: 10, max: 10 },
      attackerSrc: '',
      targetSrc: '',
      healing: false,
      after: 2,
      chips: ['相性 +3']
    })
    const s = t(html)
    expect(s).toContain('攻撃予測')
    expect(s).toContain('10 → 2')
    expect(s).toContain('−8')
    expect(s).toContain('相性 +3')
    expect(s).toContain('反撃なし')
    expect(html).not.toContain('fc-ko')
    expect(html).toContain('id="confirm">攻撃')
  })
  it('shows the attack damage, not the HP actually lost', () => {
    const html = forecastHtml({
      attacker,
      target: { ...target, hp: 2, max: 10 },
      attackerSrc: '',
      targetSrc: '',
      healing: false,
      after: 0,
      damage: 6,
      chips: []
    })
    const s = t(html)
    expect(s).toContain('−6')
    expect(s).toContain('HP 2 → 0')
    expect(s).toContain('撃破')
    expect(s).not.toContain('−2')
  })
  it('marks lethal', () => {
    const html = forecastHtml({
      attacker,
      target: { ...target, hp: 4 },
      attackerSrc: '',
      targetSrc: '',
      healing: false,
      after: 0,
      chips: []
    })
    expect(html).toContain('<mark class="fc-ko">撃破</mark>')
  })
  it('heal', () => {
    const html = forecastHtml({
      attacker: { ...allies[0], heal: 6 },
      target: { ...allies[1], hp: 8, max: 20 },
      attackerSrc: '',
      targetSrc: '',
      healing: true,
      after: 14,
      chips: []
    })
    const s = t(html)
    expect(s).toContain('回復予測')
    expect(s).toContain('8 → 14')
    expect(s).toContain('+6')
    expect(s).toContain('杖 +6')
    expect(html).not.toContain('fc-ko')
    expect(html).not.toContain('反撃なし')
    expect(html).toContain('id="confirm">回復')
  })
})

describe('detailHtml', () => {
  it('ally has one progress', () => {
    const html = detailHtml(allies[0], 'x.png')
    expect(html.match(/<progress/g)).toHaveLength(1)
    expect(html).toContain('id="detail-title"')
    expect(html).toContain('味方')
    expect(html).toContain('ダメージの基本値')
  })
  it('enemy has none', () => {
    const html = detailHtml({ ...enemies[0], boss: true }, '')
    expect(html).not.toContain('<progress')
    expect(html).toContain('敵')
    expect(html).toContain('♛ ボス')
  })
})

describe('terrainText', () => {
  it('describes terrain', () => {
    const g = createGame(0)
    const [rx, ry] = [...g.rocks][0].split(',').map(Number)
    const [gx, gy] = [...g.groves][0].split(',').map(Number)
    expect(terrainText(g, rx, ry)).toBe('岩 · 通れない')
    expect(terrainText(g, gx, gy)).toBe('♣ 木立 · 受けるダメージ −2')
    expect(terrainText(g, 0, 0)).toBe('平地 · 効果なし')
  })
  it('seize shrine and ruined wall', () => {
    const s = campaign.findIndex((c) => c.objective.type === 'seize')
    const o = campaign[s].objective as { x: number; y: number }
    expect(terrainText(createGame(s), o.x, o.y)).toBe('✦ 祠 · 味方フェイズ終了時に味方がいれば制圧')
    const g2 = createGame(2)
    const [x, y] = [...g2.rocks][0].split(',').map(Number)
    expect(terrainText(g2, x, y)).toBe('崩れた城壁 · 通れない')
  })
})

describe('healer detail', () => {
  it('explains range as healing reach and does not promise attacks', async () => {
    const { createGame } = await import('../src/game')
    const game = createGame(3)
    const healer = game.units.find((u) => u.heal)!
    const html = detailHtml(healer, '')
    expect(html).toContain('回復が届くマス数')
    expect(html).toContain('攻撃はしない')
    expect(html).not.toContain('攻撃が届くマス数')
  })
})

describe('unitCardHtml terrain chip', () => {
  it('shows the terrain next to the name only when one is given', () => {
    expect(unitCardHtml(allies[0], '')).not.toContain('uc-terrain')
    const html = unitCardHtml(allies[0], '', '♣ 木立 −2')
    expect(html).toMatch(/<p class="uc-head">.*<span class="uc-terrain">♣ 木立 −2<\/span><\/p>/)
    expect(t(html)).toContain('♣ 木立 −2')
  })
})
