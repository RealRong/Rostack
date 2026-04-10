type XYPointLike = {
  x: number
  y: number
}

type Equal<T> = (left: T, right: T) => boolean

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
  width?: number
  height?: number
}

export const isSameRefOrder = <T,>(left: readonly T[], right: readonly T[]) => {
  if (left === right) return true
  if (left.length !== right.length) return false
  for (let index = 0; index < left.length; index += 1) {
    if (left[index] !== right[index]) return false
  }
  return true
}

const isStrictEqual = <T>(
  left: T,
  right: T
) => left === right

export const isOrderedArrayEqual = <T>(
  left: readonly T[],
  right: readonly T[],
  isEqual: Equal<T> = isStrictEqual
) => (
  left === right
  || (
    left.length === right.length
    && left.every((item, index) => isEqual(item, right[index]!))
  )
)

export const isSameRectTuple = (
  left: RectTupleLike,
  right: RectTupleLike
) =>
  left.x === right.x &&
  left.y === right.y &&
  left.width === right.width &&
  left.height === right.height

export const isSameRectWithRotationTuple = (
  left: RectWithRotationTupleLike,
  right: RectWithRotationTupleLike
) =>
  isSameRectTuple(left, right)
  && left.rotation === right.rotation

export const isSameOptionalRectTuple = (
  left: RectTupleLike | undefined,
  right: RectTupleLike | undefined
) => (
  left === right
  || (
    left !== undefined
    && right !== undefined
    && isSameRectTuple(left, right)
  )
)

export const isSameBoxTuple = (
  left: BoxTupleLike,
  right: BoxTupleLike
) =>
  left.left === right.left &&
  left.top === right.top &&
  left.width === right.width &&
  left.height === right.height

export const isSameOptionalBoxTuple = (
  left: BoxTupleLike | undefined,
  right: BoxTupleLike | undefined
) => (
  left === right
  || (
    left !== undefined
    && right !== undefined
    && isSameBoxTuple(left, right)
  )
)

export const isSameIdOrder = <T extends { id: unknown },>(
  left: readonly (T | undefined)[],
  right: readonly (T | undefined)[]
) => {
  if (left === right) return true
  if (left.length !== right.length) return false
  for (let index = 0; index < left.length; index += 1) {
    if (left[index]?.id !== right[index]?.id) return false
  }
  return true
}

export const isSameMapValueRefs = <K, V>(
  left: ReadonlyMap<K, V>,
  right: ReadonlyMap<K, V>
) => {
  if (left === right) return true
  if (left.size !== right.size) return false
  for (const [key, value] of left) {
    if (right.get(key) !== value) return false
  }
  return true
}

export const toFiniteOrUndefined = (
  value: number | undefined | null
) => value === undefined || value === null || !Number.isFinite(value) ? undefined : value

export const isSameNumberish = (
  left: number | undefined | null,
  right: number | undefined | null
) =>
  left === right
  || (Number.isNaN(left) && Number.isNaN(right))

export const isSamePointArray = <TPoint extends XYPointLike,>(
  left?: readonly TPoint[],
  right?: readonly TPoint[]
) => {
  if (left === right) return true
  if (!left || !right) return false
  if (left.length !== right.length) return false
  for (let index = 0; index < left.length; index += 1) {
    if (left[index]?.x !== right[index]?.x) return false
    if (left[index]?.y !== right[index]?.y) return false
  }
  return true
}

export const isSameOptionalNumberArray = (
  left?: readonly number[],
  right?: readonly number[]
) => (
  left === right
  || (
    left !== undefined
    && right !== undefined
    && isOrderedArrayEqual(left, right)
  )
)
