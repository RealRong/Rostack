export interface DraftList<Value> {
  readonly base: readonly Value[]

  current(): readonly Value[]
  write(): Value[]
  set(values: readonly Value[]): void

  push(value: Value): void
  insert(index: number, value: Value): void
  removeAt(index: number): void
  move(from: number, to: number): void

  changed(): boolean
  finish(): readonly Value[]
}

export const list = <Value>(
  base: readonly Value[]
): DraftList<Value> => {
  let current: Value[] | undefined

  const finishCurrent = (): readonly Value[] => {
    const source = current ?? base
    if (source.length !== base.length) {
      return source
    }

    for (let index = 0; index < base.length; index += 1) {
      if (!Object.is(source[index], base[index])) {
        return source
      }
    }

    return base
  }

  const readCurrent = (): readonly Value[] => current ?? base
  const ensureCurrent = (): Value[] => {
    if (!current) {
      current = [...readCurrent()]
    }

    return current
  }

  return {
    base,
    current: () => readCurrent(),
    write: () => ensureCurrent(),
    set: (values) => {
      if (Object.is(readCurrent(), values)) {
        return
      }

      current = [...values]
    },
    push: (value) => {
      ensureCurrent().push(value)
    },
    insert: (index, value) => {
      const next = ensureCurrent()
      const target = Math.max(0, Math.min(index, next.length))
      next.splice(target, 0, value)
    },
    removeAt: (index) => {
      const source = readCurrent()
      if (index < 0 || index >= source.length) {
        return
      }

      ensureCurrent().splice(index, 1)
    },
    move: (from, to) => {
      const source = readCurrent()
      if (
        from < 0
        || from >= source.length
        || from === to
      ) {
        return
      }

      const next = ensureCurrent()
      const target = Math.max(0, Math.min(to, next.length - 1))
      const [value] = next.splice(from, 1)
      next.splice(target, 0, value!)
    },
    changed: () => finishCurrent() !== base,
    finish: () => finishCurrent()
  }
}
