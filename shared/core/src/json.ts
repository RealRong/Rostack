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

export const clone = <T,>(
  value: T
): T => {
  if (Array.isArray(value)) {
    return value.map((item) => clone(item)) as T
  }
  if (isPlainObject(value)) {
    const next: JsonObject = {}
    Object.keys(value).forEach((key) => {
      next[key] = clone(value[key])
    })
    return next as T
  }
  return value
}

export const merge = <T,>(
  base: T,
  override?: unknown
): T => {
  if (override === undefined || override === null) {
    return clone(base)
  }

  if (Array.isArray(base)) {
    if (!Array.isArray(override)) {
      return clone(base)
    }
    return clone(override as T)
  }

  if (isPlainObject(base)) {
    if (!isPlainObject(override)) {
      return clone(base)
    }

    const merged: JsonObject = {}
    const keys = new Set([
      ...Object.keys(base),
      ...Object.keys(override)
    ])

    keys.forEach((key) => {
      const baseValue = base[key]
      if (!hasOwn(override, key)) {
        merged[key] = clone(baseValue)
        return
      }

      const overrideValue = override[key]
      if (baseValue === undefined) {
        merged[key] = clone(overrideValue)
        return
      }

      merged[key] = merge(baseValue, overrideValue)
    })

    return merged as T
  }

  return clone(override as T)
}

export const equal = (
  left: unknown,
  right: unknown
): boolean => {
  if (Object.is(left, right)) {
    return true
  }

  if (Array.isArray(left) && Array.isArray(right)) {
    if (left.length !== right.length) {
      return false
    }

    for (let index = 0; index < left.length; index += 1) {
      if (!equal(left[index], right[index])) {
        return false
      }
    }

    return true
  }

  if (isPlainObject(left) && isPlainObject(right)) {
    const leftKeys = Object.keys(left).sort()
    const rightKeys = Object.keys(right).sort()
    if (leftKeys.length !== rightKeys.length) {
      return false
    }

    for (let index = 0; index < leftKeys.length; index += 1) {
      if (leftKeys[index] !== rightKeys[index]) {
        return false
      }
    }

    for (const key of leftKeys) {
      if (!equal(left[key], right[key])) {
        return false
      }
    }

    return true
  }

  return false
}

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
