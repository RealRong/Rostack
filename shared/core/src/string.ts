export const isNonEmptyString = (
  value: unknown
): value is string => typeof value === 'string' && value.trim().length > 0

export const trimToUndefined = (
  value: unknown
): string | undefined => {
  if (typeof value !== 'string') {
    return undefined
  }

  const normalized = value.trim()
  return normalized.length
    ? normalized
    : undefined
}

export const trimLowercase = (
  value: unknown
): string | undefined => {
  const normalized = trimToUndefined(value)
  return normalized?.toLowerCase()
}

export const trimmedOr = (
  value: unknown,
  fallback: string
): string => trimToUndefined(value) ?? fallback

export const createKey = (
  value: string
): string => value
  .trim()
  .toLowerCase()
  .replace(/[^a-z0-9]+/g, '_')
  .replace(/^_+|_+$/g, '')
