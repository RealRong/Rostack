import type { Point } from '@shared/dom/geometry'

export const normalizeEditableTextValue = (
  value: string
) => {
  const normalized = value.replace(/\r/g, '')

  // `contentEditable="plaintext-only"` reports one synthetic trailing newline
  // when the last visual line is empty. Strip that sentinel so draft text
  // matches what the user actually typed.
  return normalized.endsWith('\n')
    ? normalized.slice(0, -1)
    : normalized
}

export const readEditableText = (
  element: HTMLDivElement
) => normalizeEditableTextValue(element.innerText)

const focusEditableSelection = (
  element: HTMLDivElement,
  range: Range
) => {
  element.focus({
    preventScroll: true
  })

  const selection = window.getSelection()
  if (!selection) {
    return false
  }

  selection.removeAllRanges()
  selection.addRange(range)
  return true
}

export const focusEditableEnd = (
  element: HTMLDivElement
) => {
  const range = document.createRange()
  range.selectNodeContents(element)
  range.collapse(false)
  focusEditableSelection(element, range)
}

const isWithinEditable = (
  element: HTMLDivElement,
  node: Node | null
) => (
  Boolean(node)
  && (node === element || element.contains(node))
)

const rangeFromCaretPosition = (
  position: {
    offsetNode: Node
    offset: number
  }
) => {
  const range = document.createRange()
  range.setStart(position.offsetNode, position.offset)
  range.collapse(true)
  return range
}

const readCaretRangeFromPoint = (
  point: Point
) => {
  const doc = document as Document & {
    caretPositionFromPoint?: (
      x: number,
      y: number
    ) => {
      offsetNode: Node
      offset: number
    } | null
    caretRangeFromPoint?: (x: number, y: number) => Range | null
  }

  const position = doc.caretPositionFromPoint?.(point.x, point.y)
  if (position) {
    return rangeFromCaretPosition(position)
  }

  return doc.caretRangeFromPoint?.(point.x, point.y) ?? null
}

export const focusEditablePoint = (
  element: HTMLDivElement,
  point: Point
) => {
  const range = readCaretRangeFromPoint(point)
  if (!range || !isWithinEditable(element, range.startContainer)) {
    return false
  }

  return focusEditableSelection(element, range)
}
