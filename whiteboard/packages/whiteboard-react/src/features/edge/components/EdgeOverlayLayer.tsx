import type {
  CSSProperties
} from 'react'
import {
  memo
} from 'react'
import { useStoreValue } from '@shared/react'
import { WHITEBOARD_LINE_DEFAULT_COLOR } from '@whiteboard/product/palette'
import {
  useEditorRuntime,
  usePickRef
} from '@whiteboard/react/runtime/hooks'
import type {
  SelectedEdgeChrome,
  SelectedEdgeRoutePoint
} from '@whiteboard/react/types/edge'
import { useSelectedEdgeChrome } from '@whiteboard/react/features/edge/hooks/useEdgeView'
import {
  resolveEdgeDash
} from '@whiteboard/react/features/edge/constants'
import { resolvePaletteColorOr } from '@whiteboard/react/features/palette'
import { resolveEdgeMarkerUrl } from '@whiteboard/react/features/edge/ui/marker'

const EdgeHintOverlay = () => {
  const editor = useEditorRuntime()
  const chrome = useStoreValue(editor.read.chrome)
  const hint = chrome.edgeGuide
  const zoom = useStoreValue(editor.store.viewport).zoom
  const { path, connect } = hint
  const snap = connect && (
    connect.resolution.mode === 'outline'
    || connect.resolution.mode === 'handle'
  )
    ? connect.resolution.pointWorld
    : undefined
  const snapRadius = 6 / Math.max(zoom, 0.0001)
  const stroke = resolvePaletteColorOr(
    path?.style?.color,
    WHITEBOARD_LINE_DEFAULT_COLOR
  ) ?? 'currentColor'
  const strokeWidth = path?.style?.width ?? 2
  const dash = resolveEdgeDash(path?.style?.dash)
  const markerStart = resolveEdgeMarkerUrl(path?.style?.start, 'start')
  const markerEnd = resolveEdgeMarkerUrl(path?.style?.end, 'end')
  const strokeOpacity = path?.style?.opacity ?? 1

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
          strokeWidth={strokeWidth}
          strokeDasharray={dash}
          markerStart={markerStart}
          markerEnd={markerEnd}
          opacity={strokeOpacity}
          vectorEffect="non-scaling-stroke"
          pointerEvents="none"
          className="wb-edge-visible-path"
        />
      )}
      {snap && (
        <circle
          cx={snap.x}
          cy={snap.y}
          r={snapRadius}
          fill="rgb(from var(--ui-accent) r g b / 0.12)"
          stroke="var(--ui-accent)"
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
  edgeId: SelectedEdgeChrome['edgeId']
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
  point: SelectedEdgeRoutePoint
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

            editor.actions.edge.route.removePoint(point.edgeId, point.pick.index)
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
  chrome
}: {
  chrome: SelectedEdgeChrome
}) => (
  <>
    {chrome.showEditHandles && (chrome.canReconnectSource || chrome.canReconnectTarget) && (
      <div className="wb-edge-endpoint-layer">
        {chrome.canReconnectSource ? (
          <EdgeEndpointHandle
            edgeId={chrome.edgeId}
            end="source"
            point={chrome.ends.source.point}
          />
        ) : null}
        {chrome.canReconnectTarget ? (
          <EdgeEndpointHandle
            edgeId={chrome.edgeId}
            end="target"
            point={chrome.ends.target.point}
          />
        ) : null}
      </div>
    )}
    {chrome.showEditHandles && chrome.canEditRoute && chrome.routePoints.length > 0 && (
      <div className="wb-edge-control-point-layer">
        {chrome.routePoints.map((point) => (
          <EdgeRoutePointHandle
            key={point.key}
            point={point}
          />
        ))}
      </div>
    )}
  </>
)

export const EdgeOverlayLayer = memo(() => {
  const selectedEdgeChrome = useSelectedEdgeChrome()

  return (
    <>
      {selectedEdgeChrome ? (
        <EdgeSelectedOverlay
          chrome={selectedEdgeChrome}
        />
      ) : null}
      <EdgeHintOverlay />
    </>
  )
})

EdgeOverlayLayer.displayName = 'EdgeOverlayLayer'
