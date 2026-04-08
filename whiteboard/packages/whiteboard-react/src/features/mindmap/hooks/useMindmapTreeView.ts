import { useCallback, useMemo } from 'react'
import type { MindmapNodeId, NodeId } from '@whiteboard/core/types'
import { useKeyedStoreValue, useStoreValue } from '@shared/react'
import {
  useEditorRuntime,
  useResolvedConfig
} from '#react/runtime/hooks'
import type { MindmapTreeViewData } from '#react/types/mindmap'

export const useMindmapTreeView = (
  treeId: NodeId
): MindmapTreeViewData | undefined => {
  const editor = useEditorRuntime()
  const config = useResolvedConfig()
  const treeView = useKeyedStoreValue(editor.read.mindmap.item, treeId)
  const drag = useStoreValue(editor.read.overlay.feedback.mindmapDrag)
  const tree = treeView?.tree
  const root = treeView?.node
  const layout = treeView?.layout
  const nodeSize = config.mindmapNodeSize

  const onAddChild = useCallback(
    (nodeId: MindmapNodeId, placement: 'left' | 'right' | 'up' | 'down') => {
      if (!tree || !root || !layout) {
        return
      }

      editor.commands.mindmap.insertByPlacement({
        id: root.id,
        tree,
        targetNodeId: nodeId,
        placement,
        nodeSize,
        layout,
        payload: { kind: 'text', text: '' }
      })
    },
    [editor, layout, nodeSize, root?.id, tree]
  )

  return useMemo(
    () => {
      if (!treeView || !root || !root.position) {
        return undefined
      }

      const { computed, shiftX, shiftY, lines, labels } = treeView
      const dragPreview = drag?.treeId === treeId ? drag.preview : undefined
      const baseOffset = drag?.treeId === treeId ? drag.baseOffset : root.position

      const nodes = Object.entries(computed.node).map(([id, rect]) => ({
        id,
        rect,
        label: labels[id] ?? 'mindmap',
        dragActive: dragPreview?.nodeId === id,
        attachTarget: dragPreview?.drop?.type === 'attach' && dragPreview.drop.targetId === id,
        showActions: !dragPreview,
        dragPreviewActive: Boolean(dragPreview)
      }))

      return {
        treeId,
        baseOffset,
        bbox: computed.bbox,
        shiftX,
        shiftY,
        lines,
        nodes,
        ghost: dragPreview?.ghost,
        connectionLine: dragPreview?.drop?.connectionLine,
        insertLine: dragPreview?.drop?.insertLine,
        onAddChild
      }
    },
    [drag, onAddChild, root, treeId, treeView]
  )
}
