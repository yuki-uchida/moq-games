export type Decoder<T> = (value: unknown) => T
export type ObjectSchema<T> = { [K in keyof T]-?: Decoder<T[K]> }

export function requireCheckpoint(condition: unknown): asserts condition {
  if (!condition) throw new Error('Invalid campaign checkpoint')
}

export function record(value: unknown): Record<string, unknown> {
  requireCheckpoint(
    value !== null &&
      typeof value === 'object' &&
      !Array.isArray(value) &&
      (Object.getPrototypeOf(value) === Object.prototype || Object.getPrototypeOf(value) === null)
  )
  return value as Record<string, unknown>
}

export function object<T>(schema: ObjectSchema<T>): Decoder<T> {
  return (value) => {
    const input = record(value),
      result: Record<string, unknown> = {}
    for (const key of Object.keys(schema) as (keyof T & string)[]) {
      const decoded = schema[key](Object.hasOwn(input, key) ? input[key] : undefined)
      if (decoded !== undefined) result[key] = decoded
    }
    return result as T
  }
}

export function number(minimum: number, maximum: number, integer = false): Decoder<number> {
  return (value) => {
    requireCheckpoint(
      typeof value === 'number' &&
        Number.isFinite(value) &&
        value >= minimum &&
        value <= maximum &&
        (!integer || Number.isSafeInteger(value))
    )
    return value
  }
}

export function choice<const T extends string | number | boolean>(values: readonly T[]): Decoder<T> {
  return (value) => {
    requireCheckpoint(values.includes(value as T))
    return value as T
  }
}

export const boolean = choice([true, false])

export function string(maximum: number): Decoder<string> {
  return (value) => {
    requireCheckpoint(typeof value === 'string' && value.length <= maximum)
    return value
  }
}

export function array<T>(decode: Decoder<T>, maximum: number): Decoder<T[]> {
  return (value) => {
    requireCheckpoint(Array.isArray(value) && value.length <= maximum)
    return Array.from(value, decode)
  }
}

export const optional =
  <T>(decode: Decoder<T>): Decoder<T | undefined> =>
  (value) =>
    value === undefined ? undefined : decode(value)
export const nullable =
  <T>(decode: Decoder<T>): Decoder<T | null> =>
  (value) =>
    value === null ? null : decode(value)
