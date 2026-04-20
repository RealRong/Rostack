import type { Tool } from '@whiteboard/editor'
import type { LocalEngineHistoryConfig } from '@whiteboard/history'
import type { WhiteboardOptions } from '@whiteboard/react/types/common/board'
import type {
  EdgeConfig,
  NodeConfig,
  Size,
  ViewportConfig
} from '@whiteboard/react/types/common/base'

export type ResolvedConfig = Omit<
  WhiteboardOptions,
  'nodeSize' | 'mindmapNodeSize' | 'viewport' | 'node' | 'edge' | 'history' | 'initialTool'
> & {
  nodeSize: Size
  mindmapNodeSize: Size
  viewport: Required<ViewportConfig>
  node: Required<NodeConfig>
  edge: Required<EdgeConfig>
  history: LocalEngineHistoryConfig
  initialTool: Tool
}
