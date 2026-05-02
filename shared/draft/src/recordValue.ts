import {
  equal,
  json
} from '@shared/core'
import {
  patch
} from './patch'
import {
  path,
  type Path
} from './path'

export type RecordUnsetValue = {
  readonly kind: 'draft.record.unset'
}

export type RecordWriteValue = unknown | RecordUnsetValue

export type RecordWrite = Readonly<Record<Path, RecordWriteValue>>

const RECORD_UNSET_VALUE: RecordUnsetValue = Object.freeze({
  kind: 'draft.record.unset'
})

export const unsetRecordWrite = (): RecordUnsetValue => RECORD_UNSET_VALUE

export const isUnsetRecordWrite = (
  value: unknown
): value is RecordUnsetValue => Boolean(
  value
  && typeof value === 'object'
  && !Array.isArray(value)
  && (value as {
    kind?: unknown
  }).kind === 'draft.record.unset'
)

const isObjectRecord = (
  value: unknown
): value is Record<string, unknown> => (
  typeof value === 'object'
  && value !== null
  && !Array.isArray(value)
)

const hasOwn = (
  value: Record<string, unknown>,
  key: string
): boolean => Object.prototype.hasOwnProperty.call(value, key)

const appendPath = (
  base: Path,
  key: string
): Path => base
  ? path.append(base, key)
  : path.of(key)

const collectChangedWrites = (
  current: unknown,
  next: unknown,
  target: Record<string, unknown>,
  base: Path = path.root(),
  currentExists = true,
  nextExists = true
): void => {
  if (currentExists === nextExists && equal.sameJsonValue(current, next)) {
    return
  }

  if (currentExists && nextExists && isObjectRecord(current) && isObjectRecord(next)) {
    const keys = new Set([
      ...Object.keys(current),
      ...Object.keys(next)
    ])

    keys.forEach((key) => {
      const leftExists = hasOwn(current, key)
      const rightExists = hasOwn(next, key)
      collectChangedWrites(
        leftExists
          ? current[key]
          : undefined,
        rightExists
          ? next[key]
          : undefined,
        target,
        appendPath(base, key),
        leftExists,
        rightExists
      )
    })
    return
  }

  if (!base) {
    throw new Error('draft.record.diff requires an object root.')
  }

  if (!nextExists) {
    target[base] = unsetRecordWrite()
    return
  }

  target[base] = json.clone(next)
}

export const record = {
  read: (
    target: unknown,
    targetPath: Path
  ): unknown => path.get(target, targetPath),
  has: (
    target: unknown,
    targetPath: Path
  ): boolean => path.has(target, targetPath),
  apply: <T>(
    target: T,
    writes: RecordWrite
  ): T => {
    let current: unknown = target
    const entries = Object.entries(writes)
      .sort(([left], [right]) => path.parts(left).length - path.parts(right).length)

    entries.forEach(([targetPath, value]) => {
      const result = patch.apply(current, isUnsetRecordWrite(value)
        ? {
            op: 'unset',
            path: targetPath
          }
        : {
            op: 'set',
            path: targetPath,
            value: json.clone(value)
          })

      if (!result.ok) {
        throw new Error(result.message)
      }

      current = result.value
    })

    return current as T
  },
  diff: <T extends object>(
    current: T,
    next: T
  ): RecordWrite => {
    const writes: Record<string, unknown> = {}
    collectChangedWrites(current, next, writes)
    return Object.freeze(writes)
  },
  inverse: (
    current: unknown,
    writes: RecordWrite
  ): RecordWrite => {
    const inverse: Record<string, unknown> = {}

    Object.keys(writes)
      .sort((left, right) => path.parts(left).length - path.parts(right).length)
      .forEach((targetPath) => {
        if (Object.keys(inverse).some((existing) => path.startsWith(targetPath, existing))) {
          return
        }

        inverse[targetPath] = path.has(current, targetPath)
          ? json.clone(path.get(current, targetPath))
          : unsetRecordWrite()
      })

    return Object.freeze(inverse)
  }
} as const
