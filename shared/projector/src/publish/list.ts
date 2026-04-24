import type { Action } from '../contracts/core'

export interface PublishedList<TValue> {
  value: readonly TValue[]
  changed: boolean
  action: Action
}

const isSameValue = <TValue>(
  left: TValue,
  right: TValue
): boolean => Object.is(left, right)

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

export const publishList = <TValue>(input: {
  previous: readonly TValue[]
  next: readonly TValue[]
  isEqual?: (left: TValue, right: TValue) => boolean
}): PublishedList<TValue> => {
  if (isListEqual(input.previous, input.next, input.isEqual)) {
    return {
      value: input.previous,
      changed: false,
      action: 'reuse'
    }
  }

  return {
    value: input.next,
    changed: true,
    action: 'rebuild'
  }
}
