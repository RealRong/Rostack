import type {
  ComponentType,
  ReactNode
} from 'react'
import type { PropertyDraftParseResult } from '@dataview/core/property'
import type { PropertyValueDraftEditorProps } from '../editor'

export interface RenderProps {
  value: unknown
  emptyPlaceholder?: ReactNode
  className?: string
}

export type PropertyValueEditorPanelWidth = 'default' | 'picker' | 'calendar'

export interface PropertyValueSpec<TDraft = unknown> {
  capability: {
    quickToggle?: boolean
  }
  panelWidth: PropertyValueEditorPanelWidth
  Editor: ComponentType<PropertyValueDraftEditorProps<TDraft>>
  createDraft: (value: unknown, seedDraft?: string) => TDraft
  parseDraft: (draft: TDraft) => PropertyDraftParseResult
  render: (props: RenderProps) => ReactNode
  toggle?: (value: unknown) => unknown | undefined
}
