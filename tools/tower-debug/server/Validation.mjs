import { createHash } from 'node:crypto'

export class RequestError extends Error {
  constructor(status, code, message) {
    super(message)
    this.status = status
    this.code = code
  }
}
export function fail(message, status = 400, code = 'invalid-request') {
  throw new RequestError(status, code, message)
}
export function record(value, keys, required = keys) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) fail('Expected an object')
  if (Object.keys(value).some((key) => !keys.includes(key))) fail('Unknown field')
  if (required.some((key) => !Object.hasOwn(value, key))) fail('Missing field')
  return value
}
export function boundedText(value, min, max) {
  if (typeof value !== 'string' || [...value].length < min || [...value].length > max || value.includes('\0'))
    fail('Invalid text length')
  return value
}
export function finite(value, min, max, integer = false) {
  if (!Number.isFinite(value) || value < min || value > max || (integer && !Number.isSafeInteger(value)))
    fail('Number out of range')
  return value
}
export function uuid(value) {
  if (
    typeof value !== 'string' ||
    !/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value)
  )
    fail('Invalid UUID')
  return value
}
export function digest(value) {
  if (typeof value !== 'string' || !/^[a-f0-9]{64}$/.test(value)) fail('Invalid digest')
  return value
}
export function canonical(value) {
  if (Array.isArray(value)) return `[${value.map(canonical).join(',')}]`
  if (value !== null && typeof value === 'object')
    return `{${Object.keys(value)
      .sort()
      .map((key) => `${JSON.stringify(key)}:${canonical(value[key])}`)
      .join(',')}}`
  return JSON.stringify(value)
}
export function sha256(value) {
  return createHash('sha256').update(value).digest('hex')
}
export function submissionHash(value) {
  return sha256(canonical(value))
}
