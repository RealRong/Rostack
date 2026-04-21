import type {
  CSSProperties
} from 'react'
import { RotateCw } from 'lucide-react'
import { node as nodeApi,
  type SelectionTransformPlan,
  type ResizeDirection,
  type TransformHandle
} from '@whiteboard/core/node'
import type { NodeModel, Rect } from '@whiteboard/core/types'
import { useStoreValue } from '@shared/react'
import { useEditor, usePickRef } from '@whiteboard/react/runtime/hooks'

type TransformPickTarget =
  | {
      kind: 'node'
      nodeId: NodeModel['id']
    }
  | {
      kind: 'selection'
    }

type TransformChromeProps = {
  pickTarget: TransformPickTarget
  rect: Rect
  rotation: number
  visibleResizeDirections: readonly ResizeDirection[]
  edgeResizeDirections: readonly ResizeDirection[]
  showRotateHandle: boolean
}

type SelectionTransformHandlesProps = {
  plan: SelectionTransformPlan<NodeModel>
}

type NodeTransformHandlesProps = {
  nodeId: NodeModel['id']
  nodeType: NodeModel['type']
  rect: Rect
  rotation: number
  showResizeChrome: boolean
  showRotateHandle: boolean
}

const NODE_TRANSFORM_HANDLE_SIZE = 10
const NODE_TRANSFORM_HANDLE_MIN_SIZE = 8
const NODE_TRANSFORM_HANDLE_MAX_SIZE = 10
const NODE_TRANSFORM_EDGE_HIT_SIZE = 16
const NODE_ROTATE_HANDLE_SIZE = 24
const NODE_ROTATE_HANDLE_MIN_SIZE = 16
const NODE_ROTATE_HANDLE_MAX_SIZE = 28
const NODE_ROTATE_ICON_SIZE = 18
const NODE_ROTATE_ICON_MIN_SIZE = 12
const NODE_ROTATE_ICON_MAX_SIZE = 20
const NODE_ROTATE_HANDLE_OFFSET = 28
export const DEFAULT_VISIBLE_RESIZE_DIRECTIONS = ['nw', 'ne', 'se', 'sw'] as const satisfies readonly ResizeDirection[]
export const DEFAULT_EDGE_RESIZE_DIRECTIONS = ['n', 'e', 's', 'w'] as const satisfies readonly ResizeDirection[]
export const TEXT_EDGE_RESIZE_DIRECTIONS = ['e', 'w'] as const satisfies readonly ResizeDirection[]
const EMPTY_RESIZE_DIRECTIONS: readonly ResizeDirection[] = []

export const resolveNodeEdgeResizeDirections = (
  nodeType: NodeModel['type']
): readonly ResizeDirection[] => (
  nodeType === 'text'
    ? TEXT_EDGE_RESIZE_DIRECTIONS
    : DEFAULT_EDGE_RESIZE_DIRECTIONS
)

export const resolveSelectionVisibleResizeDirections = (
  plan: SelectionTransformPlan<NodeModel>
): readonly ResizeDirection[] => plan.handles
  .filter((handle) => (
    handle.visible
    && handle.enabled
    && nodeApi.transform.isCornerResizeDirection(handle.id)
  ))
  .map((handle) => handle.id)

export const resolveSelectionEdgeResizeDirections = (
  plan: SelectionTransformPlan<NodeModel>
): readonly ResizeDirection[] => plan.handles
  .filter((handle) => (
    handle.visible
    && handle.enabled
    && !nodeApi.transform.isCornerResizeDirection(handle.id)
  ))
  .map((handle) => handle.id)

export const resolveTransformChromeScreenSize = ({
  zoom,
  base,
  min,
  max
}: {
  zoom: number
  base: number
  min: number
  max: number
}): number => {
  const safeZoom = Math.max(zoom, 0.0001)
  const scaled = base * Math.sqrt(safeZoom)
  return Math.min(max, Math.max(min, scaled))
}

const buildTransformOverlayStyle = ({
  rect,
  rotation
}: {
  rect: Rect
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
  const screenSize = resolveTransformChromeScreenSize({
    zoom,
    base: size,
    min: handle.kind === 'rotate'
      ? NODE_ROTATE_HANDLE_MIN_SIZE
      : NODE_TRANSFORM_HANDLE_MIN_SIZE,
    max: handle.kind === 'rotate'
      ? NODE_ROTATE_HANDLE_MAX_SIZE
      : NODE_TRANSFORM_HANDLE_MAX_SIZE
  })

  return {
    '--wb-node-handle-size': `${screenSize}px`,
    '--wb-node-handle-center-x': `${handle.position.x}px`,
    '--wb-node-handle-center-y': `${handle.position.y}px`,
    cursor: handle.cursor
  } as CSSProperties
}

const buildTransformPick = ({
  pickTarget,
  handle
}: {
  pickTarget: TransformPickTarget
  handle: Pick<TransformHandle, 'id' | 'kind' | 'direction'>
}) => (
  pickTarget.kind === 'node'
    ? {
        kind: 'node' as const,
        id: pickTarget.nodeId,
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

const readPickTargetNodeId = (
  pickTarget: TransformPickTarget
) => pickTarget.kind === 'node'
  ? pickTarget.nodeId
  : undefined

export const resolveTransformEdgeHitAreaStyle = ({
  direction,
  rect,
  zoom,
  handleSize = NODE_TRANSFORM_HANDLE_SIZE,
  edgeSize = NODE_TRANSFORM_EDGE_HIT_SIZE
}: {
  direction: ResizeDirection
  rect: Pick<Rect, 'width' | 'height'>
  zoom: number
  handleSize?: number
  edgeSize?: number
}): CSSProperties => {
  const safeZoom = Math.max(zoom, 0.0001)
  const resolvedHandleSize = resolveTransformChromeScreenSize({
    zoom: safeZoom,
    base: handleSize,
    min: NODE_TRANSFORM_HANDLE_MIN_SIZE,
    max: NODE_TRANSFORM_HANDLE_MAX_SIZE
  })
  const thickness = edgeSize / safeZoom
  const cornerReserve = (resolvedHandleSize + edgeSize) / safeZoom / 2
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
  pickTarget,
  handle,
  zoom
}: {
  pickTarget: TransformPickTarget
  handle: TransformHandle
  zoom: number
}) => {
  const ref = usePickRef(buildTransformPick({
    pickTarget,
    handle
  }))

  return (
    <div
      ref={ref}
      data-node-id={readPickTargetNodeId(pickTarget)}
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
          size={
            resolveTransformChromeScreenSize({
              zoom,
              base: NODE_ROTATE_ICON_SIZE,
              min: NODE_ROTATE_ICON_MIN_SIZE,
              max: NODE_ROTATE_ICON_MAX_SIZE
            }) / Math.max(zoom, 0.0001)
          }
          strokeWidth={1}
          absoluteStrokeWidth
        />
      ) : null}
    </div>
  )
}

const TransformEdgeHitAreaItem = ({
  pickTarget,
  rect,
  direction,
  zoom
}: {
  pickTarget: TransformPickTarget
  rect: Rect
  direction: ResizeDirection
  zoom: number
}) => {
  const ref = usePickRef(buildTransformPick({
    pickTarget,
    handle: {
      id: `resize-${direction}`,
      kind: 'resize',
      direction
    }
  }))

  return (
    <div
      ref={ref}
      data-node-id={readPickTargetNodeId(pickTarget)}
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
        cursor: nodeApi.transform.resizeHandleMap[direction].cursor
      }}
    />
  )
}

const TransformEdgeHitAreas = ({
  pickTarget,
  rect,
  rotation,
  directions,
  zoom
}: {
  pickTarget: TransformPickTarget
  rect: Rect
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
          pickTarget={pickTarget}
          rect={rect}
          direction={direction}
          zoom={zoom}
        />
      ))}
    </div>
  )
}

const TransformChrome = ({
  pickTarget,
  rect,
  rotation,
  visibleResizeDirections,
  edgeResizeDirections,
  showRotateHandle
}: TransformChromeProps) => {
  const editor = useEditor()
  const zoom = useStoreValue(editor.store.viewport).zoom

  const handles = nodeApi.transform.buildHandles({
    rect,
    rotation,
    resizeDirections: visibleResizeDirections,
    showRotateHandle,
    rotateHandleOffset: NODE_ROTATE_HANDLE_OFFSET,
    zoom
  })

  return (
    <>
      <TransformEdgeHitAreas
        pickTarget={pickTarget}
        rect={rect}
        rotation={rotation}
        directions={edgeResizeDirections}
        zoom={zoom}
      />
      {handles.map((handle) => (
        <TransformHandleItem
          key={handle.id}
          pickTarget={pickTarget}
          handle={handle}
          zoom={zoom}
        />
      ))}
    </>
  )
}

export const NodeTransformHandles = ({
  nodeId,
  nodeType,
  rect,
  rotation,
  showResizeChrome,
  showRotateHandle
}: NodeTransformHandlesProps) => (
  <TransformChrome
    pickTarget={{
      kind: 'node',
      nodeId
    }}
    rect={rect}
    rotation={rotation}
    visibleResizeDirections={showResizeChrome
      ? DEFAULT_VISIBLE_RESIZE_DIRECTIONS
      : EMPTY_RESIZE_DIRECTIONS}
    edgeResizeDirections={showResizeChrome
      ? resolveNodeEdgeResizeDirections(nodeType)
      : EMPTY_RESIZE_DIRECTIONS}
    showRotateHandle={showRotateHandle}
  />
)

export const SelectionTransformHandles = ({
  plan
}: SelectionTransformHandlesProps) => (
  <TransformChrome
    pickTarget={{
      kind: 'selection'
    }}
    rect={plan.box}
    rotation={0}
    visibleResizeDirections={resolveSelectionVisibleResizeDirections(plan)}
    edgeResizeDirections={resolveSelectionEdgeResizeDirections(plan)}
    showRotateHandle={false}
  />
)
