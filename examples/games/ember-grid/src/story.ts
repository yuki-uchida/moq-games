export type Speaker = 'a' | 'b' | 'c' | 'i' | 'mist' | 'dragon' | 'narration'
export type Line = { speaker: Speaker; text: string }
const scene = (...lines: [Speaker, string][]): Line[] => lines.map(([speaker, text]) => ({ speaker, text }))

export const chapters = [
  ['峡谷の燈', '敵を全滅させる'],
  ['風抜けの水路', '敵を全滅させる'],
  ['灰の環城', '霧番を倒す'],
  ['霧の湿原', '祠を制圧する'],
  ['骸の礼拝堂', '一定ターン守り抜く'],
  ['灰の玉座', '灰竜を倒す']
] as const
export const prologue = scene(
  ['narration', '緑の大地ガイヤは、灰の霧に覆われた。'],
  ['narration', '灰竜の息は獣を灰の群れへと変えた。'],
  ['a', '最後の燈は、消させない。'],
  ['b', '風は悪い。でも、まだ進める。'],
  ['c', '古文書の燈台に火を戻しましょう。'],
  ['narration', '三人の燈守は、灰の玉座を目指す。']
)
export const intros = [
  scene(
    ['narration', '峡谷の向こうに、最初の燈台がある。'],
    ['a', 'ここが初陣だ。慎重に進もう。'],
    ['b', '狭い道ほど、風の声がよく聞こえる。'],
    ['c', 'こ、怖くなんてありませんよ。']
  ),
  scene(
    ['narration', '灰の霧が、水路を静かに流れる。'],
    ['b', '風向きが変わった。足元にも気をつけて。'],
    ['a', '次の燈台まで、皆で進もう。'],
    ['c', '水面に星が映る日を見たいですね。']
  ),
  scene(
    ['narration', '崩れた環城に、霧番が待ち受ける。'],
    ['c', '霧があの隊長を操っている……。'],
    ['a', '止めよう。燈台に火を戻すために。'],
    ['b', 'せめて、苦しみが終わるように。']
  ),
  scene(
    ['narration', '霧の湿原に、小さな祠の火が揺れる。'],
    ['i', '私はルカ。この祠を守っています。'],
    ['a', '一人で？　一緒に燈を守ろう。'],
    ['i', 'ええ。ここから先は、共に。'],
    ['b', '心強い風が吹いてきたね。']
  ),
  scene(
    ['narration', '骸の礼拝堂に、灰の群れが集まる。'],
    ['i', '燈が安定するまで、祈りを続けます。'],
    ['a', 'それまで皆で守り抜こう。'],
    ['c', '星の記録も、ここで守ります。']
  ),
  scene(
    ['narration', '灰の玉座。最後の燈台は目前だ。'],
    ['b', '風が止まった。嵐の前みたいに。'],
    ['i', '私たちの火は、まだ消えていません。'],
    ['a', '灰竜を倒し、燈をつなごう。']
  )
]
export const outros = [
  scene(
    ['narration', '燈台に火が戻り、峡谷の霧が晴れた。'],
    ['a', 'やった。最初の火をつなげた。'],
    ['b', '風も少し、軽くなったね。'],
    ['c', '次の燈台も、きっと見つかります。']
  ),
  scene(
    ['narration', '水路の燈台が、灰色の水を照らす。'],
    ['b', 'ほら、水に空が映ってる。'],
    ['c', 'いつか星も映りますね。'],
    ['a', 'その日まで、進み続けよう。']
  ),
  scene(
    ['narration', '霧番は倒れ、環城に静けさが戻った。'],
    ['c', '霧が薄れていきます。'],
    ['b', 'もう操られることはない。'],
    ['narration', '燈台の火が、城を暖かく照らした。']
  ),
  scene(
    ['narration', '祠の燈台に火が戻り、霧が退いた。'],
    ['i', '祠を守れました。ありがとう。'],
    ['a', 'これからは一緒だ。'],
    ['b', '仲間が増えるのは悪くないね。']
  ),
  scene(
    ['narration', '礼拝堂の燈台が、暗闇に輝いた。'],
    ['i', '祈りが届きました。'],
    ['c', '古い星図も無事です！'],
    ['a', '最後の燈台へ向かおう。']
  ),
  scene(
    ['narration', '灰竜は倒れ、玉座の霧が晴れた。'],
    ['a', '最後の燈を、ここに。'],
    ['i', '火が大地を照らしています。'],
    ['narration', '最後の燈台に、明るい火が戻った。']
  )
]
export const bosses: Partial<Record<number, Line[]>> = {
  2: scene(['mist', '霧に……逆らえ……ない……。']),
  5: scene(['dragon', 'この大地を、灰に沈めよう。'])
}
export const epilogue = scene(
  ['narration', '灰の霧が晴れ、土に緑が芽吹いた。'],
  ['b', '風が草の匂いを運んでくる。'],
  ['c', '夜には、きっと星も見えます。'],
  ['i', 'この火を、次の人たちへ。'],
  ['a', '燈は消えない。これからも。'],
  ['narration', '人々は再び、この大地をガイヤと呼んだ。']
)
export const availableLines = (lines: Line[], present: string[]) =>
  lines.filter((line) => !['a', 'b', 'c', 'i'].includes(line.speaker) || present.includes(line.speaker))
export const memorial = (names: string[]): Line[] =>
  names.map((name) => ({ speaker: 'narration', text: `${name}の想いも、この燈と共に。` }))
