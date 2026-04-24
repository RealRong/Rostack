export type PathKey = string | number
export type Path = readonly PathKey[]

const ROOT_PATH = Object.freeze([]) as Path

const clonePath = (
  keys: readonly PathKey[]
): Path => (
  keys.length
    ? [...keys]
    : ROOT_PATH
)

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
  ): string => JSON.stringify(value)
}
