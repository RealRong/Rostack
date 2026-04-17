import type {
  NodeId,
  Rect
} from '@whiteboard/core/types'
import type { MindmapNodeId } from '@whiteboard/core/mindmap'
import type { MindmapRenderConnector } from '@whiteboard/core/mindmap/render'

export type MindmapTreeViewData = {
  treeId: NodeId
  rootNodeId: MindmapNodeId
  bbox: Rect
  rootRect: Rect
  rootLocked: boolean
  connectors: readonly MindmapRenderConnector[]
  childNodeIds: readonly MindmapNodeId[]
  onAddChild: (
    nodeId: MindmapNodeId,
    placement: 'left' | 'right' | 'up' | 'down'
  ) => void
}
