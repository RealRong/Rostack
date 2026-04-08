import { getNodeAnchor } from '@whiteboard/core/node'
import type { NodeItem } from '@whiteboard/engine'
import type { EdgeAnchor } from '@whiteboard/core/types'
import { usePickRef } from '#react/runtime/hooks'

type NodeViewNode = NodeItem['node']
type NodeViewRect = NodeItem['rect']

type NodeConnectHandlesProps = {
  node: NodeViewNode
  rect: NodeViewRect
  rotation: number
  activeSide?: EdgeAnchor['side']
}

const NODE_CONNECT_SIDES = ['top', 'right', 'bottom', 'left'] as const

const NodeConnectHandleItem = ({
  nodeId,
  side,
  point,
  active
}: {
  nodeId: NodeViewNode['id']
  side: EdgeAnchor['side']
  point: {
    x: number
    y: number
  }
  active: boolean
}) => {
  const ref = usePickRef({
    kind: 'node',
    id: nodeId,
    part: 'connect',
    side
  })

  return (
    <div
      ref={ref}
      data-selection-ignore
      className="wb-node-handle"
      data-active={active ? 'true' : undefined}
      style={{
        left: `calc(${point.x}px - (12px / var(--wb-zoom, 1) / 2))`,
        top: `calc(${point.y}px - (12px / var(--wb-zoom, 1) / 2))`,
        marginLeft: 0,
        marginTop: 0,
        right: 'auto',
        bottom: 'auto'
      }}
    />
  )
}

export const NodeConnectHandles = ({
  node,
  rect,
  rotation,
  activeSide
}: NodeConnectHandlesProps) => {
  const localRect = {
    x: 0,
    y: 0,
    width: rect.width,
    height: rect.height
  }
  const transform = [
    `translate(${rect.x}px, ${rect.y}px)`,
    rotation !== 0 ? `rotate(${rotation}deg)` : undefined
  ]
    .filter(Boolean)
    .join(' ')

  return (
    <div
      className="wb-node-connect-handle-layer"
      style={{
        position: 'absolute',
        left: 0,
        top: 0,
        width: rect.width,
        height: rect.height,
        pointerEvents: 'none',
        transform: transform || undefined,
        transformOrigin: rotation !== 0 ? 'center center' : undefined
      }}
    >
      {NODE_CONNECT_SIDES.map((side) => {
        const point = getNodeAnchor(
          node,
          localRect,
          {
            side: side as EdgeAnchor['side'],
            offset: 0.5
          },
          0
        )

        return (
          <NodeConnectHandleItem
            key={side}
            nodeId={node.id}
            side={side}
            point={point}
            active={activeSide === side}
          />
        )
      })}
    </div>
  )
}
