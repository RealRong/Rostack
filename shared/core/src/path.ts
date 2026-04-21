type PathContainer = Record<string, unknown>

const splitPath = (
  value: string
): string[] => value
  .split('.')
  .filter(Boolean)

export const get = (
  value: unknown,
  rawPath: string
): unknown => {
  if (!rawPath) {
    return value
  }

  const parts = splitPath(rawPath)
  let current: unknown = value
  for (const part of parts) {
    if (current == null || typeof current !== 'object') {
      return undefined
    }
    current = (current as PathContainer)[part]
  }
  return current
}

export const has = (
  value: unknown,
  rawPath: string
): boolean => get(value, rawPath) !== undefined

export const set = (
  value: unknown,
  rawPath: string,
  next: unknown
) => {
  if (!rawPath || value == null || typeof value !== 'object') {
    return
  }

  const parts = splitPath(rawPath)
  if (!parts.length) {
    return
  }

  let current = value as PathContainer
  for (let index = 0; index < parts.length - 1; index += 1) {
    const part = parts[index]!
    if (current[part] == null || typeof current[part] !== 'object') {
      current[part] = {}
    }
    current = current[part] as PathContainer
  }

  current[parts[parts.length - 1]!] = next
}

export const unset = (
  value: unknown,
  rawPath: string
): boolean => {
  if (!rawPath || value == null || typeof value !== 'object') {
    return false
  }

  const parts = splitPath(rawPath)
  if (!parts.length) {
    return false
  }

  let current = value as PathContainer
  for (let index = 0; index < parts.length - 1; index += 1) {
    const part = parts[index]!
    const next = current[part]
    if (next == null || typeof next !== 'object') {
      return false
    }
    current = next as PathContainer
  }

  const key = parts[parts.length - 1]!
  if (!(key in current)) {
    return false
  }

  delete current[key]
  return true
}
