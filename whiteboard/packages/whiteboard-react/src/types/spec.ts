import type { LayoutNodeCatalog } from '@whiteboard/core/layout'
import type { NodeSpec } from '@whiteboard/react/types/node'

export type WhiteboardSpec = {
  nodes: NodeSpec
  layout: LayoutNodeCatalog
  toolbar?: unknown
}
