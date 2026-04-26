import type { Tool } from '@whiteboard/editor'
import type { WhiteboardOptions } from '@whiteboard/react/types/common/board'
import type {
  EdgeConfig,
  NodeConfig,
  ViewportConfig
} from '@whiteboard/react/types/common/base'

export type ResolvedConfig = Omit<
  WhiteboardOptions,
  'viewport' | 'node' | 'edge' | 'initialTool'
> & {
  viewport: Required<ViewportConfig>
  node: Required<NodeConfig>
  edge: Required<EdgeConfig>
  initialTool: Tool
}
