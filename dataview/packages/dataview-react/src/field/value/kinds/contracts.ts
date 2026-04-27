import type {
  ComponentType,
  ReactNode
} from 'react'
import type { FieldDraftParseResult } from '@dataview/core/field'
import type { Field } from '@dataview/core/types'
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
  createDraft: (field: Field | undefined, value: unknown, seedDraft?: string) => TDraft
  parseDraft: (field: Field | undefined, draft: TDraft) => FieldDraftParseResult
  render: (field: Field | undefined, props: RenderProps) => ReactNode
  toggle?: (field: Field | undefined, value: unknown) => unknown | undefined
}
