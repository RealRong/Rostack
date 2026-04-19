import { cloneValue } from '@whiteboard/core/value'
import { setValueByPath } from '@whiteboard/core/utils/objectPath'

type SetPathMutation = {
  op: 'set'
  path?: string
  value: unknown
}

type UnsetPathMutation = {
  op: 'unset'
  path: string
}

type PathMutation =
  | SetPathMutation
  | UnsetPathMutation

export const isRecordLike = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value)

export const applySetPathMutation = (
  current: unknown,
  mutation: SetPathMutation
): { ok: true; value: unknown } | { ok: false; message: string } => {
  if (!mutation.path) {
    return {
      ok: true,
      value: cloneValue(mutation.value)
    }
  }

  if (current !== undefined && !isRecordLike(current)) {
    return {
      ok: false,
      message: `Cannot set path "${mutation.path}" on a non-object root.`
    }
  }

  const nextRoot = isRecordLike(current)
    ? cloneValue(current)
    : {}

  const parts = mutation.path.split('.').filter(Boolean)
  let container: Record<string, unknown> = nextRoot
  for (let index = 0; index < parts.length - 1; index += 1) {
    const part = parts[index]!
    const nextValue = container[part]
    if (nextValue == null) {
      container[part] = {}
      container = container[part] as Record<string, unknown>
      continue
    }
    if (!isRecordLike(nextValue)) {
      return {
        ok: false,
        message: `Cannot set path "${mutation.path}" through a non-object container.`
      }
    }
    container = nextValue
  }

  setValueByPath(nextRoot, mutation.path, cloneValue(mutation.value))
  return {
    ok: true,
    value: nextRoot
  }
}

export const applyUnsetPathMutation = (
  current: unknown,
  mutation: UnsetPathMutation
): { ok: true; value: unknown } | { ok: false; message: string } => {
  if (!isRecordLike(current)) {
    return {
      ok: false,
      message: `Cannot unset path "${mutation.path}" from a non-object root.`
    }
  }

  const nextRoot = cloneValue(current)
  const parts = mutation.path.split('.').filter(Boolean)
  if (!parts.length) {
    return {
      ok: false,
      message: 'Unset path is required.'
    }
  }

  let container: Record<string, unknown> = nextRoot
  for (let index = 0; index < parts.length - 1; index += 1) {
    const part = parts[index]!
    const nextValue = container[part]
    if (!isRecordLike(nextValue)) {
      return {
        ok: false,
        message: `Path "${mutation.path}" does not exist.`
      }
    }
    container = nextValue
  }

  const key = parts[parts.length - 1]!
  if (!(key in container)) {
    return {
      ok: false,
      message: `Path "${mutation.path}" does not exist.`
    }
  }

  delete container[key]
  return {
    ok: true,
    value: nextRoot
  }
}

export const applyPathMutation = (
  current: unknown,
  mutation: PathMutation
): { ok: true; value: unknown } | { ok: false; message: string } => {
  if (mutation.op === 'set') {
    return applySetPathMutation(current, mutation)
  }
  return applyUnsetPathMutation(current, mutation)
}
