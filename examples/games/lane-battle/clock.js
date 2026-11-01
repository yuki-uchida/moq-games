// One shared monotonic clock prevents timer/rAF double-counting. Process debt in
// bounded batches so a long suspension cannot monopolize the UI thread.
export class BattleClock {
  last = null
  pending = 0
  reset(now) {
    this.last = now
    this.pending = 0
  }
  advance(now, running, update, finished = () => false) {
    const seconds = this.last === null ? 0 : Math.max(0, (now - this.last) / 1000)
    this.last = Math.max(this.last ?? now, now)
    if (!running) {
      this.pending = 0
      return { pending: false }
    }
    this.pending += seconds
    let remaining = Math.min(this.pending, 30)
    while (remaining > 1e-9 && !finished()) {
      // Snap float residue (0.04999…) to a full step so batching never shifts a simulation frame.
      const dt = remaining > 0.05 - 1e-9 ? 0.05 : remaining
      update(dt)
      remaining -= dt
      this.pending -= dt
    }
    if (finished() || this.pending < 1e-9) this.pending = 0
    return { pending: this.pending > 0 }
  }
}
