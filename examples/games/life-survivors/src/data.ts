/** Static content for ジンセイガ・ツライデース: life stages, weapons ("人生の手札"), personalities and life's troubles. */

export const RUN_SECONDS = 15 * 60
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

export const ageAt = (time: number) =>
  Math.min(LIFESPAN, Math.floor((Math.max(0, time) / RUN_SECONDS) ** 1.4 * LIFESPAN))

export const timeAtAge = (age: number) => RUN_SECONDS * (Math.max(0, age) / LIFESPAN) ** (1 / 1.4)

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
  { age: 18, name: '青年期', icon: '🧑', ground: '#3b2d3e', line: '#4b3a4f', decor: ['☕', '🍻', '📚'] },
  { age: 23, name: '成人期', icon: '🧑', ground: '#2c3238', line: '#3b434b', decor: ['🏢', '🚃', '☕'] },
  { age: 35, name: '壮年期', icon: '🧑', ground: '#33322b', line: '#45433a', decor: ['🏠', '🚗', '🛒'] },
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
  | 'chain'
  | 'pet'
  | 'observe'
  | 'slam'
  | 'beam'
  | 'barrage'
  | 'boomerang'
  | 'nova'
  | 'sweep'
  | 'mine'
  | 'gamble'
  | 'trail'
  | 'food'
  | 'raid'
  | 'garden'
  | 'none'

export type TalentCategory = 'friend' | 'love' | 'sports' | 'hobby' | 'study' | 'invest'
export const TALENT_NAMES: Record<TalentCategory, string> = {
  friend: '対人',
  sports: '身体',
  study: '知性',
  love: '恋愛',
  hobby: '創造',
  invest: '資産'
}
export const TALENT_CATEGORIES: TalentCategory[] = ['friend', 'love', 'sports', 'hobby', 'study', 'invest']

export interface WeaponDef {
  id: string
  name: string
  icon: string
  color: string
  behavior: Behavior
  /** Parent weapons are dealt at birth and never offered on level-up. */
  parent?: boolean
  category: TalentCategory
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
  def: Partial<WeaponDef> & Pick<WeaponDef, 'id' | 'name' | 'icon' | 'behavior' | 'desc' | 'category'>
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
    category: 'friend',
    name: '毒親',
    icon: '☠️',
    color: '#a46be0',
    behavior: 'aura',
    parent: true,
    damage: 4,
    cooldown: 1.0,
    area: 35,
    duration: 0.55,
    pierce: Infinity,
    strong: ['insult', 'people'],
    desc: '身のまわりに常時毒の空気。クールダウン無効、弾数・効果時間無効。特攻：悪口・人間関係。',
    perk: '全武器の威力 +5%・最大精神力 -10。自然回復なし（性格・仲間・家庭）／食事・レベルアップで回復可。18歳未満は親を含めて手札3枠'
  }),
  weapon({
    id: 'p_edu',
    category: 'study',
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
    desc: '参考書を一番近い敵に投げつける。特攻：試験・授業。',
    perk: '勉強の威力 +30%'
  }),
  weapon({
    id: 'p_free',
    category: 'hobby',
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
    desc: '風船が真上へ飛び、割れて周囲を爆破・吹き飛ばす。特攻なし。',
    perk: '手札の枠 +1'
  }),
  weapon({
    id: 'p_weak',
    category: 'friend',
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
    perk: '自立が早い：経験値 +25%、防御 +1'
  }),
  weapon({
    id: 'p_over',
    category: 'love',
    name: '過保護',
    icon: '🛡️',
    color: '#8fb8de',
    behavior: 'orbit',
    parent: true,
    damage: 7,
    cooldown: 3.6,
    duration: 3.2,
    amount: 1,
    area: 58,
    speed: 3.4,
    pierce: Infinity,
    knockback: 260,
    strong: ['accident', 'sickness'],
    desc: '敵を追わず盾で接触攻撃・吹き飛ばす。盾は敵の投射物も1回防ぐ。特攻：事故・病気。詳しくは「?」へ。',
    perk: '防御 +1'
  }),
  weapon({
    id: 'p_monster',
    category: 'friend',
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
    desc: '子のそばを離れて近くの敵を追い回す。最大2人。特攻：人間関係・授業。'
  }),
  weapon({
    id: 'p_rich',
    category: 'invest',
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
    desc: '札束が敵の頭上に降る。特攻：お金。',
    perk: '投資の威力 +30%'
  }),
  weapon({
    id: 'p_yankee',
    category: 'sports',
    name: 'ヤンキー親',
    icon: '👊',
    color: '#7a62a1',
    behavior: 'raid',
    parent: true,
    damage: 16,
    cooldown: 2,
    duration: 1.5,
    amount: 1,
    area: 170,
    pierce: Infinity,
    knockback: 300,
    strong: ['people', 'class'],
    desc: '最も近い敵に飛び蹴りし、戻ってくる。特攻：人間関係・授業。'
  }),
  weapon({
    id: 'p_gone',
    category: 'sports',
    name: '蒸発済み',
    icon: '🌫️',
    color: '#9aa3ad',
    behavior: 'none',
    parent: true,
    damage: 0,
    desc: '親の武器なし。強い心と、生まれたときの才能で自立。',
    perk: '最大精神力 +60・自然回復 +1/秒・誕生時に幼少期の才能を1枚選択'
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
    speed: 1.96,
    pierce: Infinity,
    knockback: 120,
    strong: ['people', 'insult'],
    minAge: 3,
    desc: '友だちが遊びに来て、まわりを駆け回り、敵の弾を打ち消す。特攻：人間関係・悪口。',
    evolve: { passive: 'p_kind', name: '一生の親友' }
  }),
  weapon({
    id: 'w_sports',
    name: 'スポーツ',
    icon: '⚽',
    color: '#59b56a',
    behavior: 'bounce',
    category: 'sports',
    damage: 10.5,
    cooldown: 2.4,
    speed: 340,
    duration: 3,
    area: 15,
    pierce: Infinity,
    knockback: 80,
    strong: ['sickness', 'sports'],
    minAge: 5,
    desc: '年齢で変化：サッカー→野球→バスケ→テニス→ゴルフ→ゲートボール。特攻：病気・スポーツ。',
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
    minAge: 3,
    desc: '鉛筆が一番近い敵を貫く。特攻：試験・授業。',
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
    desc: 'ハートが追いかけて当たると足止め。特攻：恋愛・悪口。',
    evolve: { passive: 'p_stubborn', name: '一途な愛' }
  }),
  weapon({
    id: 'w_beauty',
    name: '美容',
    icon: '✨',
    color: '#f5d0f0',
    behavior: 'whip',
    category: 'love',
    damage: 17,
    cooldown: 1.25,
    area: 150,
    duration: 0.2,
    pierce: Infinity,
    knockback: 60,
    strong: ['love', 'people'],
    minAge: 12,
    desc: '向いている方向を輝きで薙ぎ払う。特攻：恋愛・人間関係。',
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
    minAge: 8,
    desc: '夢中になれる場所をつくり、入った敵を削る。特攻：仕事・授業。',
    evolve: { passive: 'p_optimist', name: '一生の趣味' }
  }),
  weapon({
    id: 'w_work',
    name: '仕事',
    icon: '💼',
    color: '#6d8fd6',
    behavior: 'arc',
    category: 'study',
    damage: 24,
    cooldown: 1.5,
    speed: 520,
    duration: 2.2,
    area: 18,
    pierce: 4,
    knockback: 40,
    strong: ['work', 'money'],
    minAge: 16,
    desc: 'カバンを放り投げて叩き落とす。特攻：仕事・お金。',
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
    desc: '稲妻で敵を攻撃。所持時間に応じて威力上昇。特攻：お金。',
    evolve: { passive: 'p_greedy', name: '複利の魔法' }
  }),
  weapon({
    id: 'w_sns',
    name: 'SNS',
    icon: '📱',
    color: '#4cc9f0',
    behavior: 'chain',
    category: 'friend',
    damage: 11,
    cooldown: 1.5,
    amount: 1,
    area: 14,
    duration: 0.25,
    pierce: Infinity,
    strong: ['insult', 'people'],
    minAge: 12,
    desc: '投稿が次々に伝染し、敵から敵へ飛び移る。特攻：悪口・人間関係。',
    evolve: { passive: 'p_savvy', name: 'バズの連鎖' }
  }),
  weapon({
    id: 'w_pet',
    name: 'ペット',
    icon: '🐕',
    color: '#f2a65a',
    behavior: 'pet',
    category: 'friend',
    damage: 7,
    cooldown: 5,
    amount: 1,
    area: 12,
    speed: 260,
    duration: 5.5,
    pierce: Infinity,
    strong: ['insult', 'child'],
    minAge: 3,
    desc: '弾数に応じて犬・猫・ウサギ・インコ・ハムスターが順に登場。敵の弾を打ち消す。子犬から成長し、迎えて20年でお別れ。Lv MAXなら性格「愛犬との思い出」を獲得。特攻：悪口・子育て。',
    evolve: { passive: 'p_optimist', name: '忠犬' }
  }),
  weapon({
    id: 'w_muscle',
    name: '筋トレ',
    icon: '💪',
    color: '#59b56a',
    behavior: 'slam',
    category: 'sports',
    damage: 24,
    cooldown: 2.6,
    amount: 1,
    area: 110,
    duration: 0.4,
    pierce: Infinity,
    knockback: 420,
    strong: ['sports', 'accident'],
    minAge: 12,
    desc: '足もとを叩きつけて衝撃波。近くの敵をまとめて吹き飛ばす。特攻：スポーツ・事故。',
    evolve: { passive: 'p_stubborn', name: '鋼の肉体' }
  }),
  weapon({
    id: 'w_reading',
    name: '読書',
    icon: '📖',
    color: '#8fb8de',
    behavior: 'beam',
    category: 'study',
    damage: 11,
    cooldown: 2,
    amount: 1,
    area: 340,
    duration: 0.6,
    pierce: Infinity,
    strong: ['class', 'exam'],
    minAge: 5,
    desc: '知識の光線が向いた方向を貫く。特攻：授業・試験。',
    evolve: { passive: 'p_curious', name: '博覧強記' }
  }),
  weapon({
    id: 'w_overtime',
    name: '残業',
    icon: '🖇️',
    color: '#6d8fd6',
    behavior: 'barrage',
    category: 'study',
    damage: 6,
    cooldown: 2.3,
    amount: 1,
    area: 8,
    speed: 640,
    duration: 1.1,
    pierce: 1,
    strong: ['work', 'class'],
    minAge: 22,
    desc: 'ホチキスの針を連射する。特攻：仕事・授業。',
    evolve: { passive: 'p_clever', name: '社畜の鑑' }
  }),
  weapon({
    id: 'w_ring',
    name: '結婚指輪',
    icon: '💍',
    color: '#ffd166',
    behavior: 'boomerang',
    category: 'love',
    damage: 14,
    cooldown: 2,
    amount: 1,
    area: 17,
    speed: 560,
    duration: 2.4,
    pierce: Infinity,
    strong: ['love', 'money'],
    minAge: 22,
    desc: '投げた指輪は必ずあなたの元へ戻ってくる。特攻：恋愛・お金。',
    evolve: { passive: 'p_kind', name: '銀婚式' }
  }),
  weapon({
    id: 'w_karaoke',
    name: 'カラオケ',
    icon: '🎤',
    color: '#ef7fae',
    behavior: 'nova',
    category: 'hobby',
    damage: 16,
    cooldown: 2.7,
    amount: 1,
    area: 170,
    duration: 1.2,
    pierce: Infinity,
    knockback: 60,
    strong: ['work', 'insult'],
    minAge: 12,
    desc: '歌声が前方に扇状に広がる。特攻：仕事・悪口。',
    evolve: { passive: 'p_hot', name: '魂のシャウト' }
  }),
  weapon({
    id: 'w_travel',
    name: 'アウトドア',
    icon: '🚲',
    color: '#5fc2c9',
    behavior: 'sweep',
    category: 'hobby',
    damage: 13,
    cooldown: 2.2,
    amount: 1,
    area: 16,
    speed: 520,
    duration: 2.7,
    pierce: Infinity,
    strong: ['work', 'sickness'],
    minAge: 0,
    desc: '三輪車→自転車→バイク→車→飛行機と年齢で変化し、画面を横切る。特攻：仕事・病気。',
    evolve: { passive: 'p_curious', name: '世界一周' }
  }),
  weapon({
    id: 'w_savings',
    name: '貯金',
    icon: '🐷',
    color: '#f29cc0',
    behavior: 'mine',
    category: 'invest',
    damage: 32,
    cooldown: 2.4,
    amount: 1,
    area: 90,
    duration: 8,
    pierce: Infinity,
    strong: ['money', 'accident'],
    minAge: 6,
    desc: '置いた貯金箱に敵が触れると弾けて大爆発。特攻：お金・事故。',
    evolve: { passive: 'p_bold', name: '老後の蓄え' }
  }),
  weapon({
    id: 'w_gamble',
    name: 'ギャンブル',
    icon: '🎁',
    color: '#e0b93f',
    behavior: 'gamble',
    category: 'invest',
    damage: 11,
    cooldown: 1.5,
    amount: 1,
    area: 12,
    speed: 380,
    duration: 1.5,
    pierce: 1,
    strong: ['money'],
    minAge: 12,
    desc: '12秒ごとに攻撃武器を抽選し、次の抽選まで使用。年齢で変化：課金→ポーカー→パチンコ→競馬。',
    evolve: { passive: 'p_lucky', name: '大穴的中' }
  }),
  weapon({
    id: 'w_perfume',
    name: '香水',
    icon: '🌸',
    color: '#b98ae6',
    behavior: 'trail',
    category: 'love',
    damage: 6,
    cooldown: 0.35,
    amount: 1,
    area: 34,
    duration: 2,
    pierce: Infinity,
    strong: ['love', 'people'],
    minAge: 15,
    desc: '歩いた跡に香りが残り、触れた敵に継続ダメージ。クールダウン無効。特攻：恋愛・人間関係。',
    evolve: { passive: 'p_savvy', name: '魅惑のフェロモン' }
  }),
  weapon({
    id: 'w_cooking',
    name: '料理',
    icon: '🍳',
    color: '#e0704f',
    behavior: 'food',
    category: 'love',
    damage: 0,
    cooldown: 60,
    minAge: 10,
    desc: '60秒ごとに自分専用の料理を1個設置。取得すると攻撃+25%・防御+2・移動速度+20%のいずれかが60秒続くか、HPを40回復。Lvで効果上昇。',
    evolve: { passive: 'p_healthy', name: 'おふくろの味' }
  }),
  weapon({
    id: 'w_observe',
    name: '生き物観察',
    icon: '🐜',
    color: '#8ccc69',
    behavior: 'observe',
    category: 'hobby',
    damage: 4,
    cooldown: 6,
    area: 135,
    duration: 6,
    pierce: Infinity,
    minAge: 3,
    desc: '2秒止まると生き物を召喚。効果時間中は敵を引き寄せて減速・小ダメージ。対象はLv+1体まで。クールダウン・弾数無効、効果時間有効。',
    evolve: { passive: 'p_curious', name: '生き物博士' }
  }),
  weapon({
    id: 'w_garden',
    name: 'ガーデニング',
    icon: '🌻',
    color: '#8ccc69',
    behavior: 'garden',
    category: 'hobby',
    damage: 3.5,
    cooldown: 2.4,
    area: 24,
    speed: 320,
    duration: 3.2,
    pierce: Infinity,
    strong: ['work', 'sickness'],
    minAge: 6,
    desc: '種を弧を描いて投げ、着地後に花壇が咲き継続攻撃。弾速で早く着地し、効果時間で長く咲く。特攻：仕事・病気。',
    evolve: { passive: 'p_curious', name: 'ひみつの花園' }
  })
]

export const WEAPONS: WeaponDef[] = [...PARENTS, ...TALENT_WEAPONS]
export const WEAPON_BY_ID = new Map(WEAPONS.map((def) => [def.id, def]))
export const WEAPON_INDEX = new Map(WEAPONS.map((def, index) => [def.id, index]))

export interface PassiveDef {
  category: TalentCategory
  id: string
  name: string
  icon: string
  desc: string
}

export const PASSIVES: PassiveDef[] = [
  { id: 'p_diligent', category: 'study', name: '勤勉', icon: '📖', desc: 'クールダウン -7%' },
  { id: 'p_stubborn', category: 'sports', name: '頑固', icon: '🗿', desc: '防御 +1' },
  { id: 'p_hot', category: 'love', name: '熱い', icon: '🔥', desc: '威力 +10%' },
  { id: 'p_kind', category: 'friend', name: '友人思い', icon: '💞', desc: '範囲 +8%・近くの仲間の精神力を癒す' },
  { id: 'p_greedy', category: 'invest', name: 'がめつい', icon: '🤑', desc: '経験値 +10%・回収範囲 +25%' },
  { id: 'p_bold', category: 'sports', name: '図太い', icon: '🐘', desc: '最大精神力 +20' },
  { id: 'p_optimist', category: 'love', name: '楽天家', icon: '🌈', desc: '精神力の自然回復 +0.4/秒' },
  { id: 'p_healthy', category: 'sports', name: '健康志向', icon: '🥦', desc: '移動速度 +8%' },
  { id: 'p_lucky', category: 'invest', name: '運がいい', icon: '🍀', desc: '会心率 +5%・転機の札が増えることも' },
  {
    id: 'p_clever',
    category: 'hobby',
    name: '器用',
    icon: '🧶',
    desc: '発射・召喚数 +1（Lv1・Lv4／武器による）・威力 +3%'
  },
  { id: 'p_curious', category: 'hobby', name: '好奇心', icon: '🔭', desc: '効果時間 +10%・弾の速さ +10%' },
  { id: 'p_savvy', category: 'friend', name: '空気が読める', icon: '👀', desc: '特攻の倍率 +0.25' },
  { id: 'p_grand', category: 'sports', name: '豪快', icon: '💥', desc: '弾数 +1（武器による）・クールダウン +10%' },
  { id: 'p_large', category: 'sports', name: '大柄', icon: '🧍', desc: '最大精神力 +15・体と当たり判定 +5%' },
  {
    id: 'p_small',
    category: 'sports',
    name: '小柄',
    icon: '🐭',
    desc: '最大精神力 -10・体と当たり判定 -5%・移動速度 +3%'
  },
  { id: 'p_hasty', category: 'hobby', name: 'せっかち', icon: '⏱️', desc: 'クールダウン -5%・効果時間 -5%' },
  { id: 'p_cautious', category: 'study', name: '慎重', icon: '🔍', desc: '弾の速さ -5%・範囲 +5%' },
  { id: 'p_competitive', category: 'love', name: '負けず嫌い', icon: '💪', desc: '精神力が半分以下の間、威力 +10%' },
  {
    id: 'p_petmemory',
    category: 'friend',
    name: '愛犬との思い出',
    icon: '🐾',
    desc: 'Lv MAXのペットとのお別れで獲得。自然回復 +0.4/秒・性格枠の消費なし'
  }
]

export const INHERITED_PASSIVES: PassiveDef[] = [
  { id: 'p_affection', category: 'love', name: '愛情', icon: '💗', desc: '精神力の自然回復 +0.4/秒' },
  { id: 'p_acceptance', category: 'friend', name: '包容力', icon: '🫂', desc: '最大精神力 +20' },
  { id: 'p_patience', category: 'sports', name: '忍耐力', icon: '🪨', desc: '防御 +1' },
  { id: 'p_courage', category: 'sports', name: '勇気', icon: '🦁', desc: '威力 +10%' }
]
export const PASSIVE_BY_ID = new Map([...PASSIVES, ...INHERITED_PASSIVES].map((def) => [def.id, def]))

export const PARENT_LEGACIES: Record<string, string> = {
  p_over: 'p_affection',
  p_toxic: 'p_acceptance',
  p_monster: 'p_patience',
  p_free: 'p_courage',
  p_edu: 'p_diligent',
  p_weak: 'p_healthy',
  p_rich: 'p_greedy',
  p_yankee: 'p_hot'
}

const standardLevels = [
  '数 +1',
  '威力 +30%',
  '範囲 +25%',
  '数 +1',
  '威力 +30%',
  'クールダウン -15%',
  '威力 +40%・数 +1'
]

export const WEAPON_LEVEL_TEXT: Record<string, readonly string[]> = {
  p_toxic: ['威力 +30%', '威力 +30%', '範囲 +25%', '威力 +30%', '威力 +30%', '効果なし（Lv8で強化）', '威力 +82%'],
  p_edu: ['数 +1', '威力 +30%', '範囲 +25%・貫通 +1', '数 +1', '威力 +30%', 'クールダウン -15%', '威力 +40%・数 +1'],
  p_free: standardLevels,
  p_weak: [
    '数 +1',
    '威力 +30%・数 +1',
    '範囲 +25%・数 +1',
    '数 +1',
    '威力 +30%・数 +1',
    'クールダウン -15%・数 +1',
    '威力 +40%・数 +1'
  ],
  p_over: ['効果なし', '威力 +30%', '範囲 +25%・人数 +1', '効果なし', '威力 +30%', 'クールダウン -15%', '威力 +40%'],
  p_monster: ['数 +1（最大2体）', '威力 +30%', '範囲 +25%', '効果なし', '威力 +30%', 'クールダウン -15%', '威力 +40%'],
  p_rich: standardLevels,
  p_yankee: ['効果なし', '威力 +30%', '範囲 +40%', '効果なし', '威力 +30%', 'クールダウン -15%', '威力 +40%'],
  p_gone: ['効果なし', '効果なし', '効果なし', '効果なし', '効果なし', '効果なし', '効果なし'],
  w_friend: standardLevels,
  w_sports: [
    '効果時間 +3秒',
    '威力 +30%',
    '範囲 +25%・貫通 +1',
    '効果時間 +3秒',
    '威力 +30%',
    'クールダウン -15%',
    '威力 +40%・効果時間 +3秒'
  ],
  w_study: ['数 +1', '威力 +30%', '範囲 +25%・貫通 +1', '数 +1', '威力 +30%', 'クールダウン -15%', '威力 +40%・数 +1'],
  w_love: ['数 +1', '威力 +30%', '範囲 +25%・貫通 +1', '数 +1', '威力 +30%', 'クールダウン -15%', '威力 +40%・数 +1'],
  w_beauty: [
    '数 +1',
    '威力 +30%・数 +1',
    '範囲 +25%・数 +1',
    '数 +1',
    '威力 +30%・数 +1',
    'クールダウン -15%・数 +1',
    '威力 +40%・数 +1'
  ],
  w_hobby: standardLevels,
  w_work: standardLevels,
  w_invest: standardLevels,
  w_sns: ['連鎖数 +1', '威力 +30%', '範囲 +25%', '連鎖数 +1', '威力 +30%', 'クールダウン -15%', '威力 +40%・連鎖数 +1'],
  w_pet: standardLevels,
  w_muscle: ['効果なし', '威力 +30%', '範囲 +25%', '効果なし', '威力 +30%', 'クールダウン -15%', '威力 +40%'],
  w_reading: standardLevels,
  w_overtime: standardLevels,
  w_ring: standardLevels,
  w_karaoke: standardLevels,
  w_travel: standardLevels,
  w_savings: standardLevels,
  w_gamble: [
    '抽選した武器の数 +1（武器による）',
    '抽選した武器の威力 +30%',
    '抽選した武器の範囲 +25%（武器による）',
    '抽選した武器の数 +1（武器による）',
    '抽選した武器の威力 +30%',
    '抽選した武器のクールダウン -15%（武器による）',
    '抽選した武器の威力 +40%・数 +1（武器による）'
  ],
  w_perfume: ['数 +1', '威力 +30%', '範囲 +25%', '数 +1', '威力 +30%', '効果なし（Lv8で強化）', '威力 +40%・数 +1'],
  w_cooking: Array(7).fill('料理の効果 +10%'),
  w_observe: [
    '対象数 +1',
    '威力 +30%・対象数 +1',
    '範囲 +25%・対象数 +1',
    '対象数 +1',
    '威力 +30%・対象数 +1',
    '対象数 +1',
    '威力 +40%・対象数 +1'
  ],
  w_garden: standardLevels
}

export interface WeaponLevelUpgrade {
  text: string
  damage?: number
  amount?: number
  area?: number
  cooldown?: number
  duration?: number
  pierce?: number
  targets?: number
  foodPower?: number
}

type UpgradeProfile = 'standard' | 'piercing' | 'everyCount' | 'raid' | 'sports' | 'observe' | 'food'

const weaponUpgradeProfiles: Record<string, UpgradeProfile> = {
  p_toxic: 'standard',
  p_edu: 'piercing',
  p_free: 'standard',
  p_weak: 'everyCount',
  p_over: 'standard',
  p_monster: 'standard',
  p_rich: 'standard',
  p_yankee: 'raid',
  p_gone: 'standard',
  w_friend: 'standard',
  w_sports: 'sports',
  w_study: 'piercing',
  w_love: 'piercing',
  w_beauty: 'everyCount',
  w_hobby: 'standard',
  w_work: 'standard',
  w_invest: 'standard',
  w_sns: 'standard',
  w_pet: 'standard',
  w_muscle: 'standard',
  w_reading: 'standard',
  w_overtime: 'standard',
  w_ring: 'standard',
  w_karaoke: 'standard',
  w_travel: 'standard',
  w_savings: 'standard',
  w_gamble: 'standard',
  w_perfume: 'standard',
  w_cooking: 'food',
  w_observe: 'observe',
  w_garden: 'standard'
}

const weaponUpgradeOverrides: Record<string, Record<number, Partial<WeaponLevelUpgrade>>> = {
  p_toxic: { 2: { damage: 1.3 }, 5: { damage: 1.3 }, 8: { damage: 1.82 } }
}

export const WEAPON_LEVELS: Record<string, WeaponLevelUpgrade[]> = Object.fromEntries(
  Object.entries(weaponUpgradeProfiles).map(([id, profile]) => [
    id,
    WEAPON_LEVEL_TEXT[id].map((text, index) => {
      const level = index + 2
      const countLevel = level === 2 || level === 5 || level === 8
      return {
        text,
        damage: level === 3 || level === 6 ? 1.3 : level === 8 ? 1.4 : 1,
        amount: profile === 'sports' ? 0 : profile === 'everyCount' ? 1 : countLevel ? 1 : 0,
        area: level === 4 ? (profile === 'raid' ? 1.4 : 1.25) : 1,
        cooldown: level === 7 ? 0.85 : 1,
        duration: profile === 'sports' && countLevel ? 1 : 0,
        pierce: (profile === 'piercing' || profile === 'sports') && level === 4 ? 1 : 0,
        targets: profile === 'observe' ? 1 : 0,
        foodPower: profile === 'food' ? 0.1 : 0,
        ...weaponUpgradeOverrides[id]?.[level]
      }
    })
  ])
)

export type EnemyBehavior =
  | 'chase'
  | 'dash'
  | 'boss'
  | 'swarm'
  | 'charger'
  | 'shooter'
  | 'tank'
  | 'splitter'
  | 'circler'
  | 'blink'
  | 'ghost'

/** Boss attack patterns. */
export type BossPattern = 'ring' | 'spiral' | 'summon' | 'charge'

/** What a shooter throws (bullet = a BULLET_KINDS name). */
export interface EnemyShot {
  bullet: string
  speed: number
  damage: number
  cooldown: number
  /** Bullets per volley (default 1). */
  count?: number
  /** Total arc of the volley in radians (default 0.5). */
  spread?: number
  /** Fire `count` bullets in a full ring instead of an aimed fan. */
  ring?: boolean
}

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
  /** Dash speed of chargers and of a boss's charge pattern. */
  dash?: number
  /** Splitters: what they break into on death. */
  child?: string
  children?: number
  /** Shooters. */
  shot?: EnemyShot
  /** Bosses: attack patterns, alternating by cooldown. */
  patterns?: BossPattern[]
  /** Bosses: what the `summon` pattern calls. */
  minion?: string
  /** Only ever appears as a child or a minion, never from the age pools. */
  minor?: boolean
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
  behavior: EnemyBehavior = 'chase',
  extra: Partial<EnemyDef> = {}
): EnemyDef => ({ id, name, icon, tag, hp, speed, damage, radius, xp, behavior, ...extra })

const ORIGINAL_ENEMIES: EnemyDef[] = [
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
  enemy('b_hs', '高校受験', '📝', 'exam', 900, 52, 18, 34, 40, 'boss', { patterns: ['ring'] }),
  enemy('b_univ', '大学受験', '🎓', 'exam', 2600, 54, 22, 38, 60, 'boss', { patterns: ['spiral'] }),
  enemy('b_shukatsu', '就職活動', '👔', 'work', 5200, 56, 26, 38, 80, 'boss', { patterns: ['summon'], minion: 'job' }),
  enemy('b_wedding', '結婚式の出費', '💒', 'money', 8500, 52, 28, 40, 100, 'boss', { patterns: ['ring'] }),
  enemy('b_mortgage', '住宅ローン', '🏠', 'money', 15000, 50, 32, 44, 130, 'boss', {
    patterns: ['summon'],
    minion: 'expense'
  }),
  enemy('b_rebel', '反抗期', '😡', 'child', 21000, 64, 34, 40, 160, 'boss', { patterns: ['charge'], dash: 390 }),
  enemy('b_layoff', 'リストラ', '📉', 'work', 30000, 56, 38, 44, 200, 'boss', {
    patterns: ['spiral', 'summon'],
    minion: 'deadline'
  }),
  enemy('b_illness', '大病', '🏥', 'sickness', 42000, 46, 42, 48, 260, 'boss', {
    patterns: ['ring', 'summon'],
    minion: 'germ'
  }),
  // Everyday troubles with their own way of moving (appended: ids are snapshot indices).
  enemy('mosquito', '蚊', '🦟', 'sickness', 3, 110, 3, 10, 1, 'swarm'),
  enemy('vaccine', '注射', '💉', 'sickness', 14, 60, 8, 13, 2, 'charger', { dash: 340 }),
  enemy('dog', '野良犬', '🐕', 'accident', 22, 95, 9, 15, 2, 'charger', { dash: 380 }),
  enemy('pepper', 'ピーマン', '🫑', 'class', 18, 50, 6, 15, 2, 'shooter', {
    shot: { bullet: 'seed', speed: 170, damage: 4, cooldown: 3 }
  }),
  enemy('homework', '宿題', '📚', 'class', 30, 40, 7, 17, 3, 'splitter', { child: 'worksheet', children: 3 }),
  enemy('worksheet', 'プリント', '📃', 'class', 6, 105, 4, 11, 1, 'chase', { minor: true }),
  enemy('dodgeball', 'ドッジボール', '🔴', 'sports', 24, 52, 7, 15, 2, 'shooter', {
    shot: { bullet: 'ball', speed: 200, damage: 5, cooldown: 2.8 }
  }),
  enemy('pimple', 'ニキビ', '🔴', 'sickness', 10, 70, 5, 12, 1, 'swarm'),
  enemy('crush', '片思い', '💔', 'love', 34, 90, 9, 15, 3, 'circler'),
  enemy('senpai', '先輩', '🧑‍🎓', 'people', 140, 34, 13, 20, 6, 'tank'),
  enemy('drinking', '飲み会', '🍺', 'people', 46, 60, 10, 17, 4, 'shooter', {
    shot: { bullet: 'beer', speed: 160, damage: 4, cooldown: 3.6, count: 3, spread: 0.55 }
  }),
  enemy('scholarship', '奨学金', '🎓', 'money', 160, 32, 13, 21, 7, 'tank'),
  enemy('deadline', '締め切り', '⏰', 'work', 44, 70, 12, 16, 4, 'charger', { dash: 420 }),
  enemy('meeting', '会議', '🗂️', 'work', 220, 30, 14, 22, 8, 'tank'),
  enemy('spam', '迷惑メール', '📧', 'work', 12, 120, 5, 11, 1, 'swarm'),
  enemy('powerhara', 'パワハラ', '🗯️', 'insult', 70, 48, 13, 18, 5, 'shooter', {
    shot: { bullet: 'shout', speed: 150, damage: 6, cooldown: 3.2, count: 3, spread: 0.7 }
  }),
  enemy('train', '満員電車', '🚃', 'accident', 60, 340, 26, 22, 3, 'dash'),
  enemy('tax', '税金', '🧾', 'money', 90, 46, 12, 18, 5, 'splitter', { child: 'coin', children: 4 }),
  enemy('coin', '小銭', '🪙', 'money', 10, 110, 5, 10, 1, 'chase', { minor: true }),
  enemy('nightcry', '夜泣き', '🍼', 'child', 60, 56, 11, 15, 4, 'shooter', {
    shot: { bullet: 'wail', speed: 115, damage: 5, cooldown: 3.8, count: 8, ring: true }
  }),
  enemy('backpain', '腰痛', '⚡', 'sickness', 260, 30, 16, 22, 9, 'tank'),
  enemy('scam', '詐欺電話', '☎️', 'money', 80, 60, 12, 17, 5, 'blink'),
  enemy('forget', '物忘れ', '❓', 'sickness', 70, 64, 12, 16, 5, 'blink'),
  enemy('loneliness', '孤独', '🌑', 'people', 120, 44, 14, 19, 6, 'ghost'),
  // New life events.
  enemy('b_vaccine', '予防接種の日', '💉', 'sickness', 420, 50, 14, 32, 25, 'boss', {
    patterns: ['charge'],
    dash: 330
  }),
  enemy('b_heartbreak', '失恋', '💔', 'love', 4200, 54, 22, 38, 70, 'boss', {
    patterns: ['ring', 'charge'],
    dash: 360
  }),
  enemy('b_tax', '確定申告', '🧾', 'money', 7000, 50, 26, 40, 90, 'boss', {
    patterns: ['summon', 'ring'],
    minion: 'coin'
  }),
  enemy('b_care', '親の介護', '🧓', 'people', 36000, 46, 40, 44, 240, 'boss', {
    patterns: ['summon', 'spiral'],
    minion: 'loneliness'
  })
]
const REPLACEMENTS: Record<string, Pick<EnemyDef, 'id' | 'name' | 'icon'>> = {
  job: { id: 'overwork', name: '過重労働', icon: '📄' },
  dog: { id: 'biting_dog', name: '噛みつく野良犬', icon: '🐕' },
  pepper: { id: 'picky_eating', name: '偏食', icon: '🫑' },
  worksheet: { id: 'unfinished_worksheet', name: '終わらないプリント', icon: '📃' },
  dodgeball: { id: 'ball_impact', name: 'ボールの直撃', icon: '🔴' },
  crush: { id: 'controlling_partner', name: '束縛するパートナー', icon: '🔒' },
  drinking: { id: 'forced_drinking', name: '断れない飲み会', icon: '🍺' },
  scholarship: { id: 'scholarship_debt', name: '奨学金の返済', icon: '🎓' },
  meeting: { id: 'endless_meeting', name: '終わらない会議', icon: '🗂️' },
  coin: { id: 'tax_arrears', name: '税金の滞納', icon: '🪙' },
  teacher: { id: 'abusive_teacher', name: '暴言教師', icon: '👨‍🏫' },
  lesson: { id: 'lesson_pressure', name: '授業の遅れ', icon: '🧮' },
  club: { id: 'overtraining', name: '過度な練習', icon: '🏃' },
  boss: { id: 'intimidating_boss', name: '威圧的な上司', icon: '😤' },
  kid: { id: 'mischief', name: '子育てのいたずら', icon: '🖍️' },
  senpai: { id: 'abusive_senpai', name: '横暴な先輩', icon: '🧑‍🎓' },
  girlfriend: { id: 'temptation', name: '浮気相手のイケメン店長', icon: '💔' },
  vaccine: { id: 'infection', name: '感染症', icon: '🦠' },
  b_vaccine: { id: 'b_outbreak', name: '感染症の流行', icon: '🦠' }
}
const unrequitedWorry: EnemyDef = {
  ...ORIGINAL_ENEMIES.find((def) => def.id === 'crush')!,
  id: 'unrequited_worry',
  name: '片思いの悩み',
  icon: '💔'
}
export const DISABLED_ENEMIES = [...ORIGINAL_ENEMIES.filter((def) => REPLACEMENTS[def.id]), unrequitedWorry]
const replacementId = (id: string) => REPLACEMENTS[id]?.id ?? id
export const ENEMIES: EnemyDef[] = ORIGINAL_ENEMIES.map((def) => ({
  ...def,
  ...REPLACEMENTS[def.id],
  ...(def.child ? { child: replacementId(def.child) } : {}),
  ...(def.minion ? { minion: replacementId(def.minion) } : {})
}))
export const ENEMY_BY_ID = new Map(ENEMIES.map((def) => [def.id, def]))
export const ENEMY_INDEX = new Map(ENEMIES.map((def, index) => [def.id, index]))
export const isRelationshipEnemy = (id: string) => id === 'temptation' || id === 'controlling_partner'

/** Enemy bullet sprite names (sheet `bullets`); the index is what snapshots carry. */
export const BULLET_KINDS = [
  'seed',
  'ball',
  'beer',
  'shout',
  'wail',
  'b_hs',
  'b_univ',
  'b_shukatsu',
  'b_wedding',
  'b_mortgage',
  'b_rebel',
  'b_layoff',
  'b_illness',
  'b_outbreak',
  'b_heartbreak',
  'b_tax',
  'b_care'
] as const
export const BULLET_INDEX = new Map<string, number>(BULLET_KINDS.map((name, index) => [name, index]))

/** Item kinds as carried in snapshots (index). */
export const COOKING_ITEMS = ['food_damage', 'food_defense', 'food_speed', 'food_heal'] as const
export const ITEM_KINDS = ['meal', 'chest', 'magnet', ...COOKING_ITEMS] as const

type PoolEntry = [string, number]

/** Who the world throws at you, by age. Weights are relative. */
const BASE_POOLS: { untilAge: number; enemies: PoolEntry[] }[] = [
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
      ['temptation', 0.8],
      ['car', 0.25]
    ]
  },
  {
    untilAge: 23,
    enemies: [
      ['exam', 2],
      ['expense', 3],
      ['temptation', 2],
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
      ['temptation', 1.5],
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

/** [enemy, from age, to age (a band ends at or before it), weight]: where each newcomer lives. */
const NEW_SPAWNS: [string, number, number, number][] = [
  ['mosquito', 0, 12, 0.9],
  ['mosquito', 65, 999, 0.9],
  ['infection', 0, 6, 1.1],
  ['dog', 3, 12, 1],
  ['pepper', 3, 12, 0.7],
  ['homework', 6, 18, 1],
  ['dodgeball', 6, 15, 0.7],
  ['pimple', 12, 23, 0.9],
  ['crush', 12, 999, 1],
  ['senpai', 12, 23, 0.5],
  ['drinking', 18, 35, 0.6],
  ['scholarship', 18, 50, 0.6],
  ['deadline', 23, 65, 1],
  ['meeting', 23, 65, 0.6],
  ['spam', 23, 65, 0.8],
  ['powerhara', 23, 65, 0.5],
  ['train', 23, 65, 0.25],
  ['tax', 23, 999, 0.8],
  ['nightcry', 30, 50, 0.6],
  ['backpain', 45, 999, 0.5],
  ['scam', 60, 999, 0.8],
  ['forget', 60, 999, 0.8],
  ['loneliness', 60, 999, 0.8],
  ['temptation', 30, 999, 1]
]
const POOL_BANDS = [0, 3, 6, 12, 15, 18, 23, 30, 35, 45, 50, 60, 65]

export const POOLS: { untilAge: number; enemies: PoolEntry[] }[] = POOL_BANDS.map((from, i) => {
  const untilAge = i + 1 < POOL_BANDS.length ? POOL_BANDS[i + 1] : 999
  const base = BASE_POOLS.find((entry) => from < entry.untilAge)!
  const added = NEW_SPAWNS.filter(([, lo, hi]) => lo <= from && untilAge <= hi).map(([id, , , w]): PoolEntry => [id, w])
  return { untilAge, enemies: [...base.enemies, ...added].map(([id, weight]) => [replacementId(id), weight]) }
})

export type Formation = 'ring' | 'wall' | 'cluster'

export interface LifeEvent {
  at: number
  boss?: string
  swarm?: string
  count?: number
  formation?: Formation
  text: string
}

/** Scripted life events (seconds into the run), sorted by time. */
export const EVENTS: LifeEvent[] = (
  [
    { at: 60, swarm: 'mosquito', count: 24, formation: 'wall', text: '夏が来た。蚊の大群！' },
    { at: 100, boss: 'b_outbreak', text: '感染症が流行している！' },
    { at: 150, swarm: 'insult', count: 30, text: 'クラスで悪口が広まった！' },
    { at: 220, swarm: 'homework', count: 14, text: '夏休みの宿題が山積み！' },
    { at: 300, boss: 'b_hs', text: '高校受験がやってきた！' },
    { at: 380, swarm: 'pimple', count: 40, text: '思春期。ニキビが大量発生！' },
    { at: 450, boss: 'b_univ', text: '大学受験がやってきた！' },
    { at: 500, swarm: 'drinking', count: 18, formation: 'cluster', text: '新歓コンパでお酒を断れない！' },
    { at: 525, boss: 'b_heartbreak', text: '失恋した…！' },
    { at: 570, swarm: 'car', count: 10, text: '免許を取った。事故に注意！' },
    { at: 630, boss: 'b_shukatsu', text: '就職活動が始まった！' },
    { at: 690, swarm: 'spam', count: 60, formation: 'wall', text: '迷惑メールが殺到！' },
    { at: 735, boss: 'b_tax', text: '確定申告の締め切りだ！' },
    { at: 800, swarm: 'deadline', count: 20, text: '繁忙期。締め切りが迫る！' },
    { at: 840, boss: 'b_wedding', text: '結婚式の請求書が届いた！' },
    { at: 960, swarm: 'gossip', count: 50, text: 'SNSで炎上した！' },
    { at: 1050, boss: 'b_mortgage', text: '住宅ローンを組んだ！' },
    { at: 1110, swarm: 'nightcry', count: 18, formation: 'cluster', text: '赤ちゃんが生まれた！夜泣きの日々…' },
    { at: 1170, swarm: 'meeting', count: 10, text: '会議、会議、また会議…' },
    { at: 1230, boss: 'b_rebel', text: '子供が反抗期に入った！' },
    { at: 1300, swarm: 'backpain', count: 12, text: '腰をやってしまった…' },
    { at: 1380, swarm: 'kid', count: 40, text: '子育てのいたずらに振り回される！' },
    { at: 1440, boss: 'b_layoff', text: 'リストラの噂…！' },
    { at: 1125, boss: 'b_care', text: '親の介護と、最期のお別れ…' },
    { at: 1580, swarm: 'scam', count: 20, text: 'オレオレ詐欺の電話が鳴る！' },
    { at: 1620, boss: 'b_illness', text: '大きな病気が見つかった！' },
    { at: 1680, swarm: 'forget', count: 30, text: '物忘れがひどくなってきた…' },
    { at: 1740, swarm: 'illness', count: 60, text: '最後の試練。あと少し…！' }
  ] as LifeEvent[]
)
  .map((event) => ({
    ...event,
    boss: event.boss && replacementId(event.boss),
    swarm: event.swarm && replacementId(event.swarm),
    at: timeAtAge((event.at / (30 * 60)) * LIFESPAN)
  }))
  .sort((a, b) => a.at - b.at)

export const PLAYER_COLORS = ['#ffd166', '#06d6a0', '#ef476f', '#4cc9f0', '#f78c6b', '#b388eb', '#90be6d', '#f9c74f']
export const MAX_GAME_PLAYERS = 8
