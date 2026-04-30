export const clamp = (value: number, min: number, max: number) =>
  Math.min(max, Math.max(min, value))

export const degToRad = (deg: number) => (deg * Math.PI) / 180

const isFiniteNumber = (
  value: number | undefined
): value is number => value !== undefined && Number.isFinite(value)

export const pickPreferred = <T>(
  current: T | undefined,
  next: T,
  readDistance: (item: T) => number | undefined,
  readOrder?: (item: T) => number | undefined
): T | undefined => {
  const nextDistance = readDistance(next)
  if (!isFiniteNumber(nextDistance)) {
    return current
  }

  if (!current) {
    return next
  }

  const currentDistance = readDistance(current)
  if (!isFiniteNumber(currentDistance) || nextDistance < currentDistance) {
    return next
  }
  if (nextDistance > currentDistance) {
    return current
  }

  const nextOrder = readOrder?.(next)
  const currentOrder = readOrder?.(current)
  if (
    isFiniteNumber(nextOrder)
    && (
      !isFiniteNumber(currentOrder)
      || nextOrder > currentOrder
    )
  ) {
    return next
  }

  return current
}

export const pickNearest = <T>(
  items: readonly T[],
  readDistance: (item: T) => number | undefined,
  readOrder?: (item: T) => number | undefined
): T | undefined => {
  let best: T | undefined

  for (let index = 0; index < items.length; index += 1) {
    const item = items[index]
    if (item === undefined) {
      continue
    }
    best = pickPreferred(
      best,
      item,
      readDistance,
      readOrder
    )
  }

  return best
}
