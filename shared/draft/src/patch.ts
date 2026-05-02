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

const displayPath = (
  value: Path
): string => path.toString(value)

const validateSetPath = (
  current: Record<string | number, unknown>,
  targetPath: Path
): { ok: true } | { ok: false; message: string } => {
  const parts = path.parts(targetPath)
  let cursor: unknown = current

  for (let index = 0; index < parts.length - 1; index += 1) {
    if (!isRecordLike(cursor)) {
      return {
        ok: false,
        message: `Cannot set path ${displayPath(targetPath)} through a non-object container.`
      }
    }

    const next = readOwn(cursor, parts[index]!)
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

const read = (
  root: unknown,
  targetPath: Path
): unknown => path.get(root, targetPath)

const has = (
  root: unknown,
  targetPath: Path
): boolean => path.has(root, targetPath)

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
      ok: true,
      value: current
    }
  }

  if (!has(current, targetPath)) {
    return {
      ok: true,
      value: current
    }
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
