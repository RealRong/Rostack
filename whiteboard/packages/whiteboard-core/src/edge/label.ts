import type { EdgeTextMode, Point, Size } from '@whiteboard/core/types'
import type { EdgePathResult } from '@whiteboard/core/types/edge'

type EdgePolylinePoint = Point

type EdgePolylineSample = {
  from: Point
  to: Point
  startLength: number
  length: number
}

type AxisAlignedRect = {
  left: number
  top: number
  right: number
  bottom: number
}

export type EdgeLabelPlacement = {
  point: Point
  tangent: Point
  normal: Point
  angle: number
  t: number
  offset: number
}

const EDGE_LABEL_COLLISION_EPSILON = 0.001
const EDGE_LABEL_COLLISION_BINARY_STEPS = 12
const EDGE_LABEL_COLLISION_MAX_PUSH = 4096
export const EDGE_LABEL_RAIL_OFFSET = 24
export const EDGE_LABEL_CENTER_TOLERANCE = 20
export const EDGE_LABEL_TANGENT_SIDE_GAP = 4
export const EDGE_LABEL_HORIZONTAL_SIDE_GAP = 24
export const EDGE_LABEL_LINE_HEIGHT = 1.4
export const EDGE_LABEL_DEFAULT_SIZE = 14

export const readEdgeLabelSideGap = (
  textMode: EdgeTextMode
) => textMode === 'horizontal'
  ? EDGE_LABEL_HORIZONTAL_SIDE_GAP
  : EDGE_LABEL_TANGENT_SIDE_GAP

export const resolveEdgeLabelPlacementSize = ({
  textMode,
  measuredSize,
  text,
  fontSize
}: {
  textMode: EdgeTextMode
  measuredSize?: Size
  text: string
  fontSize?: number
}): Size | undefined => {
  if (!measuredSize) {
    return undefined
  }

  if (textMode !== 'tangent') {
    return measuredSize
  }

  const lineCount = Math.max(1, text.split('\n').length)
  const resolvedFontSize = fontSize ?? EDGE_LABEL_DEFAULT_SIZE

  return {
    ...measuredSize,
    height: Math.ceil(lineCount * resolvedFontSize * EDGE_LABEL_LINE_HEIGHT)
  }
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

const readRailSign = (
  offset: number
) => offset === 0
  ? 0
  : offset < 0
    ? -1
    : 1

const readFallbackRailDistance = (
  offset: number
) => Math.abs(offset)

const readTangentRailDistance = ({
  offset,
  labelSize,
  sideGap = 0
}: {
  offset: number
  labelSize?: Size
  sideGap?: number
}) => {
  const sign = readRailSign(offset)
  if (sign === 0) {
    return 0
  }

  if (!labelSize) {
    return readFallbackRailDistance(offset)
  }

  return sideGap + labelSize.height / 2
}

const readHorizontalRailDistance = ({
  offset,
  labelSize,
  sideGap = 0
}: {
  offset: number
  labelSize?: Size
  sideGap?: number
}) => {
  const sign = readRailSign(offset)
  if (sign === 0) {
    return 0
  }

  if (!labelSize) {
    return readFallbackRailDistance(offset)
  }

  return sideGap + labelSize.width / 2
}

const readLabelRailAxisOffset = ({
  point,
  origin,
  normal,
  textMode
}: {
  point: Point
  origin: Point
  normal: Point
  textMode: EdgeTextMode
}) => textMode === 'horizontal'
  ? point.x - origin.x
  : (
      (point.x - origin.x) * normal.x
      + (point.y - origin.y) * normal.y
    )

const readLabelCenterAxisOffset = ({
  point,
  origin,
  normal
}: {
  point: Point
  origin: Point
  normal: Point
}) => (
  (point.x - origin.x) * normal.x
  + (point.y - origin.y) * normal.y
)

const buildAxisAlignedRect = ({
  center,
  size,
  margin = 0
}: {
  center: Point
  size: Size
  margin?: number
}): AxisAlignedRect => ({
  left: center.x - size.width / 2 - margin,
  top: center.y - size.height / 2 - margin,
  right: center.x + size.width / 2 + margin,
  bottom: center.y + size.height / 2 + margin
})

const segmentIntersectsRectInterior = ({
  from,
  to,
  rect
}: {
  from: Point
  to: Point
  rect: AxisAlignedRect
}) => {
  const left = rect.left + EDGE_LABEL_COLLISION_EPSILON
  const top = rect.top + EDGE_LABEL_COLLISION_EPSILON
  const right = rect.right - EDGE_LABEL_COLLISION_EPSILON
  const bottom = rect.bottom - EDGE_LABEL_COLLISION_EPSILON

  if (left >= right || top >= bottom) {
    return false
  }

  const minX = Math.min(from.x, to.x)
  const maxX = Math.max(from.x, to.x)
  const minY = Math.min(from.y, to.y)
  const maxY = Math.max(from.y, to.y)

  if (
    maxX <= left
    || minX >= right
    || maxY <= top
    || minY >= bottom
  ) {
    return false
  }

  const dx = to.x - from.x
  const dy = to.y - from.y
  let start = 0
  let end = 1

  const clip = (
    p: number,
    q: number
  ) => {
    if (Math.abs(p) <= EDGE_LABEL_COLLISION_EPSILON) {
      return q > 0
    }

    const ratio = q / p
    if (p < 0) {
      if (ratio > end) {
        return false
      }
      if (ratio > start) {
        start = ratio
      }
      return true
    }

    if (ratio < start) {
      return false
    }
    if (ratio < end) {
      end = ratio
    }
    return true
  }

  return clip(-dx, from.x - left)
    && clip(dx, right - from.x)
    && clip(-dy, from.y - top)
    && clip(dy, bottom - from.y)
    && start < end
}

const pathIntersectsHorizontalLabelRect = ({
  samples,
  center,
  size,
  margin = 0
}: {
  samples: readonly EdgePolylineSample[]
  center: Point
  size: Size
  margin?: number
}) => {
  const rect = buildAxisAlignedRect({
    center,
    size,
    margin
  })

  return samples.some((sample) => segmentIntersectsRectInterior({
    from: sample.from,
    to: sample.to,
    rect
  }))
}

const readHorizontalPushSign = ({
  offset,
  normal,
  origin,
  point
}: {
  offset: number
  normal: Point
  origin: Point
  point: Point
}) => {
  const signedDistance = readLabelCenterAxisOffset({
    point,
    origin,
    normal
  })
  if (Math.abs(signedDistance) > EDGE_LABEL_COLLISION_EPSILON) {
    return signedDistance < 0 ? -1 : 1
  }

  const railSign = readRailSign(offset)
  return normal.y >= 0
    ? railSign
    : -railSign
}

const resolveHorizontalCollisionPoint = ({
  point,
  origin,
  normal,
  offset,
  labelSize,
  samples,
  sideGap = 0
}: {
  point: Point
  origin: Point
  normal: Point
  offset: number
  labelSize?: Size
  samples?: readonly EdgePolylineSample[]
  sideGap?: number
}) => {
  if (!labelSize || !samples || samples.length === 0) {
    return point
  }

  const pushSign = readHorizontalPushSign({
    offset,
    normal,
    origin,
    point
  })
  if (pushSign === 0) {
    return point
  }

  const pushVector = {
    x: normal.x * pushSign,
    y: normal.y * pushSign
  }
  const intersects = (
    pushDistance: number
  ) => pathIntersectsHorizontalLabelRect({
    samples,
    center: projectPoint(point, pushVector, pushDistance),
    size: labelSize,
    margin: 0
  })

  if (!intersects(0)) {
    return point
  }

  let minPush = 0
  let maxPush = Math.max(sideGap, labelSize.height / 2, 1)

  while (intersects(maxPush) && maxPush < EDGE_LABEL_COLLISION_MAX_PUSH) {
    minPush = maxPush
    maxPush *= 2
  }

  if (intersects(maxPush)) {
    return projectPoint(point, pushVector, maxPush)
  }

  for (let index = 0; index < EDGE_LABEL_COLLISION_BINARY_STEPS; index += 1) {
    const midPush = (minPush + maxPush) / 2
    if (intersects(midPush)) {
      minPush = midPush
      continue
    }

    maxPush = midPush
  }

  return projectPoint(point, pushVector, maxPush)
}

const projectLabelPoint = ({
  origin,
  normal,
  offset,
  textMode,
  labelSize,
  sideGap,
  samples
}: {
  origin: Point
  normal: Point
  offset: number
  textMode: EdgeTextMode
  labelSize?: Size
  sideGap?: number
  samples?: readonly EdgePolylineSample[]
}) => {
  const sign = readRailSign(offset)
  if (sign === 0) {
    return origin
  }

  if (textMode === 'horizontal') {
    const distance = readHorizontalRailDistance({
      offset,
      labelSize,
      sideGap
    })
    if (distance <= 0) {
      return origin
    }

    return resolveHorizontalCollisionPoint({
      point: {
        x: origin.x + sign * distance,
        y: origin.y
      },
      origin,
      normal,
      offset,
      labelSize,
      samples,
      sideGap
    })
  }

  const distance = readTangentRailDistance({
    offset,
    labelSize,
    sideGap
  })
  if (distance <= 0) {
    return origin
  }

  return projectPoint(origin, normal, sign * distance)
}

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
  offset = 0,
  textMode = 'horizontal',
  labelSize,
  sideGap = 0
}: {
  path: EdgePathResult
  t?: number
  offset?: number
  textMode?: EdgeTextMode
  labelSize?: Size
  sideGap?: number
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
    point: projectLabelPoint({
      origin: sample.point,
      normal: sample.normal,
      offset,
      textMode,
      labelSize,
      sideGap,
      samples: geometry.samples
    }),
    offset
  }
}

export const projectPointToEdgeLabelPlacement = ({
  path,
  point,
  maxOffset,
  centerTolerance = 0,
  textMode = 'horizontal',
  labelSize,
  sideGap = 0
}: {
  path: EdgePathResult
  point: Point
  maxOffset?: number
  centerTolerance?: number
  textMode?: EdgeTextMode
  labelSize?: Size
  sideGap?: number
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
    const centerAxisOffset = readLabelCenterAxisOffset({
      point,
      origin: basePoint,
      normal
    })
    const signedOffset = readLabelRailAxisOffset({
      point,
      origin: basePoint,
      normal,
      textMode
    })
    const railOffset = Math.abs(maxOffset ?? 0)
    const tolerance = Math.max(0, centerTolerance)
    const offset = (
      railOffset <= 0
      || Math.abs(centerAxisOffset) <= tolerance
    )
      ? 0
      : signedOffset < 0
        ? -railOffset
        : railOffset
    const placedPoint = projectLabelPoint({
      origin: basePoint,
      normal,
      offset,
      textMode,
      labelSize,
      sideGap,
      samples
    })
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
