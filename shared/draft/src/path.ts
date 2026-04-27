export type PathKey = string | number
export type Path = readonly PathKey[]

const ROOT_PATH: Path = Object.freeze([])

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

const clonePath = (
  keys: readonly PathKey[]
): Path => (
  keys.length
    ? [...keys]
    : ROOT_PATH
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

const eq = (
  left: Path,
  right: Path
): boolean => {
  if (left.length !== right.length) {
    return false
  }

  for (let index = 0; index < left.length; index += 1) {
    if (left[index] !== right[index]) {
      return false
    }
  }

  return true
}

const startsWith = (
  value: Path,
  prefix: Path
): boolean => {
  if (prefix.length > value.length) {
    return false
  }

  for (let index = 0; index < prefix.length; index += 1) {
    if (value[index] !== prefix[index]) {
      return false
    }
  }

  return true
}

export const path = {
  root: (): Path => ROOT_PATH,
  of: (...keys: readonly PathKey[]): Path => clonePath(keys),
  eq,
  startsWith,
  overlaps: (
    left: Path,
    right: Path
  ): boolean => (
    startsWith(left, right)
    || startsWith(right, left)
  ),
  append: (
    value: Path,
    ...keys: readonly PathKey[]
  ): Path => (
    keys.length
      ? [...value, ...keys]
      : value
  ),
  parent: (
    value: Path
  ): Path | undefined => {
    if (!value.length) {
      return undefined
    }

    return value.length === 1
      ? ROOT_PATH
      : value.slice(0, -1)
  },
  toString: (
    value: Path
  ): string => JSON.stringify(value),
  get,
  set,
  unset
} as const
