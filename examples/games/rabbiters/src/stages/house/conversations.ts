import type { Bark, Line } from '../../story'

export const NAMES: Record<string, string> = {
  pisuke: 'インコのピーすけ',
  tama: '老猫タマ',
  mom: 'お母さん',
  dad: 'お父さん',
  hinata: 'ひなた',
  gon: '番犬ゴン'
}

export const CONVERSATIONS: Record<string, Line[]> = {
  intro: [
    { who: 'narrator', text: 'ここは、ひなたの家のリビング。' },
    { who: 'narrator', text: '小さなケージの中で、ウサギの{rabbits}は今日も目を覚ました。' },
    { who: 'hinata', text: 'おはよう、{rabbits}！ ごはんだよ。' },
    { who: 'rabbit', text: 'ペレット……きのうと、おなじあじ。' }
  ],
  eat_done: [{ who: 'rabbit', text: 'おなかはいっぱい。でも、なんだかつまらない。' }],
  pisuke_first: [
    { who: 'pisuke', text: 'オハヨー！ オハヨー！' },
    { who: 'pisuke', text: 'モリ！ モリ！ テレビデ ミタ！' },
    { who: 'pisuke', text: 'ミドリ イッパイ！ ウサギ イッパイ！' },
    { who: 'rabbit', text: 'もり……？ ウサギが、いっぱい？' },
    { who: 'pisuke', text: 'ケージ カジレ！ カジレ！' }
  ],
  pisuke_again: [{ who: 'pisuke', text: 'カジレ！ ヒトガ イナイ トキ！' }],
  morning_call: [
    { who: 'mom', text: 'ひなたー、そろそろ出る時間よー！' },
    { who: 'hinata', text: 'はーい！ ランドセル、ランドセル……。' }
  ],
  hinata_leaves: [
    { who: 'hinata', text: 'いってきまーす！ {rabbits}、いい子にしててね。' },
    { who: 'mom', text: '気をつけてね！' }
  ],
  gnaw_start: [{ who: 'rabbit', text: 'この留め金、すこしグラグラしてる……。' }],
  gnaw_heard: [{ who: 'mom', text: '……ん？ いま、なにか音がした？' }],
  gnaw_heard_dad: [{ who: 'dad', text: 'ん？ ケージのほうで音がしたな。' }],
  gnaw_caught: [
    { who: 'mom', text: 'こら、{name}。かじっちゃダメでしょ。' },
    { who: 'rabbit', text: '……留め金、すこし戻されちゃった。' }
  ],
  gnaw_done: [
    { who: 'rabbit', text: 'あいた！ ……そーっと、そーっと。' },
    { who: 'pisuke', text: 'ダッソー！ ダッソー！' },
    { who: 'pisuke', text: 'ワシツノ ネコ！ ソトヲ シッテル！' }
  ],
  pisuke_squawk: [{ who: 'pisuke', text: 'ピンポーン！ オキャクサマー！' }],
  pisuke_tired: [{ who: 'pisuke', text: 'ノド カラカラ……。' }],
  door_push: [{ who: 'rabbit', text: '留め金はこわれたまま。おせば、ひらく！' }],
  search_start: [{ who: 'mom', text: 'あら？ {name}がケージから出てる！' }],
  tama_first: [
    { who: 'tama', text: '……ふにゃ。なんじゃ、ケージの白いのかい。' },
    { who: 'tama', text: '外へ出たいのかい。ふん、わしも若いころはそうじゃった。' },
    { who: 'tama', text: '教えてやらんこともない。……台所の煮干しを、三匹持っておいで。' },
    { who: 'tama', text: '冷蔵庫の裏のネズミ穴は、押し入れにつながっとるぞ。' }
  ],
  tama_wait: [{ who: 'tama', text: '煮干しはまだかい。台所の、低い棚の下じゃ。' }],
  niboshi_more: [{ who: 'tama', text: 'うむ、うまい……。もう一匹じゃ。' }],
  niboshi_bag: [{ who: 'rabbit', text: '袋をひっぱると、ガサガサいっちゃう……。' }],
  niboshi_heard: [{ who: 'mom', text: 'あら？ 棚のほうでガサガサ……ネズミかしら。' }],
  niboshi_got: [{ who: 'rabbit', text: 'くさい……でも、これがタマさんの好物。' }],
  niboshi_given: [
    { who: 'tama', text: 'うむ、うまい。約束じゃ、教えてやろう。' },
    { who: 'tama', text: '洗面所の勝手口に、わし専用の猫ドアがある。' },
    { who: 'tama', text: 'ただし首輪のタグがないと開かん。古いタグが、玄関の靴箱の下に落ちとるはずじゃ。' }
  ],
  tama_tag: [{ who: 'tama', text: '靴箱の下じゃ。しゃがまんと、もぐれんぞ。' }],
  tama_bye: [{ who: 'tama', text: 'まだおったのかい。さっさとお行き。' }],
  hinata_home: [
    { who: 'hinata', text: 'ただいまー！ ……あれ？ {rabbits}がいない！' },
    { who: 'hinata', text: 'ママー！ {rabbits}がいないよー！' },
    { who: 'mom', text: 'えっ、ケージがあいてる！ 探さなきゃ。' }
  ],
  tag_got: [{ who: 'rabbit', text: 'タマさんのにおいがする。これだ！' }],
  catflap_press: [{ who: 'rabbit', text: 'タグを猫ドアに、ぎゅっと押しあてて……。' }],
  catflap_open: [
    { who: 'rabbit', text: 'カチッて鳴った。……ひらいた！' },
    { who: 'tama', text: '達者でな、白いの。' }
  ],
  garden_enter: [
    { who: 'narrator', text: 'はじめての外。土のにおい、風のおと。' },
    { who: 'rabbit', text: 'あの犬、こっちを見てる……。' }
  ],
  gon_heard: [{ who: 'mom', text: 'ゴン、どうしたの？ なにかいるの？' }],
  wait_friends: [{ who: 'rabbit', text: 'みんなで行こう。きょうだいを待たなきゃ。' }],
  fence_exit: [
    { who: 'rabbit', text: '……ばいばい、ひなた。' },
    { who: 'narrator', text: '外の世界は、思っていたよりずっと広かった。' }
  ],
  dig_start: [{ who: 'rabbit', text: 'すき間がせまい……。ほって広げよう。' }],
  dug: [{ who: 'rabbit', text: 'これで通れる！ しゃがんで、くぐろう。' }],
  'caught-mom': [{ who: 'mom', text: 'はい、おうちに戻ろうね。' }],
  'caught-dad': [{ who: 'dad', text: 'こらこら、脱走はダメだぞ。' }],
  'caught-hinata': [{ who: 'hinata', text: 'つかまえた！ もう、{name}ったら。' }]
}

export const BARKS: Record<string, Bark> = {
  mom: { suspicious: '{name}？', chase: 'あっ、{name}！', search: '{name}ー？' },
  dad: { suspicious: 'ん？', chase: 'こら、まて！', search: 'おーい、{name}' },
  hinata: { suspicious: 'あれ？', chase: 'まてまてー！', search: '{name}ー？ どこー？' },
  gon: { suspicious: 'ウゥゥ……', chase: 'ワン！ワンワン！', search: 'クンクン' }
}
