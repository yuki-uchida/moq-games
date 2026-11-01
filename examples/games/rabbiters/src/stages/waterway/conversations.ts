import type { Line } from '../../story'

export const NAMES: Record<string, string> = { genji: 'カメのゲンじい' }

export const CONVERSATIONS: Record<string, Line[]> = {
  intro: [{ who: 'narrator', text: '暗い水の道。水音だけが遠くまでひびいている。' }],
  gate: [{ who: 'narrator', text: 'ギギギ……。水門が開いた。' }],
  genji: [
    { who: 'genji', text: 'ほう、ウサギが水の道を来るとはのう。' },
    { who: 'genji', text: '公園の裏山の先に、大きな森がある。排水口から外へ出るがよい。' }
  ]
}
