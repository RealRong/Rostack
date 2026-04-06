import type { Field, CustomField } from '@dataview/core/contracts'
import type {
  EditorSubmitTrigger,
  EditInput,
} from '@dataview/react/interaction'

export interface FieldValueEditorProps {
  property?: Field
  value: unknown
  seedDraft?: string
  autoFocus?: boolean
  onInput: (input: EditInput) => boolean | void
  onInvalid?: () => void
}

export interface FieldValueDraftEditorProps<TDraft = unknown> {
  property?: CustomField
  draft: TDraft
  autoFocus?: boolean
  onDraftChange: (draft: TDraft) => void
  onApply: () => boolean
  onCommit: (trigger: EditorSubmitTrigger) => boolean
  onCancel: () => void
}

export interface FieldValueEditorHandle {
  apply: () => boolean
  submit: (trigger: EditorSubmitTrigger) => boolean
  cancel: () => void
}
