import type {
  ComponentProps,
  ReactNode
} from 'react'
import type { EdgeMarker } from '@whiteboard/core/types'
import { product } from '@whiteboard/product'
import type {
  WhiteboardEdgeMarkerChoice,
  WhiteboardEdgeMarkerSide as EdgeMarkerSide
} from '@whiteboard/product/edge/markers'

type EdgeGlyphProps = ComponentProps<'svg'>
type MarkerPaint = 'currentColor' | 'context-stroke'

type EdgeMarkerSpec = {
  renderEndShape: (paint: MarkerPaint) => ReactNode
}

const MARKER_VIEW_BOX = '0 0 12 12'
const MARKER_SIZE = 4.75
const MARKER_REF_X: Record<EdgeMarkerSide, number> = {
  start: 2,
  end: 10
}

const EDGE_MARKER_REGISTRY = {
  arrow: {
    renderEndShape: (paint) => (
      <path
        d="M3 2 L10 6 L3 10"
        stroke={paint}
        strokeWidth={1.6}
        strokeLinecap="round"
        strokeLinejoin="round"
        fill="none"
      />
    )
  },
  'arrow-fill': {
    renderEndShape: (paint) => (
      <path
        d="M2.5 2 L10 6 L2.5 10 Z"
        fill={paint}
      />
    )
  },
  circle: {
    renderEndShape: (paint) => (
      <circle
        cx={6.5}
        cy={6}
        r={3.25}
        stroke={paint}
        strokeWidth={1.4}
        fill="none"
      />
    )
  },
  'circle-fill': {
    renderEndShape: (paint) => (
      <circle
        cx={6.5}
        cy={6}
        r={3.25}
        fill={paint}
      />
    )
  },
  diamond: {
    renderEndShape: (paint) => (
      <path
        d="M3 6 L6.5 2.5 L10 6 L6.5 9.5 Z"
        stroke={paint}
        strokeWidth={1.4}
        strokeLinejoin="round"
        fill="none"
      />
    )
  },
  'diamond-fill': {
    renderEndShape: (paint) => (
      <path
        d="M3 6 L6.5 2.5 L10 6 L6.5 9.5 Z"
        fill={paint}
      />
    )
  },
  bar: {
    renderEndShape: (paint) => (
      <path
        d="M10 2 L10 10"
        stroke={paint}
        strokeWidth={1.8}
        strokeLinecap="round"
      />
    )
  },
  'double-bar': {
    renderEndShape: (paint) => (
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
  },
  'circle-arrow': {
    renderEndShape: (paint) => (
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
  },
  'circle-bar': {
    renderEndShape: (paint) => (
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
} as const satisfies Record<EdgeMarker, EdgeMarkerSpec>

const EDGE_MARKERS = Object.keys(EDGE_MARKER_REGISTRY) as EdgeMarker[]

const readEdgeMarkerSpec = (
  marker: EdgeMarker
) => EDGE_MARKER_REGISTRY[marker]

const renderEdgeMarkerShape = ({
  marker,
  side,
  paint
}: {
  marker: EdgeMarker
  side: EdgeMarkerSide
  paint: MarkerPaint
}) => side === 'end'
  ? readEdgeMarkerSpec(marker).renderEndShape(paint)
  : (
      <g transform="translate(12 0) scale(-1 1)">
        {readEdgeMarkerSpec(marker).renderEndShape(paint)}
      </g>
    )

export const readEdgeMarkerChoices = (
  side: EdgeMarkerSide
): readonly WhiteboardEdgeMarkerChoice[] =>
  product.edge.markers.WHITEBOARD_EDGE_MARKER_CHOICES[side]

export const readEdgeMarkerId = (
  marker: EdgeMarker,
  side: EdgeMarkerSide
) => `wb-edge-marker-${marker}-${side}`

export const resolveEdgeMarkerUrl = (
  marker: EdgeMarker | undefined,
  side: EdgeMarkerSide
) => marker
  ? `url(#${readEdgeMarkerId(marker, side)})`
  : undefined

export const EdgeCanvasMarkerDefs = () => (
  <>
    {EDGE_MARKERS.flatMap((marker) => ([
      <marker
        key={`${marker}:start`}
        id={readEdgeMarkerId(marker, 'start')}
        markerWidth={MARKER_SIZE}
        markerHeight={MARKER_SIZE}
        viewBox={MARKER_VIEW_BOX}
        refX={MARKER_REF_X.start}
        refY={6}
        orient="auto"
        markerUnits="strokeWidth"
      >
        {renderEdgeMarkerShape({
          marker,
          side: 'start',
          paint: 'context-stroke'
        })}
      </marker>,
      <marker
        key={`${marker}:end`}
        id={readEdgeMarkerId(marker, 'end')}
        markerWidth={MARKER_SIZE}
        markerHeight={MARKER_SIZE}
        viewBox={MARKER_VIEW_BOX}
        refX={MARKER_REF_X.end}
        refY={6}
        orient="auto"
        markerUnits="strokeWidth"
      >
        {renderEdgeMarkerShape({
          marker,
          side: 'end',
          paint: 'context-stroke'
        })}
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
  side: EdgeMarkerSide
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
        {renderEdgeMarkerShape({
          marker,
          side,
          paint: 'currentColor'
        })}
      </g>
    ) : null}
  </svg>
)
