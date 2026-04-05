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
} from '@dataview/react/interaction'
import { getPropertyValueSpec } from '../kinds'
import type {
  PropertyValueEditorHandle,
  PropertyValueEditorProps
} from './contracts'

export const PropertyValueEditor = forwardRef<
  PropertyValueEditorHandle,
  PropertyValueEditorProps
>((props, ref) => {
  const spec = getPropertyValueSpec(props.property)
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
        property={props.property}
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

PropertyValueEditor.displayName = 'PropertyValueEditor'
