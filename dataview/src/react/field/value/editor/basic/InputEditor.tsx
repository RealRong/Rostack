import { useEffect, useRef } from 'react'
import { focusInputWithoutScroll } from '@dataview/dom/focus'
import {
  isComposing,
  keyAction
} from '../shared/keyboard'
import type { FieldValueDraftEditorProps } from '../contracts'

export type InputKind = 'text' | 'number'

export interface InputEditorProps extends FieldValueDraftEditorProps<string> {
  type: InputKind
}

const resolveInputAttributes = (type: InputKind) => {
  switch (type) {
    case 'number':
      return {
        type: 'text' as const,
        inputMode: 'decimal' as const,
        spellCheck: false
      }
    default:
      return { type: 'text' as const }
  }
}

export const InputEditor = (props: InputEditorProps) => {
  const inputRef = useRef<HTMLInputElement | null>(null)
  const inputAttributes = resolveInputAttributes(props.type)

  useEffect(() => {
    if (!props.autoFocus) {
      return
    }

    focusInputWithoutScroll(inputRef.current)
  }, [props.autoFocus])

  return (
    <input
      ref={inputRef}
      {...inputAttributes}
      className='w-full px-2 py-2'
      value={props.draft}
      onChange={event => props.onDraftChange(event.target.value)}
      onKeyDown={event => {
        const action = keyAction({
          key: event.key,
          shiftKey: event.shiftKey,
          composing: isComposing(event.nativeEvent)
        })

        switch (action.type) {
          case 'commit':
            event.preventDefault()
            props.onCommit(action.trigger)
            return
          case 'cancel':
            event.preventDefault()
            props.onCancel()
            return
          case 'none':
            break
        }

        event.stopPropagation()
      }}
    />
  )
}
