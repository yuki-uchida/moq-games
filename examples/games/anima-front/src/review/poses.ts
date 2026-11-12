/**
 * Named pose scripts for the model review page: each returns the CharacterPose at time t (s) so a static
 * screenshot can simulate the animation deterministically from 0 to t.
 */
import type { ItemId } from '../data/items'
import type { CharacterPose, Emote, HandPose } from '../models/api'
import type { HandAct } from '../sim/types'

export const POSES = [
  'idle',
  'run',
  'strafe',
  'back',
  'jump',
  'fall',
  'dash',
  'slide',
  'glide',
  'hook',
  'launch',
  'aim',
  'fire',
  'swing',
  'combo',
  'guard',
  'charge',
  'beam',
  'swap',
  'hurt',
  'down',
  'revive',
  'victory',
  'defeat',
  'cheer',
  'salute',
  'wave'
] as const
export type PoseName = (typeof POSES)[number]

export const POSE_LABEL: Record<PoseName, string> = {
  idle: '待機',
  run: '走り',
  strafe: '横移動',
  back: '後退',
  jump: 'ジャンプ',
  fall: '落下',
  dash: 'ダッシュ',
  slide: '腹すべり',
  glide: '滑空',
  hook: 'フック',
  launch: '打ち上げ',
  aim: '照準',
  fire: '射撃',
  swing: '振り',
  combo: '連撃',
  guard: '防御',
  charge: '溜め',
  beam: 'ビーム',
  swap: '持ち替え',
  hurt: '被弾',
  down: 'ダウン',
  revive: '救助',
  victory: '勝利',
  defeat: '敗北',
  cheer: '歓声',
  salute: '敬礼',
  wave: '手を振る'
}

/** Time (s) at which a static screenshot of the pose is most telling. */
export const POSE_TIME: Record<PoseName, number> = {
  idle: 1.2,
  run: 1.15,
  strafe: 1.1,
  back: 1.1,
  jump: 0.6,
  fall: 0.8,
  dash: 0.5,
  slide: 0.8,
  glide: 0.9,
  hook: 0.6,
  launch: 0.62,
  aim: 0.8,
  fire: 0.55,
  swing: 0.66,
  combo: 1.25,
  guard: 0.8,
  charge: 1.0,
  beam: 0.8,
  swap: 0.62,
  hurt: 0.56,
  down: 1.5,
  revive: 1.0,
  victory: 1.1,
  defeat: 1.2,
  cheer: 1.0,
  salute: 1.0,
  wave: 1.0
}

const hand = (item: ItemId | null, act: HandAct = 'idle', charge = 0, uses = 0, combo = 0, swap = 0): HandPose => ({
  item,
  act,
  charge,
  uses,
  combo,
  swap
})

export function poseAt(name: PoseName, t: number, r: ItemId | null, l: ItemId | null): CharacterPose {
  const p: CharacterPose = {
    localVel: [0, 0],
    grounded: true,
    vy: 0,
    move: 'idle',
    aimYaw: 0,
    aimPitch: 0,
    hands: [hand(r), hand(l)],
    state: 'alive',
    revive: 0,
    reviving: false,
    hurt: 0
  }
  const emote = (e: Emote) => {
    p.emote = e
    p.hands = [hand(r), hand(l)]
  }
  switch (name) {
    case 'run':
      p.localVel = [0, 6.8]
      p.move = 'run'
      break
    case 'strafe':
      p.localVel = [-6, 0.5]
      p.move = 'run'
      break
    case 'back':
      p.localVel = [0, -5]
      p.move = 'run'
      break
    case 'jump':
      p.grounded = t < 0.4
      p.vy = t < 0.4 ? 0 : 10 - (t - 0.4) * 10
      p.move = t < 0.4 ? 'idle' : 'air'
      break
    case 'fall':
      p.grounded = false
      p.vy = -10
      p.move = 'air'
      break
    case 'dash':
      p.localVel = [0, t > 0.3 ? 21 : 5]
      p.move = t > 0.3 ? 'dash' : 'run'
      break
    case 'slide':
      p.localVel = [0, t > 0.3 ? 14 : 5]
      p.move = t > 0.3 ? 'slide' : 'run'
      break
    case 'glide':
      p.grounded = false
      p.vy = -2.2
      p.localVel = [0, 10]
      p.move = 'glide'
      break
    case 'hook':
      p.grounded = false
      p.vy = 2
      p.localVel = [0, 20]
      p.move = 'hook'
      p.aimPitch = 0.35
      break
    case 'launch':
      p.grounded = false
      p.vy = 18
      p.move = t > 0.2 ? 'launch' : 'idle'
      break
    case 'aim':
      p.aimPitch = 0.25
      p.aimYaw = 0.2
      break
    case 'fire':
      p.aimPitch = 0.1
      p.hands = [
        hand(r, t > 0.45 ? 'fire' : 'idle', 0, t > 0.45 ? 1 : 0),
        hand(l, t > 0.5 ? 'fire' : 'idle', 0, t > 0.5 ? 1 : 0)
      ]
      break
    case 'swing':
      p.hands = [hand(r, t > 0.5 ? 'swing' : 'idle', 0, t > 0.5 ? 1 : 0), hand(l, 'idle')]
      break
    case 'combo': {
      const step = t < 0.5 ? 0 : t < 0.8 ? 1 : t < 1.1 ? 2 : 3
      p.hands = [hand(r, step ? 'swing' : 'idle', 0, step, Math.max(0, step - 1)), hand(l)]
      break
    }
    case 'guard':
      p.hands = [hand(r, 'guard', Math.min(1, t * 2)), hand(l, 'guard', Math.min(1, t * 2))]
      break
    case 'charge':
      p.hands = [hand(r, 'charge', Math.min(1, t)), hand(l, 'charge', Math.min(1, t))]
      break
    case 'beam':
      p.hands = [hand(r, 'beam', 1), hand(l)]
      break
    case 'swap':
      p.hands = [hand(r, 'idle', 0, 0, 0, t > 0.4 ? Math.min(1, (t - 0.4) / 0.5) : 0), hand(l)]
      break
    case 'hurt':
      p.hurt = t > 0.5 ? 1 : 0
      break
    case 'down':
      p.state = 'down'
      break
    case 'revive':
      p.reviving = true
      break
    case 'victory':
    case 'defeat':
    case 'cheer':
    case 'salute':
    case 'wave':
      emote(name)
      break
  }
  return p
}
