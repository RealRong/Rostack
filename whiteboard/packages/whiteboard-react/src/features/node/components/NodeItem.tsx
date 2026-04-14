import { memo, useEffect, useRef, type CSSProperties } from 'react'
import type { NodeId } from '@whiteboard/core/types'
import { usePickRef } from '@whiteboard/react/runtime/hooks'
import { useNodeView } from '@whiteboard/react/features/node/hooks/useNodeView'
import { useMindmapTreeView } from '@whiteboard/react/features/mindmap/hooks/useMindmapTreeView'
import { MindmapTreeView } from '@whiteboard/react/features/mindmap/components/MindmapTreeView'

type NodeItemProps = {
  nodeId: NodeId
  registerMeasuredElement: (
    nodeId: NodeId,
    element: HTMLDivElement | null,
    enabled: boolean
  ) => void
  selected: boolean
}

const MindmapSceneItem = ({
  treeId
}: {
  treeId: NodeId
}) => {
  const view = useMindmapTreeView(treeId)

  if (!view) {
    return null
  }

  return <MindmapTreeView view={view} />
}

export const NodeItem = memo(({
  nodeId,
  registerMeasuredElement,
  selected
}: NodeItemProps) => {
  const view = useNodeView(nodeId, { selected })

  if (!view) return null
  if (view.hidden) return null
  if (view.node.type === 'mindmap') {
    return <MindmapSceneItem treeId={nodeId} />
  }

  const {
    node: resolvedNode,
    rect,
    resizing,
    nodeStyle,
    transformStyle,
    definition,
    renderProps
  } = view
  const shouldAutoMeasure = Boolean(definition?.autoMeasure) && !resizing
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
    registerMeasuredElement(nodeId, element, shouldAutoMeasure)

    return () => {
      registerMeasuredElement(nodeId, null, false)
    }
  }, [nodeId, registerMeasuredElement, shouldAutoMeasure])

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
      data-selected={selected ? 'true' : undefined}
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

NodeItem.displayName = 'NodeItem'
