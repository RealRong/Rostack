import type {
  ComponentType,
  ReactNode
} from 'react'
import type { FieldDraftParseResult } from '@dataview/core/field'
import type { FieldOptionTagAppearance } from '@dataview/react/field/options'
import type { FieldValueDraftEditorProps } from '@dataview/react/field/value/editor'

export interface RenderProps {
  value: unknown
  emptyPlaceholder?: ReactNode
  className?: string
  wrap?: boolean
  optionTagAppearance?: FieldOptionTagAppearance
}

export type FieldValueEditorPanelWidth = 'default' | 'picker' | 'calendar'

export interface FieldValueSpec<TDraft = unknown> {
  capability: {
    quickToggle?: boolean
  }
  panelWidth: FieldValueEditorPanelWidth
  Editor: ComponentType<FieldValueDraftEditorProps<TDraft>>
  createDraft: (value: unknown, seedDraft?: string) => TDraft
  parseDraft: (draft: TDraft) => FieldDraftParseResult
  render: (props: RenderProps) => ReactNode
  toggle?: (value: unknown) => unknown | undefined
}
