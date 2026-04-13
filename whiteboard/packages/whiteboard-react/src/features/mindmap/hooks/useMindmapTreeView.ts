import { useCallback, useMemo } from 'react'
import type { MindmapNodeId, NodeId } from '@whiteboard/core/types'
import { useKeyedStoreValue } from '@shared/react'
import {
  useEditorRuntime,
  useResolvedConfig
} from '#whiteboard-react/runtime/hooks'
import type { MindmapTreeViewData } from '#whiteboard-react/types/mindmap'

export const useMindmapTreeView = (
  treeId: NodeId
): MindmapTreeViewData | undefined => {
  const editor = useEditorRuntime()
  const config = useResolvedConfig()
  const view = useKeyedStoreValue(editor.read.mindmap.view, treeId)
  const tree = view?.tree
  const rootId = view?.rootId
  const layout = view?.layout
  const nodeSize = config.mindmapNodeSize

  const onAddChild = useCallback(
    (nodeId: MindmapNodeId, placement: 'left' | 'right' | 'up' | 'down') => {
      if (!tree || !rootId || !layout) {
        return
      }

      editor.actions.mindmap.insertByPlacement({
        id: rootId,
        tree,
        targetNodeId: nodeId,
        placement,
        nodeSize,
        layout,
        payload: { kind: 'text', text: '' }
      })
    },
    [editor, layout, nodeSize, rootId, tree]
  )

  return useMemo(
    () => {
      if (!view) {
        return undefined
      }

      return {
        treeId,
        baseOffset: view.rootPosition,
        bbox: view.bbox,
        shiftX: view.shiftX,
        shiftY: view.shiftY,
        lines: view.lines,
        nodes: view.nodes,
        ghost: view.ghost,
        connectionLine: view.connectionLine,
        insertLine: view.insertLine,
        onAddChild
      }
    },
    [onAddChild, treeId, view]
  )
}
