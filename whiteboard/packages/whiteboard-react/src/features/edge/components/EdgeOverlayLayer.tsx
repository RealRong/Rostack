import type {
  CSSProperties
} from 'react'
import {
  useInteraction,
  useTool
} from '../../../runtime/hooks/useEditor'
import { useEditorRuntime } from '../../../runtime/hooks/useEditor'
import { usePickRef } from '../../../runtime/hooks/usePickRef'
import { useStoreValue } from '../../../runtime/hooks/useStoreValue'
import type {
  SelectedEdgeRoutePointView,
  SelectedEdgeView
} from '../../../types/edge'
import { useSelectedEdgeView } from '../hooks/useEdgeView'
import {
  EDGE_ARROW_END_ID,
  EDGE_ARROW_START_ID,
  EDGE_DASH_ANIMATION
} from '../constants'

const resolveMarker = (value: string | undefined, fallbackId: string) => {
  if (!value) return undefined
  if (value.startsWith('url(')) return value
  if (value === 'arrow') return `url(#${fallbackId})`
  return `url(#${value})`
}

const EdgeHintOverlay = () => {
  const editor = useEditorRuntime()
  const hint = useStoreValue(editor.read.overlay.feedback.edgeGuide)
  const zoom = useStoreValue(editor.state.viewport).zoom
  const { path, connect } = hint
  const snap = connect && (
    connect.resolution.mode === 'outline'
    || connect.resolution.mode === 'handle'
  )
    ? connect.resolution.pointWorld
    : undefined
  const snapRadius = 6 / Math.max(zoom, 0.0001)
  const stroke = path?.style?.stroke ?? 'var(--ui-text-primary)'
  const strokeWidth = path?.style?.strokeWidth ?? 2
  const dash = path?.style?.dash?.join(' ')
  const animationDuration = Math.max(0.3, path?.style?.animationSpeed ?? 1.2)
  const animation = path?.style?.animated
    ? `${EDGE_DASH_ANIMATION} ${animationDuration}s linear infinite`
    : undefined
  const markerStart = resolveMarker(path?.style?.markerStart, EDGE_ARROW_START_ID)
  const markerEnd = resolveMarker(path?.style?.markerEnd, EDGE_ARROW_END_ID)

  if (!path && !snap) {
    return null
  }

  return (
    <svg
      width="100%"
      height="100%"
      overflow="visible"
      className="wb-edge-preview-layer"
    >
      {path && (
        <path
          d={path.svgPath}
          fill="none"
          stroke={stroke}
          color={stroke}
          strokeWidth={strokeWidth}
          strokeDasharray={dash}
          markerStart={markerStart}
          markerEnd={markerEnd}
          vectorEffect="non-scaling-stroke"
          pointerEvents="none"
          className="wb-edge-visible-path"
          style={{ animation }}
        />
      )}
      {snap && (
        <circle
          cx={snap.x}
          cy={snap.y}
          r={snapRadius}
          fill="var(--wb-selection-fill)"
          stroke="var(--wb-accent)"
          strokeWidth={2 / Math.max(zoom, 0.0001)}
          vectorEffect="non-scaling-stroke"
          className="wb-edge-preview-point"
        />
      )}
    </svg>
  )
}

const EdgeEndpointHandle = ({
  edgeId,
  end,
  point
}: {
  edgeId: SelectedEdgeView['edgeId']
  end: 'source' | 'target'
  point: {
    x: number
    y: number
  }
}) => {
  const ref = usePickRef({
    kind: 'edge',
    id: edgeId,
    part: 'end',
    end
  })

  return (
    <div
      ref={ref}
      data-selection-ignore
      className="wb-edge-endpoint-handle"
      style={{
        '--wb-edge-endpoint-x': point.x,
        '--wb-edge-endpoint-y': point.y
      } as CSSProperties}
    />
  )
}

const EdgeRoutePointHandle = ({
  point
}: {
  point: SelectedEdgeRoutePointView
}) => {
  const editor = useEditorRuntime()
  const ref = usePickRef(
    point.pick.kind === 'anchor'
      ? {
          kind: 'edge',
          id: point.edgeId,
          part: 'path',
          index: point.pick.index
        }
      : {
          kind: 'edge',
          id: point.edgeId,
          part: 'path',
          insert: point.pick.insertIndex,
          segment: point.pick.segmentIndex
        }
  )

  return (
    <div
      ref={ref}
      data-selection-ignore
      className="wb-edge-control-point-handle"
      data-kind={point.kind}
      data-active={point.active ? 'true' : undefined}
      onKeyDown={point.deletable
        ? (event) => {
            if (event.key !== 'Backspace' && event.key !== 'Delete') {
              return
            }

            if (point.pick.kind !== 'anchor') {
              return
            }

            editor.commands.edge.route.remove(point.edgeId, point.pick.index)
            event.preventDefault()
            event.stopPropagation()
          }
        : undefined}
      style={{
        '--wb-edge-control-point-x': point.point.x,
        '--wb-edge-control-point-y': point.point.y,
        '--wb-edge-control-point-scale': point.active ? 1.08 : 1
      } as CSSProperties}
      tabIndex={point.deletable ? 0 : -1}
    />
  )
}

const EdgeSelectedOverlay = ({
  view
}: {
  view: SelectedEdgeView
}) => (
  <>
    <div className="wb-edge-endpoint-layer">
      <EdgeEndpointHandle
        edgeId={view.edgeId}
        end="source"
        point={view.ends.source.point}
      />
      <EdgeEndpointHandle
        edgeId={view.edgeId}
        end="target"
        point={view.ends.target.point}
      />
    </div>
    {view.routePoints.length > 0 && (
      <div className="wb-edge-control-point-layer">
        {view.routePoints.map((point) => (
          <EdgeRoutePointHandle
            key={point.key}
            point={point}
          />
        ))}
      </div>
    )}
  </>
)

export const EdgeOverlayLayer = () => {
  const interaction = useInteraction()
  const tool = useTool()
  const selectedEdgeView = useSelectedEdgeView()
  const showEdgeControls =
    selectedEdgeView !== undefined
    && interaction.chrome
    && !interaction.editingEdge
    && tool.type === 'select'

  return (
    <>
      {showEdgeControls && selectedEdgeView ? (
        <EdgeSelectedOverlay
          view={selectedEdgeView}
        />
      ) : null}
      <EdgeHintOverlay />
    </>
  )
}
