import type { Box } from '@shared/dom'
import type { ItemId } from '@dataview/engine'
import type { SelectionTarget } from '#dataview-react/runtime/marquee/types'

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
  id: ItemId,
  element: Element
): SelectionTarget => ({
  id,
  rect: boxFromDomRect(element.getBoundingClientRect())
})
