import type { ComponentProps, ReactNode } from 'react'
import type {
  EdgeDash,
  EdgeMarker,
  EdgeType
} from '@whiteboard/core/types'
import {
  resolvePaletteColor
} from '@whiteboard/react/features/palette'

type EdgeGlyphProps = ComponentProps<'svg'>
type MarkerSide = 'start' | 'end'
type MarkerPaint = 'currentColor' | 'context-stroke'

const MARKER_VIEW_BOX = '0 0 12 12'
const MARKER_SIZE = 4.75
const MARKER_START_REF_X = 2
const MARKER_END_REF_X = 10

export const EDGE_RENDER_MARKERS: readonly EdgeMarker[] = [
  'arrow',
  'arrow-fill',
  'circle',
  'circle-fill',
  'diamond',
  'diamond-fill',
  'bar',
  'double-bar',
  'circle-arrow',
  'circle-bar'
] as const

const readEdgeDashArray = (
  value: EdgeDash | undefined
) => {
  if (value === 'dashed') {
    return '8 6'
  }
  if (value === 'dotted') {
    return '2 4'
  }

  return undefined
}

const renderEndMarkerShape = (
  marker: EdgeMarker,
  paint: MarkerPaint
): ReactNode => {
  switch (marker) {
    case 'arrow':
      return (
        <path
          d="M3 2 L10 6 L3 10"
          stroke={paint}
          strokeWidth={1.6}
          strokeLinecap="round"
          strokeLinejoin="round"
          fill="none"
        />
      )
    case 'arrow-fill':
      return (
        <path
          d="M2.5 2 L10 6 L2.5 10 Z"
          fill={paint}
        />
      )
    case 'circle':
      return (
        <circle
          cx={6.5}
          cy={6}
          r={3.25}
          stroke={paint}
          strokeWidth={1.4}
          fill="none"
        />
      )
    case 'circle-fill':
      return (
        <circle
          cx={6.5}
          cy={6}
          r={3.25}
          fill={paint}
        />
      )
    case 'diamond':
      return (
        <path
          d="M3 6 L6.5 2.5 L10 6 L6.5 9.5 Z"
          stroke={paint}
          strokeWidth={1.4}
          strokeLinejoin="round"
          fill="none"
        />
      )
    case 'diamond-fill':
      return (
        <path
          d="M3 6 L6.5 2.5 L10 6 L6.5 9.5 Z"
          fill={paint}
        />
      )
    case 'bar':
      return (
        <path
          d="M10 2 L10 10"
          stroke={paint}
          strokeWidth={1.8}
          strokeLinecap="round"
        />
      )
    case 'double-bar':
      return (
        <>
          <path
            d="M7.2 2 L7.2 10"
            stroke={paint}
            strokeWidth={1.7}
            strokeLinecap="round"
          />
          <path
            d="M10 2 L10 10"
            stroke={paint}
            strokeWidth={1.7}
            strokeLinecap="round"
          />
        </>
      )
    case 'circle-arrow':
      return (
        <>
          <circle
            cx={4.25}
            cy={6}
            r={2.75}
            stroke={paint}
            strokeWidth={1.35}
            fill="none"
          />
          <path
            d="M6.6 2.5 L10 6 L6.6 9.5"
            stroke={paint}
            strokeWidth={1.5}
            strokeLinecap="round"
            strokeLinejoin="round"
            fill="none"
          />
        </>
      )
    case 'circle-bar':
      return (
        <>
          <circle
            cx={5}
            cy={6}
            r={3}
            stroke={paint}
            strokeWidth={1.35}
            fill="none"
          />
          <path
            d="M10 2 L10 10"
            stroke={paint}
            strokeWidth={1.8}
            strokeLinecap="round"
          />
        </>
      )
  }
}

const renderMarkerShape = (
  marker: EdgeMarker,
  side: MarkerSide,
  paint: MarkerPaint
) => side === 'end'
  ? renderEndMarkerShape(marker, paint)
  : (
      <g transform="translate(12 0) scale(-1 1)">
        {renderEndMarkerShape(marker, paint)}
      </g>
    )

const readMarkerRefX = (
  side: MarkerSide
) => side === 'start'
  ? MARKER_START_REF_X
  : MARKER_END_REF_X

export const readEdgeMarkerId = (
  marker: EdgeMarker,
  side: MarkerSide
) => `wb-edge-marker-${marker}-${side}`

export const resolveEdgeMarkerUrl = (
  marker: EdgeMarker | undefined,
  side: MarkerSide
) => marker
  ? `url(#${readEdgeMarkerId(marker, side)})`
  : undefined

export const EdgeCanvasMarkerDefs = () => (
  <>
    {EDGE_RENDER_MARKERS.flatMap((marker) => ([
      <marker
        key={`${marker}:start`}
        id={readEdgeMarkerId(marker, 'start')}
        markerWidth={MARKER_SIZE}
        markerHeight={MARKER_SIZE}
        viewBox={MARKER_VIEW_BOX}
        refX={readMarkerRefX('start')}
        refY={6}
        orient="auto"
        markerUnits="strokeWidth"
      >
        {renderMarkerShape(marker, 'start', 'context-stroke')}
      </marker>,
      <marker
        key={`${marker}:end`}
        id={readEdgeMarkerId(marker, 'end')}
        markerWidth={MARKER_SIZE}
        markerHeight={MARKER_SIZE}
        viewBox={MARKER_VIEW_BOX}
        refX={readMarkerRefX('end')}
        refY={6}
        orient="auto"
        markerUnits="strokeWidth"
      >
        {renderMarkerShape(marker, 'end', 'context-stroke')}
      </marker>
    ]))}
  </>
)

export const EdgeMarkerGlyph = ({
  marker,
  side,
  className = 'size-6',
  ...props
}: EdgeGlyphProps & {
  marker?: EdgeMarker
  side: MarkerSide
}) => (
  <svg
    viewBox="0 0 24 24"
    className={className}
    fill="none"
    {...props}
  >
    <path
      d="M4 12 H20"
      stroke="currentColor"
      strokeWidth={1.8}
      strokeLinecap="round"
    />
    {marker ? (
      <g transform={`translate(${side === 'start' ? 2 : 10} 6)`}>
        {renderMarkerShape(marker, side, 'currentColor')}
      </g>
    ) : null}
  </svg>
)

export const EdgeLineGlyph = ({
  type = 'straight',
  dash = 'solid',
  color,
  opacity = 1,
  className = 'size-6',
  ...props
}: EdgeGlyphProps & {
  type?: EdgeType
  dash?: EdgeDash
  color?: string
  opacity?: number
}) => {
  const stroke = resolvePaletteColor(color) ?? color ?? 'currentColor'
  const dashArray = readEdgeDashArray(dash)

  return (
    <svg
      viewBox="0 0 24 24"
      className={className}
      fill="none"
      {...props}
    >
      {type === 'curve' ? (
        <path
          d="M4 18 C9 4, 15 20, 20 6"
          stroke={stroke}
          strokeWidth={1.8}
          strokeDasharray={dashArray}
          strokeLinecap="round"
          opacity={opacity}
        />
      ) : type === 'fillet' ? (
        <path
          d="M4 18 H11 Q14 18 14 15 V6 H20"
          stroke={stroke}
          strokeWidth={1.8}
          strokeDasharray={dashArray}
          strokeLinecap="round"
          strokeLinejoin="round"
          opacity={opacity}
        />
      ) : type === 'elbow' ? (
        <path
          d="M4 18 H12 V6 H20"
          stroke={stroke}
          strokeWidth={1.8}
          strokeDasharray={dashArray}
          strokeLinecap="round"
          strokeLinejoin="round"
          opacity={opacity}
        />
      ) : (
        <path
          d="M4 18 L20 6"
          stroke={stroke}
          strokeWidth={1.8}
          strokeDasharray={dashArray}
          strokeLinecap="round"
          opacity={opacity}
        />
      )}
    </svg>
  )
}
