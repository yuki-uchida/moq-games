import { strict as assert } from 'node:assert'
import { createHash } from 'node:crypto'
import { test } from 'node:test'
import { normalizeSourceText } from '../scripts/sdk-source-text.mjs'

test('source hashes are independent of Git CRLF checkout conversion', () => {
  const hash = (text) => createHash('sha256').update(normalizeSourceText(text)).digest('hex')
  assert.equal(hash('first\r\nsecond\r\n'), hash('first\nsecond\n'))
  assert.notEqual(hash('first\r\nchanged\r\n'), hash('first\nsecond\n'))
  assert.notEqual(hash('first\rsecond'), hash('first\nsecond'))
})
