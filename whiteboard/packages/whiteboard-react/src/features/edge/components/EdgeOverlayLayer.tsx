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

const EdgeHintOverlay = () => {
  const editor = useEditorRuntime()
  const hint = useStoreValue(editor.read.overlay.feedback.edgeGuide)
  const zoom = useStoreValue(editor.state.viewport).zoom
  const { line, snap } = hint
  const pointRadius = 4 / Math.max(zoom, 0.0001)
  const snapRadius = 6 / Math.max(zoom, 0.0001)
  const strokeWidth = 2 / Math.max(zoom, 0.0001)

  if (!line && !snap) {
    return null
  }

  return (
    <svg
      width="100%"
      height="100%"
      overflow="visible"
      className="wb-edge-preview-layer"
    >
      {line && (
        <>
          <line
            x1={line.from.x}
            y1={line.from.y}
            x2={line.to.x}
            y2={line.to.y}
            stroke="var(--wb-preview-line)"
            strokeWidth={strokeWidth}
            strokeDasharray="6 4"
            vectorEffect="non-scaling-stroke"
          />
          <circle
            cx={line.from.x}
            cy={line.from.y}
            r={pointRadius}
            fill="var(--wb-text-primary)"
            className="wb-edge-preview-point"
          />
          <circle
            cx={line.to.x}
            cy={line.to.y}
            r={pointRadius}
            fill="var(--wb-text-primary)"
            className="wb-edge-preview-point"
          />
        </>
      )}
      {snap && (
        <circle
          cx={snap.x}
          cy={snap.y}
          r={snapRadius}
          fill="var(--wb-selection-fill)"
          stroke="var(--wb-accent)"
          strokeWidth={strokeWidth}
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
    point.kind === 'anchor'
      ? {
          kind: 'edge',
          id: point.edgeId,
          part: 'path',
          index: point.index
        }
      : {
          kind: 'edge',
          id: point.edgeId,
          part: 'path',
          insert: point.insertIndex
        }
  )

  return (
    <div
      ref={ref}
      data-selection-ignore
      className="wb-edge-control-point-handle"
      data-kind={point.kind}
      data-active={point.active ? 'true' : undefined}
      onKeyDown={point.kind === 'anchor'
        ? (event) => {
            if (event.key !== 'Backspace' && event.key !== 'Delete') {
              return
            }

            editor.commands.edge.route.remove(point.edgeId, point.index)
            event.preventDefault()
            event.stopPropagation()
          }
        : undefined}
      style={{
        '--wb-edge-control-point-x': point.point.x,
        '--wb-edge-control-point-y': point.point.y,
        '--wb-edge-control-point-scale': point.active ? 1.08 : 1
      } as CSSProperties}
      tabIndex={0}
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
    && tool.type !== 'hand'

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
