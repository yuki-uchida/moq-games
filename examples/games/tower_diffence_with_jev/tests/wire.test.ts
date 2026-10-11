import { inflateRawSync, constants } from 'node:zlib'
import { expect, it } from 'vitest'
import { encodeMoqJson } from '../../../../utils/moqJson'

function decode(frame: Uint8Array): unknown {
  return JSON.parse(
    inflateRawSync(Buffer.concat([frame, Buffer.from([0, 0, 255, 255])]), {
      finishFlush: constants.Z_SYNC_FLUSH
    }).toString()
  )
}

it.each([10, 65535, 140000])('encodes a JSON record with %i bytes of content for MOQTransport', (length) => {
  // Arrange
  const record = { version: 1, session: '日本語', state: { content: 'x'.repeat(length) } }
  // Act
  const frame = encodeMoqJson(record)
  // Assert
  expect(decode(frame)).toEqual(record)
})
