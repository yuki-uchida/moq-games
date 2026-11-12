/**
 * Paws (DESIGN §0.3, §6, §7): press counters → queued presses (never lost or doubled), absolute paw selection with
 * a 0.25 s swap, and dispatch to the active antique's behaviour. Both paws are independent.
 */
import { ITEMS } from '../../data/items'
import { DT, PRESS_QUEUE_MAX, SWAP_TIME } from '../constants'
import { emit, type HandSt, type Player, type Sim } from '../state'
import { BTN } from '../types'
import { gadget, shield } from './gadgets'
import { auto, beam, charge, combo, lob, lock, lunge, semi, slam, slash, spread, zoom, type PawEvent } from './weapons'

/** Modes that keep the paw busy (switching waits until they end). */
const BUSY = new Set<HandSt['mode']>(['shield', 'lunge', 'slam'])

function cancelMode(h: HandSt) {
  h.mode = 'idle'
  h.act = 'idle'
  h.charge = 0
  h.locks = []
  h.lockRef = null
  h.lockT = 0
  h.beam = []
  h.armed = false
  h.until = 0
}

function swapTick(sim: Sim, p: Player, h: HandSt, want: number) {
  if (h.swap > 0) {
    h.swap = Math.max(0, h.swap - DT)
    return
  }
  if (!Number.isInteger(want) || want < 0 || want >= h.items.length || want === h.sel) return
  if (BUSY.has(h.mode)) return
  cancelMode(h)
  h.sel = want
  h.want = want
  h.swap = SWAP_TIME
  h.bloom = 0
  emit(sim, { type: 'swap', who: p.id, hand: h.hand, item: h.items[want] })
}

/** Runs both paws for one tick. Down/away players only consume their counters. */
export function handsTick(sim: Sim, p: Player) {
  const inp = p.input
  const alive = p.state === 'alive'
  for (const h of p.hands) {
    const count = h.hand === 'R' ? inp.presses.r : inp.presses.l
    const held = alive && (inp.held & (h.hand === 'R' ? BTN.R : BTN.L)) !== 0
    const delta = count - h.seen
    if (delta !== 0) h.seen = count
    const pressed = delta > 0 && alive
    if (pressed) h.queue = Math.min(PRESS_QUEUE_MAX, h.queue + delta)
    const wasHeld = h.held
    h.tapRelease = pressed && !held
    const ev: PawEvent = {
      pressed,
      released: (wasHeld && !held) || h.tapRelease || (pressed && wasHeld),
      reArm: pressed && wasHeld
    }
    h.held = held
    h.holdT = held ? (pressed ? 0 : h.holdT + DT) : 0
    if (!alive) {
      h.queue = 0
      if (h.mode !== 'idle') cancelMode(h)
      continue
    }
    swapTick(sim, p, h, h.hand === 'R' ? inp.selR : inp.selL)
    if (h.swap > 0 || h.sel < 0) {
      h.act = 'idle'
      if (h.sel < 0) h.queue = 0
      continue
    }
    const def = ITEMS[h.items[h.sel]]
    const u = def.use
    if (!u) continue
    switch (u.kind) {
      case 'combo':
        combo(sim, p, h, def)
        break
      case 'slash':
        slash(sim, p, h, def, ev)
        break
      case 'lunge':
        lunge(sim, p, h, def)
        break
      case 'slam':
        slam(sim, p, h, def)
        break
      case 'semi':
        semi(sim, p, h, def)
        break
      case 'auto':
        auto(sim, p, h, def)
        break
      case 'spread':
        spread(sim, p, h, def)
        break
      case 'zoom':
        zoom(sim, p, h, def, ev)
        break
      case 'lock':
        lock(sim, p, h, def, ev)
        break
      case 'lob':
        lob(sim, p, h, def)
        break
      case 'beam':
        beam(sim, p, h, def)
        break
      case 'charge':
        charge(sim, p, h, def, ev)
        break
      case 'shield':
        shield(sim, p, h, def)
        break
      default:
        gadget(sim, p, h, def)
    }
  }
}
