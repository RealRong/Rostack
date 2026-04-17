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
  connectors: readonly MindmapRenderConnector[]
  childNodeIds: readonly MindmapNodeId[]
  addChildren: readonly {
    targetNodeId: MindmapNodeId
    x: number
    y: number
    placement: 'left' | 'right'
  }[]
  onAddChild: (
    nodeId: MindmapNodeId,
    placement: 'left' | 'right' | 'up' | 'down'
  ) => void
}
