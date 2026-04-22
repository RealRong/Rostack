import { equal as coreEqual } from '@shared/core'


export const sameList = <T,>(
  left: readonly T[],
  right: readonly T[],
  isEqual: coreEqual.Equality<T>
) => coreEqual.sameOrder(left, right, isEqual)

export const sameOptionalList = <T,>(
  left: readonly T[] | undefined,
  right: readonly T[] | undefined,
  isEqual: coreEqual.Equality<T>
) => coreEqual.sameOptionalOrder(left, right, isEqual)

export const sameOptionalProjection = <T,>(
  left: T | undefined,
  right: T | undefined,
  isEqual: coreEqual.Equality<T>
) => (
  left === right
  || (
    left !== undefined
    && right !== undefined
    && isEqual(left, right)
  )
)

export const reuseIfEqual = <T,>(
  previous: T | undefined,
  next: T | undefined,
  isEqual: coreEqual.Equality<T>
) => (
  previous !== undefined
  && next !== undefined
  && isEqual(previous, next)
    ? previous
    : next
)
