/**
 * Loadout shape and the role presets (DESIGN §7). A loadout is exactly 16 slots; active antiques name a paw.
 * Validation and the sustain estimate live in src/sim/loadout.ts.
 */
import type { ItemId } from './items'

export const LOADOUT_SLOTS = 16

export type Hand = 'R' | 'L'

export interface LoadoutSlot {
  item: ItemId
  /** Required for active antiques, ignored for passive ones. */
  hand?: Hand
}

export interface Loadout {
  /** Always 16 entries; null = empty slot. */
  slots: (LoadoutSlot | null)[]
}

export interface PresetDef {
  id: string
  name: string
  /** One line describing the playstyle. */
  text: string
  loadout: Loadout
}

/** Builds a 16-slot loadout from right-paw, left-paw and passive lists (in that slot order). */
export function makeLoadout(r: ItemId[], l: ItemId[], passive: ItemId[]): Loadout {
  const slots: (LoadoutSlot | null)[] = [
    ...r.map((item) => ({ item, hand: 'R' as const })),
    ...l.map((item) => ({ item, hand: 'L' as const })),
    ...passive.map((item) => ({ item }))
  ]
  if (slots.length > LOADOUT_SLOTS) throw new Error('preset has more than 16 slots')
  while (slots.length < LOADOUT_SLOTS) slots.push(null)
  return { slots }
}

export const PRESETS: PresetDef[] = [
  {
    id: 'attacker',
    name: 'アタッカー',
    text: '刀と突進で切り込み、拳銃で追い打つ。燃費と火力の釣り合った基本形。',
    loadout: makeLoadout(
      ['orca', 'narwhal', 'mantis'],
      ['bee', 'frog', 'gecko'],
      ['fang', 'fang', 'turtle', 'cheetah', 'koala', 'koala', 'sloth', 'camel', 'jelly', 'rhino']
    )
  },
  {
    id: 'gunner',
    name: 'ガンナー',
    text: '連射銃とダンゴムシで群れを削る。盾を構えながら撃ち合える。',
    loadout: makeLoadout(
      ['wood', 'pillbug'],
      ['bee', 'armadillo', 'bat'],
      ['hawk', 'hawk', 'turtle', 'koala', 'koala', 'sloth', 'camel', 'cheetah', 'momonga', 'jelly', 'rhino']
    )
  },
  {
    id: 'sniper',
    name: 'スナイパー',
    text: '高所から狙撃し、フックと迷彩で位置を変え続ける。',
    loadout: makeLoadout(
      ['owl', 'bee'],
      ['gecko', 'frog', 'leaf', 'octopus'],
      ['hawk', 'hawk', 'hawk', 'momonga', 'koala', 'koala', 'sloth', 'sloth', 'jelly', 'camel']
    )
  },
  {
    id: 'tank',
    name: 'タンク',
    text: '盾と甲羅で前線を支え、ハンマーで押し返す。アニマが多い動物向け。',
    loadout: makeLoadout(
      ['mammoth', 'wood'],
      ['armadillo', 'hermit'],
      ['turtle', 'rhino', 'rhino', 'rhino', 'hedgehog', 'jelly', 'camel', 'camel', 'camel', 'koala', 'koala', 'fang']
    )
  },
  {
    id: 'support',
    name: 'サポート',
    text: '蜜壺と壁と音波で仲間を支える。自分の燃費も抜群。',
    loadout: makeLoadout(
      ['humming', 'pillbug'],
      ['honeyant', 'bat', 'hermit', 'armadillo'],
      ['koala', 'koala', 'koala', 'sloth', 'sloth', 'turtle', 'jelly', 'hawk', 'camel', 'cheetah']
    )
  },
  {
    id: 'skirmisher',
    name: '遊撃',
    text: '爪と槍と散弾で懐へ。カエルとフックで立体的に飛び回る。',
    loadout: makeLoadout(
      ['claw', 'narwhal', 'puffer'],
      ['gecko', 'frog', 'pigeon', 'leaf'],
      ['cheetah', 'cheetah', 'cheetah', 'fang', 'fang', 'momonga', 'koala', 'sloth', 'jelly']
    )
  },
  {
    id: 'allout',
    name: '火力全開',
    text: '大砲、電撃、追尾弾。短期決戦の最大火力。アニマはすぐに尽きる。',
    loadout: makeLoadout(
      ['hippo', 'eel', 'swallow'],
      ['owl', 'puffer', 'pillbug'],
      ['hawk', 'hawk', 'hawk', 'fang', 'fang', 'fang', 'turtle', 'rhino', 'rhino', 'hedgehog']
    )
  }
]

export const presetById = (id: string) => PRESETS.find((p) => p.id === id) ?? PRESETS[0]
