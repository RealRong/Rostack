import { memo } from 'react'
import type { MindmapId } from '@whiteboard/core/types'
import { useOptionalKeyedStoreValue } from '@shared/react'
import { MindmapConnectors } from '@whiteboard/react/features/mindmap/components/MindmapConnectors'
import { MindmapChrome } from '@whiteboard/react/features/mindmap/components/MindmapChrome'
import { NodeBodyItem } from '@whiteboard/react/features/node/components/NodeBodyItem'
import { useEditorRuntime } from '@whiteboard/react/runtime/hooks'

type MindmapSceneItemProps = {
  mindmapId: MindmapId
}

export const MindmapSceneItem = memo(({
  mindmapId
}: MindmapSceneItemProps) => {
  const editor = useEditorRuntime()
  const scene = useOptionalKeyedStoreValue(
    editor.read.mindmap.view,
    mindmapId,
    undefined
  )

  if (!scene) {
    return null
  }

  return (
    <>
      <MindmapConnectors mindmapId={mindmapId} />
      {scene.structure.nodeIds.map((nodeId) => (
        <NodeBodyItem
          key={nodeId}
          nodeId={nodeId}
        />
      ))}
      <MindmapChrome mindmapId={mindmapId} />
    </>
  )
})

MindmapSceneItem.displayName = 'MindmapSceneItem'
