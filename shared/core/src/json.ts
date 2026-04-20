export type JsonObject = Record<string, unknown>

export const isPlainObject = (
  value: unknown
): value is Record<string, unknown> => (
  typeof value === 'object'
  && value !== null
  && !Array.isArray(value)
)

export const isJsonObject = (
  value: unknown
): value is JsonObject => isPlainObject(value)

export const stableStringify = (
  value: unknown
): string => {
  if (value === undefined) {
    return 'undefined'
  }
  if (value === null) {
    return 'null'
  }
  if (typeof value === 'string') {
    return JSON.stringify(value)
  }
  if (typeof value === 'number' || typeof value === 'boolean') {
    return String(value)
  }
  if (Array.isArray(value)) {
    return `[${value.map(item => stableStringify(item)).join(',')}]`
  }
  if (isPlainObject(value)) {
    const entries = Object.entries(value)
      .sort(([left], [right]) => left.localeCompare(right))
      .map(([key, nestedValue]) => `${JSON.stringify(key)}:${stableStringify(nestedValue)}`)
    return `{${entries.join(',')}}`
  }

  return String(value)
}

export const hasOwn = (
  value: Record<string, unknown>,
  key: string
): boolean => Object.prototype.hasOwnProperty.call(value, key)

export const readObjectKey = (
  value: unknown,
  key: string
): unknown => (value as Record<string, unknown>)[key]

export const hasPatchChanges = <T extends object>(
  current: T,
  patch: Partial<T>
): boolean => {
  const currentRecord = current as Record<string, unknown>
  const patchRecord = patch as Record<string, unknown>

  for (const key of Object.keys(patchRecord)) {
    if (!Object.is(currentRecord[key], patchRecord[key])) {
      return true
    }
  }

  return false
}
