export const clamp = (value: number, min: number, max: number) =>
  Math.min(max, Math.max(min, value))

export const degToRad = (deg: number) => (deg * Math.PI) / 180

export const pickNearest = <T>(
  items: readonly T[],
  readDistance: (item: T) => number | undefined
): T | undefined => {
  let best: T | undefined
  let bestDistance = Number.POSITIVE_INFINITY

  for (let index = 0; index < items.length; index += 1) {
    const item = items[index]
    const distance = readDistance(item)
    if (
      distance === undefined
      || !Number.isFinite(distance)
      || distance >= bestDistance
    ) {
      continue
    }

    best = item
    bestDistance = distance
  }

  return best
}
