import type { AssetRef } from './contracts'

export class LocalRequestError extends Error {
  constructor(
    message: string,
    readonly status: number,
    readonly code?: string
  ) {
    super(message)
  }
}
export const assetUrl = (reference: AssetRef) => `/api/v1/assets/${reference.assetId}`
export async function json<T>(path: string, init: RequestInit = {}): Promise<T> {
  const response = await fetch(path, {
    credentials: 'same-origin',
    redirect: 'error',
    cache: 'no-store',
    ...init
  })
  const body = await response.json()
  if (!response.ok)
    throw new LocalRequestError(body.message ?? `Local request failed (${response.status})`, response.status, body.code)
  return body as T
}
export async function verifiedBytes(reference: AssetRef, signal?: AbortSignal): Promise<ArrayBuffer> {
  const response = await fetch(assetUrl(reference), {
    signal,
    credentials: 'same-origin',
    redirect: 'error'
  })
  if (!response.ok) throw new Error(`Asset load failed (${response.status})`)
  const bytes = await response.arrayBuffer()
  if (bytes.byteLength !== reference.bytes) throw new Error('Asset size mismatch')
  const digest = [...new Uint8Array(await crypto.subtle.digest('SHA-256', bytes))]
    .map((value) => value.toString(16).padStart(2, '0'))
    .join('')
  if (digest !== reference.sha256) throw new Error('Asset digest mismatch')
  return bytes
}
