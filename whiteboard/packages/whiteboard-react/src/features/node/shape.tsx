import {
  useId,
  type ReactNode
} from 'react'
import type { ShapeKind } from '@whiteboard/core/node'

type ShapeColors = {
  fill: string
  fillOpacity?: number
  stroke: string
  strokeOpacity?: number
  strokeDash?: readonly number[]
  strokeWidth: number
}

type ShapePaint = {
  fill?: string
  fillOpacity?: number
  stroke?: string
  strokeOpacity?: number
  strokeDash?: readonly number[]
  strokeWidth?: number
}

const SHAPE_MIN = 3
const SHAPE_MAX = 97
const SHAPE_MID = 50

const readShapeStrokeLinecap = (
  kind: ShapeKind
): 'round' | 'butt' => kind === 'cloud' || kind === 'highlight' ? 'round' : 'butt'

const readShapePaintProps = (
  kind: ShapeKind,
  paint: ShapePaint
) => ({
  fill: paint.fill,
  fillOpacity: paint.fillOpacity,
  stroke: paint.stroke,
  strokeOpacity: paint.strokeOpacity,
  strokeDasharray: paint.strokeDash?.join(' '),
  strokeWidth: paint.strokeWidth,
  strokeLinejoin: 'round' as const,
  strokeLinecap: readShapeStrokeLinecap(kind)
})

const renderOuterShapeGraphic = (
  kind: ShapeKind,
  paint: ShapePaint = {}
): ReactNode => {
  const common = readShapePaintProps(kind, paint)

  switch (kind) {
    case 'rect':
      return <rect x={SHAPE_MIN} y={SHAPE_MIN} width={SHAPE_MAX - SHAPE_MIN} height={SHAPE_MAX - SHAPE_MIN} rx="2" {...common} />
    case 'rounded-rect':
      return <rect x={SHAPE_MIN} y={SHAPE_MIN} width={SHAPE_MAX - SHAPE_MIN} height={SHAPE_MAX - SHAPE_MIN} rx="14" {...common} />
    case 'pill':
      return <rect x={SHAPE_MIN} y={SHAPE_MIN} width={SHAPE_MAX - SHAPE_MIN} height={SHAPE_MAX - SHAPE_MIN} rx="48" {...common} />
    case 'ellipse':
      return <ellipse cx={SHAPE_MID} cy={SHAPE_MID} rx="47" ry="47" {...common} />
    case 'diamond':
      return <polygon points={`${SHAPE_MID},${SHAPE_MIN} ${SHAPE_MAX},${SHAPE_MID} ${SHAPE_MID},${SHAPE_MAX} ${SHAPE_MIN},${SHAPE_MID}`} {...common} />
    case 'triangle':
      return <polygon points={`${SHAPE_MID},${SHAPE_MIN} ${SHAPE_MAX},${SHAPE_MAX} ${SHAPE_MIN},${SHAPE_MAX}`} {...common} />
    case 'hexagon':
      return <polygon points={`22,${SHAPE_MIN} 78,${SHAPE_MIN} ${SHAPE_MAX},${SHAPE_MID} 78,${SHAPE_MAX} 22,${SHAPE_MAX} ${SHAPE_MIN},${SHAPE_MID}`} {...common} />
    case 'parallelogram':
      return <polygon points={`20,${SHAPE_MIN} ${SHAPE_MAX},${SHAPE_MIN} 80,${SHAPE_MAX} ${SHAPE_MIN},${SHAPE_MAX}`} {...common} />
    case 'cylinder':
      return (
        <path
          d="M10 14 C10 4 90 4 90 14 V86 C90 96 10 96 10 86 Z"
          {...common}
        />
      )
    case 'document':
      return (
        <path
          d="M3 3 H97 V84 C84 96 68 74 50 84 C32 96 16 74 3 84 Z"
          {...common}
        />
      )
    case 'predefined-process':
      return (
        <rect x={SHAPE_MIN} y={SHAPE_MIN} width={SHAPE_MAX - SHAPE_MIN} height={SHAPE_MAX - SHAPE_MIN} rx="2" {...common} />
      )
    case 'callout':
      return (
        <path
          d="M9 4 H91 C95 4 97 8 97 13 V71 C97 78 92 82 86 82 H58 L35 97 L40 82 H14 C8 82 3 78 3 71 V13 C3 8 5 4 9 4 Z"
          {...common}
        />
      )
    case 'cloud':
      return (
        <path
          d="M23 86 H76 C88 86 97 77 97 65 C97 53 89 44 77 43 C74 27 62 17 50 17 C39 17 29 23 23 33 C11 33 3 42 3 53 C3 65 12 75 23 75 C22 81 22 84 23 86 Z"
          {...common}
        />
      )
    case 'arrow-sticker':
      return (
        <polygon
          points="3,25 58,25 58,4 97,50 58,96 58,75 3,75"
          {...common}
        />
      )
    case 'highlight':
      return (
        <rect x="3" y="22" width="94" height="56" rx="18" {...common} />
      )
  }
}

const renderShapeDecorations = (
  kind: ShapeKind,
  colors: ShapeColors
): ReactNode => {
  switch (kind) {
    case 'cylinder':
      return (
        <>
          <ellipse
            cx={SHAPE_MID}
            cy="14"
            rx="40"
            ry="10"
            fill="none"
            stroke={colors.stroke}
            strokeOpacity={colors.strokeOpacity}
            strokeDasharray={colors.strokeDash?.join(' ')}
            strokeWidth={colors.strokeWidth}
            strokeLinecap="round"
          />
          <path
            d="M10 86 C10 76 90 76 90 86"
            fill="none"
            stroke={colors.stroke}
            strokeOpacity={colors.strokeOpacity}
            strokeDasharray={colors.strokeDash?.join(' ')}
            strokeWidth={colors.strokeWidth}
            strokeLinecap="round"
          />
        </>
      )
    case 'predefined-process':
      return (
        <path
          d={`M18 ${SHAPE_MIN} V${SHAPE_MAX} M82 ${SHAPE_MIN} V${SHAPE_MAX}`}
          fill="none"
          stroke={colors.stroke}
          strokeOpacity={colors.strokeOpacity}
          strokeDasharray={colors.strokeDash?.join(' ')}
          strokeWidth={colors.strokeWidth}
        />
      )
    case 'highlight':
      return (
        <path
          d="M8 79 C25 89 41 69 57 79 S83 89 96 78"
          fill="none"
          stroke={colors.stroke}
          strokeOpacity={colors.strokeOpacity}
          strokeDasharray={colors.strokeDash?.join(' ')}
          strokeWidth={Math.max(1, colors.strokeWidth - 0.2)}
          strokeLinecap="round"
        />
      )
    default:
      return null
  }
}

export const ShapeGlyph = ({
  kind,
  size,
  width,
  height,
  strokeWidth = 1.5,
  fill = 'none',
  stroke = 'currentColor',
  fillOpacity,
  strokeOpacity,
  strokeDash,
  className
}: {
  kind: ShapeKind
  size?: number
  width?: number | string
  height?: number | string
  strokeWidth?: number
  fill?: string
  stroke?: string
  fillOpacity?: number
  strokeOpacity?: number
  strokeDash?: readonly number[]
  className?: string
}) => {
  const clipId = useId().replace(/:/g, '_')
  const visibleStrokeWidth = Math.max(0, strokeWidth)
  const strokePaintWidth = visibleStrokeWidth * 2

  return (
    <svg
      viewBox="0 0 100 100"
      width={width ?? size}
      height={height ?? size ?? width}
      preserveAspectRatio="none"
      aria-hidden="true"
      className={className}
      fill="none"
    >
      <defs>
        <clipPath id={clipId} clipPathUnits="userSpaceOnUse">
          {renderOuterShapeGraphic(kind)}
        </clipPath>
      </defs>
      {renderOuterShapeGraphic(kind, {
        fill,
        fillOpacity,
        stroke: 'none'
      })}
      {strokePaintWidth > 0 ? (
        <g clipPath={`url(#${clipId})`}>
          {renderOuterShapeGraphic(kind, {
            fill: 'none',
            stroke,
            strokeOpacity,
            strokeDash,
            strokeWidth: strokePaintWidth
          })}
        </g>
      ) : null}
      {renderShapeDecorations(kind, {
        fill,
        fillOpacity,
        stroke,
        strokeOpacity,
        strokeDash,
        strokeWidth: visibleStrokeWidth
      })}
    </svg>
  )
}
