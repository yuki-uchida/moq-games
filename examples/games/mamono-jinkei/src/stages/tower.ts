/**
 * Stage 3 「風鳴りの崖と時計塔」 (crow, day, windy). South (start) → north (boss):
 * A 風の崖の入口 → B 雲海の飛び石 → C 風車の谷 → D 鷹匠の見張り台 → E 四つの鐘楼 → F 金の鐘 → G 時計塔の内部 →
 * H 時計塔の屋上 (I 祭壇).
 *
 * Legend: terrain `~` sky `c` cliff `.` grass `#` rock `w` wall `_` floor `p` planks `=` bridge `r` roof.
 * Decoration `F` flag `C` cloud `Q` gear `t` torch `R` rock `A` altar. Props `v` vent `M` windmill
 * `d`/`f` drawbridges `B` bells (group E) `g` gold bell `H` hook `G`/`D`/`x`/`y` gates `L` lock door `W` boss
 * door `P` pot. Others: `@` spawn `K` checkpoint `E` seer `S` sign `k` key `i` gem `a` falconer `b` crossbow
 * `m` wind mage `n` bell monk `J` boss.
 */
import type { StageData } from '../sim/stage-data'

// prettier-ignore
const MAP = [
  '~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~',
  '~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~rrrrrrrrrrrrrrrrrrrr~~~~~~',
  '~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~rFpppppppAApppppppFr~~~~~~',
  '~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~rppppppppppppppppppr~~~~~~',
  '~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~C~rppppppppppppppppppr~~~~~~',
  '~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~rppppppppppppppppppr~~~~~~',
  '~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~rtppppppppJppppppptr~~~~~~',
  '~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~rppppppppppppppppppr~~~~~~',
  '~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~rppppppppppppppppppr~C~~~~',
  '~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~rppppppppppppppppppr~~~~~~',
  '~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~C~rppppppppppppppppppr~~~~~~',
  '~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~rFppppppppppppppppFr~~~~~~',
  '~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~ppp~~~~~~~~~~~~~~~~~~~~~',
  '~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~WWW~~~~~~~~~~~~~~~~~~~~~',
  '~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~wwww___wwwwwwwwwwwwwwwwww~~~',
  '~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~wwQ_______w___Q_w_Q____ww~~~',
  '~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~ww________w_t___w______ww~~~',
  '~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~ww_____n__w_____w___k__ww~~~',
  '~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~ww________L_____w______ww~~~',
  '~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~ww_t______w_____w____t_ww~~~',
  '~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~ww__m_____w_b___L______ww~~~',
  '~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~ww____P___w_____w___P__ww~~~',
  '~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~ww________w__k__w__K___ww~~~',
  '~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~ww______Q_w_____w_____Qww~~~',
  '~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~wwwwwwwwwwwwwwwwwww_wwwww~~~',
  '~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~wwwwwwwwwDwww~~~~~',
  '~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~C~FccccccF~~~~~~ccccccccccccc~~~~~',
  '~~~~~~~~~~~~~Bc~~~~~~~~~~~~~~~~~~~cB~~~~ccccRccc~~C~~~cctccccccctcc~~~~~',
  '~~~~~~~~~~~~~cc~~~FcccccccccccF~~~cc~~~~cccccccc~~~~~~ccccccccccccc~~~~~',
  '~~~~~~~~~~~~~~~~~~ccccccncccccc~~~~~~~~~cccccccc~~~~~~ccccccHHccccc~~~~~',
  '~~~~~~~~~C~~~~~~~~ccRccccccKccccccccccc~ccccccccffffffccccccccccccc~C~~~',
  '~~~~~~~~~~~~~~~~C~cccccc...ccccccccccccGcccgccccffffffccccccccccccc~~~~~',
  '~~~~~~~~~~~~~~~~~~ccccc.....ccccccccccc~ccccccccffffffccccccccccccc~~~~~',
  '~~~~~~~~~~~~~~~~~~ccccSc....cRc~~~~~~~~~cccccccc~~~~~~cccSc...ccccc~~~~~',
  '~~~~~~~~~~~~~cc~~~ccccccccccacc~~~cc~~~~cccccScc~~~~~~cccc....cctcc~~~~~',
  '~~~~~~~~~~~~~Bc~~~cccncPccccccc~~~cB~~~~cPPccccc~~~C~~ccccc..ccRccc~~~~~',
  '~~~~~~~~~~~~~~~~~~FcccccccccccF~C~~~~~~~FccccccF~~~~~~ccccccccccccF~~~~~',
  '~~~~~~~~~~~~~~~~~~~~~~~~~y~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~',
  '~~~~~~~~~~~~~~Q_____________________Q~~~~~~~#cccccccccccccccccc.......#~',
  '~~~~~~~~~~~~~~ppppppppppppppppppppppp~~~~~~~cccFccccccccccccc........cc~',
  '~~~~~~~~~~~~~~pppptppppppppppppptpppp~~~C~~~ccccccmcRcccccccMMcc....ccc~',
  '~~~~~~~~~~~~~~pppppppppppppppppppppFp~~~~~~~ccccccccccccccccccccc..ccPc~',
  '~~~~~~~~~~C~~~ppppppppppppppppppppppp~~~~~~~ccccccccccccKccccccccRcccPc~',
  '~~~~~~~~~~~~~~pFpppppppppKppppppppppxdddddddcccccccccccc...cccccccccccc~',
  '~~~~~~~~~~~~~~ppppppppppppppppppppppp~~~~~~~ccccccScccc.....cccccbccccc~',
  '~~~~~~~~~~~~~~ppppppppppppppppppppppp~~~~~~~cccc...ccccc..ccccccccccccc~',
  '~~~~~~~~~~~~~~pppptppppppppppppptpppp~~~C~~~cc......ccccccFcccccccFcccc~',
  '~~~~~~~~~C~~~~ppppppppppppppppppppppp~~~~~~~#c.......ccccccccccccccccc#~',
  '~~~~~~~~~~~~~~Q_____________________Q~~~~~~~~~~~~~~~~=~~~~~~~~~~~~~~~~~~',
  '~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~=~~~~~~~~~~~~C~~~~~',
  '~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~=~~~~~~~~~~~~~~~~~~',
  '~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~C~~~~~~~=~~~~~~~~~~~~~~~~~~',
  '~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~ccccccF~~~~~~~~~~~~~~~',
  '~#cFccccccccccccF..ccccc#~~~~~~~~~~~~ccccc~~~~~~~~cPccccc~~~~~~~~~~~~~~~',
  '~#cccccccPPcc.......ccccc~C~~~~~~~~~~ccScc~~~~~~~~cccKccc~~~~~~~~~~~~~~~',
  '~ccccccccccccc.......cccc~~~cccccF~~~cRccc~~~~~~~~ccccccc~~~C~~~~~~~~~~~',
  '~ccccccEccccccc.....cSccc~~~ccPccc~~~ccccc~~v~~v~~cccccRc~~~~~~~~~~~~~~~',
  '~ccccccccccccccc...cccccc~~~ccc...~~~cccic~~~~~~~~c..cacc~~~~~~~~~~~~~~~',
  '~ccc@c...ccSccccccccccccc~~~cc...c~~~Fcccc~~~~~~~~...cccc~~~~~~~~~~~~~~~',
  '~cc........cccccccccccmcc~~~cScccc~~~~~~~~~~~~~~~~ccSccic~~~~~~~~~~~~~~~',
  '~c........ccccccccccccccc~C~cccccc~~~~~~~~~~~C~~~~Fcccccc~~~~~~~C~~~~~~~',
  '~cc...R....cccccccRcccccc~~~~~~~~~~C~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~',
  '~##cc...cccc##cccccccccFc~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~',
  '~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~',
]

export const TOWER: StageData = {
  id: 'tower',
  map: MAP,
  light: 'day',
  winds: [
    // Over the long vent crossing in B: blows toward the open sea of clouds.
    { x: 42, y: 50, w: 8, h: 13, dx: 0, dy: 1, strength: 90 },
    // Between E's ground and the two western bell islands.
    { x: 15, y: 26, w: 3, h: 11, dx: -1, dy: 0, strength: 110 }
  ],
  legend: {
    '~': { tile: 'sky' },
    c: { tile: 'cliff' },
    '.': { tile: 'grass' },
    '#': { tile: 'rock' },
    w: { tile: 'wall' },
    _: { tile: 'floor' },
    p: { tile: 'planks' },
    '=': { tile: 'bridge' },
    r: { tile: 'roof' },
    F: { ent: { type: 'decor', kind: 'flag' } },
    C: { tile: 'sky', ent: { type: 'decor', kind: 'cloud' } },
    Q: { ent: { type: 'decor', kind: 'gear' } },
    t: { ent: { type: 'decor', kind: 'torch' } },
    R: { tile: 'cliff', ent: { type: 'decor', kind: 'rock' } },
    A: { tile: 'planks', multi: true, ent: { type: 'decor', kind: 'altar', solid: false } },
    v: { tile: 'sky', ent: { type: 'prop', kind: 'vent' } },
    M: { tile: 'cliff', multi: true, ent: { type: 'prop', kind: 'windmill', id: 'windmillC' } },
    d: { tile: 'sky', ent: { type: 'prop', kind: 'drawbridge', cond: { on: 'windmillC' }, latch: true } },
    f: { tile: 'sky', ent: { type: 'prop', kind: 'drawbridge', cond: { on: 'windmillC' }, latch: true } },
    B: { tile: 'cliff', ent: { type: 'prop', kind: 'bell', group: 'E' } },
    g: { tile: 'cliff', ent: { type: 'prop', kind: 'goldbell', id: 'goldbell', weight: 4 } },
    H: { tile: 'cliff', multi: true, ent: { type: 'prop', kind: 'hook', id: 'hookF', accepts: 'goldbell' } },
    D: { tile: 'floor', ent: { type: 'prop', kind: 'gate', id: 'towerdoor', cond: { on: 'hookF' }, latch: true } },
    G: { tile: 'cliff', ent: { type: 'prop', kind: 'gate', id: 'gateF', cond: { bells: 'E' }, latch: true } },
    x: { tile: 'planks', ent: { type: 'prop', kind: 'gate', id: 'gateDin', lock: 'D' } },
    y: { tile: 'cliff', ent: { type: 'prop', kind: 'gate', id: 'gateDout', cond: { clear: 'D' }, latch: true } },
    L: { tile: 'floor', ent: { type: 'prop', kind: 'lockdoor' } },
    W: { tile: 'floor', multi: true, ent: { type: 'prop', kind: 'bossdoor', id: 'bossdoor' } },
    P: { ent: { type: 'prop', kind: 'pot' } },
    '@': { tile: 'cliff', ent: { type: 'spawn' } },
    K: { ent: { type: 'checkpoint' } },
    S: { ent: { type: 'sign' } },
    k: { ent: { type: 'pickup', kind: 'key' } },
    i: { ent: { type: 'pickup', kind: 'gem' } },
    E: {
      tile: 'cliff',
      ent: {
        type: 'npc',
        kind: 'seer',
        pages: [
          'カァ…よく来たね。占いのとおりだ。今度のからだはカラス、空を飛べるよ。',
          'スペースを押しているあいだ羽ばたいて飛べる。羽の力は1.5秒、地面で休めばもどる。',
          '雲の上に降りたら落ちてしまうよ。上昇気流（ベント）の上を飛べば、羽の力がすぐにもどる。',
          '風の吹くところでは、飛んでいると大きく流される。3人以上の陣形なら風に負けない。',
          '陣形のまま長押しをはなすと協力技「黒羽の大旋風」。竜巻で敵を巻きこみ、風車もまわせる。'
        ]
      }
    },
    a: { ent: { type: 'enemy', kind: 'falconer' } },
    b: { ent: { type: 'enemy', kind: 'crossbow' } },
    m: { ent: { type: 'enemy', kind: 'windmage' } },
    n: { ent: { type: 'enemy', kind: 'bellmonk' } },
    J: { tile: 'planks', ent: { type: 'boss', kind: 'valk' } }
  },
  rooms: [
    { id: 'I', name: '祭壇', x: 53, y: 1, w: 6, h: 3, zoom: 720, objective: '宝珠にふれよう' },
    {
      id: 'H',
      name: '時計塔の屋上',
      x: 43,
      y: 0,
      w: 27,
      h: 13,
      zoom: 720,
      boss: true,
      objective: '竜騎士ヴァルクをたおせ！'
    },
    { id: 'G', name: '時計塔の内部', x: 43, y: 13, w: 27, h: 12, objective: 'カギを見つけて上へ' },
    { id: 'F', name: '金の鐘', x: 40, y: 25, w: 31, h: 12, objective: '金の鐘をかけ金へはこぼう' },
    { id: 'E', name: '四つの鐘楼', x: 7, y: 25, w: 33, h: 12, objective: '4つの鐘を同時に鳴らそう（せーの：F）' },
    {
      id: 'D',
      name: '鷹匠の見張り台',
      x: 13,
      y: 37,
      w: 24,
      h: 12,
      objective: '見張り台を突破しよう',
      checkpointOnClear: true,
      waves: [
        [
          { kind: 'falconer', x: 20, y: 41 },
          { kind: 'crossbow', x: 30, y: 45 },
          { kind: 'windmage', x: 24, y: 46 }
        ],
        [
          { kind: 'bellmonk', x: 25, y: 40 },
          { kind: 'crossbow', x: 18, y: 45 },
          { kind: 'windmage', x: 32, y: 42 },
          { kind: 'falconer', x: 28, y: 47 }
        ]
      ]
    },
    { id: 'C', name: '風車の谷', x: 37, y: 37, w: 35, h: 11, objective: '黒羽の大旋風で風車をまわそう' },
    { id: 'B', name: '雲海の飛び石', x: 25, y: 48, w: 47, h: 16, objective: 'ベントをつないで雲の海をわたろう' },
    { id: 'A', name: '風の崖の入口', x: 0, y: 48, w: 25, h: 16, objective: 'スペース長押しで飛んで、崖をわたろう' }
  ],
  signs: [
    [
      '4つの鐘を1.2秒以内にぜんぶ鳴らすと、金の鐘への扉がひらく。',
      'Qで「待て」、Tabで交代して、ひとりずつ島へ飛ぼう。せーの（F）で合わせるんだ。'
    ],
    ['金の鐘をこのかけ金にかけると、時計塔の扉がひらく。'],
    ['金の鐘はおもさ4。4人でつかんで（E）、はね橋をわたろう。'],
    ['風車は「黒羽の大旋風」でまわる。陣形のままクリック長押し→はなす！', '風車がまわると、はね橋がおりる。'],
    ['上昇気流（ベント）の上を飛ぶと、羽の力がもどる。つないで長い雲の海をわたろう。'],
    ['風の吹くところでは、飛ぶと大きく流される。3人以上の陣形なら風に負けない。'],
    ['スペースを押しているあいだ羽ばたいて飛べる（1.5秒）。', '地面で休むと羽の力がもどる。'],
    ['雲の上に着地すると落ちてしまう！ 足場のある所まで飛ぼう。'],
    ['鷹匠のタカは、急降下の前に線が出る。よけてから攻撃しよう。']
  ]
}
