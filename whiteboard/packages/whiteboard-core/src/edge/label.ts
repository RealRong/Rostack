import type { Point } from '#whiteboard-core/types'
import type { EdgePathResult } from '#whiteboard-core/types/edge'

type EdgePolylinePoint = Point

type EdgePolylineSample = {
  from: Point
  to: Point
  startLength: number
  length: number
}

export type EdgeLabelPlacement = {
  point: Point
  tangent: Point
  normal: Point
  angle: number
  t: number
  offset: number
}

const clamp = (
  value: number,
  min: number,
  max: number
) => Math.max(min, Math.min(max, value))

const distance = (
  left: Point,
  right: Point
) => Math.hypot(right.x - left.x, right.y - left.y)

const normalizeVector = (
  value: Point
): Point => {
  const length = Math.hypot(value.x, value.y)
  if (length <= 0.000001) {
    return { x: 1, y: 0 }
  }

  return {
    x: value.x / length,
    y: value.y / length
  }
}

const projectPoint = (
  origin: Point,
  vector: Point,
  distance: number
): Point => ({
  x: origin.x + vector.x * distance,
  y: origin.y + vector.y * distance
})

const buildPolyline = (
  path: EdgePathResult
): readonly EdgePolylinePoint[] => {
  const points: EdgePolylinePoint[] = []

  path.segments.forEach((segment, segmentIndex) => {
    const source = segment.hitPoints && segment.hitPoints.length >= 2
      ? segment.hitPoints
      : [segment.from, segment.to]

    source.forEach((point, pointIndex) => {
      if (segmentIndex > 0 && pointIndex === 0) {
        return
      }

      points.push(point)
    })
  })

  if (points.length > 0) {
    return points
  }

  if (path.points.length > 0) {
    return path.points
  }

  return path.label ? [path.label] : []
}

const buildSamples = (
  path: EdgePathResult
) => {
  const points = buildPolyline(path)
  const samples: EdgePolylineSample[] = []
  let totalLength = 0

  for (let index = 0; index < points.length - 1; index += 1) {
    const from = points[index]!
    const to = points[index + 1]!
    const length = distance(from, to)
    if (length <= 0.000001) {
      continue
    }

    samples.push({
      from,
      to,
      startLength: totalLength,
      length
    })
    totalLength += length
  }

  return {
    points,
    samples,
    totalLength
  }
}

const sampleByLength = (
  path: EdgePathResult,
  length: number
): EdgeLabelPlacement | undefined => {
  const geometry = buildSamples(path)
  const { points, samples, totalLength } = geometry

  if (samples.length === 0) {
    const point = points[0] ?? path.label
    return point
      ? {
          point,
          tangent: { x: 1, y: 0 },
          normal: { x: 0, y: -1 },
          angle: 0,
          t: 0.5,
          offset: 0
        }
      : undefined
  }

  const targetLength = clamp(length, 0, totalLength)

  for (let index = 0; index < samples.length; index += 1) {
    const sample = samples[index]!
    const endLength = sample.startLength + sample.length
    if (targetLength > endLength && index < samples.length - 1) {
      continue
    }

    const local = sample.length <= 0.000001
      ? 0
      : (targetLength - sample.startLength) / sample.length
    const tangent = normalizeVector({
      x: sample.to.x - sample.from.x,
      y: sample.to.y - sample.from.y
    })
    const normal = {
      x: -tangent.y,
      y: tangent.x
    }
    const point = {
      x: sample.from.x + (sample.to.x - sample.from.x) * local,
      y: sample.from.y + (sample.to.y - sample.from.y) * local
    }

    return {
      point,
      tangent,
      normal,
      angle: Math.atan2(tangent.y, tangent.x) * 180 / Math.PI,
      t: totalLength <= 0.000001 ? 0.5 : targetLength / totalLength,
      offset: 0
    }
  }

  const last = samples[samples.length - 1]!
  const tangent = normalizeVector({
    x: last.to.x - last.from.x,
    y: last.to.y - last.from.y
  })
  const normal = {
    x: -tangent.y,
    y: tangent.x
  }

  return {
    point: last.to,
    tangent,
    normal,
    angle: Math.atan2(tangent.y, tangent.x) * 180 / Math.PI,
    t: 1,
    offset: 0
  }
}

export const resolveEdgeLabelPlacement = ({
  path,
  t = 0.5,
  offset = 0
}: {
  path: EdgePathResult
  t?: number
  offset?: number
}): EdgeLabelPlacement | undefined => {
  const geometry = buildSamples(path)
  const sample = sampleByLength(
    path,
    geometry.totalLength * clamp(t, 0, 1)
  )
  if (!sample) {
    return undefined
  }

  return {
    ...sample,
    point: projectPoint(sample.point, sample.normal, offset),
    offset
  }
}

export const projectPointToEdgeLabelPlacement = ({
  path,
  point,
  maxOffset
}: {
  path: EdgePathResult
  point: Point
  maxOffset?: number
}): EdgeLabelPlacement | undefined => {
  const geometry = buildSamples(path)
  const { samples, totalLength } = geometry

  if (samples.length === 0) {
    return resolveEdgeLabelPlacement({
      path,
      t: 0.5,
      offset: 0
    })
  }

  let best: EdgeLabelPlacement | undefined
  let bestDistance = Number.POSITIVE_INFINITY

  for (let index = 0; index < samples.length; index += 1) {
    const sample = samples[index]!
    const vector = {
      x: sample.to.x - sample.from.x,
      y: sample.to.y - sample.from.y
    }
    const tangent = normalizeVector(vector)
    const normal = {
      x: -tangent.y,
      y: tangent.x
    }
    const relative = {
      x: point.x - sample.from.x,
      y: point.y - sample.from.y
    }
    const along = clamp(
      relative.x * tangent.x + relative.y * tangent.y,
      0,
      sample.length
    )
    const basePoint = {
      x: sample.from.x + tangent.x * along,
      y: sample.from.y + tangent.y * along
    }
    const signedOffset =
      (point.x - basePoint.x) * normal.x
      + (point.y - basePoint.y) * normal.y
    const offset = maxOffset === undefined
      ? signedOffset
      : clamp(signedOffset, -Math.abs(maxOffset), Math.abs(maxOffset))
    const placedPoint = projectPoint(basePoint, normal, offset)
    const nextDistance = distance(point, placedPoint)

    if (nextDistance >= bestDistance) {
      continue
    }

    bestDistance = nextDistance
    const length = sample.startLength + along
    best = {
      point: placedPoint,
      tangent,
      normal,
      angle: Math.atan2(tangent.y, tangent.x) * 180 / Math.PI,
      t: totalLength <= 0.000001 ? 0.5 : clamp(length / totalLength, 0, 1),
      offset
    }
  }

  return best
}
