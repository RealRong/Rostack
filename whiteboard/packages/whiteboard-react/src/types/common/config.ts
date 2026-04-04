import type { HistoryConfig as KernelHistoryConfig } from '@whiteboard/core/kernel'
import type { MindmapLayoutConfig } from '@whiteboard/core/mindmap'
import type { Tool } from '@whiteboard/editor'
import type { WhiteboardOptions } from './board'
import type {
  EdgeConfig,
  NodeConfig,
  Size,
  ViewportConfig
} from './base'

export type ResolvedConfig = Omit<
  WhiteboardOptions,
  'nodeSize' | 'mindmapNodeSize' | 'mindmapLayout' | 'viewport' | 'node' | 'edge' | 'history' | 'initialTool'
> & {
  nodeSize: Size
  mindmapNodeSize: Size
  mindmapLayout: MindmapLayoutConfig
  viewport: Required<ViewportConfig>
  node: Required<NodeConfig>
  edge: Required<EdgeConfig>
  history: KernelHistoryConfig
  initialTool: Tool
}
