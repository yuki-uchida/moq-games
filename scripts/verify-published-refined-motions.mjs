import { readFile } from 'node:fs/promises'
import { createHash } from 'node:crypto'
import { pathToFileURL } from 'node:url'

export async function verifyPublishedRefinedMotions(base, entries, fetcher = fetch) {
  const root = new URL(base.endsWith('/') ? base : `${base}/`)
  const nonce = process.env.GITHUB_SHA ?? Date.now()
  async function get(path) {
    const url = new URL(path, root)
    url.searchParams.set('verify', String(nonce))
    const response = await fetcher(url, { cache: 'no-store', signal: AbortSignal.timeout(30000) })
    if (!response.ok) throw Error(`${url}: HTTP ${response.status}`)
    return response
  }
  const manifest = await (await get('tower-defense-art/models/runtime-manifest.json')).json()
  return Promise.all(
    entries.map(async (entry) => {
      const source = manifest.models.find(
        (model) => model.role === entry.role && model.file === `${entry.role}/${entry.source}`
      )
      if (source?.outputSha256 !== entry.sourceSha256) throw Error(`${entry.role}: deployed source identity differs`)
      const path = `tower-defense-art/models/motions/${entry.clip}`
      const response = await get(path)
      const bytes = Buffer.from(await response.arrayBuffer())
      const sha256 = createHash('sha256').update(bytes).digest('hex')
      if (sha256 !== entry.sha256 || bytes.length !== entry.bytes)
        throw Error(`${entry.clip}: deployed motion bytes differ`)
      return { role: entry.role, motion: entry.motion, url: new URL(path, root).href, bytes: bytes.length, sha256 }
    })
  )
}
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const base = process.argv[2]
  if (!base) throw Error('Usage: node scripts/verify-published-refined-motions.mjs <Pages base URL>')
  const entries = JSON.parse(await readFile(new URL('./refined-motions-manifest.json', import.meta.url), 'utf8'))
  for (let attempt = 1; ; attempt++) {
    try {
      console.log(JSON.stringify(await verifyPublishedRefinedMotions(base, entries), null, 2))
      break
    } catch (error) {
      if (attempt === 12) throw error
      console.error(`Overlay publication verification ${attempt}/12: ${error.message}`)
      await new Promise((resolve) => setTimeout(resolve, 5000))
    }
  }
}
