/**
 * Stage 4 「月影の森と白銀の砦」 (wolf, night) — the final stage. South (start) → north (boss):
 * A 月影の森の入口 → B 雪の小道 → C 凍った湖 → D 四つの月石 → E 狩人の野営地 → F 丸太の破城槌 →
 * G 白銀の砦の中庭 → H 砦の天守 (I 祭壇).
 *
 * Legend: terrain `#` thicket `%` fortwall `f` forest `s` snow `i` ice `~` water `_` floor `:` path.
 * Decoration `T` pine `D` dead tree `Y` tent `z` brazier `B` banner `A` altar. Props `m`/`o`/`M` moonstones (A gate,
 * path lamps, set D) `N` big moonstone `k` ice block `L` lever `l` log `R` ram slot `I` ice wall `P` snow pile
 * `a`/`c`/`d`/`x`/`y`/`G` gates `W` boss door. Others: `@` spawn `K` checkpoint `E` bard `S` sign `h` hunter
 * `q` paladin `w` ice witch `H` heavy `J` boss.
 */
import type { StageData } from '../sim/stage-data'

// prettier-ignore
const MAP = [
  '########################################################################',
  '###########################z__B__________B__z###########################',
  '###########################B_______AA_______B###########################',
  '###########################__________________###########################',
  '###########################z________________z###########################',
  '###########################__________________###########################',
  '###########################B________J_______B###########################',
  '###########################z________________z###########################',
  '###########################B________________B###########################',
  '###########################__________________###########################',
  '###########################z________________z###########################',
  '###########################__________________###########################',
  '###########################__________________###########################',
  '###########################z_____B_____B____z###########################',
  '#######################%%%%%%%%%%%%WWW%%%%%%%%%%%%%%%%%%%%%%%%%%########',
  '#######################%_z____z_____________z________________z_%########',
  '#######################%______NN_______________________________%########',
  '#######################%______NN________S___w__________q_______%########',
  '#######################%_______________________________________%########',
  '#######################%%%%%%%%%%%%%%%%%%%%%%%%%%%II%%%%%%%%%%%%########',
  '#######################%%%%%%%%%%%%%%%%%%%%%%%%%%%II%%%%%%%%%%%%########',
  '#######################%_z__B_____B_____B_____B_______B___B__z_%########',
  '#######################%_______________________________________%########',
  '#######################%______________________S_____________P__%########',
  '#######################%___P__________H_________________K______%########',
  '#######################%________P___________H__________________%########',
  '#######################%_z___________________________________z_%########',
  '#######################%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%G%%%%%%########',
  '######################################ssssssssssssssssssssRRsssssssssss#',
  '##TsssssssssssssssssssssssssssssssssT#ssPssssYssssssBsssssssssssBssssss#',
  '##ssssssssssssBssssssssssBssssssssPss#ssssssssssssssssssssssssssssssssT#',
  '##ssffffzfffffffffffffffffffffzffffss#ss:::::::::::::::::::::::::::ssss#',
  '##ssfffffffffffffffffffffffffffffffss#ss:::::::::::::::::::::::::::ssss#',
  '##ssfYfffffffffffffffffffffffffffffssyss::::l:::::H::::::::::::h:::ssss#',
  '##ssfffffffffffffffKfffffffffffffYfss#ss:::::::::::::::::::::::::::ssYs#',
  '##ssfffffffffffffffffffffffffffffffss#ss:::::::::::::::::::::::::::ssss#',
  '##ssffffzfffffffffffffffffffffzffffss#ssszssssssSsssssssssssssssssssPss#',
  '##ssPssssssssssssssssssssssssssssssss#ssssssssszssssBssszsssssTsssBssss#',
  '##TsssssssssssssssssssssssssssssssssT#TsssssssssssssssssssssssssssssssT#',
  '####################x###################################################',
  '####################d###################################################',
  '#####fffY###########:####ffff###########Tsssiiiiiiiiiiiii~~~~~iiiiiiisT#',
  '#####fMff###########:####ffMf###########ssDsiiiiiiii#iiii~sss~iiiiiiiss#',
  '#####ffff###########:####fffY###########ssssiiiiiiiiiiiii~ssL~iiiiiiiss#',
  '######:###:S:#######:#####:#############szssiiiiiiiiiiiii~sss~iiiiiiiss#',
  '###:::::::::::::::::::::::::::K::::::::cssssiiiiiiiiiiiii~~~~~iiiiiiiss#',
  '################:#################:#####szssiiiiiiiiiiiiiiiiiiiiiiiiiTs#',
  '###############ffff##############fffY###ssssiiiiiiiikiiiiiiiiiiiiiiiiss#',
  '###############ffMf##############ffMf###sTssiiiiiiiiiiiiiiiiiiiiiiiiisD#',
  '###############Yfff##############ffff###ssssiiiiiiiiiiiiiiiiiiiiiiiiiss#',
  '########################################TsssssSPssssssssssssssPsKsssssT#',
  '##################################################################:#####',
  '#ffffTffffffffTffffffffffTfffff#sssssTsssssssTssssssssssssssssssss:ssss#',
  '#fTffffffTffffffffTffffffffffTf#sTsssssssTssssssss:::::::::::::::::ssTs#',
  '#fffffffffffsfffffffffDffffffff#ssssssssssssssssss:::::::::::::::::ssss#',
  '#ffDfffffffffffffPfffSfffffffff#ssssssssssssDsssss::ssosssssssossssssss#',
  '#ffffffEfffSffffffffffffffmffff#ssssssosssssssssss::sSssssssssssssssssT#',
  '#ff::::::::::::z:::::::::::::::a::::::::::::::::::::sssffffffffPsssssss#',
  '#ff:@::::::::::z:::::::::::::::#::::::::::::::::::::sssfYffzffBfsssssss#',
  '#ffffffffffffffffffffffffffffff#ssSsssssssssssossssssssfffhfhfffssssDss#',
  '#fffffPfffssffffDffffffffffsfff#ssssssssKsssssssssssDssfPffffYffsssssss#',
  '#fTffffffffffTffffffffffTffffff#sssssssssTssssssTssssssffBffPfffsssssss#',
  '#fffffffTffffffffffTfffffffffTf#sssTsssssssssssssssssTsssssssssssssTsss#',
  '########################################################################',
]

export const FOREST: StageData = {
  id: 'forest',
  map: MAP,
  light: 'night',
  legend: {
    '#': { tile: 'thicket' },
    '%': { tile: 'fortwall' },
    f: { tile: 'forest' },
    s: { tile: 'snow' },
    i: { tile: 'ice' },
    '~': { tile: 'water' },
    _: { tile: 'floor' },
    ':': { tile: 'path' },
    T: { ent: { type: 'decor', kind: 'pine' } },
    D: { ent: { type: 'decor', kind: 'deadtree' } },
    Y: { ent: { type: 'decor', kind: 'tent' } },
    z: { ent: { type: 'decor', kind: 'brazier' } },
    B: { ent: { type: 'decor', kind: 'banner' } },
    A: { tile: 'floor', multi: true, ent: { type: 'decor', kind: 'altar', solid: false } },
    m: { tile: 'forest', ent: { type: 'prop', kind: 'moonstone', id: 'moonA' } },
    o: { ent: { type: 'prop', kind: 'moonstone' } },
    M: { tile: 'forest', ent: { type: 'prop', kind: 'moonstone', group: 'D' } },
    N: { tile: 'floor', multi: true, ent: { type: 'prop', kind: 'bigmoon', id: 'bigmoonG' } },
    k: { tile: 'ice', ent: { type: 'prop', kind: 'iceblock', id: 'iceC', weight: 2 } },
    L: { tile: 'snow', ent: { type: 'prop', kind: 'lever', id: 'leverC' } },
    l: { tile: 'path', ent: { type: 'prop', kind: 'log', id: 'log', weight: 4 } },
    R: { tile: 'snow', multi: true, ent: { type: 'prop', kind: 'ramslot', id: 'ramslotF', accepts: 'log' } },
    I: { tile: 'floor', multi: true, ent: { type: 'prop', kind: 'icewall', id: 'icewallG' } },
    P: { ent: { type: 'prop', kind: 'snowpile' } },
    a: { tile: 'path', ent: { type: 'prop', kind: 'gate', id: 'gateA', cond: { on: 'moonA' }, latch: true } },
    c: { tile: 'snow', ent: { type: 'prop', kind: 'gate', id: 'gateC', cond: { on: 'leverC' }, latch: true } },
    d: { tile: 'path', ent: { type: 'prop', kind: 'gate', id: 'gateD', cond: { flag: 'moons:D' }, latch: true } },
    x: { tile: 'path', ent: { type: 'prop', kind: 'gate', id: 'gateEin', lock: 'E' } },
    y: { tile: 'snow', ent: { type: 'prop', kind: 'gate', id: 'gateEout', cond: { clear: 'E' }, latch: true } },
    G: { tile: 'floor', ent: { type: 'prop', kind: 'gate', id: 'fortgate', cond: { on: 'ramslotF' }, latch: true } },
    W: {
      tile: 'floor',
      multi: true,
      ent: { type: 'prop', kind: 'bossdoor', id: 'bossdoor', cond: { on: 'bigmoonG' }, latch: true }
    },
    '@': { tile: 'path', ent: { type: 'spawn' } },
    K: { ent: { type: 'checkpoint' } },
    S: { ent: { type: 'sign' } },
    E: {
      tile: 'forest',
      ent: {
        type: 'npc',
        kind: 'bard',
        pages: [
          'ようこそ、若き狼たち。わしは老いた吟遊詩人。これが最後の旅になるだろう。',
          '森は夜。みんなのまわりだけが明るい。たき火や光る月石のそばは見通しがきくぞ。',
          'スペースで遠吠え！ 近くの敵をひるませ、まわりの月石を6秒だけ光らせる。',
          '大きな月石は、ふたつの遠吠えが重なる「共鳴」でしか目覚めない。ついてくる仲間は、きみの遠吠えに答えてくれる。',
          '走りつづけると駆け足になる。氷の上はすべるから気をつけるのじゃ。',
          '陣形のまま長押しをはなすと協力技「月下群狼陣」。氷の壁も、勇者の盾も、これでくだける。'
        ]
      }
    },
    h: { ent: { type: 'enemy', kind: 'hunter' } },
    q: { ent: { type: 'enemy', kind: 'paladin' } },
    w: { ent: { type: 'enemy', kind: 'icewitch' } },
    H: { ent: { type: 'enemy', kind: 'heavy' } },
    J: { tile: 'floor', ent: { type: 'boss', kind: 'leon' } }
  },
  rooms: [
    { id: 'I', name: '祭壇', x: 33, y: 1, w: 6, h: 3, zoom: 720, objective: '最後の宝珠にふれよう' },
    { id: 'H', name: '砦の天守', x: 26, y: 0, w: 20, h: 15, zoom: 720, boss: true, objective: '勇者レオンをたおせ！' },
    {
      id: 'G',
      name: '白銀の砦の中庭',
      x: 23,
      y: 15,
      w: 41,
      h: 13,
      objective: '氷の壁をくだき、大きな月石を共鳴させよう'
    },
    { id: 'F', name: '丸太の破城槌', x: 37, y: 28, w: 35, h: 11, objective: '丸太を4人で砦の門へはこぼう' },
    {
      id: 'E',
      name: '狩人の野営地',
      x: 1,
      y: 28,
      w: 36,
      h: 12,
      objective: '狩人の野営地を突破しよう',
      checkpointOnClear: true,
      waves: [
        [
          { kind: 'hunter', x: 8, y: 33 },
          { kind: 'hunter', x: 30, y: 33 },
          { kind: 'icewitch', x: 19, y: 31 }
        ],
        [
          { kind: 'paladin', x: 12, y: 34 },
          { kind: 'heavy', x: 26, y: 34 },
          { kind: 'icewitch', x: 19, y: 36 },
          { kind: 'hunter', x: 30, y: 30 }
        ]
      ]
    },
    { id: 'D', name: '四つの月石', x: 0, y: 40, w: 39, h: 11, objective: '4つの月石を同時に光らせよう（せーの：F）' },
    { id: 'C', name: '凍った湖', x: 39, y: 40, w: 33, h: 12, objective: '氷のブロックをすべらせて島へわたろう' },
    { id: 'B', name: '雪の小道', x: 31, y: 52, w: 41, h: 12, objective: '月石の明かりをたどろう' },
    { id: 'A', name: '月影の森の入口', x: 0, y: 52, w: 31, h: 12, objective: '遠吠え（スペース）で月石を光らせよう' }
  ],
  signs: [
    [
      '大きな月石は「共鳴」で目覚める。',
      'ふたつの遠吠えを0.6秒以内に重ねよう。ついてくる仲間はきみの遠吠えに答えるぞ。'
    ],
    ['この氷の壁は、月下群狼陣でしかくだけない。'],
    ['丸太はおもさ4。4人でつかんで（E）砦の門へ。'],
    [
      '4つの月石を同時に光らせると北への道がひらく。',
      'Qで「待て」、Tabで交代して、ひとつずつ月石のそばへ。待っている仲間は、せーの（F）のGO！で遠吠えするぞ。'
    ],
    ['氷のブロックは押すと止まるまですべる。', '湖の島のレバーへ、ブロックを水路に落として道を作ろう。'],
    ['遠吠え（スペース）で月石が光ると、この先の門がひらく。'],
    ['夜の森は暗い。敵は「！」を出してから襲ってくる。見のがすな。'],
    ['狩人のわなに注意。仲間が攻撃すれば、すぐにはずれる。'],
    ['月石の明かりは道しるべ。遠吠えで灯していこう。']
  ]
}
