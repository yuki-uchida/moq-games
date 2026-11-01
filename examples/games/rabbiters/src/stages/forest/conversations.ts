import type { Line } from '../../story'

export const NAMES: Record<string, string> = { yomogi: '長老ウサギのヨモギ' }

export const CONVERSATIONS: Record<string, Line[]> = {
  arrival: [
    { who: 'narrator', text: '公園の裏山をこえると、どこまでも続く森が広がっていた。' },
    { who: 'yomogi', text: 'おや、見かけない顔だね。ずいぶん遠くから来たようだ。' },
    { who: 'rabbit', text: 'おうちを出て、町と川をこえて来たの。' },
    { who: 'yomogi', text: 'よくがんばったね。ここが森だよ。まずはたくさん食べて、大きくおなり。' }
  ],
  'season-1': [{ who: 'yomogi', text: '夏だね。野原の草を巣穴へ運んで、ふかふかの巣をつくろう。' }],
  'season-2': [{ who: 'yomogi', text: '巣ができたね。よく食べて、新しい命を大事にするんだよ。' }],
  'season-3': [{ who: 'yomogi', text: '子どもたちが生まれた！ 小川の向こう、大樫のうろへ連れていっておやり。' }],
  'yomogi-0': [{ who: 'yomogi', text: '草むらでしゃがめば、キツネもタカも気づかないよ。' }],
  'yomogi-1': [{ who: 'yomogi', text: '巣材をくわえていると目立つ。物かげを選んで運ぶんだよ。' }],
  'yomogi-2': [{ who: 'yomogi', text: 'おなかを空かせちゃいけないよ。赤ちゃんの分まで食べるんだ。' }],
  'yomogi-3': [{ who: 'yomogi', text: '子どもはゆっくりしか歩けない。浅瀬をわたって、大樫を目指すんだよ。' }],
  epilogue: [
    { who: 'narrator', text: 'ケージの中で見ていた窓の外には、こんなに広い世界があった。' },
    { who: 'narrator', text: '家を抜け出し、夜の町を走り、水の道をたどって、モチたちは森にたどり着いた。' },
    { who: 'narrator', text: 'そして今、小さな命が新しい野原で跳ねている。' }
  ]
}
