// MOQTransport consumes raw DEFLATE JSON streams with the sync-flush tail omitted.
// Every record starts a new group, so each frame starts a fresh stream.
export function encodeMoqJson(value: unknown): Uint8Array {
  const data = new TextEncoder().encode(JSON.stringify(value))
  const blocks = Math.max(1, Math.ceil(data.length / 65535))
  const frame = new Uint8Array(data.length + blocks * 5 + 1)
  let offset = 0
  for (let block = 0; block < blocks; block++) {
    const start = block * 65535
    const length = Math.min(65535, data.length - start)
    frame.set([0, length & 0xff, length >> 8, ~length & 0xff, (~length >> 8) & 0xff], offset)
    offset += 5
    frame.set(data.subarray(start, start + length), offset)
    offset += length
  }
  return frame
}
