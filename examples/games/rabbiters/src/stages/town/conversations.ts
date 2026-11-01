import type { Line } from '../../story'

export const NAMES: Record<string, string> = { poppo: 'ハトのポッポ', tora: '野良猫のトラ' }

export const CONVERSATIONS: Record<string, Line[]> = {
  intro: [{ who: 'narrator', text: '夕方の町。車の音がひびく。' }],
  poppo: [
    { who: 'poppo', text: 'クルック。森？ 川のほうから、葉っぱのにおいの風が吹くよ。' },
    { who: 'poppo', text: '東へ行って、土手の下の入口をくぐるといい。' }
  ]
}
