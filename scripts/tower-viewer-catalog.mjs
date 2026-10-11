import { readdirSync, readFileSync, existsSync } from 'node:fs'
import { resolve, relative, sep } from 'node:path'
import { createHash } from 'node:crypto'

// Only approved 3D-rendered sheets in the viewer-only asset directory enter EXTRA.
export function towerViewerCatalog(root) {
  const publicRoot = resolve(root, 'public'),
    artRoot = resolve(publicRoot, 'tower-defense-viewer/sheets')
  const clips = []
  if (!existsSync(artRoot)) return { version: 1, clips }
  const reference = (path, mimeType) => {
    const bytes = readFileSync(path)
    return {
      assetId: relative(publicRoot, path).split(sep).join('/'),
      revision: 'published',
      bytes: bytes.length,
      sha256: createHash('sha256').update(bytes).digest('hex'),
      mimeType
    }
  }
  for (const pack of readdirSync(artRoot, { withFileTypes: true })) {
    if (!pack.isDirectory()) continue
    const directory = resolve(artRoot, pack.name)
    for (const filename of readdirSync(directory)) {
      if (!filename.endsWith('.json')) continue
      const path = resolve(directory, filename)
      let data
      try {
        data = JSON.parse(readFileSync(path, 'utf8'))
      } catch {
        continue
      }
      if (
        !['idle', 'walk', 'attack', 'breath', 'death'].includes(data.motion) ||
        !['n', 'ne', 'e', 'se', 's', 'sw', 'w', 'nw'].includes(data.direction) ||
        !Array.isArray(data.frames) ||
        !data.frames.length ||
        typeof data.texture !== 'string'
      )
        continue
      const texturePath = resolve(directory, data.texture)
      if (!texturePath.startsWith(directory + sep) || !existsSync(texturePath)) continue
      let elapsed = 0
      const frameStartTimesMs = data.frames.map((frame) => {
        const start = elapsed
        elapsed += frame.durationMs
        return start
      })
      if (!Number.isFinite(elapsed) || elapsed <= 0 || elapsed > 10000) continue
      clips.push({
        role: pack.name,
        motion: data.motion,
        direction: data.direction,
        manifest: reference(path, 'application/json'),
        texture: reference(texturePath, 'image/png'),
        textureWidth: data.textureWidth,
        textureHeight: data.textureHeight,
        frames: data.frames,
        frameSize: data.frameSize,
        durationMs: elapsed,
        loop: data.loop !== false,
        frameStartTimesMs,
        events: [],
        gameCycleTravel: null,
        gameClockRule: 'Published source frames'
      })
    }
  }
  return { version: 1, clips }
}
export function towerViewerCatalogPlugin(root) {
  const source = () => JSON.stringify(towerViewerCatalog(root))
  return {
    name: 'tower-static-viewer-catalog',
    configureServer(server) {
      server.middlewares.use((request, response, next) => {
        if (!request.url?.split('?')[0].endsWith('/tower-defense-viewer/catalog.json')) return next()
        response.setHeader('Content-Type', 'application/json')
        response.end(source())
      })
    },
    generateBundle() {
      this.emitFile({ type: 'asset', fileName: 'tower-defense-viewer/catalog.json', source: source() })
    }
  }
}
