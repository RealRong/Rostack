import { useCallback, useMemo } from 'react'
import type { MindmapNodeId, NodeId } from '@whiteboard/core/types'
import { useKeyedStoreValue } from '@shared/react'
import { useEditorRuntime } from '@whiteboard/react/runtime/hooks'
import type { MindmapTreeViewData } from '@whiteboard/react/types/mindmap'

export const useMindmapTreeView = (
  treeId: NodeId
): MindmapTreeViewData | undefined => {
  const editor = useEditorRuntime()
  const render = useKeyedStoreValue(editor.read.mindmap.render, treeId)
  const tree = render?.tree
  const mindmapId = treeId

  const onAddChild = useCallback(
    (nodeId: MindmapNodeId, placement: 'left' | 'right' | 'up' | 'down') => {
      if (!tree) {
        return
      }

      editor.actions.mindmap.insertByPlacement({
        id: mindmapId,
        tree,
        targetNodeId: nodeId,
        placement,
        layout: tree.layout,
        payload: { kind: 'text', text: '' }
      })
    },
    [editor, mindmapId, tree]
  )

  return useMemo(
    () => {
      if (!render) {
        return undefined
      }

      return {
        treeId,
        rootNodeId: render.rootId,
        bbox: render.bbox,
        rootRect: render.rootRect,
        rootLocked: render.rootLocked,
        connectors: render.connectors,
        childNodeIds: render.childNodeIds.filter((nodeId) => nodeId !== render.rootId),
        onAddChild
      }
    },
    [onAddChild, render, treeId]
  )
}
