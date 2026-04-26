import type { Tool } from '@whiteboard/editor'
import type { WhiteboardOptions } from '@whiteboard/react/types/common/board'
import type {
  EdgeConfig,
  NodeConfig,
  Size,
  ViewportConfig
} from '@whiteboard/react/types/common/base'

export type ResolvedConfig = Omit<
  WhiteboardOptions,
  'nodeSize' | 'mindmapNodeSize' | 'viewport' | 'node' | 'edge' | 'initialTool'
> & {
  nodeSize: Size
  mindmapNodeSize: Size
  viewport: Required<ViewportConfig>
  node: Required<NodeConfig>
  edge: Required<EdgeConfig>
  initialTool: Tool
}
