import type { Line } from '../../story'

export const NAMES: Record<string, string> = {
  ponta: 'タヌキのポン太',
  kurumi: 'ハムスターのくるみ',
  kits: 'タヌキの子どもたち',
  poppo: 'ハトのポッポ',
  tora: '野良猫のトラ',
  'tora-a': 'トラの子分',
  'tora-b': 'トラの子分',
  keeper: '神主さん'
}

const narrator = (text: string): Line => ({ who: 'narrator', text })
const rabbit = (text: string): Line => ({ who: 'rabbit', text })
const ponta = (text: string): Line => ({ who: 'ponta', text })
const poppo = (text: string): Line => ({ who: 'poppo', text })

export const CONVERSATIONS: Record<string, Line[]> = {
  intro: [
    narrator('フェンスの外は、知らない町だった。'),
    rabbit('どっちへ行けばいいんだろう。'),
    rabbit('……わからない。でも、進めるほうへ進もう。'),
    narrator('知らないにおい、知らない音。路地のおくで、なにかが光った。')
  ],
  alley_cats: [
    rabbit('大きなネコ……！ 見つかったら、たいへんだ。'),
    rabbit('段ボールやバケツのかげに隠れてやりすごそう。')
  ],
  garbage: [rabbit('ゴミのにおい……。だれか、いる？')],
  ponta_first: [
    ponta('おっ、白いの！ 飼いウサギが、こんなとこで何してるっす？'),
    rabbit('森ってところを、さがしてるの。'),
    ponta('森？ 聞いたことはあるけど、場所は知らないっす。'),
    ponta('この町はタヌキにはせまいっす。でも、食べものはいっぱいあるっす。'),
    ponta('それより、はらへってないっす？ このネット、かじって穴あけてほしいっす。'),
    ponta('おいらの手じゃ、かたくてダメなんす。ウサギの歯なら、いけるっす！'),
    ponta('カラスが来たら、すぐかくれるっすよ。')
  ],
  net_heard: [ponta('しーっ！ カラスが気づいたっす！')],
  ponta_net: [
    ponta('やった、穴があいたっす！'),
    ponta('このキャベツ、南の路地のおくにいる、おいらの子どもたちにとどけてほしいっす。'),
    ponta('おいらはここでカラスを見はってるっす。トラのやつらに気をつけて！')
  ],
  cabbage_got: [rabbit('おもたい……。ゆっくり、そーっと。')],
  kits_thanks: [
    { who: 'kits', text: 'わあ、キャベツだ！' },
    { who: 'kits', text: 'ありがとう、白いウサギさん！ とうちゃんによろしくね。' },
    { who: 'kits', text: 'とうちゃんはね、この町のぬけ道なら、なんでも知ってるんだよ。' },
    rabbit('ポン太のところへもどろう。')
  ],
  ponta_drain: [
    ponta('とどけてくれたっすか！ ありがとっす。'),
    ponta('お礼に、残りのキャベツ半分あげるっす。'),
    ponta('トラのやつらには、おいらからもよく言っとくっす。'),
    ponta('大通りは車がビュンビュン。すきまを待つっす。'),
    ponta('こわかったら、歩道の格子ぶたから排水管にもぐるっす。向こうの歩道に出られるっすよ。'),
    rabbit('ありがとう、ポン太。')
  ],
  road_first: [
    rabbit('なんてはやいの……。すきまを待とう。'),
    rabbit('とまってる車の下なら、かくれられそう。')
  ],
  road_crossed: [rabbit('わたれた……！ 心臓がバクバクしてる。')],
  shopping_street: [
    rabbit('人がいっぱい。看板やプランターのかげを通ろう。'),
    rabbit('子どもは足がはやい。見つからないようにしなきゃ。')
  ],
  kurumi_first: [
    { who: 'kurumi', text: 'あら、ウサギさん？ お店の外にいるなんて、うらやましい。' },
    rabbit('森をさがしてるの。どっちへ行けばいいか、知ってる？'),
    { who: 'kurumi', text: 'わたしはずっとケージの中。でも、お客さんが話してたわ。' },
    { who: 'kurumi', text: '神社のハトさんは、空から町じゅうを見てるんだって。' },
    { who: 'kurumi', text: '商店街をぬけて、赤い鳥居の神社へ行ってみて。' },
    { who: 'kurumi', text: 'わたしも、いつかお外に出てみたいな……。' },
    rabbit('ありがとう、くるみちゃん！')
  ],
  kurumi_idle: [{ who: 'kurumi', text: 'がんばってね。わたしのぶんまで、遠くへ行ってね。' }],
  street_end: [rabbit('お店がおわった。……この先は、静かなお宮みたい。')],
  poppo_first: [
    poppo('ポッポ。こんなところでウサギなんて、めずらしいねえ。'),
    rabbit('森へ行きたいの。どっちか、知ってる？'),
    poppo('森？ うーん……おなかがすいて、思い出せないよ。ポッポ。'),
    poppo('きょうは、だれもパンくずをくれなかったんだ。'),
    poppo('商店街のパン屋さんの店先に、パンのみみが落ちてたんだけどなあ。'),
    rabbit('とってきてあげる！')
  ],
  bread_got: [rabbit('こうばしいにおい。ポッポにとどけよう。')],
  poppo_thanks: [
    poppo('わあ、パンのみみ！ ありがとう。ポッポ。'),
    poppo('森は知らないけど……。'),
    poppo('東の川のほうから、葉っぱのにおいの風がふいてくるよ。ポッポ。'),
    poppo('土手の下に、水の道の入口があるよ。そこから川へ行けるはず。'),
    poppo('でも、もうすぐ日がくれる。暗くなるまで、社の床下で休んでいくといいよ。'),
    poppo('夜になれば、人もへるからね。ポッポ。')
  ],
  nightfall: [
    narrator('空が赤くなって、町に灯りがともりはじめた。'),
    { who: 'keeper', text: 'さて、きょうもおしまい。' },
    narrator('神主さんが帰っていくと、境内はしんと静かになった。'),
    rabbit('空に、星がでてきた。'),
    rabbit('……いまだ。土手へ行こう。')
  ],
  night_bank: [rabbit('暗いほうが、見つかりにくい。街灯の下はいそいで通ろう。')],
  walker: [rabbit('犬のさんぽ……。においで気づかれちゃうかも。')],
  drain_near: [
    rabbit('この穴の先から、水のおとがする。'),
    rabbit('でも、さびた格子がある……。針金をかじれば、通れるかも。')
  ],
  grate_heard: [rabbit('ガチャガチャ鳴っちゃう……。だれか来ないかな。')],
  grate_open: [rabbit('とれた！ これで通れる。')],
  caught: [rabbit('はなしてー！ ……もとの場所に、もどされちゃった。')],
  kits_idle: [{ who: 'kits', text: 'とうちゃん、まだかなあ。' }],
  ponta_idle: [ponta('車にひかれないように、気をつけるっすよ！')],
  poppo_idle: [poppo('クルック。きょうも、いいお天気だったねえ。ポッポ。')]
}
