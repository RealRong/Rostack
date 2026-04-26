import type { CSSProperties } from 'react'
import type { CoreRegistries, Document } from '@whiteboard/core/types'
import type { Tool } from '@whiteboard/editor'
import type { EngineHistoryConfig } from '@whiteboard/engine'
import type { NodeRegistry } from '@whiteboard/react/types/node'
import type { Size, ViewportConfig, EdgeConfig, NodeConfig } from '@whiteboard/react/types/common/base'
import type { WhiteboardCollabOptions } from '@whiteboard/react/types/common/collab'
import type { ShortcutOverrides } from '@whiteboard/react/types/common/shortcut'

export type HistoryOptions = Partial<EngineHistoryConfig>

export type WhiteboardOptions = {
  className?: string
  style?: CSSProperties
  nodeSize?: Size
  mindmapNodeSize?: Size
  viewport?: ViewportConfig
  node?: NodeConfig
  edge?: EdgeConfig
  history?: HistoryOptions
  initialTool?: Tool
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
