import type { EdgeMarker } from '@whiteboard/core/types'

export type WhiteboardEdgeMarkerSide = 'start' | 'end'

export type WhiteboardEdgeMarkerSpec = {
  value: EdgeMarker
  label: string
  sides: readonly WhiteboardEdgeMarkerSide[]
}

export type WhiteboardEdgeMarkerChoice = {
  key: EdgeMarker | 'none'
  label: string
  value?: EdgeMarker
}

export const WHITEBOARD_EDGE_MARKERS: readonly WhiteboardEdgeMarkerSpec[] = [
  { value: 'arrow', label: 'Arrow', sides: ['start', 'end'] },
  { value: 'arrow-fill', label: 'Arrow fill', sides: ['start', 'end'] },
  { value: 'circle', label: 'Circle', sides: ['start', 'end'] },
  { value: 'circle-fill', label: 'Circle fill', sides: ['start', 'end'] },
  { value: 'diamond', label: 'Diamond', sides: ['start', 'end'] },
  { value: 'diamond-fill', label: 'Diamond fill', sides: ['start', 'end'] },
  { value: 'bar', label: 'Bar', sides: ['start', 'end'] },
  { value: 'double-bar', label: 'Double bar', sides: ['start', 'end'] },
  { value: 'circle-arrow', label: 'Circle arrow', sides: ['start', 'end'] },
  { value: 'circle-bar', label: 'Circle bar', sides: ['start', 'end'] }
] as const

const WHITEBOARD_EDGE_MARKER_SPEC_BY_VALUE = new Map(
  WHITEBOARD_EDGE_MARKERS.map((marker) => [marker.value, marker] as const)
)

export const readWhiteboardEdgeMarkerSpec = (
  marker: EdgeMarker
): WhiteboardEdgeMarkerSpec => WHITEBOARD_EDGE_MARKER_SPEC_BY_VALUE.get(marker)!

const createMarkerChoices = (
  side: WhiteboardEdgeMarkerSide
): readonly WhiteboardEdgeMarkerChoice[] => [
  {
    key: 'none',
    label: 'None',
    value: undefined
  },
  ...WHITEBOARD_EDGE_MARKERS
    .filter((marker) => marker.sides.includes(side))
    .map((marker) => ({
      key: marker.value,
      label: marker.label,
      value: marker.value
    }))
]

export const WHITEBOARD_EDGE_MARKER_CHOICES = {
  start: createMarkerChoices('start'),
  end: createMarkerChoices('end')
} as const satisfies Record<WhiteboardEdgeMarkerSide, readonly WhiteboardEdgeMarkerChoice[]>
