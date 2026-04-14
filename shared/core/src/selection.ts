import {
  sameValue,
  type Equality
} from '@shared/core/equality'

export interface AnchorFocusPair<T> {
  anchor: T
  focus: T
}

export interface OptionalAnchorFocus<T> {
  anchor?: T
  focus?: T
}

export interface OrderedRangeEdges {
  start: number
  end: number
}

const EMPTY_VALUES = [] as const

const indexOfValue = <T,>(
  order: readonly T[],
  value: T,
  equal: Equality<T>
) => {
  for (let index = 0; index < order.length; index += 1) {
    if (equal(order[index] as T, value)) {
      return index
    }
  }

  return -1
}

export const createAnchorFocusPair = <T,>(
  focus: T,
  anchor: T = focus
): AnchorFocusPair<T> => ({
  focus,
  anchor
})

export const sameAnchorFocusPair = <T,>(
  left: AnchorFocusPair<T> | null | undefined,
  right: AnchorFocusPair<T> | null | undefined,
  equal: Equality<T> = sameValue
) => {
  if (!left || !right) {
    return left === right
  }

  return equal(left.anchor, right.anchor)
    && equal(left.focus, right.focus)
}

export const sameOptionalAnchorFocus = <T,>(
  left: OptionalAnchorFocus<T>,
  right: OptionalAnchorFocus<T>,
  equal: Equality<T> = sameValue
) => (
  (
    left.anchor === undefined
    || right.anchor === undefined
  )
    ? left.anchor === right.anchor
    : equal(left.anchor, right.anchor)
) && (
  (
    left.focus === undefined
    || right.focus === undefined
  )
    ? left.focus === right.focus
    : equal(left.focus, right.focus)
)

export const normalizeOrderedValues = <T,>(
  order: readonly T[],
  values: readonly T[],
  equal: Equality<T> = sameValue
): readonly T[] => {
  if (!values.length) {
    return EMPTY_VALUES as readonly T[]
  }

  return order.filter(candidate => values.some(value => equal(candidate, value)))
}

export const orderedRangeEdges = <T,>(
  order: readonly T[],
  anchor: T,
  focus: T,
  equal: Equality<T> = sameValue
): OrderedRangeEdges | undefined => {
  const anchorIndex = indexOfValue(order, anchor, equal)
  const focusIndex = indexOfValue(order, focus, equal)
  if (anchorIndex === -1 || focusIndex === -1) {
    return undefined
  }

  return {
    start: Math.min(anchorIndex, focusIndex),
    end: Math.max(anchorIndex, focusIndex)
  }
}

export const orderedRange = <T,>(
  order: readonly T[],
  anchor: T,
  focus: T,
  equal: Equality<T> = sameValue
): readonly T[] => {
  const edges = orderedRangeEdges(order, anchor, focus, equal)
  return edges
    ? order.slice(edges.start, edges.end + 1)
    : EMPTY_VALUES as readonly T[]
}

export const stepOrderedValue = <T,>(
  order: readonly T[],
  current: T,
  delta: number,
  equal: Equality<T> = sameValue
): T | undefined => {
  const currentIndex = indexOfValue(order, current, equal)
  if (currentIndex === -1) {
    return undefined
  }

  return order[currentIndex + delta]
}
