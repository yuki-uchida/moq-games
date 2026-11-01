export const TYPES = [
  {
    name: 'カチカチうんこ',
    role: 'soldier',
    cost: 35,
    hp: 180,
    damage: 22,
    range: 32,
    speed: 27,
    period: 1.05,
    cooldown: 2.5
  },
  {
    name: 'コロコロうんこ',
    role: 'archer',
    cost: 65,
    hp: 85,
    damage: 29,
    range: 160,
    speed: 24,
    period: 1.45,
    cooldown: 4
  },
  {
    name: 'ゲリラうんこ',
    role: 'wolf',
    cost: 95,
    hp: 240,
    damage: 35,
    range: 38,
    speed: 46,
    period: 0.85,
    cooldown: 6
  }
]
export const STAGES = [
  {
    name: '公園のトイレ',
    hint: '短い初戦 · カチカチで守りコロコロで突破',
    enemy: 1000,
    gold: 100,
    income: 9,
    interval: 7.5,
    floor: 5,
    reward: 10,
    power: 0.85,
    pattern: [0, 0, 1, 0],
    color: '#9fd3d8'
  },
  {
    name: '駅ナカトイレ',
    hint: '泡の射手の防衛線 · ゲリラうんこで距離を詰めよう',
    enemy: 1700,
    gold: 100,
    income: 9,
    interval: 6.5,
    floor: 4,
    reward: 14,
    power: 1,
    pattern: [0, 1, 1, 0, 2],
    color: '#c4bde6'
  },
  {
    name: '黄金の便器城',
    hint: '泡の急襲 · 複合編成と腸活、大放屁が鍵',
    enemy: 2600,
    gold: 100,
    income: 9,
    interval: 5.8,
    floor: 3.6,
    reward: 20,
    power: 1.05,
    pattern: [2, 0, 1, 2, 1],
    color: '#e8cf86'
  }
]
export const income = (s) => STAGES[s.stage].income + s.level * 4
export function createGame(stage = 0) {
  return {
    time: 0,
    stage,
    enemySpawned: 0,
    gold: STAGES[stage].gold,
    level: 1,
    home: 1400,
    enemy: STAGES[stage].enemy,
    units: [],
    effects: [],
    projectiles: [],
    cooldowns: [0, 0, 0],
    burst: 0,
    spawn: 3,
    serial: 0,
    result: null,
    kills: 0
  }
}
export const upgradeCost = (s) => 70 + (s.level - 1) * 65
export function summon(s, type, side = 1) {
  const t = TYPES[type]
  if (
    s.result ||
    (side === 1 && (s.gold < t.cost || s.cooldowns[type] > 0 || s.units.filter((u) => u.side === 1).length >= 24))
  )
    return false
  if (side === 1) {
    s.gold -= t.cost
    s.cooldowns[type] = t.cooldown
  }
  s.units.push({
    ...t,
    type,
    side,
    id: ++s.serial,
    x: side === 1 ? 85 : 915,
    hp: t.hp * (side === -1 ? STAGES[s.stage].power + Math.min(s.time / 350, 0.4) : 1),
    maxHp: t.hp * (side === -1 ? STAGES[s.stage].power + Math.min(s.time / 350, 0.4) : 1),
    attack: 0,
    phase: 0,
    walkDistance: 0,
    motion: 'walk'
  })
  return true
}
export function upgrade(s) {
  const cost = upgradeCost(s)
  if (s.result || s.level >= 5 || s.gold < cost) return false
  s.gold -= cost
  s.level++
  return true
}
export const BURST_COOLDOWN = 24
export function burst(s) {
  if (s.result || s.burst > 0) return false
  s.burst = BURST_COOLDOWN
  for (const u of s.units)
    if (u.side === -1 && u.x < 490) {
      u.hp -= 115
      u.x += 85
    }
  s.effects.push({ x: 240, life: 0.6, blast: true })
  return true
}
export function step(s, dt) {
  if (s.result) return
  s.time += dt
  s.gold = Math.min(999, s.gold + income(s) * dt)
  s.cooldowns = s.cooldowns.map((c) => Math.max(0, c - dt))
  s.burst = Math.max(0, s.burst - dt)
  // Released arrows keep their original recipient even if the shooter dies.
  s.projectiles = s.projectiles.filter((p) => {
    const target = p.targetId === null ? null : s.units.find((u) => u.id === p.targetId && u.hp > 0)
    if (target) p.effect.x = target.x
    if (s.time < p.at) return true
    p.effect.arrived = true
    p.effect.missed = p.targetId !== null && !target
    if (target) target.hp -= p.damage
    else if (p.targetId === null) {
      if (p.side === 1) s.enemy = Math.max(0, s.enemy - p.damage)
      else s.home = Math.max(0, s.home - p.damage)
    }
    return false
  })
  s.spawn -= dt
  if (s.spawn <= 0) {
    const stage = STAGES[s.stage]
    summon(s, stage.pattern[s.enemySpawned++ % stage.pattern.length], -1)
    s.spawn = Math.max(stage.floor, stage.interval - s.time / 100)
  }
  for (const u of s.units) {
    if (u.hp <= 0) continue
    u.attack = Math.max(0, u.attack - dt)
    u.phase += dt
    const target = s.units
      .filter((v) => v.side !== u.side && v.hp > 0 && (v.x - u.x) * u.side >= -12)
      .sort((a, b) => Math.abs(a.x - u.x) - Math.abs(b.x - u.x))[0]
    const baseX = u.side === 1 ? 938 : 62
    const distance = target ? Math.abs(target.x - u.x) : Math.abs(baseX - u.x)
    if (distance <= u.range + (target ? 0 : 25)) {
      u.motion = 'attack'
      if (u.attack <= 0) {
        u.attack = u.period
        u.phase = 0
        const effect = {
          x: target?.x ?? baseX,
          life: 0.22,
          side: u.side,
          ranged: u.range > 80,
          from: u.x,
          sourceId: u.id,
          targetId: target?.id ?? null,
          releasedAt: s.time
        }
        s.effects.push(effect)
        if (effect.ranged) {
          s.projectiles.push({ targetId: effect.targetId, side: u.side, damage: u.damage, at: s.time + 0.12, effect })
        } else if (target) target.hp -= u.damage
        else if (u.side === 1) s.enemy = Math.max(0, s.enemy - u.damage)
        else s.home = Math.max(0, s.home - u.damage)
      }
    } else {
      u.motion = 'walk'
      const distanceWalked = u.speed * dt
      u.x += distanceWalked * u.side
      u.walkDistance += distanceWalked
    }
  }
  s.units = s.units.filter((u) => {
    if (u.hp > 0) return true
    if (u.side === -1) {
      s.gold = Math.min(999, s.gold + STAGES[s.stage].reward)
      s.kills++
    }
    return false
  })
  s.effects = s.effects.filter((e) => (e.life -= dt) > 0)
  if (s.home <= 0) s.result = 'defeat'
  else if (s.enemy <= 0) s.result = 'victory'
}
