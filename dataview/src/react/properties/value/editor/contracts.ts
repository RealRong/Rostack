import type { GroupProperty } from '@dataview/core/contracts'
import type {
  EditInput,
  PropertyEditIntent
} from '@dataview/react/page/interaction'

export interface PropertyValueEditorProps {
  property?: GroupProperty
  value: unknown
  seedDraft?: string
  autoFocus?: boolean
  enterIntent?: PropertyEditIntent
  onInput: (input: EditInput) => boolean | void
  onInvalid?: () => void
}

export interface PropertyValueDraftEditorProps<TDraft = unknown> {
  property?: GroupProperty
  draft: TDraft
  autoFocus?: boolean
  enterIntent?: PropertyEditIntent
  onDraftChange: (draft: TDraft) => void
  onCommit: (intent?: PropertyEditIntent) => boolean
  onCancel: () => void
}

export interface PropertyValueEditorHandle {
  submit: (intent?: PropertyEditIntent) => boolean
  cancel: () => void
}
