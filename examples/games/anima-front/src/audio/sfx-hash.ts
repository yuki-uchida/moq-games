import type { SfxDef } from './sfx-builder'
import type { LoopDef } from './sfx/loops'

/**
 * A short hash of everything that shapes an effect's sound (`play` source, gain, voice limit, cooldown, pitch
 * variation, reverb send). `sfx-metrics.json` stores it next to the measured numbers, so a test can tell that a
 * definition changed after it was last measured. Whitespace and the test runner's import renaming are normalised
 * away so Vite (browser) and Vitest (Node) agree.
 */
export function sfxHash(def: SfxDef): string {
  const src = def.play
    .toString()
    .replace(/__vi_import_\d+__\./g, '')
    .replace(/\s+/g, '')
    // Vitest's transform emits a stray ';' after a closing brace that the browser's does not.
    .replace(/\};/g, '}')
  const text = [src, def.g, def.limit, def.cd, def.vary ?? '', def.rev ?? ''].join('|')
  // FNV-1a, 32 bit.
  let h = 0x811c9dc5
  for (let i = 0; i < text.length; i++) {
    h ^= text.charCodeAt(i)
    h = Math.imul(h, 0x01000193) >>> 0
  }
  return h.toString(16).padStart(8, '0')
}

/** The same freshness hash for a sustained loop recipe (its `build` source and level). */
export function loopHash(def: LoopDef): string {
  const src = def.build
    .toString()
    .replace(/__vi_import_\d+__\./g, '')
    .replace(/\s+/g, '')
    // Vitest's transform emits a stray ';' after a closing brace that the browser's does not.
    .replace(/\};/g, '}')
  const text = [src, def.level].join('|')
  let h = 0x811c9dc5
  for (let i = 0; i < text.length; i++) {
    h ^= text.charCodeAt(i)
    h = Math.imul(h, 0x01000193) >>> 0
  }
  return h.toString(16).padStart(8, '0')
}
