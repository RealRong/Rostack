import { useEffect, useRef } from 'react'
import { focusWithoutScroll } from '@dataview/react/dom/focus'
import { Select, cn } from '@dataview/react/ui'
import {
  isComposing,
  keyAction
} from '../shared/keyboard'
import type { PropertyValueDraftEditorProps } from '../contracts'

export const CheckboxEditor = (props: PropertyValueDraftEditorProps<string>) => {
  const selectRef = useRef<HTMLSelectElement | null>(null)

  useEffect(() => {
    if (!props.autoFocus) {
      return
    }

    focusWithoutScroll(selectRef.current)
  }, [props.autoFocus])

  return (
    <Select
      ref={selectRef}
      value={props.draft}
      onChange={event => {
        props.onDraftChange(event.target.value)
        props.onCommit()
      }}
      onKeyDown={event => {
        const action = keyAction({
          key: event.key,
          shiftKey: event.shiftKey,
          composing: isComposing(event.nativeEvent),
          enterIntent: props.enterIntent
        })

        switch (action.type) {
          case 'submit':
            event.preventDefault()
            props.onCommit(action.intent)
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
      className={cn(
        'h-8 min-w-[6rem] border-input px-2 text-sm',
        'focus-visible:ring-1 focus-visible:ring-ring'
      )}
    >
      <option value="">Empty</option>
      <option value="true">True</option>
      <option value="false">False</option>
    </Select>
  )
}
