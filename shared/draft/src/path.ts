export type PathKey = string | number
export type Path = readonly PathKey[]

const cloneContainer = <T extends Record<PropertyKey, unknown> | unknown[]>(
  value: T
): T => (
  Array.isArray(value)
    ? [...value] as T
    : {
        ...value
      } as T
)

const isObjectLike = (
  value: unknown
): value is Record<PropertyKey, unknown> | unknown[] => (
  typeof value === 'object'
  && value !== null
)

const readKey = (
  container: Record<PropertyKey, unknown> | unknown[],
  key: PathKey
): unknown => (
  Array.isArray(container) && typeof key === 'number'
    ? container[key]
    : (container as Record<string, unknown>)[String(key)]
)

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
    if (key < 0 || key >= current.length) {
      return
    }
    current.splice(key, 1)
    return
  }

  delete (current as Record<string, unknown>)[String(key)]
}

export const path = {
  get,
  set,
  unset
} as const
