import { readFile, writeFile } from 'node:fs/promises'
import { createHash } from 'node:crypto'
import { gzipSync } from 'node:zlib'
import { resolve, relative, isAbsolute } from 'node:path'
import { parentPort } from 'node:worker_threads'
import { compressGlb } from './tower-model-sidecars.mjs'
import { verifyModelSidecar } from './verify-model-sidecar.mjs'

/** Builds, fully verifies and writes the sidecar of one runtime-manifest model. */
export async function buildModelSidecar(sourceDir, targetDir, model) {
  const source = resolve(sourceDir, model.file)
  const rel = relative(sourceDir, source)
  if (!rel || rel.startsWith('..') || isAbsolute(rel) || !rel.endsWith('.glb'))
    throw new Error('Invalid model sidecar path')
  const bytes = await readFile(source)
  if (bytes.length !== model.bytes || createHash('sha256').update(bytes).digest('hex') !== model.outputSha256)
    throw new Error(`Model sidecar source mismatch: ${rel}`)
  const derivative = await compressGlb(bytes, model.outputSha256)
  const verification = await verifyModelSidecar(bytes, derivative)
  const compressed = gzipSync(derivative, { level: 6, mtime: 0 })
  await writeFile(resolve(targetDir, `${rel}.${model.outputSha256}.gz.bin`), compressed)
  return {
    file: model.file,
    sourceSha256: model.outputSha256,
    sha256: createHash('sha256').update(derivative).digest('hex'),
    bytes: derivative.length,
    verification
  }
}

parentPort?.on('message', async ({ id, sourceDir, targetDir, model }) => {
  try {
    parentPort.postMessage({ id, result: await buildModelSidecar(sourceDir, targetDir, model) })
  } catch (error) {
    parentPort.postMessage({ id, error: error instanceof Error ? error.message : String(error) })
  }
})
