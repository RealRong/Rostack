import { key } from '@shared/spec'

export type PathKey = string | number
export type Path = string

const ROOT_PATH = ''
const pathCodec = key.path()

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

const readParts = (
  value: Path
): readonly string[] => pathCodec.read(value)

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
  const parts = readParts(path)
  if (!parts.length) {
    return root
  }

  let current = root
  for (const key of parts) {
    if (!isObjectLike(current)) {
      return undefined
    }

    current = readKey(current, key)
  }

  return current
}

const has = (
  root: unknown,
  path: Path
): boolean => {
  const parts = readParts(path)
  if (!parts.length) {
    return root !== undefined
  }

  let current = root
  for (let index = 0; index < parts.length - 1; index += 1) {
    if (!isObjectLike(current)) {
      return false
    }

    current = readKey(current, parts[index]!)
  }

  if (!isObjectLike(current)) {
    return false
  }

  const key = parts[parts.length - 1]!
  return Array.isArray(current) && /^\d+$/.test(String(key))
    ? Number(key) in current
    : Object.prototype.hasOwnProperty.call(current, String(key))
}

const set = (
  root: unknown,
  path: Path,
  value: unknown
) => {
  const parts = readParts(path)
  if (!parts.length || !isObjectLike(root)) {
    return
  }

  let current = root as Record<PropertyKey, unknown> | unknown[]
  for (let index = 0; index < parts.length - 1; index += 1) {
    current = ensureWritableChild(
      current,
      parts[index]!,
      parts[index + 1]
    )
  }

  writeKey(current, parts[parts.length - 1]!, value)
}

const unset = (
  root: unknown,
  path: Path
) => {
  const parts = readParts(path)
  if (!parts.length || !isObjectLike(root)) {
    return
  }

  let current = root as Record<PropertyKey, unknown> | unknown[]
  for (let index = 0; index < parts.length - 1; index += 1) {
    const key = parts[index]!
    const next = readKey(current, key)
    if (!isObjectLike(next)) {
      return
    }

    const writable = cloneContainer(next)
    writeKey(current, key, writable)
    current = writable
  }

  const key = parts[parts.length - 1]!
  const index = Number(key)
  if (Array.isArray(current) && Number.isInteger(index)) {
    if (index < 0 || index >= current.length) {
      return
    }
    current.splice(index, 1)
    return
  }

  delete (current as Record<string, unknown>)[String(key)]
}

const eq = (
  left: Path,
  right: Path
): boolean => left === right

const startsWith = (
  value: Path,
  prefix: Path
): boolean => {
  const valueParts = readParts(value)
  const prefixParts = readParts(prefix)
  if (prefixParts.length > valueParts.length) {
    return false
  }

  for (let index = 0; index < prefixParts.length; index += 1) {
    if (valueParts[index] !== prefixParts[index]) {
      return false
    }
  }

  return true
}

export const path = {
  root: (): Path => ROOT_PATH,
  of: (...keys: readonly PathKey[]): Path => pathCodec.write(keys),
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
      ? pathCodec.write([...readParts(value), ...keys])
      : value
  ),
  parent: (
  value: Path
  ): Path | undefined => {
    const parts = readParts(value)
    if (!parts.length) {
      return undefined
    }

    return parts.length === 1
      ? ROOT_PATH
      : pathCodec.write(parts.slice(0, -1))
  },
  toString: (
    value: Path
  ): string => value,
  parts: readParts,
  get,
  has,
  set,
  unset,
  setAt: <T>(
    root: T,
    targetPath: Path,
    value: unknown
  ): T => {
    if (!targetPath) {
      return value as T
    }

    const nextRoot = isObjectLike(root)
      ? cloneContainer(root as Record<PropertyKey, unknown> | unknown[]) as T
      : {} as T
    set(nextRoot, targetPath, value)
    return nextRoot
  },
  unsetAt: <T>(
    root: T,
    targetPath: Path
  ): T => {
    if (!targetPath || !isObjectLike(root)) {
      return root
    }

    const nextRoot = cloneContainer(root as Record<PropertyKey, unknown> | unknown[]) as T
    unset(nextRoot, targetPath)
    return nextRoot
  }
} as const
