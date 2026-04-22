import type {
  KeyboardEvent as ReactKeyboardEvent,
  PointerEvent as ReactPointerEvent
} from 'react'
import {
  focusEditableEnd,
  focusEditablePoint,
  readEditableText
} from '@shared/dom'
import { scheduler } from '@shared/core'
import type { EditCaret } from '@whiteboard/editor'

export const syncEditableDraft = (
  element: HTMLDivElement,
  value: string
) => {
  if (readEditableText(element) !== value) {
    element.textContent = value
  }
}

export const focusEditableDraft = (
  element: HTMLDivElement,
  caret?: EditCaret
) => {
  const task = scheduler.createFrameTask(() => {
    if (caret?.kind === 'point' && focusEditablePoint(element, caret.client)) {
      return
    }

    focusEditableEnd(element)
  }, {
    fallback: 'microtask'
  })
  task.schedule()

  return () => {
    task.cancel()
  }
}

export const stopEditingPointerDown = (
  event: ReactPointerEvent<HTMLElement>
) => {
  event.stopPropagation()
}

export const isEscapeEditingKey = (
  event: ReactKeyboardEvent<HTMLElement>
) => event.key === 'Escape'

export const isSubmitEditingKey = (
  event: ReactKeyboardEvent<HTMLElement>
) => event.key === 'Enter' && (event.metaKey || event.ctrlKey)
