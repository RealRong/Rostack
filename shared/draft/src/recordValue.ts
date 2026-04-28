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

export type RecordWrite = Readonly<Record<Path, unknown>>

const isObjectRecord = (
  value: unknown
): value is Record<string, unknown> => (
  typeof value === 'object'
  && value !== null
  && !Array.isArray(value)
)

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
  base: Path = path.root()
): void => {
  if (equal.sameJsonValue(current, next)) {
    return
  }

  if (isObjectRecord(current) && isObjectRecord(next)) {
    const keys = new Set([
      ...Object.keys(current),
      ...Object.keys(next)
    ])

    keys.forEach((key) => {
      collectChangedWrites(
        current[key],
        next[key],
        target,
        appendPath(base, key)
      )
    })
    return
  }

  if (!base) {
    throw new Error('draft.record.diff requires an object root.')
  }

  target[base] = next === undefined
    ? undefined
    : json.clone(next)
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
      const result = patch.apply(current, value === undefined
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
          : undefined
      })

    return Object.freeze(inverse)
  }
} as const
