import type {
  ComponentProps,
  ReactNode
} from 'react'
import type { EdgeMarker } from '@whiteboard/core/types'

type EdgeGlyphProps = ComponentProps<'svg'>
export type EdgeMarkerSide = 'start' | 'end'
type MarkerPaint = 'currentColor' | 'context-stroke'

type EdgeMarkerSpec = {
  label: string
  sides: readonly EdgeMarkerSide[]
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
    label: 'Arrow',
    sides: ['start', 'end'],
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
    label: 'Arrow fill',
    sides: ['start', 'end'],
    renderEndShape: (paint) => (
      <path
        d="M2.5 2 L10 6 L2.5 10 Z"
        fill={paint}
      />
    )
  },
  circle: {
    label: 'Circle',
    sides: ['start', 'end'],
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
    label: 'Circle fill',
    sides: ['start', 'end'],
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
    label: 'Diamond',
    sides: ['start', 'end'],
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
    label: 'Diamond fill',
    sides: ['start', 'end'],
    renderEndShape: (paint) => (
      <path
        d="M3 6 L6.5 2.5 L10 6 L6.5 9.5 Z"
        fill={paint}
      />
    )
  },
  bar: {
    label: 'Bar',
    sides: ['start', 'end'],
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
    label: 'Double bar',
    sides: ['start', 'end'],
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
    label: 'Circle arrow',
    sides: ['start', 'end'],
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
    label: 'Circle bar',
    sides: ['start', 'end'],
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

type EdgeMarkerChoice = {
  key: EdgeMarker | 'none'
  label: string
  value?: EdgeMarker
}

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
): readonly EdgeMarkerChoice[] => EDGE_MARKER_CHOICES[side]

const EDGE_MARKER_CHOICES: Record<EdgeMarkerSide, readonly EdgeMarkerChoice[]> = {
  start: [
    {
      key: 'none',
      label: 'None',
      value: undefined
    },
    ...EDGE_MARKERS
      .filter((marker) => readEdgeMarkerSpec(marker).sides.includes('start'))
      .map((marker) => ({
        key: marker,
        label: readEdgeMarkerSpec(marker).label,
        value: marker
      }))
  ],
  end: [
    {
      key: 'none',
      label: 'None',
      value: undefined
    },
    ...EDGE_MARKERS
      .filter((marker) => readEdgeMarkerSpec(marker).sides.includes('end'))
      .map((marker) => ({
        key: marker,
        label: readEdgeMarkerSpec(marker).label,
        value: marker
      }))
  ]
}

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
