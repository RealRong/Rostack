type UnknownRecord = Record<string, unknown>

const isPlainObject = (value: unknown): value is UnknownRecord => {
  if (typeof value !== 'object' || value === null) return false
  const prototype = Object.getPrototypeOf(value)
  return prototype === Object.prototype || prototype === null
}

const hasOwn = (value: UnknownRecord, key: string) =>
  Object.prototype.hasOwnProperty.call(value, key)

export const cloneValue = <T,>(value: T): T => {
  if (Array.isArray(value)) {
    return value.map((item) => cloneValue(item)) as T
  }
  if (isPlainObject(value)) {
    const next: UnknownRecord = {}
    Object.keys(value).forEach((key) => {
      next[key] = cloneValue(value[key])
    })
    return next as T
  }
  return value
}

export const mergeValue = <T,>(base: T, override?: unknown): T => {
  if (override === undefined || override === null) {
    return cloneValue(base)
  }

  if (Array.isArray(base)) {
    if (!Array.isArray(override)) return cloneValue(base)
    return cloneValue(override as T)
  }

  if (isPlainObject(base)) {
    if (!isPlainObject(override)) return cloneValue(base)

    const baseRecord = base as UnknownRecord
    const overrideRecord = override as UnknownRecord
    const merged: UnknownRecord = {}
    const keys = new Set([...Object.keys(baseRecord), ...Object.keys(overrideRecord)])

    keys.forEach((key) => {
      const baseValue = baseRecord[key]
      if (!hasOwn(overrideRecord, key)) {
        merged[key] = cloneValue(baseValue)
        return
      }

      const overrideValue = overrideRecord[key]
      if (baseValue === undefined) {
        merged[key] = cloneValue(overrideValue)
        return
      }

      merged[key] = mergeValue(baseValue, overrideValue)
    })

    return merged as T
  }

  return cloneValue(override as T)
}

export const isValueEqual = (left: unknown, right: unknown): boolean => {
  if (Object.is(left, right)) {
    return true
  }

  if (Array.isArray(left) && Array.isArray(right)) {
    if (left.length !== right.length) {
      return false
    }
    for (let index = 0; index < left.length; index += 1) {
      if (!isValueEqual(left[index], right[index])) {
        return false
      }
    }
    return true
  }

  if (isPlainObject(left) && isPlainObject(right)) {
    const leftKeys = Object.keys(left)
    const rightKeys = Object.keys(right)
    if (leftKeys.length !== rightKeys.length) {
      return false
    }

    for (const key of leftKeys) {
      if (!hasOwn(right, key)) {
        return false
      }
      if (!isValueEqual(left[key], right[key])) {
        return false
      }
    }
    return true
  }

  return false
}
