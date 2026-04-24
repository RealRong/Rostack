import type { Action } from '../contracts/core'

export interface PublishedValue<TValue> {
  value: TValue
  changed: boolean
  action: Action
}

const isSameValue = <TValue>(
  left: TValue,
  right: TValue
): boolean => Object.is(left, right)

export const publishValue = <TValue>(input: {
  previous: TValue
  next: TValue
  isEqual?: (left: TValue, right: TValue) => boolean
}): PublishedValue<TValue> => {
  const isEqual = input.isEqual ?? isSameValue

  if (isEqual(input.previous, input.next)) {
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
