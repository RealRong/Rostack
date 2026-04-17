import { memo, useEffect, useRef, type CSSProperties } from 'react'
import type { NodeId } from '@whiteboard/core/types'
import { usePickRef } from '@whiteboard/react/runtime/hooks'
import { useNodeView } from '@whiteboard/react/features/node/hooks/useNodeView'

type CanvasNodeSceneItemProps = {
  nodeId: NodeId
}

export const CanvasNodeSceneItem = memo(({
  nodeId
}: CanvasNodeSceneItemProps) => {
  const view = useNodeView(nodeId)

  if (!view || view.hidden || view.node.type === 'mindmap') {
    return null
  }

  const {
    node: resolvedNode,
    rect,
    nodeStyle,
    transformStyle,
    definition,
    renderProps
  } = view
  const hit = definition?.hit ?? 'box'
  const bindPickElement = usePickRef({
    kind: 'node',
    id: nodeId,
    part: 'body'
  })
  const rootRef = useRef<HTMLDivElement | null>(null)

  useEffect(() => {
    const element = rootRef.current
    bindPickElement(hit !== 'none' ? element : null)

    return () => {
      bindPickElement(null)
    }
  }, [bindPickElement, hit])

  const rootStyle: CSSProperties = {
    ...nodeStyle,
    pointerEvents: hit === 'path' ? 'none' : 'auto',
    ...transformStyle
  }
  const content = definition ? definition.render(renderProps) : resolvedNode.type

  return (
    <div
      ref={rootRef}
      className="wb-node-block"
      data-node-id={nodeId}
      data-node-type={resolvedNode.type}
      data-node-hit={hit}
      data-selected={view.renderProps.selected ? 'true' : undefined}
      style={{
        width: rect.width,
        height: rect.height,
        ...rootStyle
      }}
    >
      {content}
    </div>
  )
})

CanvasNodeSceneItem.displayName = 'CanvasNodeSceneItem'
