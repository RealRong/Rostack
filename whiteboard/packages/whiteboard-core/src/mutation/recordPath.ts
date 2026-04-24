import { json } from '@shared/core'
import {
  cowDraft,
  draftPath,
  path as mutationPath,
  type Path
} from '@shared/mutation'

type SetRecordPathMutation = {
  op: 'set'
  path?: Path
  value: unknown
}

type UnsetRecordPathMutation = {
  op: 'unset'
  path: Path
}

export type RecordPathMutation =
  | SetRecordPathMutation
  | UnsetRecordPathMutation

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
): string => mutationPath.toString(value)

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

export const readRecordPath = (
  root: unknown,
  targetPath: Path
): unknown => draftPath.get(root, targetPath)

export const hasRecordPath = (
  root: unknown,
  targetPath: Path
): boolean => draftPath.has(root, targetPath)

export const applyRecordPathMutation = (
  current: unknown,
  mutation: RecordPathMutation
): { ok: true; value: unknown } | { ok: false; message: string } => {
  if (mutation.op === 'set') {
    const targetPath = mutation.path ?? mutationPath.root()
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

    const draft = cowDraft.create<Record<string | number, unknown>>()(root)
    draftPath.set(
      draft.write(),
      targetPath,
      json.clone(mutation.value)
    )
    return {
      ok: true,
      value: draft.done()
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

  const draft = cowDraft.create<Record<string | number, unknown>>()(current)
  draftPath.unset(draft.write(), targetPath)
  return {
    ok: true,
    value: draft.done()
  }
}
