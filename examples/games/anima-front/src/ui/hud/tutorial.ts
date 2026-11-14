/**
 * Tutorial hints per input device. The sim only knows keyboard + mouse wording (TUTORIAL_HINTS); the HUD maps
 * the tutorial step index to the wording of the device the player is using, keeping each step's meaning:
 * 0 move to the marker, 1 look around, 2 jump, 3 dash, 4 use the right-paw antique on a target, 5 switch the
 * right-paw antique, 6 use the left-paw antique, 7 revive the fallen dummy at the marker.
 */
import { ITEMS } from '../../data/items'
import type { HandView, V3 } from '../../sim/types'

export type HintDevice = 'mouse' | 'gamepad' | 'touch'

/** Index of the revive step: its target is the training marker, not a downed player. */
export const TUTORIAL_REVIVE_STEP = 7
/** Horizontal distance (m) within which the revive hold counts at the marker. */
export const TUTORIAL_REVIVE_RANGE = 2.5

/** What the learner's build allows (the sim adapts steps 4-6 to it). */
export interface TutorialBuild {
  weaponR: boolean
  weaponL: boolean
  hasR: boolean
  hasL: boolean
  /** The paw whose antique can be switched (right first, then left); null when no paw holds two or more. */
  switchHand: 'R' | 'L' | null
}

export function tutorialBuild(hands: readonly HandView[]): TutorialBuild {
  const weapon = (h: HandView | undefined) =>
    (h?.items ?? []).some((i) => ITEMS[i].category === 'melee' || ITEMS[i].category === 'ranged')
  return {
    weaponR: weapon(hands[0]),
    weaponL: weapon(hands[1]),
    hasR: (hands[0]?.items.length ?? 0) > 0,
    hasL: (hands[1]?.items.length ?? 0) > 0,
    switchHand: (hands[0]?.items.length ?? 0) >= 2 ? 'R' : (hands[1]?.items.length ?? 0) >= 2 ? 'L' : null
  }
}

type ByDevice = Record<HintDevice, string>

const MOVE: ByDevice = {
  mouse: 'WASDで移動しよう。マーカーの方へ歩いてみて',
  gamepad: '左スティックで移動しよう。マーカーの方へ歩いてみて',
  touch: '画面の左側をドラッグして移動しよう。マーカーの方へ歩いてみて'
}
const LOOK: ByDevice = {
  mouse: 'マウスで周りを見渡そう',
  gamepad: '右スティックで周りを見渡そう',
  touch: '画面の右側をドラッグして周りを見渡そう'
}
const JUMP: ByDevice = {
  mouse: 'スペースでジャンプ。長押しすると滑空できる動物もいるよ',
  gamepad: 'Aボタンでジャンプ。長押しすると滑空できる動物もいるよ',
  touch: '「ジャンプ」ボタンでジャンプ。押し続けると滑空できる動物もいるよ'
}
const DASH: ByDevice = {
  mouse: 'Shiftでダッシュ。敵の攻撃の予兆が見えたら横へ避けよう',
  gamepad: 'Bボタンでダッシュ。敵の攻撃の予兆が見えたら横へ避けよう',
  touch: '「ダッシュ」ボタンでダッシュ。敵の攻撃の予兆が見えたら横へ避けよう'
}
const USE_R: ByDevice = {
  mouse: '左クリックで右手のアンティークを使い、的に当てよう。使うたびにアニマが減るよ',
  gamepad: 'RTで右手のアンティークを使い、的に当てよう。使うたびにアニマが減るよ',
  touch: '「右」ボタンで右手のアンティークを使い、的に当てよう。使うたびにアニマが減るよ'
}
const USE_L_AS_FIRST: ByDevice = {
  mouse: '右クリックで左手のアンティークを使い、的に当てよう。使うたびにアニマが減るよ',
  gamepad: 'LTで左手のアンティークを使い、的に当てよう。使うたびにアニマが減るよ',
  touch: '「左」ボタンで左手のアンティークを使い、的に当てよう。使うたびにアニマが減るよ'
}
const SWITCH: ByDevice = {
  mouse: 'Q（またはホイール）で右手のアンティークを持ち替えよう',
  gamepad: 'RBで右手のアンティークを持ち替えよう',
  touch: '「右」ボタンの上の↻で右手のアンティークを持ち替えよう'
}
const SWITCH_L: ByDevice = {
  mouse: 'Eで左手のアンティークを持ち替えよう',
  gamepad: 'LBで左手のアンティークを持ち替えよう',
  touch: '「左」ボタンの上の↻で左手のアンティークを持ち替えよう'
}
const NOTHING_TO_SWITCH = 'この構成には持ち替えるアンティークがないよ。このまま次へ進もう'
const USE_L: ByDevice = {
  mouse: '右クリックで左手のアンティークを使おう。アニマは体力でもあるから、使いすぎに注意',
  gamepad: 'LTで左手のアンティークを使おう。アニマは体力でもあるから、使いすぎに注意',
  touch: '「左」ボタンで左手のアンティークを使おう。アニマは体力でもあるから、使いすぎに注意'
}
const L_EMPTY: ByDevice = {
  mouse: '左手は空なので、左クリックで右手のアンティークをもう一度使おう',
  gamepad: '左手は空なので、RTで右手のアンティークをもう一度使おう',
  touch: '左手は空なので、「右」ボタンで右手のアンティークをもう一度使おう'
}
const REVIVE: ByDevice = {
  mouse: '倒れた仲間のそばでFを長押しして助け起こそう',
  gamepad: '倒れた仲間のそばでXを長押しして助け起こそう',
  touch: '倒れた仲間のそばで出る「救助」ボタンを押し続けて助け起こそう'
}

/** The hint of a tutorial step for the device (null when `step` is not a step index). */
export function tutorialHint(step: number, device: HintDevice, build: TutorialBuild): string | null {
  switch (step) {
    case 0:
      return MOVE[device]
    case 1:
      return LOOK[device]
    case 2:
      return JUMP[device]
    case 3:
      return DASH[device]
    case 4:
      return !build.weaponR && build.weaponL ? USE_L_AS_FIRST[device] : USE_R[device]
    case 5:
      if (!build.switchHand) return NOTHING_TO_SWITCH
      return build.switchHand === 'R' ? SWITCH[device] : SWITCH_L[device]
    case 6:
      return !build.hasL ? L_EMPTY[device] : USE_L[device]
    case TUTORIAL_REVIVE_STEP:
      return REVIVE[device]
    default:
      return null
  }
}

/** True while the learner stands close enough to the revive marker for the hold to count. */
export function nearReviveMarker(me: V3, marker: V3): boolean {
  return Math.hypot(me[0] - marker[0], me[2] - marker[2]) <= TUTORIAL_REVIVE_RANGE
}

/** Seconds of the revive hold shown on the marker's bar: grows while held next to it, resets on release. */
export function nextReviveHold(prev: number, near: boolean, held: boolean, dt: number, total: number): number {
  return near && held ? Math.min(total, prev + Math.max(0, dt)) : 0
}
