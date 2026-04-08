import type { Box } from '@shared/dom'
import type { AppearanceId } from '@dataview/react/runtime/currentView'
import type { SelectionTarget } from './types'

export const boxFromDomRect = (
  rect: Pick<DOMRectReadOnly, 'left' | 'top' | 'right' | 'bottom' | 'width' | 'height'>
): Box => ({
  left: rect.left,
  top: rect.top,
  right: rect.right,
  bottom: rect.bottom,
  width: rect.width,
  height: rect.height
})

export const selectionTargetFromElement = (
  id: AppearanceId,
  element: Element
): SelectionTarget => ({
  id,
  rect: boxFromDomRect(element.getBoundingClientRect())
})
