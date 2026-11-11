/** The ten stages: metadata, story beats and boss configuration. */
import { MAPS } from './maps'
import type { StageDef } from './types'

export const OPENING_PAGES: readonly string[] = [
  'むかしむかし、星の丘に「ハム彦」という名前の子ハムスターがいました。',
  'ある夕方、ハム彦はママのハム代と大げんかして、思いきり巣を飛び出しました。',
  '「もう、かえってこなくっていいの！」',
  'でも、後ろではママの怒涛の足音が近づいています…。',
  '操作は あるく・ジャンプ・かじる の3つだけ。ギミックをぶちかまして逃げ切りましょう！'
]

export const ENDING_PAGES: readonly string[] = [
  '黒ハム王は星のかけらとなって消え、夜の森に光が戻りました。',
  'ハム彦とハム姫は森の奥の、あたたかい巣に帰ってきました。',
  'そこには、心配して待っていたママのハム代の姿も。',
  '「おかえり、ハム彦。ごはんにしておいたよ」',
  'こうして3匹は、星の下で毎日をぽかぽかに過ごしたのでした。',
  'おしまい。これからも、よろしくね！'
]

const boss = (
  def: Partial<StageDef['boss']> & Pick<StageDef['boss'], 'kind' | 'name' | 'title' | 'art'>
): StageDef['boss'] => ({
  hp: 8,
  speed: 170,
  scale: 1,
  minions: [],
  shockwave: false,
  projectiles: 0,
  dive: false,
  ...def
})

export const STAGES: StageDef[] = [
  {
    id: 'stage-1',
    no: 1,
    name: 'おふくろの追撃',
    subtitle: 'THE GREAT ESCAPE',
    theme: 'meadow',
    map: MAPS['stage-1'],
    objective: 'reach',
    boss: boss({
      kind: 'chaser',
      name: 'ママ・ハム代',
      title: 'おふくろ',
      art: 'mom',
      hp: 1,
      speed: 246,
      scale: 1.125,
      stamina: true
    }),
    intro: [
      'ママのハム代が、後ろから追いかけてきます！',
      'かじって木を倒し、土に穴をあけ、蜂の巣を怒らせて、ママを止めよう。',
      '休まず右へ進めば、ママはそのうち疲れてきます。ゴールを目指そう！'
    ],
    clear: [
      'ハム代はつかれきって、腰をさすりながら巣にもどっていきました。',
      'ハム彦はひとりぼっち。そのとき、空から何かがキラキラ光りながら落ちてきます…！'
    ],
    hints: ['Z / X でかじる', '木は2回かじるとたおれる', '蜂の巣は敵も味方もさす']
  },
  {
    id: 'stage-2',
    no: 2,
    name: '空から来た姫',
    subtitle: 'THE FALLING PRINCESS',
    theme: 'meadow',
    map: MAPS['stage-2'],
    objective: 'boss',
    boss: boss({
      kind: 'flyer',
      name: 'ばくろ団頭目 カラス助',
      title: '空の悪漢',
      art: 'crowBoss',
      hp: 8,
      speed: 210,
      scale: 1.375,
      minions: ['walker'],
      projectiles: 2,
      dive: true
    }),
    intro: [
      '空から落ちてきたのは、きらきら星の「ハム姫」でした。',
      '「た、たすけて！　ばくろ団が追ってくるの！」',
      '悪漢どもをかじって、ハム姫を守り抜こう！'
    ],
    clear: ['ばくろ団はてんでばらばらに逃げていきました。', 'ハム姫はほっと胸をなでおろしました。でも、そのあと…。'],
    hints: ['敵はかじってたおす', '蜂の巣は悪漢を追いかける', 'ボスを倒すとゴールが開く']
  },
  {
    id: 'stage-3',
    no: 3,
    name: 'さらわれた姫',
    subtitle: 'THE NIGHT CHASE',
    theme: 'night',
    map: MAPS['stage-3'],
    objective: 'boss',
    boss: boss({
      kind: 'brute',
      name: '誘拐犯 いたち丞相',
      title: '夜の誘拐犯',
      art: 'weaselBoss',
      hp: 10,
      speed: 185,
      scale: 1.375,
      minions: ['walker'],
      projectiles: 0,
      dive: true
    }),
    intro: [
      'ハム姫がばくろ団のボスにさらわれてしまいました！',
      '夜の森を追いかけて、必ず取り戻そう。',
      '眠っている動物を起こせば、突進して味方になってくれるかも？'
    ],
    clear: ['ハム姫を無事に取り戻した！　だが、いたち丞相は逃げながら「親玉がお前を待っている」と笑っていました…。'],
    hints: ['眠る動物をかじると起きる', '夜は足元に注意', '土を掘って近道できる']
  },
  {
    id: 'stage-4',
    no: 4,
    name: '奪還の作戦',
    subtitle: 'STORM THE HIDEOUT',
    theme: 'cave',
    map: MAPS['stage-4'],
    objective: 'boss',
    boss: boss({
      kind: 'brute',
      name: '用心棒 いのしし番長',
      title: 'アジトの番人',
      art: 'boarBoss',
      hp: 12,
      speed: 175,
      scale: 1.5,
      minions: ['walker'],
      shockwave: true,
      projectiles: 0
    }),
    intro: [
      'ばくろ団はハム姫を再びさらって、アジトの檻に閉じ込めました。',
      '乗り込み、ハム姫を奪還する作戦です。',
      'かじってスイッチを押し、門をひらこう。土の壁もかじり崩せる。',
      '配管に穴をあけると水が噴出すぞ。'
    ],
    clear: ['アジトを制圧！　ハム姫も無事に救出しました。しかし、ボスは更なる親玉の本拠点へ足を踏み入れます…。'],
    hints: ['スイッチと門は色で対応', '水に入ると浮く', '岩は2回かじると砕ける']
  },
  {
    id: 'stage-5',
    no: 5,
    name: '森の逃走',
    subtitle: 'FLIGHT TO THE FOREST',
    theme: 'forest',
    map: MAPS['stage-5'],
    objective: 'boss',
    boss: boss({
      kind: 'brute',
      name: '追っ手リーダー おおかみ檄',
      title: '森の追跡者',
      art: 'wolfBoss',
      hp: 12,
      speed: 205,
      scale: 1.4375,
      minions: ['walker', 'jumper'],
      projectiles: 0,
      dive: true
    }),
    intro: [
      'ハム彦とハム姫は森の奥へ逃げ込みました。',
      '追っ手がすぐ後ろ！　森のギミックを使いこなして逃げ切ろう。',
      '道を塞ぐ岩や木も、かじりたおせば道になる。'
    ],
    clear: ['追っ手を見失いました。森の静けさに、ほっと一息。'],
    hints: ['穴を飛び越えて逃げ切れ', '高所はジャンプで', '岩はかじって砕く']
  },
  {
    id: 'stage-6',
    no: 6,
    name: '森の巣',
    subtitle: 'BUILD A NEST',
    theme: 'forest',
    map: MAPS['stage-6'],
    objective: 'collect',
    collect: 8,
    boss: boss({
      kind: 'tank',
      name: '森の主 ヒョウタン熊',
      title: '森の主',
      art: 'bearBoss',
      hp: 16,
      speed: 125,
      scale: 1.5625,
      minions: ['jumper'],
      shockwave: true,
      projectiles: 0
    }),
    intro: [
      '森の真ん中で、ようやく安全な巣を作ることにしました。',
      '枝や実を8個集めて、ぽかぽかの巣を完成させよう。',
      '木を倒しても、土を掘っても材料は見つかるはず。'
    ],
    clear: ['森の主を追い返し、巣を守り抜いた！', 'ハム彦とハム姫は、森の家で暮らしはじめました。'],
    hints: ['枝と実を8個集める', '集めるとボスが現れる', '巣にたどりつけばクリア']
  },
  {
    id: 'stage-7',
    no: 7,
    name: '追っ手の反撃',
    subtitle: 'DEFEND THE NEST',
    theme: 'fortress',
    map: MAPS['stage-7'],
    objective: 'boss',
    boss: boss({
      kind: 'swarm',
      name: '追っ手隊長 きつね旋風',
      title: '旋風の隊長',
      art: 'foxBoss',
      hp: 14,
      speed: 175,
      scale: 1.375,
      minions: ['walker', 'jumper'],
      projectiles: 1,
      dive: true
    }),
    intro: [
      '森の主を追い返したハム彦たちでしたが、今度はばくろ団の本隊が巣を囲みました。',
      '巣を守る戦いです。蜂の巣や動物たちを味方につけて、追い返そう！'
    ],
    clear: ['ばくろ団は散り散りに！　でも、ボスは更なる親玉を呼び寄せます…。'],
    hints: ['スイッチで門を開けられる', '落とし穴は飛び越えろ', 'ボスを倒して巣を守る']
  },
  {
    id: 'stage-8',
    no: 8,
    name: '再び、攫われて',
    subtitle: 'THE FORTRESS CELL',
    theme: 'fortress',
    map: MAPS['stage-8'],
    objective: 'boss',
    boss: boss({
      kind: 'tank',
      name: '牢番 ごりら警部',
      title: '鉄牢の番人',
      art: 'apeBoss',
      hp: 18,
      speed: 135,
      scale: 1.625,
      minions: ['tough'],
      shockwave: true,
      projectiles: 1
    }),
    intro: [
      'ある夜、ハム姫が再びさらわれてしまいました。',
      '今度は敵の要塞の檻に囚われています。鉄の牢獄から抜け出し、ハム姫を救い出そう！',
      'スイッチと水を駆使して、門をどんどんひらいて！'
    ],
    clear: ['要塞から脱出！　ハム姫は「親玉は暗黒城にいる」と教えてくれました。'],
    hints: ['スイッチの色と門の色を確認', '土の壁はかじって掘れ', '牢の鍵はスイッチ']
  },
  {
    id: 'stage-9',
    no: 9,
    name: '敵の本拠地',
    subtitle: 'THE DARK CASTLE',
    theme: 'castle',
    map: MAPS['stage-9'],
    objective: 'boss',
    boss: boss({
      kind: 'swarm',
      name: '側近 ハチ女王',
      title: '女王の刺',
      art: 'beeBoss',
      hp: 16,
      speed: 165,
      scale: 1.375,
      minions: ['flyer', 'spitter'],
      projectiles: 3,
      dive: true
    }),
    intro: [
      'ついに敵の本拠点、暗黒城へ。',
      '親玉の側近たちを倒し、城の最深部へ進もう。',
      'ここぞというとき、蜂の巣は最強の味方になる。'
    ],
    clear: [
      '側近を倒しました！　最上階で、黒ハム王が待っています。',
      'その夜、嵐の混乱に乗じて黒ハム王はハム姫を連れ去り、城の檻に閉じ込めました。'
    ],
    hints: ['高所の敵にはジャンプかじり', '水の滑りに注意', '女王は仲間を呼ぶ']
  },
  {
    id: 'stage-10',
    no: 10,
    name: '星の決戦',
    subtitle: 'THE FINAL STAR',
    theme: 'star',
    map: MAPS['stage-10'],
    objective: 'boss',
    boss: boss({
      kind: 'final',
      name: '黒ハム王',
      title: '星を喰らう者',
      art: 'king',
      hp: 24,
      speed: 195,
      scale: 1.5,
      minions: ['walker', 'flyer'],
      shockwave: true,
      projectiles: 3,
      dive: true
    }),
    intro: [
      '黒ハム王『星を喰らう者』。',
      '囚われたハム姫を救い、森に平和を取戻す最終決戦！',
      '全部のギミックを使いこなせ。ハム彦、最後のかじり！'
    ],
    clear: ['黒ハム王を倒しました！'],
    hints: ['2フェーズある', 'ハム代の疲れはもうない', '諦めなければ必ず勝てる']
  }
]

export function stageByNo(no: number): StageDef {
  return STAGES.find((stage) => stage.no === no) ?? STAGES[0]
}
