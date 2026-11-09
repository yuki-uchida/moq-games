/**
 * Stage 1 「ぷるぷる草原と古城跡」 (slime). South (start) → north (boss):
 * A はじまりの草原 → B 石の小道 → C 見張りの広場 → D 生け垣の迷路 → E どんぐりの丘 → F 古城跡の入口 →
 * G 四つの水晶の間 → H ボスの間 (I 祭壇).
 *
 * Legend: terrain `.` grass `,` flowers `:` path `_` floor `=` bridge `#` wall `H` hedge `|` fence `~` water
 * `o` pit `^` spikes. Decoration `T` tree `R`/`Q` rock `b` bush `f` flower `I`/`i` pillar `t` torch `V` altar.
 * Props `g` grass tuft (`G` hides a gem) `p`/`P` pot `h` pot with a heart `n` bounce mushroom `B` stone block `O` boulder
 * `C`/`c` chest `x`/`y`/`D`/`e` gates `1`/`2` plates `L` lever `&` giant acorn `U` pedestal `X` cracked rock
 * `M` big plate `5`-`8` crystals `W` boss door. Others: `@` spawn `K` checkpoint `E` elder `S` sign `*` gem
 * `r` rookie `w` bowman `a` apprentice `z` shieldman `J` boss.
 */
import type { StageData } from '../sim/stage-data'

// prettier-ignore
const MAP = [
  'HHHHHHHHHHHHHH##########################################################',
  'HHHHHHHHHHHHHH#############_t,,,t______t,,,t_###########################',
  'HHHHHHHHHHHHHH#############bQ______________Qb###########################',
  'HHHHHHHHHHHHHH#############________VV________###########################',
  'HHHHHHHHHHHHHH#############I__I__________I__I###########################',
  'HHHHHHHHHHHHHH#############,________________,###########################',
  'HHHHHHHHHHHHHH#############,________________,###########################',
  'HHHHHHHHHHHHHH#############t________J_______t###########################',
  'HHHHHHHHHHHHHH#############,________________,###########################',
  'HHHHHHHHHHHHHH#############b________________b###########################',
  'HHHHHHHHHHHHHH#############,________________,###########################',
  'HHHHHHHHHHHHHH#############I__I__________I__I###########################',
  'HHHHHHHHHHHHHH#############,________________,###########################',
  'HHHHHHHHHHHHHH#############_Q______________Q_###########################',
  'HHHHHHHHHHHHHH#############tt______________tt###########################',
  'HHHHHHHHHHHHHH#####################WWW##################################',
  'HHHHHHHHHHHHHH########_5_##########___##########_6_#####################',
  'HHHHHHHHHHHHHH########___##########___##########___#####################',
  'HHHHHHHHHHHHHH#######t___________t_____t______________t#################',
  'HHHHHHHHHHHHHH#######______I________K______I___________#################',
  'HHHHHHHHHHHHHH#######___________________S______________#################',
  'HHHHHHHHHHHHHH#####__________________________________Q_#################',
  'HHHHHHHHHHHHHH#####7________z__________________________#################',
  'HHHHHHHHHHHHHH#####__________________________w_________#################',
  'HHHHHHHHHHHHHH#######_Q________________________________#################',
  'HHHHHHHHHHHHHH#######_P____I_______________I________P_t#################',
  'HHHHHHHHHHHHHH#######t____t________Q____Q___t____________###############',
  'HHHHHHHHHHHHHH################_8_######################XX###############',
  'HHHHHHHHHHHHHH#########################################XX###############',
  'HTTb..TTb.....Tb...........bTT.......Tb#_c__t_____t___t___t___~~.......#',
  'HT.T......TGG........R...w..........T..#______S_I___________I_~~....*..#',
  'H....|||||....,,,.............UU..R....#t___MM______S_________~~..*....#',
  'H......f....r......................i...#____MM_______________n~~.......#',
  'H...gg,,.................:::::::....Rh.#______________________~~n..*...#',
  'HT..g.,....,,.........,,.:......:::::::e__K___________________~~.....h.#',
  'H...........f....&.:::::::..gg.........#___________Q__________~~.......#',
  'H.pf.....R........:::::::......G.r..i..#___Q____r_________a___##########',
  'Hb...T....|||||.....S...K........,,....#t____________Q________##########',
  'HT...........T............L......f.T.T.#____PP__I_________I___##########',
  'HbT.....T.......bT...........bTTb...TTb#Q_____I_____I________t##########',
  'HHHHHHHHHHHHHHHHHHHHHHHHDHHHHHHHHHHHHHHHHHHHHHHHHHHHHHHHHHHHHHHHHHHHHHHH',
  'HHHHHHHHHHHHHHHHHHHf..........fHHHHHHHHHHHHHHHHH:::::::::::::::::::::::H',
  'HHHHHHHHHHHHHHHHHHH..b.....b...HHHHHHHHHHHHHHHHH:b,.................,b:H',
  'HHHf......,.HHHHHHH.....,,.....HHHHHHHHHHHHHHHHH:,....................:H',
  'HHH.....gg..HHHHHHH...S........HHHHHHHHHHHHHHHHH:.....................:H',
  'HHH..1......H:::HHH.T........T.::::::::::::::::y:....R............R...:H',
  'HHH.........::H::::............HHHHHHHHHHHHHHHHH:..........K..........:H',
  'HHH.........H:::HHH.........K..HHHH...gg....fHHH:.....................:H',
  'HHH.p.......HHHHHHH..b.,,,.b...::::.......2..HHH:..........R.........,:H',
  'HHH.,......fHHHHHHH............HHHH.....,,.h.HHH:b,........:........,b:H',
  'HHHHHHHHHHHHHHHHHHHHHHHHHHHHHHHHHHHHHHHHHHHHHHHH:::::::::::::::::::::::H',
  'HHHHHHHHHHHHHHHHHHHHHHHHHHHHHHHHHHHHHHHHHHHHHHHHHHHHHHHHHHHHHHxHHHHHHHHH',
  'HTbb.T...Tb...T...Tb..T.bT.~~~...bTH.TbT.HHHHHHTb...Tb.HHTbT..:......bTH',
  'H..pp......T..gggg........T~~~,f.h.H.....HHHHHH..T.....HH...T.:......p.H',
  'H..,,.,,......ggg...f,,f...~~~,,...H.,,..HHHHHH.....S..HH.....:...T....H',
  'H..,f.,.............r.,..S.~~~.TR..H...S.HHHHHH.|||....HH.....:||||||..H',
  'H..f....E.|||||............~~~...........HHHHHH........OO.....:........H',
  'HT..:::::::::::::::::::::::=~=:::::::K::::B::::::::::::OO.....:...f.,,bH',
  'H.:::@......S..|||||...r...~~~.|||..b....HHHHHH..,,....HH::::::ggg....TH',
  'Hb.........R....R.......R..~~~.gg..H.....HHHHHH....f...HH..............H',
  'HT.....G.b.........ggg.f..b~~~Gg...H.,,f.HHHHHH.gg.....HH...f...,,.C...H',
  'HbT.....G,,,,......gg...T..~~~...p.H.h...HHHHHH...T..b.HH.......,...Gb.H',
  'H.....T.f...bT...T...Tb..T.~~~Tbb.THT...THHHHHHT...b..THH.Tb.....bT....H',
  'HHHHHHHHHHHHHHHHHHHHHHHHHHHHHHHHHHHHHHHHHHHHHHHHHHHHHHHHHHHHHHHHHHHHHHHH'
]

export const MEADOW: StageData = {
  id: 'meadow',
  map: MAP,
  light: 'day',
  legend: {
    '.': { tile: 'grass' },
    ',': { tile: 'flowers' },
    ':': { tile: 'path' },
    _: { tile: 'floor' },
    '=': { tile: 'bridge' },
    '#': { tile: 'wall' },
    H: { tile: 'hedge' },
    '|': { tile: 'fence' },
    '~': { tile: 'water' },
    o: { tile: 'pit' },
    '^': { tile: 'spikes' },
    T: { tile: 'grass', ent: { type: 'decor', kind: 'tree' } },
    R: { tile: 'grass', ent: { type: 'decor', kind: 'rock' } },
    Q: { tile: 'floor', ent: { type: 'decor', kind: 'rock' } },
    b: { tile: 'grass', ent: { type: 'decor', kind: 'bush' } },
    f: { tile: 'grass', ent: { type: 'decor', kind: 'flower' } },
    I: { tile: 'floor', ent: { type: 'decor', kind: 'pillar' } },
    t: { tile: 'floor', ent: { type: 'decor', kind: 'torch' } },
    V: { tile: 'floor', multi: true, ent: { type: 'decor', kind: 'altar', solid: false } },
    g: { tile: 'grass', ent: { type: 'prop', kind: 'grass' } },
    G: { tile: 'grass', ent: { type: 'prop', kind: 'grass', drop: ['gem'] } },
    i: { tile: 'grass', ent: { type: 'decor', kind: 'pillar' } },
    p: { tile: 'grass', ent: { type: 'prop', kind: 'pot' } },
    P: { tile: 'floor', ent: { type: 'prop', kind: 'pot' } },
    h: { ent: { type: 'prop', kind: 'pot', drop: ['heart'] } },
    n: { ent: { type: 'prop', kind: 'bounce' } },
    '*': { ent: { type: 'pickup', kind: 'gem' } },
    '@': { tile: 'grass', ent: { type: 'spawn' } },
    K: { ent: { type: 'checkpoint' } },
    S: { ent: { type: 'sign' } },
    E: {
      tile: 'grass',
      ent: {
        type: 'npc',
        kind: 'elder',
        pages: [
          'おお、目覚めたか、ちいさなマモノたちよ。人間のギルドが、陣の宝珠をうばっていったのじゃ。',
          'WASDで移動、クリックで攻撃。長押ししてはなすと、それぞれの必殺技が出るぞ。',
          '仲間と近くに集まると「陣形」になる。陣形では攻撃が強くなり、うけるダメージもへる。',
          '陣形のまま長押しをはなすと協力技！ スペースでぷるんとジャンプもできるぞ。',
          'Tabで操るマモノを交代、Qで仲間に「待て」「ついてこい」、Fで「せーの！」の合図じゃ。',
          'この先の水路は、こわれた橋からジャンプでこえるのじゃ。'
        ]
      }
    },
    r: { ent: { type: 'enemy', kind: 'rookie' } },
    w: { ent: { type: 'enemy', kind: 'bowman' } },
    a: { ent: { type: 'enemy', kind: 'apprentice' } },
    z: { ent: { type: 'enemy', kind: 'shieldman' } },
    J: { tile: 'floor', ent: { type: 'boss', kind: 'garud' } },
    B: { tile: 'path', ent: { type: 'prop', kind: 'block', id: 'blockB', weight: 2 } },
    O: { tile: 'grass', multi: true, ent: { type: 'prop', kind: 'boulder', id: 'boulderB', weight: 4 } },
    C: { tile: 'grass', ent: { type: 'prop', kind: 'chest', drop: ['gem_big', 'gem_big', 'heart'] } },
    c: {
      tile: 'floor',
      ent: { type: 'prop', kind: 'chest', id: 'chestF', cond: { on: 'bigplateF' }, drop: ['bigheart', 'gem_big'] }
    },
    x: { tile: 'path', ent: { type: 'prop', kind: 'gate', id: 'gateCin', lock: 'C' } },
    y: { tile: 'path', ent: { type: 'prop', kind: 'gate', id: 'gateCout', cond: { clear: 'C' }, latch: true } },
    '1': { ent: { type: 'prop', kind: 'plate', id: 'plateD1' } },
    '2': { ent: { type: 'prop', kind: 'plate', id: 'plateD2' } },
    D: {
      tile: 'grass',
      ent: {
        type: 'prop',
        kind: 'gate',
        id: 'gateD',
        cond: { any: [{ all: [{ on: 'plateD1' }, { on: 'plateD2' }] }, { on: 'leverD' }] }
      }
    },
    L: { tile: 'grass', ent: { type: 'prop', kind: 'lever', id: 'leverD' } },
    '&': { tile: 'grass', ent: { type: 'prop', kind: 'acorn', id: 'acorn', weight: 3 } },
    U: { tile: 'grass', multi: true, ent: { type: 'prop', kind: 'pedestal', id: 'pedestalE', accepts: 'acorn' } },
    e: { tile: 'floor', ent: { type: 'prop', kind: 'gate', id: 'gateE', cond: { on: 'pedestalE' }, latch: true } },
    X: { tile: 'floor', multi: true, ent: { type: 'prop', kind: 'crackrock', id: 'crackF' } },
    M: { tile: 'floor', multi: true, ent: { type: 'prop', kind: 'bigplate', id: 'bigplateF' } },
    '5': { ent: { type: 'prop', kind: 'crystal', id: 'crystal1', group: 'G' } },
    '6': { ent: { type: 'prop', kind: 'crystal', id: 'crystal2', group: 'G' } },
    '7': { ent: { type: 'prop', kind: 'crystal', id: 'crystal3', group: 'G' } },
    '8': { ent: { type: 'prop', kind: 'crystal', id: 'crystal4', group: 'G' } },
    W: {
      tile: 'floor',
      multi: true,
      ent: { type: 'prop', kind: 'bossdoor', id: 'bossdoor', cond: { flag: 'crystals:G' }, latch: true }
    }
  },
  rooms: [
    { id: 'I', name: '祭壇', x: 33, y: 1, w: 6, h: 3, zoom: 720, objective: '宝珠にふれよう' },
    {
      id: 'H',
      name: 'ボスの間',
      x: 26,
      y: 0,
      w: 20,
      h: 16,
      zoom: 720,
      boss: true,
      objective: '盾騎士団長ガルドをたおせ！'
    },
    {
      id: 'G',
      name: '四つの水晶の間',
      x: 16,
      y: 16,
      w: 44,
      h: 13,
      objective: '4つの水晶を同時にたたこう（せーの：F）'
    },
    { id: 'F', name: '古城跡の入口', x: 39, y: 29, w: 33, h: 11, objective: 'ひび割れた岩を協力技でこわそう' },
    { id: 'E', name: 'どんぐりの丘', x: 0, y: 29, w: 39, h: 12, objective: '巨大どんぐりを台座へはこぼう' },
    { id: 'D', name: '生け垣の迷路', x: 0, y: 41, w: 47, h: 10, objective: '2つのスイッチを同時にふもう' },
    {
      id: 'C',
      name: '見張りの広場',
      x: 47,
      y: 41,
      w: 25,
      h: 11,
      objective: '見張りの広場を突破しよう',
      checkpointOnClear: true,
      waves: [
        [
          { kind: 'rookie', x: 52, y: 43 },
          { kind: 'rookie', x: 66, y: 43 },
          { kind: 'bowman', x: 55, y: 42 },
          { kind: 'bowman', x: 63, y: 42 }
        ],
        [
          { kind: 'rookie', x: 51, y: 47 },
          { kind: 'rookie', x: 67, y: 47 },
          { kind: 'apprentice', x: 59, y: 42 },
          { kind: 'shieldman', x: 59, y: 44 }
        ]
      ]
    },
    { id: 'B', name: '石の小道', x: 36, y: 52, w: 36, h: 12, objective: '陣形を組んで石をおそう' },
    {
      id: 'A',
      name: 'はじまりの草原',
      x: 0,
      y: 52,
      w: 36,
      h: 12,
      objective: 'こわれた橋からジャンプ（スペース）で水路をこえよう'
    }
  ],
  signs: [
    [
      '4つの水晶を1.5秒以内にぜんぶたたくと、ボスのとびらがひらく。',
      'せーの（F）で合わせよう。Qで「待て」にした仲間は、GO！の合図でいっせいに攻撃するぞ。',
      'Tabで操るマモノをかえて、ひとりずつ水晶の前に立たせよう。'
    ],
    ['大きなスイッチは、協力技の着地でしかしずまない。'],
    [
      'ひび割れた岩は、ふつうの攻撃ではびくともしない。',
      '陣形のままクリックを長押しして、はなすと協力技「ジャンボ・プレス」！ ねらった場所にどーんと着地するぞ。'
    ],
    [
      '巨大どんぐりは3人以上でもちあげよう。Eでつかむと、ついてこいの仲間もいっしょにつかむ。',
      '台座にのせると、古城跡のとびらがひらく。'
    ],
    [
      '2つのスイッチを同時にふむと、出口がひらく。',
      'Qで仲間に「待て」。Tabで操るマモノを交代して、スイッチの上に残していこう。',
      '出口の先のレバーをひけば、とびらはずっとひらいたままになる。'
    ],
    ['4人で陣形を組んで押そう。', '大岩はおもさ4。ついてこいの仲間も、いっしょに押してくれる。'],
    ['こわれた橋は、スペースでぷるんとジャンプしてこえよう。'],
    ['2人以上の陣形で押そう。', '石のブロックはおもさ2。陣形の仲間が同じ方向へ進むと、力をあわせて押せる。'],
    ['クリックで攻撃。草を切ったり、つぼをもちあげて（E）投げたりできる。', '長押ししてはなすと、それぞれの必殺技！']
  ]
}
