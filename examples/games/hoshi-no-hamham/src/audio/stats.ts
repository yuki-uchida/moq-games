/**
 * Counts how sound effects were started. The performance checks read these through `window.__hamham.stats`:
 * an effect played from a buffer costs the frame three audio nodes, one built live costs up to seventy.
 */
export const sfxStats = {
  /** Effects started from a buffer that was rendered ahead of time. */
  buffered: 0,
  /** Effects built node by node at the moment they were asked for. */
  live: 0,
  /** Buffers rendered ahead of time so far. */
  rendered: 0
}
