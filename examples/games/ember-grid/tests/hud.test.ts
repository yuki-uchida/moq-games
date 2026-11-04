import { describe, expect, it } from 'vitest'
import { campaign } from '../src/campaign'
import { createGame, type Game, type Unit } from '../src/game'
import { guideText, legendItems, objectiveText, phaseLabel, roleNames } from '../src/hud'

const stageOf = (type: string) => campaign.findIndex((c) => c.objective.type === type)
const base = { busy: false, ready: true }
const ally = (game: Game) => game.units.filter((u) => u.side === 'ally' && u.hp > 0)
const enemy = (game: Game) => game.units.filter((u) => u.side === 'enemy' && u.hp > 0)
const fighter = (game: Game) => ally(game).find((u) => !u.heal)!
/** Move every enemy far from `unit` so nothing is in range. */
const isolate = (game: Game, unit: Unit) => {
  for (const e of enemy(game)) {
    e.x = 9
    e.y = 9
  }
  unit.x = 0
  unit.y = 0
}

describe('labels', () => {
  it('names phases and roles', () => {
    expect(phaseLabel('ally')).toBe('味方フェイズ')
    expect(phaseLabel('enemy')).toBe('敵フェイズ')
    expect(phaseLabel('won')).toBe('勝利')
    expect(phaseLabel('lost')).toBe('敗北')
    expect(roleNames.soldier).toBe('剣士')
    expect(roleNames.dragon).toBe('竜')
  })
})

describe('objectiveText', () => {
  it('describes every objective type', () => {
    expect(objectiveText(createGame(stageOf('rout')))).toBe('敵を全滅させる')
    const boss = createGame(stageOf('boss'))
    const bossUnit = boss.units.find((u) => u.boss)!
    expect(objectiveText(boss)).toBe(`ボス撃破（${bossUnit.name}）`)
    bossUnit.hp = 0
    expect(objectiveText(boss)).toBe(`ボス撃破（${bossUnit.name}）`)
    expect(objectiveText(createGame(stageOf('seize')))).toBe('✦ 祠を制圧')
    const survive = createGame(stageOf('survive'))
    const turns = (campaign[survive.stage].objective as { turns: number }).turns
    expect(objectiveText(survive)).toBe(`${turns}ターン防衛 · 残り${turns}ターン`)
    survive.turn = turns + 3
    expect(objectiveText(survive)).toContain('残り0ターン')
  })
  it('announces victory', () => {
    const survive = createGame(stageOf('survive'))
    survive.phase = 'won'
    expect(objectiveText(survive)).toBe('防衛達成')
    for (const type of ['rout', 'boss', 'seize']) {
      const game = createGame(stageOf(type))
      game.phase = 'won'
      expect(objectiveText(game)).toBe('任務達成')
    }
  })
})

describe('guideText', () => {
  it('follows the priority rules', () => {
    const game = createGame(0)
    const unit = fighter(game)
    expect(guideText({ ...base, game, ready: false })).toBe('3D モデルを準備中…')
    game.phase = 'won'
    expect(guideText({ ...base, game })).toBe('勝利！ 結果を確認して次の任務へ')
    game.phase = 'lost'
    expect(guideText({ ...base, game })).toBe('敗北… 「↻ この章に再挑戦」で章の最初から')
    game.phase = 'enemy'
    expect(guideText({ ...base, game })).toContain('敵フェイズ中')
    game.phase = 'ally'
    expect(guideText({ ...base, game, busy: true, selected: unit })).toBe('行動中…')
    expect(guideText({ ...base, game, selected: unit, pendingHeal: true })).toContain('回復予測')
    expect(guideText({ ...base, game, selected: unit, pendingHeal: false })).toContain('攻撃予測')
  })
  it('announces a held shrine in a seize chapter', () => {
    const game = createGame(stageOf('seize'))
    const goal = campaign[game.stage].objective as { x: number; y: number }
    const unit = fighter(game)
    expect(guideText({ ...base, game })).not.toContain('祠を確保中')
    unit.x = goal.x
    unit.y = goal.y
    expect(guideText({ ...base, game })).toBe('祠を確保中 · ▶ ターン終了で制圧')
    expect(guideText({ ...base, game, selected: unit })).not.toContain('祠を確保中')
    const rout = createGame(0)
    fighter(rout).x = goal.x
    expect(guideText({ ...base, game: rout })).not.toContain('祠を確保中')
  })
  it('guides a selected fighter', () => {
    const game = createGame(0)
    const unit = fighter(game)
    isolate(game, unit)
    expect(guideText({ ...base, game, selected: unit })).toBe('青いマスへ移動（赤は移動後に攻撃できる範囲）')
    const foe = enemy(game)[0]
    foe.x = unit.x + 1
    foe.y = unit.y
    expect(guideText({ ...base, game, selected: unit })).toBe('青いマスへ移動、または赤く光る敵を攻撃')
    unit.moved = true
    expect(guideText({ ...base, game, selected: unit })).toBe('赤く光る敵を選んで攻撃、または ✓ 待機')
    foe.x = 9
    foe.y = 9
    expect(guideText({ ...base, game, selected: unit })).toBe('攻撃できる敵がいません · ✓ 待機（↶ 戻すで取消）')
    unit.done = true
    expect(guideText({ ...base, game, selected: unit })).toBe('行動済み · 別の味方を選ぶか ▶ ターン終了')
  })
  it('guides a healer', () => {
    const game = campaign.map((_, i) => createGame(i)).find((g) => ally(g).some((u) => u.heal))!
    const healer = ally(game).find((u) => u.heal)!
    const friend = ally(game).find((u) => u !== healer)!
    friend.hp = friend.max
    healer.x = 0
    healer.y = 0
    friend.x = 1
    friend.y = 0
    expect(guideText({ ...base, game, selected: healer })).toBe('青いマスへ移動（杖は距離1〜2の味方を回復）')
    healer.moved = true
    expect(guideText({ ...base, game, selected: healer })).toBe('✓ 待機で行動終了（↶ 戻すで移動を取消）')
    friend.hp = friend.max - 1
    expect(guideText({ ...base, game, selected: healer })).toBe('緑のマスの味方を回復、または ✓ 待機')
    healer.moved = false
    expect(guideText({ ...base, game, selected: healer })).toBe('青いマスへ移動、または緑のマスの味方を回復')
  })
  it('falls back to inspection and turn guidance', () => {
    const game = createGame(0)
    const foe = enemy(game)[0]
    expect(guideText({ ...base, game, inspected: foe })).toBe(`${foe.name}の移動範囲（青）と攻撃範囲（赤）を表示中`)
    expect(guideText({ ...base, game })).toBe('行動する味方（◆）を選んでください')
    for (const u of ally(game)) u.done = true
    expect(guideText({ ...base, game })).toBe('全員行動済み · ▶ ターン終了')
  })
})

describe('legendItems', () => {
  it('lists what the highlighted cells mean', () => {
    const game = createGame(stageOf('rout'))
    const fighterUnit = fighter(game)
    expect(legendItems({ game, danger: false })).toEqual([])
    expect(legendItems({ game, selected: fighterUnit, danger: false })).toEqual([
      { kind: 'move', label: '移動できる' },
      { kind: 'attack', label: '攻撃範囲' }
    ])
    fighterUnit.moved = true
    expect(legendItems({ game, selected: fighterUnit, danger: false }).map((i) => i.kind)).toEqual(['attack'])
    fighterUnit.done = true
    const foe = enemy(game)[0]
    expect(legendItems({ game, selected: fighterUnit, foe, danger: true }).map((i) => i.kind)).toEqual([
      'enemy-move',
      'attack',
      'danger'
    ])
  })
  it('lists heal and seize entries', () => {
    const withHealer = campaign.map((_, i) => createGame(i)).find((g) => ally(g).some((u) => u.heal))!
    const healer = ally(withHealer).find((u) => u.heal)!
    const kinds = legendItems({ game: withHealer, selected: healer, danger: false }).map((i) => i.kind)
    expect(kinds.slice(0, 2)).toEqual(['move', 'heal'])
    const seize = createGame(stageOf('seize'))
    expect(legendItems({ game: seize, danger: false })).toEqual([{ kind: 'seize', label: '制圧目標' }])
  })
})
