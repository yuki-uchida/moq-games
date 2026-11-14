/**
 * WebCrypto helpers for the PvP information boundary (DESIGN §18). The relay is anonymous and the host's track is
 * one broadcast every guest (and anyone else on the relay) can read, so the per-team parts of a PvP snapshot are
 * sealed with that team's AES-GCM key:
 *
 * - every guest makes an ECDH P-256 key pair and sends the public half in its profile; the host publishes its own
 *   public half in the lobby state;
 * - the host wraps each team key for each guest with an AES-GCM key derived from the ECDH secret (HKDF-SHA-256,
 *   bound to the room code and the guest's network id);
 * - team parts are JSON, deflated, then sealed (AES-GCM, random 96-bit IV, the snapshot's match/generation/team/
 *   tick as additional data so a part cannot be replayed in another slot).
 */

const subtle = () => {
  const s = (globalThis as { crypto?: Crypto }).crypto?.subtle
  if (!s) throw new Error('WebCrypto is not available')
  return s
}

const utf8 = (text: string) => new TextEncoder().encode(text)

/**
 * Sealing work in flight. WebCrypto and the compression streams run in real time, outside any fake clock: tests
 * that step the rooms on fake timers wait for this to drain before the next frame (`sealingIdle`).
 */
let inFlight = 0
let idleWaiters: (() => void)[] = []

function tracked<T>(work: Promise<T>): Promise<T> {
  inFlight++
  const done = () => {
    if (--inFlight > 0) return
    const waiters = idleWaiters
    idleWaiters = []
    for (const wake of waiters) wake()
  }
  work.then(done, done)
  return work
}

/** True while sealing work started by this module has not finished. */
export const sealingBusy = () => inFlight > 0

/** Resolves once no sealing work is in flight. */
export const sealingIdle = (): Promise<void> =>
  inFlight === 0 ? Promise.resolve() : new Promise((resolve) => idleWaiters.push(resolve))

export function toB64(bytes: Uint8Array): string {
  let s = ''
  for (let i = 0; i < bytes.length; i += 0x8000) s += String.fromCharCode(...bytes.subarray(i, i + 0x8000))
  return btoa(s)
}

export function fromB64(text: string): Uint8Array {
  const s = atob(text)
  const out = new Uint8Array(s.length)
  for (let i = 0; i < s.length; i++) out[i] = s.charCodeAt(i)
  return out
}

/** A base64 string of at most `max` characters (untrusted input). */
export const isB64 = (v: unknown, max = 8192): v is string =>
  typeof v === 'string' && v.length > 0 && v.length <= max && /^[A-Za-z0-9+/]+={0,2}$/.test(v)

export interface EcdhPair {
  priv: CryptoKey
  /** Uncompressed P-256 public point, base64 (88 characters). */
  pub: string
}

export const newEcdh = (): Promise<EcdhPair> => tracked(makeEcdh())

async function makeEcdh(): Promise<EcdhPair> {
  const pair = (await subtle().generateKey({ name: 'ECDH', namedCurve: 'P-256' }, false, [
    'deriveBits'
  ])) as CryptoKeyPair
  const raw = new Uint8Array(await subtle().exportKey('raw', pair.publicKey))
  return { priv: pair.privateKey, pub: toB64(raw) }
}

/** A public key from the network: 65 bytes, uncompressed point (rejects anything else). */
export const isEcdhPub = (v: unknown): v is string => isB64(v, 120) && fromB64(v).length === 65

/**
 * The AES-GCM key that wraps team keys for one guest: HKDF over the ECDH secret between `priv` and `peerPub`,
 * salted with the room code and bound to the guest's network id. Host and guest derive the same key.
 */
export const wrapKey = (priv: CryptoKey, peerPub: string, room: string, memberId: string): Promise<CryptoKey> =>
  tracked(deriveWrapKey(priv, peerPub, room, memberId))

async function deriveWrapKey(priv: CryptoKey, peerPub: string, room: string, memberId: string): Promise<CryptoKey> {
  const s = subtle()
  const pub = await s.importKey(
    'raw',
    fromB64(peerPub) as BufferSource,
    { name: 'ECDH', namedCurve: 'P-256' },
    false,
    []
  )
  const bits = await s.deriveBits({ name: 'ECDH', public: pub }, priv, 256)
  const ikm = await s.importKey('raw', bits, 'HKDF', false, ['deriveKey'])
  return s.deriveKey(
    {
      name: 'HKDF',
      hash: 'SHA-256',
      salt: utf8(`anima-front-v1:${room}`) as BufferSource,
      info: utf8(`team-key-wrap:${memberId}`) as BufferSource
    },
    ikm,
    { name: 'AES-GCM', length: 256 },
    false,
    ['encrypt', 'decrypt']
  )
}

export function teamKey(raw: Uint8Array): Promise<CryptoKey> {
  return tracked(subtle().importKey('raw', raw as BufferSource, 'AES-GCM', false, ['encrypt', 'decrypt']))
}

export const randomBytes = (n: number) => crypto.getRandomValues(new Uint8Array(n))

/** AES-GCM: base64 of IV (12 bytes) + ciphertext + tag. */
export const seal = (key: CryptoKey, data: Uint8Array, aad: string): Promise<string> => tracked(encrypt(key, data, aad))

async function encrypt(key: CryptoKey, data: Uint8Array, aad: string): Promise<string> {
  const iv = randomBytes(12)
  const ct = new Uint8Array(
    await subtle().encrypt(
      { name: 'AES-GCM', iv: iv as BufferSource, additionalData: utf8(aad) as BufferSource },
      key,
      data as BufferSource
    )
  )
  const out = new Uint8Array(12 + ct.length)
  out.set(iv)
  out.set(ct, 12)
  return toB64(out)
}

/** Opens what seal() made; throws when the key, the additional data or the bytes do not match. */
export const unseal = (key: CryptoKey, text: string, aad: string): Promise<Uint8Array> =>
  tracked(decrypt(key, text, aad))

async function decrypt(key: CryptoKey, text: string, aad: string): Promise<Uint8Array> {
  const all = fromB64(text)
  if (all.length < 28) throw new Error('sealed data too short')
  const pt = await subtle().decrypt(
    { name: 'AES-GCM', iv: all.subarray(0, 12) as BufferSource, additionalData: utf8(aad) as BufferSource },
    key,
    all.subarray(12) as BufferSource
  )
  return new Uint8Array(pt)
}

async function pipe(data: Uint8Array, stream: CompressionStream | DecompressionStream): Promise<Uint8Array> {
  const out = new Blob([data as BlobPart]).stream().pipeThrough(stream)
  return new Uint8Array(await new Response(out).arrayBuffer())
}

/** Largest inflated team part accepted from the host. */
const MAX_PART = 1 << 20

export const sealJson = (key: CryptoKey, value: unknown, aad: string): Promise<string> =>
  tracked(packJson(key, value, aad))

async function packJson(key: CryptoKey, value: unknown, aad: string): Promise<string> {
  const z = await pipe(utf8(JSON.stringify(value)), new CompressionStream('deflate-raw'))
  return seal(key, z, aad)
}

export const unsealJson = (key: CryptoKey, text: string, aad: string): Promise<unknown> =>
  tracked(openJson(key, text, aad))

async function openJson(key: CryptoKey, text: string, aad: string): Promise<unknown> {
  const z = await unseal(key, text, aad)
  const raw = await pipe(z, new DecompressionStream('deflate-raw'))
  if (raw.length > MAX_PART) throw new Error('sealed part too large')
  return JSON.parse(new TextDecoder().decode(raw))
}
