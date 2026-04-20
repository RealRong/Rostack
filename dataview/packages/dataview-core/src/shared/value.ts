export type DraftParseResult =
  | { type: 'set'; value: unknown }
  | { type: 'clear' }
  | { type: 'invalid' }

export const expandSearchableValue = (
  value: unknown
): string[] => {
  if (value === undefined || value === null) {
    return []
  }

  if (Array.isArray(value)) {
    return value.flatMap(item => expandSearchableValue(item))
  }

  if (typeof value === 'object') {
    return Object.values(value as Record<string, unknown>).flatMap(item => expandSearchableValue(item))
  }

  return [String(value)]
}

export const normalizeValueToken = (
  value: unknown
): string => String(value).trim().toLowerCase()

export const isEmptyValue = (
  value: unknown
): boolean => {
  if (value === undefined || value === null) {
    return true
  }

  if (typeof value === 'string') {
    return !value.trim()
  }

  if (Array.isArray(value)) {
    return value.length === 0
  }

  return false
}
