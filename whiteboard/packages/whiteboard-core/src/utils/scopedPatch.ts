import { json } from '@shared/core'
import type { RecordWrite } from '@shared/draft'

const isObjectRecord = (
  value: unknown
): value is Record<string, unknown> => (
  typeof value === 'object'
  && value !== null
  && !Array.isArray(value)
)

const appendPath = (
  base: string,
  key: string
): string => base
  ? `${base}.${key}`
  : key

const collectRecordWrites = (
  value: unknown,
  basePath: string,
  target: Record<string, unknown>
): void => {
  if (!isObjectRecord(value)) {
    target[basePath] = json.clone(value)
    return
  }

  const keys = Object.keys(value)
  if (keys.length === 0) {
    return
  }

  keys.forEach((key) => {
    collectRecordWrites(value[key], appendPath(basePath, key), target)
  })
}

const setNestedPatchValue = (
  target: Record<string, unknown>,
  path: readonly string[],
  value: unknown
): void => {
  const [head, ...rest] = path
  if (!head) {
    return
  }

  if (rest.length === 0) {
    target[head] = json.clone(value)
    return
  }

  const current = target[head]
  const next = isObjectRecord(current)
    ? current
    : {}
  target[head] = next
  setNestedPatchValue(next, rest, value)
}

const compactRecordWrite = (
  target: Record<string, unknown>
): RecordWrite | undefined => Object.keys(target).length
  ? Object.freeze(target)
  : undefined

const readScopedRecordWrite = (
  patch: Record<string, unknown>,
  scopes: readonly string[]
): RecordWrite | undefined => {
  const writes: Record<string, unknown> = {}

  scopes.forEach((scope) => {
    if (!Object.hasOwn(patch, scope)) {
      return
    }

    const value = patch[scope]
    if (value === undefined) {
      writes[scope] = undefined
      return
    }

    collectRecordWrites(value, scope, writes)
  })

  return compactRecordWrite(writes)
}

export const applyScopedRecordWriteToPatch = <TPatch extends Record<string, unknown>>(
  patch: TPatch,
  record: RecordWrite | undefined,
  scopes: readonly string[]
): TPatch => {
  if (!record) {
    return patch
  }

  const target: Record<string, unknown> = patch
  Object.entries(record).forEach(([path, value]) => {
    const [scope, ...rest] = path.split('.')
    if (!scope || !scopes.includes(scope)) {
      return
    }

    if (rest.length === 0) {
      target[scope] = json.clone(value)
      return
    }

    const current = target[scope]
    const next = isObjectRecord(current)
      ? current
      : {}
    target[scope] = next
    setNestedPatchValue(next, rest, value)
  })

  return patch
}

export const splitScopedPatch = (
  patch: Record<string, unknown>,
  scopes: readonly string[]
): {
  fields?: Record<string, unknown>
  record?: RecordWrite
} => {
  const fields: Record<string, unknown> = {}
  Object.entries(patch).forEach(([key, value]) => {
    if (!scopes.includes(key)) {
      fields[key] = value
    }
  })
  const record = readScopedRecordWrite(patch, scopes)

  return {
    ...(Object.keys(fields).length ? { fields } : {}),
    ...(record ? { record } : {})
  }
}
