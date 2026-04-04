import type {
  KeyboardEvent as ReactKeyboardEvent,
  PointerEvent as ReactPointerEvent
} from 'react'
import { focusEditableEnd, readEditableText } from '../../../dom/editable/text'

export const syncEditableDraft = (
  element: HTMLDivElement,
  value: string
) => {
  if (readEditableText(element) !== value) {
    element.textContent = value
  }
}

export const focusEditableDraftEnd = (
  element: HTMLDivElement
) => {
  const frame = requestAnimationFrame(() => {
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
