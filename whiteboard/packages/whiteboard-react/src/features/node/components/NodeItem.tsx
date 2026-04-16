import { memo } from 'react'
import type { NodeId } from '@whiteboard/core/types'
import { useNodeView } from '@whiteboard/react/features/node/hooks/useNodeView'
import { useMindmapTreeView } from '@whiteboard/react/features/mindmap/hooks/useMindmapTreeView'
import { MindmapTreeView } from '@whiteboard/react/features/mindmap/components/MindmapTreeView'
import { CanvasNodeSceneItem } from '@whiteboard/react/features/node/components/CanvasNodeSceneItem'

type NodeItemProps = {
  nodeId: NodeId
  registerMeasuredElement: (
    nodeId: NodeId,
    element: HTMLDivElement | null,
    enabled: boolean
  ) => void
  selected: boolean
  selectedNodeIds?: readonly NodeId[]
}

const MindmapSceneItem = ({
  treeId,
  registerMeasuredElement,
  selectedNodeIds
}: {
  treeId: NodeId
  registerMeasuredElement: NodeItemProps['registerMeasuredElement']
  selectedNodeIds: readonly NodeId[]
}) => {
  const view = useMindmapTreeView(treeId)

  if (!view) {
    return null
  }

  return (
    <MindmapTreeView
      view={view}
      registerMeasuredElement={registerMeasuredElement}
      selectedNodeIds={selectedNodeIds}
    />
  )
}

export const NodeItem = memo(({
  nodeId,
  registerMeasuredElement,
  selected,
  selectedNodeIds = []
}: NodeItemProps) => {
  const view = useNodeView(nodeId, { selected })

  if (!view) return null
  if (view.hidden) return null
  if (view.node.type === 'mindmap') {
    return (
      <MindmapSceneItem
        treeId={nodeId}
        registerMeasuredElement={registerMeasuredElement}
        selectedNodeIds={selectedNodeIds}
      />
    )
  }

  return (
    <CanvasNodeSceneItem
      nodeId={nodeId}
      registerMeasuredElement={registerMeasuredElement}
      selected={selected}
    />
  )
})

NodeItem.displayName = 'NodeItem'
