import type { Point } from '@whiteboard/core/types'

const midpoint = (
  left: Point,
  right: Point
): Point => ({
  x: (left.x + right.x) / 2,
  y: (left.y + right.y) / 2
})

export const buildDrawPath = (
  points: readonly Point[]
) => {
  if (points.length === 0) {
    return ''
  }

  if (points.length === 1) {
    const point = points[0]
    return `M ${point.x} ${point.y}`
  }

  if (points.length === 2) {
    const [from, to] = points
    return `M ${from.x} ${from.y} L ${to.x} ${to.y}`
  }

  let path = `M ${points[0].x} ${points[0].y}`

  for (let index = 1; index < points.length - 1; index += 1) {
    const point = points[index]
    const next = points[index + 1]
    const control = midpoint(point, next)
    path += ` Q ${point.x} ${point.y} ${control.x} ${control.y}`
  }

  const last = points[points.length - 1]
  path += ` L ${last.x} ${last.y}`
  return path
}

export const DrawStrokeShape = ({
  points,
  color,
  width,
  opacity = 1
}: {
  points: readonly Point[]
  color: string
  width: number
  opacity?: number
}) => {
  if (!points.length) {
    return null
  }

  if (points.length === 1) {
    const point = points[0]
    return (
      <circle
        cx={point.x}
        cy={point.y}
        r={Math.max(1, width / 2)}
        fill={color}
        fillOpacity={opacity}
        pointerEvents="none"
      />
    )
  }

  return (
    <path
      d={buildDrawPath(points)}
      fill="none"
      stroke={color}
      strokeWidth={width}
      strokeOpacity={opacity}
      strokeLinecap="round"
      strokeLinejoin="round"
      pointerEvents="none"
    />
  )
}

export const DrawStrokeSelectionShape = ({
  points,
  width
}: {
  points: readonly Point[]
  width: number
}) => {
  const haloWidth = Math.max(8, width + 6)

  if (!points.length) {
    return null
  }

  if (points.length === 1) {
    const point = points[0]
    return (
      <circle
        cx={point.x}
        cy={point.y}
        r={Math.max(6, width / 2 + 4)}
        fill="none"
        stroke="rgb(from var(--ui-accent) r g b / 0.3)"
        strokeWidth={haloWidth}
        vectorEffect="non-scaling-stroke"
        pointerEvents="none"
      />
    )
  }

  return (
    <path
      d={buildDrawPath(points)}
      fill="none"
      stroke="rgb(from var(--ui-accent) r g b / 0.3)"
      strokeWidth={haloWidth}
      strokeLinecap="round"
      strokeLinejoin="round"
      vectorEffect="non-scaling-stroke"
      pointerEvents="none"
    />
  )
}

export const DrawStrokeHitShape = ({
  points,
  width
}: {
  points: readonly Point[]
  width: number
}) => {
  if (!points.length) {
    return null
  }

  if (points.length === 1) {
    const point = points[0]
    return (
      <circle
        cx={point.x}
        cy={point.y}
        r={Math.max(6, width / 2)}
        fill="rgba(0, 0, 0, 0.001)"
        pointerEvents="all"
      />
    )
  }

  return (
    <path
      d={buildDrawPath(points)}
      fill="none"
      stroke="rgba(0, 0, 0, 0.001)"
      strokeWidth={Math.max(12, width + 10)}
      strokeLinecap="round"
      strokeLinejoin="round"
      pointerEvents="stroke"
      vectorEffect="non-scaling-stroke"
    />
  )
}
