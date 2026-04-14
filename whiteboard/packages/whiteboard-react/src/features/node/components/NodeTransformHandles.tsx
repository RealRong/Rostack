import type {
  CSSProperties
} from 'react'
import { RotateCw } from 'lucide-react'
import {
  buildTransformHandles,
  resizeHandleMap,
  type ResizeDirection,
  type TransformHandle
} from '@whiteboard/core/node'
import type { NodeItem } from '@whiteboard/engine'
import { useStoreValue } from '@shared/react'
import { useEditor, usePickRef } from '@whiteboard/react/runtime/hooks'

type NodeViewNode = NodeItem['node']
type NodeViewRect = NodeItem['rect']

type TransformHandlesProps = {
  nodeId?: NodeViewNode['id']
  rect: NodeViewRect
  rotation: number
  canResize: boolean
  visibleResizeDirections?: readonly ResizeDirection[]
  edgeResizeDirections?: readonly ResizeDirection[]
  canRotate: boolean
}

type NodeTransformHandlesProps = {
  node: NodeViewNode
  rect: NodeViewRect
  rotation: number
  canResize: boolean
  canRotate: boolean
}

const NODE_TRANSFORM_HANDLE_SIZE = 8
const NODE_TRANSFORM_EDGE_HIT_SIZE = 16
const NODE_ROTATE_HANDLE_SIZE = 22
const NODE_ROTATE_ICON_SIZE = 18
const NODE_ROTATE_HANDLE_OFFSET = 28
export const DEFAULT_VISIBLE_RESIZE_DIRECTIONS = ['nw', 'ne', 'se', 'sw'] as const satisfies readonly ResizeDirection[]
export const DEFAULT_EDGE_RESIZE_DIRECTIONS = ['n', 'e', 's', 'w'] as const satisfies readonly ResizeDirection[]
export const TEXT_EDGE_RESIZE_DIRECTIONS = ['e', 'w'] as const satisfies readonly ResizeDirection[]

export const resolveNodeEdgeResizeDirections = (
  nodeType: NodeViewNode['type']
): readonly ResizeDirection[] => (
  nodeType === 'text'
    ? TEXT_EDGE_RESIZE_DIRECTIONS
    : DEFAULT_EDGE_RESIZE_DIRECTIONS
)

const buildTransformOverlayStyle = ({
  rect,
  rotation
}: {
  rect: NodeViewRect
  rotation: number
}): CSSProperties => ({
  position: 'absolute',
  left: 0,
  top: 0,
  width: rect.width,
  height: rect.height,
  pointerEvents: 'none',
  transform: `translate(${rect.x}px, ${rect.y}px)${rotation !== 0 ? ` rotate(${rotation}deg)` : ''}`,
  transformOrigin: rotation !== 0 ? 'center center' : undefined
})

const buildNodeTransformHandleStyle = ({
  handle,
  zoom,
  size
}: {
  handle: TransformHandle
  zoom: number
  size: number
}): CSSProperties => {
  const half = size / Math.max(zoom, 0.0001) / 2

  return {
    '--wb-node-handle-size': `${size}px`,
    '--wb-node-handle-x': `${handle.position.x - half}px`,
    '--wb-node-handle-y': `${handle.position.y - half}px`,
    cursor: handle.cursor
  } as CSSProperties
}

const buildTransformPick = ({
  nodeId,
  handle
}: {
  nodeId?: NodeViewNode['id']
  handle: Pick<TransformHandle, 'id' | 'kind' | 'direction'>
}) => (
  nodeId
    ? {
        kind: 'node' as const,
        id: nodeId,
        part: 'transform' as const,
        handle: {
          id: handle.id,
          kind: handle.kind,
          direction: handle.direction
        }
      }
    : {
        kind: 'selection-box' as const,
        part: 'transform' as const,
        handle: {
          id: handle.id,
          kind: handle.kind,
          direction: handle.direction
        }
      }
)

export const resolveTransformEdgeHitAreaStyle = ({
  direction,
  rect,
  zoom,
  handleSize = NODE_TRANSFORM_HANDLE_SIZE,
  edgeSize = NODE_TRANSFORM_EDGE_HIT_SIZE
}: {
  direction: ResizeDirection
  rect: Pick<NodeViewRect, 'width' | 'height'>
  zoom: number
  handleSize?: number
  edgeSize?: number
}): CSSProperties => {
  const safeZoom = Math.max(zoom, 0.0001)
  const thickness = edgeSize / safeZoom
  const cornerReserve = (handleSize + edgeSize) / safeZoom / 2
  const horizontalInset = Math.min(rect.width / 2, cornerReserve)
  const verticalInset = Math.min(rect.height / 2, cornerReserve)
  const horizontalLength = Math.max(thickness, rect.width - horizontalInset * 2)
  const verticalLength = Math.max(thickness, rect.height - verticalInset * 2)

  switch (direction) {
    case 'n':
      return {
        left: (rect.width - horizontalLength) / 2,
        top: -thickness / 2,
        width: horizontalLength,
        height: thickness
      }
    case 'e':
      return {
        left: rect.width - thickness / 2,
        top: (rect.height - verticalLength) / 2,
        width: thickness,
        height: verticalLength
      }
    case 's':
      return {
        left: (rect.width - horizontalLength) / 2,
        top: rect.height - thickness / 2,
        width: horizontalLength,
        height: thickness
      }
    case 'w':
      return {
        left: -thickness / 2,
        top: (rect.height - verticalLength) / 2,
        width: thickness,
        height: verticalLength
      }
    default:
      return {}
  }
}

const TransformHandleItem = ({
  nodeId,
  handle,
  zoom
}: {
  nodeId?: NodeViewNode['id']
  handle: TransformHandle
  zoom: number
}) => {
  const ref = usePickRef(buildTransformPick({
    nodeId,
    handle
  }))

  return (
    <div
      ref={ref}
      data-node-id={nodeId}
      data-selection-ignore
      data-kind={handle.kind}
      data-transform-kind={handle.kind}
      data-resize-direction={handle.direction}
      className="wb-node-transform-handle"
      style={buildNodeTransformHandleStyle({
        handle,
        zoom,
        size: handle.kind === 'rotate'
          ? NODE_ROTATE_HANDLE_SIZE
          : NODE_TRANSFORM_HANDLE_SIZE
      })}
    >
      {handle.kind === 'rotate' ? (
        <RotateCw
          className="wb-node-transform-handle-icon text-muted-foreground"
          size={NODE_ROTATE_ICON_SIZE / Math.max(zoom, 0.0001)}
          strokeWidth={1}
          absoluteStrokeWidth
        />
      ) : null}
    </div>
  )
}

const TransformEdgeHitAreaItem = ({
  nodeId,
  rect,
  direction,
  zoom
}: {
  nodeId?: NodeViewNode['id']
  rect: NodeViewRect
  direction: ResizeDirection
  zoom: number
}) => {
  const ref = usePickRef(buildTransformPick({
    nodeId,
    handle: {
      id: `resize-${direction}`,
      kind: 'resize',
      direction
    }
  }))

  return (
    <div
      ref={ref}
      data-node-id={nodeId}
      data-selection-ignore
      data-kind="resize"
      data-transform-kind="resize"
      data-resize-direction={direction}
      className="wb-node-transform-edge-hit-area"
      style={{
        ...resolveTransformEdgeHitAreaStyle({
          direction,
          rect,
          zoom
        }),
        cursor: resizeHandleMap[direction].cursor
      }}
    />
  )
}

const TransformEdgeHitAreas = ({
  nodeId,
  rect,
  rotation,
  directions,
  zoom
}: {
  nodeId?: NodeViewNode['id']
  rect: NodeViewRect
  rotation: number
  directions: readonly ResizeDirection[]
  zoom: number
}) => {
  if (!directions.length) {
    return null
  }

  return (
    <div
      className="wb-node-transform-edge-hit-area-layer"
      style={buildTransformOverlayStyle({
        rect,
        rotation
      })}
    >
      {directions.map((direction) => (
        <TransformEdgeHitAreaItem
          key={direction}
          nodeId={nodeId}
          rect={rect}
          direction={direction}
          zoom={zoom}
        />
      ))}
    </div>
  )
}

export const TransformHandles = ({
  nodeId,
  rect,
  rotation,
  canResize,
  visibleResizeDirections = DEFAULT_VISIBLE_RESIZE_DIRECTIONS,
  edgeResizeDirections = DEFAULT_EDGE_RESIZE_DIRECTIONS,
  canRotate
}: TransformHandlesProps) => {
  const editor = useEditor()
  const zoom = useStoreValue(editor.store.viewport).zoom
  const resolvedVisibleResizeDirections = canResize
    ? visibleResizeDirections
    : undefined
  const resolvedEdgeResizeDirections = canResize
    ? edgeResizeDirections
    : []

  const handles = buildTransformHandles({
    rect,
    rotation,
    canResize,
    resizeDirections: resolvedVisibleResizeDirections,
    canRotate,
    rotateHandleOffset: NODE_ROTATE_HANDLE_OFFSET,
    zoom
  })

  return (
    <>
      <TransformEdgeHitAreas
        nodeId={nodeId}
        rect={rect}
        rotation={rotation}
        directions={resolvedEdgeResizeDirections}
        zoom={zoom}
      />
      {handles.map((handle) => (
        <TransformHandleItem
          key={handle.id}
          nodeId={nodeId}
          handle={handle}
          zoom={zoom}
        />
      ))}
    </>
  )
}

export const NodeTransformHandles = ({
  node,
  rect,
  rotation,
  canResize,
  canRotate
}: NodeTransformHandlesProps) => (
  <TransformHandles
    nodeId={node.id}
    rect={rect}
    rotation={rotation}
    canResize={canResize}
    visibleResizeDirections={DEFAULT_VISIBLE_RESIZE_DIRECTIONS}
    edgeResizeDirections={resolveNodeEdgeResizeDirections(node.type)}
    canRotate={canRotate}
  />
)
