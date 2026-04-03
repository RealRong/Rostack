import type { GroupProperty } from '@dataview/core/contracts'
import type {
  EditInput,
  ValueEditorIntent
} from '@dataview/react/interaction'

export interface PropertyValueEditorProps {
  property?: GroupProperty
  value: unknown
  seedDraft?: string
  autoFocus?: boolean
  enterIntent?: ValueEditorIntent
  onInput: (input: EditInput) => boolean | void
  onInvalid?: () => void
}

export interface PropertyValueDraftEditorProps<TDraft = unknown> {
  property?: GroupProperty
  draft: TDraft
  autoFocus?: boolean
  enterIntent?: ValueEditorIntent
  onDraftChange: (draft: TDraft) => void
  onCommit: (intent?: ValueEditorIntent) => boolean
  onCancel: () => void
}

export interface PropertyValueEditorHandle {
  submit: (intent?: ValueEditorIntent) => boolean
  cancel: () => void
}
