import { cloneValue } from '@whiteboard/core/value'
import { getValueByPath, setValueByPath } from '@whiteboard/core/utils/objectPath'

type SetPathMutation = {
  op: 'set'
  path?: string
  value: unknown
}

type UnsetPathMutation = {
  op: 'unset'
  path: string
}

type SplicePathMutation = {
  op: 'splice'
  path: string
  index: number
  deleteCount: number
  values?: readonly unknown[]
}

type PathMutation =
  | SetPathMutation
  | UnsetPathMutation
  | SplicePathMutation

export const isRecordLike = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value)

export const isObjectContainer = (value: unknown): value is Record<string, unknown> | unknown[] =>
  isRecordLike(value) || Array.isArray(value)

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

  if (current !== undefined && !isObjectContainer(current)) {
    return {
      ok: false,
      message: `Cannot set path "${mutation.path}" on a non-object root.`
    }
  }

  const nextRoot = isObjectContainer(current)
    ? cloneValue(current)
    : {}

  const parts = mutation.path.split('.').filter(Boolean)
  let container: any = nextRoot
  for (let index = 0; index < parts.length - 1; index += 1) {
    const part = parts[index]
    const nextValue = container[part]
    if (nextValue == null) {
      container[part] = {}
      container = container[part]
      continue
    }
    if (!isObjectContainer(nextValue)) {
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
  if (!isObjectContainer(current)) {
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

  let container: any = nextRoot
  for (let index = 0; index < parts.length - 1; index += 1) {
    const part = parts[index]
    if (container == null || typeof container !== 'object' || !(part in container)) {
      return {
        ok: false,
        message: `Path "${mutation.path}" does not exist.`
      }
    }
    container = container[part]
  }

  const key = parts[parts.length - 1]
  if (container == null || typeof container !== 'object' || !(key in container)) {
    return {
      ok: false,
      message: `Path "${mutation.path}" does not exist.`
    }
  }
  if (Array.isArray(container)) {
    return {
      ok: false,
      message: `Cannot unset array item at path "${mutation.path}".`
    }
  }

  delete container[key]
  return {
    ok: true,
    value: nextRoot
  }
}

export const applySplicePathMutation = (
  current: unknown,
  mutation: SplicePathMutation
): { ok: true; value: unknown } | { ok: false; message: string } => {
  const nextRoot = isObjectContainer(current)
    ? cloneValue(current)
    : {}
  const target = getValueByPath(nextRoot, mutation.path)
  if (!Array.isArray(target)) {
    return {
      ok: false,
      message: `Path "${mutation.path}" is not an array.`
    }
  }

  target.splice(
    mutation.index,
    mutation.deleteCount,
    ...(mutation.values ? cloneValue([...mutation.values]) : [])
  )

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
  if (mutation.op === 'unset') {
    return applyUnsetPathMutation(current, mutation)
  }
  return applySplicePathMutation(current, mutation)
}
