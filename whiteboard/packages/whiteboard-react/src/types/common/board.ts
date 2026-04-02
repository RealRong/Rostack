import type { CSSProperties } from 'react'
import type { HistoryConfig as KernelHistoryConfig } from '@whiteboard/core/kernel'
import type { CoreRegistries, Document } from '@whiteboard/core/types'
import type { MindmapLayoutConfig } from '@whiteboard/core/mindmap'
import type { Tool } from '@whiteboard/editor'
import type { NodeRegistry } from '../node'
import type { Size, ViewportConfig, EdgeConfig, NodeConfig } from './base'
import type { WhiteboardCollabOptions } from './collab'
import type { ShortcutOverrides } from './shortcut'

export type HistoryOptions = Partial<KernelHistoryConfig>

export type WhiteboardOptions = {
  className?: string
  style?: CSSProperties
  nodeSize?: Size
  mindmapNodeSize?: Size
  mindmapLayout?: MindmapLayoutConfig
  viewport?: ViewportConfig
  node?: NodeConfig
  edge?: EdgeConfig
  history?: HistoryOptions
  tool?: Tool
  shortcuts?: ShortcutOverrides
}

export type WhiteboardProps = {
  document: Document
  onDocumentChange: (document: Document) => void
  coreRegistries?: CoreRegistries
  nodeRegistry?: NodeRegistry
  collab?: WhiteboardCollabOptions
  options?: WhiteboardOptions
}
