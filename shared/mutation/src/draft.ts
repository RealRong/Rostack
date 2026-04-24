import type { Path, PathKey } from './path'

export interface Draft<Doc> {
  readonly base: Doc
  doc(): Doc
  write(): Doc
  done(): Doc
}

export type DraftFactory<Doc> = (
  doc: Doc
) => Draft<Doc>

const isObjectLike = (
  value: unknown
): value is Record<PropertyKey, unknown> | unknown[] => (
  typeof value === 'object'
  && value !== null
)

const cloneContainer = <T>(
  value: T
): T => {
  if (Array.isArray(value)) {
    return [...value] as T
  }

  return {
    ...(value as Record<PropertyKey, unknown>)
  } as T
}

const readKey = (
  container: Record<PropertyKey, unknown> | unknown[],
  key: PathKey
): unknown => {
  if (Array.isArray(container) && typeof key === 'number') {
    return container[key]
  }

  return (container as Record<string, unknown>)[String(key)]
}

const writeKey = (
  container: Record<PropertyKey, unknown> | unknown[],
  key: PathKey,
  value: unknown
) => {
  if (Array.isArray(container) && typeof key === 'number') {
    container[key] = value
    return
  }

  ;(container as Record<string, unknown>)[String(key)] = value
}

const ensureWritableChild = (
  container: Record<PropertyKey, unknown> | unknown[],
  key: PathKey,
  nextKey: PathKey | undefined
): Record<PropertyKey, unknown> | unknown[] => {
  const current = readKey(container, key)
  const child = isObjectLike(current)
    ? cloneContainer(current)
    : typeof nextKey === 'number'
      ? []
      : {}

  writeKey(container, key, child)
  return child
}

const get = (
  root: unknown,
  path: Path
): unknown => {
  if (!path.length) {
    return root
  }

  let current = root
  for (const key of path) {
    if (!isObjectLike(current)) {
      return undefined
    }

    current = readKey(current, key)
  }

  return current
}

const set = (
  root: unknown,
  path: Path,
  value: unknown
) => {
  if (!path.length || !isObjectLike(root)) {
    return
  }

  let current = root as Record<PropertyKey, unknown> | unknown[]
  for (let index = 0; index < path.length - 1; index += 1) {
    current = ensureWritableChild(
      current,
      path[index]!,
      path[index + 1]
    )
  }

  writeKey(current, path[path.length - 1]!, value)
}

const unset = (
  root: unknown,
  path: Path
) => {
  if (!path.length || !isObjectLike(root)) {
    return
  }

  let current = root as Record<PropertyKey, unknown> | unknown[]
  for (let index = 0; index < path.length - 1; index += 1) {
    const key = path[index]!
    const next = readKey(current, key)
    if (!isObjectLike(next)) {
      return
    }

    const writable = cloneContainer(next)
    writeKey(current, key, writable)
    current = writable
  }

  const key = path[path.length - 1]!
  if (Array.isArray(current) && typeof key === 'number') {
    current.splice(key, 1)
    return
  }

  delete (current as Record<string, unknown>)[String(key)]
}

export const cowDraft = {
  create: <Doc extends object>(): DraftFactory<Doc> => (
    doc: Doc
  ): Draft<Doc> => {
    let current = doc
    let written = false

    const write = (): Doc => {
      if (!written) {
        current = cloneContainer(doc)
        written = true
      }

      return current
    }

    return {
      base: doc,
      doc: () => current,
      write,
      done: () => current
    }
  }
}

export const draftPath = {
  get,
  has: (
    root: unknown,
    path: Path
  ): boolean => get(root, path) !== undefined,
  set,
  unset
}

export const draftList = {
  insertAt: <T>(
    list: T[],
    index: number,
    value: T
  ) => {
    const nextIndex = Math.max(0, Math.min(index, list.length))
    list.splice(nextIndex, 0, value)
  },
  remove: <T>(
    list: T[],
    index: number
  ) => {
    if (index < 0 || index >= list.length) {
      return
    }

    list.splice(index, 1)
  },
  move: <T>(
    list: T[],
    from: number,
    to: number
  ) => {
    if (
      from < 0
      || from >= list.length
      || from === to
    ) {
      return
    }

    const target = Math.max(0, Math.min(to, list.length - 1))
    const [value] = list.splice(from, 1)
    list.splice(target, 0, value!)
  }
}
