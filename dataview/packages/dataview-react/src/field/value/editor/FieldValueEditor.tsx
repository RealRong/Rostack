import {
  forwardRef,
  useImperativeHandle,
  useRef,
  useState
} from 'react'
import {
  apply,
  cancel,
  commit,
  type EditorSubmitTrigger
} from '#react/interaction/index.ts'
import { isCustomField } from '@dataview/core/field'
import { getFieldValueSpec } from '#react/field/value/kinds/index.ts'
import type {
  FieldValueEditorHandle,
  FieldValueEditorProps
} from '#react/field/value/editor/contracts.ts'

export const FieldValueEditor = forwardRef<
  FieldValueEditorHandle,
  FieldValueEditorProps
>((props, ref) => {
  const spec = getFieldValueSpec(props.field)
  const editorProperty = isCustomField(props.field)
    ? props.field
    : undefined
  const [draft, setDraftState] = useState(() => (
    spec.createDraft(props.value, props.seedDraft)
  ))
  const draftRef = useRef(draft)
  draftRef.current = draft

  const setDraft = (nextDraft: typeof draft) => {
    draftRef.current = nextDraft
    setDraftState(nextDraft)
  }

  const parseDraft = () => {
    const parsed = spec.parseDraft(draftRef.current)
    if (parsed.type === 'invalid') {
      props.onInvalid?.()
      return null
    }

    return parsed
  }

  const applyDraft = () => {
    const parsed = parseDraft()
    if (!parsed) {
      return false
    }

    return props.onInput(apply(
      parsed.type === 'clear' ? undefined : parsed.value
    )) === true
  }

  const submit = (trigger: EditorSubmitTrigger = 'programmatic') => {
    const parsed = parseDraft()
    if (!parsed) {
      return false
    }

    return props.onInput(commit(
      parsed.type === 'clear' ? undefined : parsed.value,
      trigger
    )) === true
  }

  const cancelEditing = () => {
    props.onInput(cancel())
  }

  useImperativeHandle(ref, () => ({
    apply: applyDraft,
    submit,
    cancel: cancelEditing
  }), [props.onInput, props.onInvalid, spec])

  return (
    <div>
      <spec.Editor
        field={editorProperty}
        draft={draft}
        autoFocus={props.autoFocus}
        onDraftChange={setDraft}
        onApply={applyDraft}
        onCommit={submit}
        onCancel={cancelEditing}
      />
    </div>
  )
})

FieldValueEditor.displayName = 'FieldValueEditor'
