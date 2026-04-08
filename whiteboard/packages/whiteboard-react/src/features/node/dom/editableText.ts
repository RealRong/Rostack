import type {
  KeyboardEvent as ReactKeyboardEvent,
  PointerEvent as ReactPointerEvent
} from 'react'
import type { EditCaret } from '@whiteboard/editor'
import {
  focusEditableEnd,
  focusEditablePoint,
  readEditableText
} from '#react/dom/editable/text'

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
  const frame = requestAnimationFrame(() => {
    if (caret?.kind === 'point' && focusEditablePoint(element, caret.client)) {
      return
    }

    focusEditableEnd(element)
  })

  return () => {
    cancelAnimationFrame(frame)
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
