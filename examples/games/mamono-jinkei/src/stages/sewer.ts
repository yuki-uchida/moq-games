/**
 * Stage 2 「地下水路と穀物庫」 (rat, dim). South (start) → north (boss):
 * A 下水の入口 → B 流れる水路 → C 鼠穴の小部屋 → D 番兵の詰所 → E チーズの運河 → F 穀物庫 → G 穀物庫の上階 →
 * H 屋根裏のボス部屋 (I 祭壇).
 *
 * Legend: terrain `#` brick `w` wall `.` sewer `:` floor `p` planks `~` sludge; currents `>` (B, east),
 * `{` (C, a torrent south that only the sluice stops), `v` (E canal, south); mouse holes `a`/`j`/`k` (pairs).
 * Decoration `P` pipe `L` lamp `R` grate `Y` cobweb `X` sack `H` haybale `F` shelf `A` altar.
 * Props `c` crate `O` big crate `r` barrel `q` pot `m` mousetrap `V` valve (group C) `Z` sluice `C` cheese `U` scale
 * `B`/`n` barricades `T`/`t` chests `x`/`y`/`G` gates `W` boss door. Others: `@` spawn `K` checkpoint `E` smith
 * `S` sign `i` gem `e` thief `f` alchemist `u` rat-catcher `g` spear guard `J` boss.
 */
import type { StageData } from '../sim/stage-data'

// prettier-ignore
const MAP = [
  '########################################################################',
  '###########################YppLppppppppppLppY###########################',
  '###########################pppppppppppppppppp###########################',
  '###########################ppppppppAApppppppp###########################',
  '###########################HppppppppppppppppH###########################',
  '###########################pppppppppppppppppp###########################',
  '###########################pppppppppJpppppppp###########################',
  '###########################LppppppppppppppppL###########################',
  '###########################pppppppppppppppppp###########################',
  '###########################pppppppppppppppppp###########################',
  '###########################HppppppppppppppppH###########################',
  '###########################pppppppppppppppppp###########################',
  '###########################pppppppppppppppppp###########################',
  '###########################pXppppppppppppppXp###########################',
  '###########################YppppppppppppppppY###########################',
  '#########################################WWW############################',
  '#########################################ppp############################',
  '########################################wppwwwwpLpppppppLpppppppLpwpipi#',
  '########################################wppwwwwpppppppppppppppppppwpptp#',
  '########################################wBBwwwwpppgpppppppppppppppwpppp#',
  '########################################wppwwwwpppppppppppppppupppwwnnw#',
  '########################################wppwwwwpppppppppppppppppppppppp#',
  '########################################wppwwwwppppppppppppppppRppppppp#',
  '########################################wpppppppppKpppppppppppppppppppp#',
  '########################################wpppppppppppppppupppppppppppppp#',
  '########################################wpppppppSpppppppppppppppfpppppp#',
  '########################################wppppppXpppppppppXpppppppppppXp#',
  '########################################wpppppppppppppppppppppppppppppp#',
  '########################################wwwwwwwwwwwwwwOOwwwwwwwwwwwwwww#',
  '#Y...P......P....vvv....P........P....Y#wwwwwwwwwwwwwwOOwwwwwwwwwwwwwww#',
  '#...H......rr...LvvvL.....H............#YppppLppppppppppppppLpppppppppY#',
  '#.....i..........vvv...........r....X..#pHpppppprpppppppppppSpppppuppHp#',
  '#................vvv.....u.............Gppppppppppppppppppppppppppppppp#',
  '#.X......UU......vvv..............R....#ppppSppppppppmpppppppppppmppppp#',
  '#.X..............vvv...................#ppppppmpppppppppppppppppppppppp#',
  '#................vvv........C..........#ppppppppppppppppppmpppppppppppp#',
  '#.......e....S..LvvvL..................#ppppppppppmpppppppppppppppppppp#',
  '#...H..R.........~~~....S..........H...#pprrpppppppppRppppppupmpppppppp#',
  '#................~~~..........K........#pppppppppppppppppppppppppppppHp#',
  '#Y..............Y~~~Y.................Y#YppppppFppppFppppFppppFppppFppY#',
  '##############################y###################P#######P#######P#####',
  '######################Y::::::::::::::::::::::::x......................Z#',
  '######################:FppppLpppppppppppLppppF:#{{{{{{{{{{{{{{{{{{{{{{{#',
  '######################:ppppppppppppppppppppppp:#{{{{{{{{{{{{{{{{{{{{{{{#',
  '######################:pppppppppppppppRppppppp:#{{{{{{{{{{{{{{{{{{{{{{{#',
  '######################:XppppppppppKppppppppppp:#L..............L########',
  '######################:ppppppppppppppppppppppX:#................jj...V.#',
  '######################:pppppppRppppppppppppppp:#........S.......##Y....#',
  '######################:ppppppppppppppppppppppp:#....R.......R...########',
  '######################:FppppLpppppppppppLppppF:#........K.......kk.....#',
  '######################::::::::::::::::::::::::Y#Y..............Y##Y..V.#',
  '##############################################################.#########',
  '#..P........P.......###Y..P...q..P.#.P.........P....q....P...X.....P..L#',
  '#L.............R...L###...........L#L.......rr........R................#',
  '#...............i...###......S.....#Y.............................R...Y#',
  '#......E............###..r.........#>>>>>>>>>>>>>>>>>>>>>>>>>>>>~~~~~~~#',
  '#................S..###...e....R...#>>>>>>>>>>>>>>>>>>>>>>>>>>>>~~~~~~~#',
  '#...@......S........a#a..........i.#>>>>>>>>>>>>>>>>>>>>>>>>>>>>~~~~~~~#',
  '#.X.................###....R..............R.....L...........L...########',
  '#.X...R.......rr....###.........XX....S.....e.......e.....S......~.....#',
  '#Y.................Y###L....q.....Y.....rr....................c..~...i.#',
  '#~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~#..........XX..q..............~...T.#',
  '#~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~#L......P...........P.......Y.~..i..#',
  '########################################################################',
]

export const SEWER: StageData = {
  id: 'sewer',
  map: MAP,
  light: 'dim',
  legend: {
    '#': { tile: 'brick' },
    w: { tile: 'wall' },
    '.': { tile: 'sewer' },
    ':': { tile: 'floor' },
    p: { tile: 'planks' },
    '~': { tile: 'sludge' },
    '>': { tile: 'current', ent: { type: 'current', channel: 'B', dx: 1, dy: 0 } },
    '{': { tile: 'current', ent: { type: 'current', channel: 'C', dx: 0, dy: 1, speed: 400, strong: true } },
    v: { tile: 'current', ent: { type: 'current', channel: 'E', dx: 0, dy: 1 } },
    a: { tile: 'hole', ent: { type: 'hole', pair: 'A' } },
    j: { tile: 'hole', ent: { type: 'hole', pair: 'C1' } },
    k: { tile: 'hole', ent: { type: 'hole', pair: 'C2' } },
    P: { tile: 'brick', ent: { type: 'decor', kind: 'pipe' } },
    L: { ent: { type: 'decor', kind: 'lamp' } },
    R: { ent: { type: 'decor', kind: 'grate' } },
    Y: { ent: { type: 'decor', kind: 'cobweb' } },
    X: { ent: { type: 'decor', kind: 'sack' } },
    H: { ent: { type: 'decor', kind: 'haybale' } },
    F: { ent: { type: 'decor', kind: 'shelf' } },
    A: { tile: 'planks', multi: true, ent: { type: 'decor', kind: 'altar', solid: false } },
    c: { tile: 'sewer', ent: { type: 'prop', kind: 'crate', id: 'crateB' } },
    O: { tile: 'planks', multi: true, ent: { type: 'prop', kind: 'bigcrate', id: 'bigcrateF', weight: 4 } },
    r: { ent: { type: 'prop', kind: 'barrel' } },
    q: { ent: { type: 'prop', kind: 'pot' } },
    m: { tile: 'planks', ent: { type: 'prop', kind: 'mousetrap' } },
    V: { tile: 'sewer', ent: { type: 'prop', kind: 'valve', group: 'C' } },
    Z: {
      tile: 'sewer',
      ent: { type: 'prop', kind: 'sluice', id: 'sluiceC', cond: { flag: 'valves:C' }, latch: true, stops: ['C'] }
    },
    C: { tile: 'sewer', ent: { type: 'prop', kind: 'cheese', id: 'cheese', weight: 3 } },
    U: { tile: 'sewer', multi: true, ent: { type: 'prop', kind: 'scale', id: 'scaleE', accepts: 'cheese' } },
    B: { tile: 'planks', multi: true, ent: { type: 'prop', kind: 'barricade', id: 'barricadeG' } },
    n: { tile: 'planks', multi: true, ent: { type: 'prop', kind: 'barricade', id: 'nookG' } },
    T: { tile: 'sewer', ent: { type: 'prop', kind: 'chest', id: 'chestB', drop: ['gem_big', 'heart'] } },
    t: { tile: 'planks', ent: { type: 'prop', kind: 'chest', id: 'chestG', drop: ['bigheart', 'gem_big', 'gem_big'] } },
    x: { tile: 'floor', ent: { type: 'prop', kind: 'gate', id: 'gateDin', lock: 'D' } },
    y: { tile: 'floor', ent: { type: 'prop', kind: 'gate', id: 'gateDout', cond: { clear: 'D' }, latch: true } },
    G: { tile: 'planks', ent: { type: 'prop', kind: 'gate', id: 'granary', cond: { on: 'scaleE' }, latch: true } },
    W: { tile: 'planks', multi: true, ent: { type: 'prop', kind: 'bossdoor', id: 'bossdoor' } },
    '@': { tile: 'sewer', ent: { type: 'spawn' } },
    K: { ent: { type: 'checkpoint' } },
    S: { ent: { type: 'sign' } },
    i: { ent: { type: 'pickup', kind: 'gem' } },
    E: {
      tile: 'sewer',
      ent: {
        type: 'npc',
        kind: 'smith',
        pages: [
          'へいらっしゃい！ ネズミの鍛冶屋だよ。今度のからだは、すばしっこいネズミだ。',
          'スペースで「チョロ走り」！ ちょっとの間だけ3倍の速さで走れて、ダッシュ中は攻撃も当たらない。',
          '壁のちいさな穴はネズミ穴。穴にむかってダッシュすれば、つながった穴から出てこられる。荷物はとおらないぞ。',
          '流れる水路はひとりだと流される。3人以上の陣形なら、流れにさからって歩けるんだ。',
          '陣形のまま長押しをはなすと協力技「チューチュー大行進」。一列になって突っ走り、バリケードもかじりやぶる！'
        ]
      }
    },
    e: { ent: { type: 'enemy', kind: 'thief' } },
    f: { ent: { type: 'enemy', kind: 'alchemist' } },
    u: { ent: { type: 'enemy', kind: 'ratcatcher' } },
    g: { ent: { type: 'enemy', kind: 'spearguard' } },
    J: { tile: 'planks', ent: { type: 'boss', kind: 'milda' } }
  },
  rooms: [
    { id: 'I', name: '祭壇', x: 33, y: 1, w: 6, h: 3, zoom: 720, objective: '宝珠にふれよう' },
    {
      id: 'H',
      name: '屋根裏のボス部屋',
      x: 26,
      y: 0,
      w: 20,
      h: 16,
      zoom: 720,
      boss: true,
      objective: '猫使いの魔女ミルダをたおせ！'
    },
    {
      id: 'G',
      name: '穀物庫の上階',
      x: 39,
      y: 16,
      w: 33,
      h: 12,
      objective: 'バリケードをチューチュー大行進でやぶろう'
    },
    { id: 'F', name: '穀物庫', x: 39, y: 28, w: 33, h: 12, objective: '大きな木箱を4人で押して上へ' },
    { id: 'E', name: 'チーズの運河', x: 0, y: 29, w: 39, h: 12, objective: 'チーズを天秤へはこぼう' },
    {
      id: 'D',
      name: '番兵の詰所',
      x: 21,
      y: 41,
      w: 26,
      h: 10,
      objective: '番兵の詰所を突破しよう',
      checkpointOnClear: true,
      waves: [
        [
          { kind: 'thief', x: 26, y: 44 },
          { kind: 'thief', x: 42, y: 44 },
          { kind: 'spearguard', x: 34, y: 43 },
          { kind: 'alchemist', x: 34, y: 48 }
        ],
        [
          { kind: 'thief', x: 25, y: 47 },
          { kind: 'spearguard', x: 28, y: 43 },
          { kind: 'spearguard', x: 40, y: 43 },
          { kind: 'ratcatcher', x: 43, y: 48 },
          { kind: 'alchemist', x: 34, y: 44 }
        ]
      ]
    },
    {
      id: 'C',
      name: '鼠穴の小部屋',
      x: 47,
      y: 40,
      w: 25,
      h: 12,
      objective: '2つのバルブを同時にまわそう（せーの：F）'
    },
    { id: 'B', name: '流れる水路', x: 36, y: 52, w: 36, h: 12, objective: '陣形を組んで水路をわたろう' },
    {
      id: 'A',
      name: '下水の入口',
      x: 0,
      y: 52,
      w: 36,
      h: 12,
      objective: 'ネズミ穴にむかってダッシュ（スペース）しよう'
    }
  ],
  signs: [
    [
      'バリケードは、チューチュー大行進でしかこわせない。',
      '陣形のままクリックを長押しして、バリケードにむけてはなそう！'
    ],
    ['大きな木箱はおもさ4。4人で陣形を組んで押そう。'],
    ['ネズミ捕りに注意！ ふむとパチンとはさまれる。', '樽やつぼを投げつけると、先に閉じてしまうぞ。'],
    ['チーズを天秤にのせると、穀物庫の扉がひらく。'],
    ['チーズは3人以上でつかもう（E）。', 'はこんでいる仲間は陣形だから、水路に流されない。'],
    [
      'バルブは2つ。1.5秒以内に両方まわすと水門がひらく。',
      'Qで仲間に「待て」。待っている仲間は、せーの（F）のGO！でバルブをまわしてくれる。'
    ],
    ['流れる水路は、3人以上の陣形なら流されない。'],
    ['壁のネズミ穴にむかってスペースでダッシュすると、反対側へぬけられる。'],
    ['スペースでチョロ走り！ ダッシュ中は攻撃が当たらない。'],
    ['木箱は押して汚水に落とすと、足場になる。'],
    ['流れにのると汚水に落ちるぞ！ 陣形を組んでわたろう。']
  ]
}
