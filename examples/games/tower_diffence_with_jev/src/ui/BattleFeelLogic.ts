import { DEFINITIONS, type UnitType } from '../game/model'

/** DOM-free rules for the battle "game feel" layer. */
export const HIT_WINDOW_MS = 110
export const HEAL_WINDOW_MS = 400
export const COMBO_WINDOW_MS = 1600

export const bountyFor = (type: UnitType, boss: boolean): number => DEFINITIONS[type].cost + (boss ? 10 : 0)

export const isHeavyHit = (damage: number, maxHp: number): boolean => damage >= 90 || damage >= maxHp * 0.3

/** Castle shake in px, proportional to damage and capped. */
export const shakeAmplitude = (damage: number): number => Math.min(8, 1.5 + damage * 0.5)

/** Sums per-unit amounts and releases them once the window has passed (or when forced). */
export class AmountAggregator {
  private readonly pending = new Map<number, { amount: number; since: number }>()
  constructor(private readonly windowMs: number) {}
  add(id: number, amount: number, now: number): void {
    const entry = this.pending.get(id)
    if (entry) entry.amount += amount
    else this.pending.set(id, { amount, since: now })
  }
  flush(now: number, force?: ReadonlySet<number>): Array<{ id: number; amount: number }> {
    const due: Array<{ id: number; amount: number }> = []
    for (const [id, entry] of this.pending)
      if (force?.has(id) || now - entry.since >= this.windowMs) {
        due.push({ id, amount: entry.amount })
        this.pending.delete(id)
      }
    return due
  }
  clear(): void {
    this.pending.clear()
  }
}

/** Counts kills that follow each other within the window. */
export class ComboTracker {
  private count = 0
  private last = -Infinity
  constructor(private readonly windowMs = COMBO_WINDOW_MS) {}
  hit(now: number): number {
    this.count = now - this.last <= this.windowMs ? this.count + 1 : 1
    this.last = now
    return this.count
  }
  reset(): void {
    this.count = 0
    this.last = -Infinity
  }
}
