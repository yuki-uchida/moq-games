import type { Line } from '../../story'

export const NAMES: Record<string, string> = { pisuke: 'インコのピーすけ', mom: 'お母さん' }

export const CONVERSATIONS: Record<string, Line[]> = {
  intro: [{ who: 'narrator', text: 'ペットのウサギ、モチ。ケージの外の世界を、まだ知らない。' }],
  pisuke: [
    { who: 'pisuke', text: 'モリ！ モリ！ テレビデ ミタ！' },
    { who: 'rabbit', text: 'もり……？ それって、どこにあるの？' },
    { who: 'pisuke', text: 'ソト！ ソト！ ドアノ ムコウ！' }
  ],
  outside: [{ who: 'narrator', text: '外の世界は、思っていたよりずっと広かった。' }]
}
