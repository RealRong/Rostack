import type { ReactNode } from 'react'
import type { WhiteboardRuntime } from '#react/types/runtime'
import type { ToolbarSummaryContext } from '../context'
import type { ToolbarItemKey, ToolbarPanelKey } from '../types'

export type ToolbarButtonRendererProps = {
  context: ToolbarSummaryContext
  editor: WhiteboardRuntime
  activePanelKey: ToolbarPanelKey | null
  togglePanel: (key: ToolbarPanelKey) => void
  registerPanelButton: (key: ToolbarPanelKey, element: HTMLElement | null) => void
}

export type ToolbarPanelRendererProps = {
  context: ToolbarSummaryContext
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
