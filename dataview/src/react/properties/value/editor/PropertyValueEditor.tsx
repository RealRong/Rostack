import {
  forwardRef,
  useImperativeHandle,
  useRef,
  useState
} from 'react'
import {
  cancel,
  commit,
  type PropertyEditIntent
} from '@dataview/react/page/interaction'
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

  const submit = (intent: PropertyEditIntent = 'done') => {
    const parsed = spec.parseDraft(draftRef.current)
    if (parsed.type === 'invalid') {
      props.onInvalid?.()
      return false
    }

    return props.onInput(commit(
      parsed.type === 'clear' ? undefined : parsed.value,
      intent
    )) === true
  }

  const cancelEditing = () => {
    props.onInput(cancel())
  }

  useImperativeHandle(ref, () => ({
    submit,
    cancel: cancelEditing
  }), [props.onInput, props.onInvalid, spec])

  return (
    <div>
      <spec.Editor
        property={props.property}
        draft={draft}
        autoFocus={props.autoFocus}
        enterIntent={props.enterIntent ?? 'done'}
        onDraftChange={setDraft}
        onCommit={intent => submit(intent ?? 'done')}
        onCancel={cancelEditing}
      />
    </div>
  )
})

PropertyValueEditor.displayName = 'PropertyValueEditor'
