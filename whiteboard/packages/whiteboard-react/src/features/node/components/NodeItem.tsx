import { memo } from 'react'
import type { NodeId } from '@whiteboard/core/types'
import { useNodeView } from '@whiteboard/react/features/node/hooks/useNodeView'
import { useMindmapTreeView } from '@whiteboard/react/features/mindmap/hooks/useMindmapTreeView'
import { MindmapTreeView } from '@whiteboard/react/features/mindmap/components/MindmapTreeView'
import { CanvasNodeSceneItem } from '@whiteboard/react/features/node/components/CanvasNodeSceneItem'

type NodeItemProps = {
  nodeId: NodeId
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

  return (
    <MindmapTreeView
      view={view}
    />
  )
}

export const NodeItem = memo(({
  nodeId
}: NodeItemProps) => {
  const view = useNodeView(nodeId)
  const isMindmapRoot = view?.node.owner?.kind === 'mindmap' && view.node.owner.id === nodeId

  if (!view) return null
  if (view.hidden) return null
  if (isMindmapRoot) {
    return (
      <MindmapSceneItem
        treeId={nodeId}
      />
    )
  }

  return (
    <CanvasNodeSceneItem
      nodeId={nodeId}
    />
  )
})

NodeItem.displayName = 'NodeItem'
