import type { CSSProperties } from 'react'
import type { CoreRegistries, Document } from '@whiteboard/core/types'
import type { Tool } from '@whiteboard/editor'
import type { ViewportConfig, EdgeConfig, NodeConfig } from '@whiteboard/react/types/common/base'
import type { WhiteboardCollabOptions } from '@whiteboard/react/types/common/collab'
import type { ShortcutOverrides } from '@whiteboard/react/types/common/shortcut'
import type { WhiteboardSpec } from '@whiteboard/react/types/spec'

export type WhiteboardOptions = {
  className?: string
  style?: CSSProperties
  viewport?: ViewportConfig
  node?: NodeConfig
  edge?: EdgeConfig
  initialTool?: Tool
  shortcuts?: ShortcutOverrides
}

export type WhiteboardProps = {
  document: Document
  onDocumentChange: (document: Document) => void
  coreRegistries?: CoreRegistries
  spec?: WhiteboardSpec
  collab?: WhiteboardCollabOptions
  options?: WhiteboardOptions
}
