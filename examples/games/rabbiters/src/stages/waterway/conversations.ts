import type { Bark, Line } from '../../story'

export const NAMES: Record<string, string> = {
  gama: 'ヒキガエルのガマ先生',
  genji: 'カメのゲンじい',
  worker: '作業員',
  angler: '釣り人',
  keeper: '管理人さん'
}

const say = (who: string, ...texts: string[]): Line[] => texts.map((text) => ({ who, text }))

export const CONVERSATIONS: Record<string, Line[]> = {
  intro: [
    ...say('narrator', '下水道は、つめたくて、まっくらだった。'),
    ...say('rabbit', '……なにか、チューチュー鳴いてる。')
  ],
  gama_first: [
    ...say('gama', 'ふむ。こんな所にウサギとは、めずらしい客であるぞ。'),
    ...say('rabbit', '森に行きたいの。出口はどこ？'),
    ...say(
      'gama',
      '出口は東の排水口。だが水が多くて、歩廊が水に沈んでおる。',
      '水門のバルブは2つ。北の歩廊の奥と、作業員の部屋じゃ。両方回せば水が引く。',
      'ところが、北のバルブのハンドルを、ネズミどもが巣に持っていきおった。',
      '水路は深くて泳げぬ。橋か、横の土管をくぐって北へ行くのだぞ。',
      '作業員の光と、月明かりの格子には気をつけよ。'
    )
  ],
  gama_handle: say('gama', 'ハンドルはネズミの巣じゃ。北の歩廊の、西のほうの部屋であるぞ。'),
  gama_valve: say('gama', 'バルブはかたい。回す音で、だれかが来るかもしれぬ。'),
  gama_go: say('gama', 'うむ、水が引いた。東の排水口から外へ出るがよい、若いの。'),
  drained: say('narrator', '南の歩廊の水が引いた。排水口への道が出てきた。'),
  rummaging: say('rabbit', 'ガサゴソ……このガラクタの中に、あるはず。'),
  handle_got: say('rabbit', 'あった、ハンドル！ 北の水門のバルブへ持っていこう。'),
  handle_set: say('rabbit', 'ハンドル、はまった！ あとは回すだけ。'),
  valve_turning: say('rabbit', 'かたい……でも、すこしずつ回ってる。'),
  valve_half: say('rabbit', 'ひとつ回った！ もうひとつのバルブへ。'),
  valve_done: [
    ...say('narrator', 'ゴゴゴ……と、どこかで大きな音がした。', '水路の水が、ゆっくり引いていく。'),
    ...say('gama', '水が引くには、しばし時間がかかる。音を聞いて、だれか来るぞ。かくれておれ。')
  ],
  outfall: [...say('narrator', '排水口の先で、空がうっすら明るくなっていた。'), ...say('rabbit', '川だ……！ ひろい！')],
  river_stones: say(
    'rabbit',
    'あの石をぴょんぴょん渡れば、向こう岸に行けそう。',
    'ときどき水がどっと来て、石が沈む……。水が引いているうちに！'
  ),
  swept: say('rabbit', 'わっ、流される……！'),
  bridge_dogs: say(
    'rabbit',
    '橋の下に、犬がいっぱい。においで見つかっちゃうかも……。',
    '水をわたると、においが消えるって、だれかが言ってた。'
  ),
  park_enter: [
    ...say('narrator', '朝の公園。犬の散歩、走る人、遊ぶ子どもたち。'),
    ...say('rabbit', '池のほうに、だれかいる。')
  ],
  genji_first: [
    ...say('genji', 'ほっほ。ちいさなお客さんじゃな。'),
    ...say('rabbit', '森に行きたいの。どっちに行けばいいか、知ってる？'),
    ...say('genji', '森をさがしておるのかい。……知っておるとも。'),
    ...say('genji', 'じゃがのう、長い話は腹がへる。', 'この公園の花だんから、タンポポを4つ持ってきておくれ。')
  ],
  genji_wait: say('genji', '花だんは遊び場の西、公園の西、池の南、裏のフェンスのそばじゃ。'),
  genji_more3: say('genji', 'うまい！ あと3つ、たのむよ。'),
  genji_more2: say('genji', 'うまい、うまい。あと2つじゃ。'),
  genji_more1: say('genji', 'もうひと声。あとひとつじゃ。'),
  genji_thanks: [
    ...say('genji', 'おお、これこれ。ありがとうよ。'),
    ...say('genji', 'この公園の裏山をこえた先に、大きな森があるそうじゃよ。'),
    ...say('genji', '裏のフェンスに穴があるが、管理人さんが網でふさいでしもうた。かじって通るがよい。'),
    ...say('genji', 'わしは歩くのがおそいでな。おまえさんの足なら、すぐじゃろう。')
  ],
  genji_go: say('genji', '裏のフェンスの網じゃ。管理人さんが見ておらん時にな。'),
  net_gnawing: say('rabbit', 'かたい網……でも、かじれば切れそう。'),
  net_done: [
    ...say('rabbit', '網が切れた！ この先に、森が……！'),
    ...say('narrator', '穴のむこうに、裏山の坂が見えた。')
  ]
}

/** Enemy barks for this chapter, by predator id or kind. */
export const BARKS: Record<string, Bark> = {
  rat: { suspicious: 'チュ？', chase: 'チューッ！', search: 'チュチュ……' },
  worker: { suspicious: 'ん？ ネズミか？', chase: 'ウサギ!? なんでこんな所に', search: 'どこ行った……？' },
  dog: { suspicious: 'ウゥゥ……', chase: 'ワン！ワン！', search: 'クンクン……' },
  'walkdog-0': { suspicious: 'クゥン？', chase: 'ワン！' },
  'jogger-0': { suspicious: 'おっ、ウサギ？', chase: 'まてまて！' },
  angler: { suspicious: 'おや？', chase: 'おーい、ウサギがいるぞ！' },
  keeper: { suspicious: 'ん？', chase: 'こら、花だんに入るな！', search: 'どこへ行った？' },
  'walker-0': { suspicious: 'あら？', chase: 'ウサギだ！', search: 'どこ行ったのかしら' },
  child: { suspicious: 'あれ？', chase: 'ウサギさんだー！', search: 'どこー？' },
  crow: { suspicious: 'カァ？', chase: 'カァ！カァ！' }
}
