import { readFile } from 'node:fs/promises'
import { createHash } from 'node:crypto'
import { gunzipSync } from 'node:zlib'
import { pathToFileURL } from 'node:url'

/** Verify the actual deployed bytes, including the hash-addressed sidecars used by the game. */
export async function verifyPublishedMotions(base, audit, expectedSidecars) {
  if (expectedSidecars?.version !== 1 || !Array.isArray(expectedSidecars.models))
    throw Error('A verified build sidecar digest manifest is required')
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
  for (const [role, expected] of Object.entries(audit.units)) {
    const file = `${role}/${expected.file}`
    const record = manifest.models.find((model) => model.role === role && model.file === file)
    if (record?.outputSha256 !== expected.outputSha256)
      throw Error(`${role}: deployed manifest hash is stale or incorrect`)
    if (expectedSidecars.models.find((model) => model.file === file)?.sourceSha256 !== expected.outputSha256)
      throw Error(`${role}: missing verified build sidecar digest`)
  }
  const assets = await Promise.all(
    expectedSidecars.models.map(async (trusted) => {
      const file = trusted.file
      const record = manifest.models.find((model) => model.file === file)
      if (record?.outputSha256 !== trusted.sourceSha256 || !/^[a-f0-9]{64}$/.test(trusted.sha256))
        throw Error(`${file}: deployed manifest hash or verified build digest is incorrect`)
      const path = `tower-defense-art/models/${file}.${trusted.sourceSha256}.gz.bin`
      const response = await get(path)
      let bytes = Buffer.from(await response.arrayBuffer())
      const transferBytes = bytes.length
      // The expected digest comes from the verified CI artifact, never the deployed manifest or stamp.
      if (bytes[0] === 0x1f && bytes[1] === 0x8b) bytes = gunzipSync(bytes)
      const sha256 = createHash('sha256').update(bytes).digest('hex')
      let source
      try {
        if (bytes.readUInt32LE(0) !== 0x46546c67 || bytes.readUInt32LE(8) !== bytes.length) throw Error('header')
        source = JSON.parse(bytes.subarray(20, 20 + bytes.readUInt32LE(12)).toString('utf8')).asset.extras.sourceSha256
      } catch {
        source = undefined
      }
      if (source !== trusted.sourceSha256 || bytes.length !== trusted.bytes || sha256 !== trusted.sha256)
        throw Error(`${file}: deployed GLB bytes do not match the verified asset`)
      return { role: record.role, file, url: new URL(path, base).href, bytes: bytes.length, transferBytes, sha256 }
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
  const digestPath = process.argv[3]
  if (!base || !digestPath)
    throw Error('Usage: node scripts/verify-published-motions.mjs <Pages base URL> <verified sidecar digests>')
  const expectedSidecars = JSON.parse(await readFile(digestPath, 'utf8'))
  const audit = JSON.parse(await readFile(new URL('../docs/animation-repair-audit.json', import.meta.url), 'utf8'))
  // Pages/CDN propagation can briefly serve an old manifest or 404 after deploy succeeds.
  for (let attempt = 1; ; attempt++) {
    try {
      console.log(JSON.stringify(await verifyPublishedMotions(base, audit, expectedSidecars), null, 2))
      break
    } catch (error) {
      if (attempt === 12) throw error
      console.error(`Publication verification ${attempt}/12: ${error.message}`)
      await new Promise((resolve) => setTimeout(resolve, 5000))
    }
  }
}
