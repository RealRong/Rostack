import type { ReactNode } from 'react'
import type {
  SelectionToolbarContext,
  SelectionToolbarScope
} from '@whiteboard/editor'
import type { WhiteboardRuntime } from '@whiteboard/react/types/runtime'
import type { SelectionCan } from '@whiteboard/react/features/selection/capability'
import type { ToolbarItemKey, ToolbarPanelKey } from '@whiteboard/react/features/selection/chrome/toolbar/types'

export type ToolbarButtonRendererProps = {
  context: SelectionToolbarContext
  activeScope: SelectionToolbarScope
  selectionCan: SelectionCan
  scopeCan: SelectionCan
  editor: WhiteboardRuntime
  activePanelKey: ToolbarPanelKey | null
  togglePanel: (key: ToolbarPanelKey) => void
  registerPanelButton: (key: ToolbarPanelKey, element: HTMLElement | null) => void
  setActiveScope: (key: string) => void
}

export type ToolbarPanelRendererProps = {
  context: SelectionToolbarContext
  activeScope: SelectionToolbarScope
  selectionCan: SelectionCan
  scopeCan: SelectionCan
  editor: WhiteboardRuntime
  closePanel: () => void
  setActiveScope: (key: string) => void
}

export type ToolbarItemSpec = {
  key: ToolbarItemKey
  panelKey?: ToolbarPanelKey
  units?: number
  renderButton: (props: ToolbarButtonRendererProps) => ReactNode
  renderPanel?: (props: ToolbarPanelRendererProps) => ReactNode
}
