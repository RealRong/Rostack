export type Equality<T> = (left: T, right: T) => boolean

type XYPointLike = {
  x?: number
  y?: number
}

type RectTupleLike = {
  x?: number
  y?: number
  width?: number
  height?: number
}

type RectWithRotationTupleLike = RectTupleLike & {
  rotation?: number
}

type BoxTupleLike = {
  left?: number
  top?: number
  right?: number
  bottom?: number
  width?: number
  height?: number
}

const isPlainObject = (
  value: unknown
): value is Record<string, unknown> => (
  typeof value === 'object'
  && value !== null
  && !Array.isArray(value)
)

export const sameValue = Object.is

export const sameOrder = <T,>(
  left: readonly T[],
  right: readonly T[],
  equal: Equality<T> = sameValue
) => {
  if (left === right) {
    return true
  }
  if (left.length !== right.length) {
    return false
  }
  for (let index = 0; index < left.length; index += 1) {
    if (!equal(left[index] as T, right[index] as T)) {
      return false
    }
  }
  return true
}

export const sameOptionalOrder = <T,>(
  left: readonly T[] | undefined,
  right: readonly T[] | undefined,
  equal: Equality<T> = sameValue
) => (
  left === right
  || (
    left !== undefined
    && right !== undefined
    && sameOrder(left, right, equal)
  )
)

export const sameIdOrder = <T extends { id: unknown },>(
  left: readonly (T | undefined)[],
  right: readonly (T | undefined)[]
) => sameOrder(left, right, (before, after) => before?.id === after?.id)

export const sameMap = <K, V>(
  left: ReadonlyMap<K, V>,
  right: ReadonlyMap<K, V>,
  equal: Equality<V> = sameValue
) => {
  if (left === right) {
    return true
  }
  if (left.size !== right.size) {
    return false
  }
  for (const [key, value] of left) {
    if (!right.has(key)) {
      return false
    }
    if (!equal(value, right.get(key) as V)) {
      return false
    }
  }
  return true
}

export const sameMapRefs = <K, V>(
  left: ReadonlyMap<K, V>,
  right: ReadonlyMap<K, V>
) => sameMap(left, right)

export const sameShallowRecord = (
  left: object | undefined,
  right: object | undefined
) => {
  if (left === right) {
    return true
  }
  if (!left || !right) {
    return false
  }

  const leftRecord = left as Record<string, unknown>
  const rightRecord = right as Record<string, unknown>
  const leftKeys = Object.keys(leftRecord)
  const rightKeys = Object.keys(rightRecord)
  if (leftKeys.length !== rightKeys.length) {
    return false
  }

  for (const key of leftKeys) {
    const leftValue = leftRecord[key]
    const rightValue = rightRecord[key]
    if (sameValue(leftValue, rightValue)) {
      continue
    }
    if (Array.isArray(leftValue) && Array.isArray(rightValue)) {
      if (!sameOrder(leftValue, rightValue)) {
        return false
      }
      continue
    }
    return false
  }

  return true
}

export const samePoint = (
  left: XYPointLike,
  right: XYPointLike
) => left.x === right.x && left.y === right.y

export const sameOptionalPoint = (
  left: XYPointLike | undefined | null,
  right: XYPointLike | undefined | null
) => (
  left === right
  || (
    left !== undefined
    && left !== null
    && right !== undefined
    && right !== null
    && samePoint(left, right)
  )
)

export const sameRect = (
  left: RectTupleLike,
  right: RectTupleLike
) => (
  left.x === right.x
  && left.y === right.y
  && left.width === right.width
  && left.height === right.height
)

export const sameOptionalRect = (
  left: RectTupleLike | undefined | null,
  right: RectTupleLike | undefined | null
) => (
  left === right
  || (
    left !== undefined
    && left !== null
    && right !== undefined
    && right !== null
    && sameRect(left, right)
  )
)

export const sameRectWithRotation = (
  left: RectWithRotationTupleLike,
  right: RectWithRotationTupleLike
) => sameRect(left, right)
  && left.rotation === right.rotation

export const sameBox = (
  left: BoxTupleLike,
  right: BoxTupleLike
) => (
  left.left === right.left
  && left.top === right.top
  && left.right === right.right
  && left.bottom === right.bottom
  && left.width === right.width
  && left.height === right.height
)

export const sameOptionalBox = (
  left: BoxTupleLike | undefined | null,
  right: BoxTupleLike | undefined | null
) => (
  left === right
  || (
    left !== undefined
    && left !== null
    && right !== undefined
    && right !== null
    && sameBox(left, right)
  )
)

export const samePointArray = <TPoint extends XYPointLike,>(
  left?: readonly TPoint[],
  right?: readonly TPoint[]
) => sameOptionalOrder(left, right, samePoint)

export const toFiniteOrUndefined = (
  value: number | undefined | null
) => value === undefined || value === null || !Number.isFinite(value)
  ? undefined
  : value

export const sameJsonValue = (
  left: unknown,
  right: unknown
): boolean => {
  if (sameValue(left, right)) {
    return true
  }

  if (Array.isArray(left) && Array.isArray(right)) {
    return sameOrder(left, right, sameJsonValue)
  }

  if (isPlainObject(left) && isPlainObject(right)) {
    const leftKeys = Object.keys(left).sort()
    const rightKeys = Object.keys(right).sort()
    if (!sameOrder(leftKeys, rightKeys)) {
      return false
    }

    for (const key of leftKeys) {
      if (!sameJsonValue(left[key], right[key])) {
        return false
      }
    }

    return true
  }

  return false
}

export const sameOptionalNumberArray = (
  left?: readonly number[],
  right?: readonly number[]
) => sameOptionalOrder(left, right)
