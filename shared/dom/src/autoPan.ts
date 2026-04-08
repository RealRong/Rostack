const clamp = (
  value: number,
  min: number,
  max: number
) => Math.min(max, Math.max(min, value))

export const resolveEdgePressure = (input: {
  point: number
  start: number
  end: number
  threshold: number
}) => {
  if (
    !Number.isFinite(input.point)
    || !Number.isFinite(input.start)
    || !Number.isFinite(input.end)
    || input.end <= input.start
  ) {
    return 0
  }

  const threshold = Math.max(1, input.threshold)
  const distanceToStart = input.point - input.start
  const distanceToEnd = input.end - input.point

  if (distanceToStart <= threshold) {
    return -clamp(
      (threshold - Math.max(distanceToStart, 0)) / threshold,
      0,
      1
    )
  }

  if (distanceToEnd <= threshold) {
    return clamp(
      (threshold - Math.max(distanceToEnd, 0)) / threshold,
      0,
      1
    )
  }

  return 0
}

export const resolveEdgePressureVector = (input: {
  point: {
    x: number
    y: number
  }
  size: {
    width: number
    height: number
  }
  threshold: number
}) => ({
  x: resolveEdgePressure({
    point: input.point.x,
    start: 0,
    end: input.size.width,
    threshold: input.threshold
  }),
  y: resolveEdgePressure({
    point: input.point.y,
    start: 0,
    end: input.size.height,
    threshold: input.threshold
  })
})
