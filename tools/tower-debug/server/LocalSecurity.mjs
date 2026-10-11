import { randomBytes, timingSafeEqual } from 'node:crypto'
import { fail } from './Validation.mjs'

export function jsonResponse(response, status, data) {
  response.writeHead(status, {
    'Content-Type': 'application/json; charset=utf-8',
    'Cache-Control': 'no-store'
  })
  response.end(JSON.stringify(data))
}
export class LocalSecurity {
  constructor(origin) {
    this.origin = new URL(origin).origin
    this.host = new URL(origin).host
    if (new URL(origin).hostname !== '127.0.0.1' || new URL(origin).protocol !== 'http:')
      throw new Error('Debug origin must be IPv4 loopback HTTP')
    this.sessions = new Map()
    this.requests = []
  }
  guard(request, response) {
    if (!['127.0.0.1', '::ffff:127.0.0.1'].includes(request.socket.remoteAddress) || request.headers.host !== this.host)
      fail('Local host required', 403, 'origin-rejected')
    const raw = request.url ?? ''
    if (!raw.startsWith('/') || raw.startsWith('//') || raw.includes('\\') || /%2e|%2f|%5c|%00/i.test(raw))
      fail('Noncanonical path')
    let decoded
    try {
      decoded = decodeURIComponent(raw.split('?')[0])
    } catch {
      fail('Invalid path encoding')
    }
    if (
      /%2e|%2f|%5c|%00/i.test(decoded) ||
      decoded.split('/').some((part) => part === '..' || part === '.') ||
      decoded.includes('\0')
    )
      fail('Invalid path')
    const site = request.headers['sec-fetch-site']
    if (site && !['same-origin', 'none'].includes(site)) fail('Same origin required', 403, 'origin-rejected')
    if (request.headers.origin && request.headers.origin !== this.origin)
      fail('Same origin required', 403, 'origin-rejected')
    if (request.headers['x-http-method-override'] || request.headers['x-method-override'])
      fail('Method override is forbidden')
    const now = Date.now()
    this.requests = this.requests.filter((time) => time > now - 60_000)
    if (this.requests.length >= 600) fail('Local request limit reached', 429, 'capacity-exceeded')
    this.requests.push(now)
    response.setHeader('X-Content-Type-Options', 'nosniff')
    response.setHeader('Referrer-Policy', 'no-referrer')
    response.setHeader('Cross-Origin-Resource-Policy', 'same-origin')
    response.setHeader(
      'Content-Security-Policy',
      `default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' blob:; media-src 'self' blob:; connect-src 'self' blob: ws://${this.host}; object-src 'none'; frame-ancestors 'none'; base-uri 'none'; form-action 'none'`
    )
    return new URL(raw, this.origin)
  }
  bootstrap(request, response) {
    if (request.headers['sec-fetch-site'] !== 'same-origin')
      fail('Same-origin session request required', 403, 'origin-rejected')
    this.prune()
    const prior = this.fromCookie(request)
    let session = prior
    if (!session) {
      if (this.sessions.size >= 16) fail('Too many sessions', 429, 'capacity-exceeded')
      const id = randomBytes(32).toString('hex')
      session = {
        id,
        csrf: randomBytes(32).toString('hex'),
        touchedAt: Date.now()
      }
      this.sessions.set(id, session)
    }
    response.setHeader(
      'Set-Cookie',
      `tower_debug_session=${session.id}; HttpOnly; SameSite=Strict; Path=/; Max-Age=7200`
    )
    return session.csrf
  }
  prune() {
    for (const [key, session] of this.sessions)
      if (session.touchedAt < Date.now() - 7_200_000) this.sessions.delete(key)
  }
  fromCookie(request) {
    const cookies = (request.headers.cookie ?? '')
      .split(';')
      .map((item) => item.trim())
      .filter((item) => item.startsWith('tower_debug_session='))
    if (cookies.length !== 1) return null
    return this.sessions.get(cookies[0].slice('tower_debug_session='.length)) ?? null
  }
  authorize(request, mutation = false) {
    this.prune()
    if (request.headers['sec-fetch-site'] !== 'same-origin')
      fail('Same-origin request required', 403, 'origin-rejected')
    const session = this.fromCookie(request)
    if (!session) fail('Session expired; reload without resubmitting', 401, 'csrf-rejected')
    if (mutation) {
      if (request.headers.origin !== this.origin) fail('Origin required', 403, 'origin-rejected')
      if (request.headers['content-type']?.split(';')[0].trim() !== 'application/json') fail('JSON required', 415)
      const token = request.headers['x-debug-csrf']
      if (
        typeof token !== 'string' ||
        !/^[a-f0-9]{64}$/.test(token) ||
        !timingSafeEqual(Buffer.from(token), Buffer.from(session.csrf))
      )
        fail('CSRF verification failed', 403, 'csrf-rejected')
    }
    session.touchedAt = Date.now()
  }
}
export async function readJson(request) {
  const length = request.headers['content-length']
  if (length && (!/^\d+$/.test(length) || Number(length) > 65536)) fail('Request body too large', 413)
  const chunks = []
  let total = 0
  for await (const chunk of request) {
    total += chunk.length
    if (total > 65536) fail('Request body too large', 413)
    chunks.push(chunk)
  }
  try {
    return JSON.parse(Buffer.concat(chunks).toString('utf8'))
  } catch {
    fail('Invalid JSON')
  }
}
