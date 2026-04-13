import type {
  CSSProperties
} from 'react'
import { RotateCw } from 'lucide-react'
import {
  buildTransformHandles,
  TEXT_RESIZE_HANDLES,
  type ResizeDirection,
  type TransformHandle
} from '@whiteboard/core/node'
import type { NodeItem } from '@whiteboard/engine'
import { useStoreValue } from '@shared/react'
import { useEditor, usePickRef } from '#whiteboard-react/runtime/hooks'

type NodeViewNode = NodeItem['node']
type NodeViewRect = NodeItem['rect']

type TransformHandlesProps = {
  nodeId?: NodeViewNode['id']
  rect: NodeViewRect
  rotation: number
  canResize: boolean
  resizeDirections?: readonly ResizeDirection[]
  canRotate: boolean
}

type NodeTransformHandlesProps = {
  node: NodeViewNode
  rect: NodeViewRect
  rotation: number
  canResize: boolean
  canRotate: boolean
}

const NODE_TRANSFORM_HANDLE_SIZE = 10
const NODE_ROTATE_HANDLE_SIZE = 22
const NODE_ROTATE_ICON_SIZE = 18
const NODE_ROTATE_HANDLE_OFFSET = 28

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

const TransformHandleItem = ({
  nodeId,
  handle,
  zoom
}: {
  nodeId?: NodeViewNode['id']
  handle: TransformHandle
  zoom: number
}) => {
  const ref = usePickRef(
    nodeId
      ? {
          kind: 'node',
          id: nodeId,
          part: 'transform',
          handle: {
            id: handle.id,
            kind: handle.kind,
            direction: handle.direction
          }
        }
      : {
          kind: 'selection-box',
          part: 'transform',
          handle: {
            id: handle.id,
            kind: handle.kind,
            direction: handle.direction
          }
        }
  )

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
          className="wb-node-transform-handle-icon"
          size={NODE_ROTATE_ICON_SIZE / Math.max(zoom, 0.0001)}
          strokeWidth={1}
          absoluteStrokeWidth
        />
      ) : null}
    </div>
  )
}

export const TransformHandles = ({
  nodeId,
  rect,
  rotation,
  canResize,
  resizeDirections,
  canRotate
}: TransformHandlesProps) => {
  const editor = useEditor()
  const zoom = useStoreValue(editor.store.viewport).zoom

  const handles = buildTransformHandles({
    rect,
    rotation,
    canResize,
    resizeDirections,
    canRotate,
    rotateHandleOffset: NODE_ROTATE_HANDLE_OFFSET,
    zoom
  })

  return (
    <>
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
    resizeDirections={node.type === 'text' ? TEXT_RESIZE_HANDLES : undefined}
    canRotate={canRotate}
  />
)
