import { readFile } from 'node:fs/promises'
import { createHash } from 'node:crypto'
import { gunzipSync } from 'node:zlib'
import { pathToFileURL } from 'node:url'

/** Verify the actual deployed bytes, including the hash-addressed sidecars used by the game. */
export async function verifyPublishedMotions(base, audit) {
  base = new URL(base.endsWith('/') ? base : `${base}/`)
  async function get(path) {
    const url = new URL(path, base)
    const response = await fetch(url, { signal: AbortSignal.timeout(30000), cache: 'no-store' })
    if (!response.ok) throw Error(`${url}: HTTP ${response.status}`)
    return response
  }
  const manifest = await (
    await get(`tower-defense-art/models/runtime-manifest.json?verify=${process.env.GITHUB_SHA ?? Date.now()}`)
  ).json()
  const assets = await Promise.all(
    Object.entries(audit.units).map(async ([role, expected]) => {
      const file = `${role}/${expected.file}`
      const record = manifest.models.find((model) => model.role === role && model.file === file)
      if (record?.outputSha256 !== expected.outputSha256)
        throw Error(`${role}: deployed manifest hash is stale or incorrect`)
      const path = `tower-defense-art/models/${file}.${expected.outputSha256}.gz.bin`
      const response = await get(path)
      let bytes = Buffer.from(await response.arrayBuffer())
      const transferBytes = bytes.length
      if (bytes[0] === 0x1f && bytes[1] === 0x8b) bytes = gunzipSync(bytes)
      const sha256 = createHash('sha256').update(bytes).digest('hex')
      if (sha256 !== expected.outputSha256 || bytes.length !== expected.bytes)
        throw Error(`${role}: deployed GLB bytes do not match the verified asset`)
      return { role, url: new URL(path, base).href, bytes: bytes.length, transferBytes, sha256 }
    })
  )
  const pages = await Promise.all(
    [
      'index.html',
      'examples/games/tower_diffence_with_jev/index.html',
      'examples/games/tower_diffence_with_jev/extra.html'
    ].map(async (path) => {
      const response = await get(path)
      await response.arrayBuffer()
      return { url: new URL(path, base).href, status: response.status }
    })
  )
  return { assets, pages }
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const base = process.argv[2]
  if (!base) throw Error('Usage: node scripts/verify-published-motions.mjs <Pages base URL>')
  const audit = JSON.parse(await readFile(new URL('../docs/animation-repair-audit.json', import.meta.url), 'utf8'))
  // Pages/CDN propagation can briefly serve an old manifest or 404 after deploy succeeds.
  for (let attempt = 1; ; attempt++) {
    try {
      console.log(JSON.stringify(await verifyPublishedMotions(base, audit), null, 2))
      break
    } catch (error) {
      if (attempt === 12) throw error
      console.error(`Publication verification ${attempt}/12: ${error.message}`)
      await new Promise((resolve) => setTimeout(resolve, 5000))
    }
  }
}
