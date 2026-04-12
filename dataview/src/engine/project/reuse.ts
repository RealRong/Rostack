import {
  sameOptionalOrder,
  sameOrder,
  type Equality
} from '@shared/core'

export const sameList = <T,>(
  left: readonly T[],
  right: readonly T[],
  equal: Equality<T>
) => sameOrder(left, right, equal)

export const sameOptionalList = <T,>(
  left: readonly T[] | undefined,
  right: readonly T[] | undefined,
  equal: Equality<T>
) => sameOptionalOrder(left, right, equal)

export const sameOptionalProjection = <T,>(
  left: T | undefined,
  right: T | undefined,
  equal: Equality<T>
) => (
  left === right
  || (
    left !== undefined
    && right !== undefined
    && equal(left, right)
  )
)

export const reuseIfEqual = <T,>(
  previous: T | undefined,
  next: T | undefined,
  equal: Equality<T>
) => (
  previous !== undefined
  && next !== undefined
  && equal(previous, next)
    ? previous
    : next
)
