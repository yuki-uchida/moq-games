/** The stylesheet draws its glyphs with pixel-art images; no emoji or pictograph may appear in `content:` values. */
import { readFileSync } from 'node:fs'
import { expect, test } from 'vitest'

const css = readFileSync(new URL('../src/style.css', import.meta.url), 'utf8')
// Emoji / pictographs, plus the Miscellaneous Symbols and Dingbats blocks that hold decorative glyphs such as ✔ and ✦.
const PICTO = /[\p{Extended_Pictographic}\p{Emoji_Presentation}\u2600-\u27bf\ufe0f\u200d]/u

test('no content: value in the stylesheet uses emoji or pictographs', () => {
  const values = Array.from(css.matchAll(/(?<![\w-])content\s*:\s*([^;}]*)/g), (m) => m[1]!)
  expect(values.length).toBeGreaterThan(5)
  const bad = values.filter((v) => PICTO.test(v))
  expect(bad).toEqual([])
})
