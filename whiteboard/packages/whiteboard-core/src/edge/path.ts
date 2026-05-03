import { geometry as geometryApi } from '@whiteboard/core/geometry'
import type { EdgeAnchor, Point } from '@whiteboard/core/types'
import type {
  EdgePathInput,
  EdgePathResult,
  EdgePathSegment,
  EdgeRouter,
  ResolveEdgePathFromRectsInput,
  ResolvedEdgePathFromRects
} from '@whiteboard/core/types/edge'
import { readEdgePoints } from '@whiteboard/core/edge/route'
import { resolveEdgeEnds } from '@whiteboard/core/edge/endpoints'

const DEFAULT_ORTHO_OFFSET = 50
const DEFAULT_CURVE_CURVATURE = 0.35
const DEFAULT_STEP_ENDPOINT_OFFSET = 24
const DEFAULT_FILLET_RADIUS = 16

const EDGE_SIDE_VECTOR: Record<EdgeAnchor['side'], Point> = {
  left: { x: -1, y: 0 },
  right: { x: 1, y: 0 },
  top: { x: 0, y: -1 },
  bottom: { x: 0, y: 1 }
}

type EdgeSide = EdgeAnchor['side']

const EDGE_SIDE_POSITION = {
  left: 'left',
  right: 'right',
  top: 'top',
  bottom: 'bottom'
} as const

const getAutoSide = (from: Point, to: Point): EdgeAnchor['side'] => {
  const dx = to.x - from.x
  const dy = to.y - from.y
  if (Math.abs(dx) >= Math.abs(dy)) {
    return dx >= 0 ? 'right' : 'left'
  }
  return dy >= 0 ? 'bottom' : 'top'
}

const resolveSide = (
  side: EdgeAnchor['side'] | undefined,
  from: Point,
  to: Point
) => side ?? getAutoSide(from, to)

const getPathPoints = (
  input: EdgePathInput
) => [
  input.source.point,
  ...readEdgePoints(input.edge.points),
  input.target.point
]

const buildPolylinePath = (points: Point[]) => {
  if (points.length === 0) return ''
  return points
    .map((point, index) => `${index === 0 ? 'M' : 'L'} ${point.x} ${point.y}`)
    .join(' ')
}

const buildFilletPath = (
  points: readonly Point[],
  radius = DEFAULT_FILLET_RADIUS
) => {
  if (points.length === 0) {
    return ''
  }
  if (points.length === 1) {
    return `M ${points[0]!.x} ${points[0]!.y}`
  }

  let path = `M ${points[0]!.x} ${points[0]!.y}`

  for (let index = 1; index < points.length - 1; index += 1) {
    const previous = points[index - 1]!
    const current = points[index]!
    const next = points[index + 1]!
    const inLength = getDistance(previous, current)
    const outLength = getDistance(current, next)
    const turn =
      (current.x - previous.x) * (next.y - current.y)
      - (current.y - previous.y) * (next.x - current.x)

    if (
      inLength === 0
      || outLength === 0
      || Math.abs(turn) < 0.001
    ) {
      path += ` L ${current.x} ${current.y}`
      continue
    }

    const filletRadius = Math.min(radius, inLength / 2, outLength / 2)
    if (filletRadius <= 0) {
      path += ` L ${current.x} ${current.y}`
      continue
    }

    const inVector = {
      x: (current.x - previous.x) / inLength,
      y: (current.y - previous.y) / inLength
    }
    const outVector = {
      x: (next.x - current.x) / outLength,
      y: (next.y - current.y) / outLength
    }
    const beforeCorner = {
      x: current.x - inVector.x * filletRadius,
      y: current.y - inVector.y * filletRadius
    }
    const afterCorner = {
      x: current.x + outVector.x * filletRadius,
      y: current.y + outVector.y * filletRadius
    }

    path += ` L ${beforeCorner.x} ${beforeCorner.y}`
    path += ` Q ${current.x} ${current.y} ${afterCorner.x} ${afterCorner.y}`
  }

  const last = points[points.length - 1]!
  path += ` L ${last.x} ${last.y}`

  return path
}

const getMidPoint = (
  from: Point,
  to: Point
): Point => ({
  x: (from.x + to.x) / 2,
  y: (from.y + to.y) / 2
})

const isSamePoint = (left: Point, right: Point) => (
  left.x === right.x && left.y === right.y
)

const pushPoint = (
  points: Point[],
  point: Point
) => {
  const last = points[points.length - 1]
  if (!last || !isSamePoint(last, point)) {
    points.push(point)
  }
}

const createSegments = (
  points: readonly Point[],
  insertIndex: number | ((segmentIndex: number) => number),
  role: EdgePathSegment['role'] | ((segmentIndex: number) => EdgePathSegment['role']) = 'insert'
): EdgePathSegment[] => {
  const segments: EdgePathSegment[] = []

  for (let index = 0; index < points.length - 1; index += 1) {
    const from = points[index]
    const to = points[index + 1]
    if (isSamePoint(from, to)) {
      continue
    }

    segments.push({
      from,
      to,
      role: typeof role === 'function'
        ? role(index)
        : role,
      insertPoint: getMidPoint(from, to),
      insertIndex: typeof insertIndex === 'function'
        ? insertIndex(index)
        : insertIndex
    })
  }

  return segments
}

const getDirection = ({
  source,
  sourcePosition = EDGE_SIDE_POSITION.bottom,
  target
}: {
  source: Point
  sourcePosition: EdgeSide
  target: Point
}): Point => {
  if (
    sourcePosition === EDGE_SIDE_POSITION.left
    || sourcePosition === EDGE_SIDE_POSITION.right
  ) {
    return source.x < target.x ? { x: 1, y: 0 } : { x: -1, y: 0 }
  }

  return source.y < target.y ? { x: 0, y: 1 } : { x: 0, y: -1 }
}

const getDistance = (
  left: Point,
  right: Point
) => Math.sqrt(
  Math.pow(right.x - left.x, 2)
  + Math.pow(right.y - left.y, 2)
)

const getEdgeCenter = ({
  sourceX,
  sourceY,
  targetX,
  targetY
}: {
  sourceX: number
  sourceY: number
  targetX: number
  targetY: number
}): [number, number, number, number] => {
  const xOffset = Math.abs(targetX - sourceX) / 2
  const centerX = targetX < sourceX ? targetX + xOffset : targetX - xOffset
  const yOffset = Math.abs(targetY - sourceY) / 2
  const centerY = targetY < sourceY ? targetY + yOffset : targetY - yOffset

  return [centerX, centerY, xOffset, yOffset]
}

const getSmoothPathPoints = ({
  source,
  sourcePosition = EDGE_SIDE_POSITION.bottom,
  target,
  targetPosition = EDGE_SIDE_POSITION.top,
  center,
  offset
}: {
  source: Point
  sourcePosition: EdgeSide
  target: Point
  targetPosition: EdgeSide
  center: Partial<Point>
  offset: number
}): [Point[], number, number, number, number] => {
  const sourceDir = EDGE_SIDE_VECTOR[sourcePosition]
  const targetDir = EDGE_SIDE_VECTOR[targetPosition]
  const sourceGapped: Point = {
    x: source.x + sourceDir.x * offset,
    y: source.y + sourceDir.y * offset
  }
  const targetGapped: Point = {
    x: target.x + targetDir.x * offset,
    y: target.y + targetDir.y * offset
  }
  const dir = getDirection({
    source: sourceGapped,
    sourcePosition,
    target: targetGapped
  })
  const dirAccessor = dir.x !== 0 ? 'x' : 'y'
  const currDir = dir[dirAccessor]

  let points: Point[] = []
  let centerX = 0
  let centerY = 0
  const sourceGapOffset = { x: 0, y: 0 }
  const targetGapOffset = { x: 0, y: 0 }

  const [defaultCenterX, defaultCenterY, defaultOffsetX, defaultOffsetY] = getEdgeCenter({
    sourceX: source.x,
    sourceY: source.y,
    targetX: target.x,
    targetY: target.y
  })

  if (sourceDir[dirAccessor] * targetDir[dirAccessor] === -1) {
    centerX = center.x ?? defaultCenterX
    centerY = center.y ?? defaultCenterY
    const verticalSplit: Point[] = [
      { x: centerX, y: sourceGapped.y },
      { x: centerX, y: targetGapped.y }
    ]
    const horizontalSplit: Point[] = [
      { x: sourceGapped.x, y: centerY },
      { x: targetGapped.x, y: centerY }
    ]

    if (sourceDir[dirAccessor] === currDir) {
      points = dirAccessor === 'x' ? verticalSplit : horizontalSplit
    } else {
      points = dirAccessor === 'x' ? horizontalSplit : verticalSplit
    }
  } else {
    const sourceTarget: Point[] = [{ x: sourceGapped.x, y: targetGapped.y }]
    const targetSource: Point[] = [{ x: targetGapped.x, y: sourceGapped.y }]

    if (dirAccessor === 'x') {
      points = sourceDir.x === currDir ? targetSource : sourceTarget
    } else {
      points = sourceDir.y === currDir ? sourceTarget : targetSource
    }

    if (sourcePosition === targetPosition) {
      const diff = Math.abs(source[dirAccessor] - target[dirAccessor])

      if (diff <= offset) {
        const gapOffset = Math.min(offset - 1, offset - diff)
        if (sourceDir[dirAccessor] === currDir) {
          sourceGapOffset[dirAccessor] = gapOffset
        } else {
          targetGapOffset[dirAccessor] = gapOffset
        }
      }
    }

    if (sourcePosition !== targetPosition) {
      const dirAccessorOpposite = dirAccessor === 'x' ? 'y' : 'x'
      const isSameDir = sourceDir[dirAccessor] === targetDir[dirAccessorOpposite]
      const sourceGtTargetOppo = sourceGapped[dirAccessorOpposite] > targetGapped[dirAccessorOpposite]
      const sourceLtTargetOppo = sourceGapped[dirAccessorOpposite] < targetGapped[dirAccessorOpposite]
      const flipSourceTarget =
        (sourceDir[dirAccessor] === 1 && ((!isSameDir && sourceGtTargetOppo) || (isSameDir && sourceLtTargetOppo)))
        || (sourceDir[dirAccessor] !== 1 && ((!isSameDir && sourceLtTargetOppo) || (isSameDir && sourceGtTargetOppo)))

      if (flipSourceTarget) {
        points = dirAccessor === 'x' ? sourceTarget : targetSource
      }
    }

    const sourceGapPoint = {
      x: sourceGapped.x - sourceGapOffset.x,
      y: sourceGapped.y - sourceGapOffset.y
    }
    const targetGapPoint = {
      x: targetGapped.x - targetGapOffset.x,
      y: targetGapped.y - targetGapOffset.y
    }
    const maxXDistance = Math.max(
      Math.abs(sourceGapPoint.x - points[0].x),
      Math.abs(targetGapPoint.x - points[0].x)
    )
    const maxYDistance = Math.max(
      Math.abs(sourceGapPoint.y - points[0].y),
      Math.abs(targetGapPoint.y - points[0].y)
    )

    if (maxXDistance >= maxYDistance) {
      centerX = (sourceGapPoint.x + targetGapPoint.x) / 2
      centerY = points[0].y
    } else {
      centerX = points[0].x
      centerY = (sourceGapPoint.y + targetGapPoint.y) / 2
    }
  }

  const pathPoints = [
    source,
    {
      x: sourceGapped.x - sourceGapOffset.x,
      y: sourceGapped.y - sourceGapOffset.y
    },
    ...points,
    {
      x: targetGapped.x - targetGapOffset.x,
      y: targetGapped.y - targetGapOffset.y
    },
    target
  ]

  if (
    sourcePosition === EDGE_SIDE_POSITION.left
    && targetPosition === EDGE_SIDE_POSITION.left
    && pathPoints.length === 5
  ) {
    const distanceX = target.x - source.x
    if (distanceX > 0 && distanceX <= offset) {
      pathPoints.splice(pathPoints.length - 2, 1)
    } else if (distanceX <= 0) {
      pathPoints.splice(1, 1)
    }
  }

  if (
    sourcePosition === EDGE_SIDE_POSITION.top
    && targetPosition === EDGE_SIDE_POSITION.top
    && pathPoints.length === 5
  ) {
    const distanceY = target.y - source.y
    if (distanceY > 0 && distanceY <= offset) {
      pathPoints.splice(pathPoints.length - 2, 1)
    } else if (distanceY <= 0) {
      pathPoints.splice(1, 1)
    }
  }

  return [pathPoints, centerX, centerY, defaultOffsetX, defaultOffsetY]
}

const getBend = (
  left: Point,
  middle: Point,
  right: Point,
  size: number
): string => {
  const bendSize = Math.min(
    getDistance(left, middle) / 2,
    getDistance(middle, right) / 2,
    size
  )
  const { x, y } = middle

  if ((left.x === x && x === right.x) || (left.y === y && y === right.y)) {
    return `L${x} ${y}`
  }

  if (left.y === y) {
    const xDir = left.x < right.x ? -1 : 1
    const yDir = left.y < right.y ? 1 : -1
    return `L ${x + bendSize * xDir},${y}Q ${x},${y} ${x},${y + bendSize * yDir}`
  }

  const xDir = left.x < right.x ? 1 : -1
  const yDir = left.y < right.y ? -1 : 1
  return `L ${x},${y + bendSize * yDir}Q ${x},${y} ${x + bendSize * xDir},${y}`
}

const getSmoothPolyPath = ({
  sourceX,
  sourceY,
  sourcePosition,
  targetX,
  targetY,
  targetPosition,
  borderRadius = 5,
  centerX,
  centerY,
  offset = 50,
  bendOnlyLast = false
}: {
  sourceX: number
  sourceY: number
  sourcePosition: EdgeSide
  targetPosition: EdgeSide
  targetX: number
  targetY: number
  borderRadius: number
  centerX?: number
  centerY?: number
  offset?: number
  bendOnlyLast?: boolean
}): [path: string, labelX: number, labelY: number, offsetX: number, offsetY: number, points: Point[]] => {
  const [points, labelX, labelY, offsetX, offsetY] = getSmoothPathPoints({
    source: { x: sourceX, y: sourceY },
    sourcePosition,
    target: { x: targetX, y: targetY },
    targetPosition,
    center: { x: centerX, y: centerY },
    offset
  })

  const path = points.reduce<string>((result, point, index) => {
    let segment = ''

    if (index > 0 && index < points.length - 1) {
      if (bendOnlyLast) {
        segment = index === points.length - 3
          ? getBend(points[index - 1], point, points[index + 1], borderRadius)
          : `${index === 0 ? 'M' : 'L'}${point.x} ${point.y}`
      } else {
        segment = getBend(points[index - 1], point, points[index + 1], borderRadius)
      }
    } else {
      segment = `${index === 0 ? 'M' : 'L'}${point.x} ${point.y}`
    }

    return result + segment
  }, '')

  return [path, labelX, labelY, offsetX, offsetY, points]
}

const chooseStepCorner = (
  from: Point,
  to: Point
): Point => {
  const dx = Math.abs(to.x - from.x)
  const dy = Math.abs(to.y - from.y)

  if (dx >= dy) {
    return {
      x: to.x,
      y: from.y
    }
  }

  return {
    x: from.x,
    y: to.y
  }
}

const pushStepPoint = (
  points: Point[],
  point: Point
) => {
  pushPoint(points, point)
}

const buildAutoStepPath = ({
  source,
  target
}: Pick<EdgePathInput, 'source' | 'target'>): Pick<EdgePathResult, 'points' | 'segments' | 'svgPath' | 'label'> => {
  const sourceSide = resolveSide(source.side, source.point, target.point)
  const targetSide = resolveSide(target.side, target.point, source.point)
  const sourceStart = source.side
    ? getStepGapPoint(source.point, sourceSide, target.point)
    : source.point
  const targetEnd = target.side
    ? getStepGapPoint(target.point, targetSide, source.point)
    : target.point
  const points: Point[] = []

  pushStepPoint(points, source.point)
  pushStepPoint(points, sourceStart)

  if (sourceStart.x !== targetEnd.x && sourceStart.y !== targetEnd.y) {
    const sourceHorizontal =
      sourceSide === 'left'
      || sourceSide === 'right'
    const targetHorizontal =
      targetSide === 'left'
      || targetSide === 'right'

    if (sourceHorizontal && targetHorizontal) {
      const splitX =
        sourceSide !== targetSide
          ? (sourceStart.x + targetEnd.x) / 2
          : sourceSide === 'right'
            ? Math.max(sourceStart.x, targetEnd.x) + DEFAULT_STEP_ENDPOINT_OFFSET
            : Math.min(sourceStart.x, targetEnd.x) - DEFAULT_STEP_ENDPOINT_OFFSET
      pushStepPoint(points, {
        x: splitX,
        y: sourceStart.y
      })
      pushStepPoint(points, {
        x: splitX,
        y: targetEnd.y
      })
    } else if (!sourceHorizontal && !targetHorizontal) {
      const splitY =
        sourceSide !== targetSide
          ? (sourceStart.y + targetEnd.y) / 2
          : sourceSide === 'bottom'
            ? Math.max(sourceStart.y, targetEnd.y) + DEFAULT_STEP_ENDPOINT_OFFSET
            : Math.min(sourceStart.y, targetEnd.y) - DEFAULT_STEP_ENDPOINT_OFFSET
      pushStepPoint(points, {
        x: sourceStart.x,
        y: splitY
      })
      pushStepPoint(points, {
        x: targetEnd.x,
        y: splitY
      })
    } else if (sourceHorizontal) {
      pushStepPoint(points, {
        x: targetEnd.x,
        y: sourceStart.y
      })
    } else {
      pushStepPoint(points, {
        x: sourceStart.x,
        y: targetEnd.y
      })
    }
  }

  pushStepPoint(points, targetEnd)
  pushStepPoint(points, target.point)

  const normalized = geometryApi.polyline.normalize(points)

  return {
    points: normalized,
    segments: createSegments(normalized, (index) => index),
    svgPath: buildPolylinePath(normalized),
    label: getPolylineLabel(normalized)
  }
}

const getStepGapPoint = (
  point: Point,
  side: EdgeAnchor['side'],
  reference: Point
): Point => {
  const vector = EDGE_SIDE_VECTOR[side]
  const projectedDistance =
    vector.x !== 0
      ? (reference.x - point.x) * vector.x
      : (reference.y - point.y) * vector.y
  const offset =
    projectedDistance > 0
      ? Math.min(DEFAULT_STEP_ENDPOINT_OFFSET, projectedDistance / 2)
      : DEFAULT_STEP_ENDPOINT_OFFSET

  if (offset <= 0) {
    return point
  }

  return {
    x: point.x + vector.x * offset,
    y: point.y + vector.y * offset
  }
}

const buildStepPathThroughPoints = (
  input: EdgePathInput
): Pick<EdgePathResult, 'points' | 'segments' | 'svgPath' | 'label'> => {
  const anchors = getPathPoints(input)
  const points: Point[] = []
  const segments: EdgePathSegment[] = []

  for (let index = 0; index < anchors.length - 1; index += 1) {
    const anchorFrom = anchors[index]
    const anchorTo = anchors[index + 1]
    const start =
      index === 0 && input.source.side
        ? getStepGapPoint(anchorFrom, input.source.side, anchorTo)
        : anchorFrom
    const end =
      index === anchors.length - 2 && input.target.side
        ? getStepGapPoint(anchorTo, input.target.side, anchorFrom)
        : anchorTo
    const segmentPoints: Point[] = [anchorFrom]

    if (!isSamePoint(anchorFrom, start)) {
      segmentPoints.push(start)
    }

    if (!isSamePoint(start, end) && start.x !== end.x && start.y !== end.y) {
      segmentPoints.push(chooseStepCorner(start, end))
    }

    if (!isSamePoint(start, end)) {
      segmentPoints.push(end)
    }
    if (!isSamePoint(end, anchorTo)) {
      segmentPoints.push(anchorTo)
    }

    createSegments(segmentPoints, index).forEach((segment) => {
      segments.push(segment)
    })
    segmentPoints.forEach((point) => {
      pushPoint(points, point)
    })
  }

  return {
    points,
    segments,
    svgPath: buildPolylinePath(points),
    label: getPolylineLabel(points)
  }
}

const getPolylineLabel = (points: Point[]): Point | undefined => {
  if (points.length === 0) return undefined
  if (points.length === 1) return points[0]
  const mid = Math.floor(points.length / 2)
  if (points.length % 2 === 1) return points[mid]
  const a = points[mid - 1]
  const b = points[mid]
  return { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 }
}

const pointOnCubicBezier = (
  p0: Point,
  p1: Point,
  p2: Point,
  p3: Point,
  t: number
): Point => {
  const mt = 1 - t
  const mt2 = mt * mt
  const mt3 = mt2 * mt
  const t2 = t * t
  const t3 = t2 * t

  return {
    x: mt3 * p0.x + 3 * mt2 * t * p1.x + 3 * mt * t2 * p2.x + t3 * p3.x,
    y: mt3 * p0.y + 3 * mt2 * t * p1.y + 3 * mt * t2 * p2.y + t3 * p3.y
  }
}

const sampleCubicBezier = (
  p0: Point,
  p1: Point,
  p2: Point,
  p3: Point,
  steps = 16
) => {
  const points: Point[] = []

  for (let index = 0; index <= steps; index += 1) {
    points.push(pointOnCubicBezier(p0, p1, p2, p3, index / steps))
  }

  return points
}

const getCurveControls = (
  points: readonly Point[],
  index: number
) => {
  const previous = points[index - 1] ?? points[index]
  const current = points[index]
  const next = points[index + 1]
  const afterNext = points[index + 2] ?? next

  return {
    control1: {
      x: current.x + (next.x - previous.x) / 6,
      y: current.y + (next.y - previous.y) / 6
    },
    control2: {
      x: next.x - (afterNext.x - current.x) / 6,
      y: next.y - (afterNext.y - current.y) / 6
    }
  }
}

const createCurveSegments = (
  points: readonly Point[]
): EdgePathSegment[] => {
  const segments: EdgePathSegment[] = []

  for (let index = 0; index < points.length - 1; index += 1) {
    const from = points[index]
    const to = points[index + 1]
    if (isSamePoint(from, to)) {
      continue
    }

    const {
      control1,
      control2
    } = getCurveControls(points, index)
    const hitPoints = sampleCubicBezier(from, control1, control2, to)

    segments.push({
      from,
      to,
      role: 'insert',
      insertIndex: index,
      insertPoint: pointOnCubicBezier(from, control1, control2, to, 0.5),
      hitPoints
    })
  }

  return segments
}

const getBezierControlOffset = (
  distanceValue: number,
  curvature: number
): number => {
  if (distanceValue >= 0) {
    return 0.5 * distanceValue
  }

  return curvature * 25 * Math.sqrt(-distanceValue)
}

const getBezierControlPoint = ({
  side,
  from,
  to,
  curvature
}: {
  side: EdgeAnchor['side']
  from: Point
  to: Point
  curvature: number
}): Point => {
  switch (side) {
    case 'left':
      return {
        x: from.x - getBezierControlOffset(from.x - to.x, curvature),
        y: from.y
      }
    case 'right':
      return {
        x: from.x + getBezierControlOffset(to.x - from.x, curvature),
        y: from.y
      }
    case 'top':
      return {
        x: from.x,
        y: from.y - getBezierControlOffset(from.y - to.y, curvature)
      }
    case 'bottom':
    default:
      return {
        x: from.x,
        y: from.y + getBezierControlOffset(to.y - from.y, curvature)
      }
  }
}

const getControlWithCurvature = ({
  pos,
  x1,
  y1,
  x2,
  y2,
  c
}: {
  pos: EdgeSide
  x1: number
  y1: number
  x2: number
  y2: number
  c: number
}): [number, number] => {
  switch (pos) {
    case EDGE_SIDE_POSITION.left:
      return [x1 - getBezierControlOffset(x1 - x2, c), y1]
    case EDGE_SIDE_POSITION.right:
      return [x1 + getBezierControlOffset(x2 - x1, c), y1]
    case EDGE_SIDE_POSITION.top:
      return [x1, y1 - getBezierControlOffset(y1 - y2, c)]
    case EDGE_SIDE_POSITION.bottom:
    default:
      return [x1, y1 + getBezierControlOffset(y2 - y1, c)]
  }
}

const getBezierEdgeCenter = ({
  sourceX,
  sourceY,
  targetX,
  targetY,
  sourceControlX,
  sourceControlY,
  targetControlX,
  targetControlY
}: {
  sourceX: number
  sourceY: number
  targetX: number
  targetY: number
  sourceControlX: number
  sourceControlY: number
  targetControlX: number
  targetControlY: number
}): [number, number, number, number] => {
  const centerX =
    sourceX * 0.125
    + sourceControlX * 0.375
    + targetControlX * 0.375
    + targetX * 0.125
  const centerY =
    sourceY * 0.125
    + sourceControlY * 0.375
    + targetControlY * 0.375
    + targetY * 0.125

  return [
    centerX,
    centerY,
    Math.abs(centerX - sourceX),
    Math.abs(centerY - sourceY)
  ]
}

const getBezierPath = ({
  sourceX,
  sourceY,
  sourcePosition = EDGE_SIDE_POSITION.bottom,
  targetX,
  targetY,
  targetPosition = EDGE_SIDE_POSITION.top,
  curvature = 0.25
}: {
  sourceX: number
  sourceY: number
  sourcePosition?: EdgeSide
  targetX: number
  targetY: number
  targetPosition?: EdgeSide
  curvature?: number
}): [path: string, labelX: number, labelY: number, offsetX: number, offsetY: number] => {
  const [sourceControlX, sourceControlY] = getControlWithCurvature({
    pos: sourcePosition,
    x1: sourceX,
    y1: sourceY,
    x2: targetX,
    y2: targetY,
    c: curvature
  })
  const [targetControlX, targetControlY] = getControlWithCurvature({
    pos: targetPosition,
    x1: targetX,
    y1: targetY,
    x2: sourceX,
    y2: sourceY,
    c: curvature
  })
  const [labelX, labelY, offsetX, offsetY] = getBezierEdgeCenter({
    sourceX,
    sourceY,
    targetX,
    targetY,
    sourceControlX,
    sourceControlY,
    targetControlX,
    targetControlY
  })

  return [
    `M${sourceX},${sourceY} C${sourceControlX},${sourceControlY} ${targetControlX},${targetControlY} ${targetX},${targetY}`,
    labelX,
    labelY,
    offsetX,
    offsetY
  ]
}

const buildSmoothCurvePath = (points: Point[]) => {
  if (points.length === 0) return ''
  if (points.length === 1) {
    return `M ${points[0].x} ${points[0].y}`
  }

  let path = `M ${points[0].x} ${points[0].y}`

  for (let index = 0; index < points.length - 1; index += 1) {
    const current = points[index]
    const next = points[index + 1]
    const { control1, control2 } = getCurveControls(points, index)

    path += ` C ${control1.x} ${control1.y} ${control2.x} ${control2.y} ${next.x} ${next.y}`
  }

  return path
}

const linearRouter: EdgeRouter = (input) => {
  const points = getPathPoints(input)
  return {
    points,
    segments: createSegments(points, (index) => index),
    svgPath: buildPolylinePath(points),
    label: getPolylineLabel(points)
  }
}

const stepRouter: EdgeRouter = ({ edge, source, target }) => {
  if (readEdgePoints(edge.points).length > 0) {
    const points = geometryApi.polyline.normalize(getPathPoints({
      edge,
      source,
      target
    }))

    return {
      points,
      segments: createSegments(
        points,
        (index) => index,
        (index) => (
          index > 0 && index < points.length - 2
            ? 'control'
            : 'insert'
        )
      ),
      svgPath: buildPolylinePath(points),
      label: getPolylineLabel(points)
    }
  }

  return buildAutoStepPath({
    source,
    target
  })
}

const curveRouter: EdgeRouter = ({ edge, source, target }) => {
  const points = getPathPoints({
    edge,
    source,
    target
  })
  if (points.length <= 2) {
    const sourceSide = resolveSide(source.side, source.point, target.point)
    const targetSide = resolveSide(target.side, target.point, source.point)
    const sourceControl = getBezierControlPoint({
      side: sourceSide,
      from: source.point,
      to: target.point,
      curvature: DEFAULT_CURVE_CURVATURE
    })
    const targetControl = getBezierControlPoint({
      side: targetSide,
      from: target.point,
      to: source.point,
      curvature: DEFAULT_CURVE_CURVATURE
    })
    const [path, labelX, labelY] = getBezierPath({
      sourceX: source.point.x,
      sourceY: source.point.y,
      targetX: target.point.x,
      targetY: target.point.y,
      sourcePosition: sourceSide,
      targetPosition: targetSide,
      curvature: DEFAULT_CURVE_CURVATURE
    })
    return {
      points,
      segments: [{
        from: source.point,
        to: target.point,
        role: 'insert',
        insertIndex: 0,
        insertPoint: pointOnCubicBezier(source.point, sourceControl, targetControl, target.point, 0.5),
        hitPoints: sampleCubicBezier(source.point, sourceControl, targetControl, target.point)
      }],
      svgPath: path,
      label: { x: labelX, y: labelY }
    }
  }

  return {
    points,
    segments: createCurveSegments(points),
    svgPath: buildSmoothCurvePath(points),
    label: getPolylineLabel(points)
  }
}

const customRouter: EdgeRouter = (input) => linearRouter(input)
const filletRouter: EdgeRouter = (input) => {
  const path = stepRouter(input)

  return {
    ...path,
    svgPath: buildFilletPath(path.points)
  }
}

const EDGE_ROUTERS: Record<string, EdgeRouter> = {
  straight: linearRouter,
  elbow: stepRouter,
  fillet: filletRouter,
  curve: curveRouter,
  custom: customRouter
}

export const getEdgePath = (input: EdgePathInput): EdgePathResult => {
  const router = EDGE_ROUTERS[input.edge.type] ?? linearRouter
  return router(input)
}

export const resolveEdgePathFromRects = ({
  edge,
  source,
  target
}: ResolveEdgePathFromRectsInput): ResolvedEdgePathFromRects => {
  const ends = resolveEdgeEnds({
    edge,
    source,
    target
  })
  if (!ends) {
    throw new Error(`Unable to resolve edge path for ${edge.id}.`)
  }
  const path = getEdgePath({
    edge,
    source: {
      point: ends.source.point,
      side: ends.source.anchor?.side
    },
    target: {
      point: ends.target.point,
      side: ends.target.anchor?.side
    }
  })
  return {
    ends,
    path
  }
}
