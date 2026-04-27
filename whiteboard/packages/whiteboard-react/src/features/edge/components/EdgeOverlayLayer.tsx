import type { CSSProperties } from 'react'
import { memo } from 'react'
import { useStoreValue } from '@shared/react'
import type { EdgeOverlayRoutePoint } from '@whiteboard/editor-scene'
import { useEditorRuntime, usePickRef } from '@whiteboard/react/runtime/hooks'
import {
  resolveEdgePathPresentation
} from './render'

const EdgeEndpointHandle = ({
  edgeId,
  end,
  point
}: {
  edgeId: string
  end: 'source' | 'target'
  point: {
    x: number
    y: number
  }
}) => {
  const bindRef = usePickRef({
    kind: 'edge',
    id: edgeId,
    part: 'end',
    end
  })

  return (
    <div
      ref={bindRef}
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
  point: EdgeOverlayRoutePoint
}) => {
  const editor = useEditorRuntime()
  const bindRef = usePickRef(
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
      ref={bindRef}
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

            editor.write.edge.route.removePoint(point.edgeId, point.pick.index)
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

export const EdgeOverlayLayer = memo(() => {
  const editor = useEditorRuntime()
  const overlay = useStoreValue(editor.scene.stores.render.chrome.edge)
  const previewPresentation = overlay.previewPath
    ? resolveEdgePathPresentation(overlay.previewPath.style)
    : undefined
  const zoom = useStoreValue(editor.state.viewport.zoom)
  const snapRadius = 6 / Math.max(zoom, 0.0001)

  return (
    <>
      {(overlay.previewPath || overlay.snapPoint) ? (
        <svg
          width="100%"
          height="100%"
          overflow="visible"
          className="wb-edge-preview-layer"
        >
          {overlay.previewPath && previewPresentation ? (
            <path
              d={overlay.previewPath.svgPath}
              fill="none"
              stroke={previewPresentation.stroke}
              strokeWidth={previewPresentation.strokeWidth}
              strokeDasharray={previewPresentation.dash}
              markerStart={previewPresentation.markerStart}
              markerEnd={previewPresentation.markerEnd}
              opacity={previewPresentation.strokeOpacity}
              vectorEffect="non-scaling-stroke"
              pointerEvents="none"
              className="wb-edge-visible-path"
            />
          ) : null}
          {overlay.snapPoint ? (
            <circle
              cx={overlay.snapPoint.x}
              cy={overlay.snapPoint.y}
              r={snapRadius}
              fill="rgb(from var(--ui-accent) r g b / 0.12)"
              stroke="var(--ui-accent)"
              strokeWidth={2 / Math.max(zoom, 0.0001)}
              vectorEffect="non-scaling-stroke"
              className="wb-edge-preview-point"
            />
          ) : null}
        </svg>
      ) : null}
      {overlay.endpointHandles.length > 0 ? (
        <div className="wb-edge-endpoint-layer">
          {overlay.endpointHandles.map((handle) => (
            <EdgeEndpointHandle
              key={`${handle.edgeId}:${handle.end}`}
              edgeId={handle.edgeId}
              end={handle.end}
              point={handle.point}
            />
          ))}
        </div>
      ) : null}
      {overlay.routePoints.length > 0 ? (
        <div className="wb-edge-control-point-layer">
          {overlay.routePoints.map((point) => (
            <EdgeRoutePointHandle
              key={point.key}
              point={point}
            />
          ))}
        </div>
      ) : null}
    </>
  )
})

EdgeOverlayLayer.displayName = 'EdgeOverlayLayer'
