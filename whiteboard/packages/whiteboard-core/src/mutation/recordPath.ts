import { json } from '@shared/core'
import {
  cowDraft,
  draftPath,
  path as mutationPath,
  type Path
} from '@shared/mutation'

type SetRecordPathMutation = {
  op: 'set'
  path?: string
  value: unknown
}

type UnsetRecordPathMutation = {
  op: 'unset'
  path: string
}

export type RecordPathMutation =
  | SetRecordPathMutation
  | UnsetRecordPathMutation

const isRecordLike = (
  value: unknown
): value is Record<string, unknown> => (
  typeof value === 'object'
  && value !== null
  && !Array.isArray(value)
)

const toRecordPath = (
  rawPath: string
): Path => {
  const parts = rawPath
    .split('.')
    .filter(Boolean)

  return parts.length
    ? mutationPath.of(...parts)
    : mutationPath.root()
}

const readOwn = (
  value: Record<string, unknown>,
  key: string
): unknown => value[key]

const hasOwn = (
  value: Record<string, unknown>,
  key: string
): boolean => Object.prototype.hasOwnProperty.call(value, key)

const validateSetPath = (
  current: Record<string, unknown>,
  rawPath: string,
  path: Path
): { ok: true } | { ok: false; message: string } => {
  let cursor: unknown = current

  for (let index = 0; index < path.length - 1; index += 1) {
    if (!isRecordLike(cursor)) {
      return {
        ok: false,
        message: `Cannot set path "${rawPath}" through a non-object container.`
      }
    }

    const next = readOwn(cursor, path[index] as string)
    if (next == null) {
      return {
        ok: true
      }
    }

    if (!isRecordLike(next)) {
      return {
        ok: false,
        message: `Cannot set path "${rawPath}" through a non-object container.`
      }
    }

    cursor = next
  }

  return {
    ok: true
  }
}

const validateUnsetPath = (
  current: Record<string, unknown>,
  rawPath: string,
  path: Path
): { ok: true } | { ok: false; message: string } => {
  let cursor: Record<string, unknown> = current

  for (let index = 0; index < path.length - 1; index += 1) {
    const next = readOwn(cursor, path[index] as string)
    if (!isRecordLike(next)) {
      return {
        ok: false,
        message: `Path "${rawPath}" does not exist.`
      }
    }

    cursor = next
  }

  const key = path[path.length - 1] as string
  if (!hasOwn(cursor, key)) {
    return {
      ok: false,
      message: `Path "${rawPath}" does not exist.`
    }
  }

  return {
    ok: true
  }
}

export const readRecordPath = (
  root: unknown,
  rawPath: string
): unknown => draftPath.get(root, toRecordPath(rawPath))

export const hasRecordPath = (
  root: unknown,
  rawPath: string
): boolean => draftPath.has(root, toRecordPath(rawPath))

export const applyRecordPathMutation = (
  current: unknown,
  mutation: RecordPathMutation
): { ok: true; value: unknown } | { ok: false; message: string } => {
  if (mutation.op === 'set') {
    const rawPath = mutation.path ?? ''
    if (!rawPath) {
      return {
        ok: true,
        value: json.clone(mutation.value)
      }
    }

    const path = toRecordPath(rawPath)
    if (current !== undefined && !isRecordLike(current)) {
      return {
        ok: false,
        message: `Cannot set path "${rawPath}" on a non-object root.`
      }
    }

    const root = isRecordLike(current)
      ? current
      : {}
    const validation = validateSetPath(root, rawPath, path)
    if (!validation.ok) {
      return validation
    }

    const draft = cowDraft.create<Record<string, unknown>>()(root)
    draftPath.set(
      draft.write(),
      path,
      json.clone(mutation.value)
    )
    return {
      ok: true,
      value: draft.done()
    }
  }

  const rawPath = mutation.path
  const path = toRecordPath(rawPath)
  if (!path.length) {
    return {
      ok: false,
      message: 'Unset path is required.'
    }
  }

  if (!isRecordLike(current)) {
    return {
      ok: false,
      message: `Cannot unset path "${rawPath}" from a non-object root.`
    }
  }

  const validation = validateUnsetPath(current, rawPath, path)
  if (!validation.ok) {
    return validation
  }

  const draft = cowDraft.create<Record<string, unknown>>()(current)
  draftPath.unset(draft.write(), path)
  return {
    ok: true,
    value: draft.done()
  }
}
