const isSameValue = <TValue>(
  left: TValue,
  right: TValue
): boolean => Object.is(left, right)

const EMPTY_ITEMS = [] as const

export const isListEqual = <TValue>(
  left: readonly TValue[],
  right: readonly TValue[],
  isEqual: (left: TValue, right: TValue) => boolean = isSameValue
): boolean => {
  if (left === right) {
    return true
  }

  if (left.length !== right.length) {
    return false
  }

  for (let index = 0; index < left.length; index += 1) {
    if (!isEqual(left[index]!, right[index]!)) {
      return false
    }
  }

  return true
}

export interface ListChange<TValue> {
  added: readonly TValue[]
  removed: readonly TValue[]
  orderChanged: boolean
  changed: boolean
}

export const projectListChange = <TValue>(input: {
  previous: readonly TValue[]
  next: readonly TValue[]
  previousSet?: ReadonlySet<TValue>
  nextSet?: ReadonlySet<TValue>
  isEqual?: (left: TValue, right: TValue) => boolean
}): ListChange<TValue> => {
  const isEqual = input.isEqual ?? isSameValue
  const orderChanged = !isListEqual(input.previous, input.next, isEqual)

  if (input.previous === input.next) {
    return {
      added: EMPTY_ITEMS as readonly TValue[],
      removed: EMPTY_ITEMS as readonly TValue[],
      orderChanged: false,
      changed: false
    }
  }

  if (!input.previous.length) {
    return input.next.length
      ? {
          added: input.next,
          removed: EMPTY_ITEMS as readonly TValue[],
          orderChanged,
          changed: true
        }
      : {
          added: EMPTY_ITEMS as readonly TValue[],
          removed: EMPTY_ITEMS as readonly TValue[],
          orderChanged,
          changed: orderChanged
        }
  }

  if (!input.next.length) {
    return {
      added: EMPTY_ITEMS as readonly TValue[],
      removed: input.previous,
      orderChanged,
      changed: true
    }
  }

  const previousIsSmaller = input.previous.length <= input.next.length
  const added: TValue[] = []
  const removed: TValue[] = []

  if (previousIsSmaller) {
    const previousSet = input.previousSet ?? new Set(input.previous)

    for (let index = 0; index < input.next.length; index += 1) {
      const value = input.next[index]!
      if (!previousSet.has(value)) {
        added.push(value)
      }
    }

    if (input.previous.length + added.length !== input.next.length) {
      const nextSet = input.nextSet ?? new Set(input.next)
      for (let index = 0; index < input.previous.length; index += 1) {
        const value = input.previous[index]!
        if (!nextSet.has(value)) {
          removed.push(value)
        }
      }
    }
  } else {
    const nextSet = input.nextSet ?? new Set(input.next)

    for (let index = 0; index < input.previous.length; index += 1) {
      const value = input.previous[index]!
      if (!nextSet.has(value)) {
        removed.push(value)
      }
    }

    if (input.next.length + removed.length !== input.previous.length) {
      const previousSet = input.previousSet ?? new Set(input.previous)
      for (let index = 0; index < input.next.length; index += 1) {
        const value = input.next[index]!
        if (!previousSet.has(value)) {
          added.push(value)
        }
      }
    }
  }

  return {
    added: added.length
      ? added
      : EMPTY_ITEMS as readonly TValue[],
    removed: removed.length
      ? removed
      : EMPTY_ITEMS as readonly TValue[],
    orderChanged,
    changed: orderChanged || added.length > 0 || removed.length > 0
  }
}
