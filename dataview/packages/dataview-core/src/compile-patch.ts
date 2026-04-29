import {
  equal
} from '@shared/core'

const NO_CHANGE = Symbol('no-change')

const isObjectRecord = (
  value: unknown
): value is Record<string, unknown> => (
  typeof value === 'object'
  && value !== null
  && !Array.isArray(value)
)

const diffValue = (
  current: unknown,
  next: unknown
): unknown | typeof NO_CHANGE => {
  if (equal.sameJsonValue(current, next)) {
    return NO_CHANGE
  }

  if (isObjectRecord(current) && isObjectRecord(next)) {
    const patch: Record<string, unknown> = {}
    const keys = new Set([
      ...Object.keys(current),
      ...Object.keys(next)
    ])

    keys.forEach((key) => {
      const change = diffValue(current[key], next[key])
      if (change !== NO_CHANGE) {
        patch[key] = change
      }
    })

    return Object.keys(patch).length
      ? patch
      : NO_CHANGE
  }

  return structuredClone(next)
}

export const createEntityPatch = <T extends {
  id: string
}>(
  current: T,
  next: T
): Partial<Omit<T, 'id'>> => {
  const patch: Record<string, unknown> = {}
  const keys = new Set([
    ...Object.keys(current),
    ...Object.keys(next)
  ])

  keys.delete('id')
  keys.forEach((key) => {
    const change = diffValue(current[key], next[key])
    if (change !== NO_CHANGE) {
      patch[key] = change
    }
  })

  return patch
}
