import { useId, type ReactNode } from 'react'
import {
  readShapeDescriptor,
  type ShapeKind,
  type ShapePathSpec
} from '@whiteboard/core/node'

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

const readResolvedPaintValue = (
  mode: ShapePathSpec['fill'] | ShapePathSpec['stroke'] | undefined,
  value: string | undefined
) => mode === 'none'
  ? 'none'
  : (value ?? 'none')

const readResolvedStrokeWidth = (
  spec: ShapePathSpec,
  strokeWidth: number | undefined
) => {
  const baseWidth = Math.max(0, strokeWidth ?? 0)
  const adjustedWidth = baseWidth + (spec.strokeWidthAdjust ?? 0)
  const nextWidth = spec.strokeWidthMin === undefined
    ? adjustedWidth
    : Math.max(spec.strokeWidthMin, adjustedWidth)

  return Math.max(0, nextWidth)
}

const renderShapePath = (
  spec: ShapePathSpec,
  paint: ShapePaint,
  key?: string
): ReactNode => {
  const strokeWidth = readResolvedStrokeWidth(spec, paint.strokeWidth)

  return (
    <path
      key={key}
      d={spec.d}
      fill={readResolvedPaintValue(spec.fill, paint.fill)}
      fillOpacity={spec.fill === 'none' ? undefined : paint.fillOpacity}
      stroke={readResolvedPaintValue(spec.stroke, paint.stroke)}
      strokeOpacity={spec.stroke === 'none' ? undefined : paint.strokeOpacity}
      strokeDasharray={spec.stroke === 'none' ? undefined : paint.strokeDash?.join(' ')}
      strokeWidth={spec.stroke === 'none' ? undefined : strokeWidth}
      strokeLinejoin={spec.strokeLinejoin ?? 'round'}
      strokeLinecap={spec.strokeLinecap ?? 'butt'}
      fillRule={spec.fillRule}
    />
  )
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
  const descriptor = readShapeDescriptor(kind)
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
          <path
            d={descriptor.visual.outer.d}
            fillRule={descriptor.visual.outer.fillRule}
          />
        </clipPath>
      </defs>
      {renderShapePath(descriptor.visual.outer, {
        fill,
        fillOpacity,
        stroke: 'none',
        strokeWidth: 0
      })}
      {strokePaintWidth > 0 ? (
        <g clipPath={`url(#${clipId})`}>
          {renderShapePath(descriptor.visual.outer, {
            fill: 'none',
            stroke,
            strokeOpacity,
            strokeDash,
            strokeWidth: strokePaintWidth
          })}
        </g>
      ) : null}
      {descriptor.visual.decorations?.map((spec, index) => renderShapePath(
        spec,
        {
          fill,
          fillOpacity,
          stroke,
          strokeOpacity,
          strokeDash,
          strokeWidth: visibleStrokeWidth
        },
        `${kind}:${index}`
      ))}
    </svg>
  )
}
