const cloneContainer = <T extends object>(
  value: T
): T => (
  Array.isArray(value)
    ? [...value] as T
    : {
        ...(value as Record<PropertyKey, unknown>)
      } as T
)

const hasSameShallowEntries = <T extends object>(
  left: T,
  right: T
): boolean => {
  const leftKeys = Object.keys(left)
  const rightKeys = Object.keys(right)
  if (leftKeys.length !== rightKeys.length) {
    return false
  }

  for (const key of leftKeys) {
    if (!Object.prototype.hasOwnProperty.call(right, key)) {
      return false
    }
    if (!Object.is(
      (left as Record<string, unknown>)[key],
      (right as Record<string, unknown>)[key]
    )) {
      return false
    }
  }

  return true
}

export interface DraftRoot<Doc extends object> {
  readonly base: Doc

  current(): Doc
  write(): Doc
  replace(doc: Doc): void

  changed(): boolean
  finish(): Doc
}

export const root = <Doc extends object>(
  base: Doc
): DraftRoot<Doc> => {
  let current = base
  let hasChanges = false
  let replaced = false

  const finishCurrent = (): Doc => {
    if (!hasChanges) {
      return base
    }
    if (!replaced && hasSameShallowEntries(current, base)) {
      return base
    }
    return current
  }

  return {
    base,
    current: () => current,
    write: () => {
      if (!hasChanges) {
        current = cloneContainer(current)
        hasChanges = true
        replaced = false
      }

      return current
    },
    replace: (doc) => {
      current = doc
      hasChanges = !Object.is(doc, base)
      replaced = true
    },
    changed: () => finishCurrent() !== base,
    finish: () => finishCurrent()
  }
}
