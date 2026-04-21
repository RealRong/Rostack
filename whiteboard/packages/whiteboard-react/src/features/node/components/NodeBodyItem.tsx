import { memo, useEffect, useRef, type CSSProperties } from 'react'
import type { NodeId } from '@whiteboard/core/types'
import { usePickRef } from '@whiteboard/react/runtime/hooks'
import { useNodeView } from '@whiteboard/react/features/node/hooks/useNodeView'

const MINDMAP_EDIT_DEBUG_PREFIX = '[mindmap-edit-debug]'

const debugMindmapEdit = (
  label: string,
  payload: unknown
) => {
  console.log(MINDMAP_EDIT_DEBUG_PREFIX, label, payload)
}

type NodeBodyItemProps = {
  nodeId: NodeId
}

export const NodeBodyItem = memo(({
  nodeId
}: NodeBodyItemProps) => {
  const view = useNodeView(nodeId)

  if (!view || view.hidden) {
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

  useEffect(() => {
    const element = rootRef.current
    if (!element || resolvedNode.owner?.kind !== 'mindmap') {
      return
    }

    debugMindmapEdit('react.NodeBodyItem', {
      treeId: resolvedNode.owner.id,
      nodeId,
      rect,
      selected: view.renderProps.selected,
      domStyle: {
        width: element.style.width,
        height: element.style.height,
        transform: element.style.transform,
        transformOrigin: element.style.transformOrigin,
        cssText: element.style.cssText
      }
    })
  }, [
    nodeId,
    rect,
    resolvedNode.owner,
    view.renderProps.selected,
    transformStyle.transform,
    transformStyle.transformOrigin
  ])

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

NodeBodyItem.displayName = 'NodeBodyItem'
