import { json } from '@shared/core'
import {
  path,
  type Path
} from './path'
import {
  root as createRoot
} from './root'

type SetRecordPatch = {
  op: 'set'
  path?: Path
  value: unknown
}

type UnsetRecordPatch = {
  op: 'unset'
  path: Path
}

export type RecordPatch =
  | SetRecordPatch
  | UnsetRecordPatch

const isRecordLike = (
  value: unknown
): value is Record<string | number, unknown> => (
  typeof value === 'object'
  && value !== null
  && !Array.isArray(value)
)

const readOwn = (
  value: Record<string | number, unknown>,
  key: string | number
): unknown => value[key]

const hasOwn = (
  value: Record<string | number, unknown>,
  key: string | number
): boolean => Object.prototype.hasOwnProperty.call(value, key)

const displayPath = (
  value: Path
): string => path.toString(value)

const validateSetPath = (
  current: Record<string | number, unknown>,
  targetPath: Path
): { ok: true } | { ok: false; message: string } => {
  let cursor: unknown = current

  for (let index = 0; index < targetPath.length - 1; index += 1) {
    if (!isRecordLike(cursor)) {
      return {
        ok: false,
        message: `Cannot set path ${displayPath(targetPath)} through a non-object container.`
      }
    }

    const next = readOwn(cursor, targetPath[index]!)
    if (next == null) {
      return {
        ok: true
      }
    }

    if (!isRecordLike(next)) {
      return {
        ok: false,
        message: `Cannot set path ${displayPath(targetPath)} through a non-object container.`
      }
    }

    cursor = next
  }

  return {
    ok: true
  }
}

const validateUnsetPath = (
  current: Record<string | number, unknown>,
  targetPath: Path
): { ok: true } | { ok: false; message: string } => {
  let cursor: Record<string | number, unknown> = current

  for (let index = 0; index < targetPath.length - 1; index += 1) {
    const next = readOwn(cursor, targetPath[index]!)
    if (!isRecordLike(next)) {
      return {
        ok: false,
        message: `Path ${displayPath(targetPath)} does not exist.`
      }
    }

    cursor = next
  }

  const key = targetPath[targetPath.length - 1]!
  if (!hasOwn(cursor, key)) {
    return {
      ok: false,
      message: `Path ${displayPath(targetPath)} does not exist.`
    }
  }

  return {
    ok: true
  }
}

const read = (
  root: unknown,
  targetPath: Path
): unknown => path.get(root, targetPath)

const has = (
  root: unknown,
  targetPath: Path
): boolean => path.get(root, targetPath) !== undefined

const apply = (
  current: unknown,
  mutation: RecordPatch
): { ok: true; value: unknown } | { ok: false; message: string } => {
  if (mutation.op === 'set') {
    const targetPath = mutation.path ?? path.root()
    if (targetPath.length === 0) {
      return {
        ok: true,
        value: json.clone(mutation.value)
      }
    }

    if (current !== undefined && !isRecordLike(current)) {
      return {
        ok: false,
        message: `Cannot set path ${displayPath(targetPath)} on a non-object root.`
      }
    }

    const root = isRecordLike(current)
      ? current
      : {}
    const validation = validateSetPath(root, targetPath)
    if (!validation.ok) {
      return validation
    }

    const rootDraft = createRoot<Record<string | number, unknown>>(root)
    path.set(
      rootDraft.write(),
      targetPath,
      json.clone(mutation.value)
    )
    return {
      ok: true,
      value: rootDraft.finish()
    }
  }

  const targetPath = mutation.path
  if (!targetPath.length) {
    return {
      ok: false,
      message: 'Unset path is required.'
    }
  }

  if (!isRecordLike(current)) {
    return {
      ok: false,
      message: `Cannot unset path ${displayPath(targetPath)} from a non-object root.`
    }
  }

  const validation = validateUnsetPath(current, targetPath)
  if (!validation.ok) {
    return validation
  }

  const rootDraft = createRoot<Record<string | number, unknown>>(current)
  path.unset(rootDraft.write(), targetPath)
  return {
    ok: true,
    value: rootDraft.finish()
  }
}

export const patch = {
  read,
  has,
  apply
} as const
