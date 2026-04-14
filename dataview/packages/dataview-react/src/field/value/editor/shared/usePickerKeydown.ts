import { useCallback, type KeyboardEvent as ReactKeyboardEvent } from 'react'
import type { EditorSubmitTrigger } from '@dataview/react/interaction'
import {
  isComposing,
  keyAction
} from '@dataview/react/field/value/editor/shared/keyboard'

export const usePickerKeydown = (input: {
  editingBlocked?: boolean
  onMoveNext: () => void
  onMovePrev: () => void
  onMoveFirst: () => void
  onMoveLast: () => void
  onCancel: () => void
  onCommit: (trigger: EditorSubmitTrigger) => void
}) => useCallback((event: ReactKeyboardEvent<HTMLDivElement>) => {
  if (input.editingBlocked) {
    event.stopPropagation()
    return
  }

  const composing = isComposing(event.nativeEvent)
  const action = keyAction({
    key: event.key,
    shiftKey: event.shiftKey,
    composing
  })

  if (!composing && event.key === 'ArrowDown') {
    event.preventDefault()
    event.stopPropagation()
    input.onMoveNext()
    return
  }

  if (!composing && event.key === 'ArrowUp') {
    event.preventDefault()
    event.stopPropagation()
    input.onMovePrev()
    return
  }

  if (!composing && event.key === 'Home') {
    event.preventDefault()
    event.stopPropagation()
    input.onMoveFirst()
    return
  }

  if (!composing && event.key === 'End') {
    event.preventDefault()
    event.stopPropagation()
    input.onMoveLast()
    return
  }

  if (action.type === 'cancel') {
    event.preventDefault()
    input.onCancel()
    return
  }

  if (!composing && action.type === 'commit') {
    event.preventDefault()
    input.onCommit(action.trigger)
    return
  }

  event.stopPropagation()
}, [input])
