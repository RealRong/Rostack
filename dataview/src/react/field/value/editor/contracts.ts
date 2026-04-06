import type { GroupProperty } from '@dataview/core/contracts'
import type {
  EditorSubmitTrigger,
  EditInput,
} from '@dataview/react/interaction'

export interface PropertyValueEditorProps {
  property?: GroupProperty
  value: unknown
  seedDraft?: string
  autoFocus?: boolean
  onInput: (input: EditInput) => boolean | void
  onInvalid?: () => void
}

export interface PropertyValueDraftEditorProps<TDraft = unknown> {
  property?: GroupProperty
  draft: TDraft
  autoFocus?: boolean
  onDraftChange: (draft: TDraft) => void
  onApply: () => boolean
  onCommit: (trigger: EditorSubmitTrigger) => boolean
  onCancel: () => void
}

export interface PropertyValueEditorHandle {
  apply: () => boolean
  submit: (trigger: EditorSubmitTrigger) => boolean
  cancel: () => void
}
