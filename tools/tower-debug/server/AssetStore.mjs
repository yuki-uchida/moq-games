import { readFile, realpath, lstat } from 'node:fs/promises'
import { resolve, sep } from 'node:path'
import { fail, sha256, record, digest } from './Validation.mjs'

const MIME = new Set([
  'image/png',
  'image/webp',
  'application/json',
  'model/gltf-binary',
  'audio/wav',
  'audio/webm',
  'audio/ogg',
  'video/mp4',
  'video/webm'
])
export class AssetStore {
  static async open(root) {
    const actualRoot = await realpath(root)
    const catalog = JSON.parse(await readFile(resolve(actualRoot, 'catalog.json'), 'utf8'))
    if (
      catalog.schemaVersion !== 1 ||
      !catalog.public ||
      !Array.isArray(catalog.assets) ||
      !Array.isArray(catalog.revisions)
    )
      fail('Invalid asset catalog', 503, 'store-unavailable')
    return new AssetStore(actualRoot, catalog)
  }
  constructor(root, catalog) {
    this.root = root
    this.catalog = catalog
    this.assets = new Map()
    for (const asset of catalog.assets) {
      digest(asset.sha256)
      if (
        asset.assetId !== `a-${asset.sha256}` ||
        !MIME.has(asset.mimeType) ||
        !Number.isSafeInteger(asset.bytes) ||
        asset.bytes < 1 ||
        asset.bytes > 64 * 1024 * 1024
      )
        fail('Invalid asset record')
      if (
        !/^[a-f0-9]{64}\.(png|webp|json|glb|wav|webm|ogg|mp4)$/.test(asset.storageName) ||
        this.assets.has(asset.assetId)
      )
        fail('Invalid asset identity')
      this.assets.set(asset.assetId, asset)
    }
  }
  asset(id) {
    const asset = this.assets.get(id)
    if (!asset) fail('Unknown asset', 404, 'unknown-reference')
    return asset
  }
  ref(id) {
    const { storageName, ...reference } = this.asset(id)
    return reference
  }
  checkRef(reference) {
    record(reference, ['assetId', 'revision', 'sha256', 'bytes', 'mimeType'])
    const known = this.ref(reference.assetId)
    if (Object.keys(known).some((key) => reference[key] !== known[key]))
      fail('Asset revision mismatch', 409, 'revision-conflict')
    return structuredClone(known)
  }
  revision(id) {
    const found = this.catalog.revisions.find((revision) => revision.revision === id)
    if (!found) fail('Unknown role revision', 404, 'unknown-reference')
    return found
  }
  async bytes(id) {
    const asset = this.asset(id)
    const base = await realpath(resolve(this.root, 'assets'))
    const path = resolve(base, asset.storageName)
    const stat = await lstat(path)
    if (!stat.isFile() || stat.isSymbolicLink() || !(await realpath(path)).startsWith(base + sep))
      fail('Asset unavailable', 404, 'unknown-reference')
    if (stat.size !== asset.bytes) fail('Asset integrity mismatch', 409, 'revision-conflict')
    const bytes = await readFile(path)
    if (bytes.length !== asset.bytes || sha256(bytes) !== asset.sha256)
      fail('Asset integrity mismatch', 409, 'revision-conflict')
    return { asset, bytes }
  }
}
