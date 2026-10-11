import { resolve, sep } from 'node:path'
import { AssetStore } from './AssetStore.mjs'
import { TicketStore } from './TicketStore.mjs'
import { ReviewStore } from './ReviewStore.mjs'
import { LocalSecurity, readJson, jsonResponse } from './LocalSecurity.mjs'
import { openReceiptSocket } from './ReceiptSocket.mjs'
import { fail, finite } from './Validation.mjs'

export async function createDebugService({ root, origin, allowModuleRoots = [], receiptSocket = true }) {
  const assets = await AssetStore.open(root)
  const tickets = await TicketStore.open(resolve(root, 'state'), assets)
  let socket, reviews
  try {
    reviews = await ReviewStore.open(resolve(root, 'review-state'), assets)
    if (receiptSocket) socket = await openReceiptSocket(tickets)
  } catch (error) {
    await reviews?.close()
    await tickets.close()
    throw error
  }
  const security = new LocalSecurity(origin)
  let activeAssets = 0
  const handler = async (
    request,
    response,
    next = () => {
      response.writeHead(404)
      response.end()
    }
  ) => {
    try {
      const url = security.guard(request, response)
      if (url.pathname.startsWith('/@fs/')) {
        const file = resolve('/', url.pathname.slice('/@fs/'.length))
        if (!allowModuleRoots.some((root) => file === root || file.startsWith(root + sep)))
          fail('File is outside viewer modules', 403, 'unknown-reference')
      }
      if (!url.pathname.startsWith('/api/')) return next()
      if (url.search && !url.pathname.endsWith('/tickets')) fail('Query parameters are unsupported')
      if (url.pathname === '/api/v1/session' && request.method === 'GET')
        return jsonResponse(response, 200, {
          csrf: security.bootstrap(request, response),
          schemaVersion: 1,
          catalogRevision: assets.catalog.public.catalogRevision,
          capabilities: {
            actual3D: assets.catalog.public.actual3DState,
            receiptBridge: !!socket,
            parentRoundtripVerified: false
          }
        })
      security.authorize(request, request.method !== 'GET' && request.method !== 'HEAD')
      if (request.method === 'GET' && url.pathname === '/api/v1/catalog')
        return jsonResponse(response, 200, assets.catalog.public)
      const role = /^\/api\/v1\/roles\/([a-z0-9-]{1,40})\/revisions\/([a-zA-Z0-9_.-]{1,120})$/.exec(url.pathname)
      if (request.method === 'GET' && role) {
        const revision = assets.revision(role[2])
        if (revision.role !== role[1]) fail('Role revision mismatch', 404, 'unknown-reference')
        return jsonResponse(response, 200, revision)
      }
      if (url.pathname === '/api/v1/audio-reviews') {
        if (request.method === 'GET') return jsonResponse(response, 200, reviews.list())
        if (request.method === 'POST') return jsonResponse(response, 200, await reviews.decide(await readJson(request)))
      }
      if (url.pathname === '/api/v1/regeneration' && request.method === 'POST')
        return jsonResponse(response, 200, await reviews.regenerate(await readJson(request)))
      const assetMatch = /^\/api\/v1\/assets\/(a-[a-f0-9]{64})$/.exec(url.pathname)
      if (['GET', 'HEAD'].includes(request.method) && assetMatch) {
        if (activeAssets >= 2) fail('Two asset loads already active; retry explicitly', 429, 'capacity-exceeded')
        activeAssets++
        try {
          const { asset, bytes } = await assets.bytes(assetMatch[1])
          const headers = {
            'Content-Type': asset.mimeType,
            ETag: `"${asset.sha256}"`,
            'Cache-Control': 'private, max-age=31536000, immutable',
            'Accept-Ranges': 'bytes'
          }
          let start = 0,
            end = bytes.length - 1,
            status = 200
          if (request.headers.range) {
            const range = /^bytes=(\d+)-(\d*)$/.exec(request.headers.range)
            if (!range) fail('Only one bounded byte range is supported', 416)
            start = Number(range[1])
            end = range[2] ? Number(range[2]) : end
            if (!Number.isSafeInteger(start) || !Number.isSafeInteger(end) || start > end || end >= bytes.length)
              fail('Invalid byte range', 416)
            status = 206
            headers['Content-Range'] = `bytes ${start}-${end}/${bytes.length}`
          }
          headers['Content-Length'] = end - start + 1
          response.writeHead(status, headers)
          response.end(request.method === 'HEAD' ? undefined : bytes.subarray(start, end + 1))
          return
        } finally {
          activeAssets--
        }
      }
      if (url.pathname === '/api/v1/tickets') {
        if (request.method === 'GET') {
          if (
            [...url.searchParams.keys()].some((key) => !['status', 'after', 'limit'].includes(key)) ||
            [...url.searchParams.keys()].some((key) => url.searchParams.getAll(key).length !== 1)
          )
            fail('Invalid ticket filter')
          return jsonResponse(
            response,
            200,
            tickets.list({
              status: url.searchParams.get('status') ?? undefined,
              after: finite(Number(url.searchParams.get('after') ?? 0), 0, 1000, true),
              limit: finite(Number(url.searchParams.get('limit') ?? 50), 1, 100, true)
            })
          )
        }
        if (request.method === 'POST') {
          const value = await readJson(request)
          const result = await tickets.submit(value, request.headers['idempotency-key'])
          return jsonResponse(response, result.created ? 201 : 200, result.ticket)
        }
      }
      const ticket = /^\/api\/v1\/tickets\/([0-9a-f-]{36})$/i.exec(url.pathname)
      if (request.method === 'GET' && ticket) return jsonResponse(response, 200, tickets.get(ticket[1]))
      fail('Unknown debug route', 404, 'unknown-reference')
    } catch (error) {
      if (!response.headersSent)
        jsonResponse(response, error.status ?? 503, {
          code: error.code ?? 'store-unavailable',
          message: error.status ? error.message : 'Local service unavailable; preserve the draft and retry',
          retryable: !error.status || error.status >= 500
        })
      else response.destroy()
    }
  }
  let closing
  return {
    handler,
    assets,
    tickets,
    reviews,
    security,
    close() {
      return (closing ??= (async () => {
        if (socket) await socket.close()
        await reviews.close()
        await tickets.close()
      })())
    }
  }
}
export function towerDebugPlugin(options) {
  let service
  return {
    name: 'tower-debug-local-only',
    async configureServer(server) {
      service = await createDebugService(options)
      // Vite's own SIGTERM listener calls server.close() before exiting. Make our durability
      // barrier part of that same awaited close, rather than an unawaited HTTP-close callback.
      const originalClose = server.close.bind(server)
      let closePromise
      server.close = () =>
        (closePromise ??= (async () => {
          try {
            await originalClose()
          } finally {
            await service.close()
          }
        })())
      server.middlewares.use(service.handler)
      server.httpServer?.prependListener('upgrade', (request, socket) => {
        if (
          request.headers.host !== new URL(options.origin).host ||
          request.headers.origin !== options.origin ||
          request.headers['sec-websocket-protocol'] !== 'vite-hmr' ||
          new URL(request.url, options.origin).pathname !== '/'
        )
          socket.destroy()
      })
      const close = () => void service.close()
      server.httpServer?.once('close', close)
    },
    async closeBundle() {
      await service?.close()
    }
  }
}
