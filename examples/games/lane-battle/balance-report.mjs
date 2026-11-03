import {
  POOPS,
  SPECIALS,
  ENEMIES,
  card,
  createGame,
  summon,
  step,
  rng,
  upgrade,
  upgradeCost,
  burst,
  OPENING
} from './simulation.js'
import { addEntry, levelUp, newCampaign, specialScale } from './campaign.js'
import { playBattle, playCampaign, summonKeepingOne } from './bot.js'

const realisticOnly = process.argv.find((arg) => arg.startsWith('--realistic='))?.slice('--realistic='.length)
const nicheOnly = process.argv.includes('--niche-only')
const [selectedStage, selectedPolicy] = realisticOnly?.split(':') ?? []

function measure(type, side) {
  const deck = side === 1 ? [card({ uid: 1, key: type.key })] : [card({ uid: 1, key: 'katachi' })]
  const game = createGame(0, deck, 42)
  game.gold = 999
  game.spawn = 999
  game.opened = 2
  game.rushes = 4
  game.turret = 999
  if (side === 1) summon(game, 0)
  else summon(game, ENEMIES.indexOf(type), -1)
  const attacker = game.units[0]
  attacker.x = side === 1 ? 540 : 460
  for (let index = 0; index < 4; index++) {
    game.cooldowns[0] = 0
    summon(game, 0, -side)
    game.units.at(-1).x = side === 1 ? 460 - index * 12 : 540 + index * 12
  }
  const targets = game.units.filter((unit) => unit.side !== side)
  while (game.time < 60 && attacker.hp > 0 && targets.some((unit) => unit.hp > 0) && !game.result) step(game, 0.05)
  const damage = targets.reduce((sum, target) => sum + target.maxHp - Math.max(0, target.hp), 0)
  return {
    damage: Math.round(damage),
    survival: `${game.time.toFixed(1)}${attacker.hp > 0 ? '+' : ''}`,
    perCost: side === 1 ? (damage / type.cost).toFixed(2) : '—'
  }
}

if (!realisticOnly) {
  console.log(
    '固定シード42、Lv1単騎対標準4体、範囲・状態異常あり、最大60秒（敵はカチカチ4体、味方は清掃員4体。生存打切りは+）'
  )
  console.log('unit\tside\tdamage\tdamage/cost\tsurvival(s)')
  for (const [side, types] of [
    [1, [...POOPS, ...SPECIALS]],
    [-1, ENEMIES]
  ]) {
    for (const type of types) {
      const result = measure(type, side)
      console.log(
        `${type.name}\t${side === 1 ? '味方' : '敵'}\t${result.damage}\t${result.perCost}\t${result.survival}`
      )
    }
  }

  const scenarios = {
    heavy: ['geridome', 'washiki'],
    swarm: ['cleaner', 'cleaner', 'yogurt', 'yogurt', 'cleaner', 'yogurt'],
    ranged: ['sayu', 'seichou', 'yoshiki']
  }

  function measureNiche(type, foes, seed) {
    const scale = type.special ? specialScale(15) : 1
    const deck = [
      card({ uid: 1, key: type.key, hp: Math.round(type.hp * scale), atk: Math.round(type.atk * scale) }),
      card({ uid: 2, key: 'katachi' }),
      card({ uid: 3, key: 'katachi' })
    ]
    const game = createGame(15, deck, seed)
    Object.assign(game, { spawn: 1e9, opened: 2, rushes: 99, turret: 1e9, gold: 1e9 })
    for (let index = 0; index < deck.length; index++) summon(game, index)
    ;[560, 540, 548].forEach((x, index) => {
      game.units[index].x = x
    })
    foes.forEach((key, index) => {
      summon(
        game,
        ENEMIES.findIndex((enemy) => enemy.key === key),
        -1
      )
      game.units.at(-1).x = 420 - index * 14
    })
    const subject = game.units[0]
    const enemies = game.units.filter((unit) => unit.side === -1)
    const total = enemies.reduce((sum, unit) => sum + unit.maxHp, 0)
    let survival = 0
    while (
      !game.result &&
      game.time < 40 &&
      enemies.some((unit) => unit.hp > 0) &&
      game.units.some((unit) => unit.side === 1 && unit.hp > 0)
    ) {
      step(game, 0.05)
      if (subject.hp > 0) survival = game.time
    }
    const cleared = (100 * (total - enemies.reduce((sum, unit) => sum + Math.max(0, unit.hp), 0))) / total
    return { cleared, survival }
  }

  console.log(
    `\nニッチ測定: シード1〜50の平均、第16面倍率、特殊はステージindex 15加入倍率${specialScale(15)}、うんこはLv1、カチカチ2体、最大40秒`
  )
  console.log(
    'unit\tcost\theavy (% / 100 cost / 生存秒)\tswarm (% / 100 cost / 生存秒)\tranged (% / 100 cost / 生存秒)'
  )
  for (const type of [...POOPS, ...SPECIALS]) {
    console.log(
      `${type.name}\t${type.cost}\t${Object.values(scenarios)
        .map((foes) => {
          const samples = Array.from({ length: 50 }, (_, index) => measureNiche(type, foes, index + 1))
          const cleared = samples.reduce((sum, sample) => sum + sample.cleared, 0) / samples.length
          const survival = samples.reduce((sum, sample) => sum + sample.survival, 0) / samples.length
          return `${cleared.toFixed(2)}% / ${((cleared * 100) / type.cost).toFixed(2)} / ${survival.toFixed(2)}s`
        })
        .join('\t')}`
    )
  }
}

if (!nicheOnly) {
  const full = process.argv.includes('--full')
  const stages = selectedStage ? [Number(selectedStage)] : full ? [8, 15, 22] : [15, 22]
  const seeds = full ? 160 : realisticOnly ? 40 : 60
  const samples = Object.fromEntries(stages.map((stage) => [stage, []]))
  for (const seed of [3, 11, 29, 42, 77, 101]) {
    const seen = new Set()
    playCampaign(rng(seed), {
      casual: true,
      log: (_battle, _report, campaign) => {
        if (!stages.includes(campaign.cleared) || seen.has(campaign.cleared)) return
        seen.add(campaign.cleared)
        samples[campaign.cleared].push(
          POOPS.map((type) => campaign.roster.find((entry) => entry.key === type.key)?.level ?? 1)
        )
      }
    })
  }
  function measureFormation(deck, stage, seed, specialIndex) {
    const game = createGame(stage, deck, seed)
    const random = rng(seed ^ 0x5eed)
    const order = deck
      .map((_, index) => index)
      .filter((index) => index !== specialIndex)
      .sort((a, b) => deck[b].cost - deck[a].cost)
    let next = 0
    while (!game.result && game.time < 900) {
      const morning = game.opened < OPENING.at.length
      if (game.time >= next) {
        next = game.time + 1
        if (!morning && game.level < 2 && game.gold >= upgradeCost(game) + 40) upgrade(game)
        else summonKeepingOne(game, specialIndex, order, random)
        if (game.units.some((unit) => unit.side === -1 && unit.x > 800)) burst(game)
      }
      step(game, 0.05)
    }
    return game
  }
  console.log(`\n実戦編成: ステージ到達時の6シード中央値、シード1〜${seeds}`)
  console.log('stage\tpolicy\tunit\twins\tmean time(s)\tmean summons\t40-seed blocks')
  for (const stage of stages) {
    const levels = POOPS.map((_, index) => {
      const values = samples[stage].map((sample) => sample[index]).sort((a, b) => a - b)
      return Math.round((values[2] + values[3]) / 2)
    })
    const campaign = newCampaign()
    const growthRandom = rng(stage)
    const entries = POOPS.map((type, index) => {
      const entry = campaign.roster.find((unit) => unit.key === type.key) ?? addEntry(campaign, type.key)
      while (entry.level < levels[index]) levelUp(entry, growthRandom)
      return entry
    })
    const base = entries.filter((entry) => entry.key !== 'dodeka').map(card)
    console.log(`levels ${stage}: ${levels.join('/')}`)
    for (const policy of selectedPolicy ? [selectedPolicy] : ['keep', 'casual']) {
      for (const type of [null, ...SPECIALS]) {
        const deck = [
          ...base,
          type ? card(addEntry(campaign, type.key, stage)) : card(entries.find((entry) => entry.key === 'dodeka'))
        ]
        const specialIndex = deck.length - 1
        const battles = Array.from({ length: seeds }, (_, index) =>
          policy === 'keep'
            ? measureFormation(deck, stage, index + 1, specialIndex)
            : playBattle(deck, stage, index + 1, { casual: true })
        )
        const wins = battles.filter((battle) => battle.result === 'victory').length
        const time = battles.reduce((sum, battle) => sum + battle.time, 0) / seeds
        const summons = battles.reduce((sum, battle) => sum + battle.summons[specialIndex], 0) / seeds
        const blocks = []
        for (let offset = 0; offset < seeds; offset += 40) {
          const block = battles.slice(offset, offset + 40)
          blocks.push(`${block.filter((battle) => battle.result === 'victory').length}/${block.length}`)
        }
        console.log(
          `${stage}\t${policy}\t${type?.name ?? 'ドデカ'}\t${wins}/${seeds}\t${time.toFixed(2)}\t${summons.toFixed(4)}\t${blocks.join(' ')}`
        )
      }
    }
  }
}

function measureSquad(type, side) {
  const playerKeys = side === 1 ? [type.key, 'katachi', 'katachi'] : ['katachi', 'katachi', 'korokoro', 'geri', 'bichi']
  const enemyKeys = side === 1 ? ['cleaner', 'sayu', 'washiki', 'mop', 'yoshiki'] : [type.key]
  const game = createGame(
    14,
    playerKeys.map((key, index) => card({ uid: index + 1, key })),
    42
  )
  game.gold = 9999
  game.spawn = 999
  game.opened = 2
  game.rushes = 4
  game.turret = 999
  for (const [index] of playerKeys.entries()) {
    summon(game, index)
    game.units.at(-1).x = side === 1 ? (index === 0 ? 585 : 538 + index * 12) : 550 + index * 12
  }
  for (const [index, key] of enemyKeys.entries()) {
    summon(
      game,
      ENEMIES.findIndex((enemy) => enemy.key === key),
      -1
    )
    game.units.at(-1).x = 450 - index * 12
  }
  const attacker = game.units[side === 1 ? 0 : playerKeys.length]
  const targets = game.units.filter((unit) => unit.side !== side)
  while (game.time < 60 && attacker.hp > 0 && targets.some((unit) => unit.hp > 0) && !game.result) step(game, 0.05)
  const damage = targets.reduce((sum, target) => sum + target.maxHp - Math.max(0, target.hp), 0)
  return {
    damage: Math.round(damage),
    perCost: side === 1 ? (damage / (type.cost + 2 * POOPS[0].cost)).toFixed(2) : '—',
    kills: targets.filter((target) => target.hp <= 0).length,
    survival: `${game.time.toFixed(1)}${attacker.hp > 0 ? '+' : ''}`
  }
}

if (!realisticOnly && !nicheOnly) {
  console.log('\n第15面の敵倍率、Lv1、固定シード42、最大60秒（+は生存打切り）')
  console.log('味方: 各1体＋カチカチ2体 対 清掃員・白湯・和式・モップ・洋式。ダメージとコストは隊全体')
  console.log('敵: 各1体 対 カチカチ2体・コロコロ・ゲリラ・ビチビチ')
  console.log('unit\tside\tdamage\tdamage/cost\tkills\tsurvival(s)')
  for (const [side, types] of [
    [1, [...POOPS, ...SPECIALS]],
    [-1, ENEMIES]
  ]) {
    for (const type of types) {
      const result = measureSquad(type, side)
      console.log(
        `${type.name}\t${side === 1 ? '味方' : '敵'}\t${result.damage}\t${result.perCost}\t${result.kills}\t${result.survival}`
      )
    }
  }
}
