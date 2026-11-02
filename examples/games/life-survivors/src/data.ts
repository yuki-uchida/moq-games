/** Static content for ジンセイガ・ツライデース: life stages, weapons ("人生の手札"), personalities and life's troubles. */

export const RUN_SECONDS = 30 * 60
export const LIFESPAN = 80
export const MAX_WEAPON_LEVEL = 8
export const MAX_PASSIVE_LEVEL = 5
export const WEAPON_SLOTS = 6
export const PASSIVE_SLOTS = 6

export type Tag =
  | 'money'
  | 'people'
  | 'accident'
  | 'sickness'
  | 'insult'
  | 'work'
  | 'love'
  | 'child'
  | 'exam'
  | 'sports'
  | 'class'

export const TAG_NAMES: Record<Tag, string> = {
  money: 'お金',
  people: '人間関係',
  accident: '事故',
  sickness: '病気',
  insult: '悪口',
  work: '仕事',
  love: '恋愛',
  child: '子育て',
  exam: '試験',
  sports: 'スポーツ',
  class: '授業'
}

export const TAG_COLORS: Record<Tag, string> = {
  money: '#e0b93f',
  people: '#e0704f',
  accident: '#9aa3ad',
  sickness: '#7bc47f',
  insult: '#b98ae6',
  work: '#6d8fd6',
  love: '#ef7fae',
  child: '#f2a65a',
  exam: '#5fc2c9',
  sports: '#59b56a',
  class: '#8d9b5b'
}

export const ageAt = (time: number) => Math.min(LIFESPAN, Math.floor((Math.max(0, time) / RUN_SECONDS) * LIFESPAN))

export interface Stage {
  age: number
  name: string
  icon: string
  ground: string
  line: string
  decor: string[]
}

export const STAGES: Stage[] = [
  { age: 0, name: '乳児期', icon: '👶', ground: '#3a2f3d', line: '#4a3d4e', decor: ['🧸', '🍼', '🧷'] },
  { age: 3, name: '幼児期', icon: '🧒', ground: '#34392c', line: '#444a39', decor: ['🧱', '🛝', '🌼'] },
  { age: 6, name: '小学生', icon: '🧒', ground: '#2c3a33', line: '#3a4a42', decor: ['🎒', '🏫', '🌸'] },
  { age: 12, name: '中学生', icon: '🧑‍🎓', ground: '#2b3443', line: '#394355', decor: ['📐', '🏀', '🚲'] },
  { age: 15, name: '高校生', icon: '🧑‍🎓', ground: '#302d45', line: '#3e3a57', decor: ['🎧', '📮', '🍞'] },
  { age: 18, name: '大学生', icon: '🧑', ground: '#3b2d3e', line: '#4b3a4f', decor: ['☕', '🍻', '📚'] },
  { age: 23, name: '社会人', icon: '🧑‍💼', ground: '#2c3238', line: '#3b434b', decor: ['🏢', '🚃', '☕'] },
  { age: 35, name: '働き盛り', icon: '🧑‍💼', ground: '#33322b', line: '#45433a', decor: ['🏠', '🚗', '🛒'] },
  { age: 50, name: '中年', icon: '🧔', ground: '#3a302a', line: '#4c4037', decor: ['⛳', '🍶', '💊'] },
  { age: 65, name: '老後', icon: '🧓', ground: '#352c2f', line: '#463a3e', decor: ['🍵', '🌳', '🪑'] },
  { age: 75, name: '寝たきり', icon: '🛏️', ground: '#2f3036', line: '#3d3f47', decor: ['💊', '🌷', '🩺'] }
]

export function stageAt(time: number): Stage {
  const age = ageAt(time)
  let stage = STAGES[0]
  for (const candidate of STAGES) if (age >= candidate.age) stage = candidate
  return stage
}

export type Behavior =
  | 'orbit'
  | 'aura'
  | 'aim'
  | 'homing'
  | 'wander'
  | 'bounce'
  | 'arc'
  | 'zone'
  | 'strike'
  | 'rain'
  | 'whip'
  | 'flail'
  | 'none'

export type TalentCategory = 'friend' | 'sports' | 'study' | 'work' | 'love' | 'hobby' | 'invest' | 'beauty'
export const TALENT_CATEGORIES: TalentCategory[] = [
  'friend',
  'sports',
  'study',
  'work',
  'love',
  'hobby',
  'invest',
  'beauty'
]

export interface WeaponDef {
  id: string
  name: string
  icon: string
  color: string
  behavior: Behavior
  /** Parent weapons are dealt at birth and never offered on level-up. */
  parent?: boolean
  category?: TalentCategory
  damage: number
  cooldown: number
  amount: number
  /** Radius of the hitbox (or of the orbit for orbiters, or length for whips). */
  area: number
  speed: number
  duration: number
  pierce: number
  knockback: number
  strong: Tag[]
  minAge: number
  desc: string
  perk?: string
  evolve?: { passive: string; name: string }
}

const weapon = (
  def: Partial<WeaponDef> & Pick<WeaponDef, 'id' | 'name' | 'icon' | 'behavior' | 'desc'>
): WeaponDef => ({
  color: '#fff',
  damage: 10,
  cooldown: 1.2,
  amount: 1,
  area: 14,
  speed: 400,
  duration: 1.5,
  pierce: 1,
  knockback: 0,
  strong: [],
  minAge: 0,
  ...def
})

export const PARENTS: WeaponDef[] = [
  weapon({
    id: 'p_toxic',
    name: '毒親',
    icon: '☠️',
    color: '#a46be0',
    behavior: 'aura',
    parent: true,
    damage: 5,
    cooldown: 0.5,
    area: 70,
    duration: 0.55,
    pierce: Infinity,
    strong: ['insult', 'people'],
    desc: '身のまわりに毒の空気。悪口や人間関係に特攻。',
    perk: '精神力の最大値 -10'
  }),
  weapon({
    id: 'p_edu',
    name: '教育親',
    icon: '📚',
    color: '#5fc2c9',
    behavior: 'aim',
    parent: true,
    damage: 13,
    cooldown: 1.0,
    speed: 420,
    area: 13,
    duration: 1.4,
    strong: ['exam', 'class'],
    desc: '参考書を一番近い敵に投げつける。試験・授業に特攻。',
    perk: '勉強の威力 +30%'
  }),
  weapon({
    id: 'p_free',
    name: '放任主義',
    icon: '🎈',
    color: '#f2c94c',
    behavior: 'wander',
    parent: true,
    damage: 10,
    cooldown: 1.3,
    amount: 2,
    speed: 260,
    duration: 2.6,
    pierce: 3,
    area: 14,
    desc: '風船がどこかへ飛んでいく。特攻はないが自由。',
    perk: '手札の枠 +1'
  }),
  weapon({
    id: 'p_weak',
    name: '頼りない親',
    icon: '🫠',
    color: '#c7b8a3',
    behavior: 'flail',
    parent: true,
    damage: 9,
    cooldown: 1.1,
    area: 70,
    duration: 0.2,
    pierce: Infinity,
    desc: 'あたふたと手をふりまわす。',
    perk: '自立が早い：経験値 +25%'
  }),
  weapon({
    id: 'p_over',
    name: '過保護',
    icon: '🛡️',
    color: '#8fb8de',
    behavior: 'orbit',
    parent: true,
    damage: 7,
    cooldown: 3.6,
    duration: 3.2,
    amount: 2,
    area: 58,
    speed: 3.4,
    pierce: Infinity,
    knockback: 260,
    strong: ['accident', 'sickness'],
    desc: '盾があなたのそばを離れない。事故・病気に特攻。',
    perk: '防御 +1'
  }),
  weapon({
    id: 'p_monster',
    name: 'モンスターペアレント',
    icon: '👹',
    color: '#e0704f',
    behavior: 'orbit',
    parent: true,
    damage: 16,
    cooldown: 4,
    duration: 3.4,
    amount: 1,
    area: 115,
    speed: 4.2,
    pierce: Infinity,
    knockback: 340,
    strong: ['people', 'class'],
    desc: 'あなたのまわりを走り回って蹴散らす。人間（教師・いじめっ子・上司）に特攻。'
  }),
  weapon({
    id: 'p_rich',
    name: 'お金持ち',
    icon: '💰',
    color: '#e0b93f',
    behavior: 'rain',
    parent: true,
    damage: 13,
    cooldown: 1.1,
    amount: 2,
    area: 34,
    duration: 0.45,
    pierce: Infinity,
    strong: ['money'],
    desc: '札束が敵の頭上に降る。各種出費に特攻。',
    perk: '投資の威力 +30%'
  }),
  weapon({
    id: 'p_gone',
    name: '蒸発済み',
    icon: '🌫️',
    color: '#9aa3ad',
    behavior: 'none',
    parent: true,
    damage: 0,
    desc: '親はいない。武器はないが、そのぶん心が強い。',
    perk: '精神力 +60・自然回復 +1/秒'
  })
]

export const TALENT_WEAPONS: WeaponDef[] = [
  weapon({
    id: 'w_friend',
    name: '友人',
    icon: '🤝',
    color: '#f2a65a',
    behavior: 'orbit',
    category: 'friend',
    damage: 10,
    cooldown: 4.6,
    duration: 3.6,
    amount: 2,
    area: 88,
    speed: 2.8,
    pierce: Infinity,
    knockback: 120,
    strong: ['people', 'insult'],
    minAge: 3,
    desc: '友だちが遊びに来て、まわりを駆け回る。人間関係・悪口に特攻。',
    evolve: { passive: 'p_kind', name: '一生の親友' }
  }),
  weapon({
    id: 'w_sports',
    name: 'スポーツ',
    icon: '⚽',
    color: '#59b56a',
    behavior: 'bounce',
    category: 'sports',
    damage: 15,
    cooldown: 2.4,
    speed: 340,
    duration: 3,
    area: 15,
    pierce: Infinity,
    knockback: 80,
    strong: ['sickness', 'sports'],
    minAge: 5,
    desc: '画面中を跳ね回るボール。病気・スポーツに特攻。',
    evolve: { passive: 'p_hot', name: '全国制覇' }
  }),
  weapon({
    id: 'w_study',
    name: '勉強',
    icon: '✏️',
    color: '#5fc2c9',
    behavior: 'aim',
    category: 'study',
    damage: 10,
    cooldown: 0.85,
    speed: 560,
    duration: 1.2,
    area: 10,
    pierce: 2,
    strong: ['exam', 'class'],
    minAge: 6,
    desc: '鉛筆が一番近い敵を貫く。試験・授業に特攻。',
    evolve: { passive: 'p_diligent', name: '首席合格' }
  }),
  weapon({
    id: 'w_love',
    name: '恋愛',
    icon: '💘',
    color: '#ef7fae',
    behavior: 'homing',
    category: 'love',
    damage: 14,
    cooldown: 1.3,
    speed: 300,
    duration: 2.2,
    area: 14,
    pierce: 1,
    strong: ['love', 'insult'],
    minAge: 12,
    desc: 'ハートが追いかけて当たると足止め。恋愛・悪口に特攻。',
    evolve: { passive: 'p_stubborn', name: '一途な愛' }
  }),
  weapon({
    id: 'w_beauty',
    name: '美容',
    icon: '✨',
    color: '#f5d0f0',
    behavior: 'whip',
    category: 'beauty',
    damage: 17,
    cooldown: 1.25,
    area: 150,
    duration: 0.2,
    pierce: Infinity,
    knockback: 60,
    strong: ['love', 'people'],
    minAge: 12,
    desc: '向いている方向を輝きで薙ぎ払う。恋愛・人間関係に特攻。',
    evolve: { passive: 'p_healthy', name: '永遠の美貌' }
  }),
  weapon({
    id: 'w_hobby',
    name: '娯楽',
    icon: '🎮',
    color: '#8f7be0',
    behavior: 'zone',
    category: 'hobby',
    damage: 7,
    cooldown: 2.8,
    duration: 3,
    area: 58,
    pierce: Infinity,
    strong: ['work', 'class'],
    minAge: 0,
    desc: '夢中になれる場所をつくり、入った敵を削る。仕事・授業に特攻。',
    evolve: { passive: 'p_optimist', name: '一生の趣味' }
  }),
  weapon({
    id: 'w_work',
    name: '仕事',
    icon: '💼',
    color: '#6d8fd6',
    behavior: 'arc',
    category: 'work',
    damage: 24,
    cooldown: 1.5,
    speed: 520,
    duration: 2.2,
    area: 18,
    pierce: 4,
    knockback: 40,
    strong: ['work', 'money'],
    minAge: 16,
    desc: 'カバンを放り投げて叩き落とす。仕事・お金に特攻。',
    evolve: { passive: 'p_bold', name: '出世街道' }
  }),
  weapon({
    id: 'w_invest',
    name: '投資',
    icon: '📈',
    color: '#e0b93f',
    behavior: 'strike',
    category: 'invest',
    damage: 9,
    cooldown: 1.7,
    amount: 2,
    area: 30,
    duration: 0.3,
    pierce: Infinity,
    strong: ['money'],
    minAge: 20,
    desc: '相場の稲妻が敵を撃つ。持っているほど威力が複利で伸びる。お金に特攻。',
    evolve: { passive: 'p_greedy', name: '複利の魔法' }
  })
]

export const WEAPONS: WeaponDef[] = [...PARENTS, ...TALENT_WEAPONS]
export const WEAPON_BY_ID = new Map(WEAPONS.map((def) => [def.id, def]))

export interface PassiveDef {
  id: string
  name: string
  icon: string
  desc: string
}

export const PASSIVES: PassiveDef[] = [
  { id: 'p_diligent', name: '勤勉', icon: '📖', desc: 'クールダウン -7%' },
  { id: 'p_stubborn', name: '頑固', icon: '🗿', desc: '防御 +1' },
  { id: 'p_hot', name: '熱い', icon: '🔥', desc: '威力 +10%' },
  { id: 'p_kind', name: '友人思い', icon: '💞', desc: '範囲 +8%・近くの仲間の精神力を癒す' },
  { id: 'p_greedy', name: 'がめつい', icon: '🤑', desc: '経験値 +10%・回収範囲 +25%・投資 +15%' },
  { id: 'p_bold', name: '図太い', icon: '🐘', desc: '精神力の最大値 +20' },
  { id: 'p_optimist', name: '楽天家', icon: '🌈', desc: '精神力の自然回復 +0.4/秒' },
  { id: 'p_healthy', name: '健康志向', icon: '🥦', desc: '移動速度 +8%' }
]
export const PASSIVE_BY_ID = new Map(PASSIVES.map((def) => [def.id, def]))

/** Weapon-level upgrades; index = new level. */
export const LEVEL_TEXT = [
  '',
  '',
  '数 +1',
  '威力 +30%',
  '範囲 +25%',
  '数 +1',
  '威力 +30%',
  'クールダウン -15%',
  '威力 +40%・数 +1'
]

export type EnemyBehavior = 'chase' | 'dash' | 'boss'

export interface EnemyDef {
  id: string
  name: string
  icon: string
  tag: Tag
  hp: number
  speed: number
  damage: number
  radius: number
  xp: number
  behavior: EnemyBehavior
}

const enemy = (
  id: string,
  name: string,
  icon: string,
  tag: Tag,
  hp: number,
  speed: number,
  damage: number,
  radius: number,
  xp: number,
  behavior: EnemyBehavior = 'chase'
): EnemyDef => ({ id, name, icon, tag, hp, speed, damage, radius, xp, behavior })

export const ENEMIES: EnemyDef[] = [
  enemy('germ', '風邪', '🦠', 'sickness', 6, 42, 4, 12, 1),
  enemy('insult', '悪口', '💬', 'insult', 4, 74, 3, 11, 1),
  enemy('bully', 'いじめっ子', '😠', 'people', 15, 56, 6, 15, 2),
  enemy('teacher', '教師', '👨‍🏫', 'people', 26, 42, 8, 17, 3),
  enemy('car', '交通事故', '🚗', 'accident', 34, 300, 22, 18, 2, 'dash'),
  enemy('lesson', '授業', '🧮', 'class', 22, 36, 6, 17, 2),
  enemy('club', 'スポーツ', '🏃', 'sports', 20, 84, 7, 15, 2),
  enemy('exam', '受験', '📝', 'exam', 42, 44, 10, 18, 4),
  enemy('expense', '出費', '💸', 'money', 24, 62, 6, 14, 2),
  enemy('girlfriend', '彼女', '💃', 'love', 50, 72, 10, 16, 4),
  enemy('job', '仕事', '📄', 'work', 48, 40, 9, 18, 3),
  enemy('boss', '上司', '😤', 'people', 84, 50, 12, 20, 5),
  enemy('cert', '資格試験', '📜', 'exam', 72, 44, 12, 19, 5),
  enemy('gossip', '噂話', '🗣️', 'insult', 32, 82, 8, 15, 3),
  enemy('kid', '子供', '🧒', 'child', 34, 92, 8, 12, 3),
  enemy('illness', '病気', '🤒', 'sickness', 120, 34, 14, 22, 6),
  enemy('loan', 'ローン', '🏦', 'money', 105, 44, 14, 22, 6),
  // Life events: one-off bosses that drop a 転機 (turning point).
  enemy('b_hs', '高校受験', '📝', 'exam', 900, 52, 18, 34, 40, 'boss'),
  enemy('b_univ', '大学受験', '🎓', 'exam', 2600, 54, 22, 38, 60, 'boss'),
  enemy('b_shukatsu', '就職活動', '👔', 'work', 5200, 56, 26, 38, 80, 'boss'),
  enemy('b_wedding', '結婚式の出費', '💒', 'money', 8500, 52, 28, 40, 100, 'boss'),
  enemy('b_mortgage', '住宅ローン', '🏠', 'money', 15000, 50, 32, 44, 130, 'boss'),
  enemy('b_rebel', '反抗期', '😡', 'child', 21000, 64, 34, 40, 160, 'boss'),
  enemy('b_layoff', 'リストラ', '📉', 'work', 30000, 56, 38, 44, 200, 'boss'),
  enemy('b_illness', '大病', '🏥', 'sickness', 42000, 46, 42, 48, 260, 'boss')
]
export const ENEMY_BY_ID = new Map(ENEMIES.map((def) => [def.id, def]))
export const ENEMY_INDEX = new Map(ENEMIES.map((def, index) => [def.id, index]))

/** Who the world throws at you, by age. Weights are relative. */
export const POOLS: { untilAge: number; enemies: [string, number][] }[] = [
  {
    untilAge: 3,
    enemies: [
      ['germ', 3],
      ['insult', 2]
    ]
  },
  {
    untilAge: 6,
    enemies: [
      ['germ', 3],
      ['insult', 3],
      ['bully', 2],
      ['car', 0.15]
    ]
  },
  {
    untilAge: 12,
    enemies: [
      ['bully', 3],
      ['teacher', 1.5],
      ['lesson', 3],
      ['insult', 3],
      ['club', 1.5],
      ['germ', 1],
      ['car', 0.2]
    ]
  },
  {
    untilAge: 18,
    enemies: [
      ['lesson', 3],
      ['exam', 2.5],
      ['club', 2],
      ['bully', 2],
      ['teacher', 1.5],
      ['insult', 2],
      ['girlfriend', 0.8],
      ['car', 0.25]
    ]
  },
  {
    untilAge: 23,
    enemies: [
      ['exam', 2],
      ['expense', 3],
      ['girlfriend', 2],
      ['job', 1.5],
      ['insult', 2],
      ['gossip', 1],
      ['car', 0.3]
    ]
  },
  {
    untilAge: 35,
    enemies: [
      ['job', 3],
      ['expense', 3],
      ['boss', 1.5],
      ['girlfriend', 1.5],
      ['cert', 1.5],
      ['gossip', 2],
      ['car', 0.3]
    ]
  },
  {
    untilAge: 50,
    enemies: [
      ['kid', 3],
      ['job', 2.5],
      ['expense', 2.5],
      ['boss', 1.5],
      ['gossip', 1.5],
      ['loan', 1],
      ['illness', 0.6],
      ['car', 0.35]
    ]
  },
  {
    untilAge: 65,
    enemies: [
      ['illness', 2],
      ['loan', 2],
      ['job', 2],
      ['gossip', 2],
      ['kid', 1.5],
      ['expense', 2],
      ['car', 0.4]
    ]
  },
  {
    untilAge: 999,
    enemies: [
      ['illness', 3],
      ['loan', 2],
      ['germ', 2],
      ['gossip', 2],
      ['expense', 2],
      ['insult', 1.5],
      ['car', 0.5]
    ]
  }
]

/** Scripted life events (seconds into the run). */
export const EVENTS: { at: number; boss?: string; swarm?: string; count?: number; text: string }[] = [
  { at: 150, swarm: 'insult', count: 30, text: 'クラスで悪口が広まった！' },
  { at: 300, boss: 'b_hs', text: '高校受験がやってきた！' },
  { at: 450, boss: 'b_univ', text: '大学受験がやってきた！' },
  { at: 570, swarm: 'car', count: 10, text: '免許を取った。事故に注意！' },
  { at: 630, boss: 'b_shukatsu', text: '就職活動が始まった！' },
  { at: 840, boss: 'b_wedding', text: '結婚式の請求書が届いた！' },
  { at: 960, swarm: 'gossip', count: 50, text: 'SNSで炎上した！' },
  { at: 1050, boss: 'b_mortgage', text: '住宅ローンを組んだ！' },
  { at: 1230, boss: 'b_rebel', text: '子供が反抗期に入った！' },
  { at: 1380, swarm: 'kid', count: 40, text: '子供の友だちが大集合！' },
  { at: 1440, boss: 'b_layoff', text: 'リストラの噂…！' },
  { at: 1620, boss: 'b_illness', text: '大きな病気が見つかった！' },
  { at: 1740, swarm: 'illness', count: 60, text: '最後の試練。あと少し…！' }
]

export const PLAYER_COLORS = ['#ffd166', '#06d6a0', '#ef476f', '#4cc9f0', '#f78c6b', '#b388eb', '#90be6d', '#f9c74f']
export const MAX_GAME_PLAYERS = 8
