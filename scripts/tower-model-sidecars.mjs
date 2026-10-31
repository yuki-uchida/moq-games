import { readFile, writeFile } from 'node:fs/promises'
import { createHash } from 'node:crypto'
import { gzipSync } from 'node:zlib'
import { resolve, relative, isAbsolute } from 'node:path'

/** Deterministic sidecars are build artifacts; original GLBs remain available for fallback. */
export function towerModelSidecars(root) {
  let outDir
  return {
    name: 'tower-model-sidecars',
    apply: 'build',
    configResolved(config) {
      outDir = resolve(config.root, config.build.outDir)
    },
    async closeBundle() {
      const sourceDir = resolve(root, 'public/tower-defense-art/models')
      const targetDir = resolve(outDir, 'tower-defense-art/models')
      const manifest = JSON.parse(await readFile(resolve(sourceDir, 'runtime-manifest.json'), 'utf8'))
      for (const model of manifest.models) {
        const source = resolve(sourceDir, model.file)
        const rel = relative(sourceDir, source)
        if (!rel || rel.startsWith('..') || isAbsolute(rel) || !rel.endsWith('.glb'))
          throw new Error('Invalid model sidecar path')
        const bytes = await readFile(source)
        if (bytes.length !== model.bytes || createHash('sha256').update(bytes).digest('hex') !== model.outputSha256)
          throw new Error(`Model sidecar source mismatch: ${rel}`)
        await writeFile(
          resolve(targetDir, `${rel}.${model.outputSha256}.gz.bin`),
          gzipSync(bytes, { level: 6, mtime: 0 })
        )
      }
    }
  }
}
