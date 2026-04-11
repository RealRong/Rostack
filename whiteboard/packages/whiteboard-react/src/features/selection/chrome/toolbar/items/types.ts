import type { ReactNode } from 'react'
import type { NodeToolbarContext } from '@whiteboard/editor'
import type { WhiteboardRuntime } from '#react/types/runtime'
import type { ToolbarItemKey, ToolbarPanelKey } from '../types'

export type ToolbarButtonRendererProps = {
  context: NodeToolbarContext
  editor: WhiteboardRuntime
  activePanelKey: ToolbarPanelKey | null
  togglePanel: (key: ToolbarPanelKey) => void
  registerPanelButton: (key: ToolbarPanelKey, element: HTMLElement | null) => void
}

export type ToolbarPanelRendererProps = {
  context: NodeToolbarContext
  editor: WhiteboardRuntime
  closePanel: () => void
}

export type ToolbarItemSpec = {
  key: ToolbarItemKey
  panelKey?: ToolbarPanelKey
  units?: number
  renderButton: (props: ToolbarButtonRendererProps) => ReactNode
  renderPanel?: (props: ToolbarPanelRendererProps) => ReactNode
}
