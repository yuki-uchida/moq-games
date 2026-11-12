/**
 * 防衛任務 (DESIGN §12): mission metadata, objectives, waves and radio lines. Counts are for 正規; the sim scales
 * them by the difficulty's `peak` (60/90/120 concurrent foes) and caps concurrency, queueing the rest.
 */
import type { FoeKind } from './enemies'
import type { SpeciesId } from './species'

export const MISSION_IDS = ['sakura', 'harbor', 'nightraid', 'blight', 'maw'] as const
export type MissionId = (typeof MISSION_IDS)[number]

export type Speaker = 'genbu' | 'ruri' | 'kurozume' | SpeciesId

export const SPEAKERS: Record<'genbu' | 'ruri' | 'kurozume', { name: string; title: string }> = {
  genbu: { name: 'ゲンブ', title: 'ARK司令' },
  ruri: { name: 'ルリ', title: 'オペレーター' },
  kurozume: { name: 'クロヅメ兵', title: 'クロヅメ連合' }
}

export interface RadioLine {
  who: Speaker
  text: string
}

export type ObjectiveDef =
  /** Keep the prop at `anchor` alive until every wave is cleared. */
  | { kind: 'defend'; anchor: string; hp: number; label: string }
  /** Hold each zone in order for `hold` s with no foes inside; then optionally fight the boss. */
  | { kind: 'capture'; anchors: string[]; radius: number; hold: number; boss?: FoeKind; label: string }
  /** The cart moves along `path` while a player is within `radius`; foes damage it. */
  | { kind: 'escort'; path: string; speed: number; radius: number; hp: number; label: string }
  /** Destroy every node; each spawns foes while alive. */
  | { kind: 'destroy'; anchors: string[]; hp: number; label: string }
  /** Defeat the boss at `anchor`. */
  | { kind: 'boss'; foe: FoeKind; anchor: string; label: string }

export interface SpawnGroup {
  kind: FoeKind
  count: number
  /** Seconds after the wave (or phase) starts. */
  delay: number
  /** Seconds between members (bursts of `burst` at a time). */
  interval?: number
  burst?: number
  /** Spawn tag in the map (`MapDef.foeSpawns[].tags`); any spawn when omitted. */
  tag?: string
}

export interface WaveDef {
  groups: SpawnGroup[]
  /** Radio line when the wave starts. */
  radio?: RadioLine
}

export interface MissionDef {
  id: MissionId
  index: number
  name: string
  /** One line on the mission card. */
  summary: string
  map: 'oldtown' | 'harbor' | 'blight'
  variant?: 'night' | 'crater'
  objective: ObjectiveDef
  /** Waves (defend/escort/boss) or phases (capture: one per zone, then boss adds; destroy: node spawns). */
  waves: WaveDef[]
  briefing: RadioLine[]
  radio: {
    start: RadioLine
    victory: RadioLine[]
    defeat: RadioLine[]
    objectiveHurt?: RadioLine
    lowTickets?: RadioLine
    boss?: RadioLine[]
  }
  /** Score thresholds for S / A / B (else C); see the sim's mission score. */
  rank: { s: number; a: number; b: number }
  /** Target clear time in seconds for the time bonus. */
  par: number
}

const g = (kind: FoeKind, count: number, delay: number, interval = 0.35, burst = 4, tag?: string): SpawnGroup => ({
  kind,
  count,
  delay,
  interval,
  burst,
  ...(tag ? { tag } : {})
})

export const MISSIONS: Record<MissionId, MissionDef> = {
  sakura: {
    id: 'sakura',
    index: 1,
    name: 'サクラ通り防衛線',
    summary: '北の結晶帯から南下する蝕獣の群れから、アニマの灯台を守り抜け。',
    map: 'oldtown',
    objective: { kind: 'defend', anchor: 'lighthouse', hp: 2000, label: '灯台を守れ' },
    waves: [
      {
        groups: [g('tsubute', 8, 0), g('tsubute', 8, 9), g('harigane', 2, 14, 2, 1)],
        radio: { who: 'ruri', text: '第1波、来ます！ 北の大通りから小型の群れです！' }
      },
      {
        groups: [g('tsubute', 10, 0), g('kagerou', 4, 6, 1, 2), g('tsubute', 12, 12), g('harigane', 4, 16, 1.5, 2)],
        radio: { who: 'ruri', text: '第2波！ 空からカゲロウが混じっています！' }
      },
      {
        groups: [
          g('tsubute', 14, 0),
          g('harigane', 4, 5, 1, 2),
          g('oagos', 1, 10, 1, 1),
          g('kagerou', 6, 14, 1, 3),
          g('tsubute', 16, 20)
        ],
        radio: { who: 'ruri', text: '第3波……大型反応！ オオアゴです、背中の袋を狙って！' }
      },
      {
        groups: [
          g('tsubute', 18, 0),
          g('kagerou', 8, 4, 0.8, 4),
          g('harigane', 6, 8, 1, 2),
          g('oagos', 1, 16, 1, 1),
          g('tsubute', 22, 22)
        ],
        radio: { who: 'genbu', text: '数が増えている。灯台から離れすぎるな。' }
      },
      {
        groups: [
          g('tsubute', 20, 0),
          g('harigane', 8, 4, 1, 2),
          g('oagos', 2, 10, 4, 1),
          g('kagerou', 10, 14, 0.8, 5),
          g('tsubute', 30, 20)
        ],
        radio: { who: 'ruri', text: '最終波です！ オオアゴが二体……ここを越えれば終わりです！' }
      }
    ],
    briefing: [
      { who: 'genbu', text: '第七小隊、聞こえるか。旧市街北の結晶帯から、蝕獣の群れが南下している。' },
      { who: 'genbu', text: '狙いはサクラ通りの〈灯台〉だ。あれが落ちれば、市の東半分のアニマ供給が止まる。' },
      { who: 'ruri', text: '群れは五波に分かれて来ます！ 最後の波には大型の反応が二つ……オオアゴです！' },
      { who: 'genbu', text: '灯台を守り抜け。それと——全員、帰ってこい。以上だ。' }
    ],
    radio: {
      start: { who: 'ruri', text: '第七小隊、展開完了！ 灯台の周りを固めてください！' },
      objectiveHurt: { who: 'ruri', text: '灯台が攻撃されています！ 近くの敵を排除して！' },
      lowTickets: { who: 'genbu', text: '転送枠が残り少ない。無理はするな。' },
      victory: [
        { who: 'genbu', text: '……よくやった。灯台は無事だ。' },
        { who: 'ruri', text: 'サクラ通り、防衛成功です！ みんな、帰ってきてください！' }
      ],
      defeat: [
        { who: 'ruri', text: '灯台の反応が……消えました。' },
        { who: 'genbu', text: '撤退だ。生きて戻れ。それが次の命令だ。' }
      ]
    },
    rank: { s: 900, a: 700, b: 450 },
    par: 300
  },
  harbor: {
    id: 'harbor',
    index: 2,
    name: '港湾ブロック奪還',
    summary: '蝕機に占拠された倉庫街を三か所の制圧で取り返し、海から来る要塞を止めろ。',
    map: 'harbor',
    objective: {
      kind: 'capture',
      anchors: ['zoneA', 'zoneB', 'zoneC'],
      radius: 7,
      hold: 25,
      boss: 'goutetsu',
      label: '制圧ポイントを奪還せよ'
    },
    waves: [
      {
        groups: [g('mitsume', 6, 0, 1, 2), g('korogashi', 4, 8, 1.5, 2), g('ashinaga', 1, 12, 1, 1)],
        radio: { who: 'ruri', text: 'ポイントAの周りに蝕機の反応！ 制圧中は敵を中に入れないで！' }
      },
      {
        groups: [
          g('mitsume', 8, 0, 1, 2),
          g('tategami', 1, 4, 1, 1),
          g('ashinaga', 2, 6, 3, 1),
          g('korogashi', 6, 12, 1, 2)
        ],
        radio: { who: 'genbu', text: 'タテガミの盾は外からの攻撃を通さん。内側へ踏み込め。' }
      },
      {
        groups: [
          g('mitsume', 10, 0, 0.8, 2),
          g('tategami', 2, 4, 4, 1),
          g('ashinaga', 3, 8, 3, 1),
          g('korogashi', 8, 10, 1, 2)
        ],
        radio: { who: 'ruri', text: '最後のポイントCです！ 通信塔まであと少し！' }
      },
      {
        groups: [g('mitsume', 8, 6, 1.2, 2), g('korogashi', 8, 14, 1.5, 2), g('ashinaga', 2, 24, 6, 1)],
        radio: { who: 'ruri', text: '海から……何か上がってきます！ 識別名、ゴウテツ！' }
      }
    ],
    briefing: [
      { who: 'genbu', text: '港湾ブロックが蝕機に占拠された。海から上陸した機械どもが、倉庫街に陣地を築いている。' },
      { who: 'ruri', text: '制圧ポイントはA、B、Cの三か所。順番に取り返して、通信塔を再起動してください！' },
      { who: 'genbu', text: 'タテガミの盾には外から撃っても効かん。懐に飛び込め。' },
      { who: 'ruri', text: 'それと……海の底に、とても大きな反応があります。気をつけて。' }
    ],
    radio: {
      start: { who: 'ruri', text: '上陸完了！ まずはポイントAへ！' },
      objectiveHurt: { who: 'ruri', text: 'ポイントの中に敵がいます！ 制圧が止まっています！' },
      lowTickets: { who: 'genbu', text: '転送枠が残り少ない。無理はするな。' },
      boss: [
        { who: 'genbu', text: '脚を狙え。膝をつかせれば、胸の核が開く。' },
        { who: 'ruri', text: '核が開きました！ 今です！' }
      ],
      victory: [
        { who: 'ruri', text: 'ゴウテツ、沈黙！ 港湾ブロック、奪還です！' },
        { who: 'genbu', text: '見事だ。海の匂いが戻ったな。' }
      ],
      defeat: [
        { who: 'ruri', text: '部隊の反応が……全員、帰巣しました。' },
        { who: 'genbu', text: '港はまた取り戻せる。お前たちは替えがきかん。戻れ。' }
      ]
    },
    rank: { s: 900, a: 700, b: 450 },
    par: 420
  },
  nightraid: {
    id: 'nightraid',
    index: 3,
    name: '黒爪の夜襲',
    summary: '夜の旧市街に侵入したクロヅメ連合から、発掘したアンティークの荷車を守り抜け。',
    map: 'oldtown',
    variant: 'night',
    objective: { kind: 'escort', path: 'cart', speed: 2.2, radius: 8, hp: 1600, label: '荷車を西門まで護衛せよ' },
    waves: [
      {
        groups: [g('kurozume', 3, 4, 1, 1), g('tsubute', 10, 10)],
        radio: { who: 'kurozume', text: 'いたぞ、ARKの荷車だ！ アンティークはいただく！' }
      },
      {
        groups: [g('kurozume', 4, 0, 1.5, 2), g('tsubute', 14, 6), g('kagerou', 4, 12, 1, 2)],
        radio: { who: 'ruri', text: 'クロヅメ兵、増援です！ 蝕獣まで連れてきています！' }
      },
      {
        groups: [g('kurozume', 5, 0, 1.5, 2), g('tsubute', 18, 5), g('harigane', 4, 10, 1, 2)],
        radio: { who: 'genbu', text: '奴らは蝕を呼び込んでいる。……ためらうな。' }
      },
      {
        groups: [g('kurozume', 6, 0, 1, 3), g('tsubute', 20, 6), g('oagos', 1, 14, 1, 1)],
        radio: { who: 'ruri', text: '西門が見えました！ あと少しです！' }
      }
    ],
    briefing: [
      {
        who: 'genbu',
        text: 'クロヅメ連合の部隊が、夜陰に紛れて旧市街へ侵入した。狙いは発掘されたばかりのアンティークだ。'
      },
      {
        who: 'ruri',
        text: 'アンティークを積んだ荷車を、西門まで護衛してください。荷車はみんなが近くにいる時だけ進みます。'
      },
      { who: 'genbu', text: '相手は我々と同じ獣だ。同じアンティークを使う。侮るな。' }
    ],
    radio: {
      start: { who: 'ruri', text: '荷車、出発します！ 離れないで！' },
      objectiveHurt: { who: 'ruri', text: '荷車が攻撃されています！' },
      lowTickets: { who: 'genbu', text: '転送枠が残り少ない。無理はするな。' },
      victory: [
        { who: 'ruri', text: '荷車、西門に到着！ アンティークは無事です！' },
        { who: 'genbu', text: 'よく守った。……北の連中にも、いずれ分かる日が来るといいが。' }
      ],
      defeat: [
        { who: 'kurozume', text: 'アンティークはもらっていくぞ！' },
        { who: 'genbu', text: '……撤退だ。奪われたものは、取り返せばいい。' }
      ]
    },
    rank: { s: 900, a: 700, b: 450 },
    par: 360
  },
  blight: {
    id: 'blight',
    index: 4,
    name: '侵蝕域突入',
    summary: '紫の結晶に呑まれた街へ踏み込み、蝕獣を産み続ける三つの巣核を破壊せよ。',
    map: 'blight',
    objective: { kind: 'destroy', anchors: ['node1', 'node2', 'node3'], hp: 1500, label: '巣核を破壊せよ' },
    waves: [
      {
        groups: [g('tsubute', 10, 0), g('harigane', 2, 6, 2, 1), g('kagerou', 3, 10, 1, 3)],
        radio: { who: 'ruri', text: '巣核から蝕獣が湧いています！ 止めるには壊すしかありません！' }
      },
      {
        groups: [
          g('tsubute', 12, 0),
          g('mitsume', 4, 4, 1, 2),
          g('harigane', 3, 8, 1.5, 1),
          g('ashinaga', 1, 12, 1, 1)
        ],
        radio: { who: 'genbu', text: '蝕機の巡回もいる。囲まれる前に動け。' }
      },
      {
        groups: [g('tsubute', 16, 0), g('kagerou', 6, 4, 0.8, 3), g('oagos', 1, 10, 1, 1), g('harigane', 4, 14, 1, 2)],
        radio: { who: 'ruri', text: '最後の巣核です！ 抵抗が激しくなっています！' }
      }
    ],
    briefing: [
      { who: 'genbu', text: '侵蝕域の拡大が止まらん。結晶の下で、巣核が三つ脈打っている。' },
      { who: 'ruri', text: '巣核が生きている限り、蝕獣は湧き続けます。三つとも破壊してください！' },
      { who: 'genbu', text: 'ここから先は、かつて街だった場所だ。……忘れるな、我々は取り戻しに来た。' }
    ],
    radio: {
      start: { who: 'ruri', text: '侵蝕域に突入しました。結晶には触れないで！' },
      lowTickets: { who: 'genbu', text: '転送枠が残り少ない。無理はするな。' },
      victory: [
        { who: 'ruri', text: '巣核、すべて沈黙！ 結晶の広がりが……止まりました！' },
        { who: 'genbu', text: '一歩、取り戻したな。' }
      ],
      defeat: [
        { who: 'ruri', text: '部隊の反応、途絶えました……。' },
        { who: 'genbu', text: '撤退する。結晶の中に誰も置いていくな。' }
      ]
    },
    rank: { s: 900, a: 700, b: 450 },
    par: 420
  },
  maw: {
    id: 'maw',
    index: 5,
    name: '喰らう柱',
    summary: 'すべての侵蝕の源。クレーターの底に根を張る巨大な蝕獣クイツクシを討て。',
    map: 'blight',
    variant: 'crater',
    objective: { kind: 'boss', foe: 'kuitsukushi', anchor: 'crater', label: 'クイツクシを撃破せよ' },
    waves: [
      { groups: [g('tsubute', 12, 4), g('kagerou', 4, 10, 1, 2)] },
      { groups: [g('tsubute', 16, 0), g('harigane', 4, 6, 1, 2), g('kagerou', 6, 10, 1, 3)] },
      { groups: [g('tsubute', 20, 0), g('oagos', 1, 8, 1, 1), g('kagerou', 8, 12, 1, 4)] }
    ],
    briefing: [
      { who: 'genbu', text: 'すべての侵蝕はあの穴から始まった。クレーターの底に〈クイツクシ〉がいる。' },
      { who: 'ruri', text: 'アニマの反応が……計測できません。今まで見たどんな蝕獣より大きいです。' },
      { who: 'genbu', text: '第七小隊。これがヒナタ市の最後の作戦になるかもしれん。——行ってこい。' }
    ],
    radio: {
      start: { who: 'ruri', text: '巨大反応、目の前です！ 口が開いた時に核が見えます！' },
      lowTickets: { who: 'genbu', text: '転送枠が残り少ない。……頼む、持ちこたえてくれ。' },
      boss: [
        { who: 'ruri', text: '核が露出しています！ 今なら届きます！' },
        { who: 'genbu', text: '怯むな。奴も弱っている。' }
      ],
      victory: [
        { who: 'genbu', text: '……聞こえるか、ヒナタ市。柱は、倒れた。' },
        { who: 'ruri', text: 'みんな……おかえりなさい！' }
      ],
      defeat: [
        { who: 'ruri', text: '全員の帰巣を確認……作戦は失敗です。' },
        { who: 'genbu', text: 'まだ終わりではない。生きている限りはな。' }
      ]
    },
    rank: { s: 900, a: 700, b: 450 },
    par: 420
  }
}

export const MISSION_ORDER = MISSION_IDS.map((id) => MISSIONS[id])

/** Radio lines for 三つ巴演習 and 訓練場. */
export const PVP_RADIO = {
  start: { who: 'ruri', text: 'ユメクジラ演習場、起動。ここでの撃破は現実には影響しません。全力でどうぞ！' },
  lastSpurt: { who: 'ruri', text: 'ラストスパート！ 残り60秒、撃破ポイントが2倍です！' },
  suddenDeath: { who: 'ruri', text: '同点です！ サドンデス、次の撃破で決着！' }
} satisfies Record<string, RadioLine>
