import { useEffect, useRef } from 'react'
import { Select } from '@shared/ui/select'
import { cn } from '@shared/ui/utils'
import { focusWithoutScroll } from '@shared/dom'
import {
  isComposing,
  keyAction
} from '../shared/keyboard'
import type { FieldValueDraftEditorProps } from '../contracts'

export const CheckboxEditor = (props: FieldValueDraftEditorProps<string>) => {
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
        props.onCommit('programmatic')
      }}
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
